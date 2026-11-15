/** The Guild section's tools, in tab order. `ready: false` shows them as coming soon. */
export const GUILD_TOOLS = [
  { key: "activity", label: "Activity", icon: "📈", ready: true },
  { key: "killboard", label: "Killboard", icon: "💀", ready: true },
  { key: "regear", label: "Regear", icon: "⚔️", ready: true },
  { key: "attendance", label: "Attendance", icon: "🛡️", ready: true },
  { key: "bank", label: "Bank log", icon: "🏦", ready: true },
  { key: "discord", label: "Discord report", icon: "📣", ready: true }
] as const;

export type GuildTab = "overview" | "activity" | "killboard" | "attendance" | "regear" | "bank" | "discord";
export const GUILD_TABS: { key: GuildTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "activity", label: "Activity" },
  { key: "killboard", label: "Killboard" },
  { key: "attendance", label: "Attendance" },
  { key: "regear", label: "Regear" },
  { key: "bank", label: "Bank log" },
  { key: "discord", label: "Discord" }
];

export const isGuildTab = (value: string | undefined): value is GuildTab => GUILD_TABS.some((t) => t.key === value);
