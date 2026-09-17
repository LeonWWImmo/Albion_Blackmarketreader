/**
 * Faction (city allegiance) theming.
 *
 * The crest a player picks as their account avatar *is* their faction, so the existing
 * avatar plumbing (localStorage "avatar", the "rk-profile-sync" BroadcastChannel and
 * Supabase user_metadata.avatar) doubles as the theme store — switching the crest in the
 * account panel switches the colours across every tool.
 */

export type FactionId =
  | "lymhurst"
  | "martlock"
  | "thetford"
  | "bridgewatch"
  | "fortsterling"
  | "caerleon";

export type Faction = {
  id: FactionId;
  /** City name as Albion spells it. */
  name: string;
  /** One line shown under the name in the picker. */
  tagline: string;
  /** Crest image, also the account avatar for this faction. */
  crest: string;
  accent: string;
  accentRgb: string;
  accent2: string;
  accent2Rgb: string;
};

export const FACTIONS: readonly Faction[] = [
  {
    id: "lymhurst",
    name: "Lymhurst",
    tagline: "Forest green",
    crest: "/picture/Lymhurstwappen.png",
    accent: "#5cf0c8",
    accentRgb: "92, 240, 200",
    accent2: "#7dd3ff",
    accent2Rgb: "125, 211, 255"
  },
  {
    id: "martlock",
    name: "Martlock",
    tagline: "Highland blue",
    crest: "/picture/Martlockwappen.png",
    accent: "#5ec7ff",
    accentRgb: "94, 199, 255",
    accent2: "#8fb4ff",
    accent2Rgb: "143, 180, 255"
  },
  {
    id: "thetford",
    name: "Thetford",
    tagline: "Arcane violet",
    crest: "/picture/Thefortwappen.png",
    accent: "#a77dff",
    accentRgb: "167, 125, 255",
    accent2: "#d08bff",
    accent2Rgb: "208, 139, 255"
  },
  {
    id: "bridgewatch",
    name: "Bridgewatch",
    tagline: "Desert amber",
    crest: "/picture/Bridgewatch.png",
    accent: "#ffab5c",
    accentRgb: "255, 171, 92",
    accent2: "#ffd28a",
    accent2Rgb: "255, 210, 138"
  },
  {
    id: "fortsterling",
    name: "Fort Sterling",
    tagline: "Frozen steel",
    crest: "/picture/Fortsterlingwappen.png",
    accent: "#cfe0f5",
    accentRgb: "207, 224, 245",
    accent2: "#8fa8c9",
    accent2Rgb: "143, 168, 201"
  },
  {
    // Caerleon is the outlaw city in the Mists, built over a volcanic scar — obsidian
    // with molten veins reads far better than the flat black it used to get.
    id: "caerleon",
    name: "Caerleon",
    tagline: "Molten obsidian",
    crest: "/picture/Carleon.png",
    accent: "#ff5a4f",
    accentRgb: "255, 90, 79",
    accent2: "#ffb057",
    accent2Rgb: "255, 176, 87"
  }
] as const;

const BY_CREST = new Map<string, Faction>(FACTIONS.map((f) => [f.crest.toLowerCase(), f]));
const BY_ID = new Map<FactionId, Faction>(FACTIONS.map((f) => [f.id, f]));

/** Avatar path -> faction, or null for the neutral account symbol / anything unknown. */
export function factionFromAvatar(avatar: string | null | undefined): Faction | null {
  if (!avatar) return null;
  const file = String(avatar).split("?")[0].split("/").pop();
  if (!file) return null;
  return BY_CREST.get(`/picture/${file}`.toLowerCase()) ?? null;
}

export function factionById(id: string | null | undefined): Faction | null {
  if (!id) return null;
  return BY_ID.get(id as FactionId) ?? null;
}
