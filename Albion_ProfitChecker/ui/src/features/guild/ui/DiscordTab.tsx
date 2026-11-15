import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { GuildApiError, fetchHook, guildPath, removeHook, saveHook, type DiscordHook, type GuildPageData } from "../api";
import type { MyGuild } from "../useMyGuild";

const WEBHOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{15,25}\/[\w-]{20,100}$/;

/** The daily Discord report of the guild the player marked: set up with a Discord webhook. */
export function DiscordTab({ data, mine }: { data: GuildPageData; mine: MyGuild }) {
  const { guild } = data;
  const { pathname } = useLocation();
  const { token } = mine;
  const markedHere = mine.guild?.id === guild.id;

  return (
    <section className="gd-grid2">
      <div className="gd-card gd-discord">
        <div className="gd-list-head">
          <h2>Daily report in Discord</h2>
        </div>
        {!mine.loaded ? (
          <div className="gd-skeleton" aria-busy="true" />
        ) : !token ? (
          <div className="gd-discord-body">
            <p className="gd-muted">Sign in and mark your guild, then give a Discord webhook: the report comes there every day.</p>
            <Link className="gd-btn is-primary" to={`/login?next=${encodeURIComponent(pathname)}`}>
              Sign in
            </Link>
          </div>
        ) : !markedHere ? (
          <div className="gd-discord-body">
            <p className="gd-muted">
              The report is about the guild you marked.{" "}
              {mine.guild ? (
                <>
                  You marked <Link to={guildPath(mine.guild, "discord")}>{mine.guild.name}</Link>: set it up there, or unmark it and mark {guild.name}.
                </>
              ) : (
                <>Mark {guild.name} first (the ☆ Mark button above).</>
              )}
            </p>
          </div>
        ) : (
          <HookForm token={token} guildName={guild.name} />
        )}
      </div>
      <div className="gd-card gd-discord">
        <div className="gd-list-head">
          <h2>What it posts</h2>
        </div>
        <ul className="gd-discord-list">
          <li>Members: how many are active, quiet and inactive (14+ days)</li>
          <li>Who joined and who left since the last report</li>
          <li>The 5 members with the most fame in 7 days</li>
          <li>A link to the guild's Activity page</li>
        </ul>
        <p className="gd-muted">Once a day, right after the guild's daily snapshot (around 03:30 UTC). No pings: it mentions nobody.</p>
        <h3 className="gd-discord-how">Get a webhook link</h3>
        <ol className="gd-discord-list">
          <li>In Discord: Server settings → Integrations → Webhooks</li>
          <li>New Webhook, pick the channel, then Copy Webhook URL</li>
          <li>Paste it here. Only you and the server see it; the page shows its name only.</li>
        </ol>
      </div>
    </section>
  );
}

function HookForm({ token, guildName }: { token: string; guildName: string }) {
  const [hook, setHook] = useState<DiscordHook | null | undefined>(undefined);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchHook(token)
      .then((next) => alive && setHook(next))
      .catch((err: unknown) => {
        if (!alive) return;
        setHook(null);
        setError(err instanceof GuildApiError ? err.message : "Could not read your Discord report. Try again in a minute.");
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof GuildApiError ? err.message : "Something went wrong. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      setHook(await saveHook(token, url.trim()));
      setUrl("");
      setEditing(false);
    });
  const remove = () =>
    run(async () => {
      await removeHook(token);
      setHook(null);
    });

  if (hook === undefined) return <div className="gd-skeleton" aria-busy="true" />;
  const valid = WEBHOOK.test(url.trim());
  return (
    <div className="gd-discord-body">
      {hook && !editing ? (
        <>
          <p>
            <span className="gd-pill is-active">● On</span> The report of <b>{guildName}</b> goes to the webhook <b>{hook.name}</b>.
          </p>
          <p className="gd-muted">{hook.lastSentOn ? `Last report: ${new Date(`${hook.lastSentOn}T12:00:00Z`).toLocaleDateString("en-GB", { dateStyle: "medium" })}.` : "The first report comes after the next daily snapshot."}</p>
          <div className="gd-actions-row">
            <button type="button" className="gd-btn" disabled={busy} onClick={() => setEditing(true)}>
              Use another webhook
            </button>
            <button type="button" className="gd-btn" disabled={busy} onClick={() => void remove()}>
              {busy ? "…" : "Turn off"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="gd-muted">Paste the webhook link of the channel the report of {guildName} should go to. A first message is posted there right away.</p>
          <input
            className="gd-filter gd-discord-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
            aria-label="Discord webhook link"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="gd-actions-row">
            <button type="button" className="gd-btn is-primary" disabled={busy || !valid} onClick={() => void save()}>
              {busy ? "Connecting…" : "Connect"}
            </button>
            {hook ? (
              <button type="button" className="gd-btn" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </button>
            ) : null}
            {url && !valid ? <span className="gd-muted">This is not a Discord webhook link.</span> : null}
          </div>
        </>
      )}
      {error ? (
        <p className="gd-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
