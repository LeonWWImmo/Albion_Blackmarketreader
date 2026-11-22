// /api/billing/<action> (vercel.json rewrites it to /api/billing?action=<action>): premium
// subscriptions through Stripe, see api/_lib/billing.js. Env (Vercel):
// - STRIPE_SECRET_KEY: restricted key (checkout sessions + customer portal write; subscriptions,
//   customers, products, prices read)
// - STRIPE_PRICE_ID: the monthly premium price; without it premium is not open yet
// - STRIPE_WEBHOOK_SECRET: signing secret of the webhook endpoint (whsec_...)
// - STRIPE_TEST_MODE=1: also accept test-mode subscriptions (while testing, never on launch)
// - STRIPE_MANAGED_PAYMENTS=1: Stripe as merchant of record (needs it on in the Stripe Dashboard)
// - SITE_URL: where Stripe sends players back (default https://blackmarketreader.com)
// - PREMIUM_LAUNCHED=1: premium open to everyone; until then only to PREMIUM_TESTERS
// - PREMIUM_TESTERS: comma-separated user ids that can buy and use premium before the launch
import { sendResult } from "./_lib/aodp.js";
import { handleBilling, premiumEnv } from "./_lib/billing.js";
import { createBillingStore } from "./_lib/billingStore.js";
import { liveGuildStore, userFromToken } from "./_lib/guildStore.js";
import { createStripe } from "./_lib/stripeApi.js";

// the signature covers the exact bytes Stripe sent, so read them before anything parses the body
function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function readJson(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
  if (typeof text !== "string") return raw ?? null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

let store = null;
const stripe = process.env.STRIPE_SECRET_KEY ? createStripe(process.env.STRIPE_SECRET_KEY) : null;

export default async function handler(req, res) {
  const live = liveGuildStore();
  if (live && !store) store = createBillingStore(live.db);
  const action = String(req.query?.action ?? "");
  const webhook = action === "webhook" && req.method === "POST";
  const result = await handleBilling(
    action,
    {
      method: req.method,
      rawBody: webhook ? await readRaw(req) : null,
      signature: req.headers["stripe-signature"] ?? null,
      token: (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || null,
      body: webhook || req.method !== "POST" ? null : readJson(req.body)
    },
    {
      store: live ? store : null,
      userFromToken: (token) => (live ? userFromToken(live.db, token) : null),
      now: () => new Date(),
      env: {
        stripe,
        priceId: process.env.STRIPE_PRICE_ID,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        allowTestMode: process.env.STRIPE_TEST_MODE === "1",
        managedPayments: process.env.STRIPE_MANAGED_PAYMENTS === "1",
        ...premiumEnv(process.env),
        siteUrl: (process.env.SITE_URL || "https://blackmarketreader.com").replace(/\/+$/, "")
      }
    }
  );
  sendResult(res, result, req);
}
