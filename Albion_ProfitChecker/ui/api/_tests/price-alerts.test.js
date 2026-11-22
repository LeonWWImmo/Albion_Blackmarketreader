import { describe, expect, it } from "vitest";
import { alertHits, alertMessage, alertPrice, handleAlerts, MAX_ALERTS, memoryAlertStore, readAlert } from "../_lib/priceAlerts.js";

const NOW = new Date("2026-11-21T20:00:00Z");
const HOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz";

const row = (city, quality, sell, buy, stamp = "2026-11-21T19:30:00") => ({
  item_id: "T6_BAG",
  city,
  quality,
  sell_price_min: sell,
  sell_price_min_date: stamp,
  buy_price_max: buy,
  buy_price_max_date: stamp
});

const BODY = { region: "eu", itemId: "T6_BAG", itemName: "Expert's Bag", path: "/prices/expert-s-bag", quality: 1, market: "ANY", side: "below", price: 20000 };

describe("readAlert", () => {
  it("takes a good alert and refuses broken ones", () => {
    expect(readAlert(BODY).alert).toMatchObject({ itemId: "T6_BAG", price: 20000, market: "ANY" });
    expect(readAlert({ ...BODY, region: "asia" }).error).toBeTruthy();
    expect(readAlert({ ...BODY, itemId: "<script>" }).error).toBeTruthy();
    expect(readAlert({ ...BODY, path: "https://evil.example" }).error).toBeTruthy();
    expect(readAlert({ ...BODY, market: "Black Market" }).error).toMatch(/Black Market/);
    expect(readAlert({ ...BODY, market: "Black Market", side: "above" }).alert).toBeTruthy();
    expect(readAlert({ ...BODY, price: 0 }).error).toBeTruthy();
    expect(readAlert({ ...BODY, quality: 6 }).error).toBeTruthy();
  });
});

describe("alertPrice", () => {
  const alert = { item_id: "T6_BAG", market: "ANY", side: "below", quality: 2, price: 20000 };

  it("below: the cheapest fresh listing of that quality or better, never the Black Market", () => {
    const rows = [
      row("Martlock", 1, 15000, 0), // worse quality
      row("Lymhurst", 2, 19000, 0),
      row("Thetford", 3, 21000, 0),
      row("Black Market", 2, 100, 0),
      row("Bridgewatch", 2, 12000, 0, "2026-11-21T10:00:00") // too old
    ];
    expect(alertPrice(alert, rows, NOW)).toMatchObject({ price: 19000, market: "Lymhurst" });
    expect(alertHits(alert, alertPrice(alert, rows, NOW))).toBe(true);
    expect(alertPrice({ ...alert, market: "Thetford" }, rows, NOW)).toMatchObject({ price: 21000 });
  });

  it("above: the best buy order an item of that quality fills", () => {
    const above = { ...alert, side: "above", price: 30000 };
    const rows = [row("Black Market", 1, 0, 28000), row("Black Market", 2, 0, 31000), row("Black Market", 3, 0, 50000)];
    expect(alertPrice(above, rows, NOW)).toMatchObject({ price: 31000, market: "Black Market" });
    expect(alertHits(above, alertPrice(above, rows, NOW))).toBe(true);
    expect(alertPrice(above, [row("Black Market", 1, 0, 0)], NOW)).toBeNull();
  });
});

describe("alertMessage", () => {
  it("says what hit, where and links the item", () => {
    const msg = alertMessage(
      { item_id: "T6_BAG", item_name: "Expert's Bag", path: "/prices/expert-s-bag", quality: 1, region: "eu", side: "below", price: 20000 },
      { price: 19000, market: "Lymhurst", at: Date.parse("2026-11-21T19:30:00Z") }
    );
    const embed = msg.embeds[0];
    expect(embed.title).toBe("🔔 Buy now: Expert's Bag at 19.000");
    expect(embed.author.name).toBe("Price alert · Instant buy");
    expect(embed.url).toBe("https://blackmarketreader.com/prices/expert-s-bag");
    expect(embed.description).toContain("Lymhurst");
    expect(embed.fields[2].value).toBe(`<t:${Date.parse("2026-11-21T19:30:00Z") / 1000}:R>`);
  });
});

