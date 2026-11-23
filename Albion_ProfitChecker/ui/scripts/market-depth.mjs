// The market depth job (GitHub Actions, .github/workflows/market-depth.yml, twice a day): listens to
// the Albion Data Project's live order stream (public NATS, topic marketorders.deduped) for both
// regions, drops what is most likely gone, and sends a summary of the craftable items per market to
// /api/market/ingest. See api/_lib/marketDepth.js.
//
// Env: MARKET_SECRET (= ACTIONS_CRON_SECRET), MARKET_SITE (default https://blackmarketreader.com),
// DEPTH_SECONDS (how long to listen, default 1500), DEPTH_BOOKS (folder of the books, default
// .depth-books), MARKET_REGIONS (default "eu,us"), DEPTH_OUT=<folder> to write the summary there
// instead of sending it (local test).
import net from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { addOrders, bookFromJson, bookToJson, craftableFilter, pruneBook, summarizeBook } from "../api/_lib/marketDepth.js";
import { LIVE_REGIONS } from "../api/_lib/marketLive.js";

const NATS = { host: "nats.albion-online-data.com", port: { eu: 34222, us: 4222 }, user: "public", pass: "thenewalbiondata" };
const TOPIC = "marketorders.deduped";

const site = (process.env.MARKET_SITE || "https://blackmarketreader.com").replace(/\/+$/, "");
const secret = process.env.MARKET_SECRET || "";
const out = process.env.DEPTH_OUT || "";
const seconds = Number(process.env.DEPTH_SECONDS || 1500);
const books = process.env.DEPTH_BOOKS || ".depth-books";
const regions = (process.env.MARKET_REGIONS || LIVE_REGIONS.join(",")).split(",").map((r) => r.trim()).filter((r) => LIVE_REGIONS.includes(r));

if (!secret && !out) {
  console.error("MARKET_SECRET is missing");
  process.exit(1);
}

const nowMinute = () => Math.round(Date.now() / 60000);

/** Listens on one region's stream until `until` (ms), reconnecting when the connection drops. */
async function listen(region, book, until) {
  let heard = 0;
  while (Date.now() < until) {
    heard += await new Promise((resolve) => {
      let count = 0;
      let buf = Buffer.alloc(0);
      const sock = net.connect(NATS.port[region], NATS.host);
      const stop = setTimeout(() => sock.destroy(), Math.max(0, until - Date.now()));
      sock.setTimeout(120_000, () => sock.destroy()); // two minutes of silence: connect again
      sock.on("connect", () => {
        sock.write(`CONNECT {"user":"${NATS.user}","pass":"${NATS.pass}","verbose":false,"pedantic":false}\r\nSUB ${TOPIC} 1\r\n`);
      });
      sock.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        for (;;) {
          const nl = buf.indexOf("\r\n");
          if (nl < 0) return;
          const line = buf.subarray(0, nl).toString();
          if (line.startsWith("MSG ")) {
            const size = Number(line.slice(line.lastIndexOf(" ") + 1));
            if (buf.length < nl + 2 + size + 2) return;
            const payload = buf.subarray(nl + 2, nl + 2 + size).toString();
            buf = buf.subarray(nl + 2 + size + 2);
            try {
              const data = JSON.parse(payload);
              count += addOrders(book, data?.Orders ?? (Array.isArray(data) ? data : [data]), nowMinute());
            } catch {
              /* a broken message is skipped */
            }
            continue;
          }
          if (line.startsWith("PING")) sock.write("PONG\r\n");
          else if (line.startsWith("-ERR")) console.error(`${region}: ${line}`);
          buf = buf.subarray(nl + 2);
        }
      });
      const done = () => {
        clearTimeout(stop);
        resolve(count);
      };
      sock.on("close", done);
      sock.on("error", (err) => console.error(`${region}: ${err.message}`));
    });
    if (Date.now() < until) await new Promise((r) => setTimeout(r, 5000));
  }
  return heard;
}

// only what can be crafted: what the Focus Planner and City Crafter price
const craftable = craftableFilter(JSON.parse(await readFile(new URL("../public/items-categorized-crafting.json", import.meta.url), "utf8")));

await mkdir(books, { recursive: true });
const until = Date.now() + seconds * 1000;
const state = await Promise.all(
  regions.map(async (region) => {
    const book = bookFromJson(await readFile(path.join(books, `book-${region}.json`), "utf8").catch(() => "[]"));
    const before = book.size;
    const heard = await listen(region, book, until);
    return { region, book, before, heard };
  })
);

let failed = false;
for (const { region, book, before, heard } of state) {
  try {
    const dropped = pruneBook(book, nowMinute());
    await writeFile(path.join(books, `book-${region}.json`), bookToJson(book));
    const depth = summarizeBook(book, craftable);
    const json = JSON.stringify({ region, depth });
    console.log(`${region}: ${before} orders kept, ${heard} heard, ${dropped} dropped, ${book.size} in the book, ${Object.keys(depth).length} items, ${Math.round(json.length / 1024)} KB`);
    if (out) {
      await mkdir(out, { recursive: true });
      await writeFile(path.join(out, `depth-${region}.json`), json);
      continue;
    }
    const res = await fetch(`${site}/api/market/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/gzip" },
      body: gzipSync(json)
    });
    const answer = await res.text();
    if (!res.ok) throw new Error(`ingest ${res.status}: ${answer.slice(0, 200)}`);
    console.log(`${region}: stored ${answer}`);
  } catch (err) {
    failed = true;
    console.error(`${region}: ${err instanceof Error ? err.message : err}`);
  }
}
process.exit(failed ? 1 : 0);
