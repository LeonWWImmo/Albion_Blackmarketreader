import { describe, expect, it } from "vitest";
import { ago, auditSummary, buildCard, cardHtml, cityCoverage, coverageProblems, killboardSection, oldErrorPosts, overall } from "./health-check.mjs";

const at = Date.parse("2026-11-04T14:02:00Z");
const ok = (label) => ({ label, status: "ok", value: "1/1", caption: "fine", summary: "1/1 fine", problems: [] });
const report = (sections, speed = []) => ({ at, seconds: 95, sections, speed });

describe("killboard", () => {
  const up = (ms) => ({ state: "ok", code: 200, ms });
  it("is ok when both killboards answer and every marked guild is synced", () => {
    expect(killboardSection({ killboard: { eu: up(120), us: up(180) }, lateSyncs: 0 })).toMatchObject({ status: "ok", value: "OK", caption: "EU 120 ms · US 180 ms", problems: [] });
  });
  it("fails when Albion blocks our server, and says where", () => {
    const s = killboardSection({ killboard: { eu: up(120), us: { state: "blocked", code: 403, ms: 30 } }, lateSyncs: 0 });
    expect(s).toMatchObject({ status: "fail", value: "BLOCKED", caption: "EU 120 ms · US blocked" });
    expect(s.problems[0]).toContain("US killboard blocks our server");
  });
  it("warns when a killboard is down, fails when the sync is late", () => {
    expect(killboardSection({ killboard: { eu: { state: "down", code: 502, ms: 8000 }, us: up(1) }, lateSyncs: 0 })).toMatchObject({ status: "warn", value: "DOWN", problems: [expect.stringContaining("HTTP 502")] });
    expect(killboardSection({ killboard: { eu: up(1), us: up(1) }, lateSyncs: 2 })).toMatchObject({ status: "fail", value: "LATE", problems: [expect.stringContaining("2 marked guild(s)")] });
    expect(killboardSection({ killboard: { eu: up(1), us: up(1) }, lateSyncs: null })).toMatchObject({ status: "warn" });
  });
});

describe("overall", () => {
  it("takes the worst status", () => {
    expect(overall([ok("A")])).toBe("ok");
    expect(overall([ok("A"), { ...ok("B"), status: "warn" }])).toBe("warn");
    expect(overall([{ ...ok("A"), status: "fail" }, { ...ok("B"), status: "warn" }])).toBe("fail");
  });
});

describe("status picture", () => {
  it("has one tile per area and colours the headline by the worst status", () => {
    const html = cardHtml(report([ok("GitHub"), { ...ok("Website"), status: "fail", value: "23/24" }], [{ page: "/", ms: 1700 }]));
    expect(html.match(/class="tile[ "]/g)).toHaveLength(2);
    expect(html).toContain("Something is broken");
    expect(html).toContain('class="tile bad" style="--c:#ef4444"');
    expect(html).toContain("23/24");
    expect(html).toContain("Wed 4 Nov");
    expect(html).toContain("<b>Home</b>");
  });

  it("escapes what it shows", () => {
    expect(cardHtml(report([{ ...ok("GitHub"), caption: "<script>" }]))).toContain("&lt;script&gt;");
  });

  it("leaves the speed panel out when no page loaded", () => {
    expect(cardHtml(report([ok("GitHub")]))).not.toContain("PAGE SPEED");
  });
});

