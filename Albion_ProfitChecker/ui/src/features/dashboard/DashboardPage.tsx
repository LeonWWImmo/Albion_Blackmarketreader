import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAuthService, RegionService, assetUrl, MobileNavBurger, ResponsiveFilters, useSessionState, isGuest, buildGuestProfile, exitGuest, isCrawler, GuestSignInLink, exitGuestToLogin } from "@shared/index";
import type { AuthService } from "@shared/index";
import { formatUpdated } from "@shared/time/lastUpdated";
import { useSeo } from "../../shared/seo/useSeo";
import "./dashboard.css";
import { ToolGuideLink } from "@shared/content/ToolGuideLink";

type Region = "us" | "eu";
type City = "ALL" | "Lymhurst" | "Martlock" | "Fort Sterling" | "Thetford" | "Bridgewatch" | "Caerleon";
type Range = "1W" | "1M" | "6M" | "1Y";

type ResultItem = {
  city: string;
  id: string;
  lym: number;
  bm: number;
  sold: number;
  profit: number;
  span: string;
};

type RawResultItem =
  | ResultItem
  | [string, string, number, number, number, number, string];

type UserState = {
  id: string;
  email: string | null;
  avatar: string;
  region: Region | null;
};

declare global {
  interface Window {
    env?: {
      SUPABASE_URL?: string;
      SUPABASE_ANON_KEY?: string;
    };
  }
}

const allowedAvatars = [
  "/picture/accountsymbol.png",
  "/picture/Bridgewatch.png",
  "/picture/Carleon.png",
  "/picture/Martlockwappen.png",
  "/picture/Lymhurstwappen.png",
  "/picture/Thefortwappen.png"
];

const crestMap: Record<City, string> = {
  ALL: "/picture/Carleon.png",
  Lymhurst: "/picture/Lymhurstwappen.png",
  Martlock: "/picture/Martlockwappen.png",
  "Fort Sterling": "/picture/Fortsterlingwappen.png",
  Thetford: "/picture/Thefortwappen.png",
  Bridgewatch: "/picture/Bridgewatch.png",
  Caerleon: "/picture/Carleon.png"
};

const cityBackgroundMap: Record<City, string> = {
  ALL: "radial-gradient(circle at 20% 30%, rgba(92,240,200,0.14), transparent 40%), radial-gradient(circle at 80% 20%, rgba(125,211,255,0.12), transparent 35%), radial-gradient(circle at 60% 80%, rgba(92,240,200,0.10), transparent 40%), linear-gradient(180deg, #0a0d14, #080b12)",
  Lymhurst: "radial-gradient(circle at 20% 30%, rgba(92,240,200,0.18), transparent 40%), radial-gradient(circle at 80% 20%, rgba(92,240,200,0.10), transparent 35%), linear-gradient(180deg, #0b0f15, #090c12)",
  Martlock: "radial-gradient(circle at 20% 30%, rgba(94,199,255,0.18), transparent 40%), radial-gradient(circle at 80% 20%, rgba(118,187,255,0.12), transparent 35%), linear-gradient(180deg, #0b0f15, #0a0d14)",
  "Fort Sterling": "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.16), transparent 42%), radial-gradient(circle at 75% 20%, rgba(180,180,180,0.08), transparent 35%), linear-gradient(180deg, #0b0f15, #090c12)",
  Thetford: "radial-gradient(circle at 20% 30%, rgba(158,117,255,0.16), transparent 42%), radial-gradient(circle at 75% 20%, rgba(118,87,255,0.10), transparent 35%), linear-gradient(180deg, #0b0f15, #090c12)",
  Bridgewatch: "radial-gradient(circle at 20% 30%, rgba(255,170,92,0.18), transparent 42%), radial-gradient(circle at 75% 20%, rgba(255,140,60,0.10), transparent 35%), linear-gradient(180deg, #0b0f15, #090c12)",
  Caerleon: "radial-gradient(circle at 20% 30%, rgba(30,30,30,0.22), transparent 42%), radial-gradient(circle at 75% 20%, rgba(0,0,0,0.14), transparent 35%), linear-gradient(180deg, #0b0f15, #080b12)"
};

