import { describe, expect, it } from "vitest";
import type { BmRecipe } from "../../bm-crafter/domain";
import type { LiveCell, LiveSnapshot } from "@shared/live/liveData";
import { dailyBook, dailyFromFiles, liveBook, mixBook } from "./books";
import { cityCraftRows, cityReturnRate, citySummary, priceCraft, tierName, worthIt, type CityCraftOptions } from "./cityCraft";

const LOCATIONS = ["Black Market", "Caerleon", "Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford", "Brecilien"];
const NOW = 29_000_000;

/** A snapshot from { id: { city: [sell, buy] } } (all prices 10 minutes old) and { id: { city: [sold, avg] } }. */
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
  matFrom: "city",
  buy: "instant",
  sell: "order",
  focus: false,
  taxRate: 0.04,
  usageFee: 1000,
  tiers: [4],
  enchants: [0],
  ...over
});

const both = { Lymhurst: [100, 90] as [number, number], Martlock: [100, 90] as [number, number] };
const snap = snapOf({ T4_PLANKS: both, T4_2H_BOW: { Lymhurst: [4000, 3500], Martlock: [4000, 3500] } }, { T4_2H_BOW: { Lymhurst: [10, 3900], Martlock: [4, 3900] } });
const book = liveBook(snap, NOW);

describe("priceCraft", () => {
  it("buys, crafts and sells in the bonus city: return rate, station fee, tax and setup fee", () => {
    const row = priceCraft(book, BOW, 4, 0, opt())!;
    expect(row.bonusCity).toBe(true);
    expect(row.returnRate).toBeCloseTo(1 - 1 / 1.33, 6);
    expect(row.stationFee).toBe(288); // ceil(256 x 0.1125 x 1000 / 100)
    expect(row.materialCost).toBe(3200);
    expect(row.cost).toBeCloseTo(3200 * (1 / 1.33) + 288, 4);
    expect(row.fees).toBeCloseTo(4000 * 0.065, 6);
    expect(row.net).toBeCloseTo(4000 - 260, 6);
    expect(row.profit).toBeCloseTo(4000 - 260 - row.cost, 6);
    expect(row.dailyProfit).toBeCloseTo(row.profit * 10, 6);
    expect(row.name).toBe("Adept's Bow");
    expect(row.imported).toBe(false);
  });

  it("outside the bonus city the return rate is the station's alone", () => {
    const row = priceCraft(book, BOW, 4, 0, opt({ city: "Martlock" }))!;
    expect(row.bonusCity).toBe(false);
    expect(row.returnRate).toBeCloseTo(0.1525, 4);
    expect(row.sold).toBe(4);
  });

  it("focus adds its bonus", () => {
    expect(priceCraft(book, BOW, 4, 0, opt({ focus: true }))!.returnRate).toBeCloseTo(1 - 1 / 1.92, 6);
    expect(cityReturnRate(false, true, 0)).toBeCloseTo(1 - 1 / 1.77, 6);
  });

  it("instant sell takes the buy order and pays no setup fee; buy orders for materials add theirs", () => {
    const row = priceCraft(book, BOW, 4, 0, opt({ sell: "instant", buy: "order" }))!;
    expect(row.sale.unit).toBe(3500);
    expect(row.fees).toBeCloseTo(3500 * 0.04, 6);
    expect(row.materials[0].unit).toBeCloseTo(90 * 1.025, 6);
  });

  it("materials from the cheapest city: each from where it costs least, marked as carried in", () => {
    const cheap = liveBook(snapOf({ T4_PLANKS: { ...both, Thetford: [70, 0] }, T4_2H_BOW: { Lymhurst: [4000, 0] } }), NOW);
    const row = priceCraft(cheap, BOW, 4, 0, opt({ matFrom: "cheapest" }))!;
    expect(row.materials[0]).toMatchObject({ city: "Thetford", unit: 70 });
    expect(row.imported).toBe(true);
    // a tie stays in the crafting city
    const tie = liveBook(snapOf({ T4_PLANKS: { ...both, Thetford: [100, 0] }, T4_2H_BOW: { Lymhurst: [4000, 0] } }), NOW);
    expect(priceCraft(tie, BOW, 4, 0, opt({ matFrom: "cheapest" }))!.materials[0].city).toBe("Lymhurst");
  });

  it("a missing or stale price leaves the craft out", () => {
    expect(priceCraft(book, BOW, 4, 0, opt({ city: "Thetford" }))).toBeNull();
    expect(priceCraft(liveBook(snap, NOW + 25 * 60), BOW, 4, 0, opt())).toBeNull();
    const artefactBow: BmRecipe = { ...BOW, itemId: "2H_BOW_KEEPER", artifactId: "ARTEFACT_2H_BOW_KEEPER" };
    expect(priceCraft(liveBook(snapOf({ T4_PLANKS: both, T4_2H_BOW_KEEPER: { Lymhurst: [9000, 0] } }), NOW), artefactBow, 4, 0, opt())).toBeNull();
  });

  it("marks a listing far above the week's average", () => {
    const spiky = liveBook(snapOf({ T4_PLANKS: both, T4_2H_BOW: { Lymhurst: [9000, 0] } }, { T4_2H_BOW: { Lymhurst: [10, 4000] } }), NOW);
    const row = priceCraft(spiky, BOW, 4, 0, opt())!;
    expect(row.spike).toBe(true);
    expect(worthIt(row, 0, 0)).toBe(false);
  });
});

