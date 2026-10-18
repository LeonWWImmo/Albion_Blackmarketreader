import {
  calculateConsumable,
  getReturnRatePresetConfig,
  PRODUCTION_BONUS_CITY,
} from "../core";
import type { BonusConfig, ConsumableRecipe, PriceMap } from "../core";
import { computeFocusEfficiency, resolveSpecFamily } from "../specs/data";
import type { FoodPotionFilters, FoodPotionRow } from "./types";
import { craftBonusPercentFor } from "../../../shared";

function toSearchKey(value: string): string {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function buildIngredientPrices(recipe: ConsumableRecipe, priceByItemId: Map<string, number>): PriceMap {
  const prices: PriceMap = new Map();
  for (const ingredient of recipe.ingredients) {
    const price = priceByItemId.get(ingredient.itemId);
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      prices.set(ingredient.itemId, price);
    }
  }
  return prices;
}

function matchesSearch(recipe: ConsumableRecipe, search: string): boolean {
  if (!search) return true;
  if (toSearchKey(recipe.name).includes(search)) return true;
  if (toSearchKey(recipe.itemId.replace(/_/g, " ")).includes(search)) return true;
  return recipe.ingredients.some((ingredient) => toSearchKey(ingredient.name).includes(search));
}

export function deriveFoodPotionRows(
  recipes: ConsumableRecipe[],
  filters: FoodPotionFilters,
  priceByItemId: Map<string, number>
): FoodPotionRow[] {
  const search = toSearchKey(filters.searchTerm);
  const presetConfig = getReturnRatePresetConfig(filters.returnRatePreset === "custom" ? "focus" : filters.returnRatePreset);
  const productionBonusCity = PRODUCTION_BONUS_CITY[filters.category];
  const returnRateOverride =
    filters.returnRatePreset === "custom"
      ? Math.max(0, Math.min(99, filters.customReturnRatePct)) / 100
      : null;
  const rows: FoodPotionRow[] = [];

  for (const recipe of recipes) {
    if (recipe.category !== filters.category) continue;
    if (filters.selectedTier !== null && recipe.tier !== filters.selectedTier) continue;
    if (!matchesSearch(recipe, search)) continue;

    const ingredientPrices = buildIngredientPrices(recipe, priceByItemId);
    const outputMarketPrice = priceByItemId.get(recipe.itemId) ?? 0;

    const bonuses: BonusConfig = {
      city: filters.craftCity,
      productionBonusCity,
      royalBonusPercent: presetConfig.royalBonusPercent,
      materialBonusPercent: presetConfig.materialBonusPercent,
      focusEnabled: presetConfig.focusEnabled,
      focusBonusPercent: presetConfig.focusBonusPercent,
      dailyBonusPercent: filters.dailyBonuses ? craftBonusPercentFor(recipe.itemId, filters.dailyBonuses) : 0,
      stationKind: filters.stationKind,
      hideoutBonusPercent: 0,
    };

    const focusEfficiency = filters.specProgress
      ? computeFocusEfficiency(filters.specProgress, filters.category, resolveSpecFamily(recipe.itemId, filters.category))
      : 0;

    // Station fee is driven by item value; focus is per enchant level (both from ao-bin-dumps).
    const enchant = Number((recipe.itemId.match(/@(\d+)/) || [])[1] || 0);
    const focusPerCraft = recipe.focus?.[enchant] ?? recipe.baseFocus ?? 0;

    const result = calculateConsumable({
      recipe,
      ingredientPrices,
      outputMarketPrice,
      amount: filters.amount,
      itemValue: recipe.itemValue ?? 0,
      usageFee: filters.usageFee,
      focusPerCraft,
      marketTaxRate: filters.marketTaxRate,
      demandPerDay: filters.demandPerDay,
      bonuses,
      focusEfficiency,
      returnRateOverride,
    });

    // Profit is only trustworthy when all ingredients are priced AND a sell price exists.
    const priced = !result.missingIngredientCost && result.revenue > 0;
    if (filters.showOnlyProfitable && (!priced || result.profit < 0)) continue;

    rows.push({
      rowKey: recipe.itemId,
      recipe,
      result,
    });
  }

  // Priced rows first (by profit desc); unpriced rows sink to the bottom.
  return rows.sort((a, b) => {
    const aP = !a.result.missingIngredientCost && a.result.revenue > 0;
    const bP = !b.result.missingIngredientCost && b.result.revenue > 0;
    if (aP !== bP) return aP ? -1 : 1;
    if (!aP) return a.recipe.tier - b.recipe.tier || a.recipe.name.localeCompare(b.recipe.name);
    return b.result.profitPerOutput - a.result.profitPerOutput;
  });
}
