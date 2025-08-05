namespace Albion_ProfitChecker.Models;

public class Item
{
    public string Name { get; set; }
    public string Quality { get; set; }
    public int CityPrice { get; set; }
    public int BlackMarketPrice { get; set; }
    public int QuantityPerDay { get; set; }

    public double GetProfitPercentage()
    {
        if (CityPrice == 0) return 0;
        return ((double)(BlackMarketPrice - CityPrice) / CityPrice) * 100;
    }
}
