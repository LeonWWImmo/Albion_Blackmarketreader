// Plain-JS copies of the site's crafting-bonus and gold maths for the Discord bot: the Vercel
// functions and the GitHub jobs cannot load the TypeScript in src/. api/_tests/discord-data.test.js
// checks that they give the same answers as src/shared/albion/festivities.ts and
// src/features/gold-tracker/goldStats.ts, so a change there that is not copied here fails the tests.
import { createRequire } from "node:module";

// a plain require() with a fixed path, so Vercel's file tracer packs the JSON into the function
const require = createRequire(import.meta.url);
const craftBonusData = require("../../src/shared/albion/craftBonusData.json");

export const SITE = "https://blackmarketreader.com";
export const USER_AGENT = "BlackmarketReader/1.0 (+https://blackmarketreader.com)";
export const REGIONS = {
  eu: { name: "Europe", flag: "🇪🇺", color: 0x3b82f6 },
  us: { name: "America", flag: "🇺🇸", color: 0xef4444 }
};

const DAY_S = 24 * 3600;

// ---------------------------------------------------------------- crafting bonus (festivities.ts)

const CATEGORY_LABELS = {
  sword: "Swords", axe: "Axes", crossbow: "Crossbows", hammer: "Hammers", mace: "Maces", knuckles: "War Gloves",
  plate_helmet: "Plate Helmets", plate_armor: "Plate Armor", plate_shoes: "Plate Boots", spear: "Spears", bow: "Bows",
  naturestaff: "Nature Staffs", dagger: "Daggers", quarterstaff: "Quarterstaffs", shapeshifterstaff: "Shapeshifter Staffs",
  leather_helmet: "Leather Hoods", leather_armor: "Leather Jackets", leather_shoes: "Leather Shoes", arcanestaff: "Arcane Staffs",
  cursestaff: "Cursed Staffs", firestaff: "Fire Staffs", froststaff: "Frost Staffs", holystaff: "Holy Staffs",
  cloth_helmet: "Cloth Cowls", cloth_armor: "Cloth Robes", cloth_shoes: "Cloth Sandals", offhand: "Off-Hands",
  fiber: "Cloth refining", wood: "Planks refining", rock: "Stone Blocks refining", ore: "Metal Bars refining",
  hide: "Leather refining", tools: "Tools", gatherergear: "Gathering Gear", potion: "Potions", food: "Food", bag: "Bags", cape: "Capes"
};

const WEEKLY_EVENTS = {
  HELLGATE: { title: "Hellgate Frenzy", description: "+15% Fame and +10% Loot in all Hellgates" },
  CORRUPTED: { title: "Corrupted Dungeoneering", description: "+15% Fame and +10% Loot in all Corrupted Dungeons" },
  HELLDUNGEON: { title: "Call of the Depths", description: "+15% Fame and +10% Loot in the Depths" },
  FACTIONPOINTS: { title: "Faction Rivalry", description: "+20% Faction Points in Faction Warfare" },
  GROUP_AND_RAID_DUNGEONS: { title: "Gather Your Party", description: "+20% Fame in Group and Raid Dungeons" },
  STATIC_DUNGEONS: { title: "Invade the Enemy Strongholds", description: "+15% Fame in Static Dungeons and World Boss Strongholds" },
  SOLO_DUNGEONS: { title: "Solo Dungeoneering", description: "+20% Fame in Solo Dungeons" },
  ROAMING_MOBS: { title: "Roam the Open World", description: "+20% Fame from Open World enemies" },
  ROADS: { title: "Roads of Avalon", description: "+10% Fame in the Roads of Avalon" },
  MISTS: { title: "Mist Opportunities", description: "+10% Fame in The Mists" },
  FAME: { title: "Fame Rush", description: "+25% Fame for all activities" },
  MISTS_AND_HELLDUNGEON: { title: "Through Mist and Smoke", description: "+25% Fame and Loot in the Depths and the Mists" },
  DRAGON_AREA_AND_DUNGEON: { title: "Draconic Surge", description: "+10% Fame and +10% Loot in Ancient Lands and Dragon Sanctuaries" },
  DRAGON_AREA_AND_DUNGEON_LAUNCH_EVENT: { title: "Draconic Surge", description: "+15% Fame and +15% Loot in Ancient Lands and Dragon Sanctuaries" },
  ORE: { title: "Gathering Bonus: Ore", description: "+25% Ore gathering yield and +50% more Ore treasures" },
  ROCK: { title: "Gathering Bonus: Stone", description: "+25% Stone gathering yield and +50% more Stone treasures" },
  WOOD: { title: "Gathering Bonus: Wood", description: "+25% Wood gathering yield and +50% more Wood treasures" },
  FIBER: { title: "Gathering Bonus: Fiber", description: "+25% Fiber gathering yield and +50% more Fiber treasures" },
  HIDE: { title: "Gathering Bonus: Hide", description: "+25% Hide gathering yield and +50% more Hide treasures" },
  FISHING: { title: "Gathering Bonus: Fishing", description: "+25% Fishing yield and Fame" },
  TRACKING: { title: "The Great Hunt", description: "+25% more Tracks and Fame for Tracking" }
};

const UPCOMING_WINDOW_MS = 4 * 24 * 3600 * 1000;

const isActive = (event, now) => {
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
};

