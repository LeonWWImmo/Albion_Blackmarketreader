// The bot's slash commands: /gold (gold price for both servers) and /bonus (today's crafting bonus).
// Answers are only visible to whoever asked. api/discord/interactions.js routes the commands here;
// tools/discord/commands.mjs (outside the repo, it needs the bot token) registers COMMANDS.
// Discord wants the answer within 3 seconds, so the site's (CDN-cached) APIs get 2 seconds and a
// slow one shows "try again" instead of the command failing.
import {
  REGIONS, SITE, VERDICT, activeCraftBonuses, bonusLink, fetchJson, formatPct, formatSilver,
  goldSummary, nextDailyReset, priceBar, unix, weeklyEvents
} from "./discordData.js";

const EPHEMERAL = 1 << 6;
const API_TIMEOUT_MS = 2000;
const V2 = 1 << 15;
const REGION_OPTION = {
  type: 3,
  name: "server",
  description: "Europe or America (default: your server role)",
  required: false,
  choices: [{ name: "Europe", value: "eu" }, { name: "America", value: "us" }]
};

export const COMMANDS = [
  { name: "gold", description: "Gold price right now, with the 30-day low and high", type: 1, options: [REGION_OPTION] },
  { name: "bonus", description: "Today's crafting bonus and this week's event", type: 1, options: [REGION_OPTION] }
];

const text = (content) => ({ type: 10, content });
const divider = () => ({ type: 14, divider: true, spacing: 1 });
const link = (label, emoji, url) => ({ type: 2, style: 5, label, emoji: { name: emoji }, url });

/** An answer only the asker sees, as one card. */
export function card(color, components) {
  return { type: 4, data: { flags: EPHEMERAL | V2, allowed_mentions: { parse: [] }, components: [{ type: 17, accent_color: color, components }] } };
}

/** The regions to answer for: the chosen one, else the asker's server role, else both. */
export function regionsFor(interaction, roles) {
  const chosen = interaction.data?.options?.find((o) => o.name === "server")?.value;
  if (REGIONS[chosen]) return [chosen];
  const own = Object.keys(roles).filter((region) => interaction.member?.roles?.includes(roles[region]));
  return own.length === 1 ? own : ["eu", "us"];
}

export function goldBlock(region, summary) {
  const cfg = REGIONS[region];
  if (!summary) return `### ${cfg.flag}  ${cfg.name}\nNo gold price right now, try again in a few minutes.`;
  const day = summary.day ? ` · ${summary.day.pct < 0 ? "📉" : "📈"} ${formatPct(summary.day.pct)} in 24h` : "";
  const lines = [`### ${cfg.flag}  ${cfg.name} · ${formatSilver(summary.price)} silver${day}`];
  if (summary.stats) lines.push(`\`${formatSilver(summary.stats.low)}\`  ${priceBar(summary)}  \`${formatSilver(summary.stats.high)}\``, "-# 30-day low  →  30-day high");
  if (summary.isLow) lines.push("🚨 **30-day low right now!** Good time to buy gold.");
  else if (summary.isHigh) lines.push("📈 **30-day high right now!** Good time to sell gold.");
  else if (VERDICT[summary.position?.verdict]) lines.push(`${VERDICT[summary.position.verdict].icon} **${VERDICT[summary.position.verdict].text}**`);
  return lines.join("\n");
}

export async function goldAnswer(regions) {
  const blocks = await Promise.all(
    regions.map(async (region) => goldBlock(region, goldSummary((await fetchJson(`${SITE}/api/aodp/gold?region=${region}`, API_TIMEOUT_MS).catch(() => null))?.points)))
  );
  const body = [text("## 💰  Gold price")];
  blocks.forEach((block, i) => body.push(...(i ? [divider()] : []), text(block)));
  body.push({ type: 1, components: [link("Gold Tracker", "📊", `${SITE}/gold-tracker`)] });
  return card(0xd9a441, body);
}

export function bonusBlock(region, snapshot, now) {
  const cfg = REGIONS[region];
  const lines = [`### ${cfg.flag}  ${cfg.name}`];
  if (snapshot?.failed) return `${lines[0]}\nCould not load the bonus right now, try again in a minute.`;
  const bonuses = activeCraftBonuses(snapshot, now);
  if (bonuses.length) {
    for (const b of bonuses) lines.push(`${b.percent >= 20 ? "🔥" : "✨"} **[+${b.percent}% ${b.label}](${bonusLink(region, b)})**`);
    lines.push(`-# ⏳ Next bonus <t:${unix(nextDailyReset(now))}:R>`);
  } else {
    lines.push("Not reported for this server yet.");
  }
  const event = weeklyEvents(snapshot, now).find((e) => e.active);
  if (event) lines.push(`🎯 ${event.title}${event.description ? ` · ${event.description}` : ""} · ends <t:${unix(Date.parse(event.end))}:R>`);
  return lines.join("\n");
}

export async function bonusAnswer(regions, now = Date.now()) {
  const blocks = await Promise.all(
    regions.map(async (region) => bonusBlock(region, await fetchJson(`${SITE}/api/aodp/festivities?region=${region}`, API_TIMEOUT_MS).catch(() => ({ failed: true })), now))
  );
  const body = [text("## ⚒️  Crafting bonus today")];
  blocks.forEach((block, i) => body.push(...(i ? [divider()] : []), text(block)));
  body.push({ type: 1, components: [link("BM Crafter", "🏆", `${SITE}/bm-crafter`), link("Calculator", "⚒️", `${SITE}/crafting-calculator`)] });
  return card(0x22c55e, body);
}
