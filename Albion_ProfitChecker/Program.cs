using System.Globalization;
using System.Text.Json;
using AlbionProfitChecker.Services;

namespace AlbionProfitChecker;

internal static class Program
{
    // ---------- Konfiguration ----------
    private const string CITY_BUY = "Lymhurst";
    private const string BM_LOCATION = "Black Market";

    private static readonly int[] TIERS = { 4, 5, 6, 7, 8 };
    private static readonly int[] ENCHANTS = { 0, 1, 2, 3 };

    // BM-History: adaptiver Fallback
    private static readonly int[] BM_FALLBACK_DAYS = { 14, 30, 60 };
    private const double MIN_PROFIT_PERCENT = 10.0;

    // WICHTIG: Nur noch Mindest-Anzahl an History-Punkten – hier 1 (= zeige auch Items mit sehr wenig Historie)
    private const int MIN_BM_POINTS = 1;

    // kleine Pause zwischen History-Requests (Throttle freundlich)
    private const int INTER_HISTORY_DELAY_MS = 2000;

    // Pfad zur externen Itemliste
    private const string ITEM_LIST_PATH = "Data/ItemList.json";

    private sealed record Variant(string ItemId, int Tier, int Enchant, string BaseCode);

    private sealed record ResultRow(
        string ItemId,
        int Tier,
        int Enchant,
        long LymhurstBuyPrice,
        DateTime? LymhurstDateUtc,
        double BmAvgPrice,
        double BmSoldPerDay,
        double ProfitPercent
    );

    public static async Task Main()
    {
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;

        var api = new AlbionApiService();

        // 0) ItemList laden
        var baseCodes = LoadItemList();
        if (baseCodes.Length == 0)
        {
            Console.WriteLine("Keine Items in Data/ItemList.json gefunden!");
            return;
        }

        // 1) Varianten bauen
        var variants = GenerateAllVariants(baseCodes).ToList();

        // 2) Bulk City-Preise holen
        var allIds = variants.Select(v => v.ItemId).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var cityPrices = await api.GetSellPriceMinBulkAsync(allIds, CITY_BUY);

        var results = new List<ResultRow>(variants.Count);

        // 3) BM-History ziehen & Profit berechnen
        foreach (var v in variants)
        {
            (int buyPrice, DateTime? buyDateUtc) = cityPrices.TryGetValue(v.ItemId, out var tuple) ? tuple : (0, null);
            if (buyPrice <= 0)
            {
                Console.WriteLine($"skip {v.ItemId}: kein {CITY_BUY}-Preis (0 oder kein Datensatz)");
                continue;
            }

            var (avgPrice, avgSoldPerDay, daysUsed, pointsUsed) = await GetBmAveragesAsync(api, v.ItemId);
            if (avgPrice <= 0 || avgSoldPerDay <= 0 || pointsUsed < MIN_BM_POINTS)
            {
                Console.WriteLine($"skip {v.ItemId}: keine BM-History/Ø-Preis (Punkte={pointsUsed})");
                continue;
            }

            double profitPercent = ((avgPrice - buyPrice) / buyPrice) * 100.0;

            Console.WriteLine(
                $"info {v.ItemId}: Lym={buyPrice} (Datum: {FormatDate(buyDateUtc)}), " +
                $"BM Ø={Math.Round(avgPrice)} | Sold/Tag={Math.Round(avgSoldPerDay, 1)} | Span={daysUsed}d/{pointsUsed}p");

            if (profitPercent < MIN_PROFIT_PERCENT)
            {
                Console.WriteLine($"skip {v.ItemId}: Profit {profitPercent:+0.0;-0.0}% < {MIN_PROFIT_PERCENT:0}%");
            }
            else
            {
                results.Add(new ResultRow(
                    v.ItemId, v.Tier, v.Enchant,
                    buyPrice, buyDateUtc,
                    avgPrice, avgSoldPerDay, profitPercent
                ));
            }
        }

        // 4) Ausgabe
        var winners = results
            .OrderByDescending(r => r.ProfitPercent)
            .ThenByDescending(r => r.BmSoldPerDay)
            .ToList();

        Console.WriteLine();
        Console.WriteLine($"Gefundene profitable Varianten (≥ {MIN_PROFIT_PERCENT:0}% Profit, Zeitraum {string.Join("/", BM_FALLBACK_DAYS)} Tage):");

        if (winners.Count == 0)
        {
            Console.WriteLine("(keine)");
            return;
        }

        foreach (var r in winners)
        {
            Console.WriteLine(
                $"{r.ItemId.PadRight(14)} | " +
                $"Buy(Lym): {r.LymhurstBuyPrice,9} | " +
                $"BM Ø: {Math.Round(r.BmAvgPrice),10} | " +
                $"Sold/Tag Ø: {Math.Round(r.BmSoldPerDay, 1),6} | " +
                $"Profit: {r.ProfitPercent,7:0.0}%"
            );
        }
    }

    // ---------- Helpers ----------

    private static string[] LoadItemList()
    {
        if (!File.Exists(ITEM_LIST_PATH))
        {
            Console.WriteLine($"WARN: {ITEM_LIST_PATH} fehlt, benutze nur BAG als Default.");
            return new[] { "BAG" };
        }

        try
        {
            var json = File.ReadAllText(ITEM_LIST_PATH);
            var arr = JsonSerializer.Deserialize<string[]>(json);
            return arr ?? Array.Empty<string>();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Fehler beim Laden von {ITEM_LIST_PATH}: {ex.Message}");
            return Array.Empty<string>();
        }
    }

    private static IEnumerable<Variant> GenerateAllVariants(IEnumerable<string> baseCodes)
    {
        foreach (var baseCode in baseCodes)
        {
            foreach (var tier in TIERS)
            {
                foreach (var enchant in ENCHANTS)
                {
                    var itemId = enchant == 0
                        ? $"T{tier}_{baseCode}"
                        : $"T{tier}_{baseCode}@{enchant}";
                    yield return new Variant(itemId, tier, enchant, baseCode);
                }
            }
        }
    }

    private static string FormatDate(DateTime? utc)
        => utc.HasValue ? utc.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : "—";

    private static async Task<(double avgPrice, double avgSoldPerDay, int daysUsed, int pointsUsed)>
        GetBmAveragesAsync(AlbionApiService api, string itemId)
    {
        foreach (var span in BM_FALLBACK_DAYS)
        {
            var pts = await api.GetHistoryAsync(itemId, BM_LOCATION, span);
            if (pts != null && pts.Count > 0)
            {
                var cutoff = DateTime.UtcNow.AddDays(-span);
                var use = pts.Where(p => p.Timestamp.ToUniversalTime() >= cutoff).ToList();
                if (use.Count >= MIN_BM_POINTS)
                {
                    var avgP   = use.Average(p => (double)p.AvgPrice);
                    var avgCnt = use.Average(p => (double)p.ItemCount);
                    if (avgP > 0 && avgCnt > 0)
                        return (avgP, avgCnt, span, use.Count);
                }
            }
            await Task.Delay(INTER_HISTORY_DELAY_MS); // throttle-freundlich zwischen Fallbacks
        }
        return (0, 0, 0, 0);
    }
}
