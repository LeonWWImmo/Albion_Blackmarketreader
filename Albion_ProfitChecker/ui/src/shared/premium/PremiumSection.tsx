import { useEffect, useState } from "react";
import { checkoutUrl, loadPremium, premiumVisible, type PremiumStatus } from "./premium";
import "./premium.css";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Account panel section: the player's premium (active until when, manage it) or the way to get it.
 * Renders nothing until premium opens (see premiumVisible). Loads when the panel opens.
 */
export function PremiumSection({ open }: { open: boolean }) {
  const visible = premiumVisible();
  const [state, setState] = useState<PremiumStatus | "guest" | "failed" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !visible) return;
    let alive = true;
    loadPremium().then(
      (next) => alive && setState(next),
      () => alive && setState("failed")
    );
    return () => {
      alive = false;
    };
  }, [open, visible]);

  if (!visible) return null;

  async function onGet() {
    setBusy(true);
    setError("");
    try {
      window.location.assign(await checkoutUrl());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong, try again.");
      setBusy(false);
    }
  }

  const login = `/login?next=${encodeURIComponent(window.location.pathname)}`;

  return (
    <div className="panel-section prem">
      <h4>Premium</h4>
      {state === null ? (
        <p className="prem-note">Loading…</p>
      ) : state === "failed" ? (
        <p className="prem-note">Could not load your premium right now.</p>
      ) : state === "guest" ? (
        <>
          <p className="prem-note">Price alerts, longer price history and more guild tools. Every tool stays free.</p>
          <a className="prem-btn" href={login}>
            Sign in to get premium
          </a>
        </>
      ) : state.premium ? (
        <>
          <p className="prem-active">
            <span className="prem-badge">Premium</span>
            {state.status === "cancelled" && state.endsAt
              ? `ends on ${day(state.endsAt)}`
              : state.renewsAt
                ? `renews on ${day(state.renewsAt)}`
                : "active"}
          </p>
          {state.status === "past_due" ? <p className="prem-note">Your last payment did not go through: update your card to keep premium.</p> : null}
          {state.portalUrl ? (
            <a className="prem-btn" href={state.portalUrl} target="_blank" rel="noopener noreferrer">
              Manage subscription
              <span aria-hidden="true"> &rsaquo;</span>
            </a>
          ) : null}
        </>
      ) : state.open ? (
        <>
          <p className="prem-note">Price alerts, longer price history and more guild tools. Every tool stays free.</p>
          <button type="button" className="prem-btn" onClick={() => void onGet()} disabled={busy}>
            {busy ? "Opening checkout…" : "Get premium"}
          </button>
          {error ? (
            <p className="prem-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <p className="prem-note">Premium is coming soon: price alerts, longer price history and more guild tools.</p>
      )}
    </div>
  );
}
