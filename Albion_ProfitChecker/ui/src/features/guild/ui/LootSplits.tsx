import { useEffect, useMemo, useState } from "react";
import { shortPrice } from "../../price-checker/ui/format";
import { groupTrips, netStacks, type LogEntry } from "../../loot-split/core/lootLog";
import { fromInput, toInput } from "../../loot-split/core/timeline";
import { payouts } from "../../loot-split/core/valuation";
import { GuildApiError, fetchSplits, removeSplit, saveSplit, type SavedSplit, type SplitData } from "../api";
import { CopyButton } from "./CopyButton";
import { Loading } from "./Loading";

const RUNS_SHOWN = 8;
const MINUTE = 60_000;

// log times are the game's clock, kept as UTC: shown as UTC too, like the game
const day = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const clock = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
/** "12 Nov 20:10 → 21:40", both days when it crosses midnight. */
const runLabel = (from: number, to: number) => `${day(from)} ${clock(from)} → ${day(from) === day(to) ? "" : `${day(to)} `}${clock(to)}`;

type Range = { from: number; to: number };

/**
 * Loot splits from the chest log: pick the run (the deposits of a mass loot trip), who is in it and
 * the guild's cut, save it, then tick each player once they got their silver. Saved to the player's
 * account; the values are the prices when the split was saved.
 */
export function LootSplits({
  guildId,
  token,
  entries,
  unitOf,
  priced
}: {
  guildId: string;
  token: string;
  entries: LogEntry[];
  unitOf: (name: string, enchant: number, quality: number) => number;
  priced: boolean;
}) {
  const [splits, setSplits] = useState<SavedSplit[] | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    setError("");
    fetchSplits(token, guildId)
      .then((next) => alive && setSplits(next))
      .catch((err: unknown) => alive && setError(err instanceof GuildApiError ? err.message : "Your loot splits could not load."));
    return () => {
      alive = false;
    };
  }, [token, guildId, version]);

  return (
    <>
      <NewSplit
        guildId={guildId}
        token={token}
        entries={entries}
        unitOf={unitOf}
        priced={priced}
        onSaved={(split) => setSplits((list) => [split, ...(list ?? [])])}
      />
      {splits ? (
        <SavedSplits token={token} guildId={guildId} splits={splits} onChange={setSplits} />
      ) : error ? (
        <p className="gd-error" role="alert">
          {error}{" "}
          <button type="button" className="gd-btn" onClick={() => setVersion((v) => v + 1)}>
            Try again
          </button>
        </p>
      ) : (
        <Loading what="Loading your loot splits" account />
      )}
    </>
  );
}

