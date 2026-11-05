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

/** Entries grouped into trips by the pauses between them, oldest trip first. */
export function groupTrips(entries: LogEntry[]): Trip[] {
  const sorted = [...entries].sort((a, b) => (a.time || 0) - (b.time || 0));
  const trips: Trip[] = [];
  for (const entry of sorted) {
    const last = trips[trips.length - 1];
    if (last && (!Number.isFinite(entry.time) || !Number.isFinite(last.end) || entry.time - last.end <= TRIP_GAP_MS)) {
      last.entries.push(entry);
      if (Number.isFinite(entry.time)) last.end = entry.time;
      if (!last.players.includes(entry.player)) last.players.push(entry.player);
    } else {
      trips.push({ id: `t${trips.length}`, start: entry.time, end: entry.time, players: [entry.player], entries: [entry] });
    }
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
