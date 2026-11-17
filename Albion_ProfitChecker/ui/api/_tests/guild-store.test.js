import { describe, expect, it } from "vitest";
import { createGuildStore } from "../_lib/guildStore.js";
import { createRateLimiter } from "../_lib/rateLimit.js";

/**
 * Just enough of supabase-js: every table answers `range()` page by page from `tables[name]`, and an
 * awaited query (insert, delete, update, select without range) answers `results[name]`.
 */
function fakeDb({ tables = {}, results = {} } = {}) {
  const pages = [];
  const from = (name) => {
    const q = {
      select: () => q,
      eq: () => q,
      gte: () => q,
      in: () => q,
      order: () => q,
      insert: () => q,
      delete: () => q,
      update: () => q,
      maybeSingle: () => q,
      range: async (start, end) => {
        pages.push([name, start]);
        return { data: (tables[name] ?? []).slice(start, end + 1), error: null };
      },
      then: (resolve) => resolve(results[name] ?? { data: tables[name] ?? null, error: null })
    };
    return q;
  };
  return { db: { from }, pages };
}

describe("guild store", () => {
  it("reads every player page by page past Supabase's 1000-row limit", async () => {
    const { db, pages } = fakeDb({ tables: { guild_players: Array.from({ length: 2345 }, (_, i) => ({ player_id: `p${i}` })) } });
    expect(await createGuildStore(db).getPlayers("g")).toHaveLength(2345);
    expect(pages.map((p) => p[1])).toEqual([0, 1000, 2000]);
  });

  it("asks once more after a full page of snapshots", async () => {
    const { db, pages } = fakeDb({ tables: { guild_snapshots: Array.from({ length: 1000 }, (_, i) => ({ day: "2026-11-14", player_id: `p${i}` })) } });
    expect(await createGuildStore(db).getSnapshots("g", "2026-11-01")).toHaveLength(1000);
    expect(pages.map((p) => p[1])).toEqual([0, 1000]);
  });

  it("turns the database's one-guild-per-player-and-server rule into a refused mark", async () => {
    const mark = (result) => createGuildStore(fakeDb({ results: { guild_marks: result } }).db).addMark("u", "eu", "g");
    expect(await mark({ data: null, error: { code: "23505", message: "duplicate key" } })).toBe(false);
    await expect(mark({ data: null, error: { code: "XX000", message: "boom" } })).rejects.toThrow("database: boom");
    expect(await mark({ data: null, error: null })).toBe(true);
  });

  it("tells which guild a removed mark was on", async () => {
    const remove = (rows) => createGuildStore(fakeDb({ results: { guild_marks: { data: rows, error: null } } }).db).removeMark("u", "eu");
    expect(await remove([{ guild_id: "g1" }])).toBe("g1");
    expect(await remove([])).toBeNull();
  });

  it("finds the marked guilds that are due, oldest sync first, each once", async () => {
    const { db } = fakeDb({
      tables: { guild_marks: [{ guild_id: "a" }, { guild_id: "b" }, { guild_id: "a" }, { guild_id: "c" }] },
      results: {
        guilds: {
          data: [
            { id: "a", last_synced_at: "2026-11-13T03:30:00Z" },
            { id: "b", last_synced_at: null },
            { id: "c", last_synced_at: "2026-11-14T03:30:00Z" }
          ],
          error: null
        }
      }
    });
    const due = await createGuildStore(db).dueGuilds("2026-11-14T00:00:00Z", 10);
    expect(due.map((g) => g.id)).toEqual(["b", "a"]);
  });
});

describe("rate limiter", () => {
  it("allows `limit` requests per window and client, then starts over", () => {
    let time = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => time });
    expect([limiter.take("a"), limiter.take("a"), limiter.take("a"), limiter.take("b")]).toEqual([true, true, false, true]);
    time = 1000;
    expect(limiter.take("a")).toBe(true);
  });

  it("forgets the oldest clients beyond its size", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxClients: 2, now: () => 0 });
    limiter.take("a");
    limiter.take("b");
    limiter.take("c"); // pushes "a" out
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("c")).toBe(false);
  });
});
