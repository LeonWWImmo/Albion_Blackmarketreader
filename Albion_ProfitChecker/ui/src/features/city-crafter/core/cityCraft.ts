// City Crafter (premium): craft and sell in one city, the materials bought there or wherever they
// are cheapest. Every recipe in tiers 4-8 and enchantments 0-4 is priced from a price book (live
// snapshot, daily data, or live filled with daily: core/books.ts) and ranked by what it earns a day
// (profit x what the city sells a day).
import {
  calculateCraftingUsageFee,
  getBonusCityForItem,
  productionBonusToReturnRate
} from "../../crafting-calculator/craftingCalculator.logic";
import { buildArtefactId, buildMaterialId, getFocusCost, getStationItemValue, type BmRecipe } from "../../bm-crafter/domain";
import { addBonusToReturnRate, craftBonusPercentFor, type CraftBonus } from "@shared/albion/festivities";
import { SETUP_FEE_RATE } from "@shared/albion/marketTax";
import type { PriceBook, Quote } from "./books";

/** The cities with a market and crafting stations (the Black Market buys only). */
export const CRAFT_CITIES = ["Bridgewatch", "Caerleon", "Fort Sterling", "Lymhurst", "Martlock", "Thetford", "Brecilien"] as const;

/** Production bonus of a royal city station, of the city's own categories, and of focus (percent). */
export const BASE_PRODUCTION_BONUS = 18;
export const CITY_PRODUCTION_BONUS = 15;
export const FOCUS_PRODUCTION_BONUS = 59;
/** A sell order this far above the 7-day average price is left out: it may not sell at that price. */
export const SPIKE_FACTOR = 1.3;

const TIER_PREFIX: Record<number, string> = { 4: "Adept's", 5: "Expert's", 6: "Master's", 7: "Grandmaster's", 8: "Elder's" };
const PREFIX = /^(Beginner's|Novice's|Journeyman's|Adept's|Expert's|Master's|Grandmaster's|Elder's)\s+/;

/** "Beginner's Broadsword" at tier 6 -> "Master's Broadsword". */
export const tierName = (name: string, tier: number) => `${TIER_PREFIX[tier] ?? `T${tier}`} ${name.replace(PREFIX, "")}`;

export type BuyMode = "instant" | "order";
export type SellMode = "order" | "instant";
/** where the materials come from: the crafting city, or each from the city where it is cheapest */
export type MatFrom = "city" | "cheapest";

export type CityCraftOptions = {
  city: string;
  matFrom: MatFrom;
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
};

export type PricedPart = Quote & { id: string; name: string; qty: number; city: string };

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
  /** all materials at full price, before the return rate */
  materialCost: number;
  /** materials after the return rate, artefact and station fee: what one craft costs */
  cost: number;
  stationFee: number;
  /** the item's price in this city (sell order or buy order, per the sell mode) */
  sale: Quote;
  /** tax and setup fee of the sale */
  fees: number;
  /** what one item brings in after tax and fees */
  net: number;
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
  /** a material comes from another city */
  imported: boolean;
};

/** What buying one unit costs in a city: instantly (cheapest sell order) or by buy order (+setup fee). */
function buyIn(book: PriceBook, id: string, city: string, mode: BuyMode): Quote | null {
  const order = mode === "order" ? book.order(id, city) : null;
  // a buy order is paid out at its price plus the setup fee; without one, buying instantly is the way
  if (order) return { ...order, unit: order.unit * (1 + SETUP_FEE_RATE) };
  return book.sell(id, city);
}

/** Where to buy a material: the crafting city, or the city where it costs least. */
function buyPart(book: PriceBook, id: string, opt: CityCraftOptions): (Quote & { city: string }) | null {
  const cities = opt.matFrom === "cheapest" ? CRAFT_CITIES : [opt.city];
  let best: (Quote & { city: string }) | null = null;
  for (const city of cities) {
    const quote = buyIn(book, id, city, opt.buy);
    // the crafting city wins a tie: nothing to carry
    if (quote && (!best || quote.unit < best.unit || (quote.unit === best.unit && city === opt.city))) best = { ...quote, city };
  }
  return best;
}

/** The return rate of a craft in this city: station, city bonus, focus and today's bonus. */
export function cityReturnRate(bonusCity: boolean, focus: boolean, dailyBonus: number): number {
  const bonus = BASE_PRODUCTION_BONUS + (bonusCity ? CITY_PRODUCTION_BONUS : 0) + (focus ? FOCUS_PRODUCTION_BONUS : 0);
  return addBonusToReturnRate(productionBonusToReturnRate(bonus), dailyBonus);
}

