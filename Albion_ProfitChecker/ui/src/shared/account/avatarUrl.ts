const FALLBACK = "/picture/accountsymbol.png";

/**
 * The account picture as an address this page can load. The crests are our own pictures under
 * /picture/: one saved as a full address (from a local dev server or a preview, say) comes back as
 * its path, so it loads on every one of our domains. Other web addresses stay as they are; scripts,
 * data and protocol-relative tricks get the default picture.
 */
export function sanitizeAvatarUrl(value?: string | null, origin = typeof window === "undefined" ? "https://blackmarketreader.com" : window.location.origin): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return FALLBACK;
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return FALLBACK;
  // protocol-relative ("//host") and backslash tricks that escape our origin; the URL parser drops
  // tabs and line breaks, so "/\t/host" would turn into "//host"
  if (trimmed.startsWith("//") || /[\\\t\r\n]/.test(trimmed)) return FALLBACK;
  try {
    const url = new URL(trimmed, origin);
    // a path must stay on our own site
    if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && url.origin !== new URL(origin).origin) return FALLBACK;
    if (url.protocol === "http:" || url.protocol === "https:") return url.pathname.startsWith("/picture/") ? url.pathname : url.href;
    if (url.protocol === "blob:") return url.href;
  } catch {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
  return FALLBACK;
}
