// The browser side of /api/guild (api/_lib/guildApi.js): the same shapes, typed. Public answers
// (search, guild, killboard) are the same for everyone, so the CDN and the cache in core/cache.ts
// keep them; only mine / mark / unmark carry the player's token.
import type { Region } from "@shared/types";

export type GuildHit = { id: string; name: string; slug: string; allianceName: string | null; killFame: number; deathFame: number };
export type GuildRef = { id: string; region: Region; slug: string; name: string };
export type MemberStatus = "active" | "quiet" | "inactive" | "unknown";
/** Every kind of fame Albion counts, and their sum. */
export type Fame = { total: number; pve: number; pvp: number; gathering: number; crafting: number; fishing: number; farming: number; crystal: number };
export type FameKind = Exclude<keyof Fame, "total">;
/** Fame gained per kind; null for a kind an older snapshot did not record yet. */
export type FameGain = { total: number } & Record<FameKind, number | null>;

/** Where a member's lifetime fame came from (today's roster). */
export type MemberDetails = {
  pveZones: { royal: number; outlands: number; avalon: number; hellgate: number; corrupted: number; mists: number };
  resources: { fiber: number; hide: number; ore: number; rock: number; wood: number };
  killFame: number;
  deathFame: number;
};

export type ActivityMember = {
  id: string;
  name: string;
  status: MemberStatus;
  lastActive: string | null;
  lastFightAt: string | null;
  joinedOn: string | null;
  isNew: boolean;
  /** fame gained in 7 and 30 days; null without two snapshots */
  gains: Record<"7" | "30", FameGain | null>;
  /** lifetime fame */
  totals: Fame | null;
  main: FameKind | null;
  spark: (number | null)[];
  details: MemberDetails | null;
};

export type Activity = {
  /** days the gains cover so far, per period */
  coveredDays: Record<"7" | "30", number>;
  counts: Record<MemberStatus, number>;
  members: ActivityMember[];
  /** who left in the last 30 days */
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
  activity: Activity;
  fights: Fight[];
};

export type GearSlot = "MainHand" | "OffHand" | "Head" | "Armor" | "Shoes" | "Cape" | "Bag" | "Mount" | "Potion" | "Food";
/** An item with its market value (silver, for the whole stack; 0 when the market does not know it). */
export type PricedItem = { type: string; quality: number; count: number; value: number };
export type Fighter = {
  id: string;
  name: string;
  guildId: string | null;
  guildName: string | null;
  allianceName: string | null;
  itemPower: number;
  gear: Partial<Record<GearSlot, PricedItem>>;
  gearValue: number;
};
export type Helper = { name: string; guildName: string | null; itemPower: number; damage: number; heal: number };
export type KillEvent = {
  id: number;
  time: string;
  fame: number;
  participants: number;
  groupSize: number | null;
  area: string | null;
  battleId: number | null;
  killer: Fighter;
  victim: Fighter & { inventory: PricedItem[]; inventoryValue: number };
  helpers: Helper[];
  /** the helpers past the ten biggest, summed up */
  otherHelpers: { count: number; damage: number; heal: number } | null;
  /** silver the victim lost: gear and bag */
  value: number;
};
/** priced: values could load; pricesComplete: every item got a price lookup (very full boards may not). */
export type Killboard = { kills: KillEvent[]; deaths: KillEvent[]; priced: boolean; pricesComplete: boolean };

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
