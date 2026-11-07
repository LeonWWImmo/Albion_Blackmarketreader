import { Link, useLocation } from "react-router-dom";

/** Every page in the tool switcher, in order: the desktop tabs and the phone menu both use this list. */
export const TOOL_TABS: ReadonlyArray<{ to: string; label: string }> = [
  { to: "/", label: "Home" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/bm-crafter", label: "Blackmarket Crafter" },
  { to: "/crafting-calculator", label: "Crafting Calculator" },
  { to: "/refining-calculator", label: "Refining Calculator" },
  { to: "/food-potion-crafter", label: "Food & Potion Crafter" },
  { to: "/gold-tracker", label: "Gold Tracker" },
  { to: "/loot-split", label: "Loot Split" },
  { to: "/prices", label: "Price Checker" }
];

/** The tab of the page you are on: its own path, or a page below it (/prices/adepts-bag). */
export const isActiveTab = (to: string, pathname: string) => pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));

/** The tabs in a tool page's header (desktop; phones get MobileNavBurger). */
export function ToolNav() {
  const { pathname } = useLocation();
  return (
    <nav className="bm-nav bm-nav-switch" aria-label="Tools">
      {TOOL_TABS.map(({ to, label }) =>
        isActiveTab(to, pathname) ? (
          <span key={to} className="nav-tab active" aria-current="page">
            {label}
          </span>
        ) : (
          <Link key={to} className="nav-tab" to={to}>
            {label}
          </Link>
        )
      )}
    </nav>
  );
}
