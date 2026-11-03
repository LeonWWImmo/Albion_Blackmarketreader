import { describe, expect, it } from "vitest";
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
