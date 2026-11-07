// Server-side access to the Albion Online Data Project (AODP) API, shared by the Vercel
// functions in api/aodp/ and by the Vite dev server (vite.config.ts), so local development
// serves the same responses as production.
//
// Visitors never call AODP themselves: the browser asks /api/aodp/*, Vercel's CDN caches the
// answer for several minutes, and only a cache miss reaches AODP. Every request identifies
// this site and asks for gzip, as the AODP API page asks of services that call it regularly.
//
// The leading underscore keeps this folder from becoming a function of its own on Vercel.

export const USER_AGENT = "BlackmarketReader/1.0 (+https://blackmarketreader.com)";

/** Our region codes to AODP hosts. Only these two can be requested, nothing user-supplied. */
const HOSTS = { eu: "europe", us: "west" };

const REQUEST_TIMEOUT_MS = 8000;
const GOLD_DAYS = 90;
/** C# ticks (100 ns since 0001-01-01) at the Unix epoch, used by AODP event times. */
const TICKS_AT_UNIX_EPOCH = 621355968000000000;
const TICKS_PER_MS = 10000;

/** Failures are kept this long, so an AODP outage is not retried on every visitor's request. */
const FAILURE_TTL_S = 60;

/**
 * Answers kept in this function instance's memory, by endpoint and region. The CDN cache keys on
 * the full URL, so a request with an extra query parameter would miss it; this cache does not,
 * which keeps AODP to about one call per endpoint, region and cache period per instance.
 */
const memory = new Map();
/** Price lists vary per chest log, so the memory keeps at most this many answers (oldest go first). */
const MEMORY_MAX = 300;

async function remembered(key, load) {
  const hit = memory.get(key);
  if (hit && hit.until > Date.now()) return hit.result;
  const result = await load();
  const ttl = result.status === 200 ? result.maxAge : result.status >= 500 ? FAILURE_TTL_S : 0;
  if (ttl > 0) {
    memory.delete(key);
    memory.set(key, { until: Date.now() + ttl * 1000, result });
    while (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value);
  }
  return result;
}

/** For tests: forget every remembered answer. */
export function clearMemory() {
  memory.clear();
}

