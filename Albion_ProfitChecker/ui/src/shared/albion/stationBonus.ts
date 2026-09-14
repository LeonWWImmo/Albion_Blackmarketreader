/**
 * Where you craft changes the resource return rate, and the three station types behave
 * very differently:
 *
 * - **City**    the royal base bonus applies (18 points in a royal city).
 * - **Hideout** the royal base does NOT apply. Instead the hideout contributes its power
 *               level bonus plus the territory (zone quality) bonus — the reference
 *               workbook labels this pair "Terry + HO".
 * - **Island**  no return at all, regardless of focus or city specialisation.
 *
 * Everything not tied to the station — city specialisation, focus, daily bonus — is passed
 * in as `extraBonusPercent` and added on top.
 *
 * Lookup values and the formula are taken from the Goldenium reference workbook and
 * verified against its computed return rates (see stationBonus.test.ts).
 */

export type StationKind = "city" | "hideout" | "island";

/** Hideout power level (1-9) → return bonus percent. Index 0 is unused. */
const HIDEOUT_POWER_BONUS_PERCENT = [0, 0, 9.8, 18.5, 26.3, 33, 38.8, 44.5, 49.3, 56] as const;

/** Territory zone quality (1-6) → return bonus percent. Index 0 is unused. */
const ZONE_QUALITY_BONUS_PERCENT = [0, 1, 6, 11, 16, 21, 26] as const;

export const MIN_HIDEOUT_POWER = 1;
export const MAX_HIDEOUT_POWER = HIDEOUT_POWER_BONUS_PERCENT.length - 1; // 9
export const MIN_ZONE_QUALITY = 1;
export const MAX_ZONE_QUALITY = ZONE_QUALITY_BONUS_PERCENT.length - 1; // 6

export const DEFAULT_HIDEOUT_POWER = MIN_HIDEOUT_POWER;
export const DEFAULT_ZONE_QUALITY = MIN_ZONE_QUALITY;

export interface StationConfig {
  readonly kind: StationKind;
  /** Hideout power level, 1-9. Only used when kind is "hideout". */
  readonly hideoutPower: number;
  /** Territory zone quality, 1-6. Only used when kind is "hideout". */
  readonly zoneQuality: number;
}

export const DEFAULT_STATION: StationConfig = {
  kind: "city",
  hideoutPower: DEFAULT_HIDEOUT_POWER,
  zoneQuality: DEFAULT_ZONE_QUALITY,
};

function clampLevel(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Clamps a hideout power level into the supported 1-9 range. */
export function clampHideoutPower(value: number): number {
  return clampLevel(value, MIN_HIDEOUT_POWER, MAX_HIDEOUT_POWER);
}

/** Clamps a zone quality into the supported 1-6 range. */
export function clampZoneQuality(value: number): number {
  return clampLevel(value, MIN_ZONE_QUALITY, MAX_ZONE_QUALITY);
}

/** Bonus percent a hideout contributes: its power level plus the territory quality. */
export function hideoutBonusPercent(hideoutPower: number, zoneQuality: number): number {
  return (
    HIDEOUT_POWER_BONUS_PERCENT[clampHideoutPower(hideoutPower)] +
    ZONE_QUALITY_BONUS_PERCENT[clampZoneQuality(zoneQuality)]
  );
}

/**
 * Bonus percent contributed by the station itself, before city specialisation, focus and
 * daily bonus are added. Islands contribute nothing and also void everything else, which
 * is why callers should go through `stationReturnRate`.
 */
export function stationBaseBonusPercent(station: StationConfig, royalBonusPercent: number): number {
  if (station.kind === "island") return 0;
  if (station.kind === "hideout") return hideoutBonusPercent(station.hideoutPower, station.zoneQuality);
  return royalBonusPercent;
}

/** Albion's diminishing-returns curve: returnRate = 1 - 1 / (1 + bonus/100), capped at 0.99. */
export function returnRateFromBonusPercent(totalBonusPercent: number): number {
  const positive = Math.max(0, Number.isFinite(totalBonusPercent) ? totalBonusPercent : 0);
  return Math.min(0.99, Math.max(0, 1 - 1 / (1 + positive / 100)));
}

export interface StationReturnRateInput {
  readonly station: StationConfig;
  /** Base bonus for a royal city station, normally 18. */
  readonly royalBonusPercent: number;
  /** City specialisation + focus + daily bonus, already summed by the caller. */
  readonly extraBonusPercent: number;
}

/** Effective resource return rate (0-0.99) for a station. Island stations always return 0. */
export function stationReturnRate({ station, royalBonusPercent, extraBonusPercent }: StationReturnRateInput): number {
  if (station.kind === "island") return 0;
  return returnRateFromBonusPercent(stationBaseBonusPercent(station, royalBonusPercent) + extraBonusPercent);
}
