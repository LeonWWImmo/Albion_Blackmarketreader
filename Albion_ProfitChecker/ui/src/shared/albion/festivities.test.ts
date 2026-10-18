import { describe, expect, it } from "vitest";
import craftBonusData from "./craftBonusData.json";
import {
  activeCraftBonuses,
  addBonusToReturnRate,
  baseItemId,
  craftBonusPercentFor,
  craftCategoryLabel,
  craftCategoryOf,
  craftItemFor,
  formatCountdown,
  nextDailyReset,
  weeklyEvents,
  type FestivitiesSnapshot
} from "./festivities";
import { returnRateFromBonusPercent } from "./stationBonus";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const H = 3600 * 1000;

function snapshot(events: FestivitiesSnapshot["events"], confirmed = true): FestivitiesSnapshot {
  return { region: "eu", fetchedAt: iso(NOW), confirmed, events };
}

const TODAY = { start: "2026-10-18T10:00:00.000Z", end: "2026-10-19T10:00:00.000Z" };

describe("craft bonus game data", () => {
  it("knows every daily event, at +10% (common) or +20% (rare)", () => {
    const bonuses = Object.entries(craftBonusData.bonuses);
    expect(bonuses.length).toBeGreaterThanOrEqual(70);
    for (const [name, bonus] of bonuses) {
      expect(bonus.percent).toBe(name.startsWith("RARE_") ? 20 : 10);
    }
  });

  it("has a player-facing label for every bonus category", () => {
    for (const { category } of Object.values(craftBonusData.bonuses)) {
      expect(craftCategoryLabel(category)).not.toBe(category.replace(/_/g, " "));
    }
  });

  it("maps the items the tools use to their crafting category, whatever the tier or enchantment", () => {
    expect(craftCategoryOf("T4_2H_NATURESTAFF")).toBe("naturestaff");
    expect(craftCategoryOf("T8_MAIN_NATURESTAFF@3")).toBe("naturestaff");
    expect(craftCategoryOf("MAIN_SWORD")).toBe("sword");
    expect(craftCategoryOf("T5_METALBAR_LEVEL1@1")).toBe("ore");
    expect(craftCategoryOf("T4_PLANKS")).toBe("wood");
    expect(craftCategoryOf("T4_BAG")).toBe("bag");
    expect(craftCategoryOf("T6_MEAL_OMELETTE@2")).toBe("food");
    expect(craftCategoryOf("T4_POTION_CLEANSE")).toBe("potion");
    expect(craftCategoryOf("T4_ARMOR_PLATE_ROYAL")).toBeNull();
    expect(baseItemId("T4_2H_BOW@2")).toBe("2H_BOW");
  });

  it("has a plain Crafting Calculator item for every gear category", () => {
    expect(craftItemFor("sword")).toBe("MAIN_SWORD");
    expect(craftItemFor("bag")).toBe("BAG");
    for (const { category } of Object.values(craftBonusData.bonuses)) {
      if (["ore", "wood", "fiber", "hide", "rock", "food", "potion"].includes(category)) continue;
      expect(craftCategoryOf(craftItemFor(category) ?? "")).toBe(category);
    }
  });
});

describe("activeCraftBonuses", () => {
  it("returns today's confirmed bonuses, rare first", () => {
    const bonuses = activeCraftBonuses(
      snapshot([
        { kind: 2, category: "GENERAL", name: "COMMON_BAG", ...TODAY },
        { kind: 2, category: "GENERAL", name: "RARE_ORE", ...TODAY },
        { kind: 1, category: "GATHERING", name: "FISHING", ...TODAY }
      ]),
      NOW
    );
    expect(bonuses.map((b) => [b.name, b.percent, b.label])).toEqual([
      ["RARE_ORE", 20, "Metal Bars refining"],
      ["COMMON_BAG", 10, "Bags"]
    ]);
  });

  it("drops events outside their time window, unknown names and unconfirmed snapshots", () => {
    const events = [
      { kind: 2, category: "GENERAL", name: "COMMON_BAG", start: iso(NOW - 30 * H), end: iso(NOW - 6 * H) },
      { kind: 2, category: "GENERAL", name: "COMMON_SOMETHING_NEW", ...TODAY }
    ];
    expect(activeCraftBonuses(snapshot(events), NOW)).toEqual([]);
    expect(activeCraftBonuses(snapshot([{ kind: 2, category: "GENERAL", name: "COMMON_BAG", ...TODAY }], false), NOW)).toEqual([]);
    expect(activeCraftBonuses(null, NOW)).toEqual([]);
  });

  it("ends a bonus exactly at the daily reset", () => {
    const snap = snapshot([{ kind: 2, category: "GENERAL", name: "COMMON_BAG", ...TODAY }]);
    expect(activeCraftBonuses(snap, Date.parse(TODAY.end) - 1)).toHaveLength(1);
    expect(activeCraftBonuses(snap, Date.parse(TODAY.end))).toHaveLength(0);
  });
});

