// Shared by the Vercel Cron endpoints in api/cron: GitHub's own schedule trigger can run hours late,
// so Vercel Cron starts the workflow by workflow_dispatch instead, which GitHub runs right away.
// Vercel signs the call with CRON_SECRET; GITHUB_DISPATCH_TOKEN is a fine-grained token with
// "Actions: write" on this repository only.
const REPO = "https://api.github.com/repos/LeonWWImmo/Albion_Blackmarketreader";

/** Answers a Vercel Cron call by starting `workflow` on main with `inputs`. */
export async function dispatchWorkflow(req, res, workflow, inputs) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).send("Unauthorized");

  const github = await fetch(`${REPO}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "BlackmarketReader/1.0 (+https://blackmarketreader.com)"
    },
    body: JSON.stringify({ ref: "main", inputs })
  });
  if (!github.ok) {
    console.error(`${workflow} dispatch failed`, github.status, await github.text());
    return res.status(502).json({ started: false });
  }
  return res.status(200).json({ started: true });
}
