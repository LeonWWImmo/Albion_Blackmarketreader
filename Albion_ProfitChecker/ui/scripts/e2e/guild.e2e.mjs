// Browser check of the guild tools: every tab as a guest and signed in, desktop and phone (no page
// errors, no 5xx from the guild API, no horizontal overflow, each tab shows its content), the guides,
// the legal page and the landing page's guild section. Then, signed in: mark, a regear paid tick and
// a marked fight, a bank log with a saved split and paid ticks, all checked after a reload and undone
// again (the account is left as it was found).
//
//   E2E_BASE=http://localhost:5199 TEST_EMAIL=... TEST_PASSWORD=... node scripts/e2e/guild.e2e.mjs
//   E2E_BASE=https://blackmarketreader.com ... (live)   E2E_QUICK=1: guest + desktop only
//
// The test account comes only from TEST_EMAIL / TEST_PASSWORD (never written into a file).
import { chromium } from "@playwright/test";

const BASE = (process.env.E2E_BASE || "http://localhost:5199").replace(/\/$/, "");
const QUICK = Boolean(process.env.E2E_QUICK);
const flat = (t) => t.replace(/\s+/g, " ").trim();
const LOG = [
  `"Date"\t"Player"\t"Item"\t"Enchantment"\t"Quality"\t"Amount"`,
  `"11/16/2026 19:00:00"\t"Ann"\t"Expert's Crossbow"\t"0"\t"1"\t"3"`,
  `"11/16/2026 19:05:00"\t"Bo"\t"Adept's Bag"\t"0"\t"1"\t"2"`,
  `"11/16/2026 19:10:00"\t"Cy"\t"Adept's Bag"\t"0"\t"1"\t"2"`
].join("\n");
const TABS = [
  ["overview", ".gd-stats"],
  ["activity", ".gd-row-button"],
  ["killboard", ".gd-kill-row, .gd-empty"],
  ["battles", ".gd-row-link, .gd-empty"],
  ["attendance", ".gd-stats"],
  ["regear", ".gd-regear, .gd-empty"]
];

const problems = [];
const log = (...a) => console.log(...a);

async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => {
    localStorage.setItem("region", "eu");
    localStorage.setItem("factionChosenV1", "1");
    localStorage.setItem("gd-welcome-v1", "1");
  });
  await ctx.route(/googletagmanager|_vercel\/|vercel\.live/, (r) => r.abort());
  const page = await ctx.newPage();
  const tag = `${viewport.width}`;
  page.on("pageerror", (e) => problems.push(`${tag} pageerror ${e.message}`));
  page.on("dialog", (d) => d.accept());
  page.on("response", (r) => {
    // the killboard itself failing (502) is Albion's, not ours: listed, not counted as a failure
    if (r.url().includes("/api/guild") && r.status() >= 500) (r.status() === 502 ? log : (m) => problems.push(m))(`${tag} ${r.status()} ${r.url().replace(BASE, "")}`);
  });
  page.overflow = async (label) => {
    const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (o > 0) problems.push(`${tag} overflow ${label} ${o}px`);
  };
  return { ctx, page };
}

async function signIn(page, next) {
  if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) throw new Error("set TEST_EMAIL and TEST_PASSWORD");
  await page.goto(`${BASE}/login?next=${encodeURIComponent(next)}`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Email").first().fill(process.env.TEST_EMAIL);
  await page.getByPlaceholder("Password").first().fill(process.env.TEST_PASSWORD);
  await page.getByRole("button", { name: "Login", exact: true }).last().click();
  await page.waitForURL((u) => u.pathname === next, { timeout: 30000 });
}

const settled = async (page) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
};

async function tabs(page, slug, label) {
  for (const [tab, sel] of TABS) {
    const t0 = Date.now();
    await page.goto(`${BASE}/guild/eu/${slug}/${tab}`, { waitUntil: "domcontentloaded" });
    try {
      await page.locator(sel).first().waitFor({ timeout: 45000 });
    } catch {
      problems.push(`${label} tab ${tab} shows nothing: ${flat(await page.locator("main").innerText().catch(() => "")).slice(0, 140)}`);
    }
    await page.waitForTimeout(400);
    await page.overflow(tab);
    log(label, tab, `${Date.now() - t0}ms`);
  }
}

