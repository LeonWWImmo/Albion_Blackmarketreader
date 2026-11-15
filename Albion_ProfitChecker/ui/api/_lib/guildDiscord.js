// The guild's Discord report: a player gives a Discord webhook, and the daily guild sync posts the
// report of the guild they marked there. The webhook URL is a secret of their Discord server: it
// stays on the server (api/_lib/guildStore.js), the browser only ever gets its name back.

const SITE = "https://blackmarketreader.com";
const TIMEOUT_MS = 8000;
const USER_AGENT = "BlackmarketReader/1.0 (+https://blackmarketreader.com)";
/** Discord's limit for one embed field. */
const FIELD_MAX = 1024;
const TOP_GAINERS = 5;
const ACCENT = 0x5cf0c8;

// only Discord's own webhook addresses: the server never calls anything else for a player
const WEBHOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{15,25}\/[\w-]{20,100}$/;

export const isWebhookUrl = (url) => typeof url === "string" && WEBHOOK.test(url);

/** 12.3m, 4.5k: fame the way the site shows it. */
export function shortNumber(value) {
  const n = Math.abs(value);
  const unit = n >= 1e9 ? [1e9, "b"] : n >= 1e6 ? [1e6, "m"] : n >= 1e3 ? [1e3, "k"] : [1, ""];
  const scaled = value / unit[0];
  return `${unit[1] && Math.abs(scaled) < 100 ? scaled.toFixed(1).replace(/\.0$/, "") : Math.round(scaled)}${unit[1]}`;
}

/** Names joined for one field, cut at Discord's limit with "+n more". */
function nameList(names) {
  if (!names.length) return "–";
  let text = "";
  for (let i = 0; i < names.length; i++) {
    const next = text ? `${text}, ${names[i]}` : names[i];
    const rest = names.length - i - 1;
    if (next.length + (rest ? 12 : 0) > FIELD_MAX) return `${text} +${names.length - i} more`;
    text = next;
  }
  return text;
}

/**
 * The daily report of one guild, from its guild page answer (guild + activity): who is active,
 * who joined or left since `since` (a day, inclusive), and who gained the most fame in 7 days.
 */
export function dailyReport({ guild, activity }, since, now) {
  const { counts, members, left } = activity;
  const joined = members.filter((m) => m.joinedOn && m.joinedOn >= since).map((m) => m.name);
  const gone = left.filter((m) => m.leftOn >= since).map((m) => m.name);
  const gainers = members
    .filter((m) => (m.gains["7"]?.total ?? 0) > 0)
    .sort((a, b) => b.gains["7"].total - a.gains["7"].total)
    .slice(0, TOP_GAINERS)
    .map((m, i) => `${i + 1}. ${m.name} · ${shortNumber(m.gains["7"].total)}`);
  return {
    username: "Blackmarket Reader",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `${guild.name}: daily report`,
        url: `${SITE}/guild/${guild.region}/${guild.slug}/activity`,
        color: ACCENT,
        fields: [
          {
            name: "Members",
            value: `${guild.memberCount} · 🟢 ${counts.active} active · 🟡 ${counts.quiet} quiet · 🔴 ${counts.inactive} inactive (14+ days)`
          },
          { name: `Joined (${joined.length})`, value: nameList(joined), inline: true },
          { name: `Left (${gone.length})`, value: nameList(gone), inline: true },
          { name: "Most fame, 7 days", value: gainers.length ? gainers.join("\n") :"Shows after a week of daily snapshots." }
        ],
        footer: { text: "Blackmarket Reader · after the daily snapshot" },
        timestamp: now.toISOString()
      }
    ]
  };
}

/** The webhook's name when Discord knows it, else null (deleted, or not a webhook). */
export async function checkWebhook(url) {
  if (!isWebhookUrl(url)) return null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const hook = await res.json();
    return typeof hook?.name === "string" ? hook.name.slice(0, 80) : "Discord webhook";
  } catch {
    return null;
  }
}

/** Posts a message: "ok", "gone" (Discord deleted the webhook) or "failed" (try again tomorrow). */
export async function postWebhook(url, payload) {
  if (!isWebhookUrl(url)) return "gone";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (res.ok) return "ok";
    return res.status === 401 || res.status === 404 ? "gone" : "failed";
  } catch {
    return "failed";
  }
}
