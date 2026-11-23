// City Crafter (premium, hidden until the launch): craft and sell in one city, the materials from
// there or from wherever they are cheapest. Live, daily or mixed prices (core/books.ts) for every
// recipe in the picked city (core/cityCraft.ts), ranked by profit a day.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { assetUrl } from "@shared/assets/assets";
import { useToolAccount } from "@shared/account/useToolAccount";
import { premiumVisible } from "@shared/premium/premium";
import { useRegion } from "@shared/region/useRegion";
import { useSeo } from "@shared/seo/useSeo";
import { loadLive, type LiveStatus } from "@shared/live/liveData";
import { MobileNavBurger, ToolNav, resolveJournalProfit, useFestivities, useJournals, useSessionState } from "../../shared";
import type { BmRecipe } from "../bm-crafter";
import { iconUrl } from "../price-checker/core/items";
import { dailyBook, liveBook, mixBook, type DailyPrices, type PriceBook } from "./core/books";
import { CraftDetail, QuoteAge } from "./CraftDetail";
import { age, CITY_BONUS, Chips, CREST, ENCHANT_COLOR, ENCHANTS, loadDaily, loadRecipes, nowMinute, NumberField, Seg, short, silver, TIERS, type DataMode } from "./kit";
import { CRAFT_CITIES, cityCraftRows, citySummary, worthIt, type BuyMode, type CityCraftOptions, type CityCraftRow, type MatFrom, type SellMode } from "./core/cityCraft";
import "../bm-crafter/ui/bmCrafter.css";
import "./cityCrafter.css";

const PAGE = 40;

type SortKey = "daily" | "profit" | "roi";

