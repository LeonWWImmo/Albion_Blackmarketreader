export type MarketRegion = "eu" | "us";

export interface BmMarketItem {
  id: string;
  bm: number | null;
  sold: number | null;
}

export interface MaterialRequirement {
  itemId: string;
  qty: number;
}

export interface BmRecipe {
  itemId: string;
  name?: string;
  materials: MaterialRequirement[];
  artifactId?: string | null;
  artifact?: string;
  /** Crafting category key (swords, bows, armor-chest, …) — used for journal profession mapping. */
  categoryKey?: string;
}

export interface MaterialCostResult {
  sum: number;
  hasPrice: boolean;
}

export interface ItemEconomics {
  craftCost: number;
  stationFee: number;
  /** Sales tax paid when selling to the Black Market. */
  salesTax: number;
  /** What one item brings in after the sales tax, minus what it costs to craft. */
  profit: number;
  dailyPotential: number | null;
  profitPct: number | null;
  focusCost: number | null;
  profitPerFocus: number | null;
}

export interface CalculateItemEconomicsInput {
  item: BmMarketItem;
  recipe: BmRecipe | null;
  returnRate: number;
  usageFeePer100: number;
  /** Share of the Black Market price lost to the sales tax, e.g. 0.04 with Premium. */
  salesTaxRate: number;
  getMaterialPrice: (materialId: string, tier: number, enchant: number) => number | null;
  getArtefactPrice: (artefactId: string, tier: number) => number | null;
}
