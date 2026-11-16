import { describe, expect, it } from "vitest";
import { BANK_ROWS_MAX, bankRow, splitData } from "../_lib/guildPrivate.js";
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

describe("checking what the browser sends", () => {
  it("reads chest log rows", () => {
    expect(bankRow([1, " Ann ", "Rune", 0, 1, 5])).toEqual([1, "Ann", "Rune", 0, 1, 5]);
    expect(bankRow([1, "Ann", "Rune", 0, 1, 0])).toBeNull();
    expect(bankRow([1, "Ann", "Rune", 5, 1, 1])).toBeNull();
    expect(bankRow({})).toBeNull();
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
  const HOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABCDEFG-123";

  it("goes out the next morning when the guild was marked the evening before", async () => {
    const { call, markAs, deps, store } = setup();
    deps.now = () => new Date("2026-11-14T22:00:00Z");
    await markAs("tok-ann");
    await call("hook-save", { method: "POST", token: "tok-ann", body: { url: HOOK } });
    deps.discord.post.mockClear();
    deps.now = () => new Date("2026-11-15T03:30:00Z");
    expect((await call("sync", { authorization: "Bearer cron-123" })).body).toMatchObject({ synced: 1, reports: 1 });
    expect(store.webhooks.get("user-ann").last_sent_on).toBe("2026-11-15");
  });

  it("goes out when a mark took today's snapshot before the daily run", async () => {
    const { call, markAs, deps } = setup();
    deps.now = () => new Date("2026-11-15T01:00:00Z");
    await markAs("tok-ann");
    await call("hook-save", { method: "POST", token: "tok-ann", body: { url: HOOK } });
    deps.discord.post.mockClear();
    deps.now = () => new Date("2026-11-15T03:30:00Z");
    expect((await call("sync", { authorization: "Bearer cron-123" })).body).toMatchObject({ synced: 0, reports: 1 });
    expect(deps.discord.post).toHaveBeenCalledTimes(1);
  });
});
