# 🔐 Sicherheitsprojekt – Planung

**Modul M183 „Applikationssicherheit implementieren" – Härtung einer realen Web-App**

| | |
|---|---|
| **Projekt** | Albion Blackmarket Reader (`blackmarketreader.com`) |
| **Schüler** | Leon Neuhaus · **Branch:** `security` |
| **Zeitbudget** | 24 Stunden (10 Blöcke) |
| **Ziel** | Eine reale Web-App entlang der M183-Themen analysieren, härten und die Wirksamkeit nachweisen – inkl. Schutz der Verfügbarkeit gegen Überlastungs-/Spam-Angriffe |

> 📄 **Zwei Dokumente:** Dieses hier ist die **Planung** (Definition der Blöcke, Zeit, Bewertung). Die **Umsetzung, Risikomatrix, das Threat Model und alle Nachweise** stehen in **[dokumentation.md](dokumentation.md)**.

> **Scope-Hinweise:**
> - Keine Zahlungsfunktion (Stripe-Code entfernt). Zugriffskontrolle = „angemeldet vs. anonym".
> - Nur Maßnahmen, die **direkt im Code/Repo umsetzbar** sind.
> - Blöcke nach **M183-Kapiteln** ausgewählt und zusätzlich auf **OWASP Top 10 : 2025** gemappt.

---

## 1. Projektkontext

| Schicht | Technologie |
|---|---|
| Frontend | React + TypeScript + Vite |
| Auth + DB | Supabase (JWT, Row Level Security, Postgres) |
| Serverless-API | Vercel-Functions |
| Datensync/Backend | .NET 8 + ~12 GitHub-Actions-Workflows |
| Deployment | Vercel |

### Methodik pro Block
> **Threat Model → Befund (mit Nachweis) → Risiko-Einstufung → Fix im Code → Re-Test (Wirksamkeitsnachweis)**

Jeder Block hat: **💡 Worum geht's?** · **🔍 Bei dir konkret** · **✅ To-dos** · **📸 Nachweis** · **🔗 Mapping** (M183 / OWASP).

---

## 2. Zeitübersicht (Summe = 24 h)

| # | Block | M183-Kapitel | OWASP | Zeit |
|---|---|---|---|---|
| 1 | Sessionhandling, Authentifizierung & Autorisierung | Kap. 2 | A01/A07 | **3.0 h** |
| 2 | 🛡️ **Verfügbarkeit: DoS-/Flooding-Schutz** | Kap. 6 | A06 | **2.5 h** |
| 3 | Logging & Monitoring (Audit-Trail) | Kap. 6 | A09 | **2.5 h** |
| 4 | Verschlüsselung & Schlüssel/Secrets | Kap. 3 | A04 | **2.0 h** |
| 5 | Input-Validierung & Injection-Schutz | Kap. 1/4 | A05 | **2.0 h** |
| 6 | Hardening & Security-Header | Kap. 1 | A02 | **2.0 h** |
| 7 | Lieferkette & Abhängigkeits-Sicherheit | Kap. 7 | A03/A08 | **2.5 h** |
| 8 | IT-Security-Tools: SAST + DAST | Kap. 4 | A06 | **2.5 h** |
| 9 | Backup & Wiederherstellung | Kap. 5 | A08 | **2.0 h** |
| 10 | Risikomanagement, Standards & Abschlussbericht | Kap. 7/8 | alle | **3.0 h** |
| | | | **TOTAL** | **24.0 h** |

