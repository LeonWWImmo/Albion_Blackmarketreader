// Daily Discord post per server (EU, US): today's crafting bonus, the gold price with its buy
// signal, the best Black Market crafts with the bonus and the weekly event, in one message that
// pings the region role. Runs once a day from .github/workflows/discord-daily.yml.
//
// The game rolls the new bonus at 10:00 UTC, but AODP only publishes it once players have
// reported it. So the job starts once and waits here: every POLL_MINUTES it checks the regions
// that are still missing, posts each one as soon as its new bonus is in and stops when both are
// done. At DEADLINE_UTC_HOUR it posts what it has (gold, "bonus not reported yet").
//
// The site's own maths is reused (festivities, gold stats, BM crafter rows) through Vite's SSR
// loader, so the numbers match what the tools show.
//
//   node scripts/discord-daily.mjs            post (needs DISCORD_WEBHOOK_EU / _US)
//   node scripts/discord-daily.mjs --dry-run  print the messages, post nothing, do not wait
//   --region eu|us                            only that server
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://blackmarketreader.com";
const USER_AGENT = "BlackmarketReader/1.0 (+https://blackmarketreader.com)";
const POLL_MINUTES = 30;
const DEADLINE_UTC_HOUR = 16;
const TOP_CRAFTS = 3;
// BM Crafter defaults, as a new visitor sees them.
const BM_SETTINGS = { craftCity: "Lymhurst", returnRatePercent: 15.25, usageFeePer100: 1500, minSold: 1 };

