// Writes a page's <head> (title, description, canonical, Open Graph, robots, JSON-LD) and its
// crawler-visible <noscript> text into the SPA's index.html. Used by the post-build prerender
// (scripts/prerender-seo.mjs) and by the item-page function (api/seo/price-page.js), so a static
// page and a generated one carry exactly the same tags.

export function escAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function setTitle(html, title) {
  // replacement functions throughout: a "$&" in a page's text must stay text, not become a match
  return html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escText(title)}</title>`);
}

export function setMeta(html, attr, key, content) {
  const re = new RegExp(`<meta\\s+${attr}="${key}"[\\s\\S]*?content="[\\s\\S]*?"\\s*/?>`, "i");
  const tag = `<meta ${attr}="${key}" content="${escAttr(content)}" />`;
  if (re.test(html)) return html.replace(re, () => tag);
  // tag missing: inject before </head>
  return html.replace(/<\/head>/i, () => `    ${tag}\n  </head>`);
}

export function setCanonical(html, href) {
  const re = /<link\s+rel="canonical"[\s\S]*?\/?>/i;
  const tag = `<link rel="canonical" href="${escAttr(href)}" />`;
  if (re.test(html)) return html.replace(re, () => tag);
  return html.replace(/<\/head>/i, () => `    ${tag}\n  </head>`);
}

export function setNoscript(html, inner) {
  const re = /<noscript>[\s\S]*?<\/noscript>/i;
  const block = `<noscript>\n${inner}\n    </noscript>`;
  if (re.test(html)) return html.replace(re, () => block);
  return html.replace(/<div id="root"><\/div>/i, () => `<div id="root"></div>\n    ${block}`);
}

export function injectJsonLd(html, objects) {
  const scripts = objects
    .map((obj) => `    <script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/</g, "\\u003c")}\n    </script>`)
    .join("\n");
  return html.replace(/<\/head>/i, () => `${scripts}\n  </head>`);
}

export const INDEX_ROBOTS = "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1";

/**
 * Every head tag of one page in one call.
 * page: { title, description, keywords?, canonical, image, noindex?, noscript, jsonLd? }
 */
export function applyPageMeta(html, page) {
  let out = setTitle(html, page.title);
  out = setMeta(out, "name", "description", page.description);
  if (page.keywords) out = setMeta(out, "name", "keywords", page.keywords);
  out = setCanonical(out, page.canonical);
  out = setMeta(out, "name", "robots", page.noindex ? "noindex,follow" : INDEX_ROBOTS);
  out = setMeta(out, "property", "og:title", page.title);
  out = setMeta(out, "property", "og:description", page.description);
  out = setMeta(out, "property", "og:url", page.canonical);
  out = setMeta(out, "property", "og:image", page.image);
  out = setMeta(out, "name", "twitter:image", page.image);
  out = setMeta(out, "name", "twitter:title", page.title);
  out = setMeta(out, "name", "twitter:description", page.description);
  out = setNoscript(out, page.noscript);
  if (page.jsonLd?.length) out = injectJsonLd(out, page.jsonLd);
  return out;
}
