import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { shortPrice } from "../../price-checker/ui/format";
import { loadNames } from "../../loot-split/core/market";
import {
  GuildApiError,
  fetchRegearFights,
  fetchRegearPaid,
  fightPath,
  guildPath,
  itemIcon,
  setRegearFight,
  setRegearPaid,
  type AttendanceFight,
  type BattleReport,
  type GearSlot,
  type GuildPageData,
  type KillEvent,
  type MarkedFight,
  type PricedItem
} from "../api";
import { cachedBattle, cachedFights, loadBattle, loadFights } from "../core/guildData";
import { areaLabel, itemName, tierOf, timeAgo } from "../core/view";
import type { MyGuild } from "../useMyGuild";
import { CopyButton } from "./CopyButton";
import { Loading } from "./Loading";

/** The gear a death costs, in the order of Albion's kill screen. */
const SLOTS: { key: GearSlot; label: string }[] = [
  { key: "MainHand", label: "Weapon" },
  { key: "OffHand", label: "Off-hand" },
  { key: "Head", label: "Head" },
  { key: "Armor", label: "Armor" },
  { key: "Shoes", label: "Shoes" },
  { key: "Cape", label: "Cape" },
  { key: "Bag", label: "Bag" },
  { key: "Mount", label: "Mount" },
  { key: "Potion", label: "Potion" },
  { key: "Food", label: "Food" }
];
const QUALITY = ["", "Normal", "Good", "Outstanding", "Excellent", "Masterpiece"];

const gearOf = (e: KillEvent) => SLOTS.flatMap(({ key, label }) => (e.victim.gear[key] ? [{ label, item: e.victim.gear[key] as PricedItem }] : []));

/** Item id -> English name, for the gear lists (the names file maps name -> id). */
function useItemNames(): Map<string, string> | null {
  const [names, setNames] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    let alive = true;
    loadNames()
      .then((byName) => alive && setNames(new Map(Object.entries(byName).map(([name, id]) => [id, name]))))
      // without names the gear shows by its id
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return names;
}

/** Every piece of gear of the open deaths, summed per item: what to buy for the regear. */
function shoppingList(deaths: KillEvent[]): { type: string; count: number; value: number }[] {
  const byType = new Map<string, { type: string; count: number; value: number }>();
  for (const e of deaths) {
    for (const { item } of gearOf(e)) {
      const row = byType.get(item.type) ?? { type: item.type, count: 0, value: 0 };
      row.count += item.count;
      row.value += item.value;
      byType.set(item.type, row);
    }
  }
  return [...byType.values()].sort((a, b) => b.value - a.value || b.count - a.count);
}

const MIN_IP = [0, 1100, 1200, 1300, 1400];
/** Fight sizes, all players of both sides: a big fight (ZvZ, castle) is where a guild regears. */
const SIZES = [
  { min: 0, label: "All fights" },
  { min: 10, label: "10+ players" },
  { min: 20, label: "20+ players" },
  { min: 50, label: "50+ players" },
  { min: 100, label: "100+ players" }
];
/** The "marked fights" chip: the fights the player marked to regear, of any age. */
const MARKED = -1;
const FIGHTS_SHOWN = 12;
const HELPERS_SHOWN = 6;

/** A fight to pick, from the guild page (the latest few) or the fights of the last 7 days. */
type PickFight = { id: number; startTime: string; players: number; ours: number; kills: number; deaths: number; enemy?: string | null };

const pickOf = (f: AttendanceFight): PickFight => ({
  id: f.id,
  startTime: f.startTime,
  players: f.players,
  ours: f.ours.length,
  kills: f.ours.reduce((t, p) => t + p.kills, 0),
  deaths: f.ours.reduce((t, p) => t + p.deaths, 0),
  enemy: f.enemy
});

/**
 * The fights the signed-in player marked to regear in this guild, kept in their account: the officer
 * who runs the regear finds the fight again later, also after the 7 days of the fight list.
 */
