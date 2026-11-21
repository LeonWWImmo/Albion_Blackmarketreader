import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleBilling, hasPremium, isPremium, isValidSignature, premiumOpenFor, rowFromSubscription } from "../_lib/billing.js";
import { createMemoryBillingStore } from "../_lib/billingStore.js";
import { formEncode } from "../_lib/stripeApi.js";

const SECRET = "whsec_test";
const NOW = new Date("2026-11-21T12:00:00Z");
const NOW_S = NOW.getTime() / 1000;
const ANN = "11111111-2222-4333-8444-555555555555";
const BO = "66666666-7777-4888-9999-000000000000";
const DAY = 86400;

const sign = (raw, t = NOW_S, secret = SECRET) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;

function subscription({ id = "sub_A", user = ANN, status = "active", cancelAtPeriodEnd = false, periodEnd = NOW_S + 30 * DAY, endedAt = null, livemode = true, customer = "cus_1" } = {}) {
  return {
    object: "subscription",
    id,
    customer,
    status,
    cancel_at_period_end: cancelAtPeriodEnd,
    cancel_at: null,
    ended_at: endedAt,
    livemode,
    metadata: user ? { user_id: user } : {},
    items: { data: [{ current_period_end: periodEnd, price: { id: "price_1" } }] }
  };
}

const event = (sub, { type = "customer.subscription.updated", created = NOW_S - 60 } = {}) => ({ id: "evt_1", type, created, data: { object: sub } });

function setup({ env = {} } = {}) {
  const store = createMemoryBillingStore();
  const users = { "token-ann": { id: ANN, email: "ann@example.com" }, "token-bo": { id: BO, email: null } };
  const stripe = vi.fn(async (method, path, params) => ({ url: `https://stripe.test/${path}`, params }));
  const deps = {
    store,
    userFromToken: async (token) => users[token] ?? null,
    now: () => NOW,
    env: { stripe, priceId: "price_1", webhookSecret: SECRET, allowTestMode: false, launched: true, siteUrl: "https://blackmarketreader.com", ...env }
  };
  const hook = (body, signature) => {
    const raw = Buffer.from(JSON.stringify(body));
    return handleBilling("webhook", { method: "POST", rawBody: raw, signature: signature === undefined ? sign(raw) : signature, token: null }, deps);
  };
  const call = (action, token, { method = "POST", body = null } = {}) => handleBilling(action, { method, rawBody: null, signature: null, token, body }, deps);
  return { store, stripe, deps, hook, call };
}

describe("isValidSignature", () => {
  const raw = Buffer.from('{"a":1}');
  it("accepts Stripe's signature of the exact body", () => {
    expect(isValidSignature(SECRET, raw, sign(raw), NOW)).toBe(true);
    expect(isValidSignature(SECRET, raw, `${sign(raw)},v1=${"0".repeat(64)}`, NOW)).toBe(true);
  });
  it("refuses a changed body, another secret, an old signature or garbage", () => {
    expect(isValidSignature(SECRET, Buffer.from('{"a": 1}'), sign(raw), NOW)).toBe(false);
    expect(isValidSignature(SECRET, raw, sign(raw, NOW_S, "whsec_other"), NOW)).toBe(false);
    expect(isValidSignature(SECRET, raw, sign(raw, NOW_S - 301), NOW)).toBe(false);
    expect(isValidSignature(SECRET, raw, "t=1,v1=zz", NOW)).toBe(false);
    expect(isValidSignature(SECRET, raw, null, NOW)).toBe(false);
    expect(isValidSignature(undefined, raw, sign(raw), NOW)).toBe(false);
  });
});