const REGIONS = {
  eu: { name: "Europe", flag: "🇪🇺", webhook: process.env.DISCORD_WEBHOOK_EU, role: process.env.DISCORD_ROLE_EU, color: 0x3b82f6 },
  us: { name: "America", flag: "🇺🇸", webhook: process.env.DISCORD_WEBHOOK_US, role: process.env.DISCORD_ROLE_US, color: 0xef4444 }
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyRegion = args.includes("--region") ? args[args.indexOf("--region") + 1] : null;

// deriveRows imports the shared barrel, which also pulls in the site's UI (router, auth). Point it
// at the two plain modules it actually uses instead.
const SHARED_SHIM = "\0discord-shared";
const sharedShim = {
  name: "discord-shared-shim",
  enforce: "pre",
  resolveId: (source, importer) => (source === "../../../shared" && importer?.includes("bm-crafter") ? SHARED_SHIM : null),
  load: (id) =>
    id === SHARED_SHIM ? 'export * from "/src/shared/albion/festivities.ts"; export * from "/src/shared/journals/useJournals.ts";' : null
};
const vite = await createServer({
  root: ROOT,
  logLevel: "error",
  configFile: false,
  plugins: [sharedShim],
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom"
});
const load = (file) => vite.ssrLoadModule(file);
const fest = await load("/src/shared/albion/festivities.ts");
const gold = await load("/src/features/gold-tracker/goldStats.ts");
const fmt = await load("/src/features/gold-tracker/format.ts");
const bmData = await load("/src/features/bm-crafter/data/normalizers.ts");
const bmRows = await load("/src/features/bm-crafter/hooks/deriveRows.ts");
const bmDomain = await load("/src/features/bm-crafter/domain/calculations.ts");

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const readData = (file) => JSON.parse(readFileSync(path.join(ROOT, "public", file), "utf8"));

/** The latest 10:00 UTC reset at or before `now`. */
function lastReset(now) {
  const reset = new Date(now);
  reset.setUTCHours(10, 0, 0, 0);
  if (reset.getTime() > now) reset.setUTCDate(reset.getUTCDate() - 1);
  return reset.getTime();
}

/** Today's bonuses, or null while AODP still has yesterday's (or nothing). */
async function todaysBonuses(region, now) {
  const snapshot = await getJson(`${SITE}/api/aodp/festivities?region=${region}`);
  const bonuses = fest.activeCraftBonuses(snapshot, now).filter((bonus) => {
    const event = snapshot.events.find((e) => e.kind === 2 && e.name === bonus.name);
    return event && Date.parse(event.start) >= lastReset(now);
  });
  return { bonuses: bonuses.length ? bonuses : null, weekly: fest.weeklyEvents(snapshot, now).filter((e) => e.active) };
}

async function goldSummary(region) {
  const { points } = await getJson(`${SITE}/api/aodp/gold?region=${region}`);
  if (!points?.length) return null;
  const price = points[points.length - 1][1];
  const month = gold.pointsInRange(points, 30 * gold.DAY);
  const stats = gold.rangeStats(month);
  const position = gold.pricePosition(month, price);
  const day = gold.changeOver(points, gold.DAY);
  return { price, stats, position, day, isLow: !!stats && price <= stats.low };
}

function bestCrafts(region, bonuses) {
  const bundle = {
    region,
    market: bmData.normalizeMarketPayload(readData(`data/bm-crafter-${region}.json`), region),
    materials: bmData.normalizePricePayload(readData(`data/materials-${region}.json`), region),
    cityMaterials: bmData.normalizeCityMaterialsPayload(readData(`data/materials-cities-${region}.json`)),
    artefacts: bmData.normalizePricePayload(readData(`data/artefacts-${region}.json`), region),
    recipes: bmData.normalizeRecipesPayload(readData("items-categorized-crafting.json"))
  };
  return bmRows
    .deriveBmCrafterRows(bundle, {
      selectedTiers: [],
      selectedEnchants: [],
      minSold: BM_SETTINGS.minSold,
      searchTerm: "",
      returnRate: bmDomain.returnRatePercentToDecimal(BM_SETTINGS.returnRatePercent),
      sortByDailyTop: false,
      showOnlyProfitable: true,
      nonArtefactOnly: false,
      craftCity: BM_SETTINGS.craftCity,
      usageFeePer100: BM_SETTINGS.usageFeePer100,
      dailyBonus: { bonuses, onlyBonusItems: true }
    })
    .slice(0, TOP_CRAFTS);
}

const REFINING = new Set(["fiber", "wood", "rock", "ore", "hide"]);
const CONSUMABLES = new Set(["food", "potion"]);

/** The Crafting Calculator set up like the BM Crafter opens it: Black Market, its craft city, this server. */
function calculatorLink(region, itemId, tier, enchant) {
  const params = new URLSearchParams({ item: itemId, sell: "bm", craftCity: BM_SETTINGS.craftCity, region });
  if (tier) params.set("tier", String(tier));
  if (tier) params.set("enchant", String(enchant ?? 0));
  return `${SITE}/crafting-calculator?${params}`;
}

/** The tool where the player cashes in this bonus. */
function toolLink(region, bonus) {
  if (REFINING.has(bonus.category)) return `${SITE}/refining-calculator`;
  if (CONSUMABLES.has(bonus.category)) return `${SITE}/food-potion-crafter`;
  const item = fest.craftItemFor(bonus.category);
  return item ? calculatorLink(region, item) : `${SITE}/bm-crafter`;
}

const unix = (ms) => Math.floor(ms / 1000);
const tierLabel = (row) => (row.tier ? `T${row.tier}${row.enchant ? `.${row.enchant}` : ""} ` : "");
const itemImage = (itemId) => `https://render.albiononline.com/v1/item/${encodeURIComponent(itemId)}.png?size=128`;
const compact = (value) =>
  Math.abs(value) >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : Math.abs(value) >= 1e3 ? `${(value / 1e3).toFixed(1)}k` : String(Math.round(value));
const MEDALS = ["🥇", "🥈", "🥉"];
const VERDICT = {
  cheap: { icon: "🟢", text: "Good time to buy" },
  fair: { icon: "🟡", text: "Fair price" },
  expensive: { icon: "🔴", text: "Good time to sell" }
};

/** Where today's price sits between the 30-day low and high, as a 12-step bar. */
function priceBar(goldInfo) {
  const steps = 12;
  const at = Math.min(steps - 1, Math.max(0, Math.round(((goldInfo.position?.position ?? 50) / 100) * (steps - 1))));
  const marker = VERDICT[goldInfo.position?.verdict]?.icon ?? "⚪";
  return Array.from({ length: steps }, (_, i) => (i === at ? marker : "▬")).join("");
}

// Discord "Components V2" layout: one card (container) with headings, dividers and an item picture
// next to every bonus and craft. Webhooks may send it because they belong to the bot.
const V2 = 1 << 15;
const text = (content) => ({ type: 10, content });
const divider = (big = true) => ({ type: 14, divider: true, spacing: big ? 2 : 1 });
const space = () => ({ type: 14, divider: false, spacing: 1 });
const withPicture = (content, picture) =>
  picture ? { type: 9, components: [text(content)], accessory: { type: 11, media: { url: picture } } } : text(content);
const linkButton = (label, emoji, url) => ({ type: 2, style: 5, label, emoji: { name: emoji }, url });

/** A picture for the bonus: the category's item, or its refined resource / consumable. */
const BONUS_PICTURES = { ore: "T6_METALBAR", wood: "T6_PLANKS", fiber: "T6_CLOTH", hide: "T6_LEATHER", rock: "T6_STONEBLOCK", food: "T6_MEAL_STEW", potion: "T6_POTION_HEAL" };
function bonusPicture(bonus) {
  const item = BONUS_PICTURES[bonus.category] ?? (fest.craftItemFor(bonus.category) ? `T6_${fest.craftItemFor(bonus.category)}` : null);
  return item ? itemImage(item) : null;
}

function buildMessage(region, now, bonusInfo, goldInfo, crafts) {
  const cfg = REGIONS[region];
  const date = new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const card = [];

  card.push(text(`-# ${cfg.flag}  DAILY UPDATE · ${cfg.name.toUpperCase()}\n# ${date}`));
  card.push(divider());

  // Crafting bonus: the name opens its calculator.
  card.push(text("## ⚒️  Crafting bonus today"));
  if (bonusInfo.bonuses) {
    for (const b of bonusInfo.bonuses) {
      const rare = b.percent >= 20;
      card.push(
        withPicture(
          `### ${rare ? "🔥" : "✨"} [+${b.percent}% ${b.label}](${toolLink(region, b)})\n${rare ? "**Rare bonus!** " : ""}Every craft in this category returns more resources today.`,
          bonusPicture(b)
        )
      );
    }
    card.push(text(`-# ⏳ Next bonus <t:${unix(fest.nextDailyReset(now))}:R>`));
  } else {
    card.push(text(`Not reported for this server yet.\n-# Check the [Dashboard](${SITE}/dashboard) later.`));
  }

  if (goldInfo) {
    const verdict = VERDICT[goldInfo.position?.verdict];
    // Same wording as the Gold Tracker's "Buy or wait?" panel.
    const share = Math.round(goldInfo.position?.percentile ?? 0);
    const detail = {
      cheap: `cheaper than ${100 - share}% of the last 30 days`,
      expensive: `pricier than ${share}% of the last 30 days`,
      fair: `${share}% of the last 30 days were cheaper`
    }[goldInfo.position?.verdict];
    const day = goldInfo.day ? `${goldInfo.day.pct < 0 ? "📉" : "📈"} ${fmt.formatSignedPct(goldInfo.day.pct)} in 24h` : "";
    card.push(divider());
    card.push(text("## 💰  Gold price"));
    const lines = [`### ${fmt.formatSilver(goldInfo.price)} silver  ${day ? `·  ${day}` : ""}`];
    if (goldInfo.stats) lines.push("", `\`${fmt.formatSilver(goldInfo.stats.low)}\`  ${priceBar(goldInfo)}  \`${fmt.formatSilver(goldInfo.stats.high)}\``, "-# 30-day low  →  30-day high");
    if (goldInfo.isLow) lines.push("", "🚨 **GOLD ALERT: lowest price of the last 30 days!**");
    else if (verdict) lines.push("", `${verdict.icon} **${verdict.text}**, ${detail}`);
    card.push(text(lines.join("\n")));
  }

  if (bonusInfo.bonuses) {
    card.push(divider());
    card.push(text("## 🏆  Top crafts · Black Market"));
    if (crafts.length) {
      crafts.forEach((row, i) => {
        const link = calculatorLink(region, bmDomain.normalizeItemId(row.item.id), row.tier, row.enchant);
        card.push(
          withPicture(
            `### ${MEDALS[i]} [${tierLabel(row)}${row.displayName}](${link})\n**+${Math.round(row.economics.profitPct)}% profit** · ${compact(row.economics.profit)} silver per craft`,
            itemImage(row.item.id)
          )
        );
      });
      card.push(text(`-# Crafted in ${BM_SETTINGS.craftCity} · ${BM_SETTINGS.returnRatePercent}% return rate + today's bonus · sold to the Black Market`));
    } else {
      card.push(text(`No Black Market craft over 20% profit with today's bonus.\n-# [Browse all crafts in the BM Crafter](${SITE}/bm-crafter)`));
    }
  }

  if (bonusInfo.weekly.length) {
    card.push(divider());
    card.push(text("## 🎯  Event this week"));
    card.push(text(bonusInfo.weekly.map((e) => `### ${e.title}\n${e.description ? `${e.description}\n` : ""}-# Ends <t:${unix(Date.parse(e.end))}:R>`).join("\n")));
  }

  card.push(divider());
  card.push({
    type: 1,
    components: [
      linkButton("BM Crafter", "🏆", `${SITE}/bm-crafter`),
      linkButton("Calculator", "⚒️", `${SITE}/crafting-calculator`),
      linkButton("Gold Tracker", "💰", `${SITE}/gold-tracker`)
    ]
  });
  card.push(space());
  card.push(text("-# blackmarketreader.com · free Albion Online crafting tools"));

  return {
    username: "Blackmarket Reader",
    flags: V2,
    allowed_mentions: { roles: cfg.role ? [cfg.role] : [] },
    components: [
      ...(cfg.role ? [text(`<@&${cfg.role}> ${cfg.flag} your daily update is here`)] : []),
      { type: 17, accent_color: cfg.color, components: card }
    ]
  };
}

async function post(region, message) {
  const res = await fetch(`${REGIONS[region].webhook}?wait=true&with_components=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message)
  });
  if (!res.ok) throw new Error(`Discord ${region}: HTTP ${res.status} ${await res.text()}`);
}

async function publish(region, now, bonusInfo) {
  const goldInfo = await goldSummary(region).catch((error) => (console.error(`gold ${region}:`, error.message), null));
  const crafts = bonusInfo.bonuses ? bestCrafts(region, bonusInfo.bonuses) : [];
  const message = buildMessage(region, now, bonusInfo, goldInfo, crafts);
  if (dryRun) console.log(`--- ${region} ---\n${JSON.stringify(message, null, 2)}`);
  else await post(region, message);
  console.log(`${region}: ${dryRun ? "printed" : "posted"} (${bonusInfo.bonuses ? "with" : "without"} bonus)`);
}

let pending = Object.keys(REGIONS).filter((region) => !onlyRegion || region === onlyRegion);
if (!dryRun) {
  const missing = pending.filter((region) => !REGIONS[region].webhook);
  if (missing.length) throw new Error(`Missing webhook secret for: ${missing.join(", ")}`);
}

let failed = false;
while (pending.length) {
  const now = Date.now();
  const deadline = new Date(now).getUTCHours() >= DEADLINE_UTC_HOUR;
  for (const region of [...pending]) {
    try {
      const bonusInfo = await todaysBonuses(region, now);
      if (!bonusInfo.bonuses && !deadline && !dryRun) {
        console.log(`${region}: today's bonus not reported yet`);
        continue;
      }
      await publish(region, now, bonusInfo);
      pending = pending.filter((r) => r !== region);
    } catch (error) {
      console.error(`${region}:`, error.message);
      if (deadline || dryRun) {
        failed = true;
        pending = pending.filter((r) => r !== region);
      }
    }
  }
  if (pending.length) {
    // never sleep past the deadline, so the fallback post happens at DEADLINE_UTC_HOUR
    const deadlineAt = new Date(now).setUTCHours(DEADLINE_UTC_HOUR, 0, 0, 0);
    const wait = Math.max(60 * 1000, Math.min(POLL_MINUTES * 60 * 1000, deadlineAt - Date.now()));
    console.log(`waiting ${Math.round(wait / 60000)} min for: ${pending.join(", ")}`);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

await vite.close();
process.exit(failed ? 1 : 0);
