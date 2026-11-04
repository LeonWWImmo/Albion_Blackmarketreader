import { describe, expect, it } from "vitest";
import { goldSummary } from "../api/_lib/discordData.js";
import { alertKind, alertMessage, alertTag, alreadyAlerted, channelName } from "./discord-live.mjs";

const now = Date.parse("2026-11-04T12:00:00Z");
const start = now / 1000 - 30 * 24 * 3600;
const history = Array.from({ length: 30 * 24 }, (_, i) => [start + i * 3600, 9000 + (i % 48)]);
const withLast = (price, age = 0) => goldSummary([...history, [now / 1000 - age, price]]);

describe("channel names", () => {
  it("show the price and the 24 h trend", () => {
    expect(channelName("eu", withLast(9512))).toBe("💰 Gold EU · 9,512 📈");
    expect(channelName("us", withLast(8000))).toBe("💰 Gold US · 8,000 📉");
  });
});

describe("gold alerts", () => {
  it("fire at a 30-day low or high only, and never on old data", () => {
    expect(alertKind(withLast(8000), now)).toBe("low");
    expect(alertKind(withLast(9900), now)).toBe("high");
    expect(alertKind(withLast(9020), now)).toBeNull();
    expect(alertKind(withLast(8000, 7 * 3600), now)).toBeNull();
    expect(alertKind(null, now)).toBeNull();
  });

  it("ping only the Gold Alerts role and carry a tag the next run can find", () => {
    const message = alertMessage("eu", "low", withLast(8000));
    expect(message.allowed_mentions).toEqual({ roles: ["1567454898612600857"] });
    expect(message.components[0].content).toContain("<@&1567454898612600857>");
    expect(JSON.stringify(message)).toContain(alertTag("eu", "low"));
    expect(JSON.stringify(message)).toContain("buy gold");
    expect(JSON.stringify(alertMessage("us", "high", withLast(9900)))).toContain("sell gold");
  });

  it("are sent once per server and kind a day", () => {
    const sent = { author: { id: "bot" }, timestamp: new Date(now - 3 * 36e5).toISOString(), components: alertMessage("eu", "low", withLast(8000)).components };
    expect(alreadyAlerted([sent], "bot", "eu", "low", now)).toBe(true);
    expect(alreadyAlerted([sent], "bot", "eu", "high", now)).toBe(false);
    expect(alreadyAlerted([sent], "bot", "us", "low", now)).toBe(false);
    expect(alreadyAlerted([{ ...sent, timestamp: new Date(now - 25 * 36e5).toISOString() }], "bot", "eu", "low", now)).toBe(false);
    expect(alreadyAlerted([{ ...sent, author: { id: "someone" } }], "bot", "eu", "low", now)).toBe(false);
  });
});
