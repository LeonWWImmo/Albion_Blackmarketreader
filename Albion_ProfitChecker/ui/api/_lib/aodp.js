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

async function remembered(key, load) {
  const hit = memory.get(key);
  if (hit && hit.until > Date.now()) return hit.result;
  const result = await load();
  const ttl = result.status === 200 ? result.maxAge : result.status >= 500 ? FAILURE_TTL_S : 0;
  if (ttl > 0) memory.set(key, { until: Date.now() + ttl * 1000, result });
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
