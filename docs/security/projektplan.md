# 🔐 Sicherheitsprojekt – Albion Blackmarket Reader

**Modul M183 „Applikationssicherheit implementieren" – Härtung einer realen Web-App**

| | |
|---|---|
| **Projekt** | Albion Blackmarket Reader (`blackmarketreader.com`) |
| **Schüler** | Leon Neuhaus |
| **Zeitbudget** | 24 Stunden (10 Blöcke) |
| **Ziel** | Eine reale Web-App entlang der M183-Themen analysieren, härten und die Wirksamkeit nachweisen – inkl. Schutz der Verfügbarkeit gegen Überlastungs-/Spam-Angriffe |
| **Abgabeform** | Code (Git-Branch `security`), Threat Model, Befund-/Fix-Dokumentation, Re-Test-Nachweise, Risikomatrix |

> **Scope-Hinweise:**
> - Das Projekt hat **(noch) keine Zahlungsfunktion** – Stripe-Code wird zu Beginn entfernt. Zugriffskontrolle = „angemeldet vs. anonym".
> - Diese Planung enthält **nur Maßnahmen, die direkt im Code/Repo umsetzbar sind** (Dateien, Konfiguration, SQL-Migrationen, CI-Workflows).
> - Die 10 Blöcke sind aus den **M183-Kapiteln** ausgewählt (die für dieses Projekt am meisten bringen und noch fehlen) und zusätzlich auf die **OWASP Top 10 : 2025** gemappt.

---

## 1. Projektkontext

| Schicht | Technologie |
|---|---|
| Frontend | React + TypeScript + Vite |
| Auth + DB | Supabase (JWT, Row Level Security, Postgres) |
| Serverless-API | Vercel-Functions (im Projekt **neu erstellt** für Auth-/Daten-Schutz) |
| Datensync/Backend | .NET 8 + ~12 GitHub-Actions-Workflows |
| Deployment | Vercel |

### Methodik pro Block (durchgängig gleich)

> **Threat Model → Befund (mit Nachweis) → Risiko-Einstufung → Fix im Code → Re-Test (Wirksamkeitsnachweis)**

Jeder Block hat: **💡 Worum geht's?** (einfach erklärt) · **🔍 Bei dir konkret** (Problem im Projekt) · **✅ To-dos** · **📸 Nachweis** · **🔗 Mapping** (M183-Kapitel / OWASP).

---

## 2. Zeitübersicht (Summe = 24 h)

| # | Block | M183-Kapitel | OWASP | Zeit |
|---|---|---|---|---|
| 1 | Sessionhandling, Authentifizierung & Autorisierung | Kap. 2 | A01/A07 | **3.0 h** |
| 2 | 🛡️ **Verfügbarkeit: DoS-/Flooding-Schutz (Rate-Limiting + WAF)** | Kap. 6 | A06 | **2.5 h** |
| 3 | Logging & Monitoring (Audit-Trail) | Kap. 6 | A09 | **2.5 h** |
| 4 | Verschlüsselung & Schlüssel/Secrets | Kap. 3 | A04 | **2.0 h** |
| 5 | Input-Validierung & Injection-Schutz | Kap. 1/4 | A05 | **2.0 h** |
| 6 | Hardening & Security-Header (Konfiguration) | Kap. 1 | A02 | **2.0 h** |
| 7 | Lieferkette & Abhängigkeits-Sicherheit | Kap. 7 | A03/A08 | **2.5 h** |
| 8 | IT-Security-Tools: SAST + DAST (ZAP + CI-Scan) | Kap. 4 | A06 | **2.5 h** |
| 9 | Backup & Wiederherstellung | Kap. 5 | A08 | **2.0 h** |
| 10 | Risikomanagement, Standards & Abschlussbericht | Kap. 7/8 | alle | **3.0 h** |
| | | | **TOTAL** | **24.0 h** |

