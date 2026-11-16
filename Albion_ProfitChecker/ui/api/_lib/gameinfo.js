// Albion's own killboard API ("gameinfo"): guilds, their members and their fights. Public, no key.
// It sends no CORS header for our site, so the browser reaches it through api/guild.js.
// Answers are remembered per warm function instance, the same way api/_lib/aodp.js does it.

const HOSTS = { eu: "https://gameinfo-ams.albiononline.com/api/gameinfo", us: "https://gameinfo.albiononline.com/api/gameinfo" };
const USER_AGENT = "BlackmarketReader/1.0 (+https://blackmarketreader.com)";
const REQUEST_TIMEOUT_MS = 8000;
const ATTEMPTS = 2;
const RETRY_PAUSE_MS = 700;
const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
const GUILD_ID = /^[A-Za-z0-9_-]{10,40}$/;

const memory = new Map();
const pending = new Map();

export const isRegion = (value) => Object.prototype.hasOwnProperty.call(HOSTS, value);
export const isGuildId = (value) => typeof value === "string" && GUILD_ID.test(value);

/** For tests: forget every remembered answer. */
export function clearGameinfoMemory() {
  memory.clear();
  pending.clear();
}

/** A gameinfo error the caller can show: `status` is what our API answers. */
export class GameinfoError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function fetchJson(url) {
  let last = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (res.status === 404) throw new GameinfoError("not found", 404);
      if (res.ok) return await res.json();
      last = new GameinfoError(`Albion's killboard answered ${res.status}`, 502);
      // Cloudflare in front of the killboard blocks this server's address: asking again only makes it worse
      if (res.status === 403) break;
    } catch (error) {
      if (error instanceof GameinfoError && error.status === 404) throw error;
      last = error instanceof GameinfoError ? error : new GameinfoError("Albion's killboard did not answer", 502);
    }
    if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
  }
  throw last;
}

/** One request per key at a time, and its answer kept for CACHE_MS; `fresh` skips the kept one. */
async function remembered(key, load, fresh = false) {
  const hit = memory.get(key);
  if (!fresh && hit && hit.until > Date.now()) return hit.value;
  if (pending.has(key)) return pending.get(key);
  const call = load().finally(() => pending.delete(key));
  pending.set(key, call);
  const value = await call;
  memory.delete(key);
  memory.set(key, { until: Date.now() + CACHE_MS, value });
  while (memory.size > CACHE_MAX) memory.delete(memory.keys().next().value);
  return value;
}

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** Search results: the guilds whose name matches. */
export function parseSearch(raw) {
  return (raw?.guilds ?? [])
    .filter((g) => isGuildId(g?.Id) && typeof g?.Name === "string")
    .map((g) => ({ id: g.Id, name: g.Name, allianceName: g.AllianceName || null, killFame: num(g.KillFame), deathFame: num(g.DeathFame) }));
}

export function parseGuild(raw) {
  const g = raw?.guild;
  if (!isGuildId(g?.Id)) throw new GameinfoError("unexpected answer from Albion's killboard", 502);
  return {
    id: g.Id,
    name: String(g.Name ?? ""),
    allianceTag: g.AllianceTag || null,
    foundedAt: g.Founded || null,
    killFame: num(g.killFame ?? g.KillFame),
    deathFame: num(g.DeathFame)
  };
}

/** Members with their lifetime fame; Albion refreshes `statsAt` only for players who were active. */
export function parseMembers(raw) {
  if (!Array.isArray(raw)) throw new GameinfoError("unexpected answer from Albion's killboard", 502);
  return raw
    .filter((m) => typeof m?.Id === "string" && typeof m?.Name === "string")
    .map((m) => {
      const stats = m.LifetimeStatistics ?? {};
      const pve = stats.PvE ?? {};
      const gathered = stats.Gathering ?? {};
      return {
        id: m.Id,
        name: m.Name,
        pve: num(pve.Total),
        killFame: num(m.KillFame),
        deathFame: num(m.DeathFame),
        gathering: num(gathered.All?.Total),
        crafting: num(stats.Crafting?.Total),
        fishing: num(stats.FishingFame),
        farming: num(stats.FarmingFame),
        crystal: num(stats.CrystalLeague),
        statsAt: stats.Timestamp && !Number.isNaN(Date.parse(stats.Timestamp)) ? stats.Timestamp : null,
        // where the fame came from, for a member's details (lifetime, not stored)
        pveZones: {
          royal: num(pve.Royal),
          outlands: num(pve.Outlands),
          avalon: num(pve.Avalon),
          hellgate: num(pve.Hellgate),
          corrupted: num(pve.CorruptedDungeon),
          mists: num(pve.Mists)
        },
        resources: {
          fiber: num(gathered.Fiber?.Total),
          hide: num(gathered.Hide?.Total),
          ore: num(gathered.Ore?.Total),
          rock: num(gathered.Rock?.Total),
          wood: num(gathered.Wood?.Total)
        }
      };
    });
}

