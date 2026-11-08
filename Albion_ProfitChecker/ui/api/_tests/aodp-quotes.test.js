import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMemory, getQuotes } from "../_lib/aodp.js";

const AODP_ROW = {
  item_id: "T4_BAG",
  city: "Martlock",
  quality: 1,
  sell_price_min: 3234,
  sell_price_min_date: "2026-11-08T10:00:00",
  buy_price_max: 2900,
  buy_price_max_date: "2026-11-08T09:00:00"
};

let fetchMock;

beforeEach(() => {
  clearMemory();
  fetchMock = vi.fn(async () => ({ status: 200, text: async () => JSON.stringify([AODP_ROW]) }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("getQuotes", () => {
  it("shares one AODP call between visitors asking the same thing at once, then remembers it", async () => {
    const answers = await Promise.all([getQuotes("eu", "T4_BAG"), getQuotes("eu", "T4_BAG"), getQuotes("eu", "T4_BAG")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const answer of answers) {
      expect(answer.status).toBe(200);
      expect(answer.body.quotes).toEqual([["T4_BAG", "Martlock", 1, 3234, expect.any(Number), 2900, expect.any(Number)]]);
    }
    await getQuotes("eu", "T4_BAG");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getQuotes("us", "T4_BAG");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("answers 502 when AODP fails, and 400 for bad input without calling it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await getQuotes("eu", "T5_BAG")).status).toBe(502);
    expect((await getQuotes("xx", "T4_BAG")).status).toBe(400);
    expect((await getQuotes("eu", "T4_BAG,T5_BAG,T6_BAG,T7_BAG,T8_BAG,T3_BAG")).status).toBe(400);
  });
});
