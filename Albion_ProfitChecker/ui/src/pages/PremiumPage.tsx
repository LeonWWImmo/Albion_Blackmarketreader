import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSeo } from "../shared/seo/useSeo";
import { checkoutUrl, PREMIUM_OPEN, portalUrl, premiumVisible } from "../shared/premium/premium";
import { premiumDay, usePremium, type PremiumState } from "../shared/premium/usePremium";
import { useToolAccount } from "@shared/account/useToolAccount";
import { useRegion } from "@shared/region/useRegion";
import { MobileNavBurger } from "@shared/ui/MobileNavBurger";
import { ToolRail } from "@shared/ui/ToolRail";
// the account panel, region pill and modals (as on every tool), then this page on top
import "../features/bm-crafter/ui/bmCrafter.css";
import "./premium-page.css";

// /premium: "obsidian and gold". Few words, a few effects: a spotlight that follows the pointer and
// reveals the market underneath, gold foil type, a magnetic button, a live deal tape, feature cards
// that stack while scrolling, and the price in a turning gold ring. Hidden until the launch.

type Feature = { key: string; title: string; line: string; points: string[]; where: string; visual: ReactNode };

const FEATURES: Feature[] = [
  {
    key: "market",
    title: "Live market",
    line: "Every item, every city and the Black Market, fresh every 30 minutes.",
    points: ["City to city flips", "Black Market deals", "Price age and sales per day"],
    where: "Dashboard",
    visual: <MarketVisual />
  },
  {
    key: "alerts",
    title: "Price alerts",
    line: "Name your price. Discord pings you when the market hits it.",
    points: ["Up to 25 items, any tier, enchant and quality", "Instant buy (sell order below) or instant sell (buy order above)", "Straight to your own channel"],
    where: "Price Checker",
    visual: <AlertVisual />
  },
  {
    key: "guild",
    title: "Guild Pro",
    line: "A report in Discord after every big fight. Attendance over 90 days.",
    points: ["ZvZ report with MVP and regear", "Up to 5 guilds per server", "30 and 90 day attendance"],
    where: "Guild",
    visual: <GuildVisual />
  },
  {
    key: "craft",
    title: "Live crafting",
    line: "All four calculators on live prices, each price marked live or daily.",
    points: ["Crafting and BM Crafter", "Refining and Food & Potion", "Live, or live filled with daily"],
    where: "Calculators",
    visual: <CraftVisual />
  },
  {
    key: "city",
    title: "City Crafter",
    line: "Buy, craft and sell in one city. No transport, nothing to lose on the road.",
    points: ["Every craft in every city, T4 to T8, .0 to .4", "Materials from the cheapest city, journals filled in", "Profit a day from what the city really sells"],
    where: "City Crafter",
    visual: <CityVisual />
  },
  {
    key: "focus",
    title: "Focus Planner",
    line: "Type your focus, get the day's plan: what to craft, where and how often.",
    points: ["Every craft ranked by silver per focus point", "Your specs from the Crafting Calculator, synced", "Never more than the city sells a day"],
    where: "Focus Planner",
    visual: <FocusVisual />
  }
];

/** What stays free, said once more next to the price. */
const FREE: string[] = ["Dashboard", "Price Checker", "All calculators", "Loot Split", "Gold Tracker", "Guild tools"];

/** The tape: example deals as the live market finds them. */
const TAPE: Array<[string, string, string]> = [
  ["Grandmaster's Bow", "Martlock → Black Market", "+68.900"],
  ["Adept's Plate Helmet", "Thetford → Caerleon", "+14.200"],
  ["Expert's Fire Staff", "Lymhurst → Black Market", "+24.700"],
  ["Master's Cowl", "Bridgewatch → Fort Sterling", "+9.800"],
  ["Elder's Bloodletter", "Fort Sterling → Black Market", "+312.000"],
  ["Adept's Bag", "Lymhurst → Thetford", "+3.100"],
  ["Expert's Mercenary Jacket", "Brecilien → Black Market", "+41.500"],
  ["Master's Hunter Hood", "Caerleon → Martlock", "+12.700"]
];

/** What the spotlight reveals: a field of market numbers. Fixed, so it is the same on every visit. */
const FIELD = Array.from({ length: 160 }, (_, i) => {
  const n = ((i * 7919) % 9973) * 37 + 1200;
  const up = (i * 31) % 3 !== 0;
  return `${up ? "▲" : "▼"} ${n.toLocaleString("de-DE")}`;
});

