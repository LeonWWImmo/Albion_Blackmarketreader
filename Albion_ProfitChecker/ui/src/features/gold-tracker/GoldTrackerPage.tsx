import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { assetUrl } from "@shared/assets/assets";
import { createAuthService, type AuthService } from "@shared/auth/authService";
import { isGuest, buildGuestProfile, enterGuest, exitGuest } from "@shared/auth/guestMode";
import { RegionService } from "@shared/region/regionService";
import { formatUpdated } from "@shared/time/lastUpdated";
import { LastUpdatedBadge } from "@shared/time/LastUpdatedBadge";
import { useSeo } from "../../shared/seo/useSeo";
import { SeoHeading } from "../../shared/seo/SeoHeading";
import {
  CommunityTile,
  GuestSignInLink,
  MobileNavBurger,
  RegionPicker,
  StylePicker,
  exitGuestToLogin,
  hasChosenFaction,
  markFactionChosen,
  needsRegionChoice,
  useFactionTheme,
  useMediaQuery,
  useSessionState,
  PHONE_QUERY
} from "../../shared";
import "../bm-crafter/ui/bmCrafter.css";
import "./goldTracker.css";
import { GoldChart } from "./GoldChart";
import { BuySignal, Converter, Fold, KeyNumbers, ProfileChart, RegionCompare, changeTone } from "./GoldPanels";
import { formatSignedPct, formatSignedSilver, formatSilver } from "./format";
import {
  DAY,
  RANGE_SECONDS,
  changeOver,
  deviationProfile,
  pointsInRange,
  pricePosition,
  rangeStats,
  type GoldRange
} from "./goldStats";
import { useGoldHistory, type GoldRegion } from "./useGoldHistory";

const RANGES: ReadonlyArray<{ key: GoldRange; label: string }> = [
  { key: "24h", label: "24H" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" }
];

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);
// Monday first, as Albion's weekly events run Monday to Monday.
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const REFRESH_MS = 10 * 60 * 1000;

type UserState = {
  id: string;
  email: string | null;
  avatar: string;
  region: GoldRegion | null;
};

