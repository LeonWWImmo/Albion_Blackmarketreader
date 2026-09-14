import "./numberStepper.css";

/**
 * Small bounded integer input with its own minus/plus buttons.
 *
 * The native number spinner is tiny, differs per browser and is close to invisible on a
 * dark background, so it is hidden in CSS and replaced by these controls. The field stays
 * a real input, so typing a value still works; it is clamped to [min, max] on change.
 */
export interface NumberStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  /** Optional hint rendered next to the label, e.g. "1-9". */
  hint?: string;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function NumberStepper({ label, value, min, max, onChange, hint }: NumberStepperProps) {
  const current = clamp(value, min, max);
  const atMin = current <= min;
  const atMax = current >= max;

  return (
    <div className="num-stepper">
      <div className="num-stepper-label">
        <span>{label}</span>
        {hint ? <em>{hint}</em> : null}
      </div>
      <div className="num-stepper-control">
        <button
          type="button"
          className="num-stepper-btn"
          onClick={() => onChange(clamp(current - 1, min, max))}
          disabled={atMin}
          aria-label={`Decrease ${label}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
        <input
          className="num-stepper-input"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={current}
          onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
          aria-label={label}
        />
        <button
          type="button"
          className="num-stepper-btn"
          onClick={() => onChange(clamp(current + 1, min, max))}
          disabled={atMax}
          aria-label={`Increase ${label}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
