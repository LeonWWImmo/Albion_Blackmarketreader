/** The royal cities, in the order PriceRow's per-city arrays use. */
export const MARKET_CITIES = ["Caerleon", "Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford"] as const;

/** [quality, blackMarketOrder, cityBuyOrders, citySellOrders] from /api/aodp/prices, one price per city (0 = none). */
export type PriceRow = [number, number, number[], number[]];
export type PriceTable = Record<string, PriceRow[]>;

export type Route = "bm" | "buy" | "sell";
export type SellMode = "fast" | "max";
/** Where to sell: the best market per item, or one market for everything it takes. */
export type Market = "best" | "Black Market" | (typeof MARKET_CITIES)[number];
export const MARKETS: Market[] = ["best", "Black Market", ...MARKET_CITIES];

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
 * Every way to sell one item and the silver each brings in after tax (and setup fee for a sell order).
 * Buy orders take an item of their quality or better; a sell order lists at the item's own quality
 * (or the next lower one with a price, to stay on the safe side).
 */
function saleOptions(rows: PriceRow[], quality: number, premium: boolean, mode: SellMode): Sale[] {
  const keep = 1 - salesTax(premium);
  const options: Sale[] = [];
  let bm = 0;
  const buys = MARKET_CITIES.map(() => 0);
  for (const [q, bmPrice, cityBuys] of rows) {
    if (q > quality) continue;
    bm = Math.max(bm, bmPrice);
    cityBuys.forEach((price, i) => (buys[i] = Math.max(buys[i], price)));
  }
  if (bm) options.push({ route: "bm", unit: bm * keep, city: "Black Market" });
  MARKET_CITIES.forEach((city, i) => {
    if (buys[i]) options.push({ route: "buy", unit: buys[i] * keep, city });
    if (mode !== "max") return;
    const listed = [...rows].reverse().find(([q, , , sells]) => q <= quality && sells[i] > 0);
    if (listed) options.push({ route: "sell", unit: listed[3][i] * (keep - SETUP_FEE), city });
  });
  return options;
}

const richest = (options: Sale[]) => options.reduce<Sale | null>((best, o) => (!best || o.unit > best.unit ? o : best), null);

/**
 * The best sale for one item. fast: only instant sales (Black Market or a city buy order); max: the
 * sell order counts too. A chosen market wins; what it does not take goes to the best other market.
 */
export function bestSale(rows: PriceRow[] | undefined, quality: number, premium: boolean, mode: SellMode, market: Market = "best"): Sale | null {
  if (!rows?.length) return null;
  const options = saleOptions(rows, quality, premium, mode);
  return (market === "best" ? null : richest(options.filter((o) => o.city === market))) ?? richest(options);
}

export type PayoutInput = {
  total: number;
  guildPct: number;
  players: { name: string; share: number; repair?: number }[];
};

/**
 * Each player gets their repairs back first, then the guild takes its cut, the rest goes by share
 * (100 = a full share). Loot worth less than the repairs pays them back pro rata.
 */
export function payouts({ total, guildPct, players }: PayoutInput) {
  const repairs = players.reduce((sum, p) => sum + Math.max(0, p.repair ?? 0), 0);
  const refund = repairs ? Math.min(1, total / repairs) : 0;
  const afterRepair = Math.max(0, total - repairs);
  const guild = (afterRepair * Math.min(100, Math.max(0, guildPct))) / 100;
  const pool = afterRepair - guild;
  const shares = players.reduce((sum, p) => sum + Math.max(0, p.share), 0);
  return {
    guild,
    pool,
    repairs: Math.min(total, repairs),
    players: players.map((p) => {
      const repair = Math.max(0, p.repair ?? 0) * refund;
      return { name: p.name, share: p.share, repair, silver: repair + (shares ? (pool * Math.max(0, p.share)) / shares : 0) };
    })
  };
}

/** "50k" -> 50000, "1.2m" -> 1200000, "75.000" -> 75000; 0 for anything else. */
export function parseSilver(text: string): number {
  const match = text.trim().toLowerCase().replace(/\s/g, "").match(/^([\d.,']+)([kmb]?)$/);
  if (!match) return 0;
  const [, digits, unit] = match;
  const value = unit ? Number(digits.replace(",", ".")) * { k: 1e3, m: 1e6, b: 1e9 }[unit as "k" | "m" | "b"] : Number(digits.replace(/[.,']/g, ""));
  return Number.isFinite(value) ? Math.round(value) : 0;
}

/** 12345678 -> "12.3m", 45600 -> "45.6k". */
export function shortSilver(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}m`;
  if (abs >= 1e4) return `${(value / 1e3).toFixed(0)}k`;
  return Math.round(value).toLocaleString("de-DE");
}
