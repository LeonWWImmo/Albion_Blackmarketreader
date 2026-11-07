import type { CSSProperties } from "react";
import { shortPrice, signedPercent } from "./format";

export type Rung = { key: string; label: string; color: string; price: number | null; active: boolean; onPick: () => void };

/**
 * One price per step (enchantment .0 to .4, or quality Normal to Masterpiece) as bars, with what each
 * step adds over the one before. Clicking a step switches the page to it.
 */
export function Ladder({ title, rungs }: { title: string; rungs: Rung[] }) {
  const top = Math.max(1, ...rungs.map((r) => r.price ?? 0));
  return (
    <section className="pc-ladder" aria-label={title}>
      <h3>{title}</h3>
      <ol>
        {rungs.map((rung, i) => {
          const before = rungs[i - 1]?.price;
          const step = rung.price && before ? rung.price / before - 1 : null;
          return (
            <li key={rung.key}>
              <button
                type="button"
                className={rung.active ? "is-active" : ""}
                onClick={rung.onPick}
                aria-pressed={rung.active}
                style={{ "--rung": rung.color, "--fill": `${((rung.price ?? 0) / top) * 100}%` } as CSSProperties}
              >
                <span className="pc-rung-label">{rung.label}</span>
                <span className="pc-rung-bar" aria-hidden="true">
                  <i />
                </span>
                <span className="pc-rung-price">{rung.price ? shortPrice(rung.price) : "–"}</span>
                <span className="pc-rung-step">{step !== null ? signedPercent(step) : ""}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
