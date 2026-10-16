import { useEffect, useState } from "react";

type ShareLinkButtonProps = {
  /** Text for the system share sheet, e.g. the item name. */
  shareTitle: string;
};

/** Last-resort copy for browsers without the async clipboard API (old WebViews, plain http). */
function copyWithTextarea(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

/**
 * Shares the current item, tier, cities and region as a link. The page keeps its address in step
 * with that selection, so the current URL is the share link. On a touch device it opens the system share
 * sheet (straight into Discord or a chat); elsewhere, or if sharing is unavailable, it copies.
 */
export function ShareLinkButton({ shareTitle }: ShareLinkButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function share() {
    // The page keeps its query in step with the view; a #fragment is not part of the calculation.
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: shareTitle, url });
        return;
      } catch (error) {
        // closed by the user: nothing to do; anything else falls back to copying
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus(copyWithTextarea(url) ? "copied" : "failed");
    }
  }

  const label = status === "copied" ? "Link copied" : status === "failed" ? "Copy failed" : "Share this calculation";

  return (
    <>
      <button
        type="button"
        className={`cc-share-btn${status !== "idle" ? ` is-${status}` : ""}`}
        onClick={() => void share()}
        aria-label={label}
        title={label}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          {status === "copied" ? (
            <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            /* share: three linked nodes */
            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="2.6" />
              <circle cx="6" cy="12" r="2.6" />
              <circle cx="18" cy="19" r="2.6" />
              <path d="M8.3 10.7l7.4-4.4M8.3 13.3l7.4 4.4" />
            </g>
          )}
        </svg>
        {/* the icon alone does not say what happened, so a short note appears beside it */}
        {status !== "idle" ? (
          <span className="cc-share-toast" aria-hidden="true">
            {status === "copied" ? "Link copied" : "Copy failed"}
          </span>
        ) : null}
      </button>
      {/* announces the result to screen readers; outside the button, whose content is not read out */}
      <span className="cc-share-live" role="status" aria-live="polite">
        {status === "copied" ? "Link copied" : status === "failed" ? "Copy failed" : ""}
      </span>
    </>
  );
}
