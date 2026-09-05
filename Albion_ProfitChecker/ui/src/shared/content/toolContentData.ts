import contentData from "./toolContent.json";

/**
 * Shared types + lookups for the tool explainer copy.
 *
 * toolContent.json is the single source of truth: the compact ToolSummary block on each
 * tool page, the long-form guide pages, and the post-build SEO prerender all read it, so
 * the static HTML a crawler sees always matches what a visitor sees.
 */

export type ContentSection = {
  heading: string;
  paragraphs?: string[];
  list?: string[];
};

export type FaqItem = {
  q: string;
  a: string;
};

export type SummaryCard = {
  label: string;
  formula: string;
  text: string;
};

export type GuideMeta = {
  slug: string;
  h1: string;
  title: string;
  description: string;
  keywords: string;
  /** Display name of the tool this guide belongs to. */
  toolLabel: string;
};

export type ToolContentEntry = {
  title: string;
  guide: GuideMeta;
  summary: {
    intro: string;
    cards: SummaryCard[];
    tipsHeading: string;
    tips: string[];
  };
  sections: ContentSection[];
  faq: FaqItem[];
};

export const TOOL_CONTENT = contentData as unknown as Record<string, ToolContentEntry>;

/** Tool page slugs that have an explainer, e.g. "crafting-calculator". */
export type ToolSlug = keyof typeof contentData;

/** Every guide, in the order they appear in the content file. */
export const GUIDES = Object.entries(TOOL_CONTENT).map(([toolSlug, entry]) => ({
  toolSlug,
  ...entry.guide
}));

/** Looks up a guide (and its body) by its URL slug. */
export function findGuideBySlug(slug: string): { toolSlug: string; entry: ToolContentEntry } | null {
  for (const [toolSlug, entry] of Object.entries(TOOL_CONTENT)) {
    if (entry.guide.slug === slug) return { toolSlug, entry };
  }
  return null;
}
