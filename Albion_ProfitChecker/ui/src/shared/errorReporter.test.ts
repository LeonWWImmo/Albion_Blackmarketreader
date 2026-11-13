import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldReport } from "./errorReporter";

const ours = { message: "TypeError: x is undefined", stack: "at h (https://blackmarketreader.com/assets/index.js:1:2)", source: "" };

describe("shouldReport", () => {
  it("reports the site's own errors", () => {
    expect(shouldReport(ours)).toBe(true);
  });

  it("skips browser noise, extensions and ad scripts", () => {
    expect(shouldReport({ ...ours, message: "ResizeObserver loop completed with undelivered notifications." })).toBe(false);
    expect(shouldReport({ ...ours, message: "Script error." })).toBe(false);
    expect(shouldReport({ ...ours, message: "" })).toBe(false);
    expect(shouldReport({ ...ours, stack: "at x (chrome-extension://abc/content.js:1:1)" })).toBe(false);
    expect(shouldReport({ ...ours, source: "https://pagead2.googlesyndication.com/pagead/show_ads.js:1:1" })).toBe(false);
  });
});

describe("installErrorReporter", () => {
  async function setup(webdriver: boolean) {
    vi.resetModules();
    const beacons: string[] = [];
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("location", { hostname: "blackmarketreader.com", pathname: "/" });
    vi.stubGlobal("document", { documentElement: { className: "" } });
    vi.stubGlobal("navigator", { webdriver, userAgent: "test", sendBeacon: (_url: string, blob: Blob) => (beacons.push(String(blob.size)), true) });
    const mod = await import("./errorReporter");
    mod.installErrorReporter();
    return { mod, beacons };
  }

  afterEach(() => vi.unstubAllGlobals());

  it("reports errors a page boundary caught", async () => {
    const { mod, beacons } = await setup(false);
    mod.reportCaughtError(new TypeError("boom"));
    expect(beacons).toHaveLength(1);
  });

  it("stays quiet in automated browsers", async () => {
    const { mod, beacons } = await setup(true);
    mod.reportCaughtError(new TypeError("boom"));
    window.dispatchEvent(Object.assign(new Event("error"), { error: new TypeError("boom"), message: "boom" }));
    expect(beacons).toHaveLength(0);
  });
});
