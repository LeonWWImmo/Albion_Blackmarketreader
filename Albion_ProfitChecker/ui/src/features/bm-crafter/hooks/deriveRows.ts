import {
  calculateItemEconomics,
  getArtefactPriceFromMap,
  getMaterialPriceFromMap,
  normalizeItemId,
  parseEnchant,
  parseTier
} from "../domain";
import { addBonusToReturnRate, craftBonusPercentFor, resolveJournalProfit } from "../../../shared";
import type { BmCrafterDataBundle } from "../data";
import type { BmCrafterFilters, BmCrafterRow } from "./types";

const MIN_PROFIT_PCT = 20;

function toSearchKey(value: string): string {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function toDisplayName(itemId: string, recipeName?: string): string {
  if (recipeName) return recipeName;
  const base = normalizeItemId(itemId).replace(/_/g, " ").trim();
  return base || itemId;
}

export function deriveBmCrafterRows(bundle: BmCrafterDataBundle | null, filters: BmCrafterFilters): BmCrafterRow[] {
  if (!bundle) return [];

  const recipeMap = bundle.recipes.byItemId;
  const rows: BmCrafterRow[] = [];
  const search = toSearchKey(filters.searchTerm);

  const cityEntries = bundle.cityMaterials ? Array.from(bundle.cityMaterials.entries()) : [];
  const cityMaterialsFlat: Map<string, number> = cityEntries.length > 0
    ? new Map(cityEntries.map(([itemId, prices]) => [itemId, prices[filters.craftCity] ?? 0]))
    : bundle.materials.byItemId;
  let rowCounter = 0;

  for (const item of bundle.market.items) {
    const id = item.id || "";
    if (/_ROYAL(\b|_)/i.test(id)) continue;
    if (/SHAPESHIFTER/i.test(id)) continue;

    const tier = parseTier(id);
    const enchant = parseEnchant(id);

    if (filters.selectedTiers.length > 0 && (tier === null || !filters.selectedTiers.includes(tier))) continue;
    if (filters.selectedEnchants.length > 0 && !filters.selectedEnchants.includes(enchant)) continue;

    const sold = Number(item.sold || 0);
    if (sold < filters.minSold) continue;

    const baseId = normalizeItemId(id);
    const recipe = recipeMap.get(baseId);
    if (!recipe) continue;
    if (filters.nonArtefactOnly && recipe.artifactId) continue;

    // Today's daily crafting bonus raises this item's return rate on top of the one entered.
    const dailyBonusPercent = filters.dailyBonus ? craftBonusPercentFor(baseId, filters.dailyBonus.bonuses) : 0;
    if (filters.dailyBonus?.onlyBonusItems && dailyBonusPercent <= 0) continue;

    const displayName = toDisplayName(id, recipe.name);
    if (search) {
      const idKey = toSearchKey(baseId.replace(/_/g, " "));
      const nameKey = toSearchKey(displayName);
      if (!idKey.includes(search) && !nameKey.includes(search)) continue;
    }

    const materialMap = cityMaterialsFlat;
    const economics = calculateItemEconomics({
      item,
      recipe,
      returnRate: addBonusToReturnRate(filters.returnRate, dailyBonusPercent),
      usageFeePer100: filters.usageFeePer100,
      getMaterialPrice: (materialId, t, e) => getMaterialPriceFromMap(materialMap, materialId, t, e),
      getArtefactPrice: (artefactId, t) => getArtefactPriceFromMap(bundle.artefacts.byItemId, artefactId, t)
    });

    if (!economics) continue;

    // Fold crafting-journal profit into the economics BEFORE the profit gates, so journals can
    // genuinely rescue an otherwise sub-threshold craft.
    let economicsOut = economics;
    let journalProfit = 0;
    let journalProfession: BmCrafterRow["journalProfession"] = null;
    if (filters.journal?.enabled && tier !== null) {
      const totalResourceCount = recipe.materials.reduce((sum, mat) => sum + Number(mat.qty || 0), 0);
      const jr = resolveJournalProfit(
        { categoryKey: recipe.categoryKey, itemId: id, tier, artifactId: recipe.artifactId, totalResourceCount, city: filters.craftCity },
        true,
        filters.journal.owned,
        filters.journal.data
      );
      if (jr && jr.journalProfit !== 0) {
        journalProfit = jr.journalProfit;
        journalProfession = jr.profession;
        const adjProfit = economics.profit + journalProfit;
        const adjPct = economics.craftCost > 0 ? (adjProfit / economics.craftCost) * 100 : economics.profitPct;
        const adjDaily = Number.isFinite(item.sold) ? adjProfit * Number(item.sold) : economics.dailyPotential;
        const adjPerFocus = economics.focusCost && economics.focusCost > 0 ? adjProfit / economics.focusCost : economics.profitPerFocus;
        economicsOut = { ...economics, profit: adjProfit, profitPct: adjPct, dailyPotential: adjDaily, profitPerFocus: adjPerFocus };
      }
    }

    if (filters.showOnlyProfitable && economicsOut.profit < 0) continue;
    if (!Number.isFinite(economicsOut.profitPct) || (economicsOut.profitPct as number) < MIN_PROFIT_PCT) continue;

    rows.push({
      rowKey: `${item.id}#${rowCounter}`,
      item,
      recipe,
      economics: economicsOut,
      tier,
      enchant,
      displayName,
      journalProfit,
      journalProfession,
      dailyBonusPercent
    });
    rowCounter += 1;
  }

  return rows.sort((a, b) => {
    if (filters.sortByDailyTop) {
      const aDaily = Number.isFinite(a.economics.dailyPotential) ? (a.economics.dailyPotential as number) : -Infinity;
      const bDaily = Number.isFinite(b.economics.dailyPotential) ? (b.economics.dailyPotential as number) : -Infinity;
      return bDaily - aDaily;
    }
    const aPct = Number.isFinite(a.economics.profitPct) ? (a.economics.profitPct as number) : -Infinity;
    const bPct = Number.isFinite(b.economics.profitPct) ? (b.economics.profitPct as number) : -Infinity;
    return bPct - aPct;
  });
}
