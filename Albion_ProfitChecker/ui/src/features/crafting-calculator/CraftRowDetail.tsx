import { onItemIconError } from "@shared/assets/assets";
import { PriceField } from "./PriceField";

export type Tone = "gain" | "loss" | "none";

export type PriceLine = {
  key: string;
  label: string;
  hint?: string;
  value: number;
  onCommit: (value: number) => void;
};

type CraftRowDetailProps = {
  itemName: string;
  iconSrc: string;
  tierLabel: string;
  profit: { text: string; tone: Tone };
  gain: { text: string; tone: Tone };
  silverPerFocus: string;
  sold: string;
  suspect: boolean;
  prices: PriceLine[];
};

const toneClass = (tone: Tone) => (tone === "gain" ? "is-gain" : tone === "loss" ? "is-loss" : "");

/**
 * Phone breakdown of one tier: the result first, then the prices behind it as real inputs.
 * The desktop table edits those prices in its cells; this is the same data, sized for a thumb.
 */
export function CraftRowDetail({ itemName, iconSrc, tierLabel, profit, gain, silverPerFocus, sold, suspect, prices }: CraftRowDetailProps) {
  return (
    <div className="cc-sheet">
      <div className="bsheet-hero">
        <span className="bsheet-hero-icon">
          <img src={iconSrc} alt="" onError={onItemIconError} />
        </span>
        <span className="bsheet-hero-text">
          <strong>{itemName}</strong>
          <span className="bsheet-chip">{tierLabel}</span>
        </span>
      </div>

      {suspect ? (
        <p className="bsheet-warning">
          This profit looks unrealistic. The sell price is probably a stale or troll order, so check it in game before
          crafting.
        </p>
      ) : null}

      <div className="bsheet-tiles">
        <div className="bsheet-tile is-key">
          <span>Profit</span>
          <strong className={toneClass(profit.tone)}>{profit.text}</strong>
        </div>
        <div className="bsheet-tile is-key">
          <span>Gain</span>
          <strong className={toneClass(gain.tone)}>{gain.text}</strong>
        </div>
        <div className="bsheet-tile">
          <span>Silver / Focus</span>
          <strong>{silverPerFocus}</strong>
        </div>
        <div className="bsheet-tile">
          <span>Sold / Day</span>
          <strong>{sold}</strong>
        </div>
      </div>

      <h3 className="bsheet-section-title">Prices</h3>
      <div className="cc-sheet-prices">
        {prices.map((line) => (
          <PriceField key={line.key} label={line.label} hint={line.hint} value={line.value} onCommit={line.onCommit} />
        ))}
      </div>
      <p className="cc-sheet-note">Edits update this tier straight away, the same as typing into the table on a computer.</p>
    </div>
  );
}
