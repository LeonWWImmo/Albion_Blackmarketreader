import { useEffect, useMemo, useState } from "react";
import { shortPrice } from "../../price-checker/ui/format";
import { mergeLogs, parseLootLog, type LogEntry } from "../../loot-split/core/lootLog";
import { loadNames, loadPrices } from "../../loot-split/core/market";
import { bestSale, itemId, type PriceTable } from "../../loot-split/core/valuation";
import type { GuildPageData } from "../api";
import { CopyButton } from "./CopyButton";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 0, label: "Everything" }
];
type Sort = "took" | "gave" | "name";
const SORTS: { key: Sort; label: string }[] = [
  { key: "took", label: "Took the most" },
  { key: "gave", label: "Gave the most" },
  { key: "name", label: "Name" }
];
/** Rows kept per guild in this browser: months of a busy guild chest. */
const KEPT_MAX = 20_000;
const DAY_MS = 86_400_000;
const QUALITY = ["", "", " · Good", " · Outstanding", " · Excellent", " · Masterpiece"];

const storageKey = (guildId: string) => `gd-bank:${guildId}`;

function readLog(guildId: string): LogEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(guildId));
    const rows = raw ? (JSON.parse(raw) as unknown) : [];
    // stored without a time as null: NaN does not survive JSON
    return Array.isArray(rows) ? rows.map((e: LogEntry) => ({ ...e, time: typeof e.time === "number" ? e.time : NaN })) : [];
  } catch {
    return [];
  }
}

function writeLog(guildId: string, entries: LogEntry[]): boolean {
  try {
    if (entries.length) localStorage.setItem(storageKey(guildId), JSON.stringify(entries.slice(-KEPT_MAX)));
    else localStorage.removeItem(storageKey(guildId));
    return true;
  } catch {
    return false;
  }
}

type ItemLine = { key: string; name: string; enchant: number; quality: number; amount: number; value: number };
type PlayerRow = { name: string; gaveCount: number; gave: number; tookCount: number; took: number; items: ItemLine[] };

/**
 * The guild chest's log, per player: what each put in and took out, worth how much. The log is
 * pasted from the game (Chest → Log → Copy) and kept in this browser, so pasting again adds the new
 * rows to the old ones.
 */
