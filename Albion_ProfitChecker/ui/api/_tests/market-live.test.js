import { gunzipSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import { sendResult } from "../_lib/aodp.js";
import {
  clearLiveCache,
  createMarketStore,
  createMemoryMarketStore,
  fetchLive,
  handleMarket,
  LIVE_CHUNK,
  LIVE_LOCATIONS,
  liveItemIds,
  allLiveIds,
  parseLivePrices,
  parseLiveVolume
} from "../_lib/marketLive.js";

const NOW = new Date("2026-11-21T20:00:00Z");
const minute = (iso) => Math.round(Date.parse(iso) / 60000);
const at = (name) => LIVE_LOCATIONS.indexOf(name);

const row = (city, quality, sell, buy, stamp = "2026-11-21T19:30:00") => ({
  item_id: "T4_BAG",
  city,
  quality,
  sell_price_min: sell,
  sell_price_min_date: sell ? stamp : "0001-01-01T00:00:00",
  buy_price_max: buy,
  buy_price_max_date: buy ? stamp : "0001-01-01T00:00:00"
});

describe("liveItemIds", () => {
  it("makes tiers 4-8 with enchantments 0-4 of every base code", () => {
    const ids = liveItemIds(["BAG", "2H_AXE"]);
    expect(ids).toHaveLength(50);
    expect(ids.slice(0, 5)).toEqual(["T4_BAG", "T4_BAG@1", "T4_BAG@2", "T4_BAG@3", "T4_BAG@4"]);
    expect(ids).toContain("T8_2H_AXE@4");
  });
});

describe("allLiveIds", () => {
  it("adds the crafting items, their artefacts, refined materials and journals", () => {
    const recipes = { categories: [{ items: [{ id: "MAIN_SWORD_CRYSTAL", artifactId: "ARTEFACT_MAIN_SWORD_CRYSTAL" }, { id: "BAG" }] }] };
    const ids = allLiveIds(["BAG"], recipes);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["T4_BAG", "T8_MAIN_SWORD_CRYSTAL@4", "T6_ARTEFACT_MAIN_SWORD_CRYSTAL", "T5_PLANKS_LEVEL2@2", "T7_METALBAR", "T4_STONEBLOCK", "T8_JOURNAL_MAGE_FULL"]));
    expect(ids).not.toContain("T4_STONEBLOCK_LEVEL1@1");
  });
});

describe("parseLivePrices", () => {
  it("takes the cheapest sell order of any quality and the best quality-1 buy order", () => {
    const out = parseLivePrices(
      [
        row("Martlock", 1, 3000, 2500),
        row("Martlock", 3, 2800, 9000, "2026-11-21T19:00:00"),
        row("Black Market", 1, 0, 5000),
        row("Black Market", 2, 0, 7000)
      ],
      NOW
    );
    expect(out.T4_BAG[at("Martlock")]).toEqual([2800, minute("2026-11-21T19:00:00Z"), 2500, minute("2026-11-21T19:30:00Z")]);
    expect(out.T4_BAG[at("Black Market")]).toEqual([0, 0, 5000, minute("2026-11-21T19:30:00Z")]);
    expect(out.T4_BAG[at("Lymhurst")]).toBe(0);
  });

  it("drops orders older than 3 days and city listings far above the others", () => {
    const out = parseLivePrices(
      [
        row("Martlock", 1, 3000, 0),
        row("Lymhurst", 1, 3100, 0),
        row("Thetford", 1, 9000, 0),
        row("Bridgewatch", 1, 1000, 0, "2026-11-17T10:00:00")
      ],
      NOW
    );
    expect(out.T4_BAG[at("Thetford")]).toBe(0);
    expect(out.T4_BAG[at("Bridgewatch")]).toBe(0);
    expect(out.T4_BAG[at("Martlock")][0]).toBe(3000);
  });

  it("leaves out items without any price and unknown markets", () => {
    expect(parseLivePrices([row("Martlock", 1, 0, 0), row("Nowhere", 1, 5, 5)], NOW)).toEqual({});
  });
});

describe("parseLiveVolume", () => {
  it("averages the sales of the last 7 days over all qualities", () => {
    const series = (quality, data) => ({ item_id: "T4_BAG", location: "Black Market", quality, data });
    const out = parseLiveVolume(
      [
        series(1, [
          { item_count: 70, avg_price: 1000, timestamp: "2026-11-20T00:00:00" },
          { item_count: 500, avg_price: 1, timestamp: "2026-11-01T00:00:00" }
        ]),
        series(2, [{ item_count: 70, avg_price: 2000, timestamp: "2026-11-19T00:00:00" }])
      ],
      NOW
    );
    expect(out.T4_BAG[at("Black Market")]).toEqual([20, 1500]);
    expect(out.T4_BAG[at("Martlock")]).toBe(0);
  });
});

