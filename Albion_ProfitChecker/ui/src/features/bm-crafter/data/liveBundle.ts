// Premium live prices in the BM Crafter: the daily bundle with the 30-minute snapshot's prices put in
// (src/shared/live/liveData.ts). Black Market price: the best buy order there now; materials: the
// cheapest sell order per city; artefacts: the cheapest sell order anywhere. Live mode also lists
// craftable items the daily file does not have (it only keeps the 14-day winners).
import { BLACK_MARKET, mergeCityMap, pick, liveSell, mergeBuyMap, type LiveMode, type LiveSnapshot, type PriceSource, type SourceRecord } from "@shared/live/liveData";
import { normalizeItemId, type BmMarketItem } from "../domain";
import type { BmCrafterDataBundle } from "./types";

export type BundleSources = {
  bm: Map<string, PriceSource>;
  materials: Map<string, SourceRecord>;
  artefacts: Map<string, PriceSource>;
};

const CITIES = ["Caerleon", "Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford", "Brecilien"];

export function withLivePrices(
  bundle: BmCrafterDataBundle | null,
  snap: LiveSnapshot | null,
  mode: LiveMode,
  now = Math.round(Date.now() / 60000)
): { bundle: BmCrafterDataBundle | null; sources: BundleSources | null } {
  if (!bundle || !snap || mode === "daily") return { bundle, sources: null };

  const daily = new Map(bundle.market.items.map((item) => [item.id, item]));
  const bm = mergeBuyMap(new Map(bundle.market.items.map((item) => [item.id, Number(item.bm) || 0])), snap, mode, BLACK_MARKET, now);
  const bmAt = snap.locations.indexOf(BLACK_MARKET);
  const items: BmMarketItem[] = [];
  for (const [id, price] of bm.prices) {
    const base = daily.get(id);
    // only what the crafter can craft
    if (!base && !bundle.recipes.byItemId.has(normalizeItemId(id))) continue;
    const volume = snap.volume[id]?.[bmAt];
    items.push({ id, bm: price, sold: volume ? volume[0] : (base?.sold ?? 0) });
  }

  const materials = mergeCityMap(bundle.cityMaterials, snap, mode, CITIES, now);

  const artefacts = new Map<string, number>();
  const artefactSources = new Map<string, PriceSource>();
  const artefactIds = new Set([...bundle.artefacts.byItemId.keys(), ...Object.keys(snap.prices).filter((id) => /^T\d_ARTEFACT_/.test(id))]);
  for (const id of artefactIds) {
    const lives = CITIES.map((city) => liveSell(snap, id, city, now)).filter((p) => p > 0);
    const merged = pick(mode, lives.length ? Math.min(...lives) : 0, bundle.artefacts.byItemId.get(id) ?? 0);
    if (!merged.source) continue;
    artefacts.set(id, merged.price);
    artefactSources.set(id, merged.source);
  }

  return {
    bundle: {
      ...bundle,
      market: { ...bundle.market, items },
      cityMaterials: materials.prices,
      artefacts: { ...bundle.artefacts, byItemId: artefacts }
    },
    sources: { bm: bm.sources ?? new Map(), materials: materials.sources ?? new Map(), artefacts: artefactSources }
  };
}
