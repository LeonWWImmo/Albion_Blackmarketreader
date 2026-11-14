// The browser side of /api/guild (api/_lib/guildApi.js): the same shapes, typed.
import type { Region } from "@shared/types";

export type GuildHit = { id: string; name: string; slug: string; allianceName: string | null; killFame: number; deathFame: number };
export type GuildRef = { id: string; region: Region; slug: string; name: string };
export type MemberStatus = "active" | "quiet" | "inactive" | "unknown";

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
  tracking: { tracked: boolean; since: string | null; lastSyncedAt: string | null; managedByYou: boolean; managedByOther: boolean; canManage: boolean };
  activity: Record<"7" | "30", Activity>;
  fights: Fight[];
};

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

export const searchGuilds = (region: Region, q: string, signal?: AbortSignal) =>
  call<{ guilds: GuildHit[] }>(`search?region=${region}&q=${encodeURIComponent(q)}`, { signal }).then((r) => r.guilds);

export const fetchGuild = (region: Region, slug: string, id: string | null, token: string | null, signal?: AbortSignal) =>
  // `signed=1`: a signed-in answer has its own address, so a cached guest answer is never served for it
  call<GuildPageData>(`guild?region=${region}&slug=${encodeURIComponent(slug)}${id ? `&id=${encodeURIComponent(id)}` : ""}${token ? "&signed=1" : ""}`, { token, signal });

export const fetchMyGuild = (token: string) => call<{ guild: GuildRef | null }>("mine", { token }).then((r) => r.guild);

export const manageGuild = (token: string, region: Region, id: string) => call<{ guild: GuildRef }>("manage", { token, method: "POST", body: { region, id } }).then((r) => r.guild);

export const releaseGuild = (token: string) => call<{ released: boolean }>("release", { token, method: "POST", body: {} });

/** /guild/eu/angry-fuzzies, with the tab: /guild/eu/angry-fuzzies/activity */
export const guildPath = (ref: { region: Region; slug: string }, tab?: string) => `/guild/${ref.region}/${ref.slug}${tab && tab !== "overview" ? `/${tab}` : ""}`;
