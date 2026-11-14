// Small display helpers of the Guild pages, kept apart from React so they are easy to test.
import type { Activity, ActivityMember, FameKind, MemberStatus } from "../api";

export type MemberFilter = "all" | "inactive" | "quiet" | "new";

export const STATUS_LABEL: Record<MemberStatus, string> = { active: "Active", quiet: "Quiet", inactive: "Inactive", unknown: "No data yet" };

/** Every kind of fame, in the order the Activity tab lists them. */
export const FAME_KINDS: { key: FameKind; label: string }[] = [
  { key: "pve", label: "PvE" },
  { key: "pvp", label: "PvP" },
  { key: "gathering", label: "Gathering" },
  { key: "crafting", label: "Crafting" },
  { key: "fishing", label: "Fishing" },
  { key: "farming", label: "Farming" },
  { key: "crystal", label: "Crystal League" }
];
export const kindLabel = (kind: FameKind) => FAME_KINDS.find((k) => k.key === kind)?.label ?? kind;

const DAY_MS = 864e5;
const dayNumber = (dayOrTime: string) => Math.floor(Date.parse(`${dayOrTime.slice(0, 10)}T00:00:00Z`) / DAY_MS);

/** "today", "yesterday", "5 days ago" for a day ("2026-11-14") or a timestamp. */
export function daysAgo(dayOrTime: string | null, now: Date): string {
  if (!dayOrTime) return "never";
  const days = dayNumber(now.toISOString()) - dayNumber(dayOrTime);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/** "3h ago" / "2 days ago" for a moment, e.g. a fight or the last sync. */
export function timeAgo(time: string, now: Date): string {
  const hours = (now.getTime() - Date.parse(time)) / 36e5;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** "OPEN_WORLD" -> "Open world". */
export const areaLabel = (area: string | null) => (area ? area.charAt(0) + area.slice(1).toLowerCase().replace(/_/g, " ") : "Unknown area");

export function filterMembers(members: ActivityMember[], filter: MemberFilter): ActivityMember[] {
  if (filter === "all") return members;
  if (filter === "new") return members.filter((m) => m.isNew);
  return members.filter((m) => m.status === filter);
}

/** Members whose name contains `text`, ignoring case and extra spaces. */
export function searchMembers(members: ActivityMember[], text: string): ActivityMember[] {
  const needle = text.trim().replace(/\s+/g, " ").toLowerCase();
  return needle ? members.filter((m) => m.name.toLowerCase().includes(needle)) : members;
}

/** Joined (after tracking started) and left within the last `days` days. */
export function joinedAndLeft(activity: Activity, days: number, now: Date): { joined: number; left: number } {
  const from = dayNumber(now.toISOString()) - days;
  return {
    joined: activity.members.filter((m) => m.isNew && m.joinedOn && dayNumber(m.joinedOn) >= from).length,
    left: activity.left.filter((p) => dayNumber(p.leftOn) >= from).length
  };
}

/** The inactive members as a block to paste into Discord: one line each, longest gone first. */
export function kickListText(guildName: string, activity: Activity, now: Date): string {
  const inactive = activity.members
    .filter((m) => m.status === "inactive")
    .sort((a, b) => (a.lastActive ?? "").localeCompare(b.lastActive ?? "") || a.name.localeCompare(b.name));
  if (!inactive.length) return `**${guildName}**: nobody inactive for 14+ days.`;
  const lines = inactive.map((m) => `• ${m.name} · last played ${daysAgo(m.lastActive, now)}`);
  return [`**${guildName}** · inactive for 14+ days (${inactive.length})`, ...lines].join("\n");
}

/** Height in % of the tallest bar, for the 14-day gain bars: 0 for a day without gain, null without data. */
export function sparkHeights(spark: (number | null)[]): (number | null)[] {
  const max = Math.max(0, ...spark.map((v) => v ?? 0));
  return spark.map((v) => (v === null ? null : v === 0 ? 0 : Math.max(8, Math.round((v / max) * 100))));
}

/** Each value as a share of the largest, for bar lists: [label, value, percent], largest first, zeros left out. */
export function shareBars(entries: [string, number][]): [string, number, number][] {
  const shown = entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = shown[0]?.[1] ?? 0;
  return shown.map(([label, v]) => [label, v, max ? Math.max(4, Math.round((v / max) * 100)) : 0]);
}
