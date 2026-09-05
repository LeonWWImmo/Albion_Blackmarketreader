import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { assetUrl, onItemIconError } from "@shared/assets/assets";
import { createAuthService, type AuthService } from "@shared/auth/authService";
import { isGuest, buildGuestProfile, exitGuest } from "@shared/auth/guestMode";
import { isCrawler } from "@shared/auth/crawler";
import { RegionService } from "@shared/region/regionService";
import { formatUpdated } from "@shared/time/lastUpdated";
import { useSeo } from "../../shared/seo/useSeo";
import { SeoHeading } from "../../shared/seo/SeoHeading";
import { JournalControls, MobileNavBurger, professionForItem, resolveJournalProfit, useJournals, useSessionState, GuestSignInLink, exitGuestToLogin } from "../../shared";
import "../bm-crafter/ui/bmCrafter.css";
import "./craftingCalculator.css";
import {
  buildMaterialItemId,
  calculateEconomics,
  clampNumber,
  getBonusCityForItem,
  KNOWN_CITIES,
  MATERIAL_BASES,
  normalizeResultPriceEntry,
  productionBonusToReturnRate,
  resolveArtefactPriceByCity,
  resolvePriceByCity,
  resolveResultPrice
} from "./craftingCalculator.logic";
import { SpecsModal } from "./specs/SpecsModal";
import {
  applyFocusEfficiency,
  computeCraftBaseFocus,
  computeFocusEfficiency,
  resolveSpecKey
} from "./specs/data";
import { useCraftingSpecs } from "./specs/useCraftingSpecs";
import { ToolGuideLink } from "@shared/content/ToolGuideLink";

type MarketRegion = "eu" | "us";

// The Crafting Calculator shows one item, whose single journal always applies — no per-profession
// opt-out (unlike nothing; matches the BM Crafter which also counts all). Ownership is always on.
const ALL_JOURNALS_OWNED = { warrior: true, hunter: true, mage: true, toolmaker: true } as const;

type UserState = {
  id: string;
  email: string | null;
  avatar: string;
  region: MarketRegion | null;
};

type MaterialDraft = {
  key: string;
  name: string;
  qty: number;
  price: number;
  isArtifact: boolean;
  isRequired: boolean;
};

type CraftingItem = {
  id: string;
  name: string;
  categoryKey?: string;
  materials?: Array<{ itemId?: string; id?: string; name?: string; qty?: number }>;
  artifact?: string | null;
  artifactId?: string | null;
};

type TableRow = {
  key: string;
  uid: string;
  mat1: string;
  mat2: string;
  artefact: string;
  tax: string;
  market: string;
  profit: string;
  gain: string;
  focus: string;
};

type TableSection = {
  key: string;
  label: string;
  fogClass: string;
  stripClass: string;
  rows: TableRow[];
};

type RowEdit = {
  mat1: number;
  mat2: number;
  artefact: number;
  tax: number;
  market: number;
  sold: number;
};

type MaterialsCityPayload = {
  items?: Array<{ itemId?: string; prices?: Record<string, number> }>;
};

type ArtefactsPayload = {
  items?: Array<{ itemId?: string; city?: string; price?: number }>;
};

type ResultItem = {
  city?: string;
  id?: string;
  itemId?: string;
  baseId?: string;
  price?: number;
  prices?: Record<string, number>;
  lym?: number;
  bm?: number;
  sold?: number;
};

declare global {
  interface Window {
    env?: {
      SUPABASE_URL?: string;
      SUPABASE_ANON_KEY?: string;
    };
  }
}

const CITY_FILTER_OPTIONS = [...KNOWN_CITIES] as const;
const SELL_CITY_OPTIONS = [...KNOWN_CITIES, "Black Market"] as const;
const BASE_PRODUCTION_BONUS = 18;
const BONUS_CITY_PRODUCTION_BONUS = 15;
const FOCUS_PRODUCTION_BONUS = 59;

const allowedAvatars = [
  "/picture/accountsymbol.png",
  "/picture/Bridgewatch.png",
  "/picture/Carleon.png",
  "/picture/Martlockwappen.png",
  "/picture/Lymhurstwappen.png",
  "/picture/Thefortwappen.png"
];

const TABLE_SECTIONS: TableSection[] = [
  {
    key: "t4",
    label: "TIER 4 ADEPT_CLASS",
    fogClass: "fog-t4",
    stripClass: "bg-t4-blue",
    rows: [
      { key: "t4-0", uid: "T4.0", mat1: "1.2k", mat2: "840", artefact: "0", tax: "420", market: "12.5k", profit: "10.0k", gain: "80.3%", focus: "54" },
      { key: "t4-1", uid: "T4.1", mat1: "2.9k", mat2: "1.6k", artefact: "0", tax: "850", market: "21.0k", profit: "15.7k", gain: "74.6%", focus: "94" },
      { key: "t4-2", uid: "T4.2", mat1: "6.4k", mat2: "4.2k", artefact: "0", tax: "1.2k", market: "48.0k", profit: "36.2k", gain: "75.4%", focus: "164" },
      { key: "t4-3", uid: "T4.3", mat1: "24.2k", mat2: "18.5k", artefact: "0", tax: "4.5k", market: "152k", profit: "104k", gain: "68.4%", focus: "287" },
      { key: "t4-4", uid: "T4.4", mat1: "124k", mat2: "98k", artefact: "42k", tax: "18k", market: "820k", profit: "538k", gain: "65.6%", focus: "503" }
    ]
  },
  {
    key: "t5",
    label: "TIER 5 EXPERT_CLASS",
    fogClass: "fog-t5",
    stripClass: "bg-t5-red",
    rows: [
      { key: "t5-0", uid: "T5.0", mat1: "8.4k", mat2: "6.2k", artefact: "0", tax: "2.4k", market: "42k", profit: "25k", gain: "59.5%", focus: "94" },
      { key: "t5-1", uid: "T5.1", mat1: "18k", mat2: "14k", artefact: "0", tax: "5.2k", market: "98k", profit: "60k", gain: "61.2%", focus: "164" },
      { key: "t5-2", uid: "T5.2", mat1: "45k", mat2: "32k", artefact: "0", tax: "12k", market: "240k", profit: "151k", gain: "63%", focus: "287" },
      { key: "t5-3", uid: "T5.3", mat1: "112k", mat2: "88k", artefact: "0", tax: "24k", market: "620k", profit: "396k", gain: "63.8%", focus: "503" },
      { key: "t5-4", uid: "T5.4", mat1: "410k", mat2: "295k", artefact: "120k", tax: "65k", market: "2.4M", profit: "1.5M", gain: "62%", focus: "880" }
    ]
  },
  {
    key: "t6",
    label: "TIER 6 MASTER_CLASS",
    fogClass: "fog-t6",
    stripClass: "bg-t6-orange",
    rows: [
      { key: "t6-0", uid: "T6.0", mat1: "12k", mat2: "8.4k", artefact: "0", tax: "8.5k", market: "112k", profit: "83k", gain: "74%", focus: "164" },
      { key: "t6-1", uid: "T6.1", mat1: "32k", mat2: "24k", artefact: "0", tax: "14k", market: "310k", profit: "240k", gain: "77%", focus: "287" },
      { key: "t6-2", uid: "T6.2", mat1: "84k", mat2: "62k", artefact: "0", tax: "32k", market: "820k", profit: "642k", gain: "78%", focus: "503" },
      { key: "t6-3", uid: "T6.3", mat1: "320k", mat2: "280k", artefact: "0", tax: "120k", market: "2.2M", profit: "1.4M", gain: "63%", focus: "880" },
      { key: "t6-4", uid: "T6.4", mat1: "1.1M", mat2: "820k", artefact: "440k", tax: "210k", market: "8.4M", profit: "5.8M", gain: "69%", focus: "1539" }
    ]
  },
  {
    key: "t7",
    label: "TIER 7 GRANDMASTER_CLASS",
    fogClass: "fog-t7",
    stripClass: "bg-t7-yellow",
    rows: [
      { key: "t7-0", uid: "T7.0", mat1: "42k", mat2: "32k", artefact: "0", tax: "35k", market: "420k", profit: "311k", gain: "74%", focus: "287" },
      { key: "t7-1", uid: "T7.1", mat1: "110k", mat2: "85k", artefact: "0", tax: "62k", market: "1.1M", profit: "843k", gain: "76%", focus: "503" },
      { key: "t7-2", uid: "T7.2", mat1: "280k", mat2: "210k", artefact: "0", tax: "110k", market: "2.4M", profit: "1.8M", gain: "75%", focus: "880" },
      { key: "t7-3", uid: "T7.3", mat1: "840k", mat2: "650k", artefact: "0", tax: "320k", market: "7.8M", profit: "5.9M", gain: "75%", focus: "1539" },
      { key: "t7-4", uid: "T7.4", mat1: "2.4M", mat2: "1.9M", artefact: "1.2M", tax: "620k", market: "22M", profit: "15.8M", gain: "71%", focus: "2694" }
    ]
  },
  {
    key: "t8",
    label: "TIER 8 ELDER_CLASS",
    fogClass: "fog-t8",
    stripClass: "bg-t8-silver",
    rows: [
      { key: "t8-0", uid: "T8.0", mat1: "95k", mat2: "82k", artefact: "0", tax: "65k", market: "1.1M", profit: "858k", gain: "78%", focus: "503" },
      { key: "t8-1", uid: "T8.1", mat1: "340k", mat2: "290k", artefact: "0", tax: "140k", market: "3.2M", profit: "2.4M", gain: "75%", focus: "880" },
      { key: "t8-2", uid: "T8.2", mat1: "920k", mat2: "810k", artefact: "0", tax: "380k", market: "9.5M", profit: "7.3M", gain: "76%", focus: "1539" },
      { key: "t8-3", uid: "T8.3", mat1: "2.8M", mat2: "2.4M", artefact: "0", tax: "1.1M", market: "32M", profit: "25.7M", gain: "80%", focus: "2694" },
      { key: "t8-4", uid: "T8.4", mat1: "1.2M", mat2: "1.1M", artefact: "3.5M", tax: "850k", market: "44.2M", profit: "37.5M", gain: "84.8%", focus: "4714" }
    ]
  }
];

