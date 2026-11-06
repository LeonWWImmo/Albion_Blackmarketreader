import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { assetUrl } from "@shared/assets/assets";
import { RegionService } from "@shared/region/regionService";
import { useSeo } from "../../shared/seo/useSeo";
import { SeoHeading } from "../../shared/seo/SeoHeading";
import { MobileNavBurger, useSessionState } from "../../shared";
import "../bm-crafter/ui/bmCrafter.css";
import "./lootSplit.css";
import { groupTrips, mergeLogs, netStacks, parseLootLog, type LogEntry } from "./core/lootLog";
import { decodeSplit, encodeSplit } from "./core/share";
import { EXAMPLE_LOG } from "./core/example";
import { inRange, tripRange, type Range } from "./core/timeline";
import {
  MARKETS,
  ROUTE_LABEL,
  bestSale,
  itemId,
  parseSilver,
  payouts,
  shortSilver,
  type Market,
  type PriceTable,
  type Route,
  type SellMode
} from "./core/valuation";
import { RunPicker, rangeLabel } from "./RunPicker";
import { CopyGuide } from "./CopyGuide";
import { useToolAccount } from "./useToolAccount";

type Region = "eu" | "us";
type Player = { name: string; share: number; repair: number; added?: boolean };

const QUALITY = ["", "Normal", "Good", "Outstanding", "Excellent", "Masterpiece"];
const ROUTES: Route[] = ["bm", "buy", "sell"];
const SHOWN_TILES = 24;
const PRICE_CHUNK = 300;
const PLAYER_COLORS = ["#f5c451", "#7dd3fc", "#a78bfa", "#4ade80", "#fb7185", "#fdba74", "#5eead4", "#f0abfc"];

const fmt = (n: number) => Math.round(n).toLocaleString("de-DE");
const timedTrips = (entries: LogEntry[]) => groupTrips(entries).filter((t) => Number.isFinite(t.start));

function useRegion(): [Region, (next: Region) => void] {
  const [service] = useState(() => new RegionService("eu"));
  const [region, setRegion] = useState<Region>(service.getRegion());
  useEffect(() => {
    const off = service.subscribe((next) => setRegion(next));
    return () => {
      off();
      service.destroy();
    };
  }, [service]);
  return [region, useCallback((next: Region) => service.setRegion(next), [service])];
}

/** Counts up to the target once it changes; reduced motion jumps straight there. */
function useCountUp(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      const value = begin + (target - begin) * (1 - (1 - p) ** 3);
      from.current = value;
      setShown(value);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

let namesCache: Promise<Record<string, string>> | null = null;
const loadNames = () =>
  (namesCache ??= fetch(assetUrl("data/item-names-en.json")).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }).catch((error) => {
    namesCache = null;
    throw error;
  }));

async function loadPrices(region: Region, ids: string[]): Promise<PriceTable> {
  const table: PriceTable = {};
  for (let i = 0; i < ids.length; i += PRICE_CHUNK) {
    const res = await fetch(`/api/aodp/prices?region=${region}&ids=${encodeURIComponent(ids.slice(i, i + PRICE_CHUNK).join(","))}`);
    if (!res.ok) throw new Error(String(res.status));
    Object.assign(table, (await res.json()).prices);
  }
  return table;
}

/** Repairs typed the way players say them: 50k, 1.2m or 75000. */
function SilverInput({ value, label, onChange }: { value: number; label: string; onChange: (silver: number) => void }) {
  const [text, setText] = useState(value ? shortSilver(value) : "");
  return (
    <input
      value={text}
      inputMode="decimal"
      placeholder="0"
      aria-label={label}
      maxLength={12}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseSilver(e.target.value));
      }}
    />
  );
}

