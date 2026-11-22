// City Crafter (premium, hidden until the launch): buy, craft and sell in one city. The live
// snapshot priced for every recipe in the picked city (core/cityCraft.ts), ranked by profit a day.
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
import { CRAFT_CITIES, cityCraftRows, citySummary, worthIt, type BuyMode, type CityCraftOptions, type CityCraftRow, type SellMode } from "./core/cityCraft";
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

const silver = (n: number) => Math.round(n).toLocaleString("de-DE");
const short = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}k` : silver(n));
const age = (minutes: number) => (minutes < 60 ? `${Math.max(0, Math.round(minutes))} min` : `${Math.round(minutes / 60)} h`);
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

export function CityCrafterPage() {
  const visible = premiumVisible();
  const { pathname } = useLocation();
  const [region, setRegion] = useRegion();
  const { meta, layers } = useToolAccount(pathname, null, region, setRegion);
  const festivities = useFestivities(region);

  const [city, setCity] = useSessionState<string>("cc-city", "Lymhurst");
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

  useEffect(() => setShown(PAGE), [city, buy, sell, focus, premiumTax, usageFee, tiers, enchants, minSold, minRoi, search, sort]);

  const snap = live.kind === "ok" ? live.snap : null;
  const now = useMemo(() => nowMinute(), [snap]); // eslint-disable-line react-hooks/exhaustive-deps
  const options: Omit<CityCraftOptions, "city"> = useMemo(
    () => ({ buy, sell, focus, taxRate: premiumTax ? 0.04 : 0.08, usageFee, tiers, enchants, bonuses: festivities.craftBonuses, now }),
    [buy, sell, focus, premiumTax, usageFee, tiers, enchants, festivities.craftBonuses, now]
  );

  const summary = useMemo(() => (snap && recipes.length ? citySummary(snap, recipes, options, minRoi, minSold) : []), [snap, recipes, options, minRoi, minSold]);
  const rows = useMemo(() => {
    if (!snap || !recipes.length) return [];
    const needle = search.trim().toLowerCase();
    const list = cityCraftRows(snap, recipes, { ...options, city })
      .filter((row) => worthIt(row, minRoi, minSold))
      .filter((row) => !needle || row.name.toLowerCase().includes(needle));
    if (sort === "profit") list.sort((a, b) => b.profit - a.profit);
    if (sort === "roi") list.sort((a, b) => b.roi - a.roi);
    return list;
  }, [snap, recipes, options, city, minRoi, minSold, search, sort]);

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
            Buy the materials, craft and sell in one city. No transport, nothing to lose on the road. Every craft priced live and ranked by
            what it earns a day.
          </p>
          {pricesAge !== null ? (
            <span className="cc-live">
              <i /> Live prices · {age(pricesAge)} ago
            </span>
          ) : null}
        </section>

        {live.kind === "guest" || live.kind === "locked" || live.kind === "error" ? (
          <Gate status={live} />
        ) : !snap || !recipes.length ? (
          <p className="cc-note">Loading the live market…</p>
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
              <Seg label="Materials" value={buy} onChange={setBuy} options={[["instant", "Buy instantly"], ["order", "Buy orders"]]} />
              <Seg label="Sell" value={sell} onChange={setSell} options={[["order", "Sell order"], ["instant", "Instant sell"]]} />
              <Seg label="Focus" value={focus ? "on" : "off"} onChange={(v) => setFocus(v === "on")} options={[["off", "No focus"], ["on", "Focus"]]} />
              <Seg label="Tax" value={premiumTax ? "4" : "8"} onChange={(v) => setPremiumTax(v === "4")} options={[["4", "4 %"], ["8", "8 %"]]} />
              <Chips label="Tier" all={TIERS} on={tiers} set={setTiers} text={(t) => `T${t}`} />
              <Chips label="Enchant" all={ENCHANTS} on={enchants} set={setEnchants} text={(e) => `.${e}`} />
              <NumberField label="Station fee" value={usageFee} onChange={setUsageFee} hint="per 100 nutrition" />
              <NumberField label="Sold / day ≥" value={minSold} onChange={setMinSold} />
              <NumberField label="ROI ≥ %" value={minRoi} onChange={setMinRoi} />
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
                <Seg label="Sort" value={sort} onChange={setSort} options={[["daily", "Profit / day"], ["profit", "Profit / craft"], ["roi", "ROI"]]} />
              </div>
              <div className="cc-table" role="table">
                <div className="cc-row cc-row-head" role="row">
                  <span role="columnheader">Item</span>
                  <span role="columnheader">Cost</span>
                  <span role="columnheader">{sell === "order" ? "Sell order" : "Buy order"}</span>
                  <span role="columnheader">Profit</span>
                  <span role="columnheader">ROI</span>
                  <span role="columnheader">Sold / day</span>
                  <span role="columnheader">Profit / day</span>
                </div>
                {rows.slice(0, shown).map((row) => (
                  <Row key={row.id} row={row} city={city} sell={sell} now={now} open={open === row.id} onToggle={() => setOpen(open === row.id ? null : row.id)} />
                ))}
              </div>
              {!rows.length ? <p className="cc-note">Nothing pays with these settings in {city}. Lower the ROI or sold-per-day floor, or try another city.</p> : null}
              {rows.length > shown ? (
                <button type="button" className="cc-more" onClick={() => setShown(shown + PAGE)}>
                  Show more ({rows.length - shown})
                </button>
              ) : null}
              <p className="cc-fine">
                Sold / day: the city's 7-day average, all qualities. Listings far above that average are left out. Profit / day assumes you
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

function Row({ row, city, sell, now, open, onToggle }: { row: CityCraftRow; city: string; sell: SellMode; now: number; open: boolean; onToggle: () => void }) {
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
            </span>
          </span>
        </span>
        <span role="cell" data-label="Cost">{silver(row.cost)}</span>
        <span role="cell" data-label={sell === "order" ? "Sell order" : "Buy order"}>
          {silver(row.price)} <small className="cc-age">{age(now - row.priceAt)}</small>
        </span>
        <span role="cell" data-label="Profit" className="cc-profit">+{silver(row.profit)}</span>
        <span role="cell" data-label="ROI">{Math.round(row.roi)} %</span>
        <span role="cell" data-label="Sold / day">{Math.round(row.sold)}</span>
        <span role="cell" data-label="Profit / day" className="cc-daily">+{short(row.dailyProfit)}</span>
      </button>
      {open ? (
        <div className="cc-detail">
          <div>
            <h4>Buy in {city}</h4>
            <ul>
              {row.materials.map((m) => (
                <li key={m.id}>
                  <span>
                    {m.qty} × {m.name}
                  </span>
                  <b>{silver(m.unit * m.qty)}</b>
                  <small>
                    {silver(m.unit)} each · {age(now - m.at)} old
                  </small>
                </li>
              ))}
              {row.artefact ? (
                <li>
                  <span>1 × {row.artefact.name}</span>
                  <b>{silver(row.artefact.unit)}</b>
                  <small>{age(now - row.artefact.at)} old</small>
                </li>
              ) : null}
            </ul>
          </div>
          <div>
            <h4>One craft</h4>
            <ul>
              <li>
                <span>Return rate</span>
                <b>{(row.returnRate * 100).toFixed(1)} %</b>
              </li>
              <li>
                <span>Station fee</span>
                <b>{silver(row.stationFee)}</b>
              </li>
              <li>
                <span>Cost after returns</span>
                <b>{silver(row.cost)}</b>
              </li>
              <li>
                <span>Tax{sell === "order" ? " and setup fee" : ""}</span>
                <b>{silver(row.fees)}</b>
              </li>
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
