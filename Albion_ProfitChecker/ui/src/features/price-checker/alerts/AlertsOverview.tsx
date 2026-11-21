// All of the player's price alerts on the Price Checker start page (premium, hidden until the launch).
import { AlertRow } from "./AlertPanel";
import { useAlerts } from "./useAlerts";
import "./alerts.css";

export function AlertsOverview() {
  const { state, busy, remove } = useAlerts(true);
  if (state.kind !== "ok" || (!state.alerts.length && !state.hook)) return null;
  return (
    <section className="pc-card pa-panel" id="alerts" aria-labelledby="pa-all-title">
      <div className="pa-head">
        <div>
          <span className="pa-kicker">
            Price alerts <b>Premium</b>
          </span>
          <h2 id="pa-all-title">Your alerts</h2>
        </div>
        <span className="pa-note">
          {state.alerts.length} of {state.limit}
          {state.hook ? ` · pings to #${state.hook.name}` : ""}
        </span>
      </div>
      {state.alerts.length ? (
        <ul className="pa-list">
          {state.alerts.map((a) => (
            <AlertRow key={a.id} alert={a} busy={busy} showItem onDelete={() => void remove(a.id)} />
          ))}
        </ul>
      ) : (
        <p className="pa-note">No alerts yet. Open an item and press "Alert".</p>
      )}
    </section>
  );
}