export function LootSplitPage() {
  useSeo({
    title: "Albion Online Loot Split Calculator | Blackmarket Reader",
    description:
      "Paste your Albion Online guild chest log and get the loot's value at live Black Market and market prices, the best way to sell each item and a fair split per player, ready for Discord.",
    keywords: "Albion Online loot split, Albion loot split calculator, Albion chest log, Albion guild loot, Albion Black Market prices",
    canonical: "https://blackmarketreader.com/loot-split",
    ogTitle: "Albion Online Loot Split Calculator | Blackmarket Reader",
    ogDescription: "Chest log in, silver out: live loot value, the best way to sell and each player's cut.",
    ogUrl: "https://blackmarketreader.com/loot-split",
    ogImage: "https://blackmarketreader.com/picture/loot-split-preview.png",
    twitterTitle: "Albion Online Loot Split Calculator | Blackmarket Reader",
    twitterDescription: "Chest log in, silver out: live loot value, the best way to sell and each player's cut.",
    twitterImage: "https://blackmarketreader.com/picture/loot-split-preview.png",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Loot Split",
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      url: "https://blackmarketreader.com/loot-split",
      description: "Albion Online loot split calculator: guild chest log in, loot value at live market prices and each player's cut out.",
      image: "https://blackmarketreader.com/picture/loot-split-preview.png",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }
    }
  });

  useEffect(() => {
    document.body.classList.add("loot-split-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter");
    return () => document.body.classList.remove("loot-split-body");
  }, []);

  const [region, setRegion] = useRegion();
  const { meta, layers } = useToolAccount(region, setRegion);
  const [premium, setPremium] = useSessionState<boolean>("ls:premium", true);
  const [mode, setMode] = useSessionState<SellMode>("ls:mode", "fast");
  const [market, setMarket] = useSessionState<Market>("ls:market", "best");
  const [guildPct, setGuildPct] = useSessionState<number>("ls:guild", 0);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [range, setRange] = useState<Range | null>(null);
  const [picking, setPicking] = useState(false);
  const [guide, setGuide] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [names, setNames] = useState<Record<string, string> | null>(null);
  // prices remember their server, so a switch shows "Pricing…" instead of the other server's numbers
  const [priced, setPriced] = useState<{ region: Region; table: PriceTable } | null>(null);
  const prices = priced?.region === region ? priced.table : null;
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [showAll, setShowAll] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState("");
  const [newPlayer, setNewPlayer] = useState("");
  const [retry, setRetry] = useState(0);
  const addFile = useRef<HTMLInputElement>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const rangeRef = useRef(range);
  rangeRef.current = range;
  // typed shares and repairs by name, and who was removed, so moving the range brings back neither
  // a removed player nor a player without their numbers
  const remembered = useRef(new Map<string, { share: number; repair: number }>());
  const removed = useRef(new Set<string>());
  const forgetPlayers = () => {
    remembered.current.clear();
    removed.current.clear();
  };

  const flash = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2200);
  };

  // a fresh log asks which part counts, starting with the newest trip; once a split is open,
  // another log is counted on top (rows it already has are skipped)
  const openLog = useCallback((text: string) => {
    const parsed = parseLootLog(text);
    if (!parsed.length) {
      flash("That is not a chest log");
      return;
    }
    const current = entriesRef.current;
    // a shared split has no times to match rows against, so a pasted log replaces it
    const shared = current.length > 0 && current.every((e) => !Number.isFinite(e.time));
    if (current.length && !shared) {
      const { entries: merged, added } = mergeLogs(current, parsed);
      if (!added.length) {
        flash("Already in the split");
        return;
      }
      const newest = timedTrips(added).pop();
      const before = rangeRef.current;
      if (newest) {
        const run = tripRange(newest);
        setRange(before ? { from: Math.min(before.from, run.from), to: Math.max(before.to, run.to) } : run);
        setPicking(true);
      }
      setEntries(merged);
      flash(`Added ${added.length} ${added.length === 1 ? "row" : "rows"}`);
      return;
    }
    const trips = timedTrips(parsed);
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    forgetPlayers();
    setEntries(parsed);
    setRange(trips.length ? tripRange(trips[trips.length - 1]) : null);
    setPicking(trips.length > 0);
    setGuide(false);
    setPlayers([]);
    setShowAll(false);
  }, []);

  /** The add button: the clipboard if the browser lets us read it, the file picker otherwise. */
  const addFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (parseLootLog(text).length) openLog(text);
      else flash("Copy the chest log first, then click again");
    } catch {
      addFile.current?.click();
    }
  };

  // a share link opens the split it carries
  useEffect(() => {
    const code = window.location.hash.match(/^#s=([\w-]+)/)?.[1];
    if (!code) return;
    decodeSplit(code).then((split) => {
      if (!split) return;
      setEntries(split.stacks.map((s) => ({ time: NaN, player: "", name: s.name, enchant: s.enchant, quality: s.quality, amount: s.amount })));
      setRange(null);
      forgetPlayers();
      setPlayers(split.players.map((p) => ({ ...p, added: true })));
      setGuildPct(split.guildPct);
      setPremium(split.premium);
      setMode(split.mode);
      setMarket(split.market);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl+V anywhere on the page
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;
      const text = event.clipboardData?.getData("text") ?? "";
      if (text) openLog(text);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [openLog]);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) file.text().then(openLog);
    else openLog(event.dataTransfer.getData("text"));
  };

  const trips = useMemo(() => timedTrips(entries), [entries]);
  const used = useMemo(
    () => (range ? entries.filter((e) => !Number.isFinite(e.time) || inRange(e.time, range)) : entries),
    [entries, range]
  );
  const { stacks, takenOut } = useMemo(() => netStacks(used), [used]);

  // everyone in the chosen range is in the split, with the share and repairs typed for them before;
  // players added by hand stay, players removed by hand stay out
  const logPlayers = useMemo(() => [...new Set(used.map((e) => e.player).filter(Boolean))], [used]);
  useEffect(() => {
    setPlayers((prev) => {
      const kept = prev.filter((p) => p.added || logPlayers.includes(p.name));
      const fresh = logPlayers
        .filter((name) => !kept.some((p) => p.name === name) && !removed.current.has(name))
        .map((name) => ({ name, share: 100, repair: 0, ...remembered.current.get(name) }));
      return [...kept, ...fresh];
    });
  }, [logPlayers]);
  useEffect(() => {
    for (const p of players) remembered.current.set(p.name, { share: p.share, repair: p.repair });
  }, [players]);

  useEffect(() => {
    if (!entries.length || names) return;
    loadNames().then(setNames).catch(() => setStatus("error"));
  }, [entries.length, names, retry]);

  // prices for everything the log ever put in, so moving the range never waits for prices
  const ids = useMemo(() => {
    if (!names) return [];
    const all = entries.filter((e) => e.amount > 0).map((e) => itemId(names, e.name, e.enchant));
    return [...new Set(all.filter((id): id is string => !!id))].sort();
  }, [names, entries]);
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!ids.length) return;
    let alive = true;
    setStatus("loading");
    loadPrices(region, ids)
      .then((table) => {
        if (!alive) return;
        setPriced({ region, table });
        setStatus("idle");
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, idsKey, retry]);

  const valued = useMemo(() => {
    return stacks
      .map((s) => {
        const id = names ? itemId(names, s.name, s.enchant) : null;
        const sale = id && prices ? bestSale(prices[id], s.quality, premium, mode, market) : null;
        return { ...s, id, sale, value: sale ? sale.unit * s.amount : 0 };
      })
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }, [stacks, names, prices, premium, mode, market]);

  const total = valued.reduce((sum, v) => sum + v.value, 0);
  const shown = useCountUp(total);
  const byRoute = ROUTES.map((route) => ({ route, value: valued.filter((v) => v.sale?.route === route).reduce((s, v) => s + v.value, 0) }));
  const unpriced = valued.filter((v) => !v.sale).length;
  const itemCount = valued.reduce((sum, v) => sum + v.amount, 0);
  const split = payouts({ total, guildPct, players });
  const colorOf = (name: string) => PLAYER_COLORS[Math.max(0, players.findIndex((p) => p.name === name)) % PLAYER_COLORS.length];
  const pricing = status === "loading" && !prices;

  /** The share link, or null when the split is too big for one or the browser cannot pack it. */
  const shareUrl = async () => {
    const code = await encodeSplit({ stacks, players, guildPct, premium, mode, market }).catch(() => null);
    return code ? `${window.location.origin}/loot-split#s=${code}` : null;
  };

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(done);
    } catch {
      flash("Copy failed, your browser blocked it");
    }
  };

  const copyDiscord = async () => {
    const how = mode === "fast" ? "sold instantly" : "best price incl. sell orders";
    const lines = [
      `## 💰 Loot split · ${shortSilver(total)} silver`,
      `-# ${[`${itemCount} items`, range && rangeLabel(range), market === "best" ? how : `${how} in ${market}`, region.toUpperCase()].filter(Boolean).join(" · ")}`,
      ...split.players.map(
        (p) => `**${p.name}** · ${shortSilver(p.silver)}${p.share !== 100 ? ` (${p.share}%)` : ""}${p.repair ? ` · incl. ${shortSilver(p.repair)} repairs` : ""}`
      ),
      ...(split.guild > 0 ? [`🛡️ Guild ${guildPct}% · ${shortSilver(split.guild)}`] : [])
    ];
    // Discord takes 2000 characters: a huge log leaves the link out rather than failing
    const url = await shareUrl();
    const link = url ? `[Open the split](<${url}>)` : "";
    const text = lines.join("\n");
    copy(link && text.length + link.length < 1990 ? `${text}\n${link}` : text, "Copied, paste it in Discord");
  };

  const editPlayer = (name: string, change: Partial<Player>) => setPlayers((all) => all.map((p) => (p.name === name ? { ...p, ...change } : p)));

  const addPlayer = () => {
    const name = newPlayer.trim().slice(0, 32);
    if (!name || players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return;
    removed.current.delete(name);
    setPlayers([...players, { name, share: 100, repair: 0, added: true }]);
    setNewPlayer("");
  };

  const reset = () => {
    forgetPlayers();
    setEntries([]);
    setRange(null);
    setPriced(null);
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
  };

  return (
    <div
      className={`ls-root${dragging ? " is-dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
    >
      <SeoHeading title="Albion Online Loot Split Calculator">
        Paste your Albion Online guild chest log, pick the run that counts and get the loot&apos;s value at live Black Market and
        market prices, with repairs paid back, the guild&apos;s cut and each player&apos;s share, ready for Discord.
      </SeoHeading>

      <header className="bm-header">
        <MobileNavBurger accent="#f5c451" />
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
              <Link className="nav-tab" to="/gold-tracker">Gold Tracker</Link>
              <span className="nav-tab active">Loot Split</span>
            </div>
          </div>
          {meta}
        </div>
      </header>

      <main className="ls">
        {!entries.length ? (
          <section className="ls-empty">
            <p className="ls-eyebrow">LOOT SPLIT</p>
            <h2 className="ls-title">
              Chest log in.
              <br />
              <span>Silver out.</span>
            </h2>
            <label
              className="ls-drop"
              tabIndex={0}
              role="button"
              aria-label="Choose a chest log file, or paste it with Ctrl + V"
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                e.currentTarget.querySelector("input")?.click();
              }}
            >
              <input type="file" accept=".txt,.csv,text/plain" hidden onChange={(e) => e.target.files?.[0]?.text().then(openLog)} />
              <span className="ls-drop-icon material-symbols-outlined" aria-hidden="true">inventory_2</span>
              <b>Paste your chest log</b>
              <span className="ls-keys">
                <kbd>Ctrl</kbd> + <kbd>V</kbd> anywhere · or drop the .txt
              </span>
            </label>
            <div className="ls-empty-links">
              <button type="button" className="ls-link ls-link-guide" onClick={() => setGuide(true)}>
                <span className="material-symbols-outlined" aria-hidden="true">play_circle</span>
                How to copy it
              </button>
              <button type="button" className="ls-link" onClick={() => openLog(EXAMPLE_LOG)}>
                Try an example
              </button>
            </div>
          </section>
        ) : (
          <>
            <div className="ls-bar">
              {range ? (
                <button type="button" className="ls-range" onClick={() => setPicking(true)} title="Change which part of the log counts">
                  <span className="material-symbols-outlined" aria-hidden="true">date_range</span>
                  <span>
                    <b>{rangeLabel(range)}</b>
                    <small>
                      {itemCount} items · {logPlayers.length} {logPlayers.length === 1 ? "player" : "players"}
                    </small>
                  </span>
                  <span className="ls-range-edit material-symbols-outlined" aria-hidden="true">tune</span>
                </button>
              ) : (
                <span className="ls-range is-static">
                  <span className="material-symbols-outlined" aria-hidden="true">link</span>
                  <span>
                    <b>Shared split</b>
                    <small>{itemCount} items</small>
                  </span>
                </span>
              )}
              <div className="ls-controls">
                <div className="ls-seg" role="group" aria-label="Server">
                  {(["eu", "us"] as const).map((r) => (
                    <button key={r} type="button" className={region === r ? "is-on" : ""} onClick={() => setRegion(r)}>
                      {r.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="ls-seg" role="group" aria-label="How to sell">
                  <button type="button" className={mode === "fast" ? "is-on" : ""} onClick={() => setMode("fast")} title="Sell instantly: Black Market or city buy orders">
                    ⚡ Fast
                  </button>
                  <button type="button" className={mode === "max" ? "is-on" : ""} onClick={() => setMode("max")} title="Also list sell orders when they pay more">
                    💰 Max
                  </button>
                </div>
                <label className={`ls-market${market !== "best" ? " is-set" : ""}`} title="Where to sell. Items this market does not take go to the best other one.">
                  <span className="material-symbols-outlined" aria-hidden="true">storefront</span>
                  <select value={market} onChange={(e) => setMarket(e.target.value as Market)} aria-label="Sell at">
                    {MARKETS.map((m) => (
                      <option key={m} value={m}>
                        {m === "best" ? "Best market" : m}
                      </option>
                    ))}
                  </select>
                  <span className="ls-market-caret material-symbols-outlined" aria-hidden="true">expand_more</span>
                </label>
                <button type="button" className={`ls-toggle${premium ? " is-on" : ""}`} aria-pressed={premium} onClick={() => setPremium(!premium)}>
                  <span aria-hidden="true" />
                  Premium
                </button>
                <button type="button" className="ls-icon-btn" onClick={reset} aria-label="New log" title="New log">
                  <span className="material-symbols-outlined">restart_alt</span>
                </button>
              </div>
            </div>

            <p className="sr-only" aria-live="polite">{pricing ? "" : `Chest value ${fmt(total)} silver`}</p>
            <section className="ls-hero">
              <div className="ls-total">
                <p className="ls-label">Chest value</p>
                <p className="ls-big">{pricing ? <span className="ls-shimmer">Pricing…</span> : shortSilver(shown)}</p>
                <p className="ls-sub">
                  {fmt(total)} silver · {itemCount} items · {players.length} {players.length === 1 ? "player" : "players"}
                  {takenOut > 0 && <> · {takenOut} taken out</>}
                </p>
                {status === "error" && <p className="ls-error">Prices could not load. <button type="button" onClick={() => setRetry((n) => n + 1)}>Try again</button></p>}
              </div>
              <div className="ls-plan">
                <div className="ls-meter" aria-hidden="true">
                  {byRoute.map(({ route, value }) =>
                    value > 0 ? <span key={route} className={`r-${route}`} style={{ flexGrow: value }} /> : null
                  )}
                </div>
                <ul>
                  {byRoute.map(({ route, value }) => (
                    <li key={route} className={value ? "" : "is-zero"}>
                      <i className={`r-${route}`} />
                      {ROUTE_LABEL[route]}
                      <b>{shortSilver(value)}</b>
                    </li>
                  ))}
                  {unpriced > 0 && (
                    <li className="is-zero">
                      <i />
                      No price yet
                      <b>{unpriced}</b>
                    </li>
                  )}
                </ul>
              </div>
            </section>

            <div className="ls-grid">
              <section className="ls-card" aria-label="Loot">
                <div className="ls-card-head">
                  <h3>Loot</h3>
                  <span>{valued.length} stacks</span>
                </div>
                <ul className="ls-tiles">
                  {(showAll ? valued : valued.slice(0, SHOWN_TILES)).map((v, i) => (
                    <li
                      key={v.key}
                      className={`ls-tile ${v.sale ? `r-${v.sale.route}` : "is-unpriced"}`}
                      style={{ "--i": i } as CSSProperties}
                      tabIndex={0}
                      aria-label={`${v.name}${v.enchant ? ` .${v.enchant}` : ""}, ${QUALITY[v.quality]}, ${v.amount}×, ${
                        v.sale ? `${fmt(v.value)} silver, ${ROUTE_LABEL[v.sale.route]}${v.sale.route !== "bm" ? ` in ${v.sale.city}` : ""}` : "no market price"
                      }`}
                    >
                      {v.id ? (
                        <>
                          <img
                            src={`https://render.albiononline.com/v1/item/${v.id}.png${v.quality > 1 ? `?quality=${v.quality}` : ""}`}
                            alt=""
                            onLoad={(e) => e.currentTarget.classList.add("is-loaded")}
                            onError={(e) => e.currentTarget.classList.add("is-failed")}
                          />
                          <span className="ls-ph" aria-hidden="true" />
                        </>
                      ) : (
                        <span className="ls-tile-missing material-symbols-outlined" aria-hidden="true">help</span>
                      )}
                      {v.amount > 1 && <span className="ls-qty">{v.amount}</span>}
                      <span className="ls-val">{v.sale ? shortSilver(v.value) : "?"}</span>
                      <span className="ls-tip" aria-hidden="true">
                        <b>{v.name}{v.enchant ? ` .${v.enchant}` : ""}</b>
                        <span>{QUALITY[v.quality]}{v.amount > 1 ? ` · ${v.amount}×` : ""}</span>
                        {v.sale ? (
                          <span>
                            {ROUTE_LABEL[v.sale.route]}
                            {v.sale.route !== "bm" ? ` · ${v.sale.city}` : ""} · {fmt(v.sale.unit)} each
                          </span>
                        ) : (
                          <span>No market price right now</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {valued.length > SHOWN_TILES && (
                  <button type="button" className="ls-more" onClick={() => setShowAll(!showAll)}>
                    {showAll ? "Show less" : `Show all ${valued.length}`}
                  </button>
                )}
              </section>

              <section className="ls-card ls-split" aria-label="Split">
                <div className="ls-card-head">
                  <h3>Split</h3>
                  <span>
                    {shortSilver(split.pool)} to share{split.repairs > 0 && <> · {shortSilver(split.repairs)} repairs back</>}
                  </span>
                </div>
                <div className="ls-cols" aria-hidden="true">
                  <span>Player</span>
                  <span>Share</span>
                  <span>Repairs</span>
                  <span>Gets</span>
                </div>
                <ul className="ls-players">
                  {split.players.map((p) => (
                    <li key={p.name} style={{ "--c": colorOf(p.name) } as CSSProperties}>
                      <span className="ls-avatar" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
                      <span className="ls-name">{p.name}</span>
                      <span className="ls-input ls-share" title="Share of a full cut">
                        <input
                          type="number"
                          min={0}
                          max={200}
                          step={25}
                          value={p.share}
                          aria-label={`${p.name} share`}
                          onChange={(e) => editPlayer(p.name, { share: Math.max(0, Number(e.target.value) || 0) })}
                        />
                        %
                      </span>
                      <span className="ls-input ls-repair" title="What this player paid for repairs, paid back first">
                        <SilverInput
                          value={players.find((x) => x.name === p.name)?.repair ?? 0}
                          label={`${p.name} repairs`}
                          onChange={(repair) => editPlayer(p.name, { repair })}
                        />
                      </span>
                      <b className="ls-cut">{shortSilver(p.silver)}</b>
                      <button type="button" className="ls-x" aria-label={`Remove ${p.name}`} onClick={() => {
                          removed.current.add(p.name);
                          setPlayers(players.filter((x) => x.name !== p.name));
                        }}>
                        ×
                      </button>
                      <span className="ls-bar-fill" style={{ width: `${total ? (p.silver / total) * 100 : 0}%` }} aria-hidden="true" />
                    </li>
                  ))}
                  <li className="ls-guild" style={{ "--c": "#cbd5e1" } as CSSProperties}>
                    <span className="ls-avatar material-symbols-outlined" aria-hidden="true">shield</span>
                    <span className="ls-name">Guild</span>
                    <span className="ls-input ls-share" title="Guild tax, taken after repairs">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={guildPct}
                        aria-label="Guild tax"
                        onChange={(e) => setGuildPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                      />
                      %
                    </span>
                    <span />
                    <b className="ls-cut">{split.guild > 0 ? shortSilver(split.guild) : "–"}</b>
                    <span />
                    <span className="ls-bar-fill" style={{ width: `${total ? (split.guild / total) * 100 : 0}%` }} aria-hidden="true" />
                  </li>
                </ul>
                <form
                  className="ls-add"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addPlayer();
                  }}
                >
                  <input value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} placeholder="+ Add player" maxLength={32} />
                </form>
                <div className="ls-actions">
                  <button type="button" className="ls-discord" onClick={copyDiscord} disabled={!total}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4a12.9 12.9 0 0 1-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.1-.8-9.6-3.6-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" /></svg>
                    Copy for Discord
                  </button>
                  <button type="button" className="ls-icon-btn" onClick={async () => {
                      const url = await shareUrl();
                      if (url) copy(url, "Link copied");
                      else flash("This split is too big for a link");
                    }} aria-label="Copy share link" title="Copy share link">
                    <span className="material-symbols-outlined">link</span>
                  </button>
                </div>
              </section>
            </div>

            <div className="ls-add-log">
              <button type="button" onClick={addFromClipboard}>
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
                <span>
                  <b>Add another log</b>
                  <small>
                    <kbd>Ctrl</kbd> + <kbd>V</kbd> or drop it · counted on top, nothing twice
                  </small>
                </span>
              </button>
              <input ref={addFile} type="file" accept=".txt,.csv,text/plain" hidden onChange={(e) => {
                  e.target.files?.[0]?.text().then(openLog);
                  e.target.value = "";
                }}
              />
            </div>
          </>
        )}
      </main>

      {picking && range && trips.length > 0 && (
        <RunPicker
          trips={trips}
          range={range}
          onRange={setRange}
          items={itemCount}
          players={logPlayers.length}
          value={pricing ? "Pricing…" : `${shortSilver(total)} silver`}
          onClose={() => setPicking(false)}
        />
      )}
      {guide && <CopyGuide onClose={() => setGuide(false)} />}
      {layers}
      {dragging && (
        <div className="ls-dropzone" aria-hidden="true">
          <span className="material-symbols-outlined">download</span>
          Drop the log
        </div>
      )}
      {toast && <div className="ls-toast" role="status">{toast}</div>}
    </div>
  );
}
