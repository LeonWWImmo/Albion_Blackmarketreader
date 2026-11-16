import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { shortPrice } from "../../price-checker/ui/format";
import { GuildApiError, fightPath, type AttendanceFight, type GuildPageData } from "../api";
import { cachedFights, loadFights } from "../core/guildData";
import { timeAgo } from "../core/view";
import { CopyButton } from "./CopyButton";
import { Loading } from "./Loading";

const RANGES = [
  { days: 1, label: "24 hours" },
  { days: 3, label: "3 days" },
  { days: 7, label: "7 days" }
];
const MIN_PLAYERS = [0, 20, 50, 100];
const DAY_MS = 86_400_000;
const MEMBERS_SHOWN = 60;

/** joinedOn: the day the member joined, when tracking saw it. */
type Row = { id: string; name: string; joinedOn: string | null; fights: number; kills: number; deaths: number; killFame: number; last: string | null };

/** Who of the guild was in its fights: per member the fights joined, from Albion's list of the guild's fights. */
export function AttendanceTab({ data }: { data: GuildPageData }) {
  const { guild } = data;
  const [loaded, setLoaded] = useState(() => cachedFights(guild.region, guild.id));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [days, setDays] = useState(7);
  // fights of 20+ players by default: the guild fights attendance is about (a busy guild has many small ones)
  const [minPlayers, setMinPlayers] = useState(20);
  const [needle, setNeedle] = useState("");
  const [all, setAll] = useState(false);
  const [showFights, setShowFights] = useState(false);

  useEffect(() => {
    let alive = true;
    setError("");
    loadFights(guild.region, guild.id)
      .then((next) => alive && setLoaded(next))
      .catch((err: unknown) => alive && setError(err instanceof GuildApiError ? err.message : "The fights could not load."));
    return () => {
      alive = false;
    };
  }, [guild.region, guild.id, version]);

  const fights = useMemo(() => {
    const now = Date.now();
    return (loaded?.fights ?? []).filter((f) => f.players >= minPlayers && now - Date.parse(f.startTime) <= days * DAY_MS);
  }, [loaded, minPlayers, days]);
  const rows = useMemo(() => attendance(data, fights), [data, fights]);
  const q = needle.trim().toLowerCase();
  const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  const shown = all ? filtered : filtered.slice(0, MEMBERS_SHOWN);

  if (!loaded) {
    return error ? (
      <p className="gd-error" role="alert">
        {error}{" "}
        <button type="button" className="gd-btn" onClick={() => setVersion((v) => v + 1)}>
          Try again
        </button>
      </p>
    ) : (
      <Loading what="Loading the guild's fights of the last 7 days" />
    );
  }

  // in none of the fights; who joined during the time could not have been in all of them
  const windowStart = new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
  const isNew = (r: Row) => Boolean(r.joinedOn && r.joinedOn > windowStart);
  const absent = rows.filter((r) => !r.fights && !isNew(r));
  const joined = rows.filter((r) => r.fights > 0).length;
  const oldest = loaded.fights[loaded.fights.length - 1]?.startTime ?? null;
  return (
    <>
      <section className="gd-stats">
        <div className="gd-card gd-stat">
          <small>FIGHTS</small>
          <b>{fights.length}</b>
          <span>
            {RANGES.find((r) => r.days === days)?.label}
            {minPlayers ? `, at least ${minPlayers} players` : ", any size"}
          </span>
        </div>
        <div className="gd-card gd-stat">
          <small>TOOK PART</small>
          <b className="is-green">
            {joined}
            <em> / {rows.length}</em>
          </b>
          <span>members in at least one</span>
        </div>
        <div className="gd-card gd-stat">
          <small>IN NONE</small>
          <b className="is-red">{absent.length}</b>
          <span>members</span>
        </div>
        <div className="gd-card gd-stat">
          <small>AVERAGE</small>
          <b>{fights.length ? Math.round(fights.reduce((t, f) => t + f.ours.length, 0) / fights.length) : "–"}</b>
          <span>of us per fight</span>
        </div>
      </section>

      <section className="gd-card gd-attendance">
        <div className="gd-list-head">
          <h2>Attendance</h2>
          <input className="gd-filter" type="search" value={needle} onChange={(e) => setNeedle(e.target.value)} placeholder="Find a member" aria-label="Find a member" />
        </div>
        <div className="gd-list-head gd-list-tools">
          <div className="gd-chips" role="group" aria-label="Time">
            {RANGES.map((r) => (
              <button key={r.days} type="button" className={`gd-chip${days === r.days ? " is-on" : ""}`} aria-pressed={days === r.days} onClick={() => setDays(r.days)}>
                {r.label}
              </button>
            ))}
          </div>
          <label className="gd-check">
            Count fights with
            <select className="gd-select" value={minPlayers} onChange={(e) => setMinPlayers(Number(e.target.value))} aria-label="Count fights with">
              {MIN_PLAYERS.map((n) => (
                <option key={n} value={n}>
                  {n ? `at least ${n} players` : "any number of players"}
                </option>
              ))}
            </select>
          </label>
          {absent.length ? <CopyButton text={absent.map((r) => r.name).join("\n")} label="Copy who was in none" count={absent.length} /> : null}
        </div>
        <div className="gd-row is-head">
          <span>MEMBER</span>
          <span className="gd-num">FIGHTS</span>
          <span className="gd-num">SHARE</span>
          <span className="gd-num gd-col-mid">K / D</span>
          <span className="gd-num gd-col-mid">KILL FAME</span>
          <span className="gd-num gd-col-mid">LAST FIGHT</span>
        </div>
        {shown.map((r) => {
          const share = fights.length ? Math.round((r.fights / fights.length) * 100) : 0;
          return (
            <div key={r.id} className={`gd-row${r.fights ? "" : " is-absent"}`}>
              <span className="gd-who">
                <b>{r.name}</b>
                {isNew(r) ? (
                  <small>
                    <span className="gd-kind is-new">joined {timeAgo(r.joinedOn as string, new Date())}</span>
                  </small>
                ) : null}
              </span>
              <span className="gd-num gd-strong">{r.fights}</span>
              <span className="gd-num">
                <span className="gd-share" aria-hidden="true">
                  <i style={{ width: `${share}%` }} />
                </span>
                {share}%
              </span>
              <span className="gd-num gd-col-mid">
                <span className="is-green">{r.kills}</span> / <span className="is-red">{r.deaths}</span>
              </span>
              <span className="gd-num gd-col-mid">{r.killFame ? shortPrice(r.killFame) : "–"}</span>
              <span className="gd-num gd-col-mid gd-muted">{r.last ? timeAgo(r.last, new Date()) : "–"}</span>
            </div>
          );
        })}
        {!filtered.length ? <p className="gd-empty">Nobody matches.</p> : null}
        <div className="gd-foot">
          <span>
            Players: everyone in the fight, both sides. Small fights of a few players are mostly ganks; set a size to count only the guild's real fights.
            From Albion's list of the guild's fights (single kills outside a fight are not in it).
            {loaded.complete
              ? ` The last ${loaded.days} days.`
              : oldest
                ? ` Only back to ${new Date(oldest).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}: older fights could not load right now.`
                : " Older fights could not load right now."}
          </span>
          {filtered.length > shown.length ? (
            <button type="button" className="gd-btn" onClick={() => setAll(true)}>
              Show all {filtered.length}
            </button>
          ) : null}
        </div>
      </section>

      <section className="gd-card">
        <div className="gd-list-head">
          <h2>The fights</h2>
          <button type="button" className="gd-btn" aria-expanded={showFights} onClick={() => setShowFights((v) => !v)}>
            {showFights ? "Hide" : `Show ${fights.length}`}
          </button>
        </div>
        {showFights
          ? fights.map((f) => (
              <Link key={f.id} className="gd-row gd-row-link" to={fightPath(guild, f.id)} title="Battle report">
                <div>
                  <b>
                    {f.players} players · {shortPrice(f.fame)} fame
                  </b>
                  <small>{timeAgo(f.startTime, new Date())}</small>
                </div>
                <span className="gd-pill is-violet">{f.ours.length} of us</span>
                <span className="gd-muted">Report →</span>
              </Link>
            ))
          : null}
      </section>
    </>
  );
}

/** Per current member: fights joined among `fights`, with kills, deaths and kill fame there; most fights first. */
function attendance(data: GuildPageData, fights: AttendanceFight[]): Row[] {
  const rows = new Map<string, Row>(data.activity.members.map((m) => [m.id, { id: m.id, name: m.name, joinedOn: m.isNew ? m.joinedOn : null, fights: 0, kills: 0, deaths: 0, killFame: 0, last: null }]));
  for (const fight of fights) {
    for (const p of fight.ours) {
      const row = rows.get(p.id);
      if (!row) continue; // left the guild since
      row.fights++;
      row.kills += p.kills;
      row.deaths += p.deaths;
      row.killFame += p.killFame;
      if (!row.last || fight.startTime > row.last) row.last = fight.startTime;
    }
  }
  return [...rows.values()].sort((a, b) => b.fights - a.fights || b.killFame - a.killFame || a.name.localeCompare(b.name));
}
