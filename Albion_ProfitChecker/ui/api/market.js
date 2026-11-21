// /api/market/<action> (vercel.json rewrites it to /api/market?action=<action>): the live market
// of premium, see api/_lib/marketLive.js. Env (Vercel): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
// ACTIONS_CRON_SECRET (the GitHub job that sends the snapshots), PREMIUM_* (see api/billing.js).
import { sendResult } from "./_lib/aodp.js";
import { hasPremium, premiumEnv } from "./_lib/billing.js";
import { createBillingStore } from "./_lib/billingStore.js";
import { liveGuildStore, userFromToken } from "./_lib/guildStore.js";
import { createMarketStore, handleMarket } from "./_lib/marketLive.js";

export default async function handler(req, res) {
  const live = liveGuildStore();
  const result = await handleMarket(
    String(req.query?.action ?? ""),
    {
      method: req.method,
      query: req.query ?? {},
      token: (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || null,
      body: req.method === "POST" ? req.body : null
    },
    {
      store: live ? createMarketStore(live.db) : null,
      actionsSecret: process.env.ACTIONS_CRON_SECRET,
      userFromToken: (token) => (live ? userFromToken(live.db, token) : null),
      premium: live
        ? async (userId) => hasPremium(await createBillingStore(live.db).getByUser(userId), userId, premiumEnv(process.env), new Date())
        : null,
      now: () => new Date()
    }
  ).catch(() => ({ status: 500, body: { error: "Something went wrong, try again." }, maxAge: 0 }));
  sendResult(res, result);
}
