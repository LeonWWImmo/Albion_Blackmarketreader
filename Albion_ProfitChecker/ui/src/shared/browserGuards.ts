// Two guards against failures that are not bugs in our code but still break the page for visitors.
// main.tsx switches both on before anything renders.

/** Set while the page reloads itself, so the error reporter stays quiet about the old build. */
export const reload = { pending: false };

const RELOAD_KEY = "rk-stale-build-reload";
const RELOAD_GAP_MS = 30_000;

/**
 * After a deploy, a tab that is still open runs the old build, whose lazy chunks and stylesheets
 * no longer exist ("Failed to fetch dynamically imported module", "Unable to preload CSS"). Vite
 * fires vite:preloadError for both: reload once to get the new build. A second failure within
 * 30 seconds is a real network problem and goes through as an error.
 */
export function reloadOnStaleBuild(doReload: () => void = () => window.location.reload()): void {
  window.addEventListener("vite:preloadError", (event) => {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
      if (Date.now() - last < RELOAD_GAP_MS) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      return; // without storage we cannot tell a loop from a stale tab: let the error through
    }
    event.preventDefault();
    reload.pending = true;
    // if the reload never happens (the visitor cancelled it), report errors again
    setTimeout(() => (reload.pending = false), 5000);
    doReload();
  });
}

/**
 * Chrome's built-in page translation (and some extensions) swap the text nodes React rendered for
 * new ones. React then removes or inserts next to a node that is no longer there and the whole page
 * falls over with NotFoundError on removeChild / insertBefore. Skipping those calls keeps the page
 * alive; React's own nodes are unaffected. Workaround from facebook/react#11538.
 */
export function guardForeignDomChanges(): void {
  if (typeof Node !== "function" || !Node.prototype) return;
  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };
  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, child: Node | null): T {
    if (child && child.parentNode !== this) return node;
    return insertBefore.call(this, node, child) as T;
  };
}
