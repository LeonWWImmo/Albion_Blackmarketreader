import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleBilling, isPremium, isValidSignature, userSignature } from "../_lib/billing.js";
import { createMemoryBillingStore } from "../_lib/billingStore.js";

const SECRET = "whsec-test";
const NOW = new Date("2026-11-21T12:00:00Z");
const ANN = "11111111-2222-4333-8444-555555555555";
const BO = "66666666-7777-4888-9999-000000000000";
const CHECKOUT = "https://blackmarketreader.lemonsqueezy.com/buy/abc-123";

const sign = (raw) => createHmac("sha256", SECRET).update(raw).digest("hex");

function subscriptionEvent({ name = "subscription_created", id = "42", user = ANN, sig, status = "active", updatedAt = "2026-11-21T10:00:00Z", endsAt = null, testMode = false } = {}) {
  const custom = user ? { user_id: user, user_sig: sig === undefined ? userSignature(SECRET, user) : sig } : null;
  return {
    meta: { event_name: name, test_mode: testMode, ...(custom ? { custom_data: custom } : {}) },
    data: {
      type: "subscriptions",
      id,
      attributes: { customer_id: 7, variant_id: 9, status, renews_at: "2026-12-21T10:00:00Z", ends_at: endsAt, test_mode: testMode, updated_at: updatedAt }
    }
  };
}

function setup({ env = {} } = {}) {
  const store = createMemoryBillingStore();
  const users = { "token-ann": { id: ANN, email: "ann@example.com" }, "token-bo": { id: BO, email: null } };
  const deps = {
    store,
    userFromToken: async (token) => users[token] ?? null,
    now: () => NOW,
    env: { webhookSecret: SECRET, checkoutUrl: CHECKOUT, portalUrl: "https://blackmarketreader.lemonsqueezy.com/billing", allowTestMode: false, ...env }
  };
  const hook = (event, signature) => {
    const raw = Buffer.from(JSON.stringify(event));
    return handleBilling("webhook", { method: "POST", rawBody: raw, signature: signature === undefined ? sign(raw) : signature, token: null }, deps);
  };
  const get = (action, token) => handleBilling(action, { method: "GET", rawBody: null, signature: null, token }, deps);
  return { store, deps, hook, get };
}

describe("isValidSignature", () => {
  it("accepts only the HMAC of the exact body", () => {
    const raw = Buffer.from('{"a":1}');
    expect(isValidSignature(SECRET, raw, sign(raw))).toBe(true);
    expect(isValidSignature(SECRET, Buffer.from('{"a": 1}'), sign(raw))).toBe(false);
    expect(isValidSignature("other", raw, sign(raw))).toBe(false);
    expect(isValidSignature(SECRET, raw, "nothex")).toBe(false);
    expect(isValidSignature(undefined, raw, sign(raw))).toBe(false);
  });
});

describe("isPremium", () => {
  const row = (status, endsAt = null) => ({ status, endsAt });
  it("follows Lemon Squeezy's statuses", () => {
    expect(isPremium(null, NOW)).toBe(false);
    for (const s of ["on_trial", "active", "past_due"]) expect(isPremium(row(s), NOW)).toBe(true);
    for (const s of ["paused", "unpaid", "expired"]) expect(isPremium(row(s), NOW)).toBe(false);
    expect(isPremium(row("cancelled", "2026-11-30T00:00:00Z"), NOW)).toBe(true);
    expect(isPremium(row("cancelled", "2026-11-20T00:00:00Z"), NOW)).toBe(false);
    expect(isPremium(row("cancelled"), NOW)).toBe(false);
  });
});

