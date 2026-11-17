import { describe, expect, it } from "vitest";
import { sanitizeAvatarUrl } from "./avatarUrl";

const SITE = "https://blackmarketreader.com";

describe("sanitizeAvatarUrl", () => {
  it("keeps our crests as a path, also when saved as a full address of another of our hosts", () => {
    expect(sanitizeAvatarUrl("/picture/Bridgewatch.png", SITE)).toBe("/picture/Bridgewatch.png");
    expect(sanitizeAvatarUrl("http://localhost:5173/picture/Bridgewatch.png", SITE)).toBe("/picture/Bridgewatch.png");
    expect(sanitizeAvatarUrl("https://albion-blackmarketreader-x.vercel.app/picture/Carleon.png", SITE)).toBe("/picture/Carleon.png");
    expect(sanitizeAvatarUrl("picture/Carleon.png", SITE)).toBe("/picture/Carleon.png");
  });

  it("keeps other web addresses and refuses scripts and tricks", () => {
    expect(sanitizeAvatarUrl("https://render.albiononline.com/v1/item/T4_BAG.png", SITE)).toBe("https://render.albiononline.com/v1/item/T4_BAG.png");
    for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAAA", "//evil.example/a.png", "/picture\\..\\x.png", "", null, undefined]) {
      expect(sanitizeAvatarUrl(bad, SITE)).toBe("/picture/accountsymbol.png");
    }
  });
});
