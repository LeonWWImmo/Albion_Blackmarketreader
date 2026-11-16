// The browser side of /api/guild (api/_lib/guildApi.js): the same shapes, typed. Public answers
// (search, guild, killboard) are the same for everyone, so the CDN and the cache in core/cache.ts
// keep them; only mine / mark / unmark carry the player's token.
import type { Region } from "@shared/types";

/** killFame and deathFame are null when the guild's info did not load in time. */
export type GuildHit = { id: string; name: string; slug: string; allianceName: string | null; killFame: number | null; deathFame: number | null };
/** Albion's ranges: "week" since Monday, "month" since the 1st. */
export type TopRange = "week" | "month";
/** A guild's kill fame, kills and deaths summed over the period's ~100 biggest fights. */
export type TopGuild = { id: string; name: string; slug: string; allianceTag: string | null; killFame: number; kills: number; deaths: number; fights: number };
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

/** ours, kills, deaths: of the guild; enemy: the biggest other guild there ("[alliance] guild"), Albion does not say where it was. */
export type Fight = { id: number; startTime: string; players: number; fame: number; ours: number; kills: number; deaths: number; enemy?: string | null };

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

/** A side of a fight as Albion sums it, with how many of its players were there. */
export type BattleSide = { id: string; name: string; kills: number; deaths: number; killFame: number; players: number };
export type BattleGuild = BattleSide & { allianceName: string | null };
/** A player in a fight: Albion's kills, deaths and kill fame; damage to the players who died, assists and heal assists from the kills. */
export type BattlePlayer = {
  id: string;
  name: string;
  guildId: string | null;
  guildName: string | null;
  allianceId: string | null;
  allianceName: string | null;
  kills: number;
  deaths: number;
  killFame: number;
  damage: number;
  assists: number;
  healAssists: number;
  itemPower: number;
  weapon: { type: string; quality: number } | null;
};
/** complete: every kill of the fight could be read. */
export type BattleReport = {
  battle: { id: number; startTime: string; endTime: string; kills: number; fame: number; players: number };
  alliances: BattleSide[];
  guilds: BattleGuild[];
  players: BattlePlayer[];
  kills: KillEvent[];
  complete: boolean;
  priced: boolean;
  pricesComplete: boolean;
};
/** One of the guild's listed fights with who of the guild was there. */
export type AttendanceFight = {
  id: number;
  startTime: string;
  players: number;
  kills: number;
  fame: number;
  /** the biggest other guild there, "[alliance] guild" */
  enemy?: string | null;
  ours: { id: string; name: string; kills: number; deaths: number; killFame: number }[];
};
/** The signed-in player's Discord webhook: only its name, never its link. */
export type DiscordHook = { name: string; lastSentOn: string | null };

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

export const fetchTopGuilds = (region: Region, range: TopRange) => call<{ guilds: TopGuild[] }>(`top?region=${region}&range=${range}`).then((r) => r.guilds);

export const fetchKillboard = (region: Region, id: string, signal?: AbortSignal) => call<Killboard>(`killboard?region=${region}&id=${encodeURIComponent(id)}`, { signal });

export const fetchBattle = (region: Region, id: number | string, signal?: AbortSignal) => call<BattleReport>(`battle?region=${region}&id=${encodeURIComponent(String(id))}`, { signal });

/** The listed fights of the last `days`; complete: the days are covered and every page loaded. */
export const fetchFights = (region: Region, id: string, signal?: AbortSignal) =>
  call<{ fights: AttendanceFight[]; days: number; complete: boolean }>(`fights?region=${region}&id=${encodeURIComponent(id)}`, { signal });

export const fetchHook = (token: string) => call<{ hook: DiscordHook | null }>("hook", { token }).then((r) => r.hook);

export const saveHook = (token: string, url: string) => call<{ hook: DiscordHook }>("hook-save", { token, method: "POST", body: { url } }).then((r) => r.hook);

export const removeHook = (token: string) => call<{ removed: boolean }>("hook-remove", { token, method: "POST", body: {} });

export const fetchMyGuild = (token: string) => call<{ guild: GuildRef | null }>("mine", { token }).then((r) => r.guild);

export const markGuild = (token: string, region: Region, id: string) => call<{ guild: GuildRef }>("mark", { token, method: "POST", body: { region, id } }).then((r) => r.guild);

export const unmarkGuild = (token: string) => call<{ unmarked: boolean }>("unmark", { token, method: "POST", body: {} });

// The signed-in player's own data: private to their account.

/** The deaths of a fight this player ticked as paid (kill event ids). */
export const fetchRegearPaid = (token: string, region: Region, battle: number) => call<{ events: number[] }>(`regear-paid?region=${region}&battle=${battle}`, { token }).then((r) => r.events);

export const setRegearPaid = (token: string, region: Region, battle: number, event: number, paid: boolean) =>
  call<{ paid: boolean }>("regear-pay", { token, method: "POST", body: { region, battle, event, paid } });

/** A chest log row as stored: [time (null when unknown), player, item, enchant, quality, amount]. */
export type BankRow = [number | null, string, string, number, number, number];

export const fetchBankLog = (token: string, guild: string) => call<{ rows: BankRow[] }>(`bank?guild=${encodeURIComponent(guild)}`, { token }).then((r) => r.rows);

export const saveBankLog = (token: string, guild: string, rows: BankRow[]) => call<{ count: number }>("bank-save", { token, method: "POST", body: { guild, rows } });

/** A loot split as saved: the items priced when it was made, each player's silver and whether they got it. */
export type SplitData = {
  from: number | null;
  to: number | null;
  total: number;
  guildPct: number;
  guildCut: number;
  items: { name: string; enchant: number; quality: number; amount: number; unit: number }[];
  players: { name: string; share: number; silver: number; paid: boolean }[];
};
export type SavedSplit = { id: string; name: string; createdAt: string; updatedAt: string; data: SplitData };

export const fetchSplits = (token: string, guild: string) => call<{ splits: SavedSplit[] }>(`splits?guild=${encodeURIComponent(guild)}`, { token }).then((r) => r.splits);

export const saveSplit = (token: string, guild: string, split: { id?: string; name: string; data: SplitData }) =>
  call<{ split: SavedSplit }>("split-save", { token, method: "POST", body: { guild, ...split } }).then((r) => r.split);

export const removeSplit = (token: string, id: string) => call<{ removed: boolean }>("split-remove", { token, method: "POST", body: { id } });

/** /guild/eu/angry-fuzzies, with the tab: /guild/eu/angry-fuzzies/activity */
export const guildPath = (ref: { region: Region; slug: string }, tab?: string) => `/guild/${ref.region}/${ref.slug}${tab && tab !== "overview" ? `/${tab}` : ""}`;

/** A fight's report page; `guildId` reads it from that guild's side (its kills green, its deaths red). */
export const battlePath = (region: Region, id: number, guildId?: string) => `/guild/battle/${region}/${id}${guildId ? `?guild=${encodeURIComponent(guildId)}` : ""}`;

/** A fight's report inside the guild's Battles tab: read from that guild's side. */
export const fightPath = (ref: { region: Region; slug: string }, id: number) => `${guildPath(ref, "battles")}?fight=${id}`;

/** A guild's address from its name alone (the guild page moves on to its real one when they differ). */
export const slugOf = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** An item's picture from Albion's own image server (not our bandwidth), small enough for a list. */
export const itemIcon = (type: string, quality = 1, size = 64) =>
  `https://render.albiononline.com/v1/item/${encodeURIComponent(type)}.png?size=${size}${quality > 1 ? `&quality=${quality}` : ""}`;