describe("fetchLive", () => {
  it("asks AODP in chunks with gzip and retries a throttled answer", async () => {
    const calls = [];
    let throttled = false;
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (!throttled) {
        throttled = true;
        return { ok: false, status: 429, json: async () => null };
      }
      return { ok: true, status: 200, json: async () => [row("Martlock", 1, 3000, 2500)] };
    };
    const ids = liveItemIds(["BAG", "CAPE", "2H_AXE", "MAIN_SWORD", "HEAD_PLATE_SET1"]);
    const out = await fetchLive("eu", ids, "prices", { fetchImpl, now: NOW, wait: async () => {} });
    expect(calls).toHaveLength(Math.ceil(ids.length / LIVE_CHUNK) + 1);
    expect(calls[0].url).toMatch(/^https:\/\/europe\.albion-online-data\.com\/api\/v2\/stats\/prices\//);
    expect(calls[0].init.headers["Accept-Encoding"]).toMatch(/gzip/);
    expect(out.T4_BAG[at("Martlock")][0]).toBe(3000);
  });

  it("gives up after the retries", async () => {
    const fetchImpl = async () => ({ ok: false, status: 503, json: async () => null });
    await expect(fetchLive("us", ["T4_BAG"], "volume", { fetchImpl, wait: async () => {} })).rejects.toThrow(/AODP 503/);
  });
});

describe("handleMarket", () => {
  const prices = { T4_BAG: LIVE_LOCATIONS.map((_, i) => (i === 0 ? [0, 0, 5000, 100] : 0)) };
  const volume = { T4_BAG: LIVE_LOCATIONS.map((_, i) => (i === 0 ? [12.5, 4800] : 0)) };
  const setup = () => {
    const store = createMemoryMarketStore();
    const deps = {
      store,
      actionsSecret: "s3cret",
      userFromToken: async (token) => (token === "paid" || token === "free" ? { id: token } : null),
      premium: async (id) => id === "paid",
      now: () => NOW
    };
    const ingest = (body, token = "s3cret") => handleMarket("ingest", { method: "POST", token, body }, deps);
    const live = (token, region = "eu") => handleMarket("live", { method: "GET", token, query: { region } }, deps);
    return { store, deps, ingest, live };
  };

  it("stores a snapshot only with the actions secret", async () => {
    const { ingest, store } = setup();
    expect((await ingest({ region: "eu", prices }, "wrong")).status).toBe(401);
    expect((await ingest({ region: "eu", prices }, null)).status).toBe(401);
    expect(await store.read("eu")).toBeNull();
    const ok = await ingest({ region: "eu", prices });
    expect(ok).toMatchObject({ status: 200, body: { region: "eu", prices: 1, volume: null } });
  });

  it("refuses a broken snapshot", async () => {
    const { ingest } = setup();
    expect((await ingest({ region: "asia", prices })).status).toBe(400);
    expect((await ingest({ region: "eu" })).status).toBe(400);
    expect((await ingest({ region: "eu", prices: { T4_BAG: [1, 2] } })).status).toBe(400);
    expect((await ingest({ region: "eu", prices: { "../x": prices.T4_BAG } })).status).toBe(400);
    expect((await ingest({ region: "eu", volume: { T4_BAG: LIVE_LOCATIONS.map(() => [-1, 0]) } })).status).toBe(400);
  });

  beforeEach(() => clearLiveCache());

  it("gives the snapshot to premium players only, never on the CDN", async () => {
    const { ingest, live } = setup();
    await ingest({ region: "eu", prices });
    expect((await live(null)).status).toBe(401);
    expect((await live("free")).status).toBe(403);
    const ok = await live("paid");
    expect(ok.status).toBe(200);
    expect(ok.maxAge).toBe(0);
    expect(ok.etag).toMatch(/^"[\w-]+"$/);
    expect(JSON.parse(ok.raw)).toMatchObject({ region: "eu", locations: LIVE_LOCATIONS, pricesAt: NOW.toISOString(), volumeAt: null, prices, volume: {} });
    expect(JSON.parse(gunzipSync(ok.gzip).toString("utf8"))).toEqual(JSON.parse(ok.raw));
  });

  it("keeps the volume when a later snapshot has prices only", async () => {
    const { ingest, live } = setup();
    await ingest({ region: "eu", prices, volume });
    await ingest({ region: "eu", prices });
    const ok = JSON.parse((await live("paid")).raw);
    expect(ok.volume).toEqual(volume);
    expect(ok.volumeAt).toBe(NOW.toISOString());
  });

  it("reads the snapshot out of the database only when a newer one was stored", async () => {
    const { ingest, live, store, deps } = setup();
    await ingest({ region: "eu", prices });
    let reads = 0;
    let stamps = 0;
    const read = store.read.bind(store);
    const stamp = store.stamp.bind(store);
    store.read = async (r) => (reads++, read(r));
    store.stamp = async (r) => (stamps++, stamp(r));
    const first = await live("paid");
    await live("paid");
    expect([reads, stamps]).toEqual([1, 1]); // the second within a minute: not even the stamp
    deps.now = () => new Date(NOW.getTime() + 2 * 60_000);
    const same = await live("paid");
    expect([reads, stamps]).toEqual([1, 2]); // same snapshot: only the stamp
    expect(same.etag).toBe(first.etag);
    await store.write("eu", { prices, pricesAt: new Date(NOW.getTime() + 30 * 60_000).toISOString() });
    deps.now = () => new Date(NOW.getTime() + 4 * 60_000);
    const next = await live("paid");
    expect(reads).toBe(2);
    expect(next.etag).not.toBe(first.etag);
  });

  it("says when there is no snapshot yet", async () => {
    const { live } = setup();
    expect((await live("paid", "us")).status).toBe(404);
    expect((await live("paid", "mars")).status).toBe(400);
  });
});

