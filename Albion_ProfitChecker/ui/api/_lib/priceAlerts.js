// Price alerts (premium): "this item's cheapest listing drops below X" or "a buy order rises above
// X", set on the Price Checker, checked every 30 minutes (GitHub job -> /api/market/alerts-run)
// against AODP and posted to the player's own Discord webhook. An alert fires once, then waits until
// the price has gone back before it can fire again. Routed through api/market.js (marketLive.js).
import { checkWebhook, postWebhook } from "./guildDiscord.js";
import { LIVE_LOCATIONS, LIVE_REGIONS, fetchRows } from "./marketLive.js";

export const MAX_ALERTS = 25;
/** A price older than this does not fire or re-arm an alert: it may be gone already. */
export const ALERT_FRESH_MS = 2 * 3600 * 1000;
const BM = "Black Market";
const ITEM_ID = /^[A-Z0-9_]{2,80}(@[1-4])?$/;
const PATH = /^\/prices\/[a-z0-9-]{1,120}(\?[a-z0-9=&]{0,40})?$/;
const QUALITY = ["Normal", "Good", "Outstanding", "Excellent", "Masterpiece"];
const REGION = { eu: "Europe", us: "America" };
const SITE = "https://blackmarketreader.com";
const ICON = `${SITE}/apple-touch-icon.png`;

const stampMs = (stamp) => Date.parse(/[zZ]$/.test(String(stamp)) ? stamp : `${stamp}Z`);
const silver = (n) => Math.round(n).toLocaleString("de-DE");

/** A new alert from the browser, checked, or an error text. */
export function readAlert(body) {
  const b = body ?? {};
  const alert = {
    region: String(b.region ?? ""),
    itemId: String(b.itemId ?? ""),
    itemName: String(b.itemName ?? "").trim().slice(0, 80),
    path: String(b.path ?? ""),
    quality: Number(b.quality ?? 1),
    market: String(b.market ?? ""),
    side: String(b.side ?? ""),
    price: Math.round(Number(b.price))
  };
  if (!LIVE_REGIONS.includes(alert.region)) return { error: "Unknown server." };
  if (!ITEM_ID.test(alert.itemId) || !alert.itemName || !PATH.test(alert.path)) return { error: "Unknown item." };
  if (!Number.isInteger(alert.quality) || alert.quality < 1 || alert.quality > 5) return { error: "Unknown quality." };
  if (alert.market !== "ANY" && !LIVE_LOCATIONS.includes(alert.market)) return { error: "Unknown market." };
  if (alert.side !== "below" && alert.side !== "above") return { error: "Choose when the alert fires." };
  if (alert.side === "below" && alert.market === BM) return { error: "The Black Market sells nothing: pick a city." };
  if (!(alert.price > 0 && alert.price < 1e12)) return { error: "Enter a price." };
  return { alert };
}

/**
 * The price that counts for an alert right now, from AODP price rows of its item (all qualities),
 * or null without a fresh one. below: the cheapest sell order of its quality or better (in the
 * cities); above: the best buy order an item of its quality fills (orders for that quality or lower).
 */
export function alertPrice(alert, rows, now) {
  let best = null;
  for (const row of rows) {
    if (row?.item_id !== alert.item_id) continue;
    if (alert.market !== "ANY" && row.city !== alert.market) continue;
    if (!LIVE_LOCATIONS.includes(row.city)) continue;
    const below = alert.side === "below";
    if (below ? row.city === BM || row.quality < alert.quality : row.quality > alert.quality) continue;
    const price = Number(below ? row.sell_price_min : row.buy_price_max);
    const at = stampMs(below ? row.sell_price_min_date : row.buy_price_max_date);
    if (!(price > 0) || !(now.getTime() - at <= ALERT_FRESH_MS)) continue;
    if (!best || (below ? price < best.price : price > best.price)) best = { price, market: row.city, at };
  }
  return best;
}

export const alertHits = (alert, best) => Boolean(best) && (alert.side === "below" ? best.price <= alert.price : best.price >= alert.price);

