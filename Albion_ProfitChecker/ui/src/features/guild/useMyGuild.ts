import { useCallback, useEffect, useState } from "react";
import { fetchMyGuild, type GuildRef } from "./api";
import { useAccessToken } from "./useAccessToken";

/** `loaded`: the session was read and, when signed in, the marked guild was asked for. */
export type MyGuild = { token: string | null; ready: boolean; loaded: boolean; guild: GuildRef | null; reload: () => void };

/** The signed-in player and the guild they marked, asked apart from the public (cached) guild data. */
export function useMyGuild(): MyGuild {
  const { token, ready } = useAccessToken();
  const [state, setState] = useState<{ token: string | null; guild: GuildRef | null } | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setState({ token: null, guild: null });
      return;
    }
    let alive = true;
    fetchMyGuild(token)
      .then((guild) => alive && setState({ token, guild }))
      .catch(() => alive && setState({ token, guild: null }));
    return () => {
      alive = false;
    };
  }, [token, ready, version]);

  // an answer for an earlier token (signed out meanwhile) does not count
  const current = state && state.token === token ? state : null;
  return { token, ready, loaded: Boolean(current), guild: current?.guild ?? null, reload };
}
