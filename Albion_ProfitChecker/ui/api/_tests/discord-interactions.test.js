import { generateKeyPairSync, sign } from "node:crypto";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler, { isValidSignature } from "../discord/interactions.js";

const EU = "1566853201263861870";
const US = "1566853202404573245";
const GUILD = "1459317201776677174";

// a throwaway key pair stands in for Discord's
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUBLIC_HEX = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex");

function request(payload, { badSignature = false, method = "POST" } = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  const timestamp = "1762000000";
  let signature = sign(null, Buffer.concat([Buffer.from(timestamp), body]), privateKey).toString("hex");
  if (badSignature) signature = signature.replace(/^./, (c) => (c === "0" ? "1" : "0"));
  const req = Readable.from([body]);
  req.method = method;
  req.headers = { "x-signature-ed25519": signature, "x-signature-timestamp": timestamp };
  return req;
}

function response() {
  const res = { statusCode: 0, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (data) => ((res.body = data), res);
  res.send = (data) => ((res.body = data), res);
  return res;
}

async function call(payload, opts) {
  const res = response();
  await handler(request(payload, opts), res);
  return res;
}

const click = (customId, roles) => ({
  type: 3,
  guild_id: GUILD,
  data: { custom_id: customId },
  member: { user: { id: "42" }, roles }
});

let calls;
beforeEach(() => {
  vi.stubEnv("DISCORD_PUBLIC_KEY", PUBLIC_HEX);
  vi.stubEnv("DISCORD_BOT_TOKEN", "test-token");
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    calls.push(`${init.method} ${url.replace("https://discord.com/api/v10", "")}`);
    return { ok: true, status: 204 };
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isValidSignature", () => {
  it("rejects missing or malformed signatures", () => {
    expect(isValidSignature(PUBLIC_HEX, undefined, "1", Buffer.from("{}"))).toBe(false);
    expect(isValidSignature(PUBLIC_HEX, "abc", "1", Buffer.from("{}"))).toBe(false);
    expect(isValidSignature(PUBLIC_HEX, "0".repeat(128), undefined, Buffer.from("{}"))).toBe(false);
  });
});

describe("discord interactions handler", () => {
  it("only accepts POST", async () => {
    expect((await call({ type: 1 }, { method: "GET" })).statusCode).toBe(405);
  });

  it("rejects a wrong signature", async () => {
    const res = await call({ type: 1 }, { badSignature: true });
    expect(res.statusCode).toBe(401);
  });

  it("answers Discord's PING", async () => {
    const res = await call({ type: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ type: 1 });
  });

  it("gives the picked region", async () => {
    const res = await call(click("region:eu", []));
    expect(calls).toEqual([`PUT /guilds/${GUILD}/members/42/roles/${EU}`]);
    expect(res.body.type).toBe(4);
    expect(res.body.data.flags).toBe(64);
    expect(res.body.data.content).toContain("You picked Europe");
  });

  it("switches from the other region", async () => {
    const res = await call(click("region:us", [EU]));
    expect(calls.sort()).toEqual([`DELETE /guilds/${GUILD}/members/42/roles/${EU}`, `PUT /guilds/${GUILD}/members/42/roles/${US}`]);
    expect(res.body.data.content).toContain("Switched to America");
  });

  it("removes the region when it is clicked again", async () => {
    const res = await call(click("region:eu", [EU]));
    expect(calls).toEqual([`DELETE /guilds/${GUILD}/members/42/roles/${EU}`]);
    expect(res.body.data.content).toContain("Removed");
  });

  it("ignores unknown buttons and other servers", async () => {
    expect((await call(click("region:asia", []))).body.data.content).toContain("does nothing");
    expect((await call({ ...click("region:eu", []), guild_id: "1" })).body.data.content).toContain("only works on the Blackmarket Reader server");
    expect(calls).toEqual([]);
  });

  it("switches gold alerts on and off", async () => {
    const ALERTS = "1567454898612600857";
    let res = await call(click("alerts:gold", [EU]));
    expect(calls).toEqual([`PUT /guilds/${GUILD}/members/42/roles/${ALERTS}`]);
    expect(res.body.data.content).toContain("Gold alerts on");
    calls.length = 0;
    res = await call(click("alerts:gold", [EU, ALERTS]));
    expect(calls).toEqual([`DELETE /guilds/${GUILD}/members/42/roles/${ALERTS}`]);
    expect(res.body.data.content).toContain("Gold alerts off");
  });

  it("tells the member when Discord refuses the role change", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(click("region:eu", []));
    expect(res.statusCode).toBe(200);
    expect(res.body.data.content).toContain("try again");
  });
});

describe("slash commands", () => {
  const TESTER = "1567453537372344360";
  const command = (name, channel = TESTER, options) => ({
    type: 2,
    guild_id: GUILD,
    channel_id: channel,
    data: { name, ...(options ? { options } : {}) },
    member: { user: { id: "42" }, roles: [EU] }
  });
  const hour = 3600;
  const latest = Math.floor(Date.now() / 1000);
  const points = Array.from({ length: 30 * 24 }, (_, i) => [latest - (30 * 24 - 1 - i) * hour, 9000 + (i % 24)]);

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      calls.push(`GET ${url}`);
      const body = url.includes("/api/aodp/gold") ? { points } : { confirmed: true, events: [] };
      return { ok: true, status: 200, json: async () => body };
    }));
  });

  it("only answer in the tester channel while they are tested", async () => {
    const res = await call(command("gold", "999"));
    expect(res.body.data.content).toContain("still being tested");
    expect(calls).toEqual([]);
  });

  it("/gold answers privately for the asker's server", async () => {
    const res = await call(command("gold"));
    expect(res.body.type).toBe(4);
    expect(res.body.data.flags).toBe((1 << 6) | (1 << 15));
    const text = JSON.stringify(res.body.data.components);
    expect(text).toContain("Europe");
    expect(text).not.toContain("America");
    expect(text).toContain("30-day low");
    expect(calls).toEqual(["GET https://blackmarketreader.com/api/aodp/gold?region=eu"]);
  });

  it("/bonus takes the chosen server and says when nothing is reported yet", async () => {
    const res = await call(command("bonus", TESTER, [{ name: "server", value: "us" }]));
    const text = JSON.stringify(res.body.data.components);
    expect(text).toContain("America");
    expect(text).toContain("Not reported for this server yet");
  });
});
