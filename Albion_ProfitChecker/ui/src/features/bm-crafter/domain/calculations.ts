import type {
  BmRecipe,
  CalculateItemEconomicsInput,
  ItemEconomics,
  MaterialCostResult
} from "./types";

// TRUE BASE focus cost PER MAT per power level (mastery 0, spec 0).
// Sourced from community spreadsheet "Refining Focus - Fees" (Goldenium2024).
// Power index = (tier - 2) + enchant. Doubles per tier and per enchant.
// Per-craft base focus = Σ(mat.qty × BASE_FOCUS_PER_MAT_BY_POWER[mat power]).
// Verified vs Gear Crafting C30 (e.g. T4.0 Bow with 32 PLANKS: 32 * 54 = 1728 vs sheet 1715).
const BASE_FOCUS_PER_MAT_BY_POWER = [18, 31, 54, 94, 164, 287, 503, 880, 1539, 2694, 4714] as const;

function getBaseFocusPerMat(tier: number, enchant: number): number {
  const safeTier = Math.max(2, Math.min(8, Math.floor(tier)));
  const safeEnchant = Math.max(0, Math.min(4, Math.floor(enchant)));
  const power = (safeTier - 2) + safeEnchant;
  const safePower = Math.max(0, Math.min(BASE_FOCUS_PER_MAT_BY_POWER.length - 1, power));
  return BASE_FOCUS_PER_MAT_BY_POWER[safePower];
}

// Standard crafted-equipment ItemValue per (tier, enchant) used by Albion's
// station fee formula: stationFee = itemValue * 0.1125 * usageFeePer100 / 100.
const STATION_ITEM_VALUE: Record<string, number> = {
  "4-0": 256, "4-1": 720, "4-2": 1980, "4-3": 5400, "4-4": 14760,
  "5-0": 512, "5-1": 1440, "5-2": 3960, "5-3": 10800, "5-4": 29520,
  "6-0": 1024, "6-1": 2880, "6-2": 7920, "6-3": 21600, "6-4": 59040,
  "7-0": 2048, "7-1": 5760, "7-2": 15840, "7-3": 43200, "7-4": 118080,
  "8-0": 4096, "8-1": 11520, "8-2": 31680, "8-3": 86400, "8-4": 236160,
};

const STATION_FEE_NUTRITION_FACTOR = 0.1125;

export function getFocusCost(tier: number, enchant: number, recipe?: BmRecipe | null): number | null {
  if (!recipe || !Array.isArray(recipe.materials) || recipe.materials.length === 0) return null;
  const perMat = getBaseFocusPerMat(tier, enchant);
  let total = 0;
  for (const mat of recipe.materials) {
    const qty = Number(mat?.qty);
    if (Number.isFinite(qty) && qty > 0) total += qty * perMat;
  }
  return total > 0 ? total : null;
}

export function getStationItemValue(tier: number, enchant: number): number | null {
  return STATION_ITEM_VALUE[`${tier}-${enchant}`] ?? null;
}

export function computeStationFee(itemValue: number, usageFeePer100: number): number {
  if (!Number.isFinite(itemValue) || itemValue <= 0) return 0;
  if (!Number.isFinite(usageFeePer100) || usageFeePer100 <= 0) return 0;
  return itemValue * STATION_FEE_NUTRITION_FACTOR * (usageFeePer100 / 100);
}

export function parseTier(id: string): number | null {
  const match = String(id || "").match(/^T(\d+)_/);
  return match ? Number(match[1]) : null;
}

export function parseEnchant(id: string): number {
  const match = String(id || "").match(/@(\d+)/);
  return match ? Number(match[1]) : 0;
}

export function normalizeItemId(id: string): string {
  return String(id || "").replace(/^T\d+_/, "").replace(/@\d+$/, "");
}

export function buildMaterialId(base: string, tier: number, enchant: number): string | null {
  if (!base || !tier) return null;
  if (Number.isFinite(enchant) && enchant > 0) {
    return `T${tier}_${base}_LEVEL${enchant}@${enchant}`;
  }
  return `T${tier}_${base}`;
}