export function normalizeRegion(value) {
  const region = String(value || "").toLowerCase();
  return Object.prototype.hasOwnProperty.call(HOSTS, region) ? region : null;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate", Accept: "application/json" },
      signal: controller.signal
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** MM-DD-YYYY in UTC, the date format the gold endpoint takes. */
function aodpDate(date) {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}-${date.getUTCFullYear()}`;
}

/**
 * Gold price history as [unixSeconds, silverPerGold] pairs, oldest first, one per timestamp.
 * AODP timestamps carry no zone suffix but are UTC.
 */
export function parseGoldHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const byTime = new Map();
  for (const entry of raw) {
    const price = Number(entry && entry.price);
    const stamp = String((entry && entry.timestamp) || "");
    if (!Number.isFinite(price) || price <= 0 || !stamp) continue;
    const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(stamp) ? stamp : `${stamp}Z`);
    if (!Number.isFinite(ms)) continue;
    byTime.set(Math.floor(ms / 1000), Math.round(price));
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]);
}

function ticksToIso(ticks) {
  const n = Number(ticks);
  if (!Number.isFinite(n) || n <= TICKS_AT_UNIX_EPOCH) return null;
  const ms = (n - TICKS_AT_UNIX_EPOCH) / TICKS_PER_MS;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The confirmed festivities snapshot, reduced to what the site uses. Kind 2 events are the daily
 * crafting bonuses (UniqueName COMMON_<CATEGORY> = +10%, RARE_<CATEGORY> = +20%), kind 1 the
 * weekly activity events, kind 0 internal blockers (dropped).
 */
export function parseFestivities(raw) {
  const events = Array.isArray(raw && raw.Events) ? raw.Events : [];
  const out = [];
  for (const event of events) {
    const kind = Number(event && event.Kind);
    const name = String((event && event.UniqueName) || "").slice(0, 128);
    const start = ticksToIso(event && event.StartTime);
    const end = ticksToIso(event && event.EndTime);
    if ((kind !== 1 && kind !== 2) || !/^[A-Z0-9_]+$/.test(name) || !start || !end) continue;
    out.push({ kind, category: String((event && event.Category) || "").slice(0, 64), name, start, end });
  }
  return {
    confirmed: out.length > 0,
    confirmedAt: typeof (raw && raw.ConfirmedAt) === "string" ? raw.ConfirmedAt : null,
    expiresAt: typeof (raw && raw.ExpiresAt) === "string" ? raw.ExpiresAt : null,
    events: out
  };
}

/**
 * Each handler returns { status, body, maxAge } and never throws. maxAge is the CDN cache time
 * in seconds; 0 means "do not cache" (used for upstream failures).
 */
export async function getGold(regionInput, now = new Date()) {
  const region = normalizeRegion(regionInput);
  if (!region) return { status: 400, body: { error: "region must be eu or us" }, maxAge: 0 };
  return remembered(`gold:${region}`, async () => {
    const from = new Date(now.getTime() - GOLD_DAYS * 24 * 3600 * 1000);
    const url = `https://${HOSTS[region]}.albion-online-data.com/api/v2/stats/gold?date=${aodpDate(from)}&end_date=${aodpDate(new Date(now.getTime() + 24 * 3600 * 1000))}`;
    try {
      const { status, body } = await fetchJson(url);
      if (status !== 200) return { status: 502, body: { error: "gold prices unavailable" }, maxAge: 0 };
      const points = parseGoldHistory(body);
      if (!points.length) return { status: 502, body: { error: "gold prices unavailable" }, maxAge: 0 };
      return { status: 200, body: { region, fetchedAt: now.toISOString(), points }, maxAge: 600 };
    } catch {
      return { status: 502, body: { error: "gold prices unavailable" }, maxAge: 0 };
    }
  });
}

export async function getFestivities(regionInput, now = new Date()) {
  const region = normalizeRegion(regionInput);
  if (!region) return { status: 400, body: { error: "region must be eu or us" }, maxAge: 0 };
  return remembered(`festivities:${region}`, async () => {
    const url = `https://${HOSTS[region]}.albion-online-data.com/api/v2/stats/festivities`;
    try {
      const { status, body } = await fetchJson(url);
      // 404 means no snapshot is confirmed yet (it needs reports from several players): a normal
      // answer, cached briefly so the page picks the snapshot up soon after it appears.
      if (status === 404) {
        return { status: 200, body: { region, fetchedAt: now.toISOString(), confirmed: false, confirmedAt: null, expiresAt: null, events: [] }, maxAge: 300 };
      }
      if (status !== 200) return { status: 502, body: { error: "festivities unavailable" }, maxAge: 0 };
      return { status: 200, body: { region, fetchedAt: now.toISOString(), ...parseFestivities(body) }, maxAge: 600 };
    } catch {
      return { status: 502, body: { error: "festivities unavailable" }, maxAge: 0 };
    }
  });
}

/** Markets the Loot Split values items in. Brecilien is left out: few orders, odd prices. */
const PRICE_CITIES = ["Black Market", "Caerleon", "Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford"];
const PRICE_MAX_IDS = 300;
const PRICE_CHUNK = 100;
/** Orders older than this are ignored: they are probably filled or cancelled by now. */
const PRICE_FRESH_MS = 72 * 3600 * 1000;
const ITEM_ID = /^[A-Z0-9_]{2,80}(@[1-4])?$/;

