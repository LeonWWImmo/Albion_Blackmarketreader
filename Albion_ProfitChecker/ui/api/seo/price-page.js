// GET /prices/<slug> (vercel.json rewrites item pages here)  ->  the app's index.html with this
// item's title, description, canonical and share preview, so search engines and Discord link
// previews see the item without running JavaScript. The CDN keeps each page for a day; a new
// deployment starts with an empty cache, so a page never points at an old build's files.
import { renderItemPage } from "../_lib/itemPage.js";

/** Our own hosts only: the page and the item list are read back from the deployment that serves. */
const OWN_HOST = /^(blackmarketreader\.com|www\.blackmarketreader\.com|[a-z0-9-]+\.vercel\.app)$/;

/** Long enough for our own CDN, short enough to answer with the 503 below instead of a platform timeout. */
const FETCH_TIMEOUT_MS = 4000;

let assets = null;

/** index.html and the item list, read once per function instance. */
function loadAssets(origin) {
  assets ??= Promise.all([
    fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`index.html ${r.status}`)))),
    fetch(`${origin}/data/items-index.json`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`items-index ${r.status}`))))
  ])
    .then(([template, rows]) => ({ template, rows }))
    .catch((error) => {
      assets = null;
      throw error;
    });
  return assets;
}

export default async function handler(req, res) {
  const host = String(req.headers?.host || "").toLowerCase();
  const origin = `https://${OWN_HOST.test(host) ? host : "blackmarketreader.com"}`;
  try {
    const { template, rows } = await loadAssets(origin);
    const { status, html } = renderItemPage(template, rows, String(req.query?.slug || ""));
    res.statusCode = status;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", status === 200 ? "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=0, s-maxage=300");
    res.end(html);
  } catch {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", "5");
    res.end('<!doctype html><meta charset="utf-8"><title>Blackmarket Reader</title><p>This page could not load. <a href="">Reload</a></p>');
  }
}
