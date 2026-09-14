import { describe, expect, it } from "vitest";
import {
  clampHideoutPower,
  clampZoneQuality,
  DEFAULT_STATION,
  hideoutBonusPercent,
  MAX_HIDEOUT_POWER,
  MAX_ZONE_QUALITY,
  returnRateFromBonusPercent,
  stationBaseBonusPercent,
  stationReturnRate,
  type StationConfig,
} from "./stationBonus";

function station(over: Partial<StationConfig> = {}): StationConfig {
  return { ...DEFAULT_STATION, ...over };
}

/** Percent, rounded to two decimals, so expectations read like the workbook's own output. */
function pct(rate: number): number {
  return Math.round(rate * 10000) / 100;
}

describe("stationBonus — values verified against the Goldenium reference workbook", () => {
  it("crossbow in a hideout: power 8 + zone quality 4, no focus, no city bonus → 39.49%", () => {
    const rate = stationReturnRate({
      station: station({ kind: "hideout", hideoutPower: 8, zoneQuality: 4 }),
      royalBonusPercent: 18,
      extraBonusPercent: 0,
    });
    expect(pct(rate)).toBeCloseTo(39.49, 1);
  });

  it("wood refining in the matching royal city, no focus → 36.71%", () => {
    const rate = stationReturnRate({
      station: station({ kind: "city" }),
      royalBonusPercent: 18,
      extraBonusPercent: 40,
    });
    expect(pct(rate)).toBeCloseTo(36.71, 1);
  });

  it("bow crafting in the bonus royal city, no focus → 24.81%", () => {
    const rate = stationReturnRate({
      station: station({ kind: "city" }),
      royalBonusPercent: 18,
      extraBonusPercent: 15,
    });
    expect(pct(rate)).toBeCloseTo(24.81, 1);
  });

  it("carrot soup in a royal city with focus, no city bonus → 43.50%", () => {
    const rate = stationReturnRate({
      station: station({ kind: "city" }),
      royalBonusPercent: 18,
      extraBonusPercent: 59,
    });
    expect(pct(rate)).toBeCloseTo(43.5, 1);
  });

  it("royal + matching city + focus → 53.9%", () => {
    const rate = stationReturnRate({
      station: station({ kind: "city" }),
      royalBonusPercent: 18,
      extraBonusPercent: 40 + 59,
    });
    expect(pct(rate)).toBeCloseTo(53.9, 1);
  });
});

describe("stationBonus — station rules", () => {
  it("island stations return nothing, even with focus and a city bonus", () => {
    expect(
      stationReturnRate({
        station: station({ kind: "island" }),
        royalBonusPercent: 18,
        extraBonusPercent: 99,
      })
    ).toBe(0);
  });

  it("a hideout replaces the royal base rather than adding to it", () => {
    const hideout = stationBaseBonusPercent(station({ kind: "hideout", hideoutPower: 1, zoneQuality: 1 }), 18);
    // power 1 contributes 0, zone quality 1 contributes 1 — the royal 18 must not appear.
    expect(hideout).toBe(1);
  });

  it("a city station uses the royal base", () => {
    expect(stationBaseBonusPercent(station({ kind: "city" }), 18)).toBe(18);
  });

  it("hideout bonus is power plus zone quality", () => {
    expect(hideoutBonusPercent(9, 6)).toBeCloseTo(56 + 26, 5);
    expect(hideoutBonusPercent(2, 3)).toBeCloseTo(9.8 + 11, 5);
  });

  it("focus and city bonus still stack on top of a hideout", () => {
    const rate = stationReturnRate({
      station: station({ kind: "hideout", hideoutPower: 9, zoneQuality: 6 }),
      royalBonusPercent: 18,
      extraBonusPercent: 59,
    });
    // 56 + 26 + 59 = 141 points
    expect(pct(rate)).toBeCloseTo(pct(returnRateFromBonusPercent(141)), 5);
  });
});

describe("stationBonus — input hardening", () => {
  it("clamps hideout power and zone quality into range", () => {
    expect(clampHideoutPower(0)).toBe(1);
    expect(clampHideoutPower(99)).toBe(MAX_HIDEOUT_POWER);
    expect(clampHideoutPower(Number.NaN)).toBe(1);
    expect(clampZoneQuality(-5)).toBe(1);
    expect(clampZoneQuality(99)).toBe(MAX_ZONE_QUALITY);
    expect(clampZoneQuality(3.4)).toBe(3);
  });

  it("out-of-range levels never produce a NaN bonus", () => {
    expect(Number.isFinite(hideoutBonusPercent(Number.NaN, Number.NaN))).toBe(true);
    expect(Number.isFinite(hideoutBonusPercent(1000, 1000))).toBe(true);
  });

  it("negative and non-finite totals clamp to a zero return rate", () => {
    expect(returnRateFromBonusPercent(-50)).toBe(0);
    expect(returnRateFromBonusPercent(Number.NaN)).toBe(0);
  });

  it("caps the return rate at 0.99", () => {
    expect(returnRateFromBonusPercent(1_000_000)).toBe(0.99);
  });
});
