import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameinfoError, clearGameinfoMemory, fighterStatsOf, getBattleReport, parseBattle } from "../_lib/gameinfo.js";
import { GID, NOW, setup } from "./guild-kit.js";

const rawFighter = (id, name, damage = 0, heal = 0) => ({
  Id: id,
  Name: name,
  AverageItemPower: 1250.6,
  Equipment: { MainHand: { Type: "T8_2H_BOW", Quality: 3 } },
  DamageDone: damage,
  SupportHealingDone: heal
});
const rawKill = (id, killer, victim, participants) => ({ EventId: id, TimeStamp: "2026-11-14T10:00:00Z", Killer: killer, Victim: victim, Participants: participants, TotalVictimKillFame: 100 });

describe("battle parsing", () => {
  it("reads a fight's totals, players, guilds and alliances, and refuses an unexpected answer", () => {
    const battle = parseBattle({
      id: 77,
      startTime: "2026-11-14T10:00:00Z",
      endTime: "2026-11-14T10:20:00Z",
      totalKills: 3,
      totalFame: 900,
      players: { a: { id: "a", name: "Ann", guildId: GID, guildName: "Angry fuzzies", allianceId: "AB", allianceName: "BOSSS", kills: 2, deaths: 1, killFame: 600 }, bad: { id: "" } },
      guilds: { g: { id: GID, name: "Angry fuzzies", alliance: "BOSSS", kills: 2, deaths: 1, killFame: 600 } },
      alliances: { al: { id: "AB", name: "BOSSS", kills: 2, deaths: 1, killFame: 600 } }
    });
    expect(battle).toEqual({
      id: 77,
      startTime: "2026-11-14T10:00:00Z",
      endTime: "2026-11-14T10:20:00Z",
      kills: 3,
      fame: 900,
      players: [{ id: "a", name: "Ann", guildId: GID, guildName: "Angry fuzzies", allianceId: "AB", allianceName: "BOSSS", kills: 2, deaths: 1, killFame: 600 }],
      guilds: [{ id: GID, name: "Angry fuzzies", allianceName: "BOSSS", kills: 2, deaths: 1, killFame: 600 }],
      alliances: [{ id: "AB", name: "BOSSS", kills: 2, deaths: 1, killFame: 600 }]
    });
    expect(() => parseBattle({})).toThrow(GameinfoError);
  });

  it("sums each fighter's damage, counts assists and heal assists, with the build they were seen in", () => {
    const stats = fighterStatsOf([
      rawKill(1, rawFighter("a", "Ann"), rawFighter("v", "Vic"), [rawFighter("a", "Ann", 500), rawFighter("h", "Hal", 0, 300), rawFighter("b", "Bo", 200)]),
      rawKill(2, rawFighter("b", "Bo"), rawFighter("w", "Wes"), [rawFighter("a", "Ann", 250.4), rawFighter("h", "Hal", 0, 9e6)])
    ]);
    // the killer's own hit is no assist
    expect(stats.a).toEqual({ damage: 750, assists: 1, healAssists: 0, itemPower: 1251, weapon: { type: "T8_2H_BOW", quality: 3 } });
    expect(stats.h).toMatchObject({ damage: 0, assists: 2, healAssists: 2 });
    expect(stats.v).toMatchObject({ damage: 0, assists: 0, healAssists: 0 });
    expect(fighterStatsOf(null)).toEqual({});
  });
});

