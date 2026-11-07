/** An item a visitor watches or recently looked at: page slug, enchantment and quality. */
export type SavedItem = { slug: string; e: number; q: number };

export const WATCH_KEY = "pc:watchlist";
export const RECENT_KEY = "pc:recent";

export const sameSaved = (a: SavedItem, b: SavedItem) => a.slug === b.slug && a.e === b.e && a.q === b.q;
