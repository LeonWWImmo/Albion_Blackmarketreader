import { describe, expect, it } from "vitest";
import { applyFocusEfficiency, computeFocusEfficiency, getMasteryGroup, getSpecBonuses, getStationForItem } from "./data";

const SWORDS = [
  { id: "MAIN_SWORD", categoryKey: "swords" },
  { id: "2H_CLAYMORE", categoryKey: "swords" },
  { id: "MAIN_SCIMITAR_MORGANA", categoryKey: "swords" }
];
const progress = (specs: Record<string, number>, masteries: Record<string, number> = {}) => ({ specs, masteries });

describe("computeFocusEfficiency (game data: ao-bin-dumps)", () => {
  it("a Broadsword at 100 mastery and 100 spec has 31.000 efficiency: own spec gets the unique and the shared bonus", () => {
    expect(computeFocusEfficiency(progress({ MAIN_SWORD: 100 }, { swords: 100 }), "MAIN_SWORD", SWORDS[0], SWORDS)).toBe(31000);
  });

  it("other specs of the group add their shared bonus (artefacts 15, regular 30)", () => {
    const p = progress({ MAIN_SWORD: 100, "2H_CLAYMORE": 100, MAIN_SCIMITAR_MORGANA: 100 }, { swords: 100 });
    expect(computeFocusEfficiency(p, "MAIN_SWORD", SWORDS[0], SWORDS)).toBe(31000 + 3000 + 1500);
    expect(computeFocusEfficiency(p, "MAIN_SCIMITAR_MORGANA", SWORDS[2], SWORDS)).toBe(3000 + 100 * 265 + 3000 + 3000);
  });

  it("mastery alone: 30 per level", () => {
    expect(computeFocusEfficiency(progress({}, { swords: 50 }), "MAIN_SWORD", SWORDS[0], SWORDS)).toBe(1500);
  });

  it("focus halves every 10.000 efficiency", () => {
    expect(applyFocusEfficiency(1286, 10000)).toBeCloseTo(643, 6);
    expect(applyFocusEfficiency(1000, 31000)).toBeCloseTo(1000 * 0.5 ** 3.1, 6);
  });
});

describe("getSpecBonuses", () => {
  it("special nodes", () => {
    expect(getSpecBonuses({ id: "BAG_INSIGHT" })).toEqual({ unique: 310, mutual: 30 });
    expect(getSpecBonuses({ id: "CAPE" })).toEqual({ unique: 340, mutual: 30 });
    expect(getSpecBonuses({ id: "2H_TOOL_SIEGEHAMMER" })).toEqual({ unique: 310, mutual: 30 });
    expect(getSpecBonuses({ id: "ARMOR_LEATHER_HELL" })).toEqual({ unique: 250, mutual: 12.5 });
    expect(getSpecBonuses({ id: "MAIN_SWORD_CRYSTAL" })).toEqual({ unique: 250, mutual: 2.15 });
    expect(getSpecBonuses({ id: "OFF_BOOK" })).toEqual({ unique: 250, mutual: 90 });
  });
});

describe("off-hand groups", () => {
  it.each([
    ["OFF_TOWERSHIELD_UNDEAD", "warrior", "offhand-shield"],
    ["OFF_LAMP_UNDEAD", "hunter", "offhand-hunter"],
    ["OFF_JESTERCANE_HELL", "hunter", "offhand-hunter"],
    ["OFF_TALISMAN_AVALON", "hunter", "offhand-hunter"],
    ["OFF_TOTEM_KEEPER", "mage", "offhand-mage"],
    ["OFF_HORN_KEEPER", "hunter", "offhand-hunter"]
  ])("%s is a %s off-hand", (id, station, group) => {
    expect(getStationForItem({ id, categoryKey: "offhand" })).toBe(station);
    expect(getMasteryGroup({ id, categoryKey: "offhand" })).toBe(group);
  });
});
