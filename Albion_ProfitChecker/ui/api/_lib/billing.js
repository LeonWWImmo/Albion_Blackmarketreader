// Premium subscriptions, sold through Stripe. /api/billing/<action>:
// - webhook  (POST, from Stripe): a subscription changed; signed with the endpoint's secret
// - status   (GET, signed in): does this player have premium, until when
// - checkout (POST, signed in): a Stripe Checkout for this player, created here so the
//   subscription carries their id (nobody can buy premium onto another account)
// - portal   (POST, signed in): Stripe's customer portal to change the card or cancel
// Pure logic with the store, Stripe client and env given in, like guildApi.js; api/billing.js wires
// it to Vercel.
import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// how old a signed webhook may be (Stripe's own default): older ones could be replayed
const SIGNATURE_TOLERANCE_S = 300;
const SUBSCRIPTION_EVENTS = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"]);

const answer = (status, body) => ({ status, body, maxAge: 0 });

/**
 * True when the Stripe-Signature header ("t=...,v1=...") signs "<t>.<raw body>" with the endpoint
 * secret (HMAC-SHA256) and is not older than five minutes.
 */
export function isValidSignature(secret, rawBody, header, now) {
  if (!secret || !rawBody || typeof header !== "string") return false;
  const parts = header.split(",").map((p) => p.split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k, v]) => k === "v1" && /^[0-9a-f]{64}$/i.test(v ?? "")).map(([, v]) => Buffer.from(v, "hex"));
  if (!Number.isFinite(t) || !signatures.length || Math.abs(now.getTime() / 1000 - t) > SIGNATURE_TOLERANCE_S) return false;
  const expected = createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest();
  return signatures.some((s) => s.length === expected.length && timingSafeEqual(s, expected));
}

/**
 * Premium while on trial, active or past due (Stripe still retries the payment), or cancelled but
 * paid until ends_at. Same rule as public.is_premium() in the database.
 */
export function isPremium(row, now) {
  if (!row) return false;
  if (["on_trial", "active", "past_due"].includes(row.status)) return true;
  return row.status === "cancelled" && row.endsAt !== null && new Date(row.endsAt) > now;
}

const iso = (seconds) => (typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null);

/**
 * Stripe's subscription in the stored form. The statuses are the ones is_premium() knows:
 * on_trial, active, past_due, cancelled (still paid until ends_at), expired (over), and Stripe's
 * own for the rest (unpaid, incomplete, incomplete_expired, paused), which give no premium.
 */
export function rowFromSubscription(sub, eventCreated) {
  // the period end moved from the subscription to its items in newer Stripe API versions
  const periodEnd = iso(sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end);
  const userId = sub.metadata?.user_id;
  let status = sub.status;
  let renewsAt = periodEnd;
  let endsAt = null;
  if (sub.status === "trialing") status = "on_trial";
  else if (sub.status === "canceled") {
    status = "expired";
    renewsAt = null;
    endsAt = iso(sub.ended_at) ?? periodEnd;
  } else if (sub.status === "active" && (sub.cancel_at_period_end || sub.cancel_at)) {
    status = "cancelled";
    renewsAt = null;
    endsAt = iso(sub.cancel_at) ?? periodEnd;
  }
  return {
    userId: typeof userId === "string" && UUID.test(userId) ? userId : null,
    subscriptionId: String(sub.id),
    customerId: typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null),
    variantId: sub.items?.data?.[0]?.price?.id ?? null,
    status,
    renewsAt,
    endsAt,
    testMode: sub.livemode === false,
    providerUpdatedAt: iso(eventCreated) ?? new Date(0).toISOString()
  };
}

