// What /api/guild/<action> answers. The I/O comes in as `deps`, so tests run it on fakes:
//   store          api/_lib/guildStore.js (null when the database is not configured)
//   gameinfo       api/_lib/gameinfo.js
//   userFromToken  Supabase access token -> { id } or null
//   now            () => Date
//   cronSecret     CRON_SECRET, which Vercel Cron sends for the daily sync
//   actionsSecret  ACTIONS_CRON_SECRET, which the GitHub Actions jobs send (the ZvZ report, every 30 min)
//   premium        optional async userId => boolean: has premium (api/_lib/billing.js hasPremium), for Guild Pro
//   limiter        optional api/_lib/rateLimit.js limiter, keyed by request.client
//   values         optional (region, itemIds) => { table, complete } (api/_lib/itemValue.js), for the killboard
//   discord        optional { check(url), post(url, payload) } (api/_lib/guildDiscord.js), for the Discord report
//
//   GET  search?region=eu&q=angry        guilds whose name matches, best match first, with their kill fame
//   GET  top?region=eu&range=week        the 5 guilds with the most kill fame this week or month
//   GET  guild?region=eu&slug=..&id=..   one guild: info, tracking, activity, recent fights (public, cached)
//   GET  killboard?region=eu&id=..       the guild's latest kills and deaths (public, cached)
//   GET  battle?region=eu&id=123         one fight: alliances, guilds, players with damage and healing, every kill
//   GET  fights?region=eu&id=..          the guild's listed fights with who of us was there (attendance)
//   GET  hook?region=eu                  the name of the signed-in player's Discord webhook on that server
//   POST hook-save {region, url}         set it (checked with Discord, then a first message is posted)
//   POST hook-remove {region}            remove it
//   POST hook-zvz {region, on}           Guild Pro (premium): the ZvZ report after every big fight on or off
//   GET  mine                            the guilds the signed-in player has marked (one per server)
//   POST mark {region, id}               mark a guild (it is tracked while anyone has it marked)
//   POST unmark {region, id?}            remove the mark of that guild (without id: the main one on that server)
//   GET  pro-fights                      GitHub Actions, every 30 min: keep the fights of Guild Pro guilds
//   GET  sync-retry                      GitHub Actions, every 30 min from 05:00 UTC: the daily sync of guilds it missed
//   GET  fights-history?region&id&days   Guild Pro: the kept fights of 30 or 90 days, for attendance
//   GET  sync                            Vercel Cron: snapshot every marked guild once a day, then post its Discord reports
//   GET  zvz                             GitHub Actions, every 30 min: post the new big fights to the ZvZ webhooks
//   GET  regear-paid?region=eu&battle=1  the deaths of a fight the signed-in player ticked as paid
//   POST regear-pay {region, battle, event, paid}
//   GET  regear-fights?region=eu&guild=.. the fights of a guild they marked to regear
//   POST regear-mark {region, guild, battle, fight, marked}
//   GET  bank?guild=..                   the signed-in player's chest log of a guild
//   POST bank-save {guild, rows}         replace it
//   GET  splits?guild=..                 their saved loot splits of a guild
//   POST split-save {guild, id?, name, data}, split-remove {id}
// The last ones are private per player (api/_lib/guildPrivate.js) and never reach the killboard.
import { createHash } from "node:crypto";
import { GameinfoError, PAGES_BUDGET_MS, TOP_RANGES, isBattleId, isGuildId, isRegion } from "./gameinfo.js";
import { dailyReport, helloMessage, isWebhookUrl, zvzHello, zvzReport } from "./guildDiscord.js";
import { handlePrivate } from "./guildPrivate.js";
import { unitValue } from "./itemValue.js";
import { PERIODS, addDays, buildActivity, dayOf, planSync, playersFromMembers, slugify, snapshotOf } from "./guildActivity.js";

// The cron syncs each marked guild once per day (UTC): the ones not synced yet today, also when a
// mark synced it late the evening before.
// one guild can take ~17 s when the killboard is slow (2 tries of 8 s): stop starting new ones
// early enough to stay inside the function's 60 s
const SYNC_BUDGET_MS = 25_000;
/** Discord reports are not started after this long: one report (guild page + Discord, ~16 s at worst) still ends inside 60 s. */
const REPORT_BUDGET_MS = 38_000;
const SYNC_BATCH = 40;
const FIGHTS_SHOWN = 8;
const KILLBOARD_SHOWN = 25;
/** Recent fights with our deaths whose kills are read for the killboard's deaths. */
const DEATH_FIGHTS = 4;
/**
 * Albion lists only bigger fights per guild, so most deaths are read from the members' own death
 * lists: of the members who played most recently, this many.
 */
const DEATH_PLAYERS = 20;
const PUBLIC_CACHE_S = 300;
const SEARCH_CACHE_S = 600;
const SEARCH_SHOWN = 10;
/** A search hit whose fame takes longer than this is shown without it. */
const FAME_WAIT_MS = 800;
/** Only the first hits get their fame looked up: one search must not send a burst to the killboard. */
const FAME_LOOKUPS = 5;
const TOP_SHOWN = 5;
const TOP_CACHE_S = 1800;
/** A fight that ended this long ago no longer changes: its report is kept for hours. */
const BATTLE_DONE_MS = 30 * 60_000;
const BATTLE_DONE_CACHE_S = 6 * 3600;
const BATTLE_RUNNING_CACHE_S = 120;
/**
 * Attendance reads the guild's listed fights back this far. A busy guild has ~100 a day, small ones
 * included, so a longer time would take too many pages.
 */
