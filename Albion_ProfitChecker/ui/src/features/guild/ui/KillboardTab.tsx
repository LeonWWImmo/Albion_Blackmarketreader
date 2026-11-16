import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Region } from "@shared/types";
import { shortPrice } from "../../price-checker/ui/format";
import { GuildApiError, battlePath, itemIcon, type Fighter, type GearSlot, type GuildPageData, type KillEvent, type Killboard, type PricedItem } from "../api";
import { cachedKillboard, loadKillboard } from "../core/guildData";
import { areaLabel, timeAgo } from "../core/view";
import { Loading } from "./Loading";

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
const MIN_VALUES = [
  { value: 0, label: "Any value" },
  { value: 100_000, label: "100k+" },
  { value: 1_000_000, label: "1m+" },
  { value: 10_000_000, label: "10m+" }
];
type Sort = "new" | "value" | "fame";
const SORTS: { key: Sort; label: string }[] = [
  { key: "new", label: "Newest" },
  { key: "value", label: "Most valuable" },
  { key: "fame", label: "Most fame" }
];

const silver = (value: number) => (value > 0 ? shortPrice(value) : "–");

/** The guild's latest kills and deaths: who, with what, worth how much, and who helped. Loaded when the tab opens. */
export function KillboardTab({ data }: { data: GuildPageData }) {
  const { region, id } = data.guild;
  const [board, setBoard] = useState<Killboard | null>(() => cachedKillboard(region, id));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [side, setSide] = useState<"kills" | "deaths" | null>(null);
  // until a side is picked: the kills, or the deaths when there are no kills
  const shown = side ?? (board && !board.kills.length && board.deaths.length ? "deaths" : "kills");
  const [search, setSearch] = useState("");
  const [minValue, setMinValue] = useState(0);
  const [area, setArea] = useState("all");
  const [sort, setSort] = useState<Sort>("new");

  useEffect(() => {
    let alive = true;
    setError("");
    loadKillboard(region, id)
      .then((next) => alive && setBoard(next))
      .catch((err: unknown) => alive && setError(err instanceof GuildApiError ? err.message : "The killboard could not load."));
    return () => {
      alive = false;
    };
  }, [region, id, version]);

  const events = useMemo(() => {
    if (!board) return [];
    const needle = search.trim().toLowerCase();
    const list = (shown === "kills" ? board.kills : board.deaths).filter(
      (e) =>
        e.value >= minValue &&
        (area === "all" || e.area === area) &&
        (!needle || [e.killer.name, e.victim.name, e.killer.guildName ?? "", e.victim.guildName ?? ""].some((n) => n.toLowerCase().includes(needle)))
    );
    const by: Record<Sort, (a: KillEvent, b: KillEvent) => number> = {
      new: (a, b) => b.time.localeCompare(a.time),
      value: (a, b) => b.value - a.value,
      fame: (a, b) => b.fame - a.fame
    };
    return [...list].sort(by[sort]);
  }, [board, shown, search, minValue, area, sort]);

  if (!board) {
    return error ? (
      <p className="gd-error" role="alert">
        {error}{" "}
        <button type="button" className="gd-btn" onClick={() => setVersion((v) => v + 1)}>
          Try again
        </button>
      </p>
    ) : (
      <Loading what="Loading kills and deaths, with what the gear was worth" />
    );
  }

  const sum = (list: KillEvent[], pick: (e: KillEvent) => number) => list.reduce((t, e) => t + pick(e), 0);
  const areas = [...new Set([...board.kills, ...board.deaths].map((e) => e.area).filter((a): a is string => Boolean(a)))];
  return (
    <>
      <section className="gd-stats">
        <div className="gd-card gd-stat">
          <small>KILLS</small>
          <b className="is-green">{board.kills.length}</b>
          <span>{shortPrice(sum(board.kills, (e) => e.fame))} fame</span>
        </div>
        <div className="gd-card gd-stat">
          <small>SILVER TAKEN</small>
          <b className="is-gold">{board.priced ? silver(sum(board.kills, (e) => e.value)) : "–"}</b>
          <span>what the killed players lost</span>
        </div>
        <div className="gd-card gd-stat">
          <small>DEATHS</small>
          <b className="is-red">{board.deaths.length}</b>
          <span>{shortPrice(sum(board.deaths, (e) => e.fame))} fame given away</span>
        </div>
        <div className="gd-card gd-stat">
          <small>SILVER LOST</small>
          <b className="is-red">{board.priced ? silver(sum(board.deaths, (e) => e.value)) : "–"}</b>
          <span>gear and bags of our dead</span>
        </div>
      </section>

      <section className="gd-card">
        <div className="gd-list-head">
          <div className="gd-chips" role="group" aria-label="Show">
            <button type="button" className={`gd-chip${shown === "kills" ? " is-on" : ""}`} aria-pressed={shown === "kills"} onClick={() => setSide("kills")}>
              Kills {board.kills.length}
            </button>
            <button type="button" className={`gd-chip${shown === "deaths" ? " is-on" : ""}`} aria-pressed={shown === "deaths"} onClick={() => setSide("deaths")}>
              Deaths {board.deaths.length}
            </button>
          </div>
          <input className="gd-filter" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a player or guild" aria-label="Find a player or guild" />
        </div>
        <div className="gd-list-head gd-list-tools">
          {board.priced ? (
            <div className="gd-chips" role="group" aria-label="Value">
              {MIN_VALUES.map((v) => (
                <button key={v.value} type="button" className={`gd-chip${minValue === v.value ? " is-on" : ""}`} aria-pressed={minValue === v.value} onClick={() => setMinValue(v.value)}>
                  {v.label}
                </button>
              ))}
            </div>
          ) : null}
          {areas.length > 1 ? (
            <select className="gd-select" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
              <option value="all">Every area</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {areaLabel(a)}
                </option>
              ))}
            </select>
          ) : null}
          <div className="gd-chips" role="group" aria-label="Sort">
            {SORTS.filter((s) => board.priced || s.key !== "value").map((s) => (
              <button key={s.key} type="button" className={`gd-chip${sort === s.key ? " is-on" : ""}`} aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {events.length ? (
          <ul className="gd-kills">
            {events.map((event) => (
              <KillRow key={event.id} event={event} guildId={id} region={region} />
            ))}
          </ul>
        ) : (
          <p className="gd-empty">{search || minValue || area !== "all" ? "Nothing matches these filters." : shown === "kills" ? "No kills on the killboard lately." : "No deaths on the killboard lately."}</p>
        )}
        <p className="gd-foot">
          <span>
            From Albion's killboard, refreshed every few minutes. Deaths come from the guild's latest fights.{" "}
            {!board.priced
              ? "Prices could not load right now, so values are missing."
              : `Values: the cheapest believable sell order per item and quality on this server, from the last 3 days; items without one count as 0.${board.pricesComplete ? "" : " This board has more items than one price lookup takes: some count as 0."}`}
          </span>
        </p>
      </section>
    </>
  );
}

/**
 * One kill, opened for the builds, the bag and who helped. Read from `guildId`'s side (its kills
 * green, its deaths red), or neutral without one; `region` adds a link to the fight's report.
 */
export function KillRow({ event, guildId, region }: { event: KillEvent; guildId: string | null; region?: Region }) {
  const [open, setOpen] = useState(false);
  const ourKill = Boolean(guildId) && event.killer.guildId === guildId;
  const ourDeath = Boolean(guildId) && event.victim.guildId === guildId;
  const now = new Date();
  return (
    <li className={`gd-kill${ourDeath ? " is-death" : ourKill ? " is-kill" : " is-neutral"}`}>
      <button type="button" className="gd-kill-row" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <FighterCell fighter={event.killer} ours={Boolean(guildId) && event.killer.guildId === guildId} />
        <span className="gd-kill-mid">
          <b>{ourDeath ? "DEATH" : "KILL"}</b>
          {event.value > 0 ? <strong className="gd-value">{shortPrice(event.value)}</strong> : null}
          <small>
            {shortPrice(event.fame)} fame · {timeAgo(event.time, now)}
          </small>
          <small>
            {areaLabel(event.area)}
            {event.participants > 1 ? ` · ${event.participants} involved` : ""}
          </small>
        </span>
        <FighterCell fighter={event.victim} ours={ourDeath} right />
      </button>
      {open ? <KillDetails event={event} reportLink={region && event.battleId ? battlePath(region, event.battleId, guildId ?? undefined) : null} /> : null}
    </li>
  );
}

export function FighterCell({ fighter, ours, right = false }: { fighter: Fighter; ours: boolean; right?: boolean }) {
  const weapon = fighter.gear.MainHand;
  return (
    <span className={`gd-fighter${right ? " is-right" : ""}${ours ? " is-ours" : ""}`}>
      {weapon ? <img src={itemIcon(weapon.type, weapon.quality, 64)} alt="" width={52} height={52} loading="lazy" decoding="async" /> : <span className="gd-noitem" aria-hidden="true" />}
      <span>
        <b>{fighter.name}</b>
        <small>{fighter.guildName ?? "no guild"}</small>
        <small>
          IP {fighter.itemPower}
          {fighter.gearValue > 0 ? ` · gear ${shortPrice(fighter.gearValue)}` : ""}
        </small>
      </span>
    </span>
  );
}

function KillDetails({ event, reportLink }: { event: KillEvent; reportLink: string | null }) {
  const damage = event.helpers.reduce((t, h) => t + h.damage, 0);
  const heal = event.helpers.reduce((t, h) => t + h.heal, 0);
  return (
    <div className="gd-kill-detail">
      <div className="gd-kill-builds">
        <Build title="Killer" fighter={event.killer} />
        <Build title="Victim" fighter={event.victim} />
      </div>
      <div className="gd-kill-builds">
        <section className="gd-gear">
          <small>
            Bag of {event.victim.name}
            {event.victim.inventoryValue > 0 ? <b> · {shortPrice(event.victim.inventoryValue)}</b> : null}
          </small>
          {event.victim.inventory.length ? (
            <div className="gd-items">
              {event.victim.inventory.map((item, i) => (
                <Item key={`${item.type}-${i}`} item={item} />
              ))}
            </div>
          ) : (
            <p className="gd-muted">Nothing in the bag.</p>
          )}
        </section>
        <section className="gd-gear">
          <small>Who helped</small>
          {event.helpers.length ? (
            <ul className="gd-helpers">
              {event.helpers.map((h, i) => (
                <li key={`${h.name}-${i}`}>
                  <span>
                    <b>{h.name}</b>
                    <small>
                      {h.guildName ?? "no guild"}
                      {h.itemPower > 0 ? ` · IP ${h.itemPower}` : ""}
                    </small>
                  </span>
                  <span className="gd-helper-bars">
                    {h.damage > 0 ? (
                      <span title={`${h.damage.toLocaleString("de-DE")} damage`}>
                        <i className="is-damage" style={{ width: `${damage ? Math.max(4, (h.damage / damage) * 100) : 0}%` }} />
                        <small>{damage ? Math.round((h.damage / damage) * 100) : 0}% damage</small>
                      </span>
                    ) : null}
                    {h.heal > 0 ? (
                      <span title={`${h.heal.toLocaleString("de-DE")} healing`}>
                        <i className="is-heal" style={{ width: `${heal ? Math.max(4, (h.heal / heal) * 100) : 0}%` }} />
                        <small>{heal ? Math.round((h.heal / heal) * 100) : 0}% healing</small>
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
              {event.otherHelpers ? (
                <li>
                  <span>
                    <b>+{event.otherHelpers.count} others</b>
                    <small>the rest of the fight</small>
                  </span>
                  <span className="gd-helper-bars">
                    <small>
                      {damage ? Math.round((event.otherHelpers.damage / (damage + event.otherHelpers.damage)) * 100) : 0}% damage
                    </small>
                  </span>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="gd-muted">No one else took part.</p>
          )}
        </section>
      </div>
      <dl className="gd-facts gd-kill-facts">
        <dt>When</dt>
        <dd>{new Date(event.time).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</dd>
        <dt>Where</dt>
        <dd>{areaLabel(event.area)}</dd>
        <dt>Group</dt>
        <dd>{event.groupSize ? `${event.groupSize} in the killer's party` : "–"}</dd>
        <dt>Silver lost</dt>
        <dd>{event.value > 0 ? `${shortPrice(event.value)} (gear ${shortPrice(event.victim.gearValue)}, bag ${shortPrice(event.victim.inventoryValue)})` : "–"}</dd>
        {reportLink ? (
          <>
            <dt>Fight</dt>
            <dd>
              <Link to={reportLink}>Battle report →</Link>
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

function Build({ title, fighter }: { title: string; fighter: Fighter }) {
  return (
    <section className="gd-gear">
      <small>
        {title}: <b>{fighter.name}</b> · IP {fighter.itemPower}
        {fighter.gearValue > 0 ? <b> · {shortPrice(fighter.gearValue)}</b> : null}
      </small>
      <div className="gd-items">
        {SLOTS.map(({ key, label }) => {
          const item = fighter.gear[key];
          return item ? <Item key={key} item={item} label={label} /> : <span key={key} className="gd-item is-empty" title={`${label}: none`} />;
        })}
      </div>
    </section>
  );
}

function Item({ item, label }: { item: PricedItem; label?: string }) {
  const title = `${label ? `${label}: ` : ""}${item.type}${item.count > 1 ? ` ×${item.count}` : ""}${item.value > 0 ? ` · ${item.value.toLocaleString("de-DE")} silver` : ""}`;
  return (
    <span className="gd-item" title={title}>
      <img src={itemIcon(item.type, item.quality, 64)} alt={label ?? ""} width={44} height={44} loading="lazy" decoding="async" />
      {item.count > 1 ? <i>{item.count}</i> : null}
      <small>{item.value > 0 ? shortPrice(item.value) : "–"}</small>
    </span>
  );
}
