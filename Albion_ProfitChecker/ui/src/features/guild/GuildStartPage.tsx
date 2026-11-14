import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Region } from "@shared/types";
import { useSeo } from "../../shared/seo/useSeo";
import { fetchMyGuild, guildPath, searchGuilds, type GuildHit, type GuildRef } from "./api";
import { GUILD_TOOLS } from "./core/tools";
import { GuildShell } from "./GuildShell";
import { useAccessToken } from "./useAccessToken";

const SEARCH_DELAY_MS = 300;

export function GuildStartPage() {
  useSeo({
    title: "Albion Online Guild Tools: Activity, Regear and Attendance | Blackmarket Reader",
    description:
      "Free Albion Online guild tools: see which members are active, quiet or inactive, follow your guild's fights and, soon, regear, attendance and the guild bank, straight from the killboard.",
    keywords: "Albion Online guild tools, Albion guild activity, Albion inactive members, Albion regear, Albion guild management",
    canonical: "https://blackmarketreader.com/guild"
  });
  return <GuildShell>{(region, setRegion) => <StartBody region={region} setRegion={setRegion} />}</GuildShell>;
}

function StartBody({ region, setRegion }: { region: Region; setRegion: (next: Region) => void }) {
  const { token, ready } = useAccessToken();
  const [mine, setMine] = useState<GuildRef | null | undefined>(undefined);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setMine(null);
      return;
    }
    let alive = true;
    fetchMyGuild(token)
      .then((guild) => alive && setMine(guild))
      .catch(() => alive && setMine(null));
    return () => {
      alive = false;
    };
  }, [token, ready]);

  return (
    <main className="gd">
      <section className="gd-hero">
        <p className="gd-kicker">GUILD TOOLS</p>
        <h2>
          Run your guild.
          <br />
          <span>Not spreadsheets.</span>
        </h2>
        <p>Find your guild and see who plays, who went quiet and who left, straight from Albion's killboard. Free, the data is public.</p>
      </section>

      <GuildSearch region={region} setRegion={setRegion} />

      <div className="gd-section-title">
        <h2>Your guild</h2>
        <span>the guild you manage</span>
      </div>
      {mine === undefined ? (
        <div className="gd-skeleton is-row" />
      ) : mine ? (
        <Link className="gd-card gd-mine" to={guildPath(mine)}>
          <span className="gd-crest">{mine.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <b>{mine.name}</b>
            <p className="gd-muted">You manage this guild · {mine.region.toUpperCase()}</p>
          </div>
          <span className="gd-btn is-primary">Open</span>
        </Link>
      ) : (
        <div className="gd-card gd-mine">
          <span className="gd-crest">+</span>
          <div>
            <b>Manage your guild</b>
            <p className="gd-muted">
              {token ? "Search your guild above and press “Manage this guild” on its page." : "Sign in, then search your guild above. Viewing works without an account."}
            </p>
          </div>
          {token ? null : (
            <Link className="gd-btn is-primary" to="/login?next=%2Fguild">
              Sign in
            </Link>
          )}
        </div>
      )}

      <div className="gd-section-title">
        <h2>Tools for guild leaders</h2>
        <span>more are on the way</span>
      </div>
      <section className="gd-tools">
        {GUILD_TOOLS.map((tool) => (
          <div key={tool.key} className="gd-card gd-tool">
            <span className="gd-tool-icon" aria-hidden="true">
              {tool.icon}
            </span>
            <b>{tool.label}</b>
            <span>{tool.text}</span>
            {tool.ready ? null : <span className="gd-soon">SOON</span>}
          </div>
        ))}
      </section>
    </main>
  );
}

function GuildSearch({ region, setRegion }: { region: Region; setRegion: (next: Region) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GuildHit[] | null>(null);
  const [error, setError] = useState("");
  const q = query.trim();

  useEffect(() => {
    setError("");
    if (q.length < 2) {
      setHits(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchGuilds(region, q, controller.signal)
        .then(setHits)
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setHits(null);
          setError(err instanceof Error ? err.message : "Search failed.");
        });
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q, region]);

  return (
    <section className="gd-card gd-search" aria-label="Find a guild">
      <div className="gd-search-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Guild name, e.g. “Angry fuzzies”" aria-label="Guild name" autoComplete="off" spellCheck={false} />
        <div className="gd-chips" role="group" aria-label="Server">
          {(["eu", "us"] as Region[]).map((r) => (
            <button key={r} type="button" className={`gd-chip${r === region ? " is-on" : ""}`} aria-pressed={r === region} onClick={() => setRegion(r)}>
              {r === "eu" ? "Europe" : "America"}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="gd-error">{error}</p> : null}
      {hits ? (
        hits.length ? (
          <div className="gd-hits">
            {hits.map((hit) => (
              <Link key={hit.id} className="gd-hit" to={guildPath({ region, slug: hit.slug })} state={{ id: hit.id }}>
                <span className="gd-crest is-small">{hit.name.slice(0, 1).toUpperCase()}</span>
                <span>
                  <b>{hit.name}</b>
                  <small>{hit.allianceName ? `Alliance ${hit.allianceName} · ` : ""}{region === "eu" ? "Europe" : "America"}</small>
                </span>
                <span className="gd-btn">Open</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="gd-muted">No guild with that name on the {region === "eu" ? "Europe" : "America"} server.</p>
        )
      ) : null}
    </section>
  );
}