export function buildArtefactId(artefactId: string, tier: number): string | null {
  if (!artefactId || !tier) return null;
  return `T${tier}_${artefactId}`;
}

export function normalizeReturnRatePercent(rawPercent: number, min = 15.25, max = 60): number {
  if (!Number.isFinite(rawPercent)) return min;
  return Math.max(min, Math.min(max, rawPercent));
}

export function returnRatePercentToDecimal(rawPercent: number): number {
  return normalizeReturnRatePercent(rawPercent) / 100;
}

export function getMaterialPriceFromMap(
  materialMap: Map<string, number>,
  name: string,
  tier: number,
  enchant: number
): number | null {
  if (!name) return null;
  const fullKey = buildMaterialId(name, tier, enchant);
  if (fullKey && materialMap.has(fullKey)) return materialMap.get(fullKey) ?? null;
  if (materialMap.has(name)) return materialMap.get(name) ?? null;
  return null;
}

export function getArtefactPriceFromMap(
  artefactMap: Map<string, number>,
  artefactId: string,
  tier: number
): number | null {
  const key = buildArtefactId(artefactId, tier);
  if (!key) return null;
  return artefactMap.get(key) ?? null;
}

export function calculateMaterialCost(
  recipe: BmRecipe,
  tier: number,
  enchant: number,
  getMaterialPrice: (materialId: string, tier: number, enchant: number) => number | null
): MaterialCostResult {
  let sum = 0;
  // Every material must have a real (>0) price, otherwise the craft cost is
  // incomplete and would produce a bogus (too-high) profit. A 0/missing price
  // (e.g. no Black Market/city listing for that tier) disqualifies the row.
  let hasPrice = recipe.materials.length > 0;

  for (const mat of recipe.materials) {
    const unit = getMaterialPrice(mat.itemId, tier, enchant);
    if (typeof unit === "number" && unit > 0) {
      sum += unit * Number(mat.qty || 0);
    } else {
      hasPrice = false;
    }
  }

  return { sum, hasPrice };
}

export function calculateItemEconomics(input: CalculateItemEconomicsInput): ItemEconomics | null {
  const { item, recipe, returnRate, usageFeePer100, salesTaxRate, getMaterialPrice, getArtefactPrice } = input;
  if (!recipe || !Array.isArray(recipe.materials)) return null;
  const bmPrice = item.bm;
  if (typeof bmPrice !== "number" || !Number.isFinite(bmPrice)) return null;

  const tier = parseTier(item.id);
  if (!tier) return null;
  const enchant = parseEnchant(item.id);

  const materialCost = calculateMaterialCost(recipe, tier, enchant, getMaterialPrice);
  if (!materialCost.hasPrice) return null;

  let craftCost = materialCost.sum * (1 - returnRate);
  if (recipe.artifactId) {
    const artefactPrice = getArtefactPrice(recipe.artifactId, tier);
    if (typeof artefactPrice !== "number" || !Number.isFinite(artefactPrice) || artefactPrice <= 0) return null;
    craftCost += artefactPrice;
  }

  const stationItemValue = getStationItemValue(tier, enchant);
  const stationFee = stationItemValue ? computeStationFee(stationItemValue, usageFeePer100) : 0;
  craftCost += stationFee;

  // selling to the Black Market fills its buy order: only the sales tax applies, no setup fee
  const salesTax = bmPrice * salesTaxRate;
  const profit = bmPrice - salesTax - craftCost;
  if (!Number.isFinite(profit)) return null;

  const dailyPotential = Number.isFinite(item.sold) ? profit * Number(item.sold) : null;
  const profitPct = craftCost > 0 ? (profit / craftCost) * 100 : null;
  const focusCost = getFocusCost(tier, enchant, recipe);
  const profitPerFocus = focusCost && focusCost > 0 ? profit / focusCost : null;

  return {
    craftCost,
    stationFee,
    salesTax,
    profit,
    dailyPotential,
    profitPct: Number.isFinite(profitPct) ? profitPct : null,
    focusCost,
    profitPerFocus: profitPerFocus !== null && Number.isFinite(profitPerFocus) ? profitPerFocus : null
  };
}
