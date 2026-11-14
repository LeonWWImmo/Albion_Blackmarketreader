import { describe, expect, it } from "vitest";
import { addDays, buildActivity, lastActiveDay, planSync, playersFromMembers, slugify, snapshotOf, statusOf } from "../_lib/guildActivity.js";

const member = (id, name, fame = {}) => ({ id, name, pve: 100, killFame: 10, deathFame: 5, gathering: 0, crafting: 0, statsAt: null, ...fame });
const battle = (startTime, ids) => ({ id: startTime, startTime, players: 9, kills: 3, fame: 1000, ours: ids.map((id) => ({ id, name: id, kills: 1, deaths: 0, killFame: 50 })) });

describe("slugify", () => {
  it("turns guild names into URL parts", () => {
    expect(slugify("Angry fuzzies")).toBe("angry-fuzzies");
    expect(slugify("[KILL] Squäd  2")).toBe("kill-squad-2");
    expect(slugify("---")).toBe("guild");
  });
});

describe("planSync", () => {
  const today = "2026-11-14";

  it("adds new members as joined today and writes one snapshot each", () => {
    const plan = planSync({ guildId: "g", members: [member("a", "Ann")], battles: [], players: [], before: new Map(), today });
    expect(plan.players).toEqual([
      { guild_id: "g", player_id: "a", name: "Ann", joined_on: today, left_on: null, last_gain_on: null, stats_at: null, last_fight_at: null }
    ]);
    expect(plan.snapshots).toEqual([{ guild_id: "g", player_id: "a", day: today, pve: 100, kill_fame: 10, death_fame: 5, gathering: 0, crafting: 0 }]);
  });

  it("keeps the join day, notes fame growth and the latest fight", () => {
    const players = [{ guild_id: "g", player_id: "a", name: "Ann", joined_on: "2026-11-01", left_on: null, last_gain_on: "2026-11-10", stats_at: null, last_fight_at: "2026-11-12T20:00:00Z" }];
    const before = new Map([["a", snapshotOf("g", member("a", "Ann"), "2026-11-13")]]);
    const plan = planSync({
      guildId: "g",
      members: [member("a", "Ann (renamed)", { pve: 150, statsAt: "2026-11-14T00:38:00Z" })],
      battles: [battle("2026-11-13T19:00:00Z", ["a"]), battle("2026-11-11T19:00:00Z", ["a"])],
      players,
      before,
      today
    });
    expect(plan.players[0]).toMatchObject({ name: "Ann (renamed)", joined_on: "2026-11-01", last_gain_on: today, stats_at: "2026-11-14T00:38:00Z", last_fight_at: "2026-11-13T19:00:00Z" });
  });

  it("does not count unchanged fame as a gain and keeps the older fight when no newer one", () => {
    const players = [{ guild_id: "g", player_id: "a", name: "Ann", joined_on: "2026-11-01", left_on: null, last_gain_on: "2026-11-10", stats_at: "2026-11-09T00:00:00Z", last_fight_at: "2026-11-12T20:00:00Z" }];
    const before = new Map([["a", snapshotOf("g", member("a", "Ann"), "2026-11-13")]]);
    const plan = planSync({ guildId: "g", members: [member("a", "Ann")], battles: [battle("2026-11-01T19:00:00Z", ["a"])], players, before, today });
    expect(plan.players[0]).toMatchObject({ last_gain_on: "2026-11-10", stats_at: "2026-11-09T00:00:00Z", last_fight_at: "2026-11-12T20:00:00Z" });
  });

  it("marks members who are gone as left, once, and lets them rejoin", () => {
    const players = [
      { guild_id: "g", player_id: "a", name: "Ann", joined_on: "2026-11-01", left_on: null, last_gain_on: null, stats_at: null, last_fight_at: null },
      { guild_id: "g", player_id: "b", name: "Bo", joined_on: "2026-11-01", left_on: "2026-11-05", last_gain_on: null, stats_at: null, last_fight_at: null },
      { guild_id: "g", player_id: "c", name: "Cy", joined_on: "2026-11-01", left_on: "2026-11-03", last_gain_on: null, stats_at: null, last_fight_at: null }
    ];
    const plan = planSync({ guildId: "g", members: [member("c", "Cy")], battles: [], players, before: new Map(), today });
    const byId = Object.fromEntries(plan.players.map((p) => [p.player_id, p]));
    expect(byId.a.left_on).toBe(today);
    expect(byId.b).toBeUndefined(); // already left earlier: nothing to write
    expect(byId.c).toMatchObject({ left_on: null, joined_on: today });
  });
});

