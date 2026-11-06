import { useEffect } from "react";
import { Link } from "react-router-dom";
import { GUIDES, TOOL_CONTENT } from "@shared/content/toolContentData";
import { assetUrl } from "@shared/assets/assets";
import { useSeo } from "../shared/seo/useSeo";
import "./guides.css";

export function GuidesIndexPage() {
  useSeo({
    title: "Albion Online Crafting & Market Guides | Blackmarket Reader",
    description:
      "Free Albion Online guides on crafting profit, refining, cooking and alchemy, Black Market crafting and flipping and the gold price, with the exact formulas the tools use.",
    keywords: "Albion Online guides, Albion crafting guide, Albion refining guide, Albion black market guide",
    canonical: "https://blackmarketreader.com/guides"
  });

  useEffect(() => {
    document.body.classList.add("guide-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter", "panel-open", "crafting-calculator-body");
    return () => {
      document.body.classList.remove("guide-body");
    };
  }, []);

  return (
    <div className="guide-page">
      <div className="guide-shell">
        <nav className="guide-crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
        </nav>

        <header className="guide-header">
          <h1>Albion Online guides</h1>
          <p className="guide-lede">
            Every tool in a short clip and three steps. The full maths, formulas and examples are one click away in
            each guide.
          </p>
        </header>

        <ul className="guide-index-list">
          {GUIDES.map((guide) => (
            <li key={guide.slug}>
              <Link to={`/guides/${guide.slug}`} className="guide-index-card">
                <span className="guide-index-thumb">
                  <img src={assetUrl(TOOL_CONTENT[guide.toolSlug].quick.poster)} alt="" loading="lazy" width={640} height={360} />
                  <span className="guide-index-play" aria-hidden="true">&#9654;</span>
                </span>
                <span className="guide-index-tool">{guide.toolLabel}</span>
                <h2>{guide.h1}</h2>
                <p>{TOOL_CONTENT[guide.toolSlug].quick.tagline}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
