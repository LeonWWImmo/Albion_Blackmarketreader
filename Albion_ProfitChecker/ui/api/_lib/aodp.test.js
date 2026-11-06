import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMemory, getFestivities, getGold, getPrices, normalizeRegion, parseFestivities, parseGoldHistory, parseItemIds, parsePrices, sendResult } from "./aodp.js";

// C# ticks for an ISO time, the format AODP uses for event times
const ticks = (iso) => String(BigInt(Date.parse(iso)) * 10000n + 621355968000000000n);

afterEach(() => {
  vi.unstubAllGlobals();
  clearMemory();
});

describe("normalizeRegion", () => {
  it("accepts only eu and us", () => {
    expect(normalizeRegion("EU")).toBe("eu");
    expect(normalizeRegion("us")).toBe("us");
    expect(normalizeRegion("west")).toBeNull();
    expect(normalizeRegion("__proto__")).toBeNull();
    expect(normalizeRegion(undefined)).toBeNull();
  });
});

describe("parseGoldHistory", () => {
  it("reads zone-less timestamps as UTC, rounds, sorts and drops duplicates and junk", () => {
    const points = parseGoldHistory([
      { price: 8470.4, timestamp: "2026-10-18T13:00:00" },
      { price: 8400, timestamp: "2026-10-18T12:00:00Z" },
      { price: 8401, timestamp: "2026-10-18T12:00:00" },
      { price: -1, timestamp: "2026-10-18T11:00:00" },
      { price: 8300, timestamp: "not a date" },
      null
    ]);
    expect(points).toEqual([
      [Date.parse("2026-10-18T12:00:00Z") / 1000, 8401],
      [Date.parse("2026-10-18T13:00:00Z") / 1000, 8470]
    ]);
    expect(parseGoldHistory({})).toEqual([]);
  });
});

describe("parseFestivities", () => {
  it("keeps the daily bonuses and weekly events with ISO times", () => {
    const parsed = parseFestivities({
      ConfirmedAt: "2026-10-18T11:14:48Z",
      ExpiresAt: "2026-10-19T10:00:00Z",
      Events: [
        { Kind: 2, Category: "GENERAL", UniqueName: "COMMON_BAG", StartTime: ticks("2026-10-18T10:00:00Z"), EndTime: ticks("2026-10-19T10:00:00Z") },
        { Kind: 1, Category: "GATHERING", UniqueName: "FISHING", StartTime: ticks("2026-10-19T10:00:00Z"), EndTime: ticks("2026-10-22T10:00:00Z") },
        { Kind: 0, Category: "X", UniqueName: "BLOCKER", StartTime: ticks("2026-10-18T10:00:00Z"), EndTime: ticks("2026-10-19T10:00:00Z") },
        { Kind: 2, Category: "GENERAL", UniqueName: "<script>", StartTime: ticks("2026-10-18T10:00:00Z"), EndTime: ticks("2026-10-19T10:00:00Z") },
        { Kind: 2, Category: "GENERAL", UniqueName: "COMMON_AXE", StartTime: "0", EndTime: "0" }
      ]
    });
    expect(parsed).toEqual({
      confirmed: true,
      confirmedAt: "2026-10-18T11:14:48Z",
      expiresAt: "2026-10-19T10:00:00Z",
      events: [
        { kind: 2, category: "GENERAL", name: "COMMON_BAG", start: "2026-10-18T10:00:00.000Z", end: "2026-10-19T10:00:00.000Z" },
        { kind: 1, category: "GATHERING", name: "FISHING", start: "2026-10-19T10:00:00.000Z", end: "2026-10-22T10:00:00.000Z" }
      ]
    });
    expect(parseFestivities(null)).toEqual({ confirmed: false, confirmedAt: null, expiresAt: null, events: [] });
  });
});

