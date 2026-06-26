import { describe, expect, it } from "vitest";
import { getSafeNextPath } from "./safeNextPath";

const ORIGIN = "https://blackmarketreader.com";

describe("getSafeNextPath – Open-Redirect-/Allowlist-Schutz (Block 5)", () => {
  it("erlaubt Pfade aus der Allowlist", () => {
    expect(getSafeNextPath("/dashboard", ORIGIN)).toBe("/dashboard");
    expect(getSafeNextPath("/", ORIGIN)).toBe("/");
  });

  it("behält Query und Hash bei erlaubten Pfaden", () => {
    expect(getSafeNextPath("/dashboard?tab=1#x", ORIGIN)).toBe("/dashboard?tab=1#x");
  });

  it("blockt externe Ziele (absolute URL, //, protocol, backslash-Trick)", () => {
    expect(getSafeNextPath("https://evil.com", ORIGIN)).toBeNull();
    expect(getSafeNextPath("//evil.com", ORIGIN)).toBeNull();
    expect(getSafeNextPath("javascript:alert(1)", ORIGIN)).toBeNull();
    expect(getSafeNextPath("/\\evil.com", ORIGIN)).toBeNull();
  });

  it("blockt nicht erlaubte und sensible Pfade", () => {
    expect(getSafeNextPath("/admin", ORIGIN)).toBeNull();
    expect(getSafeNextPath("/login", ORIGIN)).toBeNull();
  });

  it("normalisiert Path-Traversal und blockt unerlaubtes Ziel", () => {
    expect(getSafeNextPath("/dashboard/../admin", ORIGIN)).toBeNull();
  });

  it("gibt null bei leerem oder ungültigem Input", () => {
    expect(getSafeNextPath(null, ORIGIN)).toBeNull();
    expect(getSafeNextPath("", ORIGIN)).toBeNull();
    expect(getSafeNextPath("dashboard", ORIGIN)).toBeNull(); // kein fuehrender Slash
  });
});
