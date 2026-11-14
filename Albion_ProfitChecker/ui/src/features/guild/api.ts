// The browser side of /api/guild (api/_lib/guildApi.js): the same shapes, typed. Public answers
// (search, guild, killboard) are the same for everyone, so the CDN and the cache in core/cache.ts
// keep them; only mine / mark / unmark carry the player's token.
import type { Region } from "@shared/types";

export type GuildHit = { id: string; name: string; slug: string; allianceName: string | null; killFame: number; deathFame: number };
export type GuildRef = { id: string; region: Region; slug: string; name: string };
export type MemberStatus = "active" | "quiet" | "inactive" | "unknown";
export type FameTotals = { pve: number; pvp: number; gathering: number; crafting: number };

export type ActivityMember = {
  id: string;
  name: string;
  status: MemberStatus;
  lastActive: string | null;
  lastFightAt: string | null;
  joinedOn: string | null;
  isNew: boolean;
  pve: number | null;
  pvp: number | null;
  gathering: number | null;
  crafting: number | null;
  lifetime: number | null;
  totals: FameTotals | null;
  spark: (number | null)[];
};

export type Activity = {
  periodDays: number;
  coveredDays: number;
  counts: Record<MemberStatus, number>;
  joined: number;
  members: ActivityMember[];
  left: { id: string; name: string; leftOn: string }[];
};

export type Fight = { id: number; startTime: string; players: number; fame: number; ours: number; kills: number; deaths: number };

export type GuildPageData = {
  guild: {
    id: string;
    region: Region;
    name: string;
    slug: string;
    allianceTag: string | null;
    foundedAt: string | null;
    killFame: number;
    deathFame: number;
    memberCount: number;
  };
  tracking: { tracked: boolean; since: string | null; lastSyncedAt: string | null; markedBy: number; canMark: boolean };
  activity: Record<"7" | "30", Activity>;
  fights: Fight[];
};

export type GearPiece = { type: string; quality: number };
export type Fighter = { id: string; name: string; guildId: string | null; guildName: string | null; allianceName: string | null; itemPower: number; gear: Partial<Record<GearSlot, GearPiece>> };
export type GearSlot = "MainHand" | "OffHand" | "Head" | "Armor" | "Shoes" | "Cape" | "Bag" | "Mount";
export type KillEvent = { id: number; time: string; fame: number; participants: number; battleId: number | null; killer: Fighter; victim: Fighter };
export type Killboard = { kills: KillEvent[]; deaths: KillEvent[] };

/** An answer the API gave with an error text, shown to the visitor as it is. */
export class GuildApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function call<T>(path: string, { token, method = "GET", body, signal }: { token?: string | null; method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api/guild/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new GuildApiError(data?.error ?? "Something went wrong. Try again in a minute.", res.status);
  return data;
}

/** "angry fuzzies" for "  Angry   Fuzzies ": the same request, cache entry and CDN copy however it is typed. */
export const normalizeQuery = (q: string) => q.trim().replace(/\s+/g, " ").toLowerCase();

export const searchGuilds = (region: Region, q: string, signal?: AbortSignal) =>
  call<{ guilds: GuildHit[] }>(`search?region=${region}&q=${encodeURIComponent(normalizeQuery(q))}`, { signal }).then((r) => r.guilds);

/** `fresh` skips the CDN copy, right after marking or unmarking. */
export const fetchGuild = (region: Region, slug: string, id: string | null, { signal, fresh = false }: { signal?: AbortSignal; fresh?: boolean } = {}) =>
  call<GuildPageData>(`guild?region=${region}&slug=${encodeURIComponent(slug)}${id ? `&id=${encodeURIComponent(id)}` : ""}${fresh ? `&t=${Date.now()}` : ""}`, { signal });

export const fetchKillboard = (region: Region, id: string, signal?: AbortSignal) => call<Killboard>(`killboard?region=${region}&id=${encodeURIComponent(id)}`, { signal });

export const fetchMyGuild = (token: string) => call<{ guild: GuildRef | null }>("mine", { token }).then((r) => r.guild);

export const markGuild = (token: string, region: Region, id: string) => call<{ guild: GuildRef }>("mark", { token, method: "POST", body: { region, id } }).then((r) => r.guild);

export const unmarkGuild = (token: string) => call<{ unmarked: boolean }>("unmark", { token, method: "POST", body: {} });

/** /guild/eu/angry-fuzzies, with the tab: /guild/eu/angry-fuzzies/activity */
export const guildPath = (ref: { region: Region; slug: string }, tab?: string) => `/guild/${ref.region}/${ref.slug}${tab && tab !== "overview" ? `/${tab}` : ""}`;

/** An item's picture from Albion's own image server (not our bandwidth), small enough for a list. */
export const itemIcon = (type: string, quality = 1, size = 64) =>
  `https://render.albiononline.com/v1/item/${encodeURIComponent(type)}.png?size=${size}${quality > 1 ? `&quality=${quality}` : ""}`;
