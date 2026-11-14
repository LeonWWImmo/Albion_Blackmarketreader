import { describe, expect, it, vi } from "vitest";
import { STALE_MS, handleGuild } from "../_lib/guildApi.js";
import { GID, NOW, OTHER, member, setup } from "./guild-kit.js";

describe("guild API edge cases", () => {
  it("keeps URL suffixes to letters and digits and finds a suffixed guild on a cold link", async () => {
    const UNDERSCORE = "ab_cdEFgh12345678901234";
    const { call, store, deps } = setup();
    // a tracked guild owns "angry-fuzzies"; a second guild with the same name is not tracked
    store.guilds.set(GID, { id: GID, region: "eu", slug: "angry-fuzzies", name: "Angry fuzzies", manager_id: "user-x", tracked_since: "2026-11-14", last_synced_at: NOW.toISOString() });
    deps.gameinfo.searchGuilds.mockImplementation(async () => [
      { id: GID, name: "Angry fuzzies", allianceName: null, killFame: 0, deathFame: 0 },
      { id: UNDERSCORE, name: "Angry Fuzzies", allianceName: null, killFame: 0, deathFame: 0 }
    ]);
    deps.gameinfo.getGuild.mockImplementation(async (region, id) => ({ id, name: id === GID ? "Angry fuzzies" : "Angry Fuzzies", allianceTag: null, foundedAt: null, killFame: 0, deathFame: 0 }));

    const byId = await call("guild", { query: { region: "eu", slug: "angry-fuzzies", id: UNDERSCORE } });
    expect(byId.body.guild).toMatchObject({ id: UNDERSCORE, slug: "angry-fuzzies-abcdef" });
    const cold = await call("guild", { query: { region: "eu", slug: "angry-fuzzies-abcdef" } });
    expect(cold.body.guild.id).toBe(UNDERSCORE);
    expect((await call("guild", { query: { region: "eu", slug: "angry-fuzzies-zzzzzz" } })).status).toBe(404);
  });

  it("double-checks a roster that suddenly shrank, and refuses an empty one", async () => {
    const { call, store, deps } = setup();
    const many = Array.from({ length: 20 }, (_, i) => member(`p${i}`, `P${i}`));
    deps.gameinfo.getMembers.mockResolvedValue(many);
    await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: GID } });

    // a short list first, the full one when asked again: nobody leaves
    deps.now = () => new Date(NOW.getTime() + STALE_MS + 1000);
    deps.gameinfo.getMembers.mockImplementation(async (region, id, options) => (options?.fresh ? many : many.slice(0, 3)));
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ body: { synced: 1 } });
    expect([...store.players.values()].filter((p) => p.left_on)).toHaveLength(0);

    // empty twice: the sync fails instead of marking everyone as left
    deps.now = () => new Date(NOW.getTime() + 2 * STALE_MS + 2000);
    deps.gameinfo.getMembers.mockResolvedValue([]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ body: { synced: 0, failed: 1 } });
    spy.mockRestore();
    expect([...store.players.values()].filter((p) => p.left_on)).toHaveLength(0);
  });

  it("accepts a real split: a short list that the second answer confirms", async () => {
    const { call, store, deps } = setup();
    const many = Array.from({ length: 20 }, (_, i) => member(`p${i}`, `P${i}`));
    deps.gameinfo.getMembers.mockResolvedValue(many);
    await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: GID } });
    deps.now = () => new Date(NOW.getTime() + STALE_MS + 1000);
    deps.gameinfo.getMembers.mockResolvedValue(many.slice(0, 4));
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ body: { synced: 1 } });
    expect([...store.players.values()].filter((p) => p.left_on)).toHaveLength(16);
  });

  it("starts tracking over when a guild is managed again", async () => {
    const { call, store, deps } = setup();
    await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: GID } });
    await call("release", { method: "POST", token: "tok-ann" });
    deps.now = () => new Date("2026-11-24T12:00:00Z");
    await call("manage", { method: "POST", token: "tok-bo", body: { region: "eu", id: GID } });
    expect(store.guilds.get(GID).tracked_since).toBe("2026-11-24");
    const page = await call("guild", { query: { region: "eu", id: GID } });
    expect(page.body.activity[7].coveredDays).toBe(0);
    // the 11-14 snapshot of the earlier tracking is no start point for a gain
    expect(page.body.activity[7].members.every((m) => m.pve === null)).toBe(true);
  });

  it("answers 409 with the right reason when a claim loses a race", async () => {
    const { call, store } = setup();
    await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: GID } });
    // the first check misses Ann's guild (another request was faster); the claim then fails
    const realGetManagedBy = store.getManagedBy;
    let first = true;
    store.getManagedBy = async (userId) => {
      if (first) {
        first = false;
        return null;
      }
      return realGetManagedBy(userId);
    };
    expect(await call("manage", { method: "POST", token: "tok-ann", body: { region: "eu", id: OTHER } })).toMatchObject({
      status: 409,
      body: { error: expect.stringContaining("You already manage Angry fuzzies") }
    });
  });

  it("limits requests per visitor, but never the cron", async () => {
    const { call, deps } = setup();
    let left = 2;
    deps.limiter = { take: () => left-- > 0 };
    const search = () => handleGuild("search", { method: "GET", query: { region: "eu", q: "angry" }, client: "1.2.3.4" }, deps);
    expect((await search()).status).toBe(200);
    expect((await search()).status).toBe(200);
    expect(await search()).toMatchObject({ status: 429 });
    expect((await call("sync", { authorization: "Bearer cron-123" })).status).toBe(200);
    expect((await call("mine")).status).toBe(429);
  });

  it("does not cache a page served without the database", async () => {
    const { call } = setup({ store: null });
    expect((await call("guild", { query: { region: "eu", id: GID } })).maxAge).toBe(0);
  });
});
