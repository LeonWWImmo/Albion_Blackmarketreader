import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { DAY, nearestPoint, rangeStats, type GoldPoint, type GoldRange } from "./goldStats";
import { formatSilver } from "./format";

type GoldChartProps = {
  points: ReadonlyArray<GoldPoint>;
  range: GoldRange;
  height: number;
};

const PAD = { top: 18, right: 62, bottom: 26, left: 8 };
/** Height of the current-price tag on the right axis; tick labels that would sit under it are skipped. */
const TAG_H = 20;

/** Rounded tick step (1, 2, 2.5 or 5 x 10^n) giving about `count` ticks over `span`. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return nice * power;
}

function timeLabel(time: number, range: GoldRange): string {
  const date = new Date(time * 1000);
  if (range === "24h") return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (range === "7d") return date.toLocaleDateString("en-GB", { weekday: "short" });
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function tooltipTime(time: number): string {
  return new Date(time * 1000).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** X-axis ticks at round local times (every 6 hours, every day, every week, every month). */
function xTicks(first: number, last: number, range: GoldRange): number[] {
  const ticks: number[] = [];
  const start = new Date(first * 1000);
  if (range === "24h") {
    start.setMinutes(0, 0, 0);
    start.setHours(Math.ceil(start.getHours() / 6) * 6);
    for (let t = start.getTime() / 1000; t <= last; t += 6 * 3600) ticks.push(t);
  } else if (range === "7d") {
    start.setHours(24, 0, 0, 0);
    for (let t = start.getTime() / 1000; t <= last; t += DAY) ticks.push(t);
  } else if (range === "30d") {
    start.setHours(24, 0, 0, 0);
    for (let t = start.getTime() / 1000; t <= last; t += 7 * DAY) ticks.push(t);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    start.setMonth(start.getMonth() + 1);
    while (start.getTime() / 1000 <= last) {
      ticks.push(start.getTime() / 1000);
      start.setMonth(start.getMonth() + 1);
    }
  }
  return ticks;
}

/**
 * Gold price chart: area + line, the window's average, its low and high marked, and a crosshair
 * that follows the mouse, a finger dragged sideways (vertical swipes still scroll the page) or
 * the arrow keys.
 */
