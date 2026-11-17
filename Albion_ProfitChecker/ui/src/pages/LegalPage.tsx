import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useSeo } from "../shared/seo/useSeo";
import "./legal.css";

export function LegalPage() {
  useSeo({
    title: "Legal | RomulusKings Market Reader",
    description: "Legal and compliance information for RomulusKings Market Reader.",
    canonical: "https://blackmarketreader.com/legal"
  });

  useEffect(() => {
    document.body.classList.add("legal-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter", "panel-open", "crafting-calculator-body");
    return () => {
      document.body.classList.remove("legal-body");
    };
  }, []);

  return (
    <div className="legal-page">
      <div className="legal-shell">
        <header className="legal-header">
          <Link className="legal-back" to="/" aria-label="Back to Landing">
            Back to Landing
          </Link>
          <h1>Legal & Compliance</h1>
          
        </header>

        <section className="legal-section" id="impressum">
          <h2>Impressum</h2>
          <p><strong>Operator:</strong> RomulusKings Market Reader</p>
          <p><strong>Email:</strong> blackmarketreader@gmail.com</p>
        </section>

        <section className="legal-section" id="privacy">
          <h2>Privacy Policy</h2>
          <p>
            We process minimal user data required for authentication and service delivery
            (e.g., email address for login, technical logs, and IP-based security checks).
          </p>
          <ul>
            <li>Data collected: login email, access timestamps, device/session metadata.</li>
            <li>Purpose: authentication, security, service reliability, and support.</li>
            <li>Error reports: when something breaks on a page, your browser sends us a technical error report (the error message, the page and your browser name and system) so we can fix it. We don't add your account details or IP address to it, mask email addresses in it, and delete it once the problem is fixed.</li>
            <li>Guild tools: what you save there (see Guild Tools below).</li>
            <li>No advertising: the site shows no ads and sells no data.</li>
            <li>Service providers: Supabase (accounts and database), Vercel (hosting, anonymous visitor statistics) and, only if you connect a webhook, Discord.</li>
            <li>Retention: kept only as long as needed for account operation or legal duties.</li>
            <li>Rights: you can request access, correction, or deletion of your data.</li>
          </ul>
        </section>

        <section className="legal-section" id="guild">
          <h2>Guild Tools</h2>
          <p>
            The guild pages show public game data from Albion Online's killboard (guild and player names, fame,
            kills, deaths and fights) and market prices from the Albion Online Data Project. Looking at a guild
            needs no account and stores nothing about you.
          </p>
          <p>With an account, the following is saved to it, and only you can see it:</p>
          <ul>
            <li>
              Marked guild: the guild you marked. While anyone has a guild marked, a snapshot of its members'
              public game data (name, fame, guild membership) is saved once a day, to show activity, who joined
              and who left.
            </li>
            <li>Regear: the deaths you ticked as paid and the fights you marked.</li>
            <li>
              Bank log and loot splits: the guild chest log you paste and the splits you save. A chest log
              contains the in-game names of other players and what they put in or took out of the chest.
              Only paste logs of guilds you play in.
            </li>
            <li>
              Discord report: the webhook link you give is kept on our server only and never shown in the page
              again. Once a day the guild's report is sent to it, which makes Discord process it under its own
              terms. Removing the webhook in the Discord tab stops it.
            </li>
          </ul>
          <p>
            When your account is deleted (write to us), all of it is deleted with it. You can also remove a
            chest log, a split, a mark or the webhook yourself at any time on the guild pages. In-game names are public game data; if you want
            your name removed from a stored snapshot, write to us.
          </p>
        </section>

        <section className="legal-section" id="terms">
          <h2>Terms of Service</h2>
          <p>
            By using this service you agree to follow the usage rules and acknowledge
            that market data can change rapidly. This tool provides informational signals
            and does not guarantee profit.
          </p>
          <ul>
            <li>Use at your own risk; prices and profitability are volatile.</li>
            <li>No resale of data without written permission.</li>
            <li>Accounts may be suspended for abuse or automated scraping.</li>
          </ul>
        </section>

        <section className="legal-section" id="cookies">
          <h2>Cookies & Tracking</h2>
          <p>
            We use no advertising and no tracking cookies. The browser storage we use is needed for the
            site to work: your login session and your settings (server region, style, closed hints).
          </p>
          <ul>
            <li>
              Visitor statistics: Vercel Web Analytics and Speed Insights count page views and measure loading
              speed without cookies and without identifying you.
            </li>
            <li>Fonts are loaded from Google Fonts, which sees your IP address when your browser loads them.</li>
            <li>Item pictures are loaded from Albion Online's render service (render.albiononline.com).</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
