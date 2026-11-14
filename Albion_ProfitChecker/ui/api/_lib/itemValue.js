// What an item is worth on the market, for the guild killboard's "value": the cheapest believable
// sell order in a city for that quality; without one, the middle of what the Black Market and city
// buy orders pay; without any, the same for another quality. Prices come from api/_lib/aodp.js.

import { getPrices } from "./aodp.js";

/** The ids AODP's price list accepts; anything else (non-tradable, malformed) has no price. */
const PRICED_ID = /^[A-Z0-9_]{2,80}(@[1-4])?$/;
/** AODP answers up to this many ids in one call; a board needs a few calls at most. */
const IDS_PER_CALL = 300;
const MAX_CALLS = 4;
/** A sell order below this share of the middle one is a troll or a typo, not the item's value. */
const TROLL_SHARE = 1 / 3;

const middle = (sorted) => sorted[Math.floor((sorted.length - 1) / 2)];

/** One silver figure per quality from a price row [quality, blackMarket, buys[], sells[]]. */
export function rowValue([, bm, buys, sells]) {
  const listed = sells.filter((p) => p > 0).sort((a, b) => a - b);
  if (listed.length) {
    const floor = middle(listed) * TROLL_SHARE;
    return listed.find((p) => p >= floor);
  }
  // no sell order: the middle buy price, not the highest (one huge buy order is not the value)
  const bids = [bm, ...buys].filter((p) => p > 0).sort((a, b) => a - b);
  return bids.length ? middle(bids) : 0;
}

/** item id -> quality -> silver, from AODP price rows. */
export function valueTable(prices) {
  const table = new Map();
  for (const [id, rows] of Object.entries(prices ?? {})) {
    const byQuality = new Map();
    for (const row of rows) {
      const value = rowValue(row);
      if (value > 0) byQuality.set(row[0], value);
    }
    if (byQuality.size) table.set(id, byQuality);
  }
  return table;
}

/** The silver one item of this type and quality is worth, or 0 when the market does not know it. */
export function unitValue(table, type, quality = 1) {
  const byQuality = table.get(type);
  if (!byQuality) return 0;
  if (byQuality.has(quality)) return byQuality.get(quality);
  // another quality: the nearest one below, else the lowest known
  const known = [...byQuality.keys()].sort((a, b) => a - b);
  const below = known.filter((q) => q < quality).at(-1);
  return byQuality.get(below ?? known[0]);
}

/**
 * Looks up the given item ids (priced ones only) in calls of IDS_PER_CALL. `complete` is false when
 * the list was longer than MAX_CALLS calls take: the rest then has no value.
 */
export async function loadValues(region, ids) {
  const priced = [...new Set(ids)].filter((id) => PRICED_ID.test(id));
  const asked = priced.slice(0, IDS_PER_CALL * MAX_CALLS);
  const chunks = [];
  for (let i = 0; i < asked.length; i += IDS_PER_CALL) chunks.push(asked.slice(i, i + IDS_PER_CALL));
  const results = await Promise.all(chunks.map((chunk) => getPrices(region, chunk.join(","))));
  if (results.some((r) => r.status !== 200)) throw new Error("prices unavailable");
  const table = new Map();
  for (const result of results) for (const [id, byQuality] of valueTable(result.body.prices)) table.set(id, byQuality);
  return { table, complete: asked.length === priced.length };
}
