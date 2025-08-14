using System.Text.Json;
using System.Text.Json.Serialization;
using AlbionProfitChecker.Models;

namespace AlbionProfitChecker.Services;

public class AlbionApiService
{
    private readonly HttpClient _http;
    private const string API_BASE = "https://west.albion-online-data.com"; // Amerika-Server (West)
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        NumberHandling = JsonNumberHandling.AllowReadingFromString
    };

    public AlbionApiService(HttpClient? http = null)
    {
        _http = http ?? new HttpClient();
        _http.Timeout = TimeSpan.FromSeconds(20);
    }

    public async Task<int> GetSellPriceMinAsync(string itemId, string location)
    {
        var url = $"{API_BASE}/api/v2/stats/prices/{Uri.EscapeDataString(itemId)}.json?locations={Uri.EscapeDataString(location)}";
        using var resp = await _http.GetAsync(url);
        if (!resp.IsSuccessStatusCode) return 0;

        var json = await resp.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);

        foreach (var el in doc.RootElement.EnumerateArray())
        {
            var city = el.TryGetProperty("city", out var cityEl) ? cityEl.GetString() : null;
            if (!string.Equals(city, location, StringComparison.OrdinalIgnoreCase)) continue;

            if (el.TryGetProperty("sell_price_min", out var p) && p.ValueKind is JsonValueKind.Number or JsonValueKind.String)
            {
                if (p.TryGetInt32(out var price)) return price;
                if (int.TryParse(p.GetString(), out price)) return price;
            }
        }
        return 0;
    }

    public async Task<List<HistoryPoint>> GetHistoryAsync(string itemId, string location, int days = 14)
    {
        var url = $"{API_BASE}/api/v2/stats/history/{Uri.EscapeDataString(itemId)}.json?locations={Uri.EscapeDataString(location)}&time-scale=24";
        using var resp = await _http.GetAsync(url);
        if (!resp.IsSuccessStatusCode) return new();

        var json = await resp.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);

        var points = new List<HistoryPoint>();
        foreach (var series in doc.RootElement.EnumerateArray())
        {
            if (!series.TryGetProperty("location", out var locEl)) continue;
            var loc = locEl.GetString();
            if (!string.Equals(loc, location, StringComparison.OrdinalIgnoreCase)) continue;

            if (!series.TryGetProperty("data", out var dataEl) || dataEl.ValueKind != JsonValueKind.Array) continue;

            foreach (var row in dataEl.EnumerateArray())
            {
                var tsStr = row.TryGetProperty("timestamp", out var tsEl) ? tsEl.GetString() : null;
                var count = row.TryGetProperty("item_count", out var cEl) && cEl.TryGetInt32(out var cVal) ? cVal : 0;
                var avgP  = row.TryGetProperty("avg_price", out var apEl) && apEl.TryGetInt32(out var apVal) ? apVal : 0;

                if (DateTime.TryParse(tsStr, out var ts))
                {
                    if (ts >= DateTime.UtcNow.AddDays(-days))
                    {
                        points.Add(new HistoryPoint
                        {
                            Timestamp = ts,
                            ItemCount = count,
                            AvgPrice  = avgP
                        });
                    }
                }
            }
        }

        return points;
    }
}
