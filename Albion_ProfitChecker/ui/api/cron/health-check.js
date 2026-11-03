// GET /api/cron/health-check  ->  started by Vercel Cron (vercel.json) every day at 14:00 UTC.
// Starts the Daily Health Check workflow, which posts its report to #status (see api/_lib/dispatch.js).
import { dispatchWorkflow } from "../_lib/dispatch.js";

export default function handler(req, res) {
  return dispatchWorkflow(req, res, "health-check.yml", { dry_run: "false" });
}
