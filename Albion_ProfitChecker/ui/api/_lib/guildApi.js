// What /api/guild/<action> answers. The I/O comes in as `deps`, so tests run it on fakes:
//   store          api/_lib/guildStore.js (null when the database is not configured)
//   gameinfo       api/_lib/gameinfo.js
//   userFromToken  Supabase access token -> { id } or null
//   now            () => Date
//   cronSecret     CRON_SECRET, which Vercel Cron sends for the daily sync
//   limiter        optional api/_lib/rateLimit.js limiter, keyed by request.client
//
//   GET  search?region=eu&q=angry      guilds whose name matches
//   GET  guild?region=eu&slug=..&id=.. one guild: info, tracking, activity, recent fights
//   GET  mine                          the guild the signed-in player manages
//   POST manage {region, id}           start managing (and tracking) a guild
//   POST release                       stop managing it
//   GET  sync                          Vercel Cron: snapshot every managed guild once a day
import { GameinfoError, isGuildId, isRegion } from "./gameinfo.js";
import { PERIODS, addDays, buildActivity, dayOf, planSync, playersFromMembers, slugify, snapshotOf } from "./guildActivity.js";

/** A managed guild is synced again when its last sync is older than this. */
export const STALE_MS = 20 * 3600 * 1000;
// one guild can take ~17 s when the killboard is slow (2 tries of 8 s): stop starting new ones
// early enough to stay inside the function's 60 s
const SYNC_BUDGET_MS = 30_000;
const SYNC_BATCH = 40;
const FIGHTS_SHOWN = 8;
const PUBLIC_CACHE_S = 300;
const SEARCH_CACHE_S = 600;
/** Days kept before the longest period, so a missed daily snapshot still leaves a start point. */
const BASELINE_SLACK_DAYS = 3;
const SLUG = /^[a-z0-9-]{1,90}$/;
/** A roster shrinking below this share of the stored one is checked once more before it counts. */
const ROSTER_DROP = 0.5;
const ROSTER_DROP_MIN = 10;

const ok = (body, maxAge = 0) => ({ status: 200, body, maxAge });
const fail = (status, error) => ({ status, body: { error }, maxAge: 0 });

const guildRef = (row) => ({ id: row.id, region: row.region, slug: row.slug, name: row.name });

/** The bit of the id a URL name gets when another guild has the same name: 6 letters or digits. */
export const slugSuffix = (id) => id.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toLowerCase();

/** The URL part for a guild: its slugified name, with a bit of the id when another guild has it. */
async function uniqueSlug(store, region, name, id) {
  const slug = slugify(name);
  return (await store.isSlugTaken(region, slug, id)) ? `${slug}-${slugSuffix(id)}` : slug;
}

/**
 * Today's roster, refused when it looks broken: empty, or less than half of the stored one while
 * the killboard is known to send short lists now and then. A fresh second answer decides.
 */
async function trustedMembers(gameinfo, guild, players) {
  const stored = players.filter((p) => !p.left_on).length;
  const suspicious = (list) => (stored > 0 && list.length === 0) || (stored >= ROSTER_DROP_MIN && list.length < stored * ROSTER_DROP);
  const members = await gameinfo.getMembers(guild.region, guild.id);
  if (!suspicious(members)) return members;
  const again = await gameinfo.getMembers(guild.region, guild.id, { fresh: true });
  if (again.length === 0 && stored > 0) throw new GameinfoError("Albion's killboard sent an empty member list", 502);
  return again;
}

const guildRow = (info, region, slug, memberCount) => ({
  id: info.id,
  region,
  name: info.name,
  slug,
  alliance_tag: info.allianceTag,
  founded_at: info.foundedAt,
  member_count: memberCount,
  kill_fame: info.killFame,
  death_fame: info.deathFame
});

/** One daily snapshot of a managed guild: roster, fame, fights. */
export async function syncGuild({ store, gameinfo, guild, now }) {
  const today = dayOf(now);
  const [info, battles, players, recent] = await Promise.all([
    gameinfo.getGuild(guild.region, guild.id),
    gameinfo.getBattles(guild.region, guild.id).catch(() => []),
    store.getPlayers(guild.id),
    store.getSnapshots(guild.id, addDays(today, -7))
  ]);
  const members = await trustedMembers(gameinfo, guild, players);
  const before = new Map();
  for (const row of recent) if (row.day < today) before.set(row.player_id, row); // ascending: the latest earlier day wins
  const plan = planSync({ guildId: guild.id, members, battles, players, before, today });
  await store.savePlayers(plan.players);
  await store.saveSnapshots(plan.snapshots);
  const slug = info.name === guild.name ? guild.slug : await uniqueSlug(store, guild.region, info.name, guild.id);
  await store.saveGuild({ ...guildRow(info, guild.region, slug, members.length), last_synced_at: now.toISOString() });
}

