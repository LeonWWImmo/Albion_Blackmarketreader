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
import { MobileNavBurger, ToolNav, useFestivities, useSessionState } from "../../shared";
import { normalizeRecipesPayload, type BmRecipe } from "../bm-crafter";
import { iconUrl } from "../price-checker/core/items";
import { dailyBook, dailyFromFiles, liveBook, mixBook, type DailyPrices, type PriceBook, type Quote } from "./core/books";
import { cityCraftRows, citySummary, worthIt, type BuyMode, type CityCraftOptions, type CityCraftRow, type MatFrom, type SellMode } from "./core/cityCraft";
import "../bm-crafter/ui/bmCrafter.css";
import "./cityCrafter.css";

const CREST: Record<string, string> = {
  Bridgewatch: "picture/Bridgewatch.png",
  Caerleon: "picture/Carleon.png",
  "Fort Sterling": "picture/Fortsterlingwappen.png",
  Lymhurst: "picture/Lymhurstwappen.png",
  Martlock: "picture/Martlockwappen.png",
  Thetford: "picture/Thefortwappen.png"
};

/** What each city crafts with its bonus (getBonusCityForItem), for the city cards. */
const CITY_BONUS: Record<string, string> = {
  Bridgewatch: "Crossbows, daggers, cursed, plate armor, cloth shoes",
  Caerleon: "Gloves, tools, gathering gear",
  "Fort Sterling": "Hammers, spears, holy, plate helmets, cloth armor",
  Lymhurst: "Swords, bows, arcane, leather helmets and shoes",
  Martlock: "Axes, quarterstaffs, frost, off-hands, plate shoes",
  Thetford: "Maces, fire, nature, cloth helmets, leather armor",
  Brecilien: "Bags and capes"
};

const TIERS = [4, 5, 6, 7, 8];
const ENCHANTS = [0, 1, 2, 3, 4];
const PAGE = 40;
const ENCHANT_COLOR = ["#94a3b8", "#4ade80", "#60a5fa", "#c084fc", "#fbbf24"];

type SortKey = "daily" | "profit" | "roi";
type DataMode = "live" | "fill" | "daily";

const silver = (n: number) => Math.round(n).toLocaleString("de-DE");
const short = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}k` : silver(n));
const age = (minutes: number) =>
  minutes < 60 ? `${Math.max(0, Math.round(minutes))} min` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes / 1440)} d`;
const nowMinute = () => Math.round(Date.now() / 60000);

let recipesOnce: Promise<BmRecipe[]> | null = null;
const loadRecipes = () =>
  (recipesOnce ??= fetch("/items-categorized-crafting.json")
    .then((res) => res.json())
    .then((json) => normalizeRecipesPayload(json).items)
    .catch(() => {
      recipesOnce = null;
      return [];
    }));

const dailyOnce = new Map<string, Promise<DailyPrices | null>>();
/** The free tools' daily files of a region (public/data), loaded once. */
function loadDaily(region: string): Promise<DailyPrices | null> {
  const hit = dailyOnce.get(region);
  if (hit) return hit;
  const get = (file: string) => fetch(`/data/${file}-${region}.json`).then((res) => (res.ok ? res.json() : {}));
  const load = Promise.all([get("crafting-results"), get("materials-cities"), get("artefacts")])
    .then(([results, materials, artefacts]) => dailyFromFiles(results, materials, artefacts))
    .catch(() => {
      dailyOnce.delete(region);
      return null;
    });
  dailyOnce.set(region, load);
  return load;
}

export function CityCrafterPage() {
  const visible = premiumVisible();
  const { pathname } = useLocation();
  const [region, setRegion] = useRegion();
  const { meta, layers } = useToolAccount(pathname, null, region, setRegion);
  const festivities = useFestivities(region);

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
    () => ({ matFrom, buy, sell, focus, taxRate: premiumTax ? 0.04 : 0.08, usageFee, tiers, enchants, bonuses: festivities.craftBonuses }),
    [matFrom, buy, sell, focus, premiumTax, usageFee, tiers, enchants, festivities.craftBonuses]
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

        {live.kind === "guest" || live.kind === "locked" || live.kind === "error" ? (
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

type RowProps = { row: CityCraftRow; city: string; sell: SellMode; now: number; open: boolean; onToggle: () => void };

function Row({ row, city, sell, now, open, onToggle }: RowProps) {
  const calc = `/crafting-calculator?${new URLSearchParams({ item: row.baseId, tier: String(row.tier), enchant: String(row.enchant), craftCity: city, sell: city })}`;
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
                <span>Station fee</span>
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
              <li className="is-total">
                <span>Profit per craft</span>
                <b className="cc-plus">+{silver(row.profit)}</b>
              </li>
            </ul>
            <p className="cc-explain">
              You put in <b>{silver(row.cost)}</b> and get <b>{silver(row.net)}</b> back: <b>+{silver(row.profit)}</b>, that is{" "}
              <b>+{Math.round(row.roi)} %</b> on your silver.
            </p>
            <ul>
              <li>
                <span>7-day average price</span>
                <b>{row.avgPrice ? silver(row.avgPrice) : "–"}</b>
              </li>
              {row.focusCost ? (
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
        </div>
      ) : null}
    </div>
  );
}

/** A price's age, and "daily" when it comes from the daily data. */
function QuoteAge({ quote, now }: { quote: Quote; now: number }) {
  return (
    <small className={`cc-age${quote.src === "daily" ? " is-daily" : ""}`}>
      {quote.src === "daily" ? "daily · " : ""}
      {age(now - quote.at)}
    </small>
  );
}

function Seg<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: Array<[T, string]> }) {
  return (
    <div className="cc-field">
      <span>{label}</span>
      <div className="cc-seg" role="group" aria-label={label}>
        {options.map(([key, text]) => (
          <button key={key} type="button" className={key === value ? "is-on" : ""} aria-pressed={key === value} onClick={() => onChange(key)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chips({ label, all, on, set, text }: { label: string; all: number[]; on: number[]; set: (v: number[]) => void; text: (n: number) => string }) {
  const toggle = (n: number) => {
    const next = on.includes(n) ? on.filter((x) => x !== n) : [...on, n].sort((a, b) => a - b);
    if (next.length) set(next);
  };
  return (
    <div className="cc-field">
      <span>{label}</span>
      <div className="cc-seg" role="group" aria-label={label}>
        {all.map((n) => (
          <button key={n} type="button" className={on.includes(n) ? "is-on" : ""} aria-pressed={on.includes(n)} onClick={() => toggle(n)}>
            {text(n)}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="cc-field cc-num">
      <span>{label}</span>
      <input inputMode="numeric" value={String(value)} onChange={(e) => onChange(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))} title={hint} />
    </label>
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
