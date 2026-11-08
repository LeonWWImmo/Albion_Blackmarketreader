// Builds public/data/items-index.json for the Price Checker: every item that can be traded on the
// market, once per tier, with its English name, URL slug, shop category, weight and the market ids
// of its enchantment levels. Source: ao-bin-dumps, the game's own item lists. It also writes
// public/sitemap-prices.xml, one URL per item page, from the same slugs.
// Run again after a big game patch:  node scripts/build-item-index.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DUMPS = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master";
const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const OUT = path.join(PUBLIC, "data/items-index.json");
const SITEMAP = path.join(PUBLIC, "sitemap-prices.xml");
const SITE = "https://blackmarketreader.com";
const USER_AGENT = "BlackmarketReader/1.0 (+https://blackmarketreader.com)";

/** Shop sections that are not real market goods. */
const SKIP_SUBCATEGORIES = new Set(["questitems", "trash", "tokens", "hardcoreexpeditions", "killtrophy", "lootitem"]);
const SKIP_IDS = /NON_?TRADABLE|QUESTITEM|TUTORIAL|_TRIAL|_AVATAR/;

/** "T4_PLANKS_LEVEL1@1" -> { base: "T4_PLANKS", enchant: 1 }; plain ids are enchant 0. */
export function splitId(id) {
  const match = String(id).match(/^(.+?)(?:_LEVEL(\d))?(?:@(\d))?$/);
  return { base: match[1], enchant: Number(match[3] ?? match[2] ?? 0) };
}

/** "Adept's Bag" -> "adepts-bag". */
export function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * formatted: ao-bin-dumps formatted/items.json (market ids with names, enchanted ones included).
 * raw: ao-bin-dumps items.json `items` (shop category, weight).
 * craftable: item ids without their tier ("2H_BOW") that the Crafting Calculator knows.
 * Returns rows [id, name, slug, category, subcategory, tier, weight, enchants, craftable?], sorted by
 * name. enchants is the highest enchantment level when the market ids follow `${id}@n` (most items),
 * or the list of market ids from .0 up when they do not (refined resources: T4_PLANKS_LEVEL1@1). A
 * ninth value 1 marks a T4-T8 item the Crafting Calculator can open.
 */
export function buildIndex(formatted, raw, craftable = new Set()) {
  const shop = new Map();
  for (const list of Object.values(raw)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) if (item["@shopcategory"]) shop.set(item["@uniquename"], item);
  }

  const groups = new Map();
  for (const entry of formatted) {
    const id = entry?.UniqueName;
    const name = entry?.LocalizedNames?.["EN-US"];
    if (!id || !name || SKIP_IDS.test(id)) continue;
    const { base, enchant } = splitId(id);
    const item = shop.get(base);
    if (!item || SKIP_SUBCATEGORIES.has(item["@shopsubcategory1"])) continue;
    const group = groups.get(base) ?? { base, item, name: null, variants: [] };
    if (enchant === 0) group.name = name;
    group.variants[enchant] = id;
    groups.set(base, group);
  }

  const rows = [];
  const slugs = new Map();
  for (const { base, item, name, variants } of groups.values()) {
    // an enchant level without its .0 item, or with a gap, is not a ladder the page can switch through
    // (spread first: .some() skips the holes a missing level leaves in the array)
    if (!name || variants.length === 0 || [...variants].some((v) => !v)) continue;
    const tier = Number(base.match(/^T(\d)_/)?.[1] ?? 0);
    const standard = variants.every((id, enchant) => id === (enchant ? `${base}@${enchant}` : base));
    const enchants = standard ? variants.length - 1 : variants;
    const row = [base, name, slugify(name), item["@shopcategory"], item["@shopsubcategory1"] ?? "", tier, Number(item["@weight"] ?? 0), enchants];
    if (tier >= 4 && tier <= 8 && craftable.has(base.replace(/^T\d_/, ""))) row.push(1);
    rows.push(row);
    slugs.set(slugify(name), (slugs.get(slugify(name)) ?? 0) + 1);
  }
  // two items with one name (rare): both get their id in the slug so every URL stays unique
  for (const row of rows) if (slugs.get(row[2]) > 1) row[2] = `${row[2]}-${row[0].toLowerCase().replace(/_/g, "-")}`;
  return rows.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
}

/** A sitemap with one URL per item page. */
export function buildSitemap(rows, lastmod) {
  const urls = rows.map(([, , slug]) => `  <url><loc>${SITE}/prices/${slug}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.5</priority></url>`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, "</urlset>", ""].join("\n");
}

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [formatted, raw] = await Promise.all([getJson(`${DUMPS}/formatted/items.json`), getJson(`${DUMPS}/items.json`)]);
  const crafting = JSON.parse(readFileSync(path.join(PUBLIC, "items-categorized-crafting.json"), "utf8"));
  const craftable = new Set(crafting.categories.flatMap((category) => category.items.map((item) => item.id)));
  const rows = buildIndex(formatted, raw.items, craftable);
  writeFileSync(OUT, JSON.stringify(rows));
  writeFileSync(SITEMAP, buildSitemap(rows, new Date().toISOString().slice(0, 10)));
  console.log(`${rows.length} items (${rows.filter((r) => r[8]).length} craftable) -> ${path.relative(process.cwd(), OUT)}, ${path.relative(process.cwd(), SITEMAP)}`);
}
