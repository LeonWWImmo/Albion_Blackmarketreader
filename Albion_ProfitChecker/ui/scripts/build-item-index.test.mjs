import { describe, expect, it } from "vitest";
import { buildIndex, buildSitemap, slugify, splitId } from "./build-item-index.mjs";

const named = (id, name) => ({ UniqueName: id, LocalizedNames: { "EN-US": name } });
const shop = (id, category, sub, weight = 1) => ({ "@uniquename": id, "@shopcategory": category, "@shopsubcategory1": sub, "@weight": String(weight) });

describe("item index", () => {
  it("splits market ids into the base item and its enchantment", () => {
    expect(splitId("T4_BAG")).toEqual({ base: "T4_BAG", enchant: 0 });
    expect(splitId("T4_BAG@3")).toEqual({ base: "T4_BAG", enchant: 3 });
    expect(splitId("T4_PLANKS_LEVEL2@2")).toEqual({ base: "T4_PLANKS", enchant: 2 });
  });

  it("turns names into URL slugs", () => {
    expect(slugify("Adept's Bag")).toBe("adepts-bag");
    expect(slugify("Armored Horse Skin: Arena Veteran")).toBe("armored-horse-skin-arena-veteran");
    expect(slugify("Élder's Robe")).toBe("elders-robe");
  });

  it("keeps market goods once per tier, with their enchantment levels", () => {
    const formatted = [
      named("T4_BAG", "Adept's Bag"),
      named("T4_BAG@1", "Adept's Bag"),
      named("T4_BAG@2", "Adept's Bag"),
      named("T4_PLANKS", "Pine Planks"),
      named("T4_PLANKS_LEVEL1@1", "Uncommon Pine Planks"),
      named("T4_RUNE", "Adept's Rune"),
      named("QUESTITEM_X", "Quest Thing"),
      named("T2_TRASH", "Trash"),
      named("T5_GAP", "Gappy"),
      named("T5_GAP@2", "Gappy")
    ];
    const raw = {
      equipmentitem: [shop("T4_BAG", "bags", "bags", 3.4), shop("T5_GAP", "bags", "bags")],
      simpleitem: [
        shop("T4_PLANKS", "crafting", "refinedresources", 0.51),
        shop("T4_RUNE", "artefacts", "fragments", 0.05),
        shop("QUESTITEM_X", "other", "questitems"),
        shop("T2_TRASH", "other", "trash")
      ]
    };
    expect(buildIndex(formatted, raw)).toEqual([
      ["T4_BAG", "Adept's Bag", "adepts-bag", "bags", "bags", 4, 3.4, 2],
      ["T4_RUNE", "Adept's Rune", "adepts-rune", "artefacts", "fragments", 4, 0.05, 0],
      ["T4_PLANKS", "Pine Planks", "pine-planks", "crafting", "refinedresources", 4, 0.51, ["T4_PLANKS", "T4_PLANKS_LEVEL1@1"]]
    ]);
    // the off-market list drops an item with all its enchantment levels
    expect(buildIndex(formatted, raw, new Set(), new Set(["T4_BAG", "T4_PLANKS"])).map((row) => row[0])).toEqual(["T4_RUNE"]);
  });

  it("gives two items with one name each their own slug", () => {
    const formatted = [named("SKIN_A", "Horse Skin"), named("SKIN_B", "Horse Skin")];
    const raw = { mountskin: [shop("SKIN_A", "vanity", "mounts"), shop("SKIN_B", "vanity", "mounts")] };
    expect(buildIndex(formatted, raw).map((row) => row[2])).toEqual(["horse-skin-skin-a", "horse-skin-skin-b"]);
  });
});

describe("craftable items and sitemap", () => {
  it("marks T4-T8 items the Crafting Calculator knows", () => {
    const formatted = [named("T4_2H_BOW", "Adept's Bow"), named("T3_2H_BOW", "Journeyman's Bow"), named("T4_BAG", "Adept's Bag")];
    const raw = { weapon: [shop("T4_2H_BOW", "weapons", "bow"), shop("T3_2H_BOW", "weapons", "bow")], equipmentitem: [shop("T4_BAG", "bags", "bags")] };
    const rows = buildIndex(formatted, raw, new Set(["2H_BOW"]));
    expect(rows.map((row) => [row[0], row[8]])).toEqual([
      ["T4_BAG", undefined],
      ["T4_2H_BOW", 1],
      ["T3_2H_BOW", undefined]
    ]);
  });

  it("marks items that come in qualities, from the game's maxqualitylevel", () => {
    const formatted = [named("T4_2H_BOW", "Adept's Bow"), named("T5_2H_BOW", "Expert's Bow"), named("T4_RUNE", "Adept's Rune")];
    const raw = {
      weapon: [{ ...shop("T4_2H_BOW", "weapons", "bow"), "@maxqualitylevel": "5" }, { ...shop("T5_2H_BOW", "weapons", "bow"), "@maxqualitylevel": "5" }],
      simpleitem: [shop("T4_RUNE", "artefacts", "fragments")]
    };
    const rows = buildIndex(formatted, raw, new Set(["2H_BOW"]));
    expect(rows.map((row) => [row[0], row[8], row[9]])).toEqual([
      ["T4_2H_BOW", 1, 1],
      ["T4_RUNE", undefined, undefined],
      ["T5_2H_BOW", 1, 1]
    ]);
    const uncraftable = buildIndex(formatted, raw);
    expect(uncraftable[0].slice(8)).toEqual([0, 1]);
  });

  it("lists one URL per item page", () => {
    const xml = buildSitemap([["T4_BAG", "Adept's Bag", "adepts-bag", "bags", "bags", 4, 3.4, 4]], "2026-11-08");
    expect(xml).toContain("<loc>https://blackmarketreader.com/prices/adepts-bag</loc><lastmod>2026-11-08</lastmod>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset')).toBe(true);
  });
});
