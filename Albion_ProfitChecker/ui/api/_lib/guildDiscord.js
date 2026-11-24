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
/** An empty field name (Discord needs one). */
const SPACER = "\u200b";

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

/** The best of each kind of fame in a week, for the daily report's "stars of the week". */
const STARS = [
  ["pvp", "⚔️", "PvP"],
  ["pve", "🐉", "PvE"],
  ["gathering", "⛏️", "Gathering"],
  ["crafting", "🔨", "Crafting"]
];
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const kdOf = (kills, deaths) => (deaths ? (kills / deaths).toFixed(2) : kills ? "∞" : "–");
const battleUrl = (region, id) => `${SITE}/guild/battle/${region}/${id}`;
/** The tabs of the guild page as one line of links. */
const tabLinks = (guild) =>
  [
    ["📊", "Activity", "activity"],
    ["⚔️", "Battles", "battles"],
    ["📋", "Attendance", "attendance"],
    ["🛡️", "Regear", "regear"]
  ]
    .map(([icon, label, tab]) => `[${icon} ${label}](${guildUrl(guild, tab)})`)
    .join("  ·  ");

/**
 * The daily report of one guild, from its guild page answer (guild, tracking, activity, fights).
 * At the top the last day's fighting (kills against deaths, K/D, the biggest fight), then the roster
 * as a bar, the week's fame (the guild's total, the top gainers and the best of each kind), who
 * joined or left since `since` (a day, inclusive) and links to the tabs. One Discord embed.
 */
