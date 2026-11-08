/** An item a visitor watches or recently looked at: page slug, enchantment and quality. */
export type SavedItem = { slug: string; e: number; q: number };

export const WATCH_KEY = "pc:watchlist";
export const RECENT_KEY = "pc:recent";

export const sameSaved = (a: SavedItem, b: SavedItem) => a.slug === b.slug && a.e === b.e && a.q === b.q;

/** Lists come from this browser's storage, which anyone can edit: keep only well-formed entries. */
export function isSavedItem(value: unknown): value is SavedItem {
  const v = value as Partial<SavedItem> | null;
  return (
    !!v &&
    typeof v.slug === "string" &&
    /^[a-z0-9-]{1,120}$/.test(v.slug) &&
    Number.isInteger(v.e) &&
    (v.e as number) >= 0 &&
    (v.e as number) <= 4 &&
    Number.isInteger(v.q) &&
    (v.q as number) >= 1 &&
    (v.q as number) <= 5
  );
}
