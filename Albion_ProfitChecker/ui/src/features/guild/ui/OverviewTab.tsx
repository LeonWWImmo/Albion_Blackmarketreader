import { Link } from "react-router-dom";
import { shortPrice } from "../../price-checker/ui/format";
import { guildPath, type GuildPageData } from "../api";
import { joinedAndLeft, timeAgo } from "../core/view";
import { TrackingNote } from "./TrackingNote";

/** The guild at a glance: who is active, what needs attention, the latest fights. */
export function OverviewTab({ data }: { data: GuildPageData }) {
  const { guild, tracking, fights } = data;
  const activity = data.activity;
  const now = new Date();
  const week = joinedAndLeft(activity, 7, now);
  const activityPath = guildPath(guild, "activity");
  const kills = fights.reduce((t, f) => t + f.kills, 0);
  const deaths = fights.reduce((t, f) => t + f.deaths, 0);

  const attention = [
    activity.counts.inactive ? { tone: "is-inactive", text: `${activity.counts.inactive} member${activity.counts.inactive === 1 ? "" : "s"} inactive for 14+ days`, to: activityPath } : null,
    week.left ? { tone: "is-quiet", text: `${week.left} left the guild this week`, to: activityPath } : null,
    week.joined ? { tone: "is-active", text: `${week.joined} joined this week`, to: activityPath } : null,
    activity.counts.unknown ? { tone: "", text: `${activity.counts.unknown} without any activity data yet`, to: activityPath } : null
  ].filter((item): item is { tone: string; text: string; to: string } => item !== null);

  return (
    <>
      <TrackingNote tracking={tracking} activity={activity} />
      <section className="gd-stats">
        <div className="gd-card gd-stat">
          <small>ACTIVE</small>
          <b className="is-green">
            {activity.counts.active}
            <em> / {guild.memberCount}</em>
          </b>
          <span>played in the last 3 days</span>
        </div>
        <div className="gd-card gd-stat">
          <small>QUIET</small>
          <b className="is-gold">{activity.counts.quiet}</b>
          <span>3 to 13 days</span>
        </div>
        <div className="gd-card gd-stat">
          <small>INACTIVE</small>
          <b className="is-red">{activity.counts.inactive}</b>
          <span>14 days or more</span>
        </div>
        <div className="gd-card gd-stat">
          <small>RECENT FIGHTS</small>
          <b>{fights.length}</b>
          <span>
            {kills} kills · {deaths} deaths
          </span>
        </div>
      </section>
      <section className="gd-grid2">
        <div className="gd-card">
          <div className="gd-list-head">
            <h2>Needs your attention</h2>
          </div>
          {attention.length ? (
            attention.map((item) => (
              <Link key={item.text} className="gd-row gd-row-link" to={item.to}>
                <span>{item.text}</span>
                <span className={`gd-pill ${item.tone}`}>●</span>
                <span className="gd-muted">Activity →</span>
              </Link>
            ))
          ) : (
            <p className="gd-empty">Nothing right now.</p>
          )}
        </div>
        <div className="gd-card">
          <div className="gd-list-head">
            <h2>Latest fights</h2>
            <Link className="gd-btn" to={guildPath(guild, "killboard")}>
              Killboard →
            </Link>
          </div>
          {fights.length ? (
            fights.map((fight) => (
              <div key={fight.id} className="gd-row">
                <div>
                  <b>
                    {fight.players} players · {shortPrice(fight.fame)} fame
                  </b>
                  <small>{timeAgo(fight.startTime, now)}</small>
                </div>
                <span className="gd-pill is-violet">{fight.ours} of us</span>
                <span className={`gd-num ${fight.kills >= fight.deaths ? "is-green" : "is-red"}`} title="kills / deaths">
                  {fight.kills} / {fight.deaths}
                </span>
              </div>
            ))
          ) : (
            <p className="gd-empty">No fights on the killboard lately.</p>
          )}
        </div>
      </section>
    </>
  );
}
