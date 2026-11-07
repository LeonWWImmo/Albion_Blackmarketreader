import { describe, expect, it } from "vitest";
import {
  buildArtefactId,
  buildMaterialId,
  calculateItemEconomics,
  normalizeItemId,
  normalizeReturnRatePercent,
  parseEnchant,
  parseTier,
  returnRatePercentToDecimal
} from "./calculations";
import type { BmRecipe } from "./types";
import { salesTaxRate } from "../../../shared/albion/marketTax";

describe("bm crafter id helpers", () => {
  it("parses tier and enchant from item ids", () => {
    expect(parseTier("T6_MAIN_SWORD@2")).toBe(6);
    expect(parseEnchant("T6_MAIN_SWORD@2")).toBe(2);
    expect(parseEnchant("T6_MAIN_SWORD")).toBe(0);
    expect(parseTier("MAIN_SWORD")).toBeNull();
  });

  it("normalizes ids and builds material / artefact ids", () => {
    expect(normalizeItemId("T8_2H_AXE@3")).toBe("2H_AXE");
    expect(buildMaterialId("PLANKS", 7, 0)).toBe("T7_PLANKS");
    expect(buildMaterialId("PLANKS", 7, 2)).toBe("T7_PLANKS_LEVEL2@2");
    expect(buildArtefactId("ARTEFACT_2H_AXE_AVALON", 7)).toBe("T7_ARTEFACT_2H_AXE_AVALON");
  });
});

describe("bm crafter return rate helpers", () => {
  it("clamps percent to legacy range and converts to decimal", () => {
    expect(normalizeReturnRatePercent(12)).toBe(15.25);
    expect(normalizeReturnRatePercent(80)).toBe(60);
    expect(returnRatePercentToDecimal(30)).toBe(0.3);
  });
});

