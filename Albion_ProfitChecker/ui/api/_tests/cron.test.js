import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler, { JOBS } from "../cron/[job].js";

const UI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOWS = path.resolve(UI, "../../.github/workflows");

function response() {
  const res = { statusCode: 0, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (data) => ((res.body = data), res);
  res.send = (data) => ((res.body = data), res);
  return res;
}

async function call(job, authorization) {
  const res = response();
  await handler({ method: "GET", query: { job }, headers: authorization ? { authorization } : {} }, res);
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

describe("cron jobs", () => {
  it("refuses calls without Vercel's cron secret", async () => {
    expect((await call("discord-daily")).statusCode).toBe(401);
    expect((await call("health-check", "Bearer wrong")).statusCode).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("market-live", "Bearer ")).statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an unknown job", async () => {
    expect((await call("nope", "Bearer cron-secret")).statusCode).toBe(404);
    expect((await call("toString", "Bearer cron-secret")).statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts the job's workflow on main with its inputs", async () => {
    const cases = [
      ["discord-daily", "discord-daily.yml", { dry_run: "false", region: "both" }],
      ["health-check", "health-check.yml", { dry_run: "false" }],
      ["market-live", "market-live.yml", {}],
      ["gold-alerts", "discord-live.yml", { alerts: "true", names: "false", dry_run: "false" }]
    ];
    for (const [job, workflow, inputs] of cases) {
      fetchMock.mockClear();
      const res = await call(job, "Bearer cron-secret");
      expect(res.statusCode).toBe(200);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toMatch(new RegExp(`/actions/workflows/${workflow.replace(".", "\\.")}/dispatches$`));
      expect(init.headers.Authorization).toBe("Bearer gh-token");
      expect(JSON.parse(init.body)).toEqual({ ref: "main", inputs });
    }
  });

  it("reports a GitHub error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, text: async () => "forbidden" })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call("discord-daily", "Bearer cron-secret")).statusCode).toBe(502);
  });

  it("matches vercel.json and the workflows", () => {
    const crons = JSON.parse(readFileSync(path.join(UI, "vercel.json"), "utf8")).crons.map((c) => c.path);
    const jobs = crons.filter((p) => p.startsWith("/api/cron/")).map((p) => p.slice("/api/cron/".length));
    // every job runs on a Vercel schedule, every scheduled path is a job
    expect([...jobs].sort()).toEqual(Object.keys(JOBS).sort());
    for (const [workflow] of Object.values(JOBS)) {
      const text = readFileSync(path.join(WORKFLOWS, workflow), "utf8");
      expect(text, workflow).toMatch(/workflow_dispatch:/);
      // a GitHub schedule as well would start the job twice (and hours late)
      if (workflow !== "discord-daily.yml") expect(text, workflow).not.toMatch(/^\s*schedule:/m);
    }
  });
});
