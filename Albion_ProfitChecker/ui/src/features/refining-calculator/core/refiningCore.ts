import type {
  BonusConfig,
  City,
  MaterialKey,
  RefineTierInput,
  RefineVariant,
  RefiningInput,
  RefiningResult,
  RefiningState,
} from "./types";

type RefiningStep = (state: RefiningState) => RefiningState;
type BonusStep = (state: RefiningState, bonuses: BonusConfig) => RefiningState;

export type ReturnRatePreset = "base" | "city" | "focus" | "custom";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export function pipe<T>(
  ...fns: ReadonlyArray<(value: T) => T>
): (value: T) => T {
  return (value: T) => fns.reduce((acc, fn) => fn(acc), value);
}

export function withBonus(
  bonusFn: BonusStep,
  bonuses: BonusConfig,
): RefiningStep {
  return (state) => bonusFn(state, bonuses);
}

export function computeProfit(cost: number, netRevenue: number): number {
  return netRevenue - cost;
}

export function computeStationFee(
  itemValue: number,
  usageFeePer100: number,
  nutritionFactor: number,
  amount = 1,
): number {
  const nutritionCost = itemValue * nutritionFactor * amount;
  return (usageFeePer100 / 100) * nutritionCost;
}

export function computeReturnRateFromBonusPercent(totalBonusPercent: number): number {
  const positiveBonus = Math.max(0, totalBonusPercent);
  return clamp(1 - 1 / (1 + positiveBonus / 100), 0, 0.99);
}

export function isMaterialBonusCity(materialKey: MaterialKey, city: City, materialBonusCity: City): boolean {
  void materialKey;
  return city === materialBonusCity;
}

export function computeReturnRate(input: RefiningInput): number {
  const override = input.bonuses.returnRateOverride;
  if (typeof override === "number" && Number.isFinite(override)) return clamp(override, 0, 0.99);
  const materialBonus = isMaterialBonusCity(input.variant.materialKey, input.bonuses.city, input.bonuses.materialBonusCity)
    ? input.bonuses.materialBonusPercent
    : 0;
  const focusBonus = input.bonuses.focusEnabled ? input.bonuses.focusBonusPercent : 0;
  const dailyBonus = Math.max(0, input.bonuses.dailyBonusPercent ?? 0);
  return computeReturnRateFromBonusPercent(input.bonuses.royalBonusPercent + materialBonus + focusBonus + dailyBonus);
}

export function getReturnRatePresetConfig(preset: ReturnRatePreset): {
  focusEnabled: boolean;
  royalBonusPercent: number;
  materialBonusPercent: number;
  focusBonusPercent: number;
} {
  if (preset === "focus") {
    return {
      focusEnabled: true,
      royalBonusPercent: 18,
      materialBonusPercent: 40,
      focusBonusPercent: 59,
    };
  }
  if (preset === "city") {
    return {
      focusEnabled: false,
      royalBonusPercent: 18,
      materialBonusPercent: 40,
      focusBonusPercent: 59,
    };
  }
  // "base" and "custom" share the same non-bonus baseline; for "custom" the page
  // supplies a returnRateOverride that takes precedence over these values.
  return {
    focusEnabled: false,
    royalBonusPercent: 18,
    materialBonusPercent: 0,
    focusBonusPercent: 59,
  };
}

export function applyBonuses(
  state: RefiningState,
  bonuses: BonusConfig,
): RefiningState {
  return { ...state, returnRate: computeReturnRate({ ...state.input, bonuses }) };
}

export function sumRepeatedValue(value: number, times: number): number {
  if (times <= 0) return 0;
  return value + sumRepeatedValue(value, times - 1);
}

function getInputPrice(tierInputs: ReadonlyArray<RefineTierInput>, itemId: string): number {
  const match = tierInputs.find((entry) => entry.itemId === itemId);
  return match ? match.unitPrice : 0;
}

function createInitialState(input: RefiningInput): RefiningState {
  const outputAmount = input.amount * input.variant.outputQuantity;
  return {
    input,
    returnRate: input.baseReturnRate,
    outputAmount,
    grossMaterialCost: 0,
    returnedMaterialCost: 0,
    effectiveMaterialCost: 0,
    missingInputCost: false,
    nutritionCost: 0,
    refiningFee: 0,
    marketTax: 0,
    totalCost: 0,
    revenue: input.variant.market * outputAmount,
    netRevenue: 0,
    focusCost: 0,
    maxRunsByFocus: 0,
    profitPerFocus: 0,
    profit: 0,
    profitPercent: 0,
  };
}

function computeFocusCost(variant: RefineVariant, efficiency: number, amount: number, focusEnabled: boolean): number {
  if (!focusEnabled) return 0;
  const safeEfficiency = Math.max(0, efficiency);
  const costPerRun = Math.ceil(variant.baseFocusCost / Math.pow(2, safeEfficiency / 10000));
  return costPerRun * amount;
}

