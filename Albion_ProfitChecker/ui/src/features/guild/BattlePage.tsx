import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { Region } from "@shared/types";
import { useSeo } from "../../shared/seo/useSeo";
import { shortPrice } from "../price-checker/ui/format";
import { GuildApiError, guildPath, itemIcon, slugOf, type BattleGuild, type BattlePlayer, type BattleReport, type BattleSide } from "./api";
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

/** One fight's report, from the cache at once when it is there; `retry` asks again after an error. */
export function useBattle(region: Region | null, id: number | null) {
  const [report, setReport] = useState<BattleReport | null>(() => (region && id ? cachedBattle(region, id) : null));
  const [error, setError] = useState<GuildApiError | null>(null);
  const [version, setVersion] = useState(0);
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
  return { report, error, retry: () => setVersion((v) => v + 1) };
}

function BattleBody({ region, id, focus }: { region: Region | null; id: number | null; focus: string | null }) {
  const { report, error, retry } = useBattle(region, id);

  useSeo({
    title: "Albion Online battle report | Blackmarket Reader",
    description: "An Albion Online fight: alliances, guilds and players with kills, deaths, damage and the silver lost.",
    canonical: `https://blackmarketreader.com/guild/battle/${region ?? "eu"}/${id ?? ""}`,
    noindex: true
  });

  if (!region || !id) return <Problem text="This is not a fight's address." />;
  if (error && !report) return <Problem text={battleError(error)} retry={error.status === 404 ? undefined : retry} />;
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

export const battleError = (error: GuildApiError) => (error.status === 404 ? "Albion's killboard does not know this fight." : error.message);

/** "A vs B": the two sides with the most players. */
export function battleTitle(report: BattleReport): string {
  const sides = sidesOf(report.guilds);
  return sides.length >= 2 ? `${sides[0].name} vs ${sides[1].name}` : (sides[0]?.name ?? "Fight");
}

export type Side = { key: string; name: string; guilds: string[]; guildIds: string[]; players: number; kills: number; deaths: number; killFame: number };

/**
 * The sides of a fight: an alliance with all its guilds, or a guild without an alliance on its own.
 * Most players first.
 */
export function sidesOf(guilds: BattleGuild[]): Side[] {
  const sides = new Map<string, Side>();
  for (const g of guilds) {
    const key = g.allianceName ? `a:${g.allianceName}` : `g:${g.id}`;
    const side = sides.get(key) ?? { key, name: g.allianceName ? `[${g.allianceName}]` : g.name, guilds: [], guildIds: [], players: 0, kills: 0, deaths: 0, killFame: 0 };
    side.guilds.push(g.name);
    side.guildIds.push(g.id);
    side.players += g.players;
    side.kills += g.kills;
    side.deaths += g.deaths;
    side.killFame += g.killFame;
    sides.set(key, side);
  }
  return [...sides.values()].sort((a, b) => b.players - a.players || b.kills - a.kills);
}

function Report({ report, region, focus }: { report: BattleReport; region: Region; focus: string | null }) {
  const { battle, alliances, guilds } = report;
  const focusGuild = focus ? (guilds.find((g) => g.id === focus) ?? null) : null;
  return (
    <main className="gd">
      <section className="gd-card gd-head">
        <div>
          <p className="gd-kicker">
            BATTLE · {serverName(region)}
            {focusGuild ? ` · FOR ${focusGuild.name.toUpperCase()}` : ""}
          </p>
          <h2 className="gd-guild-name">{battleTitle(report)}</h2>
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

      <BattleReportBody report={report} region={region} focusId={focusGuild?.id ?? null} />
    </main>
  );
}

/**
 * Everything of a fight's report below its title, also shown inside a guild's Battles tab. Read
 * from top to bottom: who fought and who came out ahead, the totals, the best players, then every
 * player and every kill, and last the full lists of alliances and guilds.
 */
export function BattleReportBody({ report, region, focusId }: { report: BattleReport; region: Region; focusId: string | null }) {
  const { battle, alliances, guilds, players, kills } = report;
  const focusGuild = focusId ? (guilds.find((g) => g.id === focusId) ?? null) : null;
  const lost = kills.reduce((t, k) => t + k.value, 0);
  // the best player per number; a number nobody has is left out
  const best = BEST.map((b) => ({ ...b, player: players.reduce<BattlePlayer | null>((top, p) => (p[b.key] > (top?.[b.key] ?? 0) ? p : top), null) })).filter(
    (b): b is (typeof BEST)[number] & { player: BattlePlayer } => b.player !== null
  );
  return (
    <>
      <WhoFought guilds={guilds} focusId={focusGuild?.id ?? null} />

      <section className="gd-stats">
        <div className="gd-card gd-stat">
          <small>KILLS</small>
          <b className="is-green">{battle.kills}</b>
          <span>{shortPrice(battle.fame)} fame in all</span>
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
          <span>gear and bags of everyone who died</span>
        </div>
        <div className="gd-card gd-stat">
          <small>LASTED</small>
          <b>{duration(battle.startTime, battle.endTime)}</b>
          <span>{new Date(battle.startTime).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
        </div>
      </section>

      {best.length ? (
        <>
          <div className="gd-section-title">
            <h2>Best players</h2>
            <span className="gd-muted">of everyone in the fight, both sides</span>
          </div>
          <section className="gd-best">
            {best.map((b) => (
              <div key={b.label} className={`gd-card gd-best-card${focusGuild && b.player.guildId === focusGuild.id ? " is-focus" : ""}`}>
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
        </>
      ) : null}

      <PlayerTable players={players} guilds={guilds} focusId={focusGuild?.id ?? null} />

      <KillList report={report} focusId={focusGuild?.id ?? null} />

      <section className="gd-grid2">
        <SideTable
          title="Alliances"
          note="each alliance with its players, kills and deaths"
          sides={alliances}
          focusId={focusGuild?.allianceName ? (alliances.find((a) => a.name === focusGuild.allianceName)?.id ?? null) : null}
        />
        <SideTable title="Guilds" note="a name opens that guild's page" sides={guilds} focusId={focusGuild?.id ?? null} region={region} />
      </section>
    </>
  );
}

const SIDES_IN_SUMMARY = 4;

/** How the sides did: one bar per side, our side marked, and a plain sentence about how it went. */
function WhoFought({ guilds, focusId }: { guilds: BattleGuild[]; focusId: string | null }) {
  const sides = sidesOf(guilds);
  const shown = sides.slice(0, SIDES_IN_SUMMARY);
  const rest = sides.slice(SIDES_IN_SUMMARY);
  const ours = focusId ? (sides.find((s) => s.guildIds.includes(focusId)) ?? null) : null;
  const most = Math.max(1, ...shown.map((s) => s.players));
  const outcome = ours ? outcomeOf(ours) : null;
  return (
    <section className="gd-card gd-fought">
      <div className="gd-list-head">
        <h2>Who fought</h2>
        <span className="gd-muted">an alliance and all its guilds count as one side</span>
      </div>
      {ours && outcome ? <p className={`gd-fought-result ${outcome.tone}`}>{outcome.text(ours.name)}</p> : null}
      <ul className="gd-fought-list">
        {shown.map((s) => (
          <li key={s.key} className={s === ours ? "is-focus" : undefined}>
            <span className="gd-fought-name">
              <b>
                {s.name} {s === ours ? <span className="gd-pill is-violet">your side</span> : null}
              </b>
              <small>{sideGuilds(s)}</small>
            </span>
            <span className="gd-fought-bar" aria-hidden="true">
              <i style={{ width: `${Math.round((s.players / most) * 100)}%` }} />
            </span>
            <span className="gd-num">
              <b>{s.players}</b>
              <small>players</small>
            </span>
            <span className="gd-num">
              <b className="is-green">{s.kills}</b>
              <small>kills</small>
            </span>
            <span className="gd-num">
              <b className="is-red">{s.deaths}</b>
              <small>deaths</small>
            </span>
          </li>
        ))}
      </ul>
      {rest.length ? (
        <p className="gd-foot">
          <span>
            and {rest.length} smaller side{rest.length === 1 ? "" : "s"} with {rest.reduce((t, s) => t + s.players, 0)} players (all in the lists below)
          </span>
        </p>
      ) : null}
    </section>
  );
}

const sideGuilds = (s: Side) => (s.key.startsWith("g:") ? "no alliance" : `${s.guilds.slice(0, 3).join(", ")}${s.guilds.length > 3 ? ` +${s.guilds.length - 3} more` : ""}`);

/** How a side came out of the fight, by its kills against its deaths. */
export function outcomeOf(side: { kills: number; deaths: number }): { tone: string; text: (name: string) => string } {
  const score = `${side.kills} kills, ${side.deaths} deaths`;
  if (side.kills > side.deaths) return { tone: "is-green", text: (name) => `${name} came out ahead: ${score}.` };
  if (side.kills < side.deaths) return { tone: "is-red", text: (name) => `${name} lost more than it killed: ${score}.` };
  return { tone: "", text: (name) => `${name} came out even: ${score}.` };
}

function SideTable({ title, note, sides, focusId, region }: { title: string; note: string; sides: BattleSide[]; focusId: string | null; region?: Region }) {
  const [all, setAll] = useState(false);
  const shown = all ? sides : sides.slice(0, SIDES_SHOWN);
  return (
    <div className="gd-card gd-sides">
      <div className="gd-list-head">
        <h2>
          {title} <span className="gd-muted">{sides.length}</span>
        </h2>
        <span className="gd-muted">{note}</span>
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
        <span className="gd-muted gd-head-note">{focusId ? "your guild first; pick another or every guild" : "everyone in the fight"}</span>
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
        <span className="gd-muted gd-head-note">every kill of the fight; click one for both builds</span>
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
