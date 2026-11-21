import { checkoutUrl, portalUrl, premiumVisible } from "./premium";
import { premiumDay as day, usePremium } from "./usePremium";
import "./premium.css";

/**
 * Account panel section: the player's premium (active until when, manage it) or the way to get it.
 * Renders nothing until premium opens (see premiumVisible). Loads when the panel opens.
 */
export function PremiumSection({ open }: { open: boolean }) {
  const visible = premiumVisible();
  const { state, busy, error, go } = usePremium(open && visible);

  if (!visible) return null;

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
          <p className="prem-note">Guild reports, price alerts and more tools. Every tool stays free.</p>
          <a className="prem-btn" href={login}>
            Sign in to get premium
          </a>
          <More />
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
          {state.manage ? (
            <button type="button" className="prem-btn" onClick={() => void go(portalUrl)} disabled={busy}>
              {busy ? "Opening…" : "Manage subscription"}
              <span aria-hidden="true"> &rsaquo;</span>
            </button>
          ) : null}
          {error ? (
            <p className="prem-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : state.open ? (
        <>
          <p className="prem-note">Guild reports, price alerts and more tools. Every tool stays free.</p>
          <button type="button" className="prem-btn" onClick={() => void go(checkoutUrl)} disabled={busy}>
            {busy ? "Opening checkout…" : "Get premium"}
          </button>
          <More />
          {error ? (
            <p className="prem-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="prem-note">Premium is coming soon: guild reports, price alerts and more tools.</p>
          <More />
        </>
      )}
    </div>
  );
}

function More() {
  return (
    <a className="prem-more" href="/premium">
      What's in premium<span aria-hidden="true"> &rsaquo;</span>
    </a>
  );
}
