import { onItemIconError } from "@shared/assets/assets";
import { DailyBonusTag } from "../../../shared";
import { normalizeItemId } from "../domain";
import type { BmCrafterRow } from "../hooks";
import { formatNumber, formatPct, tierLabel } from "./format";

export type MaterialLine = {
  itemId: string;
  qty: number;
  unit: number | null;
  total: number | null;
};

type CrafterInsightProps = {
  row: BmCrafterRow | null;
  materials: MaterialLine[];
  artefactCost: number | null;
};

const lossOrProfit = (value: number | null | undefined) => (typeof value === "number" && value < 0 ? "loss" : "profit");

/**
 * Breakdown of one craft: what it sells for, what it costs and what is left over, plus the
 * material prices behind the cost. Shared by the desktop side panel and the phone detail sheet,
 * so both always show the same numbers. `data-metric` lets the sheet rearrange the figures
 * without the panel noticing.
 */
export function CrafterInsight({ row, materials, artefactCost }: CrafterInsightProps) {
  return (
    <>
      <div className="side-hero teal-gradient-bg" data-tier={row?.tier ?? undefined}>
        <div className="side-icon" data-enchant={row?.enchant ? row.enchant : undefined}>
          <div className="side-icon-inner">
            <img
              src={row ? `/itemicons/T4_${normalizeItemId(row.item.id)}.png` : ""}
              alt=""
              onError={onItemIconError}
            />
          </div>
        </div>
        <h2>{row?.displayName || "Select an item"}</h2>
        <div className="side-tags">
          <span className="tag" id="insightTier">{row ? tierLabel(row.item.id) : "Tier --"}</span>
          {row ? <DailyBonusTag percent={row.dailyBonusPercent ?? 0} /> : null}
        </div>
      </div>
      <div className="side-metrics">
        <div data-metric="bm"><span>BM Price</span><strong className="profit">{row ? formatNumber(row.item.bm) : "--"}</strong></div>
        <div data-metric="sold"><span>Sold / Day</span><strong className="primary">{row ? formatNumber(row.item.sold) : "--"}</strong></div>
        <div data-metric="cost"><span>Craft Cost</span><strong>{row ? formatNumber(row.economics.craftCost) : "--"}</strong></div>
        <div data-metric="fee"><span>Station Fee</span><strong>{row ? formatNumber(row.economics.stationFee) : "--"}</strong></div>
        {row && (row.journalProfit ?? 0) > 0 ? (
          <div data-metric="journal"><span>Journal Profit</span><strong className="profit">+{formatNumber(row.journalProfit)}</strong></div>
        ) : null}
        <div data-metric="profit"><span>Net Profit / U</span><strong className={row ? lossOrProfit(row.economics.profit) : "profit"}>{row ? formatNumber(row.economics.profit) : "--"}</strong></div>
        <div data-metric="pct"><span>Profit %</span><strong className={row ? lossOrProfit(row.economics.profitPct) : "profit"}>{row ? formatPct(row.economics.profitPct) : "--"}</strong></div>
        <div data-metric="daily"><span>Daily Potential</span><strong className={row ? lossOrProfit(row.economics.dailyPotential) : "profit"}>{row ? formatNumber(row.economics.dailyPotential) : "--"}</strong></div>
        <div data-metric="focus"><span>Profit / Focus</span><strong className={row ? lossOrProfit(row.economics.profitPerFocus) : "profit"}>{row ? formatNumber(row.economics.profitPerFocus) : "--"}</strong></div>
        <div data-metric="id"><span>Item ID</span><strong>{row?.item.id || "--"}</strong></div>
      </div>
      <div className="material-box">
        <div className="material-head">
          <span>Material Prices Used</span>
          <span className="material-total">Total: {row ? formatNumber(row.economics.craftCost) : "--"}</span>
        </div>
        <div className="material-list">
          {materials.map((mat) => (
            <div key={`${mat.itemId}-total`} className="material-row">
              <div className="material-name">{mat.itemId}</div>
              <div className="material-meta">
                <span className="material-qty">x{mat.qty}</span>
                <span className="material-price">{formatNumber(mat.total)}</span>
              </div>
            </div>
          ))}
          {materials.map((mat) => (
            <div key={`${mat.itemId}-unit`} className="material-row material-unit-row">
              <div className="material-name">{mat.itemId} · Unit</div>
              <div className="material-meta">
                <span className="material-qty">x1</span>
                <span className="material-price">{formatNumber(mat.unit)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="material-row artefact-row" aria-hidden={row?.recipe.artifactId ? "false" : "true"}>
          <div className="material-name">{row?.recipe.artifactId || "Artefact"}</div>
          <div className="material-meta">
            <span className="material-qty">x1</span>
            <span className="material-price">{formatNumber(artefactCost)}</span>
          </div>
        </div>
      </div>
    </>
  );
}
