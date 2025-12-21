# Albion Profit Checker

Lokales Tool, das profitable Items zwischen Lymhurst (City Buy) und dem Black Market identifiziert. Läuft als self‑contained .NET 8 App, liefert das Web-UI selbst aus und öffnet den Browser automatisch.

## Download/Entpacken
- Entweder das Repository/ZIP von deinem bereitgestellten Link herunterladen und entpacken (füge den Link dort ein, wo du die Datei teilst).
- Oder per Git holen:
  ```powershell
  git clone <dein-repo-link>
  cd Albion_Blackmarketreader/Albion_ProfitChecker
  ```

## Schnellstart (fertige EXE)
1) In den `publish`-Ordner wechseln (nachdem eine fertige Version gebaut wurde, siehe “Release bauen”):
   `bin/Release/net8.0/win-x64/publish/`
2) `Albion_ProfitChecker.exe` doppelklicken.
3) Browser öffnet sich automatisch auf `http://localhost:5173`. Dashboard-Passwort: `testo`.

## Entwicklung/Test (ohne Rebuild)
```powershell
cd Albion_Blackmarketreader/Albion_ProfitChecker
dotnet run
```
Öffnet den Browser und startet den lokalen Server.

## Release bauen (self-contained EXE)
```powershell
cd Albion_Blackmarketreader/Albion_ProfitChecker
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
```
Die distributable EXE liegt danach in:
`bin/Release/net8.0/win-x64/publish/Albion_ProfitChecker.exe`
Den kompletten `publish/`-Ordner zippen und weitergeben (enthält auch `ui/` und `picture/`).

## Bedienung
- UI erreichbar unter `http://localhost:5173`.
- Passwort für das Dashboard: `testo`.
- Button “Neue Daten sync” triggert den Datenabruf (zieht City-Bulk-Preise und Black-Market-History, schreibt `ui/results.js`, Fortschritt über `/progress`).
- Filter: Profit-Schwelle in % setzen, negative Profite bleiben sichtbar wenn Schwelle ≤ 0.
- Karten zeigen Lymhurst-Preis, Black-Market-Preis, Sold/Tag und Profit (Span = Zeitraum 14/30/60d).

## Datenquelle
- Albion Online Data API (west.albion-online-data.com). Es gibt Rate Limits; das Tool arbeitet mit Batches und Retries. Bei 429 ggf. erneut “Neue Daten sync” klicken.

## Dateien/Struktur (wichtigste)
- `Program.cs` – Pipeline + integrierter Webserver (Kestrel), Endpunkte `/refresh`, `/progress`, statische Auslieferung von `ui/` und `picture/`.
- `ui/` – statische HTML/CSS/JS (Landing + Dashboard). `results.js` wird vom Tool überschrieben.
- `picture/` – Logos/Bilder für das UI.
- `Data/ItemList.json` – definierte Item-Basis-Codes; wird beim Sync gelesen.

## Hinweise
- Server/EXE muss vor einem neuen Publish beendet sein, sonst schlägt das Bundling wegen “file in use” fehl.
- Für Vercel/Hosting: Dieses Paket ist für lokalen Betrieb gedacht. Live-Sync erfordert das .NET-Backend; Vercel allein reicht nicht. Использ локально. 😉
