import type { ItemEntry } from "../core/items";

/** /prices/adepts-bag, with ?e=2 for an enchantment and ?q=4 for a quality other than Normal. */
export function itemPath(item: Pick<ItemEntry, "slug">, enchant: number | null = 0, quality = 1): string {
  const params = new URLSearchParams();
  if (enchant) params.set("e", String(enchant));
  if (quality > 1) params.set("q", String(quality));
  const query = params.toString();
  return `/prices/${item.slug}${query ? `?${query}` : ""}`;
}
