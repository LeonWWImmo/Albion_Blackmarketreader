import { useEffect, useRef, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSeo } from "../shared/seo/useSeo";
import { checkoutUrl, PREMIUM_OPEN, portalUrl, premiumVisible } from "../shared/premium/premium";
import { premiumDay, usePremium, type PremiumState } from "../shared/premium/usePremium";
import { AlertMock, AttendanceMock, DiscordZvzMock, ResellMock, TrendMock } from "./PremiumVisuals";
import "./premium-page.css";

/** One tile of the feature grid. `live`: in Premium today; otherwise shown as coming soon. */
type Feature = { title: string; text: string; points: string[]; visual: ReactNode; live: boolean; wide?: boolean };

const FEATURES: Feature[] = [
  {
    title: "Guild Pro",
    text: "Run your guild from one place instead of spreadsheets and screenshots.",
    points: ["Mark several guilds per server", "Attendance over 90 days instead of 7", "Regear and bank shared with your officers"],
    visual: <AttendanceMock />,
    live: false,
    wide: true
  },
  {
    title: "Price alerts",
    text: "Get a Discord message the moment the market moves, instead of checking it all day.",
    points: ["Your own rules: item, city, price", "Black Market crafts above your margin"],
    visual: <AlertMock />,
    live: false
  },
  {
    title: "Black Market resell",
    text: "What the Black Market buys right now, and what is worth carrying there.",
    points: ["Black Market price and daily sales in one view", "The best flips from every city"],
    visual: <ResellMock />,
    live: false
  },
  {
    title: "Price trends",
    text: "See if a price is climbing or falling before you buy or sell.",
    points: ["Trend charts for your watchlist", "Spot drops and spikes early"],
    visual: <TrendMock />,
    live: false,
    wide: true
  }
];

/** Free vs Premium: true = included, a string = how much. */
const COMPARE: Array<[string, boolean | string, boolean | string]> = [
  ["Every tool: crafters, calculators, price checker, guild pages", true, true],
  ["All market data for every city", true, true],
  ["Daily guild report in Discord", true, true],
  ["Report after every ZvZ", false, true],
  ["Marked guilds per server", "1", "Several"],
  ["Guild attendance history", "7 days", "90 days"],
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

const PERKS = [
  { icon: "⚔️", title: "Works while you play", text: "Reports and alerts come to Discord by themselves." },
  { icon: "🛡️", title: "Built for guilds", text: "One subscription, your whole guild sees the reports." },
  { icon: "🔓", title: "Nothing taken away", text: "Every free tool and all the data stay free." }
];

const welcomeBack = () => new URLSearchParams(window.location.search).get("premium") === "welcome";

/** Adds "is-in" to the page's [data-reveal] blocks as they scroll into view (once). */
function useReveal() {
  useEffect(() => {
    const blocks = document.querySelectorAll<HTMLElement>(".pp-page [data-reveal]");
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      blocks.forEach((b) => b.classList.add("is-in"));
      return;
    }
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          seen.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    blocks.forEach((b) => seen.observe(b));
    return () => seen.disconnect();
  }, []);
}

