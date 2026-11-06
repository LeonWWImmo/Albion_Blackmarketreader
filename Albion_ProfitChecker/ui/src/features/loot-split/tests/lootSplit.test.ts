import { describe, expect, it } from "vitest";
import { groupTrips, netStacks, parseLogDate, parseLootLog } from "../core/lootLog";
import { decodeSplit, encodeSplit } from "../core/share";
import { SCALE, buildTimeline, inRange, lastHours, toPos, toTime, tripRange } from "../core/timeline";
import { bestSale, itemId, parseSilver, payouts, shortSilver, type PriceRow } from "../core/valuation";

const LOG = [
  '"Date"\t"Player"\t"Item"\t"Enchantment"\t"Quality"\t"Amount"',
  '"10/30/2026 15:32:27"\t"Bob"\t"Major Healing Potion"\t"0"\t"1"\t"-5"',
  '"10/30/2026 17:08:23"\t"Bob"\t"Expert\'s Rune"\t"0"\t"1"\t"17"',
  '"10/30/2026 17:08:33"\t"Bob"\t"Expert\'s Rune"\t"0"\t"1"\t"-2"',
  '"11/01/2026 20:25:57"\t"Ann"\t"Expert\'s Crossbow"\t"1"\t"2"\t"1"',
  "",
  "garbage line"
].join("\r\n");

describe("chest log", () => {
  it("reads the game's copied log and skips the header and junk", () => {
    const entries = parseLootLog(LOG);
    expect(entries).toHaveLength(4);
    expect(entries[3]).toEqual({ time: Date.UTC(2026, 10, 1, 20, 25, 57), player: "Ann", name: "Expert's Crossbow", enchant: 1, quality: 2, amount: 1 });
  });

  it("understands US, German and ISO dates", () => {
    expect(parseLogDate("11/01/2026 20:25:57")).toBe(Date.UTC(2026, 10, 1, 20, 25, 57));
    expect(parseLogDate("01.11.2026 20:25")).toBe(Date.UTC(2026, 10, 1, 20, 25, 0));
    expect(parseLogDate("2026-11-01T20:25:57Z")).toBe(Date.UTC(2026, 10, 1, 20, 25, 57));
  });

  it("splits trips at long pauses", () => {
    const trips = groupTrips(parseLootLog(LOG));
    expect(trips.map((t) => t.entries.length)).toEqual([1, 2, 1]);
    expect(trips[2].players).toEqual(["Ann"]);
  });

  it("nets deposits against withdrawals and drops what was only taken out", () => {
    const { stacks, takenOut } = netStacks(parseLootLog(LOG));
    expect(stacks.map((s) => [s.name, s.amount])).toEqual([["Expert's Rune", 15], ["Expert's Crossbow", 1]]);
    expect(takenOut).toBe(7);
  });
});

describe("run picker", () => {
  const trips = groupTrips(parseLootLog(LOG));

  it("gives trips room and squeezes the pauses, both ways round", () => {
    const segments = buildTimeline(trips);
    expect(segments.map((s) => !!s.trip)).toEqual([true, false, true, false, true]);
    expect(segments[0].x0).toBe(0);
    expect(segments[4].x1).toBeCloseTo(SCALE);
    const t = Date.UTC(2026, 9, 30, 17, 8, 30);
    expect(toTime(segments, toPos(segments, t))).toBeCloseTo(t, -2);
    // a day long pause takes less room than a single short trip
    expect(segments[3].x1 - segments[3].x0).toBeLessThan(segments[4].x1 - segments[4].x0);
  });

  it("counts whole minutes, the last one included", () => {
    const run = tripRange(trips[1]);
    expect(run).toEqual({ from: Date.UTC(2026, 9, 30, 17, 8), to: Date.UTC(2026, 9, 30, 17, 8) });
    expect(inRange(Date.UTC(2026, 9, 30, 17, 8, 59), run)).toBe(true);
    expect(inRange(Date.UTC(2026, 9, 30, 17, 9), run)).toBe(false);
  });

  it("counts back from the newest entry, never before the first", () => {
    expect(lastHours(trips, 24)).toEqual({ from: Date.UTC(2026, 9, 31, 20, 25), to: Date.UTC(2026, 10, 1, 20, 25) });
    expect(lastHours(trips, 24 * 7).from).toBe(Date.UTC(2026, 9, 30, 15, 32));
  });
});

