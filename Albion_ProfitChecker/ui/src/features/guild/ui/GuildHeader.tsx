import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { shortPrice } from "../../price-checker/ui/format";
import { GuildApiError, guildPath, manageGuild, releaseGuild, type GuildPageData } from "../api";
import { GUILD_TABS, GUILD_TOOLS, type GuildTab } from "../core/tools";
import { timeAgo } from "../core/view";

type Props = { data: GuildPageData; tab: GuildTab; token: string | null; onChanged: () => void };

/** The guild's card (name, alliance, numbers, manage button) and its tabs. */
export function GuildHeader({ data, tab, token, onChanged }: Props) {
  const { guild, tracking } = data;
  const now = new Date();
  return (
    <>
      <section className="gd-card gd-head">
        <span className="gd-crest" aria-hidden="true">
          {guild.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <p className="gd-kicker">GUILD · {guild.region.toUpperCase()}</p>
          <h2>{guild.name}</h2>
          <p className="gd-meta">
            <span>
              Alliance <b>{guild.allianceTag ?? "–"}</b>
            </span>
            <span>
              <b>{guild.memberCount}</b> members
            </span>
            <span>
              Kill fame <b>{shortPrice(guild.killFame)}</b>
            </span>
            {guild.foundedAt ? (
              <span>
                Founded <b>{guild.foundedAt.slice(0, 7)}</b>
              </span>
            ) : null}
            {tracking.lastSyncedAt ? (
              <span>
                Updated <b>{timeAgo(tracking.lastSyncedAt, now)}</b>
              </span>
            ) : null}
          </p>
        </div>
        <ManageButton data={data} token={token} onChanged={onChanged} />
      </section>
      <nav className="gd-tabs" aria-label="Guild tools">
        {GUILD_TABS.map((t) => (
          <Link key={t.key} className={`gd-tab${t.key === tab ? " is-on" : ""}`} to={guildPath(guild, t.key)} aria-current={t.key === tab ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
        {GUILD_TOOLS.filter((tool) => !tool.ready).map((tool) => (
          <span key={tool.key} className="gd-tab" aria-disabled="true">
            {tool.label}
            <span className="gd-soon">SOON</span>
          </span>
        ))}
      </nav>
    </>
  );
}

function ManageButton({ data, token, onChanged }: Omit<Props, "tab">) {
  const { pathname } = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { guild, tracking } = data;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof GuildApiError ? err.message : "Something went wrong. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (tracking.managedByYou) {
    body = (
      <>
        <span className="gd-pill is-violet">You manage this guild</span>
        <button
          type="button"
          className="gd-btn"
          disabled={busy}
          onClick={() => {
            if (token && window.confirm(`Stop managing ${guild.name}? Its history stays, and the guild is free for someone else to manage.`)) void run(() => releaseGuild(token));
          }}
        >
          Stop managing
        </button>
      </>
    );
  } else if (tracking.managedByOther) {
    body = <span className="gd-pill">Managed by another player</span>;
  } else if (!tracking.canManage) {
    body = null;
  } else if (!token) {
    body = (
      <Link className="gd-btn is-primary" to={`/login?next=${encodeURIComponent(pathname)}`}>
        Sign in to manage
      </Link>
    );
  } else {
    body = (
      <button type="button" className="gd-btn is-primary" disabled={busy} onClick={() => void run(() => manageGuild(token, guild.region, guild.id))}>
        {busy ? "Starting…" : "Manage this guild"}
      </button>
    );
  }

  return (
    <div className="gd-head-actions">
      {body}
      {error ? (
        <p className="gd-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
