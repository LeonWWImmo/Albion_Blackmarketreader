/** [quality, blackMarketOrder, cityBuyOrder, buyCity, citySellOrder, sellCity] from /api/aodp/prices. */
export type PriceRow = [number, number, number, string, number, string];
export type PriceTable = Record<string, PriceRow[]>;

export type Route = "bm" | "buy" | "sell";
export type SellMode = "fast" | "max";

export type Sale = { route: Route; unit: number; city: string };

export const ROUTE_LABEL: Record<Route, string> = { bm: "Black Market", buy: "Quick sell", sell: "Sell order" };

export const SETUP_FEE = 0.025;
export const salesTax = (premium: boolean) => (premium ? 0.04 : 0.08);

/** The item id the market knows: the name's id plus "@n" for the enchantment. */
export function itemId(names: Record<string, string>, name: string, enchant: number): string | null {
  const base = names[name];
  if (!base) return null;
  return base.includes("@") || enchant === 0 ? base : `${base}@${enchant}`;
}

/**
 * The silver one item brings in after tax (and setup fee for a sell order).
 * Buy orders take an item of their quality or better; a sell order lists at the item's own quality
 * (or the next lower one with a price, to stay on the safe side).
 * fast: only instant sales (Black Market or a city buy order); max: the sell order counts too.
 */
export function bestSale(rows: PriceRow[] | undefined, quality: number, premium: boolean, mode: SellMode): Sale | null {
  if (!rows?.length) return null;
  const keep = 1 - salesTax(premium);
  const options: Sale[] = [];
  let bm = 0;
  let buy = 0;
  let buyCity = "";
  for (const [q, bmPrice, buyPrice, city] of rows) {
    if (q > quality) continue;
    bm = Math.max(bm, bmPrice);
    if (buyPrice > buy) [buy, buyCity] = [buyPrice, city];
  }
  if (bm) options.push({ route: "bm", unit: bm * keep, city: "Black Market" });
  if (buy) options.push({ route: "buy", unit: buy * keep, city: buyCity });
  if (mode === "max") {
    const listed = [...rows].reverse().find(([q, , , , sell]) => q <= quality && sell > 0);
    if (listed) options.push({ route: "sell", unit: listed[4] * (keep - SETUP_FEE), city: listed[5] });
  }
  return options.reduce<Sale | null>((best, o) => (!best || o.unit > best.unit ? o : best), null);
}

export type PayoutInput = {
  total: number;
  repair: number;
  guildPct: number;
  players: { name: string; share: number }[];
};

/** Repairs first, then the guild's cut, the rest by share (100 = a full share). */
export function payouts({ total, repair, guildPct, players }: PayoutInput) {
  const afterRepair = Math.max(0, total - Math.max(0, repair));
  const guild = afterRepair * Math.min(100, Math.max(0, guildPct)) / 100;
  const pool = afterRepair - guild;
  const shares = players.reduce((sum, p) => sum + Math.max(0, p.share), 0);
  return {
    guild,
    pool,
    players: players.map((p) => ({ name: p.name, share: p.share, silver: shares ? (pool * Math.max(0, p.share)) / shares : 0 }))
  };
}

/** 12345678 -> "12.3m", 45600 -> "45.6k". */
export function shortSilver(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}m`;
  if (abs >= 1e4) return `${(value / 1e3).toFixed(0)}k`;
  return Math.round(value).toLocaleString("de-DE");
}
