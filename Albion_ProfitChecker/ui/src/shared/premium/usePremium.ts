import { useCallback, useEffect, useState } from "react";
import { loadPremium, type PremiumStatus } from "./premium";

export type PremiumState = PremiumStatus | "guest" | "failed" | null;

/**
 * The signed-in player's premium for the account panel and /premium: loads while `active`,
 * `reload()` asks again, `go(url)` opens Stripe (checkout or portal) and shows its error.
 */
export function usePremium(active: boolean) {
  const [state, setState] = useState<PremiumState>(null);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active) return;
    let alive = true;
    loadPremium().then(
      (next) => alive && setState(next),
      () => alive && setState("failed")
    );
    return () => {
      alive = false;
    };
  }, [active, round]);

  const reload = useCallback(() => setRound((r) => r + 1), []);

  const go = useCallback(async (url: () => Promise<string>) => {
    setBusy(true);
    setError("");
    try {
      window.location.assign(await url());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong, try again.");
      setBusy(false);
    }
  }, []);

  return { state, busy, error, go, reload };
}

export const premiumDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
