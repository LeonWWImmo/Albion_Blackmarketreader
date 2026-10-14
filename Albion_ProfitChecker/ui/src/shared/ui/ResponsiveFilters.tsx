import { useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./responsiveFilters.css";

interface ResponsiveFiltersProps {
  children: ReactNode;
  /** Title shown on the mobile sheet header + FAB aria-label. */
  title?: string;
  /** Tints the FAB + sheet accents to the current tool's colour. */
  accent?: string;
}

/**
 * Renders filter controls inline on desktop (unchanged), and on phones (≤640px) hides them and
 * shows a floating filter button bottom-right that opens the same controls in a bottom-sheet.
 *
 * Desktop safety: the FAB is CSS-hidden ≥641px so it can never open there — the sheet is only ever
 * rendered on mobile. The inline copy is the only thing desktop sees. The sheet is portalled to
 * <body> so a transformed/overflow-hidden ancestor cannot clip it.
 */
export function ResponsiveFilters({ children, title = "Filters", accent }: ResponsiveFiltersProps) {
  const [open, setOpen] = useState(false);
  const accentVar = accent ? ({ ["--tool-accent"]: accent } as CSSProperties) : undefined;

  return (
    <>
      <div className="resp-filters-inline">{children}</div>

      <button
        type="button"
        className="resp-filters-fab"
        aria-label={title}
        title={title}
        style={accentVar}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {/* funnel: reads as "filter" where the old pencil read as "edit" */}
          <path d="M3 4.5h18l-7 8.25V19l-4 2v-8.25L3 4.5Z" />
        </svg>
      </button>

      {open
        ? createPortal(
            <div className="resp-filters-overlay" style={accentVar} onClick={() => setOpen(false)}>
              <div className="resp-filters-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="resp-filters-sheet-head">
                  <span>{title}</span>
                  <button type="button" className="resp-filters-sheet-close" aria-label="Close" onClick={() => setOpen(false)}>
                    ×
                  </button>
                </div>
                <div className="resp-filters-sheet-body">{children}</div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
