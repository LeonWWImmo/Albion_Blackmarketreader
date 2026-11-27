// GET /api/cron/<job> (rewritten to /api/cron?job=<job>, vercel.json)  ->  started by Vercel Cron
// (vercel.json "crons", times in UTC). GitHub's own schedule trigger runs hours late or skips runs, so
// every scheduled workflow is started from here by workflow_dispatch, which GitHub runs right away
// (see api/_lib/dispatch.js). One file for all jobs: every .js file under api/ is its own Vercel function.
import { dispatchWorkflow } from "./_lib/dispatch.js";

/** job (the URL part) -> [workflow file, inputs] */
export const JOBS = {
  "discord-daily": ["discord-daily.yml", { dry_run: "false", region: "both" }],
  "health-check": ["health-check.yml", { dry_run: "false" }],
  // premium, every 30 minutes
  "market-live": ["market-live.yml", {}],
  "guild-zvz": ["guild-zvz.yml", {}],
  // Discord gold: alerts every hour, channel names three times a day
  "gold-alerts": ["discord-live.yml", { alerts: "true", names: "false", dry_run: "false" }],
  "gold-names": ["discord-live.yml", { alerts: "false", names: "true", dry_run: "false" }],
  // the daily price data, in the order of vercel.json
  "data-sync-eu-1": ["daily-data-sync-eu-1.yml", {}],
  "data-sync-eu-2": ["daily-data-sync-eu-2.yml", {}],
  "data-sync-1": ["daily-data-sync-1.yml", {}],
  "data-sync-2": ["daily-data-sync-2.yml", {}],
  "food-potion-prices": ["food-potion-prices.yml", {}],
  "merge-results": ["merge-results.yml", {}],
  "daily-avg-history": ["daily-avg-history.yml", {}],
  "merge-results-eu": ["merge-results-eu.yml", {}],
  "crafting-results-prices": ["crafting-results-prices.yml", {}],
  "materials-prices-by-city": ["materials-prices-by-city.yml", {}],
  "journal-prices": ["journal-prices.yml", {}]
};

export default function handler(req, res) {
  const job = Object.hasOwn(JOBS, String(req.query?.job)) ? JOBS[req.query.job] : null;
  if (!job) return res.status(404).send("Unknown job");
  return dispatchWorkflow(req, res, job[0], job[1]);
}
