import type { CraftingMasteryMap, CraftingProgress, CraftingSpecMap, SpecStation } from "./types";

export const EMPTY_PROGRESS: CraftingProgress = Object.freeze({
  specs: Object.freeze({}) as CraftingSpecMap,
  masteries: Object.freeze({}) as CraftingMasteryMap
});

export const SPEC_LEVEL_MIN = 0;
export const SPEC_LEVEL_MAX = 100;

/**
 * Focus cost efficiency model, checked against the game's data files (ao-data/ao-bin-dumps:
 * gamedata.xml costreductionconstant 1.00695555 ^ 100 = 2, achievements.xml crafting nodes).
 *
 *   focus = base * 0.5^(efficiency / 10000)
 *   efficiency = mastery * 30
 *              + activeSpec * (uniqueBonus + mutualBonus)  // a node's shared bonus covers its own item too
 *              + Σ(siblingSpec * siblingMutualBonus)
 *
 *  | Item type                          | unique | mutual |
 *  | ---------------------------------- | ------ | ------ |
 *  | Regular item                       |   250  |  30    |
 *  | Artefact item (HELL/MORGANA/...)   |   250  |  15    |
 *  | Leather armour artefact            |   250  |  12.5  |
 *  | Crystal item                       |   250  |  2.15  |
 *  | Base off-hand (Tome, Shield, Torch)|   250  |  90    |
 *  | Tool                               |   250  |  60    |
 *  | Bag / Satchel of Insight           |   310  |  30    |
 *  | Siege hammer                       |   310  |  30    |
 *  | Cape                               |   340  |  30    |
 *
 *  - Mastery (0–100) of the item's group: 30 efficiency per level (max 3,000).
 *  - Broadsword at 100/100 with no other specs: 3,000 + 100 * 280 = 31,000.
 *
 * Specs do NOT affect resource return rate (they raise the quality chance, not modelled here).
 */
export const MASTERY_EFFICIENCY_PER_LEVEL = 30;
export const FOCUS_EFFICIENCY_HALF_LIFE = 10000;

/**
 * Per-item spec bonus values. Derived from item id pattern.
 */
const ARTEFACT_SUFFIX_PATTERN = /_(HELL|MORGANA|KEEPER|AVALON|UNDEAD|FEY|CRYSTAL)$/;

export function getSpecBonuses(item: { id?: string; categoryKey?: string } | null): { unique: number; mutual: number } {
  if (!item?.id) return { unique: 250, mutual: 30 };
  const id = String(item.id).toUpperCase();
  const category = String(item.categoryKey || "");

  if (id === "BAG" || id === "BAG_INSIGHT") return { unique: 310, mutual: 30 };
  if (id === "CAPE") return { unique: 340, mutual: 30 };
  if (id.startsWith("2H_TOOL_SIEGEHAMMER")) return { unique: 310, mutual: 30 };
  if (id.startsWith("2H_TOOL_") || category === "tools") return { unique: 250, mutual: 60 };

  if (id.endsWith("_CRYSTAL")) return { unique: 250, mutual: 2.15 };
  if (ARTEFACT_SUFFIX_PATTERN.test(id)) return { unique: 250, mutual: LEATHER_TOKENS.some((t) => id.startsWith(t)) ? 12.5 : 15 };
  if (BASE_OFFHANDS.includes(id)) return { unique: 250, mutual: 90 };

  return { unique: 250, mutual: 30 };
}

/** Station per categoryKey used in items-categorized-crafting.json. */
const STATION_BY_CATEGORY: Record<string, SpecStation> = {
  swords: "warrior",
  axes: "warrior",
  maces: "warrior",
  hammers: "warrior",
  crossbows: "warrior",
  gloves: "warrior",
  bows: "hunter",
  spears: "hunter",
  daggers: "hunter",
  quarterstaffs: "hunter",
  nature: "hunter",
  shapeshifter: "hunter",
  arcane: "mage",
  cursed: "mage",
  fire: "mage",
  frost: "mage",
  holy: "mage",
  bags: "toolmaker",
  capes: "toolmaker",
  tools: "toolmaker",
  "gathering-gear": "toolmaker"
};

const STATION_LABELS: Record<SpecStation, string> = {
  warrior: "Warrior's Forge",
  hunter: "Hunter's Lodge",
  mage: "Mage's Tower",
  toolmaker: "Toolmaker"
};

export function getStationLabel(station: SpecStation): string {
  return STATION_LABELS[station];
}