/** Fights the guild took part in, each with only that guild's players. */
export function parseBattles(raw, guildId) {
  if (!Array.isArray(raw)) throw new GameinfoError("unexpected answer from Albion's killboard", 502);
  return raw
    .filter((b) => b && b.startTime && b.players)
    .map((b) => ({
      id: b.id,
      startTime: b.startTime,
      players: Object.keys(b.players).length,
      kills: num(b.totalKills),
      fame: num(b.totalFame),
      ours: Object.values(b.players)
        .filter((p) => p?.guildId === guildId)
        .map((p) => ({ id: p.id, name: p.name, kills: num(p.kills), deaths: num(p.deaths), killFame: num(p.killFame) }))
    }));
}

/** The gear slots the killboard shows, in the order of Albion's own kill screen. */
export const GEAR_SLOTS = ["MainHand", "OffHand", "Head", "Armor", "Shoes", "Cape", "Bag", "Mount", "Potion", "Food"];
/** At most this many stacks of the victim's bag are kept (a full bag has 48). */
const INVENTORY_MAX = 48;

const piece = (item) => ({ type: String(item.Type), quality: num(item.Quality) || 1, count: num(item.Count) || 1 });

function side(raw) {
  const gear = {};
  for (const slot of GEAR_SLOTS) {
    const item = raw?.Equipment?.[slot];
    if (item?.Type) gear[slot] = piece(item);
  }
  return {
    id: String(raw?.Id ?? ""),
    name: String(raw?.Name ?? ""),
    guildId: raw?.GuildId || null,
    guildName: raw?.GuildName || null,
    allianceName: raw?.AllianceName || null,
    itemPower: Math.round(num(raw?.AverageItemPower)),
    gear
  };
}

/** Killboard events cut down to what the guild killboard shows (Albion sends ~14 KB per event). */
export function parseEvents(raw) {
  if (!Array.isArray(raw)) throw new GameinfoError("unexpected answer from Albion's killboard", 502);
  return raw
    .filter((e) => e && e.EventId && e.TimeStamp && e.Killer && e.Victim)
    .map((e) => ({
      id: num(e.EventId),
      time: e.TimeStamp,
      fame: num(e.TotalVictimKillFame),
      participants: num(e.numberOfParticipants) || (Array.isArray(e.Participants) ? e.Participants.length : 0),
      groupSize: num(e.groupMemberCount) || null,
      area: typeof e.KillArea === "string" && e.KillArea ? e.KillArea : null,
      battleId: num(e.BattleId) || null,
      killer: side(e.Killer),
      victim: {
        ...side(e.Victim),
        // what the victim carried and dropped
        inventory: (Array.isArray(e.Victim.Inventory) ? e.Victim.Inventory : []).filter((item) => item?.Type).slice(0, INVENTORY_MAX).map(piece)
      },
      ...helpersOf(e.Participants)
    }));
}

/** Kept per kill; a big fight's other helpers are summed up in `otherHelpers`. */
const HELPERS_MAX = 10;

/** Everyone who hit or healed for a kill, most damage and healing first. */
function helpersOf(participants) {
  const all = (Array.isArray(participants) ? participants : [])
    .filter((p) => p?.Name)
    .map((p) => ({ name: String(p.Name), guildName: p.GuildName || null, itemPower: Math.round(num(p.AverageItemPower)), damage: Math.round(num(p.DamageDone)), heal: Math.round(num(p.SupportHealingDone)) }))
    .sort((a, b) => b.damage + b.heal - (a.damage + a.heal));
  const rest = all.slice(HELPERS_MAX);
  return {
    helpers: all.slice(0, HELPERS_MAX),
    otherHelpers: rest.length ? { count: rest.length, damage: rest.reduce((t, p) => t + p.damage, 0), heal: rest.reduce((t, p) => t + p.heal, 0) } : null
  };
}

/** Albion's own top lists answer empty: the top guilds are summed up from the period's biggest fights. */
export const TOP_RANGES = ["week", "month"];
/** Pages of 51 fights read, biggest first: the ~100 biggest fights of the period. */
const TOP_PAGES = 2;
const TOP_KEPT = 10;

