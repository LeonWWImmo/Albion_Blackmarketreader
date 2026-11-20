# Albion Profit Checker — UI

React + TypeScript + Vite web app for Albion Online market profit analysis.
Live deployment: [blackmarketreader.com](https://blackmarketreader.com)

## Features

### Black Market Crafter (`/bm-crafter`)
Quick view of profitable Black Market items.
- Filters: tier, enchantment, min sold/day, return rate, craft city, usage fee
- Per-city material price lookup (Lymhurst default)
- Station fee in profit calc (using Albion item-value × 0.1125 × usage-fee/100)
- Profit per focus, daily potential, sold/day per item
- Auto-filter items with artefacts that have no live price

### Crafting Calculator (`/crafting-calculator`)
Detailed per-tier/enchant profit matrix for any craftable item.
- Material prices as **unit price** (auto-multiplied by recipe quantity)
- Sold/Day column (informational, no calc impact)
- Side panel: Materials Required breakdown, Silver per Focus
- Bonus city, daily bonus, focus toggle, premium tax
- Black Market vs city sell mode

### Refining Calculator (`/refining-calculator`)
Per-material refining profit analysis (metal, wood, fiber, hide, stone) for all tier/enchant combinations.
- Albion-correct refining recipes (see `REFINING_LOGIC.md`)
- Return rate presets: Royal (15.25%), City Bonus (36.7%), City + Focus (53.9%)
- Per-material focus specs (Mastery × 30 + TierSpec × 250)
- Bonus city overrides per material
- Custom market tax modes (premium/non-premium/custom)

### Food & Potion Crafter (`/food-potion-crafter`)
Consumable crafting profit analysis with an internal Food ⇄ Potion tab (see `FOOD_POTION_LOGIC.md`).
- 68 food + 43 potion recipes extracted from verified source data
- Cook (Caerleon) / Alchemist (Brecilien) local production bonus
- Return rate presets, station kind (city/hideout/island), flat station fee per craft
- Manual ingredient pricing with optional live price snapshot
- Avalonian recipes + rare alchemy ingredients highlighted
- Per-ingredient breakdown, profit/item, demand-based daily potential

## Setup

```bash
npm install
npm run dev          # Vite dev server on http://localhost:5173
npm run build        # type-check + production build to dist/
npm run preview      # serve the production build
npm test             # run vitest suite
npm run test:watch   # vitest in watch mode
```

## Data Refresh

Market data is fetched into `public/data/` JSON files:

```bash
npm run refresh:crafting-data      # both regions
npm run refresh:crafting-data:eu   # EU only
npm run refresh:crafting-data:us   # US only

npm run refresh:food-potion-data     # food + potion ingredient & output prices, both regions
npm run refresh:food-potion-data:eu  # EU only
npm run refresh:food-potion-data:us  # US only
```

### Data files in `public/data/`
- `bm-crafter-{eu|us}.json` — Black Market prices + sold/day (flat)
- `materials-{eu|us}.json` — flat material prices (legacy/fallback)
- `materials-cities-{eu|us}.json` — per-city material prices (`Map<itemId, Record<city, number>>`)
- `artefacts-{eu|us}.json` — artefact prices per item ID
- `raw-materials-cities-{eu|us}.json` — raw resource prices per city
- `items-categorized-crafting.json` — crafting recipes (materials + artefact + qty)
- `recipes-food.json` / `recipes-potions.json` — food/potion recipes (ingredients + qty + output)
- `consumable-ingredients.json` — unique food/potion ingredient master list
- `consumable-ingredient-prices-{eu|us}.json` — ingredient prices per city
- `food-prices-{eu|us}.json` / `potion-prices-{eu|us}.json` — crafted consumable prices per city

## Key Formulas

- **Return rate**: `1 - 1 / (1 + bonusPercent/100)`
  - Royal base 18% → 15.25%
  - + City 40% → 36.7%
  - + Focus 59% → 53.9%
- **Craft cost**: `materials × (1 - returnRate) + artefact + stationFee`
  (artefacts are NEVER returned; only common refined materials)
- **Station fee**: `itemValue × 0.1125 × (usageFeePer100 / 100)`
- **Refining enchanted raw qty**: same as non-enchanted (T4: 2, T5: 3, T6: 4, T7/T8: 5)
- **Refining sub-material**: `tier-1`, same enchant level (T4 enchanted falls back to T3.0)
- **Focus cost reduction**: `baseFocusCost / 2^(efficiency / 10000)`,
  efficiency = `mastery × 30 + tierSpec × 250` (max 33 600 → ~10× cheaper)

## Tech Stack

- **React 18** + **TypeScript 5.7** + **Vite 6.4**
- **vitest** for unit + integration tests
- **react-router-dom** for routing
- **@supabase/supabase-js** for auth (email/password + reset)
- **@vercel/analytics** + **@vercel/speed-insights** for metrics
- **Lemon Squeezy** for premium subscriptions (`api/billing.js`, webhook + checkout link, no SDK)

## Project Conventions

- Tool routes live in `src/features/<tool-name>/`
- Non-tool routes live in `src/pages/`
- Shared reusable code lives in `src/shared/`
- Pure calculation logic lives in `<feature>/core/` or `<feature>/domain/` and is unit-tested
- UI shells (page components) compose hooks + pure logic
- Static assets are loaded from `/public` via root-relative URLs (`/data/...`, `/picture/...`)

## Testing

42 tests across 8 files. Coverage:
- BM Crafter: economics, derive-rows, parity vs legacy formula, data normalizers, paths
- Crafting Calculator: economics, pricing helpers, ID builders
- Refining Calculator: core formula, ingredient recipes (enchanted + non-enchanted), live mapping

```bash
npm test
```

## Security

Dependencies pinned via `overrides` in `package.json` to address known CVEs in transitive deps (vite, qs, postcss, picomatch, ws). Run `npm audit` to verify.
