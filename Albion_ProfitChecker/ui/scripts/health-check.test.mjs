import { describe, expect, it } from "vitest";
import { ago, auditSummary, buildCard, cardHtml, cityCoverage, coverageProblems, overall } from "./health-check.mjs";

const at = Date.parse("2026-11-04T14:02:00Z");
const ok = (label) => ({ label, status: "ok", value: "1/1", caption: "fine", summary: "1/1 fine", problems: [] });
const report = (sections, speed = []) => ({ at, seconds: 95, sections, speed });

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
    expect(coverageProblems("us", [{ city: "Caerleon", percent: 3 }])).toEqual({ level: "fail", problems: ["US Caerleon: only 3% of the materials have a price"] });
    expect(coverageProblems("eu", [{ city: "Caerleon", percent: 40 }]).level).toBe("warn");
    expect(coverageProblems("eu", [{ city: "Brecilien", percent: 28 }]).level).toBeNull();
    expect(coverageProblems("eu", [{ city: "Brecilien", percent: 10 }]).level).toBe("fail");
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