export function BankLogTab({ data }: { data: GuildPageData }) {
  const { guild } = data;
  const [entries, setEntries] = useState<LogEntry[]>(() => readLog(guild.id));
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState(30);
  const [sort, setSort] = useState<Sort>("took");
  const [open, setOpen] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string> | null>(null);
  const [prices, setPrices] = useState<PriceTable | null>(null);
  const [priceError, setPriceError] = useState(false);

  const add = () => {
    const extra = parseLootLog(text);
    if (!extra.length) {
      setNote("No chest log rows found. In the game: open the chest, Log, Copy, then paste it here.");
      return;
    }
    const merged = mergeLogs(entries, extra);
    setEntries(merged.entries);
    setText("");
    const saved = writeLog(guild.id, merged.entries);
    setNote(`${merged.added.length} new rows added${merged.added.length < extra.length ? `, ${extra.length - merged.added.length} were already here` : ""}.${saved ? "" : " This browser does not keep them: they last for this visit."}`);
  };
  const clear = () => {
    if (!window.confirm("Remove the whole chest log of this guild from this browser?")) return;
    setEntries([]);
    writeLog(guild.id, []);
    setNote("");
  };

  // names, then the prices of every item in the log (quick sell value on this server)
  useEffect(() => {
    if (!entries.length || names) return;
    loadNames()
      .then(setNames)
      .catch(() => setPriceError(true));
  }, [entries.length, names]);
  // the ids as one text: new rows with the same items do not load the prices again
  const idKey = names ? [...new Set(entries.map((e) => itemId(names, e.name, e.enchant)).filter((id): id is string => Boolean(id)))].sort().join(",") : "";
  useEffect(() => {
    if (!idKey) return;
    let alive = true;
    setPriceError(false);
    loadPrices(guild.region, idKey.split(","))
      .then((table) => alive && setPrices(table))
      .catch(() => alive && setPriceError(true));
    return () => {
      alive = false;
    };
  }, [guild.region, idKey]);

  const rows = useMemo(() => {
    const now = Date.now();
    const unit = (e: LogEntry) => {
      const id = names ? itemId(names, e.name, e.enchant) : null;
      return (id && prices ? bestSale(prices[id], e.quality, false, "fast")?.unit : 0) ?? 0;
    };
    const byPlayer = new Map<string, PlayerRow>();
    for (const e of entries) {
      if (days && !(now - e.time <= days * DAY_MS)) continue;
      const row = byPlayer.get(e.player) ?? { name: e.player, gaveCount: 0, gave: 0, tookCount: 0, took: 0, items: [] };
      const value = unit(e) * Math.abs(e.amount);
      if (e.amount > 0) {
        row.gaveCount += e.amount;
        row.gave += value;
      } else {
        row.tookCount -= e.amount;
        row.took += value;
      }
      const key = `${e.name}|${e.enchant}|${e.quality}`;
      const line = row.items.find((i) => i.key === key);
      if (line) {
        line.amount += e.amount;
        line.value += Math.sign(e.amount) * value;
      } else row.items.push({ key, name: e.name, enchant: e.enchant, quality: e.quality, amount: e.amount, value: Math.sign(e.amount) * value });
      byPlayer.set(e.player, row);
    }
    const by: Record<Sort, (a: PlayerRow, b: PlayerRow) => number> = {
      took: (a, b) => b.took - b.gave - (a.took - a.gave) || b.tookCount - a.tookCount,
      gave: (a, b) => b.gave - b.took - (a.gave - a.took) || b.gaveCount - a.gaveCount,
      name: (a, b) => a.name.localeCompare(b.name)
    };
    for (const row of byPlayer.values()) row.items.sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || Math.abs(b.amount) - Math.abs(a.amount));
    return [...byPlayer.values()].sort(by[sort]);
  }, [entries, days, sort, names, prices]);

  const gave = rows.reduce((t, r) => t + r.gave, 0);
  const took = rows.reduce((t, r) => t + r.took, 0);
  const priced = Boolean(prices);
  const takers = rows.filter((r) => r.took > r.gave);
  const timed = entries.filter((e) => Number.isFinite(e.time));
  const span = timed.length ? [Math.min(...timed.map((e) => e.time)), Math.max(...timed.map((e) => e.time))] : null;

  return (
    <>
      <section className="gd-card gd-bank-paste">
        <div className="gd-list-head">
          <h2>Add the chest log</h2>
          <span className="gd-muted">In the game: open the guild chest → Log → Copy</span>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={'"Date"\t"Player"\t"Item"\t"Enchantment"\t"Quality"\t"Amount"\n…'} aria-label="Chest log" rows={4} spellCheck={false} />
        <div className="gd-actions-row">
          <button type="button" className="gd-btn is-primary" disabled={!text.trim()} onClick={add}>
            Add log
          </button>
          {entries.length ? (
            <button type="button" className="gd-btn" onClick={clear}>
              Remove all
            </button>
          ) : null}
          <span className="gd-muted" aria-live="polite">
            {note}
          </span>
        </div>
        <p className="gd-foot">
          <span>
            The log stays in this browser only, per guild: paste a new copy now and then and the rows add up. Albion's own log shows the latest rows only.
            {span ? ` Kept: ${entries.length} rows, ${new Date(span[0]).toLocaleDateString("en-GB")} to ${new Date(span[1]).toLocaleDateString("en-GB")}.` : ""}
          </span>
        </p>
      </section>

      {entries.length ? (
        <>
          <section className="gd-stats">
            <div className="gd-card gd-stat">
              <small>PUT IN</small>
              <b className="is-green">{priced ? shortPrice(gave) : "–"}</b>
              <span>{rows.reduce((t, r) => t + r.gaveCount, 0)} items</span>
            </div>
            <div className="gd-card gd-stat">
              <small>TAKEN OUT</small>
              <b className="is-red">{priced ? shortPrice(took) : "–"}</b>
              <span>{rows.reduce((t, r) => t + r.tookCount, 0)} items</span>
            </div>
            <div className="gd-card gd-stat">
              <small>BALANCE</small>
              <b className={gave >= took ? "is-green" : "is-red"}>{priced ? `${gave >= took ? "+" : "−"}${shortPrice(Math.abs(gave - took))}` : "–"}</b>
              <span>chest gained or lost</span>
            </div>
            <div className="gd-card gd-stat">
              <small>PLAYERS</small>
              <b>{rows.length}</b>
              <span>{takers.length} took more than they gave</span>
            </div>
          </section>

          <section className="gd-card gd-bank">
            <div className="gd-list-head">
              <h2>Per player</h2>
              {priced && takers.length ? (
                <CopyButton text={takers.map((r) => `${r.name}\t${Math.round(r.took - r.gave)}`).join("\n")} label="Copy who took more" count={takers.length} />
              ) : null}
            </div>
            <div className="gd-list-head gd-list-tools">
              <div className="gd-chips" role="group" aria-label="Time">
                {RANGES.map((r) => (
                  <button key={r.days} type="button" className={`gd-chip${days === r.days ? " is-on" : ""}`} aria-pressed={days === r.days} onClick={() => setDays(r.days)}>
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="gd-chips" role="group" aria-label="Sort">
                {SORTS.map((s) => (
                  <button key={s.key} type="button" className={`gd-chip${sort === s.key ? " is-on" : ""}`} aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="gd-row is-head">
              <span>PLAYER</span>
              <span className="gd-num">PUT IN</span>
              <span className="gd-num">TOOK OUT</span>
              <span className="gd-num gd-col-mid">BALANCE</span>
            </div>
            {rows.map((r) => {
              const balance = r.gave - r.took;
              return (
                <div key={r.name} className={`gd-member${open === r.name ? " is-open" : ""}`}>
                  <button type="button" className="gd-row gd-row-button" aria-expanded={open === r.name} onClick={() => setOpen(open === r.name ? null : r.name)}>
                    <span className="gd-who">
                      <b>{r.name}</b>
                    </span>
                    <span className="gd-num">
                      <span className="is-green">{priced ? shortPrice(r.gave) : r.gaveCount}</span>
                      <small>{r.gaveCount} items</small>
                    </span>
                    <span className="gd-num">
                      <span className="is-red">{priced ? shortPrice(r.took) : r.tookCount}</span>
                      <small>{r.tookCount} items</small>
                    </span>
                    <span className={`gd-num gd-col-mid gd-strong ${balance >= 0 ? "is-green" : "is-red"}`}>{priced ? `${balance >= 0 ? "+" : "−"}${shortPrice(Math.abs(balance))}` : "–"}</span>
                  </button>
                  {open === r.name ? (
                    <ul className="gd-bank-items">
                      {r.items.map((i) => (
                        <li key={i.key}>
                          <span>
                            {i.name}
                            {i.enchant ? ` .${i.enchant}` : ""}
                            <small>{QUALITY[i.quality] ?? ""}</small>
                          </span>
                          <span className={`gd-num ${i.amount >= 0 ? "is-green" : "is-red"}`}>
                            {i.amount >= 0 ? "+" : "−"}
                            {Math.abs(i.amount)}
                          </span>
                          <span className="gd-num gd-muted">{priced && i.value ? shortPrice(Math.abs(i.value)) : "–"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
            {!rows.length ? <p className="gd-empty">No rows in this time. Pick a longer one.</p> : null}
            <p className="gd-foot">
              <span>
                {priceError
                  ? "Prices could not load right now, so the values are missing."
                  : "Values: what each item sells for right away on this server (Black Market or the best buy order, after tax). Items without a price count as 0."}
              </span>
            </p>
          </section>
        </>
      ) : null}
    </>
  );
}
