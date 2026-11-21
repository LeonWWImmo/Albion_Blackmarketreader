// The guild tables in Supabase (supabase/migrations/*_guild_*.sql), read and written with the
// service role key: RLS gives the browser no access to them, everything goes through api/guild.js.
import { createClient } from "@supabase/supabase-js";

const WRITE_CHUNK = 500;
/** Supabase answers at most this many rows per request. */
const PAGE = 1000;
const UNIQUE_VIOLATION = "23505";
const ID_CHUNK = 150;

/** Throws on a Supabase error, returns the data otherwise. */
function must({ data, error }) {
  if (error) throw Object.assign(new Error(`database: ${error.message}`), { code: error.code });
  return data;
}

/** Every row of an ordered query, page by page. `query` builds a fresh query each time. */
async function allPages(query) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = must(await query().range(from, from + PAGE - 1));
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export function createGuildStore(db) {
  const getGuild = async (id) => must(await db.from("guilds").select("*").eq("id", id).maybeSingle());
  return {
    getGuild,
    async getGuildBySlug(region, slug) {
      return must(await db.from("guilds").select("*").eq("region", region).eq("slug", slug).maybeSingle());
    },
    async saveGuild(row) {
      must(await db.from("guilds").upsert(row, { onConflict: "id" }));
    },
    async setTrackedSince(id, day) {
      must(await db.from("guilds").update({ tracked_since: day }).eq("id", id));
    },
    /** The guild this player has marked on this server, or null. */
    async getMark(userId, region) {
      const mark = must(await db.from("guild_marks").select("guild_id").eq("user_id", userId).eq("region", region).maybeSingle());
      return mark ? getGuild(mark.guild_id) : null;
    },
    /** Every guild this player has marked (one per server). */
    async getMarks(userId) {
      const ids = must(await db.from("guild_marks").select("guild_id").eq("user_id", userId)).map((m) => m.guild_id);
      return ids.length ? must(await db.from("guilds").select("*").in("id", ids)) : [];
    },
    async countMarks(guildId) {
      const { count, error } = await db.from("guild_marks").select("user_id", { count: "exact", head: true }).eq("guild_id", guildId);
      if (error) throw new Error(`database: ${error.message}`);
      return count ?? 0;
    },
    /** False when the player has a guild marked on this server already (one per server: the primary key). */
    async addMark(userId, region, guildId) {
      const result = await db.from("guild_marks").insert({ user_id: userId, region, guild_id: guildId });
      if (result.error?.code === UNIQUE_VIOLATION) return false;
      must(result);
      return true;
    },
    /** Removes the player's mark on this server; the guild it was on, or null. */
    async removeMark(userId, region) {
      const rows = must(await db.from("guild_marks").delete().eq("user_id", userId).eq("region", region).select("guild_id"));
      return rows[0]?.guild_id ?? null;
    },
    /** Marked guilds whose last sync is older than `before`, oldest first. */
    async dueGuilds(before, limit) {
      // paged: the order must have no ties (a player has a row per server)
      const marks = await allPages(() => db.from("guild_marks").select("guild_id").order("user_id", { ascending: true }).order("region", { ascending: true }));
      const ids = [...new Set(marks.map((m) => m.guild_id))];
      if (!ids.length) return [];
      const guilds = [];
      // the ids go into the URL: small chunks keep it far below proxy limits
      for (let i = 0; i < ids.length; i += ID_CHUNK) guilds.push(...must(await db.from("guilds").select("*").in("id", ids.slice(i, i + ID_CHUNK))));
      return guilds
        .filter((g) => !g.last_synced_at || g.last_synced_at < before)
        .sort((a, b) => (a.last_synced_at ?? "").localeCompare(b.last_synced_at ?? ""))
        .slice(0, limit);
    },
    /** Everyone who has been in the guild since tracking started (members and those who left). */
    async getPlayers(guildId) {
      return allPages(() => db.from("guild_players").select("*").eq("guild_id", guildId).order("player_id", { ascending: true }));
    },
    async savePlayers(rows) {
      for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
        must(await db.from("guild_players").upsert(rows.slice(i, i + WRITE_CHUNK), { onConflict: "guild_id,player_id" }));
      }
    },
    /** Snapshots from `fromDay` on (inclusive), oldest first. */
    async getSnapshots(guildId, fromDay) {
      return allPages(() =>
        db.from("guild_snapshots").select("*").eq("guild_id", guildId).gte("day", fromDay).order("day", { ascending: true }).order("player_id", { ascending: true })
      );
    },
    async saveSnapshots(rows) {
      for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
        must(await db.from("guild_snapshots").upsert(rows.slice(i, i + WRITE_CHUNK), { onConflict: "guild_id,player_id,day" }));
      }
    },
    /** The player's Discord webhook for this server ({ url, name, last_sent_on }), or null. */
    async getWebhook(userId, region) {
      return must(await db.from("guild_webhooks").select("*").eq("user_id", userId).eq("region", region).maybeSingle());
    },
    async saveWebhook(userId, region, url, name) {
      must(await db.from("guild_webhooks").upsert({ user_id: userId, region, url, name, last_sent_on: null }, { onConflict: "user_id,region" }));
    },
    async removeWebhook(userId, region) {
      return must(await db.from("guild_webhooks").delete().eq("user_id", userId).eq("region", region).select("user_id")).length > 0;
    },
    /** The webhooks of the players who have this guild marked (each player's webhook for its server). */
    async webhooksOfGuild(guildId, region) {
      const ids = must(await db.from("guild_marks").select("user_id").eq("guild_id", guildId)).map((m) => m.user_id);
      const hooks = [];
      for (let i = 0; i < ids.length; i += ID_CHUNK) {
        hooks.push(...must(await db.from("guild_webhooks").select("*").eq("region", region).in("user_id", ids.slice(i, i + ID_CHUNK))));
      }
      return hooks;
    },
    async setWebhookSent(userId, region, day) {
      must(await db.from("guild_webhooks").update({ last_sent_on: day }).eq("user_id", userId).eq("region", region));
    },
    /** Every webhook with the ZvZ report on (premium, Guild Pro). */
    async zvzWebhooks() {
      return must(await db.from("guild_webhooks").select("*").eq("zvz", true));
    },
    /** Turns the ZvZ report on or off; `after`: only fights that start later are reported. */
    async setZvz(userId, region, on, after) {
      must(await db.from("guild_webhooks").update({ zvz: on, zvz_after: after }).eq("user_id", userId).eq("region", region));
    },
    async setZvzAfter(userId, region, after) {
      must(await db.from("guild_webhooks").update({ zvz_after: after }).eq("user_id", userId).eq("region", region));
    },
    /** The deaths of one fight this player ticked as paid (kill event ids). */
    async getRegearPaid(userId, region, battleId) {
      return must(await db.from("guild_regear_paid").select("event_id").eq("user_id", userId).eq("region", region).eq("battle_id", battleId)).map((r) => Number(r.event_id));
    },
    async setRegearPaid(userId, region, battleId, eventId, paid) {
      if (paid) must(await db.from("guild_regear_paid").upsert({ user_id: userId, region, battle_id: battleId, event_id: eventId }, { onConflict: "user_id,region,event_id" }));
      else must(await db.from("guild_regear_paid").delete().eq("user_id", userId).eq("region", region).eq("event_id", eventId));
    },
    /** The fights a player marked to regear in one guild, newest mark first. */
    async listRegearFights(userId, region, guildId) {
      return must(
        await db.from("guild_regear_fights").select("battle_id, info, created_at").eq("user_id", userId).eq("region", region).eq("guild_id", guildId).order("created_at", { ascending: false })
      ).map((r) => ({ battle_id: Number(r.battle_id), info: r.info, created_at: r.created_at }));
    },
    async countRegearFights(userId) {
      const { count, error } = await db.from("guild_regear_fights").select("battle_id", { count: "exact", head: true }).eq("user_id", userId);
      if (error) throw new Error(`database: ${error.message}`);
      return count ?? 0;
    },
    async setRegearFight(userId, region, guildId, battleId, info, at) {
      if (info) must(await db.from("guild_regear_fights").upsert({ user_id: userId, region, guild_id: guildId, battle_id: battleId, info, created_at: at }, { onConflict: "user_id,region,battle_id" }));
      else must(await db.from("guild_regear_fights").delete().eq("user_id", userId).eq("region", region).eq("battle_id", battleId));
    },
    async countRegearPaid(userId) {
      const { count, error } = await db.from("guild_regear_paid").select("event_id", { count: "exact", head: true }).eq("user_id", userId);
      if (error) throw new Error(`database: ${error.message}`);
      return count ?? 0;
    },
    /** The guilds a player keeps a chest log of. */
    async bankLogGuilds(userId) {
      return must(await db.from("guild_bank_logs").select("guild_id").eq("user_id", userId)).map((r) => r.guild_id);
    },
    /** The guilds a player keeps loot splits of. */
    async splitGuilds(userId) {
      return [...new Set(must(await db.from("guild_splits").select("guild_id").eq("user_id", userId)).map((r) => r.guild_id))];
    },
    async getBankLog(userId, guildId) {
      const row = must(await db.from("guild_bank_logs").select("rows").eq("user_id", userId).eq("guild_id", guildId).maybeSingle());
      return row?.rows ?? [];
    },
    /** No rows removes the log. */
    async saveBankLog(userId, guildId, rows, at) {
      if (rows.length) must(await db.from("guild_bank_logs").upsert({ user_id: userId, guild_id: guildId, rows, updated_at: at }, { onConflict: "user_id,guild_id" }));
      else must(await db.from("guild_bank_logs").delete().eq("user_id", userId).eq("guild_id", guildId));
    },
    /** This player's splits of a guild, newest first. */
    async listSplits(userId, guildId) {
      return must(await db.from("guild_splits").select("*").eq("user_id", userId).eq("guild_id", guildId).order("created_at", { ascending: false }).limit(PAGE));
    },
    async countSplits(userId, guildId) {
      const { count, error } = await db.from("guild_splits").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("guild_id", guildId);
      if (error) throw new Error(`database: ${error.message}`);
      return count ?? 0;
    },
    async addSplit(row) {
      return must(await db.from("guild_splits").insert(row).select("*").single());
    },
    /** Only the player's own split; null when it is not theirs or gone. */
    async updateSplit(userId, id, changes) {
      return must(await db.from("guild_splits").update(changes).eq("id", id).eq("user_id", userId).select("*").maybeSingle());
    },
    async removeSplit(userId, id) {
      return must(await db.from("guild_splits").delete().eq("id", id).eq("user_id", userId).select("id")).length > 0;
    }
  };
}

let shared = null;

/** The store on the live database (env SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY), or null without them. */
export function liveGuildStore() {
  if (shared) return shared;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  shared = { store: createGuildStore(db), db };
  return shared;
}

/** The signed-in player behind a Supabase access token, or null (also for unconfirmed emails). */
export async function userFromToken(db, token) {
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user?.email_confirmed_at) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
