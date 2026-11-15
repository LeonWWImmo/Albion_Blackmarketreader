import { describe, expect, it } from "vitest";
import { dailyReport, isWebhookUrl, shortNumber } from "../_lib/guildDiscord.js";

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

  it("reports status counts, joins and leaves since the given day, and the top fame gainers", () => {
    const report = dailyReport(
      {
        guild: { name: "Angry fuzzies", region: "eu", slug: "angry-fuzzies", memberCount: 4 },
        activity: {
          counts: { active: 2, quiet: 1, inactive: 1, unknown: 0 },
          members: [member("Ann", "2026-11-10", 5_000_000), member("Bo", "2026-11-14", 12_000), member("Cy", null, 0), member("Di", "2026-11-15", null)],
          left: [
            { id: "x", name: "Old", leftOn: "2026-11-01" },
            { id: "y", name: "Eve", leftOn: "2026-11-14" }
          ]
        }
      },
      "2026-11-14",
      new Date("2026-11-15T03:30:00Z")
    );
    const [embed] = report.embeds;
    const field = (name) => embed.fields.find((f) => f.name.startsWith(name));
    expect(field("Members").value).toContain("4 · 🟢 2 active · 🟡 1 quiet · 🔴 1 inactive");
    expect(field("Joined")).toMatchObject({ name: "Joined (2)", value: "Bo, Di" });
    expect(field("Left")).toMatchObject({ name: "Left (1)", value: "Eve" });
    expect(field("Most fame").value).toBe("1. Ann · 5m\n2. Bo · 12k");
    expect(report.allowed_mentions).toEqual({ parse: [] });
    expect(embed.timestamp).toBe("2026-11-15T03:30:00.000Z");
  });

  it("cuts a long name list at Discord's field limit", () => {
    const many = Array.from({ length: 200 }, (_, i) => member(`Player${String(i).padStart(3, "0")}`, "2026-11-15", 0));
    const report = dailyReport({ guild: { name: "G", region: "us", slug: "g", memberCount: 200 }, activity: { counts: { active: 0, quiet: 0, inactive: 0 }, members: many, left: [] } }, "2026-11-15", new Date());
    const joined = report.embeds[0].fields.find((f) => f.name.startsWith("Joined"));
    expect(joined.value.length).toBeLessThanOrEqual(1024);
    expect(joined.value).toMatch(/\+\d+ more$/);
  });
});
