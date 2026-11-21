// The dashboard's live market (premium): city flips and Black Market deals from the prices as they
// stand now, every market, refreshed every 30 minutes (api/_lib/marketLive.js). Hidden until the
// premium launch (premiumVisible); the server only answers premium players.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { accessToken } from "@shared/premium/premium";
import { ageLabel, BLACK_MARKET, computeFlips, SALES_TAX, SETUP_FEE, tierOf, type Flip, type FlipOptions, type LiveSnapshot } from "./flips";
import "./live-market.css";

type Load =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "locked" }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ok"; snap: LiveSnapshot };

const PAGE = 40;
/** The job runs every 30 minutes; a little later the next snapshot is there. */
const NEXT_AFTER_MIN = 32;
const FILTERS_KEY = "bmr-live-filters-v2";

// city prices are seen less often than the Black Market's and city buy orders are thin, so city
// flips start with sell orders and prices up to 6 hours old
const DEFAULTS: FlipOptions = {
  kind: "city",
  from: "ALL",
  to: "ALL",
  mode: "order",
  albionPremium: true,
  maxAgeH: 6,
  minProfitPct: 10,
  maxCost: null,
  minSold: 1,
  tier: "ALL",
  search: "",
  sort: "pct"
};

function storedFilters(): FlipOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || "null");
    return saved && typeof saved === "object" ? { ...DEFAULTS, ...saved, search: "" } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

