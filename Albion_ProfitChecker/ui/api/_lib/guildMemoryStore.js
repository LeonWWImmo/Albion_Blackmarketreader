// The guild store (api/_lib/guildStore.js) in memory, with the database's rules: one marked guild per
// player, any number of players per guild. For tests and `npm run dev`, which has no database key.
export function createMemoryGuildStore() {
  const guilds = new Map();
  const marks = new Map(); // user id -> guild id
  const players = new Map();
  const snapshots = new Map();
  const all = () => [...guilds.values()];
  return {
    guilds,
    marks,
    players,
    snapshots,
    getGuild: async (id) => guilds.get(id) ?? null,
    getGuildBySlug: async (region, slug) => all().find((g) => g.region === region && g.slug === slug) ?? null,
    saveGuild: async (row) => {
      guilds.set(row.id, { tracked_since: null, last_synced_at: null, ...guilds.get(row.id), ...row });
    },
    setTrackedSince: async (id, day) => {
      guilds.set(id, { ...guilds.get(id), tracked_since: day });
    },
    getMark: async (userId) => (marks.has(userId) ? (guilds.get(marks.get(userId)) ?? null) : null),
    countMarks: async (guildId) => [...marks.values()].filter((id) => id === guildId).length,
    addMark: async (userId, guildId) => {
      if (marks.has(userId)) return false;
      marks.set(userId, guildId);
      return true;
    },
    removeMark: async (userId) => {
      const guildId = marks.get(userId) ?? null;
      marks.delete(userId);
      return guildId;
    },
    dueGuilds: async (before, limit) =>
      [...new Set(marks.values())]
        .map((id) => guilds.get(id))
        .filter((g) => g && (!g.last_synced_at || g.last_synced_at < before))
        .sort((a, b) => (a.last_synced_at ?? "").localeCompare(b.last_synced_at ?? ""))
        .slice(0, limit),
    getPlayers: async (guildId) => [...players.values()].filter((p) => p.guild_id === guildId),
    savePlayers: async (rows) => {
      for (const row of rows) players.set(`${row.guild_id}:${row.player_id}`, row);
    },
    getSnapshots: async (guildId, fromDay) =>
      [...snapshots.values()].filter((s) => s.guild_id === guildId && s.day >= fromDay).sort((a, b) => a.day.localeCompare(b.day)),
    saveSnapshots: async (rows) => {
      for (const row of rows) snapshots.set(`${row.guild_id}:${row.player_id}:${row.day}`, row);
    }
  };
}
