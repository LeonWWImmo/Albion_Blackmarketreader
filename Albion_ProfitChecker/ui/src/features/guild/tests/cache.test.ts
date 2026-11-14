import { afterEach, describe, expect, it, vi } from "vitest";
import type { GuildPageData } from "../api";
import { MEMORY_LIMIT, clearCache, forget, loadOnce, peek, remember } from "../core/cache";
import { cachedGuild } from "../core/guildData";
import { crestColors } from "../ui/GuildCrest";

afterEach(() => {
  clearCache();
  vi.unstubAllGlobals();
});

describe("guild cache", () => {
  it("asks once for many callers and remembers the answer with its age", async () => {
    const load = vi.fn(async () => ({ name: "Angry fuzzies" }));
    const [a, b] = await Promise.all([loadOnce("g", load), loadOnce("g", load)]);
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
    const hit = peek<{ name: string }>("g", Date.now() + 5000);
    expect(hit?.data.name).toBe("Angry fuzzies");
    expect(hit?.age).toBeGreaterThanOrEqual(5000);
  });

  it("does not keep a failed load, so the next call asks again", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("ok");
    await expect(loadOnce("g", load)).rejects.toThrow("down");
    expect(peek("g")).toBeNull();
    expect(await loadOnce("g", load)).toBe("ok");
  });

  it("forgets an entry, and works without browser storage", () => {
    remember("g", 1, 0);
    expect(peek("g", 10)).toEqual({ data: 1, age: 10 });
    forget("g");
    expect(peek("g")).toBeNull();
  });

  it("reads an entry another page view stored in sessionStorage", () => {
    const store = new Map<string, string>([
      ["gd-cache:v3:g", JSON.stringify({ at: 100, data: { n: 7 } })],
      ["gd-cache:old", JSON.stringify({ at: 100, data: { shape: "before an update" } })]
    ]);
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    expect(peek("g", 150)).toEqual({ data: { n: 7 }, age: 50 });
    // a copy stored by an older version of the page is never read
    expect(peek("old", 150)).toBeNull();
  });
});

describe("guild cache rules", () => {
  it("starts a new load when forced, and the newer answer wins", async () => {
    let release: (v: string) => void = () => undefined;
    const slow = loadOnce("g", () => new Promise<string>((resolve) => (release = resolve)));
    const forced = await loadOnce("g", async () => "after the mark", true);
    release("before the mark");
    await slow;
    expect(forced).toBe("after the mark");
    expect(peek("g")?.data).toBe("after the mark");
  });

  it("keeps only the most recently used entries in memory", () => {
    for (let i = 0; i <= MEMORY_LIMIT; i++) remember(`k${i}`, i);
    expect(peek("k0")).toBeNull();
    expect(peek(`k${MEMORY_LIMIT}`)?.data).toBe(MEMORY_LIMIT);
  });

  it("never hands out a cached guild with another id than asked for", () => {
    const page = (id: string) => ({ guild: { id, slug: "angry-fuzzies" } }) as unknown as GuildPageData;
    remember("guild:eu:slug:angry-fuzzies", page("A"));
    remember("guild:eu:id:B", page("A")); // cannot happen, but must not leak
    expect(cachedGuild("eu", "angry-fuzzies", null)?.data.guild.id).toBe("A");
    expect(cachedGuild("eu", "angry-fuzzies", "B")).toBeNull();
  });
});

describe("guild crest", () => {
  it("gives every guild its own colours, always the same", () => {
    expect(crestColors("RCp44ZeoSKKMAqC6HzLqLA")).toEqual(crestColors("RCp44ZeoSKKMAqC6HzLqLA"));
    expect(crestColors("RCp44ZeoSKKMAqC6HzLqLA")).not.toEqual(crestColors("sOtDp2F7RsGsP6Od2-nUEw"));
  });
});