function useMarkedFights(token: string | null, region: GuildPageData["guild"]["region"], guildId: string) {
  const [marked, setMarked] = useState<MarkedFight[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setMarked([]);
    if (!token) return;
    let alive = true;
    fetchRegearFights(token, region, guildId)
      .then((list) => alive && setMarked(list))
      .catch((err: unknown) => alive && setError(err instanceof GuildApiError ? err.message : "Your marked fights could not load."));
    return () => {
      alive = false;
    };
  }, [token, region, guildId]);

  /** Marks or unmarks a fight: shown at once, put back when it could not be saved. */
  const toggle = (fight: PickFight) => {
    if (!token) return;
    const on = !marked.some((m) => m.id === fight.id);
    const info = { id: fight.id, startTime: fight.startTime, players: fight.players, ours: fight.ours, kills: fight.kills, deaths: fight.deaths, enemy: fight.enemy ?? null };
    setMarked(on ? [{ ...info, markedAt: new Date().toISOString() }, ...marked] : marked.filter((m) => m.id !== fight.id));
    setError("");
    setRegearFight(token, region, guildId, info, on).catch((err: unknown) => {
      // only this fight goes back: another one marked meanwhile stays
      setMarked((list) => (on ? list.filter((m) => m.id !== fight.id) : [{ ...info, markedAt: new Date().toISOString() }, ...list]));
      setError(err instanceof GuildApiError ? err.message : "The fight could not be marked. Try again.");
    });
  };
  return { marked, toggle, error };
}