const isStale = (row, now) => !row.last_synced_at || now - Date.parse(row.last_synced_at) > STALE_MS;

async function resolveGuild({ store, gameinfo }, region, slug, id) {
  // without a working database the guild is still found through the killboard search
  const stored = await tryStore(store, () => (isGuildId(id) ? store.getGuild(id) : SLUG.test(slug ?? "") ? store.getGuildBySlug(region, slug) : null));
  const storeOk = Boolean(store) && stored.ok;
  if (isGuildId(id)) return { id, row: stored.value?.region === region ? stored.value : null, storeOk };
  if (!SLUG.test(slug ?? "")) return null;
  if (stored.value) return { id: stored.value.id, row: stored.value, storeOk };
  const exact = (await gameinfo.searchGuilds(region, slug.replace(/-/g, " "))).find((g) => slugify(g.name) === slug);
  if (exact) return { id: exact.id, row: null, storeOk };
  // "<name>-<6 letters of the id>": the address of a guild whose name another guild has too
  const suffixed = /^(.+)-([a-z0-9]{6})$/.exec(slug);
  if (!suffixed) return null;
  const [, base, suffix] = suffixed;
  const hit = (await gameinfo.searchGuilds(region, base.replace(/-/g, " "))).find((g) => slugify(g.name) === base && slugSuffix(g.id) === suffix);
  return hit ? { id: hit.id, row: null, storeOk } : null;
}

/** The address of a guild nobody tracks: its name, unless a tracked guild has that address already. */
async function untrackedSlug(store, region, name, id) {
  const taken = await tryStore(store, () => store.isSlugTaken(region, slugify(name), id));
  return taken.value ? `${slugify(name)}-${slugSuffix(id)}` : slugify(name);
}

/** A database read that must not take the public guild page down: logged, and `ok: false`, when it fails. */
async function tryStore(store, read) {
  if (!store) return { ok: false, value: null };
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    console.error("guild store read failed", error);
    return { ok: false, value: null };
  }
}

async function getGuildPage(deps, { region, slug, id }, token) {
  const { store, gameinfo } = deps;
  const now = deps.now();
  const resolved = await resolveGuild(deps, region, slug, id);
  if (!resolved) return fail(404, "No guild with that name on this server.");
  const [info, members, battles, user] = await Promise.all([
    gameinfo.getGuild(region, resolved.id),
    gameinfo.getMembers(region, resolved.id),
    gameinfo.getBattles(region, resolved.id).catch(() => []),
    token ? deps.userFromToken(token) : null
  ]);
  let row = resolved.row;
  if (row?.manager_id && isStale(row, now)) {
    try {
      await syncGuild({ store, gameinfo, guild: row, now });
      row = await store.getGuild(row.id);
    } catch (error) {
      console.error("guild sync on visit failed", row.id, error);
    }
  }
  const today = dayOf(now);
  let storeOk = resolved.storeOk;
  let history = null;
  if (storeOk && row?.manager_id) {
    // the longest period plus some slack, never from before tracking started
    const windowStart = addDays(today, -(Math.max(...PERIODS) + BASELINE_SLACK_DAYS));
    const fromDay = row.tracked_since && row.tracked_since > windowStart ? row.tracked_since : windowStart;
    const read = await tryStore(store, () => Promise.all([store.getPlayers(row.id), store.getSnapshots(row.id, fromDay)]));
    storeOk = read.ok;
    history = read.value;
  }
  const tracked = Boolean(history);
  const players = tracked ? history[0] : playersFromMembers(resolved.id, members, battles);
  // untracked: today's roster as the only snapshot, for lifetime fame (no gains without history)
  const snapshots = tracked ? history[1] : members.map((member) => snapshotOf(resolved.id, member, today));
  const trackedSince = tracked ? row.tracked_since : null;
  const activity = Object.fromEntries(PERIODS.map((periodDays) => [periodDays, buildActivity({ players, snapshots, today, periodDays, trackedSince })]));
  const fights = battles
    .filter((b) => b.ours.length)
    .slice(0, FIGHTS_SHOWN)
    .map((b) => ({
      id: b.id,
      startTime: b.startTime,
      players: b.players,
      fame: b.fame,
      ours: b.ours.length,
      kills: b.ours.reduce((t, p) => t + p.kills, 0),
      deaths: b.ours.reduce((t, p) => t + p.deaths, 0)
    }));
  return ok(
    {
      guild: {
        id: info.id,
        region,
        name: info.name,
        slug: row?.slug ?? (await untrackedSlug(store, region, info.name, info.id)),
        allianceTag: info.allianceTag,
        foundedAt: info.foundedAt,
        killFame: info.killFame,
        deathFame: info.deathFame,
        memberCount: members.length
      },
      tracking: {
        tracked,
        since: trackedSince,
        lastSyncedAt: tracked ? row.last_synced_at : null,
        managedByYou: Boolean(user && row?.manager_id === user.id),
        managedByOther: Boolean(row?.manager_id && row.manager_id !== user?.id),
        canManage: storeOk
      },
      activity,
      fights
    },
    // personal answers, and answers without the database, are never cached for everyone
    token || !storeOk ? 0 : PUBLIC_CACHE_S
  );
}

