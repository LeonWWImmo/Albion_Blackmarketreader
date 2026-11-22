import { useLocation } from "react-router-dom";
import { premiumVisible } from "@shared/premium/premium";
import { isActiveTab } from "./ToolNav";
import "./toolRail.css";

type RailLink = { to: string; label: string; icon: string; premium?: true };

const RAIL: ReadonlyArray<RailLink> = [
  { to: "/", label: "Home", icon: "M12 3 3 10v10h6v-6h6v6h6V10l-9-7Z" },
  { to: "/dashboard", label: "Blackmarket Reader", icon: "M4 5h16v14H4zM7 15h2v3H7zm4-4h2v7h-2zm4-2h2v9h-2z" },
  { to: "/bm-crafter", label: "Blackmarket Crafter", icon: "M14 3 4 9l6 3.5 8-4.7V14h2V6L14 3Zm-4 11-6-3.5V15l6 3.5V14Zm2 4.5L18 15v-2.5L12 16v2.5Z" },
  {
    to: "/crafting-calculator",
    label: "Crafting Calculator",
    icon: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 4h10V5H7v2Zm0 4h2V9H7v2Zm4 0h2V9h-2v2Zm4 0h2V9h-2v2ZM7 15h2v-2H7v2Zm4 0h6v-2h-6v2Zm-4 4h2v-2H7v2Zm4 0h6v-2h-6v2Z"
  },
  { to: "/refining-calculator", label: "Refining Calculator", icon: "M7 3h10v2H7V3Zm2 4h6l4 6-7 8-7-8 4-6Zm.96 2-2.23 3.35L12 17.2l4.27-4.85L14.04 9H9.96Z" },
  { to: "/food-potion-crafter", label: "Food & Potion Crafter", icon: "M11 2h2v6h-2V2Zm-4 0h2v6a3 3 0 0 1-6 0V2h2v6a1 1 0 0 0 2 0V2Zm10 0h2v20h-2v-8h-2V7a5 5 0 0 1 2-5Z" },
  {
    to: "/gold-tracker",
    label: "Gold Tracker",
    icon: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 4V8.5C5.7 9.6 8.7 10 12 10s6.3-.4 8-1.5V10c0 1.7-3.6 3-8 3s-8-1.3-8-3Zm0 4v-1.5c1.7 1.1 4.7 1.5 8 1.5s6.3-.4 8-1.5V14c0 1.7-3.6 3-8 3s-8-1.3-8-3Zm0 4v-1.5c1.7 1.1 4.7 1.5 8 1.5s6.3-.4 8-1.5V18c0 1.7-3.6 3-8 3s-8-1.3-8-3Z"
  },
  {
    to: "/loot-split",
    label: "Loot Split",
    icon: "M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2Zm-5 12H9v-2h6v2Zm5-7H4V4l16-.02V7Z"
  },
  {
    to: "/prices",
    label: "Price Checker",
    icon: "M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42ZM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7Z"
  },
  {
    to: "/guild",
    label: "Guild Tools",
    icon: "M12 2 4 5v6c0 5.2 3.4 9.9 8 11 4.6-1.1 8-5.8 8-11V5l-8-3Zm0 2.2 6 2.25V11c0 4.1-2.5 7.9-6 8.9-3.5-1-6-4.8-6-8.9V6.45l6-2.25Z"
  },
  { to: "/premium", label: "Premium", icon: "M3 7l4.5 3.5L12 4l4.5 6.5L21 7l-2 11H5L3 7Zm3 13h12v2H6v-2Z", premium: true }
];

/** The icon strip on the left (desktop) that opens like a banner: every tool, Premium last. */
export function ToolRail() {
  const { pathname } = useLocation();
  const links = premiumVisible() ? RAIL : RAIL.filter((link) => !link.premium);
  return (
    <aside className="tool-rail">
      {links.map((link) => {
        const on = isActiveTab(link.to, pathname);
        return (
          <a
            key={link.to}
            className={`tool-rail-link${on ? " active" : ""}${link.premium ? " is-premium" : ""}`}
            href={link.to}
            title={link.label}
            aria-current={on ? "page" : undefined}
          >
            <span className="tool-rail-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d={link.icon} />
              </svg>
            </span>
            <span className="tool-rail-label">{link.label}</span>
          </a>
        );
      })}
    </aside>
  );
}