const PLATE_TOKENS = ["HEAD_PLATE", "ARMOR_PLATE", "SHOES_PLATE"];
const LEATHER_TOKENS = ["HEAD_LEATHER", "ARMOR_LEATHER", "SHOES_LEATHER"];
const CLOTH_TOKENS = ["HEAD_CLOTH", "ARMOR_CLOTH", "SHOES_CLOTH"];
// Warrior: Shield, Sarcophagus, Caitiff Shield, Facebreaker, Astral Aegis.
// Hunter: Torch, Mistcaller, Leering Cane, Cryptcandle, Sacred Scepter. Mage: the rest (Tome, Taproot, ...).
const OFFHAND_SHIELD_TOKENS = ["OFF_SHIELD", "OFF_SPIKEDSHIELD", "OFF_TOWERSHIELD"];
const OFFHAND_HUNTER_TOKENS = ["OFF_TORCH", "OFF_HORN", "OFF_JESTERCANE", "OFF_LAMP", "OFF_TALISMAN"];
/** the plain off-hands, whose node shares 90 efficiency per level with their group */
const BASE_OFFHANDS = ["OFF_SHIELD", "OFF_TORCH", "OFF_BOOK"];
const GATHERER_TOKENS = ["HEAD_GATHERER", "ARMOR_GATHERER", "SHOES_GATHERER", "BACKPACK_GATHERER"];

/** Resolve which station an item is crafted at. */
export function getStationForItem(item: { id?: string; categoryKey?: string } | null): SpecStation | null {
  if (!item) return null;
  const id = String(item.id || "").toUpperCase();
  const category = String(item.categoryKey || "");

  if (category.startsWith("armor-")) {
    if (PLATE_TOKENS.some((t) => id.includes(t))) return "warrior";
    if (LEATHER_TOKENS.some((t) => id.includes(t))) return "hunter";
    if (CLOTH_TOKENS.some((t) => id.includes(t))) return "mage";
    return null;
  }

  if (category === "offhand") {
    if (OFFHAND_SHIELD_TOKENS.some((t) => id.startsWith(t))) return "warrior";
    if (OFFHAND_HUNTER_TOKENS.some((t) => id.startsWith(t))) return "hunter";
    return "mage";
  }

  if (category === "gathering-gear") {
    if (GATHERER_TOKENS.some((t) => id.startsWith(t))) return "toolmaker";
    return "toolmaker";
  }

  return STATION_BY_CATEGORY[category] ?? null;
}

/**
 * Resolve the mastery group key for an item. Two items share mutual focus
 * efficiency bonuses iff they share the same mastery group.
 */
export function getMasteryGroup(item: { id?: string; categoryKey?: string } | null): string | null {
  if (!item) return null;
  const id = String(item.id || "").toUpperCase();
  const category = String(item.categoryKey || "");

  if (category === "armor-head") {
    if (id.includes("HEAD_PLATE")) return "plate-head";
    if (id.includes("HEAD_LEATHER")) return "leather-head";
    if (id.includes("HEAD_CLOTH")) return "cloth-head";
    return null;
  }
  if (category === "armor-chest") {
    if (id.includes("ARMOR_PLATE")) return "plate-chest";
    if (id.includes("ARMOR_LEATHER")) return "leather-chest";
    if (id.includes("ARMOR_CLOTH")) return "cloth-chest";
    return null;
  }
  if (category === "armor-shoes") {
    if (id.includes("SHOES_PLATE")) return "plate-shoes";
    if (id.includes("SHOES_LEATHER")) return "leather-shoes";
    if (id.includes("SHOES_CLOTH")) return "cloth-shoes";
    return null;
  }

  if (category === "offhand") {
    if (OFFHAND_SHIELD_TOKENS.some((t) => id.startsWith(t))) return "offhand-shield";
    if (OFFHAND_HUNTER_TOKENS.some((t) => id.startsWith(t))) return "offhand-hunter";
    return "offhand-mage";
  }

  if (category in STATION_BY_CATEGORY) return category;
  return null;
}

/** Spec key is the base item id (without T-prefix / enchant suffix). */
export function resolveSpecKey(item: { id?: string } | null): string | null {
  if (!item?.id) return null;
  return String(item.id).toUpperCase();
}

export function clampSpecLevel(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return SPEC_LEVEL_MIN;
  return Math.max(SPEC_LEVEL_MIN, Math.min(SPEC_LEVEL_MAX, Math.round(num)));
}

export function normalizeSpecMap(raw: unknown): CraftingSpecMap {
  if (!raw || typeof raw !== "object") return {};
  const entries: Array<[string, number]> = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || typeof key !== "string") continue;
    // Legacy V2 format: value might be {spec, mastery} object. Extract spec only.
    let level = 0;
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      level = clampSpecLevel(obj.spec ?? obj.s ?? 0);
    } else {
      level = clampSpecLevel(value);
    }
    if (level <= 0) continue;
    entries.push([key.toUpperCase(), level]);
  }
  return Object.fromEntries(entries);
}

export function normalizeMasteryMap(raw: unknown): CraftingMasteryMap {
  if (!raw || typeof raw !== "object") return {};
  const entries: Array<[string, number]> = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || typeof key !== "string") continue;
    const level = clampSpecLevel(value);
    if (level <= 0) continue;
    entries.push([key, level]);
  }
  return Object.fromEntries(entries);
}

