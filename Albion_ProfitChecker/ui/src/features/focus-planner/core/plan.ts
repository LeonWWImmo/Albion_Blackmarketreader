// Focus Planner (premium): where a day's focus earns the most. Every craft is priced with focus
// (the City Crafter's engine, craft and sell in the same city), ranked by silver per focus point,
// and the focus is handed out from the best down, at most what the city sells of an item a day.
import type { BmRecipe } from "../../bm-crafter/domain";
import type { PriceBook } from "../../city-crafter/core/books";
import { cityCraftRows, worthIt, type CityCraftOptions, type CityCraftRow } from "../../city-crafter/core/cityCraft";
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

export type FocusLine = FocusCandidate & { crafts: number; focusUsed: number; total: number };

/** Every craft that pays with focus, best silver per focus point first. */
export function focusCandidates(book: PriceBook, recipes: readonly BmRecipe[], opt: FocusOptions): FocusCandidate[] {
  const out: FocusCandidate[] = [];
  for (const city of opt.cities) {
    for (const row of cityCraftRows(book, recipes, { ...opt, city, focus: true })) {
      if (!worthIt(row, opt.minRoi, opt.minSold) || !row.focusCost) continue;
      const efficiency = opt.efficiencyOf?.(row.baseId, row.categoryKey) ?? 0;
      const focus = applyFocusEfficiency(row.focusCost, efficiency);
      if (!(focus > 0)) continue;
      out.push({ row, city, focus, efficiency, perFocus: row.profit / focus });
    }
  }
  return out.sort((a, b) => b.perFocus - a.perFocus);
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
