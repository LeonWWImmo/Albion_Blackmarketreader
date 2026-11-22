// City Crafter (premium): buy the materials in one city, craft there and sell there. No transport,
// so no risk on the road. Every recipe in tiers 4-8 and enchantments 0-4 is priced from the live
// snapshot of that one city and ranked by what it earns a day (profit x what the city sells a day).
import {
  calculateCraftingUsageFee,
  getBonusCityForItem,
  productionBonusToReturnRate
} from "../../crafting-calculator/craftingCalculator.logic";
import { buildArtefactId, buildMaterialId, getFocusCost, getStationItemValue, type BmRecipe } from "../../bm-crafter/domain";
import { addBonusToReturnRate, craftBonusPercentFor, type CraftBonus } from "@shared/albion/festivities";
import { SETUP_FEE_RATE } from "@shared/albion/marketTax";
import { cellOf, LIVE_MAX_AGE_MIN, type LiveSnapshot } from "@shared/live/liveData";

/** The cities with a market and crafting stations (the Black Market buys only). */
export const CRAFT_CITIES = ["Bridgewatch", "Caerleon", "Fort Sterling", "Lymhurst", "Martlock", "Thetford", "Brecilien"] as const;
export type CraftCity = (typeof CRAFT_CITIES)[number];

/** Production bonus of a royal city station, of the city's own categories, and of focus (percent). */
export const BASE_PRODUCTION_BONUS = 18;
export const CITY_PRODUCTION_BONUS = 15;
export const FOCUS_PRODUCTION_BONUS = 59;
/** A sell order this far above the 7-day average price is marked: it may not sell at that price. */
export const SPIKE_FACTOR = 1.3;

const TIER_PREFIX: Record<number, string> = { 4: "Adept's", 5: "Expert's", 6: "Master's", 7: "Grandmaster's", 8: "Elder's" };
const PREFIX = /^(Beginner's|Novice's|Journeyman's|Adept's|Expert's|Master's|Grandmaster's|Elder's)\s+/;

/** "Beginner's Broadsword" at tier 6 -> "Master's Broadsword". */
export const tierName = (name: string, tier: number) => `${TIER_PREFIX[tier] ?? `T${tier}`} ${name.replace(PREFIX, "")}`;

export type BuyMode = "instant" | "order";
export type SellMode = "order" | "instant";

export type CityCraftOptions = {
  city: string;
  /** materials: buy the cheapest sell order (instant) or place a buy order (cheaper, waits, +setup fee) */
  buy: BuyMode;
  /** item: list it as a sell order (tax + setup fee) or sell instantly to the best buy order (tax only) */
  sell: SellMode;
  focus: boolean;
  /** sales tax share, 0.04 with Premium, 0.08 without */
  taxRate: number;
  /** station usage fee, silver per 100 nutrition */
  usageFee: number;
  tiers: readonly number[];
  enchants: readonly number[];
  /** today's crafting bonuses (empty when unknown) */
  bonuses?: ReadonlyArray<CraftBonus>;
  /** the snapshot's clock, minutes since 1970 */
  now: number;
};

export type PricedPart = { id: string; name: string; qty: number; unit: number; at: number };

const MATERIAL_NAME: Record<string, string> = { METALBAR: "Metal Bar", PLANKS: "Planks", CLOTH: "Cloth", LEATHER: "Leather", STONEBLOCK: "Stone Block" };

export type CityCraftRow = {
  id: string;
  baseId: string;
  name: string;
  categoryKey: string;
  tier: number;
  enchant: number;
  bonusCity: boolean;
  dailyBonus: number;
  returnRate: number;
  materials: PricedPart[];
  artefact: PricedPart | null;
  /** materials after the return rate, artefact and station fee: what one craft costs */
  cost: number;
  stationFee: number;
  /** the item's price in this city (sell order or buy order, per the sell mode) */
  price: number;
  priceAt: number;
  /** tax and setup fee of the sale */
  fees: number;
  profit: number;
  /** profit per silver spent, percent */
  roi: number;
  /** sold a day in this city (7-day average, all qualities) */
  sold: number;
  avgPrice: number;
  dailyProfit: number;
  focusCost: number | null;
  /** the listing is far above the 7-day average: it may not sell at that price */
  spike: boolean;
  /** the oldest price this row uses, minutes since 1970 */
  oldestAt: number;
};

type Price = { unit: number; at: number };

const fresh = (price: number, at: number, now: number) => price > 0 && now - at <= LIVE_MAX_AGE_MIN;

/** What buying one unit costs in the city: instantly (cheapest sell order) or by buy order (+setup fee). */
function buyPrice(snap: LiveSnapshot, id: string, city: string, mode: BuyMode, now: number): Price | null {
  const cell = cellOf(snap, id, city);
  if (!cell) return null;
  const [sell, sellAt, order, orderAt] = cell;
  // a buy order is paid out at its price plus the setup fee; without one, buying instantly is the way
  if (mode === "order" && fresh(order, orderAt, now)) return { unit: order * (1 + SETUP_FEE_RATE), at: orderAt };
  return fresh(sell, sellAt, now) ? { unit: sell, at: sellAt } : null;
}

/** What one crafted item sells for in the city, before tax and fees. */
function sellPrice(snap: LiveSnapshot, id: string, city: string, mode: SellMode, now: number): Price | null {
  const cell = cellOf(snap, id, city);
  if (!cell) return null;
  const [sell, sellAt, order, orderAt] = cell;
  if (mode === "instant") return fresh(order, orderAt, now) ? { unit: order, at: orderAt } : null;
  return fresh(sell, sellAt, now) ? { unit: sell, at: sellAt } : null;
}