> 🛡️ **Block 2** ist der garantierte Verfügbarkeits-Schutz: damit niemand die Seite „vollspammen" kann, bis reguläre Nutzer nichts mehr sehen.
>
> 🗺️ **Umsetzungsreihenfolge** (aus der Risikomatrix abgeleitet): siehe [dokumentation.md](dokumentation.md#risikomatrix).

---

## 3. Detailplanung der Blöcke

### Block 1 — Sessionhandling, Authentifizierung & Autorisierung · 3.0 h ⭐ ✅
> **💡 Worum geht's?** Wer ist eingeloggt (Authentifizierung), wer darf was (Autorisierung), und wie wird die Anmeldung sicher gehalten (Sessionhandling)? Das ist das Fundament.
>
> **🔍 Bei dir konkret:** Die Zugriffskontrolle wird serverseitig und auf Datenbankebene (RLS) verankert, nicht nur im Browser.

**✅ To-dos:**
- [x] Zugriffskontrolle auditieren: RLS-Status + Policies aller Tabellen prüfen
- [x] Belegen, dass nur die eigene Profilzeile lesbar und Schreiben durch Clients verboten ist
- [x] Session-/Auth-Flow (E-Mail-Verifizierung) einordnen

**📸 Nachweis:** Ergebnis & Screenshots in [dokumentation.md → Block 1](dokumentation.md#block-1).
**🔗 Mapping:** M183 Kap. 2 · OWASP A01 + A07. — **Status: ✅ auditiert & verifiziert**

---

### Block 2 — 🛡️ Verfügbarkeit: DoS-/Flooding-Schutz · 2.5 h ⭐ (GARANTIERT)
> **💡 Worum geht's?** Verfügbarkeit (das „A" in CIA): Die Seite muss für echte Nutzer erreichbar bleiben. Bei Flooding/DoS schickt jemand massenhaft Anfragen, bis nichts mehr geht.
>
> **🔍 Bei dir konkret:** Die Endpunkte (Daten-Endpunkt, Login) werden gegen Überlastung/Massenanfragen geschützt; „graceful degradation" sorgt für Erreichbarkeit.

**✅ To-dos:**
- [ ] **Rate-Limiting** in den Serverless-Functions (pro IP/Session): ab N Anfragen → `429 Too Many Requests`
- [ ] **Request-Größe begrenzen**; ungültige/zu große Anfragen früh ablehnen
- [ ] **Caching** gezielt nutzen (Cache-Control in `vercel.json`), damit Anfragen den Cache statt die Funktion treffen
- [ ] **WAF-/DDoS-Mitigation** (Vercel) aktivieren/dokumentieren (M183 Kap. 6)
- [ ] **Statischer Fallback** bei Überlast

**📸 Nachweis:** Last-Test → ab Limit `429`, reguläre Nutzer bleiben bedient. Before/After.
**🔗 Mapping:** M183 Kap. 6 (WAF/Monitoring) · OWASP A06.

---

### Block 3 — Logging & Monitoring (Audit-Trail) · 2.5 h ⭐
> **💡 Worum geht's?** Verdächtiges muss sichtbar werden. Ohne Logs/Audit-Trail merkt man einen Angriff nie – wie ein Laden ohne Kamera.
>
> **🔍 Bei dir konkret:** Strukturiertes Logging (JSON) sicherheitsrelevanter Ereignisse (Login-Fehlschläge, Rate-Limit-Treffer) – ohne Passwörter/Tokens.

**✅ To-dos:**
- [ ] **Strukturiertes JSON-Logging** in allen Functions (Login-Fehler, 401/403, Rate-Limit-Treffer, Validierungsfehler)
- [ ] **Audit-Trail** für sicherheitsrelevante Aktionen
- [ ] **Keine sensiblen Daten loggen** (Log-Injection vermeiden)
- [ ] **Honeytoken** platzieren (Abruf = sicheres Alarmsignal)
- [ ] **Alerting:** CI-Job, der bei Sicherheits-Funden den Build rot färbt

**📸 Nachweis:** Logs vorher (leer) / nachher (strukturiert), Honeytoken-Abruf erzeugt Eintrag.
**🔗 Mapping:** M183 Kap. 6 · OWASP A09.

---

### Block 4 — Verschlüsselung & Schlüssel/Secrets · 2.0 h
> **💡 Worum geht's?** HTTPS/TLS für Transport, Passwörter nur als Hash, geheime Schlüssel nie öffentlich. M183 Kap. 3: symmetrisch/asymmetrisch/hybrid (HTTPS), Hashing.
>
> **🔍 Bei dir konkret:** Zwei Supabase-Schlüssel – öffentlich (Anon-Key, ok) und geheim (Service-Role-Key, nie zum Browser). Wir beweisen, dass nichts Geheimes im Client-Bundle steckt.

**✅ To-dos:**
- [ ] **Bundle-Check:** `dist/` durchsuchen → kein Secret im Client
- [ ] **Schlüssel-Matrix** dokumentieren (öffentlich vs. geheim)
- [ ] **HTTPS + HSTS** als hybrides Verfahren belegen (verzahnt mit Block 6)
- [ ] **Passwort-Hashing** (bcrypt) einordnen; MD5/SHA1 als unsicher abgrenzen
- [ ] Token-Speicherung bewerten (`localStorage`-Risiko dokumentieren)

**📸 Nachweis:** Grep (keine Secrets im Bundle), Schlüssel-Matrix, `curl -I` zeigt HSTS.
**🔗 Mapping:** M183 Kap. 3 · OWASP A04.

---

### Block 5 — Input-Validierung & Injection-Schutz · 2.0 h
> **💡 Worum geht's?** Injection = Schadcode über Eingaben/URL einschmuggeln (SQL-Injection, XSS, Path-Traversal). M183-Regel: **alles Sicherheitsrelevante serverseitig prüfen**.
>
> **🔍 Bei dir konkret:** React/Supabase schützen vieles automatisch. Neue Endpunkte müssen Eingaben streng prüfen (nur erlaubte Werte zulassen).

**✅ To-dos:**
- [ ] Codebase nach `dangerouslySetInnerHTML` / `innerHTML` durchsuchen → XSS-Audit
- [ ] **Allowlist-Validierung** an neuen Endpunkten → Path-Traversal verhindern
- [ ] Input-Validierung der Functions (Token-Format, Body-Felder, Region/City nur aus Allowlist)
- [ ] URL-/String-Bau im .NET-`AlbionApiService` auf Injection prüfen
- [ ] Bösartige Requests mit DevTools/`curl` testen

**📸 Nachweis:** Path-Traversal-/XSS-Versuch scheitert, Audit-Ergebnis.
**🔗 Mapping:** M183 Kap. 1/4 · OWASP A05.

---

### Block 6 — Hardening & Security-Header · 2.0 h
> **💡 Worum geht's?** Viel Sicherheit ist nur eine Frage richtiger Einstellungen. Fehlende Header = Airbag, der nicht aktiviert ist.
>
> **🔍 Bei dir konkret:** Header-Konfiguration in `vercel.json` vervollständigen (CSP/HSTS) und Repo von nicht benötigten Build-Artefakten bereinigen.

**✅ To-dos:**
- [ ] **Build-/Tool-Artefakte entfernen** (`bin/Debug/`, `.claude/settings.json`) + `.gitignore`
- [ ] Vollständiges **Content-Security-Policy** in `vercel.json`
- [ ] **HSTS** + `Permissions-Policy` ergänzen
- [ ] **Source-Maps** in Produktion deaktivieren
- [ ] CORS der Functions restriktiv
- [ ] Header lokal verifizieren (`curl -I`)

**📸 Nachweis:** Header-Antwort vorher/nachher, sauberes `git status`.
**🔗 Mapping:** M183 Kap. 1 · OWASP A02.

---

### Block 7 — Lieferkette & Abhängigkeits-Sicherheit · 2.5 h ⭐
> **💡 Worum geht's?** Die App nutzt fremden Code (npm, GitHub-Actions). Wird ein Paket kompromittiert, ist die App es auch. ISO 27001 fordert geregelten Umgang mit Code & Änderungen.
>
> **🔍 Bei dir konkret:** Viele npm-Pakete + ~12 Actions auf `@v4`. Fest pinnen, auf bekannte Lücken prüfen, automatische Update-Warnungen aktivieren.

**✅ To-dos:**
- [ ] `npm audit` + `dotnet list package --vulnerable`, Funde beheben
- [ ] **GitHub Actions auf Commit-SHA pinnen**
- [ ] **Dependabot** einrichten (npm + NuGet + actions)
- [ ] In CI **`npm ci`** statt `npm install`
- [ ] Minimale `permissions:` für `GITHUB_TOKEN`

**📸 Nachweis:** `npm audit`-Diff, gepinnte Workflows, `dependabot.yml`.
**🔗 Mapping:** M183 Kap. 7 (ISO 27001) · OWASP A03 + A08.

---

### Block 8 — IT-Security-Tools: SAST + DAST · 2.5 h ⭐
> **💡 Worum geht's?** M183 Kap. 4: **SAST** durchsucht den Quellcode (Whitebox), **DAST** greift die laufende App von außen an (Blackbox, OWASP ZAP).
>
> **🔍 Bei dir konkret:** Bisher prüft nichts automatisch. Beides einbauen und echte Tool-Reports als Nachweis liefern.

**✅ To-dos:**
- [ ] **SAST in CI:** GitHub CodeQL (oder Semgrep) als Workflow
- [ ] **DAST:** OWASP **ZAP** gegen die laufende App → Report
- [ ] Findings triagieren (echt vs. false positive)
- [ ] Mindestens 1 Finding fixen und mit Re-Scan belegen
- [ ] Tool-Reports im Repo ablegen

**📸 Nachweis:** CodeQL-Workflow grün, ZAP-Report vorher/nachher.
**🔗 Mapping:** M183 Kap. 4 · OWASP-Querschnitt.

---

### Block 9 — Backup & Wiederherstellung · 2.0 h
> **💡 Worum geht's?** M183 Kap. 5: Backups sichern die **Verfügbarkeit** der Daten. Ein Backup ist nur gut, wenn man es auch **wiederherstellen** kann.
>
> **🔍 Bei dir konkret:** Kein dokumentiertes Backup-Konzept. Wir bauen ein reproduzierbares, getestetes Konzept.

**✅ To-dos:**
- [ ] **DB-Dump** der Supabase-Postgres automatisiert (`pg_dump` via GitHub-Action)
- [ ] **Restore-Test** durchführen und dokumentieren
- [ ] Online- vs. Offline-Backup + **3-2-1-Regel** + getrennter Lagerort
- [ ] **Backup verschlüsseln** + Zugriff minimieren
- [ ] Generierte JSON-Daten in Backup-Strategie aufnehmen

**📸 Nachweis:** Backup-Workflow + erfolgreicher Restore-Test (Log).
**🔗 Mapping:** M183 Kap. 5 · OWASP A08.

---

### Block 10 — Risikomanagement, Standards & Abschlussbericht · 3.0 h ⭐
> **💡 Worum geht's?** M183 Kap. 7/8: Risiken bewerten (W × S) und gegen Standards (OWASP ASVS, ISO 27001) spiegeln. Zum Schluss beweisen, dass die Fixes wirken.
>
> **🔍 Bei dir konkret:** Alle Befunde in der Risikomatrix zusammenfassen, auf OWASP ASVS mappen, Re-Test zeigt, dass jeder Angriff von vorher nun scheitert.

**✅ To-dos:**
- [ ] Threat Model finalisieren (in [dokumentation.md](dokumentation.md))
- [ ] **Risikomatrix** über alle Befunde (Risiko vorher/nachher)
- [ ] Mapping auf **OWASP ASVS** + ISO-27001-Punkte
- [ ] **Re-Test** aller Punkte aus Blöcken 1–9
- [ ] **Abschlussbericht** (Management-Summary + Before/After)

**📸 Nachweis:** Risikomatrix, grüne Re-Test-Tabelle, vollständiger Report.
**🔗 Mapping:** M183 Kap. 7/8 · OWASP gesamt (ASVS).

---

## 4. Bewertungsraster (für die Lehrperson) — 100 Punkte

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

**Notenschlüssel (Vorschlag):**

| Punkte | Note | | Punkte | Note |
|---|---|---|---|---|
| 92–100 | 6.0 | | 56–67 | 4.5 |
| 80–91 | 5.5 | | 44–55 | 4.0 |
| 68–79 | 5.0 | | < 44 | ungenügend |

---

## 5. Eingesetztes Tooling (kostenlos / direkt im Repo)

| Zweck | Tool | M183-Kapitel |
|---|---|---|
| DAST (Blackbox-Scan) | OWASP **ZAP** | Kap. 4 |
| SAST (Whitebox-Scan) | GitHub **CodeQL** / Semgrep | Kap. 4 |
| Endpunkt-/Last-Tests | `curl`, Browser-DevTools, Postman | Kap. 4 |
| Dependency-Audit | `npm audit`, `dotnet list package --vulnerable` | Kap. 7 |
| Dependency-Updates | Dependabot | Kap. 7 |
| Backup | `pg_dump` via GitHub-Action | Kap. 5 |
| Header-Check | `curl -I` gegen `vite preview` | Kap. 1 |