describe("handleAlerts", () => {
  const setup = (opts = {}) => {
    const store = memoryAlertStore();
    const posts = [];
    let rows = [];
    const deps = {
      store,
      actionsSecret: "s3cret",
      userFromToken: async (token) => (["paid", "lapsed"].includes(token) ? { id: token } : null),
      premium: async (id) => id === "paid" || (id === "lapsed" && opts.lapsedPremium),
      discord: {
        check: async (url) => (url === HOOK ? "price-pings" : null),
        post: async (url, payload) => {
          posts.push(payload);
          return opts.gone ? "gone" : "ok";
        }
      },
      fetchRows: async () => rows,
      now: () => NOW
    };
    const call = (action, token, body) => handleAlerts(action, { method: action === "alerts" ? "GET" : "POST", token, body }, deps);
    const run = (token = "s3cret") => handleAlerts("alerts-run", { method: "GET", token }, deps);
    return { store, posts, deps, call, run, setRows: (next) => (rows = next) };
  };

  it("is for premium players only", async () => {
    const { call } = setup();
    expect((await call("alerts", null)).status).toBe(401);
    expect((await call("alerts", "lapsed")).status).toBe(403);
    expect((await call("alert-save", "lapsed", BODY)).status).toBe(403);
    expect((await call("alerts", "paid")).body).toEqual({ alerts: [], hook: null, limit: MAX_ALERTS });
  });

  it("connects a webhook with a greeting, never shows its link", async () => {
    const { call, posts } = setup();
    expect((await call("alert-hook", "paid", { url: "https://example.com/x" })).status).toBe(400);
    const ok = await call("alert-hook", "paid", { url: HOOK });
    expect(ok.body.hook).toEqual({ name: "price-pings" });
    expect(JSON.stringify(ok.body)).not.toContain("webhooks");
    expect(posts[0].embeds[0].title).toBe("🔔 Price alerts on");
  });

  it("saves, lists, limits and deletes alerts", async () => {
    const { call } = setup();
    const saved = await call("alert-save", "paid", BODY);
    expect(saved.body.alerts).toHaveLength(1);
    expect(saved.body.alerts[0]).toMatchObject({ itemId: "T6_BAG", side: "below", price: 20000, armed: true, firedAt: null });
    for (let i = 1; i < MAX_ALERTS; i += 1) await call("alert-save", "paid", BODY);
    expect((await call("alert-save", "paid", BODY)).status).toBe(409);
    const id = saved.body.alerts[0].id;
    expect((await call("alert-delete", "lapsed", { id })).status).toBe(403);
    expect((await call("alert-delete", "paid", { id })).body.alerts).toHaveLength(MAX_ALERTS - 1);
    expect((await call("alert-delete", "paid", { id })).status).toBe(404);
  });

  it("the run needs the actions secret, fires once and re-arms when the price went back", async () => {
    const { call, run, posts, setRows } = setup();
    await call("alert-hook", "paid", { url: HOOK });
    await call("alert-save", "paid", BODY);
    posts.length = 0;
    expect((await run("nope")).status).toBe(401);

    setRows([row("Lymhurst", 1, 19000, 0)]);
    expect((await run()).body).toMatchObject({ checked: 1, fired: 1 });
    expect(posts).toHaveLength(1);
    expect((await call("alerts", "paid")).body.alerts[0]).toMatchObject({ armed: false, firedPrice: 19000, firedAt: NOW.toISOString() });

    expect((await run()).body).toMatchObject({ fired: 0 }); // still low: no second message
    setRows([row("Lymhurst", 1, 25000, 0)]);
    expect((await run()).body).toMatchObject({ rearmed: 1 });
    setRows([row("Lymhurst", 1, 18000, 0)]);
    expect((await run()).body).toMatchObject({ fired: 1 });
    expect(posts).toHaveLength(2);
  });

  it("skips players whose premium ended and drops a webhook Discord deleted", async () => {
    const lapsed = setup({ lapsedPremium: true });
    await lapsed.call("alert-hook", "lapsed", { url: HOOK });
    await lapsed.call("alert-save", "lapsed", BODY);
    lapsed.deps.premium = async (id) => id === "paid";
    lapsed.setRows([row("Lymhurst", 1, 19000, 0)]);
    expect((await lapsed.run()).body).toMatchObject({ checked: 0, fired: 0 });

    const gone = setup({ gone: true });
    await gone.store.saveAlertHook("paid", HOOK, "x");
    await gone.call("alert-save", "paid", BODY);
    gone.setRows([row("Lymhurst", 1, 19000, 0)]);
    expect((await gone.run()).body).toMatchObject({ fired: 0, failed: 1 });
    expect(await gone.store.getAlertHook("paid")).toBeNull();
  });
});