/** The Discord message of a fired alert. */
export function alertMessage(alert, best) {
  const quality = alert.quality > 1 ? ` · ${QUALITY[alert.quality - 1]}` : "";
  const below = alert.side === "below";
  return {
    username: "Blackmarket Reader",
    avatar_url: ICON,
    embeds: [
      {
        author: { name: "Blackmarket Reader · Price alert", icon_url: ICON },
        title: `🔔 ${alert.item_name}${quality} ${below ? "dropped to" : "buy order at"} ${silver(best.price)}`,
        url: `${SITE}${alert.path}`,
        color: below ? 0x5fe0a0 : 0xf5c96a,
        description: below
          ? `Cheapest listing in **${best.market}** · ${REGION[alert.region]}`
          : `Best buy order in **${best.market}** · ${REGION[alert.region]}`,
        thumbnail: { url: `https://render.albiononline.com/v1/item/${encodeURIComponent(alert.item_id)}.png?quality=${alert.quality}` },
        fields: [
          { name: below ? "💰 Price" : "💰 Pays", value: `${silver(best.price)} silver`, inline: true },
          { name: "🎯 Your alert", value: `${below ? "≤" : "≥"} ${silver(alert.price)}`, inline: true },
          { name: "🕒 Seen", value: `<t:${Math.floor(best.at / 1000)}:R>`, inline: true }
        ],
        footer: { text: "Price alert · Premium · blackmarketreader.com · fires again once the price went back" }
      }
    ]
  };
}

export function alertHello() {
  return {
    username: "Blackmarket Reader",
    avatar_url: ICON,
    embeds: [
      {
        title: "🔔 Price alerts on",
        description: "Your price alerts from the Price Checker land in this channel. They are checked every 30 minutes.",
        color: 0xf5c96a,
        url: `${SITE}/prices`,
        footer: { text: "Premium · blackmarketreader.com" }
      }
    ]
  };
}

/** What the browser gets of an alert. */
export const alertView = (a) => ({
  id: a.id,
  region: a.region,
  itemId: a.item_id,
  itemName: a.item_name,
  path: a.path,
  quality: a.quality,
  market: a.market,
  side: a.side,
  price: Number(a.price),
  armed: a.armed,
  firedAt: a.fired_at ?? null,
  firedPrice: a.fired_price == null ? null : Number(a.fired_price)
});

/**
 * Checks every alert of every premium player: one AODP pass per region over the alerts' items.
 * deps: store, premium(userId), fetchRows(region, ids), post(url, payload), now()
 */
export async function runAlerts(deps) {
  const now = deps.now();
  const alerts = await deps.store.allAlerts();
  const premium = new Map();
  const isPremium = async (userId) => {
    if (!premium.has(userId)) premium.set(userId, await deps.premium(userId).catch(() => false));
    return premium.get(userId);
  };
  const live = [];
  for (const alert of alerts) if (await isPremium(alert.user_id)) live.push(alert);
  const rows = new Map();
  for (const region of LIVE_REGIONS) {
    const ids = [...new Set(live.filter((a) => a.region === region).map((a) => a.item_id))];
    if (ids.length) rows.set(region, await deps.fetchRows(region, ids));
  }
  const hooks = new Map();
  const result = { checked: live.length, fired: 0, rearmed: 0, failed: 0 };
  for (const alert of live) {
    const best = alertPrice(alert, rows.get(alert.region) ?? [], now);
    if (!best) continue; // no fresh price: leave it as it is
    const hits = alertHits(alert, best);
    if (!hits) {
      if (!alert.armed) {
        await deps.store.rearm(alert.id);
        result.rearmed += 1;
      }
      continue;
    }
    if (!alert.armed) continue;
    if (!hooks.has(alert.user_id)) hooks.set(alert.user_id, await deps.store.getAlertHook(alert.user_id));
    const hook = hooks.get(alert.user_id);
    if (!hook) continue;
    const sent = await deps.post(hook.url, alertMessage(alert, best));
    if (sent === "ok") {
      await deps.store.markFired(alert.id, best.price, now.toISOString());
      result.fired += 1;
    } else if (sent === "gone") {
      await deps.store.removeAlertHook(alert.user_id);
      hooks.set(alert.user_id, null);
      result.failed += 1;
    } else result.failed += 1;
  }
  return result;
}

const fail = (status, error) => ({ status, body: { error }, maxAge: 0 });
const ok = (body) => ({ status: 200, body, maxAge: 0 });

/**
 * The player's side of the alerts (all premium): alerts, alert-save, alert-delete, alert-hook.
 * The job's side: alerts-run (actions secret).
 */
