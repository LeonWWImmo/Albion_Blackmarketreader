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
            <li>Advertising: we use Google AdSense to fund the service; ad partners may set cookies to show relevant ads (see Cookies, Tracking &amp; Advertising below).</li>
            <li>Retention: kept only as long as needed for account operation or legal duties.</li>
            <li>Rights: you can request access, correction, or deletion of your data.</li>
          </ul>
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
          <h2>Cookies, Tracking & Advertising</h2>
          <p>
            We use essential cookies required for login and session management. With your consent,
            we also use cookies for analytics and advertising.
          </p>
          <p>
            <strong>Advertising (Google AdSense):</strong> This site uses Google AdSense to display ads.
            Third-party vendors, including Google, use cookies to serve ads based on your prior visits
            to this and other websites. Google's use of advertising cookies enables it and its partners
            to serve ads to you based on your visits to this and other sites.
          </p>
          <ul>
            <li>
              You can opt out of personalized advertising in{" "}
              <a href="https://www.google.com/settings/ads" target="_blank" rel="noreferrer">Google Ads Settings</a>.
            </li>
            <li>
              You can opt out of third-party vendors' cookies for personalized ads at{" "}
              <a href="https://www.aboutads.info/choices" target="_blank" rel="noreferrer">aboutads.info</a>.
            </li>
            <li>
              EU/EEA/UK visitors: we ask for consent via a Google-certified consent banner before setting
              non-essential or advertising cookies, and you can change or withdraw consent at any time.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
