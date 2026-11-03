// GET /api/cron/discord-daily  ->  started by Vercel Cron (vercel.json) every day after the 10:00 UTC reset.
// Starts the Discord Daily Update workflow as a real post (see api/_lib/dispatch.js).
import { dispatchWorkflow } from "../_lib/dispatch.js";

export default function handler(req, res) {
  return dispatchWorkflow(req, res, "discord-daily.yml", { dry_run: "false", region: "both" });
}