function stubFetch(status, body) {
  const fetchMock = vi.fn(async () => ({ status, text: async () => (body === undefined ? "" : JSON.stringify(body)) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("handlers", () => {
  const now = new Date("2026-10-18T13:30:00Z");

  it("rejects an unknown region without calling AODP", async () => {
    const fetchMock = stubFetch(200, []);
    expect((await getGold("asia", now)).status).toBe(400);
    expect((await getFestivities("", now)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the right host for 90 days of gold, identifying itself and asking for gzip", async () => {
    const fetchMock = stubFetch(200, [{ price: 8470, timestamp: "2026-10-18T13:00:00" }]);
    const result = await getGold("us", now);
    expect(result.status).toBe(200);
    expect(result.maxAge).toBe(600);
    expect(result.body.points).toEqual([[Date.parse("2026-10-18T13:00:00Z") / 1000, 8470]]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://west.albion-online-data.com/api/v2/stats/gold?date=07-20-2026&end_date=10-19-2026");
    expect(init.headers["User-Agent"]).toMatch(/BlackmarketReader/);
    expect(init.headers["Accept-Encoding"]).toMatch(/gzip/);
  });

  it("turns an upstream failure into an uncached 502", async () => {
    stubFetch(500, { error: "x" });
    expect(await getGold("eu", now)).toMatchObject({ status: 502, maxAge: 0 });
    clearMemory();
    stubFetch(200, []);
    expect(await getGold("eu", now)).toMatchObject({ status: 502, maxAge: 0 });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await getFestivities("eu", now)).toMatchObject({ status: 502, maxAge: 0 });
  });

  it("answers an unconfirmed festivities snapshot (404) with an empty, briefly cached list", async () => {
    stubFetch(404);
    const result = await getFestivities("us", now);
    expect(result).toMatchObject({ status: 200, maxAge: 300, body: { region: "us", confirmed: false, events: [] } });
  });
});

describe("memory cache", () => {
  const now = new Date("2026-10-18T13:30:00Z");

  it("calls AODP once per region while the answer is fresh, whatever the query string was", async () => {
    const fetchMock = stubFetch(200, [{ price: 8470, timestamp: "2026-10-18T13:00:00" }]);
    await getGold("eu", now);
    await getGold("EU", now);
    await getGold("eu", now);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getGold("us", now);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a failure for a minute, then asks again", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-18T13:30:00Z") });
    try {
      const fetchMock = stubFetch(503, {});
      await getFestivities("eu", now);
      await getFestivities("eu", now);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.parse("2026-10-18T13:31:01Z"));
      await getFestivities("eu", now);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("sendResult", () => {
  function fakeRes() {
    const headers = {};
    return { headers, statusCode: 0, body: "", setHeader: (k, v) => (headers[k] = v), end(b) { this.body = b; } };
  }

  it("lets the CDN cache good answers and never caches failures", () => {
    const ok = fakeRes();
    sendResult(ok, { status: 200, body: { a: 1 }, maxAge: 600 });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["Cache-Control"]).toBe("public, max-age=60, s-maxage=600, stale-while-revalidate=3600");
    expect(JSON.parse(ok.body)).toEqual({ a: 1 });

    const bad = fakeRes();
    sendResult(bad, { status: 502, body: { error: "x" }, maxAge: 0 });
    expect(bad.headers["Cache-Control"]).toBe("no-store");
  });
});

describe("loot split prices", () => {
  const now = new Date("2026-11-05T20:00:00Z");
  const row = (city, quality, buy, sell, stamp = "2026-11-05T19:00:00") => ({
    item_id: "T5_2H_CROSSBOW@1", city, quality,
    buy_price_max: buy, buy_price_max_date: buy ? stamp : "0001-01-01T00:00:00",
    sell_price_min: sell, sell_price_min_date: sell ? stamp : "0001-01-01T00:00:00"
  });

  it("accepts only clean item ids, sorted and unique, at most 300", () => {
    expect(parseItemIds("T5_2H_CROSSBOW@1,T4_BAG,T4_BAG")).toEqual(["T4_BAG", "T5_2H_CROSSBOW@1"]);
    expect(parseItemIds("")).toBeNull();
    expect(parseItemIds("T4_BAG,../x")).toBeNull();
    expect(parseItemIds("T4_BAG@7")).toBeNull();
    expect(parseItemIds(Array.from({ length: 301 }, (_, i) => "T4_X" + i).join(","))).toBeNull();
  });

  it("keeps the Black Market order and each city's buy and sane sell order per quality", () => {
    const prices = parsePrices([
      row("Black Market", 1, 39000, 0),
      row("Black Market", 1, 41000, 0, "2026-10-20T10:00:00"), // stale: ignored
      row("Caerleon", 1, 30000, 70000),
      row("Lymhurst", 1, 32000, 60000),
      row("Martlock", 1, 0, 400000), // a lone silly listing above 1.5x the median
      row("Brecilien", 1, 90000, 90000), // not a city we value in
      row("Thetford", 2, 0, 0)
    ], now);
    // cities: Caerleon, Bridgewatch, Fort Sterling, Lymhurst, Martlock, Thetford
    expect(prices).toEqual({ "T5_2H_CROSSBOW@1": [[1, 39000, [30000, 0, 0, 32000, 0, 0], [70000, 0, 0, 60000, 0, 0]]] });
  });

  it("asks AODP for every city and quality, refuses bad input without calling it", async () => {
    const fetchMock = stubFetch(200, [row("Black Market", 2, 49000, 0)]);
    expect((await getPrices("eu", "bad id", now)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    const result = await getPrices("eu", "T5_2H_CROSSBOW@1", now);
    expect(result).toMatchObject({ status: 200, maxAge: 300, body: { prices: { "T5_2H_CROSSBOW@1": [[2, 49000, [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]]] } } });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://europe.albion-online-data.com/api/v2/stats/prices/T5_2H_CROSSBOW%401.json?locations=Black%20Market%2CCaerleon%2CBridgewatch%2CFort%20Sterling%2CLymhurst%2CMartlock%2CThetford&qualities=1,2,3,4,5"
    );
  });
});
