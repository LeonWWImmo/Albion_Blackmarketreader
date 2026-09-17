import { useCallback, useEffect, useState } from "react";
import "./communityTile.css";

/**
 * Floating Discord tile shown in the bottom-right of every tool page.
 *
 * It can be dismissed with the small cross in its corner; the choice is kept in
 * localStorage so it stays gone on the next visit. The cross is positioned absolutely so
 * showing it does not change the size of the tile itself.
 */

const STORAGE_KEY = "communityTileDismissedV1";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function CommunityTile() {
  // Read on mount rather than during render so the markup a crawler sees is stable.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  const dismiss = useCallback((event: React.MouseEvent) => {
    // The cross sits inside the link, so stop it from following the href.
    event.preventDefault();
    event.stopPropagation();
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore quota / private mode
    }
  }, []);

  if (dismissed) return null;

  return (
    <a className="rk-community-tile" href="/community" aria-label="Join the Discord community">
      <span className="rk-community-icon">
        <svg viewBox="0 0 256 199" aria-hidden="true" focusable="false">
          <path d="M216.9 16.5A208.5 208.5 0 0 0 164.6 0c-2.3 4-4.9 9.2-6.7 13.4-19.2-2.9-38.1-2.9-57.1 0-1.8-4.2-4.5-9.4-6.8-13.4a209.3 209.3 0 0 0-52.4 16.5C6.6 68.4-3.1 119.4 1.8 169.8a210.1 210.1 0 0 0 63.9 32.7c5.2-7.1 9.8-14.6 13.5-22.7-7.4-2.8-14.5-6.2-21.2-10.2 1.8-1.3 3.5-2.6 5.1-4 40.9 19.1 85.1 19.1 125.5 0 1.7 1.4 3.4 2.7 5.1 4-6.7 4-13.8 7.4-21.2 10.2 3.7 8.1 8.3 15.6 13.5 22.7a210.2 210.2 0 0 0 63.9-32.7c5.8-57.9-9.7-108.4-44.8-153.3ZM85 135.3c-12.5 0-22.7-11.4-22.7-25.4S72.5 84.5 85 84.5s22.7 11.4 22.7 25.4-10.1 25.4-22.7 25.4Zm86 0c-12.5 0-22.7-11.4-22.7-25.4s10.1-25.4 22.7-25.4 22.7 11.4 22.7 25.4-10.1 25.4-22.7 25.4Z" />
        </svg>
      </span>
      <span className="rk-community-copy">
        <strong>Discord</strong>
      </span>
      <button type="button" className="rk-community-close" onClick={dismiss} aria-label="Hide the Discord tile" title="Hide">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>
    </a>
  );
}
