// Focus Planner (premium, hidden until the launch): how to spend a day's focus for the most silver.
// The City Crafter's prices and engine with focus on (core/plan.ts); the page shows the day's plan
// and the crafts with the most silver per focus point.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { assetUrl } from "@shared/assets/assets";
import { useToolAccount } from "@shared/account/useToolAccount";
import { premiumVisible } from "@shared/premium/premium";
import { useRegion } from "@shared/region/useRegion";
import { useSeo } from "@shared/seo/useSeo";
import { loadLive, type LiveStatus } from "@shared/live/liveData";
import { MobileNavBurger, ToolNav, useFestivities, useSessionState } from "../../shared";
import type { BmRecipe } from "../bm-crafter";
import { iconUrl } from "../price-checker/core/items";
import { dailyBook, liveBook, mixBook, type DailyPrices, type PriceBook } from "../city-crafter/core/books";
import { CRAFT_CITIES, type MatFrom, type SellMode } from "../city-crafter/core/cityCraft";
import { Chips, CREST, ENCHANT_COLOR, ENCHANTS, loadDaily, loadRecipes, nowMinute, NumberField, Seg, short, silver, TIERS, type DataMode } from "../city-crafter/kit";
import { focusCandidates, planFocus, type FocusCandidate } from "./core/plan";
import "../bm-crafter/ui/bmCrafter.css";
import "../city-crafter/cityCrafter.css";
import "./focusPlanner.css";

const BUDGETS = [10000, 20000, 30000];
const ALL = "All cities";

