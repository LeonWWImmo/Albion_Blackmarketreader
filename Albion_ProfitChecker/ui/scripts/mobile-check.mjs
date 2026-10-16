// Dev-only mobile responsiveness check. Serves the built `dist/` and, for each route at a set of
// phone/tablet widths, asserts there is no horizontal overflow (the #1 mobile bug) and saves a
// screenshot. Run: `npm run build` first, then `node scripts/mobile-check.mjs`.
// Requires @playwright/test (devDependency) + `npx playwright install chromium`.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(rootDir, "..", "dist");
const shotsDir = path.join(rootDir, "..", ".mobile-shots");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain" };

// A file inside dist/, or null. Request paths are joined onto dist/, so a request such as
// "/../../secret" must not resolve to a file outside it.
function insideDist(...parts) {
  const file = path.resolve(distDir, ...parts);
  return file === distDir || file.startsWith(distDir + path.sep) ? file : null;
}

// Static server with clean-URL + SPA fallback so client-routed pages resolve like on Vercel.
// Listens on 127.0.0.1 only, so other devices on the network cannot reach it while it runs.
function serve(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath;
      try {
        urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      } catch {
        res.statusCode = 400;
        res.end("bad request");
        return;
      }
      const candidates = [
        insideDist("." + urlPath),
        insideDist("." + urlPath, "index.html"),
        path.join(distDir, "index.html")
      ].filter(Boolean);
      for (const file of candidates) {
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
          fs.createReadStream(file).pipe(res);
          return;
        }
      }
      res.statusCode = 404;
      res.end("not found");
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

const ROUTES = ["/", "/dashboard", "/bm-crafter", "/crafting-calculator", "/refining-calculator", "/food-potion-crafter"];
const VIEWPORTS = [
  { name: "sm", width: 360, height: 800 },
  { name: "iphone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 }
];
const PORT = 5091;

async function main() {
  if (!fs.existsSync(distDir)) {
    console.error("dist/ missing — run `npm run build` first.");
    process.exit(1);
  }
  fs.mkdirSync(shotsDir, { recursive: true });
  const server = await serve(PORT);
  const browser = await chromium.launch();
  const results = [];

  // Optional login (tools are auth-gated). Set MOBILE_TEST_EMAIL / MOBILE_TEST_PASSWORD.
  // The resulting session is reused for every route/viewport.
  let storageState;
  const email = process.env.MOBILE_TEST_EMAIL;
  const password = process.env.MOBILE_TEST_PASSWORD;
  if (email && password) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/login`, { waitUntil: "networkidle", timeout: 20000 });
    await page.fill('input[placeholder="Email"]', email);
    await page.fill('input[placeholder="Password"]', password);
    await page.press('input[placeholder="Password"]', "Enter"); // onKeyDown triggers onLogin
    await page.waitForTimeout(5000); // allow Supabase auth + redirect
    storageState = await ctx.storageState();
    await ctx.close();
    console.log(storageState.origins.length ? "logged in (session captured)" : "WARNING: login produced no session — check credentials");
  } else {
    console.log("no MOBILE_TEST_EMAIL/PASSWORD set — testing anonymously (tools will show login)");
  }

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: vp.width < 700, hasTouch: vp.width < 700, storageState });
    for (const route of ROUTES) {
      const page = await context.newPage();
      try {
        await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: "networkidle", timeout: 20000 });
        await page.waitForTimeout(600);
        // Dismiss a blocking "Free Trial"/info modal if present (best-effort).
        for (const label of ["OK", "Got it", "Continue"]) {
          await page.getByRole("button", { name: label, exact: true }).first().click({ timeout: 1000 }).catch(() => {});
        }
        await page.waitForTimeout(200);
        const metrics = await page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
          bodyScrollW: document.body ? document.body.scrollWidth : 0
        }));
        const overflow = Math.max(metrics.scrollW, metrics.bodyScrollW) - metrics.clientW;
        const slug = route === "/" ? "home" : route.replace(/\//g, "");
        await page.screenshot({ path: path.join(shotsDir, `${slug}-${vp.name}.png`), fullPage: true });
        // On phones, also open the filter FAB sheet and capture it (verifies the bottom-sheet).
        if (vp.width < 700) {
          // Filter FAB sheet first (fresh load, nothing else open).
          try {
            const fab = page.locator(".resp-filters-fab");
            if (await fab.isVisible().catch(() => false)) {
              await fab.click({ force: true, timeout: 4000 });
              await page.waitForTimeout(400);
              await page.screenshot({ path: path.join(shotsDir, `${slug}-${vp.name}-filters.png`) });
            }
          } catch {
            /* filter-sheet capture is best-effort; ignore */
          }
          // Account slide-in panel.
          try {
            await page.reload({ waitUntil: "networkidle", timeout: 20000 });
            await page.waitForTimeout(400);
            const acc = page.locator(".account-btn").first();
            if (await acc.isVisible().catch(() => false)) {
              await acc.click({ force: true, timeout: 4000 });
              await page.waitForTimeout(500);
              await page.screenshot({ path: path.join(shotsDir, `${slug}-${vp.name}-account.png`) });
            }
          } catch {
            /* account capture best-effort */
          }
          // Manage-specs modal (crafting-calculator / food-potion).
          try {
            await page.reload({ waitUntil: "networkidle", timeout: 20000 });
            await page.waitForTimeout(400);
            const specs = page.locator(".specs-trigger, .fp-specs-trigger").first();
            if (await specs.isVisible().catch(() => false)) {
              await specs.click({ force: true, timeout: 4000 });
              await page.waitForTimeout(500);
              await page.screenshot({ path: path.join(shotsDir, `${slug}-${vp.name}-specs.png`) });
            }
          } catch {
            /* specs capture best-effort */
          }
          // Reload for a clean state, then capture the burger drawer.
          try {
            const burger = page.locator(".mnav-burger");
            if (await burger.isVisible().catch(() => false)) {
              await page.reload({ waitUntil: "networkidle", timeout: 20000 });
              await page.waitForTimeout(400);
              await burger.click({ force: true, timeout: 4000 });
              await page.waitForTimeout(300);
              await page.screenshot({ path: path.join(shotsDir, `${slug}-${vp.name}-menu.png`) });
            }
          } catch {
            /* menu capture best-effort */
          }
        }
        results.push({ route, vp: vp.name, width: vp.width, overflow });
      } catch (err) {
        results.push({ route, vp: vp.name, width: vp.width, overflow: NaN, error: String(err).slice(0, 80) });
      }
      await page.close();
    }
    await context.close();
  }

  await browser.close();
  server.close();

  let bad = 0;
  console.log("\nroute                          vp      width  overflowPx");
  for (const r of results) {
    const flag = Number.isNaN(r.overflow) ? "ERR" : r.overflow > 1 ? "OVERFLOW" : "ok";
    if (flag !== "ok") bad += 1;
    console.log(`${r.route.padEnd(30)} ${r.vp.padEnd(7)} ${String(r.width).padEnd(6)} ${String(Number.isNaN(r.overflow) ? r.error : Math.round(r.overflow)).padEnd(8)} ${flag}`);
  }
  console.log(`\n${bad === 0 ? "PASS" : bad + " problem(s)"} — screenshots in .mobile-shots/`);
  process.exit(bad === 0 ? 0 : 2);
}

main().catch((err) => { console.error(err); process.exit(1); });
