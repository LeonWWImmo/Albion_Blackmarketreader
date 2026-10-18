// GET /api/aodp/gold?region=eu|us  ->  { region, fetchedAt, points: [[unixSeconds, silverPerGold], ...] }
// Hourly gold prices for the last 90 days, cached by the CDN for 10 minutes (see api/_lib/aodp.js).
import { getGold, sendResult } from "../_lib/aodp.js";

export default async function handler(req, res) {
  sendResult(res, await getGold(req.query?.region));
}
