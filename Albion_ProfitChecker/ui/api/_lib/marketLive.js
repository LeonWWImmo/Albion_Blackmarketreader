// Live market (premium): a snapshot of every dashboard item's current price in all eight markets,
// taken every 30 minutes, so the dashboard can show city flips and Black Market deals as they
// stand now instead of the daily 14-day averages.
//
// Who does what:
// - scripts/market-live.mjs (GitHub Actions, .github/workflows/market-live.yml) asks AODP for
//   the prices (and every few hours the sales volume) and POSTs the result to /api/market/ingest.
//   The fetching runs on GitHub, not in a Vercel function: no 60 s limit, no Vercel CPU time.
// - /api/market/ingest (ACTIONS_CRON_SECRET) stores it in public.market_live, one row per region.
// - /api/market/live hands the snapshot to premium players only (hasPremium in billing.js).
//
// AODP has no order quantities (no order book), only the best prices and when they were seen;
// the volume is what the market history says was sold per day.

/** The markets of a snapshot, in the order every price array uses. */
export const LIVE_LOCATIONS = ["Black Market", "Caerleon", "Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford", "Brecilien"];

const HOSTS = { eu: "europe", us: "west" };
export const LIVE_REGIONS = Object.keys(HOSTS);
const USER_AGENT = "BlackmarketReader/1.0 (+https://blackmarketreader.com)";

/** Item ids per AODP request (the URL stays well below its length limit). */
export const LIVE_CHUNK = 100;
/** Orders older than this are left out: they are probably filled or cancelled by now. */
const PRICE_FRESH_MS = 72 * 3600 * 1000;
/** The sales volume is the average of this many days. */
const VOLUME_DAYS = 7;
const ITEM_ID = /^T[4-8]_[A-Z0-9_]{2,80}(@[1-4])?$/;
const BM = 0;

/** Every dashboard item: the base codes of Data/ItemList.json in tiers 4-8, enchantments 0-4. */
export function liveItemIds(baseCodes) {
  const ids = [];
  for (const base of baseCodes) {
    for (let tier = 4; tier <= 8; tier += 1) {
      for (let enchant = 0; enchant <= 4; enchant += 1) ids.push(`T${tier}_${base}${enchant ? `@${enchant}` : ""}`);
    }
  }
  return ids;
}

const JOURNALS = ["WARRIOR", "HUNTER", "MAGE", "TOOLMAKER"];
const REFINED = ["METALBAR", "PLANKS", "CLOTH", "LEATHER"];

/**
 * Every id a snapshot covers: the dashboard items (Data/ItemList.json) plus what the crafting tools
 * price (public/items-categorized-crafting.json): all recipe items, their artefacts, the refined
 * materials and the journals.
 */
export function allLiveIds(baseCodes, recipes) {
  const items = (recipes?.categories ?? []).flatMap((c) => c.items ?? []);
  const ids = new Set(liveItemIds([...new Set([...baseCodes, ...items.map((i) => i.id).filter(Boolean)])]));
  for (let tier = 4; tier <= 8; tier += 1) {
    for (const artefact of new Set(items.map((i) => i.artifactId).filter(Boolean))) ids.add(`T${tier}_${artefact}`);
    for (const base of REFINED) for (let e = 0; e <= 4; e += 1) ids.add(e ? `T${tier}_${base}_LEVEL${e}@${e}` : `T${tier}_${base}`);
    ids.add(`T${tier}_STONEBLOCK`);
    for (const kind of JOURNALS) for (const state of ["EMPTY", "FULL"]) ids.add(`T${tier}_JOURNAL_${kind}_${state}`);
  }
  return [...ids];
}

const stampMs = (stamp) => Date.parse(/[zZ]$/.test(String(stamp)) ? stamp : `${stamp}Z`);
/** Times in a snapshot are whole minutes since 1970 (smaller than ISO strings, enough precision). */
const toMinute = (ms) => Math.round(ms / 60000);

/**
 * AODP price rows -> { [itemId]: cells }, one cell per LIVE_LOCATIONS entry: 0 for nothing, else
 * [sell, sellAt, buy, buyAt] (0 where that side is missing). sell: the cheapest sell order of any
 * quality (what buying costs); buy: the best quality-1 buy order (what selling instantly pays,
 * any quality fills it). A city listing above 1.5x the cities' median is dropped, so one stale
 * listing does not make a fake deal.
 */
