import { describe, expect, it, vi } from "vitest";
import { GameinfoError } from "../_lib/gameinfo.js";
import { STALE_MS, normalizeQuery, rankGuilds } from "../_lib/guildApi.js";
import { createMemoryGuildStore } from "../_lib/guildMemoryStore.js";
import { GID, NOW, OTHER, killEvent, member, setup } from "./guild-kit.js";

describe("search", () => {
  it("finds guilds by name and checks the input", async () => {
    const { call } = setup();
    expect(await call("search", { query: { region: "eu", q: "angry" } })).toMatchObject({ status: 200, body: { guilds: [{ id: GID, slug: "angry-fuzzies" }] }, maxAge: 600 });
    expect((await call("search", { query: { region: "eu", q: "a" } })).status).toBe(400);
    expect((await call("search", { query: { region: "asia", q: "angry" } })).status).toBe(400);
    expect((await call("search", { method: "POST", query: { region: "eu", q: "angry" } })).status).toBe(405);
  });

  it("asks the killboard the same way however the name is typed", async () => {
    const { call, deps } = setup();
    await call("search", { query: { region: "eu", q: "  Angry   FUZZIES " } });
    expect(deps.gameinfo.searchGuilds).toHaveBeenLastCalledWith("eu", "angry fuzzies");
    expect(normalizeQuery("  Angry\tFuz ")).toBe("angry fuz");
  });

  it("puts the exact name first, then names that start with the query", () => {
    const hits = [{ name: "The Angry Ones" }, { name: "Angry fuzzies 2" }, { name: "angry fuzzies" }, { name: "Angry Fuzzies Academy" }];
    expect(rankGuilds(hits, "angry fuzzies").map((g) => g.name)).toEqual(["angry fuzzies", "Angry fuzzies 2", "Angry Fuzzies Academy", "The Angry Ones"]);
  });
});

describe("guild page", () => {
  it("shows a guild nobody tracks yet, found by its URL name, the same for everyone and cached", async () => {
    const { call } = setup();
    const res = await call("guild", { query: { region: "eu", slug: "angry-fuzzies" } });
    expect(res.status).toBe(200);
    expect(res.maxAge).toBe(300);
    expect(res.body.guild).toMatchObject({ id: GID, name: "Angry fuzzies", slug: "angry-fuzzies", memberCount: 2, allianceTag: "BOSSS" });
    expect(res.body.tracking).toEqual({ tracked: false, since: null, lastSyncedAt: null, markedBy: 0, canMark: true });
    expect(res.body.activity.members.map((m) => [m.name, m.status])).toEqual([
      ["Ann", "active"],
      ["Bo", "active"]
    ]);
    // totals from today's roster, no gains yet; where the fame came from rides along
    expect(res.body.activity.members[0]).toMatchObject({ totals: { total: 1010, pve: 1000, pvp: 10 }, gains: { 7: null, 30: null }, main: "pve" });
    expect(res.body.activity.members[0].details).toMatchObject({ killFame: 10, deathFame: 0 });
    expect(res.body.fights).toEqual([{ id: 1, startTime: "2026-11-14T10:00:00Z", players: 12, fame: 900, ours: 1, kills: 2, deaths: 1, enemy: null }]);
    // a signed-in visit gets the same public answer: nothing personal is in it
    expect(await call("guild", { token: "tok-ann", query: { region: "eu", slug: "angry-fuzzies" } })).toEqual(res);
  });

  it("answers 404 for an unknown name or id and 400 for an unknown server", async () => {
    const { call } = setup();
    expect((await call("guild", { query: { region: "eu", slug: "nobody-here" } })).status).toBe(404);
    expect((await call("guild", { query: { region: "eu", slug: "", id: "Zzzzzzzzzzzzzzzzzzzzzz" } })).status).toBe(404);
    expect((await call("guild", { query: { region: "eu", slug: "../etc" } })).status).toBe(404);
    expect((await call("guild", { query: { region: "xx", slug: "angry-fuzzies" } })).status).toBe(400);
  });

  it("reports a killboard outage as 502", async () => {
    const { call, deps } = setup();
    deps.gameinfo.getMembers.mockRejectedValueOnce(new GameinfoError("down", 502));
    expect(await call("guild", { query: { region: "eu", id: GID } })).toMatchObject({ status: 502, body: { error: expect.stringContaining("not answering") } });
  });

  it("keeps the public page up when the database fails, without tracking, mark button or cache", async () => {
    const store = createMemoryGuildStore();
    const { call, markAs } = setup({ store });
    await markAs("tok-ann");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    store.getGuildBySlug = async () => {
      throw new Error("relation does not exist");
    };
    const bySlug = await call("guild", { query: { region: "eu", slug: "angry-fuzzies" } });
    expect(bySlug).toMatchObject({ status: 200, maxAge: 0, body: { tracking: { tracked: false, canMark: false } } });
    store.getSnapshots = async () => {
      throw new Error("timeout");
    };
    const byId = await call("guild", { query: { region: "eu", id: GID } });
    expect(byId).toMatchObject({ status: 200, maxAge: 0, body: { tracking: { tracked: false, canMark: false } } });
    expect(byId.body.activity.members).toHaveLength(2);
    spy.mockRestore();
  });

  it("still works without a database: no tracking, no mark button", async () => {
    const { call, markAs } = setup({ store: null });
    const res = await call("guild", { query: { region: "eu", id: GID } });
    expect(res.status).toBe(200);
    expect(res.body.tracking).toMatchObject({ tracked: false, canMark: false });
    expect((await markAs("tok-ann")).status).toBe(503);
  });
});

