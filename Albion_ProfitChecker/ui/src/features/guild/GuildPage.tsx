import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Region } from "@shared/types";
import { useSeo } from "../../shared/seo/useSeo";
import { GuildApiError, fetchGuild, guildPath, type GuildPageData } from "./api";
import { isGuildTab, type GuildTab } from "./core/tools";
import { GuildShell } from "./GuildShell";
import { ActivityTab } from "./ui/ActivityTab";
import { GuildHeader } from "./ui/GuildHeader";
import { OverviewTab } from "./ui/OverviewTab";
import { useAccessToken } from "./useAccessToken";

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
  const { token, ready } = useAccessToken();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<GuildApiError | null>(null);
  const [version, setVersion] = useState(0);
  const key = `${region}/${slug}`;
  const data = loaded?.key === key ? loaded.data : null;

  useSeo({
    title: data ? `${data.guild.name}: Albion Online guild activity | Blackmarket Reader` : "Albion Online guild | Blackmarket Reader",
    description: data ? `Who is active in the Albion Online guild ${data.guild.name}: members, activity and recent fights.` : "Albion Online guild activity.",
    canonical: `https://blackmarketreader.com/guild/${region ?? "eu"}/${slug}`,
    noindex: true
  });

  useEffect(() => {
    if (!ready || !region) return;
    const controller = new AbortController();
    setError(null);
    fetchGuild(region, slug, idFromSearch, token, controller.signal)
      .then((next) => {
        setLoaded({ key: `${region}/${next.guild.slug}`, data: next });
        // a renamed guild, or a name shared by two guilds: show the address that always finds it
        if (next.guild.slug !== slug) navigate(guildPath(next.guild, tab), { replace: true, state: { id: next.guild.id } });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof GuildApiError ? err : new GuildApiError("Something went wrong. Try again in a minute.", 0));
      });
    return () => controller.abort();
    // `tab` only shapes the redirect address: switching tabs must not reload the guild
  }, [region, slug, idFromSearch, token, ready, version]);

  if (!region) return <Problem text="Guild pages are on the Europe (eu) or America (us) server." />;
  if (error && !data) {
    return <Problem text={error.message} retry={error.status === 404 ? undefined : () => setVersion((v) => v + 1)} />;
  }
  if (!data) {
    return (
      <main className="gd" aria-busy="true">
        <div className="gd-skeleton is-head" />
        <div className="gd-skeleton" />
      </main>
    );
  }
  return (
    <main className="gd">
      <GuildHeader data={data} tab={tab} token={token} onChanged={() => setVersion((v) => v + 1)} />
      {tab === "activity" ? <ActivityTab data={data} /> : <OverviewTab data={data} />}
    </main>
  );
}

function Problem({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <main className="gd">
      <p className="gd-error" role="alert">
        {text}
      </p>
      <p>
        {retry ? (
          <button type="button" className="gd-btn" onClick={retry}>
            Try again
          </button>
        ) : null}{" "}
        <Link className="gd-btn" to="/guild">
          Search a guild
        </Link>
      </p>
    </main>
  );
}