describe("price books", () => {
  const daily = dailyFromFiles(
    { generatedAt: "2026-11-20T10:00:00Z", items: [{ itemId: "T4_2H_BOW", prices: { Lymhurst: 3800, Martlock: 0 } }] },
    { generatedAt: "2026-11-20T09:00:00Z", items: [{ itemId: "T4_PLANKS", prices: { Lymhurst: 80, Thetford: 60 } }] },
    { items: [{ itemId: "T4_ARTEFACT_X", city: "Caerleon", price: 5000 }, { itemId: "T4_ARTEFACT_X", city: "Martlock", price: 0 }] }
  );

  it("reads the daily files: sell orders per city, no buy orders, the sales from the snapshot", () => {
    expect(daily.at).toBe(Date.parse("2026-11-20T09:00:00Z") / 60000);
    const d = dailyBook(daily, snap);
    expect(d.sell("T4_PLANKS", "Thetford")).toEqual({ unit: 60, at: daily.at, src: "daily" });
    expect(d.sell("T4_2H_BOW", "Martlock")).toBeNull();
    expect(d.sell("T4_ARTEFACT_X", "Caerleon")?.unit).toBe(5000);
    expect(d.order("T4_2H_BOW", "Lymhurst")).toBeNull();
    expect(d.volume("T4_2H_BOW", "Lymhurst").sold).toBe(10);
  });

  it("mix: live first, daily where live has nothing", () => {
    const mix = mixBook(liveBook(snap, NOW), dailyBook(daily, snap));
    expect(mix.sell("T4_PLANKS", "Lymhurst")).toMatchObject({ unit: 100, src: "live" });
    expect(mix.sell("T4_PLANKS", "Thetford")).toMatchObject({ unit: 60, src: "daily" });
    const row = priceCraft(mix, BOW, 4, 0, opt({ matFrom: "cheapest" }))!;
    expect(row.materials[0]).toMatchObject({ city: "Thetford", src: "daily" });
    expect(row.sale.src).toBe("live");
  });
});

describe("cityCraftRows and citySummary", () => {
  it("ranks by profit a day and summarises each city", () => {
    const rows = cityCraftRows(book, [BOW], opt({ tiers: [4, 5], enchants: [0, 1] }));
    expect(rows.map((r) => r.id)).toEqual(["T4_2H_BOW"]);
    const { city: _city, ...rest } = opt();
    const summary = citySummary(book, [BOW], rest, 0, 1);
    expect(summary.find((s) => s.city === "Lymhurst")).toMatchObject({ count: 1 });
    expect(summary.find((s) => s.city === "Martlock")!.topDaily).toBeCloseTo(priceCraft(book, BOW, 4, 0, opt({ city: "Martlock" }))!.profit * 4, 6);
    expect(summary.find((s) => s.city === "Thetford")).toMatchObject({ count: 0, best: null });
  });

  it("names every tier", () => {
    expect(tierName("Novice's Cowl", 8)).toBe("Elder's Cowl");
    expect(tierName("Bloodletter", 5)).toBe("Expert's Bloodletter");
  });
});
