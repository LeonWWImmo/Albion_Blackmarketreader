# 🎯 Threat Model

## 1. Systemüberblick & Datenflüsse

```
        ┌───────────┐   HTTPS    ┌──────────────────────┐
 User ──┤  Browser  ├───────────►│  Vercel              │
        │ (React/   │            │  • Static Hosting    │
        │  Vite)    │◄───────────┤  • Serverless-Funcs  │
        └─────┬─────┘            └──────────┬───────────┘
              │ JWT (localStorage)          │ Token-Prüfung
              │                             │ + Rate-Limit
              │   Anon-Key + RLS            ▼
              └────────────────────►┌──────────────────────┐
                                    │  Supabase            │
                                    │  • Auth (GoTrue)     │
                                    │  • Postgres + RLS    │
                                    └──────────────────────┘

        ┌──────────────────────────────────────────────┐
 CI ───►│  GitHub Actions (~12 Workflows)              │
        │  • Datensync (.NET)  → schreibt JSON ins Repo │
        │  • Build/Deploy → Vercel                      │
        └──────────────────────────────────────────────┘
```

## 2. Trust Boundaries

| Grenze | Beschreibung | Hauptrisiko |
|---|---|---|
| **Browser ↔ Vercel** | Alles aus dem Browser ist nicht vertrauenswürdig (manipulierbar) | Direkter Datenzugriff, Request-Flooding, Parameter-Manipulation |
| **Vercel ↔ Supabase** | Serverless-Funcs nutzen Keys; Anon-Key ist öffentlich | RLS muss serverseitige Schutzgrenze sein |
| **CI ↔ Repo/Deploy** | Fremder Code (Actions, npm) läuft mit Schreibrechten | Lieferketten-Kompromittierung, manipulierte Daten |

## 3. Schutzziele (CIA)

| Ziel | Im Projekt | Adressiert durch Block |
|---|---|---|
| **Vertraulichkeit** | Geschützte Daten, Benutzerkonten, Secrets | 1, 4, 5, 6 |
| **Integrität** | Daten, Daten-Pipeline, Abhängigkeiten | 5, 7, 9 |
| **Verfügbarkeit** | Seite muss für echte Nutzer erreichbar bleiben | **2** (DoS-Schutz), 9 (Backup) |

## 4. Angreifer-Profile

| Profil | Motivation | Typischer Angriff |
|---|---|---|
| **Datensammler/Scraper** | Marktdaten abgreifen | Automatisierter Datenabruf, Massen-Requests → H-01, H-02 |
| **Script-Kiddie** | Stören / „weil es geht" | Überlastung, bekannte CVEs in Abhängigkeiten → H-02, H-07 |
| **Account-Angreifer** | Fremdes Konto übernehmen | Login-Angriffe, Session-Diebstahl → H-01, H-04 |
| **Opportunist** | Ausnutzen von Fehlkonfiguration | Fehlende Header, Secret-Handling → H-06, H-04 |

## 5. Wichtigste Angriffsflächen (Kronjuwelen)

1. **Geschützte Marktdaten** – Zugriffskontrolle wird serverseitig gehärtet (H-01) → Block 1
2. **Erreichbarkeit der Seite** – Überlastschutz wird ergänzt (H-02) → Block 2
3. **Benutzerkonten / Sessions** – Auth-Flow, Token-Speicherung (H-01, H-04) → Block 1, 4
4. **Schlüssel/Secrets** – Trennung public/secret (H-04) → Block 4, 6
5. **Daten-Pipeline & Abhängigkeiten** (H-07, H-09) → Block 7, 9

> Die quantitative Bewertung dieser Flächen erfolgt in der [risikomatrix.md](risikomatrix.md).
