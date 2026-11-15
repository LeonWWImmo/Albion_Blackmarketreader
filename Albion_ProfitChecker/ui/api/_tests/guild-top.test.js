import { describe, expect, it } from "vitest";
import { GameinfoError, topGuildsOf } from "../_lib/gameinfo.js";
import { rankByFame } from "../_lib/guildApi.js";
import { GID, OTHER, setup } from "./guild-kit.js";

const fight = (guilds) => ({ guilds: Object.fromEntries(guilds.map((g) => [g.id, g])) });

describe("top guilds", () => {
  it("sums each guild's kill fame, kills and deaths over the fights, most fame first", () => {
    const top = topGuildsOf([
      fight([{ id: GID, name: "Angry fuzzies", alliance: "BOSSS", killFame: 100, kills: 2, deaths: 1 }, { id: OTHER, name: "ROMULUS", alliance: "", killFame: 300, kills: 4, deaths: 0 }]),
      fight([{ id: GID, name: "Angry fuzzies", alliance: "BOSSS", killFame: 250, kills: 3, deaths: 2 }, { id: "bad", name: "broken row" }]),
      null
    ]);
    expect(top).toEqual([
      { id: GID, name: "Angry fuzzies", allianceTag: "BOSSS", killFame: 350, kills: 5, deaths: 3, fights: 2 },
      { id: OTHER, name: "ROMULUS", allianceTag: null, killFame: 300, kills: 4, deaths: 0, fights: 1 }
    ]);
  });

  it("answers the top guilds with their addresses, kept for everyone, for a known range only", async () => {
    const { call, deps } = setup();
    const res = await call("top", { query: { region: "eu", range: "month" } });
    expect(res).toMatchObject({ status: 200, maxAge: 1800, body: { range: "month", guilds: [{ id: GID, slug: "angry-fuzzies", killFame: 900 }, { id: OTHER, slug: "romulus" }] } });
    expect(deps.gameinfo.getTopGuilds).toHaveBeenCalledWith("eu", "month");
    expect((await call("top", { query: { region: "eu", range: "year" } })).status).toBe(400);
    expect((await call("top", { query: { region: "asia", range: "week" } })).status).toBe(400);
  });

  it("says when Albion's killboard does not answer", async () => {
    const { call, deps } = setup();
    deps.gameinfo.getTopGuilds.mockRejectedValue(new GameinfoError("down", 502));
    expect(await call("top", { query: { region: "eu", range: "week" } })).toMatchObject({ status: 502, maxAge: 0 });
  });
});

describe("search with fame", () => {
  it("gives each hit its kill fame from the guild's info", async () => {
    const { call } = setup();
    const res = await call("search", { query: { region: "eu", q: "angry" } });
    expect(res).toMatchObject({ maxAge: 600, body: { guilds: [{ id: GID, killFame: 610, deathFame: 811 }] } });
  });

  it("ranks the same name match by kill fame, unknown fame last", () => {
    const g = (name, killFame) => ({ name, killFame });
    const ranked = rankByFame([g("Volans Bank", 0), g("Volans Academy", null), g("Volans Lymhurst", 9), g("volans", 0), g("The Volans", 50)], "volans");
    expect(ranked.map((x) => x.name)).toEqual(["volans", "Volans Lymhurst", "Volans Bank", "Volans Academy", "The Volans"]);
  });

  it("shows a hit without fame when its info fails, and keeps that answer only briefly", async () => {
    const { call, deps } = setup();
    deps.gameinfo.getGuild.mockRejectedValue(new GameinfoError("down", 502));
    const res = await call("search", { query: { region: "eu", q: "angry" } });
    expect(res).toMatchObject({ status: 200, maxAge: 60, body: { guilds: [{ id: GID, killFame: null }] } });
  });
});
