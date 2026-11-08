import fs from "node:fs/promises";
import path from "node:path";
import { applyPageMeta, escText } from "../api/_lib/pageMeta.js";

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

/** Tool pages with their own share image; the rest use OG_IMAGE. Guides use their tool's. */
const TOOL_OG_IMAGE = {
  "gold-tracker": `${SITE}/picture/gold-tracker-preview.png`,
  "loot-split": `${SITE}/picture/loot-split-preview.png`,
  prices: `${SITE}/picture/price-checker-preview.png`,
};

const TOOL_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/bm-crafter", label: "Black Market Crafter" },
  { href: "/crafting-calculator", label: "Crafting Calculator" },
  { href: "/refining-calculator", label: "Refining Calculator" },
  { href: "/food-potion-crafter", label: "Food & Potion Crafter" },
  { href: "/gold-tracker", label: "Gold Tracker" },
  { href: "/loot-split", label: "Loot Split" },
  { href: "/prices", label: "Price Checker" },
];

/** Indexable routes. Home (/) keeps the as-built dist/index.html. */
const ROUTES = [
  {
    path: "dashboard",
    title: "Albion Online Black Market Dashboard | Blackmarket Reader",
    description:
      "Free Albion Online community tool: Black Market dashboard with daily-synced deal discovery, city price comparison, and profit filters to find the most profitable Black Market flips.",
    keywords: "Albion Online Black Market, Albion Black Market dashboard, Albion market flipper, Albion price comparison",
    h1: "Albion Online Black Market Dashboard",
    intro:
      "Discover the most profitable Albion Online Black Market deals. Compare royal city sell prices against Black Market buy orders, filter by profit and sold-per-day, and spot flips at a glance. Market data is synced once per day for free users.",
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
    path: "gold-tracker",
    title: "Albion Online Gold Price Tracker & Gold Calculator | Blackmarket Reader",
    description:
      "Live Albion Online gold price for Europe and America: silver per gold, 24h and 7-day change, a 90-day gold chart, a buy-or-wait signal and a gold to silver calculator, including what Premium costs in silver.",
    keywords: "Albion Online gold price, Albion gold, Albion gold tracker, Albion Online gold calculator, Albion gold to silver, Albion silver to gold, Albion gold chart, Albion Premium silver, Albion Online Gold Rechner",
    h1: "Albion Online Gold Price Tracker & Gold Calculator",
    ogImage: `${SITE}/picture/gold-tracker-preview.png`,
    intro:
      "Track the Albion Online gold price on the Europe and America servers. See silver per gold right now, the 24-hour and 7-day change, a 90-day gold chart, whether gold is cheap or expensive compared with the last 30 days, the hours and weekdays when gold has been cheapest, and convert gold to silver and back with the gold calculator, including what 30 days of Premium (3,750 gold) cost in silver.",
  },
  {
    path: "loot-split",
    title: "Albion Online Loot Split Calculator | Blackmarket Reader",
    description:
      "Paste your Albion Online guild chest log and get the loot's value at live Black Market and market prices, the best way to sell each item and a fair split per player, ready for Discord.",
    keywords: "Albion Online loot split, Albion loot split calculator, Albion chest log, Albion guild loot, Albion Black Market prices",
    h1: "Albion Online Loot Split Calculator",
    ogImage: `${SITE}/picture/loot-split-preview.png`,
    intro:
      "Split guild loot in Albion Online from the chest log. Paste the log, pick the run that counts, and every item is valued at live Black Market, city buy order or sell order prices after tax. Repairs are paid back to the players who paid them, the guild takes its cut, the rest is shared by share, and the result is ready to paste into Discord with a link to the same split.",
  },
  {
    path: "prices",
    title: "Albion Online Price Checker: Every Item, Every City | Blackmarket Reader",
    description:
      "Live Albion Online market prices for every item in every city and the Black Market: the cheapest place to buy, the best place to sell, price history and how old each price is.",
    keywords: "Albion Online price checker, Albion Online prices, Albion market prices, Albion item price, Albion Black Market price",
    h1: "Albion Online Price Checker",
    ogImage: `${SITE}/picture/price-checker-preview.png`,
    intro:
      "Search any of the 3,700+ items traded in Albion Online and see its price in every royal city, Caerleon, Brecilien and the Black Market: the cheapest sell order to buy from, the best buy order to sell into straight away, whether a flip pays after tax, the price history, items sold per day and how long ago each price was seen.",
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
      "Free Albion Online guides on crafting profit, refining, cooking and alchemy, Black Market crafting and flipping and the gold price, with the exact formulas the tools use.",
    keywords: "Albion Online guides, Albion crafting guide, Albion refining guide, Albion black market guide",
    h1: "Albion Online guides",
    intro:
      "Every tool in a short clip and three steps. The full maths, formulas and examples are one click away in each guide.",
    guidesIndex: Object.values(toolContent).map((entry) => entry.guide),
  },
  ...Object.entries(toolContent).map(([toolSlug, entry]) => ({
    path: `guides/${entry.guide.slug}`,
    ogImage: TOOL_OG_IMAGE[toolSlug],
    title: entry.guide.title,
    description: entry.guide.description,
    keywords: entry.guide.keywords,
    h1: entry.guide.h1,
    intro: entry.quick?.tagline || entry.guide.description,
    guideOf: entry,
  })),
];

ROUTES.push(...GUIDE_ROUTES);

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
  // the quick layer the page opens with: the sentence and the three picture steps
  const quick = entry.quick
    ? `        <p>${escText(entry.quick.tagline)}</p>\n        <h2>How it works</h2>\n        <ol>\n${entry.quick.steps
        .map((step) => `          <li><strong>${escText(step.title)}</strong>: ${escText(step.text)}</li>`)
        .join("\n")}\n        </ol>\n`
    : "";
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

  return `${quick}${cards}
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
    image: route.ogImage || OG_IMAGE,
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

    // Guides are articles, the guides index is a collection, tool pages are the app itself.
    const jsonLd = [];
    if (!route.noindex) {
      jsonLd.push(route.guideOf ? articleLd(route, canonical) : route.guidesIndex ? collectionLd(route, canonical) : softwareAppLd(route, canonical));
      jsonLd.push(breadcrumbLd(route, canonical));
      const faq = faqLd(route);
      if (faq) jsonLd.push(faq);
    }
    const html = applyPageMeta(template, {
      title: route.title,
      description: route.description,
      keywords: route.keywords,
      canonical,
      image: route.ogImage || OG_IMAGE,
      noindex: route.noindex,
      noscript: noscriptContent(route),
      jsonLd: jsonLd.filter(Boolean)
    });

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
