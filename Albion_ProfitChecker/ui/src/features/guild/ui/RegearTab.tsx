import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { shortPrice } from "../../price-checker/ui/format";
import { GuildApiError, battlePath, guildPath, itemIcon, type BattleReport, type GuildPageData, type KillEvent } from "../api";
import { cachedBattle, loadBattle } from "../core/guildData";
import { areaLabel, timeAgo } from "../core/view";
import { CopyButton } from "./CopyButton";
import { Loading } from "./Loading";

const MIN_IP = [0, 1100, 1200, 1300, 1400];
const MIN_GEAR = [
  { value: 0, label: "Any gear" },
  { value: 1_000_000, label: "1m+" },
  { value: 3_000_000, label: "3m+" },
  { value: 10_000_000, label: "10m+" }
];
/** Paid ticks of this browser, per fight: which deaths an officer has regeared already. */
const PAID_KEY = (battleId: number) => `gd-regear-paid:${battleId}`;

function readPaid(battleId: number): Set<number> {
  try {
    const raw = localStorage.getItem(PAID_KEY(battleId));
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((v): v is number => typeof v === "number") : []);
  } catch {
    return new Set();
  }
}

function writePaid(battleId: number, paid: Set<number>) {
  try {
    if (paid.size) localStorage.setItem(PAID_KEY(battleId), JSON.stringify([...paid]));
    else localStorage.removeItem(PAID_KEY(battleId));
  } catch {
    // private window or full storage: the ticks last for this visit only
  }
}

/** What our dead lost in one fight, as a regear list: gear value per death, filters, paid ticks and a list to copy. */
export function RegearTab({ data }: { data: GuildPageData }) {
  const { guild } = data;
  const fights = data.fights.filter((f) => f.deaths > 0);
  const [battleId, setBattleId] = useState<number | null>(fights[0]?.id ?? null);

  if (!fights.length) {
    return (
      <section className="gd-card">
        <p className="gd-empty">
          No listed fight with deaths of {guild.name} lately. Albion lists the bigger fights only; single deaths are on the{" "}
          <Link to={guildPath(guild, "killboard")}>killboard</Link>.
        </p>
      </section>
    );
  }
  return (
    <>
      <section className="gd-card">
        <div className="gd-list-head">
          <h2>Pick a fight</h2>
          <span className="gd-muted">the guild's latest listed fights with deaths</span>
        </div>
        <div className="gd-fight-pick" role="group" aria-label="Fight">
          {fights.map((f) => (
            <button key={f.id} type="button" className={`gd-fight-chip${f.id === battleId ? " is-on" : ""}`} aria-pressed={f.id === battleId} onClick={() => setBattleId(f.id)}>
              <b>
                {timeAgo(f.startTime, new Date())} · {new Date(f.startTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
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
        </div>
      </section>
      {battleId ? <RegearList key={battleId} data={data} battleId={battleId} /> : null}
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

function RegearList({ data, battleId }: { data: GuildPageData; battleId: number }) {
  const { guild } = data;
  const [report, setReport] = useState<BattleReport | null>(() => cachedBattle(guild.region, battleId));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [minIp, setMinIp] = useState(0);
  const [minGear, setMinGear] = useState(0);
  const [withBag, setWithBag] = useState(false);
  const [paid, setPaid] = useState(() => readPaid(battleId));

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
        // without prices every value is 0: the value filter is left out then
        .filter((e) => e.victim.guildId === guild.id && e.victim.itemPower >= minIp && (!report?.priced || e.victim.gearValue >= minGear))
        .sort((a, b) => a.victim.name.localeCompare(b.victim.name) || a.time.localeCompare(b.time)),
    [report, guild.id, minIp, minGear]
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

  const toggle = (id: number) => {
    const next = new Set(paid);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPaid(next);
    writePaid(battleId, next);
  };
  const open = deaths.filter((e) => !paid.has(e.id));
  const total = deaths.reduce((t, e) => t + cost(e), 0);
  const owed = open.reduce((t, e) => t + cost(e), 0);
  const copyText = open.map((e) => `${e.victim.name}\t${Math.round(cost(e))}`).join("\n");

  return (
    <>
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
          <span>{open.length} not ticked yet</span>
        </div>
        <div className="gd-card gd-stat">
          <small>WHERE</small>
          <b className="gd-stat-text">{areaLabel(mainArea(report.kills))}</b>
          <span>
            {report.battle.players} players · <Link to={battlePath(guild.region, report.battle.id, guild.id)}>Battle report →</Link>
          </span>
        </div>
      </section>

      <section className="gd-card gd-regear">
        <div className="gd-list-head">
          <h2>Regear list</h2>
          {open.length ? <CopyButton text={copyText} label="Copy open list" count={open.length} /> : null}
        </div>
        <div className="gd-list-head gd-list-tools">
          <select className="gd-select" value={minIp} onChange={(e) => setMinIp(Number(e.target.value))} aria-label="Lowest item power">
            {MIN_IP.map((ip) => (
              <option key={ip} value={ip}>
                {ip ? `IP ${ip}+` : "Any IP"}
              </option>
            ))}
          </select>
          <div className="gd-chips" role="group" aria-label="Lowest gear value" hidden={!report.priced}>
            {MIN_GEAR.map((g) => (
              <button key={g.value} type="button" className={`gd-chip${minGear === g.value ? " is-on" : ""}`} aria-pressed={minGear === g.value} onClick={() => setMinGear(g.value)}>
                {g.label}
              </button>
            ))}
          </div>
          <label className="gd-check">
            <input type="checkbox" checked={withBag} onChange={(e) => setWithBag(e.target.checked)} />
            Count the bag too
          </label>
        </div>
        <div className="gd-row is-head">
          <span>PLAYER</span>
          <span className="gd-num">IP</span>
          <span className="gd-num gd-col-mid">KILLED BY</span>
          <span className="gd-num">REGEAR</span>
          <span className="gd-num">PAID</span>
        </div>
        {deaths.map((e) => (
          <div key={e.id} className={`gd-row${paid.has(e.id) ? " is-paid" : ""}`}>
            <span className="gd-who gd-who-icon">
              {e.victim.gear.MainHand ? (
                <img src={itemIcon(e.victim.gear.MainHand.type, e.victim.gear.MainHand.quality, 64)} alt="" width={34} height={34} loading="lazy" decoding="async" />
              ) : (
                <span className="gd-noitem is-small" aria-hidden="true" />
              )}
              <span>
                <b>{e.victim.name}</b>
                <small>{new Date(e.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</small>
              </span>
            </span>
            <span className="gd-num">{e.victim.itemPower}</span>
            <span className="gd-num gd-col-mid gd-muted">{e.killer.name}</span>
            <span className="gd-num gd-strong is-gold">{report.priced ? shortPrice(cost(e)) : "–"}</span>
            <span className="gd-num">
              <input type="checkbox" checked={paid.has(e.id)} onChange={() => toggle(e.id)} aria-label={`${e.victim.name} paid`} />
            </span>
          </div>
        ))}
        {!deaths.length ? <p className="gd-empty">{report.kills.length ? "No death of the guild matches these filters." : "Albion has not listed this fight's kills yet. Try again in a few minutes."}</p> : null}
        <p className="gd-foot">
          <span>
            {report.priced
              ? "Regear: what the gear was worth on this server (the cheapest believable sell order per item, last 3 days). Paid ticks stay in this browser."
              : "Prices could not load right now, so the values are missing. Paid ticks stay in this browser."}
            {report.complete ? "" : " Some kills of this fight could not be read: deaths may be missing."}
          </span>
        </p>
      </section>
    </>
  );
}
