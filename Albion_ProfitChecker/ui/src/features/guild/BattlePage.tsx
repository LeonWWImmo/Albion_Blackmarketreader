import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { Region } from "@shared/types";
import { useSeo } from "../../shared/seo/useSeo";
import { shortPrice } from "../price-checker/ui/format";
import { GuildApiError, guildPath, itemIcon, slugOf, type BattlePlayer, type BattleReport, type BattleSide } from "./api";
import { cachedBattle, loadBattle } from "./core/guildData";
import { GuildShell } from "./GuildShell";
import { KillRow } from "./ui/KillboardTab";
import { Loading } from "./ui/Loading";

type Sort = "killFame" | "kills" | "deaths" | "damage" | "assists" | "healAssists" | "itemPower";
const SORTS: { key: Sort; label: string }[] = [
  { key: "killFame", label: "Kill fame" },
  { key: "kills", label: "Kills" },
  { key: "deaths", label: "Deaths" },
  { key: "damage", label: "Damage" },
  { key: "assists", label: "Assists" },
  { key: "healAssists", label: "Heal assists" },
  { key: "itemPower", label: "IP" }
];
const BEST: { key: "kills" | "damage" | "assists" | "healAssists"; label: string; value: (p: BattlePlayer) => string }[] = [
  { key: "kills", label: "MOST KILLS", value: (p) => `${p.kills} kills` },
  { key: "damage", label: "MOST DAMAGE", value: (p) => `${shortPrice(p.damage)} damage` },
  { key: "assists", label: "MOST ASSISTS", value: (p) => `${p.assists} assists` },
  { key: "healAssists", label: "MOST HEAL ASSISTS", value: (p) => `${p.healAssists} kills healed` }
];
const PLAYERS_SHOWN = 50;
const SIDES_SHOWN = 8;
const KILLS_SHOWN = 30;

const serverName = (region: Region) => (region === "eu" ? "EUROPE" : "AMERICA");

