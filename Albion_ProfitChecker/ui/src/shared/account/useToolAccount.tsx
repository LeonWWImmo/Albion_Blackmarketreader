import { useEffect, useRef, useState, type ReactNode } from "react";
import { assetUrl } from "@shared/assets/assets";
import { createAuthService, type AuthService } from "@shared/auth/authService";
import { isGuest, buildGuestProfile, enterGuest, exitGuest } from "@shared/auth/guestMode";
import { ToolGuideLink } from "@shared/content/ToolGuideLink";
import type { ToolSlug } from "@shared/content/toolContentData";
import {
  CommunityTile,
  GuestSignInLink,
  RegionPicker,
  StylePicker,
  exitGuestToLogin,
  hasChosenFaction,
  markFactionChosen,
  needsRegionChoice,
  useFactionTheme
} from "../index";

type Region = "eu" | "us";
type UserState = { id: string; email: string | null; avatar: string; region: Region | null };


const allowedAvatars = [
  "/picture/Bridgewatch.png",
  "/picture/Carleon.png",
  "/picture/Martlockwappen.png",
  "/picture/Lymhurstwappen.png",
  "/picture/Thefortwappen.png",
  "/picture/Fortsterlingwappen.png"
];

function sanitizeAvatarUrl(value?: string | null): string {
  const fallback = "/picture/accountsymbol.png";
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return fallback;
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:") return url.href;
  } catch {
    if (trimmed.startsWith("//")) return fallback;
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
  return fallback;
}

function readStoredRegion(): Region | null {
  const stored = (localStorage.getItem("region") || "").toLowerCase();
  return stored === "us" || stored === "eu" ? stored : null;
}

/**
 * Everything the tools share around the page itself, as on the Gold Tracker: guest or signed-in
 * session, the server question on a first visit, the faction style picker, the region pill and
 * account panel in the header, the community tile and the guide link.
 * Returns the header's right side (`meta`) and the overlays to render once (`layers`).
 */
