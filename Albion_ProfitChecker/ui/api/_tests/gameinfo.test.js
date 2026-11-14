import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameinfoError, clearGameinfoMemory, getMembers, parseBattles, parseGuild, parseMembers, parseSearch, searchGuilds } from "../_lib/gameinfo.js";

const GID = "RCp44ZeoSKKMAqC6HzLqLA";
const rawMember = {
  Id: "p1",
  Name: "Ann",
  KillFame: 500,
  DeathFame: 70,
  LifetimeStatistics: { PvE: { Total: 1000 }, Gathering: { All: { Total: 30 } }, Crafting: { Total: 9 }, Timestamp: "2026-11-13T00:38:05Z" }
};

describe("parsers", () => {
  it("reads search results and drops broken rows", () => {
    expect(parseSearch({ guilds: [{ Id: GID, Name: "Angry fuzzies", AllianceName: "", KillFame: null, DeathFame: 9 }, { Id: "x", Name: "bad id" }], players: [] })).toEqual([
      { id: GID, name: "Angry fuzzies", allianceName: null, killFame: 0, deathFame: 9 }
    ]);
    expect(parseSearch(null)).toEqual([]);
  });

  it("reads a guild and refuses an unexpected answer", () => {
    expect(parseGuild({ guild: { Id: GID, Name: "Angry fuzzies", AllianceTag: "BOSSS", Founded: "2025-03-25T14:19:56Z", killFame: 610, DeathFame: 811 } })).toEqual({
      id: GID,
      name: "Angry fuzzies",
      allianceTag: "BOSSS",
      foundedAt: "2025-03-25T14:19:56Z",
      killFame: 610,
      deathFame: 811
    });
    expect(() => parseGuild({})).toThrow(GameinfoError);
  });

  it("reads members with their lifetime fame and stats time", () => {
    expect(parseMembers([rawMember, { Id: "p2", Name: "Bo", LifetimeStatistics: { Timestamp: "not a date" } }])).toEqual([
      { id: "p1", name: "Ann", pve: 1000, killFame: 500, deathFame: 70, gathering: 30, crafting: 9, statsAt: "2026-11-13T00:38:05Z" },
      { id: "p2", name: "Bo", pve: 0, killFame: 0, deathFame: 0, gathering: 0, crafting: 0, statsAt: null }
    ]);
  });

  it("keeps only this guild's players in a fight", () => {
    const raw = [
      {
        id: 7,
        startTime: "2026-11-13T20:41:00Z",
        totalKills: 4,
        totalFame: 900,
        players: { a: { id: "a", name: "Ann", guildId: GID, kills: 2, deaths: 0, killFame: 300 }, z: { id: "z", name: "Zed", guildId: "other", kills: 1, deaths: 2, killFame: 10 } }
      }
    ];
    expect(parseBattles(raw, GID)).toEqual([{ id: 7, startTime: "2026-11-13T20:41:00Z", players: 2, kills: 4, fame: 900, ours: [{ id: "a", name: "Ann", kills: 2, deaths: 0, killFame: 300 }] }]);
  });
});

describe("requests", () => {
  beforeEach(() => clearGameinfoMemory());
  afterEach(() => vi.unstubAllGlobals());

  it("asks Albion once and remembers the answer", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([rawMember]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([getMembers("eu", GID), getMembers("eu", GID)]);
    await getMembers("eu", GID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://gameinfo-ams.albiononline.com/api/gameinfo/guilds/${GID}/members`);
  });

  it("asks again when told to, and keeps the newer answer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([rawMember]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getMembers("eu", GID)).toHaveLength(0);
    expect(await getMembers("eu", GID, { fresh: true })).toHaveLength(1);
    expect(await getMembers("eu", GID)).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tries again once after a server error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ guilds: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchGuilds("us", "angry fuzzies")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://gameinfo.albiononline.com/api/gameinfo/search?q=angry%20fuzzies");
  });

  it("gives up with a 502 error, and does not remember failures", async () => {
    const fetchMock = vi.fn(async () => new Response("down", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getMembers("eu", GID)).rejects.toMatchObject({ status: 502 });
    await expect(getMembers("eu", GID)).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("answers an unknown guild with 404 right away", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getMembers("eu", GID)).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
