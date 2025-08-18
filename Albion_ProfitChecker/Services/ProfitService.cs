using AlbionProfitChecker.Models;
using System.Collections.Generic;
using System.Linq;

namespace AlbionProfitChecker.Services
{
    public static class ProfitService
    {
        /// <summary>
        /// Befüllt BlackMarketAvgPrice14d und BlackMarketAvgSoldPerDay14d anhand der History.
        /// ProfitPercent wird NICHT gesetzt, da es in ItemVariant berechnet wird.
        /// </summary>
        public static void FillAggregates(ItemVariant item, List<HistoryPoint> history)
        {
            if (history == null || history.Count == 0)
            {
                item.BlackMarketAvgPrice14d = 0;
                item.BlackMarketAvgSoldPerDay14d = 0;
                return;
            }

            // Ø-Preis (nur Tage mit Preis > 0)
            var validPriceDays = history.Where(h => h.AvgPrice > 0);
            item.BlackMarketAvgPrice14d = validPriceDays.Any()
                ? validPriceDays.Average(h => h.AvgPrice)
                : 0;

            // Ø verkaufte Stück/Tag (tageweise aufsummieren, dann mitteln)
            var perDayCounts = history
                .Where(h => h.ItemCount > 0)
                .GroupBy(h => h.Timestamp.Date)
                .Select(g => g.Sum(x => x.ItemCount));

            item.BlackMarketAvgSoldPerDay14d = perDayCounts.Any()
                ? perDayCounts.Average()
                : 0;
        }
    }
}
