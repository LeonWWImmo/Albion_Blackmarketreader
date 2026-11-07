// GET /api/aodp/<endpoint>?...  ->  Albion Online Data Project prices, cached by the CDN.
// One function for every AODP endpoint (gold, festivities, prices, quotes, history), so new ones do
// not count against the Hobby plan's 12 functions; the list lives in api/_lib/aodp.js.
import { handleAodp, sendResult } from "../_lib/aodp.js";

export default async function handler(req, res) {
  const { endpoint, ...query } = req.query ?? {};
  sendResult(res, await handleAodp(String(endpoint ?? ""), query));
}
