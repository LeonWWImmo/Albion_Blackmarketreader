import { describe, expect, it } from "vitest";
import type { BmRecipe } from "../../bm-crafter/domain";
import type { LiveCell, LiveSnapshot } from "@shared/live/liveData";
import { cityCraftRows, cityReturnRate, citySummary, priceCraft, tierName, worthIt, type CityCraftOptions } from "./cityCraft";

const LOCATIONS = ["Black Market", "Caerleon", "Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford", "Brecilien"];
const NOW = 29_000_000;

/** A snapshot from { id: { city: [sell, buy] } } (all prices 10 minutes old) and { id: { city: sold } }. */
function snapOf(prices: Record<string, Record<string, [number, number]>>, sold: Record<string, Record<string, [number, number]>> = {}): LiveSnapshot {
  const cells = (record: Record<string, [number, number]>): LiveCell[] =>
    LOCATIONS.map((city) => (record[city] ? [record[city][0], NOW - 10, record[city][1], NOW - 10] : 0));
  return {
    region: "eu",
    locations: LOCATIONS,
    pricesAt: "",
    volumeAt: null,
    prices: Object.fromEntries(Object.entries(prices).map(([id, record]) => [id, cells(record)])),
    volume: Object.fromEntries(Object.entries(sold).map(([id, record]) => [id, LOCATIONS.map((city) => record[city] ?? 0)]))
  };
}

const BOW: BmRecipe = { itemId: "2H_BOW", name: "Beginner's Bow", categoryKey: "bows", materials: [{ itemId: "PLANKS", qty: 32 }] };
const opt = (over: Partial<CityCraftOptions> = {}): CityCraftOptions => ({
  city: "Lymhurst",
  buy: "instant",
  sell: "order",
  focus: false,
  taxRate: 0.04,
  usageFee: 1000,
  tiers: [4],
  enchants: [0],
  now: NOW,
  ...over
});

const both = { Lymhurst: [100, 90] as [number, number], Martlock: [100, 90] as [number, number] };
const snap = snapOf({ T4_PLANKS: both, T4_2H_BOW: { Lymhurst: [4000, 3500], Martlock: [4000, 3500] } }, { T4_2H_BOW: { Lymhurst: [10, 3900], Martlock: [4, 3900] } });

describe("priceCraft", () => {
  it("buys, crafts and sells in the bonus city: return rate, station fee, tax and setup fee", () => {
    const row = priceCraft(snap, BOW, 4, 0, opt())!;
    expect(row.bonusCity).toBe(true);
    expect(row.returnRate).toBeCloseTo(1 - 1 / 1.33, 6);
    expect(row.stationFee).toBe(288); // ceil(256 x 0.1125 x 1000 / 100)
    expect(row.cost).toBeCloseTo(3200 * (1 / 1.33) + 288, 4);
    expect(row.fees).toBeCloseTo(4000 * 0.065, 6);
    expect(row.profit).toBeCloseTo(4000 - 260 - row.cost, 6);
    expect(row.dailyProfit).toBeCloseTo(row.profit * 10, 6);
    expect(row.name).toBe("Adept's Bow");
  });

  it("outside the bonus city the return rate is the station's alone", () => {
    const row = priceCraft(snap, BOW, 4, 0, opt({ city: "Martlock" }))!;
    expect(row.bonusCity).toBe(false);
    expect(row.returnRate).toBeCloseTo(0.1525, 4);
    expect(row.sold).toBe(4);
  });

  it("focus adds its bonus", () => {
    expect(priceCraft(snap, BOW, 4, 0, opt({ focus: true }))!.returnRate).toBeCloseTo(1 - 1 / 1.92, 6);
    expect(cityReturnRate(false, true, 0)).toBeCloseTo(1 - 1 / 1.77, 6);
  });

  it("instant sell takes the buy order and pays no setup fee; buy orders for materials add theirs", () => {
    const row = priceCraft(snap, BOW, 4, 0, opt({ sell: "instant", buy: "order" }))!;
    expect(row.price).toBe(3500);
    expect(row.fees).toBeCloseTo(3500 * 0.04, 6);
    expect(row.materials[0].unit).toBeCloseTo(90 * 1.025, 6);
  });

  it("a missing or stale price leaves the craft out", () => {
    expect(priceCraft(snap, BOW, 4, 0, opt({ city: "Thetford" }))).toBeNull();
    expect(priceCraft(snap, BOW, 4, 0, opt({ now: NOW + 25 * 60 }))).toBeNull();
    const artefactBow: BmRecipe = { ...BOW, itemId: "2H_BOW_KEEPER", artifactId: "ARTEFACT_2H_BOW_KEEPER" };
    expect(priceCraft(snapOf({ T4_PLANKS: both, T4_2H_BOW_KEEPER: { Lymhurst: [9000, 0] } }), artefactBow, 4, 0, opt())).toBeNull();
  });

  it("marks a listing far above the week's average", () => {
    const spiky = snapOf({ T4_PLANKS: both, T4_2H_BOW: { Lymhurst: [9000, 0] } }, { T4_2H_BOW: { Lymhurst: [10, 4000] } });
    const row = priceCraft(spiky, BOW, 4, 0, opt())!;
    expect(row.spike).toBe(true);
    expect(worthIt(row, 0, 0)).toBe(false);
  });
});

describe("cityCraftRows and citySummary", () => {
  it("ranks by profit a day and summarises each city", () => {
    const rows = cityCraftRows(snap, [BOW], opt({ tiers: [4, 5], enchants: [0, 1] }));
    expect(rows.map((r) => r.id)).toEqual(["T4_2H_BOW"]);
    const summary = citySummary(snap, [BOW], opt(), 0, 1);
    expect(summary.find((s) => s.city === "Lymhurst")).toMatchObject({ count: 1 });
    expect(summary.find((s) => s.city === "Martlock")!.topDaily).toBeCloseTo(priceCraft(snap, BOW, 4, 0, opt({ city: "Martlock" }))!.profit * 4, 6);
    expect(summary.find((s) => s.city === "Thetford")).toMatchObject({ count: 0, best: null });
  });

  it("names every tier", () => {
    expect(tierName("Novice's Cowl", 8)).toBe("Elder's Cowl");
    expect(tierName("Bloodletter", 5)).toBe("Expert's Bloodletter");
  });
});
