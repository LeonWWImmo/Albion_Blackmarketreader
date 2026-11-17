// Claude Code PreToolUse hook (Bash, PowerShell): no push to main in this repo unless the user said so.
// The project rule: never push to main unless the user writes "auf main pushen" / "auf main releasen".
// Claude marks a push the user asked for with the comment "# user-approved-main" at the end of the
// command; anything else that pushes main is denied with the reason below.
const REPO = /albion_blackmarketreader/i;

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
  // a push whose refspecs name main (origin main, HEAD:main, refs/heads/main, dev:main, --all, --mirror)
  const pushes = cmd.split(/&&|\|\||;|\n/).filter((part) => /\bgit\b.*\bpush\b/.test(part));
  const toMain = pushes.some((part) => /(^|[\s:/])main(\s|$)|--all\b|--mirror\b/.test(part.replace(/#.*$/, "")));
  // a bare "git push" right after switching to main pushes main too
  const bareOnMain = /checkout\s+(-q\s+)?main\b|switch\s+main\b/.test(cmd) && pushes.some((part) => /\bpush\s*(-q\s*)?$/.test(part.replace(/#.*$/, "").trim()));
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
