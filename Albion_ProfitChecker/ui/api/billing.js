// /api/billing/<action> (vercel.json rewrites it to /api/billing?action=<action>): premium
// subscriptions through Lemon Squeezy, see api/_lib/billing.js. Env (Vercel):
// - LEMONSQUEEZY_WEBHOOK_SECRET: the signing secret of the Lemon Squeezy webhook
// - LEMONSQUEEZY_CHECKOUT_URL: the product's checkout link; without it premium is not open yet
// - LEMONSQUEEZY_PORTAL_URL: the store's "My orders" page, where players manage their subscription
// - LEMONSQUEEZY_TEST_MODE=1: also accept test-mode subscriptions (while testing, never on launch)
import { sendResult } from "./_lib/aodp.js";
import { handleBilling } from "./_lib/billing.js";
import { createBillingStore } from "./_lib/billingStore.js";
import { liveGuildStore, userFromToken } from "./_lib/guildStore.js";

// the signature covers the exact bytes Lemon Squeezy sent, so read them before anything parses the body
function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

let store = null;

export default async function handler(req, res) {
  const live = liveGuildStore();
  if (live && !store) store = createBillingStore(live.db);
  const action = String(req.query?.action ?? "");
  const result = await handleBilling(
    action,
    {
      method: req.method,
      rawBody: action === "webhook" && req.method === "POST" ? await readRaw(req) : null,
      signature: req.headers["x-signature"] ?? null,
      token: (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || null
    },
    {
      store: live ? store : null,
      userFromToken: (token) => (live ? userFromToken(live.db, token) : null),
      now: () => new Date(),
      env: {
        webhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET,
        checkoutUrl: process.env.LEMONSQUEEZY_CHECKOUT_URL,
        portalUrl: process.env.LEMONSQUEEZY_PORTAL_URL,
        allowTestMode: process.env.LEMONSQUEEZY_TEST_MODE === "1"
      }
    }
  );
  sendResult(res, result);
}
