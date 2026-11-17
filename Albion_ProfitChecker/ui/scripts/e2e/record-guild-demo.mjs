// Records the guild tools demo clip (landing page + guild guide): 1600x900, a drawn cursor, the main
// tabs of the week's top EU guild. Needs `npm run dev -- --port 5199` and TEST_EMAIL / TEST_PASSWORD.
//   node scripts/e2e/record-guild-demo.mjs    -> a .webm in .demo-rec/, then (cut the start/end):
//   ffmpeg -ss <start> -to <end> -i .demo-rec/<file>.webm -an -r 30 -c:v libx264 -profile:v high
//     -preset slow -crf 30 -pix_fmt yuvj420p -movflags +faststart public/video/guild-demo.mp4
//   ffmpeg -ss 1.2 -i public/video/guild-demo.mp4 -frames:v 1 -q:v 6 public/video/guild-demo.jpg
import { chromium } from "@playwright/test";
const BASE = (process.env.E2E_BASE || "http://localhost:5199").replace(/\/$/, "");
const OUT = ".demo-rec";
const VP = { width: 1600, height: 900 };

const items = [
  ["Expert's Crossbow", 3], ["Adept's Bag", 4], ["Expert's Cleric Robe", 2], ["Master's Mercenary Jacket", 2],
  ["Expert's Hunter Hood", 3], ["Adept's Great Axe", 2], ["Expert's Fire Staff", 2], ["Adept's Soldier Boots", 5]
];
const who = ["Ann", "Bo", "Cy", "Dee", "Eli"];
const LOG = [`"Date"\t"Player"\t"Item"\t"Enchantment"\t"Quality"\t"Amount"`]
  .concat(items.map(([item, n], i) => `"11/16/2026 19:${String(i * 4).padStart(2, "0")}:00"\t"${who[i % who.length]}"\t"${item}"\t"0"\t"1"\t"${n}"`))
  .join("\n");

