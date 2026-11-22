// Guild Pro: the ZvZ report (api/_lib/guildApi.js zvz + hook-zvz, api/_lib/guildDiscord.js zvzReport).
import { describe, expect, it } from "vitest";
import { killBar, zvzReport } from "../_lib/guildDiscord.js";
import { GID, setup } from "./guild-kit.js";

const HOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-12";
const ours = (n) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, name: `Our${i}`, kills: 1, deaths: 0, killFame: 100 }));
const fight = (id, startTime, { players = 40, of = 6 } = {}) => ({ id, startTime, players, kills: 10, fame: 1000, ours: ours(of) });

/** Ann (premium) has the guild marked and a webhook; Bo too, without premium. */
async function ready({ fights = [fight(7, "2026-11-14T10:00:00Z")] } = {}) {
  const kit = setup();
  kit.deps.premium = async (userId) => userId === "user-ann";
  kit.deps.actionsSecret = "actions-123";
  kit.deps.gameinfo.getBattles.mockResolvedValue(fights);
  for (const token of ["tok-ann", "tok-bo"]) {
    await kit.markAs(token);
    await kit.call("hook-save", { method: "POST", token, body: { region: "eu", url: HOOK } });
  }
  kit.deps.discord.post.mockClear();
  const zvz = (on, token = "tok-ann") => kit.call("hook-zvz", { method: "POST", token, body: { region: "eu", on } });
  const runJob = () => kit.call("zvz", { authorization: "Bearer actions-123" });
  return { ...kit, zvz, runJob };
}

describe("ZvZ report setting", () => {
  it("is premium only, greets the channel once and shows in the hook", async () => {
    const { call, zvz, deps } = await ready();
    expect((await zvz(true, "tok-bo")).status).toBe(403);
    const on = await zvz(true);
    expect(on.status).toBe(200);
    expect(on.body.hook).toEqual({ name: "Guild news", lastSentOn: null, zvz: true });
    expect(deps.discord.post).toHaveBeenCalledTimes(1);
    expect(deps.discord.post.mock.calls[0][1].embeds[0].title).toBe("⚔️ ZvZ reports on");
    await zvz(true);
    expect(deps.discord.post).toHaveBeenCalledTimes(1);
    expect((await call("hook", { token: "tok-ann", query: { region: "eu" } })).body.hook.zvz).toBe(true);
    expect((await zvz(false)).body.hook.zvz).toBe(false);
  });

  it("needs a webhook first, and a new webhook link keeps it", async () => {
    const { call, zvz, store } = await ready();
    await call("hook-remove", { method: "POST", token: "tok-ann", body: { region: "eu" } });
    expect((await zvz(true)).status).toBe(409);
    await call("hook-save", { method: "POST", token: "tok-ann", body: { region: "eu", url: HOOK } });
    await zvz(true);
    await call("hook-save", { method: "POST", token: "tok-ann", body: { region: "eu", url: HOOK } });
    expect(store.webhooks.get("user-ann:eu").zvz).toBe(true);
  });

  it("a webhook Discord deleted is removed", async () => {
    const { zvz, deps, store } = await ready();
    deps.discord.post.mockResolvedValueOnce("gone");
    expect((await zvz(true)).status).toBe(410);
    expect(store.webhooks.has("user-ann:eu")).toBe(false);
  });
});

describe("ZvZ job", () => {
  it("needs the Actions secret", async () => {
    const { call } = await ready();
    expect((await call("zvz", {})).status).toBe(401);
    expect((await call("zvz", { authorization: "Bearer cron-123" })).status).toBe(401);
    expect((await call("zvz", { authorization: "Bearer actions-123" })).status).toBe(200);
  });

  it("posts each new big fight once, for premium players only, and nothing from before turning it on", async () => {
    const { zvz, store, deps, runJob } = await ready({
      fights: [fight(7, "2026-11-14T10:00:00Z"), fight(8, "2026-11-14T08:00:00Z"), fight(9, "2026-11-14T10:30:00Z", { players: 12 }), fight(10, "2026-11-14T10:40:00Z", { of: 2 })]
    });
    await zvz(true);
    // Bo lost premium after turning it on: the setting stays, nothing is posted
    await store.setZvz("user-bo", "eu", true, "2026-11-14T09:00:00Z");
    // turned on at 12:00: the fights of the morning are not news
    expect((await runJob()).body).toEqual({ hooks: 1, posted: 0, notPremium: 1 });
    await store.setZvz("user-ann", "eu", true, "2026-11-14T09:00:00Z");
    deps.discord.post.mockClear();
    expect((await runJob()).body.posted).toBe(1);
    const [url, payload] = deps.discord.post.mock.calls[0];
    expect(url).toBe(HOOK);
    expect(payload.embeds[0].url).toBe("https://blackmarketreader.com/guild/battle/eu/7");
    expect(payload.embeds[0].title).toBe("⚖️ Stalemate");
    expect(payload.embeds[0].author.name).toBe("ZvZ report · [BOSSS] Angry fuzzies");
    expect(store.webhooks.get("user-ann:eu").zvz_after).toBe("2026-11-14T10:00:00Z");
    expect((await runJob()).body.posted).toBe(0);
  });

  it("waits for a fight that is still going on", async () => {
    const { store, deps, runJob } = await ready({ fights: [fight(7, "2026-11-14T11:40:00Z")] });
    await store.setZvz("user-ann", "eu", true, "2026-11-14T09:00:00Z");
    const report = deps.gameinfo.getBattleReport.getMockImplementation();
    deps.gameinfo.getBattleReport.mockImplementation(async (region, id) => {
      const r = await report(region, id);
      return { ...r, battle: { ...r.battle, startTime: "2026-11-14T11:40:00Z", endTime: "2026-11-14T11:55:00Z" } };
    });
    expect((await runJob()).body.posted).toBe(0);
    expect(store.webhooks.get("user-ann:eu").zvz_after).toBe("2026-11-14T09:00:00Z");
  });

  it("never reaches back more than 6 hours", async () => {
    const { store, runJob } = await ready({ fights: [fight(7, "2026-11-14T05:00:00Z")] });
    await store.setZvz("user-ann", "eu", true, "2026-11-13T00:00:00Z");
    expect((await runJob()).body.posted).toBe(0);
  });
});

