namespace AlbionProfitChecker.Models;

public class ItemVariant
{
    public string ItemId { get; init; } = "";
    public int Tier { get; init; }
    public int Enchantment { get; init; }

    // Daten aus API
    public int LymhurstSellMin { get; set; }        // aktueller Kaufpreis in Lymhurst
    public double BlackMarketAvgPrice14d { get; set; } // Preis 14 Tage
    public double BlackMarketAvgSoldPerDay14d { get; set; } // verkaufte Stück pro Tag 

    public double ProfitPercent =>
        LymhurstSellMin > 0 ? (BlackMarketAvgPrice14d - LymhurstSellMin) / LymhurstSellMin * 100.0 : 0.0;
}
