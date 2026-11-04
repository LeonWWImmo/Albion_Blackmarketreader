// Live gold features of the Discord bot, run from .github/workflows/discord-live.yml:
//   --alerts  post a gold alert (pinging the Gold Alerts role) when a server's gold price is at its
//             30-day low or high; at most one alert per server and kind in 24 hours
//   --names   rename the two "💰 Gold EU / US" channels to the current price
//   --dry-run print instead of posting / renaming
// DISCORD_LIVE_MODE=test sends alerts to the private tester channel instead of the alert channel.
// Needs DISCORD_BOT_TOKEN. Plain Node: no npm install needed.
import { pathToFileURL } from "node:url";
import { REGIONS, SITE, fetchJson, formatPct, formatSilver, goldSummary, priceBar } from "../api/_lib/discordData.js";

const CHANNELS = {
  tester: "1567453537372344360",
  // #💰-gold-alerts, where members turn the alerts on and off
  alerts: "1567519806012526722",
  gold: { eu: "1567454937636409437", us: "1567454939503005726" }
};
const GOLD_ALERT_ROLE = "1567454898612600857";
const ALERT_REPEAT_MS = 24 * 3600 * 1000;
// a gold point older than this is not "right now" any more
const STALE_MS = 6 * 3600 * 1000;

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

/** The alert to send for a region now, or null. */
export function alertKind(summary, now) {
  if (!summary?.stats || now - summary.at * 1000 > STALE_MS) return null;
  if (summary.isLow) return "low";
  if (summary.isHigh) return "high";
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
      { type: 10, content: `<@&${GOLD_ALERT_ROLE}> ${REGIONS[region].flag} gold is at its ${k.title}` },
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

/** True when the bot already sent this alert within ALERT_REPEAT_MS. */
export function alreadyAlerted(messages, botId, region, kind, now) {
  const tag = alertTag(region, kind);
  return messages.some(
    (m) => m.author?.id === botId && now - Date.parse(m.timestamp) < ALERT_REPEAT_MS && JSON.stringify(m.components ?? []).includes(tag)
  );
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const now = Date.now();
  if (!dryRun && !process.env.DISCORD_BOT_TOKEN) throw new Error("DISCORD_BOT_TOKEN is not set");
  const alertChannel = process.env.DISCORD_LIVE_MODE === "live" ? CHANNELS.alerts : CHANNELS.tester;

  const summaries = {};
  for (const region of Object.keys(REGIONS)) {
    summaries[region] = goldSummary((await fetchJson(`${SITE}/api/aodp/gold?region=${region}`).catch((e) => (console.error(`gold ${region}:`, e.message), null)))?.points);
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
    const due = Object.keys(REGIONS).map((region) => [region, alertKind(summaries[region], now)]).filter(([, kind]) => kind);
    if (!due.length) console.log("alerts: no server at a 30-day low or high");
    if (due.length && !dryRun) {
      const me = await discord("GET", "/users/@me");
      const recent = await discord("GET", `/channels/${alertChannel}/messages?limit=100`);
      for (const [region, kind] of due) {
        if (alreadyAlerted(recent, me.id, region, kind, now)) {
          console.log(`alert ${region} ${kind}: already sent in the last 24 h`);
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