> 🛡️ **Block 2 ist der garantiert enthaltene Verfügbarkeits-Schutz**: Damit niemand die Seite „vollspammen" kann, bis reguläre Nutzer nichts mehr sehen.

---

## 3. Threat Model (Kurzfassung – wird in Block 10 verfeinert)

```
        ┌───────────┐   HTTPS    ┌──────────────────┐
 User ──┤  Browser  ├───────────►│  Vercel (Static  │
        │ (React)   │            │  + Serverless)   │
        └─────┬─────┘            └────────┬─────────┘
              │ JWT (localStorage)        │ (Token-Prüfung + Rate-Limit)
              │                           ▼
              │                  ┌──────────────────┐
              ├─────────────────►│  Supabase (Auth, │
              │   Anon-Key + RLS │  Postgres, RLS)  │
              │                  └──────────────────┘
```

**Trust Boundaries:** Browser↔Vercel, Vercel↔Supabase.
**Schutzziele (CIA):** Vertraulichkeit (Daten/Secrets), Integrität (Daten/Pipeline), **Verfügbarkeit (Schutz vor Überlastung)**.

---

## 4. Detailplanung der Blöcke

### Block 1 — Sessionhandling, Authentifizierung & Autorisierung · 3.0 h ⭐
> **💡 Worum geht's?** Wer ist eingeloggt (Authentifizierung), wer darf was (Autorisierung), und wie wird die Anmeldung sicher gehalten (Sessionhandling)? Das ist das Fundament – ist es kaputt, kommt man an fremde Daten.
>
> **🔍 Bei dir konkret:** Die Zugriffskontrolle (`AuthGuard`) wirkt aktuell überwiegend clientseitig; die Anmelde-Session liegt im Browser. Ziel: Schutz serverseitig und auf Datenbankebene (RLS) verankern, damit er nicht nur in der UI besteht.
>
> _Hinweis: konkrete Ausgangslage/PoC nur intern – siehe [findings.md](findings.md) (Responsible Disclosure)._

**✅ To-dos:**
- [ ] **Ausgangslage intern festhalten** (PoC/Screenshot wird gemäß Responsible Disclosure erst nach dem Fix öffentlich ergänzt)
- [ ] **Authentifizierte Daten-Proxy-Function** (`ui/api/data/[file].js`): prüft Supabase-JWT, liefert Daten nur bei gültigem Token
- [ ] Geschützte JSON aus `public/` herausnehmen
- [ ] **RLS auf jeder Tabelle** aktivieren (`supabase/migrations/*.sql`), Standard „deny by default", Zugriff nur auf eigene Zeilen (`auth.uid() = user_id`)
- [ ] Session-Handling prüfen: `signOut`-Invalidierung, Token-Ablauf/Refresh
- [ ] E-Mail-Verifizierungs-Pflicht (`email_confirmed_at`) als korrekt belegen

**📸 Nachweis:** Direktzugriff liefert `401/403`; angemeldeter User bekommt Daten. Anon-Key gegen Supabase-REST → fremde Daten nicht abrufbar.
**🔗 Mapping:** M183 Kap. 2 · OWASP A01 + A07.

---

### Block 2 — 🛡️ Verfügbarkeit: DoS-/Flooding-Schutz · 2.5 h ⭐ (GARANTIERT)
> **💡 Worum geht's?** Verfügbarkeit (das „A" in CIA) heißt: Die Seite muss für echte Nutzer erreichbar bleiben. Bei einem Flooding-/DoS-Angriff schickt jemand massenhaft Anfragen, bis der Server überlastet ist und **niemand mehr etwas sieht**. Genau dagegen bauen wir Schutz.
>
> **🔍 Bei dir konkret:** Ziel ist, die Endpunkte (Daten-Endpunkt, Login) gegen Überlastung/Massenanfragen zu schützen und für „graceful degradation" zu sorgen, damit die Seite für reguläre Nutzer erreichbar bleibt.

