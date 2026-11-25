import { describe, expect, it, vi } from "vitest";
import { handleGuild } from "../_lib/guildApi.js";
import { GID, NOW, OTHER, member, setup } from "./guild-kit.js";

const DAY_MS = 24 * 3600 * 1000;

describe("guild API edge cases", () => {
  it("gives two guilds with one name stable addresses, also on a cold link", async () => {
    const TWIN = "ab_cdEFgh12345678901234";
    const { call, store, deps } = setup();
    // a stored guild owns "angry-fuzzies"; a second guild with the same name is not stored
    store.guilds.set(GID, { id: GID, region: "eu", slug: "angry-fuzzies", name: "Angry fuzzies", tracked_since: null, last_synced_at: null });
    deps.gameinfo.searchGuilds.mockImplementation(async () => [
      { id: GID, name: "Angry fuzzies", allianceName: null, killFame: 0, deathFame: 0 },
      { id: TWIN, name: "Angry Fuzzies", allianceName: null, killFame: 0, deathFame: 0 }
    ]);
    deps.gameinfo.getGuild.mockImplementation(async (region, id) => ({ id, name: id === GID ? "Angry fuzzies" : "Angry Fuzzies", allianceTag: null, foundedAt: null, killFame: 0, deathFame: 0 }));

    // from the search: plain address + id -> the twin gets its own address (letters and digits only)
    const fromSearch = await call("guild", { query: { region: "eu", slug: "angry-fuzzies", id: TWIN } });
    expect(fromSearch.body.guild).toMatchObject({ id: TWIN, slug: "angry-fuzzies-abcdef" });
    // after the redirect: the same address again, so the page does not bounce
    const redirected = await call("guild", { query: { region: "eu", slug: "angry-fuzzies-abcdef", id: TWIN } });
    expect(redirected.body.guild.slug).toBe("angry-fuzzies-abcdef");
    // a shared link without id finds the twin, the plain address the stored guild
    expect((await call("guild", { query: { region: "eu", slug: "angry-fuzzies-abcdef" } })).body.guild.id).toBe(TWIN);
    expect((await call("guild", { query: { region: "eu", slug: "angry-fuzzies" } })).body.guild).toMatchObject({ id: GID, slug: "angry-fuzzies" });
    expect((await call("guild", { query: { region: "eu", slug: "angry-fuzzies-zzzzzz" } })).status).toBe(404);
  });

  it("double-checks a roster that suddenly shrank, and refuses an empty one", async () => {
    const { call, store, deps, markAs } = setup();
    const many = Array.from({ length: 20 }, (_, i) => member(`p${i}`, `P${i}`));
    deps.gameinfo.getMembers.mockResolvedValue(many);
    await markAs("tok-ann");

    // a short list first, the full one when asked again: nobody leaves
    deps.now = () => new Date(NOW.getTime() + DAY_MS + 1000);
    deps.gameinfo.getMembers.mockImplementation(async (region, id, options) => (options?.fresh ? many : many.slice(0, 3)));
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ body: { synced: 1 } });
    expect([...store.players.values()].filter((p) => p.left_on)).toHaveLength(0);

    // empty twice: the sync fails instead of marking everyone as left
    deps.now = () => new Date(NOW.getTime() + 2 * DAY_MS + 2000);
    deps.gameinfo.getMembers.mockResolvedValue([]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ body: { synced: 0, failed: 1 } });
    spy.mockRestore();
    expect([...store.players.values()].filter((p) => p.left_on)).toHaveLength(0);
  });

  it("deletes the guild's daily snapshots older than 95 days at the sync", async () => {
    const { call, store, deps, markAs } = setup();
    await markAs("tok-ann");
    const old = { guild_id: GID, player_id: "p-old", day: "2026-08-01" };
    const kept = { guild_id: GID, player_id: "p-old", day: "2026-08-20" };
    const other = { guild_id: OTHER, player_id: "p-x", day: "2026-01-01" };
    await store.saveSnapshots([old, kept, other]);
    deps.now = () => new Date(NOW.getTime() + DAY_MS + 1000);
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ body: { synced: 1 } });
    const days = [...store.snapshots.values()].filter((r) => r.player_id === "p-old").map((r) => r.day);
    expect(days).toEqual(["2026-08-20"]);
    expect([...store.snapshots.values()].some((r) => r.guild_id === OTHER)).toBe(true);
  });

  it("accepts a real split: a short list that the second answer confirms", async () => {
    const { call, store, deps, markAs } = setup();
    const many = Array.from({ length: 20 }, (_, i) => member(`p${i}`, `P${i}`));
    deps.gameinfo.getMembers.mockResolvedValue(many);
    await markAs("tok-ann");
    deps.now = () => new Date(NOW.getTime() + DAY_MS + 1000);
    deps.gameinfo.getMembers.mockResolvedValue(many.slice(0, 4));
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ body: { synced: 1 } });
    expect([...store.players.values()].filter((p) => p.left_on)).toHaveLength(16);
  });

  it("answers 409 with the right reason when a mark loses a race", async () => {
    const { store, markAs } = setup();
    await markAs("tok-ann");
    // the first check misses Ann's mark (another request was faster); the insert then fails
    const realGetMark = store.getMark;
    let first = true;
    store.getMark = async (userId, region) => {
      if (first) {
        first = false;
        return null;
      }
      return realGetMark(userId, region);
    };
    expect(await markAs("tok-ann", OTHER)).toMatchObject({ status: 409, body: { error: expect.stringContaining("You marked Angry fuzzies on Europe already") } });
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
