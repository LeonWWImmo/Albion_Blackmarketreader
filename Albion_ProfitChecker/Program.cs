using System.Text.Json;

class Item
{
    public string Name { get; set; }
    public string Tier { get; set; } // z. B. "5.0"
    public int Price { get; set; }   // z. B. 23000
    public int Amount { get; set; }  // z. B. 20
}

class Program
{
    static string FilePath = "items.json";

    static void Main()
    {
        List<Item> items = LoadItems();

        while (true)
        {
            Console.Clear();
            Console.WriteLine("=== Albion Profit Checker ===");
            Console.WriteLine("1. Zeige Liste");
            Console.WriteLine("2. Item hinzufügen");
            Console.WriteLine("3. Beenden");
            Console.Write("Auswahl: ");
            var choice = Console.ReadLine();

            switch (choice)
            {
                case "1":
                    ShowItems(items);
                    break;
                case "2":
                    AddItem(items);
                    break;
                case "3":
                    SaveItems(items);
                    return;
                default:
                    Console.WriteLine("Ungültige Eingabe");
                    break;
            }

            Console.WriteLine("Drücke eine Taste...");
            Console.ReadKey();
        }
    }

    static List<Item> LoadItems()
    {
        if (!File.Exists(FilePath)) return new List<Item>();
        string json = File.ReadAllText(FilePath);
        return JsonSerializer.Deserialize<List<Item>>(json) ?? new List<Item>();
    }

    static void SaveItems(List<Item> items)
    {
        string json = JsonSerializer.Serialize(items, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(FilePath, json);
    }

    static void ShowItems(List<Item> items)
    {
        Console.WriteLine("\nDeine gespeicherten Items:");
        foreach (var item in items)
        {
            Console.WriteLine($"{item.Name} {item.Tier} {item.Price} = {item.Amount}");
        }
    }

    static void AddItem(List<Item> items)
    {
        Console.Write("Name (z. B. Schwere Armbrust): ");
        string name = Console.ReadLine();

        Console.Write("Tier (z. B. 5.0): ");
        string tier = Console.ReadLine();

        Console.Write("Preis in Silber (z. B. 23000): ");
        int price = int.Parse(Console.ReadLine());

        Console.Write("Menge (z. B. 20): ");
        int amount = int.Parse(Console.ReadLine());

        items.Add(new Item { Name = name, Tier = tier, Price = price, Amount = amount });
        Console.WriteLine("Item hinzugefügt.");
    }
}