function computeBase(state: RefiningState): RefiningState {
  const amount = state.input.amount;
  const materialCosts = state.input.variant.ingredients.map((ingredient) => {
    const unitPrice = getInputPrice(state.input.tierInputs, ingredient.itemId);
    return {
      unitPrice,
      total: unitPrice * ingredient.quantity * amount,
    };
  });
  const grossMaterialCost = materialCosts.reduce((sum, entry) => sum + entry.total, 0);
  const missingInputCost = materialCosts.some((entry) => entry.unitPrice <= 0);
  const nutritionCost = state.input.variant.itemValue * state.input.nutritionFactor * amount;
  const refiningFee = computeStationFee(
    state.input.variant.itemValue,
    state.input.usageFeePer100,
    state.input.nutritionFactor,
    amount,
  );
  const focusCost = computeFocusCost(
    state.input.variant,
    state.input.bonuses.focusEfficiency,
    amount,
    state.input.bonuses.focusEnabled,
  );
  const maxRunsByFocus = focusCost > 0
    ? Math.floor(state.input.bonuses.focusBudget / Math.max(1, focusCost / amount))
    : 0;

  return {
    ...state,
    grossMaterialCost,
    missingInputCost,
    nutritionCost,
    refiningFee,
    focusCost,
    maxRunsByFocus,
  };
}

function applyReturnSavings(state: RefiningState): RefiningState {
  const returnedMaterialCost = state.grossMaterialCost * state.returnRate;
  const effectiveMaterialCost = state.grossMaterialCost - returnedMaterialCost;
  const marketTax = state.revenue * state.input.marketTaxRate;
  const netRevenue = state.revenue - marketTax;
  return {
    ...state,
    returnedMaterialCost,
    effectiveMaterialCost,
    marketTax,
    netRevenue,
    totalCost: effectiveMaterialCost + state.refiningFee,
  };
}

function finalizeProfit(state: RefiningState): RefiningState {
  const profit = computeProfit(state.totalCost, state.netRevenue);
  const profitPercent =
    state.totalCost > 0 ? (profit / state.totalCost) * 100 : 0;
  const profitPerFocus = state.focusCost > 0 ? profit / state.focusCost : 0;
  return { ...state, profit, profitPercent, profitPerFocus };
}

export function calculateRefining(input: RefiningInput): RefiningResult {
  const baseState = createInitialState(input);
  const flow = pipe(
    computeBase,
    withBonus(applyBonuses, input.bonuses),
    applyReturnSavings,
    finalizeProfit,
  );
  return flow(baseState);
}

export interface BuildInputParams {
  readonly variant: RefineVariant;
  readonly tierInputs: ReadonlyArray<RefineTierInput>;
  readonly amount?: number;
  readonly usageFeePer100: number;
  readonly city: BonusConfig["city"];
  readonly materialBonusCity: BonusConfig["materialBonusCity"];
  readonly royalBonusPercent: number;
  readonly materialBonusPercent: number;
  readonly focusEnabled: boolean;
  readonly focusBonusPercent: number;
  readonly focusEfficiency?: number;
  readonly focusBudget?: number;
  readonly nutritionFactor?: number;
  readonly marketTaxRate?: number;
  readonly returnRateOverride?: number | null;
  readonly dailyBonusPercent?: number;
}

export function createRefiningInput(params: BuildInputParams): RefiningInput {
  return {
    variant: params.variant,
    tierInputs: [...params.tierInputs],
    amount: Math.max(1, Math.floor(params.amount ?? 1)),
    usageFeePer100: Math.max(0, params.usageFeePer100),
    nutritionFactor:
      typeof params.nutritionFactor === "number"
        ? params.nutritionFactor
        : 0.1125,
    marketTaxRate: clamp(params.marketTaxRate ?? 0.065, 0, 1),
    baseReturnRate: 0,
    bonuses: {
      city: params.city,
      materialBonusCity: params.materialBonusCity,
      royalBonusPercent: Math.max(0, params.royalBonusPercent),
      materialBonusPercent: Math.max(0, params.materialBonusPercent),
      focusEnabled: params.focusEnabled,
      focusBonusPercent: Math.max(0, params.focusBonusPercent),
      focusEfficiency: Math.max(0, params.focusEfficiency ?? 0),
      focusBudget: Math.max(0, params.focusBudget ?? 10000),
      returnRateOverride: typeof params.returnRateOverride === "number" ? params.returnRateOverride : null,
      dailyBonusPercent: Math.max(0, params.dailyBonusPercent ?? 0),
    },
  };
}

export interface RefinerConfig {
  readonly city: BonusConfig["city"];
  readonly materialBonusCity: BonusConfig["materialBonusCity"];
  readonly royalBonusPercent: number;
  readonly materialBonusPercent: number;
  readonly focusEnabled: boolean;
  readonly focusBonusPercent: number;
  readonly focusEfficiency?: number;
  readonly focusBudget?: number;
  readonly nutritionFactor?: number;
  readonly marketTaxRate?: number;
  readonly amount?: number;
  readonly returnRateOverride?: number | null;
  readonly dailyBonusPercent?: number;
}

export function makeRefiner(config: RefinerConfig) {
  return (
    variant: RefineVariant,
    tierInputs: ReadonlyArray<RefineTierInput>,
    usageFeePer100: number,
  ): RefiningResult =>
    calculateRefining(
      createRefiningInput({
        variant,
        tierInputs,
        usageFeePer100,
        city: config.city,
        materialBonusCity: config.materialBonusCity,
        royalBonusPercent: config.royalBonusPercent,
        materialBonusPercent: config.materialBonusPercent,
        focusEnabled: config.focusEnabled,
        focusBonusPercent: config.focusBonusPercent,
        focusEfficiency: config.focusEfficiency,
        focusBudget: config.focusBudget,
        nutritionFactor: config.nutritionFactor,
        marketTaxRate: config.marketTaxRate,
        amount: config.amount,
        returnRateOverride: config.returnRateOverride,
        dailyBonusPercent: config.dailyBonusPercent,
      }),
    );
}
