// Premium subscription (Stripe), client side: the status, checkout and portal come from /api/billing (the
// server decides; nothing here unlocks anything). Premium data itself is guarded by the database.
import { createAuthService, type AuthService } from "@shared/auth/authService";

/** Off until launch: visitors see nothing of premium. `localStorage["bmr-premium-preview"] = "1"` shows it for testing. */
const PREMIUM_OPEN = false;

export function premiumVisible(): boolean {
  if (PREMIUM_OPEN) return true;
  try {
    return localStorage.getItem("bmr-premium-preview") === "1";
  } catch {
    return false;
  }
}

export type PremiumStatus = {
  premium: boolean;
  /** stored status (active, cancelled, past_due, ...), null without a subscription */
  status: string | null;
  renewsAt: string | null;
  endsAt: string | null;
  /** false while the shop is not open yet (no Stripe price on the server) */
  open: boolean;
  /** true when there is a subscription to manage in Stripe's customer portal */
  manage: boolean;
};

let auth: AuthService | null = null;

async function accessToken(): Promise<string | null> {
  const cfg = window.env;
  if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) return null;
  auth ??= createAuthService({ supabaseUrl: cfg.SUPABASE_URL, supabaseAnonKey: cfg.SUPABASE_ANON_KEY });
  const session = await auth.getSession().catch(() => null);
  return session?.user?.email_confirmed_at ? session.access_token : null;
}

async function billing<T>(action: string, token: string, post = false): Promise<T> {
  const res = await fetch(`/api/billing/${action}`, {
    method: post ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(post ? { "Content-Type": "application/json" } : {}) },
    // Stripe sends the player back to the page they came from
    body: post ? JSON.stringify({ path: window.location.pathname }) : undefined
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error || "Something went wrong, try again.");
  return data as T;
}

/** The signed-in player's premium, or "guest" without a confirmed sign-in. */
export async function loadPremium(): Promise<PremiumStatus | "guest"> {
  const token = await accessToken();
  return token ? billing<PremiumStatus>("status", token) : "guest";
}

/** A Stripe Checkout for this player, made by the server (it carries their id, so the payment lands on their account). */
export async function checkoutUrl(): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error("Sign in to get premium.");
  return (await billing<{ url: string }>("checkout", token, true)).url;
}

/** Stripe's customer portal for this player: change the card, see invoices, cancel. */
export async function portalUrl(): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error("Sign in to manage premium.");
  return (await billing<{ url: string }>("portal", token, true)).url;
}
