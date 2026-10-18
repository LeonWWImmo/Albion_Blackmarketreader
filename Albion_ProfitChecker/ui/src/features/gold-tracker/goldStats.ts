/**
 * Maths behind the Gold Tracker. The input is the hourly gold price history from the Albion
 * Online Data Project as [unixSeconds, silverPerGold] pairs, oldest first (see api/_lib/aodp.js).
 * Every function is pure so the page and the tests share it.
 */

export type GoldPoint = readonly [time: number, price: number];

export const HOUR = 3600;
export const DAY = 24 * HOUR;

export type GoldRange = "24h" | "7d" | "30d" | "90d";

export const RANGE_SECONDS: Record<GoldRange, number> = {
  "24h": DAY,
  "7d": 7 * DAY,
  "30d": 30 * DAY,
  "90d": 90 * DAY
};

/** Index of the last point at or before `time` (-1 when every point is later). */
function lastIndexAtOrBefore(points: ReadonlyArray<GoldPoint>, time: number): number {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** The point nearest to `time` (for the chart crosshair). */
export function nearestPoint(points: ReadonlyArray<GoldPoint>, time: number): GoldPoint | null {
  if (!points.length) return null;
  const i = lastIndexAtOrBefore(points, time);
  if (i < 0) return points[0];
  if (i >= points.length - 1) return points[points.length - 1];
  return time - points[i][0] <= points[i + 1][0] - time ? points[i] : points[i + 1];
}

/** Points from `seconds` before the latest point up to the latest. */
export function pointsInRange(points: ReadonlyArray<GoldPoint>, seconds: number): GoldPoint[] {
  if (!points.length) return [];
  const from = points[points.length - 1][0] - seconds;
  const start = lastIndexAtOrBefore(points, from - 1) + 1;
  return points.slice(start);
}

export type PriceChange = { readonly from: number; readonly to: number; readonly abs: number; readonly pct: number };

/**
 * Change from the price `seconds` before the latest point to the latest. Null when the history
 * does not reach back that far (a gap of more than a few hours around the start would mislead).
 */
export function changeOver(points: ReadonlyArray<GoldPoint>, seconds: number): PriceChange | null {
  if (points.length < 2) return null;
  const [lastTime, to] = points[points.length - 1];
  const target = lastTime - seconds;
  const i = lastIndexAtOrBefore(points, target);
  if (i < 0 || target - points[i][0] > 6 * HOUR) return null;
  const from = points[i][1];
  return { from, to, abs: to - from, pct: from > 0 ? ((to - from) / from) * 100 : 0 };
}

export type RangeStats = {
  readonly low: number;
  readonly lowAt: number;
  readonly high: number;
  readonly highAt: number;
  readonly avg: number;
};

export function rangeStats(points: ReadonlyArray<GoldPoint>): RangeStats | null {
  if (!points.length) return null;
  let low = points[0];
  let high = points[0];
  let sum = 0;
  for (const point of points) {
    if (point[1] < low[1]) low = point;
    if (point[1] > high[1]) high = point;
    sum += point[1];
  }
  return { low: low[1], lowAt: low[0], high: high[1], highAt: high[0], avg: sum / points.length };
}

export type PriceVerdict = "cheap" | "fair" | "expensive";

export type PricePosition = {
  /** Share of the hours in the window that were cheaper than now, 0..100. */
  readonly percentile: number;
  /** Where the price sits between the window's low (0) and high (100). */
  readonly position: number;
  readonly verdict: PriceVerdict;
};

/** How today's price compares with the window: the basis for "good time to buy / sell". */
export function pricePosition(points: ReadonlyArray<GoldPoint>, price: number): PricePosition | null {
  const stats = rangeStats(points);
  if (!stats) return null;
  let cheaper = 0;
  for (const point of points) if (point[1] < price) cheaper += 1;
  const percentile = (cheaper / points.length) * 100;
  const span = stats.high - stats.low;
  const position = span > 0 ? Math.min(100, Math.max(0, ((price - stats.low) / span) * 100)) : 50;
  const verdict: PriceVerdict = percentile <= 30 ? "cheap" : percentile >= 70 ? "expensive" : "fair";
  return { percentile, position, verdict };
}

export type Profile = {
  /** Average deviation from the surrounding average, in percent, one entry per bucket. */
  readonly deviation: ReadonlyArray<number | null>;
  /** Bucket with the lowest and the highest average deviation. */
  readonly cheapest: number;
  readonly dearest: number;
  /** Number of points behind the profile. */
  readonly samples: number;
};

/**
 * When in the day (or week) gold tends to be cheap. Each price is compared with the average of
 * the prices around it (a centred window), so a rising or falling trend does not leak into the
 * result; the deviations are then averaged per bucket.
 *
 * `bucketOf` maps a unix time to a bucket index (local hour 0-23, weekday 0-6, ...).
 */
export function deviationProfile(
  points: ReadonlyArray<GoldPoint>,
  buckets: number,
  bucketOf: (time: number) => number,
  windowSeconds: number
): Profile | null {
  if (points.length < 48) return null;
  const prefix = new Float64Array(points.length + 1);
  for (let i = 0; i < points.length; i += 1) prefix[i + 1] = prefix[i] + points[i][1];

  const sums = new Array<number>(buckets).fill(0);
  const counts = new Array<number>(buckets).fill(0);
  let lo = 0;
  let hi = 0;
  const half = windowSeconds / 2;
  for (let i = 0; i < points.length; i += 1) {
    const [time, price] = points[i];
    while (points[lo][0] < time - half) lo += 1;
    while (hi < points.length && points[hi][0] <= time + half) hi += 1;
    const count = hi - lo;
    // Near the ends of the history the window is one-sided; skip those so they cannot skew a bucket.
    if (points[lo][0] > time - half + HOUR || (hi === points.length && points[hi - 1][0] < time + half - HOUR)) continue;
    const mean = (prefix[hi] - prefix[lo]) / count;
    if (!(mean > 0)) continue;
    const bucket = bucketOf(time);
    sums[bucket] += (price / mean - 1) * 100;
    counts[bucket] += 1;
  }

  const deviation = sums.map((sum, i) => (counts[i] ? sum / counts[i] : null));
  let cheapest = -1;
  let dearest = -1;
  deviation.forEach((value, i) => {
    if (value === null) return;
    if (cheapest < 0 || value < (deviation[cheapest] as number)) cheapest = i;
    if (dearest < 0 || value > (deviation[dearest] as number)) dearest = i;
  });
  const samples = counts.reduce((a, b) => a + b, 0);
  if (cheapest < 0 || samples < 24) return null;
  return { deviation, cheapest, dearest, samples };
}

/** Silver for an amount of gold, and gold for an amount of silver, at `price` silver per gold. */
export function goldToSilver(gold: number, price: number): number {
  return Math.round(gold * price);
}

export function silverToGold(silver: number, price: number): number {
  return price > 0 ? silver / price : 0;
}
