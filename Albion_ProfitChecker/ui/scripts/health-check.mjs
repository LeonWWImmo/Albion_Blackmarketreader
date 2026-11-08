// Daily health check of the whole setup, posted to the private #status channel as one status
// picture (tiles per area + page speed) with the problems, if any, as text below it.
// Runs from .github/workflows/health-check.yml in two steps, so the webhook only reaches the last:
//
//   node scripts/health-check.mjs check            GitHub workflows, Vercel deploy, live website
//                                                  (Playwright), data freshness, Discord
//                                                  -> health-report.json + health-card.png
//   node scripts/health-check.mjs post [--dry-run] the card to DISCORD_WEBHOOK_STATUS, then deletes
//                                                  #errors posts older than 30 days (DISCORD_BOT_TOKEN)
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { connect } from "node:tls";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(ROOT, "../..");
const SITE = "https://blackmarketreader.com";
const REPO = process.env.GITHUB_REPOSITORY || "LeonWWImmo/Albion_Blackmarketreader";
const RUN_URL = process.env.GITHUB_RUN_ID ? `https://github.com/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID}` : `https://github.com/${REPO}/actions`;
const USER_AGENT = "BlackmarketReader/1.0 (+https://blackmarketreader.com)";
const REPORT_FILE = path.join(ROOT, "health-report.json");
const CARD_FILE = path.join(ROOT, "health-card.png");
const HOUR = 36e5;
// a daily job runs every ~24 h, but GitHub's schedule can start it up to ~9 h late
const STALE_HOURS = 48;
const SITE_PATH = "Albion_ProfitChecker/ui";
// the website check stops retrying after this, so the report is always written in time
const WEBSITE_BUDGET_MS = 10 * 60000;

const PAGES = ["/", "/dashboard", "/bm-crafter", "/crafting-calculator", "/refining-calculator", "/food-potion-crafter", "/gold-tracker", "/loot-split", "/prices", "/prices/adepts-bag", "/guides", "/guides/albion-online-gold-price", "/community", "/legal", "/login"];
const PAGE_NAMES = { "/": "Home", "/dashboard": "Dash", "/bm-crafter": "BM", "/crafting-calculator": "Craft", "/refining-calculator": "Refine", "/food-potion-crafter": "Food", "/gold-tracker": "Gold", "/loot-split": "Loot", "/prices": "Price", "/prices/adepts-bag": "Item", "/guides": "Guides", "/guides/albion-online-gold-price": "Guide", "/community": "Comm.", "/legal": "Legal", "/login": "Login" };
const VIEWPORTS = [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844, mobile: true }];
// overflow that is already there and known; only report it when it gets worse
const KNOWN_OVERFLOW = { "/dashboard@desktop": 48 };
const BLOCKED = /(_vercel|googlesyndication|doubleclick|google-analytics|googletagmanager|adservice|fundingchoices)/;
// share of refined materials with a price per city; Brecilien has few traders, so half the bar
const COVERAGE_WARN = 50;
const COVERAGE_FAIL = 25;
const COVERAGE_FACTOR = { Brecilien: 0.5 };
const CITY_NAMES = { Lymhurst: "LYM", Martlock: "MAR", "Fort Sterling": "FS", Thetford: "THE", Bridgewatch: "BW", Caerleon: "CAE", Brecilien: "BRE" };
// Vercel renews its certificates about 30 days before they run out
const SSL_WARN_DAYS = 14;
const SSL_FAIL_DAYS = 7;

// ---------------------------------------------------------------- helpers

export function ago(ms) {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (ms < 48 * HOUR) return `${Math.round(ms / HOUR)} h`;
  return `${Math.round(ms / (24 * HOUR))} d`;
}
const utcTime = (ms) => new Date(ms).toISOString().slice(11, 16);

const http = (url, init = {}) =>
  fetch(url, { signal: AbortSignal.timeout(30000), ...init, headers: { "User-Agent": USER_AGENT, ...init.headers } });
async function json(url, init) {
  const res = await http(url, init);
  if (!res.ok) throw new Error(`${url.replace(/\?.*/, "")} -> HTTP ${res.status}`);
  return res.json();
}
const github = (p) =>
  json(`https://api.github.com/repos/${REPO}${p}`, {
    headers: { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) }
  });

/** One area of the report: `value` and `caption` fill its tile, `summary` is the line in the log. */
const section = (label, status, { value, caption, summary = `${value} ${caption}`, problems = [] }) => ({ label, status, value, caption, summary, problems });

