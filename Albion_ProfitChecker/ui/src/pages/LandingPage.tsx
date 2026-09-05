import { useEffect, useMemo, useRef, useState } from "react";
import { useSeo } from "../shared/seo/useSeo";
import { assetUrl, assets } from "@shared/index";
import "./landing.css";

type ToolSlide = {
  title: string;
  badge?: string;
  image?: string;
  href?: string;
  ctaLabel?: string;
  placeholderText?: string;
};

const CAROUSEL_DURATION_MS = 6000;

export function LandingPage() {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const slides = useMemo<ToolSlide[]>(
    () => [
      {
        title: "Black Market Crafter",
        image: assets.bmCrafterPreview,
        href: "/bm-crafter",
        ctaLabel: "Open BM Crafter"
      },
      {
        title: "Crafting Calculator",
        image: assets.craftingCalcPreview,
        href: "/crafting-calculator",
        ctaLabel: "Open Crafting Calculator"
      },
      {
        title: "Refining Calculator",
        image: assets.refiningCalcPreview,
        href: "/refining-calculator",
        ctaLabel: "Open Refining Calculator"
      },
      {
        title: "Food & Potion Crafter",
        image: assets.foodPotionCrafterPreview,
        href: "/food-potion-crafter",
        ctaLabel: "Open Food & Potion Crafter"
      }
    ],
    []
  );

  const heroDesktop = assetUrl("picture/planeten-1280.jpg");
  const heroMobile = assetUrl("picture/planeten-768.jpg");
  const heroOriginal = assetUrl("picture/planeten.png");
  const heroSrcSet = `${heroMobile} 768w, ${heroDesktop} 1280w, ${heroOriginal} 1740w`;

  useSeo({
    title: "Albion Online Tool | Blackmarket Reader & Blackmarket Crafter",
    description:
      "Albion Online Tool by RomulusKings: Blackmarket Reader dashboard, city comparison, profit filters, and Blackmarket Crafter for profitable crafting routes.",
    keywords:
      "Albion Online Tool, Blackmarket Reader, Blackmarket Crafter, Albion Black Market, Albion Blackmarket",
    canonical: "https://blackmarketreader.com/",
    ogTitle: "Albion Online Tool | Blackmarket Reader Dashboard & Blackmarket Crafter",
    ogDescription: "Live Albion Black Market scans, city filters, profit views, and Blackmarket Crafter access.",
    ogUrl: "https://blackmarketreader.com/",
    ogImage: "https://blackmarketreader.com/picture/bm-crafter-table.png",
    twitterTitle: "Albion Online Tool | Blackmarket Reader Dashboard & Blackmarket Crafter",
    twitterDescription: "Live Albion Black Market scans, city filters, profit views, and Blackmarket Crafter access.",
    twitterImage: "https://blackmarketreader.com/picture/bm-crafter-table.png",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Blackmarket Reader",
      url: "https://blackmarketreader.com/",
      description: "Albion Online Tool with Blackmarket Reader dashboard and Blackmarket Crafter for live profit analysis.",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://blackmarketreader.com/#platform-overview",
        "query-input": "required name=search_term_string"
      }
    },
    preloadHero: {
      href: heroDesktop,
      imageSrcSet: heroSrcSet,
      imageSizes: "100vw"
    }
  });

  useEffect(() => {
    document.body.classList.add("landing-body");
    document.body.classList.remove("dashboard-body");
    return () => {
      document.body.classList.remove("landing-body");
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, CAROUSEL_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, paused, slides.length]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    const resetTilt = () => {
      preview.style.transform = "perspective(1200px) rotateX(15deg) rotateY(-10deg) scale(1)";
    };

    const onMove = (event: MouseEvent) => {
      const rect = preview.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      const rotateX = 12 - y * 8;
      const rotateY = -10 + x * 8;
      preview.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
    };

    resetTilt();
    preview.addEventListener("mousemove", onMove);
    preview.addEventListener("mouseleave", resetTilt);

    return () => {
      preview.removeEventListener("mousemove", onMove);
      preview.removeEventListener("mouseleave", resetTilt);
    };
  }, []);

  const leftIndex = (activeIndex - 1 + slides.length) % slides.length;
  const rightIndex = (activeIndex + 1) % slides.length;
  const activeSlide = slides[activeIndex];

  return (
    <>
      <nav className="premium-nav">
        <div className="nav-brand">
          <span className="material-symbols-outlined">terminal</span>
          <span className="brand-title">
            RomulusKings <span>Market Reader</span>
          </span>
        </div>
        <div className="nav-links">
          <a href="#platform-overview">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#dashboard-views">Screens</a>
          <a href="#faq">FAQ</a>
        </div>
        <a className="nav-access" href="/dashboard">
          Open Dashboard
        </a>
      </nav>

      <section className="hero">
        <picture className="hero-media" aria-hidden="true">
          <source media="(max-width: 768px)" srcSet={heroMobile} />
          <source media="(max-width: 1280px)" srcSet={heroDesktop} />
          <img src={heroOriginal} srcSet={heroSrcSet} sizes="100vw" alt="" fetchPriority="high" />
        </picture>
        <div className="hero-overlay" />
        <div className="eclipse-glow" />

        <div className="hero-content">
          <div className="hero-kicker">Blackmarket Protocol v4.0</div>
          <h1>
            ANALYZE FIRST.
            <br />
            <span>PROFIT ALWAYS.</span>
          </h1>
          <div className="hero-actions">
            <div className="hero-cta-row">
              <a className="hero-cta" href="/dashboard">
                Open Dashboard
              </a>
              <a className="hero-cta" href="/bm-crafter">
                Blackmarket Crafter
              </a>
              <a className="hero-cta" href="/crafting-calculator">
                Crafting Calculator
              </a>
              <a className="hero-cta" href="/refining-calculator">
                Refining Calculator
              </a>
              <a className="hero-cta" href="/food-potion-crafter">
                Food &amp; Potion Crafter
              </a>
            </div>
            <p>Zero latency market telemetry for high-volume stakeholders.</p>
          </div>
        </div>

        <div className="hero-footer">
          <div className="hero-line" />
          <span>Institutional Grade Hardware Required</span>
        </div>
      </section>

      <main className="deep-black">
        <section className="section" id="platform-overview">
          <div className="container">
            <div className="section-head">
              <span className="section-eyebrow">Core Infrastructure</span>
              <h2>Platform Overview</h2>
            </div>
            <div className="perspective-mockup" ref={previewRef}>
              <button
                className="mockup-zoom"
                type="button"
                aria-label="Zoom Blackmarket Crafter tool preview"
                onClick={() => setZoomSrc(assets.bmCrafterPreview)}
              >
                <img className="mockup-preview" src={assets.bmCrafterPreview} alt="Blackmarket Crafter full tool preview" />
              </button>
            </div>
          </div>
        </section>

        <section className="section screens" id="dashboard-views">
          <div className="container">
            <div className="section-head">
              <h2>Dashboard views</h2>
              <p>Two views for percent and silver profit.</p>
            </div>
            <div className="screens-grid">
              <figure className="screen-card">
                <img
                  className="zoomable"
                  src={assetUrl("picture/Silver-dashboard.png")}
                  alt="Dashboard silver profit"
                  onClick={(event) => setZoomSrc((event.currentTarget as HTMLImageElement).src)}
                />
                <figcaption>Dashboard Silver Profit</figcaption>
              </figure>
              <figure className="screen-card offset">
                <img
                  className="zoomable"
                  src={assetUrl("picture/Profit-Dashboard.png")}
                  alt="Dashboard percent profit"
                  onClick={(event) => setZoomSrc((event.currentTarget as HTMLImageElement).src)}
                />
                <figcaption>Dashboard % Profit</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="section premium-plus-section" id="bm-crafter-access">
          <div className="container">
            <div className="premium-carousel-head">
              <span className="section-eyebrow">Premium+ Institutional</span>
              <h2>Crafter Tools</h2>
            </div>
            <div
              className="premium-carousel carousel-perspective"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              <button
                className="carousel-nav prev"
                type="button"
                aria-label="Previous"
                onClick={() => setActiveIndex((current) => (current - 1 + slides.length) % slides.length)}
              >
                <span className="material-symbols-outlined">arrow_back_ios_new</span>
              </button>
              <button
                className="carousel-nav next"
                type="button"
                aria-label="Next"
                onClick={() => setActiveIndex((current) => (current + 1) % slides.length)}
              >
                <span className="material-symbols-outlined">arrow_forward_ios</span>
              </button>

              <div className="carousel-stage">
                {slides.map((slide, index) => {
                  const stateClass =
                    index === activeIndex ? "active" : index === leftIndex ? "side-left" : index === rightIndex ? "side-right" : "";
                  return (
                    <article key={slide.title} className={`tool-card ${stateClass}`.trim()}>
                      <div className="tool-header">
                        <span className="tool-kicker">{slide.title}</span>
                        {slide.badge ? <span className="tool-badge muted">{slide.badge}</span> : null}
                      </div>

                      {slide.image ? (
                        <div className="tool-media">
                          <img
                            className="zoomable"
                            src={slide.image}
                            alt={`${slide.title} preview`}
                            onClick={(event) => setZoomSrc((event.currentTarget as HTMLImageElement).src)}
                          />
                        </div>
                      ) : (
                        <div className="tool-placeholder">
                          <span>{slide.placeholderText || "Coming Soon"}</span>
                        </div>
                      )}

                      {slide.href ? (
                        <a className="tool-cta" href={slide.href}>
                          {slide.ctaLabel || "Open Tool"}
                        </a>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              <div className="carousel-progress" aria-hidden="true">
                <span key={activeIndex} className="progress-fill" style={{ animationDuration: `${CAROUSEL_DURATION_MS}ms` }} />
              </div>

              <div className="carousel-dots" aria-hidden="true">
                {slides.map((slide, index) => (
                  <span key={slide.title} className={index === activeIndex ? "active" : ""} />
                ))}
              </div>

              <div className="carousel-cta-row">
                {activeSlide.href ? (
                  <a className="premium-plus-cta" href={activeSlide.href}>
                    {activeSlide.ctaLabel || `Open ${activeSlide.title}`}
                  </a>
                ) : (
                  <span className="premium-plus-cta disabled">Coming Soon</span>
                )}
                <span className="carousel-note">{activeSlide.title}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section feature-section" id="how-it-works">
          <div className="container">
            <div className="feature-cards">
              <article className="feature-card">
                <div className="feature-head">
                  <span>01</span>
                  <h3>Dashboard Views</h3>
                </div>
                <p>
                  Two live views for percent and silver profit. Scan faster, compare cities, and spot flips in seconds with clear, clean
                  cards.
                </p>
                <ul>
                  <li>Percent + silver modes</li>
                  <li>City + region filters</li>
                  <li>Instant sorting by profit</li>
                </ul>
              </article>
              <article className="feature-card">
                <div className="feature-head">
                  <span>02</span>
                  <h3>BM Crafter</h3>
                </div>
                <p>
                  Live Black Market pricing, Sold/Day velocity, and full craft cost with materials + artifacts. Only profitable items
                  surface.
                </p>
                <ul>
                  <li>Tier + enchant filters</li>
                  <li>Profit % + daily potential</li>
                  <li>Materials + artifact prices</li>
                </ul>
              </article>
              <article className="feature-card">
                <div className="feature-head">
                  <span>03</span>
                  <h3>Crafting Tools</h3>
                </div>
                <p>
                  Full profit calculators for every crafting path — gear, refining, and consumables — with return rate, focus,
                  taxes, and live city prices.
                </p>
                <ul>
                  <li>Crafting Calculator</li>
                  <li>Refining Calculator</li>
                  <li>Food &amp; Potion Crafter</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="section join-section">
          <div className="container">
            <div className="join">
              <h2>
                Join the <br />
                <span>Discord</span>
              </h2>
              <div className="join-body">
                <a className="join-cta" href="https://discord.gg/HF2Ctg73m5" target="_blank" rel="noopener noreferrer">
                  <div>
                    <span>Initialize Connection</span>
                    <span>Discord Verified Access</span>
                  </div>
                </a>
                <div className="join-divider" />
                <div className="join-copy">
                  <div>See updates</div>
                  <strong>Support</strong>
                  <span>Ticketing System</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="container">
            <div className="section-head faq-head">
              <h2>FAQ</h2>
              <p>The most important questions, answered briefly.</p>
            </div>
            <div className="faq-list">
              <details>
                <summary>How often is data updated?</summary>
                <p>
                  Market data is refreshed once per day (around 08:00–09:00 UTC). Every tool shows its own
                  &ldquo;Last updated&rdquo; time in the top-right corner, so you can always see exactly when the data
                  it is using was last refreshed — including how long ago that was.
                </p>
              </details>
              <details>
                <summary>Which regions are available?</summary>
                <p>America and Europe. You choose the region after login.</p>
              </details>
              <details>
                <summary>Is this official from Sandbox Interactive?</summary>
                <p>No. This is community-built and uses the Albion Online Data API.</p>
              </details>
              <details>
                <summary>Why do prices differ?</summary>
                <p>The API provides city prices and black market data that changes constantly.</p>
              </details>
              <details>
                <summary>Do I need an account?</summary>
                <p>Yes, login is required to keep region and account features saved.</p>
              </details>
            </div>
          </div>
        </section>
      </main>

      <footer className="premium-footer">
        <div className="container footer-grid">
          <div>
            <div className="footer-brand">
              <span className="material-symbols-outlined">terminal</span>
              <span>
                Blackmarket <span>Reader</span>
              </span>
            </div>
            <p>
              Albion Online Tool for Blackmarket Reader & Blackmarket Crafter <br />
              All Rights Reserved // 2024
            </p>
          </div>
          <div className="footer-columns">
            <div>
              <div className="footer-title">Guides</div>
              <a href="/guides">All guides</a>
              <a href="/guides/albion-crafting-profit">Crafting profit</a>
              <a href="/guides/albion-refining-profit">Refining profit</a>
              <a href="/guides/albion-black-market-flipping">Black Market flipping</a>
            </div>
            <div>
              <div className="footer-title">Legal</div>
              <a href="/legal#terms">Terms</a>
              <a href="/legal#privacy">Privacy</a>
            </div>
            <div>
              <div className="footer-title">Social</div>
              <a href="/community">Discord</a>
            </div>
          </div>
          <div className="footer-disclaimer">
            <span>
              Disclaimer: This project is a fan-made tool and is not affiliated with, endorsed by, or sponsored by Sandbox Interactive GmbH
              or Albion Online.
            </span>
            <span>
              This site uses Database for authentication and may process user data such as email addresses for login purposes. No personal
              data is sold or shared with third parties.
            </span>
          </div>
        </div>
      </footer>
      <a className="community-tile" href="/community" aria-label="Join the community">
        <span className="tile-title">
          <svg className="tile-icon" viewBox="0 0 256 199" aria-hidden="true" focusable="false">
            <path d="M216.9 16.5A208.5 208.5 0 0 0 164.6 0c-2.3 4-4.9 9.2-6.7 13.4-19.2-2.9-38.1-2.9-57.1 0-1.8-4.2-4.5-9.4-6.8-13.4a209.3 209.3 0 0 0-52.4 16.5C6.6 68.4-3.1 119.4 1.8 169.8a210.1 210.1 0 0 0 63.9 32.7c5.2-7.1 9.8-14.6 13.5-22.7-7.4-2.8-14.5-6.2-21.2-10.2 1.8-1.3 3.5-2.6 5.1-4 40.9 19.1 85.1 19.1 125.5 0 1.7 1.4 3.4 2.7 5.1 4-6.7 4-13.8 7.4-21.2 10.2 3.7 8.1 8.3 15.6 13.5 22.7a210.2 210.2 0 0 0 63.9-32.7c5.8-57.9-9.7-108.4-44.8-153.3ZM85 135.3c-12.5 0-22.7-11.4-22.7-25.4S72.5 84.5 85 84.5s22.7 11.4 22.7 25.4-10.1 25.4-22.7 25.4Zm86 0c-12.5 0-22.7-11.4-22.7-25.4s10.1-25.4 22.7-25.4 22.7 11.4 22.7 25.4-10.1 25.4-22.7 25.4Z" />
          </svg>
          Join the Community
        </span>
        <span className="tile-subtitle">Discord, deals, live flips</span>
        <span className="tile-cta">Open Community</span>
      </a>

      {zoomSrc ? (
        <div className="zoom-modal" aria-hidden="false" onClick={() => setZoomSrc(null)}>
          <div className="zoom-card" onClick={(event) => event.stopPropagation()}>
            <button className="zoom-close" type="button" aria-label="Close" onClick={() => setZoomSrc(null)}>
              X
            </button>
            <img src={zoomSrc} alt="Preview large" />
          </div>
        </div>
      ) : null}
    </>
  );
}
