import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { HistoryPoint } from "../core/history";
import { shortPrice, silver } from "./format";

export type ChartLine = { key: string; label: string; color: string; points: HistoryPoint[] };

const HEIGHT = 320;
const PAD = { left: 58, right: 14, top: 14, bottom: 26 };
const VOLUME_BAND = 52;
const GAP = 10;

const dayLabel = (t: number) => new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const timeLabel = (t: number, withHour: boolean) =>
  new Date(t * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", ...(withHour ? { hour: "2-digit", minute: "2-digit" } : {}) });

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Average price per market over time, one line each, with the items sold as bars underneath.
 * Hover, touch or arrow keys pick a moment; the tooltip lists every market's price at it.
 */
export function PriceChart({ lines, hourly }: { lines: ChartLine[]; hourly: boolean }) {
  const [box, width] = useWidth(860);
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const drawn = lines.filter((line) => line.points.length);
    const times = [...new Set(drawn.flatMap((line) => line.points.map(([t]) => t)))].sort((a, b) => a - b);
    if (!times.length) return null;
    // the scale follows the bulk of the prices: one odd day (a single 40x sale) would otherwise
    // flatten every other line, so it is drawn at the edge and read in the tooltip instead
    const prices = drawn.flatMap((line) => line.points.map(([, p]) => p)).sort((a, b) => a - b);
    const at = (share: number) => prices[Math.round(share * (prices.length - 1))];
    let lo = at(0.03);
    let hi = at(0.97);
    const pad = (hi - lo || hi * 0.1 || 1) * 0.08;
    lo = Math.max(0, lo - pad);
    hi += pad;
    const t0 = times[0];
    const t1 = times[times.length - 1] === t0 ? t0 + 1 : times[times.length - 1];
    const plotW = width - PAD.left - PAD.right;
    const priceH = HEIGHT - PAD.top - PAD.bottom - VOLUME_BAND - GAP;
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * plotW;
    const y = (p: number) => PAD.top + (1 - Math.min(1, Math.max(0, (p - lo) / (hi - lo)))) * priceH;
    const volume = new Map<number, number>();
    for (const line of drawn) for (const [t, , sold] of line.points) volume.set(t, (volume.get(t) ?? 0) + sold);
    const maxVolume = Math.max(1, ...volume.values());
    const barW = Math.max(2, Math.min(14, (plotW / Math.max(1, times.length)) * 0.6));
    const ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / 4);
    const labelEvery = Math.max(1, Math.ceil(times.length / Math.max(2, Math.floor(plotW / 90))));
    return { drawn, times, x, y, volume, maxVolume, barW, ticks, labelEvery };
  }, [lines, width]);

  if (!model) return <div className="pc-chart-empty">No sales reported for this item yet.</div>;
  const { drawn, times, x, y, volume, maxVolume, barW, ticks, labelEvery } = model;
  const bandTop = HEIGHT - PAD.bottom - VOLUME_BAND;

  const nearest = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * width;
    let best = times[0];
    for (const t of times) if (Math.abs(x(t) - px) < Math.abs(x(best) - px)) best = t;
    return best;
  };
  const onPointer = (event: PointerEvent<SVGSVGElement>) => setHover(nearest(event.clientX, event.currentTarget.getBoundingClientRect()));
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const i = hover === null ? times.length - 1 : times.indexOf(hover);
    setHover(times[Math.min(times.length - 1, Math.max(0, i + (event.key === "ArrowRight" ? 1 : -1)))]);
  };

  const hoverRows = hover === null ? [] : drawn.flatMap((line) => {
    const point = line.points.find(([t]) => t === hover);
    return point ? [{ line, price: point[1], sold: point[2] }] : [];
  });
  const tipLeft = hover === null ? 0 : x(hover) / width;

  return (
    <div className="pc-chart" ref={box}>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width={width}
        height={HEIGHT}
        role="img"
        aria-label="Price history per market. Use the arrow keys to read single days."
        tabIndex={0}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      >
        {ticks.map((value) => (
          <g key={value}>
            <line className="pc-grid" x1={PAD.left} x2={width - PAD.right} y1={y(value)} y2={y(value)} />
            <text className="pc-axis" x={PAD.left - 8} y={y(value) + 4} textAnchor="end">
              {shortPrice(value)}
            </text>
          </g>
        ))}
        {times.map((t, i) =>
          i % labelEvery === 0 ? (
            <text key={t} className="pc-axis" x={x(t)} y={HEIGHT - 8} textAnchor="middle">
              {dayLabel(t)}
            </text>
          ) : null
        )}
        {times.map((t) => {
          const h = ((volume.get(t) ?? 0) / maxVolume) * VOLUME_BAND;
          return <rect key={t} className={`pc-vol${t === hover ? " is-on" : ""}`} x={x(t) - barW / 2} y={bandTop + VOLUME_BAND - h} width={barW} height={h} rx={2} />;
        })}
        {drawn.map((line) => (
          <path
            key={line.key}
            className="pc-line"
            d={line.points.map(([t, p], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(p).toFixed(1)}`).join("")}
            stroke={line.color}
          />
        ))}
        {hover !== null ? (
          <g>
            <line className="pc-cross" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={bandTop + VOLUME_BAND} />
            {hoverRows.map(({ line, price }) => (
              <circle key={line.key} cx={x(hover)} cy={y(price)} r={4.5} fill={line.color} className="pc-dot" />
            ))}
          </g>
        ) : null}
      </svg>
      {hover !== null && hoverRows.length ? (
        <div className={`pc-tip${tipLeft > 0.6 ? " is-left" : ""}`} style={{ left: `${tipLeft * 100}%` }} role="status">
          <b>{timeLabel(hover, hourly)}</b>
          {hoverRows
            .sort((a, b) => b.price - a.price)
            .map(({ line, price, sold }) => (
              <span key={line.key}>
                <i style={{ background: line.color }} />
                {line.label}
                <em>{silver(price)}</em>
                <small>{sold.toLocaleString("en-US")} sold</small>
              </span>
            ))}
        </div>
      ) : null}
    </div>
  );
}

/** A 7-day price line for a table row. */
export function Sparkline({ points, color }: { points: HistoryPoint[]; color: string }) {
  if (points.length < 2) return <span className="pc-spark-none">–</span>;
  const prices = points.map(([, p]) => p);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const t0 = points[0][0];
  const t1 = points[points.length - 1][0];
  const d = points
    .map(([t, p], i) => `${i ? "L" : "M"}${(((t - t0) / (t1 - t0 || 1)) * 76 + 2).toFixed(1)},${(22 - ((p - lo) / (hi - lo || 1)) * 18).toFixed(1)}`)
    .join("");
  return (
    <svg className="pc-spark" viewBox="0 0 80 26" width={80} height={26} aria-hidden="true">
      <path d={d} stroke={color} />
    </svg>
  );
}
