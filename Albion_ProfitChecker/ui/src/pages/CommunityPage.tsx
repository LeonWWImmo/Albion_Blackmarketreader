import { useEffect } from "react";
import "./community.css";

export function CommunityPage() {
  useEffect(() => {
    document.body.classList.add("community-page");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter", "panel-open");

    return () => {
      document.body.classList.remove("community-page");
    };
  }, []);

  return (
    <>
      <div className="aurora-blob aurora-emerald" aria-hidden="true" />
      <div className="aurora-blob aurora-purple" aria-hidden="true" />

      <header className="community-header">
        <a className="brand" href="/">
          <span className="brand-name">RomulusKings Reader</span>
        </a>
        <nav className="community-nav">
          <a className="nav-link" href="https://discord.gg/HF2Ctg73m5" target="_blank" rel="noopener noreferrer">
            Discord
          </a>
          <a className="nav-link" href="https://discord.gg/HF2Ctg73m5" target="_blank" rel="noopener noreferrer">
            Support
          </a>
        </nav>
      </header>

      <main className="community-hero" id="top">
        <div className="hero-content">
          <div className="hero-copy">
            <h1 className="hero-title">
              Join the <span className="gradient-text">Community</span>
            </h1>
            <p className="hero-subtitle">
              Join the Blackmarket Crafter team. Ask questions, share setups, and get Support.
            </p>
          </div>
          <div className="hero-actions">
            <a className="glass-button" href="https://discord.gg/HF2Ctg73m5" target="_blank" rel="noopener noreferrer">
              Connect to Discord
              <span className="material-symbols-outlined">north_east</span>
            </a>
          </div>
        </div>
      </main>

      {/* Outside the hero on purpose: .community-hero centres its children with flex, which
          squeezed this section to a sliver on a phone. */}
      <section className="community-info">
          <div className="community-card">
            <h2>What the server is for</h2>
            <p>
              This is a small Albion Online project run by players, not a company. The Discord is
              where the people who use the calculators actually talk to the person building them.
              If a number looks wrong, if an item is missing, or if you want something the tools
              cannot do yet, that is the place to say so &mdash; most of what gets built next comes
              out of those conversations.
            </p>
          </div>

          <div className="community-card">
            <h2>Every update gets posted there</h2>
            <p>
              There is an updates channel that receives a post every single time the tools change:
              new features, corrected formulas, fixed prices. You do not have to check the site to
              find out what moved. If a calculation you rely on was adjusted, you will read why.
            </p>
          </div>

          <div className="community-card">
            <h2>Reporting bad market data</h2>
            <p>
              Market prices come from what other players have scanned in game, so they are only as
              good as the last scan. A stale or manipulated price can make a craft look far more
              profitable than it is. The tools grey out profits that look unrealistic, but they
              cannot catch everything. If you spot a deal that seems too good to be true, post the
              item and the server &mdash; that feedback is how the filters get better.
            </p>
          </div>

          <div className="community-card">
            <h2>Before you ask</h2>
            <p>
              You do not need an account to use anything here; every tool opens straight away. For
              free users the market data is synced once per day rather than live, and each tool
              shows its own last-updated time so you can judge how old the numbers are. The
              written <a href="/guides">Albion Online guides</a> cover the maths behind the
              calculators &mdash; return rate, bonus cities, station fees and focus cost &mdash; and
              answer most of what gets asked. If you do want your settings to follow you to another
              device, you can <a href="/login?mode=register">create a free account</a>.
            </p>
          </div>
        </section>

      <footer className="community-footer">
        <p className="metallic-text">RomulusKings Marketreader &copy; {new Date().getFullYear()}</p>
      </footer>
    </>
  );
}
