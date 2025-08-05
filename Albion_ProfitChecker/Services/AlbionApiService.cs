using System.Net.Http;
using System.Text.Json;
using AlbionProfitChecker.Models;

namespace AlbionProfitChecker.Services;

public class AlbionApiService
{
    private readonly HttpClient _httpClient;

    public AlbionApiService()
    {
        _httpClient = new HttpClient();
    }

    public async Task<int> GetLymhurstPriceAsync(string itemId)
    {
        var url = $"https://west.albion-online-data.com/api/v2/stats/prices/{itemId}.json?locations=lymhurst";
        var response = await _httpClient.GetStringAsync(url);
        var data = JsonSerializer.Deserialize<List<JsonElement>>(response);
        return data?.FirstOrDefault().GetProperty("sell_price_min").GetInt32() ?? 0;
    }

    public async Task<(int price, int soldPerDay)> GetBlackMarketInfoAsync(string itemId)
    {
        var url = $"https://west.albion-online-data.com/api/v1/stats/blackmarket/{itemId}.json";
        var response = await _httpClient.GetStringAsync(url);
        var obj = JsonSerializer.Deserialize<JsonElement>(response);

        var avgPrice = obj.GetProperty("average_price").GetInt32();
        var dailySold = obj.GetProperty("times_sold").GetInt32();
        return (avgPrice, dailySold);
    }
}
