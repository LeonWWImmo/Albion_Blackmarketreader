import "./regionSwitch.css";

type SwitchRegion = "eu" | "us";

const REGIONS: { key: SwitchRegion; code: string; name: string }[] = [
  { key: "eu", code: "EU", name: "Europe" },
  { key: "us", code: "US", name: "America" }
];

/**
 * The server switch of the account panel: two sides of one pill, the picked one lit up with a
 * thumb that slides over. Same choice as the old select, same `onChange`.
 */
export function RegionSwitch({ value, onChange }: { value: SwitchRegion; onChange: (next: SwitchRegion) => void }) {
  const picked = REGIONS.find((r) => r.key === value) ?? REGIONS[0];
  return (
    <div className="region-switch">
      <div className={`region-switch-track is-${value}`} role="radiogroup" aria-label="Server region">
        <span className="region-switch-thumb" aria-hidden="true" />
        {REGIONS.map((r) => (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={value === r.key}
            className={`region-switch-option${value === r.key ? " is-on" : ""}`}
            onClick={() => value !== r.key && onChange(r.key)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <ellipse cx="12" cy="12" rx="4.2" ry="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M3.2 9h17.6M3.2 15h17.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <span className="region-switch-text">
              <b>{r.code}</b>
              <small>{r.name}</small>
            </span>
          </button>
        ))}
      </div>
      <p className="region-switch-note">
        <span className="region-switch-dot" aria-hidden="true" />
        Prices and data of the {picked.name} server
      </p>
    </div>
  );
}
