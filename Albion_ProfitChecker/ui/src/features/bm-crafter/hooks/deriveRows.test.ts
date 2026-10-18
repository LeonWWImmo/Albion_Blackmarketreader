import { describe, expect, it } from "vitest";
import { deriveBmCrafterRows } from "./deriveRows";
import type { BmCrafterDataBundle } from "../data";

function buildBundle(): BmCrafterDataBundle {
  return {
    region: "us",
    market: {
      region: "us",
      generatedAt: null,
      items: [
        { id: "T4_MAIN_SWORD", bm: 10000, sold: 100 },
        { id: "T4_MAIN_AXE", bm: 7000, sold: 40 },
        { id: "T5_MAIN_SWORD@1", bm: 30000, sold: 10 }
      ]
    },
    materials: {
      region: "us",
      generatedAt: null,
      items: [],
      byItemId: new Map<string, number>([
        ["T4_METALBAR", 200],
        ["T4_LEATHER", 100],
        ["T5_METALBAR_LEVEL1@1", 900],
        ["T5_LEATHER_LEVEL1@1", 500]
      ])
    },
    artefacts: {
      region: "us",
      generatedAt: null,
      items: [],
      byItemId: new Map<string, number>()
    },
    recipes: {
      generatedAt: null,
      items: [
        {
          itemId: "MAIN_SWORD",
          name: "Broadsword",
          materials: [
            { itemId: "METALBAR", qty: 16 },
            { itemId: "LEATHER", qty: 8 }
          ],
          artifactId: null
        },
        {
          itemId: "MAIN_AXE",
          name: "Battleaxe",
          materials: [
            { itemId: "METALBAR", qty: 16 },
            { itemId: "LEATHER", qty: 8 }
          ],
          artifactId: null
        }
      ],
      byItemId: new Map()
    }
  } as unknown as BmCrafterDataBundle;
}

describe("deriveBmCrafterRows", () => {
  it("derives and sorts by profit pct by default", () => {
    const bundle = buildBundle();
    bundle.recipes.byItemId.set("MAIN_SWORD", bundle.recipes.items[0]);
    bundle.recipes.byItemId.set("MAIN_AXE", bundle.recipes.items[1]);

    const rows = deriveBmCrafterRows(bundle, {
      selectedTiers: [],
      selectedEnchants: [],
      minSold: 0,
      searchTerm: "",
      returnRate: 0.1525,
      sortByDailyTop: false,
      showOnlyProfitable: true,
      nonArtefactOnly: false,
      craftCity: "Caerleon",
      usageFeePer100: 0
    });

    expect(rows).toHaveLength(3);
    expect(rows[0].item.id).toBe("T4_MAIN_SWORD");
    expect(rows[0].rowKey).toBeTruthy();
  });

  it("filters by tier and search", () => {
    const bundle = buildBundle();
    bundle.recipes.byItemId.set("MAIN_SWORD", bundle.recipes.items[0]);
    bundle.recipes.byItemId.set("MAIN_AXE", bundle.recipes.items[1]);

    const rows = deriveBmCrafterRows(bundle, {
      selectedTiers: [5],
      selectedEnchants: [1],
      minSold: 0,
      searchTerm: "broad",
      returnRate: 0.1525,
      sortByDailyTop: false,
      showOnlyProfitable: true,
      nonArtefactOnly: false,
      craftCity: "Caerleon",
      usageFeePer100: 0
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].item.id).toBe("T5_MAIN_SWORD@1");
  });

  it("allows selecting multiple tiers and multiple enchants at once", () => {
    const bundle = buildBundle();
    bundle.recipes.byItemId.set("MAIN_SWORD", bundle.recipes.items[0]);
    bundle.recipes.byItemId.set("MAIN_AXE", bundle.recipes.items[1]);

    const base = {
      minSold: 0,
      searchTerm: "",
      returnRate: 0.1525,
      sortByDailyTop: false,
      showOnlyProfitable: true,
      nonArtefactOnly: false,
      craftCity: "Caerleon",
      usageFeePer100: 0
    };

    // Only T4 items (both enchants allowed) -> the two T4 rows, not the T5 one.
    const t4 = deriveBmCrafterRows(bundle, { ...base, selectedTiers: [4], selectedEnchants: [] });
    expect(t4.map((r) => r.item.id).sort()).toEqual(["T4_MAIN_AXE", "T4_MAIN_SWORD"]);

    // T4 + T5 selected together -> all three rows.
    const t45 = deriveBmCrafterRows(bundle, { ...base, selectedTiers: [4, 5], selectedEnchants: [] });
    expect(t45).toHaveLength(3);

    // Enchant .0 and .1 selected together -> still all three (covers both enchant levels).
    const e01 = deriveBmCrafterRows(bundle, { ...base, selectedTiers: [], selectedEnchants: [0, 1] });
    expect(e01).toHaveLength(3);
  });

  it("adds today's daily bonus to the return rate of the items it covers, and can list only those", () => {
    const bundle = buildBundle();
    bundle.recipes.byItemId.set("MAIN_SWORD", bundle.recipes.items[0]);
    bundle.recipes.byItemId.set("MAIN_AXE", bundle.recipes.items[1]);
    const base = {
      selectedTiers: [4],
      selectedEnchants: [],
      minSold: 0,
      searchTerm: "",
      returnRate: 0.1525,
      sortByDailyTop: false,
      showOnlyProfitable: false,
      nonArtefactOnly: false,
      craftCity: "Caerleon",
      usageFeePer100: 0
    };
    const swordBonus = [{ name: "COMMON_SWORD", category: "sword", percent: 10, label: "Swords", end: "2026-10-19T10:00:00.000Z" }];

    const plain = deriveBmCrafterRows(bundle, base);
    const boosted = deriveBmCrafterRows(bundle, { ...base, dailyBonus: { bonuses: swordBonus, onlyBonusItems: false } });
    const byId = (rows: typeof plain, id: string) => rows.find((r) => r.item.id === id)!;

    // materials 16x200 + 8x100 = 4000. 15.25% is the 18% royal base (rounded); +10% daily makes
    // about 28%, i.e. 1 / (1 / (1 - 0.1525) + 0.10) of the materials are paid for.
    expect(byId(boosted, "T4_MAIN_SWORD").economics.craftCost).toBeCloseTo(4000 / (1 / (1 - 0.1525) + 0.1), 6);
    expect(byId(boosted, "T4_MAIN_SWORD").economics.craftCost).toBeCloseTo(4000 / 1.28, 0);
    expect(byId(plain, "T4_MAIN_SWORD").economics.craftCost).toBeCloseTo(4000 * (1 - 0.1525), 6);
    expect(byId(boosted, "T4_MAIN_SWORD").dailyBonusPercent).toBe(10);
    // the axe has no bonus today and keeps its numbers
    expect(byId(boosted, "T4_MAIN_AXE").economics).toEqual(byId(plain, "T4_MAIN_AXE").economics);
    expect(byId(boosted, "T4_MAIN_AXE").dailyBonusPercent).toBe(0);

    const only = deriveBmCrafterRows(bundle, { ...base, dailyBonus: { bonuses: swordBonus, onlyBonusItems: true } });
    expect(only.map((r) => r.item.id)).toEqual(["T4_MAIN_SWORD"]);
  });
});