describe("killboard", () => {
  it("lists the guild's kills and the deaths from its latest fights, newest first, cached", async () => {
    const { call, deps } = setup();
    const res = await call("killboard", { query: { region: "eu", id: GID } });
    expect(res.maxAge).toBe(300);
    expect(res.body.kills.map((e) => e.id)).toEqual([12, 11]);
    expect(res.body.deaths.map((e) => e.id)).toEqual([21]); // event 22 in the same fight was a kill of ours
    expect(deps.gameinfo.getBattleEvents).toHaveBeenCalledWith("eu", 1);
    expect((await call("killboard", { query: { region: "eu", id: "bad" } })).status).toBe(400);
  });

  it("also reads the deaths of the members who played last, once each, only those in this guild", async () => {
    const { call, deps } = setup();
    const day = (i) => `2026-11-${String(i + 1).padStart(2, "0")}T00:00:00Z`;
    const members = Array.from({ length: 22 }, (_, i) => ({ ...member(`p${i}`, `P${i}`), deathFame: i === 0 ? 0 : 100, statsAt: day(i) }));
    deps.gameinfo.getMembers.mockResolvedValue(members);
    deps.gameinfo.getPlayerDeaths.mockImplementation(async (region, playerId) =>
      playerId === "p21"
        ? [killEvent(21, "2026-11-14T10:01:00Z", "x", GID), killEvent(31, "2026-11-14T11:30:00Z", "x", GID), killEvent(32, "2026-11-14T11:40:00Z", "x", "another guild")]
        : []
    );
    const res = await call("killboard", { query: { region: "eu", id: GID } });
    // newest first; 21 is in the fight and in the member's list, shown once; 32 was in another guild
    expect(res.body.deaths.map((e) => e.id)).toEqual([31, 21]);
    const asked = deps.gameinfo.getPlayerDeaths.mock.calls.map(([, id]) => id);
    expect(asked).toHaveLength(20);
    expect(asked[0]).toBe("p21"); // the most recently active first
    expect(asked).not.toContain("p0"); // never died
    expect(asked).not.toContain("p1"); // the 21st most recently active
  });

  it("still shows the board when a member's deaths cannot be read, without keeping it for everyone", async () => {
    const { call, deps } = setup();
    deps.gameinfo.getMembers.mockResolvedValue([{ ...member("a", "Ann"), deathFame: 5 }]);
    deps.gameinfo.getPlayerDeaths.mockRejectedValue(new GameinfoError("down", 502));
    expect(await call("killboard", { query: { region: "eu", id: GID } })).toMatchObject({ status: 200, maxAge: 0, body: { deaths: [{ id: 21 }] } });
  });

  it("still shows the kills when a fight cannot be read", async () => {
    const { call, deps } = setup();
    deps.gameinfo.getBattleEvents.mockRejectedValue(new GameinfoError("down", 502));
    const res = await call("killboard", { query: { region: "eu", id: GID } });
    expect(res.status).toBe(200);
    expect(res.body.deaths).toEqual([]);
    expect(res.body.kills).toHaveLength(2);
  });
});

