import { formatCountdown, nextDailyReset } from "../albion/festivities";
import type { FestivitiesState } from "../hooks/useFestivities";
import "./dailyBonusInfo.css";

type DailyBonusInfoProps = {
  festivities: FestivitiesState;
  /** Crafting categories this tool makes. Only their bonuses get a chip; the rest are named in one line. */
  relevant?: ReadonlySet<string>;
  /** Shown when today's bonuses cover none of `relevant`, e.g. "No gear bonus today." */
  noneLabel?: string;
  /** Shown when no bonus is reported yet, e.g. how to set it by hand in this tool. */
  fallback?: string;
};

/**
 * Today's Daily Production Bonuses with the time until they change (10:00 UTC). Fits into a
 * tool's filter bar or settings panel; the tools apply the bonus themselves.
 */
export function DailyBonusInfo({ festivities, relevant, noneLabel = "None for these items today.", fallback }: DailyBonusInfoProps) {
  const { status, craftBonuses, now } = festivities;

  if (status === "loading") {
    return (
      <div className="dbonus" aria-busy="true">
        <span className="dbonus-note">Checking today&rsquo;s bonus&hellip;</span>
      </div>
    );
  }

  if (!craftBonuses.length) {
    return (
      <div className="dbonus">
        <span className="dbonus-note">
          {status === "error" ? "Today’s bonus could not be loaded." : "Today’s bonus is not reported for this server yet."}
          {fallback ? ` ${fallback}` : ""}
        </span>
      </div>
    );
  }

  const shown = relevant ? craftBonuses.filter((bonus) => relevant.has(bonus.category)) : craftBonuses;
  const others = relevant ? craftBonuses.filter((bonus) => !relevant.has(bonus.category)) : [];
  const reset = formatCountdown(nextDailyReset(now), now);

  return (
    <div className="dbonus">
      {shown.length ? (
        <ul className="dbonus-chips" aria-label="Today's crafting bonuses">
          {shown.map((bonus) => (
            <li key={bonus.name} className={`dbonus-chip ${bonus.percent >= 20 ? "is-rare" : ""}`}>
              <strong>+{bonus.percent}%</strong> {bonus.label}
            </li>
          ))}
        </ul>
      ) : (
        <span className="dbonus-none">{noneLabel}</span>
      )}
      <span className="dbonus-note" title="Daily bonuses change every day at 10:00 UTC">
        {others.length
          ? `${shown.length ? "Also" : "Today"}: ${others.map((bonus) => `+${bonus.percent}% ${bonus.label}`).join(", ")} · new in ${reset}`
          : `New bonus in ${reset}`}
      </span>
    </div>
  );
}

/** Small "+10% today" marker for a row or a result that the daily bonus applies to. */
export function DailyBonusTag({ percent }: { percent: number }) {
  if (!(percent > 0)) return null;
  return (
    <span className={`dbonus-tag ${percent >= 20 ? "is-rare" : ""}`} title={`Today's daily crafting bonus: +${percent}% production bonus`}>
      +{percent}% today
    </span>
  );
}
