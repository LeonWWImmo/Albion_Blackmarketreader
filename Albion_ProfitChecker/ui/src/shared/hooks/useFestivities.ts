import { useEffect, useMemo, useRef, useState } from "react";
import {
  activeCraftBonuses,
  weeklyEvents,
  type CraftBonus,
  type FestivitiesSnapshot,
  type WeeklyEvent
} from "../albion/festivities";

export type FestivitiesState = {
  /** "loading" until the first answer, "error" when the snapshot could not be loaded. */
  readonly status: "loading" | "ready" | "error";
  /** Whether AODP has a confirmed snapshot for this server right now. */
  readonly confirmed: boolean;
  readonly craftBonuses: ReadonlyArray<CraftBonus>;
  readonly weekly: ReadonlyArray<WeeklyEvent>;
  /** Clock the lists were computed for (ms); ticks every minute so countdowns stay current. */
  readonly now: number;
};

/** The server caches for 10 minutes; asking more often only returns the same snapshot. */
const CACHE_MS = 10 * 60 * 1000;
const TICK_MS = 60 * 1000;
/** After a failed load, try again this soon rather than waiting out the whole cache time. */
const RETRY_MS = 60 * 1000;
const STORAGE_PREFIX = "festivities:";

type Cached = { at: number; snapshot: FestivitiesSnapshot };

// One request per region per page load, shared by every component that asks.
const inflight = new Map<string, Promise<FestivitiesSnapshot>>();

/** The stored snapshot with the time it was fetched, so its age carries over to the next page. */
function readCache(region: string, now: number): Cached | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + region);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Cached;
    if (!cached || typeof cached.at !== "number" || now - cached.at > CACHE_MS || !Array.isArray(cached.snapshot?.events)) return null;
    return cached;
  } catch {
    return null;
  }
}

function writeCache(region: string, snapshot: FestivitiesSnapshot) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + region, JSON.stringify({ at: Date.now(), snapshot } satisfies Cached));
  } catch {
    // storage blocked: the next page simply asks again
  }
}

function fetchSnapshot(region: string): Promise<FestivitiesSnapshot> {
  const pending = inflight.get(region);
  if (pending) return pending;
  const request = fetch(`/api/aodp/festivities?region=${encodeURIComponent(region)}`, { headers: { Accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) throw new Error(`festivities: HTTP ${response.status}`);
      const body = (await response.json()) as FestivitiesSnapshot;
      if (!body || !Array.isArray(body.events)) throw new Error("festivities: bad response");
      writeCache(region, body);
      return body;
    })
    .finally(() => inflight.delete(region));
  inflight.set(region, request);
  return request;
}

/**
 * Today's crafting bonuses and the weekly events for a server region. Nothing is guessed: when AODP
 * has no confirmed snapshot (it needs several players reporting the same events), the lists stay
 * empty and `confirmed` is false, so the tools fall back to the manual setting.
 */
export function useFestivities(region: "eu" | "us"): FestivitiesState {
  const [now, setNow] = useState(() => Date.now());
  const [loaded, setLoaded] = useState<{ region: string; snapshot: FestivitiesSnapshot | null; failed: boolean; at: number }>(() => {
    const cached = readCache(region, Date.now());
    return { region, snapshot: cached?.snapshot ?? null, failed: false, at: cached?.at ?? Date.now() };
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Load on region change, and again once the cached answer is older than the server's cache
  // (this also picks up the new bonuses after the daily reset on a page left open).
  const stale = loaded.region !== region || now - loaded.at > CACHE_MS;
  useEffect(() => {
    if (!stale && (loaded.snapshot || loaded.failed)) return;
    let cancelled = false;
    const cached = readCache(region, Date.now());
    if (cached && loaded.region !== region) {
      setLoaded({ region, snapshot: cached.snapshot, failed: false, at: cached.at });
      return;
    }
    fetchSnapshot(region)
      .then((snapshot) => {
        if (!cancelled) setLoaded({ region, snapshot, failed: false, at: Date.now() });
      })
      .catch(() => {
        // counted as already old, so the next try comes after RETRY_MS instead of a full CACHE_MS
        if (!cancelled) {
          setLoaded((prev) => ({
            region,
            snapshot: prev.region === region ? prev.snapshot : null,
            failed: true,
            at: Date.now() - CACHE_MS + RETRY_MS
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [region, stale, loaded.region, loaded.snapshot, loaded.failed]);

  // The lists are rebuilt every minute for the countdowns, but keep their identity while their
  // content is unchanged, so tables that depend on the bonuses do not recompute each tick.
  const lastLists = useRef<{ key: string; craftBonuses: CraftBonus[]; weekly: WeeklyEvent[] } | null>(null);

  return useMemo(() => {
    const snapshot = loaded.region === region ? loaded.snapshot : null;
    const status: FestivitiesState["status"] = snapshot ? "ready" : loaded.region === region && loaded.failed ? "error" : "loading";
    const craftBonuses = activeCraftBonuses(snapshot, now);
    const weekly = weeklyEvents(snapshot, now);
    const key = JSON.stringify([craftBonuses, weekly]);
    if (lastLists.current?.key !== key) lastLists.current = { key, craftBonuses, weekly };
    return {
      status,
      confirmed: Boolean(snapshot?.confirmed),
      craftBonuses: lastLists.current.craftBonuses,
      weekly: lastLists.current.weekly,
      now
    };
  }, [loaded, region, now]);
}
