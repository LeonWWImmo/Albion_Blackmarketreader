import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./bottomSheet.css";

/** Length of the slide in bottomSheet.css; the sheet stays mounted this long after closing. */
const SLIDE_MS = 220;
/** How far the sheet has to be pulled down before letting go dismisses it. */
const DISMISS_DRAG_PX = 80;

let scrollLocks = 0;

/**
 * Stops the page scrolling behind a sheet or dialog; returns the release. A class rather than
 * an inline style: some tool pages force `overflow: visible !important` on body for their phone
 * layout, which beats an inline style. Counted, so closing one of two stacked overlays does not
 * unlock the page under the other.
 */
export function lockBodyScroll(): () => void {
  scrollLocks += 1;
  document.body.classList.add("bsheet-scroll-lock");
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks -= 1;
    if (scrollLocks === 0) document.body.classList.remove("bsheet-scroll-lock");
  };
}

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  /** Tints the top edge and handle to the tool's accent, like the filter sheet. */
  accent?: string;
  children: ReactNode;
  /** Pinned below the scrolling content, for the sheet's main action. */
  footer?: ReactNode;
  /** Extra class on the sheet panel, e.g. to give it a fixed height. */
  className?: string;
};

/**
 * Phone detail sheet. Slides up from the bottom, closes on the backdrop, the close button,
 * Escape, or by dragging the handle down. Portalled to <body> so no transformed or
 * overflow-hidden ancestor can clip it.
 */
export function BottomSheet({ open, onClose, label, accent, children, footer, className }: BottomSheetProps) {
  // `mounted` outlives `open` by one slide so the sheet can animate out before it unmounts.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<number | null>(null);
  const dragDistance = useRef(0);

  // Held in a ref so the effects below depend on `open` only. An inline arrow from the parent
  // would otherwise re-run them every render, re-locking scroll and stealing the focus target.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      setDragY(0);
      return;
    }
    if (!mounted) return;
    // Clearing the drag offset lets the close slide continue from wherever the finger let go.
    setDragY(0);
    setClosing(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockBodyScroll();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      releaseScroll();
      returnFocusTo?.focus({ preventScroll: true });
    };
  }, [open]);

  // Separate from the effect above: on the render where `open` turns true the sheet is not in
  // the DOM yet (`mounted` follows one render later), so focusing there would hit nothing.
  useEffect(() => {
    if (open && mounted) sheetRef.current?.focus({ preventScroll: true });
  }, [open, mounted]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    // Leave the close button alone: capturing its pointer would swallow its click.
    if (event.target instanceof Element && event.target.closest("button")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragStart.current = event.clientY;
    dragDistance.current = 0;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragStart.current === null) return;
    const distance = Math.max(0, event.clientY - dragStart.current);
    dragDistance.current = distance;
    setDragY(distance);
  }

  function endDrag() {
    if (dragStart.current === null) return;
    dragStart.current = null;
    setDragging(false);
    if (dragDistance.current > DISMISS_DRAG_PX) onCloseRef.current();
    else setDragY(0);
    dragDistance.current = 0;
  }

  if (!mounted) return null;

  const accentVar = accent ? ({ "--tool-accent": accent } as CSSProperties) : undefined;
  const sheetStyle: CSSProperties | undefined = dragY
    ? { transform: `translateY(${dragY}px)`, transition: dragging ? "none" : undefined }
    : undefined;

  return createPortal(
    <div className={`bsheet-root${closing ? " is-closing" : ""}`} style={accentVar}>
      <div className="bsheet-backdrop" onClick={() => onCloseRef.current()} />
      <div
        ref={sheetRef}
        className={className ? `bsheet ${className}` : "bsheet"}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={sheetStyle}
      >
        <div
          className="bsheet-grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="bsheet-handle" aria-hidden="true" />
          <button type="button" className="bsheet-close" aria-label="Close" onClick={() => onCloseRef.current()}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="bsheet-body">{children}</div>
        {footer ? <div className="bsheet-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
