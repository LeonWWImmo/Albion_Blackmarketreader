import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { shortPrice } from "../../price-checker/ui/format";
import { GuildApiError, guildPath, markGuild, unmarkGuild, type GuildPageData } from "../api";
import { GUILD_TABS, GUILD_TOOLS, type GuildTab } from "../core/tools";
import { timeAgo } from "../core/view";
import { premiumVisible } from "@shared/premium/premium";
import type { MyGuild } from "../useMyGuild";
import { GuildCrest } from "./GuildCrest";

type Props = { data: GuildPageData; tab: GuildTab; mine: MyGuild; onChanged: () => void };

const TAB_KEYS = new Set<string>(GUILD_TABS.map((t) => t.key));

/** The guild's card (crest, name, numbers, Mark button) and its tabs. */
export function GuildHeader({ data, tab, mine, onChanged }: Props) {
  const { guild, tracking } = data;
  const now = new Date();
  return (
    <>
      <section className="gd-card gd-head">
        {/* the coat of arms as the card's emblem, behind the name, not an icon in front of it */}
        <GuildCrest id={guild.id} name={guild.name} size={150} className="gd-head-crest" />
        <div>
          <p className="gd-kicker">GUILD · {guild.region === "eu" ? "EUROPE" : "AMERICA"}</p>
          <h2 className="gd-guild-name">{guild.name}</h2>
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
                Snapshot <b>{timeAgo(tracking.lastSyncedAt, now)}</b>
              </span>
            ) : null}
          </p>
        </div>
        <MarkButton data={data} mine={mine} onChanged={onChanged} />
      </section>
      <nav className="gd-tabs" aria-label="Guild tools">
        {GUILD_TABS.map((t) => (
          <Link key={t.key} className={`gd-tab${t.key === tab ? " is-on" : ""}`} to={guildPath(guild, t.key)} aria-current={t.key === tab ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
        {GUILD_TOOLS.filter((tool) => !tool.ready && !TAB_KEYS.has(tool.key)).map((tool) => (
          <span key={tool.key} className="gd-tab" aria-disabled="true">
            {tool.label}
            <span className="gd-soon">SOON</span>
          </span>
        ))}
      </nav>
    </>
  );
}

function MarkButton({ data, mine, onChanged }: Omit<Props, "tab">) {
  const { pathname } = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { guild, tracking } = data;
  // one marked guild per server (Guild Pro: more; the server says no without it)
  const markedOnServer = mine.on(guild.region);
  const markedHere = mine.has(guild.id);
  const others = Math.max(0, tracking.markedBy - (markedHere ? 1 : 0));

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

  if (!tracking.canMark) return null;
  const { token } = mine;
  let body;
  if (!mine.loaded) {
    body = null;
  } else if (!token) {
    body = (
      <Link className="gd-btn is-primary" to={`/login?next=${encodeURIComponent(pathname)}`} title="Marked guilds get a daily snapshot: fame gained per day and week">
        ☆ Sign in to mark
      </Link>
    );
  } else if (markedHere) {
    body = (
      <button type="button" className="gd-btn is-marked" disabled={busy} onClick={() => void run(() => unmarkGuild(token, guild.region, guild.id))} title="Remove your mark">
        ★ Marked
      </button>
    );
  } else {
    body = (
      <button
        type="button"
        className="gd-btn is-primary"
        disabled={busy}
        onClick={() => void run(() => markGuild(token, guild.region, guild.id))}
        title={
          markedOnServer
            ? premiumVisible()
              ? `You marked ${markedOnServer.name} on this server: Guild Pro marks up to 5 guilds per server, without it unmark that one first`
              : `You marked ${markedOnServer.name} on this server: marking this guild asks you to unmark that one first`
            : "Marked guilds get a daily snapshot: fame gained per day and week. One guild per server (Europe and America)."
        }
      >
        {busy ? "Marking…" : "☆ Mark"}
      </button>
    );
  }

  return (
    <div className="gd-head-actions">
      {others ? <span className="gd-pill">{others === 1 ? "1 other player marked it" : `${others} other players marked it`}</span> : null}
      {body}
      {error ? (
        <p className="gd-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
