import { describe, expect, it } from "vitest";
import { BANK_ROWS_MAX, GUILDS_MAX, bankRow, fightInfo, splitData } from "../_lib/guildPrivate.js";
import { createRateLimiter } from "../_lib/rateLimit.js";
import { GID, NOW, setup } from "./guild-kit.js";

const SPLIT = {
  from: 1763150000000,
  to: 1763153600000,
  total: 3_000_000,
  guildPct: 10,
  guildCut: 300_000,
  items: [{ name: "Expert's Crossbow", enchant: 1, quality: 2, amount: 3, unit: 1_000_000 }],
  players: [
    { name: "Ann", share: 100, silver: 1_350_000, paid: false },
    { name: "Bo", share: 100, silver: 1_350_000, paid: false }
  ]
};

describe("a player's own guild data", () => {
  it("needs a sign-in for every part of it", async () => {
    const { call } = setup();
    expect((await call("regear-paid", { query: { region: "eu", battle: "1" } })).body.error).toMatch(/Sign in to tick/);
    expect((await call("bank", { query: { guild: GID } })).body.error).toMatch(/chest log/);
    expect((await call("splits", { query: { guild: GID } })).body.error).toMatch(/loot splits/);
    expect((await call("split-save", { method: "POST", body: { guild: GID, name: "x", data: SPLIT } })).status).toBe(401);
  });

  it("keeps regear paid ticks per player and fight, private to that player", async () => {
    const { call } = setup();
    const pay = (token, event, paid = true) => call("regear-pay", { method: "POST", token, body: { region: "eu", battle: 7, event, paid } });
    expect((await pay("tok-ann", 21)).status).toBe(200);
    await pay("tok-ann", 22);
    await pay("tok-ann", 22, false);
    expect((await call("regear-paid", { token: "tok-ann", query: { region: "eu", battle: "7" } })).body).toEqual({ events: [21] });
    // another player who looks at the same fight sees none of them
    expect((await call("regear-paid", { token: "tok-bo", query: { region: "eu", battle: "7" } })).body).toEqual({ events: [] });
    expect((await call("regear-paid", { token: "tok-ann", query: { region: "us", battle: "7" } })).body).toEqual({ events: [] });
    expect((await pay("tok-ann", "1; drop")).status).toBe(400);
  });

  it("keeps the fights a player marked to regear, per guild and private to that player", async () => {
    const { call } = setup();
    const fight = { startTime: "2026-11-14T20:00:00Z", players: 120, ours: 30, kills: 12, deaths: 9, enemy: "[ALLY] Foes" };
    const mark = (token, battle, marked = true) => call("regear-mark", { method: "POST", token, body: { region: "eu", guild: GID, battle, fight, marked } });
    expect((await mark("tok-ann", 7)).body).toEqual({ marked: true });
    await mark("tok-ann", 8);
    await mark("tok-ann", 8, false);
    const list = await call("regear-fights", { token: "tok-ann", query: { region: "eu", guild: GID } });
    expect(list.body.fights).toEqual([{ id: 7, markedAt: NOW.toISOString(), ...fight, startTime: "2026-11-14T20:00:00.000Z" }]);
    expect((await call("regear-fights", { token: "tok-bo", query: { region: "eu", guild: GID } })).body.fights).toEqual([]);
    expect((await call("regear-fights", { query: { region: "eu", guild: GID } })).body.error).toMatch(/mark fights/);
    expect((await call("regear-mark", { method: "POST", token: "tok-ann", body: { region: "eu", guild: GID, battle: 9, fight: {}, marked: true } })).status).toBe(400);
  });

  it("stores the chest log per player and guild, and drops rows that are not log rows", async () => {
    const { call } = setup();
    const rows = [[1763150000000, "Ann", "Expert's Crossbow", 1, 2, 3], [null, "Bo", "Adept's Bag", 0, 1, -1], ["x", "", "y", 9, 9, 0], "nope"];
    expect((await call("bank-save", { method: "POST", token: "tok-ann", body: { guild: GID, rows } })).body).toEqual({ count: 2 });
    expect((await call("bank", { token: "tok-ann", query: { guild: GID } })).body.rows).toEqual(rows.slice(0, 2));
    expect((await call("bank", { token: "tok-bo", query: { guild: GID } })).body.rows).toEqual([]);
    // no rows: the log is gone
    await call("bank-save", { method: "POST", token: "tok-ann", body: { guild: GID, rows: [] } });
    expect((await call("bank", { token: "tok-ann", query: { guild: GID } })).body.rows).toEqual([]);
  });

  it("keeps the newest rows of a log that is too long", async () => {
    const { call, store } = setup();
    const rows = Array.from({ length: BANK_ROWS_MAX + 5 }, (_, i) => [1763150000000 + i, "Ann", "Rune", 0, 1, 1]);
    expect((await call("bank-save", { method: "POST", token: "tok-ann", body: { guild: GID, rows } })).body.count).toBe(BANK_ROWS_MAX);
    expect(store.bankLogs.get(`user-ann:${GID}`)[0][0]).toBe(1763150000005);
  });

  it("saves loot splits, ticks players paid, and lets nobody else change or remove them", async () => {
    const { call } = setup();
    const saved = await call("split-save", { method: "POST", token: "tok-ann", body: { guild: GID, name: " Saturday ZvZ ", data: SPLIT } });
    expect(saved.body.split).toMatchObject({ name: "Saturday ZvZ", createdAt: NOW.toISOString(), data: { total: 3_000_000, players: [{ name: "Ann" }, { name: "Bo" }] } });
    const { id } = saved.body.split;
    const paid = { ...SPLIT, players: SPLIT.players.map((p) => ({ ...p, paid: p.name === "Bo" })) };
    expect((await call("split-save", { method: "POST", token: "tok-ann", body: { guild: GID, id, name: "Saturday ZvZ", data: paid } })).body.split.data.players[1].paid).toBe(true);
    const list = await call("splits", { token: "tok-ann", query: { guild: GID } });
    expect(list.body.splits).toHaveLength(1);
    expect(list.body.splits[0].data.players.map((p) => p.paid)).toEqual([false, true]);

    expect((await call("splits", { token: "tok-bo", query: { guild: GID } })).body.splits).toEqual([]);
    expect((await call("split-save", { method: "POST", token: "tok-bo", body: { guild: GID, id, name: "mine now", data: SPLIT } })).status).toBe(404);
    expect((await call("split-remove", { method: "POST", token: "tok-bo", body: { id } })).body).toEqual({ removed: false });
    expect((await call("split-remove", { method: "POST", token: "tok-ann", body: { id } })).body).toEqual({ removed: true });
  });

  it("refuses a split without a name or players", async () => {
    const { call } = setup();
    expect((await call("split-save", { method: "POST", token: "tok-ann", body: { guild: GID, name: "", data: SPLIT } })).status).toBe(400);
    expect((await call("split-save", { method: "POST", token: "tok-ann", body: { guild: GID, name: "x", data: { ...SPLIT, players: [] } } })).status).toBe(400);
    expect((await call("split-save", { method: "POST", token: "tok-ann", body: { guild: "nope", name: "x", data: SPLIT } })).status).toBe(400);
  });

  it("is not held back by the killboard's request limit", async () => {
    const { call, deps } = setup();
    deps.limiter = { take: () => false };
    expect((await call("regear-pay", { method: "POST", token: "tok-ann", body: { region: "eu", battle: 7, event: 21, paid: true } })).status).toBe(200);
    expect((await call("guild", { query: { region: "eu", id: GID } })).status).toBe(429);
  });
});

