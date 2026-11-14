import { useState } from "react";
import { shortPrice } from "../../price-checker/ui/format";
import type { ActivityMember, GuildPageData } from "../api";
import { STATUS_LABEL, daysAgo, filterMembers, kickListText, searchMembers, sparkHeights, type MemberFilter } from "../core/view";
import { TrackingNote } from "./TrackingNote";

const SHOWN_AT_FIRST = 25;
const STATUS_HINT = "Active: played in the last 3 days. Quiet: 3 to 13 days. Inactive: 14 days or more. Played = fame grew, Albion updated their statistics, or a guild fight.";

const gain = (value: number | null) => (value === null ? "–" : value ? `+${shortPrice(value)}` : "0");
const total = (value: number | undefined) => (value === undefined ? "–" : shortPrice(value));

/** Every member with their status, the fame they gained (or their total, before there is a gain) and when they last played. */
export function ActivityTab({ data }: { data: GuildPageData }) {
  const [period, setPeriod] = useState<"7" | "30">("7");
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const activity = data.activity[period];
  // no two snapshots yet: the columns show lifetime totals instead of gains
  const totals = activity.coveredDays === 0;
  const members = searchMembers(filterMembers(activity.members, filter), search);
  const shown = showAll || search ? members : members.slice(0, SHOWN_AT_FIRST);
  const now = new Date();

  const filters: { key: MemberFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: activity.members.length },
    { key: "inactive", label: "Inactive", count: activity.counts.inactive },
    { key: "quiet", label: "Quiet", count: activity.counts.quiet },
    { key: "new", label: "New", count: activity.joined }
  ];

  const copyKickList = async () => {
    try {
      await navigator.clipboard.writeText(kickListText(data.guild.name, activity));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the list:", kickListText(data.guild.name, activity));
    }
  };

  return (
    <>
      <TrackingNote tracking={data.tracking} activity={activity} />
      <section className="gd-stats">
        <div className="gd-card gd-stat">
          <small>ACTIVE</small>
          <b className="is-green">{activity.counts.active}</b>
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
          <small>JOINED / LEFT</small>
          <b>
            +{activity.joined} <em className="is-red">−{activity.left.length}</em>
          </b>
          <span>in the last {activity.periodDays} days</span>
        </div>
      </section>

      <section className="gd-card gd-members">
        <div className="gd-list-head">
          <input className="gd-filter" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a member" aria-label="Find a member" />
          <div className="gd-chips" role="group" aria-label="Show">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`gd-chip${filter === f.key ? " is-on" : ""}`}
                aria-pressed={filter === f.key}
                onClick={() => {
                  setFilter(f.key);
                  setShowAll(false);
                }}
              >
                {f.label} {f.count}
              </button>
            ))}
          </div>
          <div className="gd-chips">
            {(["7", "30"] as const).map((p) => (
              <button key={p} type="button" className={`gd-chip${period === p ? " is-on" : ""}`} aria-pressed={period === p} onClick={() => setPeriod(p)}>
                {p === "7" ? "7 days" : "30 days"}
              </button>
            ))}
            <button type="button" className="gd-btn" onClick={() => void copyKickList()}>
              {copied ? "Copied ✓" : "Copy inactive list"}
            </button>
          </div>
        </div>
        <div className="gd-row is-head">
          <span>MEMBER</span>
          <span title={STATUS_HINT}>STATUS ⓘ</span>
          <span className="gd-num gd-col-mid">{totals ? "PVE FAME (TOTAL)" : "PVE FAME"}</span>
          <span className="gd-num gd-col-mid">{totals ? "PVP FAME (TOTAL)" : "PVP FAME"}</span>
          <span className="gd-num gd-col-wide">{totals ? "GATHERING (TOTAL)" : "GATHERING"}</span>
          <span className="gd-col-wide">LAST 14 DAYS</span>
          <span className="gd-num">LAST PLAYED</span>
        </div>
        {shown.map((member) => (
          <MemberRow key={member.id} member={member} totals={totals} now={now} />
        ))}
        {members.length ? null : <p className="gd-empty">{search ? `No member named “${search.trim()}”.` : "No member in this list."}</p>}
        <div className="gd-foot">
          <span>
            {totals
              ? "Total fame of each member. From the day after a guild is marked: fame gained per day and week."
              : `Fame gained in the last ${activity.periodDays} days, from one snapshot a day.`}{" "}
            “Last played”: fame grew, Albion updated their statistics, or a guild fight.
          </span>
          {members.length > shown.length ? (
            <button type="button" className="gd-btn" onClick={() => setShowAll(true)}>
              Show all {members.length}
            </button>
          ) : null}
        </div>
      </section>

      {activity.left.length ? (
        <section className="gd-card">
          <div className="gd-list-head">
            <h2>Left the guild</h2>
            <span className="gd-muted">in the last {activity.periodDays} days</span>
          </div>
          {activity.left.map((p) => (
            <div key={p.id} className="gd-row">
              <b>{p.name}</b>
              <span />
              <span className="gd-muted">{daysAgo(p.leftOn, now)}</span>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

function MemberRow({ member, totals, now }: { member: ActivityMember; totals: boolean; now: Date }) {
  return (
    <div className="gd-row">
      <div className="gd-who">
        <span className="gd-avatar" aria-hidden="true">
          {member.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <b>{member.name}</b>
          <small>{member.isNew ? "new member" : member.lifetime !== null ? `${shortPrice(member.lifetime)} fame in total` : " "}</small>
        </div>
      </div>
      <span>
        <span className={`gd-pill is-${member.status}`}>{STATUS_LABEL[member.status]}</span>
      </span>
      <span className="gd-num gd-col-mid">{totals ? total(member.totals?.pve) : gain(member.pve)}</span>
      <span className="gd-num gd-col-mid">{totals ? total(member.totals?.pvp) : gain(member.pvp)}</span>
      <span className="gd-num gd-col-wide">{totals ? total(member.totals?.gathering) : gain(member.gathering)}</span>
      <span className="gd-spark gd-col-wide" aria-hidden="true">
        {sparkHeights(member.spark).map((h, i) => (
          <i key={i} className={h === null ? "is-none" : h === 0 ? "is-zero" : ""} style={h ? { height: `${h}%` } : undefined} />
        ))}
      </span>
      <span className="gd-num gd-muted">{daysAgo(member.lastActive, now)}</span>
    </div>
  );
}
