using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using AlbionProfitChecker.Models;

namespace AlbionProfitChecker.Services
{
    public class AlbionApiService
    {
        private readonly HttpClient _http;
        private const string API_BASE = "https://west.albion-online-data.com/api/v2/stats";
        private const int MAX_PRICE_AGE_DAYS = 90; 
        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNameCaseInsensitive = true,
            NumberHandling = JsonNumberHandling.AllowReadingFromString
        };

        public AlbionApiService(HttpClient? http = null)
        {
            if (http != null)
            {
                _http = http;
            }
            else
            {
                var handler = new HttpClientHandler
                {
                    AutomaticDecompression = DecompressionMethods.All
                };
                _http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(20) };
            }
        }

        /// <summary>
        /// Liefert (sell_price_min, Datum) für Location. 
        /// Nimmt zuerst Preise <= MAX_PRICE_AGE_DAYS, sonst den jüngsten beliebigen Preis.
        /// </summary>
        public async Task<(int price, DateTime? dateUtc)> GetSellPriceMinAsync(string itemId, string location)
        {
            var url = $"{API_BASE}/prices/{Uri.EscapeDataString(itemId)}.json?locations={Uri.EscapeDataString(location)}";
            using var resp = await _http.GetAsync(url);
            if (!resp.IsSuccessStatusCode)
            {
                Console.WriteLine($"WARN: Price {url} -> {(int)resp.StatusCode}");
                return (0, null);
            }

            var json = await resp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            int freshestPrice = 0;
            DateTime? freshestDate = null;

            foreach (var el in doc.RootElement.EnumerateArray())
            {
                if (!el.TryGetProperty("city", out var cityEl)) continue;
                if (!string.Equals(cityEl.GetString(), location, StringComparison.OrdinalIgnoreCase)) continue;

                // Preis lesen
                int price = 0;
                if (el.TryGetProperty("sell_price_min", out var p))
                {
                    if (p.ValueKind == JsonValueKind.Number && p.TryGetInt32(out var n)) price = n;
                    else if (p.ValueKind == JsonValueKind.String && int.TryParse(p.GetString(), out n)) price = n;
                }
                if (price <= 0) continue;

                // Datum lesen
                DateTime? priceDate = null;
                if (el.TryGetProperty("sell_price_min_date", out var dEl))
                {
                    var ds = dEl.GetString();
                    if (DateTime.TryParse(ds, out var dt)) priceDate = dt.ToUniversalTime();
                }

                // 1) Frischer Preis? -> sofort nehmen
                if (priceDate.HasValue && priceDate.Value >= DateTime.UtcNow.AddDays(-MAX_PRICE_AGE_DAYS))
                    return (price, priceDate);

                // 2) Sonst den "jüngsten" merken als Fallback
                if (priceDate == null || freshestDate == null || priceDate > freshestDate)
                {
                    freshestDate = priceDate;
                    freshestPrice = price;
                }
            }

            return (freshestPrice, freshestDate);
        }

        /// <summary>
        /// Holt Tages-Historie (avg_price, item_count) der letzten 'days' Tage (alle Qualities).
        /// </summary>
        public async Task<List<HistoryPoint>> GetHistoryAsync(string itemId, string location, int days = 14)
        {
            var url = $"{API_BASE}/history/{Uri.EscapeDataString(itemId)}.json?locations={Uri.EscapeDataString(location)}&time-scale=24";
            for (int attempt = 1; attempt <= 3; attempt++)
            {
                using var resp = await _http.GetAsync(url);
                if (resp.IsSuccessStatusCode)
                {
                    var json = await resp.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(json);

                    var points = new List<HistoryPoint>();

                    foreach (var series in doc.RootElement.EnumerateArray())
                    {
                        if (!series.TryGetProperty("location", out var locEl)) continue;
                        if (!string.Equals(locEl.GetString(), location, StringComparison.OrdinalIgnoreCase)) continue;
                        if (!series.TryGetProperty("data", out var dataEl) || dataEl.ValueKind != JsonValueKind.Array) continue;

                        // quality beachten -> wir nehmen ALLE zusammen
                        foreach (var row in dataEl.EnumerateArray())
                        {
                            var tsStr = row.TryGetProperty("timestamp", out var tsEl) ? tsEl.GetString() : null;
                            var count = row.TryGetProperty("item_count", out var cEl) && cEl.TryGetInt32(out var cVal) ? cVal : 0;
                            var avgP = row.TryGetProperty("avg_price", out var apEl) && apEl.TryGetInt32(out var apVal) ? apVal : 0;

                            if (!DateTime.TryParse(tsStr, out var ts)) continue;
                            if (ts.ToUniversalTime() < DateTime.UtcNow.AddDays(-days)) continue;

                            points.Add(new HistoryPoint
                            {
                                Timestamp = ts,
                                ItemCount = count,
                                AvgPrice = avgP
                            });
                        }
                    }

                    return points;
                }

                if ((int)resp.StatusCode == 429)
                {
                    if (attempt < 3)
                        await Task.Delay(800);
                    continue; // leise weiterprobieren
                }
                else
                {
                    Console.WriteLine($"WARN: History {url} -> {(int)resp.StatusCode}");
                    return new();
                }
            }

            return new();
        }

        /// <summary>
        /// Aggregiert die History: Durchschnittspreis + Verkäufe pro Tag über alle Qualities.
        /// </summary>
        public (double AvgPrice, double SoldPerDay) AggregateHistory(List<HistoryPoint> points, int days)
        {
            if (points.Count == 0) return (0, 0);

            var avgPrice = points.Average(p => p.AvgPrice);
            var totalCount = points.Sum(p => p.ItemCount);
            var soldPerDay = totalCount / (double)days;

            return (avgPrice, soldPerDay);

        }
        
        /// <summary>
        /// Holt Min-Sell-Preise für viele Items auf einmal.
        /// Nutzt v2/prices und berücksichtigt Datum (frische Preise zuerst).
        /// </summary>
        public async Task<Dictionary<string, (int Price, DateTime? DateUtc)>> GetSellPriceMinBulkAsync(
            IEnumerable<string> itemIds, string location, int? maxPriceAgeDays = null)
        {
            var result = new Dictionary<string, (int, DateTime?)>(StringComparer.OrdinalIgnoreCase);
            var fresh = new Dictionary<string, (int Price, DateTime DateUtc)>(StringComparer.OrdinalIgnoreCase);
            var fallback = new Dictionary<string, (int Price, DateTime? DateUtc)>(StringComparer.OrdinalIgnoreCase);

            var ids = itemIds.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            if (ids.Count == 0) return result;

            var url = $"{API_BASE}/prices/{string.Join(",", ids)}.json?locations={Uri.EscapeDataString(location)}";
            using var resp = await _http.GetAsync(url);
            if (!resp.IsSuccessStatusCode)
            {
                Console.WriteLine($"WARN: Prices {url} -> {(int)resp.StatusCode}");
                return result;
            }

            var json = await resp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            DateTime? ageLimit = maxPriceAgeDays.HasValue ? DateTime.UtcNow.AddDays(-maxPriceAgeDays.Value) : null;

            foreach (var el in doc.RootElement.EnumerateArray())
            {
                var id = el.TryGetProperty("item_id", out var idEl) ? idEl.GetString() : null;
                var city = el.TryGetProperty("city", out var cityEl) ? cityEl.GetString() : null;

                if (string.IsNullOrWhiteSpace(id) || !string.Equals(city, location, StringComparison.OrdinalIgnoreCase))
                    continue;

                int price = 0;
                if (el.TryGetProperty("sell_price_min", out var p))
                {
                    if (p.ValueKind == JsonValueKind.Number && p.TryGetInt32(out var n)) price = n;
                    else if (p.ValueKind == JsonValueKind.String && int.TryParse(p.GetString(), out n)) price = n;
                }

                DateTime? priceDate = null;
                if (el.TryGetProperty("sell_price_min_date", out var dEl))
                {
                    var ds = dEl.GetString();
                    if (DateTime.TryParse(ds, out var dt)) priceDate = dt.ToUniversalTime();
                }

                if (price <= 0) continue;

                bool isFresh = priceDate.HasValue && ageLimit.HasValue && priceDate.Value >= ageLimit.Value;

                if (isFresh)
                {
                    if (!fresh.TryGetValue(id, out var existing) || priceDate.Value > existing.DateUtc)
                        fresh[id] = (price, priceDate.Value);
                }
                else
                {
                    if (!fallback.TryGetValue(id, out var existing) || (priceDate ?? DateTime.MinValue) > existing.DateUtc.GetValueOrDefault(DateTime.MinValue))
                        fallback[id] = (price, priceDate);
                }
            }

            foreach (var kvp in fresh)
                result[kvp.Key] = (kvp.Value.Price, kvp.Value.DateUtc);

            foreach (var kvp in fallback)
                if (!result.ContainsKey(kvp.Key))
                    result[kvp.Key] = (kvp.Value.Price, kvp.Value.DateUtc);

            return result;
        }


    }
}
