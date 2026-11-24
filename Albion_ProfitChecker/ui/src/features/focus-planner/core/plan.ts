// Focus Planner (premium): where a day's focus earns the most. Every craft is priced with focus
// (the City Crafter's engine, craft and sell in the same city), ranked by silver per focus point,
// and the focus is handed out from the best down, at most what the city sells of an item a day.
import type { BmRecipe } from "../../bm-crafter/domain";
import type { PriceBook } from "../../city-crafter/core/books";
import { priceCraft, worthIt, type CityCraftOptions, type CityCraftRow } from "../../city-crafter/core/cityCraft";
import { applyFocusEfficiency } from "../../crafting-calculator/specs/data";

export type FocusOptions = Omit<CityCraftOptions, "city" | "focus"> & {
  /** the cities to craft in (each craft is sold where it is made) */
  cities: readonly string[];
  /** the player's focus cost efficiency for a recipe (its specs and masteries, as in the Crafting Calculator) */
  efficiencyOf?: (baseId: string, categoryKey: string) => number;
  minRoi: number;
  minSold: number;
};

export type FocusCandidate = {
  row: CityCraftRow;
  city: string;
  /** focus one craft costs with the player's specs */
  focus: number;
  /** the focus cost efficiency used (0 without specs) */
  efficiency: number;
  /** profit per focus point */
  perFocus: number;
};

/** royal and shapeshifter items are not crafted from these recipes (as in cityCraftRows) */
const SKIP = /_ROYAL(\b|_)|SHAPESHIFTER/i;

export type FocusLine = FocusCandidate & { crafts: number; focusUsed: number; total: number };

/** A priced craft that pays with focus, before the player's specs. */
export type FocusRow = { row: CityCraftRow; city: string };

/**
 * Every craft that pays with focus in the cities (the slow part: run it again only when prices or
 * filters change, not when specs do). A craft the city sells too little of is not priced at all.
 */
export function focusRows(book: PriceBook, recipes: readonly BmRecipe[], opt: Omit<FocusOptions, "efficiencyOf">): FocusRow[] {
  const out: FocusRow[] = [];
  for (const city of opt.cities) {
    const cityOpt = { ...opt, city, focus: true };
    for (const recipe of recipes) {
      if (SKIP.test(recipe.itemId)) continue;
      for (const tier of opt.tiers) {
        for (const enchant of opt.enchants) {
          if (book.volume(`T${tier}_${recipe.itemId}${enchant ? `@${enchant}` : ""}`, city).sold < opt.minSold) continue;
          const row = priceCraft(book, recipe, tier, enchant, cityOpt);
          if (row && row.focusCost && worthIt(row, opt.minRoi, opt.minSold)) out.push({ row, city });
        }
      }
    }
  }
  return out;
}

/** The rows with the player's focus per craft, best silver per focus point first. */
export function rankFocus(rows: readonly FocusRow[], efficiencyOf?: FocusOptions["efficiencyOf"]): FocusCandidate[] {
  const efficiencies = new Map<string, number>();
  const out: FocusCandidate[] = [];
  for (const { row, city } of rows) {
    let efficiency = efficiencies.get(row.baseId);
    if (efficiency === undefined) {
      efficiency = efficiencyOf?.(row.baseId, row.categoryKey) ?? 0;
      efficiencies.set(row.baseId, efficiency);
    }
    const focus = applyFocusEfficiency(row.focusCost ?? 0, efficiency);
    if (!(focus > 0)) continue;
    out.push({ row, city, focus, efficiency, perFocus: row.profit / focus });
  }
  return out.sort((a, b) => b.perFocus - a.perFocus);
}

/** Every craft that pays with focus, best silver per focus point first. */
export function focusCandidates(book: PriceBook, recipes: readonly BmRecipe[], opt: FocusOptions): FocusCandidate[] {
  return rankFocus(focusRows(book, recipes, opt), opt.efficiencyOf);
}

/**
 * The day's plan: the best crafts first, each as often as the focus left allows but no more than
 * the city sells of it a day (more would only wait on the market).
 */
export function planFocus<T extends FocusCandidate>(candidates: readonly T[], budget: number, maxLines = Infinity) {
  let left = Math.max(0, budget);
  const lines: Array<T & Omit<FocusLine, keyof FocusCandidate>> = [];
  for (const c of candidates) {
    if (lines.length >= maxLines) break;
    const bySales = Math.max(1, Math.floor(c.row.sold));
    const crafts = Math.min(Math.floor(left / c.focus), bySales);
    if (crafts < 1) continue;
    const focusUsed = crafts * c.focus;
    left -= focusUsed;
    lines.push({ ...c, crafts, focusUsed, total: crafts * c.row.profit });
  }
  return { lines, used: budget - left, left, total: lines.reduce((sum, l) => sum + l.total, 0) };
}
