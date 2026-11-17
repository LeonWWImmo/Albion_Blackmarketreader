import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import { childGuides, findGuideBySlug, GUIDES, TOOL_CONTENT } from "@shared/content/toolContentData";
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
 * A guide picture full size over the page: closed by Escape, the button or a click anywhere. The
 * keyboard stays on its close button while it is open and goes back to the picture after.
 */
function ZoomedImage({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      else if (e.key === "Tab") {
        // the close button is the only thing to reach in here
        e.preventDefault();
        close.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div className="guide-zoom" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <button ref={close} type="button" className="guide-zoom-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <figure onClick={onClose}>
        <img src={src} alt={title} />
        <figcaption>{title}</figcaption>
      </figure>
    </div>
  );
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
  const [zoom, setZoom] = useState<{ src: string; title: string } | null>(null);

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

  // another guide opens at its top, so the reader sees the page changed, and without the last one's
  // picture open. Back and forward keep the browser's place; a link to a section scrolls there below.
  const navigationType = useNavigationType();
  const shownSlug = useRef(slug);
  useEffect(() => {
    if (shownSlug.current === slug) return;
    shownSlug.current = slug;
    setZoom(null);
    if (!location.hash && navigationType !== "POP") window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [slug]);

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
  const toolPath = entry.guide.toolPath ?? `/${toolSlug}`;
  // a guide with a guide per part (the guild tools and their tabs): all of them, on each of them
  const family = entry.guide.parent ?? toolSlug;
  const parts = childGuides(family);

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
            onClick={() => goBack(toolPath)}
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
          <Link className="guide-cta" to={toolPath}>
            Open the {toolLabel}
            <span aria-hidden="true"> &rarr;</span>
          </Link>
        </header>

        {/* a tool without its clip yet goes straight to the steps */}
        {quick.video ? (
          <section className="guide-watch" aria-label={`The ${toolLabel} in action`}>
            <DemoVideo
              src={assetUrl(quick.video)}
              poster={assetUrl(quick.poster)}
              url={`blackmarketreader.com${toolPath}`}
              label={`Short clip: the ${toolLabel} in use`}
            />
          </section>
        ) : null}

        <section className="guide-quick" aria-labelledby="guide-steps-title">
          <h2 id="guide-steps-title">How it works</h2>
          <ol className="guide-steps">
            {quick.steps.map((step, i) => (
              <li key={step.title} className="guide-step">
                {/* a click shows the picture big, to read what is on it */}
                <button type="button" className="guide-step-zoom" onClick={() => setZoom({ src: assetUrl(step.image), title: step.title })} aria-label={`Show bigger: ${step.title}`}>
                  <img src={assetUrl(step.image)} alt="" loading="lazy" width={800} height={500} />
                  <span className="guide-step-zoom-hint" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm10 16-5.2-5.2M10 7v6M7 10h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
                <div className="guide-step-text">
                  <span className="guide-step-n" aria-hidden="true">{i + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {parts.length ? (
          <section className="guide-parts" aria-labelledby="guide-parts-title">
            <h2 id="guide-parts-title">{entry.guide.parent ? `More ${TOOL_CONTENT[family]?.guide.toolLabel ?? ""} guides` : "A guide for each tab"}</h2>
            <ul className="guide-parts-list">
              {[...(entry.guide.parent ? [{ toolSlug: family, ...TOOL_CONTENT[family].guide }] : []), ...parts]
                .filter((g) => g.slug !== entry.guide.slug)
                .map((g) => (
                  <li key={g.slug}>
                    <Link to={`/guides/${g.slug}`} className="guide-part">
                      <img src={assetUrl(TOOL_CONTENT[g.toolSlug].quick.poster)} alt="" loading="lazy" width={320} height={200} />
                      <span>
                        <small>{g.toolLabel}</small>
                        <b>{g.h1}</b>
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

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

        {zoom ? <ZoomedImage src={zoom.src} title={zoom.title} onClose={() => setZoom(null)} /> : null}

        <aside className="guide-more">
          <h2>More Albion Online guides</h2>
          <ul>
            {GUIDES.filter((g) => g.slug !== entry.guide.slug && !g.parent).map((g) => (
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
