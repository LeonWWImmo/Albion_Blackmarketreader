using AlbionProfitChecker.Models;

namespace AlbionProfitChecker.Services;

public static class ProfitService
{
    public static void FillAggregates(ItemVariant item, List<HistoryPoint> bmHistory)
    {
        if (bmHistory.Count == 0)
        {
            item.BlackMarketAvgPrice14d = 0;
            item.BlackMarketAvgSoldPerDay14d = 0;
            return;
        }

        item.BlackMarketAvgPrice14d = bmHistory.Where(p => p.AvgPrice > 0).Select(p => (double)p.AvgPrice).DefaultIfEmpty(0).Average();

        // Verkäufe/Tag: Summe item_count / Tage mit Daten
        var grouped = bmHistory
            .GroupBy(p => p.Timestamp.Date)
            .Select(g => g.Sum(x => x.ItemCount));

        item.BlackMarketAvgSoldPerDay14d = grouped.DefaultIfEmpty(0).Average();
    }
}
