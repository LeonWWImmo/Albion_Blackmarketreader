import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import "./mobileNavBurger.css";

const TOOLS: ReadonlyArray<{ to: string; label: string }> = [
  { to: "/", label: "Home" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/bm-crafter", label: "Blackmarket Crafter" },
  { to: "/crafting-calculator", label: "Crafting Calculator" },
  { to: "/refining-calculator", label: "Refining Calculator" },
  { to: "/food-potion-crafter", label: "Food & Potion Crafter" },
  { to: "/gold-tracker", label: "Gold Tracker" },
];

/**
 * Phone-only burger menu (top-left) that opens a drawer to switch between tools. Hidden on desktop
 * (the inline nav is shown there instead). Portalled to <body> so no ancestor can clip it.
 * `accent` tints the button + active item to the current tool's colour.
 */
export function MobileNavBurger({ accent }: { accent?: string }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const accentVar = accent ? ({ ["--tool-accent"]: accent } as CSSProperties) : undefined;

  return (
    <>
      <button type="button" className="mnav-burger" aria-label="Open menu" style={accentVar} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {open
        ? createPortal(
            <div className="mnav-overlay" style={accentVar} onClick={() => setOpen(false)}>
              <nav className="mnav-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="mnav-head">
                  <span>Tools</span>
                  <button type="button" className="mnav-close" aria-label="Close" onClick={() => setOpen(false)}>
                    ×
                  </button>
                </div>
                {TOOLS.map((tool) => (
                  <Link
                    key={tool.to}
                    to={tool.to}
                    className={`mnav-item ${pathname === tool.to ? "active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    {tool.label}
                  </Link>
                ))}
                {/* Tool pages hide the floating Discord tile on phones (it shares the corner with the
                    filter button), so the community link lives here instead. */}
                <div className="mnav-divider" role="separator" />
                <Link
                  to="/community"
                  className={`mnav-item mnav-item-community ${pathname === "/community" ? "active" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  Discord
                </Link>
              </nav>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
