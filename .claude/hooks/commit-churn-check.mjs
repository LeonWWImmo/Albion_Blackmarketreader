// Claude Code PreToolUse hook (Bash, PowerShell): before a `git commit` in this repo, warns (never
// blocks) when a staged text file looks rewritten as a whole: most of its lines removed and added
// again, the mark of a line-ending or formatter rewrite. Data files the bots refresh are skipped.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKIP = /^Albion_ProfitChecker\/ui\/public\/|\.(json|lock)$|package-lock\.json$|CHANGELOG\.md$/;
const MIN_LINES = 300;

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    const input = JSON.parse(raw);
    cmd = String(input.tool_input?.command ?? "");
    if (!/albion_blackmarketreader/i.test(`${cmd}\n${input.cwd ?? ""}`.replace(/\\/g, "/"))) return;
  } catch {
    return;
  }
  if (!/\bgit\b[^\n]*\bcommit\b/.test(cmd)) return;
  let numstat = "";
  try {
    numstat = execFileSync("git", ["-C", REPO, "diff", "--cached", "--numstat"], { encoding: "utf8" });
  } catch {
    return;
  }
  const suspicious = [];
  for (const line of numstat.split("\n")) {
    const [added, removed, file] = line.split("\t");
    if (!file || added === "-" || SKIP.test(file)) continue;
    const a = Number(added), r = Number(removed);
    // a real change rarely removes and re-adds nearly the same large number of lines
    if (a >= MIN_LINES && r >= MIN_LINES && Math.min(a, r) / Math.max(a, r) > 0.9) suspicious.push(`${file} (+${a} -${r})`);
  }
  if (!suspicious.length) return;
  const text = `Possible whole-file rewrite (line endings or formatting) in the staged files: ${suspicious.join(", ")}. Check \`git diff --cached --stat\` and \`git diff --cached --ignore-all-space --ignore-cr-at-eol --stat\` before committing.`;
  process.stdout.write(JSON.stringify({ systemMessage: text, hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: text } }));
});
