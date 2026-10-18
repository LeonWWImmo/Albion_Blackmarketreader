/**
 * Albion's daily crafting bonus and weekly activity events, as reported by the Albion Online
 * Data Project's festivities snapshot (served through /api/aodp/festivities).
 *
 * Every day at 10:00 UTC the game rolls two "Daily Production Bonuses", e.g. COMMON_BAG (+10%
 * production bonus for everything crafted as a bag) or RARE_ORE (+20% for refining metal bars).
 * The bonus adds to the production bonus percent, the same pool as the royal city base, city
 * specialisation and focus, so it raises the resource return rate.
 *
 * Which items an event covers comes from the game data (craftBonusData.json, built by
 * scripts/build-craft-bonus-data.mjs): each event names a crafting category, and each item has one.
 */
import craftBonusData from "./craftBonusData.json";

export type FestivityEvent = {
  /** 1 = weekly activity event, 2 = daily crafting bonus. */
  readonly kind: number;
  readonly category: string;
  readonly name: string;
  /** ISO timestamps (UTC). */
  readonly start: string;
  readonly end: string;
};

export type FestivitiesSnapshot = {
  readonly region: string;
  readonly fetchedAt: string;
  /** False until enough players have reported the same events for AODP to publish them. */
  readonly confirmed: boolean;
  readonly events: ReadonlyArray<FestivityEvent>;
};

export type CraftBonus = {
  /** Event name, e.g. COMMON_BAG. */
  readonly name: string;
  /** Crafting category, e.g. bag. */
  readonly category: string;
  /** Production bonus in percent: 10 (common) or 20 (rare). */
  readonly percent: number;
  /** Player-facing name of the category, e.g. "Bags". */
  readonly label: string;
  readonly end: string;
};

export type WeeklyEvent = {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly start: string;
  readonly end: string;
  /** Running now (otherwise it starts later). */
  readonly active: boolean;
};

const BONUSES = craftBonusData.bonuses as Record<string, { category: string; percent: number }>;
const CATEGORY_OF = craftBonusData.categoryOf as Record<string, string>;
const CRAFT_ITEM_OF = craftBonusData.craftItemOf as Record<string, string>;

/** Player-facing names for the game's crafting categories. */
const CATEGORY_LABELS: Record<string, string> = {
  sword: "Swords",
  axe: "Axes",
  crossbow: "Crossbows",
  hammer: "Hammers",
  mace: "Maces",
  knuckles: "War Gloves",
  plate_helmet: "Plate Helmets",
  plate_armor: "Plate Armor",
  plate_shoes: "Plate Boots",
  spear: "Spears",
  bow: "Bows",
  naturestaff: "Nature Staffs",
  dagger: "Daggers",
  quarterstaff: "Quarterstaffs",
  shapeshifterstaff: "Shapeshifter Staffs",
  leather_helmet: "Leather Hoods",
  leather_armor: "Leather Jackets",
  leather_shoes: "Leather Shoes",
  arcanestaff: "Arcane Staffs",
  cursestaff: "Cursed Staffs",
  firestaff: "Fire Staffs",
  froststaff: "Frost Staffs",
  holystaff: "Holy Staffs",
  cloth_helmet: "Cloth Cowls",
  cloth_armor: "Cloth Robes",
  cloth_shoes: "Cloth Sandals",
  offhand: "Off-Hands",
  fiber: "Cloth refining",
  wood: "Planks refining",
  rock: "Stone Blocks refining",
  ore: "Metal Bars refining",
  hide: "Leather refining",
  tools: "Tools",
  gatherergear: "Gathering Gear",
  potion: "Potions",
  food: "Food",
  bag: "Bags",
  cape: "Capes"
};

/** English titles and effects of the weekly events, from the game's localization. */
const WEEKLY_EVENTS: Record<string, { title: string; description: string }> = {
  HELLGATE: { title: "Hellgate Frenzy", description: "+15% Fame and +10% Loot in all Hellgates" },
  CORRUPTED: { title: "Corrupted Dungeoneering", description: "+15% Fame and +10% Loot in all Corrupted Dungeons" },
  HELLDUNGEON: { title: "Call of the Depths", description: "+15% Fame and +10% Loot in the Depths" },
  FACTIONPOINTS: { title: "Faction Rivalry", description: "+20% Faction Points in Faction Warfare" },
  GROUP_AND_RAID_DUNGEONS: { title: "Gather Your Party", description: "+20% Fame in Group and Raid Dungeons" },
  STATIC_DUNGEONS: { title: "Invade the Enemy Strongholds", description: "+15% Fame in Static Dungeons and World Boss Strongholds" },
  SOLO_DUNGEONS: { title: "Solo Dungeoneering", description: "+20% Fame in Solo Dungeons" },
  ROAMING_MOBS: { title: "Roam the Open World", description: "+20% Fame from Open World enemies" },
  ROADS: { title: "Roads of Avalon", description: "+10% Fame in the Roads of Avalon" },
  MISTS: { title: "Mist Opportunities", description: "+10% Fame in The Mists" },
  FAME: { title: "Fame Rush", description: "+25% Fame for all activities" },
  MISTS_AND_HELLDUNGEON: { title: "Through Mist and Smoke", description: "+25% Fame and Loot in the Depths and the Mists" },
  DRAGON_AREA_AND_DUNGEON: { title: "Draconic Surge", description: "+10% Fame and +10% Loot in Ancient Lands and Dragon Sanctuaries" },
  DRAGON_AREA_AND_DUNGEON_LAUNCH_EVENT: { title: "Draconic Surge", description: "+15% Fame and +15% Loot in Ancient Lands and Dragon Sanctuaries" },
  ORE: { title: "Gathering Bonus: Ore", description: "+25% Ore gathering yield and +50% more Ore treasures" },
  ROCK: { title: "Gathering Bonus: Stone", description: "+25% Stone gathering yield and +50% more Stone treasures" },
  WOOD: { title: "Gathering Bonus: Wood", description: "+25% Wood gathering yield and +50% more Wood treasures" },
  FIBER: { title: "Gathering Bonus: Fiber", description: "+25% Fiber gathering yield and +50% more Fiber treasures" },
  HIDE: { title: "Gathering Bonus: Hide", description: "+25% Hide gathering yield and +50% more Hide treasures" },
  FISHING: { title: "Gathering Bonus: Fishing", description: "+25% Fishing yield and Fame" },
  TRACKING: { title: "The Great Hunt", description: "+25% more Tracks and Fame for Tracking" }
};

