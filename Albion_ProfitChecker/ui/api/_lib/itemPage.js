// The head and crawler text of one Price Checker item page (/prices/<slug>). There are 3,700+ items,
// so these pages are not prerendered as files: api/seo/price-page.js renders each on request into
// the site's index.html and the CDN keeps it. The texts match what the page itself sets with useSeo.
import { applyPageMeta, escText } from "./pageMeta.js";

const SITE = "https://blackmarketreader.com";

export const itemTitle = (name) => `${name} Price in Albion Online: Every City | Blackmarket Reader`;
export const itemDescription = (name) =>
  `Live Albion Online price of ${name} in every royal city, Caerleon, Brecilien and the Black Market: the cheapest place to buy, the best place to sell and the price history.`;

/** The item's icon from Albion's own image server, as its share preview. */
const iconUrl = (id) => `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png`;

const baseId = (id) => id.replace(/^T\d+_/, "");
const MAX_RELATED = 12;

/**
 * Other tiers of the same item, then items of the same kind and tier: links between item pages,
 * so crawlers that do not run JavaScript reach more of them than the sitemap alone gives.
 */
export function relatedItems(rows, row) {
  const [id, , , , sub, tier] = row;
  const tiers = rows.filter((r) => r[0] !== id && baseId(r[0]) === baseId(id)).sort((a, b) => a[5] - b[5]);
  const kind = rows.filter((r) => r[0] !== id && sub && r[4] === sub && r[5] === tier && !tiers.includes(r));
  return [...tiers, ...kind].slice(0, MAX_RELATED);
}

/**
 * rows: public/data/items-index.json. Returns the status and the page for one slug; an unknown slug
 * gets the app (which shows "no item at this address") with a 404 and noindex.
 */
export function renderItemPage(template, rows, slug) {
  const row = /^[a-z0-9-]{1,160}$/.test(slug) ? rows.find((r) => r[2] === slug) : null;
  if (!row) {
    return {
      status: 404,
      html: applyPageMeta(template, {
        title: "Item not found | Price Checker | Blackmarket Reader",
        description: "There is no Albion Online item at this address. Search all items in the Price Checker.",
        canonical: `${SITE}/prices`,
        image: `${SITE}/picture/price-checker-preview.png`,
        noindex: true,
        noscript: `      <p>No item at this address. <a href="/prices">Search all Albion Online items</a>.</p>`
      })
    };
  }
  const [id, name, , , , tier] = row;
  const canonical = `${SITE}/prices/${slug}`;
  const related = relatedItems(rows, row).map((r) => `          <li><a href="/prices/${r[2]}">${escText(r[1])} price</a></li>`);
  return {
    status: 200,
    html: applyPageMeta(template, {
      title: itemTitle(name),
      description: itemDescription(name),
      keywords: `${name} price, ${name} Albion Online, Albion Online prices, Albion Online price checker`,
      canonical,
      image: iconUrl(id),
      noscript: [
        `      <section style="max-width: 760px; margin: 40px auto; padding: 0 20px; font-family: system-ui, sans-serif; color: #e2e8f0">`,
        `        <h1>${escText(name)} price in Albion Online</h1>`,
        `        <p>${escText(itemDescription(name))}${tier ? ` Tier ${tier}, item id ${escText(id)}.` : ""}</p>`,
        ...(related.length ? [`        <h2>Related item prices</h2>`, `        <ul>`, ...related, `        </ul>`] : []),
        `        <p><a href="/prices">Search every Albion Online item in the Price Checker</a></p>`,
        `      </section>`
      ].join("\n"),
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
            { "@type": "ListItem", position: 2, name: "Price Checker", item: `${SITE}/prices` },
            { "@type": "ListItem", position: 3, name, item: canonical }
          ]
        }
      ]
    })
  };
}