describe("what one player can store", () => {
  // guild ids of the killboard's shape, all made up
  const guildIds = Array.from({ length: GUILDS_MAX + 1 }, (_, i) => `guildidguildid${String(i).padStart(8, "0")}`);

  it("keeps chest logs and loot splits of at most GUILDS_MAX guilds", async () => {
    const { call } = setup();
    const row = [[1763150000000, "Ann", "Rune", 0, 1, 1]];
    for (const guild of guildIds.slice(0, GUILDS_MAX)) expect((await call("bank-save", { method: "POST", token: "tok-ann", body: { guild, rows: row } })).status).toBe(200);
    expect((await call("bank-save", { method: "POST", token: "tok-ann", body: { guild: guildIds[GUILDS_MAX], rows: row } })).status).toBe(409);
    // one of the kept guilds still takes a new log, and another player is not held back
    expect((await call("bank-save", { method: "POST", token: "tok-ann", body: { guild: guildIds[0], rows: row } })).status).toBe(200);
    expect((await call("bank-save", { method: "POST", token: "tok-bo", body: { guild: guildIds[GUILDS_MAX], rows: row } })).status).toBe(200);

    for (const guild of guildIds.slice(0, GUILDS_MAX)) await call("split-save", { method: "POST", token: "tok-ann", body: { guild, name: "x", data: SPLIT } });
    expect((await call("split-save", { method: "POST", token: "tok-ann", body: { guild: guildIds[GUILDS_MAX], name: "x", data: SPLIT } })).status).toBe(409);
  });

  it("limits a player's changes per minute, and webhook tries more", async () => {
    const { call, deps, markAs } = setup();
    deps.writeLimiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const pay = (event) => call("regear-pay", { method: "POST", token: "tok-ann", body: { region: "eu", battle: 7, event, paid: true } });
    expect([(await pay(1)).status, (await pay(2)).status, (await pay(3)).status, (await pay(4)).status]).toEqual([200, 200, 200, 429]);
    // per player: the next one is still free
    expect((await call("regear-pay", { method: "POST", token: "tok-bo", body: { region: "eu", battle: 7, event: 1, paid: true } })).status).toBe(200);

    deps.writeLimiter = null;
    deps.hookLimiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    await markAs("tok-bo");
    const hook = () => call("hook-save", { method: "POST", token: "tok-bo", body: { region: "eu", url: "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABCDEFG-123" } });
    expect((await hook()).status).toBe(200);
    expect((await hook()).status).toBe(429);
  });
});

