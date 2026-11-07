import type { CSSProperties } from "react";
import type { HistoryPoint } from "../core/history";
import { ageLabel, freshness, type Best, type MarketQuote, type Price } from "../core/quotes";
import { MARKET_COLOR } from "./badges";
import { silver } from "./format";
import { Sparkline } from "./PriceChart";

type Props = {
  quotes: MarketQuote[];
  cheapest: Best;
  bestSell: Best;
  soldPerDay: Map<string, number | null>;
  week: Map<string, HistoryPoint[]>;
  now: number;
};

function PriceCell({ price, now, best, kind }: { price: Price; now: number; best: boolean; kind: "buy" | "sell" }) {
  if (!price) return <span className="pc-none">–</span>;
  const age = freshness(price.seenAt, now);
  return (
    <span className={`pc-price is-${age}${best ? ` is-best is-best-${kind}` : ""}`}>
      <b>{silver(price.price)}</b>
      <small title={new Date(price.seenAt * 1000).toLocaleString("en-GB")}>
        <i aria-hidden="true" />
        {ageLabel(price.seenAt, now)}
      </small>
    </span>
  );
}

/**
 * Every market in one table: the cheapest sell order (where to buy), the highest buy order (where to
 * sell straight away), items sold per day and the week's price line. The best of each lights up;
 * every price says how old it is.
 */
export function MarketTable({ quotes, cheapest, bestSell, soldPerDay, week, now }: Props) {
  return (
    <div className="pc-table" role="table" aria-label="Prices per market">
      <div className="pc-row pc-head-row" role="row">
        <span role="columnheader">Market</span>
        <span role="columnheader" title="Lowest sell order: what buying one costs right now">Buy for</span>
        <span role="columnheader" title="Highest buy order: what selling one straight away brings">Sell now for</span>
        <span role="columnheader">Sold / day</span>
        <span role="columnheader">7 days</span>
      </div>
      {quotes.map(({ market, sell, buy }) => {
        const empty = !sell && !buy;
        const sold = soldPerDay.get(market);
        return (
          <div key={market} className={`pc-row${empty ? " is-empty" : ""}`} role="row" style={{ "--market": MARKET_COLOR[market] } as CSSProperties}>
            <span className="pc-market" role="cell">
              <i aria-hidden="true" />
              {market}
            </span>
            <span role="cell" data-label="Buy for">
              {market === "Black Market" ? <span className="pc-none" title="The Black Market only buys">buys only</span> : <PriceCell price={sell} now={now} kind="buy" best={cheapest?.market === market} />}
            </span>
            <span role="cell" data-label="Sell now for">
              <PriceCell price={buy} now={now} kind="sell" best={bestSell?.market === market} />
            </span>
            <span role="cell" data-label="Sold / day" className="pc-sold">
              {sold == null ? <span className="pc-none">–</span> : sold < 10 ? sold.toFixed(1) : silver(sold)}
            </span>
            <span role="cell" data-label="7 days" className="pc-week">
              <Sparkline points={week.get(market) ?? []} color={MARKET_COLOR[market]} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
