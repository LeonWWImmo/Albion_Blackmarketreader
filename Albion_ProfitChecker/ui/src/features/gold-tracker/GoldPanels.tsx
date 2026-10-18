import { useState, type ReactNode } from "react";
import { formatGold, formatSignedPct, formatSilver, parseAmount } from "./format";
import { goldToSilver, silverToGold, type PriceChange, type PricePosition, type Profile } from "./goldStats";

/* ------------------------------------------------------------------ buy or wait */

const VERDICT_COPY = {
  cheap: { title: "Good time to buy", tone: "good" },
  fair: { title: "Fair price", tone: "neutral" },
  expensive: { title: "Good time to sell", tone: "warn" }
} as const;

type BuySignalProps = {
  position: PricePosition | null;
  low: number | null;
  high: number | null;
  price: number | null;
};

/** Where today's price sits in the last 30 days, as a cheap-to-expensive scale with a verdict. */
export function BuySignal({ position, low, high, price }: BuySignalProps) {
  if (!position || low === null || high === null || price === null) {
    return (
      <section className="gt-panel gt-signal">
        <h2 className="gt-panel-title">Buy or wait?</h2>
        <p className="gt-muted">Not enough price history yet.</p>
      </section>
    );
  }
  const copy = VERDICT_COPY[position.verdict];
  const cheaperShare = Math.round(position.percentile);
  const detail =
    position.verdict === "cheap"
      ? `Cheaper than ${100 - cheaperShare}% of the last 30 days.`
      : position.verdict === "expensive"
        ? `Pricier than ${cheaperShare}% of the last 30 days.`
        : `${cheaperShare}% of the last 30 days were cheaper.`;

  return (
    <section className="gt-panel gt-signal" data-tone={copy.tone}>
      <h2 className="gt-panel-title">Buy or wait?</h2>
      <p className="gt-signal-verdict">
        <span className="gt-signal-dot" aria-hidden="true" />
        {copy.title}
      </p>
      <p className="gt-muted">{detail}</p>
      <div className="gt-scale" role="img" aria-label={`Current price ${formatSilver(price)} between the 30-day low ${formatSilver(low)} and high ${formatSilver(high)}`}>
        <div className="gt-scale-bar" />
        <span className="gt-scale-marker" style={{ left: `${position.position}%` }}>
          <span className="gt-scale-bubble">{formatSilver(price)}</span>
        </span>
      </div>
      <div className="gt-scale-legend">
        <span>
          <em>30d low</em> {formatSilver(low)}
        </span>
        <span>
          <em>30d high</em> {formatSilver(high)}
        </span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ exchange */

const GOLD_CHIPS = [100, 1000, 5000];
const SILVER_CHIPS = [1e6, 10e6, 100e6];

function compactSilver(value: number): string {
  return value >= 1e6 ? `${value / 1e6}M` : value >= 1e3 ? `${value / 1e3}k` : String(value);
}

/** Gold and silver side by side, converting into each other at the current price. */
export function Converter({ price }: { price: number }) {
  // The field the player typed in last is the source; the other one follows the price.
  const [source, setSource] = useState<{ side: "gold" | "silver"; text: string }>({ side: "gold", text: "1000" });
  const amount = parseAmount(source.text);
  const goldText = source.side === "gold" ? source.text : amount === null ? "" : formatGold(silverToGold(amount, price));
  const silverText = source.side === "silver" ? source.text : amount === null ? "" : formatSilver(goldToSilver(amount, price));
  const invalid = amount === null && source.text.trim() !== "";

  return (
    <section className="gt-panel gt-converter">
      <h2 className="gt-panel-title">Exchange</h2>
      <div className="gt-exchange">
        <label className={`gt-field gt-field-gold ${invalid && source.side === "gold" ? "is-invalid" : ""}`}>
          <span>Gold</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            value={goldText}
            onChange={(event) => setSource({ side: "gold", text: event.target.value })}
            aria-describedby="gt-converter-rate"
          />
        </label>
        <span className="gt-exchange-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M8 20V4M8 4 4.5 7.5M8 4l3.5 3.5M16 4v16M16 20l-3.5-3.5M16 20l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <label className={`gt-field ${invalid && source.side === "silver" ? "is-invalid" : ""}`}>
          <span>Silver</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            value={silverText}
            onChange={(event) => setSource({ side: "silver", text: event.target.value })}
            aria-describedby="gt-converter-rate"
          />
        </label>
      </div>
      <div className="gt-chips" role="group" aria-label="Quick amounts">
        {GOLD_CHIPS.map((gold) => (
          <button key={`g${gold}`} type="button" className="gt-chip is-gold" onClick={() => setSource({ side: "gold", text: String(gold) })}>
            {gold.toLocaleString("de-DE")} g
          </button>
        ))}
        {SILVER_CHIPS.map((silver) => (
          <button key={`s${silver}`} type="button" className="gt-chip" onClick={() => setSource({ side: "silver", text: String(silver) })}>
            {compactSilver(silver)} s
          </button>
        ))}
      </div>
      <p id="gt-converter-rate" className="gt-muted gt-small">
        {invalid ? <span className="gt-warn">That is not a number. </span> : null}
        At {formatSilver(price)} silver per gold &middot; type 250k or 1,5m
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ key numbers */

export type KeyNumber = { label: string; value: string; tone?: "up" | "down" | "low" | "high" };

export function KeyNumbers({ items }: { items: ReadonlyArray<KeyNumber> }) {
  return (
    <dl className="gt-keys">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className={item.tone ? `gt-${item.tone}` : ""}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function changeTone(change: PriceChange | null | undefined): KeyNumber["tone"] {
  if (!change || change.abs === 0) return undefined;
  return change.abs > 0 ? "up" : "down";
}

/* ------------------------------------------------------------------ best time to buy */

type ProfileChartProps = {
  title: string;
  profile: Profile | null;
  labels: ReadonlyArray<string>;
  /** Labels to print under the bars (all of them when the bars are wide enough). */
  showLabel: (index: number) => boolean;
  cheapestText: (label: string) => string;
  footnote: string;
};

/** Bars above / below zero: how far each hour or weekday sits from the surrounding average. */
export function ProfileChart({ title, profile, labels, showLabel, cheapestText, footnote }: ProfileChartProps) {
  if (!profile) {
    return (
      <section className="gt-sub gt-profile">
        <h3 className="gt-sub-title">{title}</h3>
        <p className="gt-muted">Not enough price history yet.</p>
      </section>
    );
  }
  const values = profile.deviation.map((value) => value ?? 0);
  const extent = Math.max(0.05, ...values.map((value) => Math.abs(value)));
  const cheapest = profile.deviation[profile.cheapest] ?? 0;
  const dearest = profile.deviation[profile.dearest] ?? 0;

  return (
    <section className="gt-sub gt-profile">
      <h3 className="gt-sub-title">{title}</h3>
      <p className="gt-profile-lead">
        {cheapestText(labels[profile.cheapest])} <span className="gt-good">{formatSignedPct(cheapest)}</span>
        <span className="gt-muted"> &middot; priciest {labels[profile.dearest]} </span>
        <span className="gt-bad">{formatSignedPct(dearest)}</span>
      </p>
      <div className="gt-bars" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
        {profile.deviation.map((value, i) => {
          const share = value === null ? 0 : (Math.abs(value) / extent) * 42;
          const kind = i === profile.cheapest ? "is-best" : i === profile.dearest ? "is-worst" : "";
          return (
            <div
              key={labels[i]}
              className={`gt-bar ${kind}`}
              title={value === null ? `${labels[i]}: no data` : `${labels[i]}: ${formatSignedPct(value)} vs. average`}
            >
              <span className={`gt-bar-fill ${value !== null && value < 0 ? "below" : "above"}`} style={{ height: `${share}%` }} />
              <span className="gt-bar-label">{showLabel(i) ? labels[i] : ""}</span>
            </div>
          );
        })}
      </div>
      <p className="gt-muted gt-small">{footnote}</p>
    </section>
  );
}

/* ------------------------------------------------------------------ EU vs US */

type CompareProps = {
  region: "eu" | "us";
  price: number;
  otherPrice: number | null;
  dayChange: PriceChange | null;
  otherDayChange: PriceChange | null;
  onSwitch: () => void;
};

function DayChange({ change }: { change: PriceChange | null }) {
  if (!change) return <small className="gt-compare-change">24h --</small>;
  return (
    <small className={`gt-compare-change ${change.abs > 0 ? "gt-up" : change.abs < 0 ? "gt-down" : ""}`}>
      24h {formatSignedPct(change.pct)}
    </small>
  );
}

/** The other server's price next to this one. */
export function RegionCompare({ region, price, otherPrice, dayChange, otherDayChange, onSwitch }: CompareProps) {
  const other = region === "eu" ? "us" : "eu";
  const name = (r: "eu" | "us") => (r === "eu" ? "Europe" : "America");
  const diff = otherPrice ? ((otherPrice - price) / price) * 100 : null;
  return (
    <section className="gt-sub gt-compare">
      <h3 className="gt-sub-title">Europe vs America</h3>
      <div className="gt-compare-row">
        <div className="gt-compare-cell is-current">
          <span>{name(region)}</span>
          <strong>{formatSilver(price)}</strong>
          <DayChange change={dayChange} />
        </div>
        <div className="gt-compare-cell">
          <span>{name(other)}</span>
          <strong>{otherPrice ? formatSilver(otherPrice) : "--"}</strong>
          <DayChange change={otherDayChange} />
        </div>
      </div>
      <p className="gt-muted gt-small">
        {diff === null
          ? `Loading the ${name(other)} price…`
          : Math.abs(diff) < 0.05
            ? `Gold costs the same on both servers right now.`
            : `Gold is ${Math.abs(diff).toFixed(1)}% ${diff > 0 ? "more expensive" : "cheaper"} on ${name(other)}.`}{" "}
        <button type="button" className="gt-link-btn" onClick={onSwitch}>
          Show {name(other)}
        </button>
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ fold */

type FoldProps = {
  title: string;
  hint: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
};

/** A section that opens on click; closed, it is one line with a short hint of what is inside. */
export function Fold({ title, hint, icon, children, className = "" }: FoldProps) {
  return (
    <details className={`gt-fold ${className}`}>
      <summary>
        <span className="gt-fold-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="gt-fold-text">
          <strong>{title}</strong>
          <span>{hint}</span>
        </span>
        <span className="gt-fold-chevron" aria-hidden="true" />
      </summary>
      <div className="gt-fold-body">{children}</div>
    </details>
  );
}
