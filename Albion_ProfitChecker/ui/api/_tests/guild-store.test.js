import { describe, expect, it } from "vitest";
import { createGuildStore } from "../_lib/guildStore.js";
import { createRateLimiter } from "../_lib/rateLimit.js";

/** Just enough of supabase-js: a chainable query; `range()` answers from `rows`, an awaited update answers `updateError` or one row. */
function fakeDb({ rows = [], updateError = null } = {}) {
  const pages = [];
  const query = () => {
    const q = {
      select: () => q,
      eq: () => q,
      gte: () => q,
      order: () => q,
      is: () => q,
      update: () => q,
      range: async (from, to) => {
        pages.push(from);
        return { data: rows.slice(from, to + 1), error: null };
      },
      then: (resolve) => resolve(updateError ? { data: null, error: updateError } : { data: [{ id: "g" }], error: null })
    };
    return q;
  };
  return { db: { from: query }, pages };
}

describe("guild store", () => {
  it("reads every player page by page past Supabase's 1000-row limit", async () => {
    const { db, pages } = fakeDb({ rows: Array.from({ length: 2345 }, (_, i) => ({ player_id: `p${i}` })) });
    expect(await createGuildStore(db).getPlayers("g")).toHaveLength(2345);
    expect(pages).toEqual([0, 1000, 2000]);
  });

  it("asks once more after a full page of snapshots", async () => {
    const { db, pages } = fakeDb({ rows: Array.from({ length: 1000 }, (_, i) => ({ day: "2026-11-14", player_id: `p${i}` })) });
    expect(await createGuildStore(db).getSnapshots("g", "2026-11-01")).toHaveLength(1000);
    expect(pages).toEqual([0, 1000]);
  });

  it("turns the database's one-guild-per-player rule into a refused claim", async () => {
    const claim = (updateError) => createGuildStore(fakeDb({ updateError }).db).claimGuild("g", "u", "2026-11-14");
    expect(await claim({ code: "23505", message: "duplicate key" })).toBe(false);
    await expect(claim({ code: "XX000", message: "boom" })).rejects.toThrow("database: boom");
    expect(await claim(null)).toBe(true);
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