async function accountFlows(page, slug) {
  await signIn(page, `/guild/eu/${slug}/overview`);
  await page.locator(".gd-head-actions .gd-btn").first().waitFor({ timeout: 30000 });
  const wasMarked = (await page.locator(".gd-btn.is-marked").count()) > 0;
  if (!wasMarked) {
    await page.getByRole("button", { name: "☆ Mark", exact: true }).click();
    await page.locator(".gd-btn.is-marked, .gd-head-actions .gd-error").first().waitFor({ timeout: 60000 });
    if (!(await page.locator(".gd-btn.is-marked").count())) problems.push(`mark: ${await page.locator(".gd-head-actions .gd-error").innerText()}`);
  }
  log("mark ok (was marked before:", wasMarked, ")");
  try {
    // regear: mark the shown fight and tick its first death, then find it again through "★ Marked"
    await page.goto(`${BASE}/guild/eu/${slug}/regear`);
    await page.locator(".gd-regear, .gd-empty").first().waitFor({ timeout: 60000 });
    await settled(page);
    // the fight's report comes from the killboard, which sometimes answers 502 for a while
    const rows = await page.locator(".gd-regear-paid input").first().waitFor({ timeout: 60000 }).then(() => true, () => false);
    if (!rows) log("regear: the killboard gave no deaths for the shown fight (try again later), skipped");
    else if (await page.getByRole("button", { name: "☆ Mark this fight" }).count()) {
      const box = () => page.locator(".gd-regear-paid input").first();
      const paidBefore = await box().isChecked();
      await page.getByRole("button", { name: "☆ Mark this fight" }).click();
      await page.getByRole("button", { name: "Unmark fight" }).waitFor({ timeout: 15000 });
      await box().click();
      await settled(page);
      await page.reload();
      await page.locator(".gd-chip.is-marked").first().waitFor({ timeout: 60000 });
      await settled(page);
      // the fight list can change between loads (a new fight comes in): open the marked one
      await page.locator(".gd-chip.is-marked").first().click();
      await page.locator(".gd-fight-chip").first().click();
      await page.getByRole("button", { name: "Unmark fight" }).waitFor({ timeout: 30000 });
      await settled(page);
      const kept = (await box().isChecked()) !== paidBefore;
      log("regear: marked fight kept, paid tick kept:", kept);
      if (!kept) problems.push("regear: paid tick lost after reload");
      await box().click();
      await settled(page);
      await page.getByRole("button", { name: "Unmark fight" }).click();
      await settled(page);
    } else log("regear: no fight with deaths to test");

    // bank log: only on an empty log, removed again
    await page.goto(`${BASE}/guild/eu/${slug}/bank`);
    await page.locator(".gd-bank-paste").waitFor({ timeout: 30000 });
    await settled(page);
    if (await page.getByRole("button", { name: "Remove all" }).count()) log("bank: the account has a log already, skipped");
    else {
      await page.locator(".gd-bank-paste textarea").fill(LOG);
      await page.getByRole("button", { name: "Add log" }).click();
      await page.locator(".gd-split-run").first().waitFor({ timeout: 30000 });
      await settled(page);
      await page.getByRole("button", { name: "Save split" }).click();
      await page.locator(".gd-split-open").waitFor({ timeout: 15000 });
      const boxes = page.locator(".gd-split-open .gd-split-pay input");
      for (const i of [0, 1]) await boxes.nth(i).click({ noWaitAfter: true });
      await settled(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator(".gd-splits .gd-member").first().waitFor({ timeout: 30000 });
      const row = flat(await page.locator(".gd-splits .gd-row-button").first().innerText());
      log("bank: split after reload:", row);
      if (!/2\/3/.test(row)) problems.push(`bank: paid ticks lost (${row})`);
      await page.locator(".gd-splits .gd-row-button").first().click();
      await page.getByRole("button", { name: "Remove split" }).first().click();
      await settled(page);
      await page.getByRole("button", { name: "Remove all" }).click();
      await settled(page);
    }

    await page.goto(`${BASE}/guild/eu/${slug}/discord`);
    await page.locator(".gd-discord-body").first().waitFor({ timeout: 30000 });
    await settled(page);
    log("discord tab:", flat(await page.locator(".gd-discord-body").first().innerText()).slice(0, 90));

  } finally {
    // the account is left as it was found, also when a step above failed
    if (!wasMarked) {
      await page.goto(`${BASE}/guild/eu/${slug}/overview`);
      await page.locator(".gd-btn.is-marked").click({ timeout: 30000 });
      await page.getByRole("button", { name: "☆ Mark", exact: true }).waitFor({ timeout: 30000 });
      log("unmarked again");
    }
  }
}

const browser = await chromium.launch();
try {
  const top = await (await fetch(`${BASE}/api/guild/top?region=eu&range=week`)).json();
  const guild = top.guilds?.[0];
  if (!guild) throw new Error("no top guild: is the killboard answering?");
  log("base:", BASE, "| guild:", guild.name);

  for (const viewport of QUICK ? [{ width: 1440, height: 900 }] : [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const { ctx, page } = await newPage(browser, viewport);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const section = page.locator("#guild-tools-demo");
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    log(viewport.width, "landing guild clip:", await section.locator("video").evaluate((v) => v.currentSrc.split("/").pop()).catch(() => "missing"));
    await page.overflow("landing");
    await tabs(page, guild.slug, `guest-${viewport.width}`);
    for (const path of ["/guild", "/guides", "/guides/albion-online-guild-tools", "/legal"]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      await page.overflow(path);
    }
    await ctx.close();
  }

  if (!QUICK) {
    const { ctx, page } = await newPage(browser, { width: 1440, height: 900 });
    await accountFlows(page, guild.slug);
    await ctx.close();
  }
} finally {
  await browser.close();
}
log(problems.length ? `FAILED (${problems.length}):\n- ${problems.join("\n- ")}` : "ALL GOOD");
process.exit(problems.length ? 1 : 0);
