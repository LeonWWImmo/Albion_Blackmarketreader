// Live prices for the tools (premium): the 30-minute market snapshot (api/_lib/marketLive.js,
// /api/market/live) next to the daily data the tools load from public/data. Three modes:
// - daily: only the daily data (free, what the tools always showed)
// - live:  only live prices; a price the snapshot has not got stays empty
// - fill:  live where the snapshot has a price, the daily one for the rest
// Every merged price keeps its source, so the tools can mark which is which.
import { useCallback, useEffect, useState } from "react";
import { accessToken, premiumVisible } from "@shared/premium/premium";

export type LiveMode = "daily" | "live" | "fill";
export type PriceSource = "live" | "daily";

/** One market of one item: 0, or [sell, sellAt, buy, buyAt] (silver; minutes since 1970). */
export type LiveCell = 0 | [number, number, number, number];
export type LiveSnapshot = {
  region: string;
  locations: string[];
  pricesAt: string;
  volumeAt: string | null;
  prices: Record<string, LiveCell[]>;
  volume: Record<string, Array<0 | [number, number]>>;
};

export type LiveStatus =
  | { kind: "off" }
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "locked" }
  | { kind: "error"; message: string }
  | { kind: "ok"; snap: LiveSnapshot };

export const BLACK_MARKET = "Black Market";
/** A live price older than this counts as missing: AODP keeps orders long after they are gone. */
export const LIVE_MAX_AGE_MIN = 24 * 60;
/** A loaded snapshot is used this long before it is asked for again (a new one comes every 30 min). */
const KEEP_MS = 5 * 60_000;

const cache = new Map<string, { at: number; status: Promise<LiveStatus> }>();