describe("webhook", () => {
  it("stores a new subscription for the player in the checkout's custom data", async () => {
    const { store, hook, get } = setup();
    expect((await hook(subscriptionEvent())).status).toBe(200);
    expect(store.rows.get(ANN)).toMatchObject({ subscriptionId: "42", customerId: "7", variantId: "9", status: "active" });
    expect((await get("status", "token-ann")).body).toMatchObject({ premium: true, status: "active", renewsAt: "2026-12-21T10:00:00Z", open: true });
  });

  it("refuses a missing or wrong signature and stores nothing", async () => {
    const { store, hook } = setup();
    expect((await hook(subscriptionEvent(), "0".repeat(64))).status).toBe(401);
    expect((await hook(subscriptionEvent(), null)).status).toBe(401);
    expect(store.rows.size).toBe(0);
  });

  it("finds the player of a later event by the subscription id", async () => {
    const { store, hook } = setup();
    await hook(subscriptionEvent());
    await hook(subscriptionEvent({ name: "subscription_cancelled", user: null, status: "cancelled", endsAt: "2026-12-21T10:00:00Z", updatedAt: "2026-11-21T11:00:00Z" }));
    expect(store.rows.get(ANN)).toMatchObject({ status: "cancelled", endsAt: "2026-12-21T10:00:00Z" });
  });

  it("keeps the newest state when events arrive out of order", async () => {
    const { store, hook } = setup();
    await hook(subscriptionEvent({ status: "expired", updatedAt: "2026-11-21T11:00:00Z" }));
    const late = await hook(subscriptionEvent({ name: "subscription_updated", status: "active", updatedAt: "2026-11-21T10:00:00Z" }));
    expect(late.body.ignored).toBe("older event");
    expect(store.rows.get(ANN).status).toBe("expired");
  });

  it("ignores test-mode subscriptions unless testing is switched on", async () => {
    const off = setup();
    expect((await off.hook(subscriptionEvent({ testMode: true }))).body.ignored).toBe("test mode");
    expect(off.store.rows.size).toBe(0);
    const on = setup({ env: { allowTestMode: true } });
    await on.hook(subscriptionEvent({ testMode: true }));
    expect(on.store.rows.get(ANN).testMode).toBe(true);
  });

  it("answers 200 to other events and 500 to a subscription nobody can be found for", async () => {
    const { store, hook } = setup();
    expect((await hook({ meta: { event_name: "order_created" }, data: { type: "orders", id: "1", attributes: {} } })).body.ignored).toBeTruthy();
    expect((await hook(subscriptionEvent({ user: null }))).status).toBe(500);
    expect((await hook(subscriptionEvent({ user: "not-a-uuid" }))).status).toBe(500);
    expect(store.rows.size).toBe(0);
  });

  it("gives nothing to a player id that was edited in the checkout link", async () => {
    const { store, hook } = setup();
    expect((await hook(subscriptionEvent({ user: BO, sig: userSignature(SECRET, ANN) }))).status).toBe(500);
    expect((await hook(subscriptionEvent({ user: BO, sig: null }))).status).toBe(500);
    expect((await hook(subscriptionEvent({ user: BO, sig: userSignature("guessed", BO) }))).status).toBe(500);
    expect(store.rows.size).toBe(0);
  });

  it("a player who subscribes again: the late end of the old subscription does not replace the new one", async () => {
    const { store, hook, get } = setup();
    await hook(subscriptionEvent({ id: "A", updatedAt: "2026-10-01T00:00:00Z" }));
    await hook(subscriptionEvent({ id: "B", updatedAt: "2026-11-21T09:00:00Z" }));
    const late = await hook(subscriptionEvent({ name: "subscription_expired", id: "A", status: "expired", updatedAt: "2026-11-21T10:00:00Z" }));
    expect(late.body.ignored).toBe("ended subscription next to a running one");
    expect(store.rows.get(ANN)).toMatchObject({ subscriptionId: "B", status: "active" });
    expect((await get("status", "token-ann")).body.premium).toBe(true);
  });

  it("a new subscription replaces one that has ended", async () => {
    const { store, hook } = setup();
    await hook(subscriptionEvent({ id: "A", status: "expired", updatedAt: "2026-10-01T00:00:00Z" }));
    await hook(subscriptionEvent({ id: "B" }));
    expect(store.rows.get(ANN)).toMatchObject({ subscriptionId: "B", status: "active" });
  });

  it("a test purchase never replaces a real subscription, even while testing is on", async () => {
    const { store, hook } = setup({ env: { allowTestMode: true } });
    await hook(subscriptionEvent({ id: "real" }));
    expect((await hook(subscriptionEvent({ id: "test", testMode: true }))).body.ignored).toBe("test subscription next to a real one");
    expect(store.rows.get(ANN)).toMatchObject({ subscriptionId: "real", testMode: false });
  });

  it("only takes POST", async () => {
    const { deps } = setup();
    expect((await handleBilling("webhook", { method: "GET", rawBody: null, signature: null, token: null }, deps)).status).toBe(405);
  });
});

describe("status and checkout", () => {
  it("need a signed-in player", async () => {
    const { get } = setup();
    expect((await get("status", null)).status).toBe(401);
    expect((await get("checkout", "nope")).status).toBe(401);
  });

  it("status without a subscription: free, no portal link", async () => {
    const { get } = setup();
    expect((await get("status", "token-bo")).body).toEqual({ premium: false, status: null, renewsAt: null, endsAt: null, open: true, portalUrl: null });
  });

  it("checkout carries the player's id and email", async () => {
    const { get } = setup();
    const { body } = await get("checkout", "token-ann");
    const url = new URL(body.url);
    expect(url.origin + url.pathname).toBe(CHECKOUT);
    expect(url.searchParams.get("checkout[custom][user_id]")).toBe(ANN);
    expect(url.searchParams.get("checkout[custom][user_sig]")).toBe(userSignature(SECRET, ANN));
    expect(url.searchParams.get("checkout[email]")).toBe("ann@example.com");
    expect(new URL((await get("checkout", "token-bo")).body.url).searchParams.has("checkout[email]")).toBe(false);
  });

  it("checkout refuses a second subscription", async () => {
    const { hook, get } = setup();
    await hook(subscriptionEvent());
    expect((await get("checkout", "token-ann")).status).toBe(409);
  });

  it("is closed while no checkout link is set", async () => {
    const { get } = setup({ env: { checkoutUrl: undefined } });
    expect((await get("checkout", "token-ann")).status).toBe(503);
    expect((await get("status", "token-ann")).body.open).toBe(false);
  });

  it("works without a database (local dev): nobody has premium", async () => {
    const { deps } = setup();
    const res = await handleBilling("status", { method: "GET", rawBody: null, signature: null, token: "token-ann" }, { ...deps, store: null });
    expect(res.body.premium).toBe(false);
  });

  it("unknown actions are 404", async () => {
    const { get } = setup();
    expect((await get("refund", "token-ann")).status).toBe(404);
  });
});