const allowedAvatars = [
  "/picture/accountsymbol.png",
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

function readStoredRegion(): GoldRegion | null {
  const stored = (localStorage.getItem("region") || "").toLowerCase();
  return stored === "us" || stored === "eu" ? stored : null;
}

function useRegion(): [GoldRegion, (next: GoldRegion) => void] {
  const [service] = useState(() => new RegionService("eu"));
  const [region, setRegion] = useState<GoldRegion>(service.getRegion());
  useEffect(() => {
    const off = service.subscribe((next) => setRegion(next));
    return () => {
      off();
      service.destroy();
    };
  }, [service]);
  const setNext = useCallback((next: GoldRegion) => service.setRegion(next), [service]);
  return [region, setNext];
}

function ChangeBadge({ label, change }: { label: string; change: ReturnType<typeof changeOver> }) {
  if (!change) return <span className="gt-change is-flat">{label} --</span>;
  const tone = change.abs > 0 ? "is-up" : change.abs < 0 ? "is-down" : "is-flat";
  return (
    <span className={`gt-change ${tone}`}>
      <span aria-hidden="true">{change.abs > 0 ? "▲" : change.abs < 0 ? "▼" : "●"}</span>
      {formatSignedPct(change.pct)} <small>({formatSignedSilver(change.abs)})</small> <em>{label}</em>
    </span>
  );
}

export function GoldTrackerPage() {
  const [region, setRegion] = useRegion();
  const [refreshKey, setRefreshKey] = useState(0);
  const history = useGoldHistory(region, refreshKey);
  const other = useGoldHistory(region === "eu" ? "us" : "eu", refreshKey);
  const [range, setRange] = useSessionState<GoldRange>("gold:range", "7d");
  const isPhone = useMediaQuery(PHONE_QUERY);

  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [user, setUser] = useState<UserState | null>(null);
  // Faction colours follow the account crest; the picker only asks once.
  useFactionTheme(user?.avatar ?? null);
  const [showStylePicker, setShowStylePicker] = useState(false);
  // First visit on this tool (not only via the dashboard): ask which server's prices to load.
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  useEffect(() => {
    if (user && !hasChosenFaction()) setShowStylePicker(true);
  }, [user]);
  const [showAccount, setShowAccount] = useState(false);
  const [accountActionMsg, setAccountActionMsg] = useState("");
  const [showRegionConfirm, setShowRegionConfirm] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<GoldRegion | null>(null);
  const accountPanelRef = useRef<HTMLDivElement | null>(null);
  const accountBtnRef = useRef<HTMLButtonElement | null>(null);
  const profileChannelRef = useRef<BroadcastChannel | null>(null);

  useSeo({
    title: "Albion Online Gold Price Tracker | Blackmarket Reader",
    description:
      "Live Albion Online gold price for Europe and America: silver per gold, 24h and 7-day change, 90-day chart, the cheapest hours to buy gold and a gold to silver converter.",
    keywords:
      "Albion Online gold price, Albion gold tracker, Albion gold to silver, Albion Online gold chart, Albion gold price history",
    canonical: "https://blackmarketreader.com/gold-tracker",
    ogTitle: "Albion Online Gold Price Tracker | Blackmarket Reader",
    ogDescription: "Live Albion Online gold price with chart, buy signal, best time to buy and a gold to silver converter.",
    ogUrl: "https://blackmarketreader.com/gold-tracker",
    ogImage: "https://blackmarketreader.com/picture/bm-crafter-table.png",
    twitterTitle: "Albion Online Gold Price Tracker | Blackmarket Reader",
    twitterDescription: "Live Albion Online gold price with chart, buy signal, best time to buy and a gold to silver converter.",
    twitterImage: "https://blackmarketreader.com/picture/bm-crafter-table.png",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Gold Tracker",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://blackmarketreader.com/gold-tracker",
      description: "Albion Online gold price tracker with history chart, buy signal and gold to silver converter.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }
    }
  });

  useEffect(() => {
    document.body.classList.add("gold-tracker-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter");
    return () => document.body.classList.remove("gold-tracker-body");
  }, []);

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
        // No session: open the tool as a guest instead of redirecting to /login, so a
        // first-time visitor sees the same working page a crawler does.
        enterGuest();
        const guest = buildGuestProfile();
        if (needsRegionChoice(null)) setShowRegionPicker(true);
        const guestRegion: GoldRegion = readStoredRegion() || guest.region || "eu";
        setUser({
          id: guest.id,
          email: guest.email,
          avatar: sanitizeAvatarUrl(guest.avatar || localStorage.getItem("avatar")),
          region: guestRegion
        });
        setRegion(guestRegion);
        return;
      }
      exitGuest(); // real session supersedes any stale guest flag (prevents guest UI while logged in)
      const profile = await authService.getUserProfile().catch(() => {
        const sessionUser = session.user;
        if (!sessionUser) return null;
        const meta = (sessionUser.user_metadata || {}) as Record<string, unknown>;
        const regionRaw = String(meta.region || "").toLowerCase();
        const region = regionRaw === "eu" || regionRaw === "us" ? (regionRaw as GoldRegion) : null;
        return {
          id: sessionUser.id,
          email: sessionUser.email || null,
          emailConfirmed: Boolean(sessionUser.email_confirmed_at),
          avatar: typeof meta.avatar === "string" ? meta.avatar : null,
          region
        };
      });
      if (cancelled) return;
      if (!profile?.emailConfirmed) {
        await authService.signOut().catch(() => undefined);
        window.location.href = "/login?next=%2Fgold-tracker";
        return;
      }
      const safeRegion: GoldRegion = readStoredRegion() || profile.region || "eu";
      const askRegion = needsRegionChoice(profile.region);
      if (askRegion) setShowRegionPicker(true);
      setUser({
        id: profile.id,
        email: profile.email,
        avatar: sanitizeAvatarUrl(profile.avatar || localStorage.getItem("avatar")),
        region: safeRegion
      });
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
    if (showAccount) document.body.classList.add("panel-open");
    else document.body.classList.remove("panel-open");
    return () => {
      document.body.classList.remove("panel-open");
    };
  }, [showAccount]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAccount(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!showAccount) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (accountPanelRef.current?.contains(target)) return;
      if (accountBtnRef.current?.contains(target)) return;
      setShowAccount(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [showAccount]);

  // The crest is the same on every tool: follow changes made in another tab.
  useEffect(() => {
    const applyAvatar = (raw: string) => {
      const safe = sanitizeAvatarUrl(raw);
      localStorage.setItem("avatar", safe);
      setUser((prev) => (prev ? { ...prev, avatar: safe } : prev));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "avatar" || !event.newValue) return;
      applyAvatar(event.newValue);
    };
    if ("BroadcastChannel" in window) {
      profileChannelRef.current = new BroadcastChannel("rk-profile-sync");
      profileChannelRef.current.onmessage = (event: MessageEvent<{ type?: string; value?: string }>) => {
        if (event.data?.type !== "avatar" || !event.data.value) return;
        applyAvatar(event.data.value);
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
    window.location.href = "/login?next=%2Fgold-tracker";
  }

  async function onResetPassword() {
    if (!authService || !user?.email) return;
    setAccountActionMsg("");
    const { error: resetError } = await authService.client.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/login?next=%2Fgold-tracker`
    });
    if (resetError) {
      setAccountActionMsg(resetError.message || "Password reset failed.");
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
  async function onRegionSave(next: GoldRegion) {
    setRegion(next);
    setUser((prev) => (prev ? { ...prev, region: next } : prev));
    if (!authService || isGuest()) return;
    await authService.updateUserMetadata({ region: next }).catch(() => undefined);
  }

  // The header pill asks first, like on the other tools; the Europe / America switch on the
  // page itself is a view control and switches straight away.
  function requestRegionToggle() {
    if (showRegionConfirm) return;
    setPendingRegion(region === "eu" ? "us" : "eu");
    setShowRegionConfirm(true);
  }

  async function confirmRegionSwitch() {
    setShowRegionConfirm(false);
    const next = pendingRegion ?? (region === "eu" ? "us" : "eu");
    setPendingRegion(null);
    await onRegionSave(next);
  }

  // The price updates hourly; reload now and then so a page left open stays current.
  useEffect(() => {
    const timer = window.setInterval(() => setRefreshKey((key) => key + 1), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const points = history.data?.points ?? [];
  const latest = points.length ? points[points.length - 1] : null;
  const price = latest ? latest[1] : null;
  const otherPoints = other.data?.points ?? [];
  const otherLatest = otherPoints.length ? otherPoints[otherPoints.length - 1][1] : null;
  const otherDay = useMemo(() => changeOver(otherPoints, DAY), [otherPoints]);

  const view = useMemo(() => {
    if (!points.length || price === null) return null;
    const month = pointsInRange(points, 30 * DAY);
    const monthStats = rangeStats(month);
    const hourly = deviationProfile(month, 24, (time) => new Date(time * 1000).getHours(), DAY);
    const weekly = deviationProfile(points, 7, (time) => (new Date(time * 1000).getDay() + 6) % 7, 7 * DAY);
    return {
      dayStats: rangeStats(pointsInRange(points, DAY)),
      weekStats: rangeStats(pointsInRange(points, 7 * DAY)),
      day: changeOver(points, DAY),
      week: changeOver(points, 7 * DAY),
      month: changeOver(points, 30 * DAY),
      monthStats,
      position: pricePosition(month, price),
      hourly,
      weekly
    };
  }, [points, price]);

  const rangePoints = useMemo(() => pointsInRange(points, RANGE_SECONDS[range]), [points, range]);
  const rangeInfo = useMemo(() => {
    const stats = rangeStats(rangePoints);
    const change = changeOver(points, RANGE_SECONDS[range]);
    return stats ? { stats, change } : null;
  }, [rangePoints, points, range]);

  const stamp = formatUpdated(latest ? new Date(latest[0] * 1000).toISOString() : null);
  const regionName = region === "eu" ? "Europe" : "America";
  const timeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "your time";
    } catch {
      return "your time";
    }
  }, []);

  return (
    <>
      <SeoHeading title="Albion Online Gold Price Tracker">
        Live Albion Online gold price for the Europe and America servers: silver per gold, 24-hour and 7-day change, a
        90-day price chart, the cheapest hours and weekdays to buy gold, and a gold to silver converter.
      </SeoHeading>

      <header className="bm-header">
        <MobileNavBurger accent="var(--fx-accent)" />
        <div className="bm-header-row">
          <div className="bm-brand">
            <div className="bm-brand-home">
              <div className="bm-logo" aria-hidden="true">
                <img src={assetUrl("picture/testo ohne background.png")} alt="" />
              </div>
              <h1>RomulusKings Crafting Tools</h1>
            </div>
            <div className="bm-nav bm-nav-switch">
              <Link className="nav-tab" to="/">Home</Link>
              <Link className="nav-tab" to="/dashboard">Dashboard</Link>
              <Link className="nav-tab" to="/bm-crafter">Blackmarket Crafter</Link>
              <Link className="nav-tab" to="/crafting-calculator">Crafting Calculator</Link>
              <Link className="nav-tab" to="/refining-calculator">Refining Calculator</Link>
              <Link className="nav-tab" to="/food-potion-crafter">Food &amp; Potion Crafter</Link>
              <span className="nav-tab active">Gold Tracker</span>
            </div>
          </div>
          <div className="bm-meta">
            <button className="bm-pill" type="button" onClick={requestRegionToggle}>
              <span className="material-symbols-outlined">language</span>
              Region: <span>{region.toUpperCase()}</span>
            </button>
            <LastUpdatedBadge stamp={stamp} emptyLabel="Loading prices" />
            <div className="account-wrap">
              <button ref={accountBtnRef} className="account-btn" type="button" onClick={() => setShowAccount(true)} aria-label="Account">
                <img src={user?.avatar || assetUrl("picture/accountsymbol.png")} alt="avatar" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className={`modal-overlay ${showRegionConfirm ? "open" : ""}`} aria-hidden={showRegionConfirm ? "false" : "true"}>
        <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="regionConfirmTitle">
          <h3 id="regionConfirmTitle">Switch region?</h3>
          <p>Do you really want to switch the region?</p>
          <div className="modal-actions">
            <button type="button" className="modal-btn ghost" onClick={() => { setShowRegionConfirm(false); setPendingRegion(null); }}>
              Cancel
            </button>
            <button type="button" className="modal-btn primary" onClick={confirmRegionSwitch}>
              Switch
            </button>
          </div>
        </div>
      </div>

      <div
        ref={accountPanelRef}
        id="accountPanel"
        className={`account-panel ${showAccount ? "open" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="account-header">
          <div className="avatar-ring">
            <img id="profileAvatar" className="avatar-big" src={user?.avatar || assetUrl("picture/accountsymbol.png")} alt="Avatar" />
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
            {allowedAvatars.filter((src) => !src.includes("accountsymbol")).map((src) => (
              <img
                key={src}
                src={assetUrl(src.replace(/^\//, ""))}
                data-avatar={src}
                alt=""
                onClick={() => onAvatarChange(src)}
              />
            ))}
          </div>
        </div>

        <div className="panel-section">
          <h4>Data region</h4>
          <select
            className="city-select"
            value={region}
            onChange={(e) => onRegionSave(e.target.value === "us" ? "us" : "eu")}
          >
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

      <main className="gt-page">
        <section className="gt-stage" aria-label="Gold price">
          <div className="gt-stage-top">
            <div className="gt-quote">
              <span className="gt-kicker">
                <span className="gt-coin" aria-hidden="true" />
                Gold &middot; {regionName}
              </span>
              {history.status === "error" && !price ? (
                <div className="gt-empty">
                  <p>The gold price could not be loaded right now.</p>
                  <button type="button" className="gt-chip" onClick={() => setRefreshKey((key) => key + 1)}>
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  <div className="gt-price-row" aria-live="polite">
                    <strong className={`gt-price ${price === null ? "is-loading" : ""}`}>{price === null ? "\u2014" : formatSilver(price)}</strong>
                    <span className="gt-price-unit">silver / gold</span>
                  </div>
                  <div className="gt-change-row">
                    <ChangeBadge label="24h" change={view?.day ?? null} />
                    <span className="gt-asof">
                      {latest ? `${stamp.time} \u00b7 ${stamp.relative || "just now"}` : "Loading the latest price\u2026"}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="gt-controls">
              <div className="gt-segment gt-servers" role="radiogroup" aria-label="Server">
                {(["eu", "us"] as const).map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={region === r} className={region === r ? "active" : ""} onClick={() => void onRegionSave(r)}>
                    {r === "eu" ? "Europe" : "America"}
                  </button>
                ))}
              </div>
              <div className="gt-segment gt-ranges" role="radiogroup" aria-label="Chart range">
                {RANGES.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={range === option.key}
                    className={range === option.key ? "active" : ""}
                    onClick={() => setRange(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {rangePoints.length > 1 ? (
            <GoldChart points={rangePoints} range={range} height={isPhone ? 240 : 340} />
          ) : (
            <div className="gt-chart-empty" style={{ height: isPhone ? 240 : 340 }}>
              {history.status === "loading" ? <span className="gt-spinner" aria-label="Loading" /> : <p className="gt-muted">No price history for this range.</p>}
            </div>
          )}

          {rangeInfo ? (
            <dl className="gt-ticker">
              <div>
                <dt>Low</dt>
                <dd className="gt-low">{formatSilver(rangeInfo.stats.low)}</dd>
              </div>
              <div>
                <dt>High</dt>
                <dd className="gt-high">{formatSilver(rangeInfo.stats.high)}</dd>
              </div>
              <div>
                <dt>Average</dt>
                <dd>{formatSilver(rangeInfo.stats.avg)}</dd>
              </div>
              <div>
                <dt>{RANGES.find((option) => option.key === range)?.label} change</dt>
                <dd className={rangeInfo.change ? (rangeInfo.change.abs > 0 ? "gt-up" : rangeInfo.change.abs < 0 ? "gt-down" : "") : ""}>
                  {rangeInfo.change ? formatSignedPct(rangeInfo.change.pct) : "--"}
                </dd>
              </div>
            </dl>
          ) : null}
        </section>

        <div className="gt-duo">
          <BuySignal position={view?.position ?? null} low={view?.monthStats?.low ?? null} high={view?.monthStats?.high ?? null} price={price} />
          {price !== null ? <Converter price={price} /> : <section className="gt-panel gt-converter gt-placeholder" aria-hidden="true" />}
        </div>

        <Fold
          className="gt-fold-details"
          title="Market details"
          hint="Key numbers, the best hour and weekday to buy, Europe vs America"
          icon={
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        >
          <KeyNumbers
            items={[
              { label: "24h low", value: formatSilver(view?.dayStats?.low), tone: "low" },
              { label: "24h high", value: formatSilver(view?.dayStats?.high), tone: "high" },
              { label: "7-day average", value: formatSilver(view?.weekStats?.avg) },
              { label: "7-day change", value: view?.week ? formatSignedPct(view.week.pct) : "--", tone: changeTone(view?.week) },
              { label: "30-day low", value: formatSilver(view?.monthStats?.low), tone: "low" },
              { label: "30-day high", value: formatSilver(view?.monthStats?.high), tone: "high" },
              { label: "30-day average", value: formatSilver(view?.monthStats?.avg) },
              { label: "30-day change", value: view?.month ? formatSignedPct(view.month.pct) : "--", tone: changeTone(view?.month) }
            ]}
          />
          <div className="gt-fold-grid">
            <ProfileChart
              title="Best time of day to buy"
              profile={view?.hourly ?? null}
              labels={HOUR_LABELS}
              showLabel={(hour) => hour % (isPhone ? 6 : 3) === 0}
              cheapestText={(label) => `Cheapest around ${label}`}
              footnote={`Gap to the day's average per hour, last 30 days, ${timeZone} time.`}
            />
            <ProfileChart
              title="Best day of the week to buy"
              profile={view?.weekly ?? null}
              labels={WEEKDAY_LABELS}
              showLabel={() => true}
              cheapestText={(label) => `Cheapest on ${label}`}
              footnote="Gap to the week's average per weekday, last 90 days. A pattern, not a promise."
            />
          </div>
          {price !== null ? (
            <RegionCompare
              region={region}
              price={price}
              otherPrice={otherLatest}
              dayChange={view?.day ?? null}
              otherDayChange={otherDay}
              onSwitch={() => void onRegionSave(region === "eu" ? "us" : "eu")}
            />
          ) : null}
        </Fold>

        <Fold
          className="gt-fold-about"
          title="About the Albion Online gold price"
          hint="What moves it, when to buy, how the converter works"
          icon={
            <svg viewBox="0 0 24 24" width="18" height="18">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M12 11v6M12 7.5v.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          }
        >
          <div className="gt-about">
            <p>
              Gold is Albion Online&rsquo;s premium currency. Players buy and sell it for silver on the in-game gold market, so
              its price moves with supply and demand on each server. This tracker records that exchange rate hourly for the
              Europe and America servers and keeps 90 days of history.
            </p>
            <dl className="gt-faq">
              <dt>When is the best time to buy gold?</dt>
              <dd>
                When the price sits low in its 30-day range: &ldquo;Buy or wait?&rdquo; shows where today&rsquo;s price falls.
                Under Market details, the hour and weekday charts show when gold has been cheapest compared with the prices
                around it; the differences are small, so they matter most for large amounts.
              </dd>
              <dt>Why are Europe and America different?</dt>
              <dd>Each server has its own players and its own economy, so the two gold markets set their own prices.</dd>
              <dt>How do I convert silver to gold?</dt>
              <dd>
                Type an amount into either field of Exchange. It uses the latest hourly price of the server you picked, so the
                in-game offer can be slightly different.
              </dd>
            </dl>
          </div>
        </Fold>
      </main>

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
    </>
  );
}
