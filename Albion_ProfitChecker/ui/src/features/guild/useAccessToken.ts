import { useEffect, useState } from "react";
import { createAuthService } from "@shared/auth/authService";

/**
 * The signed-in player's Supabase access token for /api/guild, or null for guests.
 * `ready` turns true once the session has been read, so pages do not flash "sign in" first.
 */
export function useAccessToken(): { token: string | null; ready: boolean } {
  const [state, setState] = useState<{ token: string | null; ready: boolean }>({ token: null, ready: false });

  useEffect(() => {
    const cfg = window.env;
    if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) {
      setState({ token: null, ready: true });
      return;
    }
    const auth = createAuthService({ supabaseUrl: cfg.SUPABASE_URL, supabaseAnonKey: cfg.SUPABASE_ANON_KEY });
    let alive = true;
    auth
      .getSession()
      .then((session) => alive && setState({ token: session?.user?.email_confirmed_at ? session.access_token : null, ready: true }))
      .catch(() => alive && setState({ token: null, ready: true }));
    // a refreshed or ended session swaps the token
    const { data } = auth.client.auth.onAuthStateChange((_event, session) => {
      if (alive) setState({ token: session?.user?.email_confirmed_at ? session.access_token : null, ready: true });
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}
