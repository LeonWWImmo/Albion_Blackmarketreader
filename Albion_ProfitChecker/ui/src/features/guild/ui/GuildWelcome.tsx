import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAccessToken } from "../useAccessToken";

const SEEN_KEY = "gd-welcome-v1";
const DISCORD = "https://discord.gg/HF2Ctg73m5";
const GUIDE = "/guides/albion-online-guild-tools";

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // no storage (private window): shown each visit, closed with the button
    return false;
  }
}

/**
 * A short note the first time someone opens the guild tools: why an account helps here, that the
 * section is new and still being built, and where to send ideas. Closed once, it stays closed.
 */
export function GuildWelcome() {
  const { pathname } = useLocation();
  const { token, ready } = useAccessToken();
  const [open, setOpen] = useState(() => !seen());
  if (!open) return null;

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // the note just comes back next visit
    }
  };

  return (
    <aside className="gd-welcome" role="dialog" aria-labelledby="gd-welcome-title">
      <button type="button" className="gd-welcome-x" aria-label="Close" onClick={close}>
        ×
      </button>
      <p className="gd-kicker">NEW · IN DEVELOPMENT</p>
      <h2 id="gd-welcome-title">Welcome to the guild tools</h2>
      <p>Any guild works without an account. With a free account you get more:</p>
      <ul>
        <li>Mark your guild: a daily snapshot shows who gained fame, who went quiet, who joined and left</li>
        <li>Regear ticks, your chest log and loot splits stay saved, on every device</li>
        <li>A daily report of your guild in your Discord</li>
      </ul>
      <p>
        The guild tools are new and we are still building them. Ideas, wishes or something broken? Tell us on Discord: suggestions are very welcome.
      </p>
      <div className="gd-actions-row">
        {ready && !token ? (
          <Link className="gd-btn is-primary" to={`/login?next=${encodeURIComponent(pathname)}`} onClick={close}>
            Sign in
          </Link>
        ) : null}
        <a className="gd-btn" href={DISCORD} target="_blank" rel="noopener noreferrer">
          Join Discord
        </a>
        <Link className="gd-btn" to={GUIDE} onClick={close}>
          Read the guide
        </Link>
        <button type="button" className="gd-btn" onClick={close}>
          Got it
        </button>
      </div>
    </aside>
  );
}
