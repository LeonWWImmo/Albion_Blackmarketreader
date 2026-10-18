import { useEffect, useState } from "react";
import type { GoldPoint } from "./goldStats";

export type GoldRegion = "eu" | "us";

export type GoldHistory = {
  readonly region: GoldRegion;
  readonly fetchedAt: string;
  readonly points: ReadonlyArray<GoldPoint>;
};

export type GoldHistoryState = {
  readonly status: "loading" | "ready" | "error";
  readonly data: GoldHistory | null;
};

/** The server caches the history for 10 minutes; AODP itself updates it hourly. */
const CACHE_MS = 10 * 60 * 1000;
const STORAGE_PREFIX = "gold-history:";

const inflight = new Map<GoldRegion, Promise<GoldHistory>>();

function isValid(body: unknown): body is GoldHistory {
  const value = body as GoldHistory | null;
  return Boolean(
    value &&
      Array.isArray(value.points) &&
      value.points.length > 0 &&
      value.points.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  );
}

function readCache(region: GoldRegion): GoldHistory | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + region);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { at: number; data: unknown };
    if (!cached || typeof cached.at !== "number" || Date.now() - cached.at > CACHE_MS || !isValid(cached.data)) return null;
    return cached.data;
  } catch {
    return null;
  }
}

function writeCache(region: GoldRegion, data: GoldHistory) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + region, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // storage full or blocked: the next visit simply loads again
  }
}

/** `fresh` skips this browser's copy (a timed refresh or "try again"); the server cache still applies. */
export function fetchGoldHistory(region: GoldRegion, fresh = false): Promise<GoldHistory> {
  const cached = fresh ? null : readCache(region);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(region);
  if (pending) return pending;
  const request = fetch(`/api/aodp/gold?region=${region}`, { headers: { Accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) throw new Error(`gold: HTTP ${response.status}`);
      const body: unknown = await response.json();
      if (!isValid(body)) throw new Error("gold: bad response");
      writeCache(region, body);
      return body;
    })
    .finally(() => inflight.delete(region));
  inflight.set(region, request);
  return request;
}

/**
 * Hourly gold price history (about 90 days) for one server. `refreshKey` reloads it, e.g. on a
 * timer, so a page left open keeps up with the hourly updates.
 */
export function useGoldHistory(region: GoldRegion, refreshKey = 0): GoldHistoryState {
  const [state, setState] = useState<{ region: GoldRegion; status: GoldHistoryState["status"]; data: GoldHistory | null }>(() => {
    const cached = readCache(region);
    return { region, status: cached ? "ready" : "loading", data: cached };
  });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => (prev.region === region ? prev : { region, status: "loading", data: null }));
    fetchGoldHistory(region, refreshKey > 0)
      .then((data) => {
        if (!cancelled) setState({ region, status: "ready", data });
      })
      .catch(() => {
        // Keep showing what we had for this region; only report the failure when there is nothing.
        if (!cancelled) setState((prev) => (prev.region === region && prev.data ? prev : { region, status: "error", data: null }));
      });
    return () => {
      cancelled = true;
    };
  }, [region, refreshKey]);

  return state.region === region ? { status: state.status, data: state.data } : { status: "loading", data: null };
}