/** What our dead lost in one fight, as a regear list: gear value per death, details, paid ticks and lists to copy. */
export function RegearTab({ data, mine }: { data: GuildPageData; mine: MyGuild }) {
  const { guild } = data;
  const { pathname } = useLocation();
  const { marked, toggle: toggleMark, error: markError } = useMarkedFights(mine.token, guild.region, guild.id);
  // the latest fights come with the page; the fights of 7 days load behind them
  const [week, setWeek] = useState(() => cachedFights(guild.region, guild.id));
  const [weekError, setWeekError] = useState(false);
  const [min, setMin] = useState(0);
  const [count, setCount] = useState(FIGHTS_SHOWN);
  const [battleId, setBattleId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    loadFights(guild.region, guild.id)
      .then((next) => alive && setWeek(next))
      .catch(() => alive && setWeekError(true));
    return () => {
      alive = false;
    };
  }, [guild.region, guild.id]);

  const all: PickFight[] = week ? week.fights.map(pickOf) : data.fights;
  const markedIds = new Set(marked.map((m) => m.id));
  // marked fights newest first; one still in the list shows its fresh numbers
  const markedFights: PickFight[] = marked.map((m) => all.find((f) => f.id === m.id) ?? m).sort((a, b) => b.startTime.localeCompare(a.startTime));
  const fights = min === MARKED ? markedFights : all.filter((f) => f.deaths > 0 && f.players >= min);
  // a size that hides the picked fight shows the newest one left
  const chosen = battleId !== null && fights.some((f) => f.id === battleId) ? battleId : (fights[0]?.id ?? null);

  return (
    <>
      <section className="gd-card">
        <div className="gd-list-head">
          <h2>Pick a fight</h2>
          <span className="gd-muted">
            {week ? `fights with deaths of ${guild.name}, last ${week.days} days` : weekError ? "the guild's latest fights with deaths" : "the latest fights; the last 7 days are loading…"}
          </span>
        </div>
        <div className="gd-list-head gd-list-tools">
          <div className="gd-chips" role="group" aria-label="Fight size">
            {[...SIZES, { min: MARKED, label: `★ Marked (${marked.length})` }].map((s) => (
              <button
                key={s.min}
                type="button"
                className={`gd-chip${min === s.min ? " is-on" : ""}${s.min === MARKED ? " is-marked" : ""}`}
                aria-pressed={min === s.min}
                onClick={() => {
                  setMin(s.min);
                  setCount(FIGHTS_SHOWN);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {markError ? (
          <p className="gd-error" role="alert">
            {markError}
          </p>
        ) : null}
        <div className="gd-fight-pick" role="group" aria-label="Fight">
          {fights.slice(0, count).map((f) => (
            <button key={f.id} type="button" className={`gd-fight-chip${f.id === chosen ? " is-on" : ""}`} aria-pressed={f.id === chosen} onClick={() => setBattleId(f.id)}>
              <b>
                {markedIds.has(f.id) ? (
                  <span className="gd-fight-star" title="Marked to regear">
                    ★{" "}
                  </span>
                ) : null}
                {timeAgo(f.startTime, new Date())} · {new Date(f.startTime).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
              </b>
              {f.enemy ? <small className="gd-fight-enemy">vs {f.enemy}</small> : null}
              <small>
                <span className="is-green">
                  {f.kills} {f.kills === 1 ? "kill" : "kills"}
                </span>{" "}
                · <span className="is-red">{f.deaths} {f.deaths === 1 ? "death" : "deaths"}</span>
              </small>
              <small>
                {f.ours} of us · {f.players} players in all
              </small>
            </button>
          ))}
          {fights.length > count ? (
            <button type="button" className="gd-btn" onClick={() => setCount((c) => c + FIGHTS_SHOWN)}>
              Show more ({fights.length - count})
            </button>
          ) : null}
          {!fights.length ? (
            <p className="gd-empty">
              {min === MARKED ? (
                mine.token ? (
                  "No marked fight yet. Pick a fight and press Mark this fight: it stays here, also after the 7 days."
                ) : (
                  <>
                    <Link to={`/login?next=${encodeURIComponent(pathname)}`}>Sign in</Link> to mark fights to regear: they are saved to your account.
                  </>
                )
              ) : all.some((f) => f.deaths > 0) ? (
                "No fight of this size with deaths. Pick a smaller size."
              ) : (
                <>
                  No listed fight with deaths of {guild.name} lately. Albion lists the bigger fights only; single deaths are on the{" "}
                  <Link to={guildPath(guild, "killboard")}>killboard</Link>.
                </>
              )}
            </p>
          ) : null}
        </div>
      </section>
      {chosen ? (
        <RegearList
          key={chosen}
          data={data}
          battleId={chosen}
          mine={mine}
          isMarked={markedIds.has(chosen)}
          onMark={() => {
            const fight = fights.find((f) => f.id === chosen);
            if (fight) toggleMark(fight);
          }}
        />
      ) : null}
    </>
  );
}

/** The kind of place most kills of the fight were in (open world, hellgate, …): Albion names no zone. */
function mainArea(kills: KillEvent[]): string | null {
  const counts = new Map<string, number>();
  for (const e of kills) if (e.area) counts.set(e.area, (counts.get(e.area) ?? 0) + 1);
  let best: string | null = null;
  for (const [area, n] of counts) if (!best || n > (counts.get(best) ?? 0)) best = area;
  return best;
}

/** The deaths ticked as paid, kept in the signed-in player's account; nobody else sees them. */
function usePaid(token: string | null, region: GuildPageData["guild"]["region"], battleId: number) {
  const [paid, setPaid] = useState<Set<number> | null>(token ? null : new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setPaid(new Set());
      return;
    }
    let alive = true;
    setPaid(null);
    fetchRegearPaid(token, region, battleId)
      .then((ids) => alive && setPaid(new Set(ids)))
      .catch((err: unknown) => {
        if (!alive) return;
        setPaid(new Set());
        setError(err instanceof GuildApiError ? err.message : "Your paid ticks could not load.");
      });
    return () => {
      alive = false;
    };
  }, [token, region, battleId]);

  const toggle = (id: number) => {
    if (!token || !paid) return;
    const on = !paid.has(id);
    const flip = (set: Set<number>, add: boolean) => {
      const next = new Set(set);
      if (add) next.add(id);
      else next.delete(id);
      return next;
    };
    setPaid((set) => (set ? flip(set, on) : set));
    setError("");
    setRegearPaid(token, region, battleId, id, on).catch((err: unknown) => {
      // not saved: the tick goes back
      setPaid((set) => (set ? flip(set, !on) : set));
      setError(err instanceof GuildApiError ? err.message : "The tick could not be saved. Try again.");
    });
  };
  return { paid, toggle, error };
}

function RegearList({ data, battleId, mine, isMarked, onMark }: { data: GuildPageData; battleId: number; mine: MyGuild; isMarked: boolean; onMark: () => void }) {
  const { guild } = data;
  const { pathname } = useLocation();
  const [report, setReport] = useState<BattleReport | null>(() => cachedBattle(guild.region, battleId));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [minIp, setMinIp] = useState(0);
  const [withBag, setWithBag] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const names = useItemNames();
  const { paid, toggle, error: paidError } = usePaid(mine.token, guild.region, battleId);

  useEffect(() => {
    let alive = true;
    setError("");
    loadBattle(guild.region, battleId)
      .then((next) => alive && setReport(next))
      .catch((err: unknown) => alive && setError(err instanceof GuildApiError ? err.message : "The fight could not load."));
    return () => {
      alive = false;
    };
  }, [guild.region, battleId, version]);

  const cost = (e: KillEvent) => e.victim.gearValue + (withBag ? e.victim.inventoryValue : 0);
  const deaths = useMemo(
    () =>
      (report?.kills ?? [])
        .filter((e) => e.victim.guildId === guild.id && e.victim.itemPower >= minIp)
        .sort((a, b) => a.victim.name.localeCompare(b.victim.name) || a.time.localeCompare(b.time)),
    [report, guild.id, minIp]
  );

  if (!report) {
    return error ? (
      <p className="gd-error" role="alert">
        {error}{" "}
        <button type="button" className="gd-btn" onClick={() => setVersion((v) => v + 1)}>
          Try again
        </button>
      </p>
    ) : (
      <Loading what="Loading the deaths of this fight, with what the gear was worth" />
    );
  }

  const ticked = paid ?? new Set<number>();
  const signedIn = Boolean(mine.token);
  const unpaid = deaths.filter((e) => !ticked.has(e.id));
  const total = deaths.reduce((t, e) => t + cost(e), 0);
  const owed = unpaid.reduce((t, e) => t + cost(e), 0);
  // player, silver, then the gear to hand out: what an officer pastes into the regear channel
  const copyText = unpaid.map((e) => `${e.victim.name}\t${Math.round(cost(e))}\t${gearOf(e).map(({ item }) => itemName(item.type, names)).join(", ")}`).join("\n");
  const shopping = shoppingList(unpaid);
  const shoppingText = shopping.map((s) => `${s.count}x ${itemName(s.type, names)}`).join("\n");

  return (
    <>
      <section className={`gd-card gd-regear-fight${isMarked ? " is-marked" : ""}`}>
        <span>
          <b>
            {isMarked ? "★ " : ""}
            {new Date(report.battle.startTime).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </b>
          <small>
            {isMarked
              ? "Marked to regear: it stays under ★ Marked, also after the 7 days."
              : signedIn
                ? "Mark the fight to find its regear again under ★ Marked, also after the 7 days."
                : "Sign in to mark the fight and keep its regear in your account."}
          </small>
        </span>
        {signedIn ? (
          <button type="button" className={`gd-btn${isMarked ? "" : " is-primary"}`} aria-pressed={isMarked} onClick={onMark}>
            {isMarked ? "Unmark fight" : "☆ Mark this fight"}
          </button>
        ) : (
          <Link className="gd-btn" to={`/login?next=${encodeURIComponent(pathname)}`}>
            Sign in to mark
          </Link>
        )}
      </section>

      <section className="gd-stats">
        <div className="gd-card gd-stat">
          <small>DEATHS</small>
          <b className="is-red">{deaths.length}</b>
          <span>of {guild.name} in this fight</span>
        </div>
        <div className="gd-card gd-stat">
          <small>REGEAR TOTAL</small>
          <b className="is-gold">{report.priced ? shortPrice(total) : "–"}</b>
          <span>{withBag ? "gear and bags" : "gear only"}</span>
        </div>
        <div className="gd-card gd-stat">
          <small>STILL TO PAY</small>
          <b>{report.priced ? shortPrice(owed) : "–"}</b>
          <span>{signedIn ? `${unpaid.length} not ticked yet` : "sign in to tick paid"}</span>
        </div>
        <div className="gd-card gd-stat">
          <small>WHERE</small>
          <b className="gd-stat-text">{areaLabel(mainArea(report.kills))}</b>
          <span>
            {report.battle.players} players · <Link to={fightPath(guild, report.battle.id)}>Battle report →</Link>
          </span>
        </div>
      </section>

      <section className="gd-card gd-regear">
        <div className="gd-list-head">
          <h2>Regear list</h2>
          {unpaid.length ? <CopyButton text={copyText} label="Copy open list" count={unpaid.length} /> : null}
        </div>
        <div className="gd-list-head gd-list-tools">
          <select className="gd-select" value={minIp} onChange={(e) => setMinIp(Number(e.target.value))} aria-label="Lowest item power">
            {MIN_IP.map((ip) => (
              <option key={ip} value={ip}>
                {ip ? `IP ${ip}+` : "Any IP"}
              </option>
            ))}
          </select>
          <label className="gd-check">
            <input type="checkbox" checked={withBag} onChange={(e) => setWithBag(e.target.checked)} />
            Count the bag too
          </label>
          <span className="gd-muted">Click a row for the details.</span>
        </div>
        <div className="gd-row is-head">
          <span>PLAYER</span>
          <span className="gd-num">IP</span>
          <span className="gd-num gd-col-mid">KILLED BY</span>
          <span className="gd-num">REGEAR</span>
          <span className="gd-num">PAID</span>
        </div>
        {deaths.map((e) => {
          const isOpen = open === e.id;
          const isPaid = ticked.has(e.id);
          return (
            <div key={e.id} className={`gd-regear-death${isOpen ? " is-open" : ""}`}>
              {/* the whole row opens the details; the button keeps it reachable by keyboard */}
              <div className={`gd-row gd-row-click${isPaid ? " is-paid" : ""}`} onClick={() => setOpen(isOpen ? null : e.id)}>
                <button
                  type="button"
                  className="gd-who gd-who-icon gd-regear-open"
                  aria-expanded={isOpen}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setOpen(isOpen ? null : e.id);
                  }}
                >
                  {e.victim.gear.MainHand ? (
                    <img src={itemIcon(e.victim.gear.MainHand.type, e.victim.gear.MainHand.quality, 64)} alt="" width={34} height={34} loading="lazy" decoding="async" />
                  ) : (
                    <span className="gd-noitem is-small" aria-hidden="true" />
                  )}
                  <span>
                    <b>{e.victim.name}</b>
                    <small>
                      {new Date(e.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · {isOpen ? "hide details ▴" : "details ▾"}
                    </small>
                  </span>
                </button>
                <span className="gd-num">{e.victim.itemPower}</span>
                <span className="gd-num gd-col-mid gd-muted">{e.killer.name}</span>
                <span className="gd-num gd-strong is-gold">{report.priced ? shortPrice(cost(e)) : "–"}</span>
                {/* ticking paid does not open the row */}
                <span className="gd-num gd-regear-paid" onClick={(ev) => ev.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isPaid}
                    disabled={!signedIn || !paid}
                    title={signedIn ? undefined : "Sign in to tick deaths as paid"}
                    onChange={() => toggle(e.id)}
                    aria-label={`${e.victim.name} paid`}
                  />
                </span>
                <ul className="gd-regear-gear" aria-label={`Gear of ${e.victim.name}`}>
                  {gearOf(e).map(({ label, item }) => (
                    <li key={label} title={`${label}: ${itemName(item.type, names)}, ${QUALITY[item.quality] ?? ""}${item.count > 1 ? ` ×${item.count}` : ""}${item.value > 0 ? ` · ${shortPrice(item.value)}` : ""}`}>
                      <img src={itemIcon(item.type, item.quality, 64)} alt={label} width={36} height={36} loading="lazy" decoding="async" />
                      <small>{tierOf(item.type)}</small>
                    </li>
                  ))}
                </ul>
                {withBag && e.victim.inventory.length ? (
                  <ul className="gd-regear-gear is-bag" aria-label={`Bag of ${e.victim.name}`}>
                    <li className="gd-regear-label">
                      <small>BAG</small>
                      <b className="is-gold">{report.priced ? shortPrice(e.victim.inventoryValue) : "–"}</b>
                    </li>
                    {e.victim.inventory.map((item, i) => (
                      <li key={`${item.type}-${i}`} title={`${itemName(item.type, names)}${item.count > 1 ? ` ×${item.count}` : ""}${item.value > 0 ? ` · ${shortPrice(item.value)}` : ""}`}>
                        <img src={itemIcon(item.type, item.quality, 64)} alt="" width={30} height={30} loading="lazy" decoding="async" />
                        <small>{item.count > 1 ? `×${item.count}` : tierOf(item.type)}</small>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {isOpen ? <DeathDetails e={e} report={report} names={names} /> : null}
            </div>
          );
        })}
        {!deaths.length ? <p className="gd-empty">{report.kills.length ? "No death of the guild with this item power." : "Albion has not listed this fight's kills yet. Try again in a few minutes."}</p> : null}
        {paidError ? (
          <p className="gd-error" role="alert">
            {paidError}
          </p>
        ) : null}
        <p className="gd-foot">
          <span>
            {report.priced ? "Regear: what the gear was worth on this server (the cheapest believable sell order per item, last 3 days)." : "Prices could not load right now, so the values are missing."}{" "}
            {signedIn ? (
              "Paid ticks are saved to your account: only you see them."
            ) : (
              <>
                <Link to={`/login?next=${encodeURIComponent(pathname)}`}>Sign in</Link> to tick deaths as paid: they are saved to your account.
              </>
            )}
            {report.complete ? "" : " Some kills of this fight could not be read: deaths may be missing."}
          </span>
        </p>
      </section>

      {shopping.length ? (
        <section className="gd-card gd-shopping">
          <div className="gd-list-head">
            <h2>Shopping list</h2>
            <CopyButton text={shoppingText} label="Copy shopping list" count={shopping.length} />
          </div>
          <p className="gd-muted gd-shopping-note">
            The gear of every death not ticked yet, summed up per item: what to buy for the regear.{withBag ? " Bags are not in it: they are paid in silver, in the regear total." : ""}
          </p>
          <ul className="gd-shopping-list">
            {shopping.map((s) => (
              <li key={s.type}>
                <img src={itemIcon(s.type, 1, 64)} alt="" width={32} height={32} loading="lazy" decoding="async" />
                <span>{itemName(s.type, names)}</span>
                <b className="gd-num">×{s.count}</b>
                <span className="gd-num gd-muted">{report.priced && s.value ? shortPrice(s.value) : "–"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** One death up close: every item with its value, the bag, how the player did in the fight and who killed them. */
function DeathDetails({ e, report, names }: { e: KillEvent; report: BattleReport; names: Map<string, string> | null }) {
  const me = report.players.find((p) => p.id === e.victim.id) ?? null;
  const price = (value: number) => (report.priced && value > 0 ? shortPrice(value) : "–");
  const moreHelpers = Math.max(0, e.helpers.length - HELPERS_SHOWN) + (e.otherHelpers?.count ?? 0);
  return (
    <div className="gd-details gd-regear-details">
      <div className="gd-detail-card">
        <h3>Gear · {price(e.victim.gearValue)}</h3>
        <ul className="gd-regear-items">
          {gearOf(e).map(({ label, item }) => (
            <li key={label}>
              <img src={itemIcon(item.type, item.quality, 64)} alt="" width={30} height={30} loading="lazy" decoding="async" />
              <span>
                {itemName(item.type, names)}
                <small>
                  {label} · {QUALITY[item.quality] ?? ""}
                  {item.count > 1 ? ` · ×${item.count}` : ""}
                </small>
              </span>
              <b className="gd-num">{price(item.value)}</b>
            </li>
          ))}
        </ul>
      </div>
      <div className="gd-detail-card">
        <h3>Bag · {price(e.victim.inventoryValue)}</h3>
        {e.victim.inventory.length ? (
          <ul className="gd-regear-items">
            {e.victim.inventory.map((item, i) => (
              <li key={`${item.type}-${i}`}>
                <img src={itemIcon(item.type, item.quality, 64)} alt="" width={30} height={30} loading="lazy" decoding="async" />
                <span>
                  {itemName(item.type, names)}
                  <small>
                    {item.count > 1 ? `×${item.count} · ` : ""}
                    {item.count > 1 && item.value > 0 ? `${shortPrice(item.value / item.count)} each` : (QUALITY[item.quality] ?? "")}
                  </small>
                </span>
                <b className="gd-num">{price(item.value)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gd-muted">The bag was empty.</p>
        )}
      </div>
      <div className="gd-detail-card">
        <h3>In this fight</h3>
        <dl className="gd-facts">
          <dt>Kills</dt>
          <dd>{me ? me.kills : "–"}</dd>
          <dt>Deaths</dt>
          <dd>{me ? me.deaths : "–"}</dd>
          <dt>Damage</dt>
          <dd title="damage to the players who died">{me ? shortPrice(me.damage) : "–"}</dd>
          <dt>Heal assists</dt>
          <dd>{me ? me.healAssists : "–"}</dd>
          <dt>Kill fame</dt>
          <dd>{me ? shortPrice(me.killFame) : "–"}</dd>
          <dt>Item power</dt>
          <dd>{e.victim.itemPower}</dd>
          <dt>Died</dt>
          <dd>
            {new Date(e.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · {areaLabel(e.area)}
          </dd>
        </dl>
      </div>
      <div className="gd-detail-card">
        <h3>Killed by</h3>
        <p className="gd-regear-killer">
          <b>{e.killer.name}</b>
          <small>
            {e.killer.guildName ?? "no guild"} · IP {e.killer.itemPower}
          </small>
        </p>
        {e.helpers.length ? (
          <ul className="gd-regear-items is-helpers">
            {e.helpers.slice(0, HELPERS_SHOWN).map((h) => (
              <li key={h.name}>
                <span>
                  {h.name}
                  <small>{h.guildName ?? "no guild"}</small>
                </span>
                <b className="gd-num">{h.damage ? `${shortPrice(h.damage)} dmg` : h.heal ? `${shortPrice(h.heal)} heal` : "–"}</b>
              </li>
            ))}
            {moreHelpers ? <li className="gd-muted">+{moreHelpers} more</li> : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
