// The City Crafter's free preview: the top 3 crafts of every city, worked out on the server from the
// live snapshot with the standard settings. Only those rows leave the server, so a visitor without
// premium has nothing more in the browser to unlock. A plain-JS copy of
// src/features/city-crafter/core/cityCraft.ts (the functions cannot load the TypeScript in src/);
// api/_tests/city-teaser.test.js checks both give the same rows.
import { createRequire } from "node:module";

// a plain require() with a fixed path, so Vercel's file tracer packs the JSON into the function
const require = createRequire(import.meta.url);
const recipesFile = require("../../public/items-categorized-crafting.json");

export const TEASER_CITIES = ["Bridgewatch", "Caerleon", "Fort Sterling", "Lymhurst", "Martlock", "Thetford", "Brecilien"];
export const TEASER_ROWS = 3;
/** The standard settings of the City Crafter (CityCrafterPage.tsx defaults). */
export const TEASER_SETTINGS = { tiers: [4, 5, 6, 7, 8], enchants: [0, 1, 2, 3], usageFee: 1000, taxRate: 0.04, minSold: 3, minRoi: 10 };

const SETUP_FEE_RATE = 0.025;
const LIVE_MAX_AGE_MIN = 24 * 60;
const SPIKE_FACTOR = 1.3;
const BASE_BONUS = 18;
const CITY_BONUS = 15;
const MATERIAL_NAME = { METALBAR: "Metal Bar", PLANKS: "Planks", CLOTH: "Cloth", LEATHER: "Leather", STONEBLOCK: "Stone Block" };
const TIER_PREFIX = { 4: "Adept's", 5: "Expert's", 6: "Master's", 7: "Grandmaster's", 8: "Elder's" };
const PREFIX = /^(Beginner's|Novice's|Journeyman's|Adept's|Expert's|Master's|Grandmaster's|Elder's)\s+/;
/** bm-crafter/domain/calculations.ts STATION_ITEM_VALUE */
const ITEM_VALUE = {
  "4-0": 256, "4-1": 720, "4-2": 1980, "4-3": 5400, "4-4": 14760,
  "5-0": 512, "5-1": 1440, "5-2": 3960, "5-3": 10800, "5-4": 29520,
  "6-0": 1024, "6-1": 2880, "6-2": 7920, "6-3": 21600, "6-4": 59040,
  "7-0": 2048, "7-1": 5760, "7-2": 15840, "7-3": 43200, "7-4": 118080,
  "8-0": 4096, "8-1": 11520, "8-2": 31680, "8-3": 86400, "8-4": 236160
};

/** The recipes as the site reads them (bm-crafter normalizeRecipesPayload). */
export function teaserRecipes(file = recipesFile) {
  const out = [];
  for (const category of file?.categories ?? []) {
    for (const entry of category.items ?? []) {
      const materials = (entry.materials ?? [])
        .map((m) => ({ itemId: String(m.itemId || m.name || "").trim(), qty: Number(m.qty) }))
        .filter((m) => m.itemId && Number.isFinite(m.qty));
      if (!entry.id || !materials.length) continue;
      out.push({ itemId: entry.id, name: entry.name, categoryKey: category.key, materials, artifactId: entry.artifactId || null, artifact: entry.artifact });
    }
  }
  return out;
}

/** crafting-calculator getBonusCityForItem */
function bonusCity(id, categoryKey) {
  if (id === "BAG" || id === "BAG_INSIGHT" || id === "CAPE") return "Brecilien";
  if (/^2H_TOOL_(PICK|KNIFE|HAMMER|AXE|SICKLE|FISHINGROD)$/.test(id)) return "Caerleon";
  if (/GATHERER_(FIBER|HIDE|ORE|ROCK|WOOD|FISH)$/.test(id)) return "Caerleon";
  const byCategory = {
    swords: "Lymhurst", bows: "Lymhurst", arcane: "Lymhurst",
    axes: "Martlock", quarterstaffs: "Martlock", frost: "Martlock", offhand: "Martlock",
    maces: "Thetford", fire: "Thetford", nature: "Thetford",
    hammers: "Fort Sterling", spears: "Fort Sterling", holy: "Fort Sterling",
    crossbows: "Bridgewatch", daggers: "Bridgewatch", cursed: "Bridgewatch",
    gloves: "Caerleon", shapeshifter: "Caerleon", bags: "Brecilien", capes: "Brecilien",
    "gathering-gear": "Caerleon", tools: "Caerleon"
  };
  if (byCategory[categoryKey]) return byCategory[categoryKey];
  if (categoryKey === "armor-head") return id.startsWith("HEAD_PLATE") ? "Fort Sterling" : id.startsWith("HEAD_LEATHER") ? "Lymhurst" : id.startsWith("HEAD_CLOTH") ? "Thetford" : null;
  if (categoryKey === "armor-chest") return id.startsWith("ARMOR_PLATE") ? "Bridgewatch" : id.startsWith("ARMOR_LEATHER") ? "Thetford" : id.startsWith("ARMOR_CLOTH") ? "Fort Sterling" : null;
  if (categoryKey === "armor-shoes") return id.startsWith("SHOES_PLATE") ? "Martlock" : id.startsWith("SHOES_LEATHER") ? "Lymhurst" : id.startsWith("SHOES_CLOTH") ? "Bridgewatch" : null;
  return null;
}

