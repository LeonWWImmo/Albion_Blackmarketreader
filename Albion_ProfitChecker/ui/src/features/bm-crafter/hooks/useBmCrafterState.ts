import { useEffect, useMemo, useState } from "react";
import { useSessionState } from "../../../shared";
import type { CraftBonus, JournalData, OwnedJournals } from "../../../shared";
import { returnRatePercentToDecimal } from "../domain";
import type { BmCrafterDataBundle } from "../data";
import { deriveBmCrafterRows } from "./deriveRows";

interface JournalConfig {
  enabled: boolean;
  owned: OwnedJournals;
  data: JournalData | null;
}

// Filter settings persist for the browser session so navigating to an item's breakdown and
// back does not wipe the applied tiers/enchants/city/return-rate etc.
const NO_BONUSES: ReadonlyArray<CraftBonus> = [];

export function useBmCrafterState(
  bundle: BmCrafterDataBundle | null,
  journal?: JournalConfig,
  /** Today's daily crafting bonuses (empty when none are reported). */
  craftBonuses: ReadonlyArray<CraftBonus> = NO_BONUSES
) {
  const [selectedTiers, setSelectedTiers] = useSessionState<number[]>("bm-crafter:selectedTiers", []);
  const [selectedEnchants, setSelectedEnchants] = useSessionState<number[]>("bm-crafter:selectedEnchants", []);
  const [minSold, setMinSold] = useSessionState("bm-crafter:minSold", 0);
  const [searchTerm, setSearchTerm] = useSessionState("bm-crafter:searchTerm", "");
  const [sortByDailyTop, setSortByDailyTop] = useSessionState("bm-crafter:sortByDailyTop", false);
  const [showOnlyProfitable, setShowOnlyProfitable] = useSessionState("bm-crafter:showOnlyProfitable", true);
  const [nonArtefactOnly, setNonArtefactOnly] = useSessionState("bm-crafter:nonArtefactOnly", false);
  const [onlyBonusItems, setOnlyBonusItems] = useSessionState("bm-crafter:onlyBonusItems", false);
  const [bonusCity, setBonusCity] = useSessionState("bm-crafter:bonusCity", false);
  const [returnRatePercent, setReturnRatePercent] = useSessionState("bm-crafter:returnRatePercent", 15.25);
  const [craftCity, setCraftCity] = useSessionState<string>("bm-crafter:craftCity", "Lymhurst");
  const [usageFeePer100, setUsageFeePer100] = useSessionState<number>("bm-crafter:usageFeePer100", 1500);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  const setBonusCityPreset = (enabled: boolean) => {
    setBonusCity(enabled);
    setReturnRatePercent(enabled ? 24.81 : 15.25);
  };

  const returnRate = useMemo(() => returnRatePercentToDecimal(returnRatePercent), [returnRatePercent]);
  // The "only bonus items" filter does nothing while no bonus is known, so it cannot empty the table.
  const dailyBonus = useMemo(
    () => (craftBonuses.length ? { bonuses: craftBonuses, onlyBonusItems } : undefined),
    [craftBonuses, onlyBonusItems]
  );

  const rows = useMemo(
    () =>
      deriveBmCrafterRows(bundle, {
        selectedTiers,
        selectedEnchants,
        minSold,
        searchTerm,
        returnRate,
        sortByDailyTop,
        showOnlyProfitable,
        nonArtefactOnly,
        craftCity,
        usageFeePer100,
        journal,
        dailyBonus
      }),
    [bundle, selectedTiers, selectedEnchants, minSold, searchTerm, returnRate, sortByDailyTop, showOnlyProfitable, nonArtefactOnly, craftCity, usageFeePer100, journal, dailyBonus]
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

  const toggleTier = (tier: number) =>
    setSelectedTiers((prev) => (prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]));
  const toggleEnchant = (enchant: number) =>
    setSelectedEnchants((prev) => (prev.includes(enchant) ? prev.filter((e) => e !== enchant) : [...prev, enchant]));

  const resetFilters = () => {
    setSelectedTiers([]);
    setSelectedEnchants([]);
    setMinSold(0);
    setSearchTerm("");
    setSortByDailyTop(false);
    setShowOnlyProfitable(true);
    setNonArtefactOnly(false);
    setOnlyBonusItems(false);
  };

  return {
    rows,
    selectedRow,
    selectedRowKey,
    setSelectedRowKey,
    filters: {
      selectedTiers,
      setSelectedTiers,
      selectedEnchants,
      setSelectedEnchants,
      minSold,
      setMinSold,
      searchTerm,
      setSearchTerm,
      sortByDailyTop,
      setSortByDailyTop,
      showOnlyProfitable,
      setShowOnlyProfitable,
      nonArtefactOnly,
      setNonArtefactOnly,
      onlyBonusItems,
      setOnlyBonusItems,
      bonusCity,
      setBonusCity,
      setBonusCityPreset,
      returnRatePercent,
      setReturnRatePercent,
      returnRate,
      craftCity,
      setCraftCity,
      usageFeePer100,
      setUsageFeePer100,
      toggleTier,
      toggleEnchant,
      resetFilters
    }
  };
}
