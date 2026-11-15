import { describe, expect, it } from "vitest";
import type { Activity, ActivityMember } from "../api";
import { battlePath, guildPath, slugOf } from "../api";
import { isGuildTab } from "../core/tools";
import { areaLabel, daysAgo, filterMembers, joinedAndLeft, kickListText, searchMembers, shareBars, sparkHeights, timeAgo } from "../core/view";

const NOW = new Date("2026-11-14T15:00:00Z");
const member = (name: string, status: ActivityMember["status"], extra: Partial<ActivityMember> = {}): ActivityMember => ({
  id: name,
  name,
  status,
  lastActive: null,
  lastFightAt: null,
  joinedOn: null,
  isNew: false,
  gains: { 7: null, 30: null },
  totals: null,
  main: null,
  spark: [],
  details: null,
  ...extra
});
const activity = (members: ActivityMember[], left: Activity["left"] = []): Activity => ({
  coveredDays: { 7: 7, 30: 30 },
  counts: { active: 0, quiet: 0, inactive: 0, unknown: 0 },
  members,
  left
});

describe("guild view helpers", () => {
  it("says how long ago a day or a moment was", () => {
    expect(daysAgo("2026-11-14", NOW)).toBe("today");
    expect(daysAgo("2026-11-13T23:59:00Z", NOW)).toBe("yesterday");
    expect(daysAgo("2026-11-04", NOW)).toBe("10 days ago");
    expect(daysAgo(null, NOW)).toBe("never");
    expect(timeAgo("2026-11-14T14:40:00Z", NOW)).toBe("20 min ago");
    expect(timeAgo("2026-11-14T10:00:00Z", NOW)).toBe("5h ago");
    expect(timeAgo("2026-11-12T15:00:00Z", NOW)).toBe("2 days ago");
  });

  it("filters members by status or as new", () => {
    const list = [member("Ann", "active", { isNew: true }), member("Bo", "inactive"), member("Cy", "quiet")];
    expect(filterMembers(list, "all")).toHaveLength(3);
    expect(filterMembers(list, "inactive").map((m) => m.name)).toEqual(["Bo"]);
    expect(filterMembers(list, "new").map((m) => m.name)).toEqual(["Ann"]);
  });

  it("finds members by name, ignoring case and extra spaces", () => {
    const list = [member("KaitoAO", "active"), member("Kaiser Golz", "quiet"), member("Bo", "inactive")];
    expect(searchMembers(list, "  kai ").map((m) => m.name)).toEqual(["KaitoAO", "Kaiser Golz"]);
    expect(searchMembers(list, "kaiser   golz").map((m) => m.name)).toEqual(["Kaiser Golz"]);
    expect(searchMembers(list, "")).toHaveLength(3);
  });

  it("counts who joined and left within some days", () => {
    const a = activity(
      [member("New", "active", { isNew: true, joinedOn: "2026-11-12" }), member("Older", "active", { isNew: true, joinedOn: "2026-10-20" })],
      [
        { id: "x", name: "Gone", leftOn: "2026-11-10" },
        { id: "y", name: "LongGone", leftOn: "2026-10-25" }
      ]
    );
    expect(joinedAndLeft(a, 7, NOW)).toEqual({ joined: 1, left: 1 });
    expect(joinedAndLeft(a, 30, NOW)).toEqual({ joined: 2, left: 2 });
  });

  it("writes the inactive list as a block for Discord, longest gone first", () => {
    const list = [member("Bo", "inactive", { lastActive: "2026-10-20" }), member("Ann", "active"), member("Zed", "inactive", { lastActive: "2026-10-01" })];
    expect(kickListText("Angry fuzzies", activity(list), NOW)).toBe(
      "**Angry fuzzies** · inactive for 14+ days (2)\n• Zed · last played 44 days ago\n• Bo · last played 25 days ago"
    );
    expect(kickListText("Angry fuzzies", activity([member("Ann", "active")]), NOW)).toBe("**Angry fuzzies**: nobody inactive for 14+ days.");
  });

  it("scales bars: the 14-day gains, and shares of the largest", () => {
    expect(sparkHeights([null, 0, 50, 100])).toEqual([null, 0, 50, 100]);
    expect(sparkHeights([1, 1000])).toEqual([8, 100]);
    expect(shareBars([["Ore", 30], ["Wood", 120], ["Fiber", 0]])).toEqual([
      ["Wood", 120, 100],
      ["Ore", 30, 25]
    ]);
  });

  it("names kill areas and builds guild addresses", () => {
    expect(areaLabel("OPEN_WORLD")).toBe("Open world");
    expect(areaLabel(null)).toBe("Unknown area");
    expect(guildPath({ region: "eu", slug: "angry-fuzzies" })).toBe("/guild/eu/angry-fuzzies");
    expect(guildPath({ region: "us", slug: "x" }, "activity")).toBe("/guild/us/x/activity");
    expect(guildPath({ region: "us", slug: "x" }, "overview")).toBe("/guild/us/x");
    expect(isGuildTab("killboard")).toBe(true);
    expect(isGuildTab("regear")).toBe(true);
    expect(isGuildTab("battle")).toBe(false);
    expect(battlePath("eu", 123)).toBe("/guild/battle/eu/123");
    expect(battlePath("us", 7, "a-b_c")).toBe("/guild/battle/us/7?guild=a-b_c");
    expect(slugOf("  Ångry Füzzies 2! ")).toBe("angry-fuzzies-2");
  });
});
