// Loading a guild page or killboard through the cache: a fresh enough copy shows at once, an older
// one shows at once and is replaced when the new answer arrives (see GuildPage). Entries are kept by
// guild id when it is known (two guilds can share a name), and by address for links without one.
import type { Region } from "@shared/types";
import { fetchGuild, fetchKillboard, type GuildPageData, type Killboard } from "../api";
import { forget, loadOnce, peek, remember } from "./cache";

/** Younger than this, a cached answer is not asked again. */
export const FRESH_MS = 60_000;
/** Older than this, a cached answer is not shown at all. */
export const MAX_AGE_MS = 15 * 60_000;

const byId = (region: Region, id: string) => `guild:${region}:id:${id}`;
const bySlug = (region: Region, slug: string) => `guild:${region}:slug:${slug}`;
const keyFor = (region: Region, slug: string, id: string | null) => (id ? byId(region, id) : bySlug(region, slug));
const killboardKey = (region: Region, id: string) => `killboard:${region}:${id}`;

/** A cached guild for this address, never one with another id than asked for. */
export function cachedGuild(region: Region, slug: string, id: string | null): { data: GuildPageData; fresh: boolean } | null {
  const hit = peek<GuildPageData>(keyFor(region, slug, id));
  if (!hit || hit.age >= MAX_AGE_MS || (id && hit.data.guild.id !== id)) return null;
  return { data: hit.data, fresh: hit.age < FRESH_MS };
}

/** `fresh`: skip every cache, right after marking or unmarking. */
export function loadGuild(region: Region, slug: string, id: string | null, fresh = false): Promise<GuildPageData> {
  const key = keyFor(region, slug, id);
  if (fresh) forget(key);
  return loadOnce(key, () => fetchGuild(region, slug, id, { fresh }), fresh).then((data) => {
    // also under its id and its own address, where a redirect or a later visit lands
    remember(byId(region, data.guild.id), data);
    remember(bySlug(region, data.guild.slug), data);
    return data;
  });
}

/** Starts loading a guild the visitor is about to open. */
export function prefetchGuild(region: Region, slug: string, id: string): void {
  if (cachedGuild(region, slug, id)?.fresh) return;
  loadGuild(region, slug, id).catch(() => undefined);
}

export function cachedKillboard(region: Region, id: string): Killboard | null {
  const hit = peek<Killboard>(killboardKey(region, id));
  return hit && hit.age < MAX_AGE_MS ? hit.data : null;
}

export const loadKillboard = (region: Region, id: string) => loadOnce(killboardKey(region, id), () => fetchKillboard(region, id));
