import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./regionPicker.css";

type PickerRegion = "eu" | "us";

/**
 * True when the visitor has never chosen a server region: nothing stored on this device, none on
 * the account, and none in the shared link they arrived with (only Crafting Calculator links
 * carry one). Every tool asks once on the first visit, whichever page that visit starts on;
 * otherwise a player on the other server silently sees the wrong prices.
 */
export function needsRegionChoice(
  profileRegion?: string | null,
  /** Region carried by a shared link. Only the Crafting Calculator reads `?region=`, so only it
   *  passes one; elsewhere a `?region=` in the address must not skip the question. */
  linkRegion: string | null = null
): boolean {
  const valid = (value: string | null | undefined) => value === "eu" || value === "us";
  if (valid(profileRegion)) return false;
  try {
    if (valid((localStorage.getItem("region") || "").toLowerCase())) return false;
  } catch {
    // storage blocked: asking every visit is better than guessing
  }
  return !valid(linkRegion);
}

type RegionPickerProps = {
  /** Called with the chosen region; the page applies it the same way as its own region switch. */
  onPick: (region: PickerRegion) => void;
};

/** First-visit server-region picker. Sits above every other overlay: the region decides which data loads. */
export function RegionPicker({ onPick }: RegionPickerProps) {
  const firstOption = useRef<HTMLButtonElement | null>(null);

  // A modal question: focus starts on it, and the page behind cannot be reached with Tab while
  // it is open (the picker is portalled outside #root, so it stays usable).
  useEffect(() => {
    const app = document.getElementById("root");
    app?.setAttribute("inert", "");
    firstOption.current?.focus({ preventScroll: true });
    return () => app?.removeAttribute("inert");
  }, []);

  function pick(region: PickerRegion) {
    // Stored here as well: a region switch that matches the current default writes nothing, and a
    // guest has no account to keep it on, so the choice would be asked for again on the next visit.
    try {
      localStorage.setItem("region", region);
    } catch {
      // storage blocked: the page still switches, it just cannot remember it
    }
    onPick(region);
  }

  return createPortal(
    <div className="region-overlay" role="dialog" aria-modal="true" aria-labelledby="region-picker-title">
      <div className="region-card">
        <span className="region-eyebrow">Albion Online</span>
        <h3 id="region-picker-title">Choose your server region</h3>
        <p className="region-lead">
          Prices differ per server. Pick the one you play on &mdash; you can switch it any time from your account panel.
        </p>
        <div className="region-grid">
          <button ref={firstOption} type="button" className="region-option" onClick={() => pick("eu")}>
            <Globe />
            <span className="region-name">Europe</span>
            <span className="region-sub">EU server data</span>
            <Arrow />
          </button>
          <button type="button" className="region-option" onClick={() => pick("us")}>
            <Globe />
            <span className="region-name">America</span>
            <span className="region-sub">US server data</span>
            <Arrow />
          </button>
        </div>
        <p className="region-foot">Market data is synced once per day for free users.</p>
      </div>
    </div>,
    document.body
  );
}

function Globe() {
  return (
    <span className="region-globe" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <ellipse cx="12" cy="12" rx="4.2" ry="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3.2 9h17.6M3.2 15h17.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </span>
  );
}

function Arrow() {
  return (
    <span className="region-go" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M5 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
