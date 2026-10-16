import { useState } from "react";
import { createPortal } from "react-dom";
import { onItemIconError } from "../assets/assets";
import { JOURNAL_PROFESSIONS, type JournalProfession } from "./journals";
import { journalPriceTable, type JournalData, type OwnedJournals } from "./useJournals";
import "./journalControls.css";

const PROFESSION_ORDER: JournalProfession[] = ["warrior", "hunter", "mage", "toolmaker"];

function fmt(value: number): string {
  return value > 0 ? Math.round(value).toLocaleString("en-US") : "–";
}

/** Albion CDN icon for a profession's (full) journal. */
function journalIcon(profession: JournalProfession): string {
  return `https://render.albiononline.com/v1/item/T4_${JOURNAL_PROFESSIONS[profession].stem}_FULL.png`;
}

interface JournalControlsProps {
  enabled: boolean;
  owned: OwnedJournals;
  onToggleEnabled: (next: boolean) => void;
  onToggleOwned: (profession: JournalProfession) => void;
  /** Live journal price data + the city used for the price table (defaults sensibly if omitted). */
  data?: JournalData | null;
  city?: string;
  /**
   * Restrict the settings modal to a single profession's journal. Use on single-item views (the
   * Crafting Calculator) so only the journal that item actually fills is shown. Omit (or undefined)
   * to show all four; null means the current item has no journal.
   */
  onlyProfession?: JournalProfession | null;
  /**
   * Show the per-profession "do you fill this" checkboxes. Off on list views (BM Crafter) where all
   * four journals always apply and the modal is a pure price reference. Defaults to true.
   */
  showOwnership?: boolean;
}

/**
 * Shared journal-profit control: a toggle to include journal ("book") profit, an info button
 * explaining the mechanic, and a settings modal to choose which profession journals you fill and
 * see the per-tier empty/full/profit prices. Prices come from live per-city data.
 *
 * Modals are portalled to <body> so they are never clipped by a transformed/overflow-hidden
 * filter container.
 */
export function JournalControls({ enabled, owned, onToggleEnabled, onToggleOwned, data, city, onlyProfession, showOwnership = true }: JournalControlsProps) {
  const [showSettings, setShowSettings] = useState(false);

  // Single-item views pass onlyProfession to show just that item's journal. `undefined` = show all.
  const shownProfessions =
    onlyProfession === undefined ? PROFESSION_ORDER : onlyProfession ? [onlyProfession] : [];

  const settingsModal = (
    <div className="jrnl-overlay" onClick={() => setShowSettings(false)}>
      <div className="jrnl-modal" onClick={(e) => e.stopPropagation()}>
        <button className="jrnl-modal-close" aria-label="Close" onClick={() => setShowSettings(false)}>
          ×
        </button>
        <h3>{showOwnership ? "Which journals do you fill?" : "Journal prices"}</h3>
        <details className="jrnl-explain">
          <summary>How journal profit works</summary>
          <p className="jrnl-note">
            Crafting gear earns fame; slotting an empty journal soaks it up and, once full, it sells for
            more than the empty cost — that extra silver is added to each craft. {showOwnership
              ? "Only items crafted with a selected profession's journal count. "
              : "Each item's fame fills the journal of its crafting profession. "}
            Prices below are live for {city ? city : "your craft city"} (or the best journal-trading
            city if it does not sell there).
          </p>
          <ul className="jrnl-formula">
            <li>fame = total resources × fame-per-resource (by tier) × artifact factor</li>
            <li>journals filled = fame ÷ capacity (T4 = 3600 … T8 = 58590)</li>
            <li>profit per journal = full × 0.935 (6.5% tax) − empty</li>
            <li>added profit = journals filled × profit per journal</li>
          </ul>
        </details>
        {shownProfessions.length === 0 ? (
          <p className="jrnl-note">This item does not fill any crafting journal.</p>
        ) : null}
        <ul className="jrnl-prof-list">
          {shownProfessions.map((profession) => {
            const rows = data ? journalPriceTable(data, profession, city ?? "") : [];
            const hasPrices = rows.some((r) => r.profit > 0);
            return (
              <li key={profession}>
                <div className="jrnl-prof-head">
                  <img
                    className="jrnl-prof-icon"
                    src={journalIcon(profession)}
                    alt=""
                    loading="lazy"
                    onError={onItemIconError}
                  />
                  <div className="jrnl-prof-labels">
                    {showOwnership ? (
                      <label className="jrnl-toggle">
                        <input
                          type="checkbox"
                          checked={owned[profession]}
                          onChange={() => onToggleOwned(profession)}
                        />
                        <span>{JOURNAL_PROFESSIONS[profession].journalName}</span>
                      </label>
                    ) : (
                      <strong className="jrnl-prof-name">{JOURNAL_PROFESSIONS[profession].journalName}</strong>
                    )}
                    <span className="jrnl-prof-sub">{JOURNAL_PROFESSIONS[profession].label}</span>
                  </div>
                </div>
                {(showOwnership ? owned[profession] : true) && hasPrices ? (
                  <table className="jrnl-price-table">
                    <thead>
                      <tr><th>Tier</th><th>Empty</th><th>Full</th><th>Profit</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.tier}>
                          <td>T{r.tier}</td>
                          <td>{fmt(r.empty)}</td>
                          <td>{fmt(r.full)}</td>
                          <td className={r.profit > 0 ? "jrnl-pos" : ""}>{fmt(r.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

  return (
    <div className="jrnl-control">
      <label className="jrnl-toggle">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggleEnabled(e.target.checked)} />
        <span>Journal profit</span>
      </label>
      <button
        type="button"
        className="jrnl-edit-btn"
        disabled={!enabled}
        aria-label="Edit journals and view prices"
        title="Edit journals and view prices"
        onClick={() => setShowSettings(true)}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
        </svg>
        <span>Journals</span>
      </button>

      {showSettings ? createPortal(settingsModal, document.body) : null}
    </div>
  );
}