async function fetchLive(region: string): Promise<LiveStatus> {
  const token = await accessToken();
  if (!token) return { kind: "guest" };
  const res = await fetch(`/api/market/live?region=${region}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => null);
  if (res.status === 401) return { kind: "guest" };
  if (res.status === 403) return { kind: "locked" };
  if (!res.ok || !data?.prices) return { kind: "error", message: data?.error || "Live prices could not load." };
  return { kind: "ok", snap: data as LiveSnapshot };
}

/** The region's snapshot, shared by every tool on the page and kept for a few minutes. */
export function loadLive(region: string): Promise<LiveStatus> {
  const hit = cache.get(region);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.status;
  const status = fetchLive(region).catch((): LiveStatus => ({ kind: "error", message: "Live prices could not load." }));
  cache.set(region, { at: Date.now(), status });
  // a failed answer is not kept
  void status.then((s) => s.kind !== "ok" && cache.delete(region));
  return status;
}

const nowMinute = () => Math.round(Date.now() / 60000);

/** One market's raw cell of an item (0 when the snapshot has nothing there). */
export function cellOf(snap: LiveSnapshot, id: string, market: string): LiveCell {
  const at = snap.locations.indexOf(market);
  return at < 0 ? 0 : (snap.prices[id]?.[at] ?? 0);
}

/** The cheapest sell order in a market (what buying costs), when the snapshot has a recent one. */
export function liveSell(snap: LiveSnapshot, id: string, market: string, now = nowMinute()): number {
  const cell = cellOf(snap, id, market);
  return cell && cell[0] > 0 && now - cell[1] <= LIVE_MAX_AGE_MIN ? cell[0] : 0;
}

/** The best buy order in a market (what selling instantly pays; the Black Market's price). */
export function liveBuy(snap: LiveSnapshot, id: string, market: string, now = nowMinute()): number {
  const cell = cellOf(snap, id, market);
  return cell && cell[2] > 0 && now - cell[3] <= LIVE_MAX_AGE_MIN ? cell[2] : 0;
}

export type Merged = { price: number; source: PriceSource | null };

/** One price in a mode: the live one, the daily one, or (fill) live first. */
export function pick(mode: LiveMode, live: number, daily: number): Merged {
  if (mode === "daily") return { price: daily, source: daily > 0 ? "daily" : null };
  if (live > 0) return { price: live, source: "live" };
  if (mode === "fill" && daily > 0) return { price: daily, source: "daily" };
  return { price: 0, source: null };
}

/**
 * A per-city price record ({ "Martlock": 1200, ... }) in a mode: the sell orders of the snapshot over
 * (fill) or instead of (live) the daily ones, with each city's source.
 */
export function mergeCities(
  daily: Record<string, number> | undefined,
  snap: LiveSnapshot,
  id: string,
  cities: readonly string[],
  mode: LiveMode,
  now = nowMinute()
): { prices: Record<string, number>; sources: Record<string, PriceSource> } {
  const prices: Record<string, number> = {};
  const sources: Record<string, PriceSource> = {};
  for (const city of new Set([...cities, ...Object.keys(daily ?? {})])) {
    const merged = pick(mode, cities.includes(city) ? liveSell(snap, id, city, now) : 0, Number(daily?.[city]) || 0);
    if (merged.source) {
      prices[city] = merged.price;
      sources[city] = merged.source;
    }
  }
  return { prices, sources };
}

export type SourceRecord = Record<string, PriceSource>;

/** A whole map of per-city records in a mode; daily (or no snapshot): the same map, no sources. */
export function mergeCityMap(
  daily: Map<string, Record<string, number>>,
  snap: LiveSnapshot | null,
  mode: LiveMode,
  cities: readonly string[],
  now = nowMinute()
): { prices: Map<string, Record<string, number>>; sources: Map<string, SourceRecord> | null } {
  if (!snap || mode === "daily") return { prices: daily, sources: null };
  const prices = new Map<string, Record<string, number>>();
  const sources = new Map<string, SourceRecord>();
  for (const [id, record] of daily) {
    const merged = mergeCities(record, snap, id, cities, mode, now);
    prices.set(id, merged.prices);
    sources.set(id, merged.sources);
  }
  return { prices, sources };
}

/**
 * One price per item in a mode, e.g. the Black Market's: the snapshot's best buy order there (all
 * the items it has) over (fill) or instead of (live) the daily map.
 */
export function mergeBuyMap(
  daily: Map<string, number>,
  snap: LiveSnapshot | null,
  mode: LiveMode,
  market: string,
  now = nowMinute()
): { prices: Map<string, number>; sources: Map<string, PriceSource> | null } {
  if (!snap || mode === "daily") return { prices: daily, sources: null };
  const prices = new Map<string, number>();
  const sources = new Map<string, PriceSource>();
  for (const id of new Set([...daily.keys(), ...Object.keys(snap.prices)])) {
    const merged = pick(mode, liveBuy(snap, id, market, now), daily.get(id) ?? 0);
    if (!merged.source) continue;
    prices.set(id, merged.price);
    sources.set(id, merged.source);
  }
  return { prices, sources };
}

/** Where a looked-up price came from: the asked city's source, else that of a city with this price. */
export function sourceOf(record: Record<string, number> | undefined, sources: SourceRecord | undefined, city: string, price: number): PriceSource | undefined {
  if (!record || !sources || !(price > 0)) return undefined;
  if (record[city] === price && sources[city]) return sources[city];
  for (const [name, value] of Object.entries(record)) if (value === price && sources[name]) return sources[name];
  return undefined;
}

/**
 * A flat price list (item id -> price, as the refining and food calculators keep it) in a mode:
 * each id in `cityOf` gets the snapshot's cheapest sell order in its city (the buy city for what is
 * bought, the sell city for what is sold) over or instead of the daily price. Ids without a city
 * stay as they are.
 */
export function overlayLive(
  daily: Record<string, number>,
  cityOf: ReadonlyMap<string, string>,
  snap: LiveSnapshot | null,
  mode: LiveMode,
  now = nowMinute()
): { prices: Record<string, number>; sources: Record<string, PriceSource> } {
  if (!snap || mode === "daily") return { prices: daily, sources: {} };
  const prices = { ...daily };
  const sources: Record<string, PriceSource> = {};
  for (const [id, city] of cityOf) {
    const merged = pick(mode, liveSell(snap, id, city, now), Number(daily[id]) || 0);
    prices[id] = merged.price;
    if (merged.source) sources[id] = merged.source;
  }
  return { prices, sources };
}

const MODE_KEY = (tool: string) => `bmr-live-mode-${tool}`;

function storedMode(tool: string): LiveMode {
  if (!premiumVisible()) return "daily";
  try {
    const saved = localStorage.getItem(MODE_KEY(tool));
    return saved === "live" || saved === "fill" ? saved : "daily";
  } catch {
    return "daily";
  }
}

/**
 * The tool's price mode (remembered per tool) and, outside daily, the snapshot. `active` is the
 * mode that applies: daily while the snapshot is not there (signed out, no premium, loading).
 */
export function useLiveMode(tool: string, region: string) {
  const [mode, setModeState] = useState<LiveMode>(() => storedMode(tool));
  const [status, setStatus] = useState<LiveStatus>({ kind: "off" });

  useEffect(() => {
    if (mode === "daily") {
      setStatus({ kind: "off" });
      return;
    }
    let alive = true;
    setStatus({ kind: "loading" });
    void loadLive(region).then((next) => alive && setStatus(next));
    return () => {
      alive = false;
    };
  }, [mode, region]);

  const setMode = useCallback(
    (next: LiveMode) => {
      setModeState(next);
      try {
        localStorage.setItem(MODE_KEY(tool), next);
      } catch {
        /* private mode: not remembered */
      }
    },
    [tool]
  );

  const snap = status.kind === "ok" ? status.snap : null;
  return { mode, setMode, status, snap, active: snap ? mode : ("daily" as LiveMode) };
}
