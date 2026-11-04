// Live gold features of the Discord bot, run from .github/workflows/discord-live.yml:
//   --alerts  post a gold alert (pinging the Gold Alerts role) when a server's gold price breaks its
//             30-day low or high; only the big moves, see RULES
//   --names   rename the two "💰 Gold EU / US" channels to the current price
//   --dry-run print instead of posting / renaming
// DISCORD_LIVE_MODE=test sends alerts to the private tester channel instead of the alert channel.
// Needs DISCORD_BOT_TOKEN. Plain Node: no npm install needed.
import { pathToFileURL } from "node:url";
import { REGIONS, SITE, fetchJson, formatPct, formatSilver, goldSummary, priceBar } from "../api/_lib/discordData.js";

const CHANNELS = {
  tester: "1567453537372344360",
  // #🚨-gold-signals: only members with the Gold Alerts role see it (turned on in #💰-gold-alerts)
  alerts: "1567578257170239508",
  gold: { eu: "1567454937636409437", us: "1567454939503005726" }
};
const GOLD_ALERT_ROLE = "1567454898612600857";
// a gold point older than this is not "right now" any more
const STALE_MS = 6 * 3600 * 1000;
const DAY_S = 24 * 3600;
// What counts as a big move. Tried on 61 days of hourly prices: about two alerts a month for both
// servers together (the plain "at its 30-day low / high, once a day" rule gave 18).
export const RULES = {
  confirmHours: 2, // the newest 2 hourly prices must both be past the old extreme: no one-hour spikes
  minRangePct: 10, // the 30-day low and high must be at least 10% apart: no alerts in a flat market
  repeatDays: 7, // the same server and direction alerts again after 7 days ...
  furtherPct: 3 // ... or sooner when the price went another 3% past the last alert
};

const KIND = {
  low: { title: "30-day low", color: 0x22c55e, icon: "🟢", advice: "Cheapest gold of the last 30 days: a good time to **buy gold**." },
  high: { title: "30-day high", color: 0xef4444, icon: "🔴", advice: "Most expensive gold of the last 30 days: a good time to **sell gold** for silver." }
};

