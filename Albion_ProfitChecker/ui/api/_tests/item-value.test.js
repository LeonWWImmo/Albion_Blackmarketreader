import { describe, expect, it, vi } from "vitest";
import { parseEvents } from "../_lib/gameinfo.js";
import { priceEvent } from "../_lib/guildApi.js";
import { rowValue, unitValue, valueTable } from "../_lib/itemValue.js";
import { GID, killEvent, setup } from "./guild-kit.js";

const none = [0, 0, 0, 0, 0, 0];
// AODP price rows: [quality, blackMarket, cityBuys[6], citySells[6]]
const table = valueTable({
  T6_2H_BOW: [
    [1, 0, none, [0, 52000, 50000, 0, 0, 0]],
    [2, 0, none, [0, 61000, 0, 0, 0, 0]]
  ],
  T5_MAIN_SWORD: [[1, 30000, [12000, 0, 0, 0, 0, 0], none]],
  T4_RUNE: [[1, 0, none, [0, 0, 0, 120, 0, 0]]]
});

describe("item values", () => {
  it("takes the cheapest sell order, else the middle of what buyers pay, else another quality", () => {
    expect(unitValue(table, "T6_2H_BOW", 1)).toBe(50000);
    expect(unitValue(table, "T6_2H_BOW", 2)).toBe(61000);
    expect(unitValue(table, "T6_2H_BOW", 4)).toBe(61000); // nearest known quality below
    expect(unitValue(table, "T5_MAIN_SWORD", 1)).toBe(12000); // no sell order: the middle bid
    expect(unitValue(table, "T8_UNKNOWN", 1)).toBe(0);
  });

  it("is not fooled by one huge buy order or a 1-silver troll sell order", () => {
    expect(rowValue([1, 5_000_000, [10000, 11000, 0, 0, 0, 0], none])).toBe(11000);
    expect(rowValue([1, 0, none, [1, 48000, 50000, 52000, 0, 0]])).toBe(48000);
    expect(rowValue([1, 0, none, none])).toBe(0);
  });

  it("prices a kill: each item, each side's gear, the victim's bag and the silver lost, without changing the cached event", () => {
    const original = killEvent(1, "2026-11-14T10:00:00Z", GID, "x");
    const before = JSON.stringify(original);
    const event = priceEvent(original, table);
    expect(event.killer.gear.MainHand.value).toBe(61000);
    expect(event.killer.gearValue).toBe(61000);
    expect(event.victim.gearValue).toBe(12000);
    expect(event.victim.inventory).toEqual([{ type: "T4_RUNE", quality: 1, count: 10, value: 1200 }]);
    expect(event.victim.inventoryValue).toBe(1200);
    expect(event.value).toBe(13200);
    expect(JSON.stringify(original)).toBe(before);
  });

  it("keeps the ten biggest helpers of a big fight and sums up the rest", () => {
    const fighter = { Id: "x", Name: "X", Equipment: {}, Inventory: [] };
    const participants = Array.from({ length: 14 }, (_, i) => ({ Name: `P${i}`, DamageDone: 100 - i, SupportHealingDone: 0 }));
    const [event] = parseEvents([{ EventId: 1, TimeStamp: "2026-11-14T10:00:00Z", Killer: fighter, Victim: fighter, Participants: participants }]);
    expect(event.helpers).toHaveLength(10);
    expect(event.otherHelpers).toEqual({ count: 4, damage: 90 + 89 + 88 + 87, heal: 0 });
  });
});

describe("priced killboard", () => {
  it("asks for the prices of every item on the board once", async () => {
    const { call, deps } = setup();
    deps.values = vi.fn(async () => ({ table, complete: true }));
    const res = await call("killboard", { query: { region: "eu", id: GID } });
    expect(res).toMatchObject({ maxAge: 300, body: { priced: true, pricesComplete: true } });
    expect(deps.values).toHaveBeenCalledTimes(1);
    expect(deps.values.mock.calls[0][1]).toEqual(["T6_2H_BOW", "T5_MAIN_SWORD", "T4_RUNE"]);
    expect(res.body.kills[0].value).toBe(13200);
  });

  it("says so when there were more items than the price lookup takes", async () => {
    const { call, deps } = setup();
    deps.values = vi.fn(async () => ({ table, complete: false }));
    expect((await call("killboard", { query: { region: "eu", id: GID } })).body).toMatchObject({ priced: true, pricesComplete: false });
  });

  it("still shows the board without prices, and does not keep it for everyone", async () => {
    const { call, deps } = setup();
    deps.values = vi.fn(async () => {
      throw new Error("prices unavailable");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call("killboard", { query: { region: "eu", id: GID } });
    spy.mockRestore();
    expect(res).toMatchObject({ status: 200, maxAge: 0, body: { priced: false, pricesComplete: false } });
    expect(res.body.kills[0].value).toBe(0);
  });
});
