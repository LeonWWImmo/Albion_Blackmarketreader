import { useEffect, useRef, type ReactNode } from "react";

/** A centred dialog over a blurred page (a bottom sheet on phones). Esc or a click outside closes it. */
export function Sheet({ label, className = "", onClose, children }: { label: string; className?: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab" || !box.current) return;
      // keep Tab inside the dialog
      const focusable = [...box.current.querySelectorAll<HTMLElement>("button, input, select, a[href], [tabindex]:not([tabindex='-1'])")].filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null && !el.closest("[aria-hidden='true']")
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === box.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    box.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      before?.focus?.();
    };
  }, []);

  return (
    <div className="ls-sheet-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`ls-sheet ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <button type="button" className="ls-sheet-x" onClick={onClose} aria-label="Close">
          <span className="material-symbols-outlined">close</span>
        </button>
        {children}
      </div>
    </div>
  );
}
