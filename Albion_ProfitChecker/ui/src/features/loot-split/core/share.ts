import type { Stack } from "./lootLog";
import { MARKETS, type Market } from "./valuation";

/**
 * Everything a share link carries: the items left in the chest plus the split settings.
 * Prices load fresh when the link opens, so the link stays short and never goes stale.
 */
export type SharedStack = Omit<Stack, "key">;
export type SharedSplit = {
  stacks: SharedStack[];
  players: { name: string; share: number; repair: number }[];
  guildPct: number;
  premium: boolean;
  mode: "fast" | "max";
  market: Market;
};

type Packed = [number, [string, number, number, number][], [string, number, number][], number, number, number, number];

const toBase64Url = (bytes: Uint8Array) => {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value: string) => {
  const text = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
};

/** Links longer than this, or that unpack to more than MAX_BYTES, are not ours: a tiny link must not unpack into megabytes. */
const MAX_LINK = 20_000;
const MAX_BYTES = 1_000_000;
const MAX_STACKS = 2_000;
export const MAX_PLAYERS = 50;

/** A finite number between 0 and max; anything else is 0. */
const bounded = (value: unknown, max: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const reader = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error("too big");
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The link code, or null when the split is too big for a link the decoder would accept. */
export async function encodeSplit(split: SharedSplit): Promise<string | null> {
  if (split.players.length > MAX_PLAYERS || split.stacks.length > MAX_STACKS) return null;
  const packed: Packed = [
    1,
    split.stacks.map((s) => [s.name, s.enchant, s.quality, s.amount]),
    split.players.map((p) => [p.name, p.share, Math.round(p.repair)]),
    split.guildPct,
    split.premium ? 1 : 0,
    split.mode === "max" ? 1 : 0,
    Math.max(0, MARKETS.indexOf(split.market))
  ];
  const code = toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(packed)), new CompressionStream("deflate-raw")));
  return code.length > MAX_LINK ? null : code;
}

/** null for anything that is not a share link this page made. */
export async function decodeSplit(value: string): Promise<SharedSplit | null> {
  if (value.length > MAX_LINK) return null;
  try {
    const packed = JSON.parse(new TextDecoder().decode(await pipe(fromBase64Url(value), new DecompressionStream("deflate-raw")))) as Packed;
    if (packed[0] !== 1 || !Array.isArray(packed[1]) || !Array.isArray(packed[2])) return null;
    return {
      stacks: packed[1].slice(0, MAX_STACKS).map(([name, enchant, quality, amount]) => ({
        name: String(name).slice(0, 120),
        enchant: Math.min(4, Math.max(0, Number(enchant) || 0)),
        quality: Math.min(5, Math.max(1, Number(quality) || 1)),
        amount: Math.round(bounded(amount, 10_000_000))
      })),
      players: packed[2].slice(0, MAX_PLAYERS).map(([name, share, repair]) => ({
        name: String(name).slice(0, 32),
        share: bounded(share, 1_000),
        repair: bounded(repair, 1e12)
      })),
      guildPct: bounded(packed[3], 100),
      premium: packed[4] === 1,
      mode: packed[5] === 1 ? "max" : "fast",
      market: MARKETS[Number(packed[6])] ?? "best"
    };
  } catch {
    return null;
  }
}
