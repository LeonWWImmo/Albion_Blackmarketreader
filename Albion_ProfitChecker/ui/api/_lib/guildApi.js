// What /api/guild/<action> answers. The I/O comes in as `deps`, so tests run it on fakes:
//   store          api/_lib/guildStore.js (null when the database is not configured)
//   gameinfo       api/_lib/gameinfo.js
//   userFromToken  Supabase access token -> { id } or null
//   now            () => Date
//   cronSecret     CRON_SECRET, which Vercel Cron sends for the daily sync
//   limiter        optional api/_lib/rateLimit.js limiter, keyed by request.client
//   values         optional (region, itemIds) => { table, complete } (api/_lib/itemValue.js), for the killboard
//
//   GET  search?region=eu&q=angry        guilds whose name matches, best match first, with their kill fame
//   GET  top?region=eu&range=week        the 5 guilds with the most kill fame this week or month
//   GET  guild?region=eu&slug=..&id=..   one guild: info, tracking, activity, recent fights (public, cached)
//   GET  killboard?region=eu&id=..       the guild's latest kills and deaths (public, cached)
//   GET  mine                            the guild the signed-in player has marked
//   POST mark {region, id}               mark a guild (it is tracked while anyone has it marked)
//   POST unmark                          remove the mark
//   GET  sync                            Vercel Cron: snapshot every marked guild once a day
import { GameinfoError, TOP_RANGES, isGuildId, isRegion } from "./gameinfo.js";
import { unitValue } from "./itemValue.js";
import { PERIODS, addDays, buildActivity, dayOf, planSync, playersFromMembers, slugify, snapshotOf } from "./guildActivity.js";

/** The cron syncs a marked guild again when its last sync is older than this. */
export const STALE_MS = 20 * 3600 * 1000;
// one guild can take ~17 s when the killboard is slow (2 tries of 8 s): stop starting new ones
// early enough to stay inside the function's 60 s
const SYNC_BUDGET_MS = 30_000;
const SYNC_BATCH = 40;
const FIGHTS_SHOWN = 8;
const KILLBOARD_SHOWN = 25;
/** Recent fights with our deaths whose kills are read for the killboard's deaths. */
const DEATH_FIGHTS = 4;
const PUBLIC_CACHE_S = 300;
const SEARCH_CACHE_S = 600;
const SEARCH_SHOWN = 10;
/** A search hit whose fame takes longer than this is shown without it. */
const FAME_WAIT_MS = 1500;
const TOP_SHOWN = 5;
const TOP_CACHE_S = 1800;
/** Days kept before the longest period, so a missed daily snapshot still leaves a start point. */
const BASELINE_SLACK_DAYS = 3;
const SLUG = /^[a-z0-9-]{1,90}$/;
/** A roster shrinking below this share of the stored one is checked once more before it counts. */
const ROSTER_DROP = 0.5;
const ROSTER_DROP_MIN = 10;

const ok = (body, maxAge = 0) => ({ status: 200, body, maxAge });
const fail = (status, error) => ({ status, body: { error }, maxAge: 0 });
const NOT_FOUND = "No guild with that name on this server.";
const UNIQUE_VIOLATION = "23505";

const guildRef = (row) => ({ id: row.id, region: row.region, slug: row.slug, name: row.name });

/** The bit of the id a URL name gets when another guild has the same name: 6 letters or digits. */
export const slugSuffix = (id) => id.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toLowerCase();

