import { describe, expect, it } from "vitest";
import { FACTIONS, factionById, factionFromAvatar } from "./factions";

describe("factions", () => {
  it("covers the six royal cities, each with its own accent", () => {
    expect(FACTIONS).toHaveLength(6);
    const accents = new Set(FACTIONS.map((f) => f.accent));
    expect(accents.size).toBe(6);
  });

  it("maps every crest back to its faction", () => {
    for (const faction of FACTIONS) {
      expect(factionFromAvatar(faction.crest)?.id).toBe(faction.id);
    }
  });

  it("matches an avatar stored as an absolute url", () => {
    expect(factionFromAvatar("https://example.com/picture/Carleon.png")?.id).toBe("caerleon");
  });

  it("treats the neutral account symbol as no faction", () => {
    expect(factionFromAvatar("/picture/accountsymbol.png")).toBeNull();
    expect(factionFromAvatar(null)).toBeNull();
    expect(factionFromAvatar("")).toBeNull();
  });

  it("looks a faction up by id", () => {
    expect(factionById("thetford")?.name).toBe("Thetford");
    expect(factionById("nowhere")).toBeNull();
  });

  it("gives Caerleon something other than flat black", () => {
    const caerleon = factionById("caerleon");
    expect(caerleon?.accent).toBe("#ff5a4f");
    expect(caerleon?.tagline).toMatch(/obsidian/i);
  });
});