describe("isPremium", () => {
  const row = (status, endsAt = null) => ({ status, endsAt });
  it("knows the stored statuses", () => {
    expect(isPremium(null, NOW)).toBe(false);
    for (const s of ["on_trial", "active", "past_due"]) expect(isPremium(row(s), NOW)).toBe(true);
    for (const s of ["paused", "unpaid", "expired", "incomplete", "incomplete_expired"]) expect(isPremium(row(s), NOW)).toBe(false);
    expect(isPremium(row("cancelled", "2026-11-30T00:00:00Z"), NOW)).toBe(true);
    expect(isPremium(row("cancelled", "2026-11-20T00:00:00Z"), NOW)).toBe(false);
  });
});

describe("premiumOpenFor / hasPremium", () => {
  const paid = { status: "active", endsAt: null };
  it("is open to everyone after the launch, before it to the testers only", () => {
    expect(premiumOpenFor({ launched: true }, ANN)).toBe(true);
    expect(premiumOpenFor({ launched: false, testers: [BO] }, ANN)).toBe(false);
    expect(premiumOpenFor({ launched: false, testers: [BO] }, BO)).toBe(true);
    expect(premiumOpenFor({}, ANN)).toBe(false);
  });
  it("needs both a paid subscription and premium open for the player", () => {
    expect(hasPremium(paid, ANN, { launched: true }, NOW)).toBe(true);
    expect(hasPremium(paid, ANN, { testers: [BO] }, NOW)).toBe(false);
    expect(hasPremium(null, ANN, { launched: true }, NOW)).toBe(false);
  });
});

describe("rowFromSubscription", () => {
  it("maps Stripe's statuses", () => {
    expect(rowFromSubscription(subscription(), NOW_S)).toMatchObject({ userId: ANN, subscriptionId: "sub_A", customerId: "cus_1", variantId: "price_1", status: "active", endsAt: null, testMode: false });
    expect(rowFromSubscription(subscription({ status: "trialing" }), NOW_S).status).toBe("on_trial");
    const cancelled = rowFromSubscription(subscription({ cancelAtPeriodEnd: true }), NOW_S);
    expect(cancelled).toMatchObject({ status: "cancelled", renewsAt: null, endsAt: new Date((NOW_S + 30 * DAY) * 1000).toISOString() });
    expect(rowFromSubscription(subscription({ status: "canceled", endedAt: NOW_S }), NOW_S)).toMatchObject({ status: "expired", endsAt: NOW.toISOString() });
    expect(rowFromSubscription(subscription({ status: "unpaid" }), NOW_S).status).toBe("unpaid");
  });
  it("reads the period end from older API versions too", () => {
    const old = { ...subscription(), current_period_end: NOW_S + DAY, items: { data: [{ price: { id: "price_1" } }] } };
    expect(rowFromSubscription(old, NOW_S).renewsAt).toBe(new Date((NOW_S + DAY) * 1000).toISOString());
  });
});