describe("sendResult", () => {
  const fakeRes = () => {
    const headers = {};
    return { headers, statusCode: 0, body: null, setHeader: (k, v) => (headers[k] = v), end(b) { this.body = b ?? null; } };
  };
  const big = { status: 200, raw: JSON.stringify({ a: "x".repeat(5000) }), etag: '"abc"', maxAge: 0 };

  it("gzips a private answer for a browser that takes gzip, and answers 304 to a known ETag", () => {
    const res = fakeRes();
    sendResult(res, big, { headers: { "accept-encoding": "gzip, br" } });
    expect(res.headers["Content-Encoding"]).toBe("gzip");
    expect(res.headers["Cache-Control"]).toBe("private, no-cache");
    expect(res.headers.ETag).toBe('"abc"');
    expect(gunzipSync(res.body).toString("utf8")).toBe(big.raw);

    const again = fakeRes();
    sendResult(again, big, { headers: { "if-none-match": '"abc"', "accept-encoding": "gzip" } });
    expect(again.statusCode).toBe(304);
    expect(again.body).toBeNull();
  });

  it("leaves small, public and gzip-less answers as they are", () => {
    const plain = fakeRes();
    sendResult(plain, big, { headers: {} });
    expect(plain.headers["Content-Encoding"]).toBeUndefined();
    expect(plain.body).toBe(big.raw);
    const small = fakeRes();
    sendResult(small, { status: 200, body: { a: 1 }, maxAge: 0 }, { headers: { "accept-encoding": "gzip" } });
    expect(small.body).toBe('{"a":1}');
    expect(small.headers["Cache-Control"]).toBe("no-store");
    const pub = fakeRes();
    sendResult(pub, { status: 200, raw: big.raw, maxAge: 300 }, { headers: { "accept-encoding": "gzip" } });
    expect(pub.headers["Content-Encoding"]).toBeUndefined();
  });
});

describe("createMarketStore (Supabase)", () => {
  // the one row per region as the fake table keeps it, and a minimal supabase-js chain over it
  function fakeDb() {
    const rows = new Map();
    const db = {
      rows,
      from: () => ({
        upsert: async (row) => {
          rows.set(row.region, { ...rows.get(row.region), ...row });
          return { error: null };
        },
        select: (cols) => ({
          eq: (_col, region) => ({
            maybeSingle: async () => {
              const row = rows.get(region);
              return { data: row ? Object.fromEntries(cols.split(", ").map((c) => [c, row[c] ?? null])) : null, error: null };
            }
          })
        })
      })
    };
    return db;
  }

  it("stores the parts gzipped and reads them back", async () => {
    const db = fakeDb();
    const store = createMarketStore(db);
    const prices = { T4_BAG: [[1000, 900]] };
    await store.write("eu", { prices, pricesAt: "2026-11-25T10:00:00Z" });
    const stored = db.rows.get("eu");
    expect(JSON.parse(gunzipSync(Buffer.from(stored.prices_gz, "base64")).toString("utf8"))).toEqual(prices);
    expect(stored.volume_gz).toBeUndefined();
    expect(await store.read("eu")).toEqual({ prices, pricesAt: "2026-11-25T10:00:00Z", volume: null, volumeAt: null });

    const volume = { T4_BAG: [3, 1] };
    await store.write("eu", { volume, volumeAt: "2026-11-25T12:00:00Z" });
    expect(await store.read("eu")).toEqual({ prices, pricesAt: "2026-11-25T10:00:00Z", volume, volumeAt: "2026-11-25T12:00:00Z" });
    expect(await store.stamp("eu")).toEqual({ pricesAt: "2026-11-25T10:00:00Z", volumeAt: "2026-11-25T12:00:00Z" });
    expect(await store.read("us")).toBeNull();
  });
});
