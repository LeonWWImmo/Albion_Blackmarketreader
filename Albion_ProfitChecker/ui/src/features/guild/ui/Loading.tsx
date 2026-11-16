import { useEffect, useState } from "react";

/** After this long the wait gets its own line: the visitor knows it still runs. */
const SLOW_MS = 4000;

/**
 * A loading card that says what loads and that it takes a moment. Everything comes live from
 * Albion's killboard, which is slow at times; each tab loads its own part when it is opened.
 */
export function Loading({ what, head = false }: { what: string; head?: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className={`gd-skeleton gd-loading${head ? " is-head" : ""}`} role="status" aria-busy="true">
      <span className="gd-spinner" aria-hidden="true" />
      <b>{what}</b>
      <small>{slow ? "Albion's killboard is slow right now. Still loading, hang on…" : "Live from Albion's killboard, this takes a few seconds."}</small>
    </div>
  );
}
