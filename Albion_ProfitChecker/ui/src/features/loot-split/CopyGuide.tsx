import { useEffect, useState, type CSSProperties } from "react";
import { Sheet } from "./Sheet";

const icon = (id: string) => `https://render.albiononline.com/v1/item/${id}.png`;

const CHEST = ["T6_2H_CROSSBOW", "T5_HIDE_LEVEL1@1", "T4_BAG", "T5_RUNE", "T6_MAIN_SWORD", "T4_POTION_HEAL", "T5_HEAD_LEATHER_SET2", "T6_SOUL", "", "", "", ""];
const LOG_ROWS: [string, string, string, number][] = [
  ["T6_2H_CROSSBOW", "Kaelthar", "Master's Crossbow", 1],
  ["T5_RUNE", "Mirelle", "Expert's Rune", 17],
  ["T4_POTION_HEAL", "Brannoc", "Healing Potion", -5],
  ["T6_MAIN_SWORD", "Kaelthar", "Master's Broadsword", 1]
];

/** A drawn game window, so the steps read without screenshots of the real one. */
function ChestArt() {
  return (
    <div className="g-win">
      <div className="g-head">
        <span>Guild Chest</span>
        <span className="g-btn g-hot">
          <span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>
          Log
        </span>
      </div>
      <div className="g-slots">
        {CHEST.map((id, i) => (
          <span key={i} className="g-slot">
            {id && <img src={icon(id)} alt="" loading="lazy" onLoad={(e) => e.currentTarget.classList.add("is-loaded")} />}
          </span>
        ))}
      </div>
      <span className="g-cursor" style={{ "--x": "84%", "--y": "9%" } as CSSProperties} />
    </div>
  );
}

function LogArt() {
  return (
    <div className="g-win">
      <div className="g-head">
        <span>Chest Log</span>
      </div>
      <div className="g-table">
        <div className="g-row g-th">
          <span>Date</span>
          <span>Player</span>
          <span>Item</span>
          <span>Amount</span>
        </div>
        {LOG_ROWS.map(([id, player, name, amount], i) => (
          <div key={i} className="g-row">
            <span>11/05 20:1{i}</span>
            <span>{player}</span>
            <span className="g-item">
              <img src={icon(id)} alt="" loading="lazy" onLoad={(e) => e.currentTarget.classList.add("is-loaded")} />
              {name}
            </span>
            <span className={amount < 0 ? "g-out" : "g-in"}>{amount > 0 ? `+${amount}` : amount}</span>
          </div>
        ))}
      </div>
      <div className="g-foot">
        <span className="g-btn g-hot">
          <span className="material-symbols-outlined" aria-hidden="true">content_copy</span>
          Copy
        </span>
      </div>
      <span className="g-cursor" style={{ "--x": "86%", "--y": "86%" } as CSSProperties} />
    </div>
  );
}

function PasteArt() {
  return (
    <div className="g-paste">
      <div className="g-keys">
        <kbd>Ctrl</kbd>
        <span>+</span>
        <kbd className="g-press">V</kbd>
      </div>
      <div className="g-mini">
        <span className="material-symbols-outlined" aria-hidden="true">inventory_2</span>
        Paste your chest log
      </div>
    </div>
  );
}

const STEPS = [
  { title: "Open the chest, click Log", text: "The chest your loot went into.", art: <ChestArt /> },
  { title: "Click Copy", text: "Copies the whole log.", art: <LogArt /> },
  { title: "Paste it here", text: "Ctrl + V anywhere on this page. Then pick which part counts.", art: <PasteArt /> }
];

export function CopyGuide({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (event.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Sheet label="How to copy your chest log" className="ls-guide" onClose={onClose}>
      <p className="ls-eyebrow">HOW TO COPY IT</p>
      <div className="ls-guide-stage">
        <div className="ls-guide-track" style={{ transform: `translateX(-${step * 100}%)` }}>
          {STEPS.map((s, i) => (
            <figure key={s.title} className={i === step ? "is-on" : ""} aria-hidden={i !== step}>
              <div className="ls-guide-art">{s.art}</div>
              <figcaption>
                <span className="ls-guide-n">{i + 1}</span>
                <b>{s.title}</b>
                <span>{s.text}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="ls-guide-nav">
        <div className="ls-dots" role="tablist" aria-label="Steps">
          {STEPS.map((s, i) => (
            <button key={s.title} type="button" role="tab" aria-selected={i === step} aria-label={`Step ${i + 1}`} onClick={() => setStep(i)} />
          ))}
        </div>
        <div className="ls-guide-btns">
          {step > 0 && (
            <button type="button" className="ls-more" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button type="button" className="ls-go" onClick={() => (last ? onClose() : setStep(step + 1))}>
            {last ? "Got it" : "Next"}
            <span className="material-symbols-outlined" aria-hidden="true">{last ? "check" : "arrow_forward"}</span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}
