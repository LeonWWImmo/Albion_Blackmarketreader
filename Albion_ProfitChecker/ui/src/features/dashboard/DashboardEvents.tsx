import { Link } from "react-router-dom";
import { craftItemFor, formatCountdown, nextDailyReset, type CraftBonus, type FestivitiesState } from "../../shared";
import "./dashboardEvents.css";

const REFINING = new Set(["ore", "wood", "fiber", "hide", "rock"]);
const CONSUMABLES = new Set(["food", "potion"]);

/** The tool that crafts what a bonus covers; gear opens the Crafting Calculator on an item of it. */
function toolFor(bonus: CraftBonus): string {
  if (REFINING.has(bonus.category)) return "/refining-calculator";
  if (CONSUMABLES.has(bonus.category)) return "/food-potion-crafter";
  const item = craftItemFor(bonus.category);
  return item ? `/crafting-calculator?item=${encodeURIComponent(item)}` : "/crafting-calculator";
}

/**
 * Today's Daily Production Bonuses and this week's activity event, under the dashboard hero.
 * Each bonus links to the tool that crafts it. Renders nothing until AODP has a confirmed snapshot.
 */
export function DashboardEvents({ festivities }: { festivities: FestivitiesState }) {
  const { craftBonuses, weekly, now } = festivities;
  if (!craftBonuses.length && !weekly.length) return null;

  const current = weekly.find((event) => event.active) ?? null;
  const next = weekly.find((event) => !event.active) ?? null;
  const headline = current ?? next;
  let weeklyMeta = "";
  if (current) {
    weeklyMeta = `Ends in ${formatCountdown(Date.parse(current.end), now)}`;
    // The next event usually starts the moment this one ends; then its start time adds nothing.
    if (next) {
      weeklyMeta += Math.abs(Date.parse(next.start) - Date.parse(current.end)) < 60000
        ? ` · then ${next.title}`
        : ` · next: ${next.title} in ${formatCountdown(Date.parse(next.start), now)}`;
    }
  } else if (next) {
    weeklyMeta = `Starts in ${formatCountdown(Date.parse(next.start), now)}`;
  }

  return (
    <section className="dash-events" aria-label="Today in Albion">
      {craftBonuses.length ? (
        <div className="dash-event">
          <span className="dash-event-kicker">Today&rsquo;s crafting bonus</span>
          <div className="dash-event-chips">
            {craftBonuses.map((bonus) => (
              <Link key={bonus.name} to={toolFor(bonus)} className={`dash-event-chip ${bonus.percent >= 20 ? "is-rare" : ""}`}>
                <strong>+{bonus.percent}%</strong> {bonus.label}
                <span aria-hidden="true">&rsaquo;</span>
              </Link>
            ))}
          </div>
          <span className="dash-event-meta">New bonus in {formatCountdown(nextDailyReset(now), now)}</span>
        </div>
      ) : null}
      {headline ? (
        <div className="dash-event">
          <span className="dash-event-kicker">{current ? "Weekly event" : "Next weekly event"}</span>
          <div className="dash-event-main">
            <strong>{headline.title}</strong>
            {headline.description ? <span>{headline.description}</span> : null}
          </div>
          <span className="dash-event-meta">{weeklyMeta}</span>
        </div>
      ) : null}
    </section>
  );
}