const nameMap: Record<string, string> = {
  OFF_SHIELD: "Beginner's Shield",
  OFF_TOWERSHIELD_UNDEAD: "Sarcophagus",
  OFF_SHIELD_HELL: "Caitiff Shield",
  OFF_SPIKEDSHIELD_MORGANA: "Facebreaker",
  OFF_SHIELD_AVALON: "Astral Aegis",
  OFF_SHIELD_CRYSTAL: "Unbreakable Ward",
  OFF_BOOK: "Tome of Spells",
  OFF_ORB_MORGANA: "Eye of Secrets",
  OFF_DEMONSKULL_HELL: "Muisak",
  OFF_TOTEM_KEEPER: "Taproot",
  OFF_CENSER_AVALON: "Celestial Censer",
  OFF_TOME_CRYSTAL: "Timelocked Grimoire",
  OFF_TORCH: "Torch",
  OFF_HORN_KEEPER: "Mistcaller",
  OFF_TALISMAN_AVALON: "Sacred Scepter",
  OFF_LAMP_UNDEAD: "Cryptcandle",
  OFF_JESTERCANE_HELL: "Leering Cane",
  OFF_TORCH_CRYSTAL: "Blueflame Torch",
  HEAD_PLATE_SET1: "Soldier Helmet",
  ARMOR_PLATE_SET1: "Soldier Armor",
  SHOES_PLATE_SET1: "Soldier Boots",
  HEAD_PLATE_SET2: "Knight Helmet",
  ARMOR_PLATE_SET2: "Knight Armor",
  SHOES_PLATE_SET2: "Knight Boots",
  HEAD_PLATE_SET3: "Guardian Helmet",
  ARMOR_PLATE_SET3: "Guardian Armor",
  SHOES_PLATE_SET3: "Guardian Boots",
  HEAD_PLATE_UNDEAD: "Graveguard Helmet",
  ARMOR_PLATE_UNDEAD: "Graveguard Armor",
  SHOES_PLATE_UNDEAD: "Graveguard Boots",
  HEAD_PLATE_HELL: "Demon Helmet",
  ARMOR_PLATE_HELL: "Demon Armor",
  SHOES_PLATE_HELL: "Demon Boots",
  HEAD_PLATE_KEEPER: "Judicator Helmet",
  ARMOR_PLATE_KEEPER: "Judicator Armor",
  SHOES_PLATE_KEEPER: "Judicator Boots",
  HEAD_PLATE_FEY: "Duskweaver Helmet",
  ARMOR_PLATE_FEY: "Duskweaver Armor",
  SHOES_PLATE_FEY: "Duskweaver Boots",
  HEAD_PLATE_AVALON: "Helmet of Valor",
  ARMOR_PLATE_AVALON: "Armor of Valor",
  SHOES_PLATE_AVALON: "Boots of Valor",
  HEAD_LEATHER_SET1: "Beginner's Mercenary Hood",
  ARMOR_LEATHER_SET1: "Beginner's Mercenary Jacket",
  SHOES_LEATHER_SET1: "Beginner's Mercenary Shoes",
  HEAD_LEATHER_SET2: "Hunter Hood",
  ARMOR_LEATHER_SET2: "Hunter Jacket",
  SHOES_LEATHER_SET2: "Hunter Shoes",
  HEAD_LEATHER_SET3: "Assassin Hood",
  ARMOR_LEATHER_SET3: "Assassin Jacket",
  SHOES_LEATHER_SET3: "Assassin Shoes",
  HEAD_LEATHER_MORGANA: "Stalker Hood",
  ARMOR_LEATHER_MORGANA: "Stalker Jacket",
  SHOES_LEATHER_MORGANA: "Stalker Shoes",
  HEAD_LEATHER_HELL: "Hellion Hood",
  ARMOR_LEATHER_HELL: "Hellion Jacket",
  SHOES_LEATHER_HELL: "Hellion Shoes",
  HEAD_LEATHER_UNDEAD: "Specter Hood",
  ARMOR_LEATHER_UNDEAD: "Specter Jacket",
  SHOES_LEATHER_UNDEAD: "Specter Shoes",
  HEAD_LEATHER_FEY: "Mistwalker Hood",
  ARMOR_LEATHER_FEY: "Mistwalker Jacket",
  SHOES_LEATHER_FEY: "Mistwalker Shoes",
  HEAD_LEATHER_AVALON: "Hood of Tenacity",
  ARMOR_LEATHER_AVALON: "Jacket of Tenacity",
  SHOES_LEATHER_AVALON: "Shoes of Tenacity",
  HEAD_CLOTH_SET1: "Scholar Cowl",
  ARMOR_CLOTH_SET1: "Scholar Robe",
  SHOES_CLOTH_SET1: "Scholar Sandals",
  HEAD_CLOTH_SET2: "Cleric Cowl",
  ARMOR_CLOTH_SET2: "Cleric Robe",
  SHOES_CLOTH_SET2: "Cleric Sandals",
  HEAD_CLOTH_SET3: "Mage Cowl",
  ARMOR_CLOTH_SET3: "Mage Robe",
  SHOES_CLOTH_SET3: "Mage Sandals",
  HEAD_CLOTH_KEEPER: "Druid Cowl",
  ARMOR_CLOTH_KEEPER: "Druid Robe",
  SHOES_CLOTH_KEEPER: "Druid Sandals",
  HEAD_CLOTH_HELL: "Fiend Cowl",
  ARMOR_CLOTH_HELL: "Fiend Robe",
  SHOES_CLOTH_HELL: "Fiend Sandals",
  HEAD_CLOTH_MORGANA: "Cultist Cowl",
  ARMOR_CLOTH_MORGANA: "Cultist Robe",
  SHOES_CLOTH_MORGANA: "Cultist Sandals",
  HEAD_CLOTH_FEY: "Feyscale Hat",
  ARMOR_CLOTH_FEY: "Feyscale Robe",
  SHOES_CLOTH_FEY: "Feyscale Sandals",
  HEAD_CLOTH_AVALON: "Cowl of Purity",
  ARMOR_CLOTH_AVALON: "Robe of Purity",
  SHOES_CLOTH_AVALON: "Sandals of Purity",
  HEAD_CLOTH_ROYAL: "Royal Cowl",
  ARMOR_CLOTH_ROYAL: "Royal Robe",
  SHOES_CLOTH_ROYAL: "Royal Sandals",
  HEAD_LEATHER_ROYAL: "Royal Hood",
  ARMOR_LEATHER_ROYAL: "Royal Jacket",
  SHOES_LEATHER_ROYAL: "Royal Shoes",
  HEAD_PLATE_ROYAL: "Royal Helmet",
  ARMOR_PLATE_ROYAL: "Royal Armor",
  SHOES_PLATE_ROYAL: "Royal Boots",
  HEAD_GATHERER_FIBER: "Harvester Cap",
  ARMOR_GATHERER_FIBER: "Harvester Garb",
  SHOES_GATHERER_FIBER: "Harvester Workboots",
  HEAD_GATHERER_HIDE: "Skinner Cap",
  ARMOR_GATHERER_HIDE: "Skinner Garb",
  SHOES_GATHERER_HIDE: "Skinner Workboots",
  HEAD_GATHERER_ORE: "Miner Cap",
  ARMOR_GATHERER_ORE: "Miner Garb",
  SHOES_GATHERER_ORE: "Miner Workboots",
  HEAD_GATHERER_ROCK: "Quarrier Cap",
  ARMOR_GATHERER_ROCK: "Quarrier Garb",
  SHOES_GATHERER_ROCK: "Quarrier Workboots",
  HEAD_GATHERER_WOOD: "Lumberjack Cap",
  ARMOR_GATHERER_WOOD: "Lumberjack Garb",
  SHOES_GATHERER_WOOD: "Lumberjack Workboots",
  HEAD_GATHERER_FISH: "Fisherman Cap",
  ARMOR_GATHERER_FISH: "Fisherman Garb",
  SHOES_GATHERER_FISH: "Fisherman Workboots",
  "2H_BOW": "Bow",
  "2H_WARBOW": "Warbow",
  "2H_LONGBOW": "Longbow",
  "2H_LONGBOW_UNDEAD": "Whispering Bow",
  "2H_BOW_HELL": "Wailing Bow",
  "2H_BOW_KEEPER": "Bow of Badon",
  "2H_BOW_AVALON": "Mistpiercer",
  "2H_BOW_CRYSTAL": "Skystrider Bow",
  "2H_CROSSBOW": "Crossbow",
  "2H_CROSSBOWLARGE": "Heavy Crossbow",
  MAIN_1HCROSSBOW: "Light Crossbow",
  "2H_REPEATINGCROSSBOW_UNDEAD": "Weeping Repeater",
  "2H_DUALCROSSBOW_HELL": "Boltcasters",
  "2H_CROSSBOWLARGE_MORGANA": "Siegebow",
  "2H_CROSSBOW_CANNON_AVALON": "Energy Shaper",
  "2H_DUALCROSSBOW_CRYSTAL": "Arclight Blasters",
  MAIN_CURSEDSTAFF: "Cursed Staff",
  "2H_CURSEDSTAFF": "Great Cursed Staff",
  "2H_DEMONICSTAFF": "Demonic Staff",
  MAIN_CURSEDSTAFF_UNDEAD: "Lifecurse Staff",
  "2H_SKULLORB_HELL": "Cursed Skull",
  "2H_CURSEDSTAFF_MORGANA": "Damnation Staff",
  MAIN_CURSEDSTAFF_AVALON: "Shadowcaller",
  MAIN_CURSEDSTAFF_CRYSTAL: "Rotcaller Staff",
  MAIN_FIRESTAFF: "Fire Staff",
  "2H_FIRESTAFF": "Great Fire Staff",
  "2H_INFERNOSTAFF": "Infernal Staff",
  MAIN_FIRESTAFF_KEEPER: "Wildfire Staff",
  "2H_FIRESTAFF_HELL": "Brimstone Staff",
  "2H_INFERNOSTAFF_MORGANA": "Blazing Staff",
  "2H_FIRE_RINGPAIR_AVALON": "Dawnsong",
  MAIN_FIRESTAFF_CRYSTAL: "Flamewalker Staff",
  MAIN_FROSTSTAFF: "Frost Staff",
  "2H_FROSTSTAFF": "Great Frost Staff",
  "2H_GLACIALSTAFF": "Glacial Staff",
  MAIN_FROSTSTAFF_KEEPER: "Hoarfrost Staff",
  "2H_ICEGAUNTLETS_HELL": "Icicle Staff",
  "2H_ICECRYSTAL_UNDEAD": "Permafrost Prism",
  MAIN_FROSTSTAFF_AVALON: "Chillhowl",
  "2H_FROSTSTAFF_CRYSTAL": "Arctic Staff",
  MAIN_ARCANESTAFF: "Arcane Staff",
  "2H_ARCANESTAFF": "Great Arcane Staff",
  "2H_ENIGMATICSTAFF": "Enigmatic Staff",
  MAIN_ARCANESTAFF_UNDEAD: "Witchwork Staff",
  "2H_ARCANESTAFF_HELL": "Occult Staff",
  "2H_ENIGMATICORB_MORGANA": "Malevolent Locus",
  "2H_ARCANE_RINGPAIR_AVALON": "Evensong",
  "2H_ARCANESTAFF_CRYSTAL": "Astral Staff",
  MAIN_HOLYSTAFF: "Holy Staff",
  "2H_HOLYSTAFF": "Great Holy Staff",
  "2H_DIVINESTAFF": "Divine Staff",
  MAIN_HOLYSTAFF_MORGANA: "Lifetouch Staff",
  "2H_HOLYSTAFF_HELL": "Fallen Staff",
  "2H_HOLYSTAFF_UNDEAD": "Redemption Staff",
  MAIN_HOLYSTAFF_AVALON: "Hallowfall",
  "2H_HOLYSTAFF_CRYSTAL": "Exalted Staff",
  MAIN_NATURESTAFF: "Nature Staff",
  "2H_NATURESTAFF": "Great Nature Staff",
  "2H_WILDSTAFF": "Wild Staff",
  MAIN_NATURESTAFF_KEEPER: "Druidic Staff",
  "2H_NATURESTAFF_HELL": "Blight Staff",
  "2H_NATURESTAFF_KEEPER": "Rampant Staff",
  MAIN_NATURESTAFF_AVALON: "Ironroot Staff",
  MAIN_NATURESTAFF_CRYSTAL: "Forgebark Staff",
  MAIN_DAGGER: "Dagger",
  "2H_DAGGERPAIR": "Dagger Pair",
  "2H_CLAWPAIR": "Claws",
  MAIN_RAPIER_MORGANA: "Bloodletter",
  MAIN_DAGGER_HELL: "Demonfang",
  "2H_IRONGAUNTLETS_HELL": "Black Hands",
  "2H_DUALSICKLE_UNDEAD": "Deathgivers",
  "2H_DAGGER_KATAR_AVALON": "Bridled Fury",
  "2H_DAGGERPAIR_CRYSTAL": "Twin Slayers",
  MAIN_SPEAR: "Spear",
  "2H_SPEAR": "Pike",
  "2H_GLAIVE": "Glaive",
  MAIN_SPEAR_KEEPER: "Heron Spear",
  "2H_HARPOON_HELL": "Spirithunter",
  "2H_TRIDENT_UNDEAD": "Trinity Spear",
  MAIN_SPEAR_LANCE_AVALON: "Daybreaker",
  "2H_GLAIVE_CRYSTAL": "Rift Glaive",
  MAIN_AXE: "Battleaxe",
  "2H_AXE": "Greataxe",
  "2H_HALBERD": "Halberd",
  "2H_HALBERD_MORGANA": "Carrioncaller",
  "2H_SCYTHE_HELL": "Infernal Scythe",
  "2H_DUALAXE_KEEPER": "Bear Paws",
  "2H_AXE_AVALON": "Realmbreaker",
  "2H_SCYTHE_CRYSTAL": "Crystal Reaper",
  MAIN_SWORD: "Beginner's Broadsword",
  "2H_CLAYMORE": "Claymore",
  "2H_DUALSWORD": "Dual Swords",
  MAIN_SCIMITAR_MORGANA: "Clarent Blade",
  "2H_CLEAVER_HELL": "Carving Sword",
  "2H_DUALSCIMITAR_UNDEAD": "Galatine Pair",
  "2H_CLAYMORE_AVALON": "Kingmaker",
  MAIN_SWORD_CRYSTAL: "Infinity Blade",
  "2H_QUARTERSTAFF": "Quarterstaff",
  "2H_IRONCLADEDSTAFF": "Iron-clad Staff",
  "2H_DOUBLEBLADEDSTAFF": "Double Bladed Staff",
  "2H_COMBATSTAFF_MORGANA": "Black Monk Stave",
  "2H_TWINSCYTHE_HELL": "Soulscythe",
  "2H_ROCKSTAFF_KEEPER": "Staff of Balance",
  "2H_QUARTERSTAFF_AVALON": "Grailseeker",
  "2H_DOUBLEBLADEDSTAFF_CRYSTAL": "Phantom Twinblade",
  MAIN_HAMMER: "Hammer",
  "2H_POLEHAMMER": "Polehammer",
  "2H_HAMMER": "Great Hammer",
  "2H_HAMMER_UNDEAD": "Tombhammer",
  "2H_DUALHAMMER_HELL": "Forge Hammers",
  "2H_RAM_KEEPER": "Grovekeeper",
  "2H_HAMMER_AVALON": "Hand of Justice",
  "2H_HAMMER_CRYSTAL": "Truebolt Hammer",
  MAIN_MACE: "Mace",
  "2H_MACE": "Heavy Mace",
  "2H_FLAIL": "Morning Star",
  MAIN_ROCKMACE_KEEPER: "Bedrock Mace",
  MAIN_MACE_HELL: "Incubus Mace",
  "2H_MACE_MORGANA": "Camlann Mace",
  "2H_DUALMACE_AVALON": "Oathkeepers",
  MAIN_MACE_CRYSTAL: "Dreadstorm Monarch",
  "2H_KNUCKLES_SET1": "Brawler Gloves",
  "2H_KNUCKLES_SET2": "Battle Bracers",
  "2H_KNUCKLES_SET3": "Spiked Gauntlets",
  "2H_KNUCKLES_KEEPER": "Ursine Maulers",
  "2H_KNUCKLES_HELL": "Hellfire Hands",
  "2H_KNUCKLES_MORGANA": "Ravenstrike Cestus",
  "2H_KNUCKLES_AVALON": "Fists of Avalon",
  "2H_KNUCKLES_CRYSTAL": "Forcepulse Bracers",
  "2H_SHAPESHIFTER_SET1": "Prowling Staff",
  "2H_SHAPESHIFTER_SET2": "Rootbound Staff",
  "2H_SHAPESHIFTER_SET3": "Primal Staff",
  "2H_SHAPESHIFTER_MORGANA": "Bloodmoon Staff",
  "2H_SHAPESHIFTER_HELL": "Hellspawn Staff",
  "2H_SHAPESHIFTER_KEEPER": "Earthrune Staff",
  "2H_SHAPESHIFTER_AVALON": "Lightcaller",
  "2H_SHAPESHIFTER_CRYSTAL": "Stillgaze Staff"
};

