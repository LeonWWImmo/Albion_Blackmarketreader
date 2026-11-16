import { describe, expect, it } from "vitest";
import type { BattleGuild } from "../api";
import { outcomeOf, sidesOf } from "../BattlePage";

const guild = (id: string, name: string, allianceName: string | null, players: number, kills: number, deaths: number): BattleGuild => ({ id, name, allianceName, players, kills, deaths, killFame: kills * 10 });

describe("battle sides", () => {
  it("puts an alliance's guilds on one side, a guild without one on its own, most players first", () => {
    const sides = sidesOf([guild("a", "Alpha", "ONE", 10, 5, 2), guild("b", "Beta", "ONE", 8, 3, 1), guild("c", "Gamma", null, 20, 4, 9), guild("d", "Delta", "TWO", 3, 0, 3)]);
    expect(sides.map((s) => s.name)).toEqual(["Gamma", "[ONE]", "[TWO]"]);
    expect(sides[1]).toMatchObject({ guilds: ["Alpha", "Beta"], guildIds: ["a", "b"], players: 18, kills: 8, deaths: 3, killFame: 80 });
  });

  it("says plainly how a side came out", () => {
    expect(outcomeOf({ kills: 5, deaths: 2 }).text("[ONE]")).toBe("[ONE] came out ahead: 5 kills, 2 deaths.");
    expect(outcomeOf({ kills: 1, deaths: 4 }).tone).toBe("is-red");
    expect(outcomeOf({ kills: 3, deaths: 3 }).text("X")).toContain("even");
  });
});
