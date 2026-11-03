// Reports the JavaScript errors real visitors hit to /api/client-error, which posts each new one to
// the private Discord #errors channel. Only on the live site, each error once per visit and at most
// a few per visit; reporting itself can never break the page.
const ENDPOINT = "/api/client-error";
const LIVE_HOST = "blackmarketreader.com";
const MAX_REPORTS = 5;
// noise every site sees: browser quirks, cross-origin scripts without details, extensions and ads
const IGNORED = /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection/;
const FOREIGN = /chrome-extension:|moz-extension:|safari-(web-)?extension:|googlesyndication|doubleclick|googletagmanager|fundingchoices|adsbygoogle|_vercel\/(insights|speed-insights)/;

type Report = { message: string; stack: string; source: string };

export function shouldReport({ message, stack, source }: Report): boolean {
  return !!message && !IGNORED.test(message) && !FOREIGN.test(`${stack}\n${source}`);
}

function send(report: Report): void {
  const body = JSON.stringify({
    message: report.message.slice(0, 300),
    stack: report.stack.slice(0, 1500),
    source: report.source.slice(0, 300),
    page: location.pathname,
    browser: navigator.userAgent.slice(0, 200)
  });
  try {
    if (!navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) {
      void fetch(ENDPOINT, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    // reporting must never break the page
  }
}

export function installErrorReporter(): void {
  // dev runs on localhost and previews on vercel.app, so this is the live build only
  if (location.hostname !== LIVE_HOST) return;
  const seen = new Set<string>();
  const report = (raw: Report) => {
    // a thrown object can carry anything in these fields
    const r = { message: String(raw.message ?? ""), stack: String(raw.stack ?? ""), source: String(raw.source ?? "") };
    const key = `${r.message}|${r.stack.split("\n")[1] ?? ""}`;
    if (seen.size >= MAX_REPORTS || seen.has(key) || !shouldReport(r)) return;
    seen.add(key);
    send(r);
  };
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
