import { baseName, familyKey, type ItemEntry, type ItemIndex } from "./items";

/** One search result: a kind of item across its tiers, with the tier to open first. */
export type SearchHit = {
  family: ItemEntry[];
  /** the member to open: the tier asked for, or the most matching one */
  item: ItemEntry;
  /** the enchantment asked for ("4.1 bag"), else null */
  enchant: number | null;
  label: string;
  score: number;
};

export type ParsedQuery = { words: string[]; tier: number | null; enchant: number | null };

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ']/g, "")
    .replace(/[^a-z0-9.@]+/g, " ")
    .trim();

/** "t4 bag", "4.1 bag", "bag t6", "crossbow .2" -> words plus the tier and enchantment asked for. */
export function parseQuery(query: string): ParsedQuery {
  let tier: number | null = null;
  let enchant: number | null = null;
  const words: string[] = [];
  for (const token of normalize(query).split(" ")) {
    if (!token) continue;
    const tierEnchant = token.match(/^t?([1-8])[.@]([0-4])$/);
    const tierOnly = token.match(/^t([1-8])$/) ?? token.match(/^([1-8])$/);
    const enchantOnly = token.match(/^[.@]([0-4])$/);
    if (tierEnchant) [tier, enchant] = [Number(tierEnchant[1]), Number(tierEnchant[2])];
    else if (tierOnly) tier = Number(tierOnly[1]);
    else if (enchantOnly) enchant = Number(enchantOnly[1]);
    else words.push(token.replace(/[.@]/g, ""));
  }
  return { words: words.filter(Boolean), tier, enchant };
}

/** How well one item matches every word; 0 when a word does not match at all. */
function matchScore(item: ItemEntry, words: string[]): number {
  const name = normalize(item.name);
  const nameWords = name.split(" ");
  const id = item.id.toLowerCase();
  const idParts = id.split(/[_@]/);
  let score = 0;
  for (const word of words) {
    if (nameWords.includes(word)) score += 3;
    else if (nameWords.some((w) => w.startsWith(word))) score += 2;
    // a whole part of the id ("bag" in T4_BAG_INSIGHT), or inside a word from four letters on:
    // "bag" must not find "Cabbage"
    else if (idParts.includes(word) || (word.length >= 4 && (name.includes(word) || id.includes(word)))) score += 1;
    else return 0;
  }
  // the name starting like the query, and short names, read as the closer match
  if (normalize(baseName(item.name)).startsWith(words[0] ?? "")) score += 1;
  return score - name.length / 100;
}

/**
 * Items for a search box: one hit per kind of item (all bag tiers are one "Bag"), best first.
 * With a tier in the query only that tier counts and opens.
 */
export function searchItems(index: ItemIndex, query: string, limit = 8): SearchHit[] {
  const { words, tier, enchant } = parseQuery(query);
  if (!words.length) return [];
  const best = new Map<string, SearchHit>();
  for (const item of index.items) {
    if (tier !== null && item.tier !== tier) continue;
    if (enchant !== null && enchant >= item.variants.length) continue;
    const score = matchScore(item, words);
    if (score <= 0) continue;
    const key = familyKey(item.id);
    const current = best.get(key);
    // the best-matching tier opens; when tiers match equally ("bag"), T4, the common trading tier
    if (current && (current.score > score || (current.score === score && item.tier !== 4))) continue;
    const family = index.byFamily.get(key) ?? [item];
    best.set(key, { family, item, enchant, label: family.length > 1 && tier === null ? baseName(item.name) : item.name, score });
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, limit);
}
