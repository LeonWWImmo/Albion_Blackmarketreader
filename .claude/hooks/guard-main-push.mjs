// Claude Code PreToolUse hook (Bash, PowerShell): no push to main in this repo unless the user said so.
// The project rule: never push to main unless the user writes "auf main pushen" / "auf main releasen".
// Claude marks a push the user asked for with the comment "# user-approved-main" at the end of the
// command; anything else that pushes main is denied with the reason below.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = /albion_blackmarketreader/i;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const branch = () => {
  try {
    return execFileSync("git", ["-C", ROOT, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }
  const cmd = String(input.tool_input?.command ?? "");
  const where = `${cmd}\n${input.cwd ?? ""}`;
  if (!REPO.test(where.replace(/\\/g, "/"))) return;
  // a push whose refspecs name main (origin main, +main, "main", HEAD:main, refs/heads/main, dev:main,
  // --all, --mirror)
  const pushes = cmd.split(/&&|\|\||;|\n/).filter((part) => /\bgit\b.*\bpush\b/.test(part));
  const toMain = pushes.some((part) => /(^|[\s:/+'"])main['"]?(\s|$)|--all\b|--mirror\b/.test(part.replace(/#.*$/, "")));
  // a push without a branch ("git push", "git push -f origin", "git push origin HEAD") pushes the
  // current branch: main when this command switches to it or the repo is on it already
  const bare = pushes.some((part) => /\bpush((\s+-[\w-]+)*)(\s+[\w.-]+)?(\s+HEAD)?\s*$/.test(part.replace(/#.*$/, "").trim()));
  const bareOnMain = bare && (/checkout\s+(-q\s+)?main\b|switch\s+main\b/.test(cmd) || branch() === "main");
  if (!toMain && !bareOnMain) return;
  if (/#\s*user-approved-main\b/.test(cmd)) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "Blocked: push to main in Albion_Blackmarketreader. Project rule: main only when the user explicitly said \"auf main pushen\" or \"auf main releasen\" in this conversation. If they did, run the same command again with the comment \"# user-approved-main\" at the end; otherwise ask the user first."
      }
    })
  );
});
