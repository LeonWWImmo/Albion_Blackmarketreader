import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Region } from "@shared/types";
import { useSeo } from "../../shared/seo/useSeo";
import { shortPrice } from "../price-checker/ui/format";
import { fetchTopGuilds, guildPath, normalizeQuery, searchGuilds, type GuildHit, type TopGuild, type TopRange } from "./api";
import { loadOnce, peek } from "./core/cache";
import { prefetchGuild } from "./core/guildData";
import { GUILD_TOOLS } from "./core/tools";
import { GuildShell } from "./GuildShell";
import { ErrorNote, shownError, type ShownError } from "./ui/ErrorNote";
import { useMyGuild } from "./useMyGuild";

const SEARCH_DELAY_MS = 150;
/** A pointer resting this long on a result loads that guild ahead; passing over does not. */
const HOVER_PREFETCH_MS = 200;
/** Search answers of this visit: typing back to an earlier query shows it at once. */
const searchCache = new Map<string, GuildHit[]>();
const SEARCH_CACHE_MAX = 50;
/** Albion's search answers at most this many guilds: a shorter answer holds every guild with that name. */
const SEARCH_FULL = 10;
/** Search filter on the guild's lifetime kill fame. */
const FAME_FILTERS = [
  { min: 0, label: "Any" },
  { min: 1e7, label: "10m+" },
  { min: 1e8, label: "100m+" },
  { min: 1e9, label: "1b+" }
];
const TOP_RANGES: { key: TopRange; label: string; note: string }[] = [
  { key: "week", label: "This week", note: "since Monday" },
  { key: "month", label: "This month", note: "since the 1st" }
];
/** The top list changes slowly: a copy younger than this is not asked again. */
const TOP_FRESH_MS = 10 * 60_000;
const serverName = (region: Region) => (region === "eu" ? "Europe" : "America");

/** Loads a guild ahead when a pointer rests on its link (passing over does not). */
function useHoverPrefetch(region: Region) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    start: (slug: string, id: string) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => prefetchGuild(region, slug, id), HOVER_PREFETCH_MS);
    },
    end: () => window.clearTimeout(timer.current)
  };
}

function rememberSearch(key: string, hits: GuildHit[]) {
  searchCache.delete(key);
  searchCache.set(key, hits);
  while (searchCache.size > SEARCH_CACHE_MAX) searchCache.delete(searchCache.keys().next().value as string);
}

/**
 * The answer for "volans b" read from the one for "volans" when that one is complete (fewer than
 * Albion's 10): every guild named "…volans b…" is named "…volans…" too. Null when no such answer.
 */
function fromShorterSearch(region: Region, q: string): { hits: GuildHit[]; complete: boolean } | null {
  for (let len = q.length - 1; len >= 2; len--) {
    const shorter = searchCache.get(`${region}:${q.slice(0, len)}`);
    if (!shorter) continue;
    const named = (hit: GuildHit) => normalizeQuery(hit.name);
    const rank = (hit: GuildHit) => (named(hit) === q ? 0 : named(hit).startsWith(q) ? 1 : 2);
    const hits = shorter.filter((hit) => named(hit).includes(q)).sort((a, b) => rank(a) - rank(b));
    return { hits, complete: shorter.length < SEARCH_FULL };
  }
  return null;
}

/** A guild with no kill and no death fame at all: often a bank or alt guild of a bigger one. */
const neverFought = (hit: GuildHit) => hit.killFame === 0 && hit.deathFame === 0;

export function GuildStartPage() {
  useSeo({
    title: "Albion Online Guild Tools: Activity, Regear and Attendance | Blackmarket Reader",
    description:
      "Free Albion Online guild tools: see which members are active, quiet or inactive, the guild's kills and deaths with full gear, battle reports, regear lists, attendance, the guild bank and a daily Discord report, straight from the killboard.",
    keywords: "Albion Online guild tools, Albion guild activity, Albion inactive members, Albion guild killboard, Albion regear, Albion guild management",
    canonical: "https://blackmarketreader.com/guild"
  });
  return <GuildShell>{(region, setRegion) => <StartBody region={region} setRegion={setRegion} />}</GuildShell>;
}

