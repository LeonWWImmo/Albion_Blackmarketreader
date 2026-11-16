import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGameinfoMemory, probeKillboard } from "../_lib/gameinfo.js";
import { setup } from "./guild-kit.js";

describe("status for the health check", () => {
  it("tells whether both killboards answer and how many marked guilds the sync missed", async () => {
    const { call, deps } = setup();
    deps.gameinfo.probeKillboard = vi.fn(async (region) => (region === "us" ? { state: "blocked", code: 403, ms: 30 } : { state: "ok", code: 200, ms: 120 }));
    deps.store.dueGuilds = vi.fn(async () => [{ id: "a" }, { id: "b" }]);
    const res = await call("status");
    expect(res).toMatchObject({ status: 200, maxAge: 60, body: { killboard: { eu: { state: "ok" }, us: { state: "blocked", code: 403 } }, lateSyncs: 2 } });
    // late: not synced for over a day (28 h before now)
    expect(deps.store.dueGuilds.mock.calls[0][0]).toBe("2026-11-13T08:00:00.000Z");
  });

  it("says null for the sync when the database is down", async () => {
    const { call, deps } = setup();
    deps.gameinfo.probeKillboard = vi.fn(async () => ({ state: "ok", code: 200, ms: 1 }));
    deps.store.dueGuilds = vi.fn(async () => {
      throw new Error("database: down");
    });
    expect((await call("status")).body.lateSyncs).toBeNull();
  });
});

describe("probing a killboard", () => {
  beforeEach(() => clearGameinfoMemory());
  afterEach(() => vi.unstubAllGlobals());

  it("reports ok, blocked (and pauses the host) or down", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await probeKillboard("eu")).toMatchObject({ state: "ok", code: 200 });
    fetchMock.mockImplementation(async () => new Response("blocked", { status: 403 }));
    expect(await probeKillboard("us")).toMatchObject({ state: "blocked", code: 403 });
    // paused: not asked again
    expect(await probeKillboard("us")).toMatchObject({ state: "blocked" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockImplementation(async () => new Response("busy", { status: 503 }));
    expect(await probeKillboard("eu")).toMatchObject({ state: "down", code: 503 });
    fetchMock.mockImplementation(async () => {
      throw new Error("timeout");
    });
    expect(await probeKillboard("eu")).toMatchObject({ state: "down", code: 0 });
  });
});
