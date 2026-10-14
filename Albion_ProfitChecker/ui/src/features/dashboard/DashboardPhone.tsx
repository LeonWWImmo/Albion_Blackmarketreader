import { assetUrl, onItemIconError } from "@shared/assets/assets";

/** The Black Market sits in Caerleon, so its crest marks the sell side of a deal. */
const BM_CREST = assetUrl("picture/crests-small/caerleon.png");

/** One Black Market deal, already formatted for the phone list and its detail sheet. */
export type PhoneDeal = {
  key: string;
  id: string;
  name: string;
  /** "T4.1" */
  tierLabel: string;
  enchant: number;
  iconSrc: string;
  city: string;
  /** small crest of the buy city, null for a city without one */
  cityCrest: string | null;
  buy: number;
  bm: number;
  sold: number;
  profitPct: number;
  span: string;
  suspect: boolean;
};

export type PhoneCity = { key: string; label: string; crest: string };

const silver = (value: number) => Math.round(value).toLocaleString("de-DE");
const signed = (value: number) => `${value >= 0 ? "+" : ""}${silver(value)}`;
const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

type PhoneOverviewProps = {
  regionLabel: string;
  /** "18h ago", or empty when the data stamp is unknown */
  updated: string;
  deals: number;
  best: string;
  median: string;
  liquidity: string;
  chart: { line: string; area: string } | null;
  chartAvg: number;
  chartPeak: number;
  ranges: readonly string[];
  range: string;
  onRange: (range: string) => void;
  cities: PhoneCity[];
  city: string;
  cityLabel: string;
  onCity: (city: string) => void;
  sortBySilver: boolean;
  onSort: (bySilver: boolean) => void;
};

/**
 * Top of the dashboard on a phone: the deal count with the profit trend behind it, the key
 * figures as a swipeable row, one-tap city crests and the sort switch. Replaces the desktop
 * hero, KPI tiles, chart panel and city dropdown, which do not fit a phone.
 */