describe("checking what the browser sends", () => {
  it("reads chest log rows", () => {
    expect(bankRow([1, " Ann ", "Rune", 0, 1, 5])).toEqual([1, "Ann", "Rune", 0, 1, 5]);
    expect(bankRow([1, "Ann", "Rune", 0, 1, 0])).toBeNull();
    expect(bankRow([1, "Ann", "Rune", 5, 1, 1])).toBeNull();
    expect(bankRow({})).toBeNull();
  });

  it("keeps a marked fight's numbers and nothing else", () => {
    expect(fightInfo({ startTime: "2026-11-14T20:00:00Z", players: -1, kills: 3, extra: "x", enemy: "  " })).toEqual({ startTime: "2026-11-14T20:00:00.000Z", players: 0, ours: 0, kills: 3, deaths: 0, enemy: null });
    expect(fightInfo({ startTime: "soon" })).toBeNull();
  });

  it("keeps the runs a split is made of", () => {
    const data = splitData({ ...SPLIT, runs: [{ from: 1, to: 5 }, { from: 9, to: 3 }, "x", { from: 10, to: 20 }] });
    expect(data.runs).toEqual([{ from: 1, to: 5 }, { from: 10, to: 20 }]);
    expect(splitData(SPLIT).runs).toEqual([]);
  });

  it("keeps one row per player name, and the numbers in range", () => {
    const data = splitData({ ...SPLIT, guildPct: 400, players: [...SPLIT.players, { name: "ann", silver: -5 }, { name: "Cy", silver: 1e20, paid: "yes" }] });
    expect(data.guildPct).toBe(100);
    expect(data.players.map((p) => [p.name, p.silver, p.paid])).toEqual([
      ["Ann", 1_350_000, false],
      ["Bo", 1_350_000, false],
      ["Cy", 1e13, false]
    ]);
  });
});

describe("Discord report after a late mark", () => {
  it("goes to every guild synced today, also with more marked guilds than one run syncs", async () => {
    const { call, deps, store } = setup();
    deps.now = () => new Date("2026-11-15T03:30:00Z");
    // 45 marked guilds synced today, 5 more far behind: the 45 get their report, the 5 are synced first
    for (let i = 0; i < 50; i++) {
      const id = `guildidguildid${String(i).padStart(8, "0")}`;
      store.guilds.set(id, { id, region: "eu", slug: `g${i}`, name: `G${i}`, tracked_since: "2026-11-01", last_synced_at: i < 45 ? "2026-11-15T01:00:00.000Z" : "2026-11-10T01:00:00.000Z" });
      store.marks.set(`user-${i}:eu`, id);
    }
    const reported = [];
    deps.discord = { check: async () => "hook", post: async () => "ok" };
    store.webhooksOfGuild = async (id) => (reported.push(id), []);
    await call("sync", { authorization: "Bearer cron-123" });
    expect(new Set(reported.filter((id) => Number(id.slice(-8)) < 45)).size).toBe(45);
  });

  const HOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABCDEFG-123";

  it("goes out the next morning when the guild was marked the evening before", async () => {
    const { call, markAs, deps, store } = setup();
    deps.now = () => new Date("2026-11-14T22:00:00Z");
    await markAs("tok-ann");
    await call("hook-save", { method: "POST", token: "tok-ann", body: { region: "eu", url: HOOK } });
    deps.discord.post.mockClear();
    deps.now = () => new Date("2026-11-15T03:30:00Z");
    expect((await call("sync", { authorization: "Bearer cron-123" })).body).toMatchObject({ synced: 1, reports: 1 });
    expect(store.webhooks.get("user-ann:eu").last_sent_on).toBe("2026-11-15");
  });

  it("goes out when a mark took today's snapshot before the daily run", async () => {
    const { call, markAs, deps } = setup();
    deps.now = () => new Date("2026-11-15T01:00:00Z");
    await markAs("tok-ann");
    await call("hook-save", { method: "POST", token: "tok-ann", body: { region: "eu", url: HOOK } });
    deps.discord.post.mockClear();
    deps.now = () => new Date("2026-11-15T03:30:00Z");
    expect((await call("sync", { authorization: "Bearer cron-123" })).body).toMatchObject({ synced: 0, reports: 1 });
    expect(deps.discord.post).toHaveBeenCalledTimes(1);
  });
});
