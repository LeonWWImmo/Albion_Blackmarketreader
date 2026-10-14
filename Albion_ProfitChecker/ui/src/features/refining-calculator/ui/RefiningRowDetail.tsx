import type { SyntheticEvent } from "react";

export type Tone = "gain" | "loss" | "none";

export type DetailFigure = { label: string; value: string; tone?: Tone };

type RefiningRowDetailProps = {
  name: string;
  iconSrc: string;
  onIconError: (event: SyntheticEvent<HTMLImageElement>) => void;
  logic: "standard" | "stacking";
  suspect: boolean;
  missingInput: boolean;
  /** Profit and profit %, shown large. */
  key1: DetailFigure;
  key2: DetailFigure;
  figures: DetailFigure[];
  breakdown: DetailFigure[];
  ingredients: string[];
  /** Stacking only: the tiers to buy and refine, in order. */
  flow: { label: string; kind: "buy" | "refine" | "target" }[];
  onShowPath?: () => void;
};

const toneClass = (tone?: Tone) => (tone === "gain" ? "is-gain" : tone === "loss" ? "is-loss" : "");

/**
 * Phone breakdown of one refining row: the same figures as the desktop insight panel and the
 * table columns that do not fit on a phone row.
 */
export function RefiningRowDetail({ name, iconSrc, onIconError, logic, suspect, missingInput, key1, key2, figures, breakdown, ingredients, flow, onShowPath }: RefiningRowDetailProps) {
  return (
    <div className="rc-sheet">
      <div className="bsheet-hero">
        <span className="bsheet-hero-icon">
          <img src={iconSrc} alt="" onError={onIconError} />
        </span>
        <span className="bsheet-hero-text">
          <strong>{name}</strong>
          <span className="bsheet-chip">{logic === "stacking" ? "Stacking" : "Standard"}</span>
        </span>
      </div>

      {suspect ? (
        <p className="bsheet-warning">
          This profit looks unrealistic. The sell price is probably a stale or troll order, so check it in game before
          refining.
        </p>
      ) : null}
      {missingInput ? <p className="bsheet-warning">Some input prices are missing, so this result is incomplete.</p> : null}

      <div className="bsheet-tiles">
        {[key1, key2].map((figure) => (
          <div key={figure.label} className="bsheet-tile is-key">
            <span>{figure.label}</span>
            <strong className={toneClass(figure.tone)}>{figure.value}</strong>
          </div>
        ))}
        {figures.map((figure) => (
          <div key={figure.label} className="bsheet-tile">
            <span>{figure.label}</span>
            <strong className={toneClass(figure.tone)}>{figure.value}</strong>
          </div>
        ))}
      </div>

      {logic === "stacking" ? (
        <>
          <h3 className="bsheet-section-title">Refining path</h3>
          <p className="rc-sheet-text">Refine the lower tiers yourself wherever that is cheaper than buying them.</p>
          {flow.length ? (
            <div className="rc-stack-flow">
              {flow.map((node, index) => (
                <span key={index} className={`rc-flow-node rc-flow-${node.kind}`}>
                  {node.kind === "buy" ? "Buy " : ""}
                  {node.label}
                </span>
              ))}
            </div>
          ) : null}
          {onShowPath ? (
            <button type="button" className="rc-show-path-btn" onClick={onShowPath}>
              View step-by-step refining path →
            </button>
          ) : null}
        </>
      ) : null}

      <h3 className="bsheet-section-title">Ingredients</h3>
      <ul className="rc-sheet-ingredients">
        {ingredients.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {logic === "standard" ? <p className="rc-sheet-text">The lower-tier refined material is bought at market.</p> : null}

      <h3 className="bsheet-section-title">Cost breakdown</h3>
      <dl className="rc-sheet-list">
        {breakdown.map((figure) => (
          <div key={figure.label}>
            <dt>{figure.label}</dt>
            <dd className={toneClass(figure.tone)}>{figure.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
