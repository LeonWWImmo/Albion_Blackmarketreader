import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calculateItemEconomics, getArtefactPriceFromMap, getMaterialPriceFromMap, normalizeItemId, parseEnchant, parseTier } from "../domain";
import { normalizeCityMaterialsPayload, normalizeMarketPayload, normalizePricePayload, normalizeRecipesPayload } from "../data";
import { deriveBmCrafterRows } from "./deriveRows";

function loadJson(relativePathFromRepoRoot: string): unknown {
  const fullPath = path.resolve(process.cwd(), relativePathFromRepoRoot);
  return JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
}

function buildRealBundle(region: "eu" | "us") {
  const marketPayload = loadJson(`public/data/bm-crafter-${region}.json`);
  const materialsPayload = loadJson(`public/data/materials-${region}.json`);
  const cityMaterialsPayload = loadJson(`public/data/materials-cities-${region}.json`);
  const artefactsPayload = loadJson(`public/data/artefacts-${region}.json`);
  const recipesPayload = loadJson("public/items-categorized-crafting.json");

  return {
    region,
    market: normalizeMarketPayload(marketPayload, region),
    materials: normalizePricePayload(materialsPayload, region),
    cityMaterials: normalizeCityMaterialsPayload(cityMaterialsPayload),
    artefacts: normalizePricePayload(artefactsPayload, region),
    recipes: normalizeRecipesPayload(recipesPayload)
  };
}

describe("bm crafter parity integration", () => {
  it("derives stable profitable rows from real US dataset", () => {
    const bundle = buildRealBundle("us");
    const options = {
      selectedTiers: [],
      selectedEnchants: [],
      minSold: 0,
      searchTerm: "",
      returnRate: 0.1525,
      sortByDailyTop: false,
      showOnlyProfitable: false,
      nonArtefactOnly: false,
      craftCity: "Caerleon",
      usageFeePer100: 0
    };
    const all = deriveBmCrafterRows(bundle, options);
    const rows = deriveBmCrafterRows(bundle, { ...options, showOnlyProfitable: true });

    // The committed dataset is refreshed daily and the tool only lists crafts with 20%+ profit,
    // so how many rows show is up to that day's market (12 on 2026-10-14, which failed a fixed
    // "more than 20" floor). What does not depend on the market is that the pipeline can price
    // the dataset: count the items whose craft cost it can work out from the committed prices.
    const cityPrices = new Map(Array.from(bundle.cityMaterials.entries(), ([id, prices]) => [id, prices["Caerleon"] ?? 0]));
    let priced = 0;
    for (const item of bundle.market.items) {
      const recipe = bundle.recipes.byItemId.get(normalizeItemId(item.id));
      if (!recipe) continue;
      const economics = calculateItemEconomics({
        item,
        recipe,
        returnRate: 0.1525,
        usageFeePer100: 0,
        getMaterialPrice: (materialId, t, e) => getMaterialPriceFromMap(cityPrices, materialId, t, e),
        getArtefactPrice: (artefactId, t) => getArtefactPriceFromMap(bundle.artefacts.byItemId, artefactId, t)
      });
      if (economics && Number.isFinite(economics.craftCost) && economics.craftCost > 0) priced += 1;
    }
    expect(priced).toBeGreaterThan(100);
    // and that rows still come out of it (any count: the market decides how many reach 20%)
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(all.length);

    for (const row of rows.slice(0, 200)) {
      expect(Number.isFinite(row.economics.craftCost)).toBe(true);
      expect(Number.isFinite(row.economics.profit)).toBe(true);
      expect(row.economics.profit).toBeGreaterThanOrEqual(0);
      expect(row.economics.profitPct as number).toBeGreaterThanOrEqual(20);
    }

    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1].economics.profitPct ?? Number.NEGATIVE_INFINITY;
      const curr = rows[i].economics.profitPct ?? Number.NEGATIVE_INFINITY;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it("matches legacy formula for a sampled row with fully available pricing", () => {
    const bundle = buildRealBundle("eu");
    const rows = deriveBmCrafterRows(bundle, {
      selectedTiers: [],
      selectedEnchants: [],
      minSold: 0,
      searchTerm: "",
      returnRate: 0.1525,
      sortByDailyTop: false,
      showOnlyProfitable: false,
      nonArtefactOnly: false,
      craftCity: "Caerleon",
      usageFeePer100: 0
    });

    const sample = rows.find((row) => {
      const tier = parseTier(row.item.id);
      if (!tier) return false;
      return row.recipe.materials.every((m) => {
        const key = row.enchant > 0 ? `T${tier}_${m.itemId}_LEVEL${row.enchant}@${row.enchant}` : `T${tier}_${m.itemId}`;
        const cityPrices = bundle.cityMaterials.get(key);
        return typeof cityPrices?.["Caerleon"] === "number" && cityPrices["Caerleon"] > 0;
      });
    });

    expect(sample).toBeTruthy();
    if (!sample) return;

    const tier = parseTier(sample.item.id);
    const enchant = parseEnchant(sample.item.id);
    const recipe = bundle.recipes.byItemId.get(normalizeItemId(sample.item.id));
    expect(tier).toBeTruthy();
    expect(recipe).toBeTruthy();
    if (!tier || !recipe) return;

    let materialSum = 0;
    for (const mat of recipe.materials) {
      const matKey = enchant > 0 ? `T${tier}_${mat.itemId}_LEVEL${enchant}@${enchant}` : `T${tier}_${mat.itemId}`;
      const unit = bundle.cityMaterials.get(matKey)?.["Caerleon"];
      expect(unit).toBeTypeOf("number");
      materialSum += (unit as number) * mat.qty;
    }

    let craftCost = materialSum * (1 - 0.1525);
    if (recipe.artifactId) {
      const artefactKey = `T${tier}_${recipe.artifactId}`;
      const artefactPrice = bundle.artefacts.byItemId.get(artefactKey);
      if (typeof artefactPrice === "number") {
        craftCost += artefactPrice;
      }
    }

    expect(sample.economics.craftCost).toBeCloseTo(craftCost, 6);
    expect(sample.economics.profit).toBeCloseTo((sample.item.bm as number) - craftCost, 6);
  });
});
