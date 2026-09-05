import fs from "node:fs/promises";
import path from "node:path";

/**
 * Post-build SEO prerender.
 *
 * A Vite SPA serves one index.html for every route, so crawlers see the homepage
 * title + a homepage canonical on every URL — which makes Google consolidate all
 * tool pages into the homepage. This script generates a dedicated dist/<route>/index.html
 * per route with the correct per-route <title>, description, canonical, OG/Twitter tags,
 * SoftwareApplication + BreadcrumbList JSON-LD, and crawler-visible <noscript> content.
 *
 * vercel.json serves these static files directly (filesystem precedence) and falls back
 * to the SPA shell for any unknown path.
 *
 * Run automatically after `vite build` (see package.json build script).
 */

const SITE = "https://blackmarketreader.com";
const OG_IMAGE = `${SITE}/picture/bm-crafter-table.png`;
const distDir = path.join(process.cwd(), "dist");

/**
 * The long-form explainer shown under each tool. Same file the ToolContent React
 * component renders, so the no-JavaScript HTML matches what a visitor sees.
 */
const toolContent = JSON.parse(
  await fs.readFile(path.join(process.cwd(), "src", "shared", "content", "toolContent.json"), "utf8")
);

const TOOL_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/bm-crafter", label: "Black Market Crafter" },
  { href: "/crafting-calculator", label: "Crafting Calculator" },
  { href: "/refining-calculator", label: "Refining Calculator" },
  { href: "/food-potion-crafter", label: "Food & Potion Crafter" },
];

/** Indexable routes. Home (/) keeps the as-built dist/index.html. */
const ROUTES = [
  {
    path: "dashboard",
    title: "Albion Online Black Market Dashboard | Blackmarket Reader",
    description:
      "Albion Online Black Market dashboard with live deal discovery, city price comparison, and profit filters to find the most profitable Black Market flips.",
    keywords: "Albion Online Black Market, Albion Black Market dashboard, Albion market flipper, Albion price comparison",
    h1: "Albion Online Black Market Dashboard",
    intro:
      "Discover the most profitable Albion Online Black Market deals. Compare royal city sell prices against Black Market buy orders, filter by profit and sold-per-day, and spot flips at a glance with live market data.",
  },
  {
    path: "bm-crafter",
    title: "Albion Online Black Market Crafter | Blackmarket Reader",
    description:
      "Albion Online Black Market Crafter with material costs, artefact prices, Black Market values, station fees, focus, and profit views for the most profitable crafting routes.",
    keywords: "Albion Black Market Crafter, Albion Online crafting profit, Albion black market crafting, Albion craft to black market",
    h1: "Albion Online Black Market Crafter",
    intro:
      "Find out which items are profitable to craft and sell to the Black Market in Albion Online. The Black Market Crafter compares material and artefact costs against Black Market prices with return rate, station fee, focus, and daily-potential analysis.",
  },
  {
    path: "crafting-calculator",
    title: "Albion Online Crafting Calculator | Blackmarket Reader",
    description:
      "Albion Online Crafting Calculator with per-city material prices, artefacts, return rate, focus specs, Black Market selling, and full profit and cost breakdowns for crafted gear.",
    keywords: "Albion Online crafting calculator, Albion craft calculator, Albion crafting profit calculator, Albion crafting cost",
    h1: "Albion Online Crafting Calculator",
    intro:
      "Plan profitable crafts in Albion Online. Enter material and artefact prices per city, set your return rate and focus, and get exact craft cost, profit, ROI, and silver-per-focus for every tier and enchantment.",
  },
  {
    path: "refining-calculator",
    title: "Albion Online Refining Calculator | Blackmarket Reader",
    description:
      "Albion Online Refining Calculator with raw-material city prices, refined output values, focus presets, taxes, return rate, and refining profit analysis for metal, wood, fiber, hide, and stone.",
    keywords: "Albion Online refining calculator, Albion refining profit, Albion resource refining, Albion refine calculator",
    h1: "Albion Online Refining Calculator",
    intro:
      "Calculate refining profit in Albion Online for ore, wood, fiber, hide, and stone across every tier and enchantment. Includes Albion-correct recipes, return rate presets, per-material focus specs, bonus cities, and market taxes.",
  },
  {
    path: "food-potion-crafter",
    title: "Albion Online Food & Potion Crafter | Blackmarket Reader",
    description:
      "Albion Online Food and Potion crafting profit calculator with ingredient costs, return rate, station fees, focus, and per-recipe profit analysis for cooking and alchemy across all tiers.",
    keywords: "Albion Online food crafter, Albion potion crafter, Albion cooking calculator, Albion alchemy calculator, Albion consumable profit",
    h1: "Albion Online Food & Potion Crafter",
    intro:
      "Calculate cooking and alchemy profit in Albion Online. Scan profitable food and potion recipes or punch in your own ingredient prices — with return rate, station fees, focus, and all tiers shown at once for each product.",
  },
  {
    path: "community",
    title: "Community | Blackmarket Reader — Albion Online Tools",
    description: "Join the Blackmarket Reader community for Albion Online crafting, refining, and Black Market trading tools, tips, and updates.",
    keywords: "Albion Online community, Blackmarket Reader community, Albion trading community",
    h1: "Blackmarket Reader Community",
    intro: "Connect with other Albion Online crafters and traders using Blackmarket Reader's free market tools.",
  },
  {
    path: "legal",
    title: "Legal | Blackmarket Reader — Albion Online Tools",
    description: "Legal information, privacy, and terms for Blackmarket Reader, a set of free Albion Online market and crafting tools.",
    keywords: "Blackmarket Reader legal, privacy, terms",
    h1: "Legal",
    intro: "Legal, privacy, and terms information for Blackmarket Reader.",
    noindex: true,
  },
  {
    path: "login",
    title: "Login | Blackmarket Reader",
    description: "Sign in to Blackmarket Reader to save your Albion Online crafting and refining presets.",
    keywords: "",
    h1: "Login",
    intro: "Sign in to save your Albion Online crafting and refining presets.",
    noindex: true,
  },
];

