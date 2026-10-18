import type { BmMarketItem, BmRecipe, ItemEconomics } from "../domain";
import type { CraftBonus, JournalData, JournalProfession, OwnedJournals } from "../../../shared";

export interface BmCrafterRow {
  rowKey: string;
  item: BmMarketItem;
  recipe: BmRecipe;
  economics: ItemEconomics;
  tier: number | null;
  enchant: number;
  displayName: string;
  /** Per-craft journal profit already folded into economics.profit (0 when journals are off). */
  journalProfit?: number;
  journalProfession?: JournalProfession | null;
  /** Today's daily crafting bonus (percent) already folded into the return rate; 0 when none. */
  dailyBonusPercent?: number;
}

export interface BmCrafterFilters {
  // Empty array = no restriction (show all tiers / all enchants). Multiple values allowed.
  selectedTiers: number[];
  selectedEnchants: number[];
  minSold: number;
  searchTerm: string;
  returnRate: number;
  sortByDailyTop: boolean;
  showOnlyProfitable: boolean;
  nonArtefactOnly: boolean;
  craftCity: string;
  usageFeePer100: number;
  /** When enabled, crafting-journal profit is folded into each row's profit before filtering. */
  journal?: {
    enabled: boolean;
    owned: OwnedJournals;
    data: JournalData | null;
  };
  /** Today's daily crafting bonuses; rows they cover get the bonus added to their return rate. */
  dailyBonus?: {
    bonuses: ReadonlyArray<CraftBonus>;
    /** Only list items that have a bonus today. */
    onlyBonusItems: boolean;
  };
}
