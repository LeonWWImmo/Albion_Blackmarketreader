import type { Activity, GuildPageData } from "../api";

/** One line on what the fame numbers are: totals until a guild has two daily snapshots, then gains. */
export function TrackingNote({ tracking, activity }: { tracking: GuildPageData["tracking"]; activity: Activity }) {
  if (!tracking.tracked) {
    return (
      <p className="gd-note">
        Nobody has marked this guild yet, so the fame columns show each member's total. Mark it and we save everyone's fame once a day: from the next day on you see how much
        each member gained.
      </p>
    );
  }
  if (activity.coveredDays === 0) {
    return <p className="gd-note">Marked today. We save every member's fame once a day: from tomorrow the columns show what each member gained. Until then: their total fame.</p>;
  }
  if (activity.coveredDays < activity.periodDays) {
    return (
      <p className="gd-note">
        Marked {activity.coveredDays} day{activity.coveredDays === 1 ? "" : "s"} ago: the fame gained covers {activity.coveredDays === 1 ? "that day" : `those ${activity.coveredDays} days`} so far.
      </p>
    );
  }
  return null;
}
