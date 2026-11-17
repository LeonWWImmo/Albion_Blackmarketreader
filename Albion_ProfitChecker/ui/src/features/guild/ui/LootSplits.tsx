import { useEffect, useMemo, useRef, useState } from "react";
import { shortPrice } from "../../price-checker/ui/format";
import { groupTrips, netStacks, type LogEntry } from "../../loot-split/core/lootLog";
import { fromInput, toInput } from "../../loot-split/core/timeline";
import { payouts } from "../../loot-split/core/valuation";
import { GuildApiError, fetchSplits, itemIcon, removeSplit, saveSplit, type SavedSplit, type SplitData } from "../api";
import { CopyButton } from "./CopyButton";
import { Loading } from "./Loading";

const RUNS_SHOWN = 8;
const ITEMS_SHOWN = 18;
const MINUTE = 60_000;
const QUALITY = ["", "", "Good", "Outstanding", "Excellent", "Masterpiece"];

// log times are the game's clock, kept as UTC: shown as UTC too, like the game
const day = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const clock = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
/** "12 Nov 20:10 → 21:40", both days when it crosses midnight. */
const runLabel = (from: number, to: number) => `${day(from)} ${clock(from)} → ${day(from) === day(to) ? "" : `${day(to)} `}${clock(to)}`;
/** One run by its time, several by how many and the time from the first to the last. */
const runsLabel = (ranges: Range[]) =>
  ranges.length === 1 ? runLabel(ranges[0].from, ranges[0].to) : `${ranges.length} runs · ${runLabel(Math.min(...ranges.map((r) => r.from)), Math.max(...ranges.map((r) => r.to)))}`;
const rangeKey = (r: Range) => `${r.from}-${r.to}`;

type Range = { from: number; to: number };
/** A picked range: a run of the log (`run`, found again by its start) or a time set by hand. */
type Pick = Range & { run?: boolean };
type ItemIdOf = (name: string, enchant: number) => string | null;
type Item = SplitData["items"][number];

/**
 * Loot splits from the chest log: pick one or more runs (the deposits of a mass loot trip), who is
 * in it and the guild's cut, save it, then tick each player once they got their silver. Saved to the
 * player's account; the values are the prices when the split was saved.
 */
export function LootSplits({
  guildId,
  token,
  entries,
  unitOf,
  idOf,
  priced
}: {
  guildId: string;
  token: string;
  entries: LogEntry[];
  unitOf: (name: string, enchant: number, quality: number) => number;
  idOf: ItemIdOf;
  priced: boolean;
}) {
  const [splits, setSplits] = useState<SavedSplit[] | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

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

  // a split just saved opens below, with the boxes to tick who got paid
  useEffect(() => {
    if (open) document.getElementById(`split-${open}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  return (
    <>
      <NewSplit
        guildId={guildId}
        token={token}
        entries={entries}
        unitOf={unitOf}
        idOf={idOf}
        priced={priced}
        onSaved={(split) => {
          setSplits((list) => [split, ...(list ?? [])]);
          setOpen(split.id);
        }}
      />
      {splits ? (
        <SavedSplits
          token={token}
          guildId={guildId}
          splits={splits}
          onChange={(update) => setSplits((list) => (list ? update(list) : list))}
          onReload={() => setVersion((v) => v + 1)}
          open={open}
          setOpen={setOpen}
          idOf={idOf}
        />
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

/** Item tiles: icon with the amount, name and value. */
function ItemTiles({ items, idOf, priced, limit }: { items: Item[]; idOf: ItemIdOf; priced: boolean; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = all || !limit ? items : items.slice(0, limit);
  return (
    <>
      <ul className="gd-split-items">
        {shown.map((i) => {
          const id = idOf(i.name, i.enchant);
          return (
            <li key={`${i.name}|${i.enchant}|${i.quality}`} title={`${i.name}${i.enchant ? ` .${i.enchant}` : ""}${QUALITY[i.quality] ? `, ${QUALITY[i.quality]}` : ""} ×${i.amount}`}>
              <span className="gd-split-icon">
                {id ? <img src={itemIcon(id, i.quality, 64)} alt="" width={40} height={40} loading="lazy" decoding="async" /> : <span className="gd-noitem is-small" aria-hidden="true" />}
                <em>{i.amount}</em>
              </span>
              <span className="gd-split-item-name">
                {i.name}
                {i.enchant ? <small> .{i.enchant}</small> : null}
              </span>
              <b className="gd-num">{priced && i.unit ? shortPrice(i.unit * i.amount) : "–"}</b>
            </li>
          );
        })}
      </ul>
      {limit && items.length > limit ? (
        <button type="button" className="gd-btn gd-split-more" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${items.length} items`}
        </button>
      ) : null}
    </>
  );
}

