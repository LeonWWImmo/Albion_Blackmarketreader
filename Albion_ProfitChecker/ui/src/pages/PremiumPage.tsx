import { useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useSeo } from "../shared/seo/useSeo";
import { checkoutUrl, PREMIUM_OPEN, portalUrl, premiumVisible } from "../shared/premium/premium";
import { premiumDay, usePremium, type PremiumState } from "../shared/premium/usePremium";
import "./premium-page.css";

/** "soon": shown with a Coming soon badge until the feature is built. */
type Feature = { title: string; text: string; points: string[]; icon: string; soon: boolean };

const FEATURES: Feature[] = [
  {
    title: "Guild Pro",
    text: "Run your guild from one place instead of spreadsheets and screenshots.",
    points: ["Mark several guilds per server", "Attendance over 90 days instead of 7", "A Discord report after every ZvZ", "Regear and bank shared with your officers"],
    icon: "M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm0 2.2 6 2.25V11c0 3.9-2.5 7.6-6 8.9-3.5-1.3-6-5-6-8.9V6.45l6-2.25Z",
    soon: true
  },
  {
    title: "Price alerts",
    text: "Get a Discord message when the market moves, instead of checking it all day.",
    points: ["Your own rules: item, city and price", "Black Market crafts above your margin", "Checked after every market update"],
    icon: "M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z",
    soon: true
  },
  {
    title: "Black Market resell",
    text: "See what the Black Market buys right now and what is worth taking there.",
    points: ["Black Market price and daily sales in one view", "Best flips from the cities", "A watchlist for your items"],
    icon: "M14 3 4 9l6 3.5 8-4.7V14h2V6L14 3Zm-4 11-6-3.5V15l6 3.5V14Zm2 4.5L18 15v-2.5L12 16v2.5Z",
    soon: true
  },
  {
    title: "Price trends",
    text: "Charts that show if a price is climbing or falling before you buy or sell.",
    points: ["Trend charts for your watchlist", "Spot drops and spikes early", "The best days to buy and sell"],
    icon: "M3 17.25 9.5 10.75l4 4L21 7.25V12h2V4h-8v2h4.59L13.5 12.09l-4-4L1.59 16 3 17.25ZM3 20h18v2H3v-2Z",
    soon: true
  }
];

/** Free vs Premium: true = included, a string = how much. */
const COMPARE: Array<[string, boolean | string, boolean | string]> = [
  ["Every tool: crafters, calculators, price checker, guild pages", true, true],
  ["All market data for every city", true, true],
  ["Marked guilds per server", "1", "Several"],
  ["Guild attendance history", "7 days", "90 days"],
  ["Daily guild report in Discord", true, true],
  ["Report after every ZvZ", false, true],
  ["Price alerts", false, true],
  ["Black Market resell tool", false, true],
  ["Price trends", false, true]
];

const FAQ: Array<[string, string]> = [
  ["Will a free tool become paid?", "No. Every tool and all the market data you use today stay free for everyone. Premium only adds extras on top."],
  [
    "How do I cancel?",
    "Open Manage subscription on this page or in the account panel of any tool. You keep Premium until the end of the month you paid for, and nothing renews after that."
  ],
  [
    "Who handles the payment?",
    "Stripe sells Premium for us and works out the tax of your country, so the price at checkout can include tax. We never see your card."
  ],
  ["Do I need an account?", "Yes. Premium belongs to your Blackmarket Reader account, so sign in with the same account on every device."],
  ["Why pay at all?", "Servers, the database and the Discord bot cost money every month. Premium keeps the free tools running and pays for new ones."]
];

const welcomeBack = () => new URLSearchParams(window.location.search).get("premium") === "welcome";

