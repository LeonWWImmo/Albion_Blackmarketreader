// The City Crafter's free preview (api/_lib/cityTeaser.js) must price crafts exactly like the page
// (src/features/city-crafter/core/cityCraft.ts with the standard settings), and only hand out the
// top 3 per city.
import { describe, expect, it } from "vitest";
import { cityTeaser, teaserCraft, teaserRecipes, TEASER_CITY, TEASER_SETTINGS } from "../_lib/cityTeaser.js";
import { clearLiveCache, createMemoryMarketStore, handleMarket, LIVE_LOCATIONS } from "../_lib/marketLive.js";
import { liveBook } from "../../src/features/city-crafter/core/books";
import { priceCraft } from "../../src/features/city-crafter/core/cityCraft";

const NOW = 29_000_000;
const RECIPES = teaserRecipes();
const pick = (id) => RECIPES.find((r) => r.itemId === id);

/** A snapshot from { id: { city: [sell, buy] } } (10 minutes old) and { id: { city: [sold, avg] } }. */
function snapOf(prices, volume = {}) {
  return {
    locations: LIVE_LOCATIONS,
    prices: Object.fromEntries(Object.entries(prices).map(([id, rec]) => [id, LIVE_LOCATIONS.map((c) => (rec[c] ? [rec[c][0], NOW - 10, rec[c][1], NOW - 10] : 0))])),
    volume: Object.fromEntries(Object.entries(volume).map(([id, rec]) => [id, LIVE_LOCATIONS.map((c) => rec[c] ?? 0)]))
  };
}

const snap = snapOf(
  {
    T4_PLANKS: { Lymhurst: [100, 0], Thetford: [80, 0] },
    "T4_PLANKS_LEVEL1@1": { Lymhurst: [300, 0], Martlock: [290, 0] },
    T4_2H_BOW: { Lymhurst: [5200, 0], Martlock: [5100, 0] },
    "T4_2H_BOW@1": { Lymhurst: [14000, 0] },
    T4_METALBAR: { Lymhurst: [150, 0], Caerleon: [140, 0] },
    T4_LEATHER: { Lymhurst: [120, 0] },
    T4_ARTEFACT_2H_CLEAVER_HELL: { "Fort Sterling": [5000, 0], Caerleon: [4800, 0] },
    T4_2H_CLEAVER_HELL: { Lymhurst: [16000, 0] }
  },
  { T4_2H_BOW: { Lymhurst: [20, 5000], Martlock: [5, 5200] }, "T4_2H_BOW@1": { Lymhurst: [8, 13000] }, T4_2H_CLEAVER_HELL: { Lymhurst: [4, 15000] } }
);

const standard = (city) => ({ city, matFrom: "cheapest", buy: "instant", sell: "order", focus: false, taxRate: TEASER_SETTINGS.taxRate, usageFee: TEASER_SETTINGS.usageFee, tiers: [4], enchants: [0, 1] });

describe("cityTeaser", () => {
  it("prices each craft like the page with the standard settings", () => {
    const book = liveBook(snap, NOW);
    for (const [id, enchant, city] of [
      ["2H_BOW", 0, "Lymhurst"],
      ["2H_BOW", 0, "Martlock"],
      ["2H_BOW", 1, "Lymhurst"],
      ["2H_CLEAVER_HELL", 0, "Lymhurst"]
    ]) {
      const page = priceCraft(book, pick(id), 4, enchant, standard(city));
      const server = teaserCraft(snap, pick(id), 4, enchant, city, NOW);
      expect(server, `${id} ${enchant} ${city}`).not.toBeNull();
      expect(server.cost).toBeCloseTo(page.cost, 6);
      expect(server.profit).toBeCloseTo(page.profit, 6);
      expect(server.roi).toBeCloseTo(page.roi, 6);
      expect(server.bonusCity).toBe(page.bonusCity);
      expect(server.materials.map((m) => [m.id, m.city, m.unit])).toEqual(page.materials.map((m) => [m.id, m.city, m.unit]));
      expect(server.artefact?.city).toBe(page.artefact?.city);
      expect(server.name).toBe(page.name);
    }
  });

  it("hands out Lymhurst only, at most three rows, best profit a day first", () => {
    const cities = cityTeaser(snap, RECIPES, NOW);
    expect(cities.map((c) => c.city)).toEqual([TEASER_CITY]);
    const lym = cities.find((c) => c.city === "Lymhurst");
    expect(lym.top.length).toBeLessThanOrEqual(3);
    expect(lym.top.map((r) => r.id).sort()).toEqual(["T4_2H_BOW", "T4_2H_BOW@1", "T4_2H_CLEAVER_HELL"]);
    for (let i = 1; i < lym.top.length; i++) expect(lym.top[i - 1].dailyProfit).toBeGreaterThanOrEqual(lym.top[i].dailyProfit);
  });
});

describe("/api/market/teaser", () => {
  it("is public, cached by the CDN, and has only the top 3", async () => {
    clearLiveCache();
    const store = createMemoryMarketStore();
    const deps = { store, now: () => new Date(NOW * 60000), userFromToken: async () => null, premium: async () => false };
    const call = (query) => handleMarket("teaser", { method: "GET", query, token: null, body: null }, deps);
    expect((await call({ region: "xx" })).status).toBe(400);
    expect((await call({ region: "eu" })).status).toBe(404);
    await store.write("eu", { prices: snap.prices, pricesAt: new Date(NOW * 60000).toISOString(), volume: snap.volume, volumeAt: "x" });
    const answer = await call({ region: "eu" });
    expect(answer.status).toBe(200);
    expect(answer.maxAge).toBeGreaterThan(0);
    expect(answer.body.cities.every((c) => c.top.length <= 3)).toBe(true);
    expect(answer.body.settings).toEqual(TEASER_SETTINGS);
  });
});
