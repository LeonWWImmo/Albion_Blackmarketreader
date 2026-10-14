import { useEffect, useState } from "react";

/**
 * The phone breakpoint used by the burger menu, the filter sheet and the compact tool rows.
 * The stylesheets use the same 640px literal; keep the two in step.
 */
export const PHONE_QUERY = "(max-width: 640px)";

function currentMatch(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : false;
}

/**
 * Live boolean for a CSS media query. The first value is read synchronously, so a phone never
 * renders the desktop layout for one frame before switching.
 */
export function useMediaQuery(query: string): boolean {
  const [isMatch, setIsMatch] = useState(() => currentMatch(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const sync = () => setIsMatch(list.matches);
    // The query can differ from the one the initial state was read with.
    sync();
    list.addEventListener("change", sync);
    return () => list.removeEventListener("change", sync);
  }, [query]);

  return isMatch;
}
