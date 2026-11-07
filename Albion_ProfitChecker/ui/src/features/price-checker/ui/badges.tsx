import type { CSSProperties } from "react";
import type { MarketName } from "../core/quotes";

/** Albion's tier colours, as the game paints the tier on an item. */
export const TIER_COLOR: Record<number, string> = {
  1: "#9ca3af",
  2: "#9ca3af",
  3: "#4ade80",
  4: "#60a5fa",
  5: "#f87171",
  6: "#fb923c",
  7: "#facc15",
  8: "#f1f5f9"
};

/** The game's enchantment glow per level. */
export const ENCHANT_COLOR = ["#94a3b8", "#4ade80", "#60a5fa", "#c084fc", "#fbbf24"];

export const QUALITIES = [
  { value: 1, label: "Normal", color: "#cbd5e1" },
  { value: 2, label: "Good", color: "#4ade80" },
  { value: 3, label: "Outstanding", color: "#60a5fa" },
  { value: 4, label: "Excellent", color: "#c084fc" },
  { value: 5, label: "Masterpiece", color: "#fbbf24" }
];

/** One colour per market, used for its row, its chart line and its legend chip. */
export const MARKET_COLOR: Record<MarketName, string> = {
  "Black Market": "#a78bfa",
  Caerleon: "#f87171",
  Bridgewatch: "#fbbf24",
  "Fort Sterling": "#e2e8f0",
  Lymhurst: "#4ade80",
  Martlock: "#60a5fa",
  Thetford: "#e879f9",
  Brecilien: "#2dd4bf"
};

export function TierBadge({ tier, enchant = 0, dim = false }: { tier: number; enchant?: number; dim?: boolean }) {
  return (
    <span className={`pc-tier${dim ? " is-dim" : ""}`} style={{ "--tier": TIER_COLOR[tier] ?? "#94a3b8" } as CSSProperties}>
      T{tier}
      {enchant ? `.${enchant}` : ""}
    </span>
  );
}
