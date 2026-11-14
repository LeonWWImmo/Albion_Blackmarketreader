import { useState } from "react";
import { shortPrice } from "../../price-checker/ui/format";
import type { ActivityMember, FameGain, GuildPageData } from "../api";
import { FAME_KINDS, STATUS_LABEL, daysAgo, filterMembers, joinedAndLeft, kickListText, kindLabel, searchMembers, shareBars, sparkHeights, type MemberFilter } from "../core/view";
import { CopyButton } from "./CopyButton";
import { TrackingNote } from "./TrackingNote";

const SHOWN_AT_FIRST = 25;
const STATUS_HINT = "Active: played in the last 3 days. Quiet: 3 to 13 days. Inactive: 14 days or more. Played = fame grew, Albion updated their statistics, or a guild fight.";

const gain = (fame: FameGain | null) => (fame === null ? "–" : fame.total ? `+${shortPrice(fame.total)}` : "0");

/** Every member with their status, the fame gained in 7 and 30 days, their total fame and when they last played. */
export function ActivityTab({ data }: { data: GuildPageData }) {
  const { activity } = data;
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const now = new Date();
  const members = searchMembers(filterMembers(activity.members, filter), search);
  const shown = showAll || search ? members : members.slice(0, SHOWN_AT_FIRST);
  const week = joinedAndLeft(activity, 7, now);
  const weekFame = activity.members.reduce((t, m) => t + (m.gains["7"]?.total ?? 0), 0);
  const hasGains = activity.members.some((m) => m.gains["7"] !== null);
  const newCount = activity.members.filter((m) => m.isNew).length;

  const filters: { key: MemberFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: activity.members.length },
    { key: "inactive", label: "Inactive", count: activity.counts.inactive },
    { key: "quiet", label: "Quiet", count: activity.counts.quiet },
    { key: "new", label: "New", count: newCount }
  ];

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
          <small>QUIET / INACTIVE</small>
          <b className="is-gold">
            {activity.counts.quiet} <em className="is-red">/ {activity.counts.inactive}</em>
          </b>
          <span>3–13 days / 14 days or more</span>
        </div>
        <div className="gd-card gd-stat">
          <small>FAME THIS WEEK</small>
          <b>{hasGains ? `+${shortPrice(weekFame)}` : "–"}</b>
          <span>{hasGains ? "the whole guild, last 7 days" : "from the day after marking"}</span>
        </div>
        <div className="gd-card gd-stat">
          <small>JOINED / LEFT</small>
          <b>
            +{week.joined} <em className="is-red">−{week.left}</em>
          </b>
          <span>in the last 7 days</span>
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
          <CopyButton text={kickListText(data.guild.name, activity, now)} label="Copy inactive list" count={activity.counts.inactive} />
        </div>
        <div className="gd-row is-head">
          <span>MEMBER</span>
          <span title={STATUS_HINT}>STATUS ⓘ</span>
          <span className="gd-num">7 DAYS</span>
          <span className="gd-num gd-col-mid">30 DAYS</span>
          <span className="gd-num gd-col-mid">ALL TIME</span>
          <span className="gd-col-wide">LAST 14 DAYS</span>
          <span className="gd-num gd-col-mid">LAST PLAYED</span>
        </div>
        {shown.map((member) => (
          <MemberRow key={member.id} member={member} now={now} open={open === member.id} onToggle={() => setOpen(open === member.id ? null : member.id)} />
        ))}
        {members.length ? null : <p className="gd-empty">{search ? `No member named “${search.trim()}”.` : "No member in this list."}</p>}
        <div className="gd-foot">
          <span>Fame of every kind together: PvE, PvP, gathering, crafting, fishing, farming. Tap a member for where it came from.</span>
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
            <span className="gd-muted">in the last 30 days</span>
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

