import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Region } from "@shared/types";
import { useSeo } from "../../shared/seo/useSeo";
import { GuildApiError, guildPath, type GuildPageData } from "./api";
import { cachedGuild, loadGuild } from "./core/guildData";
import { isGuildTab, type GuildTab } from "./core/tools";
import { GuildShell } from "./GuildShell";
import { ActivityTab } from "./ui/ActivityTab";
import { AttendanceTab } from "./ui/AttendanceTab";
import { BattlesTab } from "./ui/BattlesTab";
import { BankLogTab } from "./ui/BankLogTab";
import { DiscordTab } from "./ui/DiscordTab";
import { GuildHeader } from "./ui/GuildHeader";
import { Loading } from "./ui/Loading";
import { KillboardTab } from "./ui/KillboardTab";
import { OverviewTab } from "./ui/OverviewTab";
import { RegearTab } from "./ui/RegearTab";
import { useMyGuild } from "./useMyGuild";

export function GuildPage() {
  return <GuildShell>{() => <GuildBody />}</GuildShell>;
}

type Loaded = { key: string; data: GuildPageData };

function GuildBody() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const region: Region | null = params.region === "eu" || params.region === "us" ? params.region : null;
  const slug = params.slug ?? "";
  const tab: GuildTab = isGuildTab(params.tab) ? params.tab : "overview";
  const idFromSearch = (location.state as { id?: string } | null)?.id ?? null;
  const key = `${region}/${slug}`;
  const [loaded, setLoaded] = useState<Loaded | null>(() => {
    const hit = region ? cachedGuild(region, slug, idFromSearch) : null;
    return hit ? { key, data: hit.data } : null;
  });
  const [error, setError] = useState<GuildApiError | null>(null);
  const [version, setVersion] = useState(0);
  // never another guild's data under this address (two guilds can share a name)
  const data = loaded?.key === key && (!idFromSearch || loaded.data.guild.id === idFromSearch) ? loaded.data : null;
  // read by the redirect when an answer arrives: the tab the visitor is on by then
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const mine = useMyGuild();

  useSeo({
    title: data ? `${data.guild.name}: Albion Online guild activity | Blackmarket Reader` : "Albion Online guild | Blackmarket Reader",
    description: data ? `Who is active in the Albion Online guild ${data.guild.name}: members, activity, kills and deaths.` : "Albion Online guild activity.",
    canonical: `https://blackmarketreader.com/guild/${region ?? "eu"}/${slug}`,
    noindex: true
  });

  useEffect(() => {
    if (!region) return;
    let alive = true;
    const cached = cachedGuild(region, slug, idFromSearch);
    if (cached) setLoaded({ key: `${region}/${slug}`, data: cached.data });
    // a fresh copy is shown as it is; an older one is shown and replaced when the new answer arrives
    if (cached?.fresh && version === 0) return;
    setError(null);
    loadGuild(region, slug, idFromSearch, version > 0)
      .then((next) => {
        if (!alive) return;
        setLoaded({ key: `${region}/${next.guild.slug}`, data: next });
        // a renamed guild, or a name shared by two guilds: show the address that always finds it
        if (next.guild.slug !== slug) navigate(guildPath(next.guild, tabRef.current), { replace: true, state: { id: next.guild.id } });
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof GuildApiError ? err : new GuildApiError("Something went wrong. Try again in a minute.", 0));
      });
    return () => {
      alive = false;
    };
  }, [region, slug, idFromSearch, version]);

  if (!region) return <Problem text="Guild pages are on the Europe (eu) or America (us) server." />;
  if (error && !data) return <Problem text={error.message} retry={error.status === 404 ? undefined : () => setVersion((v) => v + 1)} />;
  if (!data) {
    return (
      <main className="gd" aria-busy="true">
        {/* step by step: the overview first; every other tab loads its own part when it is opened */}
        <Loading head what="Loading the guild: members and latest fights" />
        <div className="gd-skeleton" />
      </main>
    );
  }
  return (
    <main className="gd">
      <GuildHeader
        data={data}
        tab={tab}
        mine={mine}
        onChanged={() => {
          mine.reload();
          setVersion((v) => v + 1);
        }}
      />
      {/* keyed by guild: another guild starts with fresh tab state (search text, loaded killboard) */}
      {tab === "activity" ? (
        <ActivityTab key={data.guild.id} data={data} />
      ) : tab === "killboard" ? (
        <KillboardTab key={data.guild.id} data={data} />
      ) : tab === "battles" ? (
        <BattlesTab key={data.guild.id} data={data} />
      ) : tab === "attendance" ? (
        <AttendanceTab key={data.guild.id} data={data} />
      ) : tab === "regear" ? (
        <RegearTab key={data.guild.id} data={data} />
      ) : tab === "bank" ? (
        <BankLogTab key={data.guild.id} data={data} />
      ) : tab === "discord" ? (
        <DiscordTab key={data.guild.id} data={data} mine={mine} />
      ) : (
        <OverviewTab data={data} />
      )}
    </main>
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