**✅ To-dos:**
- [ ] **Rate-Limiting** in den Serverless-Functions (Fixed-Window/Token-Bucket pro IP/Session): nach N Anfragen pro Zeitfenster → `429 Too Many Requests`
- [ ] **Request-Größe begrenzen** (Body-Limit) und ungültige/zu große Anfragen früh ablehnen
- [ ] **Caching nutzen**, um Last abzufangen (deine `Cache-Control`-Header in `vercel.json` gezielt verschärfen → Anfragen treffen den Cache statt die Funktion)
- [ ] **WAF-/Firewall-Gedanke (Defense in Depth):** Vercels integrierte DDoS-/Bot-Mitigation aktivieren, Regeln/Challenge dokumentieren (M183 Kap. 6: WAF)
- [ ] **Statischer Fallback**, damit die Seite bei Überlast wenigstens lesend funktioniert

**📸 Nachweis:** Last-Test (z. B. viele Requests via `curl`/Skript) → Endpunkt antwortet ab Limit mit `429`, reguläre Nutzer bleiben bedient. Before/After.
**🔗 Mapping:** M183 Kap. 6 (WAF/Monitoring) · OWASP A06 (Insecure Design / fehlendes Rate-Limit).

---

### Block 3 — Logging & Monitoring (Audit-Trail) · 2.5 h ⭐
> **💡 Worum geht's?** Wenn etwas Verdächtiges passiert, muss man es **sehen**. Ohne Protokolle (Logs/Audit-Trail) merkt man einen Angriff oft nie – wie ein Laden ohne Überwachungskamera.
>
> **🔍 Bei dir konkret:** Ziel ist ein strukturiertes Logging (JSON) sicherheitsrelevanter Ereignisse (z. B. fehlgeschlagene Logins, Rate-Limit-Treffer aus Block 2) – ohne Passwörter/Tokens zu speichern –, damit Auffälligkeiten überhaupt erkennbar werden.

**✅ To-dos:**
- [ ] **Strukturiertes JSON-Logging** in allen Functions (Zeitstempel, Event, IP/Session-Ref): fehlgeschlagene Logins, 401/403, Rate-Limit-Treffer (aus Block 2), Validierungsfehler
- [ ] **Audit-Trail** für sicherheitsrelevante Aktionen (Login-Erfolg/-Fehlschlag, Datenmutationen)
- [ ] **Keine sensiblen Daten loggen** (Passwörter, Tokens, Keys) – bewusst sicherstellen (Log-Injection vermeiden)
- [ ] **Honeytoken** platzieren: ein Fake-Datensatz/Endpunkt, dessen Abruf garantiert ein Alarmsignal ist (M183 Kap. 6)
- [ ] **Alerting im Code-Scope:** CI-Job, der bei Sicherheits-Funden (`npm audit` high/critical) den Build rot färbt

**📸 Nachweis:** Log-Ausgaben vorher (leer) / nachher (strukturierte Events), Honeytoken-Abruf erzeugt sichtbaren Eintrag.
**🔗 Mapping:** M183 Kap. 6 · OWASP A09.

---

### Block 4 — Verschlüsselung & Schlüssel/Secrets · 2.0 h
> **💡 Worum geht's?** Sensible Daten müssen verschlüsselt übertragen/gespeichert werden (HTTPS/TLS), Passwörter nur als Hash, und geheime Schlüssel dürfen **nie** öffentlich werden. M183 Kap. 3: symmetrisch/asymmetrisch/hybrid (HTTPS = hybrides Verfahren), Hashing.
>
> **🔍 Bei dir konkret:** Du hast zwei Supabase-Schlüssel – öffentlich (Anon-Key, ok) und geheim (Service-Role-Key, darf nie zum Browser). Passwörter hasht Supabase bereits (bcrypt). Wir beweisen, dass nichts Geheimes im ausgelieferten Code steckt.

