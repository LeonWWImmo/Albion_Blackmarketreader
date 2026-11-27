// The live market snapshot job (GitHub Actions, .github/workflows/market-live.yml, every 30 min):
// asks AODP for the current prices of every dashboard and crafting item in both regions and sends them to
// /api/market/ingest. The sales volume changes slowly, so it is fetched only every VOLUME_EVERY_H
// hours (or with MARKET_VOLUME=1). See api/_lib/marketLive.js.
//
// Env: MARKET_SECRET (= ACTIONS_CRON_SECRET), MARKET_SITE (default https://blackmarketreader.com),
// MARKET_REGIONS (default "eu,us"), MARKET_VOLUME=1 to force the volume, MARKET_DRY=1 to only print.
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { allLiveIds, fetchLive, LIVE_REGIONS } from "../api/_lib/marketLive.js";

const VOLUME_EVERY_H = 6;
export const EXTRA_FILES = ["raw-materials-cities-eu.json", "food-prices-eu.json", "potion-prices-eu.json", "consumable-ingredient-prices-eu.json"];

const site = (process.env.MARKET_SITE || "https://blackmarketreader.com").replace(/\/+$/, "");
const secret = process.env.MARKET_SECRET || "";
const dry = process.env.MARKET_DRY === "1";
const regions = (process.env.MARKET_REGIONS || LIVE_REGIONS.join(",")).split(",").map((r) => r.trim()).filter((r) => LIVE_REGIONS.includes(r));
// the volume comes along when forced or when the stored one (the ingest answer's volumeAt) is older
// than VOLUME_EVERY_H, so a late or skipped run cannot leave it stale
const forceVolume = process.env.MARKET_VOLUME === "1";
const volumeStale = (volumeAt) => !volumeAt || Date.now() - Date.parse(volumeAt) > VOLUME_EVERY_H * 3600_000;

if (!secret && !dry) {
  console.error("MARKET_SECRET is missing");
  process.exit(1);
}

const baseCodes = JSON.parse(await readFile(new URL("../../Data/ItemList.json", import.meta.url), "utf8"));
const recipes = JSON.parse(await readFile(new URL("../public/items-categorized-crafting.json", import.meta.url), "utf8"));
// the other calculators' items: the ids of their daily files (the same for both regions)
const extra = [];
for (const file of EXTRA_FILES) {
  const data = JSON.parse(await readFile(new URL(`../public/data/${file}`, import.meta.url), "utf8").catch(() => "{}"));
  for (const item of data.items ?? []) if (item?.itemId) extra.push(String(item.itemId));
}
const ids = allLiveIds(baseCodes, recipes, extra);
console.log(`${ids.length} items, regions ${regions.join(", ")}, volume ${forceVolume ? "forced" : `when older than ${VOLUME_EVERY_H} h`}`);

async function send(region, part) {
  const started = Date.now();
  const body = { region, [part]: await fetchLive(region, ids, part) };
  const json = JSON.stringify(body);
  console.log(`${region}: ${Object.keys(body[part]).length} items with ${part}, ${Math.round(json.length / 1024)} KB, ${Math.round((Date.now() - started) / 1000)} s`);
  if (dry) return null;
  const res = await fetch(`${site}/api/market/ingest`, {
    method: "POST",
    // gzipped: a quarter of the size (what reaches the function counts as Vercel Origin Transfer)
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/gzip" },
    body: gzipSync(json)
  });
  const answer = await res.text();
  if (!res.ok) throw new Error(`ingest ${res.status}: ${answer.slice(0, 200)}`);
  console.log(`${region}: stored ${answer}`);
  return JSON.parse(answer);
}

let failed = false;
for (const region of regions) {
  try {
    const stored = await send(region, "prices");
    if (forceVolume || (stored && volumeStale(stored.volumeAt))) await send(region, "volume");
  } catch (err) {
    // one region failing must not stop the other
    failed = true;
    console.error(`${region}: ${err instanceof Error ? err.message : err}`);
  }
}
process.exit(failed ? 1 : 0);
