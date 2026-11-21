import { describe, expect, it, vi } from "vitest";
import { GameinfoError } from "../_lib/gameinfo.js";
import { withSlugs } from "../_lib/guildApi.js";
import { GID, NOW, member, setup } from "./guild-kit.js";

const DAY_MS = 24 * 3600 * 1000;

const TWIN = "Twin0000000000000000000";

describe("addresses of guilds that share a name", () => {
  it("gives search hits with the same name each their own address", () => {
    const hits = withSlugs([
      { id: GID, name: "Angry fuzzies" },
      { id: TWIN, name: "Angry Fuzzies" },
      { id: "Other000000000000000000", name: "Calm ones" }
    ]);
    expect(hits.map((g) => g.slug)).toEqual(["angry-fuzzies-rcp44z", "angry-fuzzies-twin00", "calm-ones"]);
  });

  it("finds a twin on the killboard search even when no guild is stored", async () => {
    const { call, deps } = setup({ store: null });
    deps.gameinfo.searchGuilds.mockResolvedValue([
      { id: GID, name: "Angry fuzzies", allianceName: null, killFame: 0, deathFame: 0 },
      { id: TWIN, name: "Angry Fuzzies", allianceName: null, killFame: 0, deathFame: 0 }
    ]);
    const page = await call("guild", { query: { region: "eu", slug: "angry-fuzzies", id: GID } });
    expect(page.body.guild.slug).toBe("angry-fuzzies-rcp44z");
    // the suffixed address finds the guild again, and stays the same
    const again = await call("guild", { query: { region: "eu", slug: "angry-fuzzies-rcp44z" } });
    expect(again.body.guild).toMatchObject({ id: GID, slug: "angry-fuzzies-rcp44z" });
  });
});

describe("a stored guild opened by a copied address", () => {
  it("keeps its marks when the address has the id bit and the page sends no id", async () => {
    const { call, deps, markAs } = setup();
    expect((await markAs("tok-ann")).status).toBe(200);
    // a twin shows up on the killboard: search hits get the id bit, the stored guild keeps its address
    deps.gameinfo.searchGuilds.mockResolvedValue([
      { id: GID, name: "Angry fuzzies", allianceName: null, killFame: 0, deathFame: 0 },
      { id: TWIN, name: "Angry Fuzzies", allianceName: null, killFame: 0, deathFame: 0 }
    ]);
    const page = await call("guild", { query: { region: "eu", slug: "angry-fuzzies-rcp44z" } });
    expect(page.body.guild.id).toBe(GID);
    expect(page.body.tracking.markedBy).toBe(1);
  });
});

describe("answers that are not kept for everyone", () => {
  it("does not cache a guild page whose fights could not be read", async () => {
    const { call, deps } = setup();
    deps.gameinfo.getBattles.mockRejectedValueOnce(new GameinfoError("down", 502));
    const page = await call("guild", { query: { region: "eu", id: GID } });
    expect(page).toMatchObject({ status: 200, maxAge: 0, body: { fights: [] } });
    expect((await call("guild", { query: { region: "eu", id: GID } })).maxAge).toBe(300);
  });

  it("does not cache a killboard with a fight missing", async () => {
    const { call, deps } = setup();
    deps.gameinfo.getBattleEvents.mockRejectedValueOnce(new GameinfoError("down", 502));
    expect((await call("killboard", { query: { region: "eu", id: GID } })).maxAge).toBe(0);
  });
});

describe("marks", () => {
  it("starts tracking anew when the only other marker unmarks while this mark is made", async () => {
    const { store, markAs } = setup();
    expect((await markAs("tok-ann")).status).toBe(200);
    store.setTrackedSince = vi.fn(store.setTrackedSince.bind(store));
    // counted before Bo's mark: Ann's; then Ann unmarks before Bo's mark is saved
    const realAdd = store.addMark.bind(store);
    store.addMark = async (userId, region, guildId) => {
      await store.removeMark("user-ann", "eu");
      return realAdd(userId, region, guildId);
    };
    expect((await markAs("tok-bo")).status).toBe(200);
    expect(store.setTrackedSince).toHaveBeenCalled();
  });

  it("answers a double click on Mark with ok, not an error", async () => {
    const { store, markAs } = setup();
    const realGetMark = store.getMark;
    // the second request saw no mark yet, then lost the insert to the first one
    let calls = 0;
    store.getMark = async (userId, region) => (calls++ === 0 ? null : realGetMark(userId, region));
    store.addMark = vi.fn(async (userId, region, guildId) => {
      store.marks.set(`${userId}:${region}:${guildId}`, guildId);
      return false;
    });
    expect(await markAs("tok-ann")).toMatchObject({ status: 200, body: { guild: { id: GID } } });
  });

  it("takes the next free address when another guild took it a moment ago", async () => {
    const { store, markAs } = setup();
    const realSave = store.saveGuild;
    let first = true;
    store.saveGuild = async (row) => {
      if (first && row.slug === "angry-fuzzies") {
        first = false;
        throw Object.assign(new Error("database: duplicate key"), { code: "23505" });
      }
      return realSave(row);
    };
    expect((await markAs("tok-ann")).body.guild.slug).toBe("angry-fuzzies-rcp44z");
  });

  it("keeps the mark when the first snapshot fails", async () => {
    const { store, markAs, deps } = setup();
    deps.gameinfo.getBattles.mockRejectedValue(new GameinfoError("down", 502));
    deps.gameinfo.getMembers.mockResolvedValueOnce([member("a", "Ann")]).mockRejectedValue(new GameinfoError("down", 502));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await markAs("tok-ann")).status).toBe(200);
    spy.mockRestore();
    expect(store.marks.get(`user-ann:eu:${GID}`)).toBe(GID);
  });

  it("does not count the gap before a new mark as play", async () => {
    const { call, store, deps, markAs } = setup();
    await markAs("tok-ann"); // 11-14: first snapshot
    await call("unmark", { method: "POST", token: "tok-ann", body: { region: "eu" } });
    // three days later, unmarked in between: Ann's fame is higher, but that is the gap
    deps.now = () => new Date(NOW.getTime() + 3 * 24 * 3600 * 1000);
    deps.gameinfo.getMembers.mockResolvedValue([member("a", "Ann", 5000), member("b", "Bo")]);
    await markAs("tok-bo");
    const ann = [...store.players.values()].find((p) => p.player_id === "a");
    expect(ann.last_gain_on).toBeNull();
    expect(store.guilds.get(GID).tracked_since).toBe("2026-11-17");
  });

  it("the daily run takes over when a guild was never synced", async () => {
    const { call, store, deps, markAs } = setup();
    deps.gameinfo.getMembers.mockResolvedValueOnce([member("a", "Ann")]).mockRejectedValueOnce(new GameinfoError("down", 502));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await markAs("tok-ann");
    spy.mockRestore();
    deps.gameinfo.getMembers.mockResolvedValue([member("a", "Ann")]);
    deps.now = () => new Date(NOW.getTime() + DAY_MS / 2);
    expect(await call("sync", { authorization: "Bearer cron-123" })).toMatchObject({ body: { synced: 1 } });
    expect(store.snapshots.size).toBe(1);
  });
});
