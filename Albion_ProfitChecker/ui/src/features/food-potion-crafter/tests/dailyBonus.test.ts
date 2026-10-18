import { describe, expect, it } from "vitest";
import { computeReturnRateFromBonusPercent } from "../core";
import type { ConsumableRecipe } from "../core";
import { deriveFoodPotionRows } from "../hooks/deriveRows";
import type { FoodPotionFilters } from "../hooks/types";

const OMELETTE: ConsumableRecipe = {
  itemId: "T6_MEAL_OMELETTE",
  name: "Pork Omelette",
  tier: 6,
  category: "food",
  outputQty: 10,
  isAvalonian: false,
  ingredients: [{ itemId: "T6_A", name: "A", qty: 4, tier: 6 }]
};

const FILTERS: FoodPotionFilters = {
  category: "food",
  selectedTier: null,
  searchTerm: "",
  craftCity: "Martlock",
  buyCity: "Martlock",
  sellCity: "Martlock",
  stationKind: "city",
  returnRatePreset: "base",
  customReturnRatePct: 40,
  amount: 1,
  usageFee: 0,
  marketTaxRate: 0,
  demandPerDay: 0,
  showOnlyProfitable: false
};

const PRICES = new Map([["T6_A", 1000], ["T6_MEAL_OMELETTE", 600]]);
const FOOD_BONUS = [{ name: "COMMON_FOOD", category: "food", percent: 10, label: "Food", end: "2026-10-19T10:00:00.000Z" }];
const POTION_BONUS = [{ name: "RARE_POTION", category: "potion", percent: 20, label: "Potions", end: "2026-10-19T10:00:00.000Z" }];

const returnRate = (filters: FoodPotionFilters) => deriveFoodPotionRows([OMELETTE], filters, PRICES)[0].result.returnRate;

describe("daily bonus in the Food & Potion Crafter", () => {
  it("adds a food bonus to food recipes", () => {
    expect(returnRate(FILTERS)).toBeCloseTo(computeReturnRateFromBonusPercent(18), 10);
    expect(returnRate({ ...FILTERS, dailyBonuses: FOOD_BONUS })).toBeCloseTo(computeReturnRateFromBonusPercent(28), 10);
  });

  it("ignores a bonus for another category, a custom rate and island stations", () => {
    expect(returnRate({ ...FILTERS, dailyBonuses: POTION_BONUS })).toBeCloseTo(computeReturnRateFromBonusPercent(18), 10);
    expect(returnRate({ ...FILTERS, dailyBonuses: FOOD_BONUS, returnRatePreset: "custom", customReturnRatePct: 40 })).toBeCloseTo(0.4, 10);
    expect(returnRate({ ...FILTERS, dailyBonuses: FOOD_BONUS, stationKind: "island" })).toBe(0);
  });
});