describe("status", () => {
  it("takes the latest sign of play", () => {
    expect(lastActiveDay({ last_gain_on: "2026-11-01", stats_at: "2026-11-09T00:38:00Z", last_fight_at: "2026-11-05T20:00:00Z" })).toBe("2026-11-09");
    expect(lastActiveDay({ last_gain_on: null, stats_at: null, last_fight_at: null })).toBeNull();
  });

  it("is active under 3 days, quiet under 14, inactive after", () => {
    expect(statusOf("2026-11-12", "2026-11-14")).toBe("active");
    expect(statusOf("2026-11-11", "2026-11-14")).toBe("quiet");
    expect(statusOf("2026-10-31", "2026-11-14")).toBe("inactive");
    expect(statusOf(null, "2026-11-14")).toBe("unknown");
  });
});

describe("buildActivity", () => {
  const today = "2026-11-14";
  const snap = (player, day, pve, kill = 0) => ({ guild_id: "g", player_id: player, day, pve, kill_fame: kill, death_fame: 0, gathering: 0, crafting: 0 });
  const player = (id, name, extra = {}) => ({ player_id: id, name, joined_on: "2026-11-01", left_on: null, last_gain_on: null, stats_at: null, last_fight_at: null, ...extra });

  it("sums the fame gained in the period and shows daily gains", () => {
    const snapshots = [snap("a", "2026-11-06", 1000), snap("a", "2026-11-07", 1100), snap("a", "2026-11-13", 1500, 20), snap("a", "2026-11-14", 1800, 50)];
    const a = buildActivity({ players: [player("a", "Ann", { last_gain_on: today })], snapshots, today, periodDays: 7, trackedSince: "2026-11-01" });
    expect(a.members[0]).toMatchObject({ pve: 700, pvp: 50, status: "active" }); // from 11-07 (the period start) to 11-14
    expect(a.members[0].totals).toEqual({ pve: 1800, pvp: 50, gathering: 0, crafting: 0 });
    expect(a.members[0].spark.at(-1)).toBe(330); // 11-13 -> 11-14
    expect(a.members[0].spark.at(-2)).toBeNull(); // no 11-12 snapshot
    expect(a.coveredDays).toBe(7);
  });

  it("starts from the first snapshot while tracking is younger than the period", () => {
    const snapshots = [snap("a", "2026-11-12", 1000), snap("a", "2026-11-14", 1200)];
    const a = buildActivity({ players: [player("a", "Ann")], snapshots, today, periodDays: 30, trackedSince: "2026-11-12" });
    expect(a.members[0].pve).toBe(200);
    expect(a.coveredDays).toBe(2);
  });

  it("has no gains with a single snapshot, and lists joins and leaves of the period", () => {
    const players = [
      player("a", "Ann", { stats_at: "2026-10-20T00:00:00Z" }),
      player("n", "Newbie", { joined_on: "2026-11-13" }),
      player("x", "Gone", { left_on: "2026-11-12" }),
      player("y", "LongGone", { left_on: "2026-09-01" })
    ];
    const a = buildActivity({ players, snapshots: [snap("a", today, 5)], today, periodDays: 7, trackedSince: "2026-11-01" });
    expect(a.members.find((m) => m.id === "a")).toMatchObject({ pve: null, status: "inactive" });
    expect(a.members.find((m) => m.id === "n").isNew).toBe(true);
    expect(a.joined).toBe(1);
    expect(a.left).toEqual([{ id: "x", name: "Gone", leftOn: "2026-11-12" }]);
    expect(a.counts).toEqual({ active: 0, quiet: 0, inactive: 1, unknown: 1 });
  });

  it("works for a guild that is not tracked: status from stats time and fights only", () => {
    const players = playersFromMembers("g", [member("a", "Ann", { statsAt: "2026-11-13T00:38:00Z" }), member("b", "Bo")], [battle("2026-11-02T19:00:00Z", ["b"])]);
    const a = buildActivity({ players, snapshots: [], today, periodDays: 7, trackedSince: null });
    expect(a.members.map((m) => [m.name, m.status, m.isNew])).toEqual([
      ["Ann", "active", false],
      ["Bo", "quiet", false]
    ]);
    expect(a.coveredDays).toBe(0);
  });

  it("counts days with addDays across month ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