const CURSOR = () => {
  const make = () => {
    if (document.getElementById("demo-cursor")) return;
    const c = document.createElement("div");
    c.id = "demo-cursor";
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6-3.6 6.9z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", transform: "translate(-200px,-200px)", transition: "transform 16ms linear", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.5))" });
    document.documentElement.appendChild(c);
    const x = Number(sessionStorage.getItem("cx") || -200), y = Number(sessionStorage.getItem("cy") || -200);
    c.style.transform = `translate(${x - 4}px,${y - 2}px)`;
  };
  addEventListener("mousemove", (e) => {
    make();
    sessionStorage.setItem("cx", e.clientX);
    sessionStorage.setItem("cy", e.clientY);
    document.getElementById("demo-cursor").style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2}px)`;
  }, true);
  document.addEventListener("DOMContentLoaded", make);
};

async function login(p, next) {
  await p.goto(`${BASE}/login?next=${encodeURIComponent(next)}`, { waitUntil: "networkidle" });
  await p.getByPlaceholder("Email").first().fill(process.env.TEST_EMAIL);
  await p.getByPlaceholder("Password").first().fill(process.env.TEST_PASSWORD);
  await p.getByRole("button", { name: "Login", exact: true }).last().click();
  await p.waitForURL((u) => u.pathname === next, { timeout: 30000 });
}

let mx = 800, my = 450;
async function glide(p, locator, { click = true } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const x = box.x + Math.min(box.width / 2, 60), y = box.y + box.height / 2;
  await p.mouse.move(x, y, { steps: 28 });
  mx = x; my = y;
  await p.waitForTimeout(250);
  if (click) await p.mouse.click(x, y);
}
async function smoothScroll(p, dy, ms = 1200) {
  await p.evaluate(([dy, ms]) => new Promise((r) => {
    const start = scrollY, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      scrollTo(0, start + dy * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2));
      k < 1 ? requestAnimationFrame(step) : r();
    };
    requestAnimationFrame(step);
  }), [dy, ms]);
}

  const b = await chromium.launch();
  const init = () => {
    localStorage.setItem("region", "eu");
    localStorage.setItem("factionChosenV1", "1");
    localStorage.setItem("gd-welcome-v1", "1");
  };
  const top = await (await fetch(`${BASE}/api/guild/top?region=eu&range=week`)).json();
  const g = top.guilds[Number(process.env.PICK || 0)];
  console.log("guild:", g.name, g.slug);

  // sign in, mark the guild and fill the bank log before recording: the clip shows the tools, not the setup
  const prep = await b.newContext({ viewport: VP });
  await prep.addInitScript(init);
  const pp = await prep.newPage();
  pp.on("dialog", (d) => d.accept());
  await login(pp, `/guild/eu/${g.slug}/overview`);
  await pp.locator(".gd-head-actions .gd-btn").first().waitFor({ timeout: 30000 });
  const mark = pp.getByRole("button", { name: "☆ Mark", exact: true });
  if (await mark.count()) {
    await mark.click();
    await pp.locator(".gd-btn.is-marked").waitFor({ timeout: 60000 });
  }
  console.log("marked:", await pp.locator(".gd-btn.is-marked").count());
  await pp.goto(`${BASE}/guild/eu/${g.slug}/bank`);
  await pp.locator(".gd-bank-paste").waitFor({ timeout: 20000 });
  if (await pp.getByRole("button", { name: "Remove all" }).count()) {
    await pp.getByRole("button", { name: "Remove all" }).click();
    await pp.waitForTimeout(800);
  }
  await pp.locator(".gd-bank-paste textarea").fill(LOG);
  await pp.getByRole("button", { name: "Add log" }).click();
  await pp.locator(".gd-split-run").first().waitFor({ timeout: 20000 });
  // warm the caches so the recording does not wait on the killboard
  for (const tab of ["overview", "activity", "battles", "regear"]) {
    await pp.goto(`${BASE}/guild/eu/${g.slug}/${tab}`);
    await pp.waitForTimeout(tab === "regear" ? 8000 : 3000);
  }
  const state = await prep.storageState();
  await prep.close();

  const ctx = await b.newContext({ viewport: VP, storageState: state, recordVideo: { dir: OUT, size: VP } });
  await ctx.addInitScript(init);
  await ctx.addInitScript(CURSOR);
  const t0 = Date.now();
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  const mark_ = (s) => console.log(`${s} @ ${((Date.now() - t0) / 1000).toFixed(2)}s`);

  await p.goto(`${BASE}/guild/eu/${g.slug}/overview`, { waitUntil: "domcontentloaded" });
  await p.locator(".gd-stats").first().waitFor({ timeout: 30000 });
  await p.waitForTimeout(1200);
  await p.mouse.move(mx, my);
  mark_("start overview");
  await p.waitForTimeout(1600);

  await glide(p, p.locator(".gd-tab", { hasText: "Activity" }));
  await p.locator(".gd-row-button").first().waitFor({ timeout: 30000 });
  mark_("activity");
  await p.waitForTimeout(700);
  await smoothScroll(p, 380);
  await p.waitForTimeout(900);
  await smoothScroll(p, -380, 700);

  await glide(p, p.locator(".gd-tab", { hasText: "Battles" }));
  await p.locator(".gd-row-link, .gd-empty").first().waitFor({ timeout: 30000 });
  mark_("battles");
  await p.waitForTimeout(1800);

  await glide(p, p.locator(".gd-tab", { hasText: "Regear" }));
  await p.locator(".gd-regear, .gd-empty").first().waitFor({ timeout: 40000 });
  mark_("regear");
  await p.waitForTimeout(900);
  const row = p.locator(".gd-row-click").first();
  if (await row.count()) {
    await glide(p, row);
    await p.waitForTimeout(600);
    await smoothScroll(p, 260, 900);
    await p.waitForTimeout(1500);
    await smoothScroll(p, -260, 600);
  } else await p.waitForTimeout(2000);

  await glide(p, p.locator(".gd-tab", { hasText: "Bank" }));
  await p.locator(".gd-split-run").first().waitFor({ timeout: 30000 });
  mark_("bank");
  await p.waitForTimeout(800);
  await smoothScroll(p, 420, 1400);
  await p.waitForTimeout(800);
  await glide(p, p.locator(".gd-split-run").first(), { click: false });
  await p.waitForTimeout(600);
  await smoothScroll(p, 420, 1400);
  await p.waitForTimeout(1500);
  mark_("end");

  const video = p.video();
  await ctx.close();
  console.log("video:", await video.path());
  await b.close();