describe("webhook", () => {
  it("stores the subscription of the player our checkout put on it", async () => {
    const { store, hook, call } = setup();
    expect((await hook(event(subscription(), { type: "customer.subscription.created" }))).status).toBe(200);
    expect(store.rows.get(ANN)).toMatchObject({ subscriptionId: "sub_A", status: "active" });
    expect((await call("status", "token-ann", { method: "GET" })).body).toMatchObject({ premium: true, status: "active", open: true, manage: true });
  });

  it("refuses a missing or wrong signature and stores nothing", async () => {
    const { store, hook } = setup();
    expect((await hook(event(subscription()), `t=${NOW_S},v1=${"0".repeat(64)}`)).status).toBe(401);
    expect((await hook(event(subscription()), null)).status).toBe(401);
    expect(store.rows.size).toBe(0);
  });

  it("follows the subscription to its cancellation and end", async () => {
    const { store, hook, call } = setup();
    await hook(event(subscription(), { created: NOW_S - 300 }));
    await hook(event(subscription({ cancelAtPeriodEnd: true }), { created: NOW_S - 200 }));
    expect((await call("status", "token-ann", { method: "GET" })).body).toMatchObject({ premium: true, status: "cancelled" });
    await hook(event(subscription({ status: "canceled", endedAt: NOW_S - 100 }), { type: "customer.subscription.deleted", created: NOW_S - 100 }));
    expect(store.rows.get(ANN).status).toBe("expired");
    expect((await call("status", "token-ann", { method: "GET" })).body.premium).toBe(false);
  });

  it("keeps the newest state when events arrive out of order", async () => {
    const { store, hook } = setup();
    await hook(event(subscription({ status: "canceled", endedAt: NOW_S }), { created: NOW_S - 10 }));
    expect((await hook(event(subscription(), { created: NOW_S - 50 }))).body.ignored).toBe("older event");
    expect(store.rows.get(ANN).status).toBe("expired");
  });

  it("a player who subscribes again: the late end of the old subscription does not replace the new one", async () => {
    const { store, hook } = setup();
    await hook(event(subscription({ id: "sub_A" }), { created: NOW_S - 900 }));
    await hook(event(subscription({ id: "sub_B" }), { created: NOW_S - 600 }));
    const late = await hook(event(subscription({ id: "sub_A", status: "canceled", endedAt: NOW_S - 100 }), { created: NOW_S - 100 }));
    expect(late.body.ignored).toBe("ended subscription next to a running one");
    expect(store.rows.get(ANN)).toMatchObject({ subscriptionId: "sub_B", status: "active" });
  });

  it("a new subscription replaces one that has ended", async () => {
    const { store, hook } = setup();
    await hook(event(subscription({ id: "sub_A", status: "canceled", endedAt: NOW_S - 900 }), { created: NOW_S - 900 }));
    await hook(event(subscription({ id: "sub_B" }), { created: NOW_S - 60 }));
    expect(store.rows.get(ANN)).toMatchObject({ subscriptionId: "sub_B", status: "active" });
  });

  it("test mode: ignored unless testing is on, and never over a real subscription", async () => {
    const off = setup();
    expect((await off.hook(event(subscription({ livemode: false })))).body.ignored).toBe("test mode");
    const on = setup({ env: { allowTestMode: true } });
    await on.hook(event(subscription({ id: "sub_real" }), { created: NOW_S - 300 }));
    expect((await on.hook(event(subscription({ id: "sub_test", livemode: false })))).body.ignored).toBe("test subscription next to a real one");
    expect(on.store.rows.get(ANN).subscriptionId).toBe("sub_real");
  });

  it("ignores other events and subscriptions made outside our checkout", async () => {
    const { store, hook } = setup();
    expect((await hook({ id: "evt", type: "invoice.paid", created: NOW_S, data: { object: { object: "invoice" } } })).body.ignored).toBe("not a subscription event");
    expect((await hook(event(subscription({ user: null })))).body.ignored).toBe("subscription without a player id");
    expect((await hook(event(subscription({ user: "not-a-uuid" })))).body.ignored).toBe("subscription without a player id");
    expect(store.rows.size).toBe(0);
  });

  it("only takes POST", async () => {
    const { call } = setup();
    expect((await call("webhook", null, { method: "GET" })).status).toBe(405);
  });
});