export function CityCrafterPage() {
  const visible = premiumVisible();
  const { pathname } = useLocation();
  const [region, setRegion] = useRegion();
  const { meta, layers } = useToolAccount(pathname, "city-crafter", region, setRegion);
  const festivities = useFestivities(region);
  const journals = useJournals(region);
  // on by default here (the other tools keep theirs off): crafting fills journals anyway
  const [fillJournals, setFillJournals] = useSessionState("cc-journals", true);

  const [city, setCity] = useSessionState<string>("cc-city", "Lymhurst");
  const [dataMode, setDataMode] = useSessionState<DataMode>("cc-data", "fill");
  const [matFrom, setMatFrom] = useSessionState<MatFrom>("cc-mat-from", "cheapest");
  const [buy, setBuy] = useSessionState<BuyMode>("cc-buy", "instant");
  const [sell, setSell] = useSessionState<SellMode>("cc-sell", "order");
  const [focus, setFocus] = useSessionState("cc-focus", false);
  const [premiumTax, setPremiumTax] = useSessionState("cc-premium-tax", true);
  const [usageFee, setUsageFee] = useSessionState("cc-usage-fee", 1000);
  const [tiers, setTiers] = useSessionState<number[]>("cc-tiers", [4, 5, 6, 7, 8]);
  const [enchants, setEnchants] = useSessionState<number[]>("cc-enchants", [0, 1, 2, 3]);
  const [minSold, setMinSold] = useSessionState("cc-min-sold", 3);
  const [minRoi, setMinRoi] = useSessionState("cc-min-roi", 10);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useSessionState<SortKey>("cc-sort", "daily");
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  const [live, setLive] = useState<LiveStatus>({ kind: "loading" });
  const [recipes, setRecipes] = useState<BmRecipe[]>([]);
  const [daily, setDaily] = useState<DailyPrices | null>(null);

  useSeo({
    title: "City Crafter | Blackmarket Reader",
    description: "Buy, craft and sell in one Albion Online city: every craft priced live, ranked by what it earns a day.",
    canonical: "https://blackmarketreader.com/city-crafter",
    noindex: true
  });

  useEffect(() => {
    document.body.classList.add("city-crafter-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter");
    return () => document.body.classList.remove("city-crafter-body");
  }, []);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLive({ kind: "loading" });
    void loadLive(region).then((status) => alive && setLive(status));
    void loadRecipes().then((list) => alive && setRecipes(list));
    return () => {
      alive = false;
    };
  }, [region, visible]);

  useEffect(() => {
    if (!visible || dataMode === "live") return;
    let alive = true;
    void loadDaily(region).then((data) => alive && setDaily(data));
    return () => {
      alive = false;
    };
  }, [region, visible, dataMode]);

  useEffect(() => setShown(PAGE), [city, dataMode, matFrom, buy, sell, focus, premiumTax, usageFee, tiers, enchants, minSold, minRoi, search, sort]);

  const snap = live.kind === "ok" ? live.snap : null;
  const now = useMemo(() => nowMinute(), [snap]); // eslint-disable-line react-hooks/exhaustive-deps
  const options: Omit<CityCraftOptions, "city"> = useMemo(
    () => ({
      matFrom,
      buy,
      sell,
      focus,
      taxRate: premiumTax ? 0.04 : 0.08,
      usageFee,
      tiers,
      enchants,
      bonuses: festivities.craftBonuses,
      // filled crafting journals, the same way as in the BM Crafter (journal prices of the crafting city)
      journal: fillJournals
        ? (recipe: BmRecipe, tier: number, at: string) =>
            resolveJournalProfit(
              {
                categoryKey: recipe.categoryKey,
                itemId: `T${tier}_${recipe.itemId}`,
                tier,
                artifactId: recipe.artifactId,
                totalResourceCount: recipe.materials.reduce((sum, m) => sum + Number(m.qty || 0), 0),
                city: at
              },
              true,
              journals.owned,
              journals.data
            )?.journalProfit ?? 0
        : undefined
    }),
    [matFrom, buy, sell, focus, premiumTax, usageFee, tiers, enchants, festivities.craftBonuses, fillJournals, journals.owned, journals.data]
  );
  // the prices: live, daily, or live filled with daily (the sales a day always come from the snapshot)
  const book: PriceBook | null = useMemo(() => {
    if (!snap) return null;
    const live = liveBook(snap, now);
    if (dataMode === "live") return live;
    if (!daily) return null;
    return dataMode === "daily" ? dailyBook(daily, snap) : mixBook(live, dailyBook(daily, snap));
  }, [snap, now, daily, dataMode]);

  const summary = useMemo(() => (book && recipes.length ? citySummary(book, recipes, options, minRoi, minSold) : []), [book, recipes, options, minRoi, minSold]);
  const rows = useMemo(() => {
    if (!book || !recipes.length) return [];
    const needle = search.trim().toLowerCase();
    const list = cityCraftRows(book, recipes, { ...options, city })
      .filter((row) => worthIt(row, minRoi, minSold))
      .filter((row) => !needle || row.name.toLowerCase().includes(needle));
    if (sort === "profit") list.sort((a, b) => b.profit - a.profit);
    if (sort === "roi") list.sort((a, b) => b.roi - a.roi);
    return list;
  }, [book, recipes, options, city, minRoi, minSold, search, sort]);

  if (!visible) return <Navigate to="/" replace />;

  const best = summary.length ? Math.max(...summary.map((s) => s.topDaily)) : 0;
  const pricesAge = snap ? (Date.now() - Date.parse(snap.pricesAt)) / 60000 : null;

  return (
    <div className="cc-root">
      <header className="bm-header">
        <MobileNavBurger accent="#e0b252" />
        <div className="bm-header-row">
          <div className="bm-brand">
            <div className="bm-brand-home">
              <div className="bm-logo" aria-hidden="true">
                <img src={assetUrl("picture/testo ohne background.png")} alt="" />
              </div>
              <h1>RomulusKings Crafting Tools</h1>
            </div>
            <ToolNav />
          </div>
          {meta}
        </div>
      </header>

      <main className="cc-main">
        <section className="cc-hero">
          <span className="cc-kicker">✦ Premium · City Crafter</span>
          <h2>Craft where you sell.</h2>
          <p>
            Craft and sell in one city, the materials from there or from wherever they are cheapest. Every craft priced and ranked by what
            it earns a day.
          </p>
          <span className="cc-badges">
            {pricesAge !== null ? (
              <span className="cc-live">
                <i /> Live prices · {age(pricesAge)} ago
              </span>
            ) : null}
          </span>
        </section>

        {live.kind === "guest" || live.kind === "locked" ? (
          <Teaser region={region} guest={live.kind === "guest"} />
        ) : live.kind === "error" ? (
          <Gate status={live} />
        ) : !book || !recipes.length ? (
          <p className="cc-note">Loading the market…</p>
        ) : (
          <>
            <section className="cc-cities" aria-label="Pick a city">
              {summary.map((s) => (
                <button
                  key={s.city}
                  type="button"
                  className={`cc-city${s.city === city ? " is-on" : ""}`}
                  aria-pressed={s.city === city}
                  onClick={() => setCity(s.city)}
                  style={{ "--fill": best > 0 ? `${Math.round((s.topDaily / best) * 100)}%` : "0%" } as CSSProperties}
                >
                  <span className="cc-city-head">
                    {CREST[s.city] ? <img src={assetUrl(CREST[s.city])} alt="" width={30} height={30} /> : <span className="cc-crest">B</span>}
                    <b>{s.city}</b>
                  </span>
                  <span className="cc-city-sum">
                    <strong>{short(s.topDaily)}</strong> a day
                  </span>
                  <span className="cc-city-meta">{s.count} good crafts</span>
                  <span className="cc-city-bar" aria-hidden="true">
                    <i />
                  </span>
                  <small>{CITY_BONUS[s.city]}</small>
                </button>
              ))}
            </section>

            <section className="cc-filters" aria-label="Settings">
              <Seg label="Prices" value={dataMode} onChange={setDataMode} options={[["live", "Live"], ["fill", "Live + daily"], ["daily", "Daily"]]} />
              <Seg label="Materials from" value={matFrom} onChange={setMatFrom} options={[["cheapest", "Cheapest city"], ["city", `Only ${city}`]]} />
              <Seg label="Materials" value={buy} onChange={setBuy} options={[["instant", "Buy instantly"], ["order", "Buy orders"]]} />
              <Seg label="Sell" value={sell} onChange={setSell} options={[["order", "Sell order"], ["instant", "Instant sell"]]} />
              <Seg label="Focus" value={focus ? "on" : "off"} onChange={(v) => setFocus(v === "on")} options={[["off", "No focus"], ["on", "Focus"]]} />
              <Seg label="Journals" value={fillJournals ? "on" : "off"} onChange={(v) => setFillJournals(v === "on")} options={[["off", "Off"], ["on", "Fill journals"]]} />
              <Seg label="Tax" value={premiumTax ? "4" : "8"} onChange={(v) => setPremiumTax(v === "4")} options={[["4", "4 %"], ["8", "8 %"]]} />
              <Chips label="Tier" all={TIERS} on={tiers} set={setTiers} text={(t) => `T${t}`} />
              <Chips label="Enchant" all={ENCHANTS} on={enchants} set={setEnchants} text={(e) => `.${e}`} />
              <NumberField label="Station fee" value={usageFee} onChange={setUsageFee} hint="per 100 nutrition" />
              <NumberField label="Sold / day ≥" value={minSold} onChange={setMinSold} />
              <NumberField label="Profit % ≥" value={minRoi} onChange={setMinRoi} hint="profit per silver spent" />
              <label className="cc-field cc-search">
                <span>Search</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item name" />
              </label>
            </section>

            <section className="cc-results" aria-label={`Crafts in ${city}`}>
              <div className="cc-results-head">
                <h3>
                  {rows.length} crafts pay in <b>{city}</b>
                </h3>
                <Seg label="Sort" value={sort} onChange={setSort} options={[["daily", "Profit / day"], ["profit", "Profit / craft"], ["roi", "Profit %"]]} />
              </div>
              <div className="cc-table" role="table">
                <div className="cc-row cc-row-head" role="row">
                  <span role="columnheader">Item</span>
                  <span role="columnheader">Cost</span>
                  <span role="columnheader">{sell === "order" ? "Sell order" : "Buy order"}</span>
                  <span role="columnheader">Profit</span>
                  <span role="columnheader" title="Profit per silver you spend: 50 % means 1.000 silver in, 1.500 back">
                    Profit %
                  </span>
                  <span role="columnheader">Sold / day</span>
                  <span role="columnheader">Profit / day</span>
                </div>
                {rows.slice(0, shown).map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    city={city}
                    sell={sell}
                    now={now}
                    usageFee={usageFee}
                    open={open === row.id}
                    onToggle={() => setOpen(open === row.id ? null : row.id)}
                  />
                ))}
              </div>
              {!rows.length ? (
                <p className="cc-note">
                  Nothing pays with these settings in {city}.{" "}
                  {dataMode === "daily" && sell === "instant" ? "The daily data has no buy orders: pick Sell order or live prices." : "Lower the profit % or sold-per-day floor, or try another city."}
                </p>
              ) : null}
              {rows.length > shown ? (
                <button type="button" className="cc-more" onClick={() => setShown(shown + PAGE)}>
                  Show more ({rows.length - shown})
                </button>
              ) : null}
              <p className="cc-fine">
                Profit %: the profit on the silver you put in (50 % = 1.000 in, 1.500 back). Prices: live every 30 minutes, daily once a day
                (marked "daily"), or live filled with daily where live has none. Sold / day: the city's 7-day average, all qualities. Listings far above that average are left out. Profit / day assumes you
                get the city's whole daily sales: with other crafters it is less.
              </p>
            </section>
          </>
        )}
      </main>
      {layers}
    </div>
  );
}

