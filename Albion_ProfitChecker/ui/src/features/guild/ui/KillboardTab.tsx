import { useEffect, useState } from "react";
import { shortPrice } from "../../price-checker/ui/format";
import { GuildApiError, itemIcon, type Fighter, type GearSlot, type GuildPageData, type KillEvent, type Killboard } from "../api";
import { cachedKillboard, loadKillboard } from "../core/guildData";
import { timeAgo } from "../core/view";

const SLOTS: { key: GearSlot; label: string }[] = [
  { key: "MainHand", label: "Weapon" },
  { key: "OffHand", label: "Off-hand" },
  { key: "Head", label: "Head" },
  { key: "Armor", label: "Armor" },
  { key: "Shoes", label: "Shoes" },
  { key: "Cape", label: "Cape" },
  { key: "Bag", label: "Bag" },
  { key: "Mount", label: "Mount" }
];

/** The guild's latest kills and deaths with both players' gear, loaded when the tab opens. */
export function KillboardTab({ data }: { data: GuildPageData }) {
  const { region, id } = data.guild;
  const [board, setBoard] = useState<Killboard | null>(() => cachedKillboard(region, id));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [side, setSide] = useState<"kills" | "deaths">("kills");

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

  if (!board) {
    return error ? (
      <p className="gd-error" role="alert">
        {error}{" "}
        <button type="button" className="gd-btn" onClick={() => setVersion((v) => v + 1)}>
          Try again
        </button>
      </p>
    ) : (
      <div className="gd-skeleton" aria-busy="true" />
    );
  }

  const events = side === "kills" ? board.kills : board.deaths;
  const killFame = board.kills.reduce((t, e) => t + e.fame, 0);
  const deathFame = board.deaths.reduce((t, e) => t + e.fame, 0);
  return (
    <>
      <section className="gd-stats">
        <div className="gd-card gd-stat">
          <small>KILLS</small>
          <b className="is-green">{board.kills.length}</b>
          <span>latest on the killboard</span>
        </div>
        <div className="gd-card gd-stat">
          <small>DEATHS</small>
          <b className="is-red">{board.deaths.length}</b>
          <span>in the latest fights</span>
        </div>
        <div className="gd-card gd-stat">
          <small>FAME WON</small>
          <b>{shortPrice(killFame)}</b>
          <span>from these kills</span>
        </div>
        <div className="gd-card gd-stat">
          <small>FAME LOST</small>
          <b>{shortPrice(deathFame)}</b>
          <span>to these deaths</span>
        </div>
      </section>
      <section className="gd-card">
        <div className="gd-list-head">
          <div className="gd-chips" role="group" aria-label="Show">
            <button type="button" className={`gd-chip${side === "kills" ? " is-on" : ""}`} aria-pressed={side === "kills"} onClick={() => setSide("kills")}>
              Kills {board.kills.length}
            </button>
            <button type="button" className={`gd-chip${side === "deaths" ? " is-on" : ""}`} aria-pressed={side === "deaths"} onClick={() => setSide("deaths")}>
              Deaths {board.deaths.length}
            </button>
          </div>
          <span className="gd-muted">tap a fight to see both players' gear</span>
        </div>
        {events.length ? (
          <ul className="gd-kills">
            {events.map((event) => (
              <KillRow key={event.id} event={event} guildId={id} />
            ))}
          </ul>
        ) : (
          <p className="gd-empty">{side === "kills" ? "No kills on the killboard lately." : "No deaths in the latest fights."}</p>
        )}
        <p className="gd-foot">
          <span>From Albion's killboard, refreshed every few minutes. Deaths come from the guild's latest fights.</span>
        </p>
      </section>
    </>
  );
}

function KillRow({ event, guildId }: { event: KillEvent; guildId: string }) {
  const [open, setOpen] = useState(false);
  const ourKill = event.killer.guildId === guildId;
  return (
    <li className={`gd-kill${ourKill ? " is-kill" : " is-death"}`}>
      <button type="button" className="gd-kill-row" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <FighterCell fighter={event.killer} ours={event.killer.guildId === guildId} />
        <span className="gd-kill-mid">
          <b>{ourKill ? "KILL" : "DEATH"}</b>
          <small>{shortPrice(event.fame)} fame</small>
          <small>{timeAgo(event.time, new Date())}</small>
          {event.participants > 1 ? <small>{event.participants} involved</small> : null}
        </span>
        <FighterCell fighter={event.victim} ours={event.victim.guildId === guildId} right />
      </button>
      {open ? (
        <div className="gd-kill-gear">
          <GearRow fighter={event.killer} title="Killer" />
          <GearRow fighter={event.victim} title="Victim" />
        </div>
      ) : null}
    </li>
  );
}

function FighterCell({ fighter, ours, right = false }: { fighter: Fighter; ours: boolean; right?: boolean }) {
  const weapon = fighter.gear.MainHand;
  return (
    <span className={`gd-fighter${right ? " is-right" : ""}${ours ? " is-ours" : ""}`}>
      {weapon ? (
        <img src={itemIcon(weapon.type, weapon.quality, 64)} alt="" width={52} height={52} loading="lazy" decoding="async" />
      ) : (
        <span className="gd-noitem" aria-hidden="true" />
      )}
      <span>
        <b>{fighter.name}</b>
        <small>{fighter.guildName ?? "no guild"}</small>
        <small>IP {fighter.itemPower}</small>
      </span>
    </span>
  );
}

function GearRow({ fighter, title }: { fighter: Fighter; title: string }) {
  return (
    <div className="gd-gear">
      <small>
        {title}: <b>{fighter.name}</b> · IP {fighter.itemPower}
      </small>
      <div>
        {SLOTS.map(({ key, label }) => {
          const piece = fighter.gear[key];
          return piece ? (
            <img key={key} src={itemIcon(piece.type, piece.quality, 64)} alt={label} title={label} width={44} height={44} loading="lazy" decoding="async" />
          ) : (
            <span key={key} className="gd-noitem" title={`${label}: none`} />
          );
        })}
      </div>
    </div>
  );
}