function StartBody({ region, setRegion }: { region: Region; setRegion: (next: Region) => void }) {
  const my = useMyGuild();
  const token = my.token;
  const mine = my.loaded ? my.guilds : undefined;

  return (
    <main className="gd">
      <section className="gd-hero">
        <p className="gd-kicker">GUILD TOOLS</p>
        <h2>
          Run your guild.
          <br />
          <span>Not spreadsheets.</span>
        </h2>
        <p>Find any guild and see who plays, who went quiet and who left, plus its kills and deaths, straight from Albion's killboard.</p>
      </section>

      <GuildSearch region={region} setRegion={setRegion} />

      <TopGuilds region={region} setRegion={setRegion} />

      <div className="gd-section-title">
        <h2>Your guilds</h2>
        <span>one marked guild per server</span>
      </div>
      {mine === undefined ? (
        <div className="gd-skeleton is-row" />
      ) : mine.length ? (
        <>
          {mine.map((g) => (
            <Link key={g.id} className="gd-card gd-mine" to={guildPath(g)}>
              <div>
                <b className="gd-guild-name">{g.name}</b>
                <p className="gd-muted">Marked · {g.region === "eu" ? "Europe" : "America"}</p>
              </div>
              <span className="gd-btn is-primary">Open</span>
            </Link>
          ))}
          {mine.length < 2 ? (
            <p className="gd-muted gd-mine-more">You can mark one more guild on {mine[0].region === "eu" ? "America" : "Europe"}: switch the server and press “Mark” on its page.</p>
          ) : null}
        </>
      ) : (
        <div className="gd-card gd-mine">
          <div>
            <b>Mark a guild</b>
            <p className="gd-muted">{token ? "Search a guild above and press “Mark” on its page." : "Sign in, then mark a guild. Looking at any guild works without an account."}</p>
          </div>
          {token ? null : (
            <Link className="gd-btn is-primary" to="/login?next=%2Fguild">
              Sign in
            </Link>
          )}
        </div>
      )}

      <div className="gd-section-title">
        <h2>Tools</h2>
      </div>
      <section className="gd-tools">
        {GUILD_TOOLS.map((tool) => (
          <div key={tool.key} className={`gd-card gd-tool${tool.ready ? "" : " is-soon"}`}>
            <span className="gd-tool-icon" aria-hidden="true">
              {tool.icon}
            </span>
            <b>{tool.label}</b>
            {tool.ready ? null : <span className="gd-soon">SOON</span>}
          </div>
        ))}
      </section>
      <Link className="gd-card gd-mine" to="/guides/albion-online-guild-tools">
        <div>
          <b>New here? How the guild tools work</b>
          <p className="gd-muted">The guide: marking your guild, regear after a ZvZ, the bank log and loot splits, attendance and the Discord report.</p>
        </div>
        <span className="gd-btn">Read the guide</span>
      </Link>
    </main>
  );
}