export function dailyReport({ guild, tracking, activity, fights = [] }, since, now) {
  const { counts, members, left } = activity;
  // the first snapshot lists everyone who was in the guild already: joins and leaves count from the next day
  const trackedSince = tracking?.since ?? null;
  const fresh = !trackedSince || trackedSince >= since;
  const joined = fresh ? [] : members.filter((m) => m.joinedOn && m.joinedOn > trackedSince && m.joinedOn >= since).map((m) => m.name);
  const gone = fresh ? [] : left.filter((m) => m.leftOn >= since).map((m) => m.name);
  const week = (m, kind = "total") => m.gains["7"]?.[kind] ?? 0;
  const gainers = members
    .filter((m) => week(m) > 0)
    .sort((a, b) => week(b) - week(a))
    .slice(0, TOP_GAINERS)
    .map((m, i) => `${MEDALS[i] ?? `\`${i + 1}.\``} **${m.name}** · ${shortNumber(week(m))}`);
  const weekFame = members.reduce((t, m) => t + week(m), 0);
  const stars = STARS.map(([kind, icon, label]) => {
    const best = members.reduce((top, m) => (week(m, kind) > (top ? week(top, kind) : 0) ? m : top), null);
    return best ? `${icon} ${label} · **${best.name}** · ${shortNumber(week(best, kind))}` : null;
  }).filter(Boolean);
  const lastDay = fights.filter((f) => now - Date.parse(f.startTime) <= DAY_MS);
  const kills = lastDay.reduce((t, f) => t + f.kills, 0);
  const deaths = lastDay.reduce((t, f) => t + f.deaths, 0);
  // the fight of the day: the most players
  const biggest = lastDay.reduce((top, f) => (!top || f.players > top.players ? f : top), null);
  const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const bar = statusBar(counts);
  const share = (n) => (guild.memberCount ? ` (${Math.round((n / guild.memberCount) * 100)}%)` : "");
  const moves = fresh ? "" : ` · 📥 +${joined.length} · 📤 −${gone.length}`;
  return {
    username: "Blackmarket Reader",
    avatar_url: ICON,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        author: { ...author, name: `Daily report · ${date}` },
        title: `🛡️ ${guild.allianceTag ? `[${guild.allianceTag}] ` : ""}${guild.name}`,
        url: guildUrl(guild, "activity"),
        description: [
          `-# 🌍 ${REGION[guild.region] ?? guild.region.toUpperCase()} · 👥 ${guild.memberCount} members${moves}`,
          ...(lastDay.length
            ? [`## ⚔️ ${kills} – ${deaths} 💀`, `${killBar(kills, deaths)}  **K/D ${kdOf(kills, deaths)}** · ${plural(lastDay.length, "fight")} in 24h`]
            : ["## 🕊️ No fights in 24h"])
        ].join("\n"),
        color: ACCENT,
        fields: [
          ...(biggest
            ? [
                {
                  name: "🔥 Fight of the day",
                  value: `[**${biggest.kills} – ${biggest.deaths}**](${battleUrl(guild.region, biggest.id)})${biggest.enemy ? ` vs ${biggest.enemy}` : ""} · ${biggest.ours} of ${biggest.players} players · <t:${Math.round(Date.parse(biggest.startTime) / 1000)}:t>${deaths ? `\n🛡️ ${plural(deaths, "death")} to regear: [open](${guildUrl(guild, "regear")})` : ""}`
                }
              ]
            : []),
          {
            name: "👥 Roster",
            value: [...(bar ? [bar] : []), `🟩 **${counts.active}** active${share(counts.active)} · 🟨 **${counts.quiet}** quiet · 🟥 **${counts.inactive}** inactive (14+ days)`].join("\n")
          },
          ...(gainers.length
            ? [
                { name: `🏆 Top fame · 7 days · +${shortNumber(weekFame)} in all`, value: gainers.join("\n"), inline: true },
                ...(stars.length ? [{ name: "🌟 Stars of the week", value: stars.join("\n"), inline: true }] : [])
              ]
            : [{ name: "🏆 Top fame · 7 days", value: "Shows after a week of daily snapshots." }]),
          ...(fresh
            ? [{ name: "📥 Joined and 📤 left", value: "From the next report on: today is the guild's first snapshot." }]
            : [
                // one field each, not inline: inline ones would join the fame row above
                { name: `📥 Joined (${joined.length})`, value: joined.length ? nameList(joined) : "Nobody" },
                { name: `📤 Left (${gone.length})`, value: gone.length ? nameList(gone) : "Nobody" }
              ]),
          { name: SPACER, value: tabLinks(guild) }
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

const ZVZ_TOP = 3;
const ZVZ_ENEMIES = 4;
const RESULT = {
  won: { word: "Victory", icon: "🏆", color: 0x4ade80 },
  lost: { word: "Defeat", icon: "💀", color: 0xf87171 },
  even: { word: "Stalemate", icon: "⚖️", color: 0xf5c451 }
};
const BAR_WIDTH = 10;

/** The three best of the guild's players by one number, with medals. */
function podium(players, value, show) {
  const best = players
    .filter((p) => value(p) > 0)
    .sort((a, b) => value(b) - value(a))
    .slice(0, ZVZ_TOP);
  return best.length ? best.map((p, i) => `${MEDALS[i]} **${p.name}** · ${show(value(p))}`).join("\n") : "–";
}

/** Kills against deaths as ten squares: green for the kills' share, red for the deaths'. */
export function killBar(kills, deaths) {
  if (!kills && !deaths) return "⬛".repeat(BAR_WIDTH);
  const green = Math.round((kills / (kills + deaths)) * BAR_WIDTH);
  return "🟩".repeat(green) + "🟥".repeat(BAR_WIDTH - green);
}

/** The biggest enemy groups of a fight (alliances, or guilds without one), by players. */
function enemiesOf(players, isFriend) {
  const groups = new Map();
  for (const p of players) {
    if (isFriend(p)) continue;
    const key = p.allianceId ?? p.guildId ?? "none";
    const name = p.allianceName ? `[${p.allianceName}]` : (p.guildName ?? "No guild");
    const g = groups.get(key) ?? { name, n: 0 };
    g.n++;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.n - a.n).slice(0, ZVZ_ENEMIES);
}

/** The enemy groups as a small table in a code block: name, players, a bar against our numbers. */
function enemyTable(enemies, ours) {
  if (!enemies.length) return null;
  const most = Math.max(ours, ...enemies.map((e) => e.n));
  const width = Math.min(16, Math.max(...enemies.map((e) => e.name.length), 4));
  const line = (name, n) => `${name.slice(0, width).padEnd(width)} ${String(n).padStart(3)}  ${"█".repeat(Math.max(1, Math.round((n / most) * BAR_WIDTH))).padEnd(BAR_WIDTH, "░")}`;
  return ["```", line("Us", ours), ...enemies.map((e) => line(e.name, e.n)), "```"].join("\n");
}

/**
 * Guild Pro: the report of one big fight of the marked guild, from its battle report answer
 * (api/_lib/guildApi.js getBattleReport): a scoreboard (kills against deaths, with a bar), the time,
 * size and the enemy, fame won and lost, what the deaths cost in gear, the MVP with their weapon,
 * the top damage, kill fame and support, and a banner for the result
 * (public/picture/zvz-<won|lost|even>.jpg).
 */
export function zvzReport(guild, { battle, guilds, players, kills, priced }) {
  const ours = players.filter((p) => p.guildId === guild.id);
  const row = guilds.find((g) => g.id === guild.id);
  const k = row?.kills ?? ours.reduce((t, p) => t + p.kills, 0);
  const d = row?.deaths ?? ours.reduce((t, p) => t + p.deaths, 0);
  const fame = row?.killFame ?? ours.reduce((t, p) => t + p.killFame, 0);
  const fameLost = row?.deathFame ?? null;
  const kind = k > d ? "won" : k < d ? "lost" : "even";
  const result = RESULT[kind];
  // the side the guild fought on: its alliance when it has one
  const alliance = ours.find((p) => p.allianceId)?.allianceId ?? null;
  const enemies = enemiesOf(players, (p) => p.guildId === guild.id || (alliance !== null && p.allianceId === alliance));
  const regear = priced ? kills.filter((e) => e.victim.guildId === guild.id).reduce((t, e) => t + e.victim.gearValue, 0) : null;
  const start = Math.round(Date.parse(battle.startTime) / 1000);
  const minutes = Math.max(1, Math.round((Date.parse(battle.endTime) - Date.parse(battle.startTime)) / 60_000));
  const url = battleUrl(guild.region, battle.id);
  const tag = guild.allianceTag ? `[${guild.allianceTag}] ` : "";
  // the MVP: most kill fame, then damage
  const mvp = [...ours].sort((a, b) => b.killFame - a.killFame || b.damage - a.damage).find((p) => p.killFame > 0 || p.damage > 0) ?? null;
  const table = enemyTable(enemies, ours.length);
  // with prices: the most expensive kill of ours and the most expensive death
  const mostValue = (list) => list.reduce((top, e) => (!top || e.victim.gearValue > top.victim.gearValue ? e : top), null);
  const bestKill = priced ? mostValue(kills.filter((e) => e.killer?.guildId === guild.id && e.victim.guildId !== guild.id && e.victim.gearValue > 0)) : null;
  const worstDeath = priced ? mostValue(kills.filter((e) => e.victim.guildId === guild.id && e.victim.gearValue > 0)) : null;
  const balance = fameLost === null ? null : fame - fameLost;
  return {
    username: "Blackmarket Reader",
    avatar_url: ICON,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        author: { name: `ZvZ report · ${tag}${guild.name}`, url: guildUrl(guild, "battles"), icon_url: ICON },
        title: `${result.icon} ${result.word}${enemies[0] ? ` vs ${enemies[0].name}` : ""}`,
        url,
        description: [
          `# ${k} ⚔️ ${d}`,
          `${killBar(k, d)}  **K/D ${kdOf(k, d)}**${balance === null ? "" : ` · ${balance >= 0 ? "📈 +" : "📉 −"}${shortNumber(Math.abs(balance))} fame`}`,
          `-# 🕒 <t:${start}:f> · ⏱️ ${minutes} min · 🌍 ${REGION[guild.region] ?? guild.region.toUpperCase()} · 👥 ${ours.length} of ${battle.players} players`
        ].join("\n"),
        color: result.color,
        ...(mvp?.weapon?.type ? { thumbnail: { url: `https://render.albiononline.com/v1/item/${encodeURIComponent(mvp.weapon.type)}.png?quality=${mvp.weapon.quality ?? 1}` } } : {}),
        fields: [
          ...(mvp
            ? [
                {
                  name: "👑 MVP",
                  value: `### ${mvp.name}\n${plural(mvp.kills, "kill")} · ${shortNumber(mvp.killFame)} fame · ${shortNumber(mvp.damage)} damage${mvp.itemPower ? ` · IP ${Math.round(mvp.itemPower)}` : ""}`
                }
              ]
            : []),
          { name: "⭐ Kill fame", value: `**${shortNumber(fame)}**`, inline: true },
          { name: "🩸 Fame lost", value: fameLost === null ? "–" : `**${shortNumber(fameLost)}**`, inline: true },
          { name: "💰 Regear", value: regear === null ? `[open](${guildUrl(guild, "regear")})` : `**${shortNumber(regear)}** silver`, inline: true },
          { name: "🔥 Damage", value: podium(ours, (p) => p.damage, shortNumber), inline: true },
          { name: "🏆 Kill fame", value: podium(ours, (p) => p.killFame, shortNumber), inline: true },
          { name: "💚 Support", value: podium(ours, (p) => p.healAssists, (n) => `${n} heals`), inline: true },
          { name: "🎯 Kills", value: podium(ours, (p) => p.kills, (n) => plural(n, "kill")), inline: true },
          ...(bestKill ? [{ name: "💎 Best kill", value: `**${bestKill.killer.name}** ➜ ${bestKill.victim.name}\n${shortNumber(bestKill.victim.gearValue)} silver of gear`, inline: true }] : []),
          ...(worstDeath ? [{ name: "💸 Biggest loss", value: `**${worstDeath.victim.name}**\n${shortNumber(worstDeath.victim.gearValue)} silver of gear`, inline: true }] : []),
          ...(table ? [{ name: "🆚 Who was there", value: table }] : []),
          { name: SPACER, value: `[📜 Battle report](${url})  ·  [🛡️ Regear](${guildUrl(guild, "regear")})  ·  [📋 Attendance](${guildUrl(guild, "attendance")})` }
        ],
        image: { url: `${SITE}/picture/zvz-${kind}.jpg` },
        footer: { text: "Guild Pro · blackmarketreader.com", icon_url: ICON },
        timestamp: battle.endTime
      }
    ]
  };
}

/** The message when the ZvZ report is turned on: what comes, and when. */
export function zvzHello(guild) {
  return {
    username: "Blackmarket Reader",
    avatar_url: ICON,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        author,
        title: "⚔️ ZvZ reports on",
        url: guildUrl(guild, "discord"),
        description: `After every big fight of **${guild.name}**, its report comes to this channel.`,
        color: ACCENT,
        fields: [
          { name: "🕓 When", value: "About 15 to 45 minutes after the fight ends", inline: true },
          { name: "🔕 Pings", value: "None", inline: true },
          { name: "⚔️ Big fight", value: "20+ players, 5+ of the guild", inline: true },
          { name: "📋 In the report", value: "Won or lost · kills, deaths, K/D, kill fame · regear cost · top damage, kill fame and support · the enemy" }
        ],
        footer: { text: "Guild Pro · change it in the Discord tab of the guild page", icon_url: ICON }
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
