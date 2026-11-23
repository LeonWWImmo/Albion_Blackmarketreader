// Market depth for the tools (premium): how much sits on the market at each price, per item and
// market, from /api/market/depth (api/_lib/marketDepth.js, refreshed every 30 minutes).
import { accessToken } from "@shared/premium/premium";

/** [sellLevels [price, amount] cheapest first, sellTotal, buyLevels [price, amount, quality] best first, buyTotal, seen (minute)] */
export type DepthCell = 0 | [Array<[number, number]>, number, Array<[number, number, number]>, number, number];
export type DepthSnapshot = { region: string; locations: string[]; depthAt: string; depth: Record<string, DepthCell[]> };

export type DepthStatus =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "locked" }
  | { kind: "none" }
  | { kind: "ok"; snap: DepthSnapshot };

const KEEP_MS = 5 * 60_000;
const cache = new Map<string, { at: number; status: Promise<DepthStatus> }>();

async function fetchDepth(region: string): Promise<DepthStatus> {
  const token = await accessToken();
  if (!token) return { kind: "guest" };
  const res = await fetch(`/api/market/depth?region=${region}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) return { kind: "guest" };
  if (res.status === 403) return { kind: "locked" };
  const data = await res.json().catch(() => null);
  return res.ok && data?.depth ? { kind: "ok", snap: data as DepthSnapshot } : { kind: "none" };
}

/** The region's market depth, shared by the page and kept for a few minutes. */
export function loadDepth(region: string): Promise<DepthStatus> {
  const hit = cache.get(region);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.status;
  const status = fetchDepth(region).catch((): DepthStatus => ({ kind: "none" }));
  cache.set(region, { at: Date.now(), status });
  void status.then((s) => s.kind !== "ok" && cache.delete(region));
  return status;
}

export type Depth = {
  sell: Array<[number, number]>;
  sellTotal: number;
  buy: Array<[number, number, number]>;
  buyTotal: number;
  seen: number;
};

/** One item's depth in one market, or null when no player looked at it lately. */
export function depthAt(snap: DepthSnapshot | null, id: string, market: string): Depth | null {
  const at = snap ? snap.locations.indexOf(market) : -1;
  const cell = at < 0 ? 0 : (snap?.depth[id]?.[at] ?? 0);
  return cell ? { sell: cell[0], sellTotal: cell[1], buy: cell[2], buyTotal: cell[3], seen: cell[4] } : null;
}