describe("status, checkout and portal", () => {
  it("need a signed-in player", async () => {
    const { call } = setup();
    expect((await call("status", null, { method: "GET" })).status).toBe(401);
    expect((await call("checkout", "nope")).status).toBe(401);
    expect((await call("portal", null)).status).toBe(401);
  });

  it("status without a subscription: free, nothing to manage", async () => {
    const { call } = setup();
    expect((await call("status", "token-bo", { method: "GET" })).body).toEqual({ premium: false, status: null, renewsAt: null, endsAt: null, open: true, manage: false });
  });

  it("checkout is created by the server with the player's id on the subscription", async () => {
    const { call, stripe } = setup();
    const res = await call("checkout", "token-ann", { body: { path: "/gold-tracker" } });
    expect(res.body.url).toBe("https://stripe.test/checkout/sessions");
    const [method, path, params] = stripe.mock.calls[0];
    expect([method, path]).toEqual(["POST", "checkout/sessions"]);
    expect(params).toMatchObject({
      mode: "subscription",
      line_items: [{ price: "price_1", quantity: 1 }],
      client_reference_id: ANN,
      customer_email: "ann@example.com",
      subscription_data: { metadata: { user_id: ANN } },
      success_url: "https://blackmarketreader.com/gold-tracker?premium=welcome",
      cancel_url: "https://blackmarketreader.com/gold-tracker"
    });
  });

  it("checkout uses Managed Payments when it is switched on", async () => {
    const off = setup();
    await off.call("checkout", "token-ann");
    expect(off.stripe.mock.calls[0][2].managed_payments).toBeUndefined();
    const on = setup({ env: { managedPayments: true } });
    await on.call("checkout", "token-ann");
    expect(on.stripe.mock.calls[0][2].managed_payments).toEqual({ enabled: true });
  });

  it("checkout sends players back to our own site only", async () => {
    const { call, stripe } = setup();
    await call("checkout", "token-bo", { body: { path: "//evil.example/x" } });
    expect(stripe.mock.calls[0][2]).toMatchObject({ cancel_url: "https://blackmarketreader.com/" });
    expect(stripe.mock.calls[0][2].customer_email).toBeUndefined();
  });

  it("checkout refuses a second subscription and reuses the Stripe customer of an ended one", async () => {
    const { call, hook, stripe } = setup();
    await hook(event(subscription()));
    expect((await call("checkout", "token-ann")).status).toBe(409);
    await hook(event(subscription({ status: "canceled", endedAt: NOW_S }), { created: NOW_S }));
    await call("checkout", "token-ann");
    expect(stripe.mock.calls[0][2]).toMatchObject({ customer: "cus_1" });
  });

  it("portal opens Stripe's customer portal for the player's own customer", async () => {
    const { call, hook, stripe } = setup();
    expect((await call("portal", "token-ann")).status).toBe(404);
    await hook(event(subscription()));
    expect((await call("portal", "token-ann", { body: { path: "/dashboard" } })).status).toBe(200);
    expect(stripe.mock.calls.at(-1)).toEqual(["POST", "billing_portal/sessions", { customer: "cus_1", return_url: "https://blackmarketreader.com/dashboard" }]);
  });

  it("is closed without a price or Stripe key", async () => {
    const { call } = setup({ env: { priceId: undefined } });
    expect((await call("checkout", "token-ann")).status).toBe(503);
    expect((await call("status", "token-ann", { method: "GET" })).body.open).toBe(false);
  });

  it("before the launch only the testers can buy or use premium", async () => {
    const { call, hook, stripe } = setup({ env: { launched: false, testers: [BO] } });
    await hook(event(subscription()));
    expect((await call("status", "token-ann", { method: "GET" })).body).toMatchObject({ premium: false, open: false });
    expect((await call("checkout", "token-ann")).status).toBe(503);
    expect(stripe).not.toHaveBeenCalled();
    expect((await call("status", "token-bo", { method: "GET" })).body.open).toBe(true);
    expect((await call("checkout", "token-bo")).status).toBe(200);
  });

  it("a Stripe failure is a plain 500, not a crash", async () => {
    const { call, stripe } = setup();
    stripe.mockRejectedValueOnce(new Error("Stripe POST checkout/sessions -> 500"));
    expect((await call("checkout", "token-ann")).status).toBe(500);
  });

  it("unknown actions are 404", async () => {
    const { call } = setup();
    expect((await call("refund", "token-ann")).status).toBe(404);
  });
});

describe("formEncode", () => {
  it("writes Stripe's nested form keys", () => {
    expect(decodeURIComponent(formEncode({ mode: "subscription", line_items: [{ price: "p", quantity: 1 }], meta: { a: "b" }, skip: undefined }).toString())).toBe(
      "mode=subscription&line_items[0][price]=p&line_items[0][quantity]=1&meta[a]=b"
    );
  });
});
