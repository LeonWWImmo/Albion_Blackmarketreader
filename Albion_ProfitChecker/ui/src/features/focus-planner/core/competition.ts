// How crowded a craft's market is, from the market depth (twice a day, src/shared/live/depthData.ts):
// the pieces already listed at or below the price you would sell for, against what the city sells a day.
import type { Depth } from "@shared/live/depthData";

/** Listed at or below your price for longer than this many days of sales: crowded. */
export const CROWDED_DAYS = 2;

export type Competition = {
  /** all pieces listed */
  listed: number;
  /** pieces listed at or below the price */
  ahead: number;
  /** pieces buy orders want */
  wanted: number;
  /** days the city needs to sell what is listed at or below the price (null without sales) */
  days: number | null;
  crowded: boolean;
};

/** null when no sell orders of the item were seen in that market (no one looked at it lately). */
export function competitionOf(depth: Depth | null, price: number, sold: number): Competition | null {
  if (!depth || !depth.sell.length) return null;
  const ahead = depth.sell.filter(([p]) => p <= price).reduce((n, [, a]) => n + a, 0);
  const days = sold > 0 ? ahead / sold : null;
  return { listed: depth.sellTotal, ahead, wanted: depth.buyTotal, days, crowded: days === null ? ahead > 0 : days > CROWDED_DAYS };
}
