/** One row of public/data/items-index.json (scripts/build-item-index.mjs). */
export type ItemRow = [string, string, string, string, string, number, number, number | string[], (0 | 1)?, 1?];

export type ItemEntry = {
  /** market id of the .0 item, e.g. "T4_BAG" */
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory: string;
  tier: number;
  weight: number;
  /** market id per enchantment level, .0 first */
  variants: string[];
  /** the Crafting Calculator can open it (a T4-T8 item it has the recipe for) */
  craftable: boolean;
  /** it comes in qualities Normal to Masterpiece; artefacts, resources, food and the like do not */
  qualities: boolean;
};

export type ItemIndex = {
  items: ItemEntry[];
  bySlug: Map<string, ItemEntry>;
  /** items of one kind across tiers ("BAG" -> T2..T8 bags), lowest tier first */
  byFamily: Map<string, ItemEntry[]>;
};

/** The id without its tier: T4_BAG and T8_BAG are the same kind of item. */
export const familyKey = (id: string) => id.replace(/^T\d_/, "");

export function toEntry([id, name, slug, category, subcategory, tier, weight, enchants, craftable, qualities]: ItemRow): ItemEntry {
  const variants = Array.isArray(enchants) ? enchants : Array.from({ length: enchants + 1 }, (_, e) => (e ? `${id}@${e}` : id));
  return { id, name, slug, category, subcategory, tier, weight, variants, craftable: craftable === 1, qualities: qualities === 1 };
}

/** The Crafting Calculator with this item, tier and enchantment open. */
export const craftingCalculatorPath = (item: ItemEntry, enchant: number) =>
  `/crafting-calculator?item=${encodeURIComponent(familyKey(item.id))}&tier=${item.tier}&enchant=${enchant}`;

export function buildItemIndex(rows: ItemRow[]): ItemIndex {
  const items = rows.map(toEntry);
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const byFamily = new Map<string, ItemEntry[]>();
  for (const item of items) {
    const family = byFamily.get(familyKey(item.id)) ?? [];
    family.push(item);
    byFamily.set(familyKey(item.id), family);
  }
  for (const family of byFamily.values()) family.sort((a, b) => a.tier - b.tier);
  return { items, bySlug, byFamily };
}

/** Shop categories in the order the browse tiles show them, with their labels. */
export const CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: "weapons", label: "Weapons", icon: "T6_2H_CROSSBOW" },
  { key: "armors", label: "Armor", icon: "T6_ARMOR_PLATE_SET1" },
  { key: "head", label: "Helmets", icon: "T6_HEAD_LEATHER_SET2" },
  { key: "shoes", label: "Shoes", icon: "T6_SHOES_CLOTH_SET1" },
  { key: "offhands", label: "Off-hands", icon: "T6_OFF_SHIELD" },
  { key: "capes", label: "Capes", icon: "T6_CAPEITEM_FW_LYMHURST" },
  { key: "bags", label: "Bags", icon: "T6_BAG" },
  { key: "mounts", label: "Mounts", icon: "T4_MOUNT_GIANTSTAG" },
  { key: "gathering", label: "Resources", icon: "T6_HIDE" },
  { key: "crafting", label: "Refined", icon: "T6_PLANKS" },
  { key: "artefacts", label: "Artefacts", icon: "T6_RUNE" },
  { key: "consumables", label: "Food & Potions", icon: "T6_POTION_HEAL" },
  { key: "farming", label: "Farming", icon: "T4_FARM_OX_BABY" },
  { key: "furniture", label: "Furniture", icon: "T5_FURNITUREITEM_CHEST" },
  { key: "vanity", label: "Vanity", icon: "UNIQUE_UNLOCK_SKIN_ARMORED_HORSE_PEGASUS_LIGHT" },
  { key: "other", label: "Other", icon: "T4_LABOURER_CONTRACT_WARRIOR" }
];

export const categoryLabel = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

/** Albion's tier names, the part of an item name that changes from tier to tier. */
const TIER_PREFIX = /^(Beginner's|Novice's|Journeyman's|Adept's|Expert's|Master's|Grandmaster's|Elder's)\s+/;

/** "Adept's Bag" -> "Bag", for a family shown once across all its tiers. */
export const baseName = (name: string) => name.replace(TIER_PREFIX, "");

export const iconUrl = (id: string, quality = 1) =>
  `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png${quality > 1 ? `?quality=${quality}` : ""}`;