describe("marking a guild", () => {
  it("needs a signed-in player", async () => {
    const { call, markAs } = setup();
    expect((await call("mark", { method: "POST", body: { region: "eu", id: GID } })).status).toBe(401);
    expect((await markAs("tok-unknown")).status).toBe(401);
    expect((await call("mark", { method: "GET", token: "tok-ann" })).status).toBe(405);
    expect((await call("mine", { method: "POST", token: "tok-ann" })).status).toBe(405);
  });

  it("starts tracking with a first snapshot", async () => {
    const { call, store, markAs } = setup();
    expect(await markAs("tok-ann")).toMatchObject({ status: 200, body: { guild: { id: GID, region: "eu", slug: "angry-fuzzies", name: "Angry fuzzies" } } });
    expect(store.guilds.get(GID)).toMatchObject({ tracked_since: "2026-11-14", last_synced_at: NOW.toISOString(), member_count: 2 });
    expect(store.snapshots.size).toBe(2);
    expect([...store.players.values()].find((p) => p.player_id === "a").last_fight_at).toBe("2026-11-14T10:00:00Z");
    const page = await call("guild", { query: { region: "eu", slug: "angry-fuzzies" } });
    expect(page.body.tracking).toMatchObject({ tracked: true, since: "2026-11-14", markedBy: 1, canMark: true });
    expect(await call("mine", { token: "tok-ann" })).toMatchObject({ status: 200, body: { guild: { id: GID } } });
    expect(await call("mine", { token: "tok-bo" })).toMatchObject({ status: 200, body: { guild: null } });
    expect(await call("mine")).toMatchObject({ status: 200, body: { guild: null } });
  });

  it("lets any number of players mark the same guild, each one guild", async () => {
    const { call, store, markAs } = setup();
    await markAs("tok-ann");
    expect((await markAs("tok-bo")).status).toBe(200);
    expect(store.snapshots.size).toBe(2); // the second mark on the same day does not sync again
    expect((await call("guild", { query: { region: "eu", id: GID } })).body.tracking.markedBy).toBe(2);
    expect(await markAs("tok-ann", OTHER)).toMatchObject({ status: 409, body: { error: expect.stringContaining("You marked Angry fuzzies already") } });
    expect((await markAs("tok-ann")).status).toBe(200); // the same guild again: fine
    expect((await call("mark", { method: "POST", token: "tok-bo", body: { region: "eu", id: "bad" } })).status).toBe(400);
  });

  it("keeps tracking while anyone still has the guild marked, and starts over after nobody had", async () => {
    const { call, store, markAs, deps } = setup();
    await markAs("tok-ann");
    await markAs("tok-bo");
    expect(await call("unmark", { method: "POST", token: "tok-ann" })).toMatchObject({ status: 200, body: { unmarked: true } });
    expect((await call("guild", { query: { region: "eu", id: GID } })).body.tracking).toMatchObject({ tracked: true, markedBy: 1 });
    await call("unmark", { method: "POST", token: "tok-bo" });
    expect((await call("guild", { query: { region: "eu", id: GID } })).body.tracking).toMatchObject({ tracked: false, markedBy: 0 });
    expect(await call("unmark", { method: "POST", token: "tok-bo" })).toMatchObject({ body: { unmarked: false } });
    deps.now = () => new Date("2026-11-24T12:00:00Z");
    await markAs("tok-ann");
    expect(store.guilds.get(GID).tracked_since).toBe("2026-11-24");
    const page = await call("guild", { query: { region: "eu", id: GID } });
    // the 11-14 snapshot of the earlier tracking is no start point for a gain
    expect(page.body.activity.coveredDays).toEqual({ 7: 0, 30: 0 });
    expect(page.body.activity.members.every((m) => m.gains[7] === null)).toBe(true);
  });

  it("gives a guild a different URL name when another stored guild has it", async () => {
    const { store, markAs } = setup();
    store.guilds.set("Someoneelse0000000001", { id: "Someoneelse0000000001", region: "eu", slug: "angry-fuzzies", name: "Angry-Fuzzies" });
    expect((await markAs("tok-ann")).body.guild.slug).toBe("angry-fuzzies-rcp44z");
  });
});