export function parseLivePrices(rows, now = new Date()) {
  const fresh = (price, stamp) => {
    const ms = stampMs(stamp);
    return price > 0 && Number.isFinite(ms) && now.getTime() - ms <= PRICE_FRESH_MS ? ms : 0;
  };
  const items = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row?.item_id || "");
    const at = LIVE_LOCATIONS.indexOf(row?.city);
    if (!ITEM_ID.test(id) || at < 0) continue;
    const cells = items.get(id) || LIVE_LOCATIONS.map(() => [0, 0, 0, 0]);
    const cell = cells[at];
    const sell = Number(row.sell_price_min);
    const sellMs = fresh(sell, row.sell_price_min_date);
    if (sellMs && (!cell[0] || sell < cell[0])) [cell[0], cell[1]] = [sell, toMinute(sellMs)];
    const buy = Number(row.buy_price_max);
    const buyMs = Number(row.quality) === 1 ? fresh(buy, row.buy_price_max_date) : 0;
    if (buyMs && buy > cell[2]) [cell[2], cell[3]] = [buy, toMinute(buyMs)];
    items.set(id, cells);
  }
  const out = {};
  for (const [id, cells] of items) {
    const listed = cells.filter((cell, at) => at !== BM && cell[0]).map((cell) => cell[0]).sort((a, b) => a - b);
    if (listed.length) {
      const cap = listed[Math.floor((listed.length - 1) / 2)] * 1.5;
      for (const cell of cells) if (cell[0] > cap) [cell[0], cell[1]] = [0, 0];
    }
    if (cells.every((cell) => !cell[0] && !cell[2])) continue;
    out[id] = cells.map((cell) => (cell[0] || cell[2] ? cell : 0));
  }
  return out;
}

/**
 * AODP daily history rows -> { [itemId]: cells }, one per LIVE_LOCATIONS entry: 0 or
 * [soldPerDay, avgPrice] over the last VOLUME_DAYS days, all qualities together.
 */
export function parseLiveVolume(rows, now = new Date()) {
  const since = now.getTime() - VOLUME_DAYS * 86400000;
  const sums = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row?.item_id || "");
    const at = LIVE_LOCATIONS.indexOf(row?.location);
    if (!ITEM_ID.test(id) || at < 0 || !Array.isArray(row.data)) continue;
    const cells = sums.get(id) || LIVE_LOCATIONS.map(() => [0, 0]);
    for (const point of row.data) {
      const count = Number(point?.item_count);
      const price = Number(point?.avg_price);
      if (!(count > 0) || !(price > 0) || !(stampMs(point.timestamp) >= since)) continue;
      cells[at][0] += count;
      cells[at][1] += count * price;
    }
    sums.set(id, cells);
  }
  const out = {};
  for (const [id, cells] of sums) {
    if (cells.every(([count]) => !count)) continue;
    out[id] = cells.map(([count, silver]) => (count ? [Math.round((count / VOLUME_DAYS) * 10) / 10, Math.round(silver / count)] : 0));
  }
  return out;
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** GET an AODP url as JSON with gzip (AODP throttles clients without it), retried on 429/5xx. */
async function aodpJson(url, { fetchImpl = fetch, retries = 3, wait = pause } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate", Accept: "application/json" },
      signal: AbortSignal.timeout(20000)
    });
    if (response.ok) return response.json();
    if (attempt >= retries || !(response.status === 429 || response.status >= 500)) throw new Error(`AODP ${response.status} for ${url.slice(0, 120)}`);
    await wait(response.status === 429 ? 30000 * (attempt + 1) : 3000 * (attempt + 1));
  }
}

/**
 * Asks AODP for every id in chunks, `concurrency` at a time with a short pause between rounds (be
 * nice to the community server). part "prices" (all qualities) or "volume" (daily history). Returns
 * the raw rows.
 */
export async function fetchRows(region, ids, part, { fetchImpl = fetch, wait = pause, gapMs = 150, concurrency = 1 } = {}) {
  const host = HOSTS[region];
  if (!host) throw new Error(`unknown region ${region}`);
  const locations = encodeURIComponent(LIVE_LOCATIONS.join(","));
  const urls = [];
  for (let i = 0; i < ids.length; i += LIVE_CHUNK) {
    const chunk = ids.slice(i, i + LIVE_CHUNK).map(encodeURIComponent).join(",");
    urls.push(
      part === "prices"
        ? `https://${host}.albion-online-data.com/api/v2/stats/prices/${chunk}.json?locations=${locations}`
        : `https://${host}.albion-online-data.com/api/v2/stats/history/${chunk}?locations=${locations}&time-scale=24`
    );
  }
  const rows = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const bodies = await Promise.all(urls.slice(i, i + concurrency).map((url) => aodpJson(url, { fetchImpl, wait })));
    for (const body of bodies) if (Array.isArray(body)) rows.push(...body);
    if (gapMs) await wait(gapMs);
  }
  return rows;
}

/** fetchRows, parsed into a snapshot part. */
export async function fetchLive(region, ids, part, { now = new Date(), ...opts } = {}) {
  const rows = await fetchRows(region, ids, part, opts);
  return part === "prices" ? parseLivePrices(rows, now) : parseLiveVolume(rows, now);
}

