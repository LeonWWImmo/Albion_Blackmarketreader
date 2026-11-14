import { describe, expect, it } from "vitest";
import type { Activity, ActivityMember } from "../api";
import { guildPath } from "../api";
import { isGuildTab } from "../core/tools";
import { daysAgo, filterMembers, kickListText, sparkHeights, timeAgo } from "../core/view";

const NOW = new Date("2026-11-14T15:00:00Z");
const member = (name: string, status: ActivityMember["status"], isNew = false): ActivityMember => ({
  id: name,
  name,
  status,
  lastActive: null,
  lastFightAt: null,
  joinedOn: null,
  isNew,
  pve: null,
  pvp: null,
  gathering: null,
  crafting: null,
  lifetime: null,
  spark: []
});
const activity = (members: ActivityMember[]): Activity => ({
  periodDays: 7,
  coveredDays: 7,
  counts: { active: 0, quiet: 0, inactive: 0, unknown: 0 },
  joined: 0,
  members,
  left: []
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
    const list = [member("Ann", "active", true), member("Bo", "inactive"), member("Cy", "quiet")];
    expect(filterMembers(list, "all")).toHaveLength(3);
    expect(filterMembers(list, "inactive").map((m) => m.name)).toEqual(["Bo"]);
    expect(filterMembers(list, "new").map((m) => m.name)).toEqual(["Ann"]);
  });

  it("writes the inactive list to paste", () => {
    expect(kickListText("Angry fuzzies", activity([member("Bo", "inactive"), member("Ann", "active"), member("Zed", "inactive")]))).toBe(
      "Angry fuzzies: inactive for 14+ days (2): Bo, Zed"
    );
    expect(kickListText("Angry fuzzies", activity([member("Ann", "active")]))).toBe("Angry fuzzies: nobody inactive for 14+ days.");
  });

  it("scales the 14-day bars and keeps empty days apart from days without gain", () => {
    expect(sparkHeights([null, 0, 50, 100])).toEqual([null, 0, 50, 100]);
    expect(sparkHeights([1, 1000])).toEqual([8, 100]);
    expect(sparkHeights([null, null])).toEqual([null, null]);
  });

  it("builds guild addresses and knows its tabs", () => {
    expect(guildPath({ region: "eu", slug: "angry-fuzzies" })).toBe("/guild/eu/angry-fuzzies");
    expect(guildPath({ region: "us", slug: "x" }, "activity")).toBe("/guild/us/x/activity");
    expect(guildPath({ region: "us", slug: "x" }, "overview")).toBe("/guild/us/x");
    expect(isGuildTab("activity")).toBe(true);
    expect(isGuildTab("regear")).toBe(false);
  });
});
