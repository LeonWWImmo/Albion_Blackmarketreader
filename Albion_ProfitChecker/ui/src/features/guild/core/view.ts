// Small display helpers of the Guild pages, kept apart from React so they are easy to test.
import type { Activity, ActivityMember, MemberStatus } from "../api";

export type MemberFilter = "all" | "inactive" | "quiet" | "new";

export const STATUS_LABEL: Record<MemberStatus, string> = { active: "Active", quiet: "Quiet", inactive: "Inactive", unknown: "No data yet" };

const DAY_MS = 864e5;

/** "today", "yesterday", "5 days ago" for a day ("2026-11-14") or a timestamp. */
export function daysAgo(dayOrTime: string | null, now: Date): string {
  if (!dayOrTime) return "never";
  const day = Date.parse(dayOrTime.length === 10 ? `${dayOrTime}T00:00:00Z` : `${dayOrTime.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const days = Math.round((today - day) / DAY_MS);
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

export function filterMembers(members: ActivityMember[], filter: MemberFilter): ActivityMember[] {
  if (filter === "all") return members;
  if (filter === "new") return members.filter((m) => m.isNew);
  return members.filter((m) => m.status === filter);
}

/** The inactive members as a line to paste into Discord or the game. */
export function kickListText(guildName: string, activity: Activity): string {
  const names = activity.members.filter((m) => m.status === "inactive").map((m) => m.name);
  if (!names.length) return `${guildName}: nobody inactive for 14+ days.`;
  return `${guildName}: inactive for 14+ days (${names.length}): ${names.join(", ")}`;
}

/** Height in % of the tallest bar, for the 14-day gain bars: 0 for a day without gain, null without data. */
export function sparkHeights(spark: (number | null)[]): (number | null)[] {
  const max = Math.max(0, ...spark.map((v) => v ?? 0));
  return spark.map((v) => (v === null ? null : v === 0 ? 0 : Math.max(8, Math.round((v / max) * 100))));
}