describe("battle report loading", () => {
  beforeEach(() => clearGameinfoMemory());
  afterEach(() => vi.unstubAllGlobals());

  it("reads every page of kills (51 each), a few at a time, and says when one is missing", async () => {
    const battle = { id: 5, startTime: "2026-11-14T10:00:00Z", endTime: "2026-11-14T10:20:00Z", totalKills: 120, totalFame: 1, players: {}, guilds: {}, alliances: {} };
    const fetchMock = vi.fn(async (url) => {
      const u = String(url);
      if (u.endsWith("/battles/5")) return new Response(JSON.stringify(battle), { status: 200 });
      const offset = Number(new URL(u).searchParams.get("offset"));
      if (offset === 51) return new Response("down", { status: 502 });
      return new Response(JSON.stringify([rawKill(offset + 1, rawFighter("a", "Ann"), rawFighter("v", "Vic"), [rawFighter("a", "Ann", 10)])]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const report = await getBattleReport("eu", "5");
    vi.useRealTimers();
    expect(report.complete).toBe(false);
    expect(report.events.map((e) => e.id)).toEqual([1, 103]);
    expect(report.stats.a.damage).toBe(20);
    // a kill on two pages (a running fight's pages shift) counts once
    clearGameinfoMemory();
    fetchMock.mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith("/battles/5")) return new Response(JSON.stringify({ ...battle, totalKills: 60 }), { status: 200 });
      return new Response(JSON.stringify([rawKill(9, rawFighter("a", "Ann"), rawFighter("v", "Vic"), [rawFighter("a", "Ann", 10)])]), { status: 200 });
    });
    const again = await getBattleReport("eu", "5");
    expect(again.events).toHaveLength(1);
    expect(again.stats.a.damage).toBe(10);
    expect(report.stats.a.assists).toBe(0);
    const offsets = fetchMock.mock.calls.map(([url]) => String(url)).filter((u) => u.includes("/events/battle/5")).map((u) => new URL(u).searchParams.get("offset"));
    expect([...new Set(offsets)].sort()).toEqual(["0", "102", "51"]);
  });
});

describe("a fight whose kills are not ready yet", () => {
  beforeEach(() => clearGameinfoMemory());
  afterEach(() => vi.unstubAllGlobals());

  it("is not complete when Albion lists kills but sends none", async () => {
    const battle = { id: 6, startTime: "2026-11-14T10:00:00Z", endTime: "2026-11-14T10:01:00Z", totalKills: 8, totalFame: 1, players: {}, guilds: {}, alliances: {} };
    vi.stubGlobal("fetch", vi.fn(async (url) => new Response(JSON.stringify(String(url).endsWith("/battles/6") ? battle : []), { status: 200 })));
    expect((await getBattleReport("eu", "6")).complete).toBe(false);
  });
});

describe("battle report answer", () => {
  it("answers a fight with players per guild and alliance, damage, and every kill priced", async () => {
    const { call, deps } = setup();
    deps.values = vi.fn(async () => ({ table: new Map(), complete: true }));
    const res = await call("battle", { query: { region: "eu", id: "123" } });
    expect(res.status).toBe(200);
    expect(res.body.battle).toMatchObject({ id: 123, players: 3, kills: 2 });
    expect(res.body.guilds.map((g) => [g.name, g.players])).toEqual([["Angry fuzzies", 2], ["Others", 1]]);
    expect(res.body.alliances[0]).toMatchObject({ name: "BOSSS", players: 2 });
    expect(res.body.players[0]).toMatchObject({ name: "Killer22", damage: 900, assists: 3, healAssists: 1, itemPower: 1300, weapon: { type: "T6_2H_BOW" } });
    expect(res.body.players.find((p) => p.name === "Victim21")).toMatchObject({ damage: 0, assists: 0, weapon: null });
    expect(res.body.kills.map((k) => k.id)).toEqual([22, 21]);
    expect(res.body.kills[0]).toHaveProperty("value");
    // the fight ended long before NOW: kept for hours
    expect(res.maxAge).toBe(6 * 3600);
  });

  it("keeps a running or incomplete fight only briefly or not at all", async () => {
    const { call, deps } = setup();
    deps.now = () => new Date("2026-11-14T10:25:00Z");
    expect((await call("battle", { query: { region: "eu", id: "123" } })).maxAge).toBe(120);
    const report = await deps.gameinfo.getBattleReport("eu", "123");
    deps.gameinfo.getBattleReport.mockResolvedValueOnce({ ...report, complete: false });
    expect((await call("battle", { query: { region: "eu", id: "123" } })).maxAge).toBe(0);
  });

  it("refuses a fight id that is not a number", async () => {
    const { call, deps } = setup();
    expect((await call("battle", { query: { region: "eu", id: "12a" } })).status).toBe(400);
    expect((await call("battle", { query: { region: "eu", id: "0" } })).status).toBe(400);
    expect(deps.gameinfo.getBattleReport).not.toHaveBeenCalled();
  });

  it("answers 502 when Albion does not answer", async () => {
    const { call, deps } = setup();
    deps.gameinfo.getBattleReport.mockRejectedValueOnce(new GameinfoError("down", 502));
    expect(await call("battle", { query: { region: "eu", id: "123" } })).toMatchObject({ status: 502, maxAge: 0 });
  });
});

describe("fights for attendance", () => {
  const fight = (id, startTime, ours) => ({ id, startTime, players: 30, kills: 5, fame: 900, ours });
  // 50 fights an hour apart from NOW back, page by page
  const hourly = (offset) => Array.from({ length: 50 }, (_, i) => fight(offset + i + 1, new Date(NOW.getTime() - (offset + i) * 3600_000).toISOString(), [{ id: "a", name: "Ann", kills: 0, deaths: 0, killFame: 0 }]));

  it("reads pages of listed fights until 7 days are covered, keeps the ones we were in, once each", async () => {
    const { call, deps } = setup();
    deps.gameinfo.getBattles.mockImplementation(async (region, id, offset = 0) => (offset < 250 ? hourly(offset) : []));
    const res = await call("fights", { query: { region: "eu", id: GID } });
    expect(res).toMatchObject({ status: 200, maxAge: 600, body: { complete: true, days: 7 } });
    // 7 days = 168 hours: fights 1..169 (the 169th is exactly 7 days old)
    expect(res.body.fights).toHaveLength(169);
    expect(res.body.fights[0].id).toBe(1);
    // 4 pages cover 200 hours: no more asked
    expect(deps.gameinfo.getBattles.mock.calls.map((c) => c[2])).toEqual([0, 50, 100, 150]);
  });

  it("stops at the end of a short list and drops fights without us", async () => {
    const { call, deps } = setup();
    deps.gameinfo.getBattles.mockImplementation(async (region, id, offset = 0) =>
      offset === 0 ? [fight(1, "2026-11-14T10:00:00Z", [{ id: "a" }]), fight(2, "2026-11-14T09:00:00Z", []), fight(1, "2026-11-14T10:00:00Z", [{ id: "a" }])] : []
    );
    const res = await call("fights", { query: { region: "eu", id: GID } });
    expect(res.body).toMatchObject({ complete: true });
    expect(res.body.fights.map((f) => f.id)).toEqual([1]);
  });

  it("says when older fights are missing, and fails when the newest do not load", async () => {
    const { call, deps } = setup();
    deps.gameinfo.getBattles.mockImplementation(async (region, id, offset = 0) => {
      if (offset === 100) throw new GameinfoError("down", 502);
      return hourly(offset).slice(0, offset === 150 ? 10 : 50);
    });
    expect(await call("fights", { query: { region: "eu", id: GID } })).toMatchObject({ status: 200, maxAge: 0, body: { complete: false } });
    deps.gameinfo.getBattles.mockRejectedValue(new GameinfoError("down", 502));
    expect((await call("fights", { query: { region: "eu", id: GID } })).status).toBe(502);
  });
});

const HOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABCDEFG-123";

describe("Discord report webhook", () => {
  it("needs a signed-in player who marked a guild, and a Discord webhook link", async () => {
    const { call, markAs, deps } = setup();
    expect((await call("hook-save", { method: "POST", body: { region: "eu", url: HOOK } })).status).toBe(401);
    expect((await call("hook-save", { method: "POST", token: "tok-ann", body: { region: "eu", url: HOOK } })).status).toBe(409);
    await markAs("tok-ann");
    // the Europe mark is no mark on America
    expect((await call("hook-save", { method: "POST", token: "tok-ann", body: { region: "us", url: HOOK } })).status).toBe(409);
    expect((await call("hook-save", { method: "POST", token: "tok-ann", body: { url: HOOK } })).status).toBe(400);
    for (const url of ["https://evil.example/api/webhooks/1/2", "http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz", HOOK + "/../x", ""]) {
      expect((await call("hook-save", { method: "POST", token: "tok-ann", body: { region: "eu", url } })).status).toBe(400);
    }
    expect(deps.discord.check).not.toHaveBeenCalled();
  });

  it("checks the webhook, greets it, and gives back only its name, never the link", async () => {
    const { call, markAs, deps, store } = setup();
    await markAs("tok-ann");
    const saved = await call("hook-save", { method: "POST", token: "tok-ann", body: { region: "eu", url: ` ${HOOK} ` } });
    expect(saved).toMatchObject({ status: 200, body: { hook: { name: "Guild news" } } });
    expect(JSON.stringify(saved.body)).not.toContain("webhooks");
    expect(deps.discord.post.mock.calls.find(([url]) => url === HOOK)[1].embeds[0].description).toContain("**Angry fuzzies**");
    expect(store.webhooks.get("user-ann:eu")).toMatchObject({ url: HOOK, name: "Guild news" });
    const read = await call("hook", { token: "tok-ann", query: { region: "eu" } });
    expect(read.body).toEqual({ hook: { name: "Guild news", lastSentOn: null } });
    expect((await call("hook", { token: "tok-ann", query: { region: "us" } })).body).toEqual({ hook: null });
    expect(await call("hook-remove", { method: "POST", token: "tok-ann", body: { region: "eu" } })).toMatchObject({ status: 200, body: { removed: true } });
    expect((await call("hook", { token: "tok-ann", query: { region: "eu" } })).body).toEqual({ hook: null });
  });

  it("refuses a webhook Discord does not know or that does not take the first message", async () => {
    const { call, markAs, deps, store } = setup();
    await markAs("tok-ann");
    deps.discord.check.mockResolvedValueOnce(null);
    expect((await call("hook-save", { method: "POST", token: "tok-ann", body: { region: "eu", url: HOOK } })).status).toBe(400);
    deps.discord.post.mockResolvedValueOnce("failed");
    expect((await call("hook-save", { method: "POST", token: "tok-ann", body: { region: "eu", url: HOOK } })).status).toBe(502);
    expect(store.webhooks.size).toBe(0);
  });

  it("posts each marked guild's report once a day after the sync, and drops a webhook Discord deleted", async () => {
    const { call, markAs, deps, store } = setup();
    await markAs("tok-ann");
    await markAs("tok-bo");
    await call("hook-save", { method: "POST", token: "tok-ann", body: { region: "eu", url: HOOK } });
    await call("hook-save", { method: "POST", token: "tok-bo", body: { region: "eu", url: HOOK.replace("123456789012345678", "999999999999999999") } });
    deps.discord.post.mockClear();
    deps.discord.post.mockImplementation(async (url) => (url.includes("999999999999999999") ? "gone" : "ok"));
    // the next day: the guild is due again
    deps.now = () => new Date(NOW.getTime() + 24 * 3600 * 1000);
    const sync = await call("sync", { authorization: "Bearer cron-123" });
    expect(sync.body).toMatchObject({ synced: 1, reports: 1 });
    const [, report] = deps.discord.post.mock.calls.find(([url]) => url === HOOK);
    expect(report.embeds[0]).toMatchObject({ title: "🛡️ [BOSSS] Angry fuzzies", url: "https://blackmarketreader.com/guild/eu/angry-fuzzies/activity" });
    expect(store.webhooks.get("user-ann:eu").last_sent_on).toBe("2026-11-15");
    expect(store.webhooks.has("user-bo:eu")).toBe(false);
    // the same day again: nothing more
    deps.discord.post.mockClear();
    await store.saveGuild({ ...store.guilds.get(GID), last_synced_at: null });
    await call("sync", { authorization: "Bearer cron-123" });
    expect(deps.discord.post).not.toHaveBeenCalled();
  });
});