export function PremiumPage() {
  const visible = premiumVisible();
  const { state, busy, error, go, reload } = usePremium(visible);
  const welcome = useRef(welcomeBack()).current;
  const tries = useRef(0);

  useSeo({
    title: "Premium | Blackmarket Reader",
    description: "Blackmarket Reader Premium: a Discord report after every ZvZ, guild tools, price alerts and new tools for Albion Online. Every free tool stays free.",
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

  useReveal();

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

  const hasPremium = typeof state === "object" && state !== null && state.premium;
  const plan = (
    <PlanAction state={state} busy={busy} waiting={waiting} onBuy={() => void go(checkoutUrl)} onManage={() => void go(portalUrl)} onRetry={reload} />
  );

  return (
    <div className="pp-page">
      <div className="pp-glow" aria-hidden="true" />
      <header className="pp-top">
        <a className="pp-brand" href="/">
          Blackmarket <span>Reader</span>
        </a>
        <a className="pp-top-link" href="/dashboard">
          Open Dashboard
        </a>
      </header>

      <main className="pp-shell">
        {welcome && hasPremium ? (
          <div className="pp-welcome" role="status">
            <strong>Welcome to Premium.</strong> Thanks for supporting the tools, everything is unlocked on your account.
          </div>
        ) : null}

        <section className="pp-hero">
          <div className="pp-hero-copy">
            <span className="pp-kicker">
              <span className="pp-kicker-dot" /> Blackmarket Reader Premium
            </span>
            <h1>
              Every fight.
              <span>Reported for you.</span>
            </h1>
            <p className="pp-lead">
              After every ZvZ your guild's Discord gets the full story: won or lost, K/D, regear cost and who carried. Plus guild tools,
              price alerts and new tools that work while you play.
            </p>
            <div className="pp-hero-cta">
              {hasPremium ? (
                <a className="pp-cta pp-cta-inline" href="#plan">
                  Your Premium
                </a>
              ) : (
                <a className="pp-cta pp-cta-inline" href="#plan">
                  Get Premium · 4.99 CHF
                </a>
              )}
              <a className="pp-ghost" href="#features">
                See everything
              </a>
            </div>
            <p className="pp-hero-note">Per month · cancel any time · every free tool stays free</p>
          </div>

          <div className="pp-hero-visual">
            <span className="pp-example">Example</span>
            <DiscordZvzMock />
          </div>
        </section>

        <section className="pp-perks" data-reveal>
          {PERKS.map((p) => (
            <div className="pp-perk" key={p.title}>
              <span className="pp-perk-icon" aria-hidden="true">
                {p.icon}
              </span>
              <div>
                <b>{p.title}</b>
                <p>{p.text}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="pp-section" id="features" aria-labelledby="pp-features">
          <div className="pp-section-head" data-reveal>
            <span className="pp-eyebrow">What you get</span>
            <h2 id="pp-features">More than a report.</h2>
            <p>The ZvZ report is the start. More tools for guilds and traders join Premium over time, at the same price.</p>
          </div>
          <div className="pp-bento">
            {FEATURES.map((f) => (
              <article className={`pp-tile${f.wide ? " is-wide" : ""}`} key={f.title} data-reveal>
                <div className="pp-tile-copy">
                  <div className="pp-tile-head">
                    <h3>{f.title}</h3>
                    <span className={f.live ? "pp-live" : "pp-soon"}>{f.live ? "Live" : "Coming soon"}</span>
                  </div>
                  <p>{f.text}</p>
                  <ul>
                    {f.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
                <div className="pp-tile-visual">{f.visual}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="pp-section" aria-labelledby="pp-compare">
          <div className="pp-section-head" data-reveal>
            <span className="pp-eyebrow">Free and Premium</span>
            <h2 id="pp-compare">Free stays free.</h2>
            <p>Premium only adds. Nothing you use today moves behind a paywall.</p>
          </div>
          <div className="pp-table-wrap" data-reveal>
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

        <section className="pp-section pp-pricing" id="plan" aria-labelledby="pp-plan">
          <div className="pp-plan" data-reveal>
            <span className="pp-plan-name" id="pp-plan">
              Premium
            </span>
            <div className="pp-price">
              <strong>4.99</strong>
              <span>
                CHF
                <br />
                per month
              </span>
            </div>
            <ul className="pp-plan-list">
              <li>ZvZ report after every fight</li>
              <li>Guild Pro, price alerts and every new Premium tool</li>
              <li>Cancel any time, in one click</li>
            </ul>
            {plan}
            {error ? (
              <p className="pp-error" role="alert">
                {error}
              </p>
            ) : null}
            <p className="pp-plan-note">Tax for your country is worked out at checkout. Secure payment by Stripe.</p>
          </div>
        </section>

        <section className="pp-section" aria-labelledby="pp-faq">
          <div className="pp-section-head" data-reveal>
            <span className="pp-eyebrow">Questions</span>
            <h2 id="pp-faq">Good to know.</h2>
          </div>
          <div className="pp-faq" data-reveal>
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="pp-final" data-reveal>
          <h2>
            Your next ZvZ, <span>in Discord.</span>
          </h2>
          <p>Turn it on once. Every big fight after that reports itself.</p>
          <a className="pp-cta pp-cta-inline" href="#plan">
            {hasPremium ? "Your Premium" : "Get Premium"}
          </a>
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
      <button type="button" className="pp-cta" onClick={onBuy} disabled={busy}>
        {busy ? "Opening checkout…" : "Get Premium"}
      </button>
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