/** How far ahead an upcoming weekly event is still worth showing. */
const UPCOMING_WINDOW_MS = 4 * 24 * 3600 * 1000;

/**
 * T4_2H_BOW@2 -> 2H_BOW, T5_METALBAR_LEVEL1@1 -> METALBAR: tier and enchantment do not change
 * the crafting category (enchanted resources carry theirs as a _LEVEL suffix).
 */
export function baseItemId(itemId: string): string {
  return String(itemId || "").split("@")[0].replace(/^T\d+_/, "").replace(/_LEVEL\d+$/, "");
}

/** The item's crafting category, or null when no daily bonus can ever apply to it. */
export function craftCategoryOf(itemId: string): string | null {
  return CATEGORY_OF[baseItemId(itemId)] ?? null;
}

/** A plain Crafting Calculator item of the category (MAIN_SWORD for swords), or null. */
export function craftItemFor(category: string): string | null {
  return CRAFT_ITEM_OF[category] ?? null;
}

export function craftCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

function isActive(event: FestivityEvent, now: number): boolean {
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
}

/** Today's crafting bonuses: confirmed kind-2 events running at `now` that the game data knows. */
export function activeCraftBonuses(snapshot: FestivitiesSnapshot | null, now: number): CraftBonus[] {
  if (!snapshot?.confirmed) return [];
  const out: CraftBonus[] = [];
  for (const event of snapshot.events) {
    if (event.kind !== 2 || !isActive(event, now)) continue;
    const bonus = BONUSES[event.name];
    if (!bonus) continue;
    out.push({ name: event.name, category: bonus.category, percent: bonus.percent, label: craftCategoryLabel(bonus.category), end: event.end });
  }
  return out.sort((a, b) => b.percent - a.percent || a.label.localeCompare(b.label));
}

/** The daily bonus percent for crafting this item today (0 when none applies). */
export function craftBonusPercentFor(itemId: string, bonuses: ReadonlyArray<CraftBonus>): number {
  if (!bonuses.length) return 0;
  const category = craftCategoryOf(itemId);
  if (!category) return 0;
  let best = 0;
  for (const bonus of bonuses) if (bonus.category === category && bonus.percent > best) best = bonus.percent;
  return best;
}

/** Weekly events running now, then those starting within the next few days. */
export function weeklyEvents(snapshot: FestivitiesSnapshot | null, now: number): WeeklyEvent[] {
  if (!snapshot?.confirmed) return [];
  const out: WeeklyEvent[] = [];
  for (const event of snapshot.events) {
    if (event.kind !== 1) continue;
    const start = Date.parse(event.start);
    const end = Date.parse(event.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= now || start - now > UPCOMING_WINDOW_MS) continue;
    const known = WEEKLY_EVENTS[event.name];
    out.push({
      name: event.name,
      title: known?.title ?? titleCase(event.name),
      description: known?.description ?? "",
      start: event.start,
      end: event.end,
      active: start <= now
    });
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || Date.parse(a.start) - Date.parse(b.start));
}

/**
 * Return rate after adding a daily bonus to a return rate that was entered directly (BM Crafter).
 * The rate came from 1 - 1 / (1 + bonus/100), so the bonus behind it is 1 / (1 - rate) - 1.
 */
export function addBonusToReturnRate(returnRate: number, bonusPercent: number): number {
  if (!(bonusPercent > 0)) return returnRate;
  const rate = Math.min(0.99, Math.max(0, Number.isFinite(returnRate) ? returnRate : 0));
  return Math.min(0.99, 1 - 1 / (1 / (1 - rate) + bonusPercent / 100));
}

/** The next daily reset (10:00 UTC), when the crafting bonuses change. */
export function nextDailyReset(now: number): number {
  const date = new Date(now);
  const reset = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 10, 0, 0);
  return reset > now ? reset : reset + 24 * 3600 * 1000;
}

/** "5h 12m" / "42m" / "3d 4h" until `target`. */
export function formatCountdown(target: number, now: number): string {
  const minutes = Math.max(0, Math.round((target - now) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