/** "T4_BAG,T5_2H_CROSSBOW@1" -> sorted unique ids, or null when anything looks wrong. */
export function parseItemIds(value) {
  const ids = [...new Set(String(value || "").split(",").map((id) => id.trim()).filter(Boolean))];
  if (!ids.length || ids.length > PRICE_MAX_IDS || !ids.every((id) => ITEM_ID.test(id))) return null;
  return ids.sort();
}

const fresh = (price, stamp, now) => {
  const ms = Date.parse(/[zZ]$/.test(String(stamp)) ? stamp : `${stamp}Z`);
  return price > 0 && Number.isFinite(ms) && now.getTime() - ms <= PRICE_FRESH_MS ? price : 0;
};

/** Caerleon and the royal cities, in the order the per-city price arrays use. */
const MARKET_CITIES = PRICE_CITIES.slice(1);

/**
 * AODP rows -> { [itemId]: [[quality, bm, buys, sells], ...] }, buys and sells one price per city
 * in MARKET_CITIES order (0 = none). bm: best Black Market buy order; buys: city buy orders (sell
 * instantly); sells: city sell orders to list against, a listing above 1.5x the cities' median
 * dropped so one stale listing does not win.
 */
export function parsePrices(raw, now = new Date()) {
  const cells = new Map();
  for (const row of Array.isArray(raw) ? raw : []) {
    const id = String(row?.item_id || "");
    const quality = Number(row?.quality);
    if (!ITEM_ID.test(id) || !(quality >= 1 && quality <= 5)) continue;
    const key = `${id}|${quality}`;
    const cell = cells.get(key) || { id, quality, bm: 0, buys: MARKET_CITIES.map(() => 0), sells: MARKET_CITIES.map(() => 0) };
    const buy = fresh(Number(row.buy_price_max), row.buy_price_max_date, now);
    const sell = fresh(Number(row.sell_price_min), row.sell_price_min_date, now);
    const city = MARKET_CITIES.indexOf(row.city);
    if (row.city === "Black Market") cell.bm = Math.max(cell.bm, buy);
    else if (city >= 0) {
      cell.buys[city] = Math.max(cell.buys[city], buy);
      if (sell) cell.sells[city] = cell.sells[city] ? Math.min(cell.sells[city], sell) : sell;
    }
    cells.set(key, cell);
  }
  const out = {};
  for (const cell of cells.values()) {
    const listed = cell.sells.filter(Boolean).sort((a, b) => a - b);
    if (listed.length) {
      const cap = listed[Math.floor((listed.length - 1) / 2)] * 1.5;
      cell.sells = cell.sells.map((price) => (price <= cap ? price : 0));
    }
    if (!cell.bm && !cell.buys.some(Boolean) && !cell.sells.some(Boolean)) continue;
    (out[cell.id] ||= []).push([cell.quality, cell.bm, cell.buys, cell.sells]);
  }
  for (const rows of Object.values(out)) rows.sort((a, b) => a[0] - b[0]);
  return out;
}

export async function getPrices(regionInput, idsInput, now = new Date()) {
  const region = normalizeRegion(regionInput);
  if (!region) return { status: 400, body: { error: "region must be eu or us" }, maxAge: 0 };
  const ids = parseItemIds(idsInput);
  if (!ids) return { status: 400, body: { error: `ids must be 1-${PRICE_MAX_IDS} item ids` }, maxAge: 0 };
  const locations = encodeURIComponent(PRICE_CITIES.join(","));
  // the same list from another visitor is answered from memory, even when the CDN misses
  return remembered(`prices:${region}:${ids.join(",")}`, async () => {
    try {
      // the chunks run side by side, so a full list takes one AODP round trip, not three
      const chunks = [];
      for (let i = 0; i < ids.length; i += PRICE_CHUNK) chunks.push(ids.slice(i, i + PRICE_CHUNK));
      const answers = await Promise.all(
        chunks.map((chunk) =>
          fetchJson(`https://${HOSTS[region]}.albion-online-data.com/api/v2/stats/prices/${chunk.map(encodeURIComponent).join(",")}.json?locations=${locations}&qualities=1,2,3,4,5`)
        )
      );
      if (answers.some(({ status, body }) => status !== 200 || !Array.isArray(body))) return { status: 502, body: { error: "prices unavailable" }, maxAge: 0 };
      const rows = answers.flatMap(({ body }) => body);
      return { status: 200, body: { region, fetchedAt: now.toISOString(), prices: parsePrices(rows, now) }, maxAge: 300 };
    } catch {
      return { status: 502, body: { error: "prices unavailable" }, maxAge: 0 };
    }
  });
}