async function discord(method, path, body) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json", "User-Agent": "DiscordBot (https://blackmarketreader.com, 1.0)" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.replace(/\d{15,}/g, "…")} -> HTTP ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** "💰 Gold EU · 9,512 📉" */
export function channelName(region, summary) {
  const trend = summary.day ? (summary.day.pct < -0.05 ? " 📉" : summary.day.pct > 0.05 ? " 📈" : "") : "";
  return `💰 Gold ${region.toUpperCase()} · ${formatSilver(summary.price)}${trend}`;
}

/** "low" / "high" when the newest prices break the 30-day low / high of the hours before, else null. */
export function alertKind(points, now) {
  if (!points || points.length <= RULES.confirmHours || now - points.at(-1)[0] * 1000 > STALE_MS) return null;
  const last = points.at(-1)[0];
  const recent = points.slice(-RULES.confirmHours).map((p) => p[1]);
  const before = points.slice(0, -RULES.confirmHours).filter((p) => p[0] >= last - 30 * DAY_S).map((p) => p[1]);
  if (!before.length) return null;
  const low = Math.min(...before);
  const high = Math.max(...before);
  if (((high - low) / low) * 100 < RULES.minRangePct) return null;
  if (recent.every((v) => v < low)) return "low";
  if (recent.every((v) => v > high)) return "high";
  return null;
}

/** The marker line that also lets the next run find this alert again. */
export const alertTag = (region, kind) => `-# 🚨 GOLD ALERT · ${REGIONS[region].flag} ${REGIONS[region].name.toUpperCase()} · ${KIND[kind].title.toUpperCase()}`;

export function alertMessage(region, kind, summary) {
  const k = KIND[kind];
  const day = summary.day ? `${summary.day.pct < 0 ? "📉" : "📈"} ${formatPct(summary.day.pct)} in 24h · ` : "";
  return {
    flags: 1 << 15,
    allowed_mentions: { roles: [GOLD_ALERT_ROLE] },
    components: [
      { type: 10, content: `<@&${GOLD_ALERT_ROLE}> ${REGIONS[region].flag} gold just broke its ${k.title}` },
      {
        type: 17,
        accent_color: k.color,
        components: [
          { type: 10, content: `${alertTag(region, kind)}\n## ${k.icon}  ${formatSilver(summary.price)} silver per gold\n${k.advice}` },
          { type: 14, divider: true, spacing: 1 },
          {
            type: 10,
            content: [
              `\`${formatSilver(summary.stats.low)}\`  ${priceBar(summary)}  \`${formatSilver(summary.stats.high)}\``,
              "-# 30-day low  →  30-day high",
              `${day}30-day average ${formatSilver(summary.stats.avg)}`
            ].join("\n")
          },
          { type: 1, components: [{ type: 2, style: 5, label: "Gold Tracker", emoji: { name: "📊" }, url: `${SITE}/gold-tracker` }] }
        ]
      }
    ]
  };
}

/** Time and price of the newest alert the bot sent for this server and direction, or null. */
export function lastAlert(messages, botId, region, kind) {
  const tag = alertTag(region, kind);
  const sent = messages
    .filter((m) => m.author?.id === botId && JSON.stringify(m.components ?? []).includes(tag))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
  if (!sent) return null;
  const price = /## \S+\s+([\d,]+) silver per gold/.exec(JSON.stringify(sent.components))?.[1];
  return { at: Date.parse(sent.timestamp), price: price ? Number(price.replace(/,/g, "")) : NaN };
}

/** True when this alert would only repeat the last one (see RULES.repeatDays and furtherPct). */
export function isRepeat(last, kind, price, now) {
  if (!last || now - last.at >= RULES.repeatDays * DAY_S * 1000) return false;
  if (!Number.isFinite(last.price)) return true;
  const step = RULES.furtherPct / 100;
  return kind === "low" ? price > last.price * (1 - step) : price < last.price * (1 + step);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const now = Date.now();
  if (!dryRun && !process.env.DISCORD_BOT_TOKEN) throw new Error("DISCORD_BOT_TOKEN is not set");
  const alertChannel = process.env.DISCORD_LIVE_MODE === "live" ? CHANNELS.alerts : CHANNELS.tester;

  const points = {};
  const summaries = {};
  for (const region of Object.keys(REGIONS)) {
    points[region] = (await fetchJson(`${SITE}/api/aodp/gold?region=${region}`).catch((e) => (console.error(`gold ${region}:`, e.message), null)))?.points;
    summaries[region] = goldSummary(points[region]);
  }

  let failed = false;
  if (args.includes("--names")) {
    for (const region of Object.keys(REGIONS)) {
      if (!summaries[region]) continue;
      const name = channelName(region, summaries[region]);
      if (dryRun) {
        console.log(`name ${region}: ${name}`);
        continue;
      }
      try {
        const channel = await discord("GET", `/channels/${CHANNELS.gold[region]}`);
        if (channel.name !== name) await discord("PATCH", `/channels/${CHANNELS.gold[region]}`, { name });
        console.log(`name ${region}: ${channel.name === name ? "unchanged" : "updated"}`);
      } catch (error) {
        failed = true;
        console.error(`name ${region}:`, error.message);
      }
    }
  }

  if (args.includes("--alerts")) {
    const due = Object.keys(REGIONS).map((region) => [region, alertKind(points[region], now)]).filter(([, kind]) => kind);
    if (!due.length) console.log("alerts: no server broke its 30-day low or high");
    if (due.length && !dryRun) {
      const me = await discord("GET", "/users/@me");
      const recent = await discord("GET", `/channels/${alertChannel}/messages?limit=100`);
      for (const [region, kind] of due) {
        if (isRepeat(lastAlert(recent, me.id, region, kind), kind, summaries[region].price, now)) {
          console.log(`alert ${region} ${kind}: repeat of a recent alert, skipped`);
          continue;
        }
        try {
          await discord("POST", `/channels/${alertChannel}/messages`, alertMessage(region, kind, summaries[region]));
          console.log(`alert ${region} ${kind}: sent`);
        } catch (error) {
          failed = true;
          console.error(`alert ${region} ${kind}:`, error.message);
        }
      }
    }
    if (dryRun) for (const [region, kind] of due) console.log(JSON.stringify(alertMessage(region, kind, summaries[region]), null, 2));
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