export function GoldChart({ points, range, height }: GoldChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const gradientId = useId().replace(/:/g, "");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.round(el.getBoundingClientRect().width));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A new window or server starts without a crosshair.
  useEffect(() => setHoverIndex(null), [points]);

  const geometry = useMemo(() => {
    const stats = rangeStats(points);
    if (!stats || points.length < 2 || width < 120) return null;
    const innerW = width - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    const first = points[0][0];
    const last = points[points.length - 1][0];
    const span = Math.max(1, stats.high - stats.low);
    const step = niceStep(span, 4);
    const yMin = Math.floor((stats.low - span * 0.08) / step) * step;
    const yMax = Math.ceil((stats.high + span * 0.08) / step) * step;
    const x = (time: number) => PAD.left + ((time - first) / Math.max(1, last - first)) * innerW;
    const y = (price: number) => PAD.top + (1 - (price - yMin) / Math.max(1, yMax - yMin)) * innerH;

    let line = "";
    points.forEach(([time, price], i) => {
      line += `${i ? "L" : "M"}${x(time).toFixed(1)},${y(price).toFixed(1)}`;
    });
    const area = `${line}L${x(last).toFixed(1)},${(PAD.top + innerH).toFixed(1)}L${x(first).toFixed(1)},${(PAD.top + innerH).toFixed(1)}Z`;

    const lastPoint = points[points.length - 1];
    const lastY = y(lastPoint[1]);
    const yTicks: number[] = [];
    for (let v = yMin; v <= yMax + step / 2; v += step) {
      if (Math.abs(y(v) - lastY) > TAG_H * 0.8) yTicks.push(v);
    }
    return { stats, x, y, line, area, yTicks, xTicks: xTicks(first, last, range), innerW, innerH, first, last, lastPoint, lastY };
  }, [points, width, height, range]);

  const hover = hoverIndex !== null && geometry ? points[hoverIndex] : null;

  function indexAt(clientX: number): number | null {
    const el = wrapRef.current;
    if (!el || !geometry) return null;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left - PAD.left) / geometry.innerW;
    const time = geometry.first + Math.min(1, Math.max(0, ratio)) * (geometry.last - geometry.first);
    const point = nearestPoint(points, time);
    return point ? points.indexOf(point) : null;
  }

  function onPointer(event: PointerEvent<SVGSVGElement>) {
    const index = indexAt(event.clientX);
    if (index !== null) setHoverIndex(index);
  }

  function onKey(event: KeyboardEvent<SVGSVGElement>) {
    if (!points.length) return;
    const stepSize = event.shiftKey ? 24 : 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setHoverIndex((current) => {
        const from = current ?? points.length - 1;
        const next = from + (event.key === "ArrowLeft" ? -stepSize : stepSize);
        return Math.min(points.length - 1, Math.max(0, next));
      });
    } else if (event.key === "Escape") {
      setHoverIndex(null);
    }
  }

  const summary = geometry
    ? `Gold price chart, ${range}: low ${formatSilver(geometry.stats.low)}, high ${formatSilver(geometry.stats.high)}, average ${formatSilver(geometry.stats.avg)} silver.`
    : "Gold price chart";

  return (
    <div ref={wrapRef} className="gt-chart" style={{ height }}>
      {geometry ? (
        <svg
          width={width}
          height={height}
          // focusable and driven by the arrow keys, so an interactive role rather than "img";
          // the tooltip announces each price (aria-live)
          role="application"
          aria-roledescription="price chart"
          aria-label={`${summary} Use the left and right arrow keys to read the price hour by hour.`}
          tabIndex={0}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setHoverIndex(null);
          }}
          onKeyDown={onKey}
          onBlur={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f5c451" stopOpacity="0.34" />
              <stop offset="70%" stopColor="#f5c451" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#f5c451" stopOpacity="0" />
            </linearGradient>
            <filter id={`${gradientId}-glow`} x="-5%" y="-20%" width="110%" height="140%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>

          {geometry.yTicks.map((tick) => (
            <g key={tick} className="gt-gridline">
              <line x1={PAD.left} x2={PAD.left + geometry.innerW} y1={geometry.y(tick)} y2={geometry.y(tick)} />
              <text x={width - PAD.right + 8} y={geometry.y(tick)} dy="0.35em">
                {formatSilver(tick)}
              </text>
            </g>
          ))}
          {geometry.xTicks.map((tick) => (
            <text key={tick} className="gt-axis-x" x={geometry.x(tick)} y={height - 7} textAnchor="middle">
              {timeLabel(tick, range)}
            </text>
          ))}

          <path d={geometry.area} fill={`url(#${gradientId})`} />
          <line
            className="gt-avg"
            x1={PAD.left}
            x2={PAD.left + geometry.innerW}
            y1={geometry.y(geometry.stats.avg)}
            y2={geometry.y(geometry.stats.avg)}
          />
          <path d={geometry.line} className="gt-line-glow" filter={`url(#${gradientId}-glow)`} />
          <path d={geometry.line} className="gt-line" />

          {/* the current price: a dashed line to the axis, a tag on it and a pulsing dot */}
          <line className="gt-last-line" x1={geometry.x(geometry.lastPoint[0])} x2={PAD.left + geometry.innerW} y1={geometry.lastY} y2={geometry.lastY} />
          <g className="gt-last-tag" transform={`translate(${width - PAD.right + 3}, ${geometry.lastY - TAG_H / 2})`}>
            <rect width={PAD.right - 6} height={TAG_H} rx={5} />
            <text x={(PAD.right - 6) / 2} y={TAG_H / 2} dy="0.35em" textAnchor="middle">
              {formatSilver(geometry.lastPoint[1])}
            </text>
          </g>
          <circle className="gt-last-pulse" cx={geometry.x(geometry.lastPoint[0])} cy={geometry.lastY} r={4} />
          <circle className="gt-last-dot" cx={geometry.x(geometry.lastPoint[0])} cy={geometry.lastY} r={4} />

          <g className="gt-mark gt-mark-high">
            <circle cx={geometry.x(geometry.stats.highAt)} cy={geometry.y(geometry.stats.high)} r={3.5} />
          </g>
          <g className="gt-mark gt-mark-low">
            <circle cx={geometry.x(geometry.stats.lowAt)} cy={geometry.y(geometry.stats.low)} r={3.5} />
          </g>

          {hover ? (
            <g className="gt-cross">
              <line x1={geometry.x(hover[0])} x2={geometry.x(hover[0])} y1={PAD.top} y2={PAD.top + geometry.innerH} />
              <circle cx={geometry.x(hover[0])} cy={geometry.y(hover[1])} r={5} />
            </g>
          ) : null}
        </svg>
      ) : null}

      {hover && geometry ? (
        <div
          className="gt-tooltip"
          style={{
            left: Math.min(Math.max(geometry.x(hover[0]), 70), width - PAD.right - 70),
            top: Math.max(geometry.y(hover[1]) - 64, 0)
          }}
          aria-live="polite"
        >
          <strong>{formatSilver(hover[1])}</strong>
          <span>{tooltipTime(hover[0])}</span>
        </div>
      ) : null}
    </div>
  );
}