function NewSplit({
  guildId,
  token,
  entries,
  unitOf,
  idOf,
  priced,
  onSaved
}: {
  guildId: string;
  token: string;
  entries: LogEntry[];
  unitOf: (name: string, enchant: number, quality: number) => number;
  idOf: ItemIdOf;
  priced: boolean;
  onSaved: (split: SavedSplit) => void;
}) {
  // newest run first; rows without a readable time cannot be placed in a run
  const runs = useMemo(() => groupTrips(entries).filter((t) => Number.isFinite(t.start)).reverse(), [entries]);
  const [picked, setPicked] = useState<Pick[] | null>(null);
  const [runsShown, setRunsShown] = useState(RUNS_SHOWN);
  const [custom, setCustom] = useState<Range | null>(null);
  const [excluded, setExcluded] = useState<Set<string> | null>(null);
  const [extras, setExtras] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const [guildPct, setGuildPct] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  // the newest run until others are picked
  // a picked run takes its current end: a later paste can add deposits to it
  const ranges: Pick[] = picked
    ? picked.map((r) => {
        const t = r.run ? runs.find((x) => x.start === r.from) : undefined;
        return t ? { from: t.start, to: t.end, run: true } : r;
      })
    : runs[0]
      ? [{ from: runs[0].start, to: runs[0].end, run: true }]
      : [];
  const rangesKey = ranges.map(rangeKey).join(",");
  const used = useMemo(
    () => entries.filter((e) => Number.isFinite(e.time) && ranges.some((r) => e.time >= r.from && e.time < r.to + MINUTE)),
    // the ranges by their key: the same runs picked again do not filter again
    [entries, rangesKey]
  );

  /** Who put what into the chest in the picked runs: the players to split between. */
  const people = useMemo(() => {
    const byName = new Map<string, { name: string; items: number; value: number }>();
    for (const e of used) {
      const row = byName.get(e.player) ?? { name: e.player, items: 0, value: 0 };
      if (e.amount > 0) {
        row.items += e.amount;
        row.value += unitOf(e.name, e.enchant, e.quality) * e.amount;
      }
      byName.set(e.player, row);
    }
    for (const x of extras) if (!byName.has(x)) byName.set(x, { name: x, items: 0, value: 0 });
    return [...byName.values()].sort((a, b) => b.value - a.value || b.items - a.items || a.name.localeCompare(b.name));
  }, [used, extras, unitOf]);
  // other runs: everyone who put loot in is in, players who only took out are not
  useEffect(() => {
    setExcluded(null);
    setNote("");
  }, [rangesKey]);
  const out = excluded ?? new Set(people.filter((p) => !p.items && !extras.includes(p.name)).map((p) => p.name));
  const players = people.filter((p) => !out.has(p.name)).map((p) => p.name);

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

  const toggleRange = (r: Pick) => {
    const key = rangeKey(r);
    const next = ranges.some((x) => rangeKey(x) === key) ? ranges.filter((x) => rangeKey(x) !== key) : [...ranges, r];
    setPicked(next.sort((a, b) => b.from - a.from));
  };
  const togglePlayer = (who: string) => {
    const next = new Set(out);
    if (next.has(who)) next.delete(who);
    else next.add(who);
    setExcluded(next);
  };
  const addPlayer = () => {
    const next = extra.trim();
    const known = people.find((p) => p.name.toLowerCase() === next.toLowerCase());
    if (known) {
      const back = new Set(out);
      back.delete(known.name);
      setExcluded(back);
    } else if (next) {
      setExtras([...extras, next]);
      setExcluded(new Set([...out].filter((x) => x !== next)));
    }
    setExtra("");
  };
  const save = async () => {
    if (!ranges.length) return;
    setBusy(true);
    setNote("");
    const data: SplitData = {
      from: Math.min(...ranges.map((r) => r.from)),
      to: Math.max(...ranges.map((r) => r.to)),
      runs: ranges,
      total,
      guildPct,
      guildCut: split.guild,
      items,
      players: split.players.map((p) => ({ name: p.name, share: p.share, silver: Math.round(p.silver), paid: false }))
    };
    try {
      onSaved(await saveSplit(token, guildId, { name: name.trim() || runsLabel(ranges), data }));
      setName("");
      setNote("Saved. Tick each player below once they got their silver.");
    } catch (err) {
      setNote(err instanceof GuildApiError ? err.message : "The split could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const customRuns = ranges.filter((r) => !r.run);

  return (
    <section className="gd-card gd-split-new">
      <div className="gd-list-head">
        <h2>Split a loot run</h2>
        <span className="gd-muted">pick the runs, who is in, the guild's cut: save, then tick who got paid</span>
      </div>

      <div className="gd-split-step">
        <h3>
          <span className="gd-split-n">1</span> Runs <small>{ranges.length ? `${ranges.length} picked` : "none picked"}</small>
        </h3>
        <div className="gd-split-runs" role="group" aria-label="Runs">
          {runs.slice(0, runsShown).map((t) => {
            const on = ranges.some((r) => r.from === t.start && r.to === t.end);
            const deposits = t.entries.filter((e) => e.amount > 0).reduce((n, e) => n + e.amount, 0);
            return (
              <button key={t.id} type="button" className={`gd-split-run${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => toggleRange({ from: t.start, to: t.end, run: true })}>
                <span className="gd-split-box" aria-hidden="true">
                  {on ? "✓" : ""}
                </span>
                <span>
                  <b>{runLabel(t.start, t.end)}</b>
                  <small>
                    {t.players.length} {t.players.length === 1 ? "player" : "players"} · {deposits} {deposits === 1 ? "item" : "items"} put in
                  </small>
                </span>
              </button>
            );
          })}
          {customRuns.map((r) => (
            <button key={rangeKey(r)} type="button" className="gd-split-run is-on" aria-pressed onClick={() => toggleRange(r)}>
              <span className="gd-split-box" aria-hidden="true">
                ✓
              </span>
              <span>
                <b>{runLabel(r.from, r.to)}</b>
                <small>set by hand</small>
              </span>
            </button>
          ))}
        </div>
        <div className="gd-actions-row gd-split-runs-foot">
          {runs.length > runsShown ? (
            <button type="button" className="gd-btn" onClick={() => setRunsShown((n) => n + RUNS_SHOWN)}>
              Older runs ({runs.length - runsShown})
            </button>
          ) : null}
          {ranges.length ? (
            <button type="button" className="gd-btn" onClick={() => setPicked([])}>
              Clear
            </button>
          ) : null}
          <button type="button" className="gd-btn" aria-expanded={Boolean(custom)} onClick={() => setCustom(custom ? null : ranges[0] ?? { from: runs[0].start, to: runs[0].end })}>
            {custom ? "Close" : "Set a time by hand"}
          </button>
        </div>
        {custom ? (
          <div className="gd-list-tools gd-split-range">
            <label>
              <span>From (UTC)</span>
              <input className="gd-filter" type="datetime-local" value={toInput(custom.from)} onChange={(e) => Number.isFinite(fromInput(e.target.value)) && setCustom({ ...custom, from: fromInput(e.target.value) })} />
            </label>
            <label>
              <span>To (UTC)</span>
              <input className="gd-filter" type="datetime-local" value={toInput(custom.to)} onChange={(e) => Number.isFinite(fromInput(e.target.value)) && setCustom({ ...custom, to: fromInput(e.target.value) })} />
            </label>
            <button
              type="button"
              className="gd-btn is-primary"
              disabled={custom.to < custom.from}
              onClick={() => {
                if (!ranges.some((r) => rangeKey(r) === rangeKey(custom))) toggleRange(custom);
                setCustom(null);
              }}
            >
              Add this time
            </button>
          </div>
        ) : null}
      </div>

      <div className="gd-split-step">
        <h3>
          <span className="gd-split-n">2</span> Players <small>{players.length} of {people.length} in the split</small>
        </h3>
        {people.length ? (
          <>
            <div className="gd-actions-row gd-split-tools">
              <button type="button" className="gd-btn" onClick={() => setExcluded(new Set())}>
                Everyone
              </button>
              <button type="button" className="gd-btn" onClick={() => setExcluded(new Set(people.map((p) => p.name)))}>
                Nobody
              </button>
            </div>
            <ul className="gd-split-people">
              {people.map((p) => {
                const on = !out.has(p.name);
                return (
                  <li key={p.name}>
                    <label className={`gd-split-person${on ? " is-on" : ""}`}>
                      <input type="checkbox" checked={on} onChange={() => togglePlayer(p.name)} />
                      <span>
                        <b>{p.name}</b>
                        <small>{p.items ? `put in ${p.items} ${p.items === 1 ? "item" : "items"}${priced && p.value ? ` · ${shortPrice(p.value)}` : ""}` : extras.includes(p.name) ? "added by hand" : "took out only"}</small>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="gd-muted">Nobody in the picked runs. Pick a run above.</p>
        )}
        <div className="gd-actions-row gd-split-add">
          <input
            className="gd-filter"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
            placeholder="Add a player who put nothing in"
            aria-label="Add a player"
            maxLength={40}
          />
          <button type="button" className="gd-btn" disabled={!extra.trim()} onClick={addPlayer}>
            Add
          </button>
        </div>
      </div>

      <div className="gd-split-step">
        <h3>
          <span className="gd-split-n">3</span> Loot <small>{items.reduce((n, i) => n + i.amount, 0)} items still in the chest</small>
        </h3>
        {items.length ? (
          <ItemTiles items={items} idOf={idOf} priced={priced} limit={ITEMS_SHOWN} />
        ) : (
          <p className="gd-muted">{ranges.length ? "Nothing left in the chest from these runs: everything put in was taken out again." : "Pick a run above."}</p>
        )}
        {unpriced ? <p className="gd-muted gd-split-note">{unpriced} items without a price count as 0.</p> : null}
      </div>

      <div className="gd-split-sum">
        <div>
          <small>LOOT</small>
          <b className="is-gold">{priced ? shortPrice(total) : "–"}</b>
        </div>
        <div>
          <small>GUILD CUT</small>
          <label className="gd-split-cut">
            <input
              className="gd-filter"
              type="number"
              min={0}
              max={100}
              value={guildPct}
              onChange={(e) => setGuildPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              aria-label="Guild cut in percent"
            />
            <span>% {priced && split.guild ? `= ${shortPrice(split.guild)}` : ""}</span>
          </label>
        </div>
        <div>
          <small>PLAYERS</small>
          <b>{players.length}</b>
        </div>
        <div>
          <small>EACH GETS</small>
          <b className="is-gold gd-split-each">{priced && players.length ? shortPrice(split.players[0]?.silver ?? 0) : "–"}</b>
        </div>
        <div className="gd-split-save">
          <input className="gd-filter" value={name} onChange={(e) => setName(e.target.value)} placeholder={ranges.length ? runsLabel(ranges) : "Name"} aria-label="Name of the split" maxLength={80} />
          <button type="button" className="gd-btn is-primary" disabled={busy || !players.length || !priced || !ranges.length} onClick={() => void save()}>
            {busy ? "Saving…" : "Save split"}
          </button>
        </div>
      </div>
      {note ? (
        <p className="gd-muted gd-split-note" aria-live="polite">
          {note}
        </p>
      ) : null}
    </section>
  );
}

function SavedSplits({
  token,
  guildId,
  splits,
  onChange,
  onReload,
  open,
  setOpen,
  idOf
}: {
  token: string;
  guildId: string;
  splits: SavedSplit[];
  /** Changes the list from its latest state: answers that come back late do not undo other changes. */
  onChange: (update: (list: SavedSplit[]) => SavedSplit[]) => void;
  onReload: () => void;
  open: string | null;
  setOpen: (id: string | null) => void;
  idOf: ItemIdOf;
}) {
  const [error, setError] = useState("");

  // per split: what the player ticked last, and the saves in a row. Ticks clicked fast go out one
  // after the other, each with every tick so far, so none is lost on the screen or on the server.
  const latest = useRef(splits);
  latest.current = splits;
  const wanted = useRef(new Map<string, SavedSplit>());
  const queue = useRef(new Map<string, Promise<void>>());

  /** Saves who is paid: shown at once; when it could not be saved, the list loads again from the account. */
  const savePaid = (id: string, paid: (p: SplitData["players"][number]) => boolean) => {
    const base = wanted.current.get(id) ?? latest.current.find((s) => s.id === id);
    if (!base) return;
    const next = { ...base, data: { ...base.data, players: base.data.players.map((p) => ({ ...p, paid: paid(p) })) } };
    wanted.current.set(id, next);
    onChange((list) => list.map((s) => (s.id === id ? next : s)));
    setError("");
    const run: Promise<void> = (queue.current.get(id) ?? Promise.resolve()).then(async () => {
      const send = wanted.current.get(id);
      if (!send) return;
      try {
        await saveSplit(token, guildId, { id, name: send.name, data: send.data });
      } catch (err) {
        wanted.current.delete(id);
        setError(err instanceof GuildApiError ? err.message : "The tick could not be saved. Try again.");
        onReload();
      } finally {
        if (queue.current.get(id) === run) {
          queue.current.delete(id);
          wanted.current.delete(id);
        }
      }
    });
    queue.current.set(id, run);
  };
  const remove = async (split: SavedSplit) => {
    if (!window.confirm(`Remove the split "${split.name}"?`)) return;
    setError("");
    try {
      await removeSplit(token, split.id);
      onChange((list) => list.filter((s) => s.id !== split.id));
    } catch (err) {
      setError(err instanceof GuildApiError ? err.message : "The split could not be removed. Try again.");
    }
  };

  return (
    <section className="gd-card gd-splits">
      <div className="gd-list-head">
        <h2>Your splits</h2>
        <span className="gd-muted">saved to your account: only you see them. Open one to tick who got paid.</span>
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
        const runs = s.data.runs?.length ? s.data.runs : s.data.from && s.data.to ? [{ from: s.data.from, to: s.data.to }] : [];
        const when = runs.length ? runsLabel(runs) : new Date(s.createdAt).toLocaleDateString("en-GB");
        return (
          <div key={s.id} id={`split-${s.id}`} className={`gd-member${isOpen ? " is-open" : ""}`}>
            <button type="button" className="gd-row gd-row-button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
              <span className="gd-who">
                <b>{s.name}</b>
                <small>
                  {when === s.name ? "" : `${when} · `}
                  {all} {all === 1 ? "player" : "players"} · {isOpen ? "close ▴" : "tick paid ▾"}
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
                <div className="gd-split-progress" aria-hidden="true">
                  <span style={{ width: `${all ? (paid / all) * 100 : 0}%` }} />
                </div>
                <p className="gd-split-progress-text">
                  <b>
                    {paid} of {all} paid
                  </b>
                  {unpaid.length ? ` · ${shortPrice(unpaid.reduce((t, p) => t + p.silver, 0))} still to pay` : " · everyone got their silver"}
                </p>
                <ul className="gd-split-pay">
                  {s.data.players.map((p) => (
                    <li key={p.name}>
                      <label className={`gd-split-person${p.paid ? " is-paid" : ""}`}>
                        <input type="checkbox" checked={p.paid} onChange={() => savePaid(s.id, (x) => (x.name === p.name ? !x.paid : x.paid))} />
                        <span>
                          <b>{p.name}</b>
                          <small>{p.paid ? "paid" : "not paid yet"}</small>
                        </span>
                        <em className="gd-num">{shortPrice(p.silver)}</em>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="gd-actions-row">
                  {unpaid.length ? (
                    <button type="button" className="gd-btn is-primary" onClick={() => savePaid(s.id, () => true)}>
                      Everyone paid
                    </button>
                  ) : null}
                  {unpaid.length ? <CopyButton text={unpaid.map((p) => `${p.name}\t${p.silver}`).join("\n")} label="Copy who is not paid" count={unpaid.length} /> : null}
                  <button type="button" className="gd-btn" onClick={() => void remove(s)}>
                    Remove split
                  </button>
                </div>
                <details className="gd-split-loot">
                  <summary>
                    Loot: {s.data.items.reduce((n, i) => n + i.amount, 0)} items · {shortPrice(s.data.total)}
                    {s.data.guildCut ? ` · guild cut ${s.data.guildPct}%: ${shortPrice(s.data.guildCut)}` : ""} · prices of {new Date(s.createdAt).toLocaleDateString("en-GB")}
                  </summary>
                  <ItemTiles items={s.data.items} idOf={idOf} priced limit={ITEMS_SHOWN} />
                </details>
              </div>
            ) : null}
          </div>
        );
      })}
      {!splits.length ? <p className="gd-empty">No saved split yet. Pick runs above and save the split.</p> : null}
      {error ? (
        <p className="gd-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