function MemberRow({ member, now, open, onToggle }: { member: ActivityMember; now: Date; open: boolean; onToggle: () => void }) {
  return (
    <div className={`gd-member${open ? " is-open" : ""}`}>
      <button type="button" className="gd-row gd-row-button" aria-expanded={open} onClick={onToggle}>
        <span className="gd-who">
          <b>{member.name}</b>
          <small>
            {member.main ? <span className={`gd-kind is-${member.main}`}>{kindLabel(member.main)}</span> : null}
            {member.isNew ? <span className="gd-kind is-new">new</span> : null}
          </small>
        </span>
        <span>
          <span className={`gd-pill is-${member.status}`}>{STATUS_LABEL[member.status]}</span>
        </span>
        <span className="gd-num gd-strong">{gain(member.gains["7"])}</span>
        <span className="gd-num gd-col-mid">{gain(member.gains["30"])}</span>
        <span className="gd-num gd-col-mid gd-muted">{member.totals ? shortPrice(member.totals.total) : "–"}</span>
        <span className="gd-spark gd-col-wide" aria-hidden="true">
          {sparkHeights(member.spark).map((h, i) => (
            <i key={i} className={h === null ? "is-none" : h === 0 ? "is-zero" : ""} style={h ? { height: `${h}%` } : undefined} />
          ))}
        </span>
        <span className="gd-num gd-col-mid gd-muted">{daysAgo(member.lastActive, now)}</span>
      </button>
      {open ? <MemberDetails member={member} now={now} /> : null}
    </div>
  );
}

function MemberDetails({ member, now }: { member: ActivityMember; now: Date }) {
  const kinds = FAME_KINDS.filter((k) => (member.totals?.[k.key] ?? 0) > 0);
  const d = member.details;
  const zones = d ? shareBars([["Avalon", d.pveZones.avalon], ["Outlands", d.pveZones.outlands], ["Mists", d.pveZones.mists], ["Hellgate", d.pveZones.hellgate], ["Royal", d.pveZones.royal], ["Corrupted", d.pveZones.corrupted]]) : [];
  const resources = d ? shareBars([["Wood", d.resources.wood], ["Ore", d.resources.ore], ["Fiber", d.resources.fiber], ["Hide", d.resources.hide], ["Stone", d.resources.rock]]) : [];
  const cell = (fame: FameGain | null, key: keyof FameGain) => {
    const value = fame?.[key];
    return value === null || value === undefined ? "–" : value ? `+${shortPrice(value)}` : "0";
  };
  return (
    <div className="gd-details">
      <div className="gd-detail-card">
        <h3>Fame by kind</h3>
        <div className="gd-fame-table">
          <span />
          <small>7 days</small>
          <small>30 days</small>
          <small>All time</small>
          {kinds.map((k) => (
            <FameLine key={k.key} label={k.label} week={cell(member.gains["7"], k.key)} month={cell(member.gains["30"], k.key)} total={shortPrice(member.totals?.[k.key] ?? 0)} />
          ))}
          <FameLine label="Together" week={cell(member.gains["7"], "total")} month={cell(member.gains["30"], "total")} total={member.totals ? shortPrice(member.totals.total) : "–"} strong />
        </div>
      </div>
      {zones.length ? <Bars title="PvE by zone (all time)" bars={zones} /> : null}
      {resources.length ? <Bars title="Gathered (all time)" bars={resources} /> : null}
      <div className="gd-detail-card">
        <h3>PvP and dates</h3>
        <dl className="gd-facts">
          {d ? (
            <>
              <dt>Kill fame</dt>
              <dd>{shortPrice(d.killFame)}</dd>
              <dt>Death fame</dt>
              <dd>{shortPrice(d.deathFame)}</dd>
              <dt>Kill / death fame</dt>
              <dd>{d.deathFame ? (d.killFame / d.deathFame).toFixed(2) : "–"}</dd>
            </>
          ) : null}
          <dt>Last played</dt>
          <dd>{daysAgo(member.lastActive, now)}</dd>
          <dt>Last guild fight</dt>
          <dd>{member.lastFightAt ? daysAgo(member.lastFightAt, now) : "none seen"}</dd>
          {member.joinedOn ? (
            <>
              <dt>In the guild since</dt>
              <dd>{member.isNew ? daysAgo(member.joinedOn, now) : "before marking"}</dd>
            </>
          ) : null}
        </dl>
      </div>
    </div>
  );
}

function FameLine({ label, week, month, total, strong = false }: { label: string; week: string; month: string; total: string; strong?: boolean }) {
  return (
    <>
      <span className={strong ? "gd-strong" : undefined}>{label}</span>
      <span className="gd-num">{week}</span>
      <span className="gd-num">{month}</span>
      <span className="gd-num gd-muted">{total}</span>
    </>
  );
}

function Bars({ title, bars }: { title: string; bars: [string, number, number][] }) {
  return (
    <div className="gd-detail-card">
      <h3>{title}</h3>
      <ul className="gd-bars">
        {bars.map(([label, value, percent]) => (
          <li key={label}>
            <span>{label}</span>
            <i>
              <b style={{ width: `${percent}%` }} />
            </i>
            <span className="gd-num">{shortPrice(value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