/** The worst status wins. */
export function overall(sections) {
  if (sections.some((s) => s.status === "fail")) return "fail";
  if (sections.some((s) => s.status === "warn")) return "warn";
  return "ok";
}

// ---------------------------------------------------------------- checks

const workflowFiles = () =>
  readdirSync(path.join(REPO_ROOT, ".github/workflows"))
    .filter((f) => f.endsWith(".yml"))
    .map((file) => {
      const text = readFileSync(path.join(REPO_ROOT, ".github/workflows", file), "utf8");
      return { file, name: /^name:\s*(.+)$/m.exec(text)?.[1].trim() ?? file, scheduled: /^\s*schedule:/m.test(text) };
    });

async function checkGithub(now) {
  const watched = workflowFiles().filter((w) => (w.scheduled || w.file === "discord-changelog.yml") && w.file !== "discord-daily.yml");
  const problems = [];
  let healthy = 0;
  for (const w of watched) {
    const { workflow_runs: runs } = await github(`/actions/workflows/${w.file}/runs?per_page=15&exclude_pull_requests=true`);
    const done = runs.filter((r) => r.status === "completed");
    const found = [];
    if (done[0] && ["failure", "timed_out", "startup_failure"].includes(done[0].conclusion)) found.push(`${w.name}: last run failed`);
    if (w.scheduled) {
      const success = done.find((r) => r.conclusion === "success");
      const age = success ? now - Date.parse(success.updated_at) : Infinity;
      if (age > STALE_HOURS * HOUR) found.push(`${w.name}: no successful run for ${success ? ago(age) : "a long time"}`);
    }
    problems.push(...found);
    if (!found.length) healthy++;
  }
  return section("GitHub", problems.length ? "fail" : "ok", { value: `${healthy}/${watched.length}`, caption: "workflows healthy", problems });
}

async function checkVercel(now) {
  const [deploy] = await github("/deployments?environment=Production&per_page=1");
  if (!deploy) return section("Vercel", "fail", { value: "NONE", caption: "no production deploy" });
  const [status] = await github(`/deployments/${deploy.id}/statuses?per_page=1`);
  const short = deploy.sha.slice(0, 7);
  const since = ago(now - Date.parse(status?.created_at ?? deploy.created_at));
  if (["pending", "queued", "in_progress"].includes(status?.state)) return section("Vercel", "warn", { value: "BUILDING", caption: `deploy ${short}` });
  if (status?.state !== "success") return section("Vercel", "fail", { value: "FAILED", caption: `deploy ${short} is ${status?.state ?? "unknown"}` });
  // the newest commit that changes the site (a push that only touches .github/ needs no deploy)
  const [site] = await github(`/commits?sha=main&path=${SITE_PATH}&per_page=1`);
  const siteAge = now - Date.parse(site.commit.committer.date);
  if (site.sha !== deploy.sha && siteAge > 30 * 60000) {
    const { status: order } = await github(`/compare/${deploy.sha}...${site.sha}`);
    if (order === "ahead" || order === "diverged") {
      return section("Vercel", "warn", { value: "BEHIND", caption: `${short} live`, problems: [`${site.sha.slice(0, 7)} is ${ago(siteAge)} old and still not live`] });
    }
  }
  return section("Vercel", "ok", { value: "LIVE", caption: `${short} · ${since} ago` });
}

async function loadPage(browser, url, viewport) {
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: !!viewport.mobile, hasTouch: !!viewport.mobile });
  await ctx.addInitScript(() => {
    localStorage.setItem("factionChosenV1", "1");
    localStorage.setItem("region", "eu");
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_|favicon/.test(m.text())) errors.push(m.text().slice(0, 120));
  });
  await page.route(BLOCKED, (r) => r.abort());
  try {
    const started = Date.now();
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const ms = Date.now() - started;
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    return { ctx, page, status: res?.status() ?? 0, errors, overflow, ms };
  } catch (error) {
    await ctx.close();
    throw error;
  }
}

