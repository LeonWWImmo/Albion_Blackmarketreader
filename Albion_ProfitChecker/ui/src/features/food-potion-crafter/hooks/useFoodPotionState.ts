import { useEffect, useMemo, useState } from "react";
import { useSessionState } from "../../../shared";
import type { CraftBonus } from "../../../shared";
import { DEFAULT_USAGE_FEE } from "../core";
import type {
  City,
  ConsumableCategory,
  ConsumableRecipe,
  ReturnRatePreset,
  StationKind,
} from "../core";
import { deriveFoodPotionRows } from "./deriveRows";
import type { CraftingProgress } from "../specs/data";

// Lymhurst has the deepest market data, so default every city selector there.
const DEFAULT_CITY: City = "Lymhurst";

const NO_BONUSES: ReadonlyArray<CraftBonus> = [];

export function useFoodPotionState(
  recipes: ConsumableRecipe[],
  priceByItemId: Map<string, number>,
  specProgress?: CraftingProgress,
  /** Today's daily crafting bonuses (empty when none are reported). */
  dailyBonuses: ReadonlyArray<CraftBonus> = NO_BONUSES
) {
  const [category, setCategoryState] = useSessionState<ConsumableCategory>("fp:category", "food");
  const [selectedTier, setSelectedTier] = useSessionState<number | null>("fp:selectedTier", null);
  const [searchTerm, setSearchTerm] = useSessionState("fp:searchTerm", "");
  const [craftCity, setCraftCity] = useSessionState<City>("fp:craftCity", DEFAULT_CITY);
  // buyCity/sellCity are fixed at the default here: the page owns the real selectors, and
  // deriveFoodPotionRows resolves prices from the pre-built priceByItemId (not from these), so
  // they only satisfy the FoodPotionFilters shape and never change.
  const buyCity: City = DEFAULT_CITY;
  const sellCity: City = DEFAULT_CITY;
  const [stationKind, setStationKind] = useSessionState<StationKind>("fp:stationKind", "city");
  const [returnRatePreset, setReturnRatePreset] = useSessionState<ReturnRatePreset>("fp:returnRatePreset", "focus");
  const [customReturnRatePct, setCustomReturnRatePct] = useSessionState<number>("fp:customReturnRatePct", 43.5);
  const [amount, setAmount] = useSessionState("fp:amount", 1);
  const [usageFee, setUsageFee] = useSessionState<number>("fp:usageFee", DEFAULT_USAGE_FEE.food);
  const [marketTaxRate, setMarketTaxRate] = useSessionState("fp:marketTaxRate", 0.065);
  const [demandPerDay, setDemandPerDay] = useSessionState("fp:demandPerDay", 0);
  const [showOnlyProfitable, setShowOnlyProfitable] = useSessionState("fp:showOnlyProfitable", false);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  const setCategory = (next: ConsumableCategory) => {
    setCategoryState(next);
    // Keep the user's chosen city (default Lymhurst); only the default usage fee differs per category.
    setUsageFee(DEFAULT_USAGE_FEE[next]);
  };

  const toggleTier = (tier: number) => setSelectedTier((prev) => (prev === tier ? null : tier));

  const rows = useMemo(
    () =>
      deriveFoodPotionRows(
        recipes,
        {
          category,
          selectedTier,
          searchTerm,
          craftCity,
          buyCity,
          sellCity,
          stationKind,
          returnRatePreset,
          customReturnRatePct,
          amount,
          usageFee,
          marketTaxRate,
          demandPerDay,
          showOnlyProfitable,
          specProgress,
          dailyBonuses,
        },
        priceByItemId
      ),
    [
      recipes,
      priceByItemId,
      category,
      selectedTier,
      searchTerm,
      craftCity,
      buyCity,
      sellCity,
      stationKind,
      returnRatePreset,
      customReturnRatePct,
      amount,
      usageFee,
      marketTaxRate,
      demandPerDay,
      showOnlyProfitable,
      specProgress,
      dailyBonuses,
    ]
  );

  useEffect(() => {
    if (!rows.length) {
      setSelectedRowKey(null);
      return;
    }
    if (selectedRowKey && rows.some((row) => row.rowKey === selectedRowKey)) return;
    setSelectedRowKey(rows[0].rowKey);
  }, [rows, selectedRowKey]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.rowKey === selectedRowKey) ?? (rows[0] ?? null),
    [rows, selectedRowKey]
  );

  return {
    rows,
    selectedRow,
    selectedRowKey,
    setSelectedRowKey,
    filters: {
      category,
      setCategory,
      selectedTier,
      setSelectedTier,
      toggleTier,
      searchTerm,
      setSearchTerm,
      craftCity,
      setCraftCity,
      buyCity,
      sellCity,
      stationKind,
      setStationKind,
      returnRatePreset,
      setReturnRatePreset,
      customReturnRatePct,
      setCustomReturnRatePct,
      amount,
      setAmount,
      usageFee,
      setUsageFee,
      marketTaxRate,
      setMarketTaxRate,
      demandPerDay,
      setDemandPerDay,
      showOnlyProfitable,
      setShowOnlyProfitable,
      // Exposed so the crafter tab's familyRows (which spreads `filters`) applies spec-based
      // focus efficiency too — without this, focus cost ignores specs in the crafter view.
      specProgress,
      // Same for today's daily bonus.
      dailyBonuses,
    },
  };
}