function readStoredRegion(): MarketRegion | null {
  const stored = (localStorage.getItem("region") || "").toLowerCase();
  return stored === "eu" || stored === "us" ? stored : null;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value || 0));
}

function formatMaybeNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return formatNumber(value);
}

function formatCompact(value: number): string {
  const num = Number(value) || 0;
  const abs = Math.abs(num);
  if (abs >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(num));
}

function formatCompactOrDash(value: number): string {
  return Number(value) > 0 ? formatCompact(value) : "-";
}

/**
 * Crafting fame = total material count × tier factor × 2^enchant.
 * Tier factors are the per-item-value fame multipliers from the source workbook
 * (Fame = itemValue × factor, where itemValue = sum of material quantities).
 * Verified: 2H Bow (32 mats) → T4.0 = 32×22.5 = 720, T7.0 = 32×645 = 20640, T8.4 = 32×1395×16 = 714240.
 */
const CRAFT_FAME_FACTOR_BY_TIER: Record<number, number> = {
  4: 22.5,
  5: 90,
  6: 270,
  7: 645,
  8: 1395,
};

function parseCompactNumber(value: string): number {
  const raw = String(value || "").trim().toLowerCase().replace(/,/g, "");
  if (!raw) return 0;
  if (raw.endsWith("k")) return (Number.parseFloat(raw) || 0) * 1000;
  if (raw.endsWith("m")) return (Number.parseFloat(raw) || 0) * 1000000;
  return Number.parseFloat(raw) || 0;
}

function parseTierEnchant(uid: string): { tier: number; enchant: number } {
  const m = String(uid || "").match(/^T?(\d+)(?:\.(\d+))?/i);
  const tier = m ? Number(m[1]) : 4;
  const enchant = m && m[2] ? Number(m[2]) : 0;
  return { tier: Number.isFinite(tier) ? tier : 4, enchant: Number.isFinite(enchant) ? enchant : 0 };
}

function rowTierFromKey(rowKey: string): number {
  const row = TABLE_SECTIONS.flatMap((section) => section.rows).find((entry) => entry.key === rowKey);
  if (!row) return 4;
  return parseTierEnchant(row.uid).tier;
}

function normalizeSearchText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreSearchItem(item: CraftingItem, query: string): number {
  const q = normalizeSearchText(query);
  if (!q) return 0;

  const name = normalizeSearchText(item.name);
  const id = normalizeSearchText(item.id);
  const combined = `${name} ${id}`.trim();
  const tokens = q.split(" ").filter(Boolean);
  if (!tokens.length) return 0;

  // Require every token to appear in name or id.
  const allTokensMatch = tokens.every((token) => combined.includes(token));
  if (!allTokensMatch) return 0;

  let score = 0;
  if (name === q || id === q) score += 1000;
  if (name.startsWith(q)) score += 700;
  if (id.startsWith(q)) score += 650;
  if (name.includes(q)) score += 420;
  if (id.includes(q)) score += 380;

  for (const token of tokens) {
    if (name.startsWith(token)) score += 120;
    if (id.startsWith(token)) score += 110;
    if (name.includes(token)) score += 70;
    if (id.includes(token)) score += 60;
  }

  // Slight preference for shorter names when scores are close.
  score -= Math.min(name.length, 80) * 0.5;
  return score;
}

function normalizeCityName(raw: string | null): string {
  const text = String(raw || "").trim().toLowerCase();
  if (!text || text === "all" || text === "all cities") return "ALL";
  const hit = KNOWN_CITIES.find((city) => city.toLowerCase() === text);
  return hit || "ALL";
}

function getStoredCity(keys: string[], fallback = "Lymhurst"): string {
  for (const key of keys) {
    const city = normalizeCityName(localStorage.getItem(key));
    if (KNOWN_CITIES.includes(city)) return city;
  }
  return fallback;
}

function buildCraftedItemId(baseId: string, tier: number, enchant: number): string {
  const root = `T${tier}_${baseId}`;
  return enchant > 0 ? `${root}@${enchant}` : root;
}

async function loadResultsByRegion(region: MarketRegion): Promise<ResultItem[]> {
  const all: ResultItem[] = [];

  try {
    const response = await fetch(`/data/crafting-results-${region}.json`);
    if (response.ok) {
      const payload = await response.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (items.length) {
        const normalized = items
          .map((entry: unknown) => normalizeResultPriceEntry(entry))
          .filter((entry: ResultItem | null): entry is ResultItem => Boolean(entry));
        all.push(...normalized);
      }
    }
  } catch {
    // keep loading legacy sparse result shards below
  }

  const files = region === "eu"
    ? ["results-crafting-eu.js", "results-eu.js", "results-eu-1.js", "results-eu-2.js"]
    : ["results-crafting-us.js", "results.js", "results-1.js", "results-2.js"];

  for (const file of files) {
    try {
      const response = await fetch(`/${file}`);
      if (!response.ok) continue;
      const raw = await response.text();
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start < 0 || end <= start) continue;
      const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown[];
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map((entry) => normalizeResultPriceEntry(entry))
          .filter((entry: ResultItem | null): entry is ResultItem => Boolean(entry));
        all.push(...normalized);
      }
    } catch {
      // ignore broken shard files and keep loading others
    }
  }

  return all;
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

