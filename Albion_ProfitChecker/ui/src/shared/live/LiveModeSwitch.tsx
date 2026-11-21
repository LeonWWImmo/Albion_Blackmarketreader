// The Daily / Live / Live + fill switch of a tool (premium, hidden until the launch), with what the
// mode needs: sign in, premium, or when the live prices are from. See liveData.ts.
import type { LiveMode, LiveStatus } from "./liveData";
import "./live.css";

const MODES: Array<{ key: LiveMode; label: string; hint: string }> = [
  { key: "daily", label: "Daily", hint: "Today's data for every item" },
  { key: "live", label: "Live", hint: "Only prices from the last 30 minutes' snapshot" },
  { key: "fill", label: "Live + fill", hint: "Live where there is a live price, daily for the rest" }
];

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function LiveModeSwitch({ mode, setMode, status }: { mode: LiveMode; setMode: (m: LiveMode) => void; status: LiveStatus }) {
  return (
    <div className="lv-switch">
      <div className="lv-seg" role="group" aria-label="Prices">
        {MODES.map((m) => (
          <button key={m.key} type="button" className={mode === m.key ? "is-on" : ""} aria-pressed={mode === m.key} title={m.hint} onClick={() => setMode(m.key)}>
            {m.key === "daily" ? null : <i className="lv-pulse" aria-hidden="true" />}
            {m.label}
          </button>
        ))}
        <b className="lv-badge">Pro</b>
      </div>
      <span className="lv-status">
        {status.kind === "loading" ? "Loading live prices…" : null}
        {status.kind === "ok" ? (
          <>
            Live from <b>{clock(status.snap.pricesAt)}</b>
            {mode === "fill" ? (
              <span className="lv-legend">
                <i className="lv-dot is-live" /> live <i className="lv-dot is-daily" /> daily
              </span>
            ) : null}
          </>
        ) : null}
        {status.kind === "guest" ? (
          <>
            <a href={`/login?next=${encodeURIComponent(window.location.pathname)}`}>Sign in</a> for live prices · showing daily
          </>
        ) : null}
        {status.kind === "locked" ? (
          <>
            Live prices are part of <a href="/premium">Premium</a> · showing daily
          </>
        ) : null}
        {status.kind === "error" ? <>{status.message} · showing daily</> : null}
      </span>
    </div>
  );
}