**✅ To-dos:**
- [ ] **Bundle-Check:** `dist/` durchsuchen → kein Service-Role-Key / kein Secret im Client
- [ ] **Schlüssel-Matrix** dokumentieren (welcher Key wo, öffentlich vs. geheim) → `docs/`
- [ ] **HTTPS + HSTS** als hybrides Verschlüsselungsverfahren belegen (verzahnt mit Block 6)
- [ ] **Passwort-Hashing** (Supabase = bcrypt) einordnen; MD5/SHA1 als unsicher abgrenzen (M183-Theorie)
- [ ] Token-Speicherung bewerten: Risiko `localStorage` dokumentieren, Supabase-`storage`/`autoRefresh` prüfen

**📸 Nachweis:** Grep-Ergebnis (keine Secrets im Bundle), Schlüssel-Matrix, `curl -I` zeigt HSTS.
**🔗 Mapping:** M183 Kap. 3 · OWASP A04.

---

### Block 5 — Input-Validierung & Injection-Schutz · 2.0 h
> **💡 Worum geht's?** „Injection" heißt: Jemand schmuggelt über Eingaben/URL Schadcode ein (SQL-Injection, XSS, Path-Traversal). Regel aus M183: **alles Sicherheitsrelevante serverseitig prüfen** – Hidden-Fields & Client-Checks sind manipulierbar.
>
> **🔍 Bei dir konkret:** React und Supabase schützen vieles automatisch. Heikel ist der neue Daten-Proxy (Block 1): Bei `?file=../../secret` darf niemand fremde Dateien bekommen. Wir lassen nur erlaubte Werte zu.

**✅ To-dos:**
- [ ] Codebase nach `dangerouslySetInnerHTML` / `innerHTML` durchsuchen → XSS-Audit
- [ ] **Allowlist-Validierung** im Daten-Proxy (nur definierte Dateinamen) → Path-Traversal verhindern
- [ ] Input-Validierung der Functions (Token-Format, Body-Felder, Region/City nur aus Allowlist)
- [ ] URL-/String-Bau im .NET-`AlbionApiService` auf Injection prüfen
- [ ] Mit Browser-DevTools/`curl` bösartige Requests testen (Hidden-Field-/Parameter-Manipulation)

**📸 Nachweis:** Path-Traversal-/XSS-Versuch scheitert (Screenshot/Response), Audit-Ergebnis.
**🔗 Mapping:** M183 Kap. 1/4 · OWASP A05.

---

### Block 6 — Hardening & Security-Header (Konfiguration) · 2.0 h
> **💡 Worum geht's?** Viel Sicherheit ist nur eine Frage richtiger Einstellungen. Fehlende Schutz-Header sind wie ein Airbag, der nicht aktiviert ist.
>
> **🔍 Bei dir konkret:** Die Header-Konfiguration in `vercel.json` wird vervollständigt (u. a. CSP/HSTS) und das Repo von nicht benötigten Build-Artefakten bereinigt – die Schutzschalter werden also vollständig aktiviert.

**✅ To-dos:**
- [ ] **Build-/Tool-Artefakte entfernen** (`bin/Debug/`, `.claude/settings.json`) + `.gitignore` ergänzen
- [ ] Vollständiges **Content-Security-Policy** in `vercel.json`
- [ ] **HSTS** + `Permissions-Policy` ergänzen
- [ ] **Source-Maps** in Produktion deaktivieren (`vite.config` → `build.sourcemap: false`)
- [ ] CORS der Functions restriktiv (keine `*`-Wildcards bei Auth-/Schreib-Endpunkten)
- [ ] Header lokal verifizieren (`curl -I` gegen `vite preview`)

**📸 Nachweis:** Header-Antwort vorher/nachher, sauberes `git status`.
**🔗 Mapping:** M183 Kap. 1 · OWASP A02.

---