export function PremiumPage() {
  const visible = premiumVisible();
  const { state, busy, error, go, reload } = usePremium(visible);
  const welcome = useRef(welcomeBack()).current;
  const tries = useRef(0);

  useSeo({
    title: "Premium | Blackmarket Reader",
    description: "Blackmarket Reader Premium: guild reports, price alerts and new tools for Albion Online. Every free tool stays free.",
    canonical: "https://blackmarketreader.com/premium",
    noindex: !PREMIUM_OPEN
  });

  useEffect(() => {
    document.body.classList.add("premium-page-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter", "panel-open", "crafting-calculator-body");
    return () => {
      document.body.classList.remove("premium-page-body");
    };
  }, []);

  // back from Stripe: the webhook can land a few seconds after the player, so ask again for a while
  const waiting = welcome && typeof state === "object" && state !== null && !state.premium && tries.current < 8;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => {
      tries.current += 1;
      reload();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [waiting, state, reload]);

  if (!visible) return <Navigate to="/" replace />;

  return (
    <div className="pp-page">
      <header className="pp-top">
        <a className="pp-brand" href="/">
          Blackmarket <span>Reader</span>
        </a>
        <a className="pp-top-link" href="/dashboard">
          Open Dashboard
        </a>
      </header>

      <main className="pp-shell">
        {welcome && typeof state === "object" && state?.premium ? (
          <div className="pp-welcome" role="status">
            <strong>Welcome to Premium.</strong> Thanks for supporting the tools, everything is unlocked on your account.
          </div>
        ) : null}

        <section className="pp-hero">
          <div className="pp-hero-copy">
            <span className="pp-kicker">Blackmarket Reader Premium</span>
            <h1>
              Tools that work <span>while you play.</span>
            </h1>
            <p className="pp-lead">
              Every tool and all market data stay free for everyone. Premium adds the extras that run for you in the background: guild
              reports, price alerts and new tools. And it keeps the site running.
            </p>
            <ul className="pp-points">
              <li>Cancel any time</li>
              <li>Every free tool stays free</li>
              <li>Secure payment by Stripe</li>
            </ul>
          </div>

          <aside className="pp-plan" aria-label="Premium plan">
            <span className="pp-plan-name">Premium</span>
            <div className="pp-price">
              <strong>4.99</strong>
              <span>
                CHF
                <br />
                per month
              </span>
            </div>
            <p className="pp-plan-note">Tax for your country is worked out at checkout.</p>
            <PlanAction state={state} busy={busy} waiting={waiting} onBuy={() => void go(checkoutUrl)} onManage={() => void go(portalUrl)} onRetry={reload} />
            {error ? (
              <p className="pp-error" role="alert">
                {error}
              </p>
            ) : null}
          </aside>
        </section>

        <section className="pp-section" aria-labelledby="pp-features">
          <h2 id="pp-features">What you get</h2>
          <div className="pp-features">
            {FEATURES.map((f) => (
              <article className="pp-feature" key={f.title}>
                <div className="pp-feature-head">
                  <svg className="pp-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d={f.icon} />
                  </svg>
                  <h3>{f.title}</h3>
                  {f.soon ? <span className="pp-soon">Coming soon</span> : null}
                </div>
                <p>{f.text}</p>
                <ul>
                  {f.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="pp-section" aria-labelledby="pp-compare">
          <h2 id="pp-compare">Free and Premium</h2>
          <div className="pp-table-wrap">
            <table className="pp-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="pp-sr">Feature</span>
                  </th>
                  <th scope="col">Free</th>
                  <th scope="col" className="pp-col-prem">
                    Premium
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(([name, free, prem]) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    <td>
                      <Cell value={free} />
                    </td>
                    <td className="pp-col-prem">
                      <Cell value={prem} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pp-section" aria-labelledby="pp-faq">
          <h2 id="pp-faq">Questions</h2>
          <div className="pp-faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <footer className="pp-footer">
          <nav aria-label="More">
            <a href="/legal#terms">Terms</a>
            <a href="/legal#privacy">Privacy</a>
            <a href="/community">Discord</a>
            <a href="mailto:blackmarketreader@gmail.com">Contact</a>
          </nav>
          <p>A fan-made tool, not affiliated with, endorsed by or sponsored by Sandbox Interactive GmbH or Albion Online.</p>
        </footer>
      </main>
    </div>
  );
}

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "string") return <span className="pp-amount">{value}</span>;
  return value ? (
    <svg className="pp-yes" viewBox="0 0 24 24" role="img" aria-label="Included">
      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" />
    </svg>
  ) : (
    <span className="pp-no" aria-label="Not included">
      –
    </span>
  );
}

type PlanActionProps = {
  state: PremiumState;
  busy: boolean;
  waiting: boolean;
  onBuy: () => void;
  onManage: () => void;
  onRetry: () => void;
};

/** The plan card's button: sign in, buy, manage, or why it can't be bought yet. */
function PlanAction({ state, busy, waiting, onBuy, onManage, onRetry }: PlanActionProps) {
  if (state === null) {
    return (
      <button type="button" className="pp-cta" disabled>
        Loading…
      </button>
    );
  }
  if (state === "failed") {
    return (
      <>
        <button type="button" className="pp-cta pp-cta-quiet" onClick={onRetry}>
          Try again
        </button>
        <p className="pp-plan-sub">Could not load your premium right now.</p>
      </>
    );
  }
  if (state === "guest") {
    return (
      <>
        <a className="pp-cta" href={`/login?next=${encodeURIComponent("/premium")}`}>
          Sign in to get Premium
        </a>
        <p className="pp-plan-sub">Premium belongs to your account.</p>
      </>
    );
  }
  if (state.premium) {
    const until =
      state.status === "cancelled" && state.endsAt ? `Ends on ${premiumDay(state.endsAt)}` : state.renewsAt ? `Renews on ${premiumDay(state.renewsAt)}` : "Active";
    return (
      <>
        <p className="pp-active">
          <span className="pp-badge">Premium</span>
          {until}
        </p>
        {state.status === "past_due" ? <p className="pp-plan-sub pp-warn">Your last payment did not go through: update your card to keep Premium.</p> : null}
        {state.manage ? (
          <button type="button" className="pp-cta pp-cta-quiet" onClick={onManage} disabled={busy}>
            {busy ? "Opening…" : "Manage subscription"}
          </button>
        ) : null}
      </>
    );
  }
  if (waiting) {
    return (
      <button type="button" className="pp-cta" disabled>
        Activating your Premium…
      </button>
    );
  }
  if (state.open) {
    return (
      <>
        <button type="button" className="pp-cta" onClick={onBuy} disabled={busy}>
          {busy ? "Opening checkout…" : "Get Premium"}
        </button>
        <p className="pp-plan-sub">Cancel any time in one click.</p>
      </>
    );
  }
  return (
    <>
      <button type="button" className="pp-cta" disabled>
        Coming soon
      </button>
      <p className="pp-plan-sub">Premium opens soon. Every tool stays free until then and after.</p>
    </>
  );
}
