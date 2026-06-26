// Block 5 (Input-Validierung / OWASP A05): Open-Redirect-Schutz.
// Validiert ein "next"-Redirect-Ziel gegen eine Allowlist erlaubter interner Pfade.

const ALLOWED_NEXT_PATHS = new Set([
  "/",
  "/dashboard",
  "/bm-crafter",
  "/crafting-calculator",
  "/refining-calculator",
  "/food-potion-crafter",
  "/community",
  "/legal"
]);

/**
 * Gibt den sicheren internen Pfad zurueck oder `null`, wenn das Ziel nicht erlaubt ist.
 * `origin` ist optional (Standard: Browser-Origin) und nur fuer Tests injizierbar –
 * das Laufzeitverhalten in der App bleibt unveraendert.
 */
export function getSafeNextPath(
  value: string | null,
  origin: string = typeof window !== "undefined" ? window.location.origin : ""
): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.includes("://")) return null;
  if (trimmed === "/login") return null;

  try {
    const url = new URL(trimmed, origin);
    if (url.origin !== origin) return null;
    if (!ALLOWED_NEXT_PATHS.has(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