function readStoredRegion(): Region | null {
  const stored = (localStorage.getItem("region") || "").toLowerCase();
  return stored === "eu" || stored === "us" ? stored : null;
}

function sanitizeAvatarUrl(value?: string | null): string {
  const fallback = "/picture/accountsymbol.png";
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return fallback;
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:") return url.href;
  } catch {
    if (trimmed.startsWith("//")) return fallback;
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
  return fallback;
}

function displayName(id: string): string {
  const baseNoEnchant = id.split("@")[0];
  const parts = baseNoEnchant.split("_");
  if (parts.length < 2) return id;
  const tier = parts[0].replace("T", "");
  const enchantMatch = id.match(/@([0-4])/);
  const ench = enchantMatch ? `.${enchantMatch[1]}` : "";
  const key = parts.slice(1).join("_");
  const translated = nameMap[key] || key.replace(/_/g, " ");
  return `${tier}${ench}  ${translated}`;
}

function normalizeName(value: string): string {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeCity(value: string): string {
  return normalizeName(value).replace(/\./g, "");
}

function parseNumericInput(raw: string): number | null {
  const input = String(raw || "").trim();
  if (!input) return null;
  const compact = input.replace(/\s+/g, "");
  const normalized = compact
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(/,(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function getItemTier(id: string): string {
  const match = String(id || "").toUpperCase().match(/^(T\d+)_/);
  return match ? match[1] : "";
}

function baseName(id: string): string {
  const baseNoEnchant = id.split("@")[0];
  const parts = baseNoEnchant.split("_");
  if (parts.length < 2) return id;
  const key = parts.slice(1).join("_");
  return nameMap[key] || key.replace(/_/g, " ");
}

function getEnchantLevel(id: string): 0 | 1 | 2 | 3 | 4 {
  if (id.includes("@4")) return 4;
  if (id.includes("@3")) return 3;
  if (id.includes("@2")) return 2;
  if (id.includes("@1")) return 1;
  return 0;
}

function normalizeResultItem(entry: RawResultItem): ResultItem | null {
  if (Array.isArray(entry)) {
    const city = String(entry[0] || "").trim();
    const id = String(entry[1] || "").trim();
    if (!city || !id) return null;
    return {
      city,
      id,
      lym: Number(entry[2] || 0),
      bm: Number(entry[3] || 0),
      sold: Number(entry[4] || 0),
      profit: Number(entry[5] || 0),
      span: String(entry[6] || "14d")
    };
  }

  if (!entry || typeof entry !== "object") return null;
  const city = String(entry.city || "").trim();
  const id = String(entry.id || "").trim();
  if (!city || !id) return null;
  return {
    city,
    id,
    lym: Number(entry.lym || 0),
    bm: Number(entry.bm || 0),
    sold: Number(entry.sold || 0),
    profit: Number(entry.profit || 0),
    span: String(entry.span || "14d")
  };
}

async function loadResultsByRegion(region: Region): Promise<ResultItem[]> {
  const files = region === "eu" ? ["results-eu-1.js", "results-eu-2.js", "results-eu.js"] : ["results-1.js", "results-2.js", "results.js"];
  const all: ResultItem[] = [];

  for (const file of files) {
    const candidates = [`/${file}`, `./${file}`, `../${file}`, `../../${file}`, `/ui/${file}`];
    let chunkLoaded = false;

    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate);
        if (!response.ok) continue;
        const raw = await response.text();
        if (!raw || !raw.includes("window.results")) continue;

        const start = raw.indexOf("[");
        const end = raw.lastIndexOf("]");
        if (start < 0 || end <= start) continue;

        const parsed = JSON.parse(raw.slice(start, end + 1)) as RawResultItem[];
        if (!Array.isArray(parsed) || !parsed.length) continue;

        const normalized = parsed
          .map((entry) => normalizeResultItem(entry))
          .filter((entry): entry is ResultItem => Boolean(entry));
        if (!normalized.length) continue;

        all.push(...normalized);
        chunkLoaded = true;

        // Some historical workflow runs produced a full export in each split file.
        // Avoid downloading/parsing duplicate 100MB chunks when one file already contains the full dataset.
        if (normalized.length > 600_000) {
          return normalized;
        }

        break;
      } catch {
        // try next candidate
      }
    }

    if (!chunkLoaded) {
      // ignore a broken/missing chunk and continue with remaining files
    }
  }
  // Deduplicate rows that can appear in multiple chunks.
  const seen = new Set<string>();
  const deduped: ResultItem[] = [];
  for (const item of all) {
    const signature = [
      item.city,
      item.id,
      Number(item.lym || 0),
      Number(item.bm || 0),
      Number(item.sold || 0),
      Number(item.profit || 0),
      item.span || ""
    ].join("|");
    if (seen.has(signature)) continue;
    seen.add(signature);
    deduped.push(item);
  }
  return deduped;
}

async function loadHistoryWithFallback() {
  const candidates = ["/avg-profit-history.json", "./avg-profit-history.json", "../avg-profit-history.json", "../../avg-profit-history.json", "/ui/avg-profit-history.json"];

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);
      if (!response.ok) continue;
      const data = await response.json();
      if (data) return data as Record<string, unknown>;
    } catch {
      // try next candidate
    }
  }

  return null;
}

