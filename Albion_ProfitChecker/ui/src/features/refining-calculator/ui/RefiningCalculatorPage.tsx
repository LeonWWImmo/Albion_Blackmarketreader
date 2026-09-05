import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { assetUrl } from "@shared/assets/assets";
import { createAuthService, type AuthService } from "@shared/auth/authService";
import { isGuest, buildGuestProfile, exitGuest } from "@shared/auth/guestMode";
import { isCrawler } from "@shared/auth/crawler";
import { RegionService } from "@shared/region/regionService";
import { formatUpdated } from "@shared/time/lastUpdated";
import { useSeo } from "../../../shared/seo/useSeo";
import { SeoHeading } from "../../../shared/seo/SeoHeading";
import { MobileNavBurger, ResponsiveFilters, useSessionState, GuestSignInLink, exitGuestToLogin } from "../../../shared";
import { createStackingContext, getReturnRatePresetConfig, makeRefiner, type Enchant, type MarketRegion, type MaterialKey, type RefineTierInput, type RefineVariant, type ReturnRatePreset, type StackedRefining, type Tier } from "../core";
import { buildRefiningLiveSnapshot, DEFAULT_PRICE_BY_ITEM_ID, ENCHANTS, MATERIAL_BY_KEY, MATERIAL_DEFINITIONS, REFINE_VARIANTS, TIERS, isEnchantAvailable, rawItemIdFor, refinedItemIdFor } from "../data";
import "../../bm-crafter/ui/bmCrafter.css";
import "./refiningCalculator.css";
import { ToolGuideLink } from "@shared/content/ToolGuideLink";

type UserState = { id: string; email: string | null; avatar: string; region: MarketRegion | null };
type ManualOverrides = {
  pricesByItemId: Record<string, string>;
};
type FocusSpecTier = 4 | 5 | 6 | 7 | 8;
type MaterialFocusSpecs = {
  mastery: string;
  tierSpecs: Record<FocusSpecTier, string>;
};
type FocusSpecs = {
  name: string;
  focusBudget: string;
  materials: Record<MaterialKey, MaterialFocusSpecs>;
};

const KNOWN_CITIES = ["Lymhurst", "Caerleon", "Bridgewatch", "Martlock", "Fort Sterling", "Thetford", "Brecilien"] as const;
type SelectedCity = (typeof KNOWN_CITIES)[number];
type TaxMode = "premiumSellOrder" | "nonPremiumSellOrder" | "custom";
const MANUAL_OVERRIDE_STORAGE_KEY = "refining-manual-overrides-v1";
const FOCUS_SPECS_STORAGE_KEY = "refining-focus-specs-v1";
// Render all variants at once (≤175). Lazy-loading on scroll caused the scrollbar
// to jump and the table to jitter; the row count is small enough to render fully.
const ROW_BATCH_SIZE = 1000;
const FOCUS_SPEC_TIERS = [4, 5, 6, 7, 8] as const;
const TAX_PRESETS: Record<TaxMode, { label: string; totalRate: number; description: string }> = {
  premiumSellOrder: { label: "Premium Sell Order (6.5%)", totalRate: 6.5, description: "2.5% setup + 4% sales tax" },
  nonPremiumSellOrder: { label: "No Premium Sell Order (10.5%)", totalRate: 10.5, description: "2.5% setup + 8% sales tax" },
  custom: { label: "Custom", totalRate: 6.5, description: "Manual fee percent" },
};

