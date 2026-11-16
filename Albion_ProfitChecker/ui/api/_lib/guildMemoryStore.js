// The guild store (api/_lib/guildStore.js) in memory, with the database's rules: one marked guild per
// player, any number of players per guild. For tests and `npm run dev`, which has no database key.
export function createMemoryGuildStore() {
  const guilds = new Map();
  const marks = new Map(); // user id -> guild id
  const players = new Map();
  const snapshots = new Map();
  const webhooks = new Map(); // user id -> { user_id, url, name, last_sent_on }
  const regearPaid = new Map(); // "user:region:event" -> row
  const regearFights = new Map(); // "user:region:battle" -> row
  const bankLogs = new Map(); // "user:guild" -> rows
  const splits = new Map(); // id -> row
  const all = () => [...guilds.values()];
  return {
    guilds,
    marks,
    players,
    snapshots,
    webhooks,
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
    },
    getWebhook: async (userId) => webhooks.get(userId) ?? null,
    saveWebhook: async (userId, url, name) => {
      webhooks.set(userId, { user_id: userId, url, name, last_sent_on: null });
    },
    removeWebhook: async (userId) => webhooks.delete(userId),
    webhooksOfGuild: async (guildId) => [...webhooks.values()].filter((w) => marks.get(w.user_id) === guildId),
    setWebhookSent: async (userId, day) => {
      if (webhooks.has(userId)) webhooks.set(userId, { ...webhooks.get(userId), last_sent_on: day });
    },
    regearPaid,
    bankLogs,
    splits,
    getRegearPaid: async (userId, region, battleId) => [...regearPaid.values()].filter((r) => r.user_id === userId && r.region === region && r.battle_id === battleId).map((r) => r.event_id),
    setRegearPaid: async (userId, region, battleId, eventId, paid) => {
      const key = `${userId}:${region}:${eventId}`;
      if (paid) regearPaid.set(key, { user_id: userId, region, battle_id: battleId, event_id: eventId });
      else regearPaid.delete(key);
    },
    regearFights,
    listRegearFights: async (userId, region, guildId) =>
      [...regearFights.values()].filter((r) => r.user_id === userId && r.region === region && r.guild_id === guildId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    countRegearFights: async (userId) => [...regearFights.values()].filter((r) => r.user_id === userId).length,
    setRegearFight: async (userId, region, guildId, battleId, info, at) => {
      const key = `${userId}:${region}:${battleId}`;
      if (info) regearFights.set(key, { user_id: userId, region, guild_id: guildId, battle_id: battleId, info, created_at: at });
      else regearFights.delete(key);
    },
    getBankLog: async (userId, guildId) => bankLogs.get(`${userId}:${guildId}`) ?? [],
    saveBankLog: async (userId, guildId, rows) => {
      if (rows.length) bankLogs.set(`${userId}:${guildId}`, rows);
      else bankLogs.delete(`${userId}:${guildId}`);
    },
    listSplits: async (userId, guildId) => [...splits.values()].filter((s) => s.user_id === userId && s.guild_id === guildId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    countSplits: async (userId, guildId) => [...splits.values()].filter((s) => s.user_id === userId && s.guild_id === guildId).length,
    addSplit: async (row) => {
      const saved = { id: crypto.randomUUID(), ...row };
      splits.set(saved.id, saved);
      return saved;
    },
    updateSplit: async (userId, id, changes) => {
      const row = splits.get(id);
      if (!row || row.user_id !== userId) return null;
      splits.set(id, { ...row, ...changes });
      return splits.get(id);
    },
    removeSplit: async (userId, id) => {
      if (splits.get(id)?.user_id !== userId) return false;
      return splits.delete(id);
    }
  };
}