/** The bounds an ingested snapshot must stay in (a broken job must not store garbage). */
const MAX_ITEMS = 20000;

function validCells(map, width) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return false;
  const entries = Object.entries(map);
  if (entries.length > MAX_ITEMS) return false;
  return entries.every(
    ([id, cells]) =>
      ITEM_ID.test(id) &&
      Array.isArray(cells) &&
      cells.length === LIVE_LOCATIONS.length &&
      cells.every((cell) => cell === 0 || (Array.isArray(cell) && cell.length === width && cell.every((n) => Number.isFinite(n) && n >= 0)))
  );
}

/**
 * /api/market/<action>:
 * - POST ingest {region, prices?, volume?}: the GitHub job stores a snapshot part (actions secret)
 * - GET live?region=: the latest snapshot, premium players only
 * deps: store (read / write), actionsSecret, userFromToken, premium(userId), now()
 */
export async function handleMarket(action, req, deps) {
  if (action === "ingest") {
    if (req.method !== "POST") return { status: 405, body: { error: "POST only" }, maxAge: 0 };
    if (!deps.actionsSecret || req.token !== deps.actionsSecret) return { status: 401, body: { error: "not allowed" }, maxAge: 0 };
    const body = req.body ?? {};
    if (!LIVE_REGIONS.includes(body.region)) return { status: 400, body: { error: "region must be eu or us" }, maxAge: 0 };
    const { prices, volume } = body;
    if (prices === undefined && volume === undefined) return { status: 400, body: { error: "nothing to store" }, maxAge: 0 };
    if ((prices !== undefined && !validCells(prices, 4)) || (volume !== undefined && !validCells(volume, 2))) {
      return { status: 400, body: { error: "bad snapshot" }, maxAge: 0 };
    }
    if (!deps.store) return { status: 503, body: { error: "storage not configured" }, maxAge: 0 };
    const at = deps.now().toISOString();
    await deps.store.write(body.region, { ...(prices ? { prices, pricesAt: at } : {}), ...(volume ? { volume, volumeAt: at } : {}) });
    return {
      status: 200,
      body: { region: body.region, prices: prices ? Object.keys(prices).length : null, volume: volume ? Object.keys(volume).length : null },
      maxAge: 0
    };
  }

  if (action === "live") {
    if (req.method !== "GET") return { status: 405, body: { error: "GET only" }, maxAge: 0 };
    const region = String(req.query?.region ?? "");
    if (!LIVE_REGIONS.includes(region)) return { status: 400, body: { error: "region must be eu or us" }, maxAge: 0 };
    const user = req.token ? await deps.userFromToken(req.token) : null;
    if (!user) return { status: 401, body: { error: "Sign in to see the live market." }, maxAge: 0 };
    if (!deps.premium || !(await deps.premium(user.id))) return { status: 403, body: { error: "The live market is part of premium." }, maxAge: 0 };
    const row = deps.store ? await deps.store.read(region) : null;
    if (!row?.prices) return { status: 404, body: { error: "No live snapshot yet, the next one comes within 30 minutes." }, maxAge: 0 };
    // premium data: never cached by the CDN (sendResult sends no-store for maxAge 0)
    return {
      status: 200,
      body: {
        region,
        locations: LIVE_LOCATIONS,
        pricesAt: row.pricesAt,
        volumeAt: row.volumeAt ?? null,
        prices: row.prices,
        volume: row.volume ?? {}
      },
      maxAge: 0
    };
  }

  return { status: 404, body: { error: "unknown action" }, maxAge: 0 };
}

/** public.market_live in Supabase (service role only: RLS on, no policies). */
export function createMarketStore(db) {
  return {
    async read(region) {
      const { data, error } = await db.from("market_live").select("prices, prices_at, volume, volume_at").eq("region", region).maybeSingle();
      if (error) throw error;
      return data ? { prices: data.prices, pricesAt: data.prices_at, volume: data.volume, volumeAt: data.volume_at } : null;
    },
    async write(region, part) {
      const row = { region };
      if (part.prices) Object.assign(row, { prices: part.prices, prices_at: part.pricesAt });
      if (part.volume) Object.assign(row, { volume: part.volume, volume_at: part.volumeAt });
      const { error } = await db.from("market_live").upsert(row, { onConflict: "region" });
      if (error) throw error;
    }
  };
}

/** The same in memory, for tests and `npm run dev`. */
export function createMemoryMarketStore() {
  const rows = new Map();
  return {
    async read(region) {
      return rows.get(region) ?? null;
    },
    async write(region, part) {
      rows.set(region, { ...(rows.get(region) ?? {}), ...part });
    }
  };
}
