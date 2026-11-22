// The price alert panel on an item's Price Checker page (premium, hidden until the launch), always
// open: "instant buy" (a sell order at or below the price) or "instant sell" (a buy order at or above
// it) for this item, see and delete its alerts, connect Discord.
import { useState, type FormEvent } from "react";
import { MARKETS } from "../core/quotes";
import { alertRule, useAlerts, type NewAlert, type PriceAlert } from "./useAlerts";
import "./alerts.css";

type Props = {
  /** everything of the new alert but the rule the player picks */
  base: Omit<NewAlert, "market" | "side" | "price">;
  /** prices to start the price field with */
  cheapest: number | null;
  bestSell: number | null;
};

const roundNice = (n: number) => {
  const step = n >= 1e6 ? 1000 : n >= 1e4 ? 100 : 10;
  return Math.max(step, Math.round(n / step) * step);
};

export function AlertPanel({ base, cheapest, bestSell }: Props) {
  const { state, busy, save, remove, connect } = useAlerts(true);
  const [side, setSide] = useState<"below" | "above">("below");
  const [market, setMarket] = useState("ANY");
  const [price, setPrice] = useState(() => String(cheapest ? roundNice(cheapest * 0.9) : ""));
  const [url, setUrl] = useState("");
  const [changeHook, setChangeHook] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const pickSide = (next: "below" | "above") => {
    setSide(next);
    if (next === "below" && market === "Black Market") setMarket("ANY");
    const start = next === "below" ? cheapest && cheapest * 0.9 : bestSell && bestSell * 1.1;
    if (start) setPrice(String(roundNice(start)));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setDone("");
    const value = Number(price.replace(/[.\s,]/g, ""));
    if (!(value > 0)) return setError("Enter a price.");
    const failed = await save({ ...base, side, market, price: value });
    if (failed) setError(failed);
    else setDone("Alert set. It is checked every 30 minutes.");
  };

  const link = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const failed = await connect(url.trim());
    if (failed) setError(failed);
    else {
      setUrl("");
      setChangeHook(false);
    }
  };

  const mine =
    state.kind === "ok" ? state.alerts.filter((a) => a.itemId === base.itemId && a.region === base.region && a.quality === base.quality) : [];

  return (
    <section className="pc-card pa-panel" aria-labelledby="pa-title">
      <div className="pa-head">
        <div>
          <span className="pa-kicker">
            Price alert <b>Premium</b>
          </span>
          <h2 id="pa-title">Ping me in Discord when…</h2>
        </div>
      </div>

      {state.kind === "loading" ? <p className="pa-note">Loading your alerts…</p> : null}
      {state.kind === "error" ? <p className="pa-error">{state.message}</p> : null}
      {state.kind === "guest" ? (
        <div className="pa-gate">
          <p>Sign in to get a Discord ping when this item hits your price.</p>
          <a className="pa-cta" href={`/login?next=${encodeURIComponent(base.path)}`}>
            Sign in
          </a>
        </div>
      ) : null}
      {state.kind === "locked" ? (
        <div className="pa-gate">
          <p>Price alerts are part of Premium: up to 25 items, checked every 30 minutes, straight to your Discord.</p>
          <a className="pa-cta" href="/premium">
            Get Premium
          </a>
        </div>
      ) : null}

      {state.kind === "ok" && (!state.hook || changeHook) ? (
        <form className="pa-hook" onSubmit={link}>
          <p>
            <b>Where should the pings go?</b> In Discord: Server settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. A private channel works best.
          </p>
          <div className="pa-row">
            <input type="url" required placeholder="https://discord.com/api/webhooks/…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button type="submit" className="pa-cta" disabled={busy}>
              {busy ? "Checking…" : "Connect"}
            </button>
          </div>
        </form>
      ) : null}

      {state.kind === "ok" && state.hook && !changeHook ? (
        <>
          <form className="pa-form" onSubmit={submit}>
            <div className="pa-seg" role="group" aria-label="What do you want to do?">
              <button type="button" className={side === "below" ? "is-on" : ""} aria-pressed={side === "below"} onClick={() => pickSide("below")}>
                <span className="pa-seg-tag">I want to buy</span>
                Instant buy
                <small>Ping when someone lists it at or below my price (cheapest sell order)</small>
              </button>
              <button type="button" className={side === "above" ? "is-on" : ""} aria-pressed={side === "above"} onClick={() => pickSide("above")}>
                <span className="pa-seg-tag">I want to sell</span>
                Instant sell
                <small>Ping when a buy order pays my price or more (best buy order)</small>
              </button>
            </div>
            <div className="pa-row">
              <label className="pa-field">
                <span>Market</span>
                <select value={market} onChange={(e) => setMarket(e.target.value)}>
                  <option value="ANY">{side === "below" ? "Any city" : "Any market"}</option>
                  {MARKETS.filter((m) => side === "above" || m !== "Black Market").map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pa-field">
                <span>{side === "below" ? "Sell order at or below" : "Buy order at or above"}</span>
                <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="silver" />
              </label>
              <button type="submit" className="pa-cta" disabled={busy}>
                {busy ? "Saving…" : "Set alert"}
              </button>
            </div>
            <p className="pa-note">
              {side === "below" ? "Cheapest sell order" : "Best buy order"} now:{" "}
              <b>{(side === "below" ? cheapest : bestSell)?.toLocaleString("de-DE") ?? "no recent price"}</b> · pings go to <b>#{state.hook.name}</b>{" "}
              <button type="button" className="pa-link" onClick={() => setChangeHook(true)}>
                change
              </button>
            </p>
          </form>
          {mine.length ? (
            <ul className="pa-list">
              {mine.map((a) => (
                <AlertRow key={a.id} alert={a} busy={busy} onDelete={() => void remove(a.id)} />
              ))}
            </ul>
          ) : null}
          <p className="pa-note">
            {state.alerts.length} of {state.limit} alerts used.{" "}
            <a className="pa-link" href="/prices#alerts">
              All your alerts
            </a>
          </p>
        </>
      ) : null}

      {error ? <p className="pa-error">{error}</p> : null}
      {done ? <p className="pa-done">{done}</p> : null}
    </section>
  );
}

export function AlertRow({ alert, busy, onDelete, showItem = false }: { alert: PriceAlert; busy: boolean; onDelete: () => void; showItem?: boolean }) {
  return (
    <li className={`pa-item ${alert.armed ? "" : "is-fired"}`}>
      <span className="pa-item-main">
        {showItem ? (
          <a href={alert.path}>
            {alert.itemName} <small>{alert.region.toUpperCase()}</small>
          </a>
        ) : null}
        <span>{alertRule(alert)}</span>
      </span>
      <span className={`pa-status ${alert.armed ? "is-armed" : "is-fired"}`}>
        {alert.armed ? "Watching" : `Fired at ${alert.firedPrice?.toLocaleString("de-DE") ?? "?"}`}
      </span>
      <button type="button" className="pa-del" onClick={onDelete} disabled={busy} aria-label="Delete alert">
        Delete
      </button>
    </li>
  );
}
