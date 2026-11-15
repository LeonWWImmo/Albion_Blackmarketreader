// Item names and market prices for chest logs: shared by the Loot Split and the guild Bank log.
import { assetUrl } from "@shared/assets/assets";
import type { Region } from "@shared/types";
import type { PriceTable } from "./valuation";

const PRICE_CHUNK = 300;

let namesCache: Promise<Record<string, string>> | null = null;

/** English item name -> item id, loaded once per visit (a failed load is tried again next time). */
export const loadNames = () =>
  (namesCache ??= fetch(assetUrl("data/item-names-en.json"))
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Record<string, string>>;
    })
    .catch((error) => {
      namesCache = null;
      throw error;
    }));

export async function loadPrices(region: Region, ids: string[]): Promise<PriceTable> {
  const table: PriceTable = {};
  for (let i = 0; i < ids.length; i += PRICE_CHUNK) {
    const res = await fetch(`/api/aodp/prices?region=${region}&ids=${encodeURIComponent(ids.slice(i, i + PRICE_CHUNK).join(","))}`);
    if (!res.ok) throw new Error(String(res.status));
    Object.assign(table, (await res.json()).prices);
  }
  return table;
}
