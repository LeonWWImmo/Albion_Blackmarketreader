import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useSessionState } from "../../shared";
import { useSeo } from "../../shared/seo/useSeo";
import type { Region } from "@shared/types";
import { lastDays, seriesFor, soldPerDay } from "./core/history";
import { categoryLabel, craftingCalculatorPath, familyKey, iconUrl, type ItemEntry, type ItemIndex } from "./core/items";
import { MARKETS, bestFlip, bestInstantSell, cheapestBuy, marketQuotes, type QuoteRow } from "./core/quotes";
import { useHistory, useItemIndex, useNow, useQuotes, useStoredList } from "./hooks/usePriceData";
import { ENCHANT_COLOR, MARKET_COLOR, QUALITIES, TierBadge } from "./ui/badges";
import { silver } from "./ui/format";
import { Ladder } from "./ui/Ladder";
import { MarketTable } from "./ui/MarketTable";
import { onIconError } from "./ui/icon";
import { PriceChart, type ChartLine } from "./ui/PriceChart";
import { itemPath } from "./ui/paths";
import { RECENT_KEY, WATCH_KEY, isSavedItem, sameSaved, type SavedItem } from "./ui/saved";
import { SearchBox } from "./ui/SearchBox";
import { PriceCheckerShell } from "./ui/Shell";
import { StatCards } from "./ui/StatCards";

type Range = "7d" | "30d";
const RANGES: { key: Range; label: string; scale: 6 | 24; days: number }[] = [
  { key: "7d", label: "7D", scale: 6, days: 7 },
  { key: "30d", label: "30D", scale: 24, days: 31 }
];

const clamp = (value: number, lo: number, hi: number) => (Number.isFinite(value) ? Math.min(hi, Math.max(lo, Math.round(value))) : lo);

/** The cheapest usable sell order of one id and quality, for the ladders. */
function cheapestOf(rows: QuoteRow[], id: string, quality: number, now: number) {
  return cheapestBuy(marketQuotes(rows, id, quality), now)?.price ?? null;
}

