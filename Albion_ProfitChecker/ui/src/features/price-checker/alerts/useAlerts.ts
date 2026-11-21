// Price alerts (premium) on the browser side: the player's alerts and Discord webhook from
// /api/market/alert* (api/_lib/priceAlerts.js). The server checks premium; this only shows.
import { useCallback, useEffect, useState } from "react";
import { accessToken } from "@shared/premium/premium";

export type PriceAlert = {
  id: string;
  region: "eu" | "us";
  itemId: string;
  itemName: string;
  path: string;
  quality: number;
  market: string;
  side: "below" | "above";
  price: number;
  armed: boolean;
  firedAt: string | null;
  firedPrice: number | null;
};

export type NewAlert = Pick<PriceAlert, "region" | "itemId" | "itemName" | "path" | "quality" | "market" | "side" | "price">;

type Listing = { alerts: PriceAlert[]; hook: { name: string } | null; limit: number };

export type AlertsState =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "locked" }
  | { kind: "error"; message: string }
  | ({ kind: "ok" } & Listing);

class AlertError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call(action: string, body?: unknown): Promise<Listing> {
  const token = await accessToken();
  if (!token) throw new AlertError("Sign in to use price alerts.", 401);
  const res = await fetch(`/api/market/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new AlertError(data?.error || "Something went wrong, try again.", res.status);
  return data as Listing;
}

const stateOf = (err: unknown): AlertsState =>
  err instanceof AlertError && err.status === 401
    ? { kind: "guest" }
    : err instanceof AlertError && err.status === 403
      ? { kind: "locked" }
      : { kind: "error", message: err instanceof Error ? err.message : "Something went wrong, try again." };

/** The player's alerts while `active`; the actions answer with the new list or an error text. */
export function useAlerts(active: boolean) {
  const [state, setState] = useState<AlertsState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    call("alerts").then(
      (data) => alive && setState({ kind: "ok", ...data }),
      (err) => alive && setState(stateOf(err))
    );
    return () => {
      alive = false;
    };
  }, [active]);

  /** Runs an action; null when it worked, else the error to show. */
  const act = useCallback(async (action: string, body: unknown): Promise<string | null> => {
    setBusy(true);
    try {
      setState({ kind: "ok", ...(await call(action, body)) });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Something went wrong, try again.";
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    state,
    busy,
    save: (alert: NewAlert) => act("alert-save", alert),
    remove: (id: string) => act("alert-delete", { id }),
    connect: (url: string) => act("alert-hook", { url })
  };
}

const QUALITY = ["Normal", "Good", "Outstanding", "Excellent", "Masterpiece"];

/** "Cheapest listing ≤ 20.000 in any city" */
export function alertRule(alert: Pick<PriceAlert, "side" | "price" | "market" | "quality">): string {
  const where = alert.market === "ANY" ? (alert.side === "below" ? "any city" : "any market") : alert.market;
  const quality = alert.quality > 1 ? ` · ${QUALITY[alert.quality - 1]}` : "";
  return `${alert.side === "below" ? "Listing ≤" : "Buy order ≥"} ${alert.price.toLocaleString("de-DE")} in ${where}${quality}`;
}
