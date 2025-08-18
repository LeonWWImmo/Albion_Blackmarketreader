using AlbionProfitChecker.Models;
using AlbionProfitChecker.Services;

// ===============================
// Konfiguration
// ===============================
const string CITY_BUY = "Lymhurst";          // wo wir einkaufen
const string CITY_SELL = "Black Market";     // Vergleichsmarkt
const int DAYS = 14;                         // Zeitraum für Ø
const double MIN_PROFIT_PERCENT = 10.0;      // Mindestmarge
bool DEBUG_SKIPS = true;

// ===============================
// Hilfsfunktionen
// ===============================
static IEnumerable<ItemVariant> GenerateItemVariantsForBase(string baseCode, int minTier = 4, int maxTier = 8, int maxEnchant = 3)
{
    for (int tier = minTier; tier <= maxTier; tier++)
    {
        for (int enchant = 0; enchant <= maxEnchant; enchant++)
        {
            var id = enchant == 0 ? $"T{tier}_{baseCode}" : $"T{tier}_{baseCode}@{enchant}";
            yield return new ItemVariant
            {
                ItemId = id,
                Tier = tier,
                Enchantment = enchant
            };
        }
    }
}

// ===============================
// Hauptlogik
// ===============================
var api = new AlbionApiService();
var candidates = new List<ItemVariant>();

// weitere Basiscodes einfach ergänzen
var baseItemCodes = new[] { "BAG", "MAIN_SWORD", "2H_BOW" };

foreach (var baseCode in baseItemCodes)
{
    var variants = GenerateItemVariantsForBase(baseCode);
    foreach (var v in variants)
    {
        // 1) Lymhurst-Preis (+ Datum)
        var (price, priceDate) = await api.GetSellPriceMinAsync(v.ItemId, CITY_BUY);
        v.LymhurstSellMin = price;

        // 2) Black-Market-History (Ø Preis/14d + Verkäufe/Tag)
        var bmHistory = await api.GetHistoryAsync(v.ItemId, CITY_SELL, DAYS);
        ProfitService.FillAggregates(v, bmHistory);

        // optionales Info-Log
        if (DEBUG_SKIPS && price > 0)
        {
            var d = priceDate?.ToString("yyyy-MM-dd") ?? "kein Datum";
            Console.WriteLine($"info {v.ItemId}: Lym={price} (Datum: {d}), BM Ø14={v.BlackMarketAvgPrice14d:F0}, Sold/Tag={v.BlackMarketAvgSoldPerDay14d:F1}");
        }

        candidates.Add(v);
    }
}

// Filter inkl. Gründe
var profitable = new List<ItemVariant>();
foreach (var v in candidates)
{
    if (v.LymhurstSellMin <= 0)
    {
        if (DEBUG_SKIPS) Console.WriteLine($"skip {v.ItemId}: kein Lymhurst-Preis (0 oder kein Datensatz)");
        continue;
    }
    if (v.BlackMarketAvgPrice14d <= 0)
    {
        if (DEBUG_SKIPS) Console.WriteLine($"skip {v.ItemId}: keine BM-History/Ø-Preis");
        continue;
    }
    if (v.BlackMarketAvgSoldPerDay14d <= 0.1)
    {
        if (DEBUG_SKIPS) Console.WriteLine($"skip {v.ItemId}: zu geringe Verkäufe/Tag (Ø {v.BlackMarketAvgSoldPerDay14d:F2})");
        continue;
    }
    if (v.ProfitPercent < MIN_PROFIT_PERCENT)
    {
        if (DEBUG_SKIPS) Console.WriteLine($"skip {v.ItemId}: Profit {v.ProfitPercent:F1}% < {MIN_PROFIT_PERCENT}%");
        continue;
    }
    profitable.Add(v);
}

// Ausgabe
Console.WriteLine($"\nGefundene profitable Varianten (≥ {MIN_PROFIT_PERCENT}% Profit, Zeitraum {DAYS} Tage):");
if (profitable.Count == 0)
{
    Console.WriteLine("— keine Treffer —");
}
else
{
    foreach (var p in profitable
        .OrderByDescending(v => v.ProfitPercent)
        .ThenByDescending(v => v.BlackMarketAvgSoldPerDay14d))
    {
        Console.WriteLine($"{p.ItemId,-12} | Buy(Lym): {p.LymhurstSellMin,8} | BM Ø14d: {p.BlackMarketAvgPrice14d,10:F0} | Sold/Tag Ø14d: {p.BlackMarketAvgSoldPerDay14d,6:F1} | Profit: {p.ProfitPercent,6:F1}%");
    }
}
