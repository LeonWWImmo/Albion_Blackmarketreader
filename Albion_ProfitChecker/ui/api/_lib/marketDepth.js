// Market depth (premium, the Focus Planner's competition check): how much sits on the market at
// each price, from the Albion Data Project's live order stream (NATS topic marketorders.deduped:
// every order a player with the data client sees, with its amount). scripts/market-depth.mjs
// listens twice a day in the GitHub job and sends a summary of the craftable items per market
// through /api/market/ingest.
import { LIVE_LOCATIONS } from "./marketLive.js";

/** AODP location ids of the eight markets (LIVE_LOCATIONS order). */
export const DEPTH_LOCATION_IDS = {
  3003: "Black Market",
  3005: "Caerleon",
  2004: "Bridgewatch",
  4002: "Fort Sterling",
  1002: "Lymhurst",
  3008: "Martlock",
  7: "Thetford",
  5003: "Brecilien"
};
const ITEM_ID = /^T[1-8]_[A-Z0-9_]{2,80}(@[1-4])?$/;
/** An order not seen again for this long is dropped: it may be sold or cancelled. */
export const DEPTH_KEEP_MIN = 6 * 60;
/** Price levels kept per side and market in the summary. */
export const DEPTH_LEVELS = 10;
/** Orders of one view arrive within this window (minutes). */
const VIEW_MIN = 2;
/** The stream skips an order seen again within 5 minutes; older than this and not in a newer view: gone. */
const GONE_AFTER_MIN = 7;

const toMinute = (ms) => Math.round(ms / 60000);

/**
 * A book: Map id -> [itemId, market index, quality, price, amount, side (0 sell order, 1 buy
 * order), seen (minute), expires (minute)]. Adds stream orders, keeping each order's newest sighting.
 */
export function addOrders(book, orders, nowMin) {
  let added = 0;
  for (const o of Array.isArray(orders) ? orders : []) {
    const market = DEPTH_LOCATION_IDS[Number(o?.LocationId)];
    const at = market ? LIVE_LOCATIONS.indexOf(market) : -1;
    const id = String(o?.ItemTypeId ?? "");
    const price = Number(o?.UnitPriceSilver);
    const amount = Number(o?.Amount);
    const side = o?.AuctionType === "offer" ? 0 : o?.AuctionType === "request" ? 1 : -1;
    if (at < 0 || side < 0 || !ITEM_ID.test(id) || !(price > 0) || !(amount > 0) || o?.Id == null) continue;
    const expires = Date.parse(/[zZ]$/.test(String(o.Expires)) ? o.Expires : `${o.Expires}Z`);
    book.set(String(o.Id), [id, at, Number(o.QualityLevel) || 1, price, amount, side, nowMin, Number.isFinite(expires) ? toMinute(expires) : nowMin + DEPTH_KEEP_MIN]);
    added += 1;
  }
  return added;
}

/**
 * Drops what is most likely gone: expired, not seen for DEPTH_KEEP_MIN, or missing from a newer
 * view of the same market page (a player looked at that item there, the order was in the price
 * range shown, yet it did not come again).
 */
export function pruneBook(book, nowMin) {
  const views = new Map();
  for (const [, o] of book) {
    const key = `${o[0]}|${o[1]}|${o[5]}`;
    const view = views.get(key);
    if (!view || o[6] > view.at) views.set(key, { at: o[6], min: o[3], max: o[3] });
  }
  for (const [, o] of book) {
    const view = views.get(`${o[0]}|${o[1]}|${o[5]}`);
    if (o[6] >= view.at - VIEW_MIN) {
      view.min = Math.min(view.min, o[3]);
      view.max = Math.max(view.max, o[3]);
    }
  }
  let dropped = 0;
  for (const [id, o] of book) {
    const view = views.get(`${o[0]}|${o[1]}|${o[5]}`);
    const stale = nowMin - o[6] > DEPTH_KEEP_MIN || o[7] < nowMin;
    const missed = o[6] < view.at - GONE_AFTER_MIN && o[3] >= view.min && o[3] <= view.max;
    if (stale || missed) {
      book.delete(id);
      dropped += 1;
    }
  }
  return dropped;
}

