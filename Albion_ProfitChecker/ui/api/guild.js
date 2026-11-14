// /api/guild/<action> (vercel.json rewrites it to /api/guild?action=<action>): the Guild section's
// server, see api/_lib/guildApi.js. One function for every guild tool, the Hobby plan allows 12.
import { sendResult } from "./_lib/aodp.js";
import * as gameinfo from "./_lib/gameinfo.js";
import { handleGuild } from "./_lib/guildApi.js";
import { liveGuildStore, userFromToken } from "./_lib/guildStore.js";
import { clientAddress, createRateLimiter } from "./_lib/rateLimit.js";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

function readBody(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
  if (typeof text !== "string") return raw ?? null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const live = liveGuildStore();
  const { action, ...query } = req.query ?? {};
  const authorization = req.headers.authorization ?? "";
  const result = await handleGuild(
    String(action ?? ""),
    {
      method: req.method,
      query,
      body: readBody(req.body),
      token: authorization.replace(/^Bearer\s+/i, "") || null,
      authorization,
      client: clientAddress(req)
    },
    {
      store: live?.store ?? null,
      gameinfo,
      userFromToken: (token) => (live ? userFromToken(live.db, token) : null),
      now: () => new Date(),
      cronSecret: process.env.CRON_SECRET,
      limiter
    }
  );
  sendResult(res, result);
}
