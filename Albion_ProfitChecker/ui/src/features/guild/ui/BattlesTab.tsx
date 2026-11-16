import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { shortPrice } from "../../price-checker/ui/format";
import { battleError, BattleReportBody, battleTitle, useBattle } from "../BattlePage";
import { GuildApiError, battlePath, fightPath, guildPath, type AttendanceFight, type GuildPageData } from "../api";
import { cachedFights, loadFights } from "../core/guildData";
import { timeAgo } from "../core/view";
import { Loading } from "./Loading";

const SIZES = [
  { min: 0, label: "All fights" },
  { min: 10, label: "10+ players" },
  { min: 20, label: "20+ players" },
  { min: 50, label: "50+ players" }
];
const FIGHTS_SHOWN = 30;

/** The guild's fights of the last days; one opens as a full report right here (?fight=<id>). */
export function BattlesTab({ data }: { data: GuildPageData }) {
  const [search] = useSearchParams();
  const raw = search.get("fight") ?? "";
  const fight = /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : null;
  // keyed: another fight never shows the last one's report
  return fight ? <FightReport key={fight} data={data} id={fight} /> : <FightList data={data} />;
}

function FightList({ data }: { data: GuildPageData }) {
  const { guild } = data;
  const [loaded, setLoaded] = useState(() => cachedFights(guild.region, guild.id));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [min, setMin] = useState(0);
  const [count, setCount] = useState(FIGHTS_SHOWN);

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

  const fights = useMemo(() => (loaded?.fights ?? []).filter((f) => f.players >= min), [loaded, min]);

  if (!loaded) {
    return error ? (
      <p className="gd-error" role="alert">
        {error}{" "}
        <button type="button" className="gd-btn" onClick={() => setVersion((v) => v + 1)}>
          Try again
        </button>
      </p>
    ) : (
      <Loading what={`Loading the fights of ${guild.name} of the last 7 days`} />
    );
  }

  return (
    <section className="gd-card gd-battles">
      <div className="gd-list-head">
        <h2>Battles</h2>
        <span className="gd-muted">fights of {guild.name} from Albion's killboard, newest first: open one for its full report</span>
      </div>
      <div className="gd-list-head gd-list-tools">
        <div className="gd-chips" role="group" aria-label="Fight size">
          {SIZES.map((s) => (
            <button key={s.min} type="button" className={`gd-chip${min === s.min ? " is-on" : ""}`} aria-pressed={min === s.min} onClick={() => setMin(s.min)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="gd-row is-head">
        <span>FIGHT</span>
        <span className="gd-num">OF US</span>
        <span className="gd-num">KILLS / DEATHS</span>
        <span className="gd-num gd-col-mid">FAME</span>
        <span className="gd-num gd-col-mid">RESULT</span>
      </div>
      {fights.slice(0, count).map((f) => (
        <FightRow key={f.id} data={data} fight={f} />
      ))}
      {!fights.length ? <p className="gd-empty">No fight of this size in the last {loaded.days} days.</p> : null}
      <div className="gd-foot">
        <span>
          Players: everyone in the fight, both sides. Kills and deaths: of {guild.name}.
          {loaded.complete ? ` The last ${loaded.days} days.` : " Older fights could not load right now."}
        </span>
        {fights.length > count ? (
          <button type="button" className="gd-btn" onClick={() => setCount((c) => c + FIGHTS_SHOWN)}>
            Show more ({fights.length - count})
          </button>
        ) : null}
      </div>
    </section>
  );
}

function FightRow({ data, fight }: { data: GuildPageData; fight: AttendanceFight }) {
  const kills = fight.ours.reduce((t, p) => t + p.kills, 0);
  const deaths = fight.ours.reduce((t, p) => t + p.deaths, 0);
  const result = kills > deaths ? { text: "ahead", tone: "is-active" } : kills < deaths ? { text: "behind", tone: "is-inactive" } : { text: "even", tone: "is-quiet" };
  return (
    <Link className="gd-row gd-row-link" to={fightPath(data.guild, fight.id)}>
      <span className="gd-who">
        <b>{fight.enemy ? `vs ${fight.enemy}` : "Fight"}</b>
        <small>
          {timeAgo(fight.startTime, new Date())} · {new Date(fight.startTime).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })} · {fight.players} players
        </small>
      </span>
      <span className="gd-num gd-strong">{fight.ours.length}</span>
      <span className="gd-num">
        <span className="is-green">{kills}</span> / <span className="is-red">{deaths}</span>
      </span>
      <span className="gd-num gd-col-mid gd-muted">{shortPrice(fight.fame)}</span>
      <span className="gd-num gd-col-mid">
        <span className={`gd-pill ${result.tone}`}>{result.text}</span>
      </span>
    </Link>
  );
}

function FightReport({ data, id }: { data: GuildPageData; id: number }) {
  const { guild } = data;
  const { report, error, retry } = useBattle(guild.region, id);
  const back = (
    <Link className="gd-btn" to={guildPath(guild, "battles")}>
      ← All battles
    </Link>
  );
  if (!report) {
    return (
      <>
        <div className="gd-actions-row">{back}</div>
        {error ? (
          <p className="gd-error" role="alert">
            {battleError(error)}{" "}
            {error.status === 404 ? null : (
              <button type="button" className="gd-btn" onClick={retry}>
                Try again
              </button>
            )}
          </p>
        ) : (
          <Loading what="Loading the battle report: every kill of the fight, with prices" />
        )}
      </>
    );
  }
  const ours = report.guilds.find((g) => g.id === guild.id);
  return (
    <>
      <section className="gd-card gd-fight-head">
        <div>
          <h2>{battleTitle(report)}</h2>
          <small className="gd-muted">
            {new Date(report.battle.startTime).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {report.battle.players} players
            {ours ? ` · ${guild.name}: ${ours.players} players, ${ours.kills} kills, ${ours.deaths} deaths` : ""}
          </small>
        </div>
        <div className="gd-actions-row">
          {back}
          <Link className="gd-btn" to={battlePath(guild.region, id, guild.id)} title="The report on its own page, to share">
            Own page ↗
          </Link>
        </div>
      </section>
      <BattleReportBody report={report} region={guild.region} focusId={guild.id} />
    </>
  );
}
