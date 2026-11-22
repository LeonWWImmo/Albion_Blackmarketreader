// /api/market/<action> (vercel.json rewrites it to /api/market?action=<action>): the premium market
// tools, one function for all of them (the Hobby plan allows 12):
// - live, ingest: the live market snapshot (api/_lib/marketLive.js)
// - alerts, alert-save, alert-delete, alert-hook, alerts-run: price alerts (api/_lib/priceAlerts.js)
// Env (Vercel): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, ACTIONS_CRON_SECRET (the GitHub job),
// PREMIUM_* (see api/billing.js).
import { sendResult } from "./_lib/aodp.js";
import { hasPremium, premiumEnv } from "./_lib/billing.js";
import { createBillingStore } from "./_lib/billingStore.js";
import { liveGuildStore, userFromToken } from "./_lib/guildStore.js";
import { createMarketStore, handleMarket } from "./_lib/marketLive.js";
import { alertStoreOn, handleAlerts } from "./_lib/priceAlerts.js";
import { createRateLimiter } from "./_lib/rateLimit.js";
import { gunzipSync } from "node:zlib";

/** Webhook links tried per player: the Discord check must not become a way to probe links. */
const hookLimiter = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });

/** The GitHub job sends its snapshot gzipped (a quarter of the size): read and unpack it. */
function readGzipJson(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(gunzipSync(Buffer.concat(chunks)).toString("utf8")));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

export default async function handler(req, res) {
  const live = liveGuildStore();
  const action = String(req.query?.action ?? "");
  const gzipped = req.method === "POST" && /gzip/.test(String(req.headers["content-encoding"] ?? "") + String(req.headers["content-type"] ?? ""));
  const alerts = action.startsWith("alert");
  const result = await (alerts ? handleAlerts : handleMarket)(
    action,
    {
      method: req.method,
      query: req.query ?? {},
      token: (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || null,
      body: req.method !== "POST" ? null : gzipped ? await readGzipJson(req) : req.body
    },
    {
      store: live ? (alerts ? alertStoreOn(live.db) : createMarketStore(live.db)) : null,
      actionsSecret: process.env.ACTIONS_CRON_SECRET,
      userFromToken: (token) => (live ? userFromToken(live.db, token) : null),
      premium: live
        ? async (userId) => hasPremium(await createBillingStore(live.db).getByUser(userId), userId, premiumEnv(process.env), new Date())
        : null,
      hookLimiter,
      now: () => new Date()
    }
  ).catch(() => ({ status: 500, body: { error: "Something went wrong, try again." }, maxAge: 0 }));
  sendResult(res, result, req);
}
