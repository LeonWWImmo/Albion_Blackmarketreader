import type { CSSProperties } from "react";
import { ageLabel, type Best, type Flip } from "../core/quotes";
import { MARKET_COLOR } from "./badges";
import { signedPercent, silver } from "./format";

type Props = {
  cheapest: Best;
  bestSell: Best;
  flip: Flip | null;
  premium: boolean;
  onPremium: (premium: boolean) => void;
  now: number;
  loading: boolean;
};

function Where({ market, seenAt, now }: { market: string; seenAt: number; now: number }) {
  return (
    <span className="pc-where" style={{ "--market": MARKET_COLOR[market as keyof typeof MARKET_COLOR] } as CSSProperties}>
      <i aria-hidden="true" />
      {market}
      <small>{ageLabel(seenAt, now)} ago</small>
    </span>
  );
}

/** The three answers people come for: where to buy cheapest, where to sell fastest, and whether a flip pays. */
export function StatCards({ cheapest, bestSell, flip, premium, onPremium, now, loading }: Props) {
  return (
    <div className="pc-stats" aria-live="polite">
      <article className="pc-stat is-buy">
        <h2>Buy cheapest</h2>
        {cheapest ? (
          <>
            <p className="pc-stat-value">{silver(cheapest.price)}</p>
            <Where market={cheapest.market} seenAt={cheapest.seenAt} now={now} />
          </>
        ) : (
          <p className="pc-stat-none">{loading ? "Loading…" : "No recent sell order"}</p>
        )}
      </article>
      <article className="pc-stat is-sell">
        <h2>Sell instantly</h2>
        {bestSell ? (
          <>
            <p className="pc-stat-value">{silver(bestSell.price)}</p>
            <Where market={bestSell.market} seenAt={bestSell.seenAt} now={now} />
          </>
        ) : (
          <p className="pc-stat-none">{loading ? "Loading…" : "No recent buy order"}</p>
        )}
      </article>
      <article className={`pc-stat is-flip${flip ? " has-flip" : ""}`}>
        <h2>Flip</h2>
        {flip ? (
          <>
            <p className="pc-stat-value">
              +{silver(flip.profit)} <small>{signedPercent(flip.margin)}</small>
            </p>
            <span className="pc-route">
              {flip.from} <span aria-hidden="true">→</span> {flip.to}
            </span>
          </>
        ) : (
          <p className="pc-stat-none">{loading ? "Loading…" : "No flip pays right now"}</p>
        )}
        <label className="pc-premium">
          <input type="checkbox" checked={premium} onChange={(e) => onPremium(e.target.checked)} />
          after {premium ? "4% Premium" : "8%"} tax
        </label>
      </article>
    </div>
  );
}
