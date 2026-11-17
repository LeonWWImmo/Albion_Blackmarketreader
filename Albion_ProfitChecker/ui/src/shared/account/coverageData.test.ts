import { describe, expect, it } from "vitest";
import { ageText, cityCoverage, coverageLevel } from "./coverageData";

describe("price coverage", () => {
  it("counts the materials with a price per city", () => {
    const data = {
      cities: ["Lymhurst", "Caerleon"],
      items: [{ prices: { Lymhurst: 10, Caerleon: 0 } }, { prices: { Lymhurst: 11, Caerleon: 9 } }, { prices: {} }, {}]
    };
    expect(cityCoverage(data)).toEqual([
      { city: "Lymhurst", percent: 50 },
      { city: "Caerleon", percent: 25 }
    ]);
    expect(cityCoverage({ cities: ["Lymhurst"] })).toEqual([{ city: "Lymhurst", percent: 0 }]);
  });

  it("colours like the daily check, half the bar for Brecilien", () => {
    expect(coverageLevel("Lymhurst", 80)).toBe("good");
    expect(coverageLevel("Lymhurst", 50)).toBe("thin");
    expect(coverageLevel("Caerleon", 34)).toBe("poor");
    expect(coverageLevel("Brecilien", 40)).toBe("good");
    expect(coverageLevel("Brecilien", 38)).toBe("thin");
    expect(coverageLevel("Brecilien", 22)).toBe("poor");
  });

  it("writes ages short", () => {
    expect(ageText(5 * 60000)).toBe("5 min");
    expect(ageText(21 * 36e5)).toBe("21 h");
    expect(ageText(72 * 36e5)).toBe("3 d");
  });
});
