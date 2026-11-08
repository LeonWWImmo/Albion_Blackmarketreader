// Finds the items the game's lists contain but nobody trades: no icon on Albion's own image server
// and no order on record on the Europe or Americas market (vanity skins, island furniture, retired
// items). AODP keeps the last order it saw per item, so "no order" means none reported in a long time.
// Writes scripts/off-market-items.json, which build-item-index.mjs leaves out of the Price Checker,
// and prints what changed against the old list: check newly left-out items before building.
// Run after a big game patch, before build-item-index.mjs:  node scripts/find-off-market-items.mjs
// Takes a few minutes: one small image request per item, then a few AODP calls.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { OFF_MARKET, buildIndex, loadSources } from "./build-item-index.mjs";

const USER_AGENT = "BlackmarketReader/1.0 (+https://blackmarketreader.com)";
const AODP_HOSTS = ["europe", "west"];
const IMAGE_WORKERS = 6;
const PRICE_BATCH = 60;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** true / false when the image server answers 200 / 404; retried on anything else (it throttles). */
async function hasIcon(id) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(`https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png?size=32`, { headers: { "User-Agent": USER_AGENT } });
      await res.arrayBuffer();
      if (res.status === 200) return true;
      if (res.status === 404) return false;
    } catch {
      // network hiccup: retry
    }
    await sleep(1500 * attempt);
  }
  throw new Error(`image server gave no clear answer for ${id}`);
}

/** Ids of `ids` with a sell or buy order on record on either market. */
async function tradedIds(ids) {
  const traded = new Set();
  for (const host of AODP_HOSTS) {
    for (let i = 0; i < ids.length; i += PRICE_BATCH) {
      const chunk = ids.slice(i, i + PRICE_BATCH);
      const url = `https://${host}.albion-online-data.com/api/v2/stats/prices/${chunk.map(encodeURIComponent).join(",")}.json?qualities=1,2,3,4,5`;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate" } });
      if (!res.ok) throw new Error(`AODP ${host}: HTTP ${res.status}`);
      for (const row of await res.json()) if (row.sell_price_min || row.buy_price_max) traded.add(row.item_id);
      await sleep(1200); // stay well inside AODP's rate limit
    }
  }
  return traded;
}

const { formatted, raw, craftable } = await loadSources();
const ids = buildIndex(formatted, raw, craftable).map((row) => row[0]);
const noIcon = [];
let next = 0;
await Promise.all(
  Array.from({ length: IMAGE_WORKERS }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      if (!(await hasIcon(id))) noIcon.push(id);
    }
  })
);
const traded = await tradedIds(noIcon);
const offMarket = noIcon.filter((id) => !traded.has(id)).sort();
const before = new Set(existsSync(OFF_MARKET) ? JSON.parse(readFileSync(OFF_MARKET, "utf8")) : []);
const added = offMarket.filter((id) => !before.has(id));
const back = [...before].filter((id) => !offMarket.includes(id));
writeFileSync(OFF_MARKET, `${JSON.stringify(offMarket, null, 1)}\n`);
console.log(`${ids.length} items: ${noIcon.length} without icon, ${offMarket.length} of them with no order on record -> ${OFF_MARKET}`);
if (added.length) console.log(`newly left out (check these): ${added.join(", ")}`);
if (back.length) console.log(`back in the Price Checker: ${back.join(", ")}`);