export function craftCategoryLabel(category) {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

export function activeCraftBonuses(snapshot, now) {
  if (!snapshot?.confirmed) return [];
  const out = [];
  for (const event of snapshot.events ?? []) {
    if (event.kind !== 2 || !isActive(event, now)) continue;
    const bonus = craftBonusData.bonuses[event.name];
    if (!bonus) continue;
    out.push({ name: event.name, category: bonus.category, percent: bonus.percent, label: craftCategoryLabel(bonus.category), end: event.end });
  }
  return out.sort((a, b) => b.percent - a.percent || a.label.localeCompare(b.label));
}

const titleCase = (name) => name.toLowerCase().split("_").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export function weeklyEvents(snapshot, now) {
  if (!snapshot?.confirmed) return [];
  const out = [];
  for (const event of snapshot.events ?? []) {
    if (event.kind !== 1) continue;
    const start = Date.parse(event.start);
    const end = Date.parse(event.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= now || start - now > UPCOMING_WINDOW_MS) continue;
    const known = WEEKLY_EVENTS[event.name];
    out.push({ name: event.name, title: known?.title ?? titleCase(event.name), description: known?.description ?? "", start: event.start, end: event.end, active: start <= now });
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || Date.parse(a.start) - Date.parse(b.start));
}

export function nextDailyReset(now) {
  const date = new Date(now);
  const reset = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 10, 0, 0);
  return reset > now ? reset : reset + 24 * 3600 * 1000;
}

/** The tool where the player cashes in a bonus (same choice as scripts/discord-daily.mjs). */
export function bonusLink(region, bonus) {
  if (["fiber", "wood", "rock", "ore", "hide"].includes(bonus.category)) return `${SITE}/refining-calculator`;
  if (["food", "potion"].includes(bonus.category)) return `${SITE}/food-potion-crafter`;
  const item = craftBonusData.craftItemOf[bonus.category];
  if (!item) return `${SITE}/bm-crafter`;
  return `${SITE}/crafting-calculator?${new URLSearchParams({ item, sell: "bm", craftCity: "Lymhurst", region })}`;
}

// ---------------------------------------------------------------- gold (goldStats.ts)

function lastIndexAtOrBefore(points, time) {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= time) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export function pointsInRange(points, seconds) {
  if (!points.length) return [];
  const from = points[points.length - 1][0] - seconds;
  return points.slice(lastIndexAtOrBefore(points, from - 1) + 1);
}

export function changeOver(points, seconds) {
  if (points.length < 2) return null;
  const [lastTime, to] = points[points.length - 1];
  const target = lastTime - seconds;
  const i = lastIndexAtOrBefore(points, target);
  if (i < 0 || target - points[i][0] > 6 * 3600) return null;
  const from = points[i][1];
  return { from, to, abs: to - from, pct: from > 0 ? ((to - from) / from) * 100 : 0 };
}

export function rangeStats(points) {
  if (!points.length) return null;
  let low = points[0];
  let high = points[0];
  let sum = 0;
  for (const point of points) {
    if (point[1] < low[1]) low = point;
    if (point[1] > high[1]) high = point;
    sum += point[1];
  }
  return { low: low[1], lowAt: low[0], high: high[1], highAt: high[0], avg: sum / points.length };
}

export function pricePosition(points, price) {
  const stats = rangeStats(points);
  if (!stats) return null;
  let cheaper = 0;
  for (const point of points) if (point[1] < price) cheaper += 1;
  const percentile = (cheaper / points.length) * 100;
  const span = stats.high - stats.low;
  const position = span > 0 ? Math.min(100, Math.max(0, ((price - stats.low) / span) * 100)) : 50;
  const verdict = percentile <= 30 ? "cheap" : percentile >= 70 ? "expensive" : "fair";
  return { percentile, position, verdict };
}

/** Everything the bot says about one region's gold price. */
export function goldSummary(points) {
  if (!points?.length) return null;
  const price = points[points.length - 1][1];
  const month = pointsInRange(points, 30 * DAY_S);
  const stats = rangeStats(month);
  return {
    price,
    at: points[points.length - 1][0],
    day: changeOver(points, DAY_S),
    stats,
    position: pricePosition(month, price),
    isLow: !!stats && price <= stats.low,
    isHigh: !!stats && price >= stats.high
  };
}

// ---------------------------------------------------------------- shared formatting

export const formatSilver = (value) => Math.round(value).toLocaleString("en-US");
export const formatPct = (value) => `${value > 0 ? "+" : value < 0 ? "−" : "±"}${Math.abs(value).toFixed(1)}%`;
export const unix = (ms) => Math.floor(ms / 1000);

export const VERDICT = {
  cheap: { icon: "🟢", text: "Good time to buy" },
  fair: { icon: "🟡", text: "Fair price" },
  expensive: { icon: "🔴", text: "Good time to sell" }
};

/** Today's price between the 30-day low and high, as a 12-step bar. */
export function priceBar(summary) {
  const steps = 12;
  const at = Math.min(steps - 1, Math.max(0, Math.round(((summary.position?.position ?? 50) / 100) * (steps - 1))));
  const marker = VERDICT[summary.position?.verdict]?.icon ?? "⚪";
  return Array.from({ length: steps }, (_, i) => (i === at ? marker : "▬")).join("");
}

export async function fetchJson(url, timeoutMs = 8000) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url.replace(/\?.*/, "")} -> HTTP ${res.status}`);
  return res.json();
}
