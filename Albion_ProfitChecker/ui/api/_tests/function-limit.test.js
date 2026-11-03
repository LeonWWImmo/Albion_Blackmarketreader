import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const API = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// every .js file under api/ outside "_" folders becomes one Vercel function
function functions(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith("_")) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return functions(full);
    return entry.name.endsWith(".js") ? [path.relative(API, full)] : [];
  });
}

describe("Vercel functions", () => {
  it("stay within the Hobby plan's 12 per deployment (a 13th makes every deploy fail)", () => {
    expect(functions(API).length).toBeLessThanOrEqual(12);
  });
});
