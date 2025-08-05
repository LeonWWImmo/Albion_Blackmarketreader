namespace AlbionProfitChecker.Models;

public class Item
{
    public string ItemId { get; set; }
    public string Name { get; set; }
    public int Tier { get; set; }
    public int Enchantment { get; set; }

    public int LymhurstPrice { get; set; }
    public int BlackMarketPrice { get; set; }
    public int DailySold { get; set; }

    public double ProfitPercent
    {
        get
        {
            if (LymhurstPrice == 0) return 0;
            return ((BlackMarketPrice - LymhurstPrice) / (double)LymhurstPrice) * 100;
        }
    }
}