describe("valuation", () => {
  const names = { "Expert's Crossbow": "T5_2H_CROSSBOW", Swiftclaw: "T5_MOUNT_COUGAR_KEEPER@1" };
  // cities: Caerleon, Bridgewatch, Fort Sterling, Lymhurst, Martlock, Thetford
  const rows: PriceRow[] = [
    [1, 39000, [0, 0, 15000, 0, 0, 0], [0, 0, 37500, 0, 0, 0]],
    [2, 49000, [0, 0, 0, 0, 0, 0], [0, 0, 0, 60000, 0, 0]],
    [4, 33000, [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 57000, 0]]
  ];

  it("adds the enchantment to the id unless the name already is an enchanted item", () => {
    expect(itemId(names, "Expert's Crossbow", 1)).toBe("T5_2H_CROSSBOW@1");
    expect(itemId(names, "Expert's Crossbow", 0)).toBe("T5_2H_CROSSBOW");
    expect(itemId(names, "Swiftclaw", 1)).toBe("T5_MOUNT_COUGAR_KEEPER@1");
    expect(itemId(names, "Nope", 0)).toBeNull();
  });

  it("fast sells instantly at the best order an item of this quality can fill", () => {
    expect(bestSale(rows, 3, true, "fast")).toEqual({ route: "bm", unit: 49000 * 0.96, city: "Black Market" });
    expect(bestSale(rows, 1, false, "fast")).toEqual({ route: "bm", unit: 39000 * 0.92, city: "Black Market" });
  });

  it("max also weighs a sell order at the item's quality, after tax and setup fee", () => {
    expect(bestSale(rows, 2, true, "max")).toEqual({ route: "sell", unit: 60000 * 0.935, city: "Lymhurst" });
    expect(bestSale(rows, 3, true, "max")?.route).toBe("sell");
    expect(bestSale([], 1, true, "max")).toBeNull();
  });

  it("sells at the chosen market and sends what it does not take to the best other one", () => {
    expect(bestSale(rows, 1, true, "fast", "Fort Sterling")).toEqual({ route: "buy", unit: 15000 * 0.96, city: "Fort Sterling" });
    expect(bestSale(rows, 2, true, "max", "Black Market")).toEqual({ route: "bm", unit: 49000 * 0.96, city: "Black Market" });
    expect(bestSale(rows, 2, true, "fast", "Thetford")).toEqual({ route: "bm", unit: 49000 * 0.96, city: "Black Market" });
  });

  it("pays each player's repairs back, then the guild, then players by share", () => {
    const result = payouts({ total: 1_100_000, guildPct: 10, players: [{ name: "A", share: 100, repair: 100_000 }, { name: "B", share: 50 }] });
    expect(result.repairs).toBe(100_000);
    expect(result.guild).toBe(100_000);
    expect(result.players.map((p) => Math.round(p.silver))).toEqual([700_000, 300_000]);
    expect(result.players[0].repair).toBe(100_000);
  });

  it("pays repairs back pro rata when the loot is worth less", () => {
    const result = payouts({ total: 60_000, guildPct: 10, players: [{ name: "A", share: 100, repair: 80_000 }, { name: "B", share: 100, repair: 40_000 }] });
    expect(result.players.map((p) => p.silver)).toEqual([40_000, 20_000]);
    expect(result.guild).toBe(0);
  });

  it("reads silver the way players type it", () => {
    expect(["50k", "1.2m", "1,5m", "75.000", "75000", " 2 k ", "abc", ""].map(parseSilver)).toEqual([50_000, 1_200_000, 1_500_000, 75_000, 75_000, 2_000, 0, 0]);
  });

  it("writes silver short", () => {
    expect([shortSilver(12_345_678), shortSilver(45_600), shortSilver(950), shortSilver(2_500_000_000)]).toEqual(["12.3m", "46k", "950", "2.50b"]);
  });
});

describe("share link", () => {
  it("survives the round trip", async () => {
    const split = {
      stacks: netStacks(parseLootLog(LOG)).stacks.map(({ key: _key, ...s }) => s),
      players: [{ name: "Ann", share: 100, repair: 25_000 }, { name: "Bob", share: 50, repair: 0 }],
      guildPct: 10,
      premium: true,
      mode: "max" as const,
      market: "Lymhurst" as const
    };
    const code = await encodeSplit(split);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeSplit(code)).toEqual(split);
    expect(await decodeSplit("not-a-split")).toBeNull();
  });
});
