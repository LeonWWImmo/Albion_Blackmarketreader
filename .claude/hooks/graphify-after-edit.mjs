// Claude Code PostToolUse hook (Edit, Write): keeps the code graph of the ui folder current. A code
// file under ui/src, ui/api or ui/scripts changed: `graphify update .` runs in the background, once
// for a burst of edits (it waits until no edit came for a few seconds). Never blocks the edit.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const UI = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "Albion_ProfitChecker", "ui");
const STAMP = join(UI, "graphify-out", ".last-edit");
const QUIET_MS = 4000;

if (process.argv[2] === "--run") {
  // the background runner: only the last edit of a burst updates the graph
  const mine = process.argv[3];
  setTimeout(() => {
    let last = "";
    try {
      last = readFileSync(STAMP, "utf8");
    } catch {}
    if (last !== mine) return;
    spawn("graphify", ["update", "."], { cwd: UI, stdio: "ignore", shell: true, windowsHide: true });
  }, QUIET_MS);
} else {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    let file = "";
    try {
      const input = JSON.parse(raw);
      file = String(input.tool_input?.file_path ?? input.tool_response?.filePath ?? "");
    } catch {
      return;
    }
    const norm = file.replace(/\\/g, "/");
    if (!/albion_blackmarketreader\/albion_profitchecker\/ui\/(src|api|scripts)\//i.test(norm)) return;
    if (!/\.(ts|tsx|js|mjs|cjs|jsx|css)$/i.test(norm)) return;
    const stamp = `${Date.now()}-${process.pid}`;
    try {
      mkdirSync(dirname(STAMP), { recursive: true });
      writeFileSync(STAMP, stamp);
    } catch {
      return;
    }
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--run", stamp], { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  });
}