const ATTENDANCE_DAYS = 7;
/** At most this many pages of 50 fights (~8 days of a very busy guild), this many at once. */
const ATTENDANCE_PAGES = 16;
const ATTENDANCE_AT_ONCE = 4;
const FIGHTS_PAGE = 50;
const FIGHTS_CACHE_S = 600;
/** A ZvZ: a fight with this many players, this many of them of the guild. */
const ZVZ_MIN_PLAYERS = 20;
const ZVZ_MIN_OURS = 5;
/** No kill for this long: the fight is over and its report final. */
const ZVZ_QUIET_MS = 10 * 60_000;
/** A fight whose kills did not all load is posted anyway once it ended this long ago. */
const ZVZ_GIVE_UP_MS = 60 * 60_000;
/** Never older fights than this: after a pause (premium ended, the job down) no flood of old ones. */
const ZVZ_LOOKBACK_MS = 6 * 3600_000;
const ZVZ_PER_HOOK = 3;
/** No new report is started after this long: one more (fight + Discord, ~25 s at worst) ends inside 60 s. */
const ZVZ_BUDGET_MS = 30_000;
/** Guild Pro: guilds a player can mark per server (without it: one). */
const PRO_GUILDS_PER_SERVER = 5;
/** Guild Pro attendance: the periods it shows, and how long kept fights stay. */
const PRO_HISTORY_DAYS = [30, 90];
const PRO_KEEP_DAYS = 95;
/** The fights of the last hours are read again: a running fight still grows. */
const PRO_OVERLAP_MS = 2 * 3600_000;
const PRO_FIGHT_PAGES = 8;
/** No new guild is started after this long (a guild takes a few seconds at worst). */
const PRO_FIGHTS_BUDGET_MS = 35_000;
/** Days kept before the longest period, so a missed daily snapshot still leaves a start point. */
const BASELINE_SLACK_DAYS = 3;
const SLUG = /^[a-z0-9-]{1,90}$/;
/** A marked guild not synced for this long: the daily sync is broken (it runs every 24 h). */
const SYNC_LATE_MS = 28 * 3600 * 1000;
const STATUS_CACHE_S = 60;
/** A roster shrinking below this share of the stored one is checked once more before it counts. */
const ROSTER_DROP = 0.5;
const ROSTER_DROP_MIN = 10;

const ok = (body, maxAge = 0) => ({ status: 200, body, maxAge });
const fail = (status, error) => ({ status, body: { error }, maxAge: 0 });
const SERVER_NAMES = { eu: "Europe", us: "America" };
/**
 * Albion's killboard of one server failed us (it is unofficial and goes down for hours at times):
 * say whose problem it is, and point to the other server. `down` lets the page offer the switch.
 */
function killboardDown(status, region) {
  const name = SERVER_NAMES[region];
  const other = SERVER_NAMES[region === "eu" ? "us" : "eu"];
  const error = `Albion's API for ${name} is down right now. That is on Albion's side, not this site: no ${name} data until it is back. Try ${other} in the meantime.`;
  return { status, body: { error, down: region }, maxAge: 0 };
}
const NOT_FOUND = "No guild with that name on this server.";
const SERVER = { eu: "Europe", us: "America" };
const UNIQUE_VIOLATION = "23505";

const guildRef = (row) => ({ id: row.id, region: row.region, slug: row.slug, name: row.name });

/** The bit of the id a URL name gets when another guild has the same name: 6 letters or digits. */
export const slugSuffix = (id) => id.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toLowerCase();

