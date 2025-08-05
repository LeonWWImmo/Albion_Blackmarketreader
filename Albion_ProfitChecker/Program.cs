using Albion_ProfitChecker.Models;

List<Item> items = new()
{
    new Item { Name = "Heavy Crossbow", Quality = "5.0", CityPrice = 23000, BlackMarketPrice = 32000, QuantityPerDay = 40 },
    new Item { Name = "Dual Swords", Quality = "6.1", CityPrice = 50000, BlackMarketPrice = 62000, QuantityPerDay = 15 }
};

foreach (var item in items)
{
    double profit = item.GetProfitPercentage();
    if (profit >= 30)
    {
        Console.WriteLine($"💰 {item.Name} ({item.Quality}): {profit:F1}% Profit | {item.QuantityPerDay}/Tag verkauft");
    }
}
