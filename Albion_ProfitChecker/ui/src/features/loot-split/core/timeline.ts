import type { Trip } from "./lootLog";

/**
 * The time axis of the run picker. A log can span weeks with a few busy hours in between, so the
 * axis gives each trip room by its length and squeezes the pauses between trips to a thin gap.
 * Positions run 0..SCALE; inside a trip or a gap time maps linearly.
 */
export const SCALE = 1000;
export const MINUTE = 60_000;

export type Range = { from: number; to: number };
export type Segment = { t0: number; t1: number; x0: number; x1: number; trip: Trip | null };

const GAP_WEIGHT = 1.5;

export const floorMinute = (t: number) => Math.floor(t / MINUTE) * MINUTE;

/** from and to are whole minutes, both included. */
export const inRange = (t: number, range: Range) => t >= range.from && t < range.to + MINUTE;

/** The minutes a trip covers: from its first entry's minute to the end of its last one's. */
export const tripSpan = (trip: Trip) => ({ t0: floorMinute(trip.start), t1: floorMinute(trip.end) + MINUTE });

export function buildTimeline(trips: Trip[]): Segment[] {
  const timed = trips.filter((t) => Number.isFinite(t.start));
  // a little air on both sides, so a trip's own minutes fill most of its segment
  const spans = timed.map((trip) => {
    const { t0, t1 } = tripSpan(trip);
    // at most 10 minutes a side: trips are 45+ minutes apart, so padded spans never overlap
    const pad = Math.min(10 * MINUTE, Math.max(MINUTE / 4, (t1 - t0) * 0.08));
    return { trip, t0: t0 - pad, t1: t1 + pad };
  });
  const parts: { t0: number; t1: number; weight: number; trip: Trip | null }[] = [];
  spans.forEach((span, i) => {
    if (i > 0) parts.push({ t0: spans[i - 1].t1, t1: span.t0, weight: GAP_WEIGHT, trip: null });
    parts.push({ ...span, weight: 2 + Math.sqrt((span.t1 - span.t0) / MINUTE) });
  });
  const total = parts.reduce((sum, p) => sum + p.weight, 0);
  let x = 0;
  return parts.map(({ t0, t1, weight, trip }) => {
    const x0 = x;
    x += (weight / total) * SCALE;
    return { t0, t1, x0, x1: x, trip };
  });
}

export function toPos(segments: Segment[], t: number): number {
  if (!segments.length) return 0;
  if (t <= segments[0].t0) return 0;
  const seg = segments.find((s) => t <= s.t1);
  if (!seg) return SCALE;
  return seg.x0 + ((t - seg.t0) / (seg.t1 - seg.t0 || 1)) * (seg.x1 - seg.x0);
}

export function toTime(segments: Segment[], pos: number): number {
  if (!segments.length) return 0;
  const seg = segments.find((s) => pos <= s.x1) ?? segments[segments.length - 1];
  const p = Math.min(1, Math.max(0, (pos - seg.x0) / (seg.x1 - seg.x0 || 1)));
  return seg.t0 + p * (seg.t1 - seg.t0);
}

/** One trip as a range of whole minutes. */
export const tripRange = (trip: Trip): Range => ({ from: floorMinute(trip.start), to: floorMinute(trip.end) });

/** The last `hours` of the log, counted back from its newest entry. */
export function lastHours(trips: Trip[], hours: number): Range {
  const first = trips[0].start;
  const end = trips[trips.length - 1].end;
  return { from: floorMinute(Math.max(first, end - hours * 3600_000)), to: floorMinute(end) };
}

/** "YYYY-MM-DDTHH:mm" for a datetime-local input; log times are kept as UTC wall clock. */
export const toInput = (t: number) => new Date(t).toISOString().slice(0, 16);
export const fromInput = (value: string) => Date.parse(`${value}:00Z`);
