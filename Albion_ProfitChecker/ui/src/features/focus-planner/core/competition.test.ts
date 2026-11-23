import { describe, expect, it } from "vitest";
import { competitionOf } from "./competition";

const depth = {
  sell: [[41980, 3], [42000, 29], [45000, 18]] as Array<[number, number]>,
  sellTotal: 50,
  buy: [[38500, 8, 1]] as Array<[number, number, number]>,
  buyTotal: 8,
  seen: 0
};

describe("competitionOf", () => {
  it("counts what is listed at or below the price against a day's sales", () => {
    expect(competitionOf(depth, 42000, 22)).toEqual({ listed: 50, ahead: 32, wanted: 8, days: 32 / 22, crowded: false });
    expect(competitionOf(depth, 42000, 10)).toMatchObject({ days: 3.2, crowded: true });
  });

  it("says nothing without seen sell orders", () => {
    expect(competitionOf(null, 1, 1)).toBeNull();
    expect(competitionOf({ ...depth, sell: [], sellTotal: 0 }, 42000, 22)).toBeNull();
  });
});
