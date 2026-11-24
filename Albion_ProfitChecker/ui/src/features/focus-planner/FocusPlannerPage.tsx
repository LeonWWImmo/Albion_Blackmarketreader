// Focus Planner (premium, hidden until the launch): how to spend a day's focus for the most silver.
// The City Crafter's prices and engine with focus on (core/plan.ts), the player's specs from the
// Crafting Calculator (same storage and account sync), and the competition on each craft's market
// from the market depth (core/competition.ts).
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { assetUrl } from "@shared/assets/assets";
import { useToolAccount } from "@shared/account/useToolAccount";
import { createAuthService, type AuthService } from "@shared/auth/authService";
import { isGuest } from "@shared/auth/guestMode";
import { premiumVisible } from "@shared/premium/premium";
import { useRegion } from "@shared/region/useRegion";
import { useSeo } from "@shared/seo/useSeo";
import { loadLive, type LiveStatus } from "@shared/live/liveData";
import { depthAt, loadDepth, type Depth, type DepthSnapshot } from "@shared/live/depthData";
import { MobileNavBurger, ToolNav, useFestivities, useSessionState } from "../../shared";
import type { BmRecipe } from "../bm-crafter";
import { iconUrl } from "../price-checker/core/items";
import { dailyBook, liveBook, mixBook, type DailyPrices, type PriceBook } from "../city-crafter/core/books";
import { CRAFT_CITIES, type MatFrom, type SellMode } from "../city-crafter/core/cityCraft";
import { CraftDetail } from "../city-crafter/CraftDetail";
import { age, Chips, CREST, ENCHANT_COLOR, ENCHANTS, loadDaily, loadRecipes, nowMinute, NumberField, Seg, short, silver, TIERS, type DataMode } from "../city-crafter/kit";
import { computeFocusEfficiency, resolveSpecKey } from "../crafting-calculator/specs/data";
import { SpecsModal } from "../crafting-calculator/specs/SpecsModal";
import { useCraftingSpecs } from "../crafting-calculator/specs/useCraftingSpecs";
import { competitionOf, CROWDED_DAYS, type Competition } from "./core/competition";
import { focusCandidates, planFocus, type FocusCandidate } from "./core/plan";
import "../bm-crafter/ui/bmCrafter.css";
import "../city-crafter/cityCrafter.css";
import "./focusPlanner.css";

const BUDGETS = [10000, 20000, 30000];
const MORE = 25;
const ALL = "All cities";

type Line = FocusCandidate & { crafts?: number; total?: number; competition: Competition | null; depth: Depth | null };