/** One recipe at one tier and enchantment in one city, or null when a price is missing. */
export function priceCraft(book: PriceBook, recipe: BmRecipe, tier: number, enchant: number, opt: CityCraftOptions): CityCraftRow | null {
  const id = `T${tier}_${recipe.itemId}${enchant ? `@${enchant}` : ""}`;
  const sale = opt.sell === "instant" ? book.order(id, opt.city) : book.sell(id, opt.city);
  if (!sale) return null;

  const materials: PricedPart[] = [];
  for (const mat of recipe.materials) {
    const matId = buildMaterialId(mat.itemId, tier, enchant);
    const quote = matId ? buyPart(book, matId, opt) : null;
    if (!matId || !quote) return null;
    materials.push({ ...quote, id: matId, name: `T${tier}.${enchant} ${MATERIAL_NAME[mat.itemId] ?? mat.itemId}`, qty: mat.qty });
  }
  let artefact: PricedPart | null = null;
  if (recipe.artifactId) {
    const artId = buildArtefactId(recipe.artifactId, tier);
    const quote = artId ? buyPart(book, artId, opt) : null;
    if (!artId || !quote) return null;
    artefact = { ...quote, id: artId, name: `T${tier} ${recipe.artifact ?? "Artefact"}`, qty: 1 };
  }

  const bonusCity = getBonusCityForItem({ id: recipe.itemId, categoryKey: recipe.categoryKey }) === opt.city;
  const dailyBonus = opt.bonuses?.length ? craftBonusPercentFor(recipe.itemId, opt.bonuses) : 0;
  const returnRate = cityReturnRate(bonusCity, opt.focus, dailyBonus);
  const materialCost = materials.reduce((sum, m) => sum + m.unit * m.qty, 0);
  const stationFee = calculateCraftingUsageFee(getStationItemValue(tier, enchant) ?? 0, opt.usageFee);
  const cost = materialCost * (1 - returnRate) + (artefact?.unit ?? 0) + stationFee;

  const fees = sale.unit * (opt.taxRate + (opt.sell === "order" ? SETUP_FEE_RATE : 0));
  const net = sale.unit - fees;
  const profit = net - cost;
  const { sold, avg } = book.volume(id, opt.city);
  const parts = [...materials, ...(artefact ? [artefact] : [])];

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
    materialCost,
    cost,
    stationFee,
    sale,
    fees,
    net,
    profit,
    roi: cost > 0 ? (profit / cost) * 100 : 0,
    sold,
    avgPrice: avg,
    dailyProfit: profit * sold,
    focusCost: opt.focus ? getFocusCost(tier, enchant, recipe) : null,
    spike: opt.sell === "order" && avg > 0 && sale.unit > avg * SPIKE_FACTOR,
    oldestAt: Math.min(sale.at, ...parts.map((p) => p.at)),
    imported: parts.some((p) => p.city !== opt.city)
  };
}

/** Every craft of the recipes in one city that has all its prices, best first by profit a day. */
export function cityCraftRows(book: PriceBook, recipes: readonly BmRecipe[], opt: CityCraftOptions): CityCraftRow[] {
  const rows: CityCraftRow[] = [];
  for (const recipe of recipes) {
    // royal and shapeshifter items are not crafted from these recipes
    if (/_ROYAL(\b|_)|SHAPESHIFTER/i.test(recipe.itemId)) continue;
    for (const tier of opt.tiers) {
      for (const enchant of opt.enchants) {
        const row = priceCraft(book, recipe, tier, enchant, opt);
        if (row) rows.push(row);
      }
    }
  }
  return rows.sort((a, b) => b.dailyProfit - a.dailyProfit || b.profit - a.profit);
}

/** Is the row worth showing: profit, enough profit on the silver, and a market that sells it. */
export const worthIt = (row: CityCraftRow, minRoi: number, minSold: number) => row.profit > 0 && row.roi >= minRoi && row.sold >= minSold && !row.spike;

/** How each city does: its good crafts and what the best ten of them earn a day together. */
export function citySummary(book: PriceBook, recipes: readonly BmRecipe[], opt: Omit<CityCraftOptions, "city">, minRoi: number, minSold: number) {
  return CRAFT_CITIES.map((city) => {
    const good = cityCraftRows(book, recipes, { ...opt, city }).filter((row) => worthIt(row, minRoi, minSold));
    const top = good.slice(0, 10);
    return { city, count: good.length, topDaily: top.reduce((sum, row) => sum + row.dailyProfit, 0), best: top[0] ?? null };
  });
}
