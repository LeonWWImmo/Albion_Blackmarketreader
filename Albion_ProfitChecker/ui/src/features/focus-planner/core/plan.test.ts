import { describe, expect, it } from "vitest";
import type { BmRecipe } from "../../bm-crafter/domain";
import type { LiveCell, LiveSnapshot } from "@shared/live/liveData";
import { liveBook } from "../../city-crafter/core/books";
import { focusCandidates, planFocus, type FocusCandidate, type FocusOptions } from "./plan";

const LOCATIONS = ["Black Market", "Caerleon", "Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford", "Brecilien"];
const NOW = 29_000_000;

function snapOf(prices: Record<string, Record<string, number>>, sold: Record<string, Record<string, [number, number]>>): LiveSnapshot {
  const cells = (rec: Record<string, number>): LiveCell[] => LOCATIONS.map((c) => (rec[c] ? [rec[c], NOW - 5, 0, 0] : 0));
  return {
    region: "eu",
    locations: LOCATIONS,
    pricesAt: "",
    volumeAt: null,
    prices: Object.fromEntries(Object.entries(prices).map(([id, rec]) => [id, cells(rec)])),
    volume: Object.fromEntries(Object.entries(sold).map(([id, rec]) => [id, LOCATIONS.map((c) => rec[c] ?? 0)]))
  };
}

const BOW: BmRecipe = { itemId: "2H_BOW", name: "Beginner's Bow", categoryKey: "bows", materials: [{ itemId: "PLANKS", qty: 32 }] };
const book = liveBook(
  snapOf({ T4_PLANKS: { Lymhurst: 100, Martlock: 100 }, T4_2H_BOW: { Lymhurst: 4500, Martlock: 4500 } }, { T4_2H_BOW: { Lymhurst: [3, 4500], Martlock: [20, 4500] } }),
  NOW
);
const opt = (over: Partial<FocusOptions> = {}): FocusOptions => ({
  cities: ["Lymhurst", "Martlock"],
  matFrom: "city",
  buy: "instant",
  sell: "order",
  taxRate: 0.04,
  usageFee: 1000,
  tiers: [4],
  enchants: [0],
  minRoi: 0,
  minSold: 0,
  ...over
});

describe("focusCandidates", () => {
  it("prices with focus and ranks by silver per focus point; the bonus city's higher return wins", () => {
    const list = focusCandidates(book, [BOW], opt());
    expect(list.map((c) => c.city)).toEqual(["Lymhurst", "Martlock"]);
    const [lym] = list;
    expect(lym.row.returnRate).toBeCloseTo(1 - 1 / 1.92, 6);
    expect(lym.focus).toBe(32 * 54); // base focus of T4.0 with 32 planks
    expect(lym.perFocus).toBeCloseTo(lym.row.profit / lym.focus, 9);
  });

  it("the player's specs lower the focus per craft (half per 10.000 efficiency)", () => {
    const [c] = focusCandidates(book, [BOW], opt({ efficiencyOf: (baseId) => (baseId === "2H_BOW" ? 10000 : 0) }));
    expect(c.efficiency).toBe(10000);
    expect(c.focus).toBeCloseTo((32 * 54) / 2, 6);
  });
});

describe("planFocus", () => {
  it("spends the focus best first, at most a day's sales per craft", () => {
    const list = focusCandidates(book, [BOW], opt());
    const plan = planFocus(list, 10000);
    // Lymhurst sells 3 a day: 3 crafts there, the rest of the focus in Martlock
    expect(plan.lines.map((l) => [l.city, l.crafts])).toEqual([
      ["Lymhurst", 3],
      ["Martlock", Math.floor((10000 - 3 * 1728) / 1728)]
    ]);
    expect(plan.used).toBeCloseTo(plan.lines.reduce((s, l) => s + l.focusUsed, 0), 6);
    expect(plan.total).toBeCloseTo(plan.lines.reduce((s, l) => s + l.total, 0), 6);
  });

  it("nothing fits in too little focus", () => {
    const one = { row: { sold: 5, profit: 100 }, city: "X", focus: 500, efficiency: 0, perFocus: 0.2 } as unknown as FocusCandidate;
    expect(planFocus([one], 400)).toMatchObject({ lines: [], used: 0, total: 0 });
  });
});
