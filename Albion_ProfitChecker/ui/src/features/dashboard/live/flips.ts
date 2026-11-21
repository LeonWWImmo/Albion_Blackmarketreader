// The live market's math (premium, see api/_lib/marketLive.js for the snapshot): the best route
// per item from the prices as they stand now, after Albion's market fees.

/** One market of one item: 0 for nothing, else [sell, sellAt, buy, buyAt] (prices in silver, times in minutes since 1970). */
export type PriceCell = 0 | [number, number, number, number];
/** One market of one item: 0 for nothing, else [soldPerDay, avgPrice] over the last 7 days. */
export type VolumeCell = 0 | [number, number];

export type LiveSnapshot = {
  region: string;
  locations: string[];
  pricesAt: string;
  volumeAt: string | null;
  prices: Record<string, PriceCell[]>;
  volume: Record<string, VolumeCell[]>;
};

export const BLACK_MARKET = "Black Market";
/** Sales tax with and without Albion Premium, and the fee for listing a sell order. */
export const SALES_TAX = { premium: 0.04, normal: 0.08 };
export const SETUP_FEE = 0.025;

export type FlipOptions = {
  /** bm: city -> Black Market; city: city -> another city */
  kind: "bm" | "city";
  /** a city or "ALL" */
  from: string;
  /** a city or "ALL" (city flips only) */
  to: string;
  /** instant: sell into the best buy order; order: list a sell order at the cheapest listing (the Black Market is always instant) */
  mode: "instant" | "order";
  albionPremium: boolean;
  /** both prices at most this old */
  maxAgeH: number;
  minProfitPct: number;
  maxCost: number | null;
  minSold: number;
  /** "ALL" or "T4".."T8" */
  tier: string;
  search: string;
  sort: "pct" | "silver" | "sold";
};

export type Flip = {
  id: string;
  from: string;
  to: string;
  buy: number;
  buyAt: number;
  sell: number;
  sellAt: number;
  /** true when the sale fills a buy order (always at the Black Market) */
  instant: boolean;
  /** silver per item after the fees */
  profit: number;
  profitPct: number;
  /** sold per day at the target, null when unknown */
  sold: number | null;
  /** so far above the cost that the price is probably not real */
  suspect: boolean;
};

export const tierOf = (id: string) => id.match(/^(T\d)_/)?.[1] ?? "";

/** What one item earns on one route, or null when one side has no fitting price. */
export function routeFor(
  id: string,
  snap: LiveSnapshot,
  fromAt: number,
  toAt: number,
  opts: Pick<FlipOptions, "mode" | "albionPremium" | "maxAgeH">,
  nowMinute: number
): Flip | null {
  const cells = snap.prices[id];
  const source = cells?.[fromAt];
  const target = cells?.[toAt];
  if (!source || !target || fromAt === toAt) return null;
  const from = snap.locations[fromAt];
  const to = snap.locations[toAt];
  if (from === BLACK_MARKET) return null; // the Black Market only buys
  const oldest = nowMinute - opts.maxAgeH * 60;
  const [buy, buyAt] = [source[0], source[1]];
  if (!buy || buyAt < oldest) return null;
  const instant = opts.mode === "instant" || to === BLACK_MARKET;
  const [sell, sellAt] = instant ? [target[2], target[3]] : [target[0], target[1]];
  if (!sell || sellAt < oldest) return null;
  const fee = (opts.albionPremium ? SALES_TAX.premium : SALES_TAX.normal) + (instant ? 0 : SETUP_FEE);
  const profit = Math.round(sell * (1 - fee) - buy);
  const volume = snap.volume[id]?.[toAt];
  return {
    id,
    from,
    to,
    buy,
    buyAt,
    sell,
    sellAt,
    instant,
    profit,
    profitPct: (profit / buy) * 100,
    sold: volume ? volume[0] : null,
    suspect: sell >= 5 * buy
  };
}

const better = (sort: FlipOptions["sort"]) => (a: Flip, b: Flip) =>
  sort === "silver" ? b.profit - a.profit : sort === "sold" ? (b.sold ?? -1) - (a.sold ?? -1) || b.profitPct - a.profitPct : b.profitPct - a.profitPct;

/**
 * The best route of every item that passes the filters (one row per item; the detail shows all
 * markets), sorted by opts.sort. nameOf gives the readable name for the search.
 */
export function computeFlips(snap: LiveSnapshot, opts: FlipOptions, nowMinute: number, nameOf: (id: string) => string): Flip[] {
  const pick = better(opts.sort);
  const term = opts.search.trim().toLowerCase();
  const all = snap.locations.map((_, i) => i);
  const sources = opts.from === "ALL" ? all : all.filter((i) => snap.locations[i] === opts.from);
  const targets =
    opts.kind === "bm"
      ? all.filter((i) => snap.locations[i] === BLACK_MARKET)
      : all.filter((i) => snap.locations[i] !== BLACK_MARKET && (opts.to === "ALL" || snap.locations[i] === opts.to));
  // before the first volume run there are no sales numbers: then the filter would hide everything
  const minSold = Object.keys(snap.volume).length ? opts.minSold : 0;
  const out: Flip[] = [];
  for (const id of Object.keys(snap.prices)) {
    if (opts.tier !== "ALL" && tierOf(id) !== opts.tier) continue;
    if (term && !id.toLowerCase().includes(term) && !nameOf(id).toLowerCase().includes(term)) continue;
    let best: Flip | null = null;
    for (const s of sources) {
      for (const t of targets) {
        const flip = routeFor(id, snap, s, t, opts, nowMinute);
        if (!flip || flip.profit <= 0 || flip.profitPct < opts.minProfitPct) continue;
        if (opts.maxCost != null && flip.buy > opts.maxCost) continue;
        if (minSold > 0 && (flip.sold ?? 0) < minSold) continue;
        if (!best || pick(flip, best) < 0) best = flip;
      }
    }
    if (best) out.push(best);
  }
  return out.sort(pick);
}

/** "now", "12m", "3h", "2d" */
export function ageLabel(atMinute: number, nowMinute: number): string {
  const minutes = Math.max(0, nowMinute - atMinute);
  if (minutes < 2) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}