export function FocusPlannerPage() {
  const visible = premiumVisible();
  const { pathname } = useLocation();
  const [region, setRegion] = useRegion();
  const { meta, layers } = useToolAccount(pathname, null, region, setRegion);
  const festivities = useFestivities(region);

  const [budget, setBudget] = useSessionState("fp-budget", 10000);
  const [where, setWhere] = useSessionState<string>("fp-city", ALL);
  const [dataMode, setDataMode] = useSessionState<DataMode>("fp-data", "fill");
  const [matFrom, setMatFrom] = useSessionState<MatFrom>("fp-mat-from", "cheapest");
  const [sell, setSell] = useSessionState<SellMode>("fp-sell", "order");
  const [premiumTax, setPremiumTax] = useSessionState("fp-premium-tax", true);
  const [usageFee, setUsageFee] = useSessionState("fp-usage-fee", 1000);
  const [tiers, setTiers] = useSessionState<number[]>("fp-tiers", [4, 5, 6, 7, 8]);
  const [enchants, setEnchants] = useSessionState<number[]>("fp-enchants", [0, 1, 2, 3]);
  const [minSold, setMinSold] = useSessionState("fp-min-sold-v2", 1);
  const [hideCrowded, setHideCrowded] = useSessionState("fp-hide-crowded", false);
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(MORE);
  const [showSpecs, setShowSpecs] = useState(false);

  const [live, setLive] = useState<LiveStatus>({ kind: "loading" });
  const [recipes, setRecipes] = useState<BmRecipe[]>([]);
  const [daily, setDaily] = useState<DailyPrices | null>(null);
  const [depth, setDepth] = useState<DepthSnapshot | null>(null);

  // the specs of the Crafting Calculator: same browser storage and the same account sync
  const [authService, setAuthService] = useState<AuthService | null>(null);
  useEffect(() => {
    const cfg = window.env;
    if (cfg?.SUPABASE_URL && cfg?.SUPABASE_ANON_KEY) setAuthService(createAuthService({ supabaseUrl: cfg.SUPABASE_URL, supabaseAnonKey: cfg.SUPABASE_ANON_KEY }));
  }, []);
  const specs = useCraftingSpecs({ authService, enabled: Boolean(authService) && !isGuest() });
  const specItems = useMemo(() => recipes.map((r) => ({ id: r.itemId, name: r.name, categoryKey: r.categoryKey })), [recipes]);
  const specsSet = Object.values(specs.progress.specs).filter((n) => n > 0).length + Object.values(specs.progress.masteries).filter((n) => n > 0).length;

  useSeo({
    title: "Focus Planner | Blackmarket Reader",
    description: "Spend your Albion Online focus where it pays most: every craft priced with focus and your specs, ranked by silver per focus point.",
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
    void loadDepth(region).then((status) => alive && setDepth(status.kind === "ok" ? status.snap : null));
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

  const candidates: Line[] = useMemo(() => {
    if (!book || !recipes.length) return [];
    const list = focusCandidates(book, recipes, {
      cities: where === ALL ? CRAFT_CITIES : [where],
      matFrom,
      buy: "instant",
      sell,
      taxRate: premiumTax ? 0.04 : 0.08,
      usageFee,
      tiers,
      enchants,
      bonuses: festivities.craftBonuses,
      efficiencyOf: (baseId, categoryKey) => computeFocusEfficiency(specs.progress, resolveSpecKey({ id: baseId }), { id: baseId, categoryKey }, specItems),
      minRoi: 0,
      minSold
    });
    return list
      .map((c) => {
        const d = depthAt(depth, c.row.id, c.city);
        return { ...c, depth: d, competition: competitionOf(d, c.row.sale.unit, c.row.sold) };
      })
      .filter((c) => !hideCrowded || !c.competition?.crowded);
  }, [book, recipes, where, matFrom, sell, premiumTax, usageFee, tiers, enchants, festivities.craftBonuses, specs.progress, specItems, minSold, depth, hideCrowded]);
  const plan = useMemo(() => planFocus(candidates, budget), [candidates, budget]);

  if (!visible) return <Navigate to="/" replace />;

  const crafts = plan.lines.reduce((n, l) => n + l.crafts, 0);
  const rest = useMemo(() => candidates.filter((c) => !plan.lines.some((l) => l.row.id === c.row.id && l.city === c.city)), [candidates, plan]);

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
        {live.kind === "guest" || live.kind === "locked" || live.kind === "error" ? (
          <section className="cc-gate">
            <span className="cc-kicker">✦ Focus Planner</span>
            {live.kind === "guest" ? (
              <>
                <p>Sign in with Premium to plan your focus.</p>
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
            <section className="fp-hero" aria-label="Your day">
              <span className="cc-kicker">✦ Focus Planner</span>
              <p className="fp-hero-line">
                <span className="fp-focus">
                  <input
                    aria-label="Focus to spend"
                    inputMode="numeric"
                    value={silver(budget)}
                    onChange={(e) => setBudget(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))}
                  />
                  focus
                </span>
                <i aria-hidden="true">→</i>
                <strong>+{silver(plan.total)}</strong>
                <span className="fp-unit">silver today</span>
              </p>
              <div className="fp-hero-chips">
                <div className="cc-seg" role="group" aria-label="Focus presets">
                  {BUDGETS.map((b) => (
                    <button key={b} type="button" className={budget === b ? "is-on" : ""} aria-pressed={budget === b} onClick={() => setBudget(b)}>
                      {b / 1000}k
                    </button>
                  ))}
                </div>
                <span>
                  <b>{crafts}</b> crafts
                </span>
                <span>
                  <b>{plan.used > 0 ? (plan.total / plan.used).toFixed(1) : "–"}</b> silver / focus
                </span>
                <button type="button" className={`fp-specs${specsSet ? " is-set" : ""}`} onClick={() => setShowSpecs(true)}>
                  {specsSet ? `✓ Specs (${specsSet})` : "Add your specs"}
                </button>
              </div>
            </section>

            <section className="cc-filters fp-filters" aria-label="Settings">
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
              <Seg label="Materials" value={matFrom} onChange={setMatFrom} options={[["cheapest", "Cheapest city"], ["city", "Crafting city"]]} />
              <Seg label="Sell" value={sell} onChange={setSell} options={[["order", "Sell order"], ["instant", "Instant"]]} />
              <Seg label="Competition" value={hideCrowded ? "hide" : "all"} onChange={(v) => setHideCrowded(v === "hide")} options={[["all", "Show all"], ["hide", "Hide crowded"]]} />
              <Chips label="Tier" all={TIERS} on={tiers} set={setTiers} text={(t) => `T${t}`} />
              <Chips label="Enchant" all={ENCHANTS} on={enchants} set={setEnchants} text={(e) => `.${e}`} />
              <Seg label="Tax" value={premiumTax ? "4" : "8"} onChange={(v) => setPremiumTax(v === "4")} options={[["4", "4 %"], ["8", "8 %"]]} />
              <NumberField label="Station fee" value={usageFee} onChange={setUsageFee} hint="silver per 100 nutrition" />
              <NumberField label="Sold / day ≥" value={minSold} onChange={setMinSold} />
            </section>

            <section className="cc-results" aria-label="Today's plan">
              <PlanTable lines={plan.lines} plan open={open} setOpen={setOpen} sell={sell} now={now} usageFee={usageFee} depthAt={depth?.depthAt ?? null} />
              {!plan.lines.length ? <p className="cc-note">Nothing fits: more focus, more tiers or a lower sold-per-day floor.</p> : null}
            </section>

            <section className="cc-results" aria-label="More crafts">
              <h3 className="fp-sub">
                Next best per focus point <b>· {rest.length} more pay</b>
              </h3>
              <PlanTable lines={rest.slice(0, shown)} open={open} setOpen={setOpen} sell={sell} now={now} usageFee={usageFee} depthAt={depth?.depthAt ?? null} />
              {rest.length > shown ? (
                <button type="button" className="cc-more" onClick={() => setShown(shown + MORE)}>
                  Show more ({rest.length - shown})
                </button>
              ) : null}
              <p className="cc-fine">
                Focus with your specs from the Crafting Calculator. Competition: pieces listed at or below the price, checked twice a day; crowded
                = more than {CROWDED_DAYS} days of sales.
              </p>
            </section>
          </>
        )}
      </main>
      <SpecsModal
        open={showSpecs}
        progress={specs.progress}
        items={specItems}
        pendingSync={specs.pendingSync}
        readOnly={isGuest()}
        onChange={specs.setSpecLevel}
        onMasteryChange={specs.setMasteryLevel}
        onReset={specs.resetAll}
        onClose={() => setShowSpecs(false)}
      />
      {layers}
    </div>
  );
}

type TableProps = {
  lines: Line[];
  plan?: boolean;
  open: string | null;
  setOpen: (key: string | null) => void;
  sell: SellMode;
  now: number;
  usageFee: number;
  depthAt: string | null;
};

function PlanTable({ lines, plan = false, open, setOpen, sell, now, usageFee, depthAt }: TableProps) {
  return (
    <div className="cc-table" role="table">
      <div className={`cc-row cc-row-head fp-row${plan ? " is-plan" : ""}`} role="row">
        <span role="columnheader">{plan ? "Today's plan" : "Item"}</span>
        <span role="columnheader">City</span>
        {plan ? <span role="columnheader">Crafts</span> : null}
        <span role="columnheader">Focus</span>
        <span role="columnheader">Profit</span>
        <span role="columnheader">Silver / focus</span>
        <span role="columnheader">Competition</span>
        {plan ? <span role="columnheader">Total</span> : null}
      </div>
      {lines.map((l) => {
        const key = `${plan ? "p" : "c"}-${l.row.id}-${l.city}`;
        const isOpen = open === key;
        return (
          <div key={key} className={`cc-item${isOpen ? " is-open" : ""}`} role="rowgroup">
            <button type="button" className={`cc-row fp-row${plan ? " is-plan" : ""}`} role="row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)}>
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
              {plan ? (
                <span role="cell" data-label="Crafts" className="fp-crafts">
                  × {l.crafts}
                </span>
              ) : null}
              <span role="cell" data-label="Focus">{silver(l.focus)}</span>
              <span role="cell" data-label="Profit" className="cc-profit">+{silver(l.row.profit)}</span>
              <span role="cell" data-label="Silver / focus" className="cc-daily">{l.perFocus.toFixed(1)}</span>
              <span role="cell" data-label="Competition" className={`fp-comp${l.competition ? (l.competition.crowded ? " is-crowded" : " is-open") : ""}`}>
                {l.competition ? (
                  <>
                    {l.competition.ahead} listed
                    <small>{l.competition.days === null ? "no sales" : `${l.competition.days.toFixed(1)} days`}</small>
                  </>
                ) : (
                  <>
                    –<small>not seen</small>
                  </>
                )}
              </span>
              {plan ? (
                <span role="cell" data-label="Total" className="cc-daily">
                  +{short(l.total ?? 0)}
                </span>
              ) : null}
            </button>
            {isOpen ? (
              <CraftDetail
                row={l.row}
                city={l.city}
                sell={sell}
                now={now}
                usageFee={usageFee}
                focus={{ perCraft: l.focus, perFocus: l.perFocus, efficiency: l.efficiency }}
                extra={<MarketPanel line={l} now={now} depthAt={depthAt} />}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** The competition on one craft's market: what is listed (cheapest first) and what buy orders want. */
function MarketPanel({ line, now, depthAt }: { line: Line; now: number; depthAt: string | null }) {
  const { depth, competition: c } = line;
  if (!depth) {
    return (
      <div className="fp-market">
        <h4>Market in {line.city}</h4>
        <p className="cc-note">
          {depthAt ? "Nobody opened this item there during the last check (twice a day)." : "The competition check has not run yet (twice a day)."}
        </p>
      </div>
    );
  }
  const most = Math.max(1, ...depth.sell.slice(0, 6).map(([, a]) => a));
  return (
    <div className="fp-market">
      <h4>
        Market in {line.city} <small>seen {age(now - depth.seen)} ago</small>
      </h4>
      <div className="fp-market-chips">
        <span>
          <b>{c?.ahead ?? 0}</b> listed at or below {silver(line.row.sale.unit)}
        </span>
        <span>
          <b>{depth.sellTotal}</b> listed in all
        </span>
        <span>
          <b>{depth.buyTotal}</b> wanted by buy orders
        </span>
        <span className={c?.crowded ? "is-crowded" : "is-open"}>
          <b>{c?.days === null || c?.days === undefined ? "–" : c.days.toFixed(1)}</b> days of sales ahead of you
        </span>
      </div>
      <div className="fp-ladder">
        {depth.sell.slice(0, 6).map(([price, amount]) => (
          <div key={price} className={price <= line.row.sale.unit ? "is-ahead" : ""}>
            <span>{silver(price)}</span>
            <i style={{ "--w": `${(amount / most) * 100}%` } as CSSProperties} />
            <b>{amount}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
