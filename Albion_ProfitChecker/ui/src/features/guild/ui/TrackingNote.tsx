import type { Activity, GuildPageData } from "../api";

/** One line on what the fame numbers are: totals until a guild has two daily snapshots, then gains. */
export function TrackingNote({ tracking, activity }: { tracking: GuildPageData["tracking"]; activity: Activity }) {
  const days = activity.coveredDays["30"];
  if (!tracking.tracked) {
    return (
      <p className="gd-note">
        Nobody has marked this guild yet: you see each member's total fame. Mark it and we save everyone's fame once a day, so from the next day on the 7-day and 30-day
        columns show what each member gained.
      </p>
    );
  }
  if (days === 0) {
    return <p className="gd-note">Marked today. We save every member's fame once a day: from tomorrow the 7-day and 30-day columns show what each member gained.</p>;
  }
  if (days < 30) {
    return (
      <p className="gd-note">
        Marked {days} day{days === 1 ? "" : "s"} ago: “30 days” covers {days === 1 ? "that day" : `those ${days} days`} so far
        {days < 7 ? `, and so does “7 days”` : ""}.
      </p>
    );
  }
  return null;
}