const welcomeBack = () => new URLSearchParams(window.location.search).get("premium") === "welcome";
const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The spotlight and the magnetic button follow the pointer (CSS variables, no re-render). */
function usePointerLight(hero: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = hero.current;
    if (!el || calm() || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--x", `${e.clientX - r.left}px`);
        el.style.setProperty("--y", `${e.clientY - r.top}px`);
        el.classList.add("is-pointing");
        const cta = el.querySelector<HTMLElement>(".ob-magnet");
        if (cta) {
          const c = cta.getBoundingClientRect();
          const dx = e.clientX - (c.left + c.width / 2);
          const dy = e.clientY - (c.top + c.height / 2);
          const near = Math.hypot(dx, dy) < 160;
          cta.style.setProperty("--mx", `${near ? dx * 0.25 : 0}px`);
          cta.style.setProperty("--my", `${near ? dy * 0.35 : 0}px`);
        }
      });
    };
    el.addEventListener("pointermove", move);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", move);
    };
  }, [hero]);
}

/** While the next feature card slides over one, that one sinks back (--sink 0..1, CSS does the rest). */
function useStackSink() {
  useEffect(() => {
    if (calm()) return;
    const cards = [...document.querySelectorAll<HTMLElement>(".ob-card")];
    let frame = 0;
    const update = () => {
      frame = 0;
      cards.forEach((card, i) => {
        const next = cards[i + 1];
        if (!next) return;
        const gap = next.getBoundingClientRect().top - card.getBoundingClientRect().top;
        const sink = Math.min(1, Math.max(0, 1 - gap / (window.innerHeight * 0.7)));
        card.style.setProperty("--sink", sink.toFixed(3));
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
}

/** Adds "is-in" to [data-reveal] blocks as they scroll into view (once). */
function useReveal() {
  useEffect(() => {
    const blocks = document.querySelectorAll<HTMLElement>(".ob [data-reveal]");
    if (!("IntersectionObserver" in window) || calm()) {
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
      { rootMargin: "0px 0px -10% 0px" }
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
  const hero = useRef<HTMLElement | null>(null);
  const [region, setRegion] = useRegion();
  const { meta, layers } = useToolAccount("/premium", null, region, setRegion);

  useSeo({
    title: "Premium | Blackmarket Reader",
    description:
      "Blackmarket Reader Premium: the live market every 30 minutes, price alerts in Discord, Guild Pro with ZvZ reports, live prices in every calculator, the City Crafter and the Focus Planner. Every free tool stays free.",
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
  usePointerLight(hero);
  useStackSink();

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

  return (
    <div className="ob">
      <header className="ob-bar">
        <MobileNavBurger accent="#e0b252" />
        <a className="ob-brand" href="/">
          <img src="/apple-touch-icon.png" alt="" width={28} height={28} />
          Blackmarket Reader
        </a>
        {meta}
      </header>
      <ToolRail />

      {/* 1. the spotlight */}
      <section className="ob-hero" ref={hero} aria-labelledby="ob-title">
        <div className="ob-field" aria-hidden="true">
          {FIELD.map((n, i) => (
            <span key={i} className={n.startsWith("▲") ? "is-up" : "is-down"}>
              {n}
            </span>
          ))}
        </div>
        <div className="ob-light" aria-hidden="true" />
        <div className="ob-hero-in">
          <p className="ob-kicker">
            <i />
            {hasPremium ? "Welcome back" : "Blackmarket Reader"}
            <i />
          </p>
          <h1 id="ob-title" className="ob-foil">
            Premium
          </h1>
          <p className="ob-sub">See the market before everyone else.</p>
          <a className="ob-cta ob-magnet" href="#price">
            <span>{hasPremium ? "Your Premium" : "Get Premium"}</span>
            <b>4.99 CHF / month</b>
          </a>
        </div>
        <span className="ob-scroll" aria-hidden="true" />
      </section>

      {/* 2. the tape */}
      <div className="ob-tape" aria-hidden="true">
        {[0, 1].map((row) => (
          <div key={row} className={`ob-tape-row${row ? " is-back" : ""}`}>
            {[...TAPE, ...TAPE].map(([item, route, profit], i) => (
              <span key={i}>
                <b>{item}</b> {route} <em>{profit}</em>
              </span>
            ))}
          </div>
        ))}
      </div>

      {/* 3. the stack */}
      <section className="ob-stack" aria-label="What Premium adds">
        {FEATURES.map((f, i) => (
          <article key={f.key} className={`ob-card is-${f.key}`} style={{ "--i": i } as CSSProperties}>
            <div className="ob-card-text">
              <span className="ob-num">0{i + 1}</span>
              <h2>{f.title}</h2>
              <p>{f.line}</p>
              <ul>
                {f.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <span className="ob-where">In: {f.where}</span>
            </div>
            <div className="ob-card-visual" aria-hidden="true">
              {f.visual}
            </div>
          </article>
        ))}
      </section>

      {/* 4. the price */}
      <section className="ob-price" id="price" aria-labelledby="ob-price-title" data-reveal>
        <div className="ob-ring" aria-hidden="true" />
        <div className="ob-price-in">
          <p className="ob-kicker">
            <i />
            One plan. Everything.
            <i />
          </p>
          <h2 id="ob-price-title" className="ob-amount">
            <span className="ob-foil">4.99</span>
            <small>CHF / month</small>
          </h2>
          <div className="ob-action">
            <PlanAction state={state} busy={busy} waiting={waiting} onBuy={() => void go(checkoutUrl)} onManage={() => void go(portalUrl)} onRetry={reload} />
            {error ? <p className="ob-error">{error}</p> : null}
          </div>
          <p className="ob-fine">Cancel any time · Paid through Stripe</p>
          <div className="ob-free">
            <span>Always free</span>
            {FREE.map((tool) => (
              <i key={tool}>✓ {tool}</i>
            ))}
          </div>
        </div>
      </section>

      <footer className="ob-foot">
        <a href="/">blackmarketreader.com</a>
        <span>Data from the Albion Online Data Project and Albion's killboard.</span>
      </footer>
      {layers}
    </div>
  );
}

/* ---------- the pictures ---------- */

function MarketVisual() {
  const rows: Array<[string, string, string, string]> = [
    ["Grandmaster's Bow", "Martlock", "Black Market", "+38%"],
    ["Adept's Plate Helmet", "Thetford", "Caerleon", "+34%"],
    ["Expert's Fire Staff", "Lymhurst", "Black Market", "+26%"],
    ["Master's Cowl", "Bridgewatch", "Fort Sterling", "+21%"]
  ];
  return (
    <div className="ov-market">
      <span className="ov-live">
        <i /> Live · 12 min ago
      </span>
      {rows.map(([item, from, to, pct], i) => (
        <div key={item} className="ov-flip" style={{ "--d": `${i * 0.12}s` } as CSSProperties}>
          <b>{item}</b>
          <span>
            {from} <em>→</em> <strong className={to === "Black Market" ? "is-bm" : ""}>{to}</strong>
          </span>
          <ins>{pct}</ins>
        </div>
      ))}
    </div>
  );
}

function AlertVisual() {
  return (
    <div className="ov-alert">
      <div className="ov-ping">
        <img src="/apple-touch-icon.png" alt="" width={34} height={34} />
        <div>
          <span className="ov-ping-head">
            Blackmarket Reader <em>APP</em> <small>now</small>
          </span>
          <b>🔔 Buy now: Adept's Bag at 2.140</b>
          <span>Instant buy · sell order in Martlock ≤ 2.200</span>
        </div>
      </div>
      <div className="ov-ping is-second">
        <img src="/apple-touch-icon.png" alt="" width={34} height={34} />
        <div>
          <span className="ov-ping-head">
            Blackmarket Reader <em>APP</em> <small>4 min</small>
          </span>
          <b>🔔 Sell now: Elder's Bloodletter at 1.31m</b>
          <span>Instant sell · buy order in Black Market ≥ 1.3m</span>
        </div>
      </div>
    </div>
  );
}

function GuildVisual() {
  return (
    <div className="ov-guild">
      <div className="ov-score">
        <b>48</b>
        <span>⚔️</span>
        <b>19</b>
      </div>
      <div className="ov-bar">
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} className={i < 7 ? "is-k" : "is-d"} />
        ))}
      </div>
      <p className="ov-mvp">
        👑 <b>Moonveil</b> · 9 kills · 6.1m fame
      </p>
      <img className="ov-banner" src="/picture/zvz-won.jpg" alt="" loading="lazy" />
    </div>
  );
}

function CraftVisual() {
  const prices: Array<[string, string, boolean]> = [
    ["Planks", "1.218", true],
    ["Metal Bar", "2.480", true],
    ["Artefact", "9.900", false],
    ["Sells for", "64.200", true]
  ];
  return (
    <div className="ov-craft">
      <div className="ov-switch">
        <span>✦ Live prices</span>
        <div>
          <i>Daily</i>
          <i>Live</i>
          <i className="is-on">Live + fill</i>
        </div>
      </div>
      {prices.map(([name, value, live]) => (
        <div key={name} className="ov-price">
          <span>{name}</span>
          <b>
            {value} <i className={live ? "is-live" : "is-daily"} />
          </b>
        </div>
      ))}
    </div>
  );
}

function CityVisual() {
  const cities: Array<[string, string, number]> = [
    ["Lymhurst", "25.7m", 100],
    ["Fort Sterling", "11.6m", 45],
    ["Bridgewatch", "5.8m", 23],
    ["Thetford", "4.3m", 17]
  ];
  return (
    <div className="ov-city">
      {cities.map(([city, daily, fill], i) => (
        <div key={city} className={`ov-city-row${i === 0 ? " is-on" : ""}`} style={{ "--fill": `${fill}%`, "--d": `${i * 0.12}s` } as CSSProperties}>
          <b>{city}</b>
          <span>
            <i />
          </span>
          <em>{daily} a day</em>
        </div>
      ))}
      <p className="ov-city-best">
        ★ Master's Siege Hammer · <b>+18.132</b> a craft · 313 sold a day
      </p>
    </div>
  );
}

function FocusVisual() {
  const plan: Array<[string, string, string]> = [
    ["Elder's Bag", "× 3", "+412.000"],
    ["Master's Fire Staff", "× 6", "+268.900"],
    ["Expert's Cowl", "× 12", "+169.500"]
  ];
  return (
    <div className="ov-focus">
      <p className="ov-focus-head">
        <span>
          <b>10.000</b> focus
        </span>
        <em>→</em>
        <strong className="ob-foil">+850.400</strong>
      </p>
      <div className="ov-focus-bar">
        <i style={{ "--w": "46%" } as CSSProperties} />
        <i style={{ "--w": "31%" } as CSSProperties} />
        <i style={{ "--w": "23%" } as CSSProperties} />
      </div>
      {plan.map(([item, crafts, total], i) => (
        <div key={item} className="ov-focus-row" style={{ "--d": `${i * 0.12}s` } as CSSProperties}>
          <b>{item}</b>
          <span>{crafts}</span>
          <ins>{total}</ins>
        </div>
      ))}
      <p className="ov-city-best">✓ Specs synced from the Crafting Calculator</p>
    </div>
  );
}

/* ---------- the buy button ---------- */

type PlanActionProps = {
  state: PremiumState;
  busy: boolean;
  waiting: boolean;
  onBuy: () => void;
  onManage: () => void;
  onRetry: () => void;
};

/** The price block's button: sign in, buy, manage, or why it can't be bought yet. */
function PlanAction({ state, busy, waiting, onBuy, onManage, onRetry }: PlanActionProps) {
  if (state === null) {
    return (
      <button type="button" className="ob-cta" disabled>
        <span>Loading…</span>
      </button>
    );
  }
  if (state === "failed") {
    return (
      <>
        <button type="button" className="ob-cta is-quiet" onClick={onRetry}>
          <span>Try again</span>
        </button>
        <p className="ob-note">Could not load your premium right now.</p>
      </>
    );
  }
  if (state === "guest") {
    return (
      <>
        <a className="ob-cta" href={`/login?next=${encodeURIComponent("/premium")}`}>
          <span>Sign in to get Premium</span>
        </a>
        <p className="ob-note">Premium belongs to your account.</p>
      </>
    );
  }
  if (state.premium) {
    const until =
      state.status === "cancelled" && state.endsAt ? `Ends on ${premiumDay(state.endsAt)}` : state.renewsAt ? `Renews on ${premiumDay(state.renewsAt)}` : "Active";
    return (
      <>
        <p className="ob-active">
          <span className="ob-badge">Premium</span>
          {until}
        </p>
        {state.status === "past_due" ? <p className="ob-note ob-warn">Your last payment did not go through: update your card to keep Premium.</p> : null}
        {state.manage ? (
          <button type="button" className="ob-cta is-quiet" onClick={onManage} disabled={busy}>
            <span>{busy ? "Opening…" : "Manage subscription"}</span>
          </button>
        ) : null}
      </>
    );
  }
  if (waiting) {
    return (
      <button type="button" className="ob-cta" disabled>
        <span>Activating your Premium…</span>
      </button>
    );
  }
  if (state.open) {
    return (
      <button type="button" className="ob-cta" onClick={onBuy} disabled={busy}>
        <span>{busy ? "Opening checkout…" : "Get Premium"}</span>
      </button>
    );
  }
  return (
    <>
      <button type="button" className="ob-cta" disabled>
        <span>Coming soon</span>
      </button>
      <p className="ob-note">Premium opens soon. Every tool stays free until then and after.</p>
    </>
  );
}
