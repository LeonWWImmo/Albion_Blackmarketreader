import { describe, expect, it } from "vitest";
import { dailyReport, helloMessage, isWebhookUrl, shortNumber, statusBar } from "../_lib/guildDiscord.js";

const member = (name, joinedOn, gain) => ({ name, joinedOn, gains: { 7: gain === null ? null : { total: gain }, 30: null } });

describe("Discord report", () => {
  it("takes Discord's own webhook links only", () => {
    expect(isWebhookUrl("https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-12")).toBe(true);
    expect(isWebhookUrl("https://ptb.discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-12")).toBe(true);
    expect(isWebhookUrl("https://discordapp.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-12")).toBe(true);
    expect(isWebhookUrl("https://discord.com.evil.io/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz")).toBe(false);
    expect(isWebhookUrl("https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz?wait=true")).toBe(false);
    expect(isWebhookUrl(null)).toBe(false);
  });

  it("writes fame short", () => {
    expect([999, 4500, 12_345_678, 2_500_000_000, 150_000].map(shortNumber)).toEqual(["999", "4.5k", "12.3m", "2.5b", "150k"]);
  });

  it("reports status counts, joins and leaves since the given day, the last day's fights and the top fame gainers", () => {
    const report = dailyReport(
      {
        guild: { name: "Angry fuzzies", region: "eu", slug: "angry-fuzzies", memberCount: 4, allianceTag: "FUZ" },
        activity: {
          counts: { active: 2, quiet: 1, inactive: 1, unknown: 0 },
          members: [member("Ann", "2026-11-10", 5_000_000), member("Bo", "2026-11-14", 12_000), member("Cy", null, 0), member("Di", "2026-11-15", null)],
          left: [
            { id: "x", name: "Old", leftOn: "2026-11-01" },
            { id: "y", name: "Eve", leftOn: "2026-11-14" }
          ]
        },
        fights: [
          { id: 1, startTime: "2026-11-14T20:00:00Z", kills: 5, deaths: 2 },
          { id: 2, startTime: "2026-11-14T21:00:00Z", kills: 1, deaths: 1 },
          { id: 3, startTime: "2026-11-12T21:00:00Z", kills: 9, deaths: 9 }
        ]
      },
      "2026-11-14",
      new Date("2026-11-15T03:30:00Z")
    );
    const [embed] = report.embeds;
    const field = (name) => embed.fields.find((f) => f.name.includes(name));
    expect(embed.title).toBe("🛡️ [FUZ] Angry fuzzies");
    expect(embed.url).toBe("https://blackmarketreader.com/guild/eu/angry-fuzzies/activity");
    expect(embed.description).toContain("Sunday 15 November · Europe");
    expect(embed.description).toContain("🟩 2 active · 🟨 1 quiet · 🟥 1 inactive");
    expect(field("Members").value).toBe("**4**");
    expect(field("New")).toMatchObject({ name: "📥 New (2)", value: "Bo, Di" });
    expect(field("Gone")).toMatchObject({ name: "📤 Gone (1)", value: "Eve" });
    expect(field("Last 24 hours").value).toMatch(/^\*\*2\*\* fights · 🗡️ 6 kills · 💀 3 deaths/);
    expect(field("Most fame").value).toBe("🥇 **Ann** · 5m\n🥈 **Bo** · 12k");
    expect(field("Open").value).toContain("[Regear](https://blackmarketreader.com/guild/eu/angry-fuzzies/regear)");
    expect(report.allowed_mentions).toEqual({ parse: [] });
    expect(embed.timestamp).toBe("2026-11-15T03:30:00.000Z");
  });

  it("leaves out the name lists on a quiet day", () => {
    const report = dailyReport(
      { guild: { name: "G", region: "us", slug: "g", memberCount: 1 }, activity: { counts: { active: 1, quiet: 0, inactive: 0 }, members: [member("Ann", null, 0)], left: [] } },
      "2026-11-15",
      new Date("2026-11-15T03:30:00Z")
    );
    const names = report.embeds[0].fields.map((f) => f.name);
    expect(names.some((n) => n.includes("New") || n.includes("Gone"))).toBe(false);
    expect(report.embeds[0].fields.find((f) => f.name.includes("Last 24 hours")).value).toBe("No listed fight.");
  });

  it("draws the members as a bar of 12 squares", () => {
    expect(statusBar({ active: 2, quiet: 1, inactive: 1 })).toBe("🟩".repeat(6) + "🟨".repeat(3) + "🟥".repeat(3));
    expect([...statusBar({ active: 1, quiet: 1, inactive: 1 })].length).toBe(12);
    expect(statusBar({ active: 0, quiet: 0, inactive: 0 })).toBe("");
  });

  it("greets a new webhook with what comes and when, pinging nobody", () => {
    const hello = helloMessage({ name: "Angry fuzzies", region: "eu", slug: "angry-fuzzies" });
    expect(hello.allowed_mentions).toEqual({ parse: [] });
    expect(hello.embeds[0].description).toContain("**Angry fuzzies**");
    expect(hello.embeds[0].fields[0].value).toBe("Every day, 03:30 to 04:30 UTC");
  });

  it("cuts a long name list at Discord's field limit", () => {
    const many = Array.from({ length: 200 }, (_, i) => member(`Player${String(i).padStart(3, "0")}`, "2026-11-15", 0));
    const report = dailyReport({ guild: { name: "G", region: "us", slug: "g", memberCount: 200 }, activity: { counts: { active: 0, quiet: 0, inactive: 0 }, members: many, left: [] } }, "2026-11-15", new Date());
    const joined = report.embeds[0].fields.find((f) => f.name.includes("New"));
    expect(joined.value.length).toBeLessThanOrEqual(1024);
    expect(joined.value).toMatch(/\+\d+ more$/);
  });
});
