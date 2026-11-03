import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler, { clearMemory, errorMessage, fingerprint, shortBrowser } from "./client-error.js";

const SITE = "https://blackmarketreader.com";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const STACK = "TypeError: x is undefined\n    at h (https://blackmarketreader.com/assets/index-abc.js:1:2345)\n    at g (https://blackmarketreader.com/assets/index-abc.js:1:99)";

function response() {
  const res = { statusCode: 0 };
  res.status = (code) => ((res.statusCode = code), res);
  res.send = () => res;
  res.end = () => res;
  return res;
}

async function call(body, { method = "POST", origin = SITE, referer } = {}) {
  const res = response();
  const headers = {};
  if (origin) headers.origin = origin;
  if (referer) headers.referer = referer;
  await handler({ method, headers, body }, res);
  return res;
}

const report = (message = "TypeError: x is undefined") => ({ message, stack: STACK, source: "", page: "/bm-crafter", browser: CHROME });

let posts;
beforeEach(() => {
  clearMemory();
  vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
  posts = [];
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    posts.push({ url, init });
    return { ok: true, status: 200 };
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("client error endpoint", () => {
  it("only takes POSTs from the site itself", async () => {
    expect((await call(report(), { method: "GET" })).statusCode).toBe(405);
    expect((await call(report(), { origin: "https://evil.example" })).statusCode).toBe(403);
    expect((await call(report(), { origin: null })).statusCode).toBe(403);
    expect((await call(report(), { origin: null, referer: `${SITE}/dashboard` })).statusCode).toBe(204);
    expect((await call({ stack: "no message" })).statusCode).toBe(400);
  });

  it("posts a new error once to the #errors channel through the bot", async () => {
    expect((await call(report())).statusCode).toBe(204);
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("https://discord.com/api/v10/channels/1567285839178764378/messages");
    expect(posts[0].init.headers.Authorization).toBe("Bot bot-token");
    const message = JSON.parse(posts[0].init.body);
    expect(message.allowed_mentions).toEqual({ parse: [] });
    expect(message.content).toContain("`/bm-crafter` · Chrome · Windows");
    expect(message.content).toContain("TypeError: x is undefined");
    expect(message.content).toContain("at h (https://blackmarketreader.com/assets/index-abc.js:1:2345)");

    await call(report());
    await call(JSON.stringify(report()));
    expect(posts).toHaveLength(1);
    await call(report("RangeError: other"));
    expect(posts).toHaveLength(2);
  });

  it("posts at most 20 errors an hour", async () => {
    for (let i = 0; i < 30; i++) await call(report(`Error ${i}`));
    expect(posts).toHaveLength(20);
  });

  it("reads a body that arrives as a Buffer", async () => {
    expect((await call(Buffer.from(JSON.stringify(report("Error: buffered"))))).statusCode).toBe(204);
    expect(posts).toHaveLength(1);
  });

  it("masks emails and keeps the page on one line", async () => {
    await call({ ...report("Error: no user mail.me@example.com found"), page: "/x\n**fake**" });
    const { content } = JSON.parse(posts[0].init.body);
    expect(content).not.toContain("mail.me@example.com");
    expect(content).toContain("[email]");
    expect(content.split("\n")[0]).toContain("/x'**fake**");
  });

  it("still answers when Discord fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call(report())).statusCode).toBe(204);
  });
});

describe("helpers", () => {
  it("gives the same error from the same place the same fingerprint", () => {
    expect(fingerprint("E", "E\n  at a (x.js?v=1:1:2)")).toBe(fingerprint("E", "E\n  at a (x.js?v=2:1:2)"));
    expect(fingerprint("E", "E\n  at a (x.js:1:2)")).not.toBe(fingerprint("E", "E\n  at b (y.js:3:4)"));
  });

  it("keeps only browser name and system", () => {
    expect(shortBrowser(CHROME)).toBe("Chrome · Windows");
    expect(shortBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari · iOS");
    expect(shortBrowser("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36 EdgA/141 Edg/141")).toBe("Edge · Android");
  });

  it("cannot be broken out of its code blocks or ping anyone", () => {
    const message = errorMessage({ ...report("Error: ``` @everyone"), page: "/`x`" });
    expect(message.content.match(/```/g)).toHaveLength(4);
    expect(message.allowed_mentions).toEqual({ parse: [] });
    expect(message.content.length).toBeLessThanOrEqual(1990);
  });
});
