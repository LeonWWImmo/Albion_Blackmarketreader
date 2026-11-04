import { describe, expect, it } from "vitest";
import * as js from "../_lib/discordData.js";
import * as festivities from "../../src/shared/albion/festivities.ts";
import * as goldStats from "../../src/features/gold-tracker/goldStats.ts";

const now = Date.parse("2026-11-04T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const SNAPSHOT = {
  region: "eu",
  fetchedAt: iso(now),
  confirmed: true,
  events: [
    { kind: 2, category: "GENERAL", name: "COMMON_BOW", start: iso(now - 2 * 36e5), end: iso(now + 20 * 36e5) },
    { kind: 2, category: "GENERAL", name: "RARE_ORE", start: iso(now - 2 * 36e5), end: iso(now + 20 * 36e5) },
    { kind: 2, category: "GENERAL", name: "COMMON_BAG", start: iso(now - 30 * 36e5), end: iso(now - 6 * 36e5) },
    { kind: 2, category: "GENERAL", name: "NOT_A_REAL_BONUS", start: iso(now - 36e5), end: iso(now + 36e5) },
    { kind: 1, category: "ACTIVITIES", name: "FAME", start: iso(now - 864e5), end: iso(now + 72e6) },
    { kind: 1, category: "ACTIVITIES", name: "SOMETHING_NEW", start: iso(now + 864e5), end: iso(now + 3 * 864e5) }
  ]
};
// 40 days of hourly prices with a dip and a peak
const POINTS = Array.from({ length: 40 * 24 }, (_, i) => [Date.parse("2026-09-25T00:00:00Z") / 1000 + i * 3600, Math.round(9000 + 800 * Math.sin(i / 30) + (i === 700 ? -900 : 0))]);

describe("discordData matches the site's TypeScript", () => {
  it("crafting bonuses and weekly events", () => {
    expect(js.activeCraftBonuses(SNAPSHOT, now)).toEqual(festivities.activeCraftBonuses(SNAPSHOT, now));
    expect(js.activeCraftBonuses({ ...SNAPSHOT, confirmed: false }, now)).toEqual([]);
    expect(js.weeklyEvents(SNAPSHOT, now)).toEqual(festivities.weeklyEvents(SNAPSHOT, now));
    expect(js.nextDailyReset(now)).toBe(festivities.nextDailyReset(now));
    expect(js.craftCategoryLabel("plate_armor")).toBe(festivities.craftCategoryLabel("plate_armor"));
  });

  it("gold maths", () => {
    const month = goldStats.pointsInRange(POINTS, 30 * goldStats.DAY);
    expect(js.pointsInRange(POINTS, 30 * 24 * 3600)).toEqual(month);
    expect(js.rangeStats(month)).toEqual(goldStats.rangeStats(month));
    expect(js.changeOver(POINTS, 24 * 3600)).toEqual(goldStats.changeOver(POINTS, goldStats.DAY));
    for (const price of [8000, 9000, 9900]) expect(js.pricePosition(month, price)).toEqual(goldStats.pricePosition(month, price));
  });
});

describe("goldSummary", () => {
  it("flags a 30-day low and high", () => {
    const low = js.goldSummary([...POINTS, [POINTS.at(-1)[0] + 3600, 7000]]);
    expect(low.isLow).toBe(true);
    expect(low.isHigh).toBe(false);
    const high = js.goldSummary([...POINTS, [POINTS.at(-1)[0] + 3600, 12000]]);
    expect(high.isHigh).toBe(true);
    expect(js.goldSummary([])).toBeNull();
  });
});
