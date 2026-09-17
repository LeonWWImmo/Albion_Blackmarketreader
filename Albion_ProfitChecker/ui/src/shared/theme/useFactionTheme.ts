import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import "./factionTheme.css";
import { factionFromAvatar, type Faction } from "./factions";

/**
 * Applies the account's faction colours to a tool page.
 *
 * The faction is derived from the crest avatar, which already syncs across tabs through
 * localStorage plus the "rk-profile-sync" BroadcastChannel, so this hook only has to
 * mirror that into a data-faction attribute on <html> and let CSS do the rest.
 *
 * Only tool pages call it; the attribute is removed on unmount so the landing, legal and
 * community pages keep their own palette.
 */

const CHOSEN_KEY = "factionChosenV1";

function readStoredAvatar(): string | null {
  try {
    return localStorage.getItem("avatar");
  } catch {
    return null;
  }
}

/** True once the player has answered the style picker, however they answered it. */
export function hasChosenFaction(): boolean {
  try {
    return localStorage.getItem(CHOSEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markFactionChosen(): void {
  try {
    localStorage.setItem(CHOSEN_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}

export function useFactionTheme(avatar?: string | null): Faction | null {
  // Seeded from storage so the theme is right on the first paint of a reload.
  const [storedAvatar, setStoredAvatar] = useState<string | null>(readStoredAvatar);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "avatar") return;
      setStoredAvatar(event.newValue);
    };
    window.addEventListener("storage", onStorage);

    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel("rk-profile-sync");
      channel.onmessage = (event: MessageEvent<{ type?: string; value?: string }>) => {
        if (event.data?.type !== "avatar" || !event.data.value) return;
        setStoredAvatar(event.data.value);
      };
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }, []);

  // The page's own user state is the fresher source when it has one.
  const faction = useMemo(() => factionFromAvatar(avatar ?? storedAvatar), [avatar, storedAvatar]);

  // Layout effect, not a plain one: the attribute has to be on <html> before the first
  // paint, otherwise the default backdrop flashes for a frame before the faction one.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (faction) root.dataset.faction = faction.id;
    else delete root.dataset.faction;
    return () => {
      delete root.dataset.faction;
    };
  }, [faction]);

  return faction;
}
