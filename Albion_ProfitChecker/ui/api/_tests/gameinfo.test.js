import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameinfoError, clearGameinfoMemory, getMembers, getTopGuilds, parseBattles, parseEvents, parseGuild, parseMembers, parseSearch, searchGuilds } from "../_lib/gameinfo.js";

const GID = "RCp44ZeoSKKMAqC6HzLqLA";
const rawMember = {
  Id: "p1",
  Name: "Ann",
  KillFame: 500,
  DeathFame: 70,
  LifetimeStatistics: {
    PvE: { Total: 1000, Avalon: 600, Mists: 400 },
    Gathering: { All: { Total: 30 }, Ore: { Total: 30 } },
    Crafting: { Total: 9 },
    FishingFame: 4,
    FarmingFame: 2,
    Timestamp: "2026-11-13T00:38:05Z"
  }
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

  it("reads members with every kind of lifetime fame and the stats time", () => {
    const zones = { royal: 0, outlands: 0, avalon: 0, hellgate: 0, corrupted: 0, mists: 0 };
    const resources = { fiber: 0, hide: 0, ore: 0, rock: 0, wood: 0 };
    expect(parseMembers([rawMember, { Id: "p2", Name: "Bo", LifetimeStatistics: { Timestamp: "not a date" } }])).toEqual([
      { id: "p1", name: "Ann", pve: 1000, killFame: 500, deathFame: 70, gathering: 30, crafting: 9, fishing: 4, farming: 2, crystal: 0, statsAt: "2026-11-13T00:38:05Z", pveZones: { ...zones, avalon: 600, mists: 400 }, resources: { ...resources, ore: 30 } },
      { id: "p2", name: "Bo", pve: 0, killFame: 0, deathFame: 0, gathering: 0, crafting: 0, fishing: 0, farming: 0, crystal: 0, statsAt: null, pveZones: zones, resources }
    ]);
  });

  it("cuts a killboard event down to names, guilds, gear, the victim's bag and who helped", () => {
    const fighter = (name, guild) => ({
      Id: `${name}-id`,
      Name: name,
      GuildId: guild ? `${guild}-id` : "",
      GuildName: guild ?? "",
      AllianceName: "",
      AverageItemPower: 1254.7,
      Equipment: { MainHand: { Type: "T6_2H_BOW@2", Quality: 4, Count: 1, ActiveSpells: [] }, OffHand: null, Potion: { Type: "T6_POTION_HEAL", Quality: 0, Count: 5 } },
      Inventory: [null, { Type: "T4_RUNE", Count: 112, Quality: 0 }]
    });
    const raw = [
      {
        EventId: 7,
        TimeStamp: "2026-11-14T10:00:00Z",
        TotalVictimKillFame: 999,
        numberOfParticipants: 3,
        groupMemberCount: 2,
        KillArea: "OPEN_WORLD",
        BattleId: 5,
        Killer: fighter("Ann", "Fuzz"),
        Victim: fighter("Bo", null),
        Participants: [
          { Name: "Cy", GuildName: "Fuzz", AverageItemPower: 1100.4, DamageDone: 10.2, SupportHealingDone: 900 },
          { Name: "Ann", GuildName: "Fuzz", AverageItemPower: 1254.7, DamageDone: 2983.6, SupportHealingDone: 0 }
        ]
      },
      { EventId: 8 }
    ];
    const gear = { MainHand: { type: "T6_2H_BOW@2", quality: 4, count: 1 }, Potion: { type: "T6_POTION_HEAL", quality: 1, count: 5 } };
    expect(parseEvents(raw)).toEqual([
      {
        id: 7,
        time: "2026-11-14T10:00:00Z",
        fame: 999,
        participants: 3,
        groupSize: 2,
        area: "OPEN_WORLD",
        battleId: 5,
        killer: { id: "Ann-id", name: "Ann", guildId: "Fuzz-id", guildName: "Fuzz", allianceName: null, itemPower: 1255, gear },
        victim: { id: "Bo-id", name: "Bo", guildId: null, guildName: null, allianceName: null, itemPower: 1255, gear, inventory: [{ type: "T4_RUNE", quality: 1, count: 112 }] },
        helpers: [
          { name: "Ann", guildName: "Fuzz", itemPower: 1255, damage: 2984, heal: 0 },
          { name: "Cy", guildName: "Fuzz", itemPower: 1100, damage: 10, heal: 900 }
        ],
        otherHelpers: null
      }
    ]);
  });

  it("keeps only this guild's players in a fight, and names the biggest enemy guild", () => {
    const raw = [
      {
        id: 7,
        startTime: "2026-11-13T20:41:00Z",
        totalKills: 4,
        totalFame: 900,
        players: {
          a: { id: "a", name: "Ann", guildId: GID, allianceId: "al1", kills: 2, deaths: 0, killFame: 300 },
          // our alliance: not an enemy, however many
          y: { id: "y", name: "Yan", guildId: "ally", guildName: "Friends", allianceId: "al1", kills: 0, deaths: 0, killFame: 0 },
          w: { id: "w", name: "Wes", guildId: "ally", guildName: "Friends", allianceId: "al1", kills: 0, deaths: 0, killFame: 0 },
          z: { id: "z", name: "Zed", guildId: "other", guildName: "Foes", allianceId: "al2", allianceName: "FOE", kills: 1, deaths: 2, killFame: 10 }
        }
      }
    ];
    expect(parseBattles(raw, GID)).toEqual([{ id: 7, startTime: "2026-11-13T20:41:00Z", players: 4, kills: 4, fame: 900, enemy: "[FOE] Foes", ours: [{ id: "a", name: "Ann", kills: 2, deaths: 0, killFame: 300 }] }]);
  });
});

