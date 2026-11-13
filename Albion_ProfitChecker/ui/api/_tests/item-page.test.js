import { describe, expect, it } from "vitest";
import { renderItemPage } from "../_lib/itemPage.js";
import { applyPageMeta } from "../_lib/pageMeta.js";

const TEMPLATE = `<!doctype html><html><head><title>Home</title>
<meta name="description" content="home" />
<link rel="canonical" href="https://blackmarketreader.com/" />
</head><body><div id="root"></div><noscript>home</noscript><script type="module" src="/assets/index-abc.js"></script></body></html>`;
const ROWS = [["T4_BAG", "Adept's Bag", "adepts-bag", "bags", "bags", 4, 3.4, 4]];

describe("item page head", () => {
  it("gives an item page its own title, canonical, share image and crawler text", () => {
    const { status, html } = renderItemPage(TEMPLATE, ROWS, "adepts-bag");
    expect(status).toBe(200);
    expect(html).toContain("<title>Adept&#39;s Bag Price in Albion Online: Every City | Blackmarket Reader</title>".replace("&#39;", "'"));
    expect(html).toContain('<link rel="canonical" href="https://blackmarketreader.com/prices/adepts-bag" />');
    expect(html).toContain('<meta property="og:image" content="https://render.albiononline.com/v1/item/T4_BAG.png" />');
    expect(html).toContain("<h1>Adept&#39;s Bag price in Albion Online</h1>".replace("&#39;", "'"));
    expect(html).toContain('"@type": "BreadcrumbList"');
    expect(html).toContain('<script type="module" src="/assets/index-abc.js"></script>');
    expect(html).not.toContain("noindex");
  });

  it("answers an unknown or odd address with 404 and noindex, still running the app", () => {
    for (const slug of ["nope", "../etc", "<script>"]) {
      const { status, html } = renderItemPage(TEMPLATE, ROWS, slug);
      expect(status).toBe(404);
      expect(html).toContain('content="noindex,follow"');
      expect(html).not.toContain("<script>\n");
      expect(html).toContain("/assets/index-abc.js");
    }
  });

  it("escapes what it writes into the page", () => {
    const html = applyPageMeta(TEMPLATE, {
      title: 'A "quoted" <b>name</b> $&',
      description: "d",
      canonical: "https://x/",
      image: "https://x/i.png",
      noscript: "<p>$& stays</p>",
      jsonLd: [{ name: "</script><script>alert(1)</script>" }]
    });
    expect(html).toContain("<title>A \"quoted\" &lt;b&gt;name&lt;/b&gt; $&amp;</title>");
    expect(html).toContain('content="A &quot;quoted&quot; &lt;b&gt;name&lt;/b&gt; $&amp;"');
    expect(html).toContain("<p>$& stays</p>");
    expect(html).not.toContain("</script><script>alert(1)");
  });
});

describe("related items", () => {
  const rows = [
    ["T4_2H_CROSSBOW", "Adept's Crossbow", "adepts-crossbow", "weapons", "crossbow", 4],
    ["T8_2H_CROSSBOW", "Elder's Crossbow", "elders-crossbow", "weapons", "crossbow", 8],
    ["T5_2H_CROSSBOW", "Expert's Crossbow", "experts-crossbow", "weapons", "crossbow", 5],
    ["T8_2H_CROSSBOWLARGE", "Elder's Heavy Crossbow", "elders-heavy-crossbow", "weapons", "crossbow", 8],
    ["T8_BAG", "Elder's Bag", "elders-bag", "bags", "bags", 8]
  ];

  it("links other tiers first, then the same kind of item at the same tier", () => {
    const { html } = renderItemPage(TEMPLATE, rows, "elders-crossbow");
    const links = [...html.matchAll(/href="\/prices\/([a-z-]+)"/g)].map((m) => m[1]);
    expect(links).toEqual(["adepts-crossbow", "experts-crossbow", "elders-heavy-crossbow"]);
  });

  it("leaves the list out when nothing is related", () => {
    expect(renderItemPage(TEMPLATE, rows, "elders-bag").html).not.toContain("Related item prices");
  });
});
