import type { UpdatedStamp } from "./lastUpdated";

type LastUpdatedBadgeProps = {
  stamp: UpdatedStamp;
  /** Shown instead of a timestamp when there is no data age to report, e.g. manual pricing. */
  emptyLabel?: string;
};

/**
 * The "Last updated" chip in the crafting-tools header (styled by .bm-status in bmCrafter.css,
 * which every tool using this header loads).
 *
 * Every piece of text is its own element. The old markup mixed a bare text node with spans
 * inside a flex box, so each part became a separate flex item that wrapped on its own once
 * the header got tight, and the chip broke into a stack of half-words.
 *
 * Phones get the short form ("Updated 18h ago"): the age is what tells you whether the
 * numbers are fresh, and the clock time alone does not fit next to the region chip.
 */
export function LastUpdatedBadge({ stamp, emptyLabel }: LastUpdatedBadgeProps) {
  if (emptyLabel && !stamp.relative) {
    return (
      <div className="bm-status" title={stamp.title}>
        <span className="pulse" aria-hidden="true"></span>
        <span className="bm-status-label">{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="bm-status" title={stamp.title}>
      <span className="pulse" aria-hidden="true"></span>
      <span className="bm-status-full">
        <span className="bm-status-label">Last updated:</span>
        <span className="bm-status-time">{stamp.time}</span>
        {stamp.relative ? <span className="bm-status-ago">({stamp.relative})</span> : null}
      </span>
      <span className="bm-status-compact">Updated {stamp.relative || stamp.time}</span>
    </div>
  );
}
