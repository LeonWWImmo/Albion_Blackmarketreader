import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Region } from "@shared/types";
import { useSeo } from "../../shared/seo/useSeo";
import { guildPath, normalizeQuery, searchGuilds, type GuildHit } from "./api";
import { prefetchGuild } from "./core/guildData";
import { GUILD_TOOLS } from "./core/tools";
import { GuildShell } from "./GuildShell";
import { GuildCrest } from "./ui/GuildCrest";
import { useMyGuild } from "./useMyGuild";

const SEARCH_DELAY_MS = 220;
/** A pointer resting this long on a result loads that guild ahead; passing over does not. */
const HOVER_PREFETCH_MS = 200;
/** Search answers of this visit: typing back to an earlier query shows it at once. */
const searchCache = new Map<string, GuildHit[]>();
const SEARCH_CACHE_MAX = 50;

function rememberSearch(key: string, hits: GuildHit[]) {
  searchCache.delete(key);
  searchCache.set(key, hits);
  while (searchCache.size > SEARCH_CACHE_MAX) searchCache.delete(searchCache.keys().next().value as string);
}

export function GuildStartPage() {
  useSeo({
    title: "Albion Online Guild Tools: Activity, Regear and Attendance | Blackmarket Reader",
    description:
      "Free Albion Online guild tools: see which members are active, quiet or inactive, the guild's kills and deaths with full gear, and, soon, regear, attendance and the guild bank, straight from the killboard.",
    keywords: "Albion Online guild tools, Albion guild activity, Albion inactive members, Albion guild killboard, Albion regear, Albion guild management",
    canonical: "https://blackmarketreader.com/guild"
  });
  return <GuildShell>{(region, setRegion) => <StartBody region={region} setRegion={setRegion} />}</GuildShell>;
}

function StartBody({ region, setRegion }: { region: Region; setRegion: (next: Region) => void }) {
  const my = useMyGuild();
  const token = my.token;
  const mine = my.loaded ? my.guild : undefined;

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

      <div className="gd-section-title">
        <h2>Your guild</h2>
        <span>the guild you marked</span>
      </div>
      {mine === undefined ? (
        <div className="gd-skeleton is-row" />
      ) : mine ? (
        <Link className="gd-card gd-mine" to={guildPath(mine)}>
          <GuildCrest id={mine.id} name={mine.name} size={56} />
          <div>
            <b>{mine.name}</b>
            <p className="gd-muted">Marked · {mine.region === "eu" ? "Europe" : "America"}</p>
          </div>
          <span className="gd-btn is-primary">Open</span>
        </Link>
      ) : (
        <div className="gd-card gd-mine">
          <span className="gd-crest-empty" aria-hidden="true">
            +
          </span>
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
    </main>
  );
}

function GuildSearch({ region, setRegion }: { region: Region; setRegion: (next: Region) => void }) {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GuildHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const q = normalizeQuery(query);
  const cacheKey = `${region}:${q}`;

  useEffect(() => {
    setError("");
    setActive(0);
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
          setError(err instanceof Error ? err.message : "Search failed.");
        });
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q, region, cacheKey]);

  const open = (hit: GuildHit) => navigate(guildPath({ region, slug: hit.slug }), { state: { id: hit.id } });
  const hoverTimer = useRef<number | undefined>(undefined);
  const hoverStart = (hit: GuildHit) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => prefetchGuild(region, hit.slug, hit.id), HOVER_PREFETCH_MS);
  };
  const hoverEnd = () => window.clearTimeout(hoverTimer.current);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const shown = q.length >= 2 ? hits : null;
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
      <p className="gd-search-state" aria-live="polite">
        {loading ? "Searching…" : !error && shown && !shown.length ? `No guild with that name on the ${region === "eu" ? "Europe" : "America"} server.` : ""}
      </p>
      {error ? <p className="gd-error">{error}</p> : null}
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
              onPointerEnter={() => hoverStart(hit)}
              onPointerLeave={hoverEnd}
              onFocus={() => prefetchGuild(region, hit.slug, hit.id)}
              onTouchStart={() => prefetchGuild(region, hit.slug, hit.id)}
            >
              <GuildCrest id={hit.id} name={hit.name} size={40} />
              <span>
                <b>{hit.name}</b>
                <small>
                  {hit.allianceName ? `Alliance ${hit.allianceName} · ` : ""}
                  {region === "eu" ? "Europe" : "America"}
                </small>
              </span>
              <span className="gd-btn">Open</span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
