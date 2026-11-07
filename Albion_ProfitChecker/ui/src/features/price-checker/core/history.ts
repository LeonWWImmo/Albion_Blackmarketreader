import type { MarketName } from "./quotes";

/** [unixSeconds, averagePrice, itemsSold] */
export type HistoryPoint = [number, number, number];
/** [market, quality, points] from /api/aodp/history */
export type HistorySeries = [string, number, HistoryPoint[]];

const DAY = 86400;

/** One market's points for a quality, oldest first (empty when nobody reported any). */
export function seriesFor(series: HistorySeries[], market: MarketName, quality: number): HistoryPoint[] {
  return series.find(([m, q]) => m === market && q === quality)?.[2] ?? [];
}

/** Points from the last `days` before `now`. */
export const lastDays = (points: HistoryPoint[], days: number, now: number) => points.filter(([t]) => t > now - days * DAY);

/** Items sold per day over the last week; null without data. */
export function soldPerDay(points: HistoryPoint[], now: number): number | null {
  const week = lastDays(points, 7, now);
  if (!week.length) return null;
  const first = week[0][0];
  const days = Math.max(1, (now - first) / DAY);
  return week.reduce((sum, [, , sold]) => sum + sold, 0) / days;
}

/** Change of the average price from the first to the last point, e.g. 0.12 for +12%; null without two points. */
export function change(points: HistoryPoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0][1];
  return first > 0 ? points[points.length - 1][1] / first - 1 : null;
}
