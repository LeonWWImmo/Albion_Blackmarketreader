export type City = "Bridgewatch" | "Lymhurst" | "Fort Sterling" | "Martlock" | "Thetford" | "Caerleon" | "Brecilien";
export type MarketRegion = "eu" | "us";
export type Tier = 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type Enchant = 0 | 1 | 2 | 3 | 4;
export type MaterialKey = "metal" | "wood" | "fiber" | "hide" | "stone";
export type IngredientKind = "raw" | "refined";

export interface RefineTierInput {
  readonly materialKey: MaterialKey;
  readonly kind: IngredientKind;
  readonly tier: Tier;
  readonly enchant: Enchant;
  readonly itemId: string;
  readonly unitPrice: number;
}

export interface RefineIngredient {
  readonly materialKey: MaterialKey;
  readonly kind: IngredientKind;
  readonly tier: Tier;
  readonly enchant: Enchant;
  readonly itemId: string;
  readonly quantity: number;
}

export interface RefineVariant {
  readonly id: string;
  readonly itemId: string;
  readonly rawItemId: string;
  readonly materialKey: MaterialKey;
  readonly label: string;
  readonly tier: Tier;
  readonly enchant: Enchant;
  readonly outputQuantity: number;
  readonly ingredients: ReadonlyArray<RefineIngredient>;
  readonly baseFocusCost: number;
  readonly market: number;
  readonly itemValue: number;
  readonly icon: string;
  readonly trend: string;
}

export interface BonusConfig {
  readonly city: City;
  readonly materialBonusCity: City;
  readonly royalBonusPercent: number;
  readonly materialBonusPercent: number;
  readonly focusEnabled: boolean;
  readonly focusBonusPercent: number;
  readonly focusEfficiency: number;
  readonly focusBudget: number;
  /** When set (0..0.99), overrides the computed return rate (custom profile). */
  readonly returnRateOverride?: number | null;
  /** Today's daily refining bonus for this material in percent (0, 10 or 20). */
  readonly dailyBonusPercent?: number;
}

export interface RefiningInput {
  readonly variant: RefineVariant;
  readonly tierInputs: ReadonlyArray<RefineTierInput>;
  readonly amount: number;
  readonly usageFeePer100: number;
  readonly nutritionFactor: number;
  readonly marketTaxRate: number;
  readonly baseReturnRate: number;
  readonly bonuses: BonusConfig;
}

export interface RefiningState {
  readonly input: RefiningInput;
  readonly returnRate: number;
  readonly outputAmount: number;
  readonly grossMaterialCost: number;
  readonly returnedMaterialCost: number;
  readonly effectiveMaterialCost: number;
  readonly missingInputCost: boolean;
  readonly nutritionCost: number;
  readonly refiningFee: number;
  readonly marketTax: number;
  readonly totalCost: number;
  readonly revenue: number;
  readonly netRevenue: number;
  readonly focusCost: number;
  readonly maxRunsByFocus: number;
  readonly profitPerFocus: number;
  readonly profit: number;
  readonly profitPercent: number;
}

export type RefiningResult = RefiningState;