### Block 7 — Lieferkette & Abhängigkeits-Sicherheit · 2.5 h ⭐
> **💡 Worum geht's?** Deine App nutzt fremden Code (npm, GitHub-Actions). Wird ein fremdes Paket kompromittiert, ist deine App es auch. ISO 27001 (M183 Kap. 7) fordert geregelten Umgang mit Code & Änderungen.
>
> **🔍 Bei dir konkret:** Viele npm-Pakete + ~12 Actions auf `@v4` (kann sich heimlich ändern). Wir pinnen fest, prüfen auf bekannte Lücken und schalten automatische Update-Warnungen ein.

**✅ To-dos:**
- [ ] `npm audit` + `dotnet list package --vulnerable` ausführen, Funde beheben
- [ ] **GitHub Actions auf Commit-SHA pinnen** in allen `.github/workflows/*.yml`
- [ ] **Dependabot** einrichten (`.github/dependabot.yml`) für npm + NuGet + actions
- [ ] In CI **`npm ci`** statt `npm install` (Lockfile-Integrität)
- [ ] Minimale `permissions:` für `GITHUB_TOKEN` in den Workflows

**📸 Nachweis:** `npm audit`-Diff, gepinnte Workflows, `dependabot.yml`.
**🔗 Mapping:** M183 Kap. 7 (ISO 27001) · OWASP A03 + A08.

---

### Block 8 — IT-Security-Tools: SAST + DAST · 2.5 h ⭐
> **💡 Worum geht's?** M183 Kap. 4: Mit Tools Schwachstellen finden. **SAST** durchsucht den Quellcode (Whitebox), **DAST** greift die laufende App von außen an (Blackbox, z. B. OWASP ZAP).
>
> **🔍 Bei dir konkret:** Bisher prüft nichts automatisch deinen Code/deine Seite. Wir bauen beides ein und liefern echte Tool-Reports als Nachweis.

**✅ To-dos:**
- [ ] **SAST in CI:** GitHub CodeQL (oder Semgrep) als Workflow → scannt bei jedem Commit
- [ ] **DAST:** OWASP **ZAP** gegen die laufende App (Preview-Deployment) laufen lassen → Report
- [ ] Findings triagieren (echt vs. false positive), die echten in Befundliste übernehmen
- [ ] Mindestens 1 ZAP-Finding fixen und mit Re-Scan belegen
- [ ] Tool-Reports im Repo ablegen (`docs/scans/`)

**📸 Nachweis:** CodeQL-Workflow grün, ZAP-Report vorher/nachher.
**🔗 Mapping:** M183 Kap. 4 · OWASP-Querschnitt.

---

### Block 9 — Backup & Wiederherstellung · 2.0 h
> **💡 Worum geht's?** M183 Kap. 5: Backups sichern die **Verfügbarkeit** der Daten (z. B. nach versehentlichem Löschen oder Ransomware). Ein Backup ist nur dann gut, wenn man es auch **wiederherstellen** kann.
>
> **🔍 Bei dir konkret:** Es gibt kein dokumentiertes Backup-Konzept für die Supabase-DB und die generierten Daten. Wir bauen ein reproduzierbares, getestetes Konzept.

**✅ To-dos:**
- [ ] **DB-Dump** der Supabase-Postgres automatisiert (GitHub-Action, z. B. `pg_dump`) → versioniert/abgelegt
- [ ] **Restore-Test** durchführen und dokumentieren (Backup ist nur gültig, wenn Wiederherstellung klappt)
- [ ] Online- vs. Offline-Backup einordnen; **3-2-1-Regel** + getrennter Lagerort dokumentieren
- [ ] **Backup verschlüsseln** (Bezug zu Block 4) + Zugriff minimieren
- [ ] Generierte JSON-Daten der CI-Pipeline in Backup-Strategie aufnehmen

**📸 Nachweis:** Backup-Workflow + erfolgreicher Restore-Test (Log), Backup-Konzept in `docs/`.
**🔗 Mapping:** M183 Kap. 5 · OWASP A08 (Integrität/Verfügbarkeit).

