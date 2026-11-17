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

const ICON = `${SITE}/apple-touch-icon.png`;
const BAR_CELLS = 12;
const MEDALS = ["🥇", "🥈", "🥉"];
const REGION = { eu: "Europe", us: "America" };
const DAY_MS = 86_400_000;

const author = { name: "Blackmarket Reader · Guild tools", url: `${SITE}/guild`, icon_url: ICON };
const guildUrl = (guild, tab) => `${SITE}/guild/${guild.region}/${guild.slug}${tab ? `/${tab}` : ""}`;

/** The members as a bar of coloured squares: active, quiet, inactive. */
export function statusBar({ active = 0, quiet = 0, inactive = 0 }) {
  const all = active + quiet + inactive;
  if (!all) return "";
  const cells = [active, quiet, inactive].map((n) => Math.round((n / all) * BAR_CELLS));
  // rounding may give one cell too many or too few: the biggest part takes it
  const biggest = cells.indexOf(Math.max(...cells));
  cells[biggest] += BAR_CELLS - cells.reduce((t, n) => t + n, 0);
  return "🟩".repeat(cells[0]) + "🟨".repeat(cells[1]) + "🟥".repeat(cells[2]);
}

/**
 * The daily report of one guild, from its guild page answer (guild, tracking, activity, fights):
 * the members as a bar, the fights of the last day, who joined or left since `since` (a day,
 * inclusive) and who gained the most fame in 7 days. One Discord embed, with links to the tabs.
 */
export function dailyReport({ guild, tracking, activity, fights = [] }, since, now) {
  const { counts, members, left } = activity;
  // the first snapshot lists everyone who was in the guild already: joins and leaves count from the next day
  const trackedSince = tracking?.since ?? null;
  const fresh = !trackedSince || trackedSince >= since;
  const joined = fresh ? [] : members.filter((m) => m.joinedOn && m.joinedOn > trackedSince && m.joinedOn >= since).map((m) => m.name);
  const gone = fresh ? [] : left.filter((m) => m.leftOn >= since).map((m) => m.name);
  const gainers = members
    .filter((m) => (m.gains["7"]?.total ?? 0) > 0)
    .sort((a, b) => b.gains["7"].total - a.gains["7"].total)
    .slice(0, TOP_GAINERS)
    .map((m, i) => `${MEDALS[i] ?? `\`${i + 1}.\``} **${m.name}** · ${shortNumber(m.gains["7"].total)}`);
  const lastDay = fights.filter((f) => now - Date.parse(f.startTime) <= DAY_MS);
  const kills = lastDay.reduce((t, f) => t + f.kills, 0);
  const deaths = lastDay.reduce((t, f) => t + f.deaths, 0);
  const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const bar = statusBar(counts);
  return {
    username: "Blackmarket Reader",
    avatar_url: ICON,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        author,
        title: `🛡️ ${guild.allianceTag ? `[${guild.allianceTag}] ` : ""}${guild.name}`,
        url: guildUrl(guild, "activity"),
        description: [
          `**Daily report** · ${date} · ${REGION[guild.region] ?? guild.region.toUpperCase()}`,
          "",
          `👥 **${guild.memberCount} members**`,
          ...(bar ? [bar] : []),
          `🟩 ${counts.active} active · 🟨 ${counts.quiet} quiet · 🟥 ${counts.inactive} inactive (14+ days)`
        ].join("\n"),
        color: ACCENT,
        fields: [
          { name: "⚔️ Fights, 24h", value: `**${lastDay.length}**`, inline: true },
          { name: "🗡️ Kills", value: `**${kills}**`, inline: true },
          { name: "💀 Deaths", value: deaths ? `**${deaths}** · [regear](${guildUrl(guild, "regear")})` : "**0**", inline: true },
          ...(fresh
            ? [{ name: "📥 Joined and 📤 left", value: "From the next report on: today is the guild's first snapshot." }]
            : [
                { name: `📥 Joined (${joined.length})`, value: joined.length ? nameList(joined) : "Nobody", inline: true },
                { name: `📤 Left (${gone.length})`, value: gone.length ? nameList(gone) : "Nobody", inline: true }
              ]),
          { name: "🏆 Most fame, 7 days", value: gainers.length ? gainers.join("\n") : "Shows after a week of daily snapshots." },
          {
            name: "🔗 Open",
            value: ["activity", "battles", "attendance", "regear"].map((tab) => `[${tab[0].toUpperCase()}${tab.slice(1)}](${guildUrl(guild, tab)})`).join(" · ")
          }
        ],
        footer: { text: "Daily snapshot · blackmarketreader.com", icon_url: ICON },
        timestamp: now.toISOString()
      }
    ]
  };
}

/** The first message to a new webhook: what will come here, and when. */
export function helloMessage(guild) {
  return {
    username: "Blackmarket Reader",
    avatar_url: ICON,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        author,
        title: "✅ Connected",
        url: guildUrl(guild, "discord"),
        description: `The daily report of **${guild.name}** comes to this channel every day after the guild snapshot.`,
        color: ACCENT,
        fields: [
          { name: "🕓 When", value: "Every day, 03:30 to 04:30 UTC", inline: true },
          { name: "🔕 Pings", value: "None", inline: true },
          { name: "📋 In the report", value: "Active, quiet and inactive members · the fights of the last day · who joined and left · the top fame gainers of the week" }
        ],
        footer: { text: "Change or remove it in the Discord tab of the guild page", icon_url: ICON }
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