type RowProps = { row: CityCraftRow; city: string; sell: SellMode; now: number; usageFee: number; open: boolean; onToggle: () => void };

function Row({ row, city, sell, now, usageFee, open, onToggle }: RowProps) {
  return (
    <div className={`cc-item${open ? " is-open" : ""}`} role="rowgroup">
      <button type="button" className="cc-row" role="row" aria-expanded={open} onClick={onToggle}>
        <span className="cc-name" role="cell">
          <img src={iconUrl(row.id)} alt="" width={40} height={40} loading="lazy" />
          <span>
            <b>{row.name}</b>
            <span className="cc-chips">
              <i className="cc-chip" style={{ "--chip": ENCHANT_COLOR[row.enchant] } as CSSProperties}>
                T{row.tier}.{row.enchant}
              </i>
              {row.bonusCity ? <i className="cc-chip is-gold">★ City bonus</i> : null}
              {row.dailyBonus ? <i className="cc-chip is-green">+{row.dailyBonus}% today</i> : null}
              {row.artefact ? <i className="cc-chip">Artefact</i> : null}
              {row.imported ? <i className="cc-chip is-blue">Materials from {[...new Set([...row.materials, ...(row.artefact ? [row.artefact] : [])].filter((p) => p.city !== city).map((p) => p.city))].join(", ")}</i> : null}
            </span>
          </span>
        </span>
        <span role="cell" data-label="Cost">{silver(row.cost)}</span>
        <span role="cell" data-label={sell === "order" ? "Sell order" : "Buy order"}>
          {silver(row.sale.unit)} <QuoteAge quote={row.sale} now={now} />
        </span>
        <span role="cell" data-label="Profit" className="cc-profit">+{silver(row.profit)}</span>
        <span role="cell" data-label="Profit %">+{Math.round(row.roi)} %</span>
        <span role="cell" data-label="Sold / day">{Math.round(row.sold)}</span>
        <span role="cell" data-label="Profit / day" className="cc-daily">+{short(row.dailyProfit)}</span>
      </button>
      {open ? (
        <CraftDetail row={row} city={city} sell={sell} now={now} usageFee={usageFee} />
      ) : null}
    </div>
  );
}

