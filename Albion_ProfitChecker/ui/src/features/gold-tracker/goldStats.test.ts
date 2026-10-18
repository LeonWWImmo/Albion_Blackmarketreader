import { describe, expect, it } from "vitest";
import {
  DAY,
  HOUR,
  changeOver,
  deviationProfile,
  goldToSilver,
  nearestPoint,
  pointsInRange,
  pricePosition,
  rangeStats,
  silverToGold,
  type GoldPoint
} from "./goldStats";
import { formatSignedPct, formatSignedSilver, formatSilver, parseAmount } from "./format";

const START = Date.UTC(2026, 6, 20, 0, 0, 0) / 1000; // a Monday, 00:00 UTC

/** Hourly points from `price(hourIndex)`. */
function series(hours: number, price: (i: number) => number): GoldPoint[] {
  return Array.from({ length: hours }, (_, i) => [START + i * HOUR, price(i)] as const);
}

describe("ranges and changes", () => {
  const points = series(10 * 24, (i) => 8000 + i); // rises by 1 silver an hour

  it("cuts the window back from the latest point", () => {
    const day = pointsInRange(points, DAY);
    expect(day).toHaveLength(25);
    expect(day[0][0]).toBe(points[points.length - 1][0] - DAY);
  });

  it("measures the change over a window", () => {
    const change = changeOver(points, DAY);
    expect(change).not.toBeNull();
    expect(change!.abs).toBe(24);
    expect(change!.pct).toBeCloseTo((24 / (8000 + 239 - 24)) * 100, 8);
  });

  it("has no change when the history does not reach back far enough", () => {
    expect(changeOver(points, 30 * DAY)).toBeNull();
    expect(changeOver(points.slice(0, 1), DAY)).toBeNull();
  });

  it("skips a change across a long gap instead of comparing with a stale price", () => {
    const gappy: GoldPoint[] = [[START, 8000], [START + 2 * DAY, 8100], [START + 3 * DAY, 8200]];
    expect(changeOver(gappy, DAY)).toEqual({ from: 8100, to: 8200, abs: 100, pct: (100 / 8100) * 100 });
    expect(changeOver([[START, 8000], [START + 3 * DAY, 8200]], DAY)).toBeNull();
  });

  it("finds low, high and average with their times", () => {
    const stats = rangeStats([[1, 10], [2, 30], [3, 20]]);
    expect(stats).toEqual({ low: 10, lowAt: 1, high: 30, highAt: 2, avg: 20 });
    expect(rangeStats([])).toBeNull();
  });

  it("picks the point nearest to a time", () => {
    expect(nearestPoint(points, START + 2 * HOUR + 1000)).toEqual(points[2]);
    expect(nearestPoint(points, START + 2 * HOUR + 2000)).toEqual(points[3]);
    expect(nearestPoint(points, START - DAY)).toEqual(points[0]);
    expect(nearestPoint(points, START + 99 * DAY)).toEqual(points[points.length - 1]);
    expect(nearestPoint([], START)).toBeNull();
  });
});

describe("pricePosition", () => {
  const month = series(100, (i) => 8000 + i);

  it("calls a price in the bottom of the range cheap and in the top expensive", () => {
    expect(pricePosition(month, 8005)!.verdict).toBe("cheap");
    expect(pricePosition(month, 8050)!.verdict).toBe("fair");
    expect(pricePosition(month, 8095)!.verdict).toBe("expensive");
  });

  it("reports the share of cheaper hours and the place between low and high", () => {
    const position = pricePosition(month, 8025)!;
    expect(position.percentile).toBe(25);
    expect(position.position).toBeCloseTo((25 / 99) * 100, 8);
    expect(pricePosition([], 8000)).toBeNull();
    expect(pricePosition(series(5, () => 8000), 8000)!.position).toBe(50);
  });
});

describe("deviationProfile", () => {
  it("finds the cheap hour even while the price trends upwards", () => {
    // 20 days, rising 2 silver an hour, 30 silver cheaper every day at 05:00 UTC.
    const points = series(20 * 24, (i) => 8000 + 2 * i - (i % 24 === 5 ? 30 : 0));
    const profile = deviationProfile(points, 24, (t) => new Date(t * 1000).getUTCHours(), DAY);
    expect(profile).not.toBeNull();
    expect(profile!.cheapest).toBe(5);
    expect(profile!.deviation[5]!).toBeLessThan(-0.3);
    // the trend itself does not make the evening look expensive
    expect(Math.abs(profile!.deviation[20]!)).toBeLessThan(0.05);
  });

  it("needs enough history", () => {
    expect(deviationProfile(series(30, () => 8000), 24, () => 0, DAY)).toBeNull();
  });
});

describe("conversion and formatting", () => {
  it("converts both ways", () => {
    expect(goldToSilver(1000, 8470)).toBe(8470000);
    expect(silverToGold(8470000, 8470)).toBe(1000);
    expect(silverToGold(100, 0)).toBe(0);
  });

  it("reads amounts the way players type them", () => {
    expect(parseAmount("1000")).toBe(1000);
    expect(parseAmount("1.000.000")).toBe(1000000);
    expect(parseAmount("3,750")).toBe(3750);
    expect(parseAmount("1,5m")).toBe(1500000);
    expect(parseAmount("250k")).toBe(250000);
    expect(parseAmount("2.25k")).toBe(2250);
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount(" 3 750 ")).toBe(3750);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
  });

  it("formats prices and changes", () => {
    expect(formatSilver(8470.4)).toBe("8.470");
    expect(formatSilver(null)).toBe("--");
    expect(formatSignedSilver(30)).toBe("+30");
    expect(formatSignedSilver(-1200)).toBe("−1.200");
    expect(formatSignedSilver(0.2)).toBe("0");
    expect(formatSignedPct(0.364)).toBe("+0.36%");
    expect(formatSignedPct(-1.2)).toBe("−1.20%");
  });
});
