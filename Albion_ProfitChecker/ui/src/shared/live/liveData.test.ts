import { describe, expect, it } from "vitest";
import { mergeBuyMap, mergeCities, mergeCityMap, overlayLive, pick, sourceOf, type LiveSnapshot } from "./liveData";

const NOW = 1_000_000;
const LOCATIONS = ["Black Market", "Caerleon", "Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford", "Brecilien"];
const snap: LiveSnapshot = {
  region: "eu",
  locations: LOCATIONS,
  pricesAt: "2026-11-21T20:00:00Z",
  volumeAt: null,
  prices: {
    // Martlock: a fresh listing; Lymhurst: one from 2 days ago (too old); Black Market: a buy order
    T4_PLANKS: LOCATIONS.map((m) => (m === "Martlock" ? [100, NOW - 10, 0, 0] : m === "Lymhurst" ? [90, NOW - 2 * 1440, 0, 0] : m === "Black Market" ? [0, 0, 500, NOW - 5] : 0))
  },
  volume: {}
};

describe("live prices", () => {
  it("pick: daily, live only, or live with daily filling the gaps", () => {
    expect(pick("daily", 100, 80)).toEqual({ price: 80, source: "daily" });
    expect(pick("live", 0, 80)).toEqual({ price: 0, source: null });
    expect(pick("fill", 0, 80)).toEqual({ price: 80, source: "daily" });
    expect(pick("fill", 100, 80)).toEqual({ price: 100, source: "live" });
  });

  it("mergeCities marks every city's source and ignores old live prices", () => {
    const daily = { Martlock: 120, Lymhurst: 95, Thetford: 130, ALL: 95 };
    const fill = mergeCities(daily, snap, "T4_PLANKS", ["Martlock", "Lymhurst", "Thetford"], "fill", NOW);
    expect(fill.prices).toEqual({ Martlock: 100, Lymhurst: 95, Thetford: 130, ALL: 95 });
    expect(fill.sources).toEqual({ Martlock: "live", Lymhurst: "daily", Thetford: "daily", ALL: "daily" });
    const live = mergeCities(daily, snap, "T4_PLANKS", ["Martlock", "Lymhurst", "Thetford"], "live", NOW);
    expect(live.prices).toEqual({ Martlock: 100 });
  });

  it("mergeCityMap / mergeBuyMap leave the daily maps alone in daily mode", () => {
    const daily = new Map([["T4_PLANKS", { Martlock: 120 }]]);
    expect(mergeCityMap(daily, snap, "daily", ["Martlock"]).prices).toBe(daily);
    expect(mergeCityMap(daily, null, "live", ["Martlock"]).sources).toBeNull();
    const bm = mergeBuyMap(new Map([["T5_BAG", 900]]), snap, "fill", "Black Market", NOW);
    expect([...bm.prices]).toEqual([
      ["T5_BAG", 900],
      ["T4_PLANKS", 500]
    ]);
    expect(bm.sources?.get("T4_PLANKS")).toBe("live");
  });

  it("sourceOf finds the city behind a cheapest-anywhere price", () => {
    expect(sourceOf({ Martlock: 100, Lymhurst: 95 }, { Martlock: "live", Lymhurst: "daily" }, "ALL", 95)).toBe("daily");
    expect(sourceOf({ Martlock: 100 }, { Martlock: "live" }, "Martlock", 100)).toBe("live");
    expect(sourceOf({ Martlock: 100 }, undefined, "Martlock", 100)).toBeUndefined();
  });

  it("overlayLive puts live prices on a flat list by each id's city", () => {
    const daily = { T4_PLANKS: 120, T5_PLANKS: 400, OTHER: 7 };
    const cityOf = new Map([["T4_PLANKS", "Martlock"], ["T5_PLANKS", "Martlock"]]);
    expect(overlayLive(daily, cityOf, snap, "fill", NOW)).toEqual({ prices: { T4_PLANKS: 100, T5_PLANKS: 400, OTHER: 7 }, sources: { T4_PLANKS: "live", T5_PLANKS: "daily" } });
    expect(overlayLive(daily, cityOf, snap, "live", NOW).prices).toEqual({ T4_PLANKS: 100, T5_PLANKS: 0, OTHER: 7 });
    expect(overlayLive(daily, cityOf, snap, "daily", NOW).prices).toBe(daily);
  });
});
