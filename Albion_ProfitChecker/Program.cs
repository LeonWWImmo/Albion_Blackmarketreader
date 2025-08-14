using AlbionProfitChecker.Models;
using AlbionProfitChecker.Services;

// ===============================
// Konfiguration
// ===============================
const string CITY_BUY = "Lymhurst";          // wo wir einkaufen
const string CITY_SELL = "Black Market";     // Vergleichsmarkt
const int DAYS = 14;                         // Zeitraum für Ø
const double MIN_PROFIT_PERCENT = 10.0;      // Mindestmarge

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

// TODO: später kannst du hier weitere Basiscodes ergänzen (Waffen, Rüstungen, etc.)
var baseItemCodes = new[] { "BAG", "MAIN_SWORD", "2H_BOW" };

foreach (var baseCode in baseItemCodes)
{
    var variants = GenerateItemVariantsForBase(baseCode);
    foreach (var v in variants)
    {
        // 1) aktueller Kaufpreis in Lymhurst
        v.LymhurstSellMin = await api.GetSellPriceMinAsync(v.ItemId, CITY_BUY);

        // 2) Historie Black Market holen, Ø bilden (Preis + verkaufte Stück/Tag)
        var bmHistory = await api.GetHistoryAsync(v.ItemId, CITY_SELL, DAYS);
        ProfitService.FillAggregates(v, bmHistory);

        // Kandidaten aufnehmen
        candidates.Add(v);
    }
}

// Filter: mindestens 30% Profit, und es wird überhaupt verkauft
var profitable = candidates
    .Where(v => v.LymhurstSellMin > 0 && v.BlackMarketAvgPrice14d > 0 && v.ProfitPercent >= MIN_PROFIT_PERCENT && v.BlackMarketAvgSoldPerDay14d > 0.1)
    .OrderByDescending(v => v.ProfitPercent)
    .ThenByDescending(v => v.BlackMarketAvgSoldPerDay14d)
    .ToList();

// Ausgabe
Console.WriteLine($"Gefundene profitable Varianten (≥ {MIN_PROFIT_PERCENT}% Profit, Zeitraum {DAYS} Tage):");
if (profitable.Count == 0)
{
    Console.WriteLine("— keine Treffer —");
}
else
{
    foreach (var p in profitable)
    {
        Console.WriteLine($"{p.ItemId,-12} | Buy(Lym): {p.LymhurstSellMin,8} | BM Ø14d: {p.BlackMarketAvgPrice14d,10:F0} | Sold/Tag Ø14d: {p.BlackMarketAvgSoldPerDay14d,6:F1} | Profit: {p.ProfitPercent,6:F1}%");
    }
}
