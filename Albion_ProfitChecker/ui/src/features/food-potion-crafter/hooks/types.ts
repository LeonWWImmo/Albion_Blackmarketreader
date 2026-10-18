import type {
  City,
  ConsumableCategory,
  ConsumableRecipe,
  ConsumableResult,
  StationKind,
} from "../core";
import type { ReturnRatePreset } from "../core";
import type { CraftingProgress } from "../specs/data";
import type { CraftBonus } from "../../../shared";

export interface FoodPotionRow {
  rowKey: string;
  recipe: ConsumableRecipe;
  result: ConsumableResult;
}

export interface FoodPotionFilters {
  category: ConsumableCategory;
  selectedTier: number | null;
  searchTerm: string;
  craftCity: City;
  buyCity: City;
  sellCity: City;
  stationKind: StationKind;
  returnRatePreset: ReturnRatePreset;
  customReturnRatePct: number;
  amount: number;
  usageFee: number;
  marketTaxRate: number;
  demandPerDay: number;
  showOnlyProfitable: boolean;
  /** Optional spec progress for focus calc. */
  specProgress?: CraftingProgress;
  /** Today's daily crafting bonuses; recipes they cover get the bonus added to their return rate. */
  dailyBonuses?: ReadonlyArray<CraftBonus>;
}
