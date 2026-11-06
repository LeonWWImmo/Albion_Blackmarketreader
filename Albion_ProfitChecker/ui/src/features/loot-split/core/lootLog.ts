/**
 * The guild chest log as Albion copies it (Chest -> Log -> Copy): tab separated, quoted cells,
 *   "Date"  "Player"  "Item"  "Enchantment"  "Quality"  "Amount"
 *   "11/01/2026 20:25:57"  "Yukina3"  "Expert's Crossbow"  "1"  "1"  "1"
 * A negative amount means the item was taken out.
 */
export type LogEntry = {
  time: number;
  player: string;
  name: string;
  enchant: number;
  quality: number;
  amount: number;
};

export type Trip = {
  id: string;
  start: number;
  end: number;
  players: string[];
  entries: LogEntry[];
};

/** A pause longer than this starts a new trip. */
const TRIP_GAP_MS = 45 * 60 * 1000;

const cell = (value: string) => value.trim().replace(/^"(.*)"$/, "$1").trim();

/** "11/01/2026 20:25:57" (game, US), "01.11.2026 20:25:57" or ISO; NaN when unknown. */
export function parseLogDate(text: string): number {
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const eu = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (us) return Date.UTC(+us[3], +us[1] - 1, +us[2], +us[4], +us[5], +(us[6] ?? 0));
  if (eu) return Date.UTC(+eu[3], +eu[2] - 1, +eu[1], +eu[4], +eu[5], +(eu[6] ?? 0));
  // ISO without an offset is the game's wall clock too, so read it as UTC like the rows above
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) return Date.parse(`${text.replace(" ", "T")}Z`);
  return Date.parse(text);
}

export function parseLootLog(text: string): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = (line.includes("\t") ? line.split("\t") : line.split(/","|";"/)).map(cell);
    if (cells.length < 6) continue;
    const [date, player, name, enchant, quality, amount] = cells;
    const n = Number(amount);
    if (!player || !name || !Number.isInteger(n) || n === 0) continue;
    entries.push({
      time: parseLogDate(date),
      player,
      name,
      enchant: Math.min(4, Math.max(0, Number(enchant) || 0)),
      quality: Math.min(5, Math.max(1, Number(quality) || 1)),
      amount: n
    });
  }
  return entries;
}

const rowKey = (e: LogEntry) => `${e.time}|${e.player}|${e.name}|${e.enchant}|${e.quality}|${e.amount}`;

/**
 * A second log on top of the first. Rows the first already has are skipped once each, so pasting
 * the same chest again (or a later copy that overlaps) counts nothing twice.
 */
export function mergeLogs(current: LogEntry[], extra: LogEntry[]): { entries: LogEntry[]; added: LogEntry[] } {
  const seen = new Map<string, number>();
  for (const e of current) seen.set(rowKey(e), (seen.get(rowKey(e)) ?? 0) + 1);
  const added = extra.filter((e) => {
    const left = seen.get(rowKey(e)) ?? 0;
    if (left) seen.set(rowKey(e), left - 1);
    return !left;
  });
  return { entries: [...current, ...added], added };
}

/**
 * Entries grouped into trips by the pauses between them, oldest trip first. Rows without a readable
 * time (a shared link, an unknown date format) form one last trip of their own with a NaN start.
 */
export function groupTrips(entries: LogEntry[]): Trip[] {
  const timed = entries.filter((e) => Number.isFinite(e.time)).sort((a, b) => a.time - b.time);
  const untimed = entries.filter((e) => !Number.isFinite(e.time));
  const trips: Trip[] = [];
  for (const entry of timed) {
    const last = trips[trips.length - 1];
    if (last && entry.time - last.end <= TRIP_GAP_MS) {
      last.entries.push(entry);
      last.end = entry.time;
      if (!last.players.includes(entry.player)) last.players.push(entry.player);
    } else {
      trips.push({ id: `t${trips.length}`, start: entry.time, end: entry.time, players: [entry.player], entries: [entry] });
    }
  }
  if (untimed.length) {
    trips.push({ id: `t${trips.length}`, start: NaN, end: NaN, players: [...new Set(untimed.map((e) => e.player))], entries: untimed });
  }
  return trips;
}

export type Stack = {
  key: string;
  name: string;
  enchant: number;
  quality: number;
  amount: number;
};

/** What is left in the chest from these entries: deposits minus withdrawals, per item. */
export function netStacks(entries: LogEntry[]): { stacks: Stack[]; takenOut: number } {
  const byKey = new Map<string, Stack>();
  let takenOut = 0;
  for (const e of entries) {
    if (e.amount < 0) takenOut += -e.amount;
    const key = `${e.name}|${e.enchant}|${e.quality}`;
    const stack = byKey.get(key) ?? { key, name: e.name, enchant: e.enchant, quality: e.quality, amount: 0 };
    stack.amount += e.amount;
    byKey.set(key, stack);
  }
  return { stacks: [...byKey.values()].filter((s) => s.amount > 0), takenOut };
}
