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
