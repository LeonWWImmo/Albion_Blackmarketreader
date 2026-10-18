// GET /api/aodp/festivities?region=eu|us  ->  { region, fetchedAt, confirmed, confirmedAt, expiresAt, events }
// Today's crafting bonuses (kind 2) and this week's activity events (kind 1), cached by the CDN
// for 10 minutes (see api/_lib/aodp.js).
import { getFestivities, sendResult } from "../_lib/aodp.js";

export default async function handler(req, res) {
  sendResult(res, await getFestivities(req.query?.region));
}
