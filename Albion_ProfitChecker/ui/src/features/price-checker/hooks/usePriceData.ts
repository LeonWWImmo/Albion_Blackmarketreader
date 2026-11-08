import { useCallback, useEffect, useState } from "react";
import { assetUrl } from "@shared/assets/assets";
import type { Region } from "@shared/types";
import { buildItemIndex, type ItemIndex, type ItemRow } from "../core/items";
import type { HistorySeries } from "../core/history";
import type { QuoteRow } from "../core/quotes";

let indexRequest: Promise<ItemIndex> | null = null;

/** The item list, fetched once per visit and shared by every component that needs it. */
export function loadItemIndex(): Promise<ItemIndex> {
  indexRequest ??= fetch(assetUrl("data/items-index.json"))
    .then((res) => {
      if (!res.ok) throw new Error(`items index: HTTP ${res.status}`);
      return res.json() as Promise<ItemRow[]>;
    })
    .then(buildItemIndex)
    .catch((error) => {
      indexRequest = null;
      throw error;
    });
  return indexRequest;
}

export function useItemIndex(): { index: ItemIndex | null; failed: boolean } {
  const [index, setIndex] = useState<ItemIndex | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadItemIndex()
      .then((loaded) => alive && setIndex(loaded))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  return { index, failed };
}

export type Loaded<T> = { data: T | null; status: "idle" | "loading" | "ready" | "error"; retry: () => void };

/** GETs a JSON url; a new url drops the old answer, so another item or region never shows stale numbers. */
function useJson<T>(url: string | null): Loaded<T> {
  const [state, setState] = useState<{ url: string | null; data: T | null; status: Loaded<T>["status"] }>({ url: null, data: null, status: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) {
      setState({ url, data: null, status: "idle" });
      return;
    }
    const controller = new AbortController();
    setState((prev) => ({ url, data: prev.url === url ? prev.data : null, status: "loading" }));
    fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<T>;
      })
      .then((data) => setState({ url, data, status: "ready" }))
      .catch((error) => {
        if (!controller.signal.aborted) setState((prev) => ({ ...prev, status: "error" }));
        return error;
      });
    return () => controller.abort();
  }, [url, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { data: state.url === url ? state.data : null, status: state.url === url ? state.status : url ? "loading" : "idle", retry };
}

export type QuotesResponse = { region: Region; fetchedAt: string; quotes: QuoteRow[] };
export type HistoryResponse = { region: Region; fetchedAt: string; id: string; scale: number; series: HistorySeries[] };

/** Every market's orders for an item's enchantment levels (at most five ids). */
export const useQuotes = (region: Region, ids: string[]) =>
  useJson<QuotesResponse>(ids.length ? `/api/aodp/quotes?region=${region}&ids=${encodeURIComponent(ids.join(","))}` : null);

/** Average price and items sold per market over time; scale 24 = daily for a month, 6 = four a day. */
export const useHistory = (region: Region, id: string | null, scale: 6 | 24) =>
  useJson<HistoryResponse>(id ? `/api/aodp/history?region=${region}&id=${encodeURIComponent(id)}&scale=${scale}` : null);

/** The current time in unix seconds, ticking once a minute so "12m ago" labels stay right. */
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * A short list kept in this browser (watchlist, recently viewed). Storage can be blocked or full:
 * the list then simply lives for the visit.
 */
export function useStoredList<T>(
  key: string,
  max: number,
  same: (a: T, b: T) => boolean,
  valid: (value: unknown) => value is T
): [T[], (item: T) => void, (item: T) => void] {
  const [items, setItems] = useState<T[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed.filter(valid).slice(0, max) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {
      // storage blocked or full: keep the list for this visit only
    }
  }, [key, items]);
  // `same` and `valid` must be stable functions (defined outside the component)
  const add = useCallback((item: T) => setItems((prev) => [item, ...prev.filter((p) => !same(p, item))].slice(0, max)), [max, same]);
  const remove = useCallback((item: T) => setItems((prev) => prev.filter((p) => !same(p, item))), [same]);
  return [items, add, remove];
}
