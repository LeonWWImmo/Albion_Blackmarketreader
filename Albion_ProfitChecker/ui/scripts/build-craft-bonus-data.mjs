// Builds src/shared/albion/craftBonusData.json from the game data dumps in ao-data/ao-bin-dumps.
//
// The daily crafting bonus (festivities API, "kind 2") names an event such as COMMON_BOW. The
// game data says what that means: festivities.json lists every daily event with its crafting
// category and value (COMMON_* = +10%, RARE_* = +20%), and items.json gives every item its
// @craftingcategory. This script joins the two for the items the tools actually use, so the
// site can tell which rows a given day's bonus applies to.
//
// Run when Albion adds items or changes the daily events:  node scripts/build-craft-bonus-data.mjs
import fs from "node:fs/promises";
import path from "node:path";

const DUMPS = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master";
const root = process.cwd();
const outFile = path.join(root, "src", "shared", "albion", "craftBonusData.json");

async function getJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "BlackmarketReader/1.0 (+https://blackmarketreader.com)" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
/** T4_2H_BOW@2 -> 2H_BOW ; T5_METALBAR_LEVEL1@1 -> METALBAR (same as baseItemId in festivities.ts) */
const baseId = (id) => String(id || "").split("@")[0].replace(/^T\d+_/, "").replace(/_LEVEL\d+$/, "");

async function readLocalJson(rel) {
  return JSON.parse(await fs.readFile(path.join(root, rel), "utf8"));
}

async function main() {
  const [festivities, items] = await Promise.all([getJson(`${DUMPS}/festivities.json`), getJson(`${DUMPS}/items.json`)]);

  // daily events: name -> { category, percent }
  const bonuses = {};
  for (const category of asArray(festivities.festivities.dailyevents.eventcategory)) {
    for (const event of asArray(category.craftbonusevent)) {
      bonuses[event["@uniquename"]] = { category: event["@category"], percent: Math.round(Number(event["@value"]) * 100) };
    }
  }
  const bonusCategories = new Set(Object.values(bonuses).map((b) => b.category));

  // every item's crafting category, keyed by its base id (same for all tiers and enchants)
  const categoryByBase = new Map();
  for (const list of Object.values(items.items)) {
    for (const item of asArray(list)) {
      const id = item && item["@uniquename"];
      const category = item && item["@craftingcategory"];
      if (!id || !category || !bonusCategories.has(category)) continue;
      const base = baseId(id);
      if (!categoryByBase.has(base)) categoryByBase.set(base, category);
    }
  }

  // the item ids the tools use
  const wanted = new Set();
  const crafting = await readLocalJson("public/items-categorized-crafting.json");
  const craftingItems = [];
  for (const category of crafting.categories || []) {
    for (const item of category.items || []) craftingItems.push({ id: baseId(item.id), artefact: Boolean(item.artifact || item.artifactId) });
  }
  craftingItems.forEach((item) => wanted.add(item.id));
  for (const region of ["eu", "us"]) {
    const bm = await readLocalJson(`public/data/bm-crafter-${region}.json`).catch(() => ({ items: [] }));
    // rows are [itemId, ...numbers]
    for (const item of bm.items || []) wanted.add(baseId(Array.isArray(item) ? item[0] : item.id));
  }
  for (const file of ["public/data/recipes-food.json", "public/data/recipes-potions.json"]) {
    const { recipes } = await readLocalJson(file);
    for (const recipe of recipes || []) wanted.add(baseId(recipe.itemId));
  }
  for (const refined of ["METALBAR", "PLANKS", "CLOTH", "LEATHER", "STONEBLOCK"]) wanted.add(refined);

  const categoryOf = {};
  const missing = [];
  for (const base of [...wanted].filter(Boolean).sort()) {
    const category = categoryByBase.get(base);
    if (category) categoryOf[base] = category;
    else missing.push(base);
  }

  // One Crafting Calculator item per bonus category, for links such as "+10% Bows" on the
  // dashboard: an item without an artefact, the shortest id first (MAIN_SWORD, 2H_BOW, BAG).
  const rank = (item) => [item.artefact ? 1 : 0, item.id.length, item.id];
  const better = (a, b) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : 1);
  };
  const best = {};
  for (const item of craftingItems) {
    const category = categoryOf[item.id];
    if (!category) continue;
    if (!best[category] || better(item, best[category]) < 0) best[category] = item;
  }
  const craftItemOf = Object.fromEntries(Object.entries(best).map(([category, item]) => [category, item.id]));

  const data = {
    source: "ao-data/ao-bin-dumps festivities.json + items.json",
    generatedAt: new Date().toISOString().slice(0, 10),
    bonuses,
    categoryOf,
    craftItemOf
  };
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`bonuses: ${Object.keys(bonuses).length}, items mapped: ${Object.keys(categoryOf).length}, without a bonus category: ${missing.length}`);
  if (missing.length) console.log("unmapped (no daily bonus exists for them):", missing.slice(0, 40).join(", "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