/** "angry fuzzies" for "  Angry   Fuzzies ": one search, one cache entry, whatever the typing. */
export const normalizeQuery = (q) => String(q ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Exact name first, then names starting with the query, then the rest, each alphabetically. */
const matchRank = (name, query) => (name.toLowerCase() === query ? 0 : name.toLowerCase().startsWith(query) ? 1 : 2);

export function rankGuilds(guilds, query) {
  return [...guilds].sort((a, b) => matchRank(a.name, query) - matchRank(b.name, query) || a.name.localeCompare(b.name));
}

/** Within the same name match, the guild with the most kill fame first (unknown fame after known). */
export function rankByFame(guilds, query) {
  return [...guilds].sort((a, b) => matchRank(a.name, query) - matchRank(b.name, query) || (b.killFame ?? -1) - (a.killFame ?? -1));
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
    gameinfo.getBattles(guild.region, guild.id).catch((error) => {
      // the snapshot still counts; only the last fight date does not move today
      console.warn("guild sync: fights did not load", guild.id, error instanceof Error ? error.message : error);
      return [];
    }),
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
  // found by name on the killboard: it may still be stored, under its other address
  const found = async (foundId) => {
    const stored = store ? await tryStore(store, () => store.getGuild(foundId)) : { ok: false, value: null };
    return { id: foundId, row: stored.value?.region === region ? stored.value : null, slugOwner: null, storeOk: storeOk && stored.ok };
  };
  const hits = await gameinfo.searchGuilds(region, normalizeQuery(slug.replace(/-/g, " ")));
  // two guilds with this name: the first one; its page then sends the visitor to its own address
  const exact = hits.find((g) => slugify(g.name) === slug);
  if (exact) return found(exact.id);
  // "<name>-<6 letters of the id>": the address of a guild whose name another guild has too
  const suffixed = /^(.+)-([a-z0-9]{6})$/.exec(slug);
  if (!suffixed) return null;
  const [, base, suffix] = suffixed;
  const baseHits = await gameinfo.searchGuilds(region, normalizeQuery(base.replace(/-/g, " ")));
  const hit = baseHits.find((g) => slugify(g.name) === base && slugSuffix(g.id) === suffix);
  return hit ? found(hit.id) : null;
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
    hits.map(async (g, i) => {
      // the rest keeps the fame the search gave (its kill fame is often missing)
      if (i >= FAME_LOOKUPS) return g;
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
      deaths: b.ours.reduce((t, p) => t + p.deaths, 0),
      enemy: b.enemy ?? null
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
  const [kills, battles, members] = await Promise.all([
    gameinfo.getGuildKills(region, id),
    gameinfo.getBattles(region, id).catch(partial),
    gameinfo.getMembers(region, id).catch(partial)
  ]);
  // Albion's guild feed has kills only: deaths come from the members who played last (their own
  // death lists) and from the latest listed fights we lost people in
  const lost = battles.filter((b) => b.ours.some((p) => p.deaths > 0)).slice(0, DEATH_FIGHTS);
  const recent = members
    .filter((m) => m.deathFame > 0)
    .sort((a, b) => (b.statsAt ?? "").localeCompare(a.statsAt ?? ""))
    .slice(0, DEATH_PLAYERS);
  const lists = await Promise.all([
    ...lost.map((b) => gameinfo.getBattleEvents(region, b.id).catch(partial)),
    ...recent.map((m) => gameinfo.getPlayerDeaths(region, m.id).catch(partial))
  ]);
  const deaths = new Map();
  // only deaths while in this guild
  for (const event of lists.flat()) if (event.victim.guildId === id) deaths.set(event.id, event);
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

/** Players per guild or alliance id. */
function countBy(players, key) {
  const counts = new Map();
  for (const p of players) if (p[key]) counts.set(p[key], (counts.get(p[key]) ?? 0) + 1);
  return counts;
}

const byKillFame = (a, b) => b.killFame - a.killFame || b.kills - a.kills;

/**
 * One fight's report: every alliance, guild and player with kills, deaths and kill fame (Albion's
 * sums), each player's damage and assists towards the kills, and every kill with its value.
 */
async function getBattleReport({ gameinfo, values, now }, { region, id }) {
  if (!isBattleId(id)) return fail(400, "Pick a fight first.");
  const { battle, events, stats, complete } = await gameinfo.getBattleReport(region, id);
  const perGuild = countBy(battle.players, "guildId");
  const perAlliance = countBy(battle.players, "allianceId");
  const players = battle.players
    .map((p) => {
      const s = stats[p.id];
      return { ...p, damage: s?.damage ?? 0, assists: s?.assists ?? 0, healAssists: s?.healAssists ?? 0, itemPower: s?.itemPower ?? 0, weapon: s?.weapon ?? null };
    })
    .sort(byKillFame);
  let table = new Map();
  let priced = false;
  let pricesComplete = false;
  if (values) {
    try {
      ({ table, complete: pricesComplete } = await values(region, killboardItemIds(events)));
      priced = true;
    } catch (error) {
      console.error("battle prices failed", error);
    }
  }
  const done = now() - Date.parse(battle.endTime) > BATTLE_DONE_MS;
  const keep = complete && (priced || !values);
  return ok(
    {
      battle: { id: battle.id, startTime: battle.startTime, endTime: battle.endTime, kills: battle.kills, fame: battle.fame, players: battle.players.length },
      alliances: battle.alliances.map((a) => ({ ...a, players: perAlliance.get(a.id) ?? 0 })).sort(byKillFame),
      guilds: battle.guilds.map((g) => ({ ...g, players: perGuild.get(g.id) ?? 0 })).sort(byKillFame),
      players,
      kills: [...events].sort((a, b) => b.time.localeCompare(a.time)).map((e) => priceEvent(e, table)),
      complete,
      priced,
      pricesComplete: priced && pricesComplete
    },
    keep ? (done ? BATTLE_DONE_CACHE_S : BATTLE_RUNNING_CACHE_S) : 0
  );
}

/** Listed fights since `since` with someone of the guild in them, once each, newest first: what attendance needs. */
function attendanceFights(battles, since) {
  const seen = new Set();
  return battles
    .filter((b) => b.startTime >= since && b.ours.length && !seen.has(b.id) && seen.add(b.id))
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .map((b) => ({ id: b.id, startTime: b.startTime, players: b.players, kills: b.kills, fame: b.fame, enemy: b.enemy ?? null, ours: b.ours }));
}

/**
 * The guild's listed fights of the last ATTENDANCE_DAYS, newest first, each with who of the guild
 * was there: for attendance. `complete`: the days are covered and no page failed.
 */
async function getFights({ gameinfo, now }, { region, id }) {
  if (!isGuildId(id)) return fail(400, "Pick a guild first.");
  const since = new Date(now().getTime() - ATTENDANCE_DAYS * 86_400_000).toISOString();
  const all = [];
  let complete = false;
  let failed = false;
  const started = Date.now();
  // the first page alone: for most guilds it already reaches back far enough (a slow killboard,
  // like the Americas one, then gets one request instead of four)
  for (let first = 0; first < ATTENDANCE_PAGES && !complete && !failed; first += first === 0 ? 1 : ATTENDANCE_AT_ONCE) {
    // a slow killboard: what has loaded so far, not the function's time limit
    if (first > 0 && Date.now() - started > PAGES_BUDGET_MS) {
      failed = true;
      break;
    }
    const pages = await Promise.all(
      Array.from({ length: first === 0 ? 1 : Math.min(ATTENDANCE_AT_ONCE, ATTENDANCE_PAGES - first) }, (_, i) => {
        const page = gameinfo.getBattles(region, id, (first + i) * FIGHTS_PAGE);
        // the first page must load; a later one missing leaves the older fights out
        return first + i === 0
          ? page
          : page.catch(() => {
              failed = true;
              return [];
            });
      })
    );
    for (const page of pages) {
      all.push(...page);
      // the end of the list, or back far enough
      if (page.length < FIGHTS_PAGE || page.some((b) => b.startTime < since)) complete = true;
    }
  }
  const fights = attendanceFights(all, since);
  const whole = complete && !failed;
  return ok({ fights, days: ATTENDANCE_DAYS, complete: whole }, whole ? FIGHTS_CACHE_S : 0);
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
  const current = await store.getMark(user.id, region);
  if (current?.id === id) return ok({ guild: guildRef(current) });
  // one guild per server; Guild Pro (premium) marks up to PRO_GUILDS_PER_SERVER
  let pro = false;
  if (current) {
    const marked = (await store.getMarks(user.id)).find((g) => g.id === id);
    if (marked) return ok({ guild: guildRef(marked) });
    pro = Boolean(deps.premium && (await deps.premium(user.id)));
    if (!pro) return fail(409, `You marked ${current.name} on ${SERVER[region]} already. Unmark it first.`);
    if ((await store.countMarksOn(user.id, region)) >= PRO_GUILDS_PER_SERVER) {
      return fail(409, `Guild Pro marks up to ${PRO_GUILDS_PER_SERVER} guilds per server. Unmark one first.`);
    }
  }
  const now = deps.now();
  const today = dayOf(now);
  // whether anyone had it marked is read before this mark: two first marks at once both start tracking today
  const [info, members, existing, markedBefore] = await Promise.all([gameinfo.getGuild(region, id), gameinfo.getMembers(region, id), store.getGuild(id), store.countMarks(id)]);
  await saveGuildRow(store, region, info, members.length, existing);
  if (!(await store.addMark(user.id, region, id))) {
    const other = await store.getMark(user.id, region);
    if (other?.id === id || pro) return ok({ guild: guildRef(other?.id === id ? other : await store.getGuild(id)) }); // a second click that was faster
    return fail(409, other ? `You marked ${other.name} on ${SERVER[region]} already. Unmark it first.` : "Try again in a moment.");
  }
  // two first marks at once on one server, without Guild Pro: the later one goes again
  if (!pro && (await store.countMarksOn(user.id, region)) > 1) {
    await store.removeMark(user.id, region, id);
    const other = await store.getMark(user.id, region);
    return fail(409, other ? `You marked ${other.name} on ${SERVER[region]} already. Unmark it first.` : "Try again in a moment.");
  }
  // nobody had it marked (before, or any more besides this mark): tracking starts anew, gains must
  // not span the time without snapshots
  const first = markedBefore === 0 || (await store.countMarks(id)) === 1;
  if (first) await store.setTrackedSince(id, today);
  const row = await store.getGuild(id);
  if (first || !row.last_synced_at || dayOf(row.last_synced_at) !== today) {
    try {
      await syncGuild({ store, gameinfo, guild: row, now });
    } catch (error) {
      // the mark stands; the daily run takes the first snapshot
      console.error("first snapshot after a mark failed", id, error);
    }
  }
  return ok({ guild: guildRef(row) });
}

/**
 * Guild Pro: keeps the fights of every guild a premium player marked, for attendance over 30 and 90
 * days (Albion's killboard only lists the last days). GitHub Actions, every 30 minutes; each run
 * reads the fights since the newest kept one, guilds least recently read first.
 */
async function proFightsDue(deps) {
  const { store, gameinfo } = deps;
  const started = Date.now();
  const now = deps.now();
  const premium = new Map();
  const ids = new Set();
  for (const m of await store.allMarks()) {
    if (!premium.has(m.user_id)) premium.set(m.user_id, deps.premium ? await deps.premium(m.user_id).catch(() => false) : false);
    if (premium.get(m.user_id)) ids.add(m.guild_id);
  }
  const guilds = (await Promise.all([...ids].map((id) => store.getGuild(id))))
    .filter(Boolean)
    .sort((a, b) => (a.fights_synced_at ?? "").localeCompare(b.fights_synced_at ?? ""));
  let read = 0;
  let stored = 0;
  for (const guild of guilds) {
    if (Date.now() - started > PRO_FIGHTS_BUDGET_MS) break;
    try {
      const { newest } = await store.storedFightsRange(guild.id);
      // the first time: as far back as the killboard lists them
      const since = new Date(newest ? Date.parse(newest) - PRO_OVERLAP_MS : now.getTime() - ATTENDANCE_DAYS * 86_400_000).toISOString();
      const battles = [];
      for (let page = 0; page < PRO_FIGHT_PAGES; page += 1) {
        const list = await gameinfo.getBattles(guild.region, guild.id, page * FIGHTS_PAGE);
        battles.push(...list);
        if (list.length < FIGHTS_PAGE || list.some((b) => b.startTime < since)) break;
      }
      const fights = attendanceFights(battles, since);
      if (fights.length) await store.saveFights(guild.id, fights);
      await store.dropFightsBefore(guild.id, new Date(now.getTime() - PRO_KEEP_DAYS * 86_400_000).toISOString());
      await store.setFightsSynced(guild.id, now.toISOString());
      read += 1;
      stored += fights.length;
    } catch (error) {
      // the killboard of one server down: the next run tries again
      console.warn("guild pro fights", guild.id, error instanceof Error ? error.message : error);
    }
  }
  return ok({ guilds: guilds.length, read, stored });
}

/**
 * The kept fights a function instance read last, per guild and period: 90 days of a busy guild are
 * megabytes, so they are read out of the database again only when the job stored a newer fight.
 */
const historyCache = new Map();
const HISTORY_CACHE_MAX = 40;

/** Guild Pro: the kept fights of the last 30 or 90 days, in the shape of `fights`, for the attendance. */
async function getFightHistory(deps, user, query) {
  const region = String(query.region ?? "");
  const id = String(query.id ?? "");
  const days = Number(query.days);
  if (!isRegion(region) || !isGuildId(id)) return fail(400, "Pick a guild first.");
  if (!PRO_HISTORY_DAYS.includes(days)) return fail(400, "Unknown time range.");
  if (!deps.premium || !(await deps.premium(user.id))) return fail(403, "Attendance over 30 and 90 days is part of Guild Pro.");
  // the period starts at a whole hour, so the answer stays the same for an hour between new fights
  const since = new Date(Math.floor((deps.now().getTime() - days * 86_400_000) / 3600_000) * 3600_000).toISOString();
  const range = await deps.store.storedFightsRange(id);
  const key = `${range.newest}|${range.oldest}|${since}`;
  const cacheKey = `${id}:${days}`;
  let fights = historyCache.get(cacheKey)?.key === key ? historyCache.get(cacheKey).fights : null;
  if (!fights) {
    fights = range.newest ? await deps.store.getStoredFights(id, since) : [];
    historyCache.delete(cacheKey);
    historyCache.set(cacheKey, { key, fights });
    while (historyCache.size > HISTORY_CACHE_MAX) historyCache.delete(historyCache.keys().next().value);
  }
  // `since`: the oldest kept fight; the history grows from the day a Guild Pro player marked the guild.
  // The ETag lets the browser keep it (private, gzipped by sendResult).
  return {
    ...ok({ fights, days, complete: Boolean(range.oldest && range.oldest <= since), since: range.oldest, kept: Boolean(range.newest) }),
    etag: `"${createHash("sha1").update(`${id}|${days}|${key}`).digest("base64url").slice(0, 20)}"`
  };
}

async function syncDue(deps) {
  const { store, gameinfo } = deps;
  const started = Date.now();
  const today = dayOf(deps.now());
  const due = await store.dueGuilds(`${today}T00:00:00.000Z`, SYNC_BATCH);
  const result = { synced: 0, failed: 0, waiting: 0, reports: 0 };
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
  // the reports of every guild with today's snapshot: also the ones a mark took earlier today
  // every marked guild, filtered before any limit: guilds behind on syncing must not take the places of today's
  const fresh = (await store.dueGuilds(FAR_FUTURE, Infinity)).filter((g) => g.last_synced_at && dayOf(g.last_synced_at) === today);
  for (const guild of fresh) {
    if (Date.now() - started > REPORT_BUDGET_MS) break;
    try {
      result.reports += await postReports(deps, guild, started);
    } catch (error) {
      console.error("guild reports failed", guild.id, error);
    }
  }
  return ok(result);
}

/**
 * The daily sync once more for the guilds it missed today (GitHub Actions, every 30 minutes): the
 * Americas killboard is slow at the cron's hour (its evening) and a failed sync waited a whole day.
 * Only after 05:00 UTC, so the daily run at 03:30 stays the first; a guild synced today is skipped,
 * and its report goes out once its sync worked.
 */
const SYNC_RETRY_FROM_HOUR = 5;
async function syncRetry(deps) {
  if (deps.now().getUTCHours() < SYNC_RETRY_FROM_HOUR) return ok({ skipped: "before 05:00 UTC" });
  return syncDue(deps);
}

/** Later than any sync: dueGuilds(FAR_FUTURE) lists every marked guild. */
const FAR_FUTURE = "9999-12-31T00:00:00.000Z";

/** Posts today's report of a freshly synced guild to its players' Discord webhooks; how many went out. */
async function postReports(deps, guild, started) {
  const { store, discord } = deps;
  if (!discord) return 0;
  const now = deps.now();
  const today = dayOf(now);
  const hooks = (await store.webhooksOfGuild(guild.id, guild.region)).filter((h) => h.last_sent_on !== today);
  if (!hooks.length) return 0;
  const page = await getGuildPage(deps, { region: guild.region, slug: guild.slug, id: guild.id });
  if (page.status !== 200) return 0;
  let sent = 0;
  for (const hook of hooks) {
    // the rest goes out tomorrow, with the joins and leaves of both days
    if (Date.now() - started > REPORT_BUDGET_MS) break;
    // joins and leaves since the last report, at most a week back: a missed day is not lost
    const since = hook.last_sent_on && hook.last_sent_on > addDays(today, -7) ? addDays(hook.last_sent_on, 1) : addDays(today, -1);
    const outcome = await discord.post(hook.url, dailyReport(page.body, since, now));
    if (outcome === "ok") {
      await store.setWebhookSent(hook.user_id, guild.region, today);
      sent++;
    } else if (outcome === "gone") {
      await store.removeWebhook(hook.user_id, guild.region);
    }
  }
  return sent;
}

/** What the browser gets of a webhook: never its link. */
const hookView = (hook) => ({ name: hook.name ?? "Discord webhook", lastSentOn: hook.last_sent_on ?? null, zvz: Boolean(hook.zvz) });

/**
 * Guild Pro: posts the new big fights of each ZvZ webhook's guild, oldest first. A fight still going
 * on (a kill in the last minutes) waits for the next run; `zvz_after` moves past each one posted.
 */
async function zvzDue(deps) {
  const { store, discord, premium } = deps;
  const started = Date.now();
  const now = deps.now();
  const result = { hooks: 0, posted: 0, notPremium: 0 };
  if (!discord || !premium) return ok(result);
  // per run: one fight list per guild and one report per fight, however many players get it
  const run = { now, started, lists: new Map(), reports: new Map() };
  for (const hook of await store.zvzWebhooks()) {
    if (Date.now() - started > ZVZ_BUDGET_MS) break;
    // premium ended: nothing is posted, the setting stays for when it comes back
    if (!(await premium(hook.user_id))) {
      result.notPremium++;
      continue;
    }
    const row = await store.getMark(hook.user_id, hook.region);
    if (!row) continue;
    const guild = { ...guildRef(row), allianceTag: row.alliance_tag ?? null };
    result.hooks++;
    try {
      result.posted += await postZvz(deps, hook, guild, run);
    } catch (error) {
      console.error("zvz report failed", guild.id, error);
    }
  }
  return ok(result);
}

function cached(map, key, load) {
  if (!map.has(key)) map.set(key, load());
  return map.get(key);
}

async function postZvz(deps, hook, guild, run) {
  const { store, discord } = deps;
  const after = Math.max(Date.parse(hook.zvz_after ?? "") || 0, run.now.getTime() - ZVZ_LOOKBACK_MS);
  const list = await cached(run.lists, `${guild.region}:${guild.id}`, () => deps.gameinfo.getBattles(guild.region, guild.id, 0));
  const fights = list
    .filter((b) => Date.parse(b.startTime) > after && b.players >= ZVZ_MIN_PLAYERS && b.ours.length >= ZVZ_MIN_OURS)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, ZVZ_PER_HOOK);
  let sent = 0;
  for (const fight of fights) {
    if (Date.now() - run.started > ZVZ_BUDGET_MS) break;
    const answer = await cached(run.reports, `${guild.region}:${fight.id}`, () => getBattleReport(deps, { region: guild.region, id: String(fight.id) }));
    // the killboard is not answering: this fight and the later ones wait for the next run
    if (answer.status !== 200) break;
    const ago = run.now.getTime() - Date.parse(answer.body.battle.endTime);
    if (ago < ZVZ_QUIET_MS || (!answer.body.complete && ago < ZVZ_GIVE_UP_MS)) break;
    const outcome = await discord.post(hook.url, zvzReport(guild, answer.body));
    if (outcome === "gone") {
      await store.removeWebhook(hook.user_id, hook.region);
      break;
    }
    if (outcome !== "ok") break;
    await store.setZvzAfter(hook.user_id, hook.region, fight.startTime);
    sent++;
  }
  return sent;
}

/** Turns the ZvZ report on (premium only; greets the channel) or off. */
async function setZvz(deps, user, body) {
  const { store, discord } = deps;
  const region = String(body?.region ?? "");
  const on = body?.on === true;
  const hook = await store.getWebhook(user.id, region);
  if (!hook) return fail(409, "Connect a Discord webhook first.");
  if (on && !(deps.premium && (await deps.premium(user.id)))) return fail(403, "The ZvZ report is part of Premium.");
  if (on && !hook.zvz) {
    const guild = await store.getMark(user.id, region);
    if (!guild) return fail(409, "Mark your guild first: the report is about the guild you marked.");
    const hello = await discord.post(hook.url, zvzHello(guild));
    if (hello === "gone") {
      await store.removeWebhook(user.id, region);
      return fail(410, "Discord deleted this webhook. Connect it again.");
    }
    if (hello !== "ok") return fail(502, "Discord did not take the message. Try again in a minute.");
  }
  // from now on: the fights before turning it on are not posted
  const after = on ? (hook.zvz ? hook.zvz_after : deps.now().toISOString()) : null;
  await store.setZvz(user.id, region, on, after);
  return ok({ hook: hookView({ ...hook, zvz: on }) });
}

/** Sets the player's Discord webhook: checked with Discord, then greeted. Only its name goes back. */
async function saveHook(deps, user, body) {
  const { store, discord } = deps;
  const url = String(body?.url ?? "").trim();
  const region = String(body?.region ?? "");
  if (!isRegion(region)) return fail(400, "Unknown server.");
  if (!isWebhookUrl(url)) return fail(400, "Paste a Discord webhook link: Server settings → Integrations → Webhooks → Copy Webhook URL.");
  const guild = await store.getMark(user.id, region);
  if (!guild) return fail(409, "Mark your guild first: the report is about the guild you marked.");
  const name = await discord.check(url);
  if (!name) return fail(400, "Discord does not know this webhook. Copy its link again.");
  const hello = await discord.post(url, helloMessage(guild));
  if (hello !== "ok") return fail(502, "Discord did not take the first message. Try again in a minute.");
  await store.saveWebhook(user.id, region, url, name);
  return ok({ hook: hookView((await store.getWebhook(user.id, region)) ?? { name }) });
}

/**
 * For the daily health check: can this server reach both killboards (a block of its address shows
 * nowhere else), and how many marked guilds the daily sync has missed.
 */
async function getStatus({ gameinfo, store, now }) {
  const [eu, us] = await Promise.all([gameinfo.probeKillboard("eu"), gameinfo.probeKillboard("us")]);
  let lateSyncs = null;
  if (store) {
    try {
      lateSyncs = (await store.dueGuilds(new Date(now().getTime() - SYNC_LATE_MS).toISOString(), 100)).length;
    } catch {
      // the database is down: null tells the check so
    }
  }
  return ok({ killboard: { eu, us }, lateSyncs }, STATUS_CACHE_S);
}

const GET_ACTIONS = new Set(["search", "top", "guild", "killboard", "battle", "fights", "mine", "hook", "sync", "sync-retry", "zvz", "pro-fights", "fights-history", "status", "regear-paid", "regear-fights", "bank", "splits"]);
const POST_ACTIONS = new Set(["mark", "unmark", "hook-save", "hook-remove", "hook-zvz", "regear-pay", "regear-mark", "bank-save", "split-save", "split-remove"]);
const PUBLIC_ACTIONS = new Set(["search", "top", "guild", "killboard", "battle", "fights"]);
/** The player's own data: only the database, never the killboard. */
const PRIVATE_ACTIONS = new Set(["regear-paid", "regear-pay", "regear-fights", "regear-mark", "bank", "bank-save", "splits", "split-save", "split-remove"]);
const SIGN_IN = {
  hook: "Sign in to set up the Discord report.",
  "fights-history": "Sign in to see attendance over 30 and 90 days.",
  regear: "Sign in to tick deaths as paid.",
  "regear-fights": "Sign in to mark fights to regear.",
  "regear-mark": "Sign in to mark fights to regear.",
  bank: "Sign in to keep the chest log.",
  split: "Sign in to save loot splits.",
  splits: "Sign in to save loot splits."
};

export async function handleGuild(action, request, deps) {
  const { method, query = {}, body, token, authorization, client } = request;
  if (!GET_ACTIONS.has(action) && !POST_ACTIONS.has(action)) return fail(404, "Unknown guild action.");
  if (method !== (POST_ACTIONS.has(action) ? "POST" : "GET")) return fail(405, "Method not allowed");
  const region = String(query.region ?? "").toLowerCase();
  // every action that can reach Albion's killboard is limited per visitor (ticking paid in a big
  // regear is many quick clicks, and reaches the database only)
  if (action !== "sync" && action !== "sync-retry" && action !== "zvz" && action !== "pro-fights" && !PRIVATE_ACTIONS.has(action) && deps.limiter && !deps.limiter.take(client)) return fail(429, "Too many requests. Wait a minute and try again.");
  try {
    if (action === "sync") {
      if (!deps.cronSecret || authorization !== `Bearer ${deps.cronSecret}`) return fail(401, "Unauthorized");
      if (!deps.store) return fail(503, "Guild tracking is not set up.");
      return await syncDue(deps);
    }
    if (action === "zvz") {
      if (!deps.actionsSecret || authorization !== `Bearer ${deps.actionsSecret}`) return fail(401, "Unauthorized");
      if (!deps.store) return fail(503, "Guild tracking is not set up.");
      return await zvzDue(deps);
    }
    if (action === "sync-retry") {
      if (!deps.actionsSecret || authorization !== `Bearer ${deps.actionsSecret}`) return fail(401, "Unauthorized");
      if (!deps.store) return fail(503, "Guild tracking is not set up.");
      return await syncRetry(deps);
    }
    if (action === "pro-fights") {
      if (!deps.actionsSecret || authorization !== `Bearer ${deps.actionsSecret}`) return fail(401, "Unauthorized");
      if (!deps.store) return fail(503, "Guild tracking is not set up.");
      return await proFightsDue(deps);
    }
    if (action === "status") return await getStatus(deps);
    if (PUBLIC_ACTIONS.has(action)) {
      if (!isRegion(region)) return fail(400, "Unknown server.");
      if (action === "guild") return await getGuildPage(deps, { region, slug: String(query.slug ?? ""), id: String(query.id ?? "") });
      if (action === "killboard") return await getKillboard(deps, { region, id: String(query.id ?? "") });
      if (action === "battle") return await getBattleReport(deps, { region, id: String(query.id ?? "") });
      if (action === "fights") return await getFights(deps, { region, id: String(query.id ?? "") });
      if (action === "top") {
        const range = String(query.range ?? "");
        if (!TOP_RANGES.includes(range)) return fail(400, "Unknown time range.");
        const guilds = withSlugs((await deps.gameinfo.getTopGuilds(region, range)).slice(0, TOP_SHOWN));
        return ok({ range, guilds }, TOP_CACHE_S);
      }
      const q = normalizeQuery(query.q);
      if (q.length < 2 || q.length > 40) return fail(400, "Type at least 2 letters of the guild name.");
      const hits = withSlugs(rankGuilds(await deps.gameinfo.searchGuilds(region, q), q).slice(0, SEARCH_SHOWN));
      const withKnownFame = await withFame(deps.gameinfo, region, hits);
      const guilds = rankByFame(withKnownFame, q);
      // a looked-up hit without its fame is not kept for long: the next search fills it in
      return ok({ guilds }, withKnownFame.some((g) => g.killFame === null) ? 60 : SEARCH_CACHE_S);
    }
    // mine, mark, unmark, hook: the signed-in player
    const user = token ? await deps.userFromToken(token) : null;
    if (action === "mine") {
      const rows = user && deps.store ? await deps.store.getMarks(user.id) : [];
      // oldest mark first: the first of a server is the main one (its Discord report); Europe first
      const seen = new Set();
      const guilds = rows.map((g) => ({ ...guildRef(g), main: !seen.has(g.region) && Boolean(seen.add(g.region)) }));
      return ok({ guilds: guilds.sort((a, b) => a.region.localeCompare(b.region)) });
    }
    if (!user) return fail(401, SIGN_IN[action] ?? SIGN_IN[action.split("-")[0]] ?? "Sign in to mark a guild.");
    if (!deps.store) return fail(503, "Guild tracking is not set up yet.");
    // writes per player: a script cannot fill the database, nor use the webhook check to post to channels
    if (POST_ACTIONS.has(action) && deps.writeLimiter && !deps.writeLimiter.take(user.id)) return fail(429, "Too many changes at once. Wait a minute and try again.");
    // both post to the channel (the first message, the ZvZ greeting): not a way to spam it
    if ((action === "hook-save" || action === "hook-zvz") && deps.hookLimiter && !deps.hookLimiter.take(user.id)) return fail(429, "Too many webhooks tried. Wait a few minutes and try again.");
    if (PRIVATE_ACTIONS.has(action)) return await handlePrivate(action, { query, body }, deps, user);
    if (action === "fights-history") return await getFightHistory(deps, user, query);
    if (action === "mark") return await mark(deps, user, body);
    // unmark and the webhook are per server: one marked guild on each
    const server = String((action === "hook" ? query.region : body?.region) ?? "");
    if (!isRegion(server)) return fail(400, "Unknown server.");
    if (action === "unmark") {
      // with Guild Pro a server can have several: the one to remove (without: the main one)
      const guildId = body?.id == null ? null : String(body.id);
      if (guildId !== null && !isGuildId(guildId)) return fail(400, "Pick a guild first.");
      return ok({ unmarked: Boolean(await deps.store.removeMark(user.id, server, guildId)) });
    }
    if (action === "hook") {
      const hook = await deps.store.getWebhook(user.id, server);
      return ok({ hook: hook ? hookView(hook) : null });
    }
    if (!deps.discord) return fail(503, "The Discord report is not set up yet.");
    if (action === "hook-save") return await saveHook(deps, user, body);
    if (action === "hook-zvz") return await setZvz(deps, user, body);
    return ok({ removed: await deps.store.removeWebhook(user.id, server) });
  } catch (error) {
    if (error instanceof GameinfoError) {
      // the cause goes to the server log: a 502 alone does not tell a slow killboard from a block
      if (error.status !== 404) console.warn("guild api", action, error.message);
      if (error.status !== 404 && PUBLIC_ACTIONS.has(action) && isRegion(region)) return killboardDown(error.status, region);
      return fail(error.status, error.status === 404 ? NOT_FOUND : "Albion's killboard is not answering right now. Try again in a minute.");
    }
    console.error("guild api", action, error);
    return fail(500, "Something went wrong. Try again in a minute.");
  }
}
