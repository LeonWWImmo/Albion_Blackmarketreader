// Reports the JavaScript errors real visitors hit to /api/client-error, which posts each new one to
// the private Discord #errors channel. Only on the live site, each error once per visit and at most
// a few per visit; reporting itself can never break the page.
import { reload } from "./browserGuards";

const ENDPOINT = "/api/client-error";
const LIVE_HOST = "blackmarketreader.com";
const MAX_REPORTS = 5;
// noise every site sees: browser quirks, cross-origin scripts without details, extensions and ads
const IGNORED = /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection/;
const FOREIGN = /chrome-extension:|moz-extension:|safari-(web-)?extension:|googlesyndication|doubleclick|googletagmanager|fundingchoices|adsbygoogle|_vercel\/(insights|speed-insights)/;

type Report = { message: string; stack: string; source: string };

/** Chrome's page translation marks <html>; worth knowing for errors that only translated pages hit. */
const translated = () => /\btranslated-(ltr|rtl)\b/.test(document.documentElement.className);

export function shouldReport({ message, stack, source }: Report): boolean {
  return !!message && !IGNORED.test(message) && !FOREIGN.test(`${stack}\n${source}`);
}

function send(report: Report): void {
  const body = JSON.stringify({
    message: report.message.slice(0, 300),
    stack: report.stack.slice(0, 1500),
    source: report.source.slice(0, 300),
    page: location.pathname,
    browser: `${translated() ? "[translated page] " : ""}${navigator.userAgent}`.slice(0, 200)
  });
  try {
    if (!navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) {
      void fetch(ENDPOINT, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    // reporting must never break the page
  }
}

let reportOne: ((raw: Report) => void) | null = null;

/** Reports an error the page caught itself (PageErrorBoundary), which never reaches window "error". */
export function reportCaughtError(error: unknown): void {
  const e = error instanceof Error ? error : new Error(String(error));
  reportOne?.({ message: `${e.name}: ${e.message}`, stack: e.stack ?? "", source: "" });
}

export function installErrorReporter(): void {
  // dev runs on localhost and previews on vercel.app, so this is the live build only.
  // Automated browsers (scrapers, test bots) often block stylesheets and scripts on purpose: their
  // "Unable to preload CSS" reports say nothing about what visitors see.
  if (location.hostname !== LIVE_HOST || navigator.webdriver) return;
  const seen = new Set<string>();
  const report = (raw: Report) => {
    // a thrown object can carry anything in these fields
    const r = { message: String(raw.message ?? ""), stack: String(raw.stack ?? ""), source: String(raw.source ?? "") };
    const key = `${r.message}|${r.stack.split("\n")[1] ?? ""}`;
    // the page is reloading onto the new build: errors from the old one are expected
    if (reload.pending) return;
    if (seen.size >= MAX_REPORTS || seen.has(key) || !shouldReport(r)) return;
    seen.add(key);
    send(r);
  };
  reportOne = report;
  window.addEventListener("error", (event) => {
    const error = event.error as Error | undefined;
    report({ message: error?.message ? `${error.name}: ${error.message}` : event.message, stack: error?.stack ?? "", source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : "" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as Error | string | undefined;
    const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason ?? "");
    report({ message: `Unhandled promise: ${message}`, stack: reason instanceof Error ? (reason.stack ?? "") : "", source: "" });
  });
}
