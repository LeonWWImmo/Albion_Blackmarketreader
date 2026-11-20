// Premium subscription, client side: the status and checkout link come from /api/billing (the
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
  /** Lemon Squeezy's status (active, cancelled, ...), null without a subscription */
  status: string | null;
  renewsAt: string | null;
  endsAt: string | null;
  /** false while the shop is not open yet (no checkout link on the server) */
  open: boolean;
  /** where the player manages or cancels, null without a subscription */
  portalUrl: string | null;
};

let auth: AuthService | null = null;

async function accessToken(): Promise<string | null> {
  const cfg = window.env;
  if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) return null;
  auth ??= createAuthService({ supabaseUrl: cfg.SUPABASE_URL, supabaseAnonKey: cfg.SUPABASE_ANON_KEY });
  const session = await auth.getSession().catch(() => null);
  return session?.user?.email_confirmed_at ? session.access_token : null;
}

async function billing<T>(action: string, token: string): Promise<T> {
  const res = await fetch(`/api/billing/${action}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error || "Something went wrong, try again.");
  return data as T;
}

/** The signed-in player's premium, or "guest" without a confirmed sign-in. */
export async function loadPremium(): Promise<PremiumStatus | "guest"> {
  const token = await accessToken();
  return token ? billing<PremiumStatus>("status", token) : "guest";
}

/** The Lemon Squeezy checkout for this player (it carries their id, so the payment lands on their account). */
export async function checkoutUrl(): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error("Sign in to get premium.");
  return (await billing<{ url: string }>("checkout", token)).url;
}
