/** The Guild section's tools, in tab order. `ready: false` shows them as coming soon. */
export const GUILD_TOOLS = [
  { key: "activity", label: "Activity", icon: "📈", text: "Who plays, who went quiet, who left", ready: true },
  { key: "regear", label: "Regear", icon: "⚔️", text: "Every death priced, your rules, one payout list", ready: false },
  { key: "attendance", label: "Attendance", icon: "🛡️", text: "Who came to the fights, ready for loot shares", ready: false },
  { key: "bank", label: "Bank log", icon: "🏦", text: "Paste the chest log: who puts in, who takes out", ready: false },
  { key: "discord", label: "Discord report", icon: "📣", text: "A weekly summary in your guild's Discord", ready: false }
] as const;

export type GuildTab = "overview" | "activity";
export const GUILD_TABS: { key: GuildTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "activity", label: "Activity" }
];

export const isGuildTab = (value: string | undefined): value is GuildTab => GUILD_TABS.some((t) => t.key === value);