const materialId = (base, tier, enchant) => (enchant > 0 ? `T${tier}_${base}_LEVEL${enchant}@${enchant}` : `T${tier}_${base}`);

/** The cheapest sell order of an item in a market, when recent. */
function sellOf(snap, id, city, now) {
  const at = snap.locations.indexOf(city);
  const cell = at < 0 ? 0 : snap.prices[id]?.[at];
  return cell && cell[0] > 0 && now - cell[1] <= LIVE_MAX_AGE_MIN ? { unit: cell[0], at: cell[1] } : null;
}

function volumeOf(snap, id, city) {
  const at = snap.locations.indexOf(city);
  const cell = at < 0 ? 0 : snap.volume?.[id]?.[at];
  return cell ? { sold: cell[0], avg: cell[1] } : { sold: 0, avg: 0 };
}

/** The cheapest of the cities (the crafting city wins a tie). */
function cheapest(snap, id, city, now) {
  let best = null;
  for (const c of TEASER_CITIES) {
    const q = sellOf(snap, id, c, now);
    if (q && (!best || q.unit < best.unit || (q.unit === best.unit && c === city))) best = { ...q, city: c };
  }
  return best;
}

/** One craft with the standard settings: materials bought instantly where cheapest, sold by sell order. */
export function teaserCraft(snap, recipe, tier, enchant, city, now) {
  const id = `T${tier}_${recipe.itemId}${enchant ? `@${enchant}` : ""}`;
  const sale = sellOf(snap, id, city, now);
  if (!sale) return null;
  const materials = [];
  for (const m of recipe.materials) {
    const matId = materialId(m.itemId, tier, enchant);
    const q = cheapest(snap, matId, city, now);
    if (!q) return null;
    materials.push({ id: matId, name: `T${tier}.${enchant} ${MATERIAL_NAME[m.itemId] ?? m.itemId}`, qty: m.qty, unit: q.unit, city: q.city });
  }
  let artefact = null;
  if (recipe.artifactId) {
    const artId = `T${tier}_${recipe.artifactId}`;
    const q = cheapest(snap, artId, city, now);
    if (!q) return null;
    artefact = { id: artId, name: `T${tier} ${recipe.artifact ?? "Artefact"}`, qty: 1, unit: q.unit, city: q.city };
  }
  const inBonusCity = bonusCity(recipe.itemId, recipe.categoryKey) === city;
  const returnRate = 1 - 1 / (1 + (BASE_BONUS + (inBonusCity ? CITY_BONUS : 0)) / 100);
  const materialCost = materials.reduce((sum, m) => sum + m.unit * m.qty, 0);
  const stationFee = Math.ceil(((ITEM_VALUE[`${tier}-${enchant}`] ?? 0) * 0.1125 * TEASER_SETTINGS.usageFee) / 100);
  const cost = materialCost * (1 - returnRate) + (artefact?.unit ?? 0) + stationFee;
  const net = sale.unit * (1 - TEASER_SETTINGS.taxRate - SETUP_FEE_RATE);
  const profit = net - cost;
  const { sold, avg } = volumeOf(snap, id, city);
  return {
    id,
    name: `${TIER_PREFIX[tier] ?? `T${tier}`} ${(recipe.name ?? recipe.itemId).replace(PREFIX, "")}`,
    tier,
    enchant,
    bonusCity: inBonusCity,
    materials,
    artefact,
    cost,
    price: sale.unit,
    priceAt: sale.at,
    profit,
    roi: cost > 0 ? (profit / cost) * 100 : 0,
    sold,
    dailyProfit: profit * sold,
    spike: avg > 0 && sale.unit > avg * SPIKE_FACTOR
  };
}

/** Per city: how many crafts pay, what the best ten earn a day, and the best three. */
export function cityTeaser(snap, recipes = teaserRecipes(), now = Math.round(Date.now() / 60000)) {
  const { tiers, enchants, minSold, minRoi } = TEASER_SETTINGS;
  return TEASER_CITIES.map((city) => {
    const good = [];
    for (const recipe of recipes) {
      if (/_ROYAL(\b|_)|SHAPESHIFTER/i.test(recipe.itemId)) continue;
      for (const tier of tiers) {
        for (const enchant of enchants) {
          const row = teaserCraft(snap, recipe, tier, enchant, city, now);
          if (row && row.profit > 0 && row.roi >= minRoi && row.sold >= minSold && !row.spike) good.push(row);
        }
      }
    }
    good.sort((a, b) => b.dailyProfit - a.dailyProfit || b.profit - a.profit);
    const round = (n) => Math.round(n);
    return {
      city,
      count: good.length,
      topDaily: round(good.slice(0, 10).reduce((sum, row) => sum + row.dailyProfit, 0)),
      top: good.slice(0, TEASER_ROWS).map((row) => ({
        ...row,
        cost: round(row.cost),
        profit: round(row.profit),
        roi: Math.round(row.roi * 10) / 10,
        dailyProfit: round(row.dailyProfit)
      }))
    };
  });
}
