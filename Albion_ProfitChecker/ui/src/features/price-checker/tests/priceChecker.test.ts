import { describe, expect, it } from "vitest";
import { change, soldPerDay, type HistoryPoint } from "../core/history";
import { baseName, buildItemIndex, craftingCalculatorPath, toEntry, type ItemRow } from "../core/items";
import { isSavedItem } from "../ui/saved";
import { ageLabel, bestFlip, bestInstantSell, cheapestBuy, freshness, marketQuotes, type QuoteRow } from "../core/quotes";
import { parseQuery, searchItems } from "../core/search";

const ROWS: ItemRow[] = [
  ["T4_BAG", "Adept's Bag", "adepts-bag", "bags", "bags", 4, 3.4, 4],
  ["T5_BAG", "Expert's Bag", "experts-bag", "bags", "bags", 5, 4.1, 4],
  ["T6_BAG", "Master's Bag", "masters-bag", "bags", "bags", 6, 4.9, 4],
  ["T4_BAG_INSIGHT", "Adept's Satchel of Insight", "adepts-satchel-of-insight", "bags", "satchels", 4, 3.4, 0],
  ["T4_PLANKS", "Pine Planks", "pine-planks", "crafting", "refinedresources", 4, 0.51, ["T4_PLANKS", "T4_PLANKS_LEVEL1@1"]],
  ["T8_2H_CROSSBOW", "Elder's Crossbow", "elders-crossbow", "weapons", "crossbow", 8, 34.2, 4]
];
const index = buildItemIndex(ROWS);

describe("item index", () => {
  it("knows every enchantment level's market id", () => {
    expect(toEntry(ROWS[0]).variants).toEqual(["T4_BAG", "T4_BAG@1", "T4_BAG@2", "T4_BAG@3", "T4_BAG@4"]);
    expect(toEntry(ROWS[4]).variants).toEqual(["T4_PLANKS", "T4_PLANKS_LEVEL1@1"]);
  });

  it("links only items the Crafting Calculator knows, at the right tier and enchantment", () => {
    const bow = toEntry(["T5_2H_BOW", "Expert's Bow", "experts-bow", "weapons", "bow", 5, 3, 4, 1]);
    expect(bow.craftable).toBe(true);
    expect(craftingCalculatorPath(bow, 2)).toBe("/crafting-calculator?item=2H_BOW&tier=5&enchant=2");
    expect(toEntry(ROWS[0]).craftable).toBe(false);
  });

  it("keeps only well-formed saved items from browser storage", () => {
    expect(isSavedItem({ slug: "adepts-bag", e: 2, q: 3 })).toBe(true);
    expect([null, {}, { slug: "x", e: 9, q: 1 }, { slug: "../x", e: 0, q: 1 }, { slug: "x", e: 0, q: 0 }, { slug: "x", e: 1.5, q: 1 }].some(isSavedItem)).toBe(false);
  });

  it("groups the tiers of one item and finds pages by slug", () => {
    expect(index.byFamily.get("BAG")?.map((i) => i.tier)).toEqual([4, 5, 6]);
    expect(index.bySlug.get("masters-bag")?.id).toBe("T6_BAG");
    expect(baseName("Grandmaster's Bag")).toBe("Bag");
  });
});

