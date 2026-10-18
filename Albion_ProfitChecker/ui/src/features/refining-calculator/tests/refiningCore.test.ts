import { describe, expect, it } from "vitest";
import {
  applyBonuses,
  calculateRefining,
  computeProfit,
  computeReturnRate,
  computeReturnRateFromBonusPercent,
  computeStationFee,
  createRefiningInput,
  getReturnRatePresetConfig,
  makeRefiner,
  sumRepeatedValue
} from "../core";
import { DEFAULT_PRICE_BY_ITEM_ID, MATERIAL_BY_KEY, REFINE_VARIANTS, refinedItemIdFor } from "../data";

function inputsForVariant(variant = REFINE_VARIANTS[0]) {
  return variant.ingredients.map((ingredient) => ({
    materialKey: ingredient.materialKey,
    kind: ingredient.kind,
    tier: ingredient.tier,
    enchant: ingredient.enchant,
    itemId: ingredient.itemId,
    unitPrice: DEFAULT_PRICE_BY_ITEM_ID[ingredient.itemId] || 100
  }));
}

describe("refining core", () => {
  it("is deterministic for same input", () => {
    const variant = REFINE_VARIANTS.find((entry) => entry.tier === 4 && entry.enchant === 0 && entry.materialKey === "metal")!;
    const profile = getReturnRatePresetConfig("focus");
    const input = createRefiningInput({
      variant,
      tierInputs: inputsForVariant(variant),
      usageFeePer100: 400,
      city: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      materialBonusCity: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      ...profile
    });
    expect(calculateRefining(input)).toEqual(calculateRefining(input));
  });

  it("computeProfit handles negative case", () => {
    expect(computeProfit(1000, 800)).toBe(-200);
  });

  it("computeStationFee follows usage fee per 100 and nutrition factor", () => {
    const fee = computeStationFee(10000, 400, 0.1125);
    expect(fee).toBe(4500);
  });

  it("computes Albion-style return rate from bonus percent", () => {
    expect(computeReturnRateFromBonusPercent(18)).toBeCloseTo(0.1525, 3);
    expect(computeReturnRateFromBonusPercent(58)).toBeCloseTo(0.3671, 3);
  });

  it("focus increases return rate and focus cost", () => {
    const variant = REFINE_VARIANTS.find((entry) => entry.tier === 5 && entry.enchant === 1 && entry.materialKey === "hide")!;
    const cityProfile = getReturnRatePresetConfig("city");
    const focusedProfile = getReturnRatePresetConfig("focus");
    const base = createRefiningInput({
      variant,
      tierInputs: inputsForVariant(variant),
      usageFeePer100: 400,
      city: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      materialBonusCity: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      ...cityProfile
    });
    const focused = createRefiningInput({
      variant,
      tierInputs: inputsForVariant(variant),
      usageFeePer100: 400,
      city: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      materialBonusCity: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      ...focusedProfile
    });
    expect(computeReturnRate(focused)).toBeGreaterThan(computeReturnRate(base));
    expect(calculateRefining(focused).focusCost).toBeGreaterThan(0);
  });

  it("uses the current refining bonus cities per material", () => {
    expect(MATERIAL_BY_KEY.metal.bonusCity).toBe("Thetford");
    expect(MATERIAL_BY_KEY.wood.bonusCity).toBe("Fort Sterling");
    expect(MATERIAL_BY_KEY.fiber.bonusCity).toBe("Lymhurst");
    expect(MATERIAL_BY_KEY.hide.bonusCity).toBe("Martlock");
    expect(MATERIAL_BY_KEY.stone.bonusCity).toBe("Bridgewatch");
  });

  it("models enchanted stone as more flat stone blocks, not enchanted blocks", () => {
    const variant = REFINE_VARIANTS.find((entry) => entry.tier === 5 && entry.enchant === 3 && entry.materialKey === "stone")!;
    const result = makeRefiner({
      city: "Bridgewatch",
      materialBonusCity: "Bridgewatch",
      ...getReturnRatePresetConfig("city")
    })(variant, inputsForVariant(variant), 400);
    expect(variant.itemId).toBe(refinedItemIdFor("stone", 5, 0));
    expect(variant.outputQuantity).toBe(8);
    expect(variant.ingredients).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "raw", itemId: "T5_ROCK_LEVEL3@3", quantity: 3 }),
      expect.objectContaining({ kind: "refined", itemId: "T4_STONEBLOCK", quantity: 8 }),
    ]));
    expect(result.outputAmount).toBe(8);
  });

  it("uses full raw quantity for enchanted refining (matches in-game recipe)", () => {
    const t6Metal2 = REFINE_VARIANTS.find((entry) => entry.tier === 6 && entry.enchant === 2 && entry.materialKey === "metal")!;
    expect(t6Metal2.ingredients).toEqual([
      expect.objectContaining({ kind: "raw", itemId: "T6_ORE_LEVEL2@2", quantity: 4 }),
      expect.objectContaining({ kind: "refined", itemId: "T5_METALBAR_LEVEL2@2", quantity: 1 }),
    ]);

    const t5Cloth1 = REFINE_VARIANTS.find((entry) => entry.tier === 5 && entry.enchant === 1 && entry.materialKey === "fiber")!;
    expect(t5Cloth1.ingredients).toEqual([
      expect.objectContaining({ kind: "raw", itemId: "T5_FIBER_LEVEL1@1", quantity: 3 }),
      expect.objectContaining({ kind: "refined", itemId: "T4_CLOTH_LEVEL1@1", quantity: 1 }),
    ]);

    const t8Wood4 = REFINE_VARIANTS.find((entry) => entry.tier === 8 && entry.enchant === 4 && entry.materialKey === "wood")!;
    expect(t8Wood4.ingredients).toEqual([
      expect.objectContaining({ kind: "raw", itemId: "T8_WOOD_LEVEL4@4", quantity: 5 }),
      expect.objectContaining({ kind: "refined", itemId: "T7_PLANKS_LEVEL4@4", quantity: 1 }),
    ]);
  });

  it("falls back to non-enchanted sub-material at T4 (T3 has no enchants)", () => {
    const t4Metal1 = REFINE_VARIANTS.find((entry) => entry.tier === 4 && entry.enchant === 1 && entry.materialKey === "metal")!;
    expect(t4Metal1.ingredients).toEqual([
      expect.objectContaining({ kind: "raw", itemId: "T4_ORE_LEVEL1@1", quantity: 2 }),
      expect.objectContaining({ kind: "refined", itemId: "T3_METALBAR", quantity: 1 }),
    ]);

    const t4Hide4 = REFINE_VARIANTS.find((entry) => entry.tier === 4 && entry.enchant === 4 && entry.materialKey === "hide")!;
    expect(t4Hide4.ingredients).toEqual([
      expect.objectContaining({ kind: "raw", itemId: "T4_HIDE_LEVEL4@4", quantity: 2 }),
      expect.objectContaining({ kind: "refined", itemId: "T3_LEATHER", quantity: 1 }),
    ]);
  });

  it("non-enchanted recipes follow Albion raw/sub quantities", () => {
    const t3 = REFINE_VARIANTS.find((entry) => entry.tier === 3 && entry.enchant === 0 && entry.materialKey === "metal")!;
    expect(t3.ingredients).toEqual([
      expect.objectContaining({ itemId: "T3_ORE", quantity: 2 }),
      expect.objectContaining({ itemId: "T2_METALBAR", quantity: 1 }),
    ]);

    const t5 = REFINE_VARIANTS.find((entry) => entry.tier === 5 && entry.enchant === 0 && entry.materialKey === "metal")!;
    expect(t5.ingredients).toEqual([
      expect.objectContaining({ itemId: "T5_ORE", quantity: 3 }),
      expect.objectContaining({ itemId: "T4_METALBAR", quantity: 1 }),
    ]);

    const t8 = REFINE_VARIANTS.find((entry) => entry.tier === 8 && entry.enchant === 0 && entry.materialKey === "metal")!;
    expect(t8.ingredients).toEqual([
      expect.objectContaining({ itemId: "T8_ORE", quantity: 5 }),
      expect.objectContaining({ itemId: "T7_METALBAR", quantity: 1 }),
    ]);
  });

  it("uses full recipe cost including previous refined input", () => {
    const variant = REFINE_VARIANTS.find((entry) => entry.tier === 6 && entry.enchant === 2 && entry.materialKey === "wood")!;
    const result = makeRefiner({
      city: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      materialBonusCity: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      ...getReturnRatePresetConfig("focus")
    })(variant, inputsForVariant(variant), 400);
    expect(variant.ingredients.length).toBe(2);
    expect(result.grossMaterialCost).toBeGreaterThan(0);
    expect(result.grossMaterialCost).toBeGreaterThan(result.effectiveMaterialCost);
    expect(result.profitPercent).toBeTypeOf("number");
  });

  it("flags missing ingredient prices", () => {
    const variant = REFINE_VARIANTS.find((entry) => entry.tier === 4 && entry.enchant === 0 && entry.materialKey === "stone")!;
    const result = makeRefiner({
      city: "Bridgewatch",
      materialBonusCity: "Bridgewatch",
      ...getReturnRatePresetConfig("city")
    })(variant, [], 400);
    expect(result.missingInputCost).toBe(true);
  });

  it("uses recursion for repeated value without mutating state", () => {
    expect(sumRepeatedValue(125, 4)).toBe(500);
    expect(sumRepeatedValue(125, 0)).toBe(0);
  });

  it("adds today's daily refining bonus to the production bonus, but never to a custom rate", () => {
    const variant = REFINE_VARIANTS.find((entry) => entry.tier === 4 && entry.enchant === 0 && entry.materialKey === "metal")!;
    const base = {
      variant,
      tierInputs: inputsForVariant(variant),
      usageFeePer100: 400,
      city: "Martlock" as const,
      materialBonusCity: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      ...getReturnRatePresetConfig("base")
    };
    expect(computeReturnRate(createRefiningInput(base))).toBeCloseTo(computeReturnRateFromBonusPercent(18), 10);
    expect(computeReturnRate(createRefiningInput({ ...base, dailyBonusPercent: 20 }))).toBeCloseTo(computeReturnRateFromBonusPercent(38), 10);
    expect(computeReturnRate(createRefiningInput({ ...base, dailyBonusPercent: 20, returnRateOverride: 0.5 }))).toBe(0.5);

    const refine = makeRefiner({ ...base, dailyBonusPercent: 10 });
    expect(refine(variant, inputsForVariant(variant), 400).returnRate).toBeCloseTo(computeReturnRateFromBonusPercent(28), 10);
  });

  it("applyBonuses is immutable", () => {
    const variant = REFINE_VARIANTS[0];
    const input = createRefiningInput({
      variant,
      tierInputs: inputsForVariant(variant),
      usageFeePer100: 400,
      city: "Martlock",
      materialBonusCity: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      ...getReturnRatePresetConfig("city")
    });
    const original = calculateRefining(input);
    const updated = applyBonuses(original, { ...input.bonuses, city: MATERIAL_BY_KEY[variant.materialKey].bonusCity });
    expect(updated).not.toBe(original);
    expect(original.returnRate).not.toBe(updated.returnRate);
  });
});