export function normalizeProgress(raw: unknown): CraftingProgress {
  if (!raw || typeof raw !== "object") return { specs: {}, masteries: {} };
  const obj = raw as Record<string, unknown>;
  // V3 has explicit `specs` key (object). Legacy V1/V2 stored a flat map of items at root.
  const isV3 = obj.specs !== undefined && typeof obj.specs === "object";
  const specs = isV3 ? normalizeSpecMap(obj.specs) : normalizeSpecMap(obj);
  const masteries = isV3 ? normalizeMasteryMap(obj.masteries) : {};
  return { specs, masteries };
}

export function getSpecLevel(specs: CraftingSpecMap, itemKey: string | null): number {
  if (!itemKey) return 0;
  return clampSpecLevel(specs[itemKey] ?? 0);
}

export function getMasteryLevel(masteries: CraftingMasteryMap, groupKey: string | null): number {
  if (!groupKey) return 0;
  return clampSpecLevel(masteries[groupKey] ?? 0);
}

export interface SpecItemRef {
  id: string;
  name?: string;
  categoryKey?: string;
}

/**
 * Compute focus cost efficiency for the currently-active item.
 *
 *   efficiency = mastery*30 + activeUnique + Σ(siblingLevel * siblingMutual)
 *
 * Bonus values are PER-ITEM (see getSpecBonuses). Active item's unique uses its
 * own bonus; sibling contributions use each sibling's mutual bonus (which can
 * differ for tools / artefacts / bags etc.).
 */
export function computeFocusEfficiency(
  progress: CraftingProgress,
  activeSpecKey: string | null,
  activeItem: SpecItemRef | null,
  items: ReadonlyArray<SpecItemRef>
): number {
  if (!activeSpecKey || !activeItem) return 0;
  const activeSpec = getSpecLevel(progress.specs, activeSpecKey);
  const activeGroup = getMasteryGroup(activeItem);
  const activeMastery = getMasteryLevel(progress.masteries, activeGroup);
  if (activeSpec <= 0 && activeMastery <= 0) return 0;

  const activeBonuses = getSpecBonuses(activeItem);
  const masteryEff = activeMastery * MASTERY_EFFICIENCY_PER_LEVEL;
  // the node's shared bonus covers its own item as well
  const uniqueEff = activeSpec * (activeBonuses.unique + activeBonuses.mutual);

  if (!activeGroup) return uniqueEff + masteryEff;

  let mutualEff = 0;
  for (const item of items) {
    const key = resolveSpecKey(item);
    if (!key || key === activeSpecKey) continue;
    if (getMasteryGroup(item) !== activeGroup) continue;
    const siblingSpec = getSpecLevel(progress.specs, key);
    if (siblingSpec <= 0) continue;
    const siblingBonus = getSpecBonuses(item).mutual;
    mutualEff += siblingSpec * siblingBonus;
  }

  return uniqueEff + mutualEff + masteryEff;
}

/** Apply focus efficiency to a base focus cost: newCost = base * 0.5^(eff/10000). */
export function applyFocusEfficiency(baseFocusCost: number, efficiency: number): number {
  if (!Number.isFinite(baseFocusCost) || baseFocusCost <= 0) return 0;
  const safeEff = Math.max(0, efficiency);
  return baseFocusCost * Math.pow(0.5, safeEff / FOCUS_EFFICIENCY_HALF_LIFE);
}

/**
 * Base focus per tier+enchant, sourced from community Goldenium2024 spreadsheet
 * (Refining Focus - Fees tab). Used as PER-MAT focus cost.
 *
 * Per-craft focus = Σ(mat.qty × baseFocus[mat_tier, mat_enchant]).
 *
 * Power index = (tier - 2) + enchant. Verified against in-game tooltip values.
 */
const BASE_FOCUS_PER_MAT_BY_POWER = [18, 31, 54, 94, 164, 287, 503, 880, 1539, 2694, 4714] as const;

export function getBaseFocusPerMat(tier: number, enchant: number): number {
  const safeTier = Math.max(2, Math.min(8, Math.floor(tier)));
  const safeEnchant = Math.max(0, Math.min(4, Math.floor(enchant)));
  const power = (safeTier - 2) + safeEnchant;
  const safePower = Math.max(0, Math.min(BASE_FOCUS_PER_MAT_BY_POWER.length - 1, power));
  return BASE_FOCUS_PER_MAT_BY_POWER[safePower];
}

/**
 * Compute a crafting item's BASE focus cost (mastery=0, spec=0).
 * Sums material qty × per-mat base focus at the item's tier+enchant.
 */
export function computeCraftBaseFocus(materials: ReadonlyArray<{ qty?: number | string | null }>, tier: number, enchant: number): number {
  const perMat = getBaseFocusPerMat(tier, enchant);
  let total = 0;
  for (const mat of materials) {
    const qty = Number(mat?.qty);
    if (Number.isFinite(qty) && qty > 0) total += qty * perMat;
  }
  return total;
}
