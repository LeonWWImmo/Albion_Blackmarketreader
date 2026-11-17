import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createAuthService } from "@shared/auth/authService";

/**
 * The session the page knows: `token` is the player's first token of it and stays the same while
 * the same player is signed in (pages key their requests on it), `fresh` is the latest one Supabase
 * handed out (it renews about once an hour) and is what requests send.
 */
let current: { userId: string; token: string; fresh: string } | null = null;

/** The latest token of the session `token` belongs to: an hour-old token would be turned down. */
export const freshToken = (token: string) => (current && current.token === token ? current.fresh : token);

/**
 * The signed-in player's Supabase access token for /api/guild, or null for guests.
 * `ready` turns true once the session has been read, so pages do not flash "sign in" first.
 * A renewed token does not change it: the open tabs keep their state, requests use the new one.
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
    const apply = (session: Session | null) => {
      if (!alive) return;
      const user = session?.user?.email_confirmed_at ? session.user : null;
      if (!session || !user) {
        current = null;
        setState({ token: null, ready: true });
        return;
      }
      if (current?.userId === user.id) current.fresh = session.access_token;
      else current = { userId: user.id, token: session.access_token, fresh: session.access_token };
      const token = current.token;
      setState((s) => (s.ready && s.token === token ? s : { token, ready: true }));
    };
    auth
      .getSession()
      .then(apply)
      .catch(() => alive && setState({ token: null, ready: true }));
    // a renewed session swaps the fresh token, an ended one signs out
    const { data } = auth.client.auth.onAuthStateChange((_event, session) => apply(session));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}
