import { describe, expect, it } from "vitest";
import { groupTrips, netStacks, parseLogDate, parseLootLog } from "../core/lootLog";
import { decodeSplit, encodeSplit } from "../core/share";
import { bestSale, itemId, payouts, shortSilver, type PriceRow } from "../core/valuation";

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

describe("valuation", () => {
  const names = { "Expert's Crossbow": "T5_2H_CROSSBOW", Swiftclaw: "T5_MOUNT_COUGAR_KEEPER@1" };
  const rows: PriceRow[] = [
    [1, 39000, 15000, "Fort Sterling", 37500, "Fort Sterling"],
    [2, 49000, 0, "", 60000, "Lymhurst"],
    [4, 33000, 0, "", 57000, "Martlock"]
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

  it("pays repairs, then the guild, then players by share", () => {
    const result = payouts({ total: 1_100_000, repair: 100_000, guildPct: 10, players: [{ name: "A", share: 100 }, { name: "B", share: 50 }] });
    expect(result.guild).toBe(100_000);
    expect(result.players.map((p) => Math.round(p.silver))).toEqual([600_000, 300_000]);
  });

  it("writes silver short", () => {
    expect([shortSilver(12_345_678), shortSilver(45_600), shortSilver(950), shortSilver(2_500_000_000)]).toEqual(["12.3m", "46k", "950", "2.50b"]);
  });
});

describe("share link", () => {
  it("survives the round trip", async () => {
    const split = {
      stacks: netStacks(parseLootLog(LOG)).stacks.map(({ key: _key, ...s }) => s),
      players: [{ name: "Ann", share: 100 }, { name: "Bob", share: 50 }],
      guildPct: 10,
      repair: 25_000,
      premium: true,
      mode: "max" as const
    };
    const code = await encodeSplit(split);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeSplit(code)).toEqual(split);
    expect(await decodeSplit("not-a-split")).toBeNull();
  });
});