/** "angry fuzzies" for "  Angry   Fuzzies ": one search, one cache entry, whatever the typing. */
export const normalizeQuery = (q) => String(q ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Exact name first, then names starting with the query, then the rest, each alphabetically. */
export function rankGuilds(guilds, query) {
  const rank = (name) => (name.toLowerCase() === query ? 0 : name.toLowerCase().startsWith(query) ? 1 : 2);
  return [...guilds].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/** The URL part for a guild: its slugified name, with a bit of the id when another stored guild has it. */
async function uniqueSlug(store, region, name, id) {
  const slug = slugify(name);
  const owner = await store.getGuildBySlug(region, slug);
  return owner && owner.id !== id ? `${slug}-${slugSuffix(id)}` : slug;
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

/** One daily snapshot of a marked guild: roster, fame, fights. */
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
  // ascending: the latest earlier day wins; days from an earlier, ended tracking are no comparison
  for (const row of recent) if (row.day < today && (!guild.tracked_since || row.day >= guild.tracked_since)) before.set(row.player_id, row);
  const plan = planSync({ guildId: guild.id, members, battles, players, before, today });
  // snapshots first: if they fail (e.g. a column missing), no join or leave is written without them
  await store.saveSnapshots(plan.snapshots);
  await store.savePlayers(plan.players);
  const slug = info.name === guild.name ? guild.slug : await uniqueSlug(store, guild.region, info.name, guild.id);
  await store.saveGuild({ ...guildRow(info, guild.region, slug, members.length), last_synced_at: now.toISOString() });
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

/** The guild behind an address: by id when the page knows it, else by URL name (stored, then the killboard search). */
async function resolveGuild({ store, gameinfo }, region, slug, id) {
  const byId = isGuildId(id);
  const bySlug = SLUG.test(slug ?? "");
  if (!byId && !bySlug) return null;
  // both stored lookups at once: the second also tells whether this URL name belongs to another guild
  const [idRow, slugRow] = await Promise.all([
    byId ? tryStore(store, () => store.getGuild(id)) : { ok: true, value: null },
    bySlug ? tryStore(store, () => store.getGuildBySlug(region, slug)) : { ok: true, value: null }
  ]);
  const storeOk = Boolean(store) && idRow.ok && slugRow.ok;
  if (byId) return { id, row: idRow.value?.region === region ? idRow.value : null, slugOwner: slugRow.value, storeOk };
  if (slugRow.value) return { id: slugRow.value.id, row: slugRow.value, slugOwner: slugRow.value, storeOk };
  const hits = await gameinfo.searchGuilds(region, normalizeQuery(slug.replace(/-/g, " ")));
  // two guilds with this name: the first one; its page then sends the visitor to its own address
  const exact = hits.find((g) => slugify(g.name) === slug);
  if (exact) return { id: exact.id, row: null, slugOwner: null, storeOk };
  // "<name>-<6 letters of the id>": the address of a guild whose name another guild has too
  const suffixed = /^(.+)-([a-z0-9]{6})$/.exec(slug);
  if (!suffixed) return null;
  const [, base, suffix] = suffixed;
  const baseHits = await gameinfo.searchGuilds(region, normalizeQuery(base.replace(/-/g, " ")));
  const hit = baseHits.find((g) => slugify(g.name) === base && slugSuffix(g.id) === suffix);
  return hit ? { id: hit.id, row: null, slugOwner: null, storeOk } : null;
}

/**
 * The address of a guild that is not stored: its name, or name + id bit when another guild has that
 * name too (a stored one, or a second one on the killboard). Always the same answer for the same
 * guild, from any entry point, so its page never bounces between two addresses.
 */
async function untrackedSlug({ store, gameinfo }, region, urlSlug, resolved, info) {
  const nameSlug = slugify(info.name);
  const [owner, hits] = await Promise.all([
    // the lookup for the visited address already answers this when the address is the plain name
    urlSlug === nameSlug ? resolved.slugOwner : tryStore(store, () => store.getGuildBySlug(region, nameSlug)).then((r) => r.value),
    gameinfo.searchGuilds(region, normalizeQuery(info.name)).catch(() => [])
  ]);
  const twin = (owner && owner.id !== info.id) || hits.some((g) => g.id !== info.id && slugify(g.name) === nameSlug);
  return twin ? `${nameSlug}-${slugSuffix(info.id)}` : nameSlug;
}

/** Search hits with their addresses: a name two hits share gets the id bit, like untrackedSlug. */
export function withSlugs(hits) {
  const count = new Map();
  for (const g of hits) count.set(slugify(g.name), (count.get(slugify(g.name)) ?? 0) + 1);
  return hits.map((g) => {
    const slug = slugify(g.name);
    return { ...g, slug: count.get(slug) > 1 ? `${slug}-${slugSuffix(g.id)}` : slug };
  });
}

/** The promise's answer, or null when it takes longer than `ms` or fails. */
function within(promise, ms) {
  let timer;
  const late = new Promise((resolve) => (timer = setTimeout(() => resolve(null), ms)));
  return Promise.race([promise.catch(() => null), late]).finally(() => clearTimeout(timer));
}

/**
 * Albion's search sends no fame: each hit's comes from its guild info, all read at once (the answer
 * is also kept for the guild's page, which opens faster then). A slow one is left out, not waited for.
 */
async function withFame(gameinfo, region, hits) {
  return Promise.all(
    hits.map(async (g) => {
      const info = await within(gameinfo.getGuild(region, g.id), FAME_WAIT_MS);
      return { ...g, killFame: info ? info.killFame : null, deathFame: info ? info.deathFame : null };
    })
  );
}

const fightsOf = (battles) =>
  battles
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

/**
 * The public guild page. The same answer for everyone, so the CDN keeps it: no personal parts, and
 * a visit never writes (the daily cron and a mark take the snapshots). An answer missing a part
 * (database or fights) is not kept, so the next visitor gets the whole page again.
 */
async function getGuildPage(deps, { region, slug, id }) {
  const { store, gameinfo } = deps;
  const resolved = await resolveGuild(deps, region, slug, id);
  if (!resolved) return fail(404, NOT_FOUND);
  let fightsOk = true;
  const [info, members, battles, markCount] = await Promise.all([
    gameinfo.getGuild(region, resolved.id),
    gameinfo.getMembers(region, resolved.id),
    gameinfo.getBattles(region, resolved.id).catch(() => {
      fightsOk = false;
      return [];
    }),
    resolved.storeOk && resolved.row ? tryStore(store, () => store.countMarks(resolved.id)) : { ok: resolved.storeOk, value: 0 }
  ]);
  let storeOk = resolved.storeOk && markCount.ok;
  const row = resolved.row;
  const today = dayOf(deps.now());
  let history = null;
  if (storeOk && markCount.value > 0) {
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
  const activity = buildActivity({ players, snapshots, today, trackedSince });
  // where each member's fame came from (lifetime, from today's roster): the member's details
  const roster = new Map(members.map((m) => [m.id, m]));
  for (const member of activity.members) {
    const live = roster.get(member.id);
    member.details = live ? { pveZones: live.pveZones, resources: live.resources, killFame: live.killFame, deathFame: live.deathFame } : null;
  }
  const urlSlug = row?.slug ?? (await untrackedSlug(deps, region, slug, resolved, info));
  return ok(
    {
      guild: {
        id: info.id,
        region,
        name: info.name,
        slug: urlSlug,
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
        markedBy: tracked ? markCount.value : 0,
        canMark: storeOk
      },
      activity,
      fights: fightsOf(battles)
    },
    storeOk && fightsOk ? PUBLIC_CACHE_S : 0
  );
}

/** Every item id on the killboard, gear first (it decides most of a kill's value), bags after. */
function killboardItemIds(events) {
  const gear = events.flatMap((e) => [...Object.values(e.killer.gear), ...Object.values(e.victim.gear)].map((p) => p.type));
  const bags = events.flatMap((e) => e.victim.inventory.map((p) => p.type));
  return [...new Set([...gear, ...bags])];
}

/** An event with a market value on every item, each side's gear, the victim's bag and the total lost. */
export function priceEvent(event, table) {
  const priced = (p) => ({ ...p, value: unitValue(table, p.type, p.quality) * p.count });
  const priceSide = (side) => {
    const gear = Object.fromEntries(Object.entries(side.gear).map(([slot, p]) => [slot, priced(p)]));
    return { ...side, gear, gearValue: Object.values(gear).reduce((t, p) => t + p.value, 0) };
  };
  const inventory = event.victim.inventory.map(priced).sort((a, b) => b.value - a.value);
  const victim = { ...priceSide(event.victim), inventory, inventoryValue: inventory.reduce((t, p) => t + p.value, 0) };
  return { ...event, killer: priceSide(event.killer), victim, value: victim.gearValue + victim.inventoryValue };
}

async function getKillboard({ gameinfo, values }, { region, id }) {
  if (!isGuildId(id)) return fail(400, "Pick a guild first.");
  let complete = true;
  const partial = () => {
    complete = false;
    return [];
  };
  const [kills, battles] = await Promise.all([gameinfo.getGuildKills(region, id), gameinfo.getBattles(region, id).catch(partial)]);
  // Albion's guild feed has kills only: deaths come from the kills of the latest fights we lost people in
  const lost = battles.filter((b) => b.ours.some((p) => p.deaths > 0)).slice(0, DEATH_FIGHTS);
  const fightKills = await Promise.all(lost.map((b) => gameinfo.getBattleEvents(region, b.id).catch(partial)));
  const deaths = new Map();
  for (const event of fightKills.flat()) if (event.victim.guildId === id) deaths.set(event.id, event);
  const newestFirst = (a, b) => b.time.localeCompare(a.time);
  const shownKills = kills.filter((e) => e.killer.guildId === id).sort(newestFirst).slice(0, KILLBOARD_SHOWN);
  const shownDeaths = [...deaths.values()].sort(newestFirst).slice(0, KILLBOARD_SHOWN);
  // market values: one price request for the whole board; without prices the board still shows
  let table = new Map();
  let priced = false;
  let pricesComplete = false;
  if (values) {
    try {
      ({ table, complete: pricesComplete } = await values(region, killboardItemIds([...shownKills, ...shownDeaths])));
      priced = true;
    } catch (error) {
      complete = false;
      console.error("killboard prices failed", error);
    }
  }
  return ok(
    {
      kills: shownKills.map((e) => priceEvent(e, table)),
      deaths: shownDeaths.map((e) => priceEvent(e, table)),
      priced,
      // more items than the price lookup takes: the rest counts as 0
      pricesComplete: priced && pricesComplete
    },
    // without every fight or the prices the board is incomplete: not kept for everyone
    complete ? PUBLIC_CACHE_S : 0
  );
}

/** Stores a guild's row; when another guild took the same address a moment ago, with the id bit. */
async function saveGuildRow(store, region, info, memberCount, existing) {
  const slug = existing?.slug ?? (await uniqueSlug(store, region, info.name, info.id));
  try {
    await store.saveGuild(guildRow(info, region, slug, memberCount));
  } catch (error) {
    if (existing || error?.code !== UNIQUE_VIOLATION) throw error;
    await store.saveGuild(guildRow(info, region, `${slugify(info.name)}-${slugSuffix(info.id)}`, memberCount));
  }
}

async function mark(deps, user, body) {
  const { store, gameinfo } = deps;
  const region = String(body?.region ?? "");
  const id = String(body?.id ?? "");
  if (!isRegion(region) || !isGuildId(id)) return fail(400, "Pick a guild first.");
  const current = await store.getMark(user.id);
  if (current?.id === id) return ok({ guild: guildRef(current) });
  if (current) return fail(409, `You marked ${current.name} already. Unmark it first.`);
  const now = deps.now();
  const today = dayOf(now);
  // whether anyone had it marked is read before this mark: two first marks at once both start tracking today
  const [info, members, existing, markedBefore] = await Promise.all([gameinfo.getGuild(region, id), gameinfo.getMembers(region, id), store.getGuild(id), store.countMarks(id)]);
  await saveGuildRow(store, region, info, members.length, existing);
  if (!(await store.addMark(user.id, id))) {
    const other = await store.getMark(user.id);
    if (other?.id === id) return ok({ guild: guildRef(other) }); // a second click that was faster
    return fail(409, other ? `You marked ${other.name} already. Unmark it first.` : "Try again in a moment.");
  }
  // nobody had it marked: tracking starts anew, gains must not span the time without snapshots
  if (markedBefore === 0) await store.setTrackedSince(id, today);
  const row = await store.getGuild(id);
  if (markedBefore === 0 || !row.last_synced_at || dayOf(row.last_synced_at) !== today) {
    try {
      await syncGuild({ store, gameinfo, guild: row, now });
    } catch (error) {
      // the mark stands; the daily run takes the first snapshot
      console.error("first snapshot after a mark failed", id, error);
    }
  }
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

const GET_ACTIONS = new Set(["search", "top", "guild", "killboard", "mine", "sync"]);
const POST_ACTIONS = new Set(["mark", "unmark"]);

export async function handleGuild(action, request, deps) {
  const { method, query = {}, body, token, authorization, client } = request;
  if (!GET_ACTIONS.has(action) && !POST_ACTIONS.has(action)) return fail(404, "Unknown guild action.");
  if (method !== (POST_ACTIONS.has(action) ? "POST" : "GET")) return fail(405, "Method not allowed");
  const region = String(query.region ?? "").toLowerCase();
  // every action but the cron can reach Albion's killboard: limited per visitor
  if (action !== "sync" && deps.limiter && !deps.limiter.take(client)) return fail(429, "Too many requests. Wait a minute and try again.");
  try {
    if (action === "sync") {
      if (!deps.cronSecret || authorization !== `Bearer ${deps.cronSecret}`) return fail(401, "Unauthorized");
      if (!deps.store) return fail(503, "Guild tracking is not set up.");
      return await syncDue(deps);
    }
    if (action === "search" || action === "top" || action === "guild" || action === "killboard") {
      if (!isRegion(region)) return fail(400, "Unknown server.");
      if (action === "guild") return await getGuildPage(deps, { region, slug: String(query.slug ?? ""), id: String(query.id ?? "") });
      if (action === "killboard") return await getKillboard(deps, { region, id: String(query.id ?? "") });
      if (action === "top") {
        const range = String(query.range ?? "");
        if (!TOP_RANGES.includes(range)) return fail(400, "Unknown time range.");
        const guilds = withSlugs((await deps.gameinfo.getTopGuilds(region, range)).slice(0, TOP_SHOWN));
        return ok({ range, guilds }, TOP_CACHE_S);
      }
      const q = normalizeQuery(query.q);
      if (q.length < 2 || q.length > 40) return fail(400, "Type at least 2 letters of the guild name.");
      const hits = withSlugs(rankGuilds(await deps.gameinfo.searchGuilds(region, q), q).slice(0, SEARCH_SHOWN));
      const guilds = await withFame(deps.gameinfo, region, hits);
      // a hit without its fame is not kept for long: the next search fills it in
      return ok({ guilds }, guilds.some((g) => g.killFame === null) ? 60 : SEARCH_CACHE_S);
    }
    // mine, mark, unmark: the signed-in player
    const user = token ? await deps.userFromToken(token) : null;
    if (action === "mine") {
      const row = user && deps.store ? await deps.store.getMark(user.id) : null;
      return ok({ guild: row ? guildRef(row) : null });
    }
    if (!user) return fail(401, "Sign in to mark a guild.");
    if (!deps.store) return fail(503, "Guild tracking is not set up yet.");
    if (action === "mark") return await mark(deps, user, body);
    return ok({ unmarked: Boolean(await deps.store.removeMark(user.id)) });
  } catch (error) {
    if (error instanceof GameinfoError) return fail(error.status, error.status === 404 ? NOT_FOUND : "Albion's killboard is not answering right now. Try again in a minute.");
    console.error("guild api", action, error);
    return fail(500, "Something went wrong. Try again in a minute.");
  }
}
