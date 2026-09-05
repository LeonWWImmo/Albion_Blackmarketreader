import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthService } from "@shared/auth/authService";

/**
 * Remembers which tool pages the visitor has hidden the guide link on.
 *
 * Same persistence shape as the crafting specs: localStorage for instant reads and for
 * signed-out visitors, Supabase user metadata for anyone signed in, and a BroadcastChannel
 * so other open tabs follow along. A signed-out visitor simply keeps the preference on this
 * device — the remote write fails harmlessly without a session.
 */

const STORAGE_KEY = "guideLinkDismissedV1";
const REMOTE_KEY = "guideLinkDismissed";
const SYNC_CHANNEL = "rk-guide-dismiss-sync";

type DismissMap = Record<string, boolean>;

function normalize(raw: unknown): DismissMap {
  if (!raw || typeof raw !== "object") return {};
  const out: DismissMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === true) out[key] = true;
  }
  return out;
}

function readFromStorage(): DismissMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function writeToStorage(value: DismissMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export interface UseGuideDismissalResult {
  /** True once this tool's guide link has been hidden by the visitor. */
  dismissed: boolean;
  /** Hides the guide link for this tool and persists the choice. */
  dismiss: () => void;
}

export function useGuideDismissal(slug: string, authService: AuthService | null): UseGuideDismissalResult {
  const [map, setMap] = useState<DismissMap>(() => readFromStorage());
  const channelRef = useRef<BroadcastChannel | null>(null);
  // Mirrors `map` so dismiss() can read the latest value without doing its work inside a
  // state updater — updaters must stay pure, and StrictMode runs them twice.
  const mapRef = useRef(map);

  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  // Pull the signed-in visitor's saved choice.
  useEffect(() => {
    if (!authService) return;
    let cancelled = false;
    (async () => {
      try {
        const user = await authService.getCurrentUser();
        if (!user || cancelled) return;
        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        const remote = normalize(meta[REMOTE_KEY]);
        if (!Object.keys(remote).length) return;
        const merged = { ...mapRef.current, ...remote };
        mapRef.current = merged;
        setMap(merged);
        writeToStorage(merged);
      } catch {
        // ignore — the local value stands
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authService]);

  // Keep other tabs in step.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(SYNC_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ type?: string; value?: DismissMap }>) => {
      if (event.data?.type !== "dismiss" || !event.data.value) return;
      setMap(normalize(event.data.value));
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        setMap(normalize(JSON.parse(event.newValue)));
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const dismiss = useCallback(() => {
    const prev = mapRef.current;
    if (prev[slug]) return;

    const next = { ...prev, [slug]: true };
    mapRef.current = next;
    setMap(next);

    writeToStorage(next);
    channelRef.current?.postMessage({ type: "dismiss", value: next });
    // Signed-out visitors have no session, so this simply no-ops.
    authService?.updateUserMetadata({ [REMOTE_KEY]: next }).catch(() => undefined);
  }, [slug, authService]);

  return { dismissed: map[slug] === true, dismiss };
}