async function checkWebsite(chromium, speed) {
  const browser = await chromium.launch();
  const problems = [];
  const deadline = Date.now() + WEBSITE_BUDGET_MS;
  let loads = 0, loadsOk = 0;
  try {
    for (const viewport of VIEWPORTS) {
      for (const p of PAGES) {
        loads++;
        let issues = [];
        // one retry, so a single network hiccup is no alarm
        for (let attempt = 0; attempt < 2; attempt++) {
          if (Date.now() > deadline) {
            issues = ["not checked, the website check ran out of time"];
            break;
          }
          let loaded;
          try {
            loaded = await loadPage(browser, SITE + p, viewport);
            issues = [];
            if (loaded.status !== 200) issues.push(`HTTP ${loaded.status}`);
            if (loaded.errors.length) issues.push(`error: ${loaded.errors[0]}`);
            if (loaded.overflow > (KNOWN_OVERFLOW[`${p}@${viewport.name}`] ?? 0)) issues.push(`${loaded.overflow}px wider than the screen`);
            if (viewport.name === "desktop" && p === "/gold-tracker") {
              const price = Number((await loaded.page.locator(".gt-price").innerText({ timeout: 5000 })).replace(/[^\d]/g, ""));
              if (!(price > 1000)) issues.push(`gold price shows ${price}`);
            }
            if (viewport.name === "desktop" && p === "/bm-crafter" && !(await loaded.page.locator("tbody tr.high-density-row").count())) issues.push("no crafts in the table");
          } catch (error) {
            issues = [error.message.split("\n")[0].slice(0, 120)];
          } finally {
            await loaded?.ctx.close();
          }
          if (!issues.length) {
            if (viewport.name === "desktop") speed.push({ page: p, ms: loaded.ms });
            break;
          }
        }
        if (issues.length) problems.push(`${p} (${viewport.name}): ${issues.join(", ")}`);
        else loadsOk++;
      }
    }
  } finally {
    await browser.close();
  }

  let apis = 0, apisOk = 0;
  const api = async (label, test) => {
    apis++;
    try {
      const issue = await test();
      if (issue) problems.push(`${label}: ${issue}`);
      else apisOk++;
    } catch (error) {
      problems.push(`${label}: ${error.message}`);
    }
  };
  for (const region of ["eu", "us"]) {
    await api(`festivities ${region}`, async () => (Array.isArray((await json(`${SITE}/api/aodp/festivities?region=${region}`)).events) ? null : "no events list"));
    await api(`gold ${region}`, async () => {
      const { points } = await json(`${SITE}/api/aodp/gold?region=${region}`);
      if (!points?.length) return "no prices";
      const age = Date.now() - points[points.length - 1][0] * 1000;
      return age > 12 * HOUR ? `newest price ${ago(age)} old` : null;
    });
  }
  await api("sitemap", async () => ((await (await http(`${SITE}/sitemap.xml`)).text()).includes("<loc>") ? null : "no URLs"));
  // the error reporter only takes reports from the site itself
  await api("/api/client-error", async () => {
    const { status } = await http(`${SITE}/api/client-error`, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"message":"health check"}' });
    return status === 403 ? null : `answers ${status} to a report from outside the site (expected 403)`;
  });
  for (const p of ["/api/cron/discord-daily", "/api/cron/health-check"]) {
    await api(p, async () => {
      const { status } = await http(SITE + p);
      return status === 401 ? null : `answers ${status} without the cron secret (expected 401)`;
    });
  }

  return section("Website", problems.length ? "fail" : "ok", { value: `${loadsOk}/${loads}`, caption: `pages · ${apisOk}/${apis} APIs`, problems });
}

/** Share (0-100) of items with a price in each city, from a materials-cities file. */
export function cityCoverage(data) {
  const items = data.items ?? [];
  return (data.cities ?? []).map((city) => ({
    city,
    percent: items.length ? (items.filter((item) => item.prices?.[city] > 0).length / items.length) * 100 : 0
  }));
}

/** The problems in a region's coverage, worst level first ("fail" / "warn" / null). */
export function coverageProblems(region, cities) {
  const problems = [];
  let level = null;
  for (const { city, percent } of cities) {
    const factor = COVERAGE_FACTOR[city] ?? 1;
    if (percent < COVERAGE_FAIL * factor) level = "fail";
    else if (percent < COVERAGE_WARN * factor) level ??= "warn";
    else continue;
    problems.push(`${region.toUpperCase()} ${city}: only ${Math.round(percent)}% of the materials have a price`);
  }
  return { level, problems };
}

