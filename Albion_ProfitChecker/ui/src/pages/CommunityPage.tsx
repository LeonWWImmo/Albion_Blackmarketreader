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

      <footer className="community-footer">
        <p className="metallic-text">RomulusKings Marketreader &copy; {new Date().getFullYear()}</p>
      </footer>
    </>
  );
}
