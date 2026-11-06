import { useMemo, type CSSProperties } from "react";
import type { Trip } from "./core/lootLog";
import { MINUTE, SCALE, buildTimeline, floorMinute, fromInput, lastHours, toInput, toPos, toTime, tripRange, tripSpan, type Range } from "./core/timeline";
import { Sheet } from "./Sheet";

const MAX_COLS = 14;
const COL_MINUTES = 5;

const dayLabel = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const clock = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** "30 Oct 17:08 → 21:40", or with both days when the range crosses midnight. */
export function rangeLabel({ from, to }: Range) {
  const sameDay = dayLabel(from) === dayLabel(to);
  return `${dayLabel(from)} ${clock(from)} → ${sameDay ? "" : `${dayLabel(to)} `}${clock(to)}`;
}

type Props = {
  /** trips with a known time, oldest first */
  trips: Trip[];
  range: Range;
  onRange: (range: Range) => void;
  items: number;
  players: number;
  value: string;
  onClose: () => void;
};

/** Asks which part of the log counts: presets, a timeline with two handles and exact from / to. */
export function RunPicker({ trips, range, onRange, items, players, value, onClose }: Props) {
  const segments = useMemo(() => buildTimeline(trips), [trips]);

  // each trip a block over its own minutes; a longer trip splits into columns of deposits
  const columns = useMemo(() => {
    const cols: { x0: number; x1: number; items: number }[] = [];
    for (const s of segments) {
      if (!s.trip) continue;
      const { t0, t1 } = tripSpan(s.trip);
      const k = Math.min(MAX_COLS, Math.max(1, Math.round((t1 - t0) / (COL_MINUTES * MINUTE))));
      const x0 = toPos(segments, t0);
      const x1 = toPos(segments, t1);
      const counts = new Array<number>(k).fill(0);
      for (const e of s.trip.entries) if (e.amount > 0) counts[Math.min(k - 1, Math.floor(((e.time - t0) / (t1 - t0)) * k))] += e.amount;
      counts.forEach((items, i) => cols.push({ x0: x0 + (i * (x1 - x0)) / k, x1: x0 + ((i + 1) * (x1 - x0)) / k, items }));
    }
    return cols;
  }, [segments]);
  const most = Math.max(1, ...columns.map((col) => col.items));

  const last = trips[trips.length - 1];
  const presets: { label: string; range: Range }[] = [
    { label: "Last run", range: tripRange(last) },
    { label: "24 h", range: lastHours(trips, 24) },
    { label: "7 days", range: lastHours(trips, 24 * 7) },
    { label: "Everything", range: { from: floorMinute(trips[0].start), to: floorMinute(last.end) } }
  ];

  const a = toPos(segments, range.from);
  const b = toPos(segments, range.to + 60_000);
  const setFrom = (from: number) => Number.isFinite(from) && onRange({ from, to: Math.max(from, range.to) });
  const setTo = (to: number) => Number.isFinite(to) && onRange({ from: Math.min(range.from, to), to });

  return (
    <Sheet label="Pick your run" className="ls-picker" onClose={onClose}>
      <p className="ls-eyebrow">WHICH LOOT COUNTS?</p>
      <h3 className="ls-sheet-title">Pick your run</h3>

      <div className="ls-presets" role="group" aria-label="Quick picks">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            className={p.range.from === range.from && p.range.to === range.to ? "is-on" : ""}
            onClick={() => onRange(p.range)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="ls-axis" style={{ "--a": `${a / 10}%`, "--b": `${b / 10}%` } as CSSProperties}>
        <div className="ls-axis-bars" aria-hidden="true">
          {columns.map((col, i) => {
            const mid = (col.x0 + col.x1) / 2;
            return (
              <i
                key={i}
                className={mid >= a && mid <= b ? "is-in" : ""}
                style={{
                  left: `${col.x0 / 10}%`,
                  width: `${(col.x1 - col.x0) / 10}%`,
                  height: col.items ? `${14 + 80 * Math.sqrt(col.items / most)}%` : "3%"
                }}
              />
            );
          })}
          {segments.map((s, i) => (s.trip ? null : <span key={i} className="ls-axis-gap" style={{ left: `${(s.x0 + s.x1) / 20}%` }} />))}
        </div>
        <div className="ls-axis-sel" aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={SCALE}
          value={Math.round(a)}
          aria-label="From"
          style={{ zIndex: a > SCALE * 0.95 ? 4 : 3 }}
          onChange={(e) => setFrom(floorMinute(toTime(segments, Number(e.target.value))))}
        />
        <input
          type="range"
          min={0}
          max={SCALE}
          value={Math.round(b)}
          aria-label="To"
          onChange={(e) => setTo(floorMinute(toTime(segments, Number(e.target.value)) - 60_000))}
        />
        <div className="ls-axis-trips">
          {segments.map((s) =>
            s.trip ? (
              <button
                key={s.trip.id}
                type="button"
                style={{ left: `${s.x0 / 10}%`, width: `${(s.x1 - s.x0) / 10}%` }}
                onClick={() => onRange(tripRange(s.trip!))}
                title={`${rangeLabel(tripRange(s.trip))} · ${s.trip.players.join(", ")}`}
              >
                {dayLabel(s.trip.start)}
                <small>
                  {clock(s.trip.start)} · {s.trip.entries.reduce((sum, e) => sum + Math.max(0, e.amount), 0)}
                </small>
              </button>
            ) : null
          )}
        </div>
      </div>

      <div className="ls-when">
        <label>
          <span>From</span>
          <input type="datetime-local" value={toInput(range.from)} onChange={(e) => setFrom(fromInput(e.target.value))} />
        </label>
        <span className="ls-when-arrow material-symbols-outlined" aria-hidden="true">arrow_forward</span>
        <label>
          <span>To</span>
          <input type="datetime-local" value={toInput(range.to)} onChange={(e) => setTo(fromInput(e.target.value))} />
        </label>
      </div>

      <div className="ls-picker-foot">
        <p>
          <b>{value}</b>
          <span>
            {items} items · {players} {players === 1 ? "player" : "players"}
          </span>
        </p>
        <button type="button" className="ls-go" onClick={onClose} disabled={!items}>
          Split it
          <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
        </button>
      </div>
    </Sheet>
  );
}
