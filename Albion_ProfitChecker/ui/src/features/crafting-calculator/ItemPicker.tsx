import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { onItemIconError } from "@shared/assets/assets";
import { BottomSheet, lockBodyScroll } from "../../shared";

export type PickerItem = { id: string; name: string; categoryKey?: string };
export type PickerCategory = { key: string; label: string };

type ItemPickerProps<T extends PickerItem> = {
  open: boolean;
  onClose: () => void;
  items: T[];
  categories: PickerCategory[];
  selectedId: string | null;
  onPick: (item: T) => void;
  /** Same ranking the settings search field uses, so both find the same items. */
  score: (item: T, query: string) => number;
  isPhone: boolean;
};

/**
 * Item browser behind the item icon. Many players never found the "Search by item name" field,
 * so the icon opens this instead: every craftable item by category, with a search on top.
 * A centred dialog on a computer, a bottom sheet on a phone.
 */
export function ItemPicker<T extends PickerItem>({ open, onClose, items, categories, selectedId, onPick, score, isPhone }: ItemPickerProps<T>) {
  const [query, setQuery] = useState("");
  const [categoryKey, setCategoryKey] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const catsRef = useRef<HTMLDivElement | null>(null);

  // Each opening starts on the current item's category with an empty search.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const current = items.find((item) => item.id === selectedId);
    setCategoryKey(current?.categoryKey || categories[0]?.key || "");
  }, [open, items, categories, selectedId]);

  // On a phone the categories are one sideways-scrolling row; bring the active one into view.
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      catsRef.current?.querySelector(".is-active")?.scrollIntoView({ block: "nearest", inline: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, categoryKey]);

  const trimmed = query.trim();
  const shown = useMemo(() => {
    if (trimmed) {
      return items
        .map((item) => ({ item, rank: score(item, trimmed) }))
        .filter((entry) => entry.rank > 0)
        .sort((a, b) => b.rank - a.rank || a.item.name.localeCompare(b.item.name))
        .map((entry) => entry.item);
    }
    return items.filter((item) => item.categoryKey === categoryKey);
  }, [items, score, trimmed, categoryKey]);

  function pick(item: T) {
    onPick(item);
    onClose();
  }

  const content = (
    <div className="cc-picker">
      <div className="cc-picker-head">
        <h2 className="cc-picker-title">Choose an item</h2>
        <input
          ref={searchRef}
          className="cc-picker-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed && shown.length) {
              e.preventDefault();
              pick(shown[0]);
            }
          }}
          placeholder="Search all items"
          aria-label="Search all items"
        />
        <div ref={catsRef} className="cc-picker-cats" role="group" aria-label="Item categories">
          {categories.map((category) => {
            const active = !trimmed && category.key === categoryKey;
            return (
              <button
                key={category.key}
                type="button"
                aria-pressed={active}
                className={`cc-picker-cat${active ? " is-active" : ""}`}
                onClick={() => {
                  setQuery("");
                  setCategoryKey(category.key);
                }}
              >
                {category.label}
              </button>
            );
          })}
        </div>
      </div>

      {shown.length ? (
        <ul className="cc-picker-grid">
          {shown.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`cc-picker-item${item.id === selectedId ? " is-current" : ""}`}
                onClick={() => pick(item)}
              >
                <img src={`/itemicons/T4_${item.id}.png`} alt="" loading="lazy" onError={onItemIconError} />
                <span>{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cc-picker-empty">No item matches “{trimmed}”.</p>
      )}
    </div>
  );

  if (isPhone) {
    return (
      <BottomSheet open={open} onClose={onClose} label="Choose an item" accent="var(--fx-accent)" className="cc-picker-sheet">
        {content}
      </BottomSheet>
    );
  }

  return (
    <PickerDialog open={open} onClose={onClose} initialFocus={searchRef}>
      {content}
    </PickerDialog>
  );
}

type PickerDialogProps = {
  open: boolean;
  onClose: () => void;
  initialFocus: RefObject<HTMLInputElement | null>;
  children: ReactNode;
};

/** Centred dialog for the computer layout: closes on the backdrop, the close button or Escape. */
function PickerDialog({ open, onClose, initialFocus, children }: PickerDialogProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockBodyScroll();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    initialFocus.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      releaseScroll();
      returnFocusTo?.focus({ preventScroll: true });
    };
  }, [open, initialFocus]);

  if (!open) return null;

  return createPortal(
    <div className="cc-picker-root">
      <div className="cc-picker-backdrop" onClick={() => onCloseRef.current()} />
      <div className="cc-picker-dialog" role="dialog" aria-modal="true" aria-label="Choose an item">
        <button type="button" className="cc-picker-close" aria-label="Close" onClick={() => onCloseRef.current()}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}