async function checkData(now, coverage) {
  const files = readdirSync(path.join(ROOT, "public/data")).filter((f) => f.endsWith(".json"));
  const problems = [];
  const ages = [];
  let level = null;
  for (const file of files) {
    try {
      const data = await json(`${SITE}/data/${file}`);
      const coverageRegion = /^materials-cities-(eu|us)\.json$/.exec(file)?.[1];
      if (coverageRegion) {
        const cities = cityCoverage(data);
        coverage.push({ region: coverageRegion, cities });
        const found = coverageProblems(coverageRegion, cities);
        problems.push(...found.problems);
        if (found.level === "fail" || (found.level && !level)) level = found.level;
      }
      if (!data?.generatedAt) {
        // static recipe and ingredient lists have no time; price files (-eu / -us) must
        if (/-(eu|us)\.json$/.test(file)) {
          problems.push(`${file}: no generatedAt`);
          level = "fail";
        }
        continue;
      }
      const age = now - Date.parse(data.generatedAt);
      ages.push(age);
      if (age > STALE_HOURS * HOUR) {
        problems.push(`${file}: ${ago(age)} old`);
        level = "fail";
      }
    } catch (error) {
      problems.push(`${file}: ${error.message}`);
      level = "fail";
    }
  }
  if (!ages.length) {
    problems.push("no price file has a generatedAt time");
    level = "fail";
  }
  const fresh = ages.filter((age) => age <= STALE_HOURS * HOUR).length;
  const caption = ages.length ? `price files · oldest ${ago(Math.max(...ages))}` : "price files";
  return section("Data", level ?? "ok", { value: `${fresh}/${ages.length}`, caption, problems });
}

/** Days until the site's TLS certificate runs out. */
function certificateDays(host) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: 443, servername: host, timeout: 15000 }, () => {
      const { valid_to: validTo } = socket.getPeerCertificate();
      socket.end();
      resolve((Date.parse(validTo) - Date.now()) / (24 * HOUR));
    });
    socket.on("timeout", () => socket.destroy(new Error("TLS timeout")));
    socket.on("error", reject);
  });
}

/** Known vulnerabilities in the installed packages, by severity, from `npm audit`. */
export function auditSummary(audit) {
  const counts = audit?.metadata?.vulnerabilities ?? {};
  const packages = Object.values(audit?.vulnerabilities ?? {}).map((v) => `${v.name} (${v.severity})`);
  return { critical: counts.critical ?? 0, high: counts.high ?? 0, moderate: counts.moderate ?? 0, low: counts.low ?? 0, packages };
}

async function checkSecurity() {
  const problems = [];
  let level = null;
  let days = null;
  try {
    days = await certificateDays(new URL(SITE).hostname);
    if (days < SSL_FAIL_DAYS) level = "fail";
    else if (days < SSL_WARN_DAYS) level = "warn";
    if (level) problems.push(`SSL certificate runs out in ${Math.floor(days)} days`);
  } catch (error) {
    level = "fail";
    problems.push(`SSL certificate: ${error.message}`);
  }

  let vulns = "audit failed";
  const audit = (liveOnly) => {
    // npm audit exits 1 when it finds something, so read its JSON either way
    const run = spawnSync(`npm audit --json${liveOnly ? " --omit=dev" : ""}`, { cwd: ROOT, encoding: "utf8", shell: true, timeout: 120000 });
    const result = JSON.parse(run.stdout);
    // without the registry npm still prints JSON, but an error instead of the counts
    if (result.error || !result.metadata) throw new Error(result.error?.summary ?? "no result");
    return auditSummary(result);
  };
  try {
    const all = audit(false);
    // critical / high in a package the live site uses is red; the rest (dev tools, moderate) amber
    const live = audit(true);
    if (live.critical + live.high) level = "fail";
    else if (all.critical + all.high + all.moderate && level !== "fail") level = "warn";
    const shown = [["critical", all.critical], ["high", all.high], ["moderate", all.moderate]].filter(([, n]) => n);
    vulns = shown.length ? shown.map(([name, n]) => `${n} ${name}`).join(", ") : "no known vulns";
    if (shown.length) problems.push(`npm audit: ${all.packages.join(", ")}`);
  } catch {
    level ??= "warn";
    problems.push("npm audit gave no result");
  }
  return section("Security", level ?? "ok", { value: days === null ? "?" : `${Math.floor(days)}d`, caption: `SSL left · ${vulns}`, problems });
}