describe("craftBonusPercentFor", () => {
  const bonuses = activeCraftBonuses(
    snapshot([
      { kind: 2, category: "GENERAL", name: "COMMON_NATURESTAFF", ...TODAY },
      { kind: 2, category: "GENERAL", name: "RARE_FOOD", ...TODAY }
    ]),
    NOW
  );

  it("gives the bonus to every item of the category", () => {
    expect(craftBonusPercentFor("T4_2H_NATURESTAFF", bonuses)).toBe(10);
    expect(craftBonusPercentFor("T7_MAIN_NATURESTAFF@2", bonuses)).toBe(10);
    expect(craftBonusPercentFor("T6_MEAL_OMELETTE@1", bonuses)).toBe(20);
  });

  it("gives nothing to other items", () => {
    expect(craftBonusPercentFor("T4_MAIN_SWORD", bonuses)).toBe(0);
    expect(craftBonusPercentFor("T4_POTION_CLEANSE", bonuses)).toBe(0);
    expect(craftBonusPercentFor("", bonuses)).toBe(0);
    expect(craftBonusPercentFor("T4_2H_NATURESTAFF", [])).toBe(0);
  });
});

describe("weeklyEvents", () => {
  it("lists the running event first, then upcoming ones within a few days, with their titles", () => {
    const events = weeklyEvents(
      snapshot([
        { kind: 1, category: "GATHERING", name: "FISHING", start: iso(NOW + 22 * H), end: iso(NOW + 94 * H) },
        { kind: 1, category: "ACTIVITIES", name: "DRAGON_AREA_AND_DUNGEON_LAUNCH_EVENT", start: iso(NOW - 6 * 24 * H), end: iso(NOW + 22 * H) },
        { kind: 1, category: "ACTIVITIES", name: "FAME", start: iso(NOW + 10 * 24 * H), end: iso(NOW + 12 * 24 * H) },
        { kind: 1, category: "ACTIVITIES", name: "HELLGATE", start: iso(NOW - 4 * 24 * H), end: iso(NOW - H) }
      ]),
      NOW
    );
    expect(events.map((e) => [e.title, e.active])).toEqual([
      ["Draconic Surge", true],
      ["Gathering Bonus: Fishing", false]
    ]);
  });

  it("names an event the site does not know yet from its id", () => {
    const [event] = weeklyEvents(snapshot([{ kind: 1, category: "ACTIVITIES", name: "BRAND_NEW_EVENT", ...TODAY }]), NOW);
    expect(event.title).toBe("Brand New Event");
  });
});

describe("addBonusToReturnRate", () => {
  it("adds the bonus to the production bonus behind an entered return rate", () => {
    // 15.25% is the 18% royal base; +10% makes 28%.
    expect(addBonusToReturnRate(returnRateFromBonusPercent(18), 10)).toBeCloseTo(returnRateFromBonusPercent(28), 10);
    expect(addBonusToReturnRate(returnRateFromBonusPercent(33), 20)).toBeCloseTo(returnRateFromBonusPercent(53), 10);
  });

  it("leaves the rate alone without a bonus and stays below 99%", () => {
    expect(addBonusToReturnRate(0.3, 0)).toBe(0.3);
    expect(addBonusToReturnRate(0.98, 20)).toBeLessThanOrEqual(0.99);
  });
});

describe("daily reset", () => {
  it("is the next 10:00 UTC", () => {
    expect(iso(nextDailyReset(Date.parse("2026-10-18T09:59:00Z")))).toBe("2026-10-18T10:00:00.000Z");
    expect(iso(nextDailyReset(Date.parse("2026-10-18T10:00:00Z")))).toBe("2026-10-19T10:00:00.000Z");
    expect(iso(nextDailyReset(Date.parse("2026-12-31T23:00:00Z")))).toBe("2027-01-01T10:00:00.000Z");
  });

  it("formats the time left", () => {
    expect(formatCountdown(NOW + 42 * 60000, NOW)).toBe("42m");
    expect(formatCountdown(NOW + (5 * 60 + 12) * 60000, NOW)).toBe("5h 12m");
    expect(formatCountdown(NOW + (3 * 24 + 4) * H, NOW)).toBe("3d 4h");
    expect(formatCountdown(NOW - H, NOW)).toBe("0m");
  });
});
