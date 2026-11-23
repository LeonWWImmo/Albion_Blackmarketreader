// Where the City Crafter's prices come from: the live snapshot (every 30 minutes, premium), the
// daily data the free tools use (public/data, once a day), or live filled with daily where the
// snapshot has no price. Every quote keeps its source and age.
import { cellOf, LIVE_MAX_AGE_MIN, type LiveSnapshot } from "@shared/live/liveData";

export type Quote = { unit: number; at: number; src: "live" | "daily" };

export interface PriceBook {
  /** the cheapest sell order: what buying instantly costs */
  sell(id: string, city: string): Quote | null;
  /** the best buy order: what selling instantly pays */
  order(id: string, city: string): Quote | null;
  /** sold a day (7-day average) and the average price */
  volume(id: string, city: string): { sold: number; avg: number };
}

const NO_VOLUME = { sold: 0, avg: 0 };

function volumeOf(snap: LiveSnapshot | null, id: string, city: string) {
  const at = snap ? snap.locations.indexOf(city) : -1;
  const cell = at < 0 ? 0 : snap?.volume[id]?.[at];
  return cell ? { sold: cell[0], avg: cell[1] } : NO_VOLUME;
}

/** The live snapshot; prices older than LIVE_MAX_AGE_MIN count as missing. */
export function liveBook(snap: LiveSnapshot, now: number): PriceBook {
  const quote = (price: number, at: number): Quote | null => (price > 0 && now - at <= LIVE_MAX_AGE_MIN ? { unit: price, at, src: "live" } : null);
  return {
    sell(id, city) {
      const cell = cellOf(snap, id, city);
      return cell ? quote(cell[0], cell[1]) : null;
    },
    order(id, city) {
      const cell = cellOf(snap, id, city);
      return cell ? quote(cell[2], cell[3]) : null;
    },
    volume: (id, city) => volumeOf(snap, id, city)
  };
}

/** The daily files: id -> city -> cheapest sell order (no buy orders), and when they were made. */
export type DailyPrices = { at: number; prices: Map<string, Record<string, number>> };

type CityRows = { generatedAt?: string; items?: Array<{ itemId?: string; prices?: Record<string, number> }> };
type ArtefactRows = { generatedAt?: string; items?: Array<{ itemId?: string; city?: string; price?: number }> };

/** public/data crafting-results-*, materials-cities-* and artefacts-* in one map. */
export function dailyFromFiles(results: CityRows, materials: CityRows, artefacts: ArtefactRows): DailyPrices {
  const prices = new Map<string, Record<string, number>>();
  for (const file of [results, materials]) {
    for (const row of file.items ?? []) if (row.itemId && row.prices) prices.set(row.itemId, { ...(prices.get(row.itemId) ?? {}), ...row.prices });
  }
  for (const row of artefacts.items ?? []) {
    if (!row.itemId || !row.city || !(Number(row.price) > 0)) continue;
    prices.set(row.itemId, { ...(prices.get(row.itemId) ?? {}), [row.city]: Number(row.price) });
  }
  const stamps = [results, materials, artefacts].map((f) => Date.parse(f.generatedAt ?? "")).filter(Number.isFinite);
  return { at: Math.round((stamps.length ? Math.min(...stamps) : Date.now()) / 60000), prices };
}

/** The daily data (sell orders only); the sales still come from the snapshot when there is one. */
export function dailyBook(daily: DailyPrices, snap: LiveSnapshot | null): PriceBook {
  return {
    sell(id, city) {
      const price = Number(daily.prices.get(id)?.[city]) || 0;
      return price > 0 ? { unit: price, at: daily.at, src: "daily" } : null;
    },
    order: () => null,
    volume: (id, city) => volumeOf(snap, id, city)
  };
}

/** Live first, the other book where live has nothing. */
export function mixBook(live: PriceBook, fill: PriceBook): PriceBook {
  return {
    sell: (id, city) => live.sell(id, city) ?? fill.sell(id, city),
    order: (id, city) => live.order(id, city) ?? fill.order(id, city),
    volume: (id, city) => live.volume(id, city)
  };
}
