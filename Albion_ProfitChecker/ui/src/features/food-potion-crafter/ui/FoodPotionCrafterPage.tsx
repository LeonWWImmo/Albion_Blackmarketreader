import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { assetUrl, onItemIconError } from "@shared/assets/assets";
import { createAuthService, type AuthService } from "@shared/auth/authService";
import { isGuest, buildGuestProfile, exitGuest } from "@shared/auth/guestMode";
import { isCrawler } from "@shared/auth/crawler";
import { RegionService } from "@shared/region/regionService";
import { formatUpdated } from "@shared/time/lastUpdated";
import { useSeo } from "../../../shared/seo/useSeo";
import { SeoHeading } from "../../../shared/seo/SeoHeading";
import { MobileNavBurger, ResponsiveFilters, useSessionState, GuestSignInLink, exitGuestToLogin } from "../../../shared";
import type { City, ConsumableCategory, ConsumableRecipe, MarketRegion, RecipeIngredient } from "../core";
import { buildConsumablePriceSnapshot, ingredientPricesPath, loadIngredients, loadRecipes, outputPricesPath } from "../data";
import { deriveFoodPotionRows, useFoodPotionState } from "../hooks";
import { FoodPotionSpecsModal } from "../specs/FoodPotionSpecsModal";
import { resolveSpecFamily } from "../specs/data";
import { useFoodPotionSpecs } from "../specs/useFoodPotionSpecs";
import "../../bm-crafter/ui/bmCrafter.css";
import "../../crafting-calculator/craftingCalculator.css";
import "./foodPotionCrafter.css";
import { ToolGuideLink } from "@shared/content/ToolGuideLink";

const KNOWN_CITIES: City[] = ["Caerleon", "Brecilien", "Bridgewatch", "Lymhurst", "Fort Sterling", "Martlock", "Thetford"];
const PRICE_STORAGE_KEY = "food-potion-prices-v1";

function iconUrl(itemId: string): string {
  // Enchanted food shares the base item's icon (the @N variants are our synthetic ids).
  return `/itemicons/${itemId.replace(/@\d+$/, "")}.png`;
}

/** Fish sauce used to enchant food: enchant level → sauce item. Fish sauce IS subject to the return rate. */
const FISH_SAUCE_BY_ENCHANT: Record<number, { itemId: string; name: string }> = {
  1: { itemId: "T1_FISHSAUCE_LEVEL1", name: "Basic Fish Sauce" },
  2: { itemId: "T1_FISHSAUCE_LEVEL2", name: "Fancy Fish Sauce" },
  3: { itemId: "T1_FISHSAUCE_LEVEL3", name: "Special Fish Sauce" },
};

/** Arcane extract used to enchant potions: enchant level → extract item. Subject to the return rate. */
const ARCANE_EXTRACT_BY_ENCHANT: Record<number, { itemId: string; name: string }> = {
  1: { itemId: "T1_ALCHEMY_EXTRACT_LEVEL1", name: "Basic Arcane Extract" },
  2: { itemId: "T1_ALCHEMY_EXTRACT_LEVEL2", name: "Refined Arcane Extract" },
  3: { itemId: "T1_ALCHEMY_EXTRACT_LEVEL3", name: "Pure Arcane Extract" },
};

/** The enchant material catalog + the label shown for a category's enchant selector. */
function enchantMaterial(category: ConsumableCategory): {
  byEnchant: Record<number, { itemId: string; name: string }>;
  label: string;
} {
  return category === "potion"
    ? { byEnchant: ARCANE_EXTRACT_BY_ENCHANT, label: "arcane extract" }
    : { byEnchant: FISH_SAUCE_BY_ENCHANT, label: "fish sauce" };
}

/** Units of enchant material this recipe needs (fish sauce for food, arcane extract for potions); 0 = not enchantable. */
function enchantMatQty(recipe: ConsumableRecipe): number {
  return (recipe.category === "potion" ? recipe.arcaneExtractQty : recipe.fishSauceQty) ?? 0;
}

/**
 * Returns the recipe enchanted at the given level (1-3) by adding the enchant material
 * (fish sauce for food, arcane extract for potions) as a returnable ingredient and giving
 * the output a distinct @N id so its sell price is tracked separately from the .0 base.
 */
function withEnchant(recipe: ConsumableRecipe, enchant: number): ConsumableRecipe {
  const qty = enchantMatQty(recipe);
  if (enchant <= 0 || qty <= 0) return recipe;
  const mat = enchantMaterial(recipe.category).byEnchant[enchant];
  if (!mat) return recipe;
  const enchantMat: RecipeIngredient = { itemId: mat.itemId, name: mat.name, qty, tier: 1, returnable: true };
  return {
    ...recipe,
    itemId: `${recipe.itemId}@${enchant}`,
    name: recipe.name, // enchant level is shown via a colored badge, not a name suffix
    ingredients: [...recipe.ingredients, enchantMat],
  };
}

/** Family key — fish sauce levels and enchant (@N) variants collapse into one product. */
function familyBase(itemId: string): string {
  const base = itemId.replace(/^T\d+_/, "").replace(/@\d+$/, "");
  if (/^FISHSAUCE/.test(base)) return "FISHSAUCE";
  return base;
}

/** Enchant level from an item id (T8_MEAL_STEW@2 → 2). */
function enchantOf(itemId: string): 0 | 1 | 2 | 3 {
  const m = itemId.match(/@(\d+)$/);
  const n = m ? Number(m[1]) : 0;
  return (n >= 1 && n <= 3 ? n : 0) as 0 | 1 | 2 | 3;
}

/** Colored enchant badge (.1 green / .2 blue / .3 purple — Albion enchant colors). */
function EnchantBadge({ itemId }: { itemId: string }) {
  const e = enchantOf(itemId);
  if (e === 0) return null;
  const mat = /_POTION/.test(itemId) ? ARCANE_EXTRACT_BY_ENCHANT[e] : FISH_SAUCE_BY_ENCHANT[e];
  return (
    <span className={`fp-chip fp-enchant-chip fp-enchant-${e}`} style={{ marginLeft: 6 }} title={`Enchanted with ${mat.name}`}>
      .{e}
    </span>
  );
}