/** Every market the Price Checker shows, Brecilien included. */
const QUOTE_CITIES = [...PRICE_CITIES, "Brecilien"];
/** One item's enchantment levels, .0 to .4. */
const QUOTE_MAX_IDS = 5;
/** AODP history resolutions in hours: daily points over a month, or four a day for the last weeks. */
const HISTORY_SCALES = new Set([6, 24]);

const unixSeconds = (stamp) => {
  const ms = Date.parse(/[zZ]$/.test(String(stamp)) ? stamp : `${stamp}Z`);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
};

const cityOrder = (city) => QUOTE_CITIES.indexOf(city);

/**
 * AODP current prices -> [[id, city, quality, sell, sellAt, buy, buyAt], ...]: the lowest sell order
 * and the highest buy order per market and quality, each with the unix time a player last saw it
 * (0 = none). Old prices stay in on purpose: the Price Checker shows how old each one is.
 */
export function parseQuotes(raw) {
  const out = [];
  for (const row of Array.isArray(raw) ? raw : []) {
    const id = String(row?.item_id || "");
    const city = String(row?.city || "");
    const quality = Number(row?.quality);
    if (!ITEM_ID.test(id) || cityOrder(city) < 0 || !(quality >= 1 && quality <= 5)) continue;
    const sellAt = unixSeconds(row.sell_price_min_date);
    const buyAt = unixSeconds(row.buy_price_max_date);
    const sell = sellAt ? Math.max(0, Math.round(Number(row.sell_price_min) || 0)) : 0;
    const buy = buyAt ? Math.max(0, Math.round(Number(row.buy_price_max) || 0)) : 0;
    if (!sell && !buy) continue;
    out.push([id, city, quality, sell, sell ? sellAt : 0, buy, buy ? buyAt : 0]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]) || cityOrder(a[1]) - cityOrder(b[1]) || a[2] - b[2]);
}

/** AODP history -> [[city, quality, [[unixSeconds, averagePrice, itemsSold], ...]], ...], oldest point first. */
export function parseHistory(raw) {
  const out = [];
  for (const series of Array.isArray(raw) ? raw : []) {
    const city = String(series?.location || "");
    const quality = Number(series?.quality);
    if (cityOrder(city) < 0 || !(quality >= 1 && quality <= 5) || !Array.isArray(series.data)) continue;
    const points = [];
    for (const point of series.data) {
      const t = unixSeconds(point?.timestamp);
      const price = Math.round(Number(point?.avg_price) || 0);
      if (t && price > 0) points.push([t, price, Math.max(0, Math.round(Number(point.item_count) || 0))]);
    }
    if (points.length) out.push([city, quality, points.sort((a, b) => a[0] - b[0])]);
  }
  return out.sort((a, b) => cityOrder(a[0]) - cityOrder(b[0]) || a[1] - b[1]);
}

