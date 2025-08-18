using System.Text.Json;
using System.Text.Json.Serialization;
using AlbionProfitChecker.Models;

namespace AlbionProfitChecker.Services;

public class AlbionApiService
{
    private readonly HttpClient _http;
    private const string API_BASE = "https://west.albion-online-data.com"; // Amerika/West
    private const int MAX_PRICE_AGE_DAYS = 90; // frische Preise bevorzugen, sonst Fallback

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        NumberHandling = JsonNumberHandling.AllowReadingFromString
    };

    public AlbionApiService(HttpClient? http = null)
    {
        _http = http ?? new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
    }

    /// <summary>
    /// Liefert (sell_price_min, Datum) für Location.
    /// Bevorzugt Preise <= MAX_PRICE_AGE_DAYS; bildet das Minimum über Qualitäten 1..5.
    /// Falls keine frischen vorhanden sind, nimmt das globale Minimum (weiterhin nur >0).
    /// </summary>
    public async Task<(int price, DateTime? dateUtc)> GetSellPriceMinAsync(string itemId, string location)
    {
        // Wichtig: "Prices" mit großem P; Qualitäten 1..5 explizit abfragen
        var url =
            $"{API_BASE}/api/v2/stats/Prices/{Uri.EscapeDataString(itemId)}.json" +
            $"?locations={Uri.EscapeDataString(location)}&qualities=1,2,3,4,5";

        using var resp = await _http.GetAsync(url);
        if (!resp.IsSuccessStatusCode) return (0, null);

        var json = await resp.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);

        var nowUtc = DateTime.UtcNow;
        var freshCutoff = nowUtc.AddDays(-MAX_PRICE_AGE_DAYS);

        // Kandidaten sammeln (nur richtige Stadt, nur >0 Preise, nur Qualitäten 1..5)
        var candidates = new List<(int price, DateTime? dateUtc)>();
        foreach (var el in doc.RootElement.EnumerateArray())
        {
            if (!el.TryGetProperty("city", out var cityEl)) continue;
            if (!string.Equals(cityEl.GetString(), location, StringComparison.OrdinalIgnoreCase)) continue;

            // Qualität prüfen (1..5)
            int quality = 0;
            if (el.TryGetProperty("quality", out var qEl))
            {
                if (qEl.ValueKind == JsonValueKind.Number && qEl.TryGetInt32(out var qn)) quality = qn;
                else if (qEl.ValueKind == JsonValueKind.String && int.TryParse(qEl.GetString(), out var qs)) quality = qs;
            }
            if (quality < 1 || quality > 5) continue;

            // Preis lesen
            int price = 0;
            if (el.TryGetProperty("sell_price_min", out var p))
            {
                if (p.ValueKind == JsonValueKind.Number && p.TryGetInt32(out var n)) price = n;
                else if (p.ValueKind == JsonValueKind.String && int.TryParse(p.GetString(), out n)) price = n;
            }
            if (price <= 0) continue;

            // Datum lesen
            DateTime? priceDateUtc = null;
            if (el.TryGetProperty("sell_price_min_date", out var dEl))
            {
                var ds = dEl.GetString();
                if (DateTime.TryParse(ds, out var dt))
                    priceDateUtc = dt.ToUniversalTime();
            }

            candidates.Add((price, priceDateUtc));
        }

        if (candidates.Count == 0)
            return (0, null);

        // 1) Frische Preise: Minimum wählen
        var fresh = candidates
            .Where(c => c.dateUtc.HasValue && c.dateUtc.Value >= freshCutoff)
            .ToList();

        if (fresh.Count > 0)
        {
            var bestFresh = fresh.OrderBy(c => c.price).First();
            return bestFresh;
        }

        // 2) Kein frischer Preis -> globales Minimum (über alle Kandidaten)
        var bestAny = candidates.OrderBy(c => c.price).First();
        return bestAny;
    }

    /// <summary>
    /// Holt Tages-Historie (avg_price, item_count) der letzten 'days' Tage.
    /// </summary>
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
            if (!string.Equals(locEl.GetString(), location, StringComparison.OrdinalIgnoreCase)) continue;
            if (!series.TryGetProperty("data", out var dataEl) || dataEl.ValueKind != JsonValueKind.Array) continue;

            foreach (var row in dataEl.EnumerateArray())
            {
                var tsStr = row.TryGetProperty("timestamp", out var tsEl) ? tsEl.GetString() : null;
                var count = row.TryGetProperty("item_count", out var cEl) && cEl.TryGetInt32(out var cVal) ? cVal : 0;
                var avgP  = row.TryGetProperty("avg_price", out var apEl) && apEl.TryGetInt32(out var apVal) ? apVal : 0;

                if (!DateTime.TryParse(tsStr, out var ts)) continue;
                if (ts.ToUniversalTime() < DateTime.UtcNow.AddDays(-days)) continue;

                points.Add(new HistoryPoint { Timestamp = ts, ItemCount = count, AvgPrice = avgP });
            }
        }
        return points;
    }
}
