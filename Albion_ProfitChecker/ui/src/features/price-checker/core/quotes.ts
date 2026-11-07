import { salesTaxRate } from "../../../shared/albion/marketTax";

/** [id, market, quality, sellOrder, sellSeenAt, buyOrder, buySeenAt] from /api/aodp/quotes; 0 = none. */
export type QuoteRow = [string, string, number, number, number, number, number];

export const MARKETS = ["Black Market", "Caerleon", "Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford", "Brecilien"] as const;
export type MarketName = (typeof MARKETS)[number];

export type Price = { price: number; seenAt: number } | null;
export type MarketQuote = { market: MarketName; sell: Price; buy: Price };

/** How old a price is, as the page colours it. */
export type Freshness = "fresh" | "recent" | "old" | "stale";

const HOUR = 3600;
/** Older than this, a price is shown but not used for the best price or a flip. */
export const STALE_AFTER = 48 * HOUR;

export function freshness(seenAt: number, now: number): Freshness {
  const age = now - seenAt;
  if (age <= HOUR) return "fresh";
  if (age <= 6 * HOUR) return "recent";
  if (age <= STALE_AFTER) return "old";
  return "stale";
}

/** "now", "12m", "3h", "2d" */
export function ageLabel(seenAt: number, now: number): string {
  const age = Math.max(0, now - seenAt);
  if (age < 60) return "now";
  if (age < HOUR) return `${Math.floor(age / 60)}m`;
  if (age < 48 * HOUR) return `${Math.floor(age / HOUR)}h`;
  return `${Math.floor(age / (24 * HOUR))}d`;
}

/** Every market's orders for one item id and quality, in the fixed market order. */
export function marketQuotes(rows: QuoteRow[], id: string, quality: number): MarketQuote[] {
  return MARKETS.map((market) => {
    const row = rows.find((r) => r[0] === id && r[1] === market && r[2] === quality);
    // the Black Market only buys: what AODP reports as its "sell" is not something a player can buy
    const sell = row && row[3] && market !== "Black Market" ? { price: row[3], seenAt: row[4] } : null;
    const buy = row && row[5] ? { price: row[5], seenAt: row[6] } : null;
    return { market, sell, buy };
  });
}

/** Markets that count for the best price: Brecilien has too few orders to trust. */
const counts = (market: MarketName) => market !== "Brecilien";
const usable = (price: Price, now: number): price is NonNullable<Price> => !!price && now - price.seenAt <= STALE_AFTER;

export type Best = { market: MarketName; price: number; seenAt: number } | null;

/** The cheapest sell order to buy from. */
export function cheapestBuy(quotes: MarketQuote[], now: number): Best {
  let best: Best = null;
  for (const { market, sell } of quotes) {
    if (counts(market) && usable(sell, now) && (!best || sell.price < best.price)) best = { market, ...sell };
  }
  return best;
}

/** The highest buy order to sell into straight away (the Black Market included). */
export function bestInstantSell(quotes: MarketQuote[], now: number): Best {
  let best: Best = null;
  for (const { market, buy } of quotes) {
    if (counts(market) && usable(buy, now) && (!best || buy.price > best.price)) best = { market, ...buy };
  }
  return best;
}

export type Flip = { from: MarketName; to: MarketName; buy: number; sell: number; profit: number; margin: number };

/** Buy the cheapest sell order, sell straight into the best buy order elsewhere: what is left after tax. */
export function bestFlip(quotes: MarketQuote[], now: number, premium: boolean): Flip | null {
  const buy = cheapestBuy(quotes, now);
  const sell = bestInstantSell(quotes, now);
  if (!buy || !sell || buy.market === sell.market) return null;
  const profit = sell.price * (1 - salesTaxRate(premium)) - buy.price;
  if (profit <= 0) return null;
  return { from: buy.market, to: sell.market, buy: buy.price, sell: sell.price, profit, margin: profit / buy.price };
}
