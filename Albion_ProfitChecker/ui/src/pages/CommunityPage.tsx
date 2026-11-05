import { useEffect, useState, type ReactNode } from "react";
import { fetchGoldHistory, type GoldRegion } from "../features/gold-tracker/useGoldHistory";
import "./community.css";

const INVITE = "https://discord.gg/HF2Ctg73m5";
const ROTATE_MS = 6000;

type Prices = Partial<Record<GoldRegion, number>>;
type Tab = {
  readonly id: string;
  readonly icon: string;
  readonly label: string;
  readonly channel: string;
  readonly render: (prices: Prices) => ReactNode;
};

const silver = (value: number | undefined) => (value ? Math.round(value).toLocaleString("en-US") : "9,500");

function DiscordLogo() {
  return (
    <svg className="cm-discord-logo" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
      />
    </svg>
  );
}

function JoinButton() {
  return (
    <a className="cm-join" href={INVITE} target="_blank" rel="noopener noreferrer">
      <DiscordLogo />
      <span>Join the Discord</span>
      <span className="material-symbols-outlined" aria-hidden="true">north_east</span>
    </a>
  );
}

/** One message in the Discord preview: the bot (or a player) with a card. */
function Message({ author, bot = false, time, children }: { author: string; bot?: boolean; time: string; children: ReactNode }) {
  return (
    <div className="cm-msg">
      <div className={`cm-avatar${bot ? " cm-avatar-bot" : ""}`} aria-hidden="true">{author.slice(0, 1)}</div>
      <div className="cm-msg-body">
        <div className="cm-msg-head">
          <b>{author}</b>
          {bot && <span className="cm-app">APP</span>}
          <span className="cm-time">{time}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

const TABS: ReadonlyArray<Tab> = [
  {
    id: "daily",
    icon: "📬",
    label: "Daily update",
    channel: "eu-daily",
    render: (prices) => (
      <Message author="Blackmarket Reader" bot time="Today at 10:04">
        <div className="cm-card" style={{ ["--accent" as string]: "#3b82f6" }}>
          <p className="cm-kicker">🇪🇺 EUROPE · DAILY UPDATE</p>
          <p className="cm-line">⚒️ <b>+20% Plate Armor</b> crafting bonus today</p>
          <p className="cm-line">💰 Gold <b>{silver(prices.eu)}</b> silver · 🟡 fair price</p>
          <p className="cm-line">🏆 Top 3 Black Market crafts with today's bonus</p>
          <p className="cm-line">🎯 Weekly event: what is on and when it ends</p>
        </div>
      </Message>
    )
  },
  {
    id: "alerts",
    icon: "🚨",
    label: "Gold alerts",
    channel: "gold-signals",
    render: (prices) => (
      <Message author="Blackmarket Reader" bot time="Today at 15:41">
        <p className="cm-ping"><span>@Gold Alerts</span> 🇺🇸 gold just broke its 30-day low</p>
        <div className="cm-card" style={{ ["--accent" as string]: "#22c55e" }}>
          <p className="cm-kicker">🚨 GOLD ALERT · AMERICA · 30-DAY LOW</p>
          <p className="cm-big">🟢 {silver(prices.us ? prices.us * 0.96 : undefined)} silver per gold</p>
          <p className="cm-line">Cheapest gold of the last 30 days: a good time to <b>buy gold</b>.</p>
          <p className="cm-muted">Only the big moves, about two a month.</p>
        </div>
      </Message>
    )
  },
  {
    id: "commands",
    icon: "⚡",
    label: "Commands",
    channel: "any channel",
    render: (prices) => (
      <>
        <Message author="You" time="Today at 18:20">
          <p className="cm-command">/gold</p>
        </Message>
        <Message author="Blackmarket Reader" bot time="Today at 18:20">
          <div className="cm-card" style={{ ["--accent" as string]: "#d9a441" }}>
            <p className="cm-kicker">ONLY YOU CAN SEE THIS</p>
            <p className="cm-line">🇪🇺 Europe · <b>{silver(prices.eu)}</b> silver</p>
            <p className="cm-line">🇺🇸 America · <b>{silver(prices.us)}</b> silver</p>
            <p className="cm-muted">Also: /bonus for today's crafting bonus</p>
          </div>
        </Message>
      </>
    )
  },
  {
    id: "support",
    icon: "💬",
    label: "Ask & suggest",
    channel: "feature-requests",
    render: () => (
      <>
        <Message author="Player" time="Today at 20:12">
          <p className="cm-text">Could the calculator show the journal profit too?</p>
        </Message>
        <Message author="Developer" time="Today at 20:31">
          <p className="cm-text">Good idea, it is on the list. You will see it in #changelog when it ships ⚒️</p>
        </Message>
      </>
    )
  }
];

export function CommunityPage() {
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const [prices, setPrices] = useState<Prices>({});

  useEffect(() => {
    document.body.classList.add("community-page");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter", "panel-open");

    return () => {
      document.body.classList.remove("community-page");
    };
  }, []);

  // the real gold price for the preview; on an error the preview keeps its example number
  useEffect(() => {
    let alive = true;
    for (const region of ["eu", "us"] as const) {
      fetchGoldHistory(region)
        .then((history) => alive && setPrices((p) => ({ ...p, [region]: history.points[history.points.length - 1][1] })))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, []);

  // the preview flips through the channels by itself until someone clicks one
  useEffect(() => {
    if (touched || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((i) => (i + 1) % TABS.length), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [touched]);

  const pick = (index: number) => {
    setTouched(true);
    setActive(index);
  };
  const tab = TABS[active];

  return (
    <>
      <div className="aurora-blob aurora-emerald" aria-hidden="true" />
      <div className="aurora-blob aurora-purple" aria-hidden="true" />

      <header className="community-header">
        <a className="brand" href="/">
          <span className="brand-name">RomulusKings Reader</span>
        </a>
        <nav className="community-nav">
          <a className="nav-link" href={INVITE} target="_blank" rel="noopener noreferrer">
            Discord
          </a>
          <a className="nav-link" href={INVITE} target="_blank" rel="noopener noreferrer">
            Support
          </a>
        </nav>
      </header>

      <main className="cm-hero" id="top">
        <p className="cm-eyebrow">ALBION ONLINE · FREE DISCORD</p>
        <h1 className="cm-title">
          Your crafting edge,
          <br />
          <span>pinged every day.</span>
        </h1>
        <p className="cm-sub">Today's crafting bonus, the gold price and the best Black Market crafts, straight to your Discord after every reset.</p>
      </main>

      <section className="cm-preview" aria-label="What you get on the Discord">
        <h2 className="cm-h2">See what you get</h2>
        <div className="cm-window">
          <div className="cm-side" role="tablist" aria-label="Channels">
            <p className="cm-server">Blackmarket Reader</p>
            <p className="cm-cat">📊 LIVE</p>
            <p className="cm-voice">💰 Gold EU · {prices.eu ? silver(prices.eu) : "live"}</p>
            <p className="cm-voice">💰 Gold US · {prices.us ? silver(prices.us) : "live"}</p>
            <p className="cm-cat">CHANNELS</p>
            {TABS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={i === active}
                className={`cm-chan${i === active ? " is-active" : ""}`}
                onClick={() => pick(i)}
              >
                <span aria-hidden="true">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          <div className="cm-main" role="tabpanel">
            <p className="cm-main-head">
              # {tab.channel}
              <small>example messages</small>
            </p>
            <div className="cm-feed" key={tab.id}>
              {tab.render(prices)}
            </div>
            {!touched && (
              <div className="cm-progress" aria-hidden="true">
                <span key={active} />
              </div>
            )}
          </div>
        </div>
        <div className="cm-cta">
          <JoinButton />
        </div>
      </section>

      <section className="cm-faq" aria-label="Good to know">
        <h2 className="cm-h2">Good to know</h2>
        <details>
          <summary>What the server is for</summary>
          <p>
            This is a small Albion Online project run by players, not a company. The Discord is
            where the people who use the calculators actually talk to the person building them.
            If a number looks wrong, if an item is missing, or if you want something the tools
            cannot do yet, that is the place to say so &mdash; most of what gets built next comes
            out of those conversations.
          </p>
        </details>
        <details>
          <summary>Every update gets posted there</summary>
          <p>
            There is an updates channel that receives a post every single time the tools change:
            new features, corrected formulas, fixed prices. You do not have to check the site to
            find out what moved. If a calculation you rely on was adjusted, you will read why.
          </p>
        </details>
        <details>
          <summary>Reporting bad market data</summary>
          <p>
            Market prices come from what other players have scanned in game, so they are only as
            good as the last scan. A stale or manipulated price can make a craft look far more
            profitable than it is. The tools grey out profits that look unrealistic, but they
            cannot catch everything. If you spot a deal that seems too good to be true, post the
            item and the server &mdash; that feedback is how the filters get better.
          </p>
        </details>
        <details>
          <summary>Before you ask</summary>
          <p>
            You do not need an account to use anything here; every tool opens straight away. For
            free users the market data is synced once per day rather than live, and each tool
            shows its own last-updated time so you can judge how old the numbers are. The
            written <a href="/guides">Albion Online guides</a> cover the maths behind the
            calculators &mdash; return rate, bonus cities, station fees and focus cost &mdash; and
            answer most of what gets asked. If you do want your settings to follow you to another
            device, you can <a href="/login?mode=register">create a free account</a>.
          </p>
        </details>
      </section>

      <footer className="community-footer">
        <p className="metallic-text">RomulusKings Marketreader &copy; {new Date().getFullYear()}</p>
      </footer>
    </>
  );
}
