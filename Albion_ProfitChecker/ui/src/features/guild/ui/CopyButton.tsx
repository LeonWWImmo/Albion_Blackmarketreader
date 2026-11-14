import { useEffect, useRef, useState } from "react";

/** A button that copies `text`, with a clipboard icon, an optional count and a "Copied" tick after. */
export function CopyButton({ text, label, count }: { text: string; label: string; count?: number }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // no clipboard access (old browser, iframe): show the text to copy by hand
      window.prompt("Copy the text:", text);
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <button type="button" className={`gd-copy${copied ? " is-copied" : ""}`} onClick={() => void copy()} title={text} aria-live="polite">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {copied ? (
          <path d="M5 12.5 10 17.5 19 7" />
        ) : (
          <>
            <rect x="8" y="8" width="12" height="12" rx="2.5" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </>
        )}
      </svg>
      <span>{copied ? "Copied" : label}</span>
      {count !== undefined && !copied ? <b>{count}</b> : null}
    </button>
  );
}
