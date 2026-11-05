// GET /api/aodp/prices?region=eu|us&ids=T4_BAG,T5_2H_CROSSBOW@1  ->  { region, fetchedAt, prices }
// Black Market and city order prices per item and quality for the Loot Split, cached by the CDN
// for 5 minutes (see api/_lib/aodp.js).
import { getPrices, sendResult } from "../_lib/aodp.js";

export default async function handler(req, res) {
  sendResult(res, await getPrices(req.query?.region, req.query?.ids));
}