const FOOD_TYPE_WORDS = ["Sandwich", "Omelette", "Salad", "Roast", "Stew", "Soup", "Pie"];

/**
 * Product label from the first recipe's name.
 * - strips the Minor/Major/... quality prefix
 * - for food, collapses "{ingredient} {Type}" (e.g. Goat Stew, Carrot Soup) to just the food type
 * - tags Fish / Avalon variant families so they stay distinct
 */
function familyLabel(base: string, name: string, category: ConsumableCategory): string {
  if (base === "FISHSAUCE") return "Fish Sauce";
  let label = String(name || "").replace(/^(Minor|Lesser|Major|Greater|Mighty|Superior|Grand)\s+/i, "").trim();
  if (category === "food") {
    const lower = label.toLowerCase();
    const type = FOOD_TYPE_WORDS.find((t) => lower.endsWith(` ${t.toLowerCase()}`) || lower === t.toLowerCase());
    if (type) label = type;
  }
  if (/_FISH$/.test(base)) label = `${label} (Fish)`;
  if (/_AVALON$/.test(base)) label = `${label} (Avalon)`;
  return label;
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return Math.round(value).toLocaleString("de-DE");
}

function formatPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}%`;
}

function parsePrice(raw: string): number {
  const cleaned = String(raw || "").replace(/[^\d.]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Suspect price outlier: the sell price is >= 10x the craft cost, so the implied profit
 * is almost certainly a bad market-data spike. The row is greyed out but still shown.
 */
const SUSPECT_PRICE_FACTOR = 10;
function isSuspectPrice(result: { revenue: number; totalCost: number }): boolean {
  return result.totalCost > 0 && result.revenue >= SUSPECT_PRICE_FACTOR * result.totalCost;
}

function readManualPrices(): Record<string, string> {
  try {
    const stored = localStorage.getItem(PRICE_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    if (parsed && typeof parsed === "object") {
      return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")]));
    }
  } catch {
    /* ignore */
  }
  return {};
}

function sanitizeAvatarUrl(value?: string | null): string {
  const fallback = "/picture/accountsymbol.png";
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return fallback;
  // Reject protocol-relative ("//host") and backslash tricks that escape our origin.
  if (trimmed.startsWith("//") || trimmed.includes("\\")) return fallback;
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:") return url.href;
  } catch {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
  return fallback;
}

function useRegion(): [MarketRegion, (next: MarketRegion) => void] {
  const [service] = useState(() => new RegionService("eu"));
  const [region, setRegion] = useState<MarketRegion>(service.getRegion() as MarketRegion);
  useEffect(() => {
    const off = service.subscribe((next) => setRegion(next as MarketRegion));
    return () => {
      off();
      service.destroy();
    };
  }, [service]);
  // Stable setter — otherwise effects that depend on it re-run every render
  // and reset the region back to the profile value, breaking the toggle.
  const update = useCallback((next: MarketRegion) => service.setRegion(next), [service]);
  return [region, update];
}

interface AccountUser {
  id: string;
  email: string | null;
  avatar: string;
  region: MarketRegion | null;
}

const ACCOUNT_AVATARS = [
  "/picture/accountsymbol.png",
  "/picture/Bridgewatch.png",
  "/picture/Carleon.png",
  "/picture/Martlockwappen.png",
  "/picture/Lymhurstwappen.png",
  "/picture/Thefortwappen.png",
];

export function FoodPotionCrafterPage() {
  const [region, setRegion] = useRegion();
  const [recipes, setRecipes] = useState<ConsumableRecipe[]>([]);
  const [ingredientMeta, setIngredientMeta] = useState<Map<string, RecipeIngredient>>(new Map());
  const [manualPrices, setManualPrices] = useState<Record<string, string>>(() => readManualPrices());
  const [livePriceByItemId, setLivePriceByItemId] = useState<Record<string, number>>({});
  const [soldByItemId, setSoldByItemId] = useState<Record<string, number>>({});
  const [liveUpdatedIso, setLiveUpdatedIso] = useState<string | null>(null);
  const [buyCity, setBuyCity] = useSessionState<City>("fp:buyCity", "Lymhurst");
  const [sellCity, setSellCity] = useSessionState<City>("fp:sellCity", "Lymhurst");
  const [mode, setMode] = useSessionState<"scanner" | "crafter">("fp:mode", "scanner");
  const [selectedFamily, setSelectedFamily] = useSessionState<string | null>("fp:selectedFamily", null);
  // Scanner enchant filter: "all" or a specific level (0 = base, 1/2/3 = enchanted).
  const [scannerEnchant, setScannerEnchant] = useSessionState<"all" | 0 | 1 | 2 | 3>("fp:scannerEnchant", "all");
  const [showSpecsModal, setShowSpecsModal] = useState(false);

  // --- account ---
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [accountActionMsg, setAccountActionMsg] = useState("");
  const accountPanelRef = useRef<HTMLDivElement | null>(null);
  const accountBtnRef = useRef<HTMLButtonElement | null>(null);
  const profileChannelRef = useRef<BroadcastChannel | null>(null);

  const specsState = useFoodPotionSpecs(authService, Boolean(user));

  useSeo({
    title: "Albion Online Food & Potion Crafter | Blackmarket Reader",
    description:
      "Albion Online Food and Potion crafting profit calculator with ingredient costs, return rate, station fees, focus specs, and per-recipe profit analysis.",
    keywords:
      "Albion Online Food Crafter, Albion Potion Crafter, Albion cooking calculator, Albion alchemy calculator, Albion consumable profit",
    canonical: "https://blackmarketreader.com/food-potion-crafter",
    ogTitle: "Albion Online Food & Potion Crafter | Blackmarket Reader",
    ogDescription: "Calculate Albion Online food and potion crafting profit with ingredient prices, return rate, station fees, and focus.",
    ogUrl: "https://blackmarketreader.com/food-potion-crafter",
    ogImage: "https://blackmarketreader.com/picture/Profit-Dashboard.png",
    twitterTitle: "Albion Online Food & Potion Crafter | Blackmarket Reader",
    twitterDescription: "Calculate Albion Online food and potion crafting profit with ingredient prices, return rate, station fees, and focus.",
    twitterImage: "https://blackmarketreader.com/picture/Profit-Dashboard.png",
  });

  useEffect(() => {
    document.body.classList.add("food-potion-crafter-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter", "crafting-calculator-body", "refining-calculator-body");
    return () => document.body.classList.remove("food-potion-crafter-body");
  }, []);

  useEffect(() => {
    const cfg = window.env;
    if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) return;
    setAuthService(createAuthService({ supabaseUrl: cfg.SUPABASE_URL, supabaseAnonKey: cfg.SUPABASE_ANON_KEY }));
  }, []);

  useEffect(() => {
    if (!authService) return;
    let cancelled = false;
    (async () => {
      const session = await authService.getSession().catch(() => null);
      if (cancelled) return;
      if (!session) {
        if (isGuest() || isCrawler()) {
          // Crawlers get the public read-only (guest) view instead of a /login
          // redirect, so search engines can index the tool page content.
          const guest = buildGuestProfile();
          const guestRegion = guest.region === "eu" || guest.region === "us" ? (guest.region as MarketRegion) : null;
          setUser({
            id: guest.id,
            email: guest.email,
            avatar: sanitizeAvatarUrl(guest.avatar || localStorage.getItem("avatar")),
            region: guestRegion,
          });
          if (guestRegion) setRegion(guestRegion);
          return;
        }
        const next = encodeURIComponent(window.location.pathname || "/food-potion-crafter");
        window.location.href = `/login?next=${next}`;
        return;
      }
      exitGuest(); // real session supersedes any stale guest flag (prevents guest UI while logged in)
      const profile = await authService.getUserProfile().catch(() => null);
      if (cancelled || !profile) return;
      if (!profile.emailConfirmed) {
        await authService.signOut().catch(() => undefined);
        const next = encodeURIComponent(window.location.pathname || "/food-potion-crafter");
        window.location.href = `/login?next=${next}`;
        return;
      }
      const normalizedRegion = profile.region === "eu" || profile.region === "us" ? (profile.region as MarketRegion) : null;
      setUser({
        id: profile.id,
        email: profile.email,
        avatar: sanitizeAvatarUrl(profile.avatar || localStorage.getItem("avatar")),
        region: normalizedRegion,
      });
      if (normalizedRegion) setRegion(normalizedRegion);
    })();
    return () => {
      cancelled = true;
    };
  }, [authService, setRegion]);

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
      if (accountPanelRef.current?.contains(target) || accountBtnRef.current?.contains(target)) return;
      setShowAccount(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [showAccount]);

  // Cross-tab avatar sync (matches the other crafter pages).
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

  const onRegionSave = useCallback(
    async (next: MarketRegion) => {
      setRegion(next);
      setUser((prev) => (prev ? { ...prev, region: next } : prev));
      if (authService) await authService.updateUserMetadata({ region: next }).catch(() => undefined);
    },
    [authService, setRegion]
  );

  const onAvatarChange = useCallback(
    async (next: string) => {
      const avatar = sanitizeAvatarUrl(next);
      localStorage.setItem("avatar", avatar);
      profileChannelRef.current?.postMessage({ type: "avatar", value: avatar });
      setUser((prev) => (prev ? { ...prev, avatar } : prev));
      if (authService) await authService.updateUserMetadata({ avatar }).catch(() => undefined);
    },
    [authService]
  );

  const onResetPassword = useCallback(async () => {
    if (!authService || !user?.email) return;
    setAccountActionMsg("");
    const { error } = await authService.client.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/login?next=%2Ffood-potion-crafter`,
    });
    if (error) {
      setAccountActionMsg(error.message || "Password reset failed.");
      return;
    }
    setAccountActionMsg("Email sent");
    window.setTimeout(() => setAccountActionMsg(""), 3000);
  }, [authService, user]);

  const onLogout = useCallback(async () => {
    if (isGuest()) {
      exitGuestToLogin();
      return;
    }
    if (authService) await authService.signOut().catch(() => undefined);
    setUser(null);
    setShowAccount(false);
    window.location.href = "/login?next=%2Ffood-potion-crafter";
  }, [authService]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [food, potions, ingredients] = await Promise.all([loadRecipes("food"), loadRecipes("potion"), loadIngredients()]);
      if (cancelled) return;
      setRecipes([...food, ...potions]);
      setIngredientMeta(new Map(ingredients.map((entry) => [entry.itemId, entry])));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify(manualPrices));
  }, [manualPrices]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ingredientPayload, foodPayload, potionPayload] = await Promise.all([
        fetch(ingredientPricesPath(region)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(outputPricesPath("food", region)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(outputPricesPath("potion", region)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (cancelled) return;
      const foodSnap = buildConsumablePriceSnapshot(ingredientPayload, foodPayload, buyCity, sellCity);
      const potionSnap = buildConsumablePriceSnapshot(ingredientPayload, potionPayload, buyCity, sellCity);
      setLivePriceByItemId({ ...foodSnap.priceByItemId, ...potionSnap.priceByItemId });
      setSoldByItemId({ ...foodSnap.soldByItemId, ...potionSnap.soldByItemId });
      setLiveUpdatedIso(foodSnap.generatedAt ?? potionSnap.generatedAt ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [region, buyCity, sellCity]);

  const priceByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const [itemId, price] of Object.entries(livePriceByItemId)) if (price > 0) map.set(itemId, price);
    for (const [itemId, value] of Object.entries(manualPrices)) {
      const price = parsePrice(value);
      if (price > 0) map.set(itemId, price);
    }
    return map;
  }, [livePriceByItemId, manualPrices]);

  // Scanner shows base recipes PLUS the enchant variants (.1/.2/.3) of each enchantable
  // consumable — food (fish sauce) and potions (arcane extract).
  const scannerRecipes = useMemo(() => {
    const out: ConsumableRecipe[] = [];
    for (const recipe of recipes) {
      out.push(recipe);
      if (enchantMatQty(recipe) > 0) {
        for (const e of [1, 2, 3] as const) out.push(withEnchant(recipe, e));
      }
    }
    return out;
  }, [recipes]);

  const { rows, selectedRow, selectedRowKey, setSelectedRowKey, filters } = useFoodPotionState(scannerRecipes, priceByItemId, specsState.progress);

  const updatePrice = (itemId: string, value: string) => setManualPrices((prev) => ({ ...prev, [itemId]: value }));

  // A row's profit is only trustworthy when every needed ingredient AND a sell price are known.
  const isPriced = (row: { result: { missingIngredientCost: boolean; revenue: number } }) =>
    !row.result.missingIngredientCost && row.result.revenue > 0;

  // Scanner enchant filter: show all, base only (.0), or a specific enchant level (.1/.2/.3).
  const visibleRows = useMemo(
    () => (scannerEnchant === "all" ? rows : rows.filter((row) => enchantOf(row.recipe.itemId) === scannerEnchant)),
    [rows, scannerEnchant]
  );
  // Reflects the active enchant filter so "Profitable" and "Showing" stay consistent.
  const profitableCount = visibleRows.filter((row) => isPriced(row) && row.result.profit > 0).length;

  const selectedTiers = useMemo(() => {
    const tiers = new Set<number>();
    recipes.forEach((recipe) => {
      if (recipe.category === filters.category) tiers.add(recipe.tier);
    });
    return [...tiers].sort((a, b) => a - b);
  }, [recipes, filters.category]);

  const families = useMemo(() => {
    // First recipe (lowest tier) per family supplies the display name.
    const firstByBase = new Map<string, ConsumableRecipe>();
    recipes.forEach((recipe) => {
      if (recipe.category !== filters.category) return;
      const base = familyBase(recipe.itemId);
      const current = firstByBase.get(base);
      if (!current || recipe.tier < current.tier) firstByBase.set(base, recipe);
    });
    return [...firstByBase.entries()]
      .map(([base, recipe]) => ({ base, label: familyLabel(base, recipe.name, filters.category) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [recipes, filters.category]);

  const effectiveFamily = useMemo(() => {
    if (selectedFamily && families.some((f) => f.base === selectedFamily)) return selectedFamily;
    if (selectedRow) return familyBase(selectedRow.recipe.itemId);
    return families[0]?.base ?? null;
  }, [selectedFamily, families, selectedRow]);

  const familyRows = useMemo(() => {
    if (!effectiveFamily) return [];
    // One merged list: every tier of the family PLUS its .1/.2/.3 enchant variants,
    // sorted by profit (priced first) like the scanner — no per-enchant toggle.
    const famRecipes: ConsumableRecipe[] = [];
    for (const recipe of recipes) {
      if (recipe.category !== filters.category || familyBase(recipe.itemId) !== effectiveFamily) continue;
      famRecipes.push(recipe);
      if (enchantMatQty(recipe) > 0) {
        for (const e of [1, 2, 3] as const) famRecipes.push(withEnchant(recipe, e));
      }
    }
    return deriveFoodPotionRows(
      famRecipes,
      { ...filters, selectedTier: null, searchTerm: "", showOnlyProfitable: false },
      priceByItemId
    );
  }, [effectiveFamily, recipes, filters, priceByItemId]);

  const crafterSelected = useMemo(
    () => familyRows.find((row) => row.rowKey === selectedRowKey) ?? familyRows[0] ?? null,
    [familyRows, selectedRowKey]
  );

  // Active spec family for the modal highlight (crafter: selected recipe; scanner: top row).
  const activeSpecFamily = useMemo(() => {
    const recipe = mode === "crafter" ? crafterSelected?.recipe : selectedRow?.recipe;
    return recipe ? resolveSpecFamily(recipe.itemId.replace(/@\d+$/, ""), filters.category) : null;
  }, [mode, crafterSelected, selectedRow, filters.category]);

  const liveUpdated = formatUpdated(liveUpdatedIso);

  return (
    <div className="rc-page fp-page">
      <SeoHeading title="Albion Online Food & Potion Crafter">
        Calculate cooking and alchemy profit in Albion Online. Scan profitable food and potion recipes or enter your own ingredient prices — with return rate, station fees, focus, and all tiers shown per product.
      </SeoHeading>
      <header className="bm-header">
        <MobileNavBurger accent="#4ade80" />
        <div className="bm-header-row">
          <div className="bm-brand">
            <div className="bm-brand-home">
              <div className="bm-logo" aria-hidden="true"><img src={assetUrl("picture/testo ohne background.png")} alt="" /></div>
              <h1>RomulusKings Crafting Tools</h1>
            </div>
            <div className="bm-nav bm-nav-switch">
              <Link className="nav-tab" to="/">Home</Link>
              <Link className="nav-tab" to="/dashboard">Dashboard</Link>
              <Link className="nav-tab" to="/bm-crafter">Blackmarket Crafter</Link>
              <Link className="nav-tab" to="/crafting-calculator">Crafting Calculator</Link>
              <Link className="nav-tab" to="/refining-calculator">Refining Calculator</Link>
              <span className="nav-tab active">Food &amp; Potion Crafter</span>
            </div>
          </div>
          <div className="bm-meta">
            <button className="bm-pill" type="button" onClick={() => setRegion(region === "eu" ? "us" : "eu")}>
              <span className="material-symbols-outlined">language</span>Region: <span>{region.toUpperCase()}</span>
            </button>
            <div className="bm-status" title={liveUpdated.title}><span className="pulse"></span>{liveUpdated.relative ? <>Last updated: <span>{liveUpdated.time}</span><span className="bm-status-ago"> ({liveUpdated.relative})</span></> : "Manual pricing"}</div>
            <div className="account-wrap">
              <button ref={accountBtnRef} className="account-btn" type="button" onClick={() => setShowAccount((p) => !p)} aria-label="Account">
                <img src={user?.avatar || assetUrl("picture/accountsymbol.png")} alt="avatar" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {user ? (
        <div ref={accountPanelRef} className={`account-panel ${showAccount ? "open" : ""}`} onClick={(e) => e.stopPropagation()}>
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
              {ACCOUNT_AVATARS.filter((src) => !src.includes("accountsymbol")).map((src) => (
                <img key={src} src={assetUrl(src.replace(/^\//, ""))} alt="" onClick={() => onAvatarChange(src)} />
              ))}
            </div>
          </div>

          <div className="panel-section">
            <h4>Data region</h4>
            <select className="city-select" value={region} onChange={(e) => onRegionSave(e.target.value === "us" ? "us" : "eu")}>
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
              <button className="btn primary" onClick={onResetPassword}>{accountActionMsg === "Email sent" ? "Email sent" : "Change password"}</button>
            )}
            <button className="btn danger" onClick={onLogout}>{isGuest() ? "Exit guest mode" : "Logout"}</button>
          </div>

          <div className="account-help">
            <span>Need help?</span>
            <a href="https://discord.gg/HF2Ctg73m5" target="_blank" rel="noopener noreferrer">Join Discord</a>
            <a href="mailto:blackmarketreader@gmail.com">blackmarketreader@gmail.com</a>
          </div>
        </div>
      ) : null}

      <div className="fp-category-bar">
        <div className="fp-category-tabs">
          {([
            { category: "food", mode: "scanner", label: "Cooking Scanner", icon: "restaurant" },
            { category: "food", mode: "crafter", label: "Cooking Crafter", icon: "restaurant" },
            { category: "potion", mode: "scanner", label: "Potion Scanner", icon: "science" },
            { category: "potion", mode: "crafter", label: "Potion Crafter", icon: "science" },
          ] as const).map((tab) => {
            const active = filters.category === tab.category && mode === tab.mode;
            return (
              <button
                key={`${tab.category}-${tab.mode}`}
                type="button"
                data-category={tab.category}
                className={`fp-category-tab ${active ? "active" : ""}`}
                onClick={() => {
                  if (filters.category !== tab.category) filters.setCategory(tab.category);
                  setMode(tab.mode);
                }}
              >
                <span className="material-symbols-outlined">{tab.icon}</span>{tab.label}
              </button>
            );
          })}
        </div>
        <button type="button" className="fp-specs-trigger" onClick={() => setShowSpecsModal(true)}>
          <span className="material-symbols-outlined">workspace_premium</span>
          Manage Specs
          {specsState.pendingSync ? <span className="badge">Saving…</span> : null}
        </button>
      </div>

      <ResponsiveFilters title="Filters" accent="#4ade80">
      <section className="fp-controls fp-controls-static">
        <div className="fp-filter-grid">
          <div className="fp-field">
            <label>Amount</label>
            <input className="fp-control" inputMode="numeric" value={filters.amount} onChange={(e) => filters.setAmount(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div className="fp-field">
            <label>Usage Fee</label>
            <input className="fp-control" inputMode="numeric" value={filters.usageFee} onChange={(e) => filters.setUsageFee(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="fp-field">
            <label>Craft City</label>
            <select className="fp-control" value={filters.craftCity} onChange={(e) => filters.setCraftCity(e.target.value as City)}>
              {KNOWN_CITIES.map((city) => (<option key={city} value={city}>{city}</option>))}
            </select>
          </div>
          <div className="fp-field">
            <label>Buy City</label>
            <select className="fp-control" value={buyCity} onChange={(e) => setBuyCity(e.target.value as City)}>
              {KNOWN_CITIES.map((city) => (<option key={city} value={city}>{city}</option>))}
            </select>
          </div>
          <div className="fp-field">
            <label>Sell City</label>
            <select className="fp-control" value={sellCity} onChange={(e) => setSellCity(e.target.value as City)}>
              {KNOWN_CITIES.map((city) => (<option key={city} value={city}>{city}</option>))}
            </select>
          </div>
          <div className="fp-field">
            <label>Return Profile</label>
            <select className="fp-control" value={filters.returnRatePreset} onChange={(e) => filters.setReturnRatePreset(e.target.value as typeof filters.returnRatePreset)}>
              <option value="base">Royal Base</option>
              <option value="city">Auto City Bonus</option>
              <option value="focus">Auto City + Focus</option>
              <option value="custom">Custom %</option>
            </select>
          </div>
          {filters.returnRatePreset === "custom" ? (
            <div className="fp-field">
              <label>Custom Return %</label>
              <input className="fp-control" inputMode="decimal" value={filters.customReturnRatePct} onChange={(e) => filters.setCustomReturnRatePct(Math.max(0, Math.min(99, Number(e.target.value) || 0)))} />
            </div>
          ) : null}
          <div className="fp-field">
            <label>Market Tax %</label>
            <input className="fp-control" inputMode="decimal" value={(filters.marketTaxRate * 100).toFixed(1)} onChange={(e) => filters.setMarketTaxRate(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)} />
          </div>
          {mode === "scanner" ? (
            <div className="fp-field fp-field-wide">
              <label>Tier</label>
              <div className="chip-row">
                {selectedTiers.map((tier) => (
                  <button key={tier} type="button" className={`chip ${filters.selectedTier === tier ? "active" : ""}`} onClick={() => filters.toggleTier(tier)}>T{tier}</button>
                ))}
              </div>
            </div>
          ) : null}
          {mode === "scanner" ? (
            <div className="fp-field fp-field-wide">
              <label>Enchant</label>
              <div className="chip-row">
                <button type="button" className={`chip ${scannerEnchant === "all" ? "active" : ""}`} onClick={() => setScannerEnchant("all")}>All</button>
                {([0, 1, 2, 3] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={`chip ${scannerEnchant === e ? `active ${e > 0 ? `fp-enchant-chip-active fp-enchant-${e}` : ""}` : ""}`}
                    onClick={() => setScannerEnchant(e)}
                  >
                    .{e}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {mode === "scanner" ? (
            <div className="fp-field fp-field-wide">
              <label>Search</label>
              <div className="search-field">
                <input type="search" value={filters.searchTerm} onChange={(e) => filters.setSearchTerm(e.target.value)} placeholder="Recipe or ingredient" />
                <span className="material-symbols-outlined">search</span>
              </div>
            </div>
          ) : null}
          {mode === "scanner" ? (
            <div className="fp-field">
              <label>Profitable Only</label>
              <label className="fp-toggle-field">
                <input type="checkbox" checked={filters.showOnlyProfitable} onChange={(e) => filters.setShowOnlyProfitable(e.target.checked)} />
                <span>Hide losses</span>
              </label>
            </div>
          ) : null}
        </div>
      </section>
      </ResponsiveFilters>

      <main className={`bm-main rc-main fp-main fp-main-${mode}`}>
        {mode === "scanner" ? (
          <section className="bm-table expanded">
            <div className="fp-summary-bar">
              <div className="fp-summary-stat"><span>Profitable</span><strong className="profit">{profitableCount}</strong></div>
              <div className="fp-summary-divider" />
              <div className="fp-summary-stat"><span>Showing</span><strong>{visibleRows.length}</strong></div>
              <div className="fp-summary-divider" />
              <div className="fp-summary-stat"><span>Category</span><strong>{filters.category === "food" ? "Food" : "Potions"}</strong></div>
              <div className="fp-summary-divider" />
              <div className="fp-summary-stat"><span>Return</span><strong className="fp-return-rate">{selectedRow ? formatPct(selectedRow.result.returnRate * 100) : "--"}</strong></div>
            </div>
            <div className="table-wrap custom-scrollbar fp-scanner-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Recipe</th><th className="num">Output</th><th className="num">Return</th>
                    <th className="num">Craft Cost</th><th className="num">Sell Price</th>
                    <th className="num">Profit</th><th className="num">Profit %</th><th className="num">Silver / Focus</th><th className="num">Sold / Day (all cities)</th>
                  </tr>
                </thead>
                <tbody>
                  {!visibleRows.length ? (<tr><td colSpan={9}>No recipes match — enter ingredient prices or adjust filters.</td></tr>) : null}
                  {visibleRows.map((row, index) => {
                    const priced = isPriced(row);
                    const suspect = isSuspectPrice(row.result);
                    return (
                    <tr
                      key={row.rowKey}
                      className={`high-density-row fp-clickable-row ${index % 2 === 1 ? "alt" : ""} ${selectedRowKey === row.rowKey ? "selected-row" : ""} ${row.recipe.isAvalonian ? "fp-avalonian-row" : ""} ${priced ? "" : "fp-unpriced-row"} ${suspect ? "fp-suspect-row" : ""}`}
                      title={suspect ? "Sell price is 10x+ the craft cost - likely bad market data" : "Open in crafter"}
                      onClick={() => { setSelectedFamily(familyBase(row.recipe.itemId)); setSelectedRowKey(row.rowKey); setMode("crafter"); }}
                    >
                      <td>
                        <div className="item">
                          <div className="item-info">
                            <div className="fp-item-icon"><img src={iconUrl(row.recipe.itemId)} alt="" loading="lazy" onError={onItemIconError} /></div>
                            <div>
                              <div className="item-name">
                                {row.recipe.name}
                                <EnchantBadge itemId={row.recipe.itemId} />
                                {priced ? null : <span className="fp-chip fp-missing-chip" style={{ marginLeft: 6 }}>No price</span>}
                                {row.recipe.isAvalonian ? <span className="fp-chip fp-avalonian-chip" style={{ marginLeft: 6 }}>Avalon</span> : null}
                              </div>
                              {suspect ? <div className="fp-suspect-note">This profit looks unrealistic — market price probably not real</div> : null}
                              <div className="item-meta">T{row.recipe.tier} · {row.recipe.ingredients.length} ingredients</div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="num">{formatNumber(row.result.outputAmount)}</td>
                      <td className="num fp-return-cell">{formatPct(row.result.returnRate * 100)}</td>
                      <td className="num">{priced ? formatNumber(row.result.totalCost / row.result.outputAmount) : "--"}</td>
                      <td className="num">{(() => { const p = priceByItemId.get(row.recipe.itemId) ?? 0; return p > 0 ? formatNumber(p) : "--"; })()}</td>
                      <td className={`num ${priced ? (row.result.profitPerOutput >= 0 ? "profit" : "loss") : ""}`}>{priced ? `${row.result.profitPerOutput >= 0 ? "+" : ""}${formatNumber(row.result.profitPerOutput)}` : "--"}</td>
                      <td className={`num ${priced ? (row.result.profit >= 0 ? "profit" : "loss") : ""}`}>{priced ? formatPct(row.result.profitPercent) : "--"}</td>
                      <td className={`num ${priced && (row.result.silverPerFocus ?? 0) >= 0 ? "profit" : priced ? "loss" : ""}`}>{priced && row.result.silverPerFocus !== null ? formatNumber(row.result.silverPerFocus) : "--"}</td>
                      <td className="num">{(() => { const s = soldByItemId[row.recipe.itemId] ?? 0; return s > 0 ? formatNumber(s) : "--"; })()}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <p>Showing {visibleRows.length} {filters.category === "food" ? "food" : "potion"} recipes</p>
              <p>Region {region.toUpperCase()} · profit shown only when prices are complete</p>
            </div>
          </section>
        ) : (
          <section className="fp-crafter-stage fp-crafter-full">
            <div className="fp-crafter-toolbar">
              <div className="fp-recipe-picker">
                <span className="cc-caption">Product</span>
                <select className="fp-control" value={effectiveFamily ?? ""} onChange={(e) => setSelectedFamily(e.target.value || null)}>
                  {families.length === 0 ? <option value="">No products available</option> : null}
                  {families.map((f) => (<option key={f.base} value={f.base}>{f.label}</option>))}
                </select>
              </div>
              <span className="fp-batch-badge">
                Table <strong>per item</strong> · calculator per <strong>craft</strong>
                {crafterSelected ? <> · 1 craft → <strong>{crafterSelected.recipe.outputQty}</strong> item{crafterSelected.recipe.outputQty === 1 ? "" : "s"}</> : null}
              </span>
            </div>

            <div className="fp-tier-wrap table-wrap custom-scrollbar">
              <table>
                <thead>
                  <tr>
                    <th>Tier</th><th>Recipe</th>
                    <th className="num">Yield / craft</th><th className="num">Return</th>
                    <th className="num">Ingredient Cost</th><th className="num">Station Fee</th><th className="num">Sell Price</th>
                    <th className="num">Profit</th><th className="num">Profit %</th><th className="num">Silver / Focus</th><th className="num">Sold / Day (all cities)</th>
                  </tr>
                </thead>
                <tbody>
                  {familyRows.length === 0 ? (<tr><td colSpan={11}>No tiers for this product.</td></tr>) : null}
                  {familyRows.map((row) => { const rowPriced = isPriced(row); return (
                    <tr
                      key={row.rowKey}
                      className={`high-density-row ${crafterSelected?.rowKey === row.rowKey ? "selected-row" : ""} ${row.recipe.isAvalonian ? "fp-avalonian-row" : ""} ${isSuspectPrice(row.result) ? "fp-suspect-row" : ""}`}
                      title={isSuspectPrice(row.result) ? "Sell price 10x+ craft cost - likely bad market data" : undefined}
                      onClick={() => setSelectedRowKey(row.rowKey)}
                    >
                      <td><span className="badge-chip">T{row.recipe.tier}</span></td>
                      <td>
                        <div className="item"><div className="item-info">
                          <div className="fp-item-icon"><img src={iconUrl(row.recipe.itemId)} alt="" loading="lazy" onError={onItemIconError} /></div>
                          <div>
                            <div className="item-name">{row.recipe.name}<EnchantBadge itemId={row.recipe.itemId} />{row.result.missingIngredientCost ? " *" : ""}{row.recipe.isAvalonian ? <span className="fp-chip fp-avalonian-chip" style={{ marginLeft: 6 }}>Avalon</span> : null}</div>
                            {isSuspectPrice(row.result) ? <div className="fp-suspect-note">This profit looks unrealistic — market price probably not real</div> : null}
                          </div>
                        </div></div>
                      </td>
                      <td className="num">{formatNumber(row.recipe.outputQty)}</td>
                      <td className="num fp-return-cell">{formatPct(row.result.returnRate * 100)}</td>
                      <td className="num">{rowPriced ? formatNumber(row.result.grossIngredientCost / row.result.outputAmount) : "--"}</td>
                      <td className="num muted">{formatNumber(row.result.stationFee / row.result.outputAmount)}</td>
                      <td className="num">{(() => { const p = priceByItemId.get(row.recipe.itemId) ?? 0; return p > 0 ? formatNumber(p) : "--"; })()}</td>
                      <td className={`num ${rowPriced ? (row.result.profitPerOutput >= 0 ? "profit" : "loss") : ""}`}>{rowPriced ? `${row.result.profitPerOutput >= 0 ? "+" : ""}${formatNumber(row.result.profitPerOutput)}` : "--"}</td>
                      <td className={`num ${rowPriced ? (row.result.profit >= 0 ? "profit" : "loss") : ""}`}>{rowPriced ? formatPct(row.result.profitPercent) : "--"}</td>
                      <td className={`num ${rowPriced && (row.result.silverPerFocus ?? 0) >= 0 ? "profit" : rowPriced ? "loss" : ""}`}>{rowPriced && row.result.silverPerFocus !== null ? formatNumber(row.result.silverPerFocus) : "--"}</td>
                      <td className="num">{(() => { const s = soldByItemId[row.recipe.itemId] ?? 0; return s > 0 ? formatNumber(s) : "--"; })()}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>

            {crafterSelected ? (() => {
              // The calculator shows ONE real craft: the actual whole ingredient amounts you must buy
              // (a craft is indivisible — e.g. 16 Carrots → 10 Carrot Soups), plus its cost/profit.
              // Per-item figures are shown alongside for comparing recipes. Profit only once every
              // ingredient AND a sell price are known.
              const oq = crafterSelected.recipe.outputQty || 1; // items produced by one craft
              const crafts = Math.max(1, Math.floor(filters.amount)); // craft actions in result totals
              const items = crafterSelected.result.outputAmount || 1; // = oq * crafts
              const perCraft = (v: number) => v / crafts; // normalise result totals to one craft
              const perItem = (v: number) => v / items; // normalise to one finished item
              const cPriced = isPriced(crafterSelected);
              return (
              <div className="fp-workbench-inline">
                <div className="fp-workbench-title">
                  <span className="material-symbols-outlined">calculate</span>
                  <div>
                    <h3>{crafterSelected.recipe.name}<EnchantBadge itemId={crafterSelected.recipe.itemId} /> · Calculator</h3>
                    <p>Edit ingredient + sell prices — profit updates live</p>
                  </div>
                </div>
                <div className="detail-grid-12">
                  <div className="bento-card span-8">
                    <div className="bento-card-inner-head">
                      <div className="cc-caption">Output Sell Price (per item)</div>
                      <div className="fp-output-price">
                        <input
                          inputMode="numeric"
                          value={manualPrices[crafterSelected.recipe.itemId] ?? ""}
                          onChange={(e) => updatePrice(crafterSelected.recipe.itemId, e.target.value)}
                          placeholder={livePriceByItemId[crafterSelected.recipe.itemId] ? String(livePriceByItemId[crafterSelected.recipe.itemId]) : "enter sell price"}
                        />
                      </div>
                    </div>
                    <div className="material-head">
                      <span className="cc-caption">Ingredients · 1 craft → {oq} item{oq === 1 ? "" : "s"} · edit unit prices</span>
                      <span className="material-total">Total / craft: {formatNumber(perCraft(crafterSelected.result.grossIngredientCost))}</span>
                    </div>
                    <div className="fp-ingredient-list">
                      {crafterSelected.recipe.ingredients.map((ingredient) => {
                        const isToken = /QUESTITEM_TOKEN_AVALON/.test(ingredient.itemId);
                        const unit = priceByItemId.get(ingredient.itemId) ?? 0;
                        // Whole recipe amount for one craft — what you actually buy to craft it.
                        const total = unit * ingredient.qty;
                        const livePlaceholder = livePriceByItemId[ingredient.itemId];
                        const meta = ingredientMeta.get(ingredient.itemId);
                        const rare = ingredient.rare || meta?.rare;
                        return (
                          <div key={ingredient.itemId} className={`fp-ingredient-row ${rare ? "rare" : ""} ${isToken ? "token" : ""}`}>
                            <div className="fp-ingredient-main">
                              <span className="fp-ingredient-icon"><img src={iconUrl(ingredient.itemId)} alt="" loading="lazy" onError={onItemIconError} /></span>
                              <span className="fp-ingredient-qty">{ingredient.qty}×</span>
                              <span className="fp-ingredient-name">{ingredient.name}</span>
                              {rare ? <span className="fp-chip fp-rare-chip">Rare</span> : null}
                              {isToken ? <span className="fp-chip fp-avalonian-chip">Token</span> : null}
                            </div>
                            <div className="fp-ingredient-meta">
                              <input
                                className="fp-ingredient-price"
                                inputMode="numeric"
                                value={manualPrices[ingredient.itemId] ?? ""}
                                onChange={(e) => updatePrice(ingredient.itemId, e.target.value)}
                                placeholder={livePlaceholder ? String(livePlaceholder) : "unit"}
                              />
                              <span className="fp-ingredient-total">{total > 0 ? formatNumber(total) : "-"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bento-card span-4 fp-summary-card">
                    <div className="fp-summary-card-head">
                      <span className="cc-caption">Profit Summary · 1 craft ({oq} item{oq === 1 ? "" : "s"})</span>
                      <span className={`fp-summary-pill ${!cPriced ? "" : crafterSelected.result.profit >= 0 ? "profit" : "loss"}`}>
                        {!cPriced ? "Incomplete" : crafterSelected.result.profit >= 0 ? "Profit" : "Loss"}
                      </span>
                    </div>
                    <div className="fp-summary-hero">
                      <span className="fp-summary-hero-label">Profit / Craft</span>
                      <strong className={!cPriced ? "" : crafterSelected.result.profit >= 0 ? "profit-cell" : "loss-cell"}>
                        {cPriced ? `${crafterSelected.result.profit >= 0 ? "+" : ""}${formatNumber(perCraft(crafterSelected.result.profit))}` : "--"}
                      </strong>
                      <span className="fp-summary-hero-sub">{cPriced ? `ROI ${formatPct(crafterSelected.result.profitPercent)} · ${crafterSelected.result.profitPerOutput >= 0 ? "+" : ""}${formatNumber(crafterSelected.result.profitPerOutput)} / item` : "prices incomplete"}</span>
                    </div>
                    <div className="fp-summary-grid">
                      <div><span>Ingredient Cost</span><strong>{formatNumber(perCraft(crafterSelected.result.grossIngredientCost))}</strong></div>
                      <div><span>Return Saved</span><strong className="profit-cell">−{formatNumber(perCraft(crafterSelected.result.returnedIngredientCost))}</strong></div>
                      <div><span>Station Fee</span><strong>{formatNumber(perCraft(crafterSelected.result.stationFee))}</strong></div>
                      <div><span>Market Tax</span><strong>{cPriced ? formatNumber(perCraft(crafterSelected.result.marketTax)) : "--"}</strong></div>
                      <div><span>Total Cost</span><strong>{cPriced ? formatNumber(perCraft(crafterSelected.result.totalCost)) : "--"}</strong></div>
                      <div><span>Net Revenue</span><strong>{cPriced ? formatNumber(perCraft(crafterSelected.result.netRevenue)) : "--"}</strong></div>
                      <div><span>Return Rate</span><strong className="fp-return-rate">{formatPct(crafterSelected.result.returnRate * 100)}</strong></div>
                      <div><span>Focus Cost</span><strong>{crafterSelected.result.focusCost > 0 ? formatNumber(perCraft(crafterSelected.result.focusCost)) : "--"}</strong></div>
                      <div><span>Silver / Focus</span><strong className={!cPriced ? "" : (crafterSelected.result.silverPerFocus ?? 0) >= 0 ? "profit-cell" : "loss-cell"}>{cPriced && crafterSelected.result.silverPerFocus !== null ? formatNumber(crafterSelected.result.silverPerFocus) : "--"}</strong></div>
                      <div><span>Cost / Item</span><strong>{cPriced ? formatNumber(perItem(crafterSelected.result.totalCost)) : "--"}</strong></div>
                      <div><span>Profit / Item</span><strong className={!cPriced ? "" : crafterSelected.result.profitPerOutput >= 0 ? "profit-cell" : "loss-cell"}>{cPriced ? formatNumber(crafterSelected.result.profitPerOutput) : "--"}</strong></div>
                      <div><span>Sold / Day</span><strong>{(soldByItemId[crafterSelected.recipe.itemId] ?? 0) > 0 ? formatNumber(soldByItemId[crafterSelected.recipe.itemId]) : "--"}</strong></div>
                    </div>
                  </div>
                </div>
              </div>
              );
            })() : null}
          </section>
        )}
      </main>

      <ToolGuideLink slug="food-potion-crafter" authService={authService} />

      <FoodPotionSpecsModal
        open={showSpecsModal}
        category={filters.category}
        progress={specsState.progress}
        activeFamily={activeSpecFamily}
        pendingSync={specsState.pendingSync}
        readOnly={isGuest()}
        onMastery={specsState.setMastery}
        onSpec={specsState.setSpec}
        onReset={specsState.resetCategory}
        onClose={() => setShowSpecsModal(false)}
      />
    </div>
  );
}
