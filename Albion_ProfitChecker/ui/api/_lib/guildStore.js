// The guild tables in Supabase (supabase/migrations/*_guild_tracking.sql), read and written with
// the service role key: RLS gives the browser no access to them, everything goes through api/guild.js.
import { createClient } from "@supabase/supabase-js";

const WRITE_CHUNK = 500;
/** Supabase answers at most this many rows per request. */
const PAGE = 1000;
const UNIQUE_VIOLATION = "23505";

/** Throws on a Supabase error, returns the data otherwise. */
function must({ data, error }) {
  if (error) throw new Error(`database: ${error.message}`);
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
  return {
    async getGuild(id) {
      return must(await db.from("guilds").select("*").eq("id", id).maybeSingle());
    },
    async getGuildBySlug(region, slug) {
      return must(await db.from("guilds").select("*").eq("region", region).eq("slug", slug).maybeSingle());
    },
    async getManagedBy(userId) {
      return must(await db.from("guilds").select("*").eq("manager_id", userId).maybeSingle());
    },
    async isSlugTaken(region, slug, exceptId) {
      const rows = must(await db.from("guilds").select("id").eq("region", region).eq("slug", slug));
      return rows.some((row) => row.id !== exceptId);
    },
    async saveGuild(row) {
      must(await db.from("guilds").upsert(row, { onConflict: "id" }));
    },
    /**
     * Sets the manager only while nobody has the guild; true when it worked. False too when this
     * player manages another guild already (the unique index on manager_id, Postgres error 23505).
     */
    async claimGuild(id, userId, trackedSince) {
      const result = await db.from("guilds").update({ manager_id: userId, tracked_since: trackedSince }).eq("id", id).is("manager_id", null).select("id");
      if (result.error?.code === UNIQUE_VIOLATION) return false;
      return must(result).length === 1;
    },
    async releaseGuild(id, userId) {
      must(await db.from("guilds").update({ manager_id: null }).eq("id", id).eq("manager_id", userId));
    },
    /** Managed guilds whose last sync is older than `before`, oldest first. */
    async dueGuilds(before, limit) {
      return must(
        await db
          .from("guilds")
          .select("*")
          .not("manager_id", "is", null)
          .or(`last_synced_at.is.null,last_synced_at.lt."${before}"`)
          .order("last_synced_at", { ascending: true, nullsFirst: true })
          .limit(limit)
      );
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
  return { id: data.user.id };
}