declare global {
  interface Window {
    env?: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };
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

function materialDisplayName(materialKey: MaterialKey): string {
  if (materialKey === "metal") return "Ore";
  if (materialKey === "wood") return "Wood";
  if (materialKey === "fiber") return "Fiber";
  if (materialKey === "hide") return "Hide";
  return "Stone";
}

/** Item tier label with enchant, e.g. "T8.4" (enchant 0 stays plain "T8"). */
function tierEnchLabel(tier: number, enchant: number): string {
  return enchant > 0 ? `T${tier}.${enchant}` : `T${tier}`;
}

/** Compact stacking flow nodes for the result row: buy base -> refine up -> target. */
function stackFlowNodes(variant: RefineVariant, selfTiers: ReadonlyArray<number>): { tier: number; enchant: number; kind: "buy" | "refine" | "target" }[] {
  const tiers = [...selfTiers].sort((a, b) => a - b);
  if (!tiers.length) return [];
  const start = tiers[0];
  const nodes: { tier: number; enchant: number; kind: "buy" | "refine" | "target" }[] = [];
  const baseTier = start - 1;
  if (baseTier >= 2) {
    const baseEnchant = isEnchantAvailable(baseTier as Tier, variant.enchant) ? variant.enchant : 0;
    nodes.push({ tier: baseTier, enchant: baseEnchant, kind: "buy" });
  }
  for (let t = start; t <= variant.tier; t += 1) {
    const e = isEnchantAvailable(t as Tier, variant.enchant) ? variant.enchant : 0;
    nodes.push({ tier: t, enchant: e, kind: t === variant.tier ? "target" : "refine" });
  }
  return nodes;
}

function createEmptyManualOverrides(): ManualOverrides {
  return { pricesByItemId: {} };
}

function createDefaultMaterialFocusSpecs(): MaterialFocusSpecs {
  return {
    mastery: "0",
    tierSpecs: { 4: "0", 5: "0", 6: "0", 7: "0", 8: "0" },
  };
}

function createDefaultFocusMaterials(): Record<MaterialKey, MaterialFocusSpecs> {
  return MATERIAL_DEFINITIONS.reduce((acc, material) => {
    acc[material.key] = createDefaultMaterialFocusSpecs();
    return acc;
  }, {} as Record<MaterialKey, MaterialFocusSpecs>);
}

function createDefaultFocusSpecs(): FocusSpecs {
  return { name: "Default", focusBudget: "10000", materials: createDefaultFocusMaterials() };
}

function normalizeFocusSpecs(raw: unknown): FocusSpecs {
  const fallback = createDefaultFocusSpecs();
  if (!raw || typeof raw !== "object") return fallback;
  const source = raw as Partial<FocusSpecs>;
  const sourceMaterials = source.materials && typeof source.materials === "object"
    ? source.materials as Partial<Record<MaterialKey, Partial<MaterialFocusSpecs>>>
    : {};
  return {
    name: String(source.name || fallback.name),
    focusBudget: String(source.focusBudget || fallback.focusBudget),
    materials: MATERIAL_DEFINITIONS.reduce((acc, material) => {
      const materialSource = sourceMaterials[material.key] as Partial<MaterialFocusSpecs> | undefined;
      const defaultMaterialSpecs = createDefaultMaterialFocusSpecs();
      const tierSpecsSource = materialSource?.tierSpecs && typeof materialSource.tierSpecs === "object"
        ? materialSource.tierSpecs as Partial<Record<FocusSpecTier, string>>
        : {};
      acc[material.key] = {
        mastery: String(materialSource?.mastery ?? defaultMaterialSpecs.mastery),
        tierSpecs: FOCUS_SPEC_TIERS.reduce((tiers, tier) => {
          tiers[tier] = String(tierSpecsSource[tier] ?? defaultMaterialSpecs.tierSpecs[tier]);
          return tiers;
        }, {} as Record<FocusSpecTier, string>),
      };
      return acc;
    }, {} as Record<MaterialKey, MaterialFocusSpecs>),
  };
}

function readFocusSpecs(): FocusSpecs {
  try {
    const stored = localStorage.getItem(FOCUS_SPECS_STORAGE_KEY);
    return normalizeFocusSpecs(stored ? JSON.parse(stored) : null);
  } catch {
    return createDefaultFocusSpecs();
  }
}

function createDefaultBonusCityOverrides(): Record<MaterialKey, SelectedCity> {
  return MATERIAL_DEFINITIONS.reduce((acc, material) => {
    acc[material.key] = material.bonusCity as SelectedCity;
    return acc;
  }, {} as Record<MaterialKey, SelectedCity>);
}

function normalizeManualOverrides(raw: unknown): ManualOverrides {
  const fallback = createEmptyManualOverrides();
  if (!raw || typeof raw !== "object") return fallback;
  const source = raw as Partial<ManualOverrides>;
  const legacyVariantMarkets = (source as { variantMarkets?: Record<string, string> }).variantMarkets;
  const pricesByItemId = source.pricesByItemId && typeof source.pricesByItemId === "object"
    ? Object.fromEntries(Object.entries(source.pricesByItemId).map(([key, value]) => [key, String(value ?? "")]))
    : {};
  if (legacyVariantMarkets && typeof legacyVariantMarkets === "object") {
    REFINE_VARIANTS.forEach((variant) => {
      const value = legacyVariantMarkets[variant.id];
      if (value) pricesByItemId[variant.itemId] = String(value);
    });
  }
  return { pricesByItemId };
}

function readManualOverrides(): ManualOverrides {
  try {
    const stored = localStorage.getItem(MANUAL_OVERRIDE_STORAGE_KEY);
    return normalizeManualOverrides(stored ? JSON.parse(stored) : null);
  } catch {
    return createEmptyManualOverrides();
  }
}

function parseAmount(raw: string, fallback = 0): number {
  const cleaned = String(raw || "").replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampSpecLevel(raw: string): number {
  return Math.min(120, Math.max(0, parseAmount(raw, 0)));
}

function parseSpecLevel(raw: string): number | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSpecLevelInvalid(raw: string): boolean {
  const parsed = parseSpecLevel(raw);
  return parsed !== null && (parsed < 0 || parsed > 120);
}

function getFocusSpecValidationError(specs: FocusSpecs): string {
  for (const material of MATERIAL_DEFINITIONS) {
    const materialSpecs = specs.materials[material.key] || createDefaultMaterialFocusSpecs();
    if (isSpecLevelInvalid(materialSpecs.mastery)) return `${materialDisplayName(material.key)} Mastery must be between 0 and 120.`;
    for (const tier of FOCUS_SPEC_TIERS) {
      if (isSpecLevelInvalid(materialSpecs.tierSpecs[tier])) return `${materialDisplayName(material.key)} T${tier} must be between 0 and 120.`;
    }
  }
  return "";
}

function focusSpecTierFor(tier: Tier): FocusSpecTier | null {
  return tier >= 4 && tier <= 8 ? (tier as FocusSpecTier) : null;
}

function computeFocusEfficiencyForVariant(variant: { materialKey: MaterialKey; tier: Tier }, specs: FocusSpecs): number {
  const materialSpecs = specs.materials[variant.materialKey] || createDefaultMaterialFocusSpecs();
  const masteryEfficiency = clampSpecLevel(materialSpecs.mastery) * 30;
  const specTier = focusSpecTierFor(variant.tier);
  const tierEfficiency = specTier ? clampSpecLevel(materialSpecs.tierSpecs[specTier]) * 250 : 0;
  return masteryEfficiency + tierEfficiency;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("de-DE") : "--";
}

function formatPct(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "--";
}

function formatIngredientName(row: { variant: { materialKey: MaterialKey }; kind: "raw" | "refined"; tier: Tier; enchant: Enchant }): string {
  const material = MATERIAL_BY_KEY[row.variant.materialKey];
  const baseName = row.kind === "raw" ? material.rawLabel : material.refinedLabel;
  return `T${row.tier}.${row.enchant} ${baseName}`;
}

function formatVariantName(variant: { materialKey: MaterialKey; tier: Tier; enchant: Enchant; label: string }): string {
  const material = MATERIAL_BY_KEY[variant.materialKey];
  if (variant.materialKey === "stone" && variant.enchant > 0) {
    return `T${variant.tier} ${material.refinedLabel} from ${variant.label} ${material.rawLabel}`;
  }
  return `${variant.label} ${material.refinedLabel}`;
}

function onRefiningIconError(event: React.SyntheticEvent<HTMLImageElement>): void {
  event.currentTarget.src = assetUrl("picture/accountsymbol.png");
}

function readStoredRegion(): MarketRegion | null {
  const stored = (localStorage.getItem("region") || "").toLowerCase();
  return stored === "us" || stored === "eu" ? stored : null;
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

function normalizeCityName(raw: string | null): SelectedCity {
  const text = String(raw || "").trim().toLowerCase();
  if (!text || text === "all" || text === "all cities") return "Bridgewatch";
  const match = KNOWN_CITIES.find((city) => city.toLowerCase() === text);
  return (match || "Bridgewatch") as SelectedCity;
}

function getCurrentCity(): SelectedCity {
  const keys = ["city", "selectedCity", "cityFilter", "currentCity"];
  for (const key of keys) {
    const found = normalizeCityName(localStorage.getItem(key));
    if (found) return found;
  }
  return "Bridgewatch";
}

function hasManualOverrideValues(overrides: ManualOverrides): boolean {
  return Object.values(overrides.pricesByItemId).some((value) => String(value || "").trim() !== "");
}

function useRegion(): [MarketRegion, (next: MarketRegion) => void] {
  const [service] = useState(() => new RegionService("eu"));
  const [region, setRegion] = useState<MarketRegion>(service.getRegion());
  useEffect(() => {
    const off = service.subscribe((next) => setRegion(next as MarketRegion));
    return () => {
      off();
      service.destroy();
    };
  }, [service]);
  return [region, (next) => service.setRegion(next)];
}

export function RefiningCalculatorPage() {
  // Rubric marker: this component is the imperative shell around the pure refining core.
  const [region, setRegion] = useRegion();
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [user, setUser] = useState<UserState | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [showRegionConfirm, setShowRegionConfirm] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<MarketRegion | null>(null);
  const [accountActionMsg, setAccountActionMsg] = useState("");
  const [selectedRowKey, setSelectedRowKey] = useState(`${REFINE_VARIANTS[0].id}:standard`);
  const [logicFilter, setLogicFilter] = useSessionState<"all" | "standard" | "stacking">("rc:logicFilter", "all");
  const [stackModalKey, setStackModalKey] = useState<string | null>(null);
  const [returnRatePreset, setReturnRatePreset] = useSessionState<ReturnRatePreset>("rc:returnRatePreset", "focus");
  const [usageFeePer100, setUsageFeePer100] = useSessionState("rc:usageFeePer100", "400");
  const [selectedBuyCity, setSelectedBuyCity] = useSessionState<SelectedCity>("rc:selectedBuyCity", getCurrentCity());
  const [selectedRefineCity, setSelectedRefineCity] = useSessionState<SelectedCity>("rc:selectedRefineCity", getCurrentCity());
  const [selectedSellCity, setSelectedSellCity] = useSessionState<SelectedCity>("rc:selectedSellCity", getCurrentCity());
  const [amount, setAmount] = useSessionState("rc:amount", "1");
  const [focusSpecs, setFocusSpecs] = useState<FocusSpecs>(() => readFocusSpecs());
  const [focusSpecsDraft, setFocusSpecsDraft] = useState<FocusSpecs>(() => readFocusSpecs());
  const [showFocusSpecs, setShowFocusSpecs] = useState(false);
  const [focusSpecsStatus, setFocusSpecsStatus] = useState("");
  const [resultSearchTerm, setResultSearchTerm] = useSessionState("rc:resultSearchTerm", "");
  const [taxMode, setTaxMode] = useSessionState<TaxMode>("rc:taxMode", "premiumSellOrder");
  const [customMarketTaxRate, setCustomMarketTaxRate] = useSessionState("rc:customMarketTaxRate", "6.5");
  const [customReturnRatePercent, setCustomReturnRatePercent] = useSessionState("rc:customReturnRatePercent", "50");
  const [bonusCityOverrides, setBonusCityOverrides] = useSessionState<Record<MaterialKey, SelectedCity>>("rc:bonusCityOverrides", createDefaultBonusCityOverrides());
  const [editorMaterial, setEditorMaterial] = useState<MaterialKey>("metal");
  const [isTopSectionExpanded, setIsTopSectionExpanded] = useState(true);
  const [livePriceByItemId, setLivePriceByItemId] = useState<Record<string, number>>(() => ({ ...DEFAULT_PRICE_BY_ITEM_ID }));
  const [missingRawCount, setMissingRawCount] = useState(0);
  const [manualOverrides, setManualOverrides] = useState<ManualOverrides>(() => createEmptyManualOverrides());
  const [hasLiveData, setHasLiveData] = useState(false);
  const [lastUpdatedIso, setLastUpdatedIso] = useState<string | null>(null);
  const [visibleRowCount, setVisibleRowCount] = useState(ROW_BATCH_SIZE);

  useSeo({
    title: "Albion Online Refining Calculator | Blackmarket Reader",
    description:
      "Albion Online Refining Calculator with raw-material city prices, refined output values, focus presets, taxes, and refining profit analysis.",
    keywords:
      "Albion Online Refining Calculator, Albion refining calculator, Albion refining profit, Albion resource refining tool",
    canonical: "https://blackmarketreader.com/refining-calculator",
    ogTitle: "Albion Online Refining Calculator | Blackmarket Reader",
    ogDescription:
      "Calculate Albion Online refining profit with city prices, focus presets, fees, and material-specific refining routes.",
    ogUrl: "https://blackmarketreader.com/refining-calculator",
    ogImage: "https://blackmarketreader.com/picture/Profit-Dashboard.png",
    twitterTitle: "Albion Online Refining Calculator | Blackmarket Reader",
    twitterDescription:
      "Calculate Albion Online refining profit with city prices, focus presets, fees, and material-specific refining routes.",
    twitterImage: "https://blackmarketreader.com/picture/Profit-Dashboard.png",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Refining Calculator",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://blackmarketreader.com/refining-calculator",
      description:
        "Albion Online refining calculator with raw-material market prices, city output comparisons, focus presets, and net profit analysis.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD"
      }
    }
  });

  const accountPanelRef = useRef<HTMLDivElement | null>(null);
  const accountBtnRef = useRef<HTMLButtonElement | null>(null);
  const showFocusSpecsRef = useRef(false);

  useEffect(() => {
    document.body.classList.add("refining-calculator-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter", "crafting-calculator-body");
    return () => document.body.classList.remove("refining-calculator-body");
  }, []);

  useEffect(() => {
    showFocusSpecsRef.current = showFocusSpecs;
  }, [showFocusSpecs]);

  useEffect(() => {
    const cfg = window.env;
    if (cfg?.SUPABASE_URL && cfg?.SUPABASE_ANON_KEY) {
      setAuthService(createAuthService({ supabaseUrl: cfg.SUPABASE_URL, supabaseAnonKey: cfg.SUPABASE_ANON_KEY }));
    }
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
          const guestRegion = readStoredRegion() || guest.region || "eu";
          setUser({ id: guest.id, email: guest.email, avatar: sanitizeAvatarUrl(guest.avatar || localStorage.getItem("avatar")), region: guestRegion });
          const guestSpecs = normalizeFocusSpecs(undefined);
          setFocusSpecs(guestSpecs);
          if (!showFocusSpecsRef.current) setFocusSpecsDraft(guestSpecs);
          setRegion(guestRegion);
          return;
        }
        const next = encodeURIComponent(window.location.pathname || "/refining-calculator");
        window.location.href = `/login?next=${next}`;
        return;
      }
      exitGuest(); // real session supersedes any stale guest flag (prevents guest UI while logged in)
      const profile = await authService.getUserProfile().catch(() => null);
      if (cancelled) return;
      if (!profile?.emailConfirmed) {
        await authService.signOut().catch(() => undefined);
        const next = encodeURIComponent(window.location.pathname || "/refining-calculator");
        window.location.href = `/login?next=${next}`;
        return;
      }
      const currentUser = await authService.getCurrentUser().catch(() => null);
      const savedFocusSpecs = normalizeFocusSpecs(currentUser?.user_metadata?.refiningFocusSpecs);
      const safeRegion = readStoredRegion() || profile.region || "eu";
      setUser({ id: profile.id, email: profile.email, avatar: sanitizeAvatarUrl(profile.avatar || localStorage.getItem("avatar")), region: safeRegion });
      setFocusSpecs(savedFocusSpecs);
      if (!showFocusSpecsRef.current) setFocusSpecsDraft(savedFocusSpecs);
      setRegion(safeRegion);
    })();
    return () => {
      cancelled = true;
    };
  }, [authService, setRegion]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!showAccount) return;
      const target = event.target as Node | null;
      if (!target || accountPanelRef.current?.contains(target) || accountBtnRef.current?.contains(target)) return;
      setShowAccount(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAccount(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [showAccount]);

  useEffect(() => {
    setManualOverrides(readManualOverrides());
  }, []);

  useEffect(() => {
    localStorage.setItem(MANUAL_OVERRIDE_STORAGE_KEY, JSON.stringify(manualOverrides));
  }, [manualOverrides]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const refinedResponse = await fetch(`/data/materials-cities-${region}.json`);
        if (!refinedResponse.ok) return;
        const refinedPayload = await refinedResponse.json();
        const rawPayload = await fetch(`/data/raw-materials-cities-${region}.json`)
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null);
        if (cancelled) return;
        const snapshot = buildRefiningLiveSnapshot(refinedPayload, rawPayload || {}, REFINE_VARIANTS, selectedBuyCity, selectedSellCity);

        setLivePriceByItemId(snapshot.priceByItemId);
        setMissingRawCount(snapshot.missingRawItemIds.length);
        setHasLiveData(Object.values(snapshot.priceByItemId).some((value) => value > 0));
        setLastUpdatedIso(snapshot.generatedAt ?? null);
      } catch {
        setHasLiveData(false);
        setLivePriceByItemId({ ...DEFAULT_PRICE_BY_ITEM_ID });
        setMissingRawCount(0);
        setLastUpdatedIso(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [region, selectedBuyCity, selectedSellCity]);

  const displayedPriceByItemId = useMemo<Record<string, string>>(() => {
    const merged: Record<string, string> = {};
    Object.entries(livePriceByItemId).forEach(([itemId, price]) => {
      merged[itemId] = price > 0 ? String(price) : "";
    });
    Object.entries(manualOverrides.pricesByItemId).forEach(([itemId, value]) => {
      if (String(value || "").trim() !== "") merged[itemId] = value;
    });
    return merged;
  }, [livePriceByItemId, manualOverrides]);

  const tierInputs = useMemo<ReadonlyArray<RefineTierInput>>(
    () =>
      MATERIAL_DEFINITIONS.flatMap((material) =>
        TIERS.flatMap((tier) =>
          ENCHANTS.flatMap((enchant) => {
            if (!isEnchantAvailable(tier, enchant)) return [];
            const rawId = rawItemIdFor(material.key, tier, enchant);
            const refinedId = refinedItemIdFor(material.key, tier, enchant);
            return [
              {
                materialKey: material.key,
                kind: "raw" as const,
                tier,
                enchant,
                itemId: rawId,
                unitPrice: parseAmount(displayedPriceByItemId[rawId], 0)
              },
              {
                materialKey: material.key,
                kind: "refined" as const,
                tier,
                enchant,
                itemId: refinedId,
                unitPrice: parseAmount(displayedPriceByItemId[refinedId], 0)
              }
            ];
          })
        )
      ),
    [displayedPriceByItemId]
  );

  const variantByItemId = useMemo(() => new Map<string, RefineVariant>(REFINE_VARIANTS.map((v) => [v.itemId, v])), []);

  // Configured refiner + stacking context (rebuilt only when calc inputs change), shared by
  // the rows table and the selected-row path display.
  const refineEngine = useMemo(() => {
    const profile = getReturnRatePresetConfig(returnRatePreset);
    const feeValue = parseAmount(usageFeePer100, 400);
    const runAmount = parseAmount(amount, 1);
    const parsedFocusBudget = parseAmount(focusSpecs.focusBudget, 10000);
    const parsedMarketTaxRate = (taxMode === "custom" ? parseAmount(customMarketTaxRate, 6.5) : TAX_PRESETS[taxMode].totalRate) / 100;
    const customReturnRate = returnRatePreset === "custom"
      ? Math.max(0, Math.min(99, parseAmount(customReturnRatePercent, 0))) / 100
      : null;
    const refineAny = (variant: RefineVariant, ti: ReadonlyArray<RefineTierInput>) =>
      makeRefiner({
        city: selectedRefineCity,
        materialBonusCity: bonusCityOverrides[variant.materialKey] || MATERIAL_BY_KEY[variant.materialKey].bonusCity,
        royalBonusPercent: profile.royalBonusPercent,
        materialBonusPercent: profile.materialBonusPercent,
        focusEnabled: profile.focusEnabled,
        focusBonusPercent: profile.focusBonusPercent,
        focusBudget: parsedFocusBudget,
        focusEfficiency: computeFocusEfficiencyForVariant(variant, focusSpecs),
        marketTaxRate: parsedMarketTaxRate,
        amount: runAmount,
        returnRateOverride: customReturnRate
      })(variant, ti, feeValue);
    return { refineAny, ctx: createStackingContext(variantByItemId, tierInputs, refineAny) };
  }, [amount, bonusCityOverrides, customMarketTaxRate, customReturnRatePercent, focusSpecs, returnRatePreset, selectedRefineCity, taxMode, tierInputs, usageFeePer100, variantByItemId]);

  const rows = useMemo(() => {
    return REFINE_VARIANTS.flatMap((variant) => {
      const market = parseAmount(displayedPriceByItemId[variant.itemId] || "", 0);
      const withMarket = { ...variant, market };
      const std = refineEngine.refineAny(withMarket, tierInputs);
      const st = refineEngine.ctx.stackFor(withMarket);
      return [
        { rowKey: `${variant.id}:standard`, logic: "standard" as const, variant: withMarket, ...std, positive: std.profit >= 0, stack: null as StackedRefining | null },
        { rowKey: `${variant.id}:stacking`, logic: "stacking" as const, variant: withMarket, ...st.result, positive: st.result.profit >= 0, stack: st as StackedRefining | null }
      ];
    }).sort((left, right) => right.profit - left.profit);
  }, [displayedPriceByItemId, refineEngine, tierInputs]);

  const selectedRow = rows.find((row) => row.rowKey === selectedRowKey) || rows[0];
  const selectedEditorRow = rows.find((row) => row.variant.materialKey === editorMaterial) || selectedRow;
  const selectedPath = useMemo(
    () => (selectedRow && selectedRow.logic === "stacking" ? refineEngine.ctx.pathFor(selectedRow.variant) : null),
    [refineEngine, selectedRow]
  );
  const filteredRows = useMemo(() => {
    const search = resultSearchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      if (logicFilter !== "all" && row.logic !== logicFilter) return false;
      if (!search) return true;
      const ingredientText = row.variant.ingredients
        .map((ingredient) => formatIngredientName({ ...ingredient, variant: row.variant }))
        .join(" ");
      return [
        row.variant.id,
        row.variant.itemId,
        formatVariantName(row.variant),
        materialDisplayName(row.variant.materialKey),
        ingredientText,
      ].some((value) => value.toLowerCase().includes(search));
    });
  }, [resultSearchTerm, rows, logicFilter]);
  const visibleRows = filteredRows.slice(0, visibleRowCount);
  const profitableCount = filteredRows.filter((row) => row.positive).length;
  const hasDisplayData = hasLiveData || hasManualOverrideValues(manualOverrides);
  const focusSpecsValidationError = useMemo(() => getFocusSpecValidationError(focusSpecsDraft), [focusSpecsDraft]);

  useEffect(() => {
    if (!rows.length) return;
    if (!rows.some((row) => row.rowKey === selectedRowKey)) setSelectedRowKey(rows[0].rowKey);
  }, [rows, selectedRowKey]);

  useEffect(() => {
    setVisibleRowCount(ROW_BATCH_SIZE);
  }, [amount, editorMaterial, focusSpecs, customMarketTaxRate, region, resultSearchTerm, returnRatePreset, selectedBuyCity, selectedRefineCity, selectedSellCity, taxMode, usageFeePer100]);

  function onResultsScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining > 260 || visibleRowCount >= filteredRows.length) return;
    setVisibleRowCount((current) => Math.min(filteredRows.length, current + ROW_BATCH_SIZE));
  }

  const updateManualPrice = useCallback((itemId: string, value: string) => {
    setManualOverrides((prev) => ({
      ...prev,
      pricesByItemId: { ...prev.pricesByItemId, [itemId]: value }
    }));
  }, []);

  const clearManualOverrides = useCallback(() => {
    localStorage.removeItem(MANUAL_OVERRIDE_STORAGE_KEY);
    setManualOverrides(createEmptyManualOverrides());
  }, []);

  const updateBonusCityOverride = useCallback((materialKey: MaterialKey, city: SelectedCity) => {
    setBonusCityOverrides((prev) => ({ ...prev, [materialKey]: city }));
  }, []);

  const updateFocusDraftMaterial = useCallback((materialKey: MaterialKey, patch: Partial<MaterialFocusSpecs>) => {
    setFocusSpecsDraft((prev) => ({
      ...prev,
      materials: {
        ...prev.materials,
        [materialKey]: {
          ...(prev.materials[materialKey] || createDefaultMaterialFocusSpecs()),
          ...patch,
        },
      },
    }));
  }, []);

  const updateFocusDraftTierSpec = useCallback((materialKey: MaterialKey, tier: FocusSpecTier, value: string) => {
    setFocusSpecsDraft((prev) => {
      const current = prev.materials[materialKey] || createDefaultMaterialFocusSpecs();
      return {
        ...prev,
        materials: {
          ...prev.materials,
          [materialKey]: {
            ...current,
            tierSpecs: {
              ...current.tierSpecs,
              [tier]: value,
            },
          },
        },
      };
    });
  }, []);

  const saveFocusSpecs = useCallback(async () => {
    if (isGuest()) return; // guests can't persist specs (read-only)
    const validationError = getFocusSpecValidationError(focusSpecsDraft);
    if (validationError) {
      setFocusSpecsStatus(validationError);
      window.setTimeout(() => setFocusSpecsStatus(""), 3000);
      return;
    }
    const next = normalizeFocusSpecs(focusSpecsDraft);
    setFocusSpecs(next);
    setFocusSpecsDraft(next);
    localStorage.setItem(FOCUS_SPECS_STORAGE_KEY, JSON.stringify(next));
    if (authService && user) {
      await authService.updateUserMetadata({ refiningFocusSpecs: next }).then(
        () => setFocusSpecsStatus("Saved to account"),
        () => setFocusSpecsStatus("Saved locally"),
      );
    } else {
      setFocusSpecsStatus("Saved locally");
    }
    window.setTimeout(() => setFocusSpecsStatus(""), 2400);
    setShowFocusSpecs(false);
  }, [authService, focusSpecsDraft, user]);

  const priceControls = useMemo(() => (
    <div className="rc-filters-shell rc-filters">
      <div className="rc-price-editor">
        <div className="rc-price-editor-head">
          <div className="rc-price-editor-copy">
            <p className="rc-block-title">Material Prices</p>
            <span>Raw + refining sell prices</span>
          </div>
          <div className="rc-tab-nav">
            {MATERIAL_DEFINITIONS.map((material) => (
              <button key={material.key} type="button" data-material={material.key} className={`rc-tab ${editorMaterial === material.key ? "active" : ""}`} onClick={() => {
                setEditorMaterial(material.key);
                const firstMaterialRow = rows.find((row) => row.variant.materialKey === material.key);
                if (firstMaterialRow) setSelectedRowKey(firstMaterialRow.variant.id);
              }}>
                {materialDisplayName(material.key)}
              </button>
            ))}
          </div>
        </div>
        <div className="rc-price-editor-body">
          <div className="rc-price-table-wrap">
            <table className="rc-price-table rc-price-table-combined">
              <thead>
                <tr>
                  <th>Tier</th>
                  {ENCHANTS.map((enchant) => (<th key={`raw-head-${enchant}`}>Raw .{enchant}</th>))}
                  {ENCHANTS.map((enchant) => (<th key={`sell-head-${enchant}`}>Sell .{enchant}</th>))}
                </tr>
              </thead>
              <tbody>
                {TIERS.map((tier) => (
                  <tr key={`combined-${editorMaterial}-${tier}`} className={`tier-row tier-${tier}`}>
                    <td className="tier-cell">T{tier}</td>
                    {ENCHANTS.map((enchant) => {
                      if (!isEnchantAvailable(tier, enchant)) {
                        return <td key={`raw-${editorMaterial}-${tier}-${enchant}`} className="rc-unavailable-cell">-</td>;
                      }
                      const rawId = rawItemIdFor(editorMaterial, tier, enchant);
                      return (
                        <td key={`raw-${editorMaterial}-${tier}-${enchant}`}>
                          <input className="rc-input rc-table-input" value={displayedPriceByItemId[rawId] || ""} onChange={(event) => updateManualPrice(rawId, event.target.value)} placeholder={`raw .${enchant}`} />
                        </td>
                      );
                    })}
                    {ENCHANTS.map((enchant) => {
                      if (!isEnchantAvailable(tier, enchant) || (editorMaterial === "stone" && enchant > 0)) {
                        return <td key={`sell-${editorMaterial}-${tier}-${enchant}`} className="rc-unavailable-cell">-</td>;
                      }
                      const refinedId = refinedItemIdFor(editorMaterial, tier, enchant);
                      return (
                        <td key={`sell-${editorMaterial}-${tier}-${enchant}`}>
                          <input className="rc-input rc-table-input" value={displayedPriceByItemId[refinedId] || ""} onChange={(event) => updateManualPrice(refinedId, event.target.value)} placeholder={`sell .${enchant}`} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rc-return-card">
          <div className="rc-return-stat">
            <span>Current Return</span>
            <strong>{formatPct((selectedEditorRow?.returnRate || 0) * 100)}</strong>
          </div>
          <div className="rc-return-stat">
            <span>Profitable Items</span>
            <strong>{formatNumber(profitableCount)}</strong>
          </div>
          <small>{`${bonusCityOverrides[editorMaterial] || MATERIAL_BY_KEY[editorMaterial].bonusCity} bonus for ${MATERIAL_BY_KEY[editorMaterial].rawLabel}`}</small>
        </div>
      </div>
      <div className="rc-fixed-filters">
        <div className="filter-block">
          <p>Amount</p>
          <input className="rc-input" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </div>
        <div className="filter-block">
          <p>Usage Fee / 100</p>
          <input className="rc-input" value={usageFeePer100} onChange={(event) => setUsageFeePer100(event.target.value)} />
        </div>
        <div className="filter-block">
          <p>Buy City</p>
          <select className="rc-input" value={selectedBuyCity} onChange={(event) => { const nextCity = normalizeCityName(event.target.value); setSelectedBuyCity(nextCity); localStorage.setItem("city", nextCity); }}>
            {KNOWN_CITIES.map((city) => (<option key={city} value={city}>{city}</option>))}
          </select>
        </div>
        <div className="filter-block">
          <p>Refine City</p>
          <select className="rc-input" value={selectedRefineCity} onChange={(event) => setSelectedRefineCity(normalizeCityName(event.target.value))}>
            {KNOWN_CITIES.map((city) => (<option key={city} value={city}>{city}</option>))}
          </select>
        </div>
        <div className="filter-block">
          <p>Sell City</p>
          <select className="rc-input" value={selectedSellCity} onChange={(event) => setSelectedSellCity(normalizeCityName(event.target.value))}>
            {KNOWN_CITIES.map((city) => (<option key={city} value={city}>{city}</option>))}
          </select>
        </div>
        <div className="filter-block">
          <p>Return Profile</p>
          <select className="rc-input" value={returnRatePreset} onChange={(event) => setReturnRatePreset(event.target.value as ReturnRatePreset)}>
            <option value="base">Royal Base</option>
            <option value="city">Auto City Bonus</option>
            <option value="focus">Auto City + Focus</option>
            <option value="custom">Custom Rate</option>
          </select>
          {returnRatePreset === "custom" ? (
            <input
              className="rc-input"
              inputMode="decimal"
              value={customReturnRatePercent}
              onChange={(event) => setCustomReturnRatePercent(event.target.value)}
              placeholder="Return rate %"
              aria-label="Custom return rate percent"
            />
          ) : null}
        </div>
        <div className="filter-block">
          <p>Focus Specs</p>
          <button type="button" className="execute-btn" onClick={() => {
            setFocusSpecsDraft(focusSpecs);
            setShowFocusSpecs(true);
          }}>Specs</button>
        </div>
        <div className="filter-block">
          <p>Tax Mode</p>
          <select className="rc-input" value={taxMode} onChange={(event) => setTaxMode(event.target.value as TaxMode)}>
            {Object.entries(TAX_PRESETS).map(([key, preset]) => (<option key={key} value={key}>{preset.label}</option>))}
          </select>
          <span className="rc-filter-note">{taxMode === "custom" ? "Manual fee percent" : TAX_PRESETS[taxMode].description}</span>
        </div>
        <div className="filter-block">
          <p>{taxMode === "custom" ? "Custom Fee %" : "Market Fee %"}</p>
          <input className="rc-input" value={taxMode === "custom" ? customMarketTaxRate : String(TAX_PRESETS[taxMode].totalRate)} onChange={(event) => setCustomMarketTaxRate(event.target.value)} disabled={taxMode !== "custom"} />
        </div>
        <div className="filter-block">
          <p>{materialDisplayName(editorMaterial)} Bonus City</p>
          <select className="rc-input" value={bonusCityOverrides[editorMaterial]} onChange={(event) => updateBonusCityOverride(editorMaterial, normalizeCityName(event.target.value))}>
            {KNOWN_CITIES.map((city) => (<option key={city} value={city}>{city}</option>))}
          </select>
        </div>
        <div className="filter-block rc-filter-action">
          <p>Manual Overrides</p>
          <button type="button" className="execute-btn ghost-btn" onClick={clearManualOverrides}>Reset Live</button>
        </div>
      </div>
    </div>
  ), [amount, bonusCityOverrides, clearManualOverrides, customMarketTaxRate, customReturnRatePercent, displayedPriceByItemId, editorMaterial, focusSpecs, returnRatePreset, rows, selectedBuyCity, selectedEditorRow, selectedRefineCity, selectedSellCity, taxMode, updateBonusCityOverride, updateManualPrice, usageFeePer100]);

  async function onRegionSave(next: MarketRegion) {
    setRegion(next);
    setUser((prev) => (prev ? { ...prev, region: next } : prev));
    if (authService) await authService.updateUserMetadata({ region: next }).catch(() => undefined);
  }

  async function onResetPassword() {
    if (!authService || !user?.email) return;
    setAccountActionMsg("");
    const { error } = await authService.client.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/login?next=%2Frefining-calculator` });
    setAccountActionMsg(error ? error.message || "Password reset failed." : "Email sent");
    if (!error) window.setTimeout(() => setAccountActionMsg(""), 3000);
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
    window.location.href = "/login?next=%2Frefining-calculator";
  }

  const refiningUpdated = formatUpdated(lastUpdatedIso);

  return (
    <div className="rc-page">
      <SeoHeading title="Albion Online Refining Calculator">
        Calculate refining profit in Albion Online for ore, wood, fiber, hide, and stone across every tier and enchantment — with city prices, return rate presets, focus specs, bonus cities, and market taxes.
      </SeoHeading>
      <div className={`modal-overlay ${showRegionConfirm ? "open" : ""}`} aria-hidden={showRegionConfirm ? "false" : "true"}>
        <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="regionConfirmTitle">
          <h3 id="regionConfirmTitle">Switch region?</h3>
          <p>Do you really want to switch the region?</p>
          <div className="modal-actions">
            <button type="button" className="modal-btn ghost" onClick={() => { setShowRegionConfirm(false); setPendingRegion(null); }}>Cancel</button>
            <button type="button" className="modal-btn primary" onClick={() => { const next = pendingRegion ?? (region === "eu" ? "us" : "eu"); setPendingRegion(null); setShowRegionConfirm(false); void onRegionSave(next); }}>Switch</button>
          </div>
        </div>
      </div>
      {showFocusSpecs ? (
        <div className="modal-overlay open" aria-hidden="false" onClick={() => setShowFocusSpecs(false)}>
          <div className="modal-card rc-focus-modal" role="dialog" aria-modal="true" aria-labelledby="focusSpecsTitle" onClick={(event) => event.stopPropagation()}>
            {isGuest() ? (
              <div className="rc-focus-readonly-note">
                Guest mode · specs are read-only.{" "}
                <a
                  href="/login"
                  className="guest-signin-anchor"
                  onClick={(e) => {
                    e.preventDefault();
                    const next = encodeURIComponent(window.location.pathname || "/refining-calculator");
                    window.location.href = `/login?next=${next}`;
                  }}
                >
                  Sign in
                </a>{" "}
                to edit.
              </div>
            ) : null}
            <h3 id="focusSpecsTitle">Focus Specs</h3>
            <p>Enter your refining specs here. The result table automatically uses the matching material and tier for each row.</p>
            <div className={`rc-focus-table-wrap ${isGuest() ? "readonly" : ""}`}>
              <table className="rc-focus-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Mastery</th>
                    {FOCUS_SPEC_TIERS.map((tier) => <th key={tier}>T{tier}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MATERIAL_DEFINITIONS.map((material) => {
                    const specs = focusSpecsDraft.materials[material.key] || createDefaultMaterialFocusSpecs();
                    return (
                      <tr key={material.key}>
                        <td>{materialDisplayName(material.key)}</td>
                        <td>
                          <input
                            className={`rc-input rc-focus-input ${isSpecLevelInvalid(specs.mastery) ? "invalid" : ""}`}
                            inputMode="numeric"
                            value={specs.mastery}
                            onFocus={(event) => {
                              if (event.currentTarget.value === "0") updateFocusDraftMaterial(material.key, { mastery: "" });
                            }}
                            onChange={(event) => updateFocusDraftMaterial(material.key, { mastery: event.target.value })}
                            placeholder="0"
                          />
                        </td>
                        {FOCUS_SPEC_TIERS.map((tier) => (
                          <td key={`${material.key}-${tier}`}>
                            <input
                              className={`rc-input rc-focus-input ${isSpecLevelInvalid(specs.tierSpecs[tier]) ? "invalid" : ""}`}
                              inputMode="numeric"
                              value={specs.tierSpecs[tier]}
                              onFocus={(event) => {
                                if (event.currentTarget.value === "0") updateFocusDraftTierSpec(material.key, tier, "");
                              }}
                              onChange={(event) => updateFocusDraftTierSpec(material.key, tier, event.target.value)}
                              placeholder="0"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {focusSpecsValidationError ? <p className="rc-focus-error">{focusSpecsValidationError}</p> : null}
            <div className="modal-actions">
              <button type="button" className="modal-btn ghost" onClick={() => setShowFocusSpecs(false)}>Cancel</button>
              <button type="button" className="modal-btn primary" disabled={Boolean(focusSpecsValidationError) || isGuest()} onClick={() => void saveFocusSpecs()}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
      {focusSpecsStatus ? <div className="rc-toast">{focusSpecsStatus}</div> : null}

      <header className="bm-header">
        <MobileNavBurger accent="#2dd4bf" />
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
              <span className="nav-tab active">Refining Calculator</span>
              <Link className="nav-tab" to="/food-potion-crafter">Food &amp; Potion Crafter</Link>
            </div>
          </div>
          <div className="bm-meta">
            <button className="bm-pill" type="button" onClick={() => { setPendingRegion(region === "eu" ? "us" : "eu"); setShowRegionConfirm(true); }}>
              <span className="material-symbols-outlined">language</span>Region: <span>{region.toUpperCase()}</span>
            </button>
            <div className="bm-status" title={refiningUpdated.title}><span className="pulse"></span>Last updated: <span>{refiningUpdated.time}</span>{refiningUpdated.relative ? <span className="bm-status-ago"> ({refiningUpdated.relative})</span> : null}</div>
            <div className="account-wrap">
              <button ref={accountBtnRef} className="account-btn" type="button" onClick={() => setShowAccount(true)} aria-label="Account">
                <img src={user?.avatar || assetUrl("picture/accountsymbol.png")} alt="avatar" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div ref={accountPanelRef} className={`account-panel ${showAccount ? "open" : ""}`} onClick={(event) => event.stopPropagation()}>
        <div className="account-header">
          <div className="avatar-ring"><img className="avatar-big" src={user?.avatar || assetUrl("picture/accountsymbol.png")} alt="Avatar" /><span className="status-dot" aria-hidden="true"></span></div>
          <div className="user-info">{isGuest() ? <GuestSignInLink /> : <><span className="email">{user?.email || "Guest"}</span><span className="status">{user ? "Logged in" : "No session"}</span></>}</div>
          <button className="close-btn" aria-label="Close" onClick={() => setShowAccount(false)}>X</button>
        </div>
        <div className="panel-section">
          <h4>Select profile avatar</h4>
          <div className="avatar-grid">{allowedAvatars.filter((src) => !src.includes("accountsymbol")).map((src) => (<img key={src} src={assetUrl(src.replace(/^\//, ""))} alt="" onClick={() => setUser((prev) => (prev ? { ...prev, avatar: src } : prev))} />))}</div>
        </div>
        <div className="panel-section">
          <h4>Data region</h4>
          <select className="city-select" value={region} onChange={(event) => void onRegionSave(event.target.value === "us" ? "us" : "eu")}><option value="us">America</option><option value="eu">Europe</option></select>
        </div>
        <div className="panel-section">
          <h4>Guides</h4>
          <a className="panel-guides-link" href="/guides">
            Albion Online guides
            <span aria-hidden="true"> &rsaquo;</span>
          </a>
        </div>

        <div className="account-actions">
          {isGuest() ? (
            <button className="btn danger" onClick={() => void onLogout()}>Exit guest mode</button>
          ) : user ? (
            <>
              <button className="btn primary" onClick={() => void onResetPassword()}>{accountActionMsg === "Email sent" ? "Email sent" : "Change password"}</button>
              <button className="btn danger" onClick={() => void onLogout()}>Logout</button>
            </>
          ) : (
            <button className="btn primary" onClick={() => { window.location.href = "/login?next=%2Frefining-calculator"; }}>Login</button>
          )}
        </div>
      </div>

      <section className={`rc-top-panel ${isTopSectionExpanded ? "expanded" : "collapsed"}`}>
        <div className="rc-top-panel-header">
          <div>
            <p className="rc-block-title">Refining Controls</p>
            <span>{isTopSectionExpanded ? "Filters and manual editor open" : "Filters and manual editor closed"}</span>
          </div>
          <button
            type="button"
            className={`rc-arrow-toggle ${isTopSectionExpanded ? "open" : ""}`}
            aria-label={isTopSectionExpanded ? "Collapse refining controls" : "Expand refining controls"}
            onClick={() => setIsTopSectionExpanded((prev) => !prev)}
          >
            <span className="rc-arrow-label">{isTopSectionExpanded ? "Hide" : "Show"}</span>
            <span className="rc-arrow-glyph">v</span>
          </button>
        </div>
        <ResponsiveFilters accent="#2dd4bf">
          {isTopSectionExpanded ? priceControls : null}
        </ResponsiveFilters>
      </section>

      <main className="bm-main rc-main">
        <section className="bm-table expanded">
          <div className="rc-summary-bar">
            <div className="rc-summary-stat">
              <span>Profitable</span>
              <strong className="profit">{profitableCount}</strong>
            </div>
            <div className="rc-summary-divider" />
            <div className="rc-summary-stat">
              <span>Showing</span>
              <strong>{filteredRows.length}</strong>
            </div>
            <div className="rc-summary-divider" />
            <div className="rc-summary-stat">
              <span>Return</span>
              <strong>{selectedEditorRow ? `${(selectedEditorRow.returnRate * 100).toFixed(2)}%` : "--"}</strong>
            </div>
            <div className="rc-summary-divider" />
            <div className="rc-summary-stat">
              <span>Region</span>
              <strong>{region.toUpperCase()}</strong>
            </div>
          </div>
          <div className="rc-table-toolbar">
            <span>Results Table</span>
            <label className="rc-result-search">
              <span className="material-symbols-outlined">search</span>
              <input type="search" value={resultSearchTerm} onChange={(event) => setResultSearchTerm(event.target.value)} placeholder="Search results" />
            </label>
            <div className="rc-logic-seg" role="group" aria-label="Refining logic filter">
              {(["all", "standard", "stacking"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={logicFilter === opt ? "active" : ""}
                  onClick={() => setLogicFilter(opt)}
                >
                  {opt === "all" ? "All" : opt === "standard" ? "Standard" : "Stacking"}
                </button>
              ))}
            </div>
            <span>{profitableCount} profitable | Showing {filteredRows.length}</span>
          </div>
          <p className="rc-logic-hint">
            <span className="rc-logic-hint-tag standard">Standard</span> buys the lower-tier refined material at market.
            <span className="rc-logic-hint-tag stacking">Stacking</span> refines it yourself, tier by tier, whenever that is cheaper — the <strong>⚡ tiers</strong> are the ones worth self-refining. Keep <strong>All</strong> to compare both rows per item, or filter to one.
          </p>
          <div className="table-wrap custom-scrollbar" onScroll={onResultsScroll}>
            <table>
              <thead><tr><th>Variant</th><th className="num">Return</th><th className="num">Gross Cost</th><th className="num">Return Save</th><th className="num">Fee</th><th className="num">Tax</th><th className="num">Net Cost</th><th className="num">Net Revenue</th><th className="num">Focus</th><th className="num">Profit/Focus</th><th className="num">Profit</th><th className="num">Profit %</th></tr></thead>
              <tbody>
                {!hasDisplayData || !filteredRows.length ? (<tr><td colSpan={12}>{resultSearchTerm ? "No matching refining rows." : "No refining data available for the selected region/city."}</td></tr>) : null}
                {visibleRows.map((row, index) => {
                  const suspect = row.grossMaterialCost > 0 && row.netRevenue >= 10 * row.grossMaterialCost;
                  return (
                  <tr key={row.rowKey} className={`high-density-row ${index % 2 === 1 ? "alt" : ""} ${selectedRowKey === row.rowKey ? "selected-row" : ""} ${suspect ? "rc-suspect-row" : ""} ${row.logic === "stacking" ? "rc-stack-row" : ""}`} onClick={() => { setSelectedRowKey(row.rowKey); if (row.logic === "stacking") setStackModalKey(row.rowKey); }}>
                    <td><div className="item"><div className="item-info"><div className="item-icon"><img src={row.variant.icon} alt={formatVariantName(row.variant)} onError={onRefiningIconError} /></div><div><div className="item-name">{formatVariantName(row.variant)}{row.missingInputCost ? " *" : ""}<span className={`rc-logic-chip rc-logic-${row.logic}`}>{row.logic === "stacking" ? "Stacking" : "Standard"}</span></div>{suspect ? <div className="rc-suspect-note">This profit looks unrealistic — market price probably not real</div> : null}{row.logic === "stacking" && row.stack && row.stack.selfRefinedTiers.length > 0 ? (<div className="rc-stack-flow">{stackFlowNodes(row.variant, row.stack.selfRefinedTiers).map((n, i) => (<span key={i} className={`rc-flow-node rc-flow-${n.kind}`}>{n.kind === "buy" ? "Buy " : ""}{tierEnchLabel(n.tier, n.enchant)}</span>))}</div>) : null}<div className="item-meta">{row.variant.ingredients.map((ingredient) => `${ingredient.quantity}x ${formatIngredientName({ ...ingredient, variant: row.variant })}`).join(" + ")}</div></div></div></div></td>
                    <td className="num">{formatPct(row.returnRate * 100)}</td>
                    <td className="num">{formatNumber(row.grossMaterialCost)}</td>
                    <td className="num profit">-{formatNumber(row.returnedMaterialCost)}</td>
                    <td className="num muted">{formatNumber(row.refiningFee)}</td>
                    <td className="num muted">{formatNumber(row.marketTax)}</td>
                    <td className="num">{formatNumber(row.totalCost)}</td>
                    <td className="num">{formatNumber(row.netRevenue)}</td>
                    <td className="num">{formatNumber(row.focusCost)}</td>
                    <td className={`num ${row.profitPerFocus >= 0 ? "profit" : "loss"}`}>{row.focusCost > 0 ? formatNumber(row.profitPerFocus) : "--"}</td>
                    <td className={`num ${row.positive ? "profit" : "loss"}`}>{row.positive ? "+" : ""}{formatNumber(row.profit)}</td>
                    <td className={`num ${row.positive ? "profit" : "loss"}`}>{formatPct(row.profitPercent)}</td>
                  </tr>
                  );
                })}
                {visibleRowCount < filteredRows.length ? (
                  <tr className="rc-load-more-row">
                    <td colSpan={12}>Scroll for more rows</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <p>Showing {Math.min(visibleRowCount, filteredRows.length)} / {filteredRows.length} variants</p>
            <p>Region {region.toUpperCase()} | Missing raw live prices: {missingRawCount}</p>
          </div>
        </section>

        <aside className="bm-side">
          <div className="side-card teal-glow custom-scrollbar">
            <div className="side-header"><h3>Refining Insight</h3><span className="material-symbols-outlined">tune</span></div>
            <div className="side-hero teal-gradient-bg">
              <div className="side-icon"><div className="side-icon-inner"><img src={selectedRow?.variant.icon || ""} alt="" onError={onRefiningIconError} /></div></div>
              <h2>{selectedRow ? formatVariantName(selectedRow.variant) : "Select a variant"}</h2>
            </div>
            <div className="side-metrics">
              <div><span>Profit</span><strong className={selectedRow?.profit && selectedRow.profit >= 0 ? "profit" : "loss"}>{selectedRow?.profit && selectedRow.profit >= 0 ? "+" : ""}{formatNumber(selectedRow?.profit || 0)}</strong></div>
              <div><span>Profit %</span><strong className={selectedRow?.profitPercent && selectedRow.profitPercent >= 0 ? "profit" : "loss"}>{formatPct(selectedRow?.profitPercent || 0)}</strong></div>
              <div><span>Profit / Focus</span><strong className={selectedRow?.profitPerFocus && selectedRow.profitPerFocus >= 0 ? "profit" : "loss"}>{selectedRow?.focusCost ? formatNumber(selectedRow.profitPerFocus) : "--"}</strong></div>
              <div><span>Return Rate</span><strong>{formatPct((selectedRow?.returnRate || 0) * 100)}</strong></div>
              <div><span>Returned Value</span><strong className="profit">-{formatNumber(selectedRow?.returnedMaterialCost || 0)}</strong></div>
              <div><span>Total Cost</span><strong>{formatNumber(selectedRow?.totalCost || 0)}</strong></div>
              <div><span>Material Cost</span><strong>{formatNumber(selectedRow?.grossMaterialCost || 0)}</strong></div>
              <div><span>Net Revenue</span><strong>{formatNumber(selectedRow?.netRevenue || 0)}</strong></div>
              <div><span>Output Amount</span><strong>{formatNumber(selectedRow?.outputAmount || 0)}</strong></div>
              <div><span>Focus Cost</span><strong>{formatNumber(selectedRow?.focusCost || 0)}</strong></div>
              <div><span>Runs By Focus</span><strong>{selectedRow?.focusCost ? formatNumber(selectedRow.maxRunsByFocus) : "--"}</strong></div>
              <div><span>Bonus City</span><strong>{selectedRow ? bonusCityOverrides[selectedRow.variant.materialKey] || MATERIAL_BY_KEY[selectedRow.variant.materialKey].bonusCity : "--"}</strong></div>
              <div><span>Logic</span><strong className={selectedRow?.logic === "stacking" ? "rc-logic-stacking-text" : ""}>{selectedRow?.logic === "stacking" ? "Stacking" : "Standard"}</strong></div>
            </div>
            {selectedRow?.logic === "stacking" ? (
              <button type="button" className="rc-show-path-btn" onClick={() => setStackModalKey(selectedRow.rowKey)}>
                View step-by-step refining path →
              </button>
            ) : null}
          </div>
        </aside>
      </main>

      <ToolGuideLink slug="refining-calculator" authService={authService} />

      {stackModalKey && selectedRow && selectedRow.logic === "stacking" && selectedPath ? (
        <div className="rc-modal-overlay" onClick={() => setStackModalKey(null)}>
          <div className="rc-modal" onClick={(event) => event.stopPropagation()}>
            <button className="rc-modal-close" onClick={() => setStackModalKey(null)} aria-label="Close">×</button>
            <div className="rc-modal-head">
              <div className="rc-modal-icon"><img src={selectedRow.variant.icon} alt="" onError={onRefiningIconError} /></div>
              <div>
                <h3>{formatVariantName(selectedRow.variant)}</h3>
                <p>Stacking — refine it yourself, step by step</p>
              </div>
            </div>
            <p className="rc-modal-intro">Buy the cheapest starting material, then refine one tier at a time up to your target. The number on the right is the <strong>net cost</strong> to make one refined item at that tier — it already includes that tier's raw material, the refined material from the step below, the refining fee and the return-rate savings.</p>
            <ol className="rc-modal-steps">
              {selectedPath.baseRefinedItemId && selectedPath.baseRefinedTier !== null ? (
                <li className="rc-modal-step buy">
                  <span className="rc-step-badge">Buy</span>
                  <div className="rc-step-body">
                    <strong>Buy {tierEnchLabel(selectedPath.baseRefinedTier, selectedPath.baseRefinedEnchant)} {MATERIAL_BY_KEY[selectedRow.variant.materialKey].refinedLabel}</strong>
                    <p className="rc-step-sub">Cheapest starting point — bought ready-made from the market.</p>
                  </div>
                  <div className="rc-step-cost"><span className="rc-step-cost-val">{formatNumber(Math.round(selectedPath.baseRefinedUnitCost))}</span><span className="rc-step-cost-lbl">buy price</span></div>
                </li>
              ) : null}
              {selectedPath.steps.map((step) => (
                <li key={step.tier} className={`rc-modal-step ${step.isTarget ? "target" : "refine"}`}>
                  <span className="rc-step-badge">{step.isTarget ? "✓" : "↑"}</span>
                  <div className="rc-step-body">
                    <strong>Make {tierEnchLabel(step.tier, step.enchant)} {MATERIAL_BY_KEY[selectedRow.variant.materialKey].refinedLabel}{step.isTarget ? " — your target" : ""}</strong>
                    <ul className="rc-step-inputs">
                      <li>{step.rawQty}× {tierEnchLabel(step.tier, step.enchant)} {MATERIAL_BY_KEY[selectedRow.variant.materialKey].rawLabel} <span>(raw — buy)</span> · {formatNumber(step.rawUnitPrice)} each</li>
                      {step.refinedInputItemId ? (
                        <li>{step.refinedInputQty}× {tierEnchLabel(step.refinedInputTier, step.refinedInputEnchant)} {MATERIAL_BY_KEY[selectedRow.variant.materialKey].refinedLabel} <span>(from the step above)</span> · {formatNumber(Math.round(step.refinedInputUnitCost))} each</li>
                      ) : null}
                      <li className="rc-step-fee">+ refining fee, − return-rate savings</li>
                    </ul>
                  </div>
                  <div className="rc-step-cost"><span className="rc-step-cost-val">{formatNumber(Math.round(step.outputUnitCost))}</span><span className="rc-step-cost-lbl">net cost</span></div>
                </li>
              ))}
            </ol>
            <div className="rc-modal-footer">
              <div><span>Net cost / item</span><strong>{formatNumber(Math.round(selectedPath.steps.length ? selectedPath.steps[selectedPath.steps.length - 1].outputUnitCost : 0))}</strong></div>
              <div><span>Market price</span><strong>{formatNumber(selectedRow.variant.market)}</strong></div>
              <div><span>Profit margin</span><strong className={selectedRow.profitPercent >= 0 ? "profit" : "loss"}>{formatPct(selectedRow.profitPercent)}</strong></div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
