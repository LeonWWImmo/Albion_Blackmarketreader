import { describe, expect, it } from "vitest";
import {
  createStackingContext,
  getReturnRatePresetConfig,
  makeRefiner,
} from "../core";
import type { RefineTierInput, RefineVariant } from "../core";
import { MATERIAL_BY_KEY, REFINE_VARIANTS } from "../data";

const variantByItemId = new Map<string, RefineVariant>(REFINE_VARIANTS.map((v) => [v.itemId, v]));

// Price every raw ingredient cheap (100); price every refined-kind ingredient at `refinedMarket`.
function buildInputs(refinedMarket: number): RefineTierInput[] {
  const map = new Map<string, RefineTierInput>();
  for (const variant of REFINE_VARIANTS) {
    for (const ing of variant.ingredients) {
      map.set(ing.itemId, {
        materialKey: ing.materialKey,
        kind: ing.kind,
        tier: ing.tier,
        enchant: ing.enchant,
        itemId: ing.itemId,
        unitPrice: ing.kind === "raw" ? 100 : refinedMarket,
      });
    }
  }
  return [...map.values()];
}

function makeRefineFn() {
  const target = REFINE_VARIANTS.find((v) => v.tier === 6 && v.enchant === 0 && v.materialKey === "metal")!;
  const profile = getReturnRatePresetConfig("base");
  const refiner = makeRefiner({
    city: MATERIAL_BY_KEY[target.materialKey].bonusCity,
    materialBonusCity: MATERIAL_BY_KEY[target.materialKey].bonusCity,
    royalBonusPercent: profile.royalBonusPercent,
    materialBonusPercent: profile.materialBonusPercent,
    focusEnabled: profile.focusEnabled,
    focusBonusPercent: profile.focusBonusPercent,
    marketTaxRate: 0.065,
    amount: 1,
  });
  return { target, refine: (v: RefineVariant, ti: ReadonlyArray<RefineTierInput>) => refiner(v, ti, 400) };
}

describe("stacking refining", () => {
  it("self-refines the lower tiers when buying refined material is expensive", () => {
    const inputs = buildInputs(1_000_000); // refined market absurdly expensive
    const { target, refine } = makeRefineFn();
    const ctx = createStackingContext(variantByItemId, inputs, refine);

    const standard = refine(target, inputs);
    const stacked = ctx.stackFor(target);

    expect(stacked.available).toBe(true);
    expect(stacked.selfRefinedTiers.length).toBeGreaterThan(0); // it chose to self-refine
    expect(stacked.result.totalCost).toBeLessThan(standard.totalCost); // and it is cheaper
  });

  it("buys the refined material when it is cheaper than self-refining", () => {
    const inputs = buildInputs(1); // refined market basically free
    const { target, refine } = makeRefineFn();
    const ctx = createStackingContext(variantByItemId, inputs, refine);

    const standard = refine(target, inputs);
    const stacked = ctx.stackFor(target);

    expect(stacked.selfRefinedTiers).toHaveLength(0); // no self-refine beneficial
    expect(stacked.result.totalCost).toBeCloseTo(standard.totalCost, 6); // identical to standard
  });

  it("never costs more than the standard (buy-everything) path", () => {
    for (const refinedMarket of [1, 1000, 50_000, 1_000_000]) {
      const inputs = buildInputs(refinedMarket);
      const { target, refine } = makeRefineFn();
      const ctx = createStackingContext(variantByItemId, inputs, refine);
      const standard = refine(target, inputs);
      const stacked = ctx.stackFor(target);
      expect(stacked.result.totalCost).toBeLessThanOrEqual(standard.totalCost + 1e-6);
    }
  });
});