describe("zvzReport", () => {
  const guild = { id: GID, name: "Angry fuzzies", allianceTag: "FUZ", region: "eu", slug: "angry-fuzzies" };
  const player = (id, guildId, allianceId, s) => ({ id, name: id, guildId, guildName: guildId, allianceId, allianceName: allianceId, kills: 0, deaths: 0, killFame: 0, damage: 0, healAssists: 0, ...s });
  const body = {
    battle: { id: 99, startTime: "2026-11-14T10:00:00Z", endTime: "2026-11-14T10:23:00Z", kills: 6, fame: 1, players: 7 },
    guilds: [{ id: GID, name: "Angry fuzzies", kills: 5, deaths: 2, killFame: 2_500_000 }],
    players: [
      player("Ann", GID, "A", { damage: 90_000, killFame: 1_000_000, healAssists: 0 }),
      player("Bo", GID, "A", { damage: 50_000, killFame: 1_500_000, healAssists: 4 }),
      player("Ally", "g2", "A", { damage: 999_999 }),
      player("E1", "g3", "B"),
      player("E2", "g3", "B"),
      player("E3", "g4", null, { guildName: "Solo" }),
      player("E4", "g3", "B")
    ],
    kills: [
      { victim: { guildId: GID, gearValue: 1_200_000 } },
      { victim: { guildId: GID, gearValue: 800_000 } },
      { victim: { guildId: "g3", gearValue: 5_000_000 } }
    ],
    priced: true
  };

  it("sums up the fight for the guild: result, K/D, regear, the best players and the enemy", () => {
    const { embeds, allowed_mentions } = zvzReport(guild, body);
    const [embed] = embeds;
    const field = (name) => embed.fields.find((f) => f.name.includes(name)).value;
    expect(allowed_mentions).toEqual({ parse: [] });
    expect(embed.title).toBe("🏆 Victory");
    expect(embed.author.name).toBe("ZvZ report · [FUZ] Angry fuzzies");
    expect(embed.url).toBe("https://blackmarketreader.com/guild/battle/eu/99");
    expect(embed.color).toBe(0x4ade80);
    // the scoreboard: kills against deaths, the bar, then time, length, server and size
    expect(embed.description).toBe(
      ["## 5 ⚔️ 2", `${killBar(5, 2)}  **K/D 2.50**`, "-# 🕒 <t:1794650400:f> · ⏱️ 23 min · 🌍 Europe · 👥 2 of 7 players"].join("\n")
    );
    expect(field("Regear")).toBe("**2m** silver");
    // the MVP: most kill fame
    expect(field("MVP")).toBe("**Bo** · 0 kills · 1.5m fame · 50k damage");
    expect(field("Damage")).toBe("🥇 **Ann** · 90k\n🥈 **Bo** · 50k");
    expect(field("Kill fame").startsWith("**")).toBe(true);
    expect(embed.fields.find((f) => f.name === "🏆 Kill fame").value).toBe("🥇 **Bo** · 1.5m\n🥈 **Ann** · 1m");
    expect(field("Support")).toBe("🥇 **Bo** · 4 heals");
    // the ally is not an enemy: us, then the enemy groups by size
    const table = field("Who was there").split("\n");
    expect(table[1]).toMatch(/^Us\s+2 /);
    expect(table[2]).toMatch(/^\[B\]\s+3 /);
    expect(table[3]).toMatch(/^Solo\s+1 /);
    expect(embed.image.url).toBe("https://blackmarketreader.com/picture/zvz-won.jpg");
  });

  it("without prices or deaths: a regear link, and no division by zero", () => {
    const [embed] = zvzReport(guild, { ...body, guilds: [{ id: GID, kills: 3, deaths: 0, killFame: 1 }], priced: false }).embeds;
    expect(embed.description).toContain("**K/D ∞**");
    expect(embed.description).toContain("🟩".repeat(10));
    expect(embed.fields.find((f) => f.name.includes("Regear")).value).toContain("/guild/eu/angry-fuzzies/regear");
  });
});

describe("killBar", () => {
  it("shows the kills' share in ten squares", () => {
    expect(killBar(3, 1)).toBe("🟩".repeat(8) + "🟥".repeat(2));
    expect(killBar(0, 5)).toBe("🟥".repeat(10));
    expect(killBar(0, 0)).toBe("⬛".repeat(10));
  });
});