describe("requests", () => {
  beforeEach(() => clearGameinfoMemory());
  afterEach(() => vi.unstubAllGlobals());

  it("asks once more past Albion's cache when its page is stale, and keeps the old one if that fails", async () => {
    const stale = () => new Response(JSON.stringify([rawMember]), { status: 200, headers: { age: "505695" } });
    const fetchMock = vi.fn(async (url) => (String(url).includes("_=") ? new Response(JSON.stringify([]), { status: 200 }) : stale()));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getMembers("eu", GID)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/members\?_=\d+$/);

    clearGameinfoMemory();
    const fails = vi.fn(async (url) => (String(url).includes("_=") ? new Response("down", { status: 500 }) : stale()));
    vi.stubGlobal("fetch", fails);
    expect(await getMembers("eu", GID)).toHaveLength(1);
  });

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

  it("does not ask again when the killboard blocks this server, and pauses that host", async () => {
    const fetchMock = vi.fn(async () => new Response("blocked", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getMembers("us", GID)).rejects.toMatchObject({ status: 502, message: expect.stringContaining("403") });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // the paused host is not asked at all; the other server still is
    await expect(searchGuilds("us", "angry")).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ guilds: [] }), { status: 200 }));
    expect(await searchGuilds("eu", "angry")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks one host at most 4 times at once, the rest waits its turn", async () => {
    let running = 0;
    let most = 0;
    const fetchMock = vi.fn(async () => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return new Response(JSON.stringify({ guilds: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const all = await Promise.all(Array.from({ length: 10 }, (_, i) => searchGuilds("eu", `guild ${i}`)));
    expect(all).toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(most).toBe(4);
  });

  it("reads the period's two pages of biggest fights for the top guilds, once", async () => {
    const page = [{ guilds: { [GID]: { id: GID, name: "Angry fuzzies", alliance: "", killFame: 5, kills: 1, deaths: 0 } } }];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getTopGuilds("eu", "week")).toMatchObject([{ id: GID, killFame: 10, fights: 2 }]);
    await getTopGuilds("eu", "week");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://gameinfo-ams.albiononline.com/api/gameinfo/battles?limit=51&offset=0&sort=totalfame&range=week",
      "https://gameinfo-ams.albiononline.com/api/gameinfo/battles?limit=51&offset=51&sort=totalfame&range=week"
    ]);
  });

  it("answers an unknown guild with 404 right away", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getMembers("eu", GID)).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
