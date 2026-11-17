import { useCallback, useEffect, useState } from "react";
import type { Region } from "@shared/types";
import { fetchMyGuilds, type GuildRef } from "./api";
import { useAccessToken } from "./useAccessToken";

const NONE: GuildRef[] = [];

/**
 * `loaded`: the session was read and, when signed in, the marked guilds were asked for. `guilds`: one
 * per server at most; `on(region)` is the one marked on that server.
 */
export type MyGuild = { token: string | null; ready: boolean; loaded: boolean; guilds: GuildRef[]; on: (region: Region) => GuildRef | null; reload: () => void };

/** The signed-in player and the guilds they marked, asked apart from the public (cached) guild data. */
export function useMyGuild(): MyGuild {
  const { token, ready } = useAccessToken();
  const [state, setState] = useState<{ token: string | null; guilds: GuildRef[] } | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setState({ token: null, guilds: [] });
      return;
    }
    let alive = true;
    fetchMyGuilds(token)
      .then((guilds) => alive && setState({ token, guilds }))
      .catch(() => alive && setState({ token, guilds: [] }));
    return () => {
      alive = false;
    };
  }, [token, ready, version]);

  // an answer for an earlier token (signed out meanwhile) does not count
  const current = state && state.token === token ? state : null;
  const guilds = current?.guilds ?? NONE;
  const on = useCallback((region: Region) => guilds.find((g) => g.region === region) ?? null, [guilds]);
  return { token, ready, loaded: Boolean(current), guilds, on, reload };
}
