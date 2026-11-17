import { useEffect, useState } from "react";
import { COVERAGE_DISCORD, ageText, coverageLevel, loadCoverage, type RegionCoverage } from "./coverageData";
import "./PriceCoverage.css";

/**
 * Account panel section: how many materials have a price in each city of the chosen server, the
 * same numbers the daily check posts to the public Discord channel. Loads when the panel opens.
 */
export function PriceCoverage({ region, open }: { region: "eu" | "us"; open: boolean }) {
  const [state, setState] = useState<{ region: string; data: RegionCoverage | null; failed: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadCoverage(region).then(
      (data) => alive && setState({ region, data, failed: false }),
      () => alive && setState({ region, data: null, failed: true })
    );
    return () => {
      alive = false;
    };
  }, [open, region]);

  const current = state?.region === region ? state : null;
  const age = current?.data?.generatedAt ? ageText(Date.now() - Date.parse(current.data.generatedAt)) : null;

  return (
    <div className="panel-section pcov">
      <h4>Price coverage</h4>
      <p className="pcov-note">
        Materials with a price, per city on {region === "eu" ? "Europe" : "America"}
        {age ? ` · prices from ${age} ago` : ""}
      </p>
      {current?.data ? (
        <ul className="pcov-list">
          {current.data.cities.map((c) => (
            <li key={c.city} className={`pcov-row is-${coverageLevel(c.city, c.percent)}`}>
              <span className="pcov-city">{c.city}</span>
              <span className="pcov-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(2, Math.min(100, c.percent))}%` }} />
              </span>
              <span className="pcov-pct">{Math.round(c.percent)}%</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pcov-note">{current?.failed ? "Could not load the prices right now." : "Loading…"}</p>
      )}
      <a className="pcov-link" href={COVERAGE_DISCORD} target="_blank" rel="noopener noreferrer">
        Daily coverage on Discord
        <span aria-hidden="true"> &rsaquo;</span>
      </a>
    </div>
  );
}
