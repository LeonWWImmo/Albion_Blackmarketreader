import { useEffect } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { findGuideBySlug, GUIDES } from "@shared/content/toolContentData";
import { useSeo } from "../shared/seo/useSeo";
import "./guides.css";

const SITE = "https://blackmarketreader.com";

/** Turns a heading into a stable anchor id for the table of contents. */
function anchorId(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function GuidePage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const found = findGuideBySlug(slug);

  /**
   * Back arrow. Returns to wherever the reader came from, but a visitor who landed here
   * straight from search has no in-app history — react-router marks that first entry with
   * key "default" — so fall back to the tool this guide covers rather than stepping out
   * of the site.
   */
  function goBack(toolPath: string) {
    if (location.key && location.key !== "default") navigate(-1);
    else navigate(toolPath);
  }

  useEffect(() => {
    document.body.classList.add("guide-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter", "panel-open", "crafting-calculator-body");
    return () => {
      document.body.classList.remove("guide-body");
    };
  }, []);

  // Hooks must run unconditionally, so SEO falls back to the index when the slug is unknown.
  const guide = found?.entry.guide;
  useSeo({
    title: guide?.title || "Albion Online Guides | Blackmarket Reader",
    description: guide?.description || "Free Albion Online crafting, refining and Black Market guides.",
    keywords: guide?.keywords,
    canonical: `${SITE}/guides/${guide?.slug || ""}`
  });

  if (!found) return <Navigate to="/guides" replace />;

  const { toolSlug, entry } = found;
  const { sections, faq } = entry;

  return (
    <div className="guide-page">
      <div className="guide-shell">
        <div className="guide-topbar">
          <nav className="guide-crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden="true"> / </span>
            <Link to="/guides">Guides</Link>
          </nav>
          <button
            type="button"
            className="guide-back"
            onClick={() => goBack(`/${toolSlug}`)}
            aria-label={`Back to the ${entry.guide.toolLabel}`}
            title={`Back to the ${entry.guide.toolLabel}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M19 12H5M12 19l-7-7 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <header className="guide-header">
          <h1>{entry.guide.h1}</h1>
          <p className="guide-lede">{entry.guide.description}</p>
          <Link className="guide-tool-link" to={`/${toolSlug}`}>
            Open the {entry.guide.toolLabel}
            <span aria-hidden="true"> &rsaquo;</span>
          </Link>
        </header>

        <section className="guide-formulas" aria-label="Key formulas">
          {entry.summary.cards.map((card) => (
            <article className="guide-formula-card" key={card.label}>
              <h2>{card.label}</h2>
              <code>{card.formula}</code>
              <p>{card.text}</p>
            </article>
          ))}
        </section>

        <nav className="guide-toc" aria-label="On this page">
          <h2>On this page</h2>
          <ul>
            {sections.map((section) => (
              <li key={section.heading}>
                <a href={`#${anchorId(section.heading)}`}>{section.heading}</a>
              </li>
            ))}
            <li>
              <a href="#faq">Frequently asked questions</a>
            </li>
          </ul>
        </nav>

        <article className="guide-body-text">
          {sections.map((section) => (
            <section className="guide-section" key={section.heading} id={anchorId(section.heading)}>
              <h2>{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.list ? (
                <ul>
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          <section className="guide-section" id="faq">
            <h2>Frequently asked questions</h2>
            <dl className="guide-faq">
              {faq.map((item) => (
                <div className="guide-faq-item" key={item.q}>
                  <dt>{item.q}</dt>
                  <dd>{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </article>

        <aside className="guide-more">
          <h2>More Albion Online guides</h2>
          <ul>
            {GUIDES.filter((g) => g.slug !== entry.guide.slug).map((g) => (
              <li key={g.slug}>
                <Link to={`/guides/${g.slug}`}>{g.h1}</Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