/** The guides index plus one route per guide, both generated from the content file. */
const GUIDE_ROUTES = [
  {
    path: "guides",
    title: "Albion Online Crafting & Market Guides | Blackmarket Reader",
    description:
      "Free Albion Online guides on crafting profit, refining, cooking and alchemy, Black Market crafting and flipping, with the exact formulas the calculators use.",
    keywords: "Albion Online guides, Albion crafting guide, Albion refining guide, Albion black market guide",
    h1: "Albion Online guides",
    intro:
      "The maths behind every calculator on this site, written out in full. Each guide covers how the game actually works, the formulas the tool uses, worked examples and the mistakes that quietly cost silver.",
    guidesIndex: Object.values(toolContent).map((entry) => entry.guide),
  },
  ...Object.values(toolContent).map((entry) => ({
    path: `guides/${entry.guide.slug}`,
    title: entry.guide.title,
    description: entry.guide.description,
    keywords: entry.guide.keywords,
    h1: entry.guide.h1,
    intro: entry.guide.description,
    guideOf: entry,
  })),
];

ROUTES.push(...GUIDE_ROUTES);

function escAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function setTitle(html, title) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escText(title)}</title>`);
}
function setMeta(html, attr, key, content) {
  const re = new RegExp(`<meta\\s+${attr}="${key}"[\\s\\S]*?content="[\\s\\S]*?"\\s*/?>`, "i");
  const tag = `<meta ${attr}="${key}" content="${escAttr(content)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  // tag missing — inject before </head>
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}
function setCanonical(html, href) {
  const re = /<link\s+rel="canonical"[\s\S]*?\/?>/i;
  const tag = `<link rel="canonical" href="${escAttr(href)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}
function setRobots(html, content) {
  return setMeta(html, "name", "robots", content);
}
function setNoscript(html, inner) {
  const re = /<noscript>[\s\S]*?<\/noscript>/i;
  const block = `<noscript>\n${inner}\n    </noscript>`;
  if (re.test(html)) return html.replace(re, block);
  return html.replace(/<div id="root"><\/div>/i, `<div id="root"></div>\n    ${block}`);
}
function injectJsonLd(html, objects) {
  const scripts = objects
    .map((obj) => `    <script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n    </script>`)
    .join("\n");
  return html.replace(/<\/head>/i, `${scripts}\n  </head>`);
}

/**
 * The quiet guide link at the foot of a tool page (mirrors the ToolGuideLink component),
 * or "" for routes without a guide.
 */
function guideLinkHtml(route) {
  const content = toolContent[route.path];
  if (!content) return "";
  const { guide } = content;
  return `        <p><a href="/guides/${guide.slug}"><strong>${escText(guide.h1)}</strong></a> &mdash; ${escText(guide.description)}</p>`;
}

/** The full article body a guide page shows (mirrors GuidePage), including the formula cards. */
function guideHtml(entry) {
  const cards = entry.summary.cards
    .map(
      (card) =>
        `        <h2>${escText(card.label)}</h2>\n        <p><code>${escText(card.formula)}</code></p>\n        <p>${escText(card.text)}</p>`
    )
    .join("\n");

  const sections = entry.sections
    .map((section) => {
      const paragraphs = (section.paragraphs || []).map((p) => `        <p>${escText(p)}</p>`).join("\n");
      const list = section.list?.length
        ? `        <ul>\n${section.list.map((li) => `          <li>${escText(li)}</li>`).join("\n")}\n        </ul>`
        : "";
      return [`        <h2>${escText(section.heading)}</h2>`, paragraphs, list].filter(Boolean).join("\n");
    })
    .join("\n");

  const faq = entry.faq
    .map((item) => `        <dt>${escText(item.q)}</dt>\n        <dd>${escText(item.a)}</dd>`)
    .join("\n");

  return `${cards}
${sections}
        <h2>Frequently asked questions</h2>
        <dl>
${faq}
        </dl>`;
}

/** The guides index listing. */
function guidesIndexHtml(route) {
  const items = route.guidesIndex
    .map(
      (g) =>
        `        <li><a href="/guides/${g.slug}">${escText(g.h1)}</a> &mdash; ${escText(g.description)}</li>`
    )
    .join("\n");
  return `        <ul>\n${items}\n        </ul>`;
}

function noscriptContent(route) {
  const links = TOOL_LINKS.map((l) => `        <li><a href="${l.href}">${escText(l.label)}</a></li>`).join("\n");
  const body = route.guidesIndex
    ? guidesIndexHtml(route)
    : route.guideOf
      ? guideHtml(route.guideOf)
      : guideLinkHtml(route);
  return `      <section style="max-width: 760px; margin: 40px auto; padding: 0 20px; font-family: system-ui, sans-serif; color: #e2e8f0">
        <h1>${escText(route.h1)}</h1>
        <p>${escText(route.intro)}</p>
${body ? `${body}\n` : ""}        <p>More free Albion Online tools by RomulusKings:</p>
        <ul>
${links}
        </ul>
        <p><a href="/guides">Albion Online guides</a> &mdash; the maths behind every calculator, written out in full.</p>
      </section>`;
}

/** FAQPage schema — only on guide pages, which is where the visible FAQ lives. */
function faqLd(route) {
  if (!route.guideOf?.faq?.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: route.guideOf.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

/** CollectionPage schema for the guides index. */
function collectionLd(route, canonical) {
  if (!route.guidesIndex) return null;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: route.h1,
    description: route.description,
    url: canonical,
    hasPart: route.guidesIndex.map((g) => ({
      "@type": "Article",
      headline: g.h1,
      description: g.description,
      url: `${SITE}/guides/${g.slug}`,
    })),
  };
}

/** Article schema for guide pages. */
function articleLd(route, canonical) {
  if (!route.guideOf) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: route.h1,
    description: route.description,
    url: canonical,
    image: OG_IMAGE,
    author: { "@type": "Organization", name: "RomulusKings" },
    publisher: { "@type": "Organization", name: "RomulusKings" },
  };
}

function softwareAppLd(route, canonical) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: route.h1,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: canonical,
    description: route.description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@type": "Organization", name: "RomulusKings" },
  };
}
function breadcrumbLd(route, canonical) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: route.h1, item: canonical },
    ],
  };
}

async function main() {
  const template = await fs.readFile(path.join(distDir, "index.html"), "utf8");
  let generated = 0;

  for (const route of ROUTES) {
    const canonical = `${SITE}/${route.path}`;
    let html = template;

    html = setTitle(html, route.title);
    html = setMeta(html, "name", "description", route.description);
    if (route.keywords) html = setMeta(html, "name", "keywords", route.keywords);
    html = setCanonical(html, canonical);
    html = setRobots(html, route.noindex ? "noindex,follow" : "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1");

    html = setMeta(html, "property", "og:title", route.title);
    html = setMeta(html, "property", "og:description", route.description);
    html = setMeta(html, "property", "og:url", canonical);
    html = setMeta(html, "property", "og:image", OG_IMAGE);
    html = setMeta(html, "name", "twitter:title", route.title);
    html = setMeta(html, "name", "twitter:description", route.description);

    html = setNoscript(html, noscriptContent(route));

    if (!route.noindex) {
      // Guides are articles, the guides index is a collection, tool pages are the app itself.
      const primary = route.guideOf
        ? articleLd(route, canonical)
        : route.guidesIndex
          ? collectionLd(route, canonical)
          : softwareAppLd(route, canonical);
      const schemas = [primary, breadcrumbLd(route, canonical)].filter(Boolean);
      const faq = faqLd(route);
      if (faq) schemas.push(faq);
      html = injectJsonLd(html, schemas);
    }

    const outDir = path.join(distDir, route.path);
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "index.html"), html, "utf8");
    generated += 1;
    console.log(`prerendered /${route.path} -> ${route.path}/index.html`);
  }

  console.log(`SEO prerender complete: ${generated} routes.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
