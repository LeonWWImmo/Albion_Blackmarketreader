import { useEffect, useId, useRef, useState } from "react";

type PriceFieldProps = {
  label: string;
  /** Optional second line under the label, e.g. how many of the material one craft takes. */
  hint?: string;
  value: number;
  onCommit: (value: number) => void;
};

const display = (value: number) => (Number.isFinite(value) && value > 0 ? String(Math.round(value)) : "");

/**
 * Silver price input for the phone detail sheet. The desktop table edits prices in place; on a
 * phone those cells are far too small to type into, so the sheet offers a real field instead.
 *
 * It keeps what is being typed as text while focused and commits every keystroke that parses.
 * Binding the box straight to the number would turn a cleared field into "0" mid-edit and
 * fight the user for the cursor.
 */
export function PriceField({ label, hint, value, onCommit }: PriceFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => display(value));
  const focused = useRef(false);

  // Follow outside changes (a different row, fresh market data) unless the user is typing here.
  useEffect(() => {
    if (!focused.current) setDraft(display(value));
  }, [value]);

  return (
    <label className="cc-price-field" htmlFor={id}>
      <span className="cc-price-label">
        {label}
        {hint ? <span className="cc-price-hint">{hint}</span> : null}
      </span>
      <span className="cc-price-input-wrap">
        <input
          id={id}
          className="cc-price-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="0"
          value={draft}
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(event) => {
            const next = event.target.value.replace(/[^\d]/g, "");
            setDraft(next);
            onCommit(next ? Number(next) : 0);
          }}
          onBlur={() => {
            focused.current = false;
            setDraft(display(value));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <span className="cc-price-unit" aria-hidden="true">silver</span>
      </span>
    </label>
  );
}
