import { useEffect, useMemo, useState } from "react";
import { assetUrl, createAuthService } from "@shared/index";
import type { AuthService } from "@shared/index";
import "./login.css";

type AuthMode = "login" | "register";

const ALLOWED_NEXT_PATHS = new Set([
  "/",
  "/dashboard",
  "/bm-crafter",
  "/crafting-calculator",
  "/refining-calculator",
  "/food-potion-crafter",
  "/community",
  "/legal"
]);

function getSafeNextPath(value: string | null): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.includes("://")) return null;
  if (trimmed === "/login") return null;

  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (!ALLOWED_NEXT_PATHS.has(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function navigateToInternalPath(path: string) {
  const safePath = getSafeNextPath(path) || "/dashboard";
  window.history.replaceState({}, "", safePath);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function LoginPage() {
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authError, setAuthError] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return getSafeNextPath(params.get("next")) || "/dashboard";
  }, []);

  useEffect(() => {
    document.body.classList.add("login-body");
    document.body.classList.remove("dashboard-body", "landing-body", "bm-crafter", "panel-open");
    return () => {
      document.body.classList.remove("login-body");
    };
  }, []);

  useEffect(() => {
    const cfg = window.env;
    if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) {
      setCheckingSession(false);
      return;
    }
    setAuthService(createAuthService({ supabaseUrl: cfg.SUPABASE_URL, supabaseAnonKey: cfg.SUPABASE_ANON_KEY }));
  }, []);

  useEffect(() => {
    if (!authService) return;
    let cancelled = false;
    (async () => {
      const session = await authService.getSession().catch(() => null);
      if (cancelled) return;
      if (!session) {
        setCheckingSession(false);
        return;
      }
      const profile = await authService.getUserProfile().catch(() => {
        const user = session.user;
        if (!user) return null;
        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        const regionRaw = String(meta.region || "").toLowerCase();
        const region = regionRaw === "eu" || regionRaw === "us" ? regionRaw : null;
        return {
          id: user.id,
          email: user.email || null,
          emailConfirmed: Boolean(user.email_confirmed_at),
          avatar: typeof meta.avatar === "string" ? meta.avatar : null,
          region
        };
      });
      if (cancelled) return;
      if (!profile?.emailConfirmed) {
        await authService.signOut().catch(() => undefined);
        setCheckingSession(false);
        return;
      }
      navigateToInternalPath(nextPath);
    })();
    return () => {
      cancelled = true;
    };
  }, [authService, nextPath]);

  async function onLogin() {
    if (!authService) return;

    // Client-seitiger Brute-Force-Schutz (Defense in Depth, ergaenzt die
    // serverseitigen Supabase-Rate-Limits): nach mehreren Fehlversuchen
    // eine kurze Abkuehlphase erzwingen.
    const now = Date.now();
    if (cooldownUntil > now) {
      const waitSec = Math.ceil((cooldownUntil - now) / 1000);
      setAuthError(`Zu viele Login-Versuche. Bitte ${waitSec}s warten.`);
      return;
    }

    setAuthError("");
    try {
      await authService.signInWithPassword(authEmail.trim(), authPassword.trim());
      setLoginAttempts(0);

      let sessionReady = false;
      for (let i = 0; i < 34; i += 1) {
        const session = await authService.getSession().catch(() => null);
        if (session) {
          sessionReady = true;
          break;
        }
        await sleep(150);
      }
      if (!sessionReady) {
        setAuthError("Login erkannt, Session braucht noch einen Moment. Bitte erneut versuchen.");
        return;
      }

      const profile = await authService.getUserProfile();
      if (!profile?.emailConfirmed) {
        await authService.signOut().catch(() => undefined);
        setAuthError("Bitte bestatige zuerst deine E-Mail.");
        return;
      }

      if (sessionStorage.getItem("postRegisterReload") === "1") {
        sessionStorage.removeItem("postRegisterReload");
      }
      navigateToInternalPath(nextPath);
    } catch (error: any) {
      setLoginAttempts((n) => {
        const next = n + 1;
        if (next >= 5) {
          // 5 Fehlversuche -> 30s Cooldown
          setCooldownUntil(Date.now() + 30000);
          return 0;
        }
        return next;
      });
      setAuthError(error?.message || "Login failed");
    }
  }

  async function onRegister() {
    if (!authService) return;
    setAuthError("");
    const displayName = regName.trim();
    const email = regEmail.trim();
    const password = regPassword.trim();

    if (!displayName || !email || !password) {
      setAuthError("Bitte Display Name, E-Mail und Passwort ausfullen.");
      return;
    }

    try {
      const client = authService.client;
      try {
        const { data: existingName } = await client
          .from("profiles")
          .select("id")
          .eq("display_name", displayName)
          .limit(1);
        if (existingName && existingName.length > 0) {
          setAuthError("Display Name ist bereits vergeben.");
          return;
        }
      } catch {
        // table might not exist
      }

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } }
      });
      if (error) {
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
          setAuthError("Account existiert bereits. Bitte einloggen.");
          return;
        }
        if ((error as { status?: number }).status === 429) {
          setAuthError("Zu viele Versuche. Bitte kurz warten und erneut versuchen.");
          return;
        }
        throw error;
      }

      const userId = data?.user?.id;
      if (userId && displayName) {
        try {
          await client.from("profiles").upsert({ id: userId, display_name: displayName });
        } catch {
          // ignore
        }
      }

      sessionStorage.setItem("postRegisterReload", "1");
      setShowConfirmModal(true);
      await authService.signOut().catch(() => undefined);
      setAuthMode("login");
      setAuthError("");
    } catch (error: any) {
      setAuthError(error?.message || "Registration failed");
    }
  }

  async function onGoogle() {
    if (!authService) return;
    const nextParam = encodeURIComponent(nextPath);
    await authService.client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login?next=${nextParam}` }
    });
  }

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="auth-modal">
        <div className="auth-card">
          <div className="auth-header">
            <img src={assetUrl("picture/testo ohne background.png")} className="auth-logo" alt="Logo" />
            <h2>RomulusKings Market Reader</h2>
            <p>Black Market Profit Tool</p>
          </div>
          {checkingSession ? <div className="auth-hint">Checking session...</div> : null}
          <div className="auth-tabs">
            <button className={`tab ${authMode === "login" ? "active" : ""}`} onClick={() => setAuthMode("login")}>Login</button>
            <button className={`tab ${authMode === "register" ? "active" : ""}`} onClick={() => setAuthMode("register")}>Register</button>
          </div>
          {authMode === "login" ? (
            <>
              <input placeholder="Email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onLogin(); } }} />
              <input placeholder="Password" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onLogin(); } }} />
              <div className="auth-actions">
                <button className="cta" onClick={onLogin}>Login</button>
                <button className="ghost btn-google" onClick={onGoogle}>
                  <img src={assetUrl("picture/Googleicon.png")} alt="Google Login" />
                </button>
              </div>
              <p className="auth-hint">Please confirm your email before logging in.</p>
            </>
          ) : (
            <>
              <input placeholder="Display Name" value={regName} onChange={(e) => setRegName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onRegister(); } }} />
              <input placeholder="Email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onRegister(); } }} />
              <input placeholder="Password" type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onRegister(); } }} />
              <div className="auth-actions">
                <button className="cta" onClick={onRegister}>Register</button>
              </div>
              <p className="auth-hint">You will receive a confirmation email after registration.</p>
            </>
          )}
          <div className="auth-error">{authError || ""}</div>
          <div className="auth-footer">
            <a href="https://discord.gg/HF2Ctg73m5" target="_blank" rel="noreferrer">Need help? Join Discord</a>
          </div>
          <div className="auth-trust">Powered by Supabase Secure Authentication</div>
        </div>
      </div>

      {showConfirmModal ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Check your email</h3>
            <p>We sent you a confirmation email. Please verify it before logging in.</p>
            <button className="cta" onClick={() => setShowConfirmModal(false)}>OK</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