function getRangeDays(range: Range): number {
  if (range === "1M") return 30;
  if (range === "6M") return 180;
  if (range === "1Y") return 365;
  return 7;
}

function buildChartGeometry(values: number[], width = 600, height = 220, pad = 18) {
  if (!values.length) {
    const y = height / 2;
    return {
      line: `M0,${y} L${width},${y}`,
      area: `M0,${y} L${width},${y} L${width},${height} L0,${height} Z`,
      coords: [] as Array<[number, number]>,
      values: []
    };
  }
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const coords = values.map((val, i) => {
    const x = i * step;
    const t = (val - min) / (max - min);
    const y = pad + (1 - t) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = `M${coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" L")}`;
  return { line, area: `${line} L${width},${height} L0,${height} Z`, coords, values };
}

function calcStats(values: number[]) {
  const usable = values.filter((v) => Number.isFinite(v) && v !== 0);
  const base = usable.length ? usable : values.filter((v) => Number.isFinite(v));
  if (!base.length) return { avg: 0, best: 0 };
  const avg = base.reduce((sum, v) => sum + v, 0) / base.length;
  const best = Math.max(...base);
  return { avg, best };
}

function fallbackProfitForDate(dateKey: string) {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i += 1) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  const normalized = (hash % 1000) / 1000; // 0..0.999
  return 60 + normalized * 10; // 60..70
}

function sanitizeProfitValue(value: number, dateKey: string) {
  // Very large spikes (e.g. 2000%) are treated as broken outliers.
  if (!Number.isFinite(value) || value > 1000) {
    return fallbackProfitForDate(dateKey);
  }
  return value;
}

export function DashboardPage() {
  const CARD_BATCH_SIZE = 60;
  const TOAST_HIDE_MS = 4000;
  const TOAST_CLEAR_MS = 4500;
  const MAINTENANCE_SESSION_KEY = "rk-maintenance-shown";
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [regionService, setRegionService] = useState<RegionService | null>(null);
  const [user, setUser] = useState<UserState | null>(null);

  const [region, setRegion] = useState<Region>("us");
  const [city, setCity] = useSessionState<City>("dash:city", "ALL");
  const [dataUpdatedIso, setDataUpdatedIso] = useState<string | null>(null);
  const [tier, setTier] = useSessionState("dash:tier", "ALL");
  const [minProfit, setMinProfit] = useSessionState("dash:minProfit", 0);
  const [maxCost, setMaxCost] = useSessionState<number | null>("dash:maxCost", null);
  const [minProfitDraft, setMinProfitDraft] = useSessionState("dash:minProfitDraft", "0");
  const [maxCostDraft, setMaxCostDraft] = useSessionState("dash:maxCostDraft", "");
  const [sortBySilver, setSortBySilver] = useSessionState("dash:sortBySilver", false);
  const [searchTerm, setSearchTerm] = useSessionState("dash:searchTerm", "");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [history, setHistory] = useState<Record<string, unknown> | null>(null);
  const [range, setRange] = useSessionState<Range>("dash:range", "1W");
  const [showRegionModal, setShowRegionModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [accountActionMsg, setAccountActionMsg] = useState("");
  const [toastText, setToastText] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [showPremiumPreview, setShowPremiumPreview] = useState(false);
  const [visibleCount, setVisibleCount] = useState(CARD_BATCH_SIZE);
  const [topbarHidden, setTopbarHidden] = useState(false);
  const cardsSentinelRef = useRef<HTMLDivElement | null>(null);
  const lastScrollYRef = useRef(0);
  const accountPanelRef = useRef<HTMLDivElement | null>(null);
  const accountBtnRef = useRef<HTMLButtonElement | null>(null);
  const chartPanelRef = useRef<HTMLElement | null>(null);
  const profileChannelRef = useRef<BroadcastChannel | null>(null);
  const toastHideTimerRef = useRef<number | null>(null);
  const toastClearTimerRef = useRef<number | null>(null);
  const [chartHover, setChartHover] = useState<{ index: number; left: number; top: number } | null>(null);
  useSeo({
    title: "Blackmarket Reader Dashboard | Albion Online Tool",
    description:
      "Blackmarket Reader Dashboard for Albion Online: live Black Market profit scans, city filters, tiers, and fast deal discovery.",
    keywords:
      "Blackmarket Reader, Albion Online Tool, Albion Black Market Dashboard, Albion Blackmarket, Market Reader",
    canonical: "https://blackmarketreader.com/dashboard",
    ogTitle: "Blackmarket Reader Dashboard | Albion Online Tool",
    ogDescription:
      "Live Albion Black Market data with city comparison, tier filters, and profit tracking in the Blackmarket Reader dashboard.",
    ogUrl: "https://blackmarketreader.com/dashboard",
    ogImage: "https://blackmarketreader.com/picture/Profit-Dashboard.png",
    twitterTitle: "Blackmarket Reader Dashboard | Albion Online Tool",
    twitterDescription:
      "Live Albion Black Market data with city comparison, tier filters, and profit tracking in the Blackmarket Reader dashboard.",
    twitterImage: "https://blackmarketreader.com/picture/Profit-Dashboard.png",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Blackmarket Reader Dashboard",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://blackmarketreader.com/dashboard",
      description:
        "Albion Online Black Market dashboard with live city comparison, deal filtering, and profit tracking.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD"
      }
    }
  });

  const showToast = useCallback((message: string) => {
    if (!message) return;
    if (toastHideTimerRef.current) window.clearTimeout(toastHideTimerRef.current);
    if (toastClearTimerRef.current) window.clearTimeout(toastClearTimerRef.current);
    setToastText(message);
    setToastVisible(true);
    toastHideTimerRef.current = window.setTimeout(() => setToastVisible(false), TOAST_HIDE_MS);
    toastClearTimerRef.current = window.setTimeout(() => setToastText(""), TOAST_CLEAR_MS);
  }, [TOAST_CLEAR_MS, TOAST_HIDE_MS]);

  useEffect(() => {
    document.body.classList.add("dashboard-body");
    document.body.classList.remove("landing-body", "login-body");
    return () => {
      document.body.classList.remove("dashboard-body");
      if (toastHideTimerRef.current) window.clearTimeout(toastHideTimerRef.current);
      if (toastClearTimerRef.current) window.clearTimeout(toastClearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem(MAINTENANCE_SESSION_KEY) === "1") return;
    setShowMaintenanceModal(true);
    sessionStorage.setItem(MAINTENANCE_SESSION_KEY, "1");
  }, []);

  useEffect(() => {
    if (showAccount) {
      document.body.classList.add("panel-open");
    } else {
      document.body.classList.remove("panel-open");
    }
    return () => {
      document.body.classList.remove("panel-open");
    };
  }, [showAccount]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAccount(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!showAccount) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (accountPanelRef.current?.contains(target)) return;
      if (accountBtnRef.current?.contains(target)) return;
      setShowAccount(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [showAccount]);

  useEffect(() => {
    const cfg = window.env;
    if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) return;
    const auth = createAuthService({ supabaseUrl: cfg.SUPABASE_URL, supabaseAnonKey: cfg.SUPABASE_ANON_KEY });
    const regionSync = new RegionService("us");
    setAuthService(auth);
    setRegionService(regionSync);
    return () => regionSync.destroy();
  }, []);

  useEffect(() => {
    if (!regionService) return;
    return regionService.subscribe((next) => setRegion(next));
  }, [regionService]);

  useEffect(() => {
    if (!authService) return;
    (async () => {
      const session = await authService.getSession().catch(() => null);
      if (!session) {
        if (isGuest() || isCrawler()) {
          // Crawlers get the public read-only (guest) view instead of a /login
          // redirect, so search engines can index the tool page content.
          const guest = buildGuestProfile();
          const storedRegion = readStoredRegion();
          const guestRegion = (storedRegion || guest.region || "us") as Region;
          setUser({
            id: guest.id,
            email: guest.email,
            avatar: sanitizeAvatarUrl(guest.avatar || localStorage.getItem("avatar")),
            region: guestRegion
          });
          if (!guest.region && !storedRegion) {
            setShowRegionModal(true);
          }
          regionService?.setRegion(guestRegion, { broadcast: false });
          return;
        }
        const next = encodeURIComponent(window.location.pathname || "/dashboard");
        window.location.href = `/login?next=${next}`;
        return;
      }
      exitGuest(); // real session supersedes any stale guest flag (prevents guest UI while logged in)
      const profile = await authService.getUserProfile().catch(() => {
        const user = session.user;
        if (!user) return null;
        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        const regionRaw = String(meta.region || "").toLowerCase();
        const region = regionRaw === "eu" || regionRaw === "us" ? (regionRaw as Region) : null;
        return {
          id: user.id,
          email: user.email || null,
          emailConfirmed: Boolean(user.email_confirmed_at),
          avatar: typeof meta.avatar === "string" ? meta.avatar : null,
          region
        };
      });
      if (!profile?.emailConfirmed) {
        await authService.signOut().catch(() => undefined);
        const next = encodeURIComponent(window.location.pathname || "/dashboard");
        window.location.href = `/login?next=${next}`;
        return;
      }
      const storedRegion = readStoredRegion();
      const regionFromMeta = (storedRegion || (profile.region as Region | null) || "us") as Region;
      setUser({
        id: profile.id,
        email: profile.email,
        avatar: sanitizeAvatarUrl(profile.avatar || localStorage.getItem("avatar")),
        region: regionFromMeta
      });
      if (!profile.region && !storedRegion) {
        setShowRegionModal(true);
      }
      regionService?.setRegion(regionFromMeta, { broadcast: false });
      if (storedRegion && storedRegion !== profile.region) {
        await authService.updateUserMetadata({ region: storedRegion }).catch(() => undefined);
      }
    })();
  }, [authService, regionService]);

  useEffect(() => {
    const applyAvatar = (raw: string) => {
      const safe = sanitizeAvatarUrl(raw);
      localStorage.setItem("avatar", safe);
      setUser((prev) => (prev ? { ...prev, avatar: safe } : prev));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== "avatar" || !event.newValue) return;
      applyAvatar(event.newValue);
    };

    if ("BroadcastChannel" in window) {
      profileChannelRef.current = new BroadcastChannel("rk-profile-sync");
      profileChannelRef.current.onmessage = (event: MessageEvent<{ type?: string; value?: string }>) => {
        if (event.data?.type !== "avatar" || !event.data.value) return;
        applyAvatar(event.data.value);
      };
    }

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      profileChannelRef.current?.close();
      profileChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      loadResultsByRegion(region),
      loadHistoryWithFallback()
    ]).then(([items, hist]) => {
      setResults(items);
      setHistory(hist);
    }).catch(() => {
      setResults([]);
      setHistory(null);
      showToast("Loading failed. Please try again.");
    }).finally(() => setLoading(false));
  }, [user, region, showToast]);

  const filteredItems = useMemo(() => {
    const selectedCity = normalizeCity(city);
    const selectedTier = String(tier || "").toUpperCase();

    return results.filter((item) => {
      const profitValue = Number(item.profit || 0);
      const lymValue = Number(item.lym || 0);
      const itemCity = normalizeCity(item.city);
      const itemTier = getItemTier(item.id);

      const profitMatch = profitValue >= minProfit;
      const cityMatch = city === "ALL" ? true : itemCity === selectedCity;
      const tierMatch = selectedTier === "ALL" ? true : itemTier === selectedTier;
      const maxCostMatch = maxCost == null ? true : lymValue > 0 && lymValue <= maxCost;

      return profitMatch && cityMatch && tierMatch && maxCostMatch;
    });
  }, [results, minProfit, city, tier, maxCost]);

  const searchSuggestions = useMemo(() => {
    const uniqueNames = new Map<string, string>();
    for (const item of filteredItems) {
      const name = baseName(item.id);
      const key = normalizeName(name);
      if (!uniqueNames.has(key)) uniqueNames.set(key, name);
    }
    return Array.from(uniqueNames.values()).sort((a, b) => a.localeCompare(b));
  }, [filteredItems]);

  const cardsItems = useMemo(() => {
    const term = normalizeName(searchTerm);
    let list = filteredItems;
    const exactSuggestionMatch = term ? searchSuggestions.some((name) => normalizeName(name) === term) : false;

    if (term) {
      list = list.filter((item) => {
        const base = normalizeName(baseName(item.id));
        const display = normalizeName(displayName(item.id));
        const rawId = normalizeName(item.id);
        const itemCity = normalizeCity(item.city);
        const itemTier = normalizeName(getItemTier(item.id));
        if (exactSuggestionMatch) return base === term;
        return base.includes(term) || display.includes(term) || rawId.includes(term) || itemCity.includes(term) || itemTier.includes(term);
      });
    }

    const sorted = [...list].sort((a, b) => {
      if (sortBySilver) {
        return (Number(b.bm || 0) - Number(b.lym || 0)) - (Number(a.bm || 0) - Number(a.lym || 0));
      }
      return Number(b.profit || 0) - Number(a.profit || 0);
    });
    return sorted;
  }, [filteredItems, searchTerm, sortBySilver, searchSuggestions]);

  const visibleCards = useMemo(() => cardsItems.slice(0, visibleCount), [cardsItems, visibleCount]);

  useEffect(() => {
    setVisibleCount(CARD_BATCH_SIZE);
  }, [cardsItems.length, region, city, tier, minProfit, maxCost, searchTerm, sortBySilver]);

  useEffect(() => {
    const sentinel = cardsSentinelRef.current;
    if (!sentinel || visibleCount >= cardsItems.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((current) => Math.min(current + CARD_BATCH_SIZE, cardsItems.length));
      },
      { root: null, rootMargin: "450px 0px 450px 0px", threshold: 0.01 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, cardsItems.length]);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY || 0;
      const hero = document.querySelector(".dash-hero") as HTMLElement | null;
      const heroTrigger = hero ? hero.offsetTop + hero.offsetHeight * 0.65 : 260;
      const delta = currentY - lastScrollYRef.current;
      const scrollingDown = delta > 4;
      const scrollingUp = delta < -4;
      const beyondHero = currentY > heroTrigger;

      if (beyondHero && scrollingDown) {
        setTopbarHidden(true);
      } else if (scrollingUp || !beyondHero) {
        setTopbarHidden(false);
      }

      lastScrollYRef.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function applyFilters() {
    const nextProfit = parseNumericInput(minProfitDraft);
    const nextCost = parseNumericInput(maxCostDraft);
    setMinProfit(nextProfit != null && nextProfit > 0 ? nextProfit : 0);
    setMaxCost(nextCost != null && nextCost > 0 ? nextCost : null);
  }

  const kpis = useMemo(() => {
    if (!cardsItems.length) return { deals: 0, best: "--", avg: "--", silver: "--" };
    const best = Math.max(...cardsItems.map((x) => x.profit));
    const avg = cardsItems.reduce((sum, x) => sum + x.profit, 0) / cardsItems.length;
    const silver = Math.max(...cardsItems.map((x) => x.bm - x.lym));
    return {
      deals: cardsItems.length,
      best: `${best.toFixed(1)}%`,
      avg: `${avg.toFixed(1)}%`,
      silver: silver.toLocaleString("de-DE")
    };
  }, [cardsItems]);

  const chartSeries = useMemo(() => {
    const days = getRangeDays(range);
    const block = ((history as Record<string, any> | null)?.[region] || {}) as Record<string, Array<{ date: string; avg: number }>>;
    const list = block[city] || block.ALL || [];
    const byDate = new Map(list.map((x) => [x.date, Number(x.avg) || 0]));
    const dates: string[] = [];
    const values: number[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dates.push(key);
      const raw = Number(byDate.get(key) || 0);
      values.push(sanitizeProfitValue(raw, key));
    }
    return { dates, values };
  }, [history, region, city, range]);

  // Real merge-workflow timestamp for the active region (bm-crafter-{region}.json generatedAt).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/data/bm-crafter-${region}.json`);
        const payload = res.ok ? await res.json() : null;
        if (cancelled) return;
        setDataUpdatedIso(payload && typeof payload.generatedAt === "string" ? payload.generatedAt : null);
      } catch {
        if (!cancelled) setDataUpdatedIso(null);
      }
    })();
    return () => { cancelled = true; };
  }, [region]);

  const chart = useMemo(() => buildChartGeometry(chartSeries.values), [chartSeries.values]);
  const chartStats = useMemo(() => calcStats(chartSeries.values), [chartSeries.values]);
  const stamp = useMemo(() => formatUpdated(dataUpdatedIso), [dataUpdatedIso]);
  const cityBackground = useMemo(() => cityBackgroundMap[city] || cityBackgroundMap.ALL, [city]);

  useEffect(() => {
    setChartHover(null);
  }, [range, region, city, history]);

  async function onRegionConfirm(next: Region) {
    if (!authService) return;
    regionService?.setRegion(next);
    await authService.updateUserMetadata({ region: next }).catch(() => undefined);
    setUser((prev) => (prev ? { ...prev, region: next } : prev));
    setShowRegionModal(false);
  }

  async function onAvatarChange(next: string) {
    if (!authService || !user) return;
    const normalized = sanitizeAvatarUrl(next);
    await authService.updateUserMetadata({ avatar: normalized }).catch(() => undefined);
    localStorage.setItem("avatar", normalized);
    profileChannelRef.current?.postMessage({ type: "avatar", value: normalized });
    setUser({ ...user, avatar: normalized });
    showToast("Avatar updated");
  }

  async function onLogout() {
    if (isGuest()) {
      exitGuestToLogin();
      return;
    }
    if (!authService) return;
    await authService.signOut().catch(() => undefined);
    setUser(null);
    setShowAccount(false);
    showToast("Logged out");
    window.location.href = "/login?next=%2Fdashboard";
  }

  async function onResetPassword() {
    if (!authService || !user?.email) return;
    setAccountActionMsg("");
    const { error: resetError } = await authService.client.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/login?next=%2Fdashboard`
    });
    if (resetError) {
      setAccountActionMsg(resetError.message || "Password reset failed.");
      showToast(resetError.message || "Password reset failed.");
      return;
    }
    setAccountActionMsg("Email sent");
    showToast("Reset email sent");
    window.setTimeout(() => setAccountActionMsg(""), 3000);
  }

  async function onRegionSave(next: Region) {
    regionService?.setRegion(next);
    setUser((prev) => (prev ? { ...prev, region: next } : prev));
    if (!authService) return;
    await authService.updateUserMetadata({ region: next }).catch(() => undefined);
  }

  if (!user) {
    return (
      <div className="dashboard dash-page">
        <div className="static-bg" style={{ background: cityBackground }} />
        <div className="loading-overlay" style={{ display: "flex" }}>
          <div className="loading-spinner" />
          <div className="loading-text">Checking session...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard dash-page">
      <div className="static-bg" style={{ background: cityBackground }} />
      {toastText ? <div id="toast" className={`toast ${toastVisible ? "visible" : ""}`}>{toastText}</div> : null}
      <div className="loading-overlay" style={{ display: loading ? "flex" : "none" }}>
        <div className="loading-spinner" />
        <div className="loading-text">Loading data...</div>
      </div>
      {showRegionModal ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Select your data region</h3>
            <p>Please choose which server data you want to load.</p>
            <div className="region-actions">
              <button onClick={() => onRegionConfirm("us")}>America</button>
              <button onClick={() => onRegionConfirm("eu")}>Europe</button>
            </div>
          </div>
        </div>
      ) : null}
      {showMaintenanceModal ? (
        <div className="modal-overlay" onClick={() => setShowMaintenanceModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Free Trial</h3>
            <p>This version is running in Free Trial mode. Live data is still being verified, so results may differ from the final release.</p>
            <button className="cta" type="button" onClick={() => setShowMaintenanceModal(false)}>OK</button>
          </div>
        </div>
      ) : null}
      <div className="page">
      <img src={assetUrl("picture/testo ohne background.png")} alt="Logo" className="logo-fixed" onClick={() => { window.location.href = "/"; }} />
      <button className="mobile-back" onClick={() => { window.location.href = "/"; }}>Back</button>
      <aside className="tool-rail">
        <a className="tool-rail-link" href="/" title="Home">
          <span className="tool-rail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 3 3 10v10h6v-6h6v6h6V10l-9-7Z" />
            </svg>
          </span>
          <span className="tool-rail-label">Home</span>
        </a>
        <a className="tool-rail-link active" href="/dashboard" title="Blackmarket Reader">
          <span className="tool-rail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M4 5h16v14H4zM7 15h2v3H7zm4-4h2v7h-2zm4-2h2v9h-2z" />
            </svg>
          </span>
          <span className="tool-rail-label">Blackmarket Reader</span>
        </a>
        <a className="tool-rail-link" href="/bm-crafter" title="Blackmarket Crafter">
          <span className="tool-rail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M14 3 4 9l6 3.5 8-4.7V14h2V6L14 3Zm-4 11-6-3.5V15l6 3.5V14Zm2 4.5L18 15v-2.5L12 16v2.5Z" />
            </svg>
          </span>
          <span className="tool-rail-label">Blackmarket Crafter</span>
        </a>
        <a className="tool-rail-link" href="/crafting-calculator" title="Crafting Calculator">
          <span className="tool-rail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 4h10V5H7v2Zm0 4h2V9H7v2Zm4 0h2V9h-2v2Zm4 0h2V9h-2v2ZM7 15h2v-2H7v2Zm4 0h6v-2h-6v2Zm-4 4h2v-2H7v2Zm4 0h6v-2h-6v2Z" />
            </svg>
          </span>
          <span className="tool-rail-label">Crafting Calculator</span>
        </a>
        <a className="tool-rail-link" href="/refining-calculator" title="Refining Calculator">
          <span className="tool-rail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M7 3h10v2H7V3Zm2 4h6l4 6-7 8-7-8 4-6Zm.96 2-2.23 3.35L12 17.2l4.27-4.85L14.04 9H9.96Z" />
            </svg>
          </span>
          <span className="tool-rail-label">Refining Calculator</span>
        </a>
        <a className="tool-rail-link" href="/food-potion-crafter" title="Food & Potion Crafter">
          <span className="tool-rail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M11 2h2v6h-2V2Zm-4 0h2v6a3 3 0 0 1-6 0V2h2v6a1 1 0 0 0 2 0V2Zm10 0h2v20h-2v-8h-2V7a5 5 0 0 1 2-5Z" />
            </svg>
          </span>
          <span className="tool-rail-label">Food &amp; Potion Crafter</span>
        </a>
      </aside>

      <header className={`topbar ${topbarHidden ? "topbar-hidden" : ""}`}>
        <MobileNavBurger accent="#5cf0c8" />
        <a className="topbar-brand" href="/">
          <img src={assetUrl("picture/testo ohne background.png")} alt="Logo" className="topbar-logo" />
          <span className="topbar-title">RomulusKings Market Reader</span>
        </a>
        <div className="topbar-search">
          <input className="search" placeholder="Search markets" list="searchSuggestions" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          <datalist id="searchSuggestions">
            {searchSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <nav className="topbar-nav">
          <a className="nav-link active" href="/dashboard">Markets</a>
          <a className="nav-link" href="/#bm-crafter-access">Crafting-Tools</a>
          <a className="nav-link" href="/community">Community</a>
        </nav>
        <div className="topbar-right">
          <div className="topbar-meta">
            <div className="badge">
              Last updated: <span className="lu-time">{stamp.time}</span> <span className="lu-date">{stamp.date}</span>{stamp.relative ? <span className="lu-ago"> ({stamp.relative})</span> : null}
            </div>
            <div className="pill-row">
              <span className="pill">Deals: {kpis.deals}</span>
              <span className="pill">Region: {region === "eu" ? "Europe" : "America"}</span>
            </div>
          </div>
          <div className="account-wrap">
            <button ref={accountBtnRef} className="account-btn" onClick={() => setShowAccount(true)}>
              <img src={user?.avatar || assetUrl("picture/accountsymbol.png")} alt="avatar" />
            </button>
          </div>
        </div>
      </header>

      {user ? (
        <section
          ref={accountPanelRef}
          className={`account-panel ${showAccount ? "open" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="account-header">
            <div className="avatar-ring">
              <img className="avatar-big" src={user.avatar} alt="avatar" />
              <span className="status-dot" aria-hidden="true"></span>
            </div>
            <div className="user-info">
              {isGuest() ? (
                <GuestSignInLink />
              ) : (
                <>
                  <span className="email">{user.email || "-"}</span>
                  <span className="status">Logged in</span>
                  <div className="badge-row">
                    <span className="badge-chip">Active</span>
                    <span className="badge-chip muted">Secure</span>
                  </div>
                </>
              )}
            </div>
            <button className="close-btn" aria-label="Close" onClick={() => setShowAccount(false)}>X</button>
          </div>

          <div className="panel-section">
            <h4>Select profile avatar</h4>
            <div className="avatar-grid">
              {allowedAvatars.filter((src) => !src.includes("accountsymbol")).map((src) => (
                <img
                  key={src}
                  src={assetUrl(src.replace(/^\//, ""))}
                  data-avatar={src}
                  alt=""
                  onClick={() => onAvatarChange(src)}
                />
              ))}
            </div>
          </div>

          <div className="panel-section">
            <h4>Data region</h4>
            <select className="city-select" value={region} onChange={(e) => onRegionSave(e.target.value === "eu" ? "eu" : "us")}>
              <option value="us">America</option>
              <option value="eu">Europe</option>
            </select>
          </div>

          <div className="panel-section">
          <h4>Guides</h4>
          <a className="panel-guides-link" href="/guides">
            Albion Online guides
            <span aria-hidden="true"> &rsaquo;</span>
          </a>
        </div>

        <div className="account-actions">
            {!isGuest() && (
              <button className="btn primary" onClick={onResetPassword}>
                {accountActionMsg === "Email sent" ? "Email sent" : "Change password"}
              </button>
            )}
            <button className="btn danger" onClick={onLogout}>{isGuest() ? "Exit guest mode" : "Logout"}</button>
          </div>

          <div className="account-help">
            <span>Need help?</span>
            <a href="https://discord.gg/HF2Ctg73m5" target="_blank" rel="noopener noreferrer">Join Discord</a>
            <a href="mailto:blackmarketreader@gmail.com">blackmarketreader@gmail.com</a>
          </div>
        </section>
      ) : null}

      <main className="dash-main">
        <section className="dash-hero">
          <div className="hero-badge">
            <span className="hero-dot" />
            Blackmarket data
          </div>
          <h1>
            Black Market Profits.
            <br />
            <span className="hero-muted">Made Clear.</span>
          </h1>
          <div className="hero-subline">
            <span className="hero-line" />
            <p>&gt;= 30 % PROFIT  -  14-DAY RANGE  -  LIVE BLACK MARKET DATA</p>
            <span className="hero-line" />
          </div>
        </section>

        <section className="kpi-row">
          <article className="kpi-card"><span className="kpi-label">Live Signals</span><strong className="kpi-value">{kpis.deals}</strong></article>
          <article className="kpi-card"><span className="kpi-label">Top Spread</span><strong className="kpi-value">{kpis.best}</strong></article>
          <article className="kpi-card"><span className="kpi-label">Median ROI</span><strong className="kpi-value">{kpis.avg}</strong></article>
          <article className="kpi-card"><span className="kpi-label">Max Liquidity</span><strong className="kpi-value">{kpis.silver}</strong></article>
        </section>

        <div className="chart-layout">
          <section ref={chartPanelRef} className="chart-panel">
            <div className="chart-header">
              <div>
                <h2>Profit % all Markets</h2>
                <p>Aggregate profit yield across all markets</p>
              </div>
              <div className="chart-meta">
                <span className="chart-pill">Avg<strong>{chartStats.avg.toFixed(1)}%</strong></span>
                <span className="chart-pill">Peak <strong>{chartStats.best.toFixed(1)}%</strong></span>
              </div>
            </div>
            <svg
              className="profit-chart"
              viewBox="0 0 600 220"
              preserveAspectRatio="none"
              aria-hidden="true"
              onMouseMove={(event) => {
                if (!chart.coords.length) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
                const ratio = rect.width ? x / rect.width : 0;
                const index = Math.max(0, Math.min(Math.round(ratio * (chart.coords.length - 1)), chart.coords.length - 1));
                const [cx, cy] = chart.coords[index];
                const panelRect = chartPanelRef.current?.getBoundingClientRect();
                if (!panelRect) return;
                const xPx = rect.left + (cx / 600) * rect.width;
                const yPx = rect.top + (cy / 220) * rect.height;
                setChartHover({
                  index,
                  left: xPx - panelRect.left,
                  top: yPx - panelRect.top - 12
                });
              }}
              onMouseLeave={() => setChartHover(null)}
            >
              <defs>
                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(92,240,200,0.35)" />
                  <stop offset="100%" stopColor="rgba(92,240,200,0.02)" />
                </linearGradient>
              </defs>
              <path d={chart.area} className="chart-area" />
              <path d={chart.line} className="chart-line" fill="none" strokeWidth="2.2" />
              <circle
                className="chart-dot"
                cx={chartHover ? chart.coords[chartHover.index]?.[0] ?? 0 : 0}
                cy={chartHover ? chart.coords[chartHover.index]?.[1] ?? 0 : 0}
                r="5"
                style={{ opacity: chartHover ? 1 : 0 }}
              />
            </svg>
            <div
              className="chart-tooltip"
              aria-hidden="true"
              style={{
                display: chartHover ? "block" : "none",
                left: chartHover ? `${chartHover.left}px` : undefined,
                top: chartHover ? `${chartHover.top}px` : undefined
              }}
            >
              {chartHover
                ? `${chartSeries.dates[chartHover.index] || `Day ${chartHover.index + 1}`}: ${(chart.values[chartHover.index] || 0).toFixed(1)}%`
                : ""}
            </div>
            <div className="chart-controls">
              <div className="range-group" role="group" aria-label="Range">
                {(["1W", "1M", "6M", "1Y"] as Range[]).map((entry) => (
                  <button key={entry} className={`range-btn ${range === entry ? "active" : ""}`} onClick={() => setRange(entry)}>{entry}</button>
                ))}
              </div>
              <div className="chart-actions" />
            </div>
          </section>

          <aside className="side-stack">
            <div className="side-card premium-panel">
              <div className="side-card-header">
                <div className="side-card-copy">
                  <span className="side-card-title">Crafting tools</span>
                </div>
                <span className="premium-badge"><span className="premium-dot" />New</span>
              </div>
              <button className="premium-preview" type="button" onClick={() => setShowPremiumPreview(true)}>
                <img src={assetUrl("picture/bm-crafter-table.png")} alt="Blackmarket Crafter tool preview" />
              </button>
              <a className="premium-button" href="/#bm-crafter-access">Crafting tools</a>
            </div>
            <div className="side-card city-panel">
              <div className="side-card-header">
                <img className="city-crest-img" src={assetUrl(crestMap[city])} alt="City crest" />
                <div className="city-panel-copy">
                  <span className="city-panel-title">City</span>
                  <span className="city-panel-name">{city === "ALL" ? "All Cities" : city}</span>
                </div>
              </div>
              <select className="city-select" value={city} onChange={(e) => setCity(e.target.value as City)}>
                <option value="ALL">All Cities</option>
                <option value="Lymhurst">Lymhurst</option>
                <option value="Martlock">Martlock</option>
                <option value="Fort Sterling">Fort Sterling</option>
                <option value="Thetford">Thetford</option>
                <option value="Bridgewatch">Bridgewatch</option>
                <option value="Caerleon">Caerleon</option>
              </select>
            </div>
          </aside>
        </div>

        <div className="chart-divider" />

        <section className="cards-section">
          <ResponsiveFilters accent="#5cf0c8">
          <div className="filters-wrap">
            <div className="filters-intro">
              <span className="filters-kicker">Signal Filters</span>
              <h3 className="filters-title">Deal Scanner Controls</h3>
            </div>
            <div className="filters-bar">
              <div className="tier-filters" role="group" aria-label="Tier filters">
                {["ALL", "T4", "T5", "T6", "T7", "T8"].map((entry) => (
                  <button key={entry} type="button" className={`tier-btn ${tier === entry ? "active" : ""}`} onClick={() => setTier(entry)}>
                    {entry === "ALL" ? "All tiers" : `Tier ${entry.slice(1)}`}
                  </button>
                ))}
              </div>
              <div className="filters-right">
                <label className="filter-field">
                  <span className="field-label">Min Profit %</span>
                  <input type="number" value={minProfitDraft} onChange={(e) => setMinProfitDraft(e.target.value)} />
                </label>
                <label className="filter-field">
                  <span className="field-label">Max Cost per Item</span>
                  <input type="number" value={maxCostDraft} onChange={(e) => setMaxCostDraft(e.target.value)} placeholder="100000" />
                </label>
                <div className="filter-actions">
                  <button className="filter-btn filter-btn-primary" type="button" onClick={applyFilters}>Apply filter</button>
                  <button className="filter-btn filter-btn-secondary" type="button" onClick={() => setSortBySilver(true)}>Sort by silver</button>
                  <button className="filter-btn filter-btn-ghost" type="button" onClick={() => setSortBySilver(false)} style={{ display: sortBySilver ? "inline-block" : "none" }}>Reset</button>
                </div>
              </div>
            </div>
          </div>
          </ResponsiveFilters>
        </section>

        {loading ? <div className="loading">Loading data...</div> : null}
        {!loading ? (
          <div className="loading" style={{ display: "block", marginBottom: 10, opacity: 0.7 }}>
            Cards: {cardsItems.length} | City: {city} | Tier: {tier}
          </div>
        ) : null}
        <section className="grid" id="cards">
          {visibleCards.map((item, index) => (
            <article key={`${item.city}-${item.id}-${item.lym}-${item.bm}-${item.sold}-${item.profit}-${index}`} className={`card card-box ${item.lym > 0 && item.bm >= 20 * item.lym ? "card-suspect" : ""} ${getEnchantLevel(item.id) > 0 ? `border-enchant-${getEnchantLevel(item.id)}` : ""}`.trim()}>
              <h3 className="title">{displayName(item.id)}</h3>
              {item.lym > 0 && item.bm >= 20 * item.lym ? <div className="card-suspect-note">This profit looks unrealistic — market price probably not real</div> : null}
              <div className="row"><span>ID</span><span className="val">{item.id}</span></div>
              <div className="row"><span>{item.city}</span><span className="val">{Number(item.lym || 0).toLocaleString("de-DE")}</span></div>
              <div className="row"><span>Black Market</span><span className="val">{Number(item.bm || 0).toLocaleString("de-DE")}</span></div>
              <div className="row"><span>Sold/Tag</span><span className="val">{item.sold ?? 0}</span></div>
              <div className={`profit ${sortBySilver ? (item.bm - item.lym < 0 ? "negative" : "") : (item.profit < 0 ? "negative" : "")}`.trim()}>
                {sortBySilver ? `Profit: ${(item.bm - item.lym).toLocaleString("de-DE")} Silber` : `Profit: ${item.profit.toFixed(1)}%`}
                <span className="span-tag">{item.span || "14d"}</span>
              </div>
            </article>
          ))}
        </section>
        <div ref={cardsSentinelRef} className="cards-sentinel" aria-hidden="true" />

        <a className="community-tile compact" href="/community" aria-label="Join Discord">
          <span className="tile-icon-wrap">
            <svg className="tile-icon" viewBox="0 0 256 199" aria-hidden="true" focusable="false">
              <path d="M216.9 16.5A208.5 208.5 0 0 0 164.6 0c-2.3 4-4.9 9.2-6.7 13.4-19.2-2.9-38.1-2.9-57.1 0-1.8-4.2-4.5-9.4-6.8-13.4a209.3 209.3 0 0 0-52.4 16.5C6.6 68.4-3.1 119.4 1.8 169.8a210.1 210.1 0 0 0 63.9 32.7c5.2-7.1 9.8-14.6 13.5-22.7-7.4-2.8-14.5-6.2-21.2-10.2 1.8-1.3 3.5-2.6 5.1-4 40.9 19.1 85.1 19.1 125.5 0 1.7 1.4 3.4 2.7 5.1 4-6.7 4-13.8 7.4-21.2 10.2 3.7 8.1 8.3 15.6 13.5 22.7a210.2 210.2 0 0 0 63.9-32.7c5.8-57.9-9.7-108.4-44.8-153.3ZM85 135.3c-12.5 0-22.7-11.4-22.7-25.4S72.5 84.5 85 84.5s22.7 11.4 22.7 25.4-10.1 25.4-22.7 25.4Zm86 0c-12.5 0-22.7-11.4-22.7-25.4s10.1-25.4 22.7-25.4 22.7 11.4 22.7 25.4-10.1 25.4-22.7 25.4Z" />
            </svg>
          </span>
          <span className="tile-copy"><span className="tile-title">Discord</span></span>
        </a>
      </main>
      </div>

      <ToolGuideLink slug="dashboard" authService={authService} />

      {showPremiumPreview ? (
        <div className="preview-modal" onClick={() => setShowPremiumPreview(false)}>
          <div className="preview-card" onClick={(e) => e.stopPropagation()}>
            <button className="preview-close" onClick={() => setShowPremiumPreview(false)} aria-label="Close preview">x</button>
            <img src={assetUrl("picture/bm-crafter-table.png")} alt="Blackmarket Crafter full tool preview" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
