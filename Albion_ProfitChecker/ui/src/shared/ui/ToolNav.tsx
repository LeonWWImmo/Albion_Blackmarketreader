import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./toolNav.css";

type Tab = { to: string; label: string; hint?: string; crafting?: true };

/** Every page in the tool switcher, in order: the desktop tabs and the phone menu both use this list. */
export const TOOL_TABS: ReadonlyArray<Tab> = [
  { to: "/", label: "Home" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/bm-crafter", label: "Blackmarket Crafter", hint: "What pays to craft for the Black Market", crafting: true },
  { to: "/crafting-calculator", label: "Crafting Calculator", hint: "Cost and profit of any craft", crafting: true },
  { to: "/refining-calculator", label: "Refining Calculator", hint: "Ore, wood, fiber, hide and stone", crafting: true },
  { to: "/food-potion-crafter", label: "Food & Potion Crafter", hint: "Cooking and alchemy profit", crafting: true },
  { to: "/prices", label: "Price Checker" },
  { to: "/gold-tracker", label: "Gold Tracker" },
  { to: "/loot-split", label: "Loot Split" }
];

const CRAFTING = TOOL_TABS.filter((tab) => tab.crafting);

/** The tab of the page you are on: its own path, or a page below it (/prices/adepts-bag). */
export const isActiveTab = (to: string, pathname: string) => pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));

/** The four crafting tools behind one tab, so the header fits on one line. */
function CraftingMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const current = CRAFTING.find((tab) => isActiveTab(tab.to, pathname));

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      box.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className="tool-nav-menu"
      ref={box}
      onBlur={(event) => {
        // tabbing out of the menu closes it, so it does not stay open over the page
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={`nav-tab${current ? " active" : ""}`}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {current ? current.label : "Crafting"}
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      {open ? (
        <div className="tool-nav-panel" id={menuId}>
          <p>Crafting tools</p>
          {CRAFTING.map((tab) => (
            <Link key={tab.to} to={tab.to} className={isActiveTab(tab.to, pathname) ? "is-on" : ""} aria-current={isActiveTab(tab.to, pathname) ? "page" : undefined}>
              <b>{tab.label}</b>
              <small>{tab.hint}</small>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The tabs in a tool page's header (desktop; phones get MobileNavBurger with the full list). */
export function ToolNav() {
  const { pathname } = useLocation();
  const tab = ({ to, label }: Tab) =>
    isActiveTab(to, pathname) ? (
      <span key={to} className="nav-tab active" aria-current="page">
        {label}
      </span>
    ) : (
      <Link key={to} className="nav-tab" to={to}>
        {label}
      </Link>
    );
  const [home, dashboard, ...rest] = TOOL_TABS.filter((t) => !t.crafting);
  return (
    <nav className="bm-nav bm-nav-switch" aria-label="Tools">
      {tab(home)}
      {tab(dashboard)}
      <CraftingMenu pathname={pathname} />
      {rest.map(tab)}
    </nav>
  );
}