async function manage(deps, user, body) {
  const { store, gameinfo } = deps;
  const region = String(body?.region ?? "");
  const id = String(body?.id ?? "");
  if (!isRegion(region) || !isGuildId(id)) return fail(400, "Pick a guild first.");
  const mine = await store.getManagedBy(user.id);
  if (mine?.id === id) return ok({ guild: guildRef(mine) });
  if (mine) return fail(409, `You already manage ${mine.name}. Stop managing it first.`);
  const existing = await store.getGuild(id);
  if (existing?.manager_id) return fail(409, "Another player already manages this guild.");
  const now = deps.now();
  const [info, members] = await Promise.all([gameinfo.getGuild(region, id), gameinfo.getMembers(region, id)]);
  const slug = await uniqueSlug(store, region, info.name, id);
  await store.saveGuild(guildRow(info, region, slug, members.length));
  // tracking starts over: gains must not span the time nobody managed the guild
  if (!(await store.claimGuild(id, user.id, dayOf(now)))) {
    const other = await store.getManagedBy(user.id);
    return fail(409, other && other.id !== id ? `You already manage ${other.name}. Stop managing it first.` : "Another player already manages this guild.");
  }
  const row = await store.getGuild(id);
  await syncGuild({ store, gameinfo, guild: row, now });
  return ok({ guild: guildRef(row) });
}

async function syncDue(deps) {
  const { store, gameinfo } = deps;
  const started = Date.now();
  const due = await store.dueGuilds(new Date(deps.now() - STALE_MS).toISOString(), SYNC_BATCH);
  const result = { synced: 0, failed: 0, waiting: 0 };
  for (const guild of due) {
    if (Date.now() - started > SYNC_BUDGET_MS) {
      result.waiting++;
      continue;
    }
    try {
      await syncGuild({ store, gameinfo, guild, now: deps.now() });
      result.synced++;
    } catch (error) {
      result.failed++;
      console.error("guild sync failed", guild.id, error);
    }
  }
  return ok(result);
}

export async function handleGuild(action, request, deps) {
  const { method, query = {}, body, token, authorization, client } = request;
  const region = String(query.region ?? "").toLowerCase();
  // every action but the cron can reach Albion's killboard: limited per visitor
  if (action !== "sync" && deps.limiter && !deps.limiter.take(client)) return fail(429, "Too many requests. Wait a minute and try again.");
  try {
    if (action === "search") {
      if (method !== "GET") return fail(405, "Method not allowed");
      const q = String(query.q ?? "").trim();
      if (!isRegion(region) || q.length < 2 || q.length > 40) return fail(400, "Type at least 2 letters of the guild name.");
      const guilds = (await deps.gameinfo.searchGuilds(region, q)).slice(0, 10).map((g) => ({ ...g, slug: slugify(g.name) }));
      return ok({ guilds }, SEARCH_CACHE_S);
    }
    if (action === "guild") {
      if (method !== "GET") return fail(405, "Method not allowed");
      if (!isRegion(region)) return fail(400, "Unknown server.");
      return await getGuildPage(deps, { region, slug: String(query.slug ?? ""), id: String(query.id ?? "") }, token);
    }
    if (action === "sync") {
      if (!deps.cronSecret || authorization !== `Bearer ${deps.cronSecret}`) return fail(401, "Unauthorized");
      if (!deps.store) return fail(503, "Guild tracking is not set up.");
      return await syncDue(deps);
    }
    if (action === "mine" || action === "manage" || action === "release") {
      if (method !== (action === "mine" ? "GET" : "POST")) return fail(405, "Method not allowed");
      const user = token ? await deps.userFromToken(token) : null;
      if (action === "mine") {
        const row = user && deps.store ? await deps.store.getManagedBy(user.id) : null;
        return ok({ guild: row ? guildRef(row) : null });
      }
      if (!user) return fail(401, "Sign in to manage a guild.");
      if (!deps.store) return fail(503, "Guild tracking is not set up yet.");
      if (action === "manage") return await manage(deps, user, body);
      const mine = await deps.store.getManagedBy(user.id);
      if (mine) await deps.store.releaseGuild(mine.id, user.id);
      return ok({ released: Boolean(mine) });
    }
    return fail(404, "Unknown guild action.");
  } catch (error) {
    if (error instanceof GameinfoError) return fail(error.status, error.status === 404 ? "No guild with that name on this server." : "Albion's killboard is not answering right now. Try again in a minute.");
    console.error("guild api", action, error);
    return fail(500, "Something went wrong. Try again in a minute.");
  }
}