/** Kill fame, kills and deaths per guild over the given fights, most kill fame first. */
export function topGuildsOf(battles) {
  const byGuild = new Map();
  for (const battle of battles) {
    for (const g of Object.values(battle?.guilds ?? {})) {
      if (!isGuildId(g?.id) || typeof g.name !== "string") continue;
      const total = byGuild.get(g.id) ?? { id: g.id, name: g.name, allianceTag: g.alliance || null, killFame: 0, kills: 0, deaths: 0, fights: 0 };
      total.killFame += num(g.killFame);
      total.kills += num(g.kills);
      total.deaths += num(g.deaths);
      total.fights++;
      byGuild.set(g.id, total);
    }
  }
  return [...byGuild.values()].sort((a, b) => b.killFame - a.killFame);
}

/** The guilds with the most kill fame this week (since Monday) or this month (since the 1st), as Albion counts them. */
export async function getTopGuilds(region, range) {
  return remembered(`top:${region}:${range}`, async () => {
    const pages = await Promise.all(
      Array.from({ length: TOP_PAGES }, (_, i) => fetchJson(`${HOSTS[region]}/battles?limit=51&offset=${i * 51}&sort=totalfame&range=${range}`))
    );
    if (!pages.every(Array.isArray)) throw new GameinfoError("unexpected answer from Albion's killboard", 502);
    return topGuildsOf(pages.flat()).slice(0, TOP_KEPT);
  });
}

/** The guild's latest kills (Albion's guild feed has kills only, no deaths). */
export async function getGuildKills(region, id) {
  return remembered(`kills:${region}:${id}`, async () => parseEvents(await fetchJson(`${HOSTS[region]}/events?limit=51&offset=0&guildId=${id}`)));
}

/** A player's latest deaths (Albion keeps the last 10). */
export async function getPlayerDeaths(region, playerId) {
  return remembered(`deaths:${region}:${playerId}`, async () => parseEvents(await fetchJson(`${HOSTS[region]}/players/${playerId}/deaths`)));
}

/** Every kill of one fight, both sides. */
export async function getBattleEvents(region, battleId) {
  return remembered(`battle:${region}:${battleId}`, async () => parseEvents(await fetchJson(`${HOSTS[region]}/events/battle/${battleId}?offset=0&limit=51`)));
}

export async function searchGuilds(region, query) {
  const q = String(query ?? "").trim();
  return remembered(`search:${region}:${q.toLowerCase()}`, async () => parseSearch(await fetchJson(`${HOSTS[region]}/search?q=${encodeURIComponent(q)}`)));
}

export async function getGuild(region, id) {
  return remembered(`guild:${region}:${id}`, async () => parseGuild(await fetchJson(`${HOSTS[region]}/guilds/${id}/data`)));
}

/** `fresh: true` asks Albion again even when an answer is remembered (to double-check an odd one). */
export async function getMembers(region, id, { fresh = false } = {}) {
  return remembered(`members:${region}:${id}`, async () => parseMembers(await fetchJson(`${HOSTS[region]}/guilds/${id}/members`)), fresh);
}

const BATTLE_ID = /^[1-9]\d{0,14}$/;
export const isBattleId = (value) => BATTLE_ID.test(String(value ?? ""));
/** Kills per page of a fight's kill list (Albion's own limit). */
const BATTLE_PAGE = 51;
/** Pages read for one battle report: ~800 kills, more than the biggest fights of a week have. */
export const BATTLE_PAGES_MAX = 16;
/** Pages asked at once: Albion answers 502 when asked for too many. */
const BATTLE_PAGES_AT_ONCE = 4;
/**
 * No new pages are started after this long: a slow killboard (2 tries of 8 s per page) must not run
 * the function past its 60 s. The report is then incomplete.
 */
export const PAGES_BUDGET_MS = 20_000;

/** One fight's totals and every player, guild and alliance in it, as Albion sums them. */
export function parseBattle(raw) {
  if (!raw?.id || !raw.players || !raw.startTime) throw new GameinfoError("unexpected answer from Albion's killboard", 502);
  const totals = (x) => ({ kills: num(x.kills), deaths: num(x.deaths), killFame: num(x.killFame) });
  return {
    id: num(raw.id),
    startTime: raw.startTime,
    endTime: raw.endTime || raw.startTime,
    kills: num(raw.totalKills),
    fame: num(raw.totalFame),
    players: Object.values(raw.players)
      .filter((p) => p?.id && p?.name)
      .map((p) => ({ id: String(p.id), name: String(p.name), guildId: p.guildId || null, guildName: p.guildName || null, allianceId: p.allianceId || null, allianceName: p.allianceName || null, ...totals(p) })),
    guilds: Object.values(raw.guilds ?? {})
      .filter((g) => g?.id && g?.name)
      .map((g) => ({ id: String(g.id), name: String(g.name), allianceName: g.alliance || null, ...totals(g) })),
    alliances: Object.values(raw.alliances ?? {})
      .filter((a) => a?.id && a?.name)
      .map((a) => ({ id: String(a.id), name: String(a.name), ...totals(a) }))
  };
}