export function CraftingCalculatorPage() {
  const [region, setRegion] = useRegion();
  const [craftCity, setCraftCity] = useState<string>(() => getStoredCity(["craftCity", "selectedCity", "city", "cityFilter", "currentCity"]));
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [user, setUser] = useState<UserState | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [showRegionConfirm, setShowRegionConfirm] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<MarketRegion | null>(null);
  const [accountActionMsg, setAccountActionMsg] = useState("");
  const accountPanelRef = useRef<HTMLDivElement | null>(null);
  const accountBtnRef = useRef<HTMLButtonElement | null>(null);
  const profileChannelRef = useRef<BroadcastChannel | null>(null);

  useSeo({
    title: "Albion Online Crafting Calculator | Blackmarket Reader",
    description:
      "Albion Online Crafting Calculator with city prices, artefacts, return rate, Black Market selling, and profit breakdowns for crafted gear.",
    keywords:
      "Albion Online Crafting Calculator, Albion crafting calculator, Albion artifact crafting, Albion profit calculator, Albion black market crafting",
    canonical: "https://blackmarketreader.com/crafting-calculator",
    ogTitle: "Albion Online Crafting Calculator | Blackmarket Reader",
    ogDescription:
      "Calculate Albion Online crafting profit with material prices, return rate, artefacts, and Black Market sell values.",
    ogUrl: "https://blackmarketreader.com/crafting-calculator",
    ogImage: "https://blackmarketreader.com/picture/bm-crafter-table.png",
    twitterTitle: "Albion Online Crafting Calculator | Blackmarket Reader",
    twitterDescription:
      "Calculate Albion Online crafting profit with material prices, return rate, artefacts, and Black Market sell values.",
    twitterImage: "https://blackmarketreader.com/picture/bm-crafter-table.png",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Crafting Calculator",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://blackmarketreader.com/crafting-calculator",
      description:
        "Albion Online crafting calculator for gear profit analysis with city market prices, return rates, artefacts, and Black Market support.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD"
      }
    }
  });

  const [allItems, setAllItems] = useState<CraftingItem[]>([]);
  const [selectedRowKey, setSelectedRowKey] = useSessionState("cc:selectedRowKey", "t8-4");
  const [selectedItem, setSelectedItem] = useState<CraftingItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchParams] = useSearchParams();
  const [materialState, setMaterialState] = useState<MaterialDraft[]>([]);
  const [materialPriceMap, setMaterialPriceMap] = useState<Map<string, Record<string, number>>>(new Map());
  const [artefactPriceMap, setArtefactPriceMap] = useState<Map<string, Record<string, number>>>(new Map());
  const [resultsItems, setResultsItems] = useState<ResultItem[]>([]);
  // Black Market sell prices keyed by full item id (T{tier}_{base}@{enchant}), from the same
  // dataset the Dashboard and BM Crafter use — crafting-results.json has no Black Market prices.
  const [bmSellByItemId, setBmSellByItemId] = useState<Map<string, number>>(new Map());
  const [rowEdits, setRowEdits] = useState<Record<string, RowEdit>>(() => {
    const entries: Array<[string, RowEdit]> = TABLE_SECTIONS
      .flatMap((section) => section.rows)
      .map((row) => [
        row.key,
        {
          mat1: parseCompactNumber(row.mat1),
          mat2: parseCompactNumber(row.mat2),
          artefact: parseCompactNumber(row.artefact),
          tax: parseCompactNumber(row.tax),
          market: parseCompactNumber(row.market),
          sold: 0
        }
      ]);
    return Object.fromEntries(entries);
  });
  const [usePremium, setUsePremium] = useSessionState("cc:usePremium", true);
  const [useFocus, setUseFocus] = useSessionState("cc:useFocus", false);
  const [dailyBonusPercent, setDailyBonusPercent] = useSessionState<0 | 10 | 20>("cc:dailyBonusPercent", 0);
  const [sellCity, setSellCity] = useState<string>(() => {
    const stored = localStorage.getItem("sellCity");
    return stored === "Black Market" ? "Black Market" : getStoredCity(["sellCity"], "Lymhurst");
  });
  const [itemValue, setItemValue] = useState(256);
  const [stationFee, setStationFee] = useSessionState("cc:stationFee", 1000);
  const [setupFeePercent, setSetupFeePercent] = useSessionState("cc:setupFeePercent", 2.5);
  const [transactionTaxPercent, setTransactionTaxPercent] = useSessionState("cc:transactionTaxPercent", 4);

  const allTableRows = useMemo(() => TABLE_SECTIONS.flatMap((section) => section.rows), []);
  const selectedRow = useMemo(
    () => allTableRows.find((row) => row.key === selectedRowKey) || allTableRows[allTableRows.length - 1],
    [allTableRows, selectedRowKey]
  );
  const artefactByTier = useMemo<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    for (const section of TABLE_SECTIONS) {
      const firstRow = section.rows[0];
      const tier = parseTierEnchant(firstRow.uid).tier;
      const fromEdits = rowEdits[firstRow.key]?.artefact;
      map[tier] = typeof fromEdits === "number" ? fromEdits : parseCompactNumber(firstRow.artefact);
    }
    return map;
  }, [rowEdits]);
  const selectedRowValues = useMemo<RowEdit>(() => {
    const selectedTier = parseTierEnchant(selectedRow.uid).tier;
    return rowEdits[selectedRow.key] || {
      mat1: parseCompactNumber(selectedRow.mat1),
      mat2: parseCompactNumber(selectedRow.mat2),
      artefact: artefactByTier[selectedTier] ?? parseCompactNumber(selectedRow.artefact),
      tax: parseCompactNumber(selectedRow.tax),
      market: parseCompactNumber(selectedRow.market),
      sold: 0
    };
  }, [rowEdits, selectedRow, artefactByTier]);
  const bonusCity = useMemo(() => getBonusCityForItem(selectedItem), [selectedItem]);
  const isBonusCityActive = Boolean(bonusCity && bonusCity === craftCity);
  const [showSpecsModal, setShowSpecsModal] = useState(false);
  const specsState = useCraftingSpecs({ authService, enabled: Boolean(user) });
  const activeSpecKey = useMemo(() => resolveSpecKey(selectedItem), [selectedItem]);
  const activeSpecLevel = activeSpecKey ? (specsState.progress.specs[activeSpecKey] ?? 0) : 0;
  const focusEfficiency = useMemo(
    () => computeFocusEfficiency(specsState.progress, activeSpecKey, selectedItem, allItems),
    [specsState.progress, activeSpecKey, selectedItem, allItems]
  );
  const productionBonusWithoutFocus = useMemo(() => {
    return BASE_PRODUCTION_BONUS
      + (isBonusCityActive ? BONUS_CITY_PRODUCTION_BONUS : 0)
      + dailyBonusPercent;
  }, [isBonusCityActive, dailyBonusPercent]);
  const totalProductionBonus = useMemo(() => {
    return productionBonusWithoutFocus + (useFocus ? FOCUS_PRODUCTION_BONUS : 0);
  }, [productionBonusWithoutFocus, useFocus]);
  const returnRatePercent = useMemo(() => productionBonusToReturnRate(totalProductionBonus) * 100, [totalProductionBonus]);
  const returnRate = useMemo(() => returnRatePercent / 100, [returnRatePercent]);
  const isBlackMarketSell = sellCity === "Black Market";
  const effectiveSellCity = isBlackMarketSell ? "Caerleon" : sellCity;
  const effectiveSetupFeePercent = isBlackMarketSell ? 0 : setupFeePercent;
  const selectedItemMaterials = useMemo(
    () => (Array.isArray(selectedItem?.materials) ? selectedItem.materials : []),
    [selectedItem]
  );
  const selectedBaseFocus = useMemo(() => {
    const { tier, enchant } = parseTierEnchant(selectedRow.uid);
    return computeCraftBaseFocus(selectedItemMaterials, tier, enchant);
  }, [selectedItemMaterials, selectedRow.uid]);
  const selectedFocusCost = useMemo(
    () => applyFocusEfficiency(selectedBaseFocus, focusEfficiency),
    [selectedBaseFocus, focusEfficiency]
  );

  useEffect(() => {
    setTransactionTaxPercent(usePremium ? 4 : 8);
  }, [usePremium]);

  useEffect(() => {
    document.body.classList.add("crafting-calculator-body");
    document.body.classList.remove("landing-body");
    document.body.classList.remove("dashboard-body");
    document.body.classList.remove("bm-crafter");
    return () => {
      document.body.classList.remove("crafting-calculator-body");
    };
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
          const guestRegion: MarketRegion = readStoredRegion() || guest.region || "eu";
          setUser({
            id: guest.id,
            email: guest.email,
            avatar: sanitizeAvatarUrl(guest.avatar || localStorage.getItem("avatar")),
            region: guestRegion
          });
          setRegion(guestRegion);
          return;
        }
        const next = encodeURIComponent(window.location.pathname || "/crafting-calculator");
        window.location.href = `/login?next=${next}`;
        return;
      }
      exitGuest(); // real session supersedes any stale guest flag (prevents guest UI while logged in)
      const profile = await authService.getUserProfile().catch(() => {
        const currentUser = session.user;
        if (!currentUser) return null;
        const meta = (currentUser.user_metadata || {}) as Record<string, unknown>;
        const regionRaw = String(meta.region || "").toLowerCase();
        const normalizedRegion = regionRaw === "eu" || regionRaw === "us" ? (regionRaw as MarketRegion) : null;
        return {
          id: currentUser.id,
          email: currentUser.email || null,
          emailConfirmed: Boolean(currentUser.email_confirmed_at),
          avatar: typeof meta.avatar === "string" ? meta.avatar : null,
          region: normalizedRegion
        };
      });
      if (cancelled) return;
      if (!profile?.emailConfirmed) {
        await authService.signOut().catch(() => undefined);
        const next = encodeURIComponent(window.location.pathname || "/crafting-calculator");
        window.location.href = `/login?next=${next}`;
        return;
      }
      const safeRegion = readStoredRegion() || profile.region || "eu";
      setUser({
        id: profile.id,
        email: profile.email,
        avatar: sanitizeAvatarUrl(profile.avatar || localStorage.getItem("avatar")),
        region: safeRegion
      });
      setRegion(safeRegion);
      if (safeRegion !== profile.region) {
        await authService.updateUserMetadata({ region: safeRegion }).catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authService, setRegion]);

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
    (async () => {
      try {
        const response = await fetch("/items-categorized-crafting.json");
        if (!response.ok) return;
        const payload = await response.json();
        const categories = Array.isArray(payload?.categories) ? payload.categories : [];
        const items = categories.flatMap((category: { key?: string; items?: CraftingItem[] }) =>
          (Array.isArray(category.items) ? category.items : []).map((item) => ({ ...item, categoryKey: category.key || "" }))
        );
        setAllItems(items);
        const deepItemId = searchParams.get("item");
        const deepItem = deepItemId ? items.find((item: CraftingItem) => item.id === deepItemId) : null;
        const defaultItem = deepItem || items.find((item: CraftingItem) => item.id === "2H_BOW") || items[0] || null;
        setSelectedItem(defaultItem);
        setSearchTerm("");
      } catch {
        setAllItems([]);
      }
    })();
    // searchParams is read once on mount (deep-link from the BM Crafter); intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link from the BM Crafter: pre-fill region, sell city, craft city and tier/enchant row.
  useEffect(() => {
    const rg = searchParams.get("region");
    if (rg === "eu" || rg === "us") setRegion(rg); // match the region whose BM prices were shown
    if (searchParams.get("sell") === "bm") setSellCity("Black Market");
    const cc = searchParams.get("craftCity");
    if (cc && (CITY_FILTER_OPTIONS as readonly string[]).includes(cc)) setCraftCity(cc);
    const tier = searchParams.get("tier");
    if (tier) setSelectedRowKey(`t${tier}-${searchParams.get("enchant") ?? "0"}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem("craftCity", craftCity);
    localStorage.setItem("selectedCity", craftCity);
    localStorage.setItem("city", craftCity);
  }, [craftCity]);

  useEffect(() => {
    localStorage.setItem("sellCity", sellCity);
  }, [sellCity]);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`/data/materials-cities-${region}.json`);
        if (!response.ok) {
          setMaterialPriceMap(new Map());
          return;
        }
        const payload = (await response.json()) as MaterialsCityPayload;
        const map = new Map<string, Record<string, number>>();
        const items = Array.isArray(payload.items) ? payload.items : [];
        items.forEach((entry) => {
          if (entry?.itemId) map.set(entry.itemId, entry.prices || {});
        });
        setMaterialPriceMap(map);
      } catch {
        setMaterialPriceMap(new Map());
      }
    })();
  }, [region]);

  useEffect(() => {
    (async () => {
      try {
        const rows = await loadResultsByRegion(region);
        setResultsItems(rows);
      } catch {
        setResultsItems([]);
      }
    })();
  }, [region]);

  // Black Market sell prices (same source as Dashboard / BM Crafter). Items are
  // [itemId, bmPrice, soldPerDay] tuples keyed by full item id.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/data/bm-crafter-${region}.json`);
        const payload = res.ok ? await res.json() : null;
        if (cancelled) return;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const map = new Map<string, number>();
        for (const entry of items) {
          if (!Array.isArray(entry)) continue;
          const id = String(entry[0] || "").trim();
          const price = Number(entry[1]) || 0;
          if (id && price > 0) map.set(id, price);
        }
        setBmSellByItemId(map);
      } catch {
        if (!cancelled) setBmSellByItemId(new Map());
      }
    })();
    return () => { cancelled = true; };
  }, [region]);

  // Real data-refresh timestamp for the active region (from the crafting-results workflow output).
  const [craftingUpdatedIso, setCraftingUpdatedIso] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/data/crafting-results-${region}.json`);
        const payload = res.ok ? await res.json() : null;
        if (cancelled) return;
        const stamp = payload && typeof payload.generatedAt === "string" ? payload.generatedAt : null;
        setCraftingUpdatedIso(stamp);
      } catch {
        if (!cancelled) setCraftingUpdatedIso(null);
      }
    })();
    return () => { cancelled = true; };
  }, [region]);
  const craftingUpdated = useMemo(() => formatUpdated(craftingUpdatedIso), [craftingUpdatedIso]);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`/data/artefacts-${region}.json`);
        if (!response.ok) {
          setArtefactPriceMap(new Map());
          return;
        }
        const payload = (await response.json()) as ArtefactsPayload;
        const items = Array.isArray(payload.items) ? payload.items : [];
        const map = new Map<string, Record<string, number>>();
        items.forEach((entry) => {
          const itemId = String(entry?.itemId || "").trim();
          const city = normalizeCityName(entry?.city || null);
          const price = Number(entry?.price || 0);
          if (!itemId || !Number.isFinite(price) || price <= 0) return;
          const key = city === "ALL" ? "ALL" : city;
          const current = map.get(itemId) || {};
          const previous = Number(current[key] || 0);
          if (!previous || price < previous) current[key] = price;
          map.set(itemId, current);
        });
        setArtefactPriceMap(map);
      } catch {
        setArtefactPriceMap(new Map());
      }
    })();
  }, [region]);

  useEffect(() => {
    if (!selectedItem) {
      setMaterialState([]);
      return;
    }

    const baseMaterials = Array.isArray(selectedItem.materials) ? selectedItem.materials : [];
    const next: MaterialDraft[] = [];

    baseMaterials.forEach((mat, index) => {
      const source = mat.itemId || mat.id || mat.name || "";
      const name = String(source).trim();
      if (!name) return;
      next.push({
        key: `${selectedItem.id}-${name}-${index}`,
        name: name.replace(/_/g, " "),
        qty: Number(mat.qty) || 0,
        price: 0,
        isArtifact: false,
        isRequired: true
      });
    });

    if (selectedItem.artifactId || selectedItem.artifact) {
      const artifactName = String(selectedItem.artifact || selectedItem.artifactId || "Artifact").replace(/_/g, " ");
      next.push({
        key: `${selectedItem.id}-artifact`,
        name: artifactName,
        qty: 1,
        price: 0,
        isArtifact: true,
        isRequired: true
      });
    } else {
      next.push({
        key: `${selectedItem.id}-artifact-none`,
        name: "Non Artefakt",
        qty: 0,
        price: 0,
        isArtifact: true,
        isRequired: false
      });
    }

    setMaterialState(next);
  }, [selectedItem]);

  useEffect(() => {
    if (!materialState.length) return;
    const { tier, enchant } = parseTierEnchant(selectedRow.uid);

    setMaterialState((prev) =>
      prev.map((mat) => {
        if (mat.isArtifact) return mat;
        const normalized = mat.name.toUpperCase().replace(/\s+/g, "_").replace(/^T\d+_/, "").replace(/^T\d+/, "");
        if (!MATERIAL_BASES.has(normalized)) return mat;
        const itemId = buildMaterialItemId(normalized, tier, enchant);
        if (!itemId) return mat;
        const price = resolvePriceByCity(materialPriceMap.get(itemId), craftCity);
        return { ...mat, price };
      })
    );
  }, [selectedRow.uid, materialPriceMap, craftCity]);

  useEffect(() => {
    if (!selectedItem || !materialPriceMap.size) return;
    const filteredMaterialPairs = (Array.isArray(selectedItem.materials) ? selectedItem.materials : [])
      .map((mat) => {
        const source = String(mat.itemId || mat.id || mat.name || "").trim();
        const name = source.toUpperCase().replace(/\s+/g, "_").replace(/^T\d+_/, "").replace(/^T\d+/, "");
        return { name, qty: Number(mat.qty) || 0 };
      })
      .filter(({ name }) => MATERIAL_BASES.has(name))
      .slice(0, 2);
    const baseMaterials = filteredMaterialPairs.map(({ name }) => name);
    const quantities = filteredMaterialPairs.map(({ qty }) => qty);

    if (!baseMaterials.length) return;

    setRowEdits((prev) => {
      const next = { ...prev };
      TABLE_SECTIONS.flatMap((section) => section.rows).forEach((row) => {
        const { tier, enchant } = parseTierEnchant(row.uid);
        const mat1Id = buildMaterialItemId(baseMaterials[0], tier, enchant);
        const mat2Id = baseMaterials[1] ? buildMaterialItemId(baseMaterials[1], tier, enchant) : null;
        const mat1 = resolvePriceByCity(mat1Id ? materialPriceMap.get(mat1Id) : undefined, craftCity) * (quantities[0] || 0);
        const mat2 = resolvePriceByCity(mat2Id ? materialPriceMap.get(mat2Id) : undefined, craftCity) * (quantities[1] || 0);
        const current = next[row.key] || {
          mat1: parseCompactNumber(row.mat1),
          mat2: parseCompactNumber(row.mat2),
          artefact: parseCompactNumber(row.artefact),
          tax: parseCompactNumber(row.tax),
          market: parseCompactNumber(row.market),
          sold: 0
        };
        next[row.key] = {
          ...current,
          mat1: mat1 > 0 ? mat1 : 0,
          mat2: mat2 > 0 ? mat2 : 0
        };
      });
      return next;
    });
  }, [selectedItem, materialPriceMap, craftCity]);

  useEffect(() => {
    // Black Market prices come from bmSellByItemId, not resultsItems, so don't block on the latter
    // being loaded when selling to the Black Market (that left BM sell prices at 0 until/if the
    // city-price dataset finished loading).
    if (!selectedItem) return;
    if (!isBlackMarketSell && !resultsItems.length) return;

    setRowEdits((prev) => {
      const next = { ...prev };
      TABLE_SECTIONS.flatMap((section) => section.rows).forEach((row) => {
        const { tier, enchant } = parseTierEnchant(row.uid);
        const targetItemId = buildCraftedItemId(selectedItem.id, tier, enchant);
        const matches = resultsItems.filter((entry) => String(entry.id || entry.itemId || "").trim() === targetItemId);
        const resolvedMarket = isBlackMarketSell
          ? (bmSellByItemId.get(targetItemId) ?? 0)
          : matches.length
            ? (() => {
              const exactCityPrice = resolveResultPrice(matches, effectiveSellCity);
              return exactCityPrice > 0 ? exactCityPrice : resolveResultPrice(matches, "ALL");
            })()
            : 0;

        const soldValue = matches
          .map((entry) => Number(entry.sold || 0))
          .filter((value) => Number.isFinite(value) && value > 0)
          .reduce((max, value) => Math.max(max, value), 0);

        const current = next[row.key] || {
          mat1: parseCompactNumber(row.mat1),
          mat2: parseCompactNumber(row.mat2),
          artefact: parseCompactNumber(row.artefact),
          tax: parseCompactNumber(row.tax),
          market: parseCompactNumber(row.market),
          sold: 0
        };
        next[row.key] = { ...current, market: resolvedMarket > 0 ? resolvedMarket : 0, sold: soldValue };
      });
      return next;
    });
  }, [selectedItem, resultsItems, effectiveSellCity, isBlackMarketSell, bmSellByItemId]);

  useEffect(() => {
    if (!selectedItem) return;
    const artifactId = String(selectedItem.artifactId || "").trim();

    setRowEdits((prev) => {
      const next = { ...prev };
      for (const tier of [4, 5, 6, 7, 8]) {
        const artefactKey = artifactId ? `T${tier}_${artifactId}` : "";
        const resolved = artefactKey ? resolveArtefactPriceByCity(artefactPriceMap.get(artefactKey), craftCity) : 0;
        const artefactValue = Number.isFinite(resolved) && resolved > 0 ? resolved : 0;

        TABLE_SECTIONS.flatMap((section) => section.rows).forEach((row) => {
          if (parseTierEnchant(row.uid).tier !== tier) return;
          const current = next[row.key] || {
            mat1: parseCompactNumber(row.mat1),
            mat2: parseCompactNumber(row.mat2),
            artefact: parseCompactNumber(row.artefact),
            tax: parseCompactNumber(row.tax),
            market: parseCompactNumber(row.market),
            sold: 0
          };
          next[row.key] = { ...current, artefact: artefactValue };
        });
      }
      return next;
    });
  }, [selectedItem, artefactPriceMap, craftCity]);

  const journals = useJournals(region);
  const totalResourceCount = useMemo(
    () => (Array.isArray(selectedItem?.materials) ? selectedItem.materials : []).reduce((sum, mat) => sum + (Number(mat?.qty) || 0), 0),
    [selectedItem]
  );
  // Per-craft journal ("book") profit for the selected item at a given tier, or 0 when off.
  const getJournalProfit = useCallback(
    (tier: number) => {
      if (!journals.enabled) return 0;
      const jr = resolveJournalProfit(
        {
          categoryKey: selectedItem?.categoryKey,
          itemId: selectedItem?.id ?? "",
          tier,
          artifactId: selectedItem?.artifactId,
          totalResourceCount,
          city: craftCity
        },
        journals.enabled,
        // The single item's own journal always applies here (no per-profession opt-out in the
        // Crafting Calculator), so ownership is always true — the on/off toggle alone gates it.
        ALL_JOURNALS_OWNED,
        journals.data
      );
      return jr?.journalProfit ?? 0;
    },
    [journals.enabled, journals.data, selectedItem, totalResourceCount, craftCity]
  );

  const totals = useMemo(() => {
    const requiredMaterials = Array.isArray(selectedItem?.materials) ? selectedItem.materials : [];
    const requiresMat1 = (Number(requiredMaterials[0]?.qty) || 0) > 0;
    const requiresMat2 = (Number(requiredMaterials[1]?.qty) || 0) > 0;
    const requiresArtefact = Boolean(selectedItem?.artifactId || selectedItem?.artifact);
    const calculation = calculateEconomics({
      mat1: selectedRowValues.mat1,
      mat2: selectedRowValues.mat2,
      artefact: selectedRowValues.artefact,
      market: Number(selectedRowValues.market) || 0,
      requiresMat1,
      requiresMat2,
      requiresArtefact,
      returnRate,
      itemValue,
      stationFee,
      setupFeePercent: effectiveSetupFeePercent,
      transactionTaxPercent
    });
    // Positive profit: spec raises SPF (profit / effectiveFocus).
    // Negative profit: heuristic = profit * (effectiveFocus / baseFocus²) → magnitude shrinks with specs.
    const silverPerFocus = (() => {
      if (typeof calculation.profit !== "number") return null;
      if (selectedBaseFocus <= 0 || selectedFocusCost <= 0) return null;
      if (calculation.profit >= 0) return calculation.profit / selectedFocusCost;
      const ratio = selectedFocusCost / selectedBaseFocus;
      return (calculation.profit / selectedBaseFocus) * ratio;
    })();

    // Fold journal profit into the headline profit/ROI (silver-per-focus stays on the base
    // craft profit, since journal profit is a separate revenue stream, not a focus efficiency).
    const journalProfit = getJournalProfit(parseTierEnchant(selectedRow.uid).tier);
    const profitWithJournal = typeof calculation.profit === "number" ? calculation.profit + journalProfit : calculation.profit;
    const roiWithJournal =
      typeof calculation.totalCost === "number" && calculation.totalCost > 0 && typeof profitWithJournal === "number"
        ? (profitWithJournal / calculation.totalCost) * 100
        : calculation.roi;

    return {
      ...calculation,
      profit: profitWithJournal,
      roi: roiWithJournal,
      journalProfit,
      returnRatePercent,
      silverPerFocus
    };
  }, [
    selectedItem,
    selectedRow,
    selectedRowValues.mat1,
    selectedRowValues.mat2,
    selectedRowValues.artefact,
    returnRatePercent,
    returnRate,
    itemValue,
    stationFee,
    effectiveSetupFeePercent,
    transactionTaxPercent,
    selectedRowValues.market,
    selectedFocusCost,
    selectedBaseFocus,
    getJournalProfit
  ]);
  const roiBarWidth = useMemo(
    () => `${Math.max(0, Math.min(100, Math.abs(typeof totals.roi === "number" ? totals.roi : 0)))}%`,
    [totals.roi]
  );

  const materialBreakdown = useMemo(() => {
    if (!selectedItem) return [] as Array<{ name: string; qty: number; unitPrice: number; total: number }>;
    const { tier, enchant } = parseTierEnchant(selectedRow.uid);
    const requiredMaterials = Array.isArray(selectedItem.materials) ? selectedItem.materials : [];
    const entries: Array<{ name: string; qty: number; unitPrice: number; total: number }> = [];
    requiredMaterials.slice(0, 2).forEach((mat, idx) => {
      const source = String(mat.itemId || mat.id || mat.name || "").trim();
      const baseName = source.toUpperCase().replace(/\s+/g, "_").replace(/^T\d+_/, "").replace(/^T\d+/, "");
      const qty = Number(mat.qty) || 0;
      if (qty <= 0) return;
      const total = idx === 0 ? selectedRowValues.mat1 : selectedRowValues.mat2;
      const unitPrice = qty > 0 && total > 0 ? total / qty : 0;
      const enchantLabel = enchant > 0 ? `.${enchant}` : "";
      entries.push({ name: `T${tier}${enchantLabel} ${baseName.replace(/_/g, " ")}`, qty, unitPrice, total });
    });
    return entries;
  }, [selectedItem, selectedRow.uid, selectedRowValues.mat1, selectedRowValues.mat2]);

  const artefactBreakdown = useMemo(() => {
    if (!selectedItem) return null;
    const artifactId = String(selectedItem.artifactId || "").trim();
    if (!artifactId) return null;
    const total = selectedRowValues.artefact;
    return { name: artifactId, qty: 1, total };
  }, [selectedItem, selectedRowValues.artefact]);

  const searchResults = useMemo(() => {
    const q = normalizeSearchText(searchTerm);
    if (q.length < 2) return [];
    return allItems
      .map((item) => ({ item, score: scoreSearchItem(item, q) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
      .slice(0, 20)
      .map((entry) => entry.item);
  }, [allItems, searchTerm]);

  const searchSuggestions = useMemo(
    () => searchResults.map((item) => item.name),
    [searchResults]
  );

  function findItemBySearchInput(raw: string): CraftingItem | null {
    const text = String(raw || "").trim();
    if (!text) return null;

    const idFromLabel = text.match(/\(([^)]+)\)\s*$/)?.[1]?.trim();
    if (idFromLabel) {
      const byId = allItems.find((item) => item.id === idFromLabel);
      if (byId) return byId;
    }

    const normalized = normalizeSearchText(text);
    return (
      allItems.find((item) => normalizeSearchText(item.id) === normalized) ||
      allItems.find((item) => normalizeSearchText(item.name) === normalized) ||
      null
    );
  }

  function onSelectSearchItem(item: CraftingItem) {
    setSelectedItem(item);
    setSearchTerm(item.name);
  }

  async function onRegionSave(next: MarketRegion) {
    setRegion(next);
    setUser((prev) => (prev ? { ...prev, region: next } : prev));
    if (!authService) return;
    await authService.updateUserMetadata({ region: next }).catch(() => undefined);
  }

  async function onAvatarChange(next: string) {
    if (!authService || !user) return;
    const avatar = sanitizeAvatarUrl(next);
    await authService.updateUserMetadata({ avatar }).catch(() => undefined);
    localStorage.setItem("avatar", avatar);
    profileChannelRef.current?.postMessage({ type: "avatar", value: avatar });
    setUser({ ...user, avatar });
  }

  async function onResetPassword() {
    if (!authService || !user?.email) return;
    setAccountActionMsg("");
    const { error } = await authService.client.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/login?next=%2Fcrafting-calculator`
    });
    if (error) {
      setAccountActionMsg(error.message || "Password reset failed.");
      return;
    }
    setAccountActionMsg("Email sent");
    window.setTimeout(() => setAccountActionMsg(""), 3000);
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
    window.location.href = "/login?next=%2Fcrafting-calculator";
  }

  async function confirmRegionSwitch() {
    setShowRegionConfirm(false);
    const next = pendingRegion ?? (region === "eu" ? "us" : "eu");
    setPendingRegion(null);
    await onRegionSave(next);
  }

  function updateRowField(rowKey: string, field: keyof RowEdit, rawValue: string) {
    const parsed = Math.max(0, parseCompactNumber(rawValue));
    if (field === "artefact") {
      const targetTier = rowTierFromKey(rowKey);
      setRowEdits((prev) => {
        const next = { ...prev };
        TABLE_SECTIONS.flatMap((section) => section.rows).forEach((row) => {
          const tier = parseTierEnchant(row.uid).tier;
          if (tier !== targetTier) return;
          next[row.key] = {
            ...(next[row.key] || { mat1: 0, mat2: 0, artefact: 0, tax: 0, market: 0, sold: 0 }),
            artefact: parsed
          };
        });
        return next;
      });
      return;
    }
    setRowEdits((prev) => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] || { mat1: 0, mat2: 0, artefact: 0, tax: 0, market: 0, sold: 0 }),
        [field]: parsed
      }
    }));
  }

  return (
    <div className="cc-page">
      <SeoHeading title="Albion Online Crafting Calculator">
        Plan profitable crafts in Albion Online. Enter material and artefact prices per city, set return rate and focus, and get exact craft cost, profit, ROI, and silver-per-focus for every tier and enchantment.
      </SeoHeading>
      <div className={`modal-overlay ${showRegionConfirm ? "open" : ""}`} aria-hidden={showRegionConfirm ? "false" : "true"}>
        <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="regionConfirmTitle">
          <h3 id="regionConfirmTitle">Switch region?</h3>
          <p>Do you really want to switch the region?</p>
          <div className="modal-actions">
            <button type="button" className="modal-btn ghost" onClick={() => { setShowRegionConfirm(false); setPendingRegion(null); }}>Cancel</button>
            <button type="button" className="modal-btn primary" onClick={confirmRegionSwitch}>Switch</button>
          </div>
        </div>
      </div>

      <header className="bm-header">
        <MobileNavBurger accent="#5cf0c8" />
        <div className="bm-header-row">
          <div className="bm-brand">
            <div className="bm-brand-home">
              <div className="bm-logo" aria-hidden="true">
                <img src={assetUrl("picture/testo ohne background.png")} alt="" />
              </div>
              <h1>RomulusKings Crafting Tools</h1>
            </div>
            <div className="bm-nav bm-nav-switch">
              <Link className="nav-tab" to="/">Home</Link>
              <Link className="nav-tab" to="/dashboard">Dashboard</Link>
              <Link className="nav-tab" to="/bm-crafter">Blackmarket Crafter</Link>
              <span className="nav-tab active">Crafting Calculator</span>
              <Link className="nav-tab" to="/refining-calculator">Refining Calculator</Link>
              <Link className="nav-tab" to="/food-potion-crafter">Food &amp; Potion Crafter</Link>
            </div>
          </div>
          <div className="bm-meta">
            <button className="bm-pill" type="button" onClick={() => { setPendingRegion(region === "eu" ? "us" : "eu"); setShowRegionConfirm(true); }}>
              <span className="material-symbols-outlined">language</span>
              Region: <span>{region.toUpperCase()}</span>
            </button>
            <div className="bm-status" title={craftingUpdated.title}>
              <span className="pulse"></span>
              Last updated: <span>{craftingUpdated.time}</span>{craftingUpdated.relative ? <span className="bm-status-ago"> ({craftingUpdated.relative})</span> : null}
            </div>
            <div className="account-wrap">
              <button ref={accountBtnRef} className="account-btn" type="button" onClick={() => setShowAccount(true)} aria-label="Account">
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
            {allowedAvatars.filter((src) => !src.includes("accountsymbol")).map((src) => (
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

      <div className="workbench-container">
        <main className="matrix-side">
          <table className="spreadsheet-table">
            <thead>
              <tr>
                <th>UID</th><th>Material 1</th><th>Material 2</th><th>Artefact</th><th>Market Value</th><th>Sold/Day</th><th>Profit</th><th>Gain %</th><th>Silver / Focus</th>
              </tr>
            </thead>
            <tbody>
              {TABLE_SECTIONS.map((section) => (
                <Fragment key={section.key}>
                  <tr className="tier-header-row" key={`${section.key}-head`}><td colSpan={9}><label><span className={`neon-strip ${section.stripClass}`}></span>{section.label}</label></td></tr>
                  {section.rows.map((row, rowIndex) => {
                    const selected = row.key === selectedRowKey;
                    const { tier: rowTier } = parseTierEnchant(row.uid);
                    const requiredMaterials = Array.isArray(selectedItem?.materials) ? selectedItem.materials : [];
                    const qty1 = Number(requiredMaterials[0]?.qty) || 0;
                    const qty2 = Number(requiredMaterials[1]?.qty) || 0;
                    const requiresMat1 = qty1 > 0;
                    const requiresMat2 = qty2 > 0;
                    const values = rowEdits[row.key] || {
                      mat1: parseCompactNumber(row.mat1),
                      mat2: parseCompactNumber(row.mat2),
                      artefact: artefactByTier[rowTier] ?? parseCompactNumber(row.artefact),
                      tax: parseCompactNumber(row.tax),
                      market: parseCompactNumber(row.market),
                      sold: 0
                    };
                    const mat1Unit = qty1 > 0 ? values.mat1 / qty1 : values.mat1;
                    const mat2Unit = qty2 > 0 ? values.mat2 / qty2 : values.mat2;
                    const itemNeedsArtifact = Boolean(selectedItem?.artifactId || selectedItem?.artifact);
                    const rowEconomics = calculateEconomics({
                      mat1: values.mat1,
                      mat2: values.mat2,
                      artefact: values.artefact,
                      market: values.market,
                      requiresMat1,
                      requiresMat2,
                      requiresArtefact: itemNeedsArtifact,
                      returnRate,
                      itemValue,
                      stationFee,
                      setupFeePercent: effectiveSetupFeePercent,
                      transactionTaxPercent
                    });
                    const rowJournalProfit = getJournalProfit(rowTier);
                    const rowProfit = typeof rowEconomics.profit === "number" ? rowEconomics.profit + rowJournalProfit : rowEconomics.profit;
                    const rowGain = typeof rowEconomics.totalCost === "number" && rowEconomics.totalCost > 0 && typeof rowProfit === "number"
                      ? (rowProfit / rowEconomics.totalCost) * 100
                      : rowEconomics.roi;
                    const rowMatTotal = values.mat1 + values.mat2 + values.artefact;
                    const rowSuspect = rowMatTotal > 0 && values.market >= 10 * rowMatTotal;
                    return (
                      <tr key={row.key} className={`sub-row ${section.fogClass} ${selected ? "selected" : ""} ${rowSuspect ? "cc-suspect-row" : ""}`} onClick={() => setSelectedRowKey(row.key)}>
                        <td>{row.uid}{rowSuspect ? <span className="cc-suspect-overlay">This profit looks unrealistic — market price probably not real</span> : null}</td>
                        <td
                          className="mono-num editable-cell"
                          contentEditable
                          suppressContentEditableWarning
                          title={qty1 > 0 ? `Unit price × ${qty1}` : undefined}
                          onBlur={(e) => {
                            const unit = Math.max(0, parseCompactNumber(e.currentTarget.textContent || "0"));
                            const total = qty1 > 0 ? unit * qty1 : unit;
                            updateRowField(row.key, "mat1", String(total));
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); } }}
                        >
                          {formatCompactOrDash(mat1Unit)}
                        </td>
                        <td
                          className="mono-num editable-cell"
                          contentEditable
                          suppressContentEditableWarning
                          title={qty2 > 0 ? `Unit price × ${qty2}` : undefined}
                          onBlur={(e) => {
                            const unit = Math.max(0, parseCompactNumber(e.currentTarget.textContent || "0"));
                            const total = qty2 > 0 ? unit * qty2 : unit;
                            updateRowField(row.key, "mat2", String(total));
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); } }}
                        >
                          {formatCompactOrDash(mat2Unit)}
                        </td>
                        {rowIndex === 0 ? (itemNeedsArtifact ? (
                          <td
                            rowSpan={section.rows.length}
                            className="mono-num editable-cell"
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => updateRowField(section.rows[0].key, "artefact", e.currentTarget.textContent || "0")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                            }}
                          >
                            {(artefactByTier[rowTier] ?? 0) > 0 ? formatCompact(artefactByTier[rowTier]) : "-"}
                          </td>
                        ) : (
                          <td rowSpan={section.rows.length} className="mono-num muted">Non Artefakt</td>
                        )) : null}
                        <td className="mono-num editable-cell" contentEditable suppressContentEditableWarning onBlur={(e) => updateRowField(row.key, "market", e.currentTarget.textContent || "0")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}>{formatCompactOrDash(values.market)}</td>
                        <td className="mono-num muted">{values.sold > 0 ? formatCompact(values.sold) : "-"}</td>
                        <td className={`mono-num ${typeof rowProfit === "number" ? (rowProfit >= 0 ? "value-positive" : "value-negative") : ""}`}>
                          {typeof rowProfit === "number" ? formatCompact(rowProfit) : "-"}
                        </td>
                        <td className={`mono-num ${typeof rowGain === "number" ? (rowGain >= 0 ? "value-positive" : "value-negative") : ""}`}>
                          {typeof rowGain === "number" ? `${rowGain.toFixed(1)}%` : "-"}
                        </td>
                        <td
                          className={`mono-num ${typeof rowProfit === "number" ? (rowProfit >= 0 ? "value-positive" : "value-negative") : ""}`}
                          title={(() => {
                            const { enchant: rowEnchant } = parseTierEnchant(row.uid);
                            const rowBaseFocus = computeCraftBaseFocus(selectedItemMaterials, rowTier, rowEnchant);
                            if (rowBaseFocus <= 0) return undefined;
                            const eff = applyFocusEfficiency(rowBaseFocus, focusEfficiency);
                            return `Profit ${typeof rowProfit === "number" ? formatNumber(Math.round(rowProfit)) : "?"} · Focus ${formatNumber(Math.round(eff))} (base ${formatNumber(Math.round(rowBaseFocus))})`;
                          })()}
                        >
                          {(() => {
                            const { enchant: rowEnchant } = parseTierEnchant(row.uid);
                            const rowBaseFocus = computeCraftBaseFocus(selectedItemMaterials, rowTier, rowEnchant);
                            if (rowBaseFocus <= 0) return "-";
                            const effective = applyFocusEfficiency(rowBaseFocus, focusEfficiency);
                            if (effective <= 0 || typeof rowProfit !== "number") return "-";
                            // Positive profit: grows with specs (more silver per focus).
                            // Negative profit: shrinks magnitude with specs to keep "better specs
                            // = better metric" UX direction. Formula: (profit / base) * (effective / base)
                            // = profit * effective / base² (linear scaling, NOT squared).
                            const ratio = effective / rowBaseFocus;
                            const spf = rowProfit >= 0
                              ? rowProfit / effective
                              : (rowProfit / rowBaseFocus) * ratio;
                            if (!Number.isFinite(spf)) return "-";
                            const abs = Math.abs(spf);
                            const sign = spf < 0 ? "-" : "";
                            if (abs >= 1000) return `${sign}${formatCompact(abs)}`;
                            if (abs >= 10) return `${sign}${Math.round(abs)}`;
                            return `${sign}${abs.toFixed(1)}`;
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </main>

        <aside className="detail-side">
          <div className="detail-grid-12">
            <div className="bento-card span-8">
              <div className="focus-layout">
                <div className="focus-main">
                  <span className="cc-caption">Selection Focus</span>
                  <h2 id="selectedItemTitle">{selectedItem?.name || `Selected ${selectedRow.uid}`}</h2>
                  <div className="badge-row">
                    <span className="badge-chip">{selectedRow.uid}</span>
                    <span className="badge-chip muted">
                      {typeof totals.roi === "number" ? (totals.roi >= 0 ? "PROFIT" : "LOSS") : "PENDING"}
                    </span>
                  </div>
                </div>
                <div className="focus-stats">
                  <div className="focus-stat">
                    <span className="cc-caption">Return Rate</span>
                    <strong className="profit-cell">
                      {totals.returnRatePercent.toFixed(2)}%
                    </strong>
                  </div>
                  <div className="focus-stat">
                    <span className="cc-caption">Bonus City</span>
                    <strong>{bonusCity ? (isBonusCityActive ? `${bonusCity} active` : bonusCity) : "None"}</strong>
                  </div>
                </div>
              </div>
            </div>
            <div className="bento-card span-4 item-preview-card">
              <img
                className="cc-item-image"
                src={selectedItem ? `/itemicons/T4_${selectedItem.id}.png` : assetUrl("picture/accountsymbol.png")}
                onError={onItemIconError}
                alt="item"
              />
            </div>
          </div>

          <button
            type="button"
            className="specs-trigger specs-trigger-standalone"
            onClick={() => setShowSpecsModal(true)}
          >
            <span>Manage Specs</span>
            {specsState.pendingSync ? <span className="specs-trigger-badge">Saving…</span> : null}
          </button>

          <div className="bento-card">
            <div className="cc-caption">Item Search</div>
            <div className="cc-grid-2 compact-grid">
              <div>
                <div className="cc-caption">Craft City</div>
                <select
                  className="detail-input"
                  value={craftCity}
                  onChange={(e) => setCraftCity(normalizeCityName(e.target.value))}
                >
                  {CITY_FILTER_OPTIONS.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="cc-caption">Sell City</div>
                <select
                  className="detail-input"
                  value={sellCity}
                  onChange={(e) => setSellCity(e.target.value === "Black Market" ? "Black Market" : normalizeCityName(e.target.value))}
                >
                  {SELL_CITY_OPTIONS.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
            </div>
            <input
              className="detail-input"
              list="cc-item-suggestions"
              value={searchTerm}
              onChange={(e) => {
                const next = e.target.value;
                setSearchTerm(next);
                const exact = findItemBySearchInput(next);
                if (exact) onSelectSearchItem(exact);
              }}
              onBlur={() => {
                const exact = findItemBySearchInput(searchTerm);
                if (exact) {
                  onSelectSearchItem(exact);
                  return;
                }
                if (searchResults.length) onSelectSearchItem(searchResults[0]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchResults.length) {
                  e.preventDefault();
                  const exact = findItemBySearchInput(searchTerm);
                  onSelectSearchItem(exact || searchResults[0]);
                }
              }}
              placeholder="Search by item name"
            />
            <datalist id="cc-item-suggestions">
              {searchSuggestions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>

            <div className="cc-grid-2">
              <div>
                <div className="cc-caption">{isBlackMarketSell ? "Black Market Value" : "Market Value"}</div>
                <input className="detail-input" type="number" min={0} step={1} value={Math.round(selectedRowValues.market)} onChange={(e) => updateRowField(selectedRow.key, "market", e.target.value)} />
              </div>
              <div>
                <div className="cc-caption">Item Value (Craft)</div>
                <input className="detail-input" type="number" min={0} step={1} value={Math.round(itemValue)} onChange={(e) => setItemValue(Math.max(0, Number(e.target.value) || 0))} />
              </div>
            </div>

            <div className="cc-grid-2">
              <div>
                <div className="cc-caption">Station Usage Fee</div>
                <input className="detail-input" type="number" min={0} step={1} value={Math.round(stationFee)} onChange={(e) => setStationFee(Math.max(0, Number(e.target.value) || 0))} />
              </div>
              <div>
                <div className="cc-caption">Craft Bonus City</div>
                <input className="detail-input" value={bonusCity || "None"} readOnly />
              </div>
            </div>

            <div className="bonus-section">
              <div>
                <div className="cc-caption">Return Bonuses</div>
                <div className="bonus-grid">
                  <button
                    type="button"
                    className={`bonus-tile ${isBonusCityActive ? "active" : ""}`}
                    onClick={() => { if (bonusCity && KNOWN_CITIES.includes(bonusCity)) setCraftCity(bonusCity); }}
                  >
                    <span>Bonus City</span>
                    <strong>{bonusCity || "None"}</strong>
                  </button>
                  <button
                    type="button"
                    className={`bonus-tile ${dailyBonusPercent === 10 ? "active" : ""}`}
                    onClick={() => setDailyBonusPercent((prev) => (prev === 10 ? 0 : 10))}
                  >
                    <span>Daily Bonus</span>
                    <strong>+10%</strong>
                  </button>
                  <button
                    type="button"
                    className={`bonus-tile ${dailyBonusPercent === 20 ? "active" : ""}`}
                    onClick={() => setDailyBonusPercent((prev) => (prev === 20 ? 0 : 20))}
                  >
                    <span>Daily Bonus</span>
                    <strong>+20%</strong>
                  </button>
                  <button
                    type="button"
                    className={`bonus-tile ${useFocus ? "active" : ""}`}
                    onClick={() => setUseFocus((prev) => !prev)}
                  >
                    <span>Focus</span>
                    <strong>{useFocus ? "Active" : "Off"}</strong>
                  </button>
                </div>
              </div>

              <div>
                <div className="cc-caption">Premium</div>
                <label className="checkbox-chip premium-chip">
                  <input type="checkbox" checked={usePremium} onChange={(e) => setUsePremium(e.target.checked)} />
                  <span>Use Premium market tax (4% instead of 8%)</span>
                </label>
              </div>
            </div>

            <div>
              <div className="cc-caption">Journals</div>
              <JournalControls
                enabled={journals.enabled}
                owned={journals.owned}
                onToggleEnabled={journals.setEnabled}
                onToggleOwned={journals.toggleOwned}
                data={journals.data}
                city={craftCity}
                onlyProfession={selectedItem ? professionForItem(selectedItem.categoryKey, selectedItem.id) : null}
                showOwnership={false}
              />
            </div>

            <div className="cc-grid-2">
              <div>
                <div className="cc-caption">Market Setup Fee %</div>
                <input
                  className="detail-input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={Number((isBlackMarketSell ? 0 : setupFeePercent).toFixed(2))}
                  disabled={isBlackMarketSell}
                  onChange={(e) => setSetupFeePercent(clampNumber(Number(e.target.value) || 0, 0, 100))}
                />
              </div>
              <div>
                <div className="cc-caption">Market Tax %</div>
                <input
                  className="detail-input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={Number(transactionTaxPercent.toFixed(2))}
                  onChange={(e) => setTransactionTaxPercent(clampNumber(Number(e.target.value) || 0, 0, 100))}
                />
              </div>
            </div>
          </div>

          <div className="bento-card materials-card">
            <div className="cc-caption">Materials Required</div>
            {materialBreakdown.length === 0 && !artefactBreakdown ? (
              <div className="materials-empty">Select an item to see required materials.</div>
            ) : (
              <ul className="materials-list">
                {materialBreakdown.map((mat) => (
                  <li key={mat.name} className="materials-row">
                    <div className="materials-row-main">
                      <span className="materials-qty">x{mat.qty}</span>
                      <span className="materials-name">{mat.name}</span>
                    </div>
                    <div className="materials-row-meta">
                      <span className="materials-unit">{mat.unitPrice > 0 ? `@${formatNumber(Math.round(mat.unitPrice))}` : "@-"}</span>
                      <span className="materials-total">{mat.total > 0 ? formatNumber(Math.round(mat.total)) : "-"}</span>
                    </div>
                  </li>
                ))}
                {artefactBreakdown ? (
                  <li className="materials-row materials-row-artefact">
                    <div className="materials-row-main">
                      <span className="materials-qty">x{artefactBreakdown.qty}</span>
                      <span className="materials-name">{artefactBreakdown.name}</span>
                    </div>
                    <div className="materials-row-meta">
                      <span className="materials-unit">artefact</span>
                      <span className="materials-total">{artefactBreakdown.total > 0 ? formatNumber(Math.round(artefactBreakdown.total)) : "-"}</span>
                    </div>
                  </li>
                ) : null}
              </ul>
            )}
          </div>

          <div className="bento-card totals">
            <div><span>Gross Resource Cost</span><strong>{formatMaybeNumber(totals.canCalculate ? totals.grossResourceCost : null)}</strong></div>
            <div><span>Net Resource Cost (after RRR)</span><strong>{formatMaybeNumber(totals.netResourceCost)}</strong></div>
            <div><span>Crafting Usage Fee</span><strong>{formatMaybeNumber(totals.craftingUsageFee)}</strong></div>
            <div><span>Market Setup + Tax</span><strong>{formatMaybeNumber(
              typeof totals.marketSetupFee === "number" && typeof totals.marketTransactionTax === "number"
                ? totals.marketSetupFee + totals.marketTransactionTax
                : null
            )}</strong></div>
            <div><span>Total Cost</span><strong>{formatMaybeNumber(totals.totalCost)}</strong></div>
            {typeof totals.journalProfit === "number" && totals.journalProfit > 0 ? (
              <div><span>Journal Profit</span><strong className="profit-cell">+{formatNumber(totals.journalProfit)}</strong></div>
            ) : null}
            <div>
              <span>Profit</span>
              <strong className={typeof totals.profit === "number" ? (totals.profit >= 0 ? "profit-cell" : "loss-cell") : ""}>
                {typeof totals.profit === "number" ? `${totals.profit >= 0 ? "+" : ""}${formatNumber(totals.profit)}` : "-"}
              </strong>
            </div>
            <div>
              <span>ROI</span>
              <strong className={typeof totals.roi === "number" ? (totals.roi >= 0 ? "profit-cell" : "loss-cell") : ""}>
                {typeof totals.roi === "number" ? `${totals.roi >= 0 ? "+" : ""}${totals.roi.toFixed(1)}%` : "-"}
              </strong>
            </div>
            <div>
              <span>Focus Cost</span>
              <strong>{selectedFocusCost > 0 ? formatNumber(Math.round(selectedFocusCost)) : "-"}</strong>
            </div>
            <div>
              <span>Silver per Focus</span>
              <strong className={typeof totals.silverPerFocus === "number" ? (totals.silverPerFocus >= 0 ? "profit-cell" : "loss-cell") : ""}>
                {typeof totals.silverPerFocus === "number" ? formatNumber(totals.silverPerFocus) : "-"}
              </strong>
            </div>
            <div>
              <span>Fame / Craft</span>
              <strong title="Crafting fame = total material count × tier factor × 2^enchant">
                {(() => {
                  const { tier, enchant } = parseTierEnchant(selectedRow.uid);
                  const totalMatQty = (Array.isArray(selectedItem?.materials) ? selectedItem.materials : [])
                    .reduce((sum, mat) => sum + (Number(mat?.qty) || 0), 0);
                  const factor = CRAFT_FAME_FACTOR_BY_TIER[tier] ?? 0;
                  const enchMult = [1, 2, 4, 8, 16][Math.max(0, Math.min(4, enchant))] ?? 1;
                  const fame = Math.round(totalMatQty * factor * enchMult);
                  return fame > 0 ? formatNumber(fame) : "-";
                })()}
              </strong>
            </div>
          </div>

        </aside>
      </div>

      <ToolGuideLink slug="crafting-calculator" authService={authService} />

      <SpecsModal
        open={showSpecsModal}
        progress={specsState.progress}
        items={allItems}
        highlightedSpecKey={activeSpecKey}
        pendingSync={specsState.pendingSync}
        readOnly={isGuest()}
        onChange={specsState.setSpecLevel}
        onMasteryChange={specsState.setMasteryLevel}
        onReset={specsState.resetAll}
        onClose={() => setShowSpecsModal(false)}
      />
    </div>
  );
}