export function useToolAccount(
  /** this tool's path, where login sends the visitor back to, e.g. "/loot-split" */
  path: string,
  /** the tool's guide for the guide link, or null while it has none */
  guide: ToolSlug | null,
  region: Region,
  setRegion: (next: Region) => void
): { meta: ReactNode; layers: ReactNode } {
  const NEXT = encodeURIComponent(path);
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [user, setUser] = useState<UserState | null>(null);
  useFactionTheme(user?.avatar ?? null);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [accountActionMsg, setAccountActionMsg] = useState("");
  const [showRegionConfirm, setShowRegionConfirm] = useState(false);
  const accountPanelRef = useRef<HTMLDivElement | null>(null);
  const accountBtnRef = useRef<HTMLButtonElement | null>(null);
  const profileChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (user && !hasChosenFaction()) setShowStylePicker(true);
  }, [user]);

  useEffect(() => {
    const cfg = window.env;
    if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) return;
    setAuthService(createAuthService({ supabaseUrl: cfg.SUPABASE_URL, supabaseAnonKey: cfg.SUPABASE_ANON_KEY }));
  }, []);

  useEffect(() => {
    if (!authService) return;
    let cancelled = false;
    (async () => {
      const session = await authService.getSession().catch(() => null);
      if (cancelled) return;
      if (!session) {
        // No session: the tool opens as a guest, the same working page a crawler sees.
        enterGuest();
        const guest = buildGuestProfile();
        if (needsRegionChoice(null)) setShowRegionPicker(true);
        const guestRegion: Region = readStoredRegion() || guest.region || "eu";
        setUser({ id: guest.id, email: guest.email, avatar: sanitizeAvatarUrl(guest.avatar || localStorage.getItem("avatar")), region: guestRegion });
        setRegion(guestRegion);
        return;
      }
      exitGuest(); // a real session supersedes a stale guest flag
      const profile = await authService.getUserProfile().catch(() => {
        const sessionUser = session.user;
        if (!sessionUser) return null;
        const meta = (sessionUser.user_metadata || {}) as Record<string, unknown>;
        const regionRaw = String(meta.region || "").toLowerCase();
        return {
          id: sessionUser.id,
          email: sessionUser.email || null,
          emailConfirmed: Boolean(sessionUser.email_confirmed_at),
          avatar: typeof meta.avatar === "string" ? meta.avatar : null,
          region: regionRaw === "eu" || regionRaw === "us" ? (regionRaw as Region) : null
        };
      });
      if (cancelled) return;
      if (!profile?.emailConfirmed) {
        await authService.signOut().catch(() => undefined);
        window.location.href = `/login?next=${NEXT}`;
        return;
      }
      const safeRegion: Region = readStoredRegion() || profile.region || "eu";
      const askRegion = needsRegionChoice(profile.region);
      if (askRegion) setShowRegionPicker(true);
      setUser({ id: profile.id, email: profile.email, avatar: sanitizeAvatarUrl(profile.avatar || localStorage.getItem("avatar")), region: safeRegion });
      setRegion(safeRegion);
      if (!askRegion && safeRegion !== profile.region) {
        await authService.updateUserMetadata({ region: safeRegion }).catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authService, setRegion]);

  useEffect(() => {
    document.body.classList.toggle("panel-open", showAccount);
    return () => document.body.classList.remove("panel-open");
  }, [showAccount]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setShowAccount(false);
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || accountPanelRef.current?.contains(target) || accountBtnRef.current?.contains(target)) return;
      setShowAccount(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, []);

  // The crest is the same on every tool: follow changes made in another tab.
  useEffect(() => {
    const applyAvatar = (raw: string) => {
      const safe = sanitizeAvatarUrl(raw);
      localStorage.setItem("avatar", safe);
      setUser((prev) => (prev ? { ...prev, avatar: safe } : prev));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "avatar" && event.newValue) applyAvatar(event.newValue);
    };
    if ("BroadcastChannel" in window) {
      profileChannelRef.current = new BroadcastChannel("rk-profile-sync");
      profileChannelRef.current.onmessage = (event: MessageEvent<{ type?: string; value?: string }>) => {
        if (event.data?.type === "avatar" && event.data.value) applyAvatar(event.data.value);
      };
    }
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      profileChannelRef.current?.close();
      profileChannelRef.current = null;
    };
  }, []);

  async function onLogout() {
    if (isGuest()) {
      exitGuestToLogin();
      return;
    }
    if (!authService) return;
    await authService.signOut().catch(() => undefined);
    setUser(null);
    setShowAccount(false);
    window.location.href = `/login?next=${NEXT}`;
  }

  async function onResetPassword() {
    if (!authService || !user?.email) return;
    setAccountActionMsg("");
    const { error } = await authService.client.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/login?next=${NEXT}`
    });
    if (error) {
      setAccountActionMsg(error.message || "Password reset failed.");
      return;
    }
    setAccountActionMsg("Email sent");
    window.setTimeout(() => setAccountActionMsg(""), 3000);
  }

  async function onAvatarChange(next: string) {
    if (!authService || !user) return;
    const avatar = sanitizeAvatarUrl(next);
    await authService.updateUserMetadata({ avatar }).catch(() => undefined);
    localStorage.setItem("avatar", avatar);
    profileChannelRef.current?.postMessage({ type: "avatar", value: avatar });
    setUser({ ...user, avatar });
  }

  /** Switches the server here and in every tool, and keeps it on the account. */
  async function onRegionSave(next: Region) {
    setRegion(next);
    setUser((prev) => (prev ? { ...prev, region: next } : prev));
    if (!authService || isGuest()) return;
    await authService.updateUserMetadata({ region: next }).catch(() => undefined);
  }

  const avatar = user?.avatar || assetUrl("picture/accountsymbol.png");

  const meta = (
    <div className="bm-meta">
      <button className="bm-pill" type="button" onClick={() => setShowRegionConfirm(true)}>
        <span className="material-symbols-outlined">language</span>
        Region: <span>{region.toUpperCase()}</span>
      </button>
      <div className="account-wrap">
        <button ref={accountBtnRef} className="account-btn" type="button" onClick={() => setShowAccount(true)} aria-label="Account">
          <img src={avatar} alt="avatar" />
        </button>
      </div>
    </div>
  );

  const layers = (
    <>
      <div className={`modal-overlay ${showRegionConfirm ? "open" : ""}`} aria-hidden={showRegionConfirm ? "false" : "true"}>
        <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="regionConfirmTitle">
          <h3 id="regionConfirmTitle">Switch region?</h3>
          <p>Do you really want to switch the region?</p>
          <div className="modal-actions">
            <button type="button" className="modal-btn ghost" onClick={() => setShowRegionConfirm(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="modal-btn primary"
              onClick={() => {
                setShowRegionConfirm(false);
                void onRegionSave(region === "eu" ? "us" : "eu");
              }}
            >
              Switch
            </button>
          </div>
        </div>
      </div>

      <div ref={accountPanelRef} id="accountPanel" className={`account-panel ${showAccount ? "open" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="account-header">
          <div className="avatar-ring">
            <img id="profileAvatar" className="avatar-big" src={avatar} alt="Avatar" />
            <span className="status-dot" aria-hidden="true"></span>
          </div>
          <div className="user-info">
            {isGuest() ? (
              <GuestSignInLink />
            ) : (
              <>
                <span className="email">{user?.email || "-"}</span>
                <span className="status">Logged in</span>
                <div className="badge-row">
                  <span className="badge-chip">Active</span>
                  <span className="badge-chip muted">Secure</span>
                </div>
              </>
            )}
          </div>
          <button className="close-btn" aria-label="Close" onClick={() => setShowAccount(false)}>X</button>
        </div>

        <div className="panel-section">
          <h4>Select profile avatar</h4>
          <div className="avatar-grid">
            {allowedAvatars.map((src) => (
              <img key={src} src={assetUrl(src.replace(/^\//, ""))} data-avatar={src} alt="" onClick={() => onAvatarChange(src)} />
            ))}
          </div>
        </div>

        <div className="panel-section">
          <h4>Data region</h4>
          <select className="city-select" value={region} onChange={(e) => onRegionSave(e.target.value === "us" ? "us" : "eu")}>
            <option value="us">America</option>
            <option value="eu">Europe</option>
          </select>
        </div>

        <div className="panel-section">
          <h4>Guides</h4>
          <a className="panel-guides-link" href="/guides">
            Albion Online guides
            <span aria-hidden="true"> &rsaquo;</span>
          </a>
        </div>

        <div className="account-actions">
          {!isGuest() && (
            <button className="btn primary" onClick={onResetPassword}>
              {accountActionMsg === "Email sent" ? "Email sent" : "Change password"}
            </button>
          )}
          <button className="btn danger" onClick={onLogout}>{isGuest() ? "Exit guest mode" : "Logout"}</button>
        </div>

        <div className="account-help">
          <span>Need help?</span>
          <a href="https://discord.gg/HF2Ctg73m5" target="_blank" rel="noopener noreferrer">Join Discord</a>
          <a href="mailto:blackmarketreader@gmail.com">blackmarketreader@gmail.com</a>
        </div>
      </div>

      {showRegionPicker ? (
        <RegionPicker
          onPick={(next) => {
            setShowRegionPicker(false);
            void onRegionSave(next);
          }}
        />
      ) : null}
      {showStylePicker && !showRegionPicker ? (
        <StylePicker
          onPick={(faction) => {
            markFactionChosen();
            setShowStylePicker(false);
            void onAvatarChange(faction.crest);
          }}
          onSkip={() => {
            markFactionChosen();
            setShowStylePicker(false);
          }}
        />
      ) : null}
      <CommunityTile />
      {guide ? <ToolGuideLink slug={guide} authService={authService} /> : null}
    </>
  );

  return { meta, layers };
}
