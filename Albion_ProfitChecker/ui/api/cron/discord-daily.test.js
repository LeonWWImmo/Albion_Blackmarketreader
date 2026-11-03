import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./discord-daily.js";

function response() {
  const res = { statusCode: 0, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (data) => ((res.body = data), res);
  res.send = (data) => ((res.body = data), res);
  return res;
}

async function call(authorization) {
  const res = response();
  await handler({ method: "GET", headers: authorization ? { authorization } : {} }, res);
  return res;
}

let fetchMock;
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.stubEnv("GITHUB_DISPATCH_TOKEN", "gh-token");
  fetchMock = vi.fn(async () => ({ ok: true, status: 204, text: async () => "" }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("discord daily cron", () => {
  it("refuses calls without Vercel's cron secret", async () => {
    expect((await call()).statusCode).toBe(401);
    expect((await call("Bearer wrong")).statusCode).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts the workflow on main as a real post", async () => {
    const res = await call("Bearer cron-secret");
    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/actions\/workflows\/discord-daily\.yml\/dispatches$/);
    expect(init.headers.Authorization).toBe("Bearer gh-token");
    expect(JSON.parse(init.body)).toEqual({ ref: "main", inputs: { dry_run: "false", region: "both" } });
  });

  it("reports a GitHub error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, text: async () => "forbidden" })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call("Bearer cron-secret")).statusCode).toBe(502);
  });
});
