import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./health-check.js";

function response() {
  const res = { statusCode: 0, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (data) => ((res.body = data), res);
  res.send = (data) => ((res.body = data), res);
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

describe("health check cron", () => {
  it("refuses calls without Vercel's cron secret", async () => {
    const res = response();
    await handler({ method: "GET", headers: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts the health check workflow on main", async () => {
    const res = response();
    await handler({ method: "GET", headers: { authorization: "Bearer cron-secret" } }, res);
    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/actions\/workflows\/health-check\.yml\/dispatches$/);
    expect(JSON.parse(init.body)).toEqual({ ref: "main", inputs: { dry_run: "false" } });
  });
});