---

### Block 10 — Risikomanagement, Standards & Abschlussbericht · 3.0 h ⭐
> **💡 Worum geht's?** M183 Kap. 7/8: Risiken bewerten (Eintrittswahrscheinlichkeit × Schaden) und gegen Standards (OWASP ASVS, ISO 27001, IKT-Minimalstandard) spiegeln. Zum Schluss: beweisen, dass die Fixes wirken, und alles abgabefertig aufschreiben.
>
> **🔍 Bei dir konkret:** Du fasst alle Befunde in einer **Risikomatrix** zusammen, mappst sie auf **OWASP ASVS**, und zeigst per Re-Test, dass jeder Angriff von vorher nun scheitert (z. B. JSON-Direktaufruf → `403`).

**✅ To-dos:**
- [ ] Threat Model finalisieren → `docs/threat-model.md`
- [ ] **Risikomatrix** (rot/gelb/grün) über alle Befunde → `docs/findings.md` (Risiko vorher/nachher)
- [ ] Mapping auf **OWASP ASVS** + relevante ISO-27001-Punkte (Code, Änderungen, Testing)
- [ ] **Re-Test** aller Exploits aus Blöcken 1–9 → Re-Test-Tabelle
- [ ] **Abschlussbericht** `docs/security-report.md` (Management-Summary + Kapitel mit Before/After)
- [ ] Abgabe-Checkliste prüfen (Abschnitt 6)

**📸 Nachweis:** Risikomatrix, grüne Re-Test-Tabelle, vollständiger Report.
**🔗 Mapping:** M183 Kap. 7/8 · OWASP gesamt (ASVS).

---

## 5. Bewertungsraster (für die Lehrperson) — 100 Punkte

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

| Punkte | Note (CH) |
|---|---|
| 92–100 | 6.0 |
| 80–91 | 5.5 |
| 68–79 | 5.0 |
| 56–67 | 4.5 |
| 44–55 | 4.0 |
| < 44 | ungenügend |

---

## 6. Abgabe-Checkliste

- [ ] Branch `security` mit nachvollziehbaren Commits pro Block
- [ ] `supabase/migrations/*.sql` (RLS-Policies, versioniert)
- [ ] `docs/threat-model.md`
- [ ] `docs/findings.md` (Risikomatrix, Risiko vorher/nachher)
- [ ] `docs/security-report.md` (Management-Summary + Before/After pro Block)
- [ ] `docs/scans/` (CodeQL- & ZAP-Reports)
- [ ] Backup-Workflow + Restore-Test-Nachweis
- [ ] Re-Test-Tabelle (alle Exploits scheitern nach Fix), Screenshots/Logs

---

## 7. Eingesetztes Tooling (alles ohne Kosten / direkt im Repo)

| Zweck | Tool | M183-Kapitel |
|---|---|---|
| DAST (Blackbox-Scan) | OWASP **ZAP** | Kap. 4 |
| SAST (Whitebox-Scan) | GitHub **CodeQL** / Semgrep | Kap. 4 |
| Endpunkt-/Last-Tests | `curl`, Browser-DevTools, Postman | Kap. 4 |
| Dependency-Audit | `npm audit`, `dotnet list package --vulnerable` | Kap. 7 |
| Dependency-Updates | Dependabot | Kap. 7 |
| Backup | `pg_dump` via GitHub-Action | Kap. 5 |
| Header-Check | `curl -I` gegen `vite preview` | Kap. 1 |

---

*Erstellt als Planungs- und Bewertungsgrundlage. Auswahl der 10 Blöcke nach Nutzen für dieses Projekt, M183-Kapitelbezug und 24-h-Budget. Enthält garantiert den Verfügbarkeits-/DoS-Schutz (Block 2). Alle Maßnahmen sind direkt im Code/Repo umsetzbar, ohne Zahlungsfunktion.*
