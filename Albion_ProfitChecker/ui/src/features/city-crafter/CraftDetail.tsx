// One craft in detail, for the City Crafter and the Focus Planner: the shopping list (price per
// piece, pieces, total), the return rate and station fee, the sale with tax, journals and profit.
import type { ReactNode } from "react";
import type { Quote } from "./core/books";
import type { CityCraftRow, SellMode } from "./core/cityCraft";
import { age, silver } from "./kit";

/** A price's age, and "daily" when it comes from the daily data. */
export function QuoteAge({ quote, now }: { quote: Quote; now: number }) {
  return (
    <small className={`cc-age${quote.src === "daily" ? " is-daily" : ""}`}>
      {quote.src === "daily" ? "daily · " : ""}
      {age(now - quote.at)}
    </small>
  );
}

type Props = {
  row: CityCraftRow;
  city: string;
  sell: SellMode;
  now: number;
  /** station fee setting (silver per 100 nutrition), shown next to the fee */
  usageFee: number;
  /** the Focus Planner's focus figures (with the player's specs) */
  focus?: { perCraft: number; perFocus: number; efficiency: number };
  /** more below the two columns (the Focus Planner's market panel) */
  extra?: ReactNode;
};

export function CraftDetail({ row, city, sell, now, usageFee, focus, extra }: Props) {
  const calc = `/crafting-calculator?${new URLSearchParams({ item: row.baseId, tier: String(row.tier), enchant: String(row.enchant), craftCity: city, sell: city })}`;
  return (
    <div className="cc-detail">
      <div>
        <h4>Shopping list · one craft</h4>
        <div className="cc-shop">
          <div className="cc-shop-row cc-shop-head">
            <span>Material</span>
            <span>Per piece</span>
            <span>Pieces</span>
            <span>Total</span>
          </div>
          {[...row.materials, ...(row.artefact ? [row.artefact] : [])].map((m) => (
            <div key={m.id} className="cc-shop-row">
              <span>
                <b>{m.name}</b>
                <small className={m.city !== city ? "is-away" : ""}>
                  {m.city !== city ? `from ${m.city}` : `in ${city}`} · <QuoteAge quote={m} now={now} />
                </small>
              </span>
              <span>{silver(m.unit)}</span>
              <span>× {m.qty}</span>
              <b>{silver(m.unit * m.qty)}</b>
            </div>
          ))}
        </div>
        <ul className="cc-sum">
          <li>
            <span>Materials at full price</span>
            <b>{silver(row.materialCost + (row.artefact?.unit ?? 0))}</b>
          </li>
          <li>
            <span>Back from the return rate ({(row.returnRate * 100).toFixed(1)} %)</span>
            <b className="cc-plus">−{silver(row.materialCost * row.returnRate)}</b>
          </li>
          <li>
            <span>
              Station fee <small className="cc-hint">{silver(usageFee)} per 100 nutrition</small>
            </span>
            <b>{silver(row.stationFee)}</b>
          </li>
          <li className="is-total">
            <span>One craft costs</span>
            <b>{silver(row.cost)}</b>
          </li>
        </ul>
      </div>
      <div>
        <h4>Selling it in {city}</h4>
        <ul>
          <li>
            <span>{sell === "order" ? "Sell order" : "Buy order"} price</span>
            <b>{silver(row.sale.unit)}</b>
          </li>
          <li>
            <span>Tax{sell === "order" ? " and setup fee" : ""}</span>
            <b>−{silver(row.fees)}</b>
          </li>
          <li>
            <span>You get</span>
            <b>{silver(row.net)}</b>
          </li>
          {row.journal ? (
            <li>
              <span>Filled journals (share of one craft)</span>
              <b className="cc-plus">+{silver(row.journal)}</b>
            </li>
          ) : null}
          <li className="is-total">
            <span>Profit per craft</span>
            <b className="cc-plus">+{silver(row.profit)}</b>
          </li>
        </ul>
        <p className="cc-explain">
          You put in <b>{silver(row.cost)}</b> and get <b>{silver(row.net + row.journal)}</b> back{row.journal ? " with the journals" : ""}: <b>+{silver(row.profit)}</b>, that is{" "}
          <b>+{Math.round(row.roi)} %</b> on your silver.
        </p>
        <ul>
          <li>
            <span>7-day average price</span>
            <b>{row.avgPrice ? silver(row.avgPrice) : "–"}</b>
          </li>
          {focus ? (
            <>
              <li>
                <span>Focus per craft{focus.efficiency > 0 ? " with your specs" : ""}</span>
                <b>{silver(focus.perCraft)}</b>
              </li>
              <li>
                <span>Silver per focus point</span>
                <b className="cc-plus">{focus.perFocus.toFixed(1)}</b>
              </li>
            </>
          ) : row.focusCost ? (
            <li>
              <span>Focus (no spec)</span>
              <b>{silver(row.focusCost)}</b>
            </li>
          ) : null}
        </ul>
        <a className="cc-calc" href={calc}>
          Open in the Crafting Calculator ↗
        </a>
      </div>
      {extra}
    </div>
  );
}
