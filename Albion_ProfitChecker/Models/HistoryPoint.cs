namespace AlbionProfitChecker.Models;

public class HistoryPoint
{
    public DateTime Timestamp { get; init; }
    public int ItemCount { get; init; }     // Anzahl gehandelter Items daily
    public int AvgPrice { get; init; }      // Durchschnittspreis an dem Tag
}