async function loadLive(region: string): Promise<Load> {
  const token = await accessToken();
  if (!token) return { kind: "guest" };
  const res = await fetch(`/api/market/live?region=${region}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => null);
  if (res.status === 401) return { kind: "guest" };
  if (res.status === 403) return { kind: "locked" };
  if (res.status === 404) return { kind: "empty", message: data?.error || "No live snapshot yet." };
  if (!res.ok || !data?.prices) return { kind: "error", message: data?.error || "Loading failed, try again." };
  return { kind: "ok", snap: data as LiveSnapshot };
}

const nowMinute = () => Math.round(Date.now() / 60000);
const silver = (n: number) => Math.round(n).toLocaleString("de-DE");
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function itemLabel(id: string) {
  const enchant = id.match(/@([1-4])/)?.[1];
  return `${tierOf(id) || "T?"}${enchant ? `.${enchant}` : ""}`;
}

function ItemIcon({ id }: { id: string }) {
  const base = id.split("@")[0].replace(/^T\d+_/, "");
  // only the T4 icon of each item ships with the site; the tier is shown next to it
  return <img className="lm-icon" src={`/itemicons/T4_${base}.png`} alt="" loading="lazy" width={44} height={44} onError={(e) => (e.currentTarget.style.visibility = "hidden")} />;
}

function Age({ at, now }: { at: number; now: number }) {
  const minutes = now - at;
  return <span className={`lm-age ${minutes <= 60 ? "is-fresh" : minutes <= 180 ? "is-ok" : "is-old"}`}>{ageLabel(at, now)}</span>;
}

export function LiveMarket({ region, nameOf }: { region: "eu" | "us"; nameOf: (id: string) => string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(nowMinute);
  const [opts, setOpts] = useState<FlipOptions>(storedFilters);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setLoad(await loadLive(region));
    } catch {
      setLoad({ kind: "error", message: "Loading failed, try again." });
    } finally {
      setBusy(false);
      setNow(nowMinute());
    }
  }, [region]);

  useEffect(() => {
    setLoad({ kind: "loading" });
    void refresh();
  }, [refresh]);

  // the ages tick every minute; once the next snapshot is due, it is fetched (only while visible)
  const pricesAt = load.kind === "ok" ? load.snap.pricesAt : null;
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(nowMinute());
      if (pricesAt && document.visibilityState === "visible" && nowMinute() - Date.parse(pricesAt) / 60000 > NEXT_AFTER_MIN) void refresh();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [pricesAt, refresh]);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({ ...opts, search: "" }));
    } catch {
      /* private mode: the filters just are not remembered */
    }
    setShown(PAGE);
  }, [opts]);

  const set = <K extends keyof FlipOptions>(key: K, value: FlipOptions[K]) => setOpts((o) => ({ ...o, [key]: value }));

  const flips = useMemo(() => (load.kind === "ok" ? computeFlips(load.snap, opts, now, nameOf) : []), [load, opts, now, nameOf]);

  const stats = useMemo(() => {
    if (!flips.length) return null;
    return {
      best: Math.max(...flips.map((f) => f.profitPct)),
      silver: Math.max(...flips.map((f) => f.profit)),
      fresh: Math.round((flips.filter((f) => now - f.buyAt <= 60 && now - f.sellAt <= 60).length / flips.length) * 100)
    };
  }, [flips, now]);

  const markets = load.kind === "ok" ? load.snap.locations : [];

  return (
    <section className="lm" aria-labelledby="lm-title">
      <header className="lm-head">
        <div>
          <span className="lm-kicker">
            <i className="lm-dot" aria-hidden="true" />
            Live market
            <b className="lm-badge">Premium</b>
          </span>
          <h2 id="lm-title">
            Flip it now.<span> Every market, every 30 minutes.</span>
          </h2>
          <p className="lm-lead">City to city or into the Black Market: the best route for every item, after tax, from the prices as they stand right now.</p>
        </div>
        {load.kind === "ok" ? (
          <div className="lm-stamp">
            <span>
              Snapshot <b>{clock(load.snap.pricesAt)}</b> · next ~{clock(new Date(Date.parse(load.snap.pricesAt) + 30 * 60000).toISOString())}
            </span>
            <button type="button" className="lm-refresh" onClick={() => void refresh()} disabled={busy}>
              {busy ? "Loading…" : "Refresh"}
            </button>
          </div>
        ) : null}
      </header>

      {load.kind === "loading" ? <p className="lm-note">Loading the live market…</p> : null}
      {load.kind === "error" || load.kind === "empty" ? (
        <div className="lm-note">
          {load.message}{" "}
          <button type="button" className="lm-link" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      ) : null}
      {load.kind === "guest" || load.kind === "locked" ? <Locked guest={load.kind === "guest"} /> : null}

      {load.kind === "ok" ? (
        <>
          <div className="lm-tabs" role="tablist" aria-label="Kind of flip">
            <button type="button" role="tab" aria-selected={opts.kind === "city"} className={opts.kind === "city" ? "is-on" : ""} onClick={() => set("kind", "city")}>
              <b>City to city</b>
              <small>Buy in one city, sell in another</small>
            </button>
            <button type="button" role="tab" aria-selected={opts.kind === "bm"} className={opts.kind === "bm" ? "is-on" : ""} onClick={() => set("kind", "bm")}>
              <b>Black Market</b>
              <small>Buy in a city, sell to the Black Market</small>
            </button>
          </div>
          <div className="lm-controls">
            <div className="lm-row">
              <label className="lm-field">
                <span>Buy in</span>
                <select value={opts.from} onChange={(e) => set("from", e.target.value)}>
                  <option value="ALL">Any city</option>
                  {markets
                    .filter((m) => m !== BLACK_MARKET)
                    .map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                </select>
              </label>
              <span className="lm-arrow" aria-hidden="true">
                →
              </span>
              {opts.kind === "city" ? (
                <>
                  <label className="lm-field">
                    <span>Sell in</span>
                    <select value={opts.to} onChange={(e) => set("to", e.target.value)}>
                      <option value="ALL">Any city</option>
                      {markets
                        .filter((m) => m !== BLACK_MARKET)
                        .map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="lm-seg" role="group" aria-label="How you sell">
                    <button type="button" className={opts.mode === "order" ? "is-on" : ""} onClick={() => set("mode", "order")}>
                      Sell order
                    </button>
                    <button type="button" className={opts.mode === "instant" ? "is-on" : ""} onClick={() => set("mode", "instant")}>
                      Sell instantly
                    </button>
                  </div>
                </>
              ) : (
                <span className="lm-fixed">
                  <span>Sell in</span>
                  <b>Black Market</b>
                </span>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={opts.albionPremium}
                className={`lm-toggle ${opts.albionPremium ? "is-on" : ""}`}
                onClick={() => set("albionPremium", !opts.albionPremium)}
              >
                <i aria-hidden="true" />
                Albion Premium ({Math.round((opts.albionPremium ? SALES_TAX.premium : SALES_TAX.normal) * 100)}% tax)
              </button>
            </div>
            <div className="lm-row">
              <div className="lm-seg" role="group" aria-label="Tier">
                {["ALL", "T4", "T5", "T6", "T7", "T8"].map((t) => (
                  <button key={t} type="button" className={opts.tier === t ? "is-on" : ""} onClick={() => set("tier", t)}>
                    {t === "ALL" ? "All" : t}
                  </button>
                ))}
              </div>
              <label className="lm-field is-small">
                <span>Min profit %</span>
                <input type="number" min={0} value={opts.minProfitPct} onChange={(e) => set("minProfitPct", Math.max(0, Number(e.target.value) || 0))} />
              </label>
              <label className="lm-field is-small">
                <span>Max cost</span>
                <input
                  type="number"
                  min={0}
                  placeholder="any"
                  value={opts.maxCost ?? ""}
                  onChange={(e) => set("maxCost", Number(e.target.value) > 0 ? Number(e.target.value) : null)}
                />
              </label>
              <label className="lm-field is-small">
                <span>Min sold/day</span>
                <input type="number" min={0} value={opts.minSold} onChange={(e) => set("minSold", Math.max(0, Number(e.target.value) || 0))} />
              </label>
              <label className="lm-field is-small">
                <span>Prices max</span>
                <select value={opts.maxAgeH} onChange={(e) => set("maxAgeH", Number(e.target.value))}>
                  {[1, 3, 6, 24, 72].map((h) => (
                    <option key={h} value={h}>
                      {h}h old
                    </option>
                  ))}
                </select>
              </label>
              <label className="lm-field is-grow">
                <span>Search</span>
                <input type="search" placeholder="Item name" value={opts.search} onChange={(e) => set("search", e.target.value)} />
              </label>
            </div>
          </div>

          <div className="lm-kpis">
            <div>
              <span>Flips</span>
              <b>{flips.length.toLocaleString("de-DE")}</b>
            </div>
            <div>
              <span>Best</span>
              <b>{stats ? `${stats.best.toFixed(0)}%` : "--"}</b>
            </div>
            <div>
              <span>Most silver / item</span>
              <b>{stats ? silver(stats.silver) : "--"}</b>
            </div>
            <div>
              <span>Both prices &lt; 1h old</span>
              <b>{stats ? `${stats.fresh}%` : "--"}</b>
            </div>
          </div>

          <div className="lm-list">
            <div className="lm-line lm-line-head">
              <span>Item</span>
              <span>Route</span>
              <span>Buy</span>
              <span>Sell</span>
              <button type="button" className={opts.sort === "silver" ? "is-sort" : ""} onClick={() => set("sort", opts.sort === "silver" ? "pct" : "silver")}>
                Profit {opts.sort === "silver" ? "· silver" : "· %"}
              </button>
              <button type="button" className={opts.sort === "sold" ? "is-sort" : ""} onClick={() => set("sort", opts.sort === "sold" ? "pct" : "sold")}>
                Sold/day
              </button>
            </div>
            {flips.length === 0 ? <p className="lm-empty">No flip matches these filters right now. Try older prices or a lower profit.</p> : null}
            {flips.slice(0, shown).map((flip) => (
              <Fragment key={flip.id}>
                <FlipRow flip={flip} now={now} name={nameOf(flip.id)} open={open === flip.id} onToggle={() => setOpen((o) => (o === flip.id ? null : flip.id))} />
                {open === flip.id ? <FlipDetail flip={flip} snap={load.snap} now={now} albionPremium={opts.albionPremium} /> : null}
              </Fragment>
            ))}
          </div>
          {flips.length > shown ? (
            <button type="button" className="lm-more" onClick={() => setShown((n) => n + PAGE)}>
              Show more ({(flips.length - shown).toLocaleString("de-DE")} left)
            </button>
          ) : null}
          <p className="lm-foot">
            Prices are the best orders players with the Albion Data client saw, so check them in game before you buy. How many items an order still has is not
            public; "sold/day" is the average of the last 7 days{load.snap.volumeAt ? ` (as of ${clock(load.snap.volumeAt)})` : ""}.
          </p>
        </>
      ) : null}
    </section>
  );
}

function FlipRow({ flip, now, name, open, onToggle }: { flip: Flip; now: number; name: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`lm-line ${open ? "is-open" : ""} ${flip.suspect ? "is-suspect" : ""}`} aria-expanded={open} onClick={onToggle}>
      <span className="lm-item">
        <ItemIcon id={flip.id} />
        <span>
          <b>{name}</b>
          <small>
            {itemLabel(flip.id)}
            {flip.suspect ? <em> · check price</em> : null}
          </small>
        </span>
      </span>
      <span className="lm-route">
        {flip.from}
        <i aria-hidden="true">→</i>
        <strong className={flip.to === BLACK_MARKET ? "is-bm" : ""}>{flip.to}</strong>
        <small>{flip.instant ? "buy order" : "sell order"}</small>
      </span>
      <span className="lm-price" data-label="Buy">
        {silver(flip.buy)} <Age at={flip.buyAt} now={now} />
      </span>
      <span className="lm-price" data-label="Sell">
        {silver(flip.sell)} <Age at={flip.sellAt} now={now} />
      </span>
      <span className="lm-profit" data-label="Profit">
        <b>+{silver(flip.profit)}</b>
        <small>{flip.profitPct.toFixed(1)}%</small>
      </span>
      <span className="lm-sold" data-label="Sold/day">
        {flip.sold == null ? "–" : flip.sold.toLocaleString("de-DE")}
      </span>
    </button>
  );
}

function FlipDetail({ flip, snap, now, albionPremium }: { flip: Flip; snap: LiveSnapshot; now: number; albionPremium: boolean }) {
  const cells = snap.prices[flip.id] ?? [];
  const volume = snap.volume[flip.id] ?? [];
  const tax = (albionPremium ? SALES_TAX.premium : SALES_TAX.normal) + (flip.instant ? 0 : SETUP_FEE);
  return (
    <div className="lm-detail">
      <p className="lm-math">
        Buy at <b>{silver(flip.buy)}</b> in {flip.from}, {flip.instant ? "sell into the buy order" : "list a sell order"} at <b>{silver(flip.sell)}</b> in {flip.to},
        minus {(tax * 100).toFixed(1)}% fees = <b>{silver(flip.sell * (1 - tax))}</b> → <b className="lm-plus">+{silver(flip.profit)}</b> per item.
      </p>
      <div className="lm-table">
        <div className="lm-trow lm-trow-head">
          <span>Market</span>
          <span>Cheapest listing</span>
          <span>Best buy order</span>
          <span>Sold/day</span>
          <span>7-day avg</span>
        </div>
        {snap.locations.map((market, i) => {
          const cell = cells[i];
          const vol = volume[i];
          return (
            <div key={market} className={`lm-trow ${market === flip.from ? "is-from" : ""} ${market === flip.to ? "is-to" : ""}`}>
              <span>
                {market}
                {market === flip.from ? <em>buy</em> : market === flip.to ? <em>sell</em> : null}
              </span>
              <span>
                {cell && cell[0] ? (
                  <>
                    {silver(cell[0])} <Age at={cell[1]} now={now} />
                  </>
                ) : (
                  "–"
                )}
              </span>
              <span>
                {cell && cell[2] ? (
                  <>
                    {silver(cell[2])} <Age at={cell[3]} now={now} />
                  </>
                ) : (
                  "–"
                )}
              </span>
              <span>{vol ? vol[0].toLocaleString("de-DE") : "–"}</span>
              <span>{vol ? silver(vol[1]) : "–"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** What guests and players without premium see: a blurred example and the way in. */
function Locked({ guest }: { guest: boolean }) {
  const sample: Array<[string, string, string, string]> = [
    ["Grandmaster's Bow", "Martlock → Black Market", "+68.900", "38%"],
    ["Adept's Plate Helmet", "Thetford → Caerleon", "+14.200", "34%"],
    ["Expert's Fire Staff", "Lymhurst → Black Market", "+24.700", "26%"],
    ["Master's Cowl", "Bridgewatch → Fort Sterling", "+9.800", "21%"]
  ];
  return (
    <div className="lm-locked">
      <div className="lm-locked-rows" aria-hidden="true">
        {sample.map(([item, route, profit, pct]) => (
          <div key={item}>
            <span>{item}</span>
            <span>{route}</span>
            <b>{profit}</b>
            <small>{pct}</small>
          </div>
        ))}
      </div>
      <div className="lm-locked-card">
        <b>Live flips across all 8 markets</b>
        <p>Every item, every city and the Black Market, fresh every 30 minutes, with the price age and how much sells per day.</p>
        {guest ? (
          <a className="lm-cta" href="/login?next=%2Fdashboard">
            Sign in
          </a>
        ) : (
          <a className="lm-cta" href="/premium">
            Get Premium
          </a>
        )}
        <a className="lm-link" href="/premium">
          What's in premium ›
        </a>
      </div>
    </div>
  );
}