export function FocusPlannerPage() {
  const visible = premiumVisible();
  const { pathname } = useLocation();
  const [region, setRegion] = useRegion();
  const { meta, layers } = useToolAccount(pathname, null, region, setRegion);
  const festivities = useFestivities(region);

  const [budget, setBudget] = useSessionState("fp-budget", 10000);
  const [reduction, setReduction] = useSessionState("fp-reduction", 0);
  const [where, setWhere] = useSessionState<string>("fp-city", ALL);
  const [dataMode, setDataMode] = useSessionState<DataMode>("fp-data", "fill");
  const [matFrom, setMatFrom] = useSessionState<MatFrom>("fp-mat-from", "cheapest");
  const [sell, setSell] = useSessionState<SellMode>("fp-sell", "order");
  const [premiumTax, setPremiumTax] = useSessionState("fp-premium-tax", true);
  const [usageFee, setUsageFee] = useSessionState("fp-usage-fee", 1000);
  const [tiers, setTiers] = useSessionState<number[]>("fp-tiers", [4, 5, 6, 7, 8]);
  const [enchants, setEnchants] = useSessionState<number[]>("fp-enchants", [0, 1, 2, 3]);
  const [minSold, setMinSold] = useSessionState("fp-min-sold", 3);

  const [live, setLive] = useState<LiveStatus>({ kind: "loading" });
  const [recipes, setRecipes] = useState<BmRecipe[]>([]);
  const [daily, setDaily] = useState<DailyPrices | null>(null);

  useSeo({
    title: "Focus Planner | Blackmarket Reader",
    description: "Spend your Albion Online focus where it pays most: every craft priced with focus, ranked by silver per focus point.",
    canonical: "https://blackmarketreader.com/focus-planner",
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

  const snap = live.kind === "ok" ? live.snap : null;
  const now = useMemo(() => nowMinute(), [snap]); // eslint-disable-line react-hooks/exhaustive-deps
  const book: PriceBook | null = useMemo(() => {
    if (!snap) return null;
    const liveOnly = liveBook(snap, now);
    if (dataMode === "live") return liveOnly;
    if (!daily) return null;
    return dataMode === "daily" ? dailyBook(daily, snap) : mixBook(liveOnly, dailyBook(daily, snap));
  }, [snap, now, daily, dataMode]);

  const candidates = useMemo(
    () =>
      book && recipes.length
        ? focusCandidates(book, recipes, {
            cities: where === ALL ? CRAFT_CITIES : [where],
            matFrom,
            buy: "instant",
            sell,
            taxRate: premiumTax ? 0.04 : 0.08,
            usageFee,
            tiers,
            enchants,
            bonuses: festivities.craftBonuses,
            reduction: reduction / 100,
            minRoi: 0,
            minSold
          })
        : [],
    [book, recipes, where, matFrom, sell, premiumTax, usageFee, tiers, enchants, festivities.craftBonuses, reduction, minSold]
  );
  const plan = useMemo(() => planFocus(candidates, budget), [candidates, budget]);

  if (!visible) return <Navigate to="/" replace />;

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
          <span className="cc-kicker">✦ Premium · Focus Planner</span>
          <h2>Spend your focus where it pays.</h2>
          <p>
            Every craft priced with focus and ranked by silver per focus point. Tell it how much focus you have: it plans the day, no more
            of an item than its city sells.
          </p>
        </section>

        {live.kind === "guest" || live.kind === "locked" || live.kind === "error" ? (
          <section className="cc-gate">
            {live.kind === "guest" ? (
              <>
                <p>Sign in with Premium to plan your focus on live prices.</p>
                <a className="cc-cta" href={`/login?next=${encodeURIComponent("/focus-planner")}`}>
                  Sign in
                </a>
              </>
            ) : live.kind === "locked" ? (
              <>
                <p>The Focus Planner is part of Premium.</p>
                <a className="cc-cta" href="/premium">
                  Get Premium
                </a>
              </>
            ) : (
              <p>{live.message}</p>
            )}
          </section>
        ) : !book || !recipes.length ? (
          <p className="cc-note">Loading the market…</p>
        ) : (
          <>
            <section className="cc-filters" aria-label="Your focus">
              <div className="cc-field">
                <span>Focus to spend</span>
                <div className="fp-budget">
                  <input inputMode="numeric" value={String(budget)} onChange={(e) => setBudget(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))} />
                  <div className="cc-seg" role="group" aria-label="Focus presets">
                    {BUDGETS.map((b) => (
                      <button key={b} type="button" className={budget === b ? "is-on" : ""} aria-pressed={budget === b} onClick={() => setBudget(b)}>
                        {b / 1000}k
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <NumberField label="Specs save %" value={reduction} onChange={(v) => setReduction(Math.min(90, v))} hint="focus cost reduction from your specs" />
              <div className="cc-field">
                <span>Craft in</span>
                <select className="fp-select" value={where} onChange={(e) => setWhere(e.target.value)}>
                  <option>{ALL}</option>
                  {CRAFT_CITIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <Seg label="Prices" value={dataMode} onChange={setDataMode} options={[["live", "Live"], ["fill", "Live + daily"], ["daily", "Daily"]]} />
              <Seg label="Materials from" value={matFrom} onChange={setMatFrom} options={[["cheapest", "Cheapest city"], ["city", "Crafting city"]]} />
              <Seg label="Sell" value={sell} onChange={setSell} options={[["order", "Sell order"], ["instant", "Instant sell"]]} />
              <Seg label="Tax" value={premiumTax ? "4" : "8"} onChange={(v) => setPremiumTax(v === "4")} options={[["4", "4 %"], ["8", "8 %"]]} />
              <Chips label="Tier" all={TIERS} on={tiers} set={setTiers} text={(t) => `T${t}`} />
              <Chips label="Enchant" all={ENCHANTS} on={enchants} set={setEnchants} text={(e) => `.${e}`} />
              <NumberField label="Station fee" value={usageFee} onChange={setUsageFee} hint="per 100 nutrition" />
              <NumberField label="Sold / day ≥" value={minSold} onChange={setMinSold} />
            </section>

            <section className="fp-sum" aria-label="Your day">
              <div>
                <span>Your {silver(budget)} focus</span>
                <strong>+{silver(plan.total)}</strong>
                <small>silver profit today</small>
              </div>
              <div>
                <span>Crafts</span>
                <strong>{plan.lines.reduce((n, l) => n + l.crafts, 0)}</strong>
                <small>in {plan.lines.length} lines</small>
              </div>
              <div>
                <span>Focus used</span>
                <strong>{silver(plan.used)}</strong>
                <small>{silver(plan.left)} left</small>
              </div>
              <div>
                <span>Per focus point</span>
                <strong>{plan.used > 0 ? (plan.total / plan.used).toFixed(1) : "–"}</strong>
                <small>silver on average</small>
              </div>
            </section>

            <section className="cc-results" aria-label="The plan">
              <div className="cc-results-head">
                <h3>Today's plan</h3>
              </div>
              <PlanTable lines={plan.lines} showPlan />
              {!plan.lines.length ? <p className="cc-note">Nothing fits: more focus, more tiers or a lower sold-per-day floor.</p> : null}
            </section>

            <section className="cc-results" aria-label="Best silver per focus">
              <div className="cc-results-head">
                <h3>Most silver per focus point</h3>
              </div>
              <PlanTable lines={candidates.slice(0, 25)} />
              <p className="cc-fine">
                Focus cost: the base cost of the recipe without specs, lowered by "Specs save %". Each craft is sold in the city where it is
                made; a line takes at most what that city sells of the item a day. Return rate with focus, the city bonus and today's
                crafting bonus.
              </p>
            </section>
          </>
        )}
      </main>
      {layers}
    </div>
  );
}

type Line = FocusCandidate & { crafts?: number; focusUsed?: number; total?: number };

function PlanTable({ lines, showPlan = false }: { lines: Line[]; showPlan?: boolean }) {
  return (
    <div className="cc-table fp-table" role="table">
      <div className={`cc-row cc-row-head fp-row${showPlan ? " is-plan" : ""}`} role="row">
        <span role="columnheader">Item</span>
        <span role="columnheader">City</span>
        {showPlan ? <span role="columnheader">Crafts</span> : null}
        <span role="columnheader">Focus / craft</span>
        <span role="columnheader">Profit / craft</span>
        <span role="columnheader">Silver / focus</span>
        {showPlan ? <span role="columnheader">Profit</span> : <span role="columnheader">Sold / day</span>}
      </div>
      {lines.map((l) => (
        <div key={`${l.row.id}-${l.city}`} className="cc-item" role="rowgroup">
          <div className={`cc-row fp-row${showPlan ? " is-plan" : ""}`} role="row">
            <span className="cc-name" role="cell">
              <img src={iconUrl(l.row.id)} alt="" width={40} height={40} loading="lazy" />
              <span>
                <b>{l.row.name}</b>
                <span className="cc-chips">
                  <i className="cc-chip" style={{ "--chip": ENCHANT_COLOR[l.row.enchant] } as CSSProperties}>
                    T{l.row.tier}.{l.row.enchant}
                  </i>
                  {l.row.bonusCity ? <i className="cc-chip is-gold">★ City bonus</i> : null}
                  {l.row.dailyBonus ? <i className="cc-chip is-green">+{l.row.dailyBonus}% today</i> : null}
                </span>
              </span>
            </span>
            <span role="cell" data-label="City" className="fp-city">
              {CREST[l.city] ? <img src={assetUrl(CREST[l.city])} alt="" width={18} height={18} /> : null}
              {l.city}
            </span>
            {showPlan ? (
              <span role="cell" data-label="Crafts" className="fp-crafts">
                × {l.crafts}
              </span>
            ) : null}
            <span role="cell" data-label="Focus / craft">{silver(l.focus)}</span>
            <span role="cell" data-label="Profit / craft" className="cc-profit">+{silver(l.row.profit)}</span>
            <span role="cell" data-label="Silver / focus" className="cc-daily">{l.perFocus.toFixed(1)}</span>
            {showPlan ? (
              <span role="cell" data-label="Profit" className="cc-daily">+{short(l.total ?? 0)}</span>
            ) : (
              <span role="cell" data-label="Sold / day">{Math.round(l.row.sold)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
