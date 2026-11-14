import { describe, expect, it, vi } from "vitest";
import { GameinfoError } from "../_lib/gameinfo.js";
import { STALE_MS } from "../_lib/guildApi.js";
import { createMemoryGuildStore } from "../_lib/guildMemoryStore.js";
import { GID, NOW, OTHER, member, setup } from "./guild-kit.js";

describe("search", () => {
  it("finds guilds by name and checks the input", async () => {
    const { call } = setup();
    expect(await call("search", { query: { region: "eu", q: "angry" } })).toMatchObject({ status: 200, body: { guilds: [{ id: GID, slug: "angry-fuzzies" }] }, maxAge: 600 });
    expect((await call("search", { query: { region: "eu", q: "a" } })).status).toBe(400);
    expect((await call("search", { query: { region: "asia", q: "angry" } })).status).toBe(400);
    expect((await call("search", { method: "POST", query: { region: "eu", q: "angry" } })).status).toBe(405);
  });
});

describe("guild page", () => {
  it("shows a guild nobody tracks yet, found by its URL name, cached for everyone", async () => {
    const { call } = setup();
    const res = await call("guild", { query: { region: "eu", slug: "angry-fuzzies" } });
    expect(res.status).toBe(200);
    expect(res.maxAge).toBe(300);
    expect(res.body.guild).toMatchObject({ id: GID, name: "Angry fuzzies", slug: "angry-fuzzies", memberCount: 2, allianceTag: "BOSSS" });
    expect(res.body.tracking).toMatchObject({ tracked: false, managedByYou: false, managedByOther: false, canManage: true });
    expect(res.body.activity[7].members.map((m) => [m.name, m.status])).toEqual([
      ["Ann", "active"],
      ["Bo", "active"]
    ]);
    expect(res.body.activity[7].members[0]).toMatchObject({ lifetime: 1010, pve: null }); // lifetime from today's roster, no gains yet
    expect(res.body.fights).toEqual([{ id: 1, startTime: "2026-11-14T10:00:00Z", players: 12, fame: 900, ours: 1, kills: 2, deaths: 1 }]);
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

  it("keeps the public page up when the database fails, without tracking or manage button", async () => {
    const store = createMemoryGuildStore();
    const { call } = setup({ store });
    await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: GID } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    store.getGuildBySlug = async () => {
      throw new Error("relation does not exist");
    };
    const bySlug = await call("guild", { query: { region: "eu", slug: "angry-fuzzies" } });
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.tracking).toMatchObject({ tracked: false, canManage: false });
    store.getSnapshots = async () => {
      throw new Error("timeout");
    };
    const byId = await call("guild", { query: { region: "eu", id: GID } });
    expect(byId.status).toBe(200);
    expect(byId.body.tracking).toMatchObject({ tracked: false, canManage: false });
    expect(byId.body.activity[7].members).toHaveLength(2);
    spy.mockRestore();
  });

  it("still works without a database: no tracking, no manage button", async () => {
    const { call } = setup({ store: null });
    const res = await call("guild", { query: { region: "eu", id: GID } });
    expect(res.status).toBe(200);
    expect(res.body.tracking).toMatchObject({ tracked: false, canManage: false });
    expect((await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: GID } })).status).toBe(503);
  });
});

