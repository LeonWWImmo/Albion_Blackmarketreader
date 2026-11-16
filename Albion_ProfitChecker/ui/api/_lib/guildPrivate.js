// What a signed-in player keeps for themselves in the Guild section: regear paid ticks, their pasted
// chest log and their saved loot splits. Private per account: nobody else reads them, also not
// another player who marked the same guild. Everything the browser sends is checked and trimmed
// here before it is stored.
import { isBattleId, isGuildId, isRegion } from "./gameinfo.js";

/** Chest log rows kept per guild: months of a busy guild chest. */
export const BANK_ROWS_MAX = 20_000;
export const SPLITS_MAX = 200;
const SPLIT_ITEMS_MAX = 2_000;
const SPLIT_PLAYERS_MAX = 100;
const TEXT_MAX = 120;
const NAME_MAX = 80;
const SILVER_MAX = 1e13;
const EVENT_ID = /^[1-9]\d{0,14}$/;
const SPLIT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ok = (body) => ({ status: 200, body, maxAge: 0 });
const fail = (status, error) => ({ status, body: { error }, maxAge: 0 });

const text = (value, max = TEXT_MAX) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const int = (value, min, max) => (Number.isInteger(value) && value >= min && value <= max ? value : null);
const silver = (value) => (typeof value === "number" && Number.isFinite(value) ? Math.min(SILVER_MAX, Math.max(0, Math.round(value))) : 0);
/** A log time: milliseconds, or null for a row whose date the game wrote in a way we could not read. */
const time = (value) => (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1e14 ? value : null);

/** One chest log row as [time, player, item, enchant, quality, amount], or null when it is not one. */
export function bankRow(row) {
  if (!Array.isArray(row) || row.length !== 6) return null;
  const [t, player, name, enchant, quality, amount] = row;
  const clean = [time(t), text(player, 40), text(name), int(enchant, 0, 4), int(quality, 1, 5), int(amount, -1e6, 1e6)];
  return clean[1] && clean[2] && clean[3] !== null && clean[4] !== null && clean[5] ? clean : null;
}

/** A saved split as the browser shows it again: the items it priced, the players and who is paid. */
export function splitData(data) {
  if (!data || typeof data !== "object") return null;
  const items = (Array.isArray(data.items) ? data.items : [])
    .slice(0, SPLIT_ITEMS_MAX)
    .map((i) => ({ name: text(i?.name), enchant: int(i?.enchant, 0, 4) ?? 0, quality: int(i?.quality, 1, 5) ?? 1, amount: int(i?.amount, 1, 1e7) ?? 0, unit: silver(i?.unit) }))
    .filter((i) => i.name && i.amount);
  const seen = new Set();
  const players = (Array.isArray(data.players) ? data.players : [])
    .map((p) => ({ name: text(p?.name, 40), share: int(p?.share, 0, 1000) ?? 100, silver: silver(p?.silver), paid: p?.paid === true }))
    // one row per name: a name twice would be paid twice
    .filter((p) => p.name && !seen.has(p.name.toLowerCase()) && seen.add(p.name.toLowerCase()));
  if (!players.length || players.length > SPLIT_PLAYERS_MAX) return null;
  const pct = typeof data.guildPct === "number" && Number.isFinite(data.guildPct) ? Math.min(100, Math.max(0, data.guildPct)) : 0;
  return { from: time(data.from), to: time(data.to), total: silver(data.total), guildPct: pct, guildCut: silver(data.guildCut), items, players };
}

const splitOut = (row) => ({ id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at, data: row.data });

/** The actions on a player's own data; `user` is signed in, `store` is there. Null for any other action. */
export async function handlePrivate(action, { query, body }, { store, now }, user) {
  if (action === "regear-paid") {
    const region = String(query.region ?? "");
    const battle = String(query.battle ?? "");
    if (!isRegion(region) || !isBattleId(battle)) return fail(400, "Pick a fight first.");
    return ok({ events: await store.getRegearPaid(user.id, region, Number(battle)) });
  }
  if (action === "regear-pay") {
    const region = String(body?.region ?? "");
    const battle = String(body?.battle ?? "");
    const event = String(body?.event ?? "");
    if (!isRegion(region) || !isBattleId(battle) || !EVENT_ID.test(event)) return fail(400, "Pick a death first.");
    await store.setRegearPaid(user.id, region, Number(battle), Number(event), body?.paid === true);
    return ok({ paid: body?.paid === true });
  }
  if (action === "bank") {
    const guild = String(query.guild ?? "");
    if (!isGuildId(guild)) return fail(400, "Pick a guild first.");
    return ok({ rows: await store.getBankLog(user.id, guild) });
  }
  if (action === "bank-save") {
    const guild = String(body?.guild ?? "");
    if (!isGuildId(guild)) return fail(400, "Pick a guild first.");
    if (!Array.isArray(body?.rows)) return fail(400, "No chest log rows.");
    // the newest rows when there are too many: the browser sends them oldest first
    const rows = body.rows.slice(-BANK_ROWS_MAX).map(bankRow).filter(Boolean);
    await store.saveBankLog(user.id, guild, rows, now().toISOString());
    return ok({ count: rows.length });
  }
  if (action === "splits") {
    const guild = String(query.guild ?? "");
    if (!isGuildId(guild)) return fail(400, "Pick a guild first.");
    return ok({ splits: (await store.listSplits(user.id, guild)).map(splitOut) });
  }
  if (action === "split-save") {
    const guild = String(body?.guild ?? "");
    const id = body?.id == null ? null : String(body.id);
    const name = text(body?.name, NAME_MAX);
    const data = splitData(body?.data);
    if (!isGuildId(guild) || (id !== null && !SPLIT_ID.test(id))) return fail(400, "Pick a guild first.");
    if (!name) return fail(400, "Give the split a name.");
    if (!data) return fail(400, `A split needs 1 to ${SPLIT_PLAYERS_MAX} players.`);
    const at = now().toISOString();
    if (id) {
      const row = await store.updateSplit(user.id, id, { name, data, updated_at: at });
      return row ? ok({ split: splitOut(row) }) : fail(404, "This split is gone. Reload the page.");
    }
    if ((await store.countSplits(user.id, guild)) >= SPLITS_MAX) return fail(409, `You have ${SPLITS_MAX} saved splits for this guild. Remove old ones first.`);
    return ok({ split: splitOut(await store.addSplit({ user_id: user.id, guild_id: guild, name, data, created_at: at, updated_at: at })) });
  }
  if (action === "split-remove") {
    const id = String(body?.id ?? "");
    if (!SPLIT_ID.test(id)) return fail(400, "Pick a split first.");
    return ok({ removed: await store.removeSplit(user.id, id) });
  }
  return null;
}
