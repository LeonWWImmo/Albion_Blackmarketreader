# 🔐 Sicherheitsprojekt – Albion Blackmarket Reader

**Modul M183 „Applikationssicherheit implementieren"**
**Schüler:** Leon Neuhaus · **Branch:** `security` · **Zeitbudget:** 24 h (10 Blöcke)

---

## 📖 Für die Lehrperson – Einstieg

Dieses Verzeichnis dokumentiert die sicherheitstechnische Härtung einer **real betriebenen Web-App** ([blackmarketreader.com](https://blackmarketreader.com)) entlang der M183-Kapitel. Es ist **kein künstliches Übungsbeispiel**, sondern eine produktive Anwendung mit echtem Auth-, Daten- und CI/CD-Stack.

| Dokument | Inhalt |
|---|---|
| **[README.md](README.md)** (dieses) | Überblick, Bewertungsraster, Umsetzungsreihenfolge |
| **[threat-model.md](threat-model.md)** | Bedrohungsmodell, Trust Boundaries, Schutzziele |
| **[risikomatrix.md](risikomatrix.md)** | Risikobewertung aller Befunde → daraus abgeleitete Reihenfolge |
| **[findings.md](findings.md)** | Befund-Tracker (Status pro Schwachstelle, Risiko vorher/nachher) |
| **[projektplan.md](projektplan.md)** | Detailplan aller 10 Blöcke (To-dos, Nachweise, Zeit) |

> Der Fortschritt ist über die Git-Historie auf dem `security`-Branch nachvollziehbar: **ein Commit-Strang pro Block**, jeweils mit Before/After.

---

## 🧰 Technischer Kontext

| Schicht | Technologie |
|---|---|
| Frontend | React + TypeScript + Vite |
| Auth + DB | Supabase (JWT, Row Level Security, Postgres) |
| Serverless-API | Vercel-Functions (im Projekt neu erstellt für Auth-/Daten-Schutz) |
| Datensync/Backend | .NET 8 + ~12 GitHub-Actions-Workflows |
| Deployment | Vercel |

**Scope-Hinweise:** Keine Zahlungsfunktion (Zugriffskontrolle = angemeldet vs. anonym). Alle Maßnahmen sind direkt im Code/Repo umsetzbar.

---

## 📋 Die 10 Blöcke im Überblick

| # | Block | M183-Kapitel | OWASP 2025 | Zeit |
|---|---|---|---|---|
| 1 | Sessionhandling, Authentifizierung & Autorisierung | Kap. 2 | A01/A07 | 3.0 h |
| 2 | 🛡️ Verfügbarkeit: DoS-/Flooding-Schutz | Kap. 6 | A06 | 2.5 h |
| 3 | Logging & Monitoring (Audit-Trail) | Kap. 6 | A09 | 2.5 h |
| 4 | Verschlüsselung & Schlüssel/Secrets | Kap. 3 | A04 | 2.0 h |
| 5 | Input-Validierung & Injection-Schutz | Kap. 1/4 | A05 | 2.0 h |
| 6 | Hardening & Security-Header | Kap. 1 | A02 | 2.0 h |
| 7 | Lieferkette & Abhängigkeits-Sicherheit | Kap. 7 | A03/A08 | 2.5 h |
| 8 | IT-Security-Tools: SAST + DAST (ZAP + CI) | Kap. 4 | Querschnitt | 2.5 h |
| 9 | Backup & Wiederherstellung | Kap. 5 | A08 | 2.0 h |
| 10 | Risikomanagement, Standards & Abschlussbericht | Kap. 7/8 | ASVS | 3.0 h |
| | | | **Total** | **24.0 h** |

Details je Block: siehe **[projektplan.md](projektplan.md)**.

---

## 🗺️ Umsetzungsreihenfolge (aus der Risikomatrix abgeleitet)

Reihenfolge = **Risiko zuerst (Rot → Gelb)**, mit Berücksichtigung technischer Abhängigkeiten. Herleitung siehe **[risikomatrix.md](risikomatrix.md)**.

| Schritt | Block | Risiko | Warum an dieser Stelle |
|---|---|---|---|
| 1 | **Block 1** – Auth/Access | 🔴 9 | Höchstes Risiko **und** Fundament (erstellt Daten-Proxy + RLS, auf denen andere Blöcke aufbauen) |
| 2 | **Block 2** – DoS-Schutz | 🔴 6 | Schützt die Erreichbarkeit der Seite gegen Überlastung/Massenanfragen |
| 3 | **Block 3** – Logging | 🔴 6 | Nach 1 & 2, damit fehlgeschlagene Logins und Rate-Limit-Treffer (429) direkt mitprotokolliert werden |
| 4 | **Block 5** – Injection | 🟡 4 | Direkt nach Block 1, weil der neue Daten-Proxy sofort gegen Path-Traversal abgesichert werden muss |
| 5 | **Block 6** – Hardening/Header | 🟡 4 | Repo-Cleanup + setzt HTTPS/HSTS/CSP-Basis |
| 6 | **Block 4** – Verschlüsselung/Secrets | 🟡 3 | Baut auf HSTS aus Block 6 auf |
| 7 | **Block 7** – Lieferkette | 🟡 4 | Unabhängig – CI/Dependency-Härtung |
| 8 | **Block 9** – Backup | 🟡 4 | Unabhängig – Verfügbarkeit/Integrität der Daten |
| 9 | **Block 8** – SAST/DAST | 🔧 Werkzeug | **Nach** den Fixes: prüft die Wirksamkeit und findet Restschwachstellen |
| 10 | **Block 10** – Risiko/Report | 📄 Abschluss | Re-Test aller Befunde + Abschlussbericht |

---

## 🎯 Bewertungsraster — 100 Punkte

> Pro Block: **voll** = Befund + Fix + Re-Test-Nachweis · **teilweise** = Befund + Fix ohne sauberen Nachweis · **0** = nur beschrieben.

| Block | Thema | Max. Punkte |
|---|---|---|
| 1 | Sessionhandling, Auth & Autorisierung | 12 |
| 2 | 🛡️ DoS-/Flooding-Schutz (Verfügbarkeit) | 10 |
| 3 | Logging & Monitoring | 10 |
| 4 | Verschlüsselung & Secrets | 8 |
| 5 | Input-Validierung & Injection | 8 |
| 6 | Hardening & Security-Header | 8 |
| 7 | Lieferkette & Abhängigkeiten | 10 |
| 8 | SAST + DAST (Tools) | 10 |
| 9 | Backup & Wiederherstellung | 8 |
| 10 | Risikomanagement, Standards & Report | 16 |
| **Total** | | **100** |

| Punkte | Note (CH) | | Punkte | Note |
|---|---|---|---|---|
| 92–100 | 6.0 | | 56–67 | 4.5 |
| 80–91 | 5.5 | | 44–55 | 4.0 |
| 68–79 | 5.0 | | < 44 | ungenügend |
