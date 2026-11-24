import { describe, expect, it } from "vitest";
import { dailyReport, helloMessage, isWebhookUrl, shortNumber, statusBar } from "../_lib/guildDiscord.js";

const member = (name, joinedOn, gain, kinds = {}) => ({ name, joinedOn, gains: { 7: gain === null ? null : { total: gain, ...kinds }, 30: null } });

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
        tracking: { since: "2026-11-01" },
        activity: {
          counts: { active: 2, quiet: 1, inactive: 1, unknown: 0 },
          members: [member("Ann", "2026-11-10", 5_000_000, { pve: 4_000_000, pvp: 1_000_000 }), member("Bo", "2026-11-14", 12_000, { gathering: 12_000 }), member("Cy", null, 0), member("Di", "2026-11-15", null)],
          left: [
            { id: "x", name: "Old", leftOn: "2026-11-01" },
            { id: "y", name: "Eve", leftOn: "2026-11-14" }
          ]
        },
        fights: [
          { id: 1, startTime: "2026-11-14T20:00:00Z", kills: 5, deaths: 2, players: 48, ours: 12, enemy: "[BAD] Foes" },
          { id: 2, startTime: "2026-11-14T21:00:00Z", kills: 1, deaths: 1, players: 6, ours: 3, enemy: null },
          { id: 3, startTime: "2026-11-12T21:00:00Z", kills: 9, deaths: 9, players: 90, ours: 20, enemy: null }
        ]
      },
      "2026-11-14",
      new Date("2026-11-15T03:30:00Z")
    );
    const [embed] = report.embeds;
    const field = (name) => embed.fields.find((f) => f.name.includes(name));
    expect(embed.author.name).toBe("Daily report · Sunday 15 November");
    expect(embed.title).toBe("🛡️ [FUZ] Angry fuzzies");
    expect(embed.url).toBe("https://blackmarketreader.com/guild/eu/angry-fuzzies/activity");
    // the headline: the last day's kills against deaths, then the bar and K/D
    expect(embed.description).toBe(
      ["-# 🌍 Europe · 👥 4 members · 📥 +2 · 📤 −1", "## ⚔️ 6 – 3 💀", "🟩".repeat(7) + "🟥".repeat(3) + "  **K/D 2.00** · 2 fights in 24h"].join("\n")
    );
    // the fight of the day: the most players, linked to its battle report
    expect(field("Fight of the day").value).toBe(
      "[**5 – 2**](https://blackmarketreader.com/guild/battle/eu/1) vs [BAD] Foes · 12 of 48 players · <t:1794686400:t>\n🛡️ 3 deaths to regear: [open](https://blackmarketreader.com/guild/eu/angry-fuzzies/regear)"
    );
    expect(field("Roster").value).toContain("🟩 **2** active (50%) · 🟨 **1** quiet · 🟥 **1** inactive");
    expect(field("Joined")).toMatchObject({ name: "📥 Joined (2)", value: "Bo, Di" });
    expect(field("Left")).toMatchObject({ name: "📤 Left (1)", value: "Eve" });
    expect(field("Top fame")).toMatchObject({ name: "🏆 Top fame · 7 days · +5m in all", value: "🥇 **Ann** · 5m\n🥈 **Bo** · 12k", inline: true });
    expect(field("Stars").value).toBe("⚔️ PvP · **Ann** · 1m\n🐉 PvE · **Ann** · 4m\n⛏️ Gathering · **Bo** · 12k");
    expect(embed.fields.at(-1).value).toContain("[🛡️ Regear](https://blackmarketreader.com/guild/eu/angry-fuzzies/regear)");
    expect(report.allowed_mentions).toEqual({ parse: [] });
    expect(embed.timestamp).toBe("2026-11-15T03:30:00.000Z");
  });

  it("counts nobody as joined on the guild's first snapshot", () => {
    const first = (trackedSince) =>
      dailyReport(
        {
          guild: { name: "G", region: "us", slug: "g", memberCount: 2 },
          tracking: { since: trackedSince },
          activity: { counts: { active: 2, quiet: 0, inactive: 0 }, members: [member("Ann", "2026-11-15", 0), member("Bo", "2026-11-15", 0)], left: [] }
        },
        "2026-11-15",
        new Date("2026-11-15T03:30:00Z")
      ).embeds[0].fields;
    const fields = first("2026-11-15");
    expect(fields.some((f) => f.name.startsWith("📥 Joined ("))).toBe(false);
    expect(fields.find((f) => f.name.includes("Joined and")).value).toMatch(/first snapshot/);
    expect(fields.some((f) => f.name.includes("Fight of the day"))).toBe(false);
    expect(fields.find((f) => f.name.includes("Top fame")).value).toMatch(/after a week/);
    // tracked from before: the same members did join today
    expect(first("2026-11-10").find((f) => f.name.startsWith("📥 Joined (")).value).toBe("Ann, Bo");
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
    const report = dailyReport({ guild: { name: "G", region: "us", slug: "g", memberCount: 200 }, tracking: { since: "2026-11-01" }, activity: { counts: { active: 0, quiet: 0, inactive: 0 }, members: many, left: [] } }, "2026-11-15", new Date());
    const joined = report.embeds[0].fields.find((f) => f.name.startsWith("📥 Joined"));
    expect(joined.value.length).toBeLessThanOrEqual(1024);
    expect(joined.value).toMatch(/\+\d+ more$/);
  });
});
