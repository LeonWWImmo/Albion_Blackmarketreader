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

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeSplit(split: SharedSplit): Promise<string> {
  const packed: Packed = [
    1,
    split.stacks.map((s) => [s.name, s.enchant, s.quality, s.amount]),
    split.players.map((p) => [p.name, p.share, Math.round(p.repair)]),
    split.guildPct,
    split.premium ? 1 : 0,
    split.mode === "max" ? 1 : 0,
    Math.max(0, MARKETS.indexOf(split.market))
  ];
  return toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(packed)), new CompressionStream("deflate-raw")));
}

/** null for anything that is not a share link this page made. */
export async function decodeSplit(value: string): Promise<SharedSplit | null> {
  try {
    const packed = JSON.parse(new TextDecoder().decode(await pipe(fromBase64Url(value), new DecompressionStream("deflate-raw")))) as Packed;
    if (packed[0] !== 1 || !Array.isArray(packed[1]) || !Array.isArray(packed[2])) return null;
    return {
      stacks: packed[1].map(([name, enchant, quality, amount]) => ({
        name: String(name).slice(0, 120),
        enchant: Math.min(4, Math.max(0, Number(enchant) || 0)),
        quality: Math.min(5, Math.max(1, Number(quality) || 1)),
        amount: Math.max(0, Math.round(Number(amount) || 0))
      })),
      players: packed[2].slice(0, 50).map(([name, share, repair]) => ({
        name: String(name).slice(0, 32),
        share: Math.max(0, Number(share) || 0),
        repair: Math.max(0, Number(repair) || 0)
      })),
      guildPct: Math.min(100, Math.max(0, Number(packed[3]) || 0)),
      premium: packed[4] === 1,
      mode: packed[5] === 1 ? "max" : "fast",
      market: MARKETS[Number(packed[6])] ?? "best"
    };
  } catch {
    return null;
  }
}
