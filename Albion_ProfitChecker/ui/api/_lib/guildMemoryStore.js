// The guild store (api/_lib/guildStore.js) in memory, with the database's rules: one manager per
// guild, one guild per manager. For tests and `npm run dev`, which has no database key.
export function createMemoryGuildStore() {
  const guilds = new Map();
  const players = new Map();
  const snapshots = new Map();
  const all = () => [...guilds.values()];
  return {
    guilds,
    players,
    snapshots,
    getGuild: async (id) => guilds.get(id) ?? null,
    getGuildBySlug: async (region, slug) => all().find((g) => g.region === region && g.slug === slug) ?? null,
    getManagedBy: async (userId) => all().find((g) => g.manager_id === userId) ?? null,
    isSlugTaken: async (region, slug, exceptId) => all().some((g) => g.region === region && g.slug === slug && g.id !== exceptId),
    saveGuild: async (row) => {
      guilds.set(row.id, { manager_id: null, tracked_since: null, last_synced_at: null, ...guilds.get(row.id), ...row });
    },
    claimGuild: async (id, userId, trackedSince) => {
      const guild = guilds.get(id);
      if (!guild || guild.manager_id || all().some((g) => g.manager_id === userId)) return false;
      guilds.set(id, { ...guild, manager_id: userId, tracked_since: trackedSince });
      return true;
    },
    releaseGuild: async (id, userId) => {
      const guild = guilds.get(id);
      if (guild?.manager_id === userId) guilds.set(id, { ...guild, manager_id: null });
    },
    dueGuilds: async (before, limit) =>
      all()
        .filter((g) => g.manager_id && (!g.last_synced_at || g.last_synced_at < before))
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
