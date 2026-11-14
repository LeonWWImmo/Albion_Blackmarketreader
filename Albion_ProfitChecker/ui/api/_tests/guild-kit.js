// Shared by the guild API tests: a fake killboard, the in-memory store and a `call` helper.
import { vi } from "vitest";
import { GameinfoError } from "../_lib/gameinfo.js";
import { handleGuild } from "../_lib/guildApi.js";
import { createMemoryGuildStore } from "../_lib/guildMemoryStore.js";

export const GID = "RCp44ZeoSKKMAqC6HzLqLA";
export const OTHER = "sOtDp2F7RsGsP6Od2-nUEw";
export const NOW = new Date("2026-11-14T12:00:00Z");

export const member = (id, name, pve = 1000) => ({ id, name, pve, killFame: 10, deathFame: 0, gathering: 0, crafting: 0, statsAt: "2026-11-13T00:38:00Z" });

const side = (id, name, guildId, mainHand = "T6_2H_BOW") => ({ id, name, guildId, guildName: guildId === GID ? "Angry fuzzies" : "Others", allianceName: null, itemPower: 1200, gear: { MainHand: { type: mainHand, quality: 2 } } });

export const killEvent = (id, time, killerGuild, victimGuild, battleId = null) => ({
  id,
  time,
  fame: 50000,
  participants: 3,
  battleId,
  killer: side(`k${id}`, `Killer${id}`, killerGuild),
  victim: side(`v${id}`, `Victim${id}`, victimGuild, "T5_MAIN_SWORD")
});

function fakeGameinfo() {
  return {
    searchGuilds: vi.fn(async (region, q) => (q.toLowerCase().includes("angry") ? [{ id: GID, name: "Angry fuzzies", allianceName: null, killFame: 1, deathFame: 2 }] : [])),
    getGuild: vi.fn(async (region, id) => {
      if (id === GID) return { id, name: "Angry fuzzies", allianceTag: "BOSSS", foundedAt: "2025-03-25T00:00:00Z", killFame: 610, deathFame: 811 };
      if (id === OTHER) return { id, name: "ROMULUS", allianceTag: null, foundedAt: null, killFame: 0, deathFame: 5 };
      throw new GameinfoError("not found", 404);
    }),
    getMembers: vi.fn(async () => [member("a", "Ann"), member("b", "Bo")]),
    getBattles: vi.fn(async () => [{ id: 1, startTime: "2026-11-14T10:00:00Z", players: 12, kills: 5, fame: 900, ours: [{ id: "a", name: "Ann", kills: 2, deaths: 1, killFame: 300 }] }]),
    getGuildKills: vi.fn(async () => [killEvent(11, "2026-11-14T09:00:00Z", GID, "x"), killEvent(12, "2026-11-14T11:00:00Z", GID, "x")]),
    getBattleEvents: vi.fn(async (region, battleId) => [killEvent(21, "2026-11-14T10:01:00Z", "x", GID, battleId), killEvent(22, "2026-11-14T10:02:00Z", GID, "x", battleId)])
  };
}

export function setup({ store = createMemoryGuildStore() } = {}) {
  const deps = {
    store,
    gameinfo: fakeGameinfo(),
    userFromToken: async (token) => ({ "tok-ann": { id: "user-ann" }, "tok-bo": { id: "user-bo" } })[token] ?? null,
    now: () => NOW,
    cronSecret: "cron-123"
  };
  const call = (action, { method = "GET", query = {}, body = null, token = null, authorization = null, client = "1.2.3.4" } = {}) =>
    handleGuild(action, { method, query, body, token, authorization: authorization ?? (token ? `Bearer ${token}` : ""), client }, deps);
  const markAs = (token, id = GID) => call("mark", { method: "POST", token, body: { region: "eu", id } });
  return { deps, store, call, markAs };
}