function GuildSearch({ region, setRegion }: { region: Region; setRegion: (next: Region) => void }) {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GuildHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ShownError | null>(null);
  const [active, setActive] = useState(0);
  const [minFame, setMinFame] = useState(0);
  const [showQuiet, setShowQuiet] = useState(false);
  const q = normalizeQuery(query);
  const cacheKey = `${region}:${q}`;
  const hitsRegion = useRef(region);

  useEffect(() => {
    setError(null);
    setActive(0);
    setShowQuiet(false);
    // the other server's results would link to guilds that are not on this one
    if (hitsRegion.current !== region) {
      hitsRegion.current = region;
      setHits(null);
    }
    if (q.length < 2) {
      setHits(null);
      setLoading(false);
      return;
    }
    const cached = searchCache.get(cacheKey);
    if (cached) {
      setHits(cached);
      setLoading(false);
      return;
    }
    // typing on: the guilds of the shorter name at once, and no new search when that answer was complete
    const shorter = fromShorterSearch(region, q);
    if (shorter) setHits(shorter.hits);
    if (shorter?.complete) {
      rememberSearch(cacheKey, shorter.hits);
      setLoading(false);
      return;
    }
    // the last results stay on screen while the next ones load: no flicker while typing
    setLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchGuilds(region, q, controller.signal)
        .then((found) => {
          rememberSearch(cacheKey, found);
          setHits(found);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setLoading(false);
          setError(shownError(err, "Search failed."));
        });
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q, region, cacheKey]);

  const open = (hit: GuildHit) => navigate(guildPath({ region, slug: hit.slug }), { state: { id: hit.id } });
  const hover = useHoverPrefetch(region);
  const found = q.length >= 2 ? hits : null;
  const famous = found && minFame ? found.filter((hit) => (hit.killFame ?? 0) >= minFame) : found;
  // guilds that never fought are folded away while others did
  const fought = famous?.filter((hit) => !neverFought(hit)) ?? [];
  const quiet = famous && fought.length && !showQuiet ? famous.length - fought.length : 0;
  const shown = quiet ? fought : famous;
  const fameFilter = FAME_FILTERS.find((f) => f.min === minFame) ?? FAME_FILTERS[0];
  const optionId = (i: number) => `${listId}-${i}`;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!shown?.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = (active + (event.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length;
      setActive(next);
      prefetchGuild(region, shown[next].slug, shown[next].id);
    } else if (event.key === "Enter") {
      event.preventDefault();
      open(shown[active] ?? shown[0]);
    }
  };

  return (
    <section className="gd-card gd-search" aria-label="Find a guild">
      <div className="gd-search-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Guild name, e.g. “Angry fuzzies”"
          aria-label="Guild name"
          aria-controls={listId}
          aria-activedescendant={shown?.length ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="gd-chips" role="group" aria-label="Server">
          {(["eu", "us"] as Region[]).map((r) => (
            <button key={r} type="button" className={`gd-chip${r === region ? " is-on" : ""}`} aria-pressed={r === region} onClick={() => setRegion(r)}>
              {r === "eu" ? "Europe" : "America"}
            </button>
          ))}
        </div>
      </div>
      <div className="gd-fame-filter">
        <span>Kill fame</span>
        <div className="gd-chips" role="group" aria-label="Kill fame">
          {FAME_FILTERS.map((f) => (
            <button
              key={f.min}
              type="button"
              className={`gd-chip${f.min === minFame ? " is-on" : ""}`}
              aria-pressed={f.min === minFame}
              onClick={() => {
                setMinFame(f.min);
                setActive(0);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <p className="gd-search-state" aria-live="polite">
        {loading
          ? "Searching…"
          : error || !found
            ? ""
            : !found.length
              ? `No guild with that name on the ${serverName(region)} server.`
              : !shown?.length
                ? `None of the ${found.length} guilds found has ${fameFilter.label} kill fame. Albion's search shows the first 10 names only: type more of the name.`
                : ""}
      </p>
      {error ? <ErrorNote error={error} setRegion={setRegion} /> : null}
      {shown?.length ? (
        <div className={`gd-hits${loading ? " is-stale" : ""}`} id={listId} role="listbox" aria-label="Guilds">
          {shown.map((hit, i) => (
            <Link
              key={hit.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={`gd-hit${i === active ? " is-active" : ""}`}
              to={guildPath({ region, slug: hit.slug })}
              state={{ id: hit.id }}
              onPointerEnter={() => hover.start(hit.slug, hit.id)}
              onPointerLeave={hover.end}
              onFocus={() => prefetchGuild(region, hit.slug, hit.id)}
              onTouchStart={() => prefetchGuild(region, hit.slug, hit.id)}
            >
              <span>
                <b className="gd-guild-name">{hit.name}</b>
                <small>
                  {hit.allianceName ? `Alliance ${hit.allianceName} · ` : ""}
                  {hit.killFame !== null ? `${shortPrice(hit.killFame)} kill fame · ` : ""}
                  {serverName(region)}
                </small>
              </span>
              <span className="gd-btn">Open</span>
            </Link>
          ))}
        </div>
      ) : null}
      {quiet ? (
        <button type="button" className="gd-hits-more" onClick={() => setShowQuiet(true)}>
          + {quiet} {quiet === 1 ? "guild" : "guilds"} without any kill or death, often bank or alt guilds
        </button>
      ) : null}
    </section>
  );
}

/** The guilds with the most kill fame this week or month: one click opens their page. */
function TopGuilds({ region, setRegion }: { region: Region; setRegion: (next: Region) => void }) {
  const [range, setRange] = useState<TopRange>("week");
  const [, setVersion] = useState(0);
  const [error, setError] = useState<ShownError | null>(null);
  const hover = useHoverPrefetch(region);
  const key = `top:${region}:${range}`;

  useEffect(() => {
    setError(null);
    if ((peek(key)?.age ?? Infinity) < TOP_FRESH_MS) return;
    let live = true;
    loadOnce(key, () => fetchTopGuilds(region, range))
      .then(() => live && setVersion((v) => v + 1))
      .catch((err: unknown) => live && setError(shownError(err, "The top guilds could not load.")));
    return () => {
      live = false;
    };
  }, [key, region, range]);

  // an older copy shows at once while the new one loads
  const guilds = peek<TopGuild[]>(key)?.data ?? null;
  const current = TOP_RANGES.find((r) => r.key === range) ?? TOP_RANGES[0];

  return (
    <section aria-label="Top guilds">
      <div className="gd-section-title">
        <h2>Top guilds</h2>
        <div className="gd-chips" role="group" aria-label="Time range">
          {TOP_RANGES.map((r) => (
            <button key={r.key} type="button" className={`gd-chip${r.key === range ? " is-on" : ""}`} aria-pressed={r.key === range} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {guilds?.length ? (
        <ol className="gd-card gd-top">
          {guilds.map((g, i) => (
            <li key={g.id}>
              <Link
                className="gd-top-row"
                to={guildPath({ region, slug: g.slug })}
                state={{ id: g.id }}
                onPointerEnter={() => hover.start(g.slug, g.id)}
                onPointerLeave={hover.end}
                onFocus={() => prefetchGuild(region, g.slug, g.id)}
                onTouchStart={() => prefetchGuild(region, g.slug, g.id)}
              >
                <span className="gd-top-rank">{i + 1}</span>
                <span className="gd-top-name">
                  <b className="gd-guild-name">{g.name}</b>
                  <small>
                    {g.allianceTag ? `[${g.allianceTag}] · ` : ""}
                    {g.kills.toLocaleString("en-US")} kills · {g.deaths.toLocaleString("en-US")} deaths
                  </small>
                </span>
                <span className="gd-top-fame">
                  <b>{shortPrice(g.killFame)}</b>
                  <small>kill fame</small>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : error ? (
        <ErrorNote error={error} setRegion={setRegion} />
      ) : guilds ? (
        <p className="gd-card gd-muted gd-top-empty">No big fights on the {serverName(region)} server {current.note} yet.</p>
      ) : (
        <div className="gd-skeleton is-row" />
      )}
      <p className="gd-top-note">
        {serverName(region)} server, {current.label.toLowerCase()} ({current.note}): kill fame in the ~100 biggest fights on Albion's killboard.
      </p>
    </section>
  );
}