describe("daily sync", () => {
  it("needs the cron secret", async () => {
    const { call } = setup();
    expect((await call("sync", { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await call("sync")).status).toBe(401);
  });

  it("syncs marked guilds whose last sync is old, and only those", async () => {
    const { call, store, deps, markAs } = setup();
    await markAs("tok-ann");
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ status: 200, body: { synced: 0, failed: 0 } });

    // a day later Ann's fame grew and Bo left: the sync notes both and the page shows them
    const tomorrow = new Date(NOW.getTime() + STALE_MS + 4 * 3600 * 1000);
    deps.now = () => tomorrow;
    deps.gameinfo.getMembers.mockResolvedValue([member("a", "Ann", 1600)]);
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ status: 200, body: { synced: 1, failed: 0 } });
    const players = Object.fromEntries([...store.players.values()].map((p) => [p.player_id, p]));
    expect(players.a.last_gain_on).toBe("2026-11-15");
    expect(players.b.left_on).toBe("2026-11-15");
    const page = await call("guild", { query: { region: "eu", id: GID } });
    expect(page.body.activity.members).toMatchObject([{ name: "Ann", gains: { 7: { pve: 600, total: 600 }, 30: { pve: 600 } } }]);
    expect(page.body.activity.left).toEqual([{ id: "b", name: "Bo", leftOn: "2026-11-15" }]);
  });

  it("does not sync a guild nobody has marked", async () => {
    const { call, markAs, deps } = setup();
    await markAs("tok-ann");
    await call("unmark", { method: "POST", token: "tok-ann" });
    deps.now = () => new Date(NOW.getTime() + 2 * STALE_MS);
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ body: { synced: 0 } });
  });

  it("counts a failed guild and goes on", async () => {
    const { call, deps, markAs } = setup();
    await markAs("tok-ann");
    deps.now = () => new Date(NOW.getTime() + STALE_MS + 1000);
    deps.gameinfo.getGuild.mockRejectedValueOnce(new GameinfoError("down", 502));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ status: 200, body: { synced: 0, failed: 1 } });
    spy.mockRestore();
  });

  it("never writes on a visit, however old the last snapshot is", async () => {
    const { call, store, deps, markAs } = setup();
    await markAs("tok-ann");
    const snapshots = store.snapshots.size;
    deps.now = () => new Date(NOW.getTime() + 5 * 24 * 3600 * 1000);
    await call("guild", { query: { region: "eu", id: GID } });
    expect(store.guilds.get(GID).last_synced_at).toBe(NOW.toISOString());
    expect(store.snapshots.size).toBe(snapshots);
  });
});

it("answers unknown actions with 404", async () => {
  const { call } = setup();
  expect((await call("nope")).status).toBe(404);
  expect((await call("manage", { method: "POST", token: "tok-ann" })).status).toBe(404);
});
