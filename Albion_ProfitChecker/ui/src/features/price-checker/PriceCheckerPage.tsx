import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSeo } from "../../shared/seo/useSeo";
import { SeoHeading } from "../../shared/seo/SeoHeading";
import { CATEGORIES, baseName, familyKey, iconUrl, type ItemEntry, type ItemIndex } from "./core/items";
import { useItemIndex, useStoredList } from "./hooks/usePriceData";
import { TierBadge } from "./ui/badges";
import { itemPath } from "./ui/paths";
import { SearchBox } from "./ui/SearchBox";
import { PriceCheckerShell } from "./ui/Shell";
import { sameSaved, type SavedItem, RECENT_KEY, WATCH_KEY } from "./ui/saved";

const EXAMPLES = ["adepts-bag", "elders-crossbow", "adepts-transport-ox", "pine-planks", "experts-rune"];
const BROWSE_FIRST = 48;

/** One tile per kind of item in a category: the T4 member (or the lowest tier) stands for all tiers. */
function families(index: ItemIndex, category: string): { lead: ItemEntry; tiers: number[] }[] {
  const seen = new Map<string, { lead: ItemEntry; tiers: number[] }>();
  for (const item of index.items) {
    if (item.category !== category) continue;
    const key = familyKey(item.id);
    if (seen.has(key)) continue;
    const members = index.byFamily.get(key) ?? [item];
    seen.set(key, { lead: members.find((m) => m.tier === 4) ?? members[0], tiers: members.map((m) => m.tier).filter(Boolean) });
  }
  return [...seen.values()].sort((a, b) => baseName(a.lead.name).localeCompare(baseName(b.lead.name)));
}

function SavedRow({ title, items, index }: { title: string; items: SavedItem[]; index: ItemIndex | null }) {
  const shown = index ? items.flatMap((saved) => (index.bySlug.get(saved.slug) ? [{ saved, item: index.bySlug.get(saved.slug)! }] : [])) : [];
  if (!shown.length) return null;
  return (
    <section className="pc-saved" aria-label={title}>
      <h2>{title}</h2>
      <ul>
        {shown.map(({ saved, item }) => (
          <li key={`${saved.slug}.${saved.e}.${saved.q}`}>
            <Link to={itemPath(item, saved.e, saved.q)}>
              <img src={iconUrl(item.variants[saved.e] ?? item.id, saved.q)} alt="" loading="lazy" width={52} height={52} />
              <span>
                <b>{item.name}</b>
                <TierBadge tier={item.tier} enchant={saved.e} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PriceCheckerPage() {
  useSeo({
    title: "Albion Online Price Checker: Every Item, Every City | Blackmarket Reader",
    description:
      "Live Albion Online market prices for every item in every city and the Black Market: the cheapest place to buy, the best place to sell, price history and how old each price is.",
    keywords: "Albion Online price checker, Albion Online prices, Albion market prices, Albion item price, Albion Black Market price",
    canonical: "https://blackmarketreader.com/prices"
  });
  const { index, failed } = useItemIndex();
  const [category, setCategory] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [watch] = useStoredList<SavedItem>(WATCH_KEY, 24, sameSaved);
  const [recent] = useStoredList<SavedItem>(RECENT_KEY, 12, sameSaved);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of index?.items ?? []) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, [index]);
  const browse = useMemo(() => (index && category ? families(index, category) : []), [index, category]);

  return (
    <PriceCheckerShell>
      {() => (
        <main className="pc pc-home">
          <SeoHeading title="Albion Online Price Checker">
            Search any Albion Online item and see its price in every royal city, Caerleon, Brecilien and the Black Market, with the
            cheapest place to buy, the best place to sell straight away, the price history and how old every price is.
          </SeoHeading>

          <section className="pc-hero">
            <p className="pc-eyebrow">PRICE CHECKER</p>
            <h2 className="pc-title">
              Every item.
              <br />
              <span>Every city. Live.</span>
            </h2>
            <SearchBox index={index} size="hero" />
            {failed ? <p className="pc-error">The item list could not load. Reload the page to try again.</p> : null}
            <div className="pc-examples">
              <span>Try</span>
              {EXAMPLES.map((slug) => {
                const item = index?.bySlug.get(slug);
                return item ? (
                  <Link key={slug} to={itemPath(item)}>
                    <img src={iconUrl(item.id)} alt="" width={22} height={22} loading="lazy" />
                    {item.name}
                  </Link>
                ) : null;
              })}
            </div>
          </section>

          <SavedRow title="Watchlist" items={watch} index={index} />
          <SavedRow title="Recently viewed" items={recent} index={index} />

          <section className="pc-browse" aria-label="Browse by category">
            <h2>Browse</h2>
            <div className="pc-cats" role="tablist">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={category === c.key}
                  className={category === c.key ? "is-on" : ""}
                  onClick={() => {
                    setCategory(category === c.key ? null : c.key);
                    setShowAll(false);
                  }}
                >
                  <img src={iconUrl(c.icon)} alt="" loading="lazy" width={56} height={56} />
                  <b>{c.label}</b>
                  <small>{counts.get(c.key) ?? "…"}</small>
                </button>
              ))}
            </div>
            {category ? (
              <div className="pc-family-grid">
                {(showAll ? browse : browse.slice(0, BROWSE_FIRST)).map(({ lead, tiers }) => (
                  <Link key={lead.id} to={itemPath(lead)} className="pc-family">
                    <img src={iconUrl(lead.id)} alt="" loading="lazy" width={64} height={64} />
                    <b>{tiers.length > 1 ? baseName(lead.name) : lead.name}</b>
                    <small>{tiers.length > 1 ? `T${tiers[0]}–T${tiers[tiers.length - 1]}` : tiers.length ? `T${tiers[0]}` : ""}</small>
                  </Link>
                ))}
                {browse.length > BROWSE_FIRST && !showAll ? (
                  <button type="button" className="pc-more" onClick={() => setShowAll(true)}>
                    Show all {browse.length}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        </main>
      )}
    </PriceCheckerShell>
  );
}
