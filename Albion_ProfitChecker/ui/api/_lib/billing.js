// Premium subscriptions, sold through Lemon Squeezy (merchant of record: it bills, handles VAT and
// pays affiliates). /api/billing/<action>:
// - webhook  (POST, from Lemon Squeezy): a subscription changed; signed with the webhook secret
// - status   (GET, signed in): does this player have premium, until when
// - checkout (GET, signed in): the checkout link, with the player's id so the webhook knows who paid
// Pure logic with the store and env given in, like guildApi.js; api/billing.js wires it to Vercel.
import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const answer = (status, body) => ({ status, body, maxAge: 0 });

/** True when `signature` (hex) is the HMAC-SHA256 of the raw body with the webhook secret. */
export function isValidSignature(secret, rawBody, signature) {
  if (!secret || !rawBody || !/^[0-9a-f]{64}$/i.test(signature ?? "")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

/**
 * The checkout link carries the player's id, and a player could edit it before paying. It is
 * signed here, so a payment can only ever land on the account that started the checkout.
 */
export const userSignature = (secret, userId) => createHmac("sha256", secret).update(`user:${userId}`).digest("hex");

function isSignedUser(secret, userId, signature) {
  if (!secret || !userId || !/^[0-9a-f]{64}$/i.test(signature ?? "")) return false;
  return timingSafeEqual(Buffer.from(userSignature(secret, userId), "hex"), Buffer.from(signature, "hex"));
}

/**
 * Premium while on trial, active or past due (Lemon Squeezy still retries the payment), or
 * cancelled but paid until ends_at. Same rule as public.is_premium() in the database.
 */
export function isPremium(row, now) {
  if (!row) return false;
  if (["on_trial", "active", "past_due"].includes(row.status)) return true;
  return row.status === "cancelled" && row.endsAt !== null && new Date(row.endsAt) > now;
}

/** The subscription row a webhook event describes (user id still to be found), or null for other events. */
export function rowFromEvent(event) {
  const data = event?.data;
  if (data?.type !== "subscriptions" || !data.id || !data.attributes?.status) return null;
  const a = data.attributes;
  const custom = event.meta?.custom_data ?? {};
  const customUser = custom.user_id;
  return {
    userId: typeof customUser === "string" && UUID.test(customUser) ? customUser : null,
    userSignature: typeof custom.user_sig === "string" ? custom.user_sig : null,
    subscriptionId: String(data.id),
    customerId: a.customer_id == null ? null : String(a.customer_id),
    variantId: a.variant_id == null ? null : String(a.variant_id),
    status: String(a.status),
    renewsAt: a.renews_at ?? null,
    endsAt: a.ends_at ?? null,
    testMode: Boolean(a.test_mode ?? event.meta?.test_mode),
    providerUpdatedAt: a.updated_at ?? new Date(0).toISOString()
  };
}

async function webhook(req, { store, env }) {
  if (req.method !== "POST") return answer(405, { error: "POST only" });
  if (!isValidSignature(env.webhookSecret, req.rawBody, req.signature)) return answer(401, { error: "bad signature" });
  if (!store) return answer(503, { error: "no database" });
  let event;
  try {
    event = JSON.parse(req.rawBody.toString("utf8"));
  } catch {
    return answer(400, { error: "not JSON" });
  }
  const row = rowFromEvent(event);
  // orders, invoices and the like: nothing to store, but Lemon Squeezy must not retry them
  if (!row) return answer(200, { ok: true, ignored: "not a subscription event" });
  if (row.testMode && !env.allowTestMode) return answer(200, { ok: true, ignored: "test mode" });
  const known = await store.getBySubscription(row.subscriptionId);
  // the player: whoever this subscription already belongs to, else the signed id from the checkout
  const signed = isSignedUser(env.webhookSecret, row.userId, row.userSignature) ? row.userId : null;
  const userId = known?.userId ?? signed;
  // without the player's id nobody can be given premium: a 500 lets Lemon Squeezy retry and shows up in its log
  if (!userId) return answer(500, { error: "subscription without a valid player id" });
  const { userSignature: _sig, ...next } = { ...row, userId };
  const current = known ?? (await store.getByUser(userId));
  if (current && current.subscriptionId === next.subscriptionId) {
    // events can arrive out of order: keep the newest state of a subscription
    if (new Date(current.providerUpdatedAt) > new Date(next.providerUpdatedAt)) return answer(200, { ok: true, ignored: "older event" });
  } else if (current) {
    // another subscription of the same player (they subscribed again): a late event of a dead one
    // must not replace a running one, and a test purchase never replaces a real one
    if (current.testMode === false && next.testMode) return answer(200, { ok: true, ignored: "test subscription next to a real one" });
    const now = new Date(next.providerUpdatedAt);
    if (isPremium(current, now) && !isPremium(next, now)) return answer(200, { ok: true, ignored: "ended subscription next to a running one" });
  }
  await store.save(next);
  return answer(200, { ok: true });
}

async function status(req, { store, userFromToken, now, env }) {
  const open = Boolean(env.checkoutUrl);
  const user = await userFromToken(req.token);
  if (!user) return answer(401, { error: "Sign in to see your premium." });
  const row = store ? await store.getByUser(user.id) : null;
  return answer(200, {
    premium: isPremium(row, now()),
    status: row?.status ?? null,
    renewsAt: row?.renewsAt ?? null,
    endsAt: row?.endsAt ?? null,
    open,
    portalUrl: row ? env.portalUrl || null : null
  });
}

async function checkout(req, { store, userFromToken, now, env }) {
  if (!env.checkoutUrl || !env.webhookSecret) return answer(503, { error: "Premium is not open yet." });
  const user = await userFromToken(req.token);
  if (!user) return answer(401, { error: "Sign in to get premium." });
  const row = store ? await store.getByUser(user.id) : null;
  if (isPremium(row, now())) return answer(409, { error: "You already have premium." });
  const url = new URL(env.checkoutUrl);
  url.searchParams.set("checkout[custom][user_id]", user.id);
  url.searchParams.set("checkout[custom][user_sig]", userSignature(env.webhookSecret, user.id));
  if (user.email) url.searchParams.set("checkout[email]", user.email);
  return answer(200, { url: url.toString() });
}

const ACTIONS = { webhook, status, checkout };

/** req: { method, rawBody (Buffer, webhook only), signature, token }. */
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
