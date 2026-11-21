import { describe, expect, it } from "vitest";
import type { LiveSnapshot } from "@shared/live/liveData";
import { withLivePrices } from "./liveBundle";
import type { BmCrafterDataBundle } from "./types";

const NOW = 1_000_000;
const LOCATIONS = ["Black Market", "Caerleon", "Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford", "Brecilien"];
const cell = (market: string, sell: number, buy: number) => LOCATIONS.map((m) => (m === market ? ([sell, sell ? NOW - 5 : 0, buy, buy ? NOW - 5 : 0] as [number, number, number, number]) : 0));

const bundle = {
  region: "eu",
  market: { region: "eu", generatedAt: null, items: [{ id: "T4_MAIN_SWORD", bm: 5000, sold: 12 }] },
  materials: { region: "eu", generatedAt: null, items: [], byItemId: new Map() },
  cityMaterials: new Map([["T4_METALBAR", { Martlock: 300, Lymhurst: 320 }]]),
  artefacts: { region: "eu", generatedAt: null, items: [], byItemId: new Map([["T4_ARTEFACT_X", 9000]]) },
  recipes: { generatedAt: null, items: [], byItemId: new Map([["MAIN_SWORD", {}], ["2H_AXE", {}]]) }
} as unknown as BmCrafterDataBundle;

const snap: LiveSnapshot = {
  region: "eu",
  locations: LOCATIONS,
  pricesAt: "2026-11-21T20:00:00Z",
  volumeAt: null,
  prices: {
    T4_2H_AXE: cell("Black Market", 0, 7000),
    T4_BAG: cell("Black Market", 0, 2000), // not craftable here
    T4_METALBAR: cell("Martlock", 280, 0),
    T4_ARTEFACT_X: cell("Thetford", 8500, 0)
  },
  volume: { T4_2H_AXE: LOCATIONS.map((m) => (m === "Black Market" ? [4, 7100] : 0)) }
};

describe("withLivePrices", () => {
  it("daily: the bundle as it is", () => {
    expect(withLivePrices(bundle, snap, "daily", NOW)).toEqual({ bundle, sources: null });
  });

  it("fill: live prices over the daily ones, new craftable BM items listed, sources kept", () => {
    const { bundle: b, sources } = withLivePrices(bundle, snap, "fill", NOW);
    expect(b?.market.items).toEqual([
      { id: "T4_MAIN_SWORD", bm: 5000, sold: 12 },
      { id: "T4_2H_AXE", bm: 7000, sold: 4 }
    ]);
    expect(b?.cityMaterials.get("T4_METALBAR")).toEqual({ Martlock: 280, Lymhurst: 320 });
    expect(sources?.materials.get("T4_METALBAR")).toEqual({ Martlock: "live", Lymhurst: "daily" });
    expect(b?.artefacts.byItemId.get("T4_ARTEFACT_X")).toBe(8500);
    expect(sources?.bm.get("T4_MAIN_SWORD")).toBe("daily");
  });

  it("live: only live prices", () => {
    const { bundle: b } = withLivePrices(bundle, snap, "live", NOW);
    expect(b?.market.items.map((i) => i.id)).toEqual(["T4_2H_AXE"]);
    expect(b?.cityMaterials.get("T4_METALBAR")).toEqual({ Martlock: 280 });
  });
});