function ItemView({ index, item, region, setRegion }: { index: ItemIndex; item: ItemEntry; region: Region; setRegion: (r: Region) => void }) {
  const [params, setParams] = useSearchParams();
  const enchant = clamp(Number(params.get("e") ?? 0), 0, item.variants.length - 1);
  // artefacts, resources, food and the like only trade as Normal: a ?q= on them is ignored
  const quality = item.qualities ? clamp(Number(params.get("q") ?? 1), 1, 5) : 1;
  const id = item.variants[enchant];
  const now = useNow();
  const [premium, setPremium] = useSessionState("pc:premium", true);
  const [range, setRange] = useState<Range>("30d");
  const [hidden, setHidden] = useState<Set<string>>(new Set(["Brecilien"]));
  const [toast, setToast] = useState("");
  const [watch, addWatch, removeWatch] = useStoredList<SavedItem>(WATCH_KEY, 24, sameSaved, isSavedItem);
  const [, addRecent] = useStoredList<SavedItem>(RECENT_KEY, 12, sameSaved, isSavedItem);
  const saved: SavedItem = useMemo(() => ({ slug: item.slug, e: enchant, q: quality }), [item.slug, enchant, quality]);
  const watching = watch.some((w) => sameSaved(w, saved));

  useEffect(() => addRecent(saved), [saved, addRecent]);

  const { scale, days } = RANGES.find((r) => r.key === range)!;
  const quotes = useQuotes(region, item.variants);
  const history = useHistory(region, id, scale);
  const rows = quotes.data?.quotes ?? [];
  const markets = useMemo(() => marketQuotes(rows, id, quality), [rows, id, quality]);
  const cheapest = cheapestBuy(markets, now);
  const bestSell = bestInstantSell(markets, now);
  const flip = bestFlip(markets, now, premium);

  const series = history.data?.series ?? [];
  const perMarket = useMemo(() => new Map(MARKETS.map((m) => [m, seriesFor(series, m, quality)])), [series, quality]);
  const sold = useMemo(() => new Map(MARKETS.map((m) => [m, soldPerDay(perMarket.get(m) ?? [], now)])), [perMarket, now]);
  const week = useMemo(() => new Map(MARKETS.map((m) => [m, lastDays(perMarket.get(m) ?? [], 7, now)])), [perMarket, now]);
  const lines: ChartLine[] = useMemo(
    () =>
      MARKETS.filter((m) => !hidden.has(m)).map((m) => ({ key: m, label: m, color: MARKET_COLOR[m], points: lastDays(perMarket.get(m) ?? [], days, now) })),
    [hidden, perMarket, days, now]
  );

  const family = index.byFamily.get(familyKey(item.id)) ?? [item];
  const go = (e: number, q: number) => {
    const next = new URLSearchParams(params);
    if (e) next.set("e", String(e));
    else next.delete("e");
    if (q > 1) next.set("q", String(q));
    else next.delete("q");
    setParams(next, { replace: true });
  };

  const flash = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2200);
  };
  const qualityLabel = QUALITIES[quality - 1].label;
  const title = `${item.name}${enchant ? ` .${enchant}` : ""}`;
  const copyForDiscord = async () => {
    const lines = [
      `**${title}**${item.qualities ? ` · ${qualityLabel}` : ""} · ${region.toUpperCase()}`,
      cheapest ? `Buy cheapest: **${silver(cheapest.price)}** in ${cheapest.market}` : "Buy cheapest: no recent sell order",
      bestSell ? `Sell instantly: **${silver(bestSell.price)}** at ${bestSell.market}` : "Sell instantly: no recent buy order",
      `[All markets](<${window.location.origin}${itemPath(item, enchant, quality)}>)`
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      flash("Copied, paste it in Discord");
    } catch {
      flash("Copy failed, your browser blocked it");
    }
  };

  // the same texts the server writes into this page for crawlers (api/_lib/itemPage.js)
  useSeo({
    title: `${item.name} Price in Albion Online: Every City | Blackmarket Reader`,
    description: `Live Albion Online price of ${item.name} in every royal city, Caerleon, Brecilien and the Black Market: the cheapest place to buy, the best place to sell and the price history.`,
    keywords: `${item.name} price, ${item.name} Albion Online, Albion Online prices, Albion Online price checker`,
    canonical: `https://blackmarketreader.com/prices/${item.slug}`,
    ogImage: iconUrl(item.id)
  });

  const loading = quotes.status === "loading";
  const failed = quotes.status === "error";

  return (
    <main className="pc pc-item">
      <div className="pc-topbar">
        <Link to="/prices" className="pc-back">
          <span aria-hidden="true">←</span> Price Checker
        </Link>
        <SearchBox index={index} size="compact" />
      </div>

      <section className="pc-card pc-head" style={{ "--quality": QUALITIES[quality - 1].color, "--enchant": ENCHANT_COLOR[enchant] } as CSSProperties}>
        <div className="pc-head-main">
          <div className="pc-icon">
            <img key={`${id}.${quality}`} src={iconUrl(id, quality)} alt="" width={128} height={128} onError={onIconError} />
          </div>
          <div className="pc-head-text">
            <p className="pc-head-cat">
              {categoryLabel(item.category)}
              {item.weight ? ` · ${item.weight} kg` : ""}
            </p>
            <h2>
              {item.name}
              {enchant ? <span className="pc-head-enchant">.{enchant}</span> : null}
            </h2>
            <p className="pc-head-id">
              <code>{id}</code>
            </p>
          </div>
          <div className="pc-head-actions">
            <div className="pc-seg" role="group" aria-label="Server">
              {(["eu", "us"] as const).map((r) => (
                <button key={r} type="button" className={region === r ? "is-on" : ""} aria-pressed={region === r} onClick={() => setRegion(r)}>
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
            <button type="button" className={`pc-icon-btn${watching ? " is-on" : ""}`} aria-pressed={watching} onClick={() => (watching ? removeWatch(saved) : addWatch(saved))} title={watching ? "Remove from watchlist" : "Add to watchlist"}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z" />
              </svg>
              <span>{watching ? "Watching" : "Watch"}</span>
            </button>
            <button type="button" className="pc-icon-btn is-discord" onClick={copyForDiscord}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4a12.9 12.9 0 0 1-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.1-.8-9.6-3.6-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
              </svg>
              <span>Copy</span>
            </button>
          </div>
        </div>

        <div className="pc-pickers">
          {family.length > 1 ? (
            <div className="pc-picker" role="group" aria-label="Tier">
              <span>Tier</span>
              {family.map((member) => (
                <Link key={member.id} to={itemPath(member, Math.min(enchant, member.variants.length - 1), quality)} className={member.id === item.id ? "is-on" : ""} aria-current={member.id === item.id ? "page" : undefined}>
                  <TierBadge tier={member.tier} />
                </Link>
              ))}
            </div>
          ) : null}
          {item.variants.length > 1 ? (
            <div className="pc-picker" role="group" aria-label="Enchantment">
              <span>Enchant</span>
              {item.variants.map((_, e) => (
                <button key={e} type="button" className={e === enchant ? "is-on" : ""} aria-pressed={e === enchant} style={{ "--pick": ENCHANT_COLOR[e] } as CSSProperties} onClick={() => go(e, quality)}>
                  .{e}
                </button>
              ))}
            </div>
          ) : null}
          {item.qualities ? (
            <div className="pc-picker" role="group" aria-label="Quality">
              <span>Quality</span>
              {QUALITIES.map((q) => (
                <button key={q.value} type="button" className={q.value === quality ? "is-on" : ""} aria-pressed={q.value === quality} style={{ "--pick": q.color } as CSSProperties} onClick={() => go(enchant, q.value)} title={q.label}>
                  <i aria-hidden="true" />
                  <span className="pc-q-label">{q.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {failed ? (
        <p className="pc-error">
          Prices could not load. <button type="button" onClick={quotes.retry}>Try again</button>
        </p>
      ) : null}

      <StatCards cheapest={cheapest} bestSell={bestSell} flip={flip} premium={premium} onPremium={setPremium} now={now} loading={loading} failed={failed} />

      <section className="pc-card" aria-labelledby="pc-markets-title">
        <div className="pc-card-head">
          <h2 id="pc-markets-title">Every market</h2>
          <span>{item.qualities ? `${qualityLabel} · prices players reported, each with its age` : "Prices players reported, each with its age"}</span>
        </div>
        <MarketTable quotes={markets} cheapest={cheapest} bestSell={bestSell} soldPerDay={sold} week={week} now={now} />
      </section>

      <section className="pc-card" aria-labelledby="pc-history-title">
        <div className="pc-card-head">
          <h2 id="pc-history-title">Price history</h2>
          <div className="pc-seg" role="group" aria-label="Range">
            {RANGES.map((r) => (
              <button key={r.key} type="button" className={range === r.key ? "is-on" : ""} aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="pc-legend" role="group" aria-label="Markets on the chart">
          {MARKETS.map((m) => {
            const on = !hidden.has(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                className={on ? "is-on" : ""}
                style={{ "--market": MARKET_COLOR[m] } as CSSProperties}
                onClick={() => {
                  const next = new Set(hidden);
                  if (on) next.add(m);
                  else next.delete(m);
                  setHidden(next);
                }}
              >
                <i aria-hidden="true" />
                {m}
              </button>
            );
          })}
        </div>
        {history.status === "loading" && !history.data ? (
          <div className="pc-chart-empty">Loading price history…</div>
        ) : history.status === "error" ? (
          <div className="pc-chart-empty">
            Price history could not load. <button type="button" onClick={history.retry}>Try again</button>
          </div>
        ) : (
          <PriceChart lines={lines} hourly={scale === 6} />
        )}
      </section>

      {item.variants.length > 1 || item.qualities ? (
        <div className="pc-ladders">
          {item.variants.length > 1 ? (
            <Ladder
              title="Price per enchantment"
              rungs={item.variants.map((variant, e) => ({
                key: variant,
                label: `.${e}`,
                color: ENCHANT_COLOR[e],
                price: cheapestOf(rows, variant, quality, now),
                active: e === enchant,
                onPick: () => go(e, quality)
              }))}
            />
          ) : null}
          {item.qualities ? (
            <Ladder
              title="Price per quality"
              rungs={QUALITIES.map((q) => ({
                key: String(q.value),
                label: q.label,
                color: q.color,
                price: cheapestOf(rows, id, q.value, now),
                active: q.value === quality,
                onPick: () => go(enchant, q.value)
              }))}
            />
          ) : null}
        </div>
      ) : null}

      {item.craftable ? (
        <Link className="pc-craft" to={craftingCalculatorPath(item, enchant)}>
          <span className="pc-craft-icon" aria-hidden="true">⚒</span>
          <span>
            <b>Craft it yourself?</b>
            <small>Open the {item.name}{enchant ? ` .${enchant}` : ""} in the Crafting Calculator: material cost, return rate and profit.</small>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}

      <p className="pc-note">
        Prices come from players who share what they see on the market. Each price shows how long ago it was seen; prices older than two
        days are greyed out and not used for the best price or the flip.
      </p>
      {toast ? (
        <div className="pc-toast" role="status">
          {toast}
        </div>
      ) : null}
    </main>
  );
}

/**
 * While the item list loads, or when it failed: no head tags of its own, so the item's title and
 * description (set by the server for /prices/<slug>) stay until the page knows whether the item exists.
 */
function LoadingItem({ failed }: { failed: boolean }) {
  return (
    <main className="pc pc-item">
      <div className="pc-missing">
        <h2>{failed ? "The item list could not load. Reload the page to try again." : "Loading…"}</h2>
      </div>
    </main>
  );
}

/** An address with no item behind it. */
function NoItem({ index }: { index: ItemIndex }) {
  useSeo({
    title: "Item not found | Price Checker | Blackmarket Reader",
    description: "There is no Albion Online item at this address. Search all items in the Price Checker.",
    canonical: "https://blackmarketreader.com/prices",
    noindex: true
  });
  return (
    <main className="pc pc-item">
      <div className="pc-missing">
        <h2>No item at this address</h2>
        <p>Search for it instead:</p>
        <SearchBox index={index} size="hero" />
      </div>
    </main>
  );
}

export function ItemPricePage() {
  const { slug = "" } = useParams();
  const { index, failed } = useItemIndex();
  const item = index?.bySlug.get(slug) ?? null;
  return (
    <PriceCheckerShell>
      {(region, setRegion) =>
        item && index ? (
          <ItemView key={item.slug} index={index} item={item} region={region} setRegion={setRegion} />
        ) : index ? (
          <NoItem index={index} />
        ) : (
          <LoadingItem failed={failed} />
        )
      }
    </PriceCheckerShell>
  );
}
