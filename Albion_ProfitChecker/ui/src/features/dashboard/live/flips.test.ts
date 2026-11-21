import { describe, expect, it } from "vitest";
import { ageLabel, computeFlips, routeFor, type FlipOptions, type LiveSnapshot, type PriceCell } from "./flips";

const LOCATIONS = ["Black Market", "Caerleon", "Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford", "Brecilien"];
const NOW = 1000000;

function cells(byMarket: Record<string, [number, number]>, ageMin = 10): PriceCell[] {
  // [sell, buy] per market, both seen ageMin minutes ago
  return LOCATIONS.map((name) => {
    const p = byMarket[name];
    return p ? [p[0], p[0] ? NOW - ageMin : 0, p[1], p[1] ? NOW - ageMin : 0] : 0;
  });
}

const snap = (prices: LiveSnapshot["prices"], volume: LiveSnapshot["volume"] = {}): LiveSnapshot => ({
  region: "eu",
  locations: LOCATIONS,
  pricesAt: "2026-11-21T20:00:00Z",
  volumeAt: null,
  prices,
  volume
});

const OPTS: FlipOptions = {
  from: "ALL",
  to: "ALL",
  mode: "instant",
  albionPremium: true,
  maxAgeH: 6,
  minProfitPct: 0,
  maxCost: null,
  minSold: 0,
  tier: "ALL",
  search: "",
  sort: "pct"
};

const name = (id: string) => (id.includes("BAG") ? "Bag" : "Other");

describe("routeFor", () => {
  const s = snap({ T4_BAG: cells({ Martlock: [1000, 900], "Black Market": [0, 2000], Lymhurst: [1500, 1300] }) });

  it("sells instantly into the Black Market buy order after 4% tax", () => {
    const flip = routeFor("T4_BAG", s, 5, 0, OPTS, NOW);
    expect(flip).toMatchObject({ from: "Martlock", to: "Black Market", buy: 1000, sell: 2000, instant: true, profit: 920 });
    expect(flip?.profitPct).toBeCloseTo(92);
  });

  it("lists a sell order in a city: sales tax plus the setup fee, 8% without Albion Premium", () => {
    const flip = routeFor("T4_BAG", s, 5, 4, { ...OPTS, mode: "order", albionPremium: false }, NOW);
    expect(flip).toMatchObject({ sell: 1500, instant: false, profit: Math.round(1500 * (1 - 0.08 - 0.025) - 1000) });
  });

  it("never buys at the Black Market, skips old prices and the same market", () => {
    expect(routeFor("T4_BAG", s, 0, 4, OPTS, NOW)).toBeNull();
    expect(routeFor("T4_BAG", s, 5, 5, OPTS, NOW)).toBeNull();
    expect(routeFor("T4_BAG", s, 5, 0, { ...OPTS, maxAgeH: 6 }, NOW + 7 * 60)).toBeNull();
  });
});

describe("computeFlips", () => {
  const s = snap(
    {
      T4_BAG: cells({ Martlock: [1000, 900], "Black Market": [0, 2000], Lymhurst: [1500, 1300] }),
      T5_BAG: cells({ Thetford: [10000, 0], "Black Market": [0, 12000] }),
      T4_OTHER: cells({ Martlock: [100, 0], Caerleon: [0, 900] })
    },
    { T5_BAG: LOCATIONS.map((n) => (n === "Black Market" ? [30, 11800] : 0)) }
  );

  it("keeps the best route per item, sorted by profit %", () => {
    const flips = computeFlips(s, OPTS, NOW, name);
    expect(flips.map((f) => [f.id, f.from, f.to])).toEqual([
      ["T4_OTHER", "Martlock", "Caerleon"],
      ["T4_BAG", "Martlock", "Black Market"],
      ["T5_BAG", "Thetford", "Black Market"]
    ]);
    expect(flips[0].suspect).toBe(true);
    expect(flips[2].sold).toBe(30);
  });

  it("sorts by silver and filters by markets, tier, cost, volume and name", () => {
    expect(computeFlips(s, { ...OPTS, sort: "silver" }, NOW, name)[0].id).toBe("T5_BAG");
    expect(computeFlips(s, { ...OPTS, to: "Caerleon" }, NOW, name).map((f) => f.id)).toEqual(["T4_OTHER"]);
    expect(computeFlips(s, { ...OPTS, from: "Thetford" }, NOW, name).map((f) => f.id)).toEqual(["T5_BAG"]);
    expect(computeFlips(s, { ...OPTS, tier: "T5" }, NOW, name).map((f) => f.id)).toEqual(["T5_BAG"]);
    expect(computeFlips(s, { ...OPTS, maxCost: 5000 }, NOW, name).map((f) => f.id)).not.toContain("T5_BAG");
    expect(computeFlips(s, { ...OPTS, minSold: 10 }, NOW, name).map((f) => f.id)).toEqual(["T5_BAG"]);
    expect(computeFlips(s, { ...OPTS, search: "bag" }, NOW, name).map((f) => f.id).sort()).toEqual(["T4_BAG", "T5_BAG"]);
    expect(computeFlips(s, { ...OPTS, minProfitPct: 50 }, NOW, name).map((f) => f.id)).not.toContain("T5_BAG");
  });

  it("ignores the sold/day filter while the snapshot has no sales numbers yet", () => {
    expect(computeFlips({ ...s, volume: {} }, { ...OPTS, minSold: 5 }, NOW, name)).toHaveLength(3);
  });
});

describe("ageLabel", () => {
  it("reads like a clock", () => {
    expect(ageLabel(NOW, NOW)).toBe("now");
    expect(ageLabel(NOW - 12, NOW)).toBe("12m");
    expect(ageLabel(NOW - 185, NOW)).toBe("3h");
    expect(ageLabel(NOW - 3 * 1440, NOW)).toBe("3d");
  });
});