describe("managing a guild", () => {
  it("needs a signed-in player", async () => {
    const { call } = setup();
    expect((await call("manage", { method: "POST", body: { region: "eu", id: GID } })).status).toBe(401);
    expect((await call("manage", { method: "POST", token: "tok-unknown", body: { region: "eu", id: GID } })).status).toBe(401);
    expect((await call("manage", { method: "GET", token: "tok-ann" })).status).toBe(405);
  });

  it("starts tracking with a first snapshot, and shows the guild as yours", async () => {
    const { call, store } = setup();
    const res = await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: GID } });
    expect(res).toMatchObject({ status: 200, body: { guild: { id: GID, region: "eu", slug: "angry-fuzzies", name: "Angry fuzzies" } } });
    expect(store.guilds.get(GID)).toMatchObject({ manager_id: "user-ann", tracked_since: "2026-11-14", last_synced_at: NOW.toISOString(), member_count: 2 });
    expect(store.snapshots.size).toBe(2);
    expect([...store.players.values()].find((p) => p.player_id === "a").last_fight_at).toBe("2026-11-14T10:00:00Z");

    const page = await call("guild", { token: "tok-ann", query: { region: "eu", slug: "angry-fuzzies" } });
    expect(page.maxAge).toBe(0); // personal answer: never cached
    expect(page.body.tracking).toMatchObject({ tracked: true, since: "2026-11-14", managedByYou: true, managedByOther: false });
    const forBo = await call("guild", { token: "tok-bo", query: { region: "eu", slug: "angry-fuzzies" } });
    expect(forBo.body.tracking).toMatchObject({ managedByYou: false, managedByOther: true });
    expect(await call("mine", { token: "tok-ann" })).toMatchObject({ status: 200, body: { guild: { id: GID } } });
    expect(await call("mine", { token: "tok-bo" })).toMatchObject({ status: 200, body: { guild: null } });
    expect(await call("mine")).toMatchObject({ status: 200, body: { guild: null } });
  });

  it("lets only one player manage a guild, and each player only one guild", async () => {
    const { call } = setup();
    await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: GID } });
    expect(await call("manage", { method: "POST", token: "tok-bo", body: { region: "eu", id: GID } })).toMatchObject({ status: 409, body: { error: "Another player already manages this guild." } });
    expect(await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: OTHER } })).toMatchObject({ status: 409, body: { error: expect.stringContaining("You already manage Angry fuzzies") } });
    expect((await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: GID } })).status).toBe(200); // same guild again: fine
    expect((await call("manage", { method: "POST", token: "tok-bo", body: { region: "eu", id: "bad" } })).status).toBe(400);
  });

  it("frees the guild on release and keeps its history for the next manager", async () => {
    const { call, store } = setup();
    await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: GID } });
    expect(await call("release", { method: "POST", token: "tok-ann" })).toMatchObject({ status: 200, body: { released: true } });
    expect(store.guilds.get(GID).manager_id).toBeNull();
    expect(await call("release", { method: "POST", token: "tok-ann" })).toMatchObject({ status: 200, body: { released: false } });
    await call("manage", { method: "POST", token: "tok-bo", body: { region: "eu", id: GID } });
    expect(store.guilds.get(GID)).toMatchObject({ manager_id: "user-bo", tracked_since: "2026-11-14" });
  });

  it("gives a guild a different URL name when another guild already has it", async () => {
    const { call, store } = setup();
    store.guilds.set("Someoneelse0000000001", { id: "Someoneelse0000000001", region: "eu", slug: "angry-fuzzies", name: "Angry-Fuzzies", manager_id: null });
    const res = await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: GID } });
    expect(res.body.guild.slug).toBe("angry-fuzzies-rcp44z");
  });
});

describe("daily sync", () => {
  it("needs the cron secret", async () => {
    const { call } = setup();
    expect((await call("sync", { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await call("sync")).status).toBe(401);
  });

  it("syncs managed guilds whose last sync is old, and only those", async () => {
    const { call, store, deps } = setup();
    await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: GID } });
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ status: 200, body: { synced: 0, failed: 0 } });

    // a day later Ann's fame grew: the sync notes the gain and the page shows it
    const tomorrow = new Date(NOW.getTime() + STALE_MS + 4 * 3600 * 1000);
    deps.now = () => tomorrow;
    deps.gameinfo.getMembers.mockResolvedValue([member("a", "Ann", 1600)]);
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ status: 200, body: { synced: 1, failed: 0 } });
    const players = Object.fromEntries([...store.players.values()].map((p) => [p.player_id, p]));
    expect(players.a.last_gain_on).toBe("2026-11-15");
    expect(players.b.left_on).toBe("2026-11-15");
    const page = await call("guild", { query: { region: "eu", id: GID } });
    expect(page.body.activity[7].members).toMatchObject([{ name: "Ann", pve: 600 }]);
    expect(page.body.activity[7].left).toEqual([{ id: "b", name: "Bo", leftOn: "2026-11-15" }]);
  });

  it("counts a failed guild and goes on", async () => {
    const { call, deps } = setup();
    await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: GID } });
    deps.now = () => new Date(NOW.getTime() + STALE_MS + 1000);
    deps.gameinfo.getGuild.mockRejectedValueOnce(new GameinfoError("down", 502));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ status: 200, body: { synced: 0, failed: 1 } });
    spy.mockRestore();
  });

  it("syncs a stale managed guild when someone opens its page", async () => {
    const { call, store, deps } = setup();
    await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: GID } });
    deps.now = () => new Date(NOW.getTime() + STALE_MS + 1000);
    await call("guild", { query: { region: "eu", id: GID } });
    expect(store.guilds.get(GID).last_synced_at).toBe(new Date(NOW.getTime() + STALE_MS + 1000).toISOString());
  });
});

it("answers unknown actions with 404", async () => {
  const { call } = setup();
  expect((await call("nope")).status).toBe(404);
});