describe("search", () => {
  it("reads the tier and enchantment players type", () => {
    expect(parseQuery("t4 bag")).toEqual({ words: ["bag"], tier: 4, enchant: null });
    expect(parseQuery("4.1 Bag")).toEqual({ words: ["bag"], tier: 4, enchant: 1 });
    expect(parseQuery("crossbow .2")).toEqual({ words: ["crossbow"], tier: null, enchant: 2 });
    expect(parseQuery("Elder's Crossbow")).toEqual({ words: ["elders", "crossbow"], tier: null, enchant: null });
  });

  it("shows each kind of item once, opening at T4 unless a tier is asked for", () => {
    const hits = searchItems(index, "bag");
    expect(hits[0]).toMatchObject({ label: "Bag", item: { id: "T4_BAG" }, enchant: null });
    expect(hits.map((h) => h.label)).toContain("Adept's Satchel of Insight");
    expect(searchItems(index, "6.2 bag")[0]).toMatchObject({ label: "Master's Bag", item: { id: "T6_BAG" }, enchant: 2 });
    expect(searchItems(index, "master bag")[0].item.id).toBe("T6_BAG");
  });

  it("matches word starts and ids, and nothing for nonsense", () => {
    expect(searchItems(index, "cross")[0].item.id).toBe("T8_2H_CROSSBOW");
    expect(searchItems(index, "plank")[0].item.id).toBe("T4_PLANKS");
    expect(searchItems(index, "zzz")).toEqual([]);
    expect(searchItems(index, "ag").map((h) => h.label)).toEqual([]); // no match inside words below four letters
    expect(searchItems(index, "ossbow")[0].item.id).toBe("T8_2H_CROSSBOW");
    expect(searchItems(index, "t4")).toEqual([]);
  });
});

describe("quotes", () => {
  const now = 1_800_000_000;
  const h = 3600;
  const rows: QuoteRow[] = [
    ["T4_BAG", "Black Market", 1, 9999, now - h, 4700, now - 600],
    ["T4_BAG", "Martlock", 1, 3234, now - 2 * h, 2900, now - h],
    ["T4_BAG", "Lymhurst", 1, 3100, now - 72 * h, 3010, now - 3 * h], // its sell order is stale
    ["T4_BAG", "Brecilien", 1, 1000, now - h, 9000, now - h], // too thin to count
    ["T4_BAG", "Martlock", 2, 5000, now - h, 0, 0]
  ];
  const quotes = marketQuotes(rows, "T4_BAG", 1);

  it("lists every market for a quality, without a Black Market sell price", () => {
    expect(quotes).toHaveLength(8);
    expect(quotes[0]).toEqual({ market: "Black Market", sell: null, buy: { price: 4700, seenAt: now - 600 } });
    expect(quotes.find((q) => q.market === "Thetford")).toEqual({ market: "Thetford", sell: null, buy: null });
  });

  it("finds the cheapest fresh sell order and the best fresh buy order", () => {
    expect(cheapestBuy(quotes, now)).toEqual({ market: "Martlock", price: 3234, seenAt: now - 2 * h });
    expect(bestInstantSell(quotes, now)).toEqual({ market: "Black Market", price: 4700, seenAt: now - 600 });
  });

  it("flips only when selling after tax beats buying", () => {
    const flip = bestFlip(quotes, now, true)!;
    expect(flip).toMatchObject({ from: "Martlock", to: "Black Market", buy: 3234, sell: 4700 });
    expect(flip.profit).toBeCloseTo(4700 * 0.96 - 3234, 6);
    expect(bestFlip(marketQuotes(rows, "T4_BAG", 2), now, true)).toBeNull();
  });

  it("says how old a price is", () => {
    expect([freshness(now - 600, now), freshness(now - 3 * h, now), freshness(now - 30 * h, now), freshness(now - 50 * h, now)]).toEqual([
      "fresh",
      "recent",
      "old",
      "stale"
    ]);
    expect([ageLabel(now - 30, now), ageLabel(now - 720, now), ageLabel(now - 5 * h, now), ageLabel(now - 72 * h, now)]).toEqual(["now", "12m", "5h", "3d"]);
  });
});

describe("history", () => {
  const now = 1_800_000_000;
  const day = 86400;
  const points: HistoryPoint[] = [
    [now - 20 * day, 3000, 999],
    [now - 6 * day, 3200, 100],
    [now - 3 * day, 3300, 200],
    [now - 1 * day, 3600, 300]
  ];

  it("counts items sold per day over the last week", () => {
    expect(soldPerDay(points, now)).toBeCloseTo(600 / 6, 6);
    expect(soldPerDay([], now)).toBeNull();
  });

  it("measures the change from the first to the last point", () => {
    expect(change(points)).toBeCloseTo(0.2, 6);
    expect(change([points[0]])).toBeNull();
  });
});
