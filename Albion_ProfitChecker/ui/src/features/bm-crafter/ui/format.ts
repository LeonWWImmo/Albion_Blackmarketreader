import { parseEnchant, parseTier } from "../domain";

export function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return Math.round(value).toLocaleString("de-DE");
}

export function formatPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}%`;
}

export function tierLabel(itemId: string): string {
  const tier = parseTier(itemId);
  const enchant = parseEnchant(itemId);
  if (!tier) return "--";
  return `T${tier}.${enchant}`;
}

/**
 * A Black Market price ten times the craft cost or more is almost always a stale or troll
 * order rather than a real deal. Such rows are greyed out and carry a warning.
 */
export function isSuspectPrice(bmPrice: number | null | undefined, craftCost: number): boolean {
  return typeof bmPrice === "number" && craftCost > 0 && bmPrice >= 10 * craftCost;
}
