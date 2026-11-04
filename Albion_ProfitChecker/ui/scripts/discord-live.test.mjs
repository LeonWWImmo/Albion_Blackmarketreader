import { describe, expect, it } from "vitest";
import { goldSummary } from "../api/_lib/discordData.js";
import { alertKind, alertMessage, alertTag, channelName, isRepeat, lastAlert } from "./discord-live.mjs";

const now = Date.parse("2026-11-04T12:00:00Z");
const H = 3600;
const start = now / 1000 - 30 * 24 * H;
// 30 days swinging between 9,000 and 10,000 (11% apart), newest point an hour ago
const history = Array.from({ length: 30 * 24 - 1 }, (_, i) => [start + i * H, 9000 + Math.round(1000 * Math.abs(Math.sin(i / 40)))]);
const flat = history.map(([t, v]) => [t, 9000 + (v % 50)]);
/** history plus the newest two hourly prices */
const withLast = (a, b, base = history, age = 0) => [...base, [now / 1000 - H - age, a], [now / 1000 - age, b]];

describe("channel names", () => {
  it("show the price and the 24 h trend", () => {
    expect(channelName("eu", goldSummary(withLast(9512, 9512)))).toMatch(/^💰 Gold EU · 9,512/);
    expect(channelName("us", goldSummary(withLast(8000, 8000)))).toBe("💰 Gold US · 8,000 📉");
  });
});

describe("gold alerts", () => {
  it("fire only when the last two hours break the 30-day low or high", () => {
    expect(alertKind(withLast(8900, 8800), now)).toBe("low");
    expect(alertKind(withLast(10100, 10200), now)).toBe("high");
    expect(alertKind(withLast(9500, 9500), now)).toBeNull();
    // a one-hour spike is not a move
    expect(alertKind(withLast(9500, 8500), now)).toBeNull();
    expect(alertKind(withLast(9500, 10500), now)).toBeNull();
  });

  it("stay quiet in a flat market and on old data", () => {
    expect(alertKind(withLast(8900, 8800, flat), now)).toBeNull();
    expect(alertKind(withLast(8900, 8800, history, 7 * H), now)).toBeNull();
    expect(alertKind(null, now)).toBeNull();
  });

  it("ping only the Gold Alerts role and carry a tag the next run can find", () => {
    const message = alertMessage("eu", "low", goldSummary(withLast(8900, 8800)));
    expect(message.allowed_mentions).toEqual({ roles: ["1567454898612600857"] });
    expect(message.components[0].content).toContain("<@&1567454898612600857>");
    expect(JSON.stringify(message)).toContain(alertTag("eu", "low"));
    expect(JSON.stringify(message)).toContain("buy gold");
    expect(JSON.stringify(alertMessage("us", "high", goldSummary(withLast(10100, 10200))))).toContain("sell gold");
  });

  it("repeat only after 7 days or 3% further", () => {
    const sentAt = (hoursAgo, author = "bot") => ({
      author: { id: author },
      timestamp: new Date(now - hoursAgo * 36e5).toISOString(),
      components: alertMessage("eu", "low", goldSummary(withLast(8900, 8800))).components
    });
    const last = lastAlert([sentAt(30), sentAt(3)], "bot", "eu", "low");
    expect(last).toEqual({ at: now - 3 * 36e5, price: 8800 });
    expect(lastAlert([sentAt(3)], "bot", "eu", "high")).toBeNull();
    expect(lastAlert([sentAt(3)], "bot", "us", "low")).toBeNull();
    expect(lastAlert([sentAt(3, "someone")], "bot", "eu", "low")).toBeNull();

    expect(isRepeat(last, "low", 8700, now)).toBe(true);
    expect(isRepeat(last, "low", 8500, now)).toBe(false);
    expect(isRepeat({ ...last, at: now - 8 * 24 * 36e5 }, "low", 8790, now)).toBe(false);
    expect(isRepeat(null, "low", 8790, now)).toBe(false);
    expect(isRepeat({ at: now - 36e5, price: 9000 }, "high", 9200, now)).toBe(true);
    expect(isRepeat({ at: now - 36e5, price: 9000 }, "high", 9300, now)).toBe(false);
  });
});
