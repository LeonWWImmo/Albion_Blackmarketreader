// GET /api/cron/discord-daily  ->  started by Vercel Cron (vercel.json) every day after the 10:00 UTC reset.
// GitHub's own schedule trigger can run hours late, so this starts the Discord Daily Update workflow
// by workflow_dispatch instead, which GitHub runs right away. Vercel signs the call with CRON_SECRET;
// GITHUB_DISPATCH_TOKEN is a fine-grained token with "Actions: write" on this repository only.
const WORKFLOW =
  "https://api.github.com/repos/LeonWWImmo/Albion_Blackmarketreader/actions/workflows/discord-daily.yml/dispatches";

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).send("Unauthorized");

  const github = await fetch(WORKFLOW, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "BlackmarketReader/1.0 (+https://blackmarketreader.com)"
    },
    body: JSON.stringify({ ref: "main", inputs: { dry_run: "false", region: "both" } })
  });
  if (!github.ok) {
    console.error("discord daily dispatch failed", github.status, await github.text());
    return res.status(502).json({ started: false });
  }
  return res.status(200).json({ started: true });
}