export async function getQuotes(regionInput, idsInput, now = new Date()) {
  const region = normalizeRegion(regionInput);
  if (!region) return { status: 400, body: { error: "region must be eu or us" }, maxAge: 0 };
  const ids = parseItemIds(idsInput);
  if (!ids || ids.length > QUOTE_MAX_IDS) return { status: 400, body: { error: `ids must be 1-${QUOTE_MAX_IDS} item ids` }, maxAge: 0 };
  const locations = encodeURIComponent(QUOTE_CITIES.join(","));
  return remembered(`quotes:${region}:${ids.join(",")}`, async () => {
    try {
      const url = `https://${HOSTS[region]}.albion-online-data.com/api/v2/stats/prices/${ids.map(encodeURIComponent).join(",")}.json?locations=${locations}&qualities=1,2,3,4,5`;
      const { status, body } = await fetchJson(url);
      if (status !== 200 || !Array.isArray(body)) return { status: 502, body: { error: "prices unavailable" }, maxAge: 0 };
      return { status: 200, body: { region, fetchedAt: now.toISOString(), quotes: parseQuotes(body) }, maxAge: 300 };
    } catch {
      return { status: 502, body: { error: "prices unavailable" }, maxAge: 0 };
    }
  });
}

export async function getHistory(regionInput, idInput, scaleInput, now = new Date()) {
  const region = normalizeRegion(regionInput);
  if (!region) return { status: 400, body: { error: "region must be eu or us" }, maxAge: 0 };
  const ids = parseItemIds(idInput);
  if (!ids || ids.length !== 1) return { status: 400, body: { error: "id must be one item id" }, maxAge: 0 };
  const scale = Number(scaleInput);
  if (!HISTORY_SCALES.has(scale)) return { status: 400, body: { error: "scale must be 6 or 24" }, maxAge: 0 };
  const locations = encodeURIComponent(QUOTE_CITIES.join(","));
  return remembered(`history:${region}:${ids[0]}:${scale}`, async () => {
    try {
      const url = `https://${HOSTS[region]}.albion-online-data.com/api/v2/stats/history/${encodeURIComponent(ids[0])}.json?locations=${locations}&qualities=1,2,3,4,5&time-scale=${scale}`;
      const { status, body } = await fetchJson(url);
      if (status !== 200 || !Array.isArray(body)) return { status: 502, body: { error: "history unavailable" }, maxAge: 0 };
      return { status: 200, body: { region, fetchedAt: now.toISOString(), id: ids[0], scale, series: parseHistory(body) }, maxAge: 3600 };
    } catch {
      return { status: 502, body: { error: "history unavailable" }, maxAge: 0 };
    }
  });
}

/**
 * GET /api/aodp/<endpoint>?... — one Vercel function (api/aodp/[endpoint].js) and the Vite dev
 * server both answer through this table, so every endpoint is wired in exactly one place.
 *   gold         ?region                  hourly gold price, 90 days
 *   festivities  ?region                  daily crafting bonuses and weekly events
 *   prices       ?region&ids (<= 300)     Loot Split: best order per city and quality
 *   quotes       ?region&ids (<= 5)       Price Checker: every market's orders with their age
 *   history      ?region&id&scale (6|24)  Price Checker: average price and items sold over time
 */
export const AODP_ENDPOINTS = {
  gold: (query) => getGold(query.region),
  festivities: (query) => getFestivities(query.region),
  prices: (query) => getPrices(query.region, query.ids),
  quotes: (query) => getQuotes(query.region, query.ids),
  history: (query) => getHistory(query.region, query.id, query.scale)
};

/** Answers one /api/aodp/<endpoint> request; unknown endpoints get a 404. */
export async function handleAodp(endpoint, query) {
  const route = Object.prototype.hasOwnProperty.call(AODP_ENDPOINTS, endpoint) ? AODP_ENDPOINTS[endpoint] : null;
  if (!route) return { status: 404, body: { error: "unknown endpoint" }, maxAge: 0 };
  return route(query ?? {});
}

/** Shared response writer for Node's http.ServerResponse (Vercel and the Vite dev server). */
export function sendResult(res, result) {
  res.statusCode = result.status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    result.maxAge > 0
      ? `public, max-age=60, s-maxage=${result.maxAge}, stale-while-revalidate=${result.maxAge * 6}`
      : "no-store"
  );
  res.end(JSON.stringify(result.body));
}