export async function handleAlerts(action, req, deps) {
  if (action === "alerts-run") {
    if (!deps.actionsSecret || req.token !== deps.actionsSecret) return fail(401, "not allowed");
    if (!deps.store) return fail(503, "storage not configured");
    return ok(
      await runAlerts({
        store: deps.store,
        premium: deps.premium ?? (async () => false),
        fetchRows: deps.fetchRows ?? ((region, ids) => fetchRows(region, ids, "prices", { gapMs: 100 })),
        post: deps.discord?.post ?? postWebhook,
        now: deps.now
      })
    );
  }
  const post = action !== "alerts";
  if (post ? req.method !== "POST" : req.method !== "GET") return fail(405, post ? "POST only" : "GET only");
  const user = req.token ? await deps.userFromToken(req.token) : null;
  if (!user) return fail(401, "Sign in to use price alerts.");
  if (!deps.premium || !(await deps.premium(user.id))) return fail(403, "Price alerts are part of Premium.");
  if (!deps.store) return fail(503, "Price alerts are not available right now.");
  const { store } = deps;
  const listing = async () => {
    const hook = await store.getAlertHook(user.id);
    return { alerts: (await store.listAlerts(user.id)).map(alertView), hook: hook ? { name: hook.name ?? "Discord webhook" } : null, limit: MAX_ALERTS };
  };

  if (action === "alerts") return ok(await listing());

  if (action === "alert-save") {
    const { alert, error } = readAlert(req.body);
    if (error) return fail(400, error);
    if ((await store.listAlerts(user.id)).length >= MAX_ALERTS) return fail(409, `You have ${MAX_ALERTS} alerts already. Delete one first.`);
    await store.addAlert({
      user_id: user.id,
      region: alert.region,
      item_id: alert.itemId,
      item_name: alert.itemName,
      path: alert.path,
      quality: alert.quality,
      market: alert.market,
      side: alert.side,
      price: alert.price
    });
    return ok(await listing());
  }

  if (action === "alert-delete") {
    const id = String(req.body?.id ?? "");
    if (!(await store.deleteAlert(user.id, id))) return fail(404, "This alert is gone already.");
    return ok(await listing());
  }

  if (action === "alert-hook") {
    if (deps.hookLimiter && !deps.hookLimiter.take(user.id)) return fail(429, "Too many webhooks tried. Wait a few minutes and try again.");
    const url = String(req.body?.url ?? "").trim();
    const discord = deps.discord ?? { check: checkWebhook, post: postWebhook };
    const name = await discord.check(url);
    if (!name) return fail(400, "Paste a Discord webhook link: Server settings → Integrations → Webhooks → Copy Webhook URL.");
    if ((await discord.post(url, alertHello())) !== "ok") return fail(502, "Discord did not take the first message. Try again in a minute.");
    await store.saveAlertHook(user.id, url, name);
    return ok(await listing());
  }

  return fail(404, "unknown action");
}

/** The alert tables in Supabase (service role). */
export function alertStoreOn(db) {
  const must = ({ data, error }) => {
    if (error) throw error;
    return data;
  };
  return {
    async listAlerts(userId) {
      return must(await db.from("price_alerts").select("*").eq("user_id", userId).order("created_at", { ascending: false }));
    },
    async addAlert(row) {
      must(await db.from("price_alerts").insert(row));
    },
    async deleteAlert(userId, id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
      return must(await db.from("price_alerts").delete().eq("id", id).eq("user_id", userId).select("id")).length > 0;
    },
    async allAlerts() {
      return must(await db.from("price_alerts").select("*").limit(20000));
    },
    async markFired(id, price, at) {
      must(await db.from("price_alerts").update({ armed: false, fired_at: at, fired_price: price }).eq("id", id));
    },
    async rearm(id) {
      must(await db.from("price_alerts").update({ armed: true }).eq("id", id));
    },
    async getAlertHook(userId) {
      return must(await db.from("alert_webhooks").select("url, name").eq("user_id", userId).maybeSingle());
    },
    async saveAlertHook(userId, url, name) {
      must(await db.from("alert_webhooks").upsert({ user_id: userId, url, name }, { onConflict: "user_id" }));
    },
    async removeAlertHook(userId) {
      must(await db.from("alert_webhooks").delete().eq("user_id", userId));
    }
  };
}

/** The same in memory, for tests and `npm run dev`. */
export function memoryAlertStore() {
  let alerts = [];
  const hooks = new Map();
  let next = 1;
  return {
    async listAlerts(userId) {
      return alerts.filter((a) => a.user_id === userId).slice().reverse();
    },
    async addAlert(row) {
      const id = `00000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
      alerts.push({ armed: true, fired_at: null, fired_price: null, created_at: new Date().toISOString(), ...row, id });
    },
    async deleteAlert(userId, id) {
      const before = alerts.length;
      alerts = alerts.filter((a) => !(a.id === id && a.user_id === userId));
      return alerts.length < before;
    },
    async allAlerts() {
      return alerts.map((a) => ({ ...a }));
    },
    async markFired(id, price, at) {
      alerts = alerts.map((a) => (a.id === id ? { ...a, armed: false, fired_at: at, fired_price: price } : a));
    },
    async rearm(id) {
      alerts = alerts.map((a) => (a.id === id ? { ...a, armed: true } : a));
    },
    async getAlertHook(userId) {
      return hooks.get(userId) ?? null;
    },
    async saveAlertHook(userId, url, name) {
      hooks.set(userId, { url, name });
    },
    async removeAlertHook(userId) {
      hooks.delete(userId);
    }
  };
}
