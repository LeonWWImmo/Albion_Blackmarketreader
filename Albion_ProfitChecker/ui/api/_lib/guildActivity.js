// The guild Activity tool's logic, free of I/O: what a daily sync writes, and how the stored
// snapshots turn into "who plays, who went quiet, who left". api/_lib/guildSync.js and
// api/_lib/guildApi.js do the reading and writing around it.

const DAY_MS = 864e5;
/** Days without any sign of play before a member counts as quiet / inactive. */
export const QUIET_AFTER_DAYS = 3;
export const INACTIVE_AFTER_DAYS = 14;
/** Daily gains shown per member, newest last. */
export const SPARK_DAYS = 14;
export const PERIODS = [7, 30];

/** "2026-11-14" for a Date, in UTC like Albion's own server day. */
export const dayOf = (date) => new Date(date).toISOString().slice(0, 10);
export const addDays = (day, n) => dayOf(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const laterDay = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

/** "Angry fuzzies" -> "angry-fuzzies"; the URL part of a guild page. */
export function slugify(name) {
  const slug = String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "guild";
}

/** Every kind of fame Albion counts, with the snapshot column it is stored in. */
export const KINDS = [
  ["pve", "pve"],
  ["pvp", "kill_fame"],
  ["gathering", "gathering"],
  ["crafting", "crafting"],
  ["fishing", "fishing"],
  ["farming", "farming"],
  ["crystal", "crystal"]
];
/** Dying grows death fame: a sign of play, though not fame of one's own. */
const PLAY_FIELDS = [...KINDS.map(([, column]) => column), "death_fame"];
/** A value a snapshot really has: rows from before a kind was counted have it empty (null). */
const known = (value) => value !== null && value !== undefined;

/** Fame grew between two snapshots, in any kind both of them counted. */
const grewBetween = (now, then) => PLAY_FIELDS.some((field) => known(now?.[field]) && known(then?.[field]) && Number(now[field]) > Number(then[field]));

/** A snapshot row as { pve, pvp, ..., total } (total: every kind of fame, death fame not included). */
export function fameOf(row) {
  const fame = { total: 0 };
  for (const [kind, column] of KINDS) {
    fame[kind] = Number(row?.[column] ?? 0);
    fame.total += fame[kind];
  }
  return fame;
}

/**
 * The fame gained from `then` to `now` per kind; a kind one of them did not count yet is null, not
 * "everything since 0". total: the kinds both counted.
 */
export function fameGain(now, then) {
  const gain = { total: 0 };
  for (const [kind, column] of KINDS) {
    gain[kind] = known(now?.[column]) && known(then?.[column]) ? Math.max(0, Number(now[column]) - Number(then[column])) : null;
    gain.total += gain[kind] ?? 0;
  }
  return gain;
}

/** A member from the killboard as a snapshot row. */
export const snapshotOf = (guildId, member, day) => ({
  guild_id: guildId,
  player_id: member.id,
  day,
  pve: member.pve,
  kill_fame: member.killFame,
  death_fame: member.deathFame,
  gathering: member.gathering,
  crafting: member.crafting,
  fishing: member.fishing ?? 0,
  farming: member.farming ?? 0,
  crystal: member.crystal ?? 0
});

/**
 * What one sync writes.
 * members: today's roster (gameinfo.parseMembers); battles: recent fights (gameinfo.parseBattles);
 * players: the stored guild_players rows; before: each player's latest snapshot from an earlier day.
 */
export function planSync({ guildId, members, battles, players, before, today }) {
  const known = new Map(players.map((p) => [p.player_id, p]));
  const lastFight = new Map();
  for (const battle of battles) {
    for (const p of battle.ours) if (!lastFight.has(p.id) || battle.startTime > lastFight.get(p.id)) lastFight.set(p.id, battle.startTime);
  }
  const inGuild = new Set();
  const playerRows = members.map((member) => {
    inGuild.add(member.id);
    const prev = known.get(member.id);
    const stillHere = prev && !prev.left_on;
    const snapshot = snapshotOf(guildId, member, today);
    const grew = before.has(member.id) && grewBetween(snapshot, before.get(member.id));
    const fight = lastFight.get(member.id) ?? null;
    return {
      guild_id: guildId,
      player_id: member.id,
      name: member.name,
      joined_on: stillHere ? prev.joined_on : today,
      left_on: null,
      last_gain_on: grew ? today : (prev?.last_gain_on ?? null),
      stats_at: member.statsAt ?? prev?.stats_at ?? null,
      last_fight_at: fight && (!prev?.last_fight_at || fight > prev.last_fight_at) ? fight : (prev?.last_fight_at ?? null)
    };
  });
  for (const prev of players) {
    if (!inGuild.has(prev.player_id) && !prev.left_on) playerRows.push({ ...prev, left_on: today });
  }
  return { players: playerRows, snapshots: members.map((member) => snapshotOf(guildId, member, today)) };
}

/** The last day a player showed any sign of play: fame grew, Albion refreshed their stats, or a fight. */
export function lastActiveDay(player) {
  let day = player.last_gain_on ?? null;
  if (player.stats_at) day = laterDay(day, dayOf(player.stats_at));
  if (player.last_fight_at) day = laterDay(day, dayOf(player.last_fight_at));
  return day;
}

export function statusOf(lastActive, today) {
  if (!lastActive) return "unknown";
  const days = daysBetween(lastActive, today);
  return days < QUIET_AFTER_DAYS ? "active" : days < INACTIVE_AFTER_DAYS ? "quiet" : "inactive";
}

/** The kind of fame a member earned most of in total ("pve", "gathering", ...), or null without any. */
export function mainKind(totals) {
  if (!totals?.total) return null;
  let best = null;
  for (const [kind] of KINDS) if (!best || totals[kind] > totals[best]) best = kind;
  return best;
}

/**
 * The Activity tab: per current member the fame gained in each period of PERIODS (every kind and
 * their sum, null without two snapshots), the daily gains of the last SPARK_DAYS days, their total
 * fame, main kind and status; plus who joined and who left within the longest period.
 * snapshots: rows of the longest period and some days before it. trackedSince: null when the guild
 * is not tracked (no gains then, the status comes from Albion's stats time and fights).
 */
export function buildActivity({ players, snapshots, today, trackedSince }) {
  const byPlayer = new Map();
  for (const row of snapshots) {
    // snapshots from an earlier, ended tracking would make a gain span a gap
    if (trackedSince && row.day < trackedSince) continue;
    if (!byPlayer.has(row.player_id)) byPlayer.set(row.player_id, new Map());
    byPlayer.get(row.player_id).set(row.day, row);
  }
  const longest = Math.max(...PERIODS);
  const since = addDays(today, -longest);
  const trackedDays = trackedSince ? Math.max(0, daysBetween(trackedSince, today)) : 0;
  const members = players
    .filter((p) => !p.left_on)
    .map((p) => {
      const days = byPlayer.get(p.player_id) ?? new Map();
      const sorted = [...days.keys()].sort();
      const latest = days.get(sorted.at(-1));
      const gains = {};
      for (const period of PERIODS) {
        // the snapshot from the start of the period, or the first one if tracking began later
        const start = addDays(today, -period);
        const base = days.get([...sorted].reverse().find((d) => d <= start) ?? sorted[0]);
        if (!latest || !base || latest === base) {
          gains[period] = null;
          continue;
        }
        gains[period] = fameGain(latest, base);
      }
      const spark = Array.from({ length: SPARK_DAYS }, (_, i) => {
        const day = addDays(today, i - SPARK_DAYS + 1);
        const now = days.get(day);
        const prev = days.get(addDays(day, -1));
        return now && prev ? fameGain(now, prev).total : null;
      });
      const totals = latest ? fameOf(latest) : null;
      const lastActive = lastActiveDay(p);
      return {
        id: p.player_id,
        name: p.name,
        status: statusOf(lastActive, today),
        lastActive,
        lastFightAt: p.last_fight_at ?? null,
        joinedOn: p.joined_on ?? null,
        // joined after tracking started (the first snapshot lists everyone who was there already)
        isNew: Boolean(trackedSince && p.joined_on && p.joined_on > trackedSince && p.joined_on >= since),
        gains,
        totals,
        main: mainKind(totals),
        spark
      };
    })
    .sort(
      (a, b) =>
        (b.gains[PERIODS[0]]?.total ?? -1) - (a.gains[PERIODS[0]]?.total ?? -1) ||
        (b.totals?.total ?? 0) - (a.totals?.total ?? 0) ||
        a.name.localeCompare(b.name)
    );
  const left = players
    .filter((p) => p.left_on && p.left_on >= since)
    .map((p) => ({ id: p.player_id, name: p.name, leftOn: p.left_on }))
    .sort((a, b) => b.leftOn.localeCompare(a.leftOn));
  const counts = { active: 0, quiet: 0, inactive: 0, unknown: 0 };
  for (const m of members) counts[m.status]++;
  return {
    // gains cover fewer days while tracking is younger than a period
    coveredDays: Object.fromEntries(PERIODS.map((period) => [period, Math.min(period, trackedDays)])),
    counts,
    members,
    left
  };
}

/** The live roster and recent fights as player rows, for a guild that is not tracked yet. */
export function playersFromMembers(guildId, members, battles) {
  return planSync({ guildId, members, battles, players: [], before: new Map(), today: null }).players.map((p) => ({ ...p, joined_on: null }));
}