/**
 * The summary the site gets: { [itemId]: cells }, one per LIVE_LOCATIONS entry, 0 or
 * [sellLevels, sellTotal, buyLevels, buyTotal, seen]. sellLevels: [price, amount] cheapest first
 * (all qualities); buyLevels: [price, amount, quality] best first; totals: all pieces on that side;
 * seen: the newest sighting (minute).
 */
export function summarizeBook(book, keep = () => true) {
  const byItem = new Map();
  for (const [, o] of book) {
    const [id, at, quality, price, amount, side, seen] = o;
    if (!keep(id)) continue;
    const cells = byItem.get(id) ?? LIVE_LOCATIONS.map(() => null);
    const cell = (cells[at] ??= { sell: new Map(), buy: new Map(), sellTotal: 0, buyTotal: 0, seen: 0 });
    if (side === 0) {
      cell.sell.set(price, (cell.sell.get(price) ?? 0) + amount);
      cell.sellTotal += amount;
    } else {
      const key = `${price}|${quality}`;
      cell.buy.set(key, (cell.buy.get(key) ?? 0) + amount);
      cell.buyTotal += amount;
    }
    cell.seen = Math.max(cell.seen, seen);
    byItem.set(id, cells);
  }
  const out = {};
  for (const [id, cells] of byItem) {
    out[id] = cells.map((cell) => {
      if (!cell) return 0;
      const sell = [...cell.sell].sort((a, b) => a[0] - b[0]).slice(0, DEPTH_LEVELS);
      const buy = [...cell.buy]
        .map(([key, amount]) => {
          const [price, quality] = key.split("|").map(Number);
          return [price, amount, quality];
        })
        .sort((a, b) => b[0] - a[0])
        .slice(0, DEPTH_LEVELS);
      return [sell, cell.sellTotal, buy, cell.buyTotal, cell.seen];
    });
  }
  return out;
}

/** "T6_2H_BOW@2" -> is 2H_BOW one of the recipes (public/items-categorized-crafting.json)? */
export function craftableFilter(recipesFile) {
  const bases = new Set((recipesFile?.categories ?? []).flatMap((c) => (c.items ?? []).map((i) => i.id)).filter(Boolean));
  return (id) => bases.has(String(id).replace(/^T\d_/, "").replace(/@\d$/, ""));
}

/** A book as JSON for a later run and back. */
export const bookToJson = (book) => JSON.stringify([...book]);
export function bookFromJson(text) {
  try {
    const list = JSON.parse(text);
    return new Map(Array.isArray(list) ? list.filter((e) => Array.isArray(e) && Array.isArray(e[1]) && e[1].length === 8) : []);
  } catch {
    return new Map();
  }
}

const MAX_ITEMS = 30000;
const isLevel = (level, width) => Array.isArray(level) && level.length === width && level.every((n) => Number.isFinite(n) && n >= 0);

/** The bounds an ingested summary must stay in. */
export function validDepth(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return false;
  const entries = Object.entries(map);
  if (entries.length > MAX_ITEMS) return false;
  return entries.every(
    ([id, cells]) =>
      ITEM_ID.test(id) &&
      Array.isArray(cells) &&
      cells.length === LIVE_LOCATIONS.length &&
      cells.every(
        (cell) =>
          cell === 0 ||
          (Array.isArray(cell) &&
            cell.length === 5 &&
            Array.isArray(cell[0]) &&
            cell[0].length <= DEPTH_LEVELS &&
            cell[0].every((l) => isLevel(l, 2)) &&
            Array.isArray(cell[2]) &&
            cell[2].length <= DEPTH_LEVELS &&
            cell[2].every((l) => isLevel(l, 3)) &&
            [cell[1], cell[3], cell[4]].every((n) => Number.isFinite(n) && n >= 0))
      )
  );
}
