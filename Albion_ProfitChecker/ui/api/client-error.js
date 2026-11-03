// POST /api/client-error  ->  a JavaScript error a visitor's browser hit (src/shared/errorReporter.ts).
// Each new error is posted once to the private Discord #errors channel through the bot
// (DISCORD_BOT_TOKEN). The same error is posted again at most every 6 hours per function instance,
// and an instance posts at most 20 errors an hour, so a broken deploy or someone spamming the
// endpoint cannot flood the channel. Nothing is stored; the browser is reduced to name + system.
const SITE = "https://blackmarketreader.com";
const CHANNEL = "1567285839178764378";
const REPEAT_MS = 6 * 36e5;
const MAX_PER_HOUR = 20;

const lastPosted = new Map();
const hour = { start: 0, count: 0 };

/** Forgets what was posted (for tests). */
export function clearMemory() {
  lastPosted.clear();
  hour.start = 0;
  hour.count = 0;
}

const clean = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");

/** The same error from the same place gets the same key, whatever the visitor. */
export function fingerprint(message, stack) {
  const frame = stack.split("\n").slice(1).find((line) => line.trim()) ?? "";
  return `${message}|${frame.trim().replace(/\?[^:)\s]*/g, "")}`;
}

/** "Chrome · Windows" from a user agent, nothing more. */
export function shortBrowser(agent) {
  const browser = /Edg\//.test(agent) ? "Edge" : /OPR\//.test(agent) ? "Opera" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Other";
  const system = /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Windows/.test(agent) ? "Windows" : /Mac OS/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "other";
  return `${browser} · ${system}`;
}

// code blocks must not be closed early by the error text
const block = (text) => text.replace(/```/g, "'''");

export function errorMessage({ message, stack, source, page, browser }) {
  const lines = stack.split("\n").slice(1, 7).map((line) => line.trim()).filter(Boolean);
  const where = lines.length ? lines.join("\n") : source || "no stack";
  return {
    content: `🐞 **New error** · \`${block(page || "/").replace(/`/g, "'")}\` · ${shortBrowser(browser)}\n\`\`\`\n${block(message)}\n\`\`\`\n\`\`\`\n${block(where)}\n\`\`\``.slice(0, 1990),
    allowed_mentions: { parse: [] }
  };
}

function fromSite(req) {
  const origin = req.headers.origin;
  if (origin) return origin === SITE;
  return String(req.headers.referer ?? "").startsWith(`${SITE}/`);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  if (!fromSite(req)) return res.status(403).send("Forbidden");

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  const report = {
    message: clean(body?.message, 300),
    stack: clean(body?.stack, 1500),
    source: clean(body?.source, 300),
    page: clean(body?.page, 120),
    browser: clean(body?.browser, 200)
  };
  if (!report.message) return res.status(400).send("Bad request");

  const now = Date.now();
  const key = fingerprint(report.message, report.stack);
  if (now - hour.start > 36e5) {
    hour.start = now;
    hour.count = 0;
  }
  if (now - (lastPosted.get(key) ?? -Infinity) < REPEAT_MS || hour.count >= MAX_PER_HOUR) return res.status(204).end();
  lastPosted.set(key, now);
  hour.count++;

  try {
    const discord = await fetch(`https://discord.com/api/v10/channels/${CHANNEL}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(errorMessage(report)),
      signal: AbortSignal.timeout(5000)
    });
    if (!discord.ok) console.error("client error post failed", discord.status);
  } catch (error) {
    console.error("client error post failed", error.message);
  }
  return res.status(204).end();
}
