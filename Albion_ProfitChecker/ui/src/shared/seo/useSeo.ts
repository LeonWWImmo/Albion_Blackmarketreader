import { useEffect } from "react";

type SeoOptions = {
  title: string;
  description: string;
  keywords?: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogUrl?: string;
  ogImage?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  structuredData?: Record<string, unknown>;
  /** keep this page out of search results (e.g. an address that shows "not found") */
  noindex?: boolean;
  preloadHero?: {
    href: string;
    imageSrcSet?: string;
    imageSizes?: string;
  };
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}='${key}']`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

export function useSeo(options: SeoOptions) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = options.title;

    upsertMeta("name", "description", options.description);
    if (options.keywords) upsertMeta("name", "keywords", options.keywords);
    upsertMeta("name", "robots", options.noindex ? "noindex,follow" : "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1");

    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:title", options.ogTitle ?? options.title);
    upsertMeta("property", "og:description", options.ogDescription ?? options.description);
    if (options.ogUrl) upsertMeta("property", "og:url", options.ogUrl);
    if (options.ogImage) upsertMeta("property", "og:image", options.ogImage);

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", options.twitterTitle ?? options.ogTitle ?? options.title);
    upsertMeta("name", "twitter:description", options.twitterDescription ?? options.ogDescription ?? options.description);
    if (options.twitterImage) upsertMeta("name", "twitter:image", options.twitterImage);

    let canonicalTag = document.head.querySelector<HTMLLinkElement>("link[rel='canonical']");
    if (!canonicalTag) {
      canonicalTag = document.createElement("link");
      canonicalTag.rel = "canonical";
      document.head.appendChild(canonicalTag);
    }
    if (options.canonical) canonicalTag.href = options.canonical;

    let jsonLdScript: HTMLScriptElement | null = null;
    if (options.structuredData) {
      jsonLdScript = document.createElement("script");
      jsonLdScript.type = "application/ld+json";
      jsonLdScript.text = JSON.stringify(options.structuredData);
      document.head.appendChild(jsonLdScript);
    }

    let heroPreload: HTMLLinkElement | null = null;
    if (options.preloadHero?.href) {
      heroPreload = document.createElement("link");
      heroPreload.rel = "preload";
      heroPreload.as = "image";
      heroPreload.href = options.preloadHero.href;
      if (options.preloadHero.imageSrcSet) {
        heroPreload.setAttribute("imagesrcset", options.preloadHero.imageSrcSet);
      }
      if (options.preloadHero.imageSizes) {
        heroPreload.setAttribute("imagesizes", options.preloadHero.imageSizes);
      }
      document.head.appendChild(heroPreload);
    }

    return () => {
      document.title = previousTitle;
      jsonLdScript?.remove();
      heroPreload?.remove();
    };
  }, [options]);
}
