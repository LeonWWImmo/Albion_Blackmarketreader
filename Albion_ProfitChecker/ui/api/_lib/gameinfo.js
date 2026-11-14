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

/** The guild's latest kills (Albion's guild feed has kills only, no deaths). */
export async function getGuildKills(region, id) {
  return remembered(`kills:${region}:${id}`, async () => parseEvents(await fetchJson(`${HOSTS[region]}/events?limit=51&offset=0&guildId=${id}`)));
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

/** The guild's most recent fights, newest first (one page of 50). */
export async function getBattles(region, id, offset = 0) {
  return remembered(`battles:${region}:${id}:${offset}`, async () =>
    parseBattles(await fetchJson(`${HOSTS[region]}/battles?limit=50&offset=${offset}&sort=recent&guildId=${id}`), id)
  );
}