async function webhook(req, { store, env, now }) {
  if (req.method !== "POST") return answer(405, { error: "POST only" });
  if (!isValidSignature(env.webhookSecret, req.rawBody, req.signature, now())) return answer(401, { error: "bad signature" });
  if (!store) return answer(503, { error: "no database" });
  let event;
  try {
    event = JSON.parse(req.rawBody.toString("utf8"));
  } catch {
    return answer(400, { error: "not JSON" });
  }
  // other events: nothing to store, but Stripe must not retry them
  if (!SUBSCRIPTION_EVENTS.has(event?.type) || event.data?.object?.object !== "subscription") return answer(200, { ok: true, ignored: "not a subscription event" });
  const next0 = rowFromSubscription(event.data.object, event.created);
  if (next0.testMode && !env.allowTestMode) return answer(200, { ok: true, ignored: "test mode" });
  const known = await store.getBySubscription(next0.subscriptionId);
  // the player: whoever this subscription already belongs to, else the id our checkout put on it
  const userId = known?.userId ?? next0.userId;
  // a subscription made outside our checkout (by hand in Stripe): nobody to give premium to
  if (!userId) return answer(200, { ok: true, ignored: "subscription without a player id" });
  const next = { ...next0, userId };
  const current = known ?? (await store.getByUser(userId));
  if (current && current.subscriptionId === next.subscriptionId) {
    // events can arrive out of order: keep the newest state of a subscription
    if (new Date(current.providerUpdatedAt) > new Date(next.providerUpdatedAt)) return answer(200, { ok: true, ignored: "older event" });
  } else if (current) {
    // another subscription of the same player (they subscribed again): a late event of a dead one
    // must not replace a running one, and a test purchase never replaces a real one
    if (current.testMode === false && next.testMode) return answer(200, { ok: true, ignored: "test subscription next to a real one" });
    const at = new Date(next.providerUpdatedAt);
    if (isPremium(current, at) && !isPremium(next, at)) return answer(200, { ok: true, ignored: "ended subscription next to a running one" });
  }
  await store.save(next);
  return answer(200, { ok: true });
}

async function status(req, { store, userFromToken, now, env }) {
  const user = await userFromToken(req.token);
  if (!user) return answer(401, { error: "Sign in to see your premium." });
  const row = store ? await store.getByUser(user.id) : null;
  return answer(200, {
    premium: isPremium(row, now()),
    status: row?.status ?? null,
    renewsAt: row?.renewsAt ?? null,
    endsAt: row?.endsAt ?? null,
    open: Boolean(env.priceId && env.stripe),
    // the customer portal needs a Stripe customer, which only a checkout creates
    manage: Boolean(row?.customerId && env.stripe)
  });
}

/** Where Stripe sends the player back: a path on our own site only (no open redirect). */
const backTo = (env, path) => `${env.siteUrl}${typeof path === "string" && /^\/[A-Za-z0-9/_-]*$/.test(path) ? path : "/"}`;

async function checkout(req, { store, userFromToken, now, env }) {
  if (req.method !== "POST") return answer(405, { error: "POST only" });
  if (!env.priceId || !env.stripe) return answer(503, { error: "Premium is not open yet." });
  const user = await userFromToken(req.token);
  if (!user) return answer(401, { error: "Sign in to get premium." });
  const row = store ? await store.getByUser(user.id) : null;
  if (isPremium(row, now())) return answer(409, { error: "You already have premium." });
  const back = backTo(env, req.body?.path);
  const session = await env.stripe("POST", "checkout/sessions", {
    mode: "subscription",
    line_items: [{ price: env.priceId, quantity: 1 }],
    client_reference_id: user.id,
    // a returning player keeps their Stripe customer (and card), a new one is created
    ...(row?.customerId ? { customer: row.customerId } : user.email ? { customer_email: user.email } : {}),
    subscription_data: { metadata: { user_id: user.id } },
    metadata: { user_id: user.id },
    allow_promotion_codes: true,
    success_url: `${back}${back.includes("?") ? "&" : "?"}premium=welcome`,
    cancel_url: back
  });
  return answer(200, { url: session.url });
}

async function portal(req, { store, userFromToken, env }) {
  if (req.method !== "POST") return answer(405, { error: "POST only" });
  if (!env.stripe) return answer(503, { error: "Premium is not open yet." });
  const user = await userFromToken(req.token);
  if (!user) return answer(401, { error: "Sign in to manage premium." });
  const row = store ? await store.getByUser(user.id) : null;
  if (!row?.customerId) return answer(404, { error: "No subscription to manage." });
  const session = await env.stripe("POST", "billing_portal/sessions", { customer: row.customerId, return_url: backTo(env, req.body?.path) });
  return answer(200, { url: session.url });
}

const ACTIONS = { webhook, status, checkout, portal };

/** req: { method, rawBody (Buffer, webhook only), signature, token, body }. */
export async function handleBilling(action, req, deps) {
  const run = ACTIONS[action];
  if (!run) return answer(404, { error: "unknown action" });
  try {
    return await run(req, deps);
  } catch (error) {
    console.error("billing", action, error);
    return answer(500, { error: "Something went wrong, try again." });
  }
}
