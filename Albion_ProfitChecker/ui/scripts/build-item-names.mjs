// Builds public/data/item-names-en.json for the Loot Split tool: English item name -> item id,
// from ao-bin-dumps (the game's own item list). A chest log names items ("Expert's Crossbow") and
// gives the enchantment in its own column, so one id per name is enough; the tool adds "@n".
// Run again after a big game patch:  node scripts/build-item-names.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.txt";
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/data/item-names-en.json");

/** Lower is better: the plain tradable item wins over quest, token and untradable copies. */
export function rank(id) {
  let score = id.includes("@") ? 10 : 0;
  if (/NONTRADABLE|QUESTITEM|_TOKEN|TUTORIAL|_TRIAL|_AVATAR/.test(id)) score += 100;
  if (id.startsWith("UNIQUE_")) score += 5;
  return score + id.length / 1000;
}

export function buildNames(text) {
  const best = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*\d+:\s*(\S+)\s*:\s*(.+?)\s*$/);
    if (!match) continue;
    const [, id, name] = match;
    const current = best.get(name);
    if (!current || rank(id) < rank(current)) best.set(name, id);
  }
  return Object.fromEntries([...best.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = await fetch(SOURCE, { headers: { "User-Agent": "BlackmarketReader/1.0 (+https://blackmarketreader.com)" } });
  if (!res.ok) throw new Error(`items.txt: HTTP ${res.status}`);
  const names = buildNames(await res.text());
  writeFileSync(OUT, JSON.stringify(names));
  console.log(`${Object.keys(names).length} names -> ${path.relative(process.cwd(), OUT)}`);
}