describe("Discord message", () => {
  it("is the picture and the buttons when everything is fine", () => {
    const message = buildCard(report([ok("GitHub"), ok("Website")]), { runUrl: "https://run" });
    const box = message.components[0];
    expect(box.accent_color).toBe(0x22c55e);
    expect(box.components.map((c) => c.type)).toEqual([10, 12, 1]);
    expect(box.components[0].content).toContain("ALL SYSTEMS CLEAN");
    expect(box.components[1].items[0].media.url).toBe("attachment://health-card.png");
    expect(message.attachments).toEqual([{ id: 0, filename: "health-card.png" }]);
    expect(message.allowed_mentions).toEqual({ parse: [] });
  });

  it("lists only the areas with problems below the picture, kept short", () => {
    const problems = ["a", "b", "c", "d", "e", "f"];
    const message = buildCard(report([ok("GitHub"), { ...ok("Data"), status: "fail", problems }]));
    const box = message.components[0];
    expect(box.accent_color).toBe(0xef4444);
    const list = box.components.find((c) => c.type === 10 && c.content.includes("What needs a look")).content;
    expect(list).toContain("**Data**");
    expect(list).not.toContain("**GitHub**");
    expect(list).toContain("-# ↳ d");
    expect(list).not.toContain("-# ↳ e");
    expect(list).toContain("-# ↳ and 2 more");
  });

  it("falls back to a text list without the picture", () => {
    const message = buildCard(report([ok("GitHub")]), { picture: false });
    expect(message.attachments).toBeUndefined();
    expect(message.components[0].components[1]).toEqual({ type: 10, content: "✅ **GitHub** · 1/1 fine" });
  });

  it("stays under Discord's text limit on a very bad day", () => {
    const long = Array.from({ length: 4 }, () => "x".repeat(400));
    const sections = Array.from({ length: 12 }, (_, i) => ({ ...ok(`S${i}`), status: "fail", problems: long }));
    const list = buildCard(report(sections)).components[0].components.find((c) => c.type === 10 && c.content.includes("What needs a look")).content;
    expect(list.length).toBeLessThan(4000);
    expect(list).toContain("-# and more");
  });
});

describe("price coverage", () => {
  const data = {
    cities: ["Lymhurst", "Caerleon", "Brecilien"],
    items: [
      { prices: { Lymhurst: 10, Caerleon: 12, Brecilien: 0 } },
      { prices: { Lymhurst: 11, Brecilien: 9 } },
      { prices: { Lymhurst: 12 } },
      { prices: { Lymhurst: 13 } }
    ]
  };

  it("counts the items with a price per city", () => {
    expect(cityCoverage(data)).toEqual([
      { city: "Lymhurst", percent: 100 },
      { city: "Caerleon", percent: 25 },
      { city: "Brecilien", percent: 25 }
    ]);
  });

  it("warns below 50 %, fails below 25 %, and asks half of that from Brecilien", () => {
    expect(coverageProblems("us", [{ city: "Caerleon", percent: 3 }])).toEqual({ level: "warn", problems: ["US Caerleon: only 3% of the materials have a price"] });
    expect(coverageProblems("us", [{ city: "Thetford", percent: 0 }]).level).toBe("fail");
    expect(coverageProblems("eu", [{ city: "Caerleon", percent: 40 }]).level).toBe("warn");
    expect(coverageProblems("eu", [{ city: "Brecilien", percent: 28 }]).level).toBeNull();
    expect(coverageProblems("eu", [{ city: "Brecilien", percent: 10 }]).level).toBe("warn");
    expect(coverageProblems("eu", [{ city: "Lymhurst", percent: 97 }])).toEqual({ level: null, problems: [] });
  });

  it("draws the coverage grid", () => {
    const html = cardHtml({ ...report([ok("Data")]), coverage: [{ region: "us", cities: cityCoverage(data) }] });
    expect(html).toContain("PRICE COVERAGE");
    expect(html).toContain("<th>CAE</th>");
    expect(html).toContain('<span style="--c:#ef4444">25</span>');
  });
});

describe("auditSummary", () => {
  it("reads the counts and the affected packages from npm audit --json", () => {
    const audit = { metadata: { vulnerabilities: { moderate: 1, high: 0 } }, vulnerabilities: { vite: { name: "vite", severity: "moderate" } } };
    expect(auditSummary(audit)).toEqual({ critical: 0, high: 0, moderate: 1, low: 0, packages: ["vite (moderate)"] });
    expect(auditSummary({})).toEqual({ critical: 0, high: 0, moderate: 0, low: 0, packages: [] });
  });
});

describe("ago", () => {
  it("formats ages short", () => {
    expect(ago(30 * 1000)).toBe("1 min");
    expect(ago(5 * 36e5)).toBe("5 h");
    expect(ago(72 * 36e5)).toBe("3 d");
  });
});

describe("oldErrorPosts", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  const post = (id, days, extra = {}) => ({ id, author: { id: "bot" }, timestamp: new Date(now - days * 24 * 36e5).toISOString(), ...extra });

  it("picks only the bot's own posts older than 30 days, never pinned ones", () => {
    const messages = [post("new", 2), post("old", 31), post("edge", 30), post("pinned", 40, { pinned: true }), post("human", 40, { author: { id: "king" } })];
    expect(oldErrorPosts(messages, "bot", now).map((m) => m.id)).toEqual(["old"]);
  });
});
