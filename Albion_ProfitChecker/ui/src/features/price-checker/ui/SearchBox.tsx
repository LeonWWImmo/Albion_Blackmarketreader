import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { categoryLabel, iconUrl, type ItemIndex } from "../core/items";
import { parseQuery, searchItems, type SearchHit } from "../core/search";
import { itemPath } from "./paths";
import { TierBadge } from "./badges";

type Props = {
  index: ItemIndex | null;
  /** hero: the big search on /prices; compact: the one in an item page's top bar */
  size: "hero" | "compact";
};

/** Item search as a combobox: type, arrow through the hits, Enter opens one. "/" focuses it from anywhere. */
export function SearchBox({ index, size }: Props) {
  const navigate = useNavigate();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => (index ? searchItems(index, query, size === "hero" ? 8 : 6) : []), [index, query, size]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || target?.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = (hit: SearchHit) => {
    setOpen(false);
    setQuery("");
    input.current?.blur();
    navigate(itemPath(hit.item, hit.enchant));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (hits.length) setActive((i) => (i + (event.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length);
    } else if (event.key === "Enter" && hits[active]) {
      event.preventDefault();
      pick(hits[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  // only a tier so far ("t6") is not a search yet: no list, rather than "no item"
  const showList = open && parseQuery(query).words.length > 0;

  return (
    <div className={`pc-search is-${size}`}>
      <div className="pc-search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.8 4.8-1.4 1.4-4.8-4.8A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" fill="currentColor" />
        </svg>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && hits[active] ? `${listId}-${active}` : undefined}
          aria-label="Search an item"
          placeholder={size === "hero" ? (index ? `Search ${index.items.length.toLocaleString("en-US")} items…` : "Loading items…") : "Search another item…"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {size === "hero" ? <kbd aria-hidden="true">/</kbd> : null}
      </div>
      {showList ? (
        <ul className="pc-search-list" role="listbox" id={listId}>
          {hits.length ? (
            hits.map((hit, i) => (
              <li
                key={hit.item.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "is-active" : ""}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(hit);
                }}
              >
                <img src={iconUrl(hit.item.variants[hit.enchant ?? 0])} alt="" loading="lazy" width={44} height={44} />
                <span className="pc-hit-name">
                  <b>{hit.label}</b>
                  <small>{categoryLabel(hit.item.category)}</small>
                </span>
                <span className="pc-hit-tiers">
                  {hit.family.length > 1 ? (
                    hit.family.map((member) => <TierBadge key={member.id} tier={member.tier} dim={member.id !== hit.item.id} />)
                  ) : hit.item.tier ? (
                    <TierBadge tier={hit.item.tier} />
                  ) : null}
                </span>
              </li>
            ))
          ) : (
            <li className="pc-search-empty" role="option" aria-selected={false}>
              {index ? "No item by that name" : "Loading items…"}
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