/** One craft of the free preview, as /api/market/teaser sends it (api/_lib/cityTeaser.js). */
type TeaserRow = {
  id: string;
  name: string;
  tier: number;
  enchant: number;
  bonusCity: boolean;
  materials: Array<{ city: string }>;
  artefact: { city: string } | null;
  cost: number;
  price: number;
  profit: number;
  roi: number;
  sold: number;
  dailyProfit: number;
};
type TeaserCity = { city: string; count: number; topDaily: number; top: TeaserRow[] };

/**
 * Without premium: Lymhurst's best three crafts, worked out on the server. The rest never reaches
 * the browser, so there is nothing to unlock here; the other cities are shown locked.
 */
function Teaser({ region, guest }: { region: string; guest: boolean }) {
  const [cities, setCities] = useState<TeaserCity[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setCities(null);
    setFailed(false);
    fetch(`/api/market/teaser?region=${region}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { cities?: TeaserCity[] }) => alive && setCities(data.cities ?? []))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [region]);

  if (failed) return <Gate status={{ kind: guest ? "guest" : "locked" }} />;
  if (!cities) return <p className="cc-note">Loading the market…</p>;
  const here = cities[0];
  const city = here?.city ?? "Lymhurst";
  const more = Math.max(0, (here?.count ?? 0) - (here?.top.length ?? 0));

  return (
    <>
      <section className="cc-cities" aria-label="Cities">
        {CRAFT_CITIES.map((name) =>
          name === city ? (
            <div key={name} className="cc-city is-on" style={{ "--fill": "100%" } as CSSProperties}>
              <span className="cc-city-head">
                {CREST[name] ? <img src={assetUrl(CREST[name])} alt="" width={30} height={30} /> : <span className="cc-crest">B</span>}
                <b>{name}</b>
              </span>
              <span className="cc-city-sum">
                <strong>{short(here?.topDaily ?? 0)}</strong> a day
              </span>
              <span className="cc-city-meta">{here?.count ?? 0} good crafts</span>
              <span className="cc-city-bar" aria-hidden="true">
                <i />
              </span>
              <small>{CITY_BONUS[name]}</small>
            </div>
          ) : (
            <a key={name} className="cc-city is-locked" href={guest ? `/login?next=${encodeURIComponent("/city-crafter")}` : "/premium"}>
              <span className="cc-city-head">
                {CREST[name] ? <img src={assetUrl(CREST[name])} alt="" width={30} height={30} /> : <span className="cc-crest">B</span>}
                <b>{name}</b>
              </span>
              <span className="cc-city-lock">✦ Premium</span>
              <small>{CITY_BONUS[name]}</small>
            </a>
          )
        )}
      </section>

      <section className="cc-results" aria-label={`Best crafts in ${city}`}>
        <div className="cc-results-head">
          <h3>
            Free preview: the best 3 of {here?.count ?? 0} crafts in <b>{city}</b>
          </h3>
        </div>
        <div className="cc-table" role="table">
          <div className="cc-row cc-row-head" role="row">
            <span role="columnheader">Item</span>
            <span role="columnheader">Cost</span>
            <span role="columnheader">Sell order</span>
            <span role="columnheader">Profit</span>
            <span role="columnheader">Profit %</span>
            <span role="columnheader">Sold / day</span>
            <span role="columnheader">Profit / day</span>
          </div>
          {(here?.top ?? []).map((row) => {
            const away = [...new Set([...row.materials, ...(row.artefact ? [row.artefact] : [])].map((p) => p.city).filter((c) => c !== city))];
            return (
              <div key={row.id} className="cc-item" role="rowgroup">
                <div className="cc-row" role="row">
                  <span className="cc-name" role="cell">
                    <img src={iconUrl(row.id)} alt="" width={40} height={40} loading="lazy" />
                    <span>
                      <b>{row.name}</b>
                      <span className="cc-chips">
                        <i className="cc-chip" style={{ "--chip": ENCHANT_COLOR[row.enchant] } as CSSProperties}>
                          T{row.tier}.{row.enchant}
                        </i>
                        {row.bonusCity ? <i className="cc-chip is-gold">★ City bonus</i> : null}
                        {row.artefact ? <i className="cc-chip">Artefact</i> : null}
                        {away.length ? <i className="cc-chip is-blue">Materials from {away.join(", ")}</i> : null}
                      </span>
                    </span>
                  </span>
                  <span role="cell" data-label="Cost">{silver(row.cost)}</span>
                  <span role="cell" data-label="Sell order">{silver(row.price)}</span>
                  <span role="cell" data-label="Profit" className="cc-profit">+{silver(row.profit)}</span>
                  <span role="cell" data-label="Profit %">+{Math.round(row.roi)} %</span>
                  <span role="cell" data-label="Sold / day">{Math.round(row.sold)}</span>
                  <span role="cell" data-label="Profit / day" className="cc-daily">+{short(row.dailyProfit)}</span>
                </div>
              </div>
            );
          })}
        </div>
        {!here?.top.length ? <p className="cc-note">Nothing pays in {city} right now with the standard settings.</p> : null}
        <div className="cc-lock">
          <div className="cc-lock-rows" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} />
            ))}
          </div>
          <div className="cc-lock-card">
            <b>{more > 0 ? `${more} more crafts pay in ${city}, and 6 more cities` : "Every craft in every city"}</b>
            <p>
              Premium shows all of them with the shopping list, your own settings (focus, journals, buy orders, instant sell) and
              live or daily prices.
            </p>
            {guest ? (
              <a className="cc-cta" href={`/login?next=${encodeURIComponent("/city-crafter")}`}>
                Sign in
              </a>
            ) : (
              <a className="cc-cta" href="/premium">
                Get Premium
              </a>
            )}
          </div>
        </div>
        <p className="cc-fine">
          The preview uses the standard settings: materials bought instantly where they are cheapest, sold by sell order, no focus, 4 %
          tax, live prices.
        </p>
      </section>
    </>
  );
}

function Gate({ status }: { status: LiveStatus }) {
  let body: ReactNode;
  if (status.kind === "guest") {
    body = (
      <>
        <p>Sign in with Premium to see what pays in every city right now.</p>
        <a className="cc-cta" href={`/login?next=${encodeURIComponent("/city-crafter")}`}>
          Sign in
        </a>
      </>
    );
  } else if (status.kind === "locked") {
    body = (
      <>
        <p>The City Crafter is part of Premium: every craft in every city, priced live every 30 minutes.</p>
        <a className="cc-cta" href="/premium">
          Get Premium
        </a>
      </>
    );
  } else {
    body = <p>{status.kind === "error" ? status.message : "Live prices could not load."}</p>;
  }
  return <section className="cc-gate">{body}</section>;
}
