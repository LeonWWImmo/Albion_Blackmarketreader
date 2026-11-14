import type { Activity, GuildPageData } from "../api";

const formatDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** One line on what the numbers are based on: tracked since when, or not tracked at all. */
export function TrackingNote({ tracking, activity }: { tracking: GuildPageData["tracking"]; activity: Activity }) {
  if (!tracking.tracked) {
    return (
      <p className="gd-note">
        This guild is not tracked yet. The status comes from Albion's statistics and the killboard. Fame gained per week starts once someone manages the guild here.
      </p>
    );
  }
  if (activity.coveredDays < activity.periodDays) {
    return (
      <p className="gd-note">
        Tracked since {formatDay(tracking.since ?? "")}: fame gains cover {activity.coveredDays} day{activity.coveredDays === 1 ? "" : "s"} so far. A snapshot is taken every day.
      </p>
    );
  }
  return null;
}
