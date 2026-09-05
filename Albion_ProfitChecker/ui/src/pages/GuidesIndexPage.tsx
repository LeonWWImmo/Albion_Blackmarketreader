import { useEffect } from "react";
import { Link } from "react-router-dom";
import { GUIDES } from "@shared/content/toolContentData";
import { useSeo } from "../shared/seo/useSeo";
import "./guides.css";

export function GuidesIndexPage() {
  useSeo({
    title: "Albion Online Crafting & Market Guides | Blackmarket Reader",
    description:
      "Free Albion Online guides on crafting profit, refining, cooking and alchemy, Black Market crafting and flipping, with the exact formulas the calculators use.",
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
            The maths behind every calculator on this site, written out in full. Each guide covers how the game
            actually works, the formulas the tool uses, worked examples and the mistakes that quietly cost silver.
          </p>
        </header>

        <ul className="guide-index-list">
          {GUIDES.map((guide) => (
            <li key={guide.slug}>
              <Link to={`/guides/${guide.slug}`} className="guide-index-card">
                <h2>{guide.h1}</h2>
                <p>{guide.description}</p>
                <span className="guide-index-tool">{guide.toolLabel}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
