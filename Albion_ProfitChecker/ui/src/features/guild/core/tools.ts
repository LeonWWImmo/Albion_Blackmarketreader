/** The Guild section's tools, in tab order. `ready: false` shows them as coming soon. */
export const GUILD_TOOLS = [
  { key: "activity", label: "Activity", icon: "📈", ready: true },
  { key: "killboard", label: "Killboard", icon: "💀", ready: true },
  { key: "regear", label: "Regear", icon: "⚔️", ready: false },
  { key: "attendance", label: "Attendance", icon: "🛡️", ready: false },
  { key: "bank", label: "Bank log", icon: "🏦", ready: false },
  { key: "discord", label: "Discord report", icon: "📣", ready: false }
] as const;

export type GuildTab = "overview" | "activity" | "killboard";
export const GUILD_TABS: { key: GuildTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "activity", label: "Activity" },
  { key: "killboard", label: "Killboard" }
];

export const isGuildTab = (value: string | undefined): value is GuildTab => GUILD_TABS.some((t) => t.key === value);