async function checkDiscord(now) {
  const problems = [];
  const today = new Date(now).toISOString().slice(0, 10);
  const { workflow_runs: runs } = await github(`/actions/workflows/discord-daily.yml/runs?per_page=20&created=%3E%3D${today}`);
  const real = runs.filter((r) => r.display_title === "Discord Daily Update");
  const posted = real.filter((r) => r.conclusion === "success").sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))[0];
  const waiting = real.find((r) => r.status !== "completed");
  let status = "ok";
  let value;
  let caption;
  if (posted) {
    value = utcTime(Date.parse(posted.updated_at));
    caption = "daily post (UTC)";
  } else if (waiting) {
    status = "warn";
    value = "WAITING";
    caption = "for today's bonus";
  } else if (new Date(now).getUTCHours() < 11 && !real.length) {
    // a manual run before Vercel Cron starts the daily post at 10:15 UTC
    value = "LATER";
    caption = "daily post not due yet";
  } else {
    status = "fail";
    value = "MISSING";
    caption = "no daily post today";
    if (real.some((r) => r.conclusion === "failure")) problems.push("today's run failed");
  }

  // the role buttons: Discord's endpoint must refuse unsigned requests
  try {
    const { status: code } = await http(`${SITE}/api/discord/interactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"type":1}' });
    if (code === 401) caption += " · buttons ok";
    else {
      status = "fail";
      problems.push(`role buttons answer ${code} to an unsigned request (expected 401)`);
    }
  } catch (error) {
    status = "fail";
    problems.push(`role buttons: ${error.message}`);
  }
  return section("Discord", status, { value, caption, problems });
}

async function runChecks() {
  const started = Date.now();
  const { chromium } = await import("@playwright/test");
  const speed = [];
  const coverage = [];
  const checks = [
    ["GitHub", () => checkGithub(started)],
    ["Vercel", () => checkVercel(started)],
    ["Website", () => checkWebsite(chromium, speed)],
    ["Data", () => checkData(started, coverage)],
    ["Discord", () => checkDiscord(started)],
    ["Security", () => checkSecurity()]
  ];
  const sections = [];
  for (const [label, run] of checks) {
    try {
      sections.push(await run());
    } catch (error) {
      sections.push(section(label, "fail", { value: "ERROR", caption: "check crashed", problems: [error.message] }));
    }
  }
  const report = { at: started, seconds: Math.round((Date.now() - started) / 1000), sections, speed, coverage };
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  // the repo is public, so the run log only gets the overview; the details go to the private channel
  for (const s of sections) console.log(`${s.status.toUpperCase().padEnd(4)} ${s.label}: ${s.summary}${s.problems.length ? ` (${s.problems.length} problem(s), see #status)` : ""}`);
  try {
    await renderCard(chromium, report);
  } catch (error) {
    // the post step then sends the text version
    console.error("status picture failed:", error.message);
  }
  return overall(sections);
}

// ---------------------------------------------------------------- status picture

const STATUS = {
  ok: { color: "#22c55e", word: "OK", headline: "All systems clean", emoji: "✅", accent: 0x22c55e },
  warn: { color: "#f59e0b", word: "WARN", headline: "Needs a look", emoji: "⚠️", accent: 0xf59e0b },
  fail: { color: "#ef4444", word: "FAIL", headline: "Something is broken", emoji: "❌", accent: 0xef4444 }
};
const ICONS = {
  GitHub: '<circle cx="6" cy="5.5" r="2.5"/><circle cx="6" cy="18.5" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8v8M18 10.5c0 4.5-6.5 3.5-11 6"/>',
  Vercel: '<path d="M12 3.5 21.5 20h-19z" fill="currentColor" stroke="none"/>',
  Website: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.2 3.6 3.2 14.4 0 18M12 3c-3.2 3.6-3.2 14.4 0 18"/>',
  Data: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  Discord: '<path d="M5 4.5h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-7.5L6 21v-4H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" stroke-width="3"/>',
  Security: '<path d="M12 2.5 4 5.5v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10v-6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'
};
const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const speedColor = (ms) => (ms < 2500 ? "#22c55e" : ms < 5000 ? "#f59e0b" : "#ef4444");
const coverageColor = (city, percent) => {
  const factor = COVERAGE_FACTOR[city] ?? 1;
  return percent >= 80 * factor ? "#22c55e" : percent >= COVERAGE_WARN * factor ? "#f59e0b" : "#ef4444";
};

/** The status picture as one HTML page (rendered to PNG by Chromium). */
export function cardHtml(report) {
  const state = STATUS[overall(report.sections)];
  const date = new Date(report.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const tiles = report.sections
    .map((s) => {
      const st = STATUS[s.status] ?? STATUS.fail;
      return `<div class="tile${s.status === "ok" ? "" : " bad"}" style="--c:${st.color}">
        <div class="tile-top"><svg viewBox="0 0 24 24">${ICONS[s.label] ?? ICONS.Website}</svg><span class="pill">${st.word}</span></div>
        <div class="label">${escapeHtml(s.label)}</div>
        <div class="value${String(s.value).length > 5 ? " small" : ""}">${escapeHtml(s.value)}</div>
        <div class="caption">${escapeHtml(s.caption)}</div>
      </div>`;
    })
    .join("");
  const speed = report.speed ?? [];
  const average = speed.length ? speed.reduce((sum, s) => sum + s.ms, 0) / speed.length : 0;
  const top = Math.max(3000, ...speed.map((s) => s.ms));
  const bars = speed
    .map((s) => `<div class="bar"><span class="ms">${(s.ms / 1000).toFixed(1)}</span><i style="height:${Math.max(6, (s.ms / top) * 100)}%;background:${speedColor(s.ms)}"></i><b>${escapeHtml(PAGE_NAMES[s.page] ?? s.page)}</b></div>`)
    .join("");
  const coverage = [...(report.coverage ?? [])].sort((a, b) => a.region.localeCompare(b.region));
  const cities = coverage[0]?.cities.map((c) => c.city) ?? [];
  const grid = coverage.length
    ? `<table><tr><th></th>${cities.map((city) => `<th>${CITY_NAMES[city] ?? escapeHtml(city.slice(0, 3))}</th>`).join("")}</tr>${coverage
        .map((r) => `<tr><td class="rg">${r.region.toUpperCase()}</td>${r.cities.map((c) => `<td><span style="--c:${coverageColor(c.city, c.percent)}">${Math.round(c.percent)}</span></td>`).join("")}</tr>`)
        .join("")}</table>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800&family=JetBrains+Mono:wght@700&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { background: #070b16; font-family: Inter, "Segoe UI", Ubuntu, "DejaVu Sans", sans-serif; color: #e8edf7; }
  .card { width: 1200px; padding: 44px 48px 36px; position: relative; overflow: hidden;
    background: radial-gradient(900px 320px at 12% -10%, color-mix(in srgb, ${state.color} 28%, transparent), transparent 70%),
                linear-gradient(180deg, #0d1426, #070b16); }
  .card::before { content: ""; position: absolute; inset: 0; border-top: 6px solid ${state.color}; pointer-events: none; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 34px; }
  .kicker { font-size: 19px; letter-spacing: .22em; font-weight: 700; color: #8b97b3; }
  .headline { display: flex; align-items: center; gap: 18px; font-size: 56px; font-weight: 800; margin-top: 10px; letter-spacing: -.02em; }
  .dot { width: 26px; height: 26px; border-radius: 50%; background: ${state.color}; box-shadow: 0 0 0 9px color-mix(in srgb, ${state.color} 22%, transparent), 0 0 38px ${state.color}; }
  .when { text-align: right; }
  .when .date { font-size: 34px; font-weight: 800; }
  .when .time { font-size: 19px; color: #8b97b3; font-weight: 500; margin-top: 6px; }
  .tiles { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; }
  .tile { background: #111a30; border: 1px solid #1e2a45; border-radius: 22px; padding: 20px 18px 18px; position: relative; overflow: hidden; }
  .tile.bad { background: color-mix(in srgb, var(--c) 12%, #111a30); border-color: color-mix(in srgb, var(--c) 55%, #1e2a45); box-shadow: 0 0 34px color-mix(in srgb, var(--c) 22%, transparent); }
  .tile::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 5px; background: var(--c); }
  .tile-top { display: flex; justify-content: space-between; align-items: center; }
  .tile svg { width: 34px; height: 34px; fill: none; stroke: var(--c); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; color: var(--c); }
  .pill { font-size: 14px; font-weight: 800; letter-spacing: .08em; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); padding: 6px 11px; border-radius: 999px; }
  .label { margin-top: 14px; font-size: 19px; font-weight: 700; color: #9aa6c2; }
  .value { margin-top: 4px; font-family: "JetBrains Mono", Consolas, monospace; font-size: 42px; font-weight: 700; letter-spacing: -.03em; color: #fff; white-space: nowrap; }
  .value.small { font-size: 27px; padding-top: 11px; padding-bottom: 5px; }
  .caption { margin-top: 6px; font-size: 15px; color: #8b97b3; font-weight: 500; line-height: 1.35; min-height: 44px; }
  .panels { display: grid; grid-template-columns: 1.45fr 1fr; gap: 14px; margin-top: 16px; }
  .panel { background: #111a30; border: 1px solid #1e2a45; border-radius: 22px; padding: 22px 24px 16px; }
  .panel-head { display: flex; justify-content: space-between; align-items: baseline; }
  .panel-head span { font-size: 18px; font-weight: 700; color: #9aa6c2; letter-spacing: .02em; }
  .panel-head strong { font-family: "JetBrains Mono", Consolas, monospace; font-size: 28px; color: #fff; }
  .panel-head em { font-style: normal; font-size: 15px; color: #8b97b3; margin-left: 8px; }
  .bars { display: flex; gap: 8px; height: 156px; margin-top: 12px; align-items: flex-end; }
  .bar { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 6px; }
  .bar i { width: 100%; border-radius: 8px 8px 3px 3px; display: block; box-shadow: inset 0 2px 0 rgba(255,255,255,.18); }
  .bar .ms { font-family: "JetBrains Mono", Consolas, monospace; font-size: 13px; color: #c3cbe0; }
  .bar b { font-size: 13px; font-weight: 700; color: #8b97b3; }
  table { width: 100%; border-spacing: 6px; margin-top: 10px; table-layout: fixed; }
  th:first-child { width: 38px; }
  th { font-size: 13px; font-weight: 700; color: #8b97b3; letter-spacing: .04em; }
  td { padding: 0; }
  td.rg { font-size: 16px; font-weight: 800; color: #c3cbe0; width: 34px; }
  td span { display: block; height: 58px; line-height: 58px; text-align: center; border-radius: 12px; font-family: "JetBrains Mono", Consolas, monospace; font-size: 19px; font-weight: 700;
    color: var(--c); background: color-mix(in srgb, var(--c) 17%, #0d1426); border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); }
  .legend { margin-top: 8px; font-size: 13px; color: #6b7794; text-align: right; }
  .foot { margin-top: 22px; display: flex; justify-content: space-between; font-size: 17px; color: #5f6b88; font-weight: 500; }
</style></head><body>
<div class="card">
  <div class="head">
    <div><div class="kicker">DAILY HEALTH CHECK</div><div class="headline"><span class="dot"></span>${state.headline}</div></div>
    <div class="when"><div class="date">${escapeHtml(date)}</div><div class="time">${utcTime(report.at)} UTC · checked in ${report.seconds}s</div></div>
  </div>
  <div class="tiles">${tiles}</div>
  ${speed.length || grid ? `<div class="panels">
    ${speed.length ? `<div class="panel"><div class="panel-head"><span>PAGE SPEED · desktop</span><div><strong>${(average / 1000).toFixed(1)}s</strong><em>avg load</em></div></div><div class="bars">${bars}</div></div>` : "<div></div>"}
    ${grid ? `<div class="panel"><div class="panel-head"><span>PRICE COVERAGE · %</span><em>materials with a price</em></div>${grid}<div class="legend">green ≥ 80 · amber ≥ 50 · red below · BRE half</div></div>` : ""}
  </div>` : ""}
  <div class="foot"><span>blackmarketreader.com</span><span>next check tomorrow · 14:00 UTC</span></div>
</div></body></html>`;
}

async function renderCard(chromium, report) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1.5 });
    await page.setContent(cardHtml(report), { waitUntil: "networkidle", timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".card").screenshot({ path: CARD_FILE });
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- Discord message

const MAX_PROBLEMS = 4;
// Discord allows 4000 characters per text block
const MAX_TEXT = 3500;
const MAX_PROBLEM_CHARS = 180;
const shorten = (problem) => (problem.length > MAX_PROBLEM_CHARS ? `${problem.slice(0, MAX_PROBLEM_CHARS)}…` : problem);
const clip = (content) => (content.length > MAX_TEXT ? `${content.slice(0, MAX_TEXT)}…\n-# and more` : content);
const text = (content) => ({ type: 10, content });
const linkButton = (label, emoji, url) => ({ type: 2, style: 5, label, emoji: { name: emoji }, url });
const CARD_NAME = "health-card.png";

/** The message: status picture (or a text list without it), then only what needs a look. */
export function buildCard(report, { picture = true, runUrl = RUN_URL } = {}) {
  const state = STATUS[overall(report.sections)];
  const icon = (s) => (STATUS[s.status] ?? STATUS.fail).emoji;
  const body = [text(`-# 🩺 DAILY HEALTH CHECK · ${state.emoji} ${state.headline.toUpperCase()}`)];
  if (picture) body.push({ type: 12, items: [{ media: { url: `attachment://${CARD_NAME}` }, description: `Health check: ${state.headline}` }] });
  else body.push(text(report.sections.map((s) => `${icon(s)} **${s.label}** · ${s.summary}`).join("\n")));

  const broken = report.sections.filter((s) => s.problems.length);
  if (broken.length) {
    const lines = broken.map((s) => {
      const shown = s.problems.slice(0, MAX_PROBLEMS).map((p) => `\n-# ↳ ${shorten(p)}`).join("");
      const more = s.problems.length > MAX_PROBLEMS ? `\n-# ↳ and ${s.problems.length - MAX_PROBLEMS} more` : "";
      return `${icon(s)} **${s.label}**${shown}${more}`;
    });
    body.push({ type: 14, divider: true, spacing: 1 }, text(clip(`### What needs a look\n${lines.join("\n")}`)));
  }
  body.push({
    type: 1,
    components: [linkButton("Run log", "📋", runUrl), linkButton("Website", "🌐", SITE), linkButton("Vercel", "🚀", "https://vercel.com/dashboard")]
  });
  return {
    username: "Blackmarket Reader",
    flags: 1 << 15,
    allowed_mentions: { parse: [] },
    ...(picture ? { attachments: [{ id: 0, filename: CARD_NAME }] } : {}),
    components: [{ type: 17, accent_color: state.accent, components: body }]
  };
}

async function runPost(dryRun) {
  const report = existsSync(REPORT_FILE)
    ? JSON.parse(readFileSync(REPORT_FILE, "utf8"))
    : { at: Date.now(), seconds: 0, sections: [section("Health check", "fail", { value: "ERROR", caption: "crashed before it could finish", summary: "crashed before it could finish, see the run log" })] };
  const picture = existsSync(CARD_FILE) && existsSync(REPORT_FILE);
  const message = buildCard(report, { picture });
  if (dryRun || !process.env.DISCORD_WEBHOOK_STATUS) {
    console.log(JSON.stringify(message, null, 2));
    if (!dryRun) throw new Error("DISCORD_WEBHOOK_STATUS is not set");
    return;
  }
  const send = () => {
    const form = new FormData();
    form.append("payload_json", JSON.stringify(message));
    if (picture) form.append("files[0]", new Blob([readFileSync(CARD_FILE)], { type: "image/png" }), CARD_NAME);
    return fetch(`${process.env.DISCORD_WEBHOOK_STATUS}?wait=true&with_components=true`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
  };
  // one retry for a Discord hiccup; errors never include the webhook URL
  let res = await send().catch(() => null);
  if (!res || res.status >= 500 || res.status === 429) res = await send().catch((error) => ({ ok: false, status: error.name, text: async () => "" }));
  if (!res.ok) throw new Error(`Discord: HTTP ${res.status} ${await res.text()}`);
  console.log("posted to #status");
  await pruneErrors(Date.now()).catch((error) => console.log("errors cleanup skipped:", error.message));
}

// #errors (api/client-error.js): the bot's own posts older than this are deleted, as the privacy page
// promises; an error that still happens gets posted again anyway
const ERRORS_CHANNEL = "1567285839178764378";
const ERRORS_KEEP_DAYS = 30;

export function oldErrorPosts(messages, botId, now) {
  return messages.filter((m) => m.author?.id === botId && !m.pinned && now - Date.parse(m.timestamp) > ERRORS_KEEP_DAYS * 24 * HOUR);
}

export async function pruneErrors(now) {
  if (!process.env.DISCORD_BOT_TOKEN) return console.log("errors cleanup skipped: DISCORD_BOT_TOKEN is not set");
  const discord = async (method, p) => {
    const res = await fetch(`https://discord.com/api/v10${p}`, {
      method,
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`${method} ${p.split("?")[0]}: HTTP ${res.status}`);
    return res.status === 204 ? null : res.json();
  };
  const me = await discord("GET", "/users/@me");
  const messages = [];
  for (let before = ""; ; ) {
    const page = await discord("GET", `/channels/${ERRORS_CHANNEL}/messages?limit=100${before && `&before=${before}`}`);
    messages.push(...page);
    if (page.length < 100) break;
    before = page.at(-1).id;
  }
  const old = oldErrorPosts(messages, me.id, now);
  for (const m of old) {
    await discord("DELETE", `/channels/${ERRORS_CHANNEL}/messages/${m.id}`);
    await new Promise((resolve) => setTimeout(resolve, 1100)); // stay under Discord's delete rate limit
  }
  console.log(`#errors: deleted ${old.length} posts older than ${ERRORS_KEEP_DAYS} days`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (mode === "check") process.exitCode = (await runChecks()) === "fail" ? 1 : 0;
  else if (mode === "post") await runPost(process.argv.includes("--dry-run"));
  else {
    console.error("usage: node scripts/health-check.mjs check | post [--dry-run]");
    process.exitCode = 2;
  }
}