function volumeOf(snap: LiveSnapshot, id: string, city: string): { sold: number; avg: number } {
  const at = snap.locations.indexOf(city);
  const cell = at < 0 ? 0 : snap.volume[id]?.[at];
  return cell ? { sold: cell[0], avg: cell[1] } : { sold: 0, avg: 0 };
}

/** The return rate of a craft in this city: station, city bonus, focus and today's bonus. */
export function cityReturnRate(bonusCity: boolean, focus: boolean, dailyBonus: number): number {
  const bonus = BASE_PRODUCTION_BONUS + (bonusCity ? CITY_PRODUCTION_BONUS : 0) + (focus ? FOCUS_PRODUCTION_BONUS : 0);
  return addBonusToReturnRate(productionBonusToReturnRate(bonus), dailyBonus);
}

/** One recipe at one tier and enchantment in one city, or null when a price is missing. */
export function priceCraft(snap: LiveSnapshot, recipe: BmRecipe, tier: number, enchant: number, opt: CityCraftOptions): CityCraftRow | null {
  const id = `T${tier}_${recipe.itemId}${enchant ? `@${enchant}` : ""}`;
  const out = sellPrice(snap, id, opt.city, opt.sell, opt.now);
  if (!out) return null;

  const materials: PricedPart[] = [];
  for (const mat of recipe.materials) {
    const matId = buildMaterialId(mat.itemId, tier, enchant);
    const price = matId ? buyPrice(snap, matId, opt.city, opt.buy, opt.now) : null;
    if (!matId || !price) return null;
    materials.push({ id: matId, name: `T${tier}.${enchant} ${MATERIAL_NAME[mat.itemId] ?? mat.itemId}`, qty: mat.qty, unit: price.unit, at: price.at });
  }
  let artefact: PricedPart | null = null;
  if (recipe.artifactId) {
    const artId = buildArtefactId(recipe.artifactId, tier);
    const price = artId ? buyPrice(snap, artId, opt.city, opt.buy, opt.now) : null;
    if (!artId || !price) return null;
    artefact = { id: artId, name: `T${tier} ${recipe.artifact ?? "Artefact"}`, qty: 1, unit: price.unit, at: price.at };
  }

  const bonusCity = getBonusCityForItem({ id: recipe.itemId, categoryKey: recipe.categoryKey }) === opt.city;
  const dailyBonus = opt.bonuses?.length ? craftBonusPercentFor(recipe.itemId, opt.bonuses) : 0;
  const returnRate = cityReturnRate(bonusCity, opt.focus, dailyBonus);
  const materialCost = materials.reduce((sum, m) => sum + m.unit * m.qty, 0);
  const itemValue = getStationItemValue(tier, enchant) ?? 0;
  const stationFee = calculateCraftingUsageFee(itemValue, opt.usageFee);
  const cost = materialCost * (1 - returnRate) + (artefact?.unit ?? 0) + stationFee;

  const fees = out.unit * (opt.taxRate + (opt.sell === "order" ? SETUP_FEE_RATE : 0));
  const profit = out.unit - fees - cost;
  const { sold, avg } = volumeOf(snap, id, opt.city);
  const ats = [out.at, ...materials.map((m) => m.at), ...(artefact ? [artefact.at] : [])];

  return {
    id,
    baseId: recipe.itemId,
    name: tierName(recipe.name ?? recipe.itemId, tier),
    categoryKey: recipe.categoryKey ?? "",
    tier,
    enchant,
    bonusCity,
    dailyBonus,
    returnRate,
    materials,
    artefact,
    cost,
    stationFee,
    price: out.unit,
    priceAt: out.at,
    fees,
    profit,
    roi: cost > 0 ? (profit / cost) * 100 : 0,
    sold,
    avgPrice: avg,
    dailyProfit: profit * sold,
    focusCost: opt.focus ? getFocusCost(tier, enchant, recipe) : null,
    spike: opt.sell === "order" && avg > 0 && out.unit > avg * SPIKE_FACTOR,
    oldestAt: Math.min(...ats)
  };
}

/** Every craft of the recipes in one city that has all its prices there, best first by profit a day. */
export function cityCraftRows(snap: LiveSnapshot, recipes: readonly BmRecipe[], opt: CityCraftOptions): CityCraftRow[] {
  const rows: CityCraftRow[] = [];
  for (const recipe of recipes) {
    // royal and shapeshifter items are not crafted from these recipes
    if (/_ROYAL(\b|_)|SHAPESHIFTER/i.test(recipe.itemId)) continue;
    for (const tier of opt.tiers) {
      for (const enchant of opt.enchants) {
        const row = priceCraft(snap, recipe, tier, enchant, opt);
        if (row) rows.push(row);
      }
    }
  }
  return rows.sort((a, b) => b.dailyProfit - a.dailyProfit || b.profit - a.profit);
}

/** Is the row worth showing: profit, enough return on the silver, and a market that sells it. */
export const worthIt = (row: CityCraftRow, minRoi: number, minSold: number) => row.profit > 0 && row.roi >= minRoi && row.sold >= minSold && !row.spike;

/** How each city does today: its good crafts and what the best ten of them earn a day together. */
export function citySummary(snap: LiveSnapshot, recipes: readonly BmRecipe[], opt: Omit<CityCraftOptions, "city">, minRoi: number, minSold: number) {
  return CRAFT_CITIES.map((city) => {
    const good = cityCraftRows(snap, recipes, { ...opt, city }).filter((row) => worthIt(row, minRoi, minSold));
    const top = [...good].sort((a, b) => b.dailyProfit - a.dailyProfit).slice(0, 10);
    return { city, count: good.length, topDaily: top.reduce((sum, row) => sum + row.dailyProfit, 0), best: top[0] ?? null };
  });
}