export function PhoneOverview({
  regionLabel, updated, deals, best, median, liquidity, chart, chartAvg, chartPeak, ranges, range, onRange,
  cities, city, cityLabel, onCity, sortBySilver, onSort
}: PhoneOverviewProps) {
  return (
    <div className="dbm-overview">
      <section className="dbm-hero">
        <span className="dbm-eyebrow">
          <span className="dbm-live-dot" />
          Black Market · {regionLabel}
          {updated ? <span className="dbm-updated">· {updated}</span> : null}
        </span>
        <div className="dbm-hero-count">
          <strong>{deals.toLocaleString("de-DE")}</strong>
          <span>deals found</span>
        </div>
        <p className="dbm-hero-sub">From 30% profit · 14-day prices · synced daily</p>
        {chart ? (
          <>
            <svg className="dbm-spark" viewBox="0 0 600 220" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="dbmSparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: "rgba(var(--fx-accent-rgb), 0.38)" }} />
                  <stop offset="100%" style={{ stopColor: "rgba(var(--fx-accent-rgb), 0)" }} />
                </linearGradient>
              </defs>
              <path d={chart.area} fill="url(#dbmSparkFill)" />
              <path d={chart.line} className="dbm-spark-line" fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="dbm-spark-foot">
              <span>
                Avg profit <strong>{chartAvg.toFixed(1)}%</strong> · peak <strong>{chartPeak.toFixed(1)}%</strong>
              </span>
              <div className="dbm-ranges" role="group" aria-label="Trend range">
                {ranges.map((entry) => (
                  <button key={entry} type="button" className={entry === range ? "is-active" : ""} onClick={() => onRange(entry)}>
                    {entry}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </section>

      <div className="dbm-kpis">
        <div className="dbm-kpi">
          <span>Top spread</span>
          <strong>{best}</strong>
        </div>
        <div className="dbm-kpi">
          <span>Median ROI</span>
          <strong>{median}</strong>
        </div>
        <div className="dbm-kpi">
          <span>Max liquidity</span>
          <strong>{liquidity}</strong>
        </div>
      </div>

      <div className="dbm-cities" role="group" aria-label="Buy city">
        {cities.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={`dbm-city${entry.key === city ? " is-active" : ""}`}
            aria-pressed={entry.key === city}
            onClick={() => onCity(entry.key)}
          >
            <img src={entry.crest} alt="" />
            <span>{entry.label}</span>
          </button>
        ))}
      </div>

      <div className="dbm-list-head">
        <span>
          Deals from <strong>{cityLabel}</strong>
        </span>
        <div className="dbm-sort" role="group" aria-label="Sort deals">
          <button type="button" className={sortBySilver ? "" : "is-active"} onClick={() => onSort(false)}>
            Profit %
          </button>
          <button type="button" className={sortBySilver ? "is-active" : ""} onClick={() => onSort(true)}>
            Silver
          </button>
        </div>
      </div>
    </div>
  );
}

type PhoneDealRowProps = {
  deal: PhoneDeal;
  sortBySilver: boolean;
  onOpen: () => void;
};

/** A deal as one tappable two-line row; the big number follows the active sort. */
export function PhoneDealRow({ deal, sortBySilver, onOpen }: PhoneDealRowProps) {
  const spread = deal.bm - deal.buy;
  const primary = sortBySilver ? signed(spread) : pct(deal.profitPct);
  const secondary = sortBySilver ? pct(deal.profitPct) : signed(spread);
  const tone = (sortBySilver ? spread : deal.profitPct) < 0 ? "is-loss" : "is-gain";
  return (
    <button
      type="button"
      className={`dbm-deal${deal.enchant ? ` dbm-ench-${deal.enchant}` : ""}${deal.suspect ? " is-suspect" : ""}`}
      onClick={onOpen}
    >
      <span className="dbm-deal-icon">
        <img src={deal.iconSrc} alt="" loading="lazy" onError={onItemIconError} />
      </span>
      <span className="dbm-deal-main">
        <span className="dbm-deal-name">
          <span className="dbm-deal-title">{deal.name}</span>
          <span className="dbm-tier">{deal.tierLabel}</span>
          {deal.suspect ? <span className="dbm-check">Check price</span> : null}
        </span>
        <span className="dbm-deal-route">
          {deal.cityCrest ? <img className="dbm-crest" src={deal.cityCrest} alt={deal.city} title={deal.city} width={16} height={16} decoding="async" /> : null}
          <span className={deal.cityCrest ? "dbm-city-name" : undefined}>{deal.city} </span>
          {silver(deal.buy)}
          <span className="dbm-arrow" aria-hidden="true">→</span>
          <img className="dbm-crest" src={BM_CREST} alt="Black Market" title="Black Market (Caerleon)" width={16} height={16} decoding="async" />
          {silver(deal.bm)}
        </span>
      </span>
      <span className="dbm-deal-nums">
        <strong className={tone}>{primary}</strong>
        <span>
          {secondary} · {Math.round(deal.sold).toLocaleString("de-DE")}/day
        </span>
      </span>
    </button>
  );
}

/** Detail sheet body for one deal. */
export function PhoneDealDetail({ deal }: { deal: PhoneDeal }) {
  const spread = deal.bm - deal.buy;
  return (
    <div className="dbm-sheet">
      <div className="bsheet-hero">
        <span className="bsheet-hero-icon">
          <img src={deal.iconSrc} alt="" onError={onItemIconError} />
        </span>
        <span className="bsheet-hero-text">
          <strong>{deal.name}</strong>
          <span className="bsheet-chip">
            {deal.tierLabel} · {deal.city}
          </span>
        </span>
      </div>

      {deal.suspect ? (
        <p className="bsheet-warning">
          This profit looks unrealistic. The Black Market price is probably a stale or troll order, so check it in game
          before you buy.
        </p>
      ) : null}

      <div className="bsheet-tiles">
        <div className="bsheet-tile is-key">
          <span>Profit</span>
          <strong className={deal.profitPct >= 0 ? "is-gain" : "is-loss"}>{pct(deal.profitPct)}</strong>
        </div>
        <div className="bsheet-tile is-key">
          <span>Silver / item</span>
          <strong className={spread >= 0 ? "is-gain" : "is-loss"}>{signed(spread)}</strong>
        </div>
        <div className="bsheet-tile">
          <span>Buy in {deal.city}</span>
          <strong>{silver(deal.buy)}</strong>
        </div>
        <div className="bsheet-tile">
          <span>Sell on Black Market</span>
          <strong>{silver(deal.bm)}</strong>
        </div>
        <div className="bsheet-tile">
          <span>Sold / day</span>
          <strong>{deal.sold.toLocaleString("de-DE")}</strong>
        </div>
        <div className="bsheet-tile">
          <span>Price range</span>
          <strong>{deal.span}</strong>
        </div>
      </div>

      <h3 className="bsheet-section-title">How the flip works</h3>
      <ol className="dbm-steps">
        <li>
          Buy it in <strong>{deal.city}</strong> for about <strong>{silver(deal.buy)}</strong> silver.
        </li>
        <li>
          Carry it to <strong>Caerleon</strong> and sell it to the Black Market for about <strong>{silver(deal.bm)}</strong>.
        </li>
        <li>
          About <strong>{Math.round(deal.sold).toLocaleString("de-DE")}</strong> sell there per day, so do not flood it.
        </li>
      </ol>

      <p className="dbm-id">{deal.id}</p>
    </div>
  );
}
