# Albion Profit Checker

Demo - weitere Updates werden kommen! 

Lokales Tool, das profitable Items zwischen Lymhurst (City Buy) und dem Black Market identifiziert. Läuft als self‑contained .NET 8 App, liefert das Web-UI selbst aus und öffnet den Browser automatisch.

## Download/Entpacken
- Entweder das Repository/ZIP von deinem bereitgestellten [Link herunterladen](Albion_ProfitChecker.zip) und entpacken 
- Oder per Git holen:
  ```powershell
  git clone https://github.com/LeonWWImmo/Albion_Blackmarketreader
  cd Albion_Blackmarketreader/Albion_ProfitChecker
  ```

## Schnellstart (fertige EXE)
1) In den Ordner Albion_ProfitChecker\bin\Release\net8.0\win-x64 (dort dann am besten nach exe suchen)
2) `Albion_ProfitChecker.exe` doppelklicken.
3) Browser öffnet sich automatisch auf `http://localhost:5173`.


## Bedienung (Entwickler)
- UI erreichbar unter `http://localhost:5173`.
- Passwort nötig für das Dashboard
- Button “Neue Daten sync” triggert den Datenabruf (zieht City-Bulk-Preise und Black-Market-History, schreibt `ui/results.js`, Fortschritt über `/progress`).
- Filter: Profit-Schwelle in % setzen, negative Profite bleiben sichtbar wenn Schwelle ≤ 0.
- Karten zeigen Lymhurst-Preis, Black-Market-Preis, Sold/Tag und Profit (Span = Zeitraum 14/30/60d).

- Das Sync kann bis zu **15min dauern**, da wir von über 6000 Items reden und die Api von Albion Online Api sonst überlastet währe.

![Dashboard](Albion_ProfitChecker\picture\Dashboard.png)



## Datenquelle
- Albion Online Data API (west.albion-online-data.com). Es gibt Rate Limits; das Tool arbeitet mit Batches und Retries. Bei 429 ggf. erneut “Neue Daten sync” klicken.

## Dateien/Struktur (Für weiterentwicklung)
- `Program.cs` – Pipeline + integrierter Webserver (Kestrel), Endpunkte `/refresh`, `/progress`, statische Auslieferung von `ui/` und `picture/`.
- `ui/` – statische HTML/CSS/JS (Landing + Dashboard). `results.js` wird vom Tool überschrieben.
- `picture/` – Logos/Bilder für das UI.
- `Data/ItemList.json` – definierte Item-Basis-Codes; wird beim Sync gelesen.
- Server/EXE muss vor einem neuen Publish beendet sein, sonst schlägt das Bundling wegen “file in use” fehl.