describe("calculateItemEconomics", () => {
  const recipe: BmRecipe = {
    itemId: "2H_AXE_AVALON",
    materials: [
      { itemId: "PLANKS", qty: 16 },
      { itemId: "METALBAR", qty: 8 }
    ],
    artifactId: "ARTEFACT_2H_AXE_AVALON"
  };

  it("computes craft cost, profit, daily and pct with artifact", () => {
    const materialMap = new Map<string, number>([
      ["T6_PLANKS_LEVEL1@1", 1000],
      ["T6_METALBAR_LEVEL1@1", 2000]
    ]);
    const artefactMap = new Map<string, number>([["T6_ARTEFACT_2H_AXE_AVALON", 50000]]);

    const result = calculateItemEconomics({
      item: { id: "T6_2H_AXE_AVALON@1", bm: 120000, sold: 10 },
      recipe,
      returnRate: 0.1525,
      usageFeePer100: 0,

      salesTaxRate: 0,
      getMaterialPrice: (materialId, tier, enchant) =>
        materialMap.get(buildMaterialId(materialId, tier, enchant) ?? "") ?? null,
      getArtefactPrice: (artefactId, tier) => artefactMap.get(buildArtefactId(artefactId, tier) ?? "") ?? null
    });

    expect(result).not.toBeNull();
    // materials: 16*1000 + 8*2000 = 32000; net = 32000 * (1-0.1525) = 27120
    // craftCost = 27120 + 50000 (artefact, no return) + 0 (no fee) = 77120
    expect(result!.craftCost).toBeCloseTo(77120, 6);
    expect(result!.stationFee).toBe(0);
    expect(result!.profit).toBeCloseTo(42880, 6);
    expect(result!.dailyPotential).toBeCloseTo(428800, 6);
    expect(result!.profitPct).toBeCloseTo(55.60166, 4);
  });

  it("applies station fee from item value and usage fee", () => {
    const materialMap = new Map<string, number>([
      ["T6_PLANKS_LEVEL1@1", 1000],
      ["T6_METALBAR_LEVEL1@1", 2000]
    ]);
    const artefactMap = new Map<string, number>([["T6_ARTEFACT_2H_AXE_AVALON", 50000]]);

    const result = calculateItemEconomics({
      item: { id: "T6_2H_AXE_AVALON@1", bm: 120000, sold: 10 },
      recipe,
      returnRate: 0.1525,
      usageFeePer100: 1500,

      salesTaxRate: 0,
      getMaterialPrice: (materialId, tier, enchant) =>
        materialMap.get(buildMaterialId(materialId, tier, enchant) ?? "") ?? null,
      getArtefactPrice: (artefactId, tier) => artefactMap.get(buildArtefactId(artefactId, tier) ?? "") ?? null
    });

    // T6.1 item value = 2880; fee = 2880 * 0.1125 * (1500/100) = 4860
    expect(result).not.toBeNull();
    expect(result!.stationFee).toBeCloseTo(4860, 6);
    expect(result!.craftCost).toBeCloseTo(77120 + 4860, 6);
    expect(result!.profit).toBeCloseTo(42880 - 4860, 6);
  });

  it("takes the sales tax off the Black Market price, without a setup fee", () => {
    const materialMap = new Map<string, number>([
      ["T6_PLANKS_LEVEL1@1", 1000],
      ["T6_METALBAR_LEVEL1@1", 2000]
    ]);
    const artefactMap = new Map<string, number>([["T6_ARTEFACT_2H_AXE_AVALON", 50000]]);
    const economics = (salesTaxRate: number) =>
      calculateItemEconomics({
        item: { id: "T6_2H_AXE_AVALON@1", bm: 120000, sold: 10 },
        recipe,
        returnRate: 0.1525,
        usageFeePer100: 0,
        salesTaxRate,
        getMaterialPrice: (materialId, tier, enchant) =>
          materialMap.get(buildMaterialId(materialId, tier, enchant) ?? "") ?? null,
        getArtefactPrice: (artefactId, tier) => artefactMap.get(buildArtefactId(artefactId, tier) ?? "") ?? null
      });

    // Premium 4%: 120000 * 0.04 = 4800 tax; profit = 120000 - 4800 - 77120 = 38080
    const premium = economics(salesTaxRate(true))!;
    expect(premium.salesTax).toBeCloseTo(4800, 6);
    expect(premium.profit).toBeCloseTo(38080, 6);
    expect(premium.dailyPotential).toBeCloseTo(380800, 6);
    expect(premium.profitPct).toBeCloseTo((38080 / 77120) * 100, 6);
    // no Premium 8%: 9600 tax
    expect(economics(salesTaxRate(false))!.profit).toBeCloseTo(33280, 6);
  });

  it("returns null when artifact price is required but missing", () => {
    const result = calculateItemEconomics({
      item: { id: "T6_2H_AXE_AVALON@1", bm: 120000, sold: 10 },
      recipe,
      returnRate: 0.1525,
      usageFeePer100: 0,

      salesTaxRate: 0,
      getMaterialPrice: () => 1000,
      getArtefactPrice: () => null
    });
    expect(result).toBeNull();
  });

  it("returns null when artifact price is zero (no live data)", () => {
    const result = calculateItemEconomics({
      item: { id: "T6_2H_AXE_AVALON@1", bm: 120000, sold: 10 },
      recipe,
      returnRate: 0.1525,
      usageFeePer100: 0,

      salesTaxRate: 0,
      getMaterialPrice: () => 1000,
      getArtefactPrice: () => 0
    });
    expect(result).toBeNull();
  });

  it("returns null when no material price exists", () => {
    const noMaterialRecipe: BmRecipe = {
      itemId: "2H_AXE_AVALON",
      materials: [{ itemId: "PLANKS", qty: 8 }]
    };

    const result = calculateItemEconomics({
      item: { id: "T6_2H_AXE_AVALON@1", bm: 120000, sold: 10 },
      recipe: noMaterialRecipe,
      returnRate: 0.1525,
      usageFeePer100: 0,

      salesTaxRate: 0,
      getMaterialPrice: () => null,
      getArtefactPrice: () => null
    });
    expect(result).toBeNull();
  });
});