function duration(start: string, end: string): string {
  const minutes = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** One fight: who was there, who did what, and every kill. /guild/battle/eu/123?guild=<id> reads it from that guild's side. */
export function BattlePage() {
  return <GuildShell>{() => <BattleRoute />}</GuildShell>;
}

function BattleRoute() {
  const params = useParams();
  const [search] = useSearchParams();
  const region: Region | null = params.region === "eu" || params.region === "us" ? params.region : null;
  const id = /^[1-9]\d{0,14}$/.test(params.id ?? "") ? Number(params.id) : null;
  // keyed: another fight under this route never shows the last one's report
  return <BattleBody key={`${region}/${id}`} region={region} id={id} focus={search.get("guild")} />;
}

function BattleBody({ region, id, focus }: { region: Region | null; id: number | null; focus: string | null }) {
  const [report, setReport] = useState<BattleReport | null>(() => (region && id ? cachedBattle(region, id) : null));
  const [error, setError] = useState<GuildApiError | null>(null);
  const [version, setVersion] = useState(0);

  useSeo({
    title: "Albion Online battle report | Blackmarket Reader",
    description: "An Albion Online fight: alliances, guilds and players with kills, deaths, damage and the silver lost.",
    canonical: `https://blackmarketreader.com/guild/battle/${region ?? "eu"}/${id ?? ""}`,
    noindex: true
  });

  useEffect(() => {
    if (!region || !id) return;
    let alive = true;
    setError(null);
    loadBattle(region, id)
      .then((next) => alive && setReport(next))
      .catch((err: unknown) => alive && setError(err instanceof GuildApiError ? err : new GuildApiError("Something went wrong. Try again in a minute.", 0)));
    return () => {
      alive = false;
    };
  }, [region, id, version]);

  if (!region || !id) return <Problem text="This is not a fight's address." />;
  if (error && !report) return <Problem text={error.status === 404 ? "Albion's killboard does not know this fight." : error.message} retry={error.status === 404 ? undefined : () => setVersion((v) => v + 1)} />;
  if (!report) {
    return (
      <main className="gd" aria-busy="true">
        <Loading head what="Loading the battle report: every kill of the fight, with prices" />
        <div className="gd-skeleton" />
      </main>
    );
  }
  return <Report report={report} region={region} focus={focus} />;
}

function Report({ report, region, focus }: { report: BattleReport; region: Region; focus: string | null }) {
  const { battle, alliances, guilds, players, kills } = report;
  const focusGuild = focus ? (guilds.find((g) => g.id === focus) ?? null) : null;
  const lost = kills.reduce((t, k) => t + k.value, 0);
  const title = alliances.length >= 2 ? `${alliances[0].name} vs ${alliances[1].name}` : guilds.length >= 2 ? `${guilds[0].name} vs ${guilds[1].name}` : "Fight";
  // the best player per number; a number nobody has is left out
  const best = BEST.map((b) => ({ ...b, player: players.reduce<BattlePlayer | null>((top, p) => (p[b.key] > (top?.[b.key] ?? 0) ? p : top), null) })).filter(
    (b): b is (typeof BEST)[number] & { player: BattlePlayer } => b.player !== null
  );

  return (
    <main className="gd">
      <section className="gd-card gd-head">
        <div>
          <p className="gd-kicker">
            BATTLE · {serverName(region)}
            {focusGuild ? ` · FOR ${focusGuild.name.toUpperCase()}` : ""}
          </p>
          <h2 className="gd-guild-name">{title}</h2>
          <p className="gd-meta">
            <span>{new Date(battle.startTime).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
            <span>
              <b>{duration(battle.startTime, battle.endTime)}</b>
            </span>
            <span>
              <b>{battle.players}</b> players
            </span>
            <span>
              <b>{alliances.length}</b> alliances · <b>{guilds.length}</b> guilds
            </span>
          </p>
        </div>
        <div className="gd-head-actions">
          {focusGuild ? (
            <Link className="gd-btn" to={guildPath({ region, slug: slugOf(focusGuild.name) })} state={{ id: focusGuild.id }}>
              ← {focusGuild.name}
            </Link>
          ) : null}
          <a className="gd-btn" href={`https://albiononline.com/killboard/battles/${battle.id}`} target="_blank" rel="noreferrer">
            Albion killboard ↗
          </a>
        </div>
      </section>

      <section className="gd-stats">
        <div className="gd-card gd-stat">
          <small>KILLS</small>
          <b className="is-green">{battle.kills}</b>
          <span>{shortPrice(battle.fame)} fame</span>
        </div>
        <div className="gd-card gd-stat">
          <small>PLAYERS</small>
          <b>{battle.players}</b>
          <span>
            {alliances.length} alliances · {guilds.length} guilds
          </span>
        </div>
        <div className="gd-card gd-stat">
          <small>SILVER LOST</small>
          <b className="is-gold">{report.priced ? shortPrice(lost) : "–"}</b>
          <span>gear and bags of the dead</span>
        </div>
        <div className="gd-card gd-stat">
          <small>LASTED</small>
          <b>{duration(battle.startTime, battle.endTime)}</b>
          <span>{new Date(battle.startTime).toLocaleDateString("en-GB", { dateStyle: "medium" })}</span>
        </div>
      </section>

      {best.length ? (
        <section className="gd-best">
          {best.map((b) => (
            <div key={b.label} className="gd-card gd-best-card">
              <small>{b.label}</small>
              <span className="gd-best-who">
                {b.player.weapon ? <img src={itemIcon(b.player.weapon.type, b.player.weapon.quality, 64)} alt="" width={40} height={40} loading="lazy" decoding="async" /> : null}
                <span>
                  <b>{b.player.name}</b>
                  <small>{b.player.guildName ?? "no guild"}</small>
                </span>
              </span>
              <strong>{b.value(b.player)}</strong>
            </div>
          ))}
        </section>
      ) : null}

      <section className="gd-grid2">
        <SideTable title="Alliances" sides={alliances} focusId={focusGuild?.allianceName ? (alliances.find((a) => a.name === focusGuild.allianceName)?.id ?? null) : null} />
        <SideTable title="Guilds" sides={guilds} focusId={focusGuild?.id ?? null} region={region} />
      </section>

      <PlayerTable players={players} guilds={guilds} focusId={focusGuild?.id ?? null} />

      <KillList report={report} focusId={focusGuild?.id ?? null} />
    </main>
  );
}

function SideTable({ title, sides, focusId, region }: { title: string; sides: BattleSide[]; focusId: string | null; region?: Region }) {
  const [all, setAll] = useState(false);
  const shown = all ? sides : sides.slice(0, SIDES_SHOWN);
  return (
    <div className="gd-card gd-sides">
      <div className="gd-list-head">
        <h2>{title}</h2>
        <span className="gd-muted">{sides.length}</span>
      </div>
      <div className="gd-row is-head">
        <span>NAME</span>
        <span className="gd-num">PLAYERS</span>
        <span className="gd-num">K / D</span>
        <span className="gd-num gd-col-mid">KILL FAME</span>
      </div>
      {shown.map((s) => {
        const name = region ? (
          <Link to={guildPath({ region, slug: slugOf(s.name) })} state={{ id: s.id }}>
            {s.name}
          </Link>
        ) : (
          s.name
        );
        return (
          <div key={s.id} className={`gd-row${s.id === focusId ? " is-focus" : ""}`}>
            <span className="gd-who">
              <b>{name}</b>
            </span>
            <span className="gd-num">{s.players}</span>
            <span className={`gd-num ${s.kills >= s.deaths ? "is-green" : "is-red"}`}>
              {s.kills} / {s.deaths}
            </span>
            <span className="gd-num gd-col-mid">{shortPrice(s.killFame)}</span>
          </div>
        );
      })}
      {sides.length > shown.length ? (
        <div className="gd-foot">
          <button type="button" className="gd-btn" onClick={() => setAll(true)}>
            Show all {sides.length}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PlayerTable({ players, guilds, focusId }: { players: BattlePlayer[]; guilds: BattleSide[]; focusId: string | null }) {
  const [sort, setSort] = useState<Sort>("killFame");
  const [guild, setGuild] = useState(focusId ?? "all");
  const [needle, setNeedle] = useState("");
  const [all, setAll] = useState(false);
  const list = useMemo(() => {
    const q = needle.trim().toLowerCase();
    return players
      .filter((p) => (guild === "all" || p.guildId === guild) && (!q || p.name.toLowerCase().includes(q) || (p.guildName ?? "").toLowerCase().includes(q)))
      .sort((a, b) => b[sort] - a[sort] || b.killFame - a.killFame);
  }, [players, sort, guild, needle]);
  const shown = all ? list : list.slice(0, PLAYERS_SHOWN);
  return (
    <section className="gd-card gd-players">
      <div className="gd-list-head">
        <h2>Players</h2>
        <input className="gd-filter" type="search" value={needle} onChange={(e) => setNeedle(e.target.value)} placeholder="Find a player or guild" aria-label="Find a player or guild" />
      </div>
      <div className="gd-list-head gd-list-tools">
        <select className="gd-select" value={guild} onChange={(e) => setGuild(e.target.value)} aria-label="Guild">
          <option value="all">Every guild</option>
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.players})
            </option>
          ))}
        </select>
        <div className="gd-chips" role="group" aria-label="Sort">
          {SORTS.map((s) => (
            <button key={s.key} type="button" className={`gd-chip${sort === s.key ? " is-on" : ""}`} aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="gd-row is-head">
        <span>PLAYER</span>
        <span className="gd-num">K / D</span>
        <span className="gd-num">KILL FAME</span>
        <span className="gd-num gd-col-mid">DAMAGE</span>
        <span className="gd-num gd-col-mid">ASSISTS</span>
        <span className="gd-num gd-col-mid">HEALS</span>
        <span className="gd-num gd-col-mid">IP</span>
      </div>
      {shown.map((p) => (
        <div key={p.id} className={`gd-row${p.guildId === focusId ? " is-focus" : ""}`}>
          <span className="gd-who gd-who-icon">
            {p.weapon ? <img src={itemIcon(p.weapon.type, p.weapon.quality, 64)} alt="" width={34} height={34} loading="lazy" decoding="async" /> : <span className="gd-noitem is-small" aria-hidden="true" />}
            <span>
              <b>{p.name}</b>
              <small>
                {p.guildName ?? "no guild"}
                {p.allianceName ? ` · ${p.allianceName}` : ""}
              </small>
            </span>
          </span>
          <span className="gd-num">
            <span className="is-green">{p.kills}</span> / <span className="is-red">{p.deaths}</span>
          </span>
          <span className="gd-num gd-strong">{p.killFame ? shortPrice(p.killFame) : "–"}</span>
          <span className="gd-num gd-col-mid">{p.damage ? shortPrice(p.damage) : "–"}</span>
          <span className="gd-num gd-col-mid">{p.assists || "–"}</span>
          <span className="gd-num gd-col-mid">{p.healAssists || "–"}</span>
          <span className="gd-num gd-col-mid gd-muted">{p.itemPower || "–"}</span>
        </div>
      ))}
      {!list.length ? <p className="gd-empty">Nobody matches.</p> : null}
      <div className="gd-foot">
        <span>Kills, deaths and kill fame: Albion's own sums. Damage: dealt to players who died. Assists: kills helped with. Heals: kills helped by healing.</span>
        {list.length > shown.length ? (
          <button type="button" className="gd-btn" onClick={() => setAll(true)}>
            Show all {list.length}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function KillList({ report, focusId }: { report: BattleReport; focusId: string | null }) {
  const [side, setSide] = useState<"all" | "kills" | "deaths">("all");
  const [count, setCount] = useState(KILLS_SHOWN);
  const list = report.kills.filter((k) => !focusId || side === "all" || (side === "kills" ? k.killer.guildId === focusId : k.victim.guildId === focusId));
  return (
    <section className="gd-card">
      <div className="gd-list-head">
        <h2>Kills</h2>
        {focusId ? (
          <div className="gd-chips" role="group" aria-label="Show">
            {(["all", "kills", "deaths"] as const).map((s) => (
              <button key={s} type="button" className={`gd-chip${side === s ? " is-on" : ""}`} aria-pressed={side === s} onClick={() => setSide(s)}>
                {s === "all" ? `All ${report.kills.length}` : s === "kills" ? "Our kills" : "Our deaths"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {list.length ? (
        <ul className="gd-kills">
          {list.slice(0, count).map((event) => (
            <KillRow key={event.id} event={event} guildId={focusId} />
          ))}
        </ul>
      ) : (
        <p className="gd-empty">{report.kills.length ? "None of these." : "Albion has not listed this fight's kills yet. Try again in a few minutes."}</p>
      )}
      <div className="gd-foot">
        <span>
          {report.complete ? "" : "Some kills of this fight could not be read: the numbers above are Albion's own, the list may miss kills. "}
          {report.priced
            ? `Values: the cheapest believable sell order per item on this server, from the last 3 days.${report.pricesComplete ? "" : " Some items had no price lookup and count as 0."}`
            : "Prices could not load right now, so values are missing."}
        </span>
        {list.length > count ? (
          <button type="button" className="gd-btn" onClick={() => setCount((c) => c + KILLS_SHOWN * 2)}>
            Show more ({list.length - count})
          </button>
        ) : null}
      </div>
    </section>
  );
}

function Problem({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <main className="gd">
      <p className="gd-error" role="alert">
        {text}
      </p>
      <p className="gd-actions-row">
        {retry ? (
          <button type="button" className="gd-btn" onClick={retry}>
            Try again
          </button>
        ) : null}
        <Link className="gd-btn" to="/guild">
          Search a guild
        </Link>
      </p>
    </main>
  );
}
