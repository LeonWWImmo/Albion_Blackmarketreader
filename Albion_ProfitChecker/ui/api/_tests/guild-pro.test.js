// Guild Pro: several marked guilds per server and attendance over 30 / 90 days (api/_lib/guildApi.js
// mark, unmark, mine, pro-fights, fights-history).
import { describe, expect, it } from "vitest";
import { GID, NOW, OTHER, setup } from "./guild-kit.js";

const HOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-12";
const ours = (n) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, name: `Our${i}`, kills: 1, deaths: 0, killFame: 100 }));
const fight = (id, startTime, of = 3) => ({ id, startTime, players: 30, kills: 10, fame: 1000, ours: ours(of) });
const DAY = 86_400_000;
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();

/** Ann has premium, Bo has not. */
function pro() {
  const kit = setup();
  kit.deps.premium = async (userId) => userId === "user-ann";
  kit.deps.actionsSecret = "actions-123";
  const mine = (token) => kit.call("mine", { token }).then((r) => r.body.guilds);
  const unmark = (token, id) => kit.call("unmark", { method: "POST", token, body: id ? { region: "eu", id } : { region: "eu" } });
  const runJob = () => kit.call("pro-fights", { authorization: "Bearer actions-123" });
  const history = (token, days = 90, id = GID) => kit.call("fights-history", { token, query: { region: "eu", id, days: String(days) } });
  return { ...kit, mine, unmark, runJob, history };
}

describe("several guilds (Guild Pro)", () => {
  it("one guild per server without premium, more with it; the first stays the main one", async () => {
    const { markAs, mine } = pro();
    expect((await markAs("tok-bo")).status).toBe(200);
    expect(await markAs("tok-bo", OTHER)).toMatchObject({ status: 409, body: { error: expect.stringContaining("Unmark it first") } });

    expect((await markAs("tok-ann")).status).toBe(200);
    expect((await markAs("tok-ann", OTHER)).status).toBe(200);
    expect((await markAs("tok-ann", OTHER)).status).toBe(200); // marking it again changes nothing
    const guilds = await mine("tok-ann");
    expect(guilds.map((g) => [g.id, g.main])).toEqual([
      [GID, true],
      [OTHER, false]
    ]);
  });

  it("unmarks the one asked for; the next oldest becomes the main one", async () => {
    const { markAs, mine, unmark } = pro();
    await markAs("tok-ann");
    await markAs("tok-ann", OTHER);
    expect((await unmark("tok-ann", OTHER)).body.unmarked).toBe(true);
    expect((await mine("tok-ann")).map((g) => g.id)).toEqual([GID]);
    await markAs("tok-ann", OTHER);
    expect((await unmark("tok-ann")).body.unmarked).toBe(true); // without id: the main one
    expect((await mine("tok-ann")).map((g) => [g.id, g.main])).toEqual([[OTHER, true]]);
    expect((await unmark("tok-ann", "bad id!")).status).toBe(400);
  });

  it("the Discord report goes out for the main guild only", async () => {
    const { markAs, call, store } = pro();
    await markAs("tok-ann");
    await call("hook-save", { method: "POST", token: "tok-ann", body: { region: "eu", url: HOOK } });
    await markAs("tok-ann", OTHER);
    expect((await store.webhooksOfGuild(GID, "eu")).map((w) => w.user_id)).toEqual(["user-ann"]);
    expect(await store.webhooksOfGuild(OTHER, "eu")).toEqual([]);
  });
});

describe("attendance over 90 days (Guild Pro)", () => {
  it("the job needs the Actions secret and keeps the fights of premium players' guilds only", async () => {
    const { markAs, call, runJob, store, deps } = pro();
    await markAs("tok-ann");
    await markAs("tok-bo", OTHER);
    deps.gameinfo.getBattles.mockResolvedValue([fight(7, ago(3600_000)), fight(6, ago(2 * DAY)), fight(5, ago(9 * DAY)), fight(4, ago(3600_000), 0)]);
    expect((await call("pro-fights", {})).status).toBe(401);
    expect((await runJob()).body).toEqual({ guilds: 1, read: 1, stored: 2 });
    // 9 days back is further than the killboard's first read; a fight without us is no attendance
    expect((await store.getStoredFights(GID, ago(30 * DAY))).map((f) => f.id)).toEqual([7, 6]);
    expect(await store.getStoredFights(OTHER, ago(30 * DAY))).toEqual([]);
  });

  it("reads on from the newest kept fight and drops fights older than 95 days", async () => {
    const { markAs, runJob, store, deps } = pro();
    await markAs("tok-ann");
    await store.saveFights(GID, [fight(1, ago(100 * DAY)), fight(2, ago(40 * DAY)), fight(3, ago(5 * 3600_000))]);
    deps.gameinfo.getBattles.mockResolvedValue([fight(9, ago(600_000), 8), fight(3, ago(5 * 3600_000), 9), fight(8, ago(4 * 3600_000))]);
    await runJob();
    const kept = await store.getStoredFights(GID, ago(200 * DAY));
    expect(kept.map((f) => f.id)).toEqual([9, 8, 3, 2]);
    // fight 3 is the newest kept one: read again within the 2 h overlap, it may have grown
    expect(kept.find((f) => f.id === 3).ours).toHaveLength(9);
  });

  it("fights-history: premium only, the kept fights of 30 or 90 days with how far back they reach", async () => {
    const { markAs, history, store, call } = pro();
    await markAs("tok-ann");
    expect((await call("fights-history", { query: { region: "eu", id: GID, days: "90" } })).status).toBe(401);
    expect((await history("tok-bo")).status).toBe(403);
    expect((await history("tok-ann", 7)).status).toBe(400);
    expect((await history("tok-ann")).body).toEqual({ fights: [], days: 90, complete: false, since: null, kept: false });
    await store.saveFights(GID, [fight(2, ago(40 * DAY)), fight(3, ago(DAY))]);
    const ninety = await history("tok-ann");
    expect(ninety.body).toMatchObject({ days: 90, complete: false, since: ago(40 * DAY), kept: true });
    expect(ninety.body.fights.map((f) => f.id)).toEqual([3, 2]);
    const thirty = await history("tok-ann", 30);
    expect(thirty.body).toMatchObject({ complete: true });
    expect(thirty.body.fights.map((f) => f.id)).toEqual([3]);
  });
});