function NewSplit({
  guildId,
  token,
  entries,
  unitOf,
  priced,
  onSaved
}: {
  guildId: string;
  token: string;
  entries: LogEntry[];
  unitOf: (name: string, enchant: number, quality: number) => number;
  priced: boolean;
  onSaved: (split: SavedSplit) => void;
}) {
  // newest run first; rows without a readable time cannot be placed in a run
  const runs = useMemo(() => groupTrips(entries).filter((t) => Number.isFinite(t.start)).reverse(), [entries]);
  const [range, setRange] = useState<Range | null>(null);
  const [players, setPlayers] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const [guildPct, setGuildPct] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  // the newest run until another is picked
  const chosen = range ?? (runs[0] ? { from: runs[0].start, to: runs[0].end } : null);
  const used = useMemo(() => (chosen ? entries.filter((e) => Number.isFinite(e.time) && e.time >= chosen.from && e.time < chosen.to + MINUTE) : []), [entries, chosen?.from, chosen?.to]);
  const depositors = useMemo(() => [...new Set(used.filter((e) => e.amount > 0).map((e) => e.player))], [used]);
  // another run starts with the players who put loot in it; names added by hand go then
  const depositorKey = depositors.join("\n");
  useEffect(() => {
    setPlayers(depositorKey ? depositorKey.split("\n") : []);
    setNote("");
  }, [depositorKey]);

  const items = useMemo(
    () =>
      netStacks(used)
        .stacks.map((s) => ({ name: s.name, enchant: s.enchant, quality: s.quality, amount: s.amount, unit: unitOf(s.name, s.enchant, s.quality) }))
        .sort((a, b) => b.unit * b.amount - a.unit * a.amount),
    [used, unitOf]
  );
  const total = items.reduce((t, i) => t + i.unit * i.amount, 0);
  const unpriced = items.filter((i) => !i.unit).length;
  const split = payouts({ total, guildPct, players: players.map((p) => ({ name: p, share: 100 })) });

  if (!runs.length) {
    return (
      <section className="gd-card gd-split-new">
        <div className="gd-list-head">
          <h2>Split a loot run</h2>
        </div>
        <p className="gd-empty">Add the chest log above: each run of deposits can then be split between the players and saved.</p>
      </section>
    );
  }

  const addPlayer = () => {
    const next = extra.trim();
    if (next && !players.some((p) => p.toLowerCase() === next.toLowerCase())) setPlayers([...players, next]);
    setExtra("");
  };
  const save = async () => {
    if (!chosen) return;
    setBusy(true);
    setNote("");
    const data: SplitData = {
      from: chosen.from,
      to: chosen.to,
      total,
      guildPct,
      guildCut: split.guild,
      items,
      players: split.players.map((p) => ({ name: p.name, share: p.share, silver: Math.round(p.silver), paid: false }))
    };
    try {
      onSaved(await saveSplit(token, guildId, { name: name.trim() || runLabel(chosen.from, chosen.to), data }));
      setName("");
      setNote("Saved: it is in your splits below.");
    } catch (err) {
      setNote(err instanceof GuildApiError ? err.message : "The split could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gd-card gd-split-new">
      <div className="gd-list-head">
        <h2>Split a loot run</h2>
        <span className="gd-muted">pick the run, who is in it and the guild's cut, then save it</span>
      </div>
      <div className="gd-fight-pick" role="group" aria-label="Run">
        {runs.slice(0, RUNS_SHOWN).map((t) => {
          const on = chosen?.from === t.start && chosen?.to === t.end;
          const deposits = t.entries.filter((e) => e.amount > 0).reduce((n, e) => n + e.amount, 0);
          return (
            <button key={t.id} type="button" className={`gd-fight-chip${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => setRange({ from: t.start, to: t.end })}>
              <b>{runLabel(t.start, t.end)}</b>
              <small>
                {t.players.length} {t.players.length === 1 ? "player" : "players"} · {deposits} items put in
              </small>
            </button>
          );
        })}
      </div>
      {chosen ? (
        <div className="gd-list-head gd-list-tools gd-split-range">
          <label>
            <span>From (UTC)</span>
            <input className="gd-filter" type="datetime-local" value={toInput(chosen.from)} onChange={(e) => Number.isFinite(fromInput(e.target.value)) && setRange({ from: fromInput(e.target.value), to: chosen.to })} />
          </label>
          <label>
            <span>To (UTC)</span>
            <input className="gd-filter" type="datetime-local" value={toInput(chosen.to)} onChange={(e) => Number.isFinite(fromInput(e.target.value)) && setRange({ from: chosen.from, to: fromInput(e.target.value) })} />
          </label>
        </div>
      ) : null}

      <div className="gd-split-body">
        <div className="gd-detail-card">
          <h3>
            Loot · {priced ? shortPrice(total) : "–"}
          </h3>
          {items.length ? (
            <ul className="gd-regear-items">
              {items.slice(0, 12).map((i) => (
                <li key={`${i.name}|${i.enchant}|${i.quality}`}>
                  <span>
                    {i.name}
                    {i.enchant ? ` .${i.enchant}` : ""}
                    <small>×{i.amount}</small>
                  </span>
                  <b className="gd-num">{priced && i.unit ? shortPrice(i.unit * i.amount) : "–"}</b>
                </li>
              ))}
              {items.length > 12 ? <li className="gd-muted">+{items.length - 12} more items</li> : null}
            </ul>
          ) : (
            <p className="gd-muted">Nothing left in the chest from this time: everything put in was taken out again.</p>
          )}
          {unpriced ? <p className="gd-muted gd-split-note">{unpriced} items without a price count as 0.</p> : null}
        </div>

        <div className="gd-detail-card">
          <h3>
            Players · {players.length}
          </h3>
          <ul className="gd-split-players">
            {players.map((p) => (
              <li key={p}>
                {p}
                <button type="button" aria-label={`Take ${p} out`} onClick={() => setPlayers(players.filter((x) => x !== p))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="gd-actions-row">
            <input
              className="gd-filter"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
              placeholder="Add a player"
              aria-label="Add a player"
              maxLength={40}
            />
            <button type="button" className="gd-btn" disabled={!extra.trim()} onClick={addPlayer}>
              Add
            </button>
          </div>
          <label className="gd-split-cut">
            <span>Guild cut</span>
            <input className="gd-filter" type="number" min={0} max={100} value={guildPct} onChange={(e) => setGuildPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
            <span>%</span>
          </label>
        </div>

        <div className="gd-detail-card">
          <h3>Each gets</h3>
          <p className="gd-split-each is-gold">{priced && players.length ? shortPrice(split.players[0]?.silver ?? 0) : "–"}</p>
          <p className="gd-muted gd-split-note">
            {players.length} {players.length === 1 ? "player" : "players"}
            {split.guild ? ` · guild keeps ${shortPrice(split.guild)}` : ""}
          </p>
          <input className="gd-filter" value={name} onChange={(e) => setName(e.target.value)} placeholder={chosen ? runLabel(chosen.from, chosen.to) : "Name"} aria-label="Name of the split" maxLength={80} />
          <button type="button" className="gd-btn is-primary" disabled={busy || !players.length || !priced} onClick={() => void save()}>
            {busy ? "Saving…" : "Save split"}
          </button>
          {note ? (
            <p className="gd-muted gd-split-note" aria-live="polite">
              {note}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SavedSplits({ token, guildId, splits, onChange }: { token: string; guildId: string; splits: SavedSplit[]; onChange: (next: SavedSplit[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  const replace = (next: SavedSplit) => onChange(splits.map((s) => (s.id === next.id ? next : s)));
  /** Ticks a player paid or not: shown at once, put back when it could not be saved. */
  const togglePaid = async (split: SavedSplit, name: string) => {
    const data = { ...split.data, players: split.data.players.map((p) => (p.name === name ? { ...p, paid: !p.paid } : p)) };
    replace({ ...split, data });
    setError("");
    try {
      replace(await saveSplit(token, guildId, { id: split.id, name: split.name, data }));
    } catch (err) {
      replace(split);
      setError(err instanceof GuildApiError ? err.message : "The tick could not be saved. Try again.");
    }
  };
  const remove = async (split: SavedSplit) => {
    if (!window.confirm(`Remove the split "${split.name}"?`)) return;
    setError("");
    try {
      await removeSplit(token, split.id);
      onChange(splits.filter((s) => s.id !== split.id));
    } catch (err) {
      setError(err instanceof GuildApiError ? err.message : "The split could not be removed. Try again.");
    }
  };

  return (
    <section className="gd-card gd-splits">
      <div className="gd-list-head">
        <h2>Your splits</h2>
        <span className="gd-muted">saved to your account: only you see them</span>
      </div>
      <div className="gd-row is-head">
        <span>SPLIT</span>
        <span className="gd-num">LOOT</span>
        <span className="gd-num gd-col-mid">EACH</span>
        <span className="gd-num">PAID</span>
      </div>
      {splits.map((s) => {
        const paid = s.data.players.filter((p) => p.paid).length;
        const all = s.data.players.length;
        const isOpen = open === s.id;
        const unpaid = s.data.players.filter((p) => !p.paid);
        const when = s.data.from && s.data.to ? runLabel(s.data.from, s.data.to) : new Date(s.createdAt).toLocaleDateString("en-GB");
        return (
          <div key={s.id} className={`gd-member${isOpen ? " is-open" : ""}`}>
            <button type="button" className="gd-row gd-row-button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
              <span className="gd-who">
                <b>{s.name}</b>
                <small>
                  {when === s.name ? "" : `${when} · `}
                  {all} {all === 1 ? "player" : "players"}
                </small>
              </span>
              <span className="gd-num is-gold">{shortPrice(s.data.total)}</span>
              <span className="gd-num gd-col-mid">{shortPrice(s.data.players[0]?.silver ?? 0)}</span>
              <span className="gd-num">
                <span className={`gd-pill ${paid === all ? "is-active" : paid ? "is-quiet" : "is-inactive"}`}>
                  {paid}/{all}
                </span>
              </span>
            </button>
            {isOpen ? (
              <div className="gd-split-open">
                <ul className="gd-split-pay">
                  {s.data.players.map((p) => (
                    <li key={p.name} className={p.paid ? "is-paid" : undefined}>
                      <label className="gd-check">
                        <input type="checkbox" checked={p.paid} onChange={() => void togglePaid(s, p.name)} />
                        {p.name}
                      </label>
                      <b className="gd-num">{shortPrice(p.silver)}</b>
                    </li>
                  ))}
                </ul>
                <p className="gd-muted gd-split-note">
                  {s.data.items.reduce((n, i) => n + i.amount, 0)} items · prices of {new Date(s.createdAt).toLocaleDateString("en-GB")}
                  {s.data.guildCut ? ` · guild cut ${s.data.guildPct}%: ${shortPrice(s.data.guildCut)}` : ""}
                </p>
                <div className="gd-actions-row">
                  {unpaid.length ? <CopyButton text={unpaid.map((p) => `${p.name}\t${p.silver}`).join("\n")} label="Copy who is not paid" count={unpaid.length} /> : null}
                  <button type="button" className="gd-btn" onClick={() => void remove(s)}>
                    Remove split
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      {!splits.length ? <p className="gd-empty">No saved split yet. Pick a run above and save it.</p> : null}
      {error ? (
        <p className="gd-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
