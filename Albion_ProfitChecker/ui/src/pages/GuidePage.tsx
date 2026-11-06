import { useEffect } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { findGuideBySlug, GUIDES } from "@shared/content/toolContentData";
import { assetUrl } from "@shared/assets/assets";
import { DemoVideo } from "@shared/ui/DemoVideo";
import { useSeo } from "../shared/seo/useSeo";
import "./guides.css";

const SITE = "https://blackmarketreader.com";

/** Turns a heading into a stable anchor id, so old links to a section still land on it. */
function anchorId(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * A guide in two layers. On top, for someone who has never seen the tool: one sentence, a short
 * clip of it in use and three picture steps. Below, folded away, the full explanation with the
 * formulas and the FAQ (still in the page for search engines and for anyone who wants the maths).
 */
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

  // a link to a folded section opens it
  useEffect(() => {
    let id = "";
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      return; // a broken hash like "#100%" is not one of our anchors
    }
    const target = id ? document.getElementById(id) : null;
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
      target.scrollIntoView({ block: "start" });
    }
  }, [location.hash, slug]);

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
  const { sections, faq, quick } = entry;
  const toolLabel = entry.guide.toolLabel;

  return (
    <div className="guide-page">
      <div className="guide-shell is-wide">
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
            aria-label={`Back to the ${toolLabel}`}
            title={`Back to the ${toolLabel}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M19 12H5M12 19l-7-7 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <header className="guide-hero">
          <span className="guide-kicker">{toolLabel} guide</span>
          <h1>{entry.guide.h1}</h1>
          <p className="guide-lede">{quick.tagline}</p>
          <Link className="guide-cta" to={`/${toolSlug}`}>
            Open the {toolLabel}
            <span aria-hidden="true"> &rarr;</span>
          </Link>
        </header>

        <section className="guide-watch" aria-label={`The ${toolLabel} in action`}>
          <DemoVideo
            src={assetUrl(quick.video)}
            poster={assetUrl(quick.poster)}
            url={`blackmarketreader.com/${toolSlug}`}
            label={`Short clip: the ${toolLabel} in use`}
          />
        </section>

        <section className="guide-quick" aria-labelledby="guide-steps-title">
          <h2 id="guide-steps-title">How it works</h2>
          <ol className="guide-steps">
            {quick.steps.map((step, i) => (
              <li key={step.title} className="guide-step">
                <img src={assetUrl(step.image)} alt="" loading="lazy" width={800} height={500} />
                <div className="guide-step-text">
                  <span className="guide-step-n" aria-hidden="true">{i + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="guide-cheats" aria-labelledby="guide-cheats-title">
          <h2 id="guide-cheats-title">The numbers in one look</h2>
          <div className="guide-formulas">
            {entry.summary.cards.map((card) => (
              <article className="guide-formula-card" key={card.label}>
                <h3>{card.label}</h3>
                <code>{card.formula}</code>
                <p>{card.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="guide-details" aria-labelledby="guide-details-title">
          <h2 id="guide-details-title">All the details</h2>
          <p className="guide-details-hint">The full explanation, with formulas and examples. Open what you need.</p>
          {sections.map((section) => (
            <details className="guide-fold" key={section.heading} id={anchorId(section.heading)}>
              <summary>
                <h3>{section.heading}</h3>
              </summary>
              <div className="guide-fold-body">
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
              </div>
            </details>
          ))}

          <h2 className="guide-faq-title" id="faq">
            Frequently asked questions
          </h2>
          {faq.map((item) => (
            <details className="guide-fold is-faq" key={item.q}>
              <summary>
                <h3>{item.q}</h3>
              </summary>
              <div className="guide-fold-body">
                <p>{item.a}</p>
              </div>
            </details>
          ))}
        </section>

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