const emptyStats = () => ({ damage: 0, assists: 0, healAssists: 0, itemPower: 0, weapon: null });

/**
 * Per player of one page of kills: damage done to the players who died, kills helped with (assists)
 * and kills helped by healing, and the build they were seen in (weapon, item power). Albion's
 * healing number per kill covers the whole time before it, so overlapping kills count it again and
 * again: it is not summed, only whether there was any.
 */
export function fighterStatsOf(rawEvents) {
  const stats = {};
  const seen = (p) => {
    if (!p?.Id) return null;
    const s = (stats[p.Id] ??= emptyStats());
    s.itemPower = Math.max(s.itemPower, Math.round(num(p.AverageItemPower)));
    if (p.Equipment?.MainHand?.Type) s.weapon = { type: String(p.Equipment.MainHand.Type), quality: num(p.Equipment.MainHand.Quality) || 1 };
    return s;
  };
  for (const e of Array.isArray(rawEvents) ? rawEvents : []) {
    seen(e?.Killer);
    seen(e?.Victim);
    for (const p of Array.isArray(e?.Participants) ? e.Participants : []) {
      const s = seen(p);
      if (!s) continue;
      s.damage += Math.round(num(p.DamageDone));
      if (p.Id !== e.Killer?.Id) s.assists++;
      if (num(p.SupportHealingDone) > 0) s.healAssists++;
    }
  }
  return stats;
}

/** Adds one page's fighter stats to the running totals. */
function addStats(total, page) {
  for (const [id, s] of Object.entries(page)) {
    const t = (total[id] ??= emptyStats());
    t.damage += s.damage;
    t.assists += s.assists;
    t.healAssists += s.healAssists;
    t.itemPower = Math.max(t.itemPower, s.itemPower);
    t.weapon = s.weapon ?? t.weapon;
  }
  return total;
}

/**
 * One page of a fight's kills, cut down, with the fighter stats of each kill (by kill id: the pages
 * of a running fight can shift, a kill on two pages must count once). A failed page is not remembered.
 */
function getBattlePage(region, battleId, page) {
  return remembered(`battlepage:${region}:${battleId}:${page}`, async () => {
    const raw = await fetchJson(`${HOSTS[region]}/events/battle/${battleId}?offset=${page * BATTLE_PAGE}&limit=${BATTLE_PAGE}`);
    const statsByKill = {};
    for (const e of Array.isArray(raw) ? raw : []) if (e?.EventId) statsByKill[e.EventId] = fighterStatsOf([e]);
    return { events: parseEvents(raw), statsByKill };
  });
}

/**
 * Everything for a battle report: the fight's totals, every kill and every fighter's damage and
 * healing. `complete` is false when a page of kills did not load or the fight has more than
 * BATTLE_PAGES_MAX pages.
 */
export async function getBattleReport(region, battleId) {
  const started = Date.now();
  const battle = await remembered(`battleinfo:${region}:${battleId}`, async () => parseBattle(await fetchJson(`${HOSTS[region]}/battles/${battleId}`)));
  const wanted = Math.max(1, Math.ceil(battle.kills / BATTLE_PAGE));
  const pages = Math.min(wanted, BATTLE_PAGES_MAX);
  let complete = wanted <= BATTLE_PAGES_MAX;
  const loaded = [];
  for (let first = 0; first < pages; first += BATTLE_PAGES_AT_ONCE) {
    if (Date.now() - started > PAGES_BUDGET_MS) {
      complete = false;
      break;
    }
    const batch = Array.from({ length: Math.min(BATTLE_PAGES_AT_ONCE, pages - first) }, (_, i) =>
      getBattlePage(region, battleId, first + i).catch(() => {
        complete = false;
        return { events: [], statsByKill: {} };
      })
    );
    loaded.push(...(await Promise.all(batch)));
  }
  const events = new Map();
  for (const page of loaded) for (const e of page.events) events.set(e.id, e);
  // a fight a few minutes old may have its kills listed before Albion has them ready
  if (battle.kills > 0 && !events.size) complete = false;
  const stats = {};
  const counted = new Set();
  for (const page of loaded) {
    for (const [killId, perKill] of Object.entries(page.statsByKill)) {
      if (counted.has(killId)) continue;
      counted.add(killId);
      addStats(stats, perKill);
    }
  }
  return { battle, events: [...events.values()], stats, complete };
}

/** The guild's most recent fights, newest first (one page of 50). */
export async function getBattles(region, id, offset = 0) {
  return remembered(`battles:${region}:${id}:${offset}`, async () =>
    parseBattles(await fetchJson(`${HOSTS[region]}/battles?limit=50&offset=${offset}&sort=recent&guildId=${id}`), id)
  );
}
