// Market depth (api/_lib/marketDepth.js) and its ingest / premium answer (api/_lib/marketLive.js).
import { describe, expect, it } from "vitest";
import { addOrders, bookFromJson, bookToJson, craftableFilter, DEPTH_KEEP_MIN, pruneBook, summarizeBook, validDepth } from "../_lib/marketDepth.js";
import { clearLiveCache, createMemoryMarketStore, handleMarket } from "../_lib/marketLive.js";

const NOW = 29_000_000;
const EXPIRES = "2026-12-24T10:00:00";
const order = (Id, ItemTypeId, LocationId, UnitPriceSilver, Amount, AuctionType = "offer", QualityLevel = 1) => ({ Id, ItemTypeId, LocationId, UnitPriceSilver, Amount, AuctionType, QualityLevel, Expires: EXPIRES });

describe("the order book", () => {
  it("keeps the eight markets' orders, newest sighting per order", () => {
    const book = new Map();
    const added = addOrders(book, [order(1, "T4_BAG", 3008, 2100, 3), order(2, "T4_BAG", 9999, 1, 1), order(3, "junk", 3008, 1, 1), order(4, "T4_BAG", 3008, 0, 1)], NOW);
    expect(added).toBe(1);
    addOrders(book, [order(1, "T4_BAG", 3008, 2100, 2)], NOW + 5);
    expect(book.get("1")).toEqual(["T4_BAG", 5, 1, 2100, 2, 0, NOW + 5, expect.any(Number)]);
  });

  it("drops expired, long unseen and orders missing from a newer view of the same page", () => {
    const book = new Map();
    addOrders(book, [order(1, "T4_BAG", 3008, 2100, 3), order(2, "T4_BAG", 3008, 2500, 1), order(3, "T4_BAG", 3008, 9000, 1)], NOW);
    // 20 minutes later a player looks again: 2100 and 2600 are there, 2500 (inside that range) is not
    addOrders(book, [order(1, "T4_BAG", 3008, 2100, 3), order(5, "T4_BAG", 3008, 2600, 4)], NOW + 20);
    addOrders(book, [{ ...order(6, "T5_BAG", 3008, 100, 1), Expires: "2020-01-01T00:00:00" }], NOW + 20);
    addOrders(book, [order(7, "T6_BAG", 3008, 100, 1)], NOW - DEPTH_KEEP_MIN - 1);
    expect(pruneBook(book, NOW + 20)).toBe(3);
    expect([...book.keys()].sort()).toEqual(["1", "3", "5"]); // 9000 lies outside the range seen
  });

  it("summarises per item and market: sell levels cheapest first, buy levels best first with quality", () => {
    const book = new Map();
    addOrders(
      book,
      [
        order(1, "T4_BAG", 3008, 2100, 3),
        order(2, "T4_BAG", 3008, 2100, 2),
        order(3, "T4_BAG", 3008, 2000, 1),
        order(4, "T4_BAG", 3003, 5000, 4, "request", 2),
        order(5, "T4_BAG", 3003, 5100, 1, "request", 1)
      ],
      NOW
    );
    const sum = summarizeBook(book);
    expect(sum.T4_BAG[5]).toEqual([[[2000, 1], [2100, 5]], 6, [], 0, NOW]);
    expect(sum.T4_BAG[0]).toEqual([[], 0, [[5100, 1, 1], [5000, 4, 2]], 5, NOW]);
    expect(sum.T4_BAG[1]).toBe(0);
    expect(validDepth(sum)).toBe(true);
    expect(validDepth({ T4_BAG: [1, 2] })).toBe(false);
    expect(bookFromJson(bookToJson(book))).toEqual(book);
    expect(bookFromJson("nonsense").size).toBe(0);
  });

  it("keeps the craftable items only, when asked", () => {
    const book = new Map();
    addOrders(book, [order(1, "T4_BAG@1", 3008, 2100, 3), order(2, "T4_POTION_HEAL", 3008, 50, 9)], NOW);
    const keep = craftableFilter({ categories: [{ key: "bags", items: [{ id: "BAG" }] }] });
    expect(Object.keys(summarizeBook(book, keep))).toEqual(["T4_BAG@1"]);
  });
});

describe("/api/market depth", () => {
  const setup = () => {
    clearLiveCache();
    const store = createMemoryMarketStore();
    const deps = {
      store,
      actionsSecret: "s3cret",
      userFromToken: async (t) => (t === "ann" ? { id: "ann" } : t === "bo" ? { id: "bo" } : null),
      premium: async (id) => id === "ann",
      now: () => new Date("2026-11-23T10:00:00Z")
    };
    return { store, deps, call: (action, req) => handleMarket(action, { method: "GET", query: {}, token: null, body: null, ...req }, deps) };
  };
  const depth = { T4_BAG: [0, 0, 0, 0, 0, [[[2000, 1]], 1, [], 0, NOW], 0, 0] };

  it("stores a summary from the job and gives it to premium players only", async () => {
    const { call } = setup();
    expect((await call("ingest", { method: "POST", token: "nope", body: { region: "eu", depth } })).status).toBe(401);
    expect((await call("ingest", { method: "POST", token: "s3cret", body: { region: "eu", depth: { T4_BAG: [1] } } })).status).toBe(400);
    expect((await call("depth", { query: { region: "eu" }, token: "ann" })).status).toBe(404);
    const stored = await call("ingest", { method: "POST", token: "s3cret", body: { region: "eu", depth } });
    expect(stored.body).toMatchObject({ region: "eu", depth: 1, prices: null });
    expect((await call("depth", { query: { region: "eu" } })).status).toBe(401);
    expect((await call("depth", { query: { region: "eu" }, token: "bo" })).status).toBe(403);
    const answer = await call("depth", { query: { region: "eu" }, token: "ann" });
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.raw)).toMatchObject({ region: "eu", depthAt: "2026-11-23T10:00:00.000Z", depth });
  });

  it("a depth upload leaves the price snapshot alone", async () => {
    const { call, store } = setup();
    await store.write("eu", { prices: { T4_BAG: [0, 0, 0, 0, 0, 0, 0, 0] }, pricesAt: "x" });
    await call("ingest", { method: "POST", token: "s3cret", body: { region: "eu", depth } });
    expect((await store.read("eu")).prices).toBeTruthy();
  });
});
