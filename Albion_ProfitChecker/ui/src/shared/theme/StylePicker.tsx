import { useState } from "react";
import "./stylePicker.css";
import { assetUrl } from "../assets/assets";
import { FACTIONS, type Faction } from "./factions";

/**
 * First-visit "Choose your style" overlay.
 *
 * Picking a crest here is the same action as picking it in the account panel — the page
 * that renders this turns the choice into an avatar update, so there is only ever one
 * place the faction is stored.
 */

type Props = {
  onPick: (faction: Faction) => void;
  onSkip: () => void;
};

export function StylePicker({ onPick, onSkip }: Props) {
  // Hovering a crest paints the card in that faction so the choice can be seen, not read.
  const [preview, setPreview] = useState<Faction>(FACTIONS[0]);

  return (
    <div className="fx-picker-overlay" role="dialog" aria-modal="true" aria-label="Choose your style">
      <div
        className="fx-picker-card"
        style={
          {
            "--fx-preview": preview.accent,
            "--fx-preview-rgb": preview.accentRgb,
            "--fx-preview2": preview.accent2
          } as React.CSSProperties
        }
      >
        <span className="fx-picker-eyebrow">Albion Online</span>
        <h3>Choose your style</h3>
        <p className="fx-picker-lead">
          Pick the city you ride for. Its colours light the background across every tool, and the
          crest becomes your account icon &mdash; change it any time from the account panel.
        </p>

        <div className="fx-picker-grid">
          {FACTIONS.map((faction) => (
            <button
              key={faction.id}
              type="button"
              className="fx-picker-option"
              style={
                {
                  "--fx-option": faction.accent,
                  "--fx-option-rgb": faction.accentRgb,
                  "--fx-option2": faction.accent2
                } as React.CSSProperties
              }
              onMouseEnter={() => setPreview(faction)}
              onFocus={() => setPreview(faction)}
              onClick={() => onPick(faction)}
            >
              <span className="fx-picker-crest">
                <img src={assetUrl(faction.crest.replace(/^\//, ""))} alt="" />
              </span>
              <span className="fx-picker-name">{faction.name}</span>
              <span className="fx-picker-tagline">{faction.tagline}</span>
              <span className="fx-picker-swatch" aria-hidden="true" />
            </button>
          ))}
        </div>

        <button type="button" className="fx-picker-skip" onClick={onSkip}>
          Keep the default look
        </button>
      </div>
    </div>
  );
}
