# 🔐 Sicherheitsprojekt – Dokumentation & Umsetzung

**Modul M183 · Albion Blackmarket Reader · Branch `security`**

> 📄 Dieses Dokument enthält **Threat Model, Risikomatrix, Härtungs-Tracker und die Nachweise pro Block**. Die Block-Definitionen und der Zeitplan stehen in **[planung.md](planung.md)**.

> ⚠️ **Verantwortungsvolle Offenlegung (Responsible Disclosure):** Repo öffentlich, App produktiv. Daher **keine konkreten Exploit-Anleitungen/Pfade/PoCs zu noch offenen Punkten**. Detail-Nachweise werden zu einem Punkt erst ergänzt, **nachdem er umgesetzt ist**.

---

## 1. Threat Model

### 1.1 Systemüberblick & Datenflüsse
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
        │  • Datensync (.NET) → schreibt JSON ins Repo  │
        │  • Build/Deploy → Vercel                      │
        └──────────────────────────────────────────────┘
```

### 1.2 Trust Boundaries
| Grenze | Beschreibung | Hauptrisiko |
|---|---|---|
| **Browser ↔ Vercel** | Alles aus dem Browser ist nicht vertrauenswürdig | Direkter Datenzugriff, Request-Flooding, Parameter-Manipulation |
| **Vercel ↔ Supabase** | Anon-Key ist öffentlich; RLS ist die Schutzgrenze | RLS muss serverseitig greifen |
| **CI ↔ Repo/Deploy** | Fremder Code (Actions, npm) mit Schreibrechten | Lieferketten-Kompromittierung, manipulierte Daten |

### 1.3 Schutzziele (CIA)
| Ziel | Im Projekt | Block |
|---|---|---|
| **Vertraulichkeit** | Geschützte Daten, Konten, Secrets | 1, 4, 5, 6 |
| **Integrität** | Daten, Pipeline, Abhängigkeiten | 5, 7, 9 |
| **Verfügbarkeit** | Seite muss erreichbar bleiben | **2** (DoS-Schutz), 9 (Backup) |

### 1.4 Angreifer-Profile
| Profil | Motivation | Typischer Angriff |
|---|---|---|
| **Datensammler/Scraper** | Marktdaten abgreifen | Automatisierter Datenabruf, Massen-Requests → H-01, H-02 |
| **Script-Kiddie** | Stören | Überlastung, bekannte CVEs → H-02, H-07 |
| **Account-Angreifer** | Konto übernehmen | Login-Angriffe, Session-Diebstahl → H-01, H-04 |
| **Opportunist** | Fehlkonfiguration ausnutzen | Fehlende Header, Secret-Handling → H-06, H-04 |

### 1.5 Kronjuwelen
1. **Geschützte Marktdaten** – Zugriffskontrolle serverseitig (H-01) → Block 1
2. **Erreichbarkeit der Seite** – Überlastschutz (H-02) → Block 2
3. **Benutzerkonten / Sessions** (H-01, H-04) → Block 1, 4
4. **Schlüssel/Secrets** (H-04) → Block 4, 6
5. **Daten-Pipeline & Abhängigkeiten** (H-07, H-09) → Block 7, 9

---

## 2. Risikomatrix <a id="risikomatrix"></a>

**Methode (M183 Kap. 8):** Risiko = **Eintrittswahrscheinlichkeit (W) × Schadenspotenzial (S)**.

| Stufe | W | S |
|---|---|---|
| 1 | Gering – aufwendig/unwahrscheinlich | Gering – kaum Auswirkung |
| 2 | Mittel – mit Aufwand machbar | Mittel – begrenzter Schaden |
| 3 | Hoch – sehr wahrscheinlich | Hoch – schwerer Schaden |

**Risiko:** 🟢 1–2 (Restrisiko ok) · 🟡 3–4 (beheben) · 🔴 6–9 (zwingend beheben).

### Bewertung pro Maßnahme
| ID | Härtungsmaßnahme | Block | W | S | Risiko | Stufe |
|---|---|---|---|---|---|---|
| **H-01** | Zugriffskontrolle serverseitig + RLS verankern | 1 | 3 | 3 | **9** | 🔴 |
| **H-02** | Verfügbarkeit gegen Überlastung/Flooding schützen | 2 | 2 | 3 | **6** | 🔴 |
| **H-03** | Sicherheitsereignisse protokollieren (Logging) | 3 | 3 | 2 | **6** | 🔴 |
| **H-04** | Schlüssel/Secret-Handling absichern | 4 | 1 | 3 | **3** | 🟡 |
| **H-05** | Eingabevalidierung der Endpunkte | 5 | 2 | 2 | **4** | 🟡 |
| **H-06** | Security-Header (CSP/HSTS) + Repo-Hygiene | 6 | 2 | 2 | **4** | 🟡 |
| **H-07** | Lieferkette härten (Pinning, Updates, Audit) | 7 | 2 | 2 | **4** | 🟡 |
| **H-08** | Automatisierte Sicherheits-Scans (SAST/DAST) | 8 | — | — | Werkzeug | 🔧 |
| **H-09** | Backup- & Wiederherstellungskonzept | 9 | 2 | 2 | **4** | 🟡 |
| **H-10** | Risiken systematisch bewerten & dokumentieren | 10 | — | — | Prozess | 📄 |

> Hinweis: H-04 ist aktuell unwahrscheinlich (HTTPS erzwungen, Anon-Key bewusst öffentlich), hätte aber bei Eintritt hohen Schaden. H-09 „mittel" beim Schaden, weil Marktdaten aus der öffentlichen Albion-API + Git rekonstruierbar sind.

### Abgeleitete Umsetzungsreihenfolge
Primär nach Risiko (🔴 → 🟡), korrigiert um technische Abhängigkeiten:

| Schritt | Maßnahme (Block) | Risiko | Begründung |
|---|---|---|---|
| 1 | H-01 (B1) | 🔴 9 | Höchstes Risiko **und** Fundament |
| 2 | H-02 (B2) | 🔴 6 | Verfügbarkeit |
| 3 | H-03 (B3) | 🔴 6 | Nach 1+2, damit Auth-/Überlast-Ereignisse geloggt werden |
| 4 | H-05 (B5) | 🟡 4 | Direkt nach B1 – neue Endpunkte sofort validieren |
| 5 | H-06 (B6) | 🟡 4 | Repo-Hygiene + Basis für HTTPS/HSTS/CSP |
| 6 | H-04 (B4) | 🟡 3 | Nutzt HSTS aus B6 |
| 7 | H-07 (B7) | 🟡 4 | Unabhängig |
| 8 | H-09 (B9) | 🟡 4 | Unabhängig |
| 9 | H-08 (B8) | 🔧 | Nach den Fixes: Wirksamkeit prüfen + Rest finden |
| 10 | H-10 (B10) | 📄 | Abschluss + Re-Test + Bericht |

---

## 3. Härtungs-Tracker

**Status:** ⚪ geplant · 🟠 in Arbeit · 🟢 umgesetzt & verifiziert

| ID | Maßnahme | Block | Priorität | Status | Risiko nachher |
|---|---|---|---|---|---|
| H-01 | Zugriffskontrolle (Auth + RLS) | 1 | 🔴 hoch | 🟢 verifiziert | 🟢 niedrig |
| H-02 | Verfügbarkeit (Überlastschutz / Rate-Limiting) | 2 | 🔴 hoch | 🟢 umgesetzt & belegt | 🟢 niedrig |
| H-03 | Logging & Audit-Trail | 3 | 🔴 hoch | ⚪ geplant | – |
| H-04 | Schlüssel/Secrets | 4 | 🟡 mittel | ⚪ geplant | – |
| H-05 | Eingabevalidierung | 5 | 🟡 mittel | ⚪ geplant | – |
| H-06 | Security-Header & Repo-Hygiene | 6 | 🟡 mittel | ⚪ geplant | – |
| H-07 | Lieferkette | 7 | 🟡 mittel | ⚪ geplant | – |
| H-08 | SAST/DAST | 8 | 🔧 | ⚪ geplant | – |
| H-09 | Backup & Restore | 9 | 🟡 mittel | ⚪ geplant | – |
| H-10 | Risikobewertung & Bericht | 10 | 📄 | ⚪ geplant | – |

---

## 4. Umsetzung pro Block

### Block 1 — Zugriffskontrolle (Auth & RLS) ✅ <a id="block-1"></a>
**M183 Kap. 2 · OWASP A01/A07 · Status: auditiert & verifiziert**

**Ziel:** Jeder Benutzer darf nur auf die eigenen Daten zugreifen; die Kontrolle ist serverseitig in der Datenbank (RLS) verankert, nicht nur im Browser.

**Vorgehen:** Die App liest/schreibt `profiles` aus dem Browser mit dem öffentlichen Anon-Key. Der wirksame Schutz muss daher per RLS erfolgen. Geprüft wurde: RLS aktiv? Policy restriktiv? Alle public-Tabellen abgedeckt?

**Soll-Konfiguration** (so wird der Schutz hergestellt – Supabase → SQL Editor):
```sql
-- RLS für die Tabelle aktivieren
alter table public.profiles enable row level security;

-- Lesen nur der EIGENEN Profilzeile
create policy "read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Kein INSERT/UPDATE/DELETE-Policy => Schreibzugriff durch Clients
-- ist standardmaessig verboten (secure by default).
```

**Verifikation:**

*1. RLS ist auf `profiles` aktiv (`rls_aktiv = true`)*
```sql
select relname as tabelle, relrowsecurity as rls_aktiv
from pg_class where relname = 'profiles';
```
![RLS aktiv auf profiles](evidence/block1/01-rls-aktiv-profiles.png)

*2. RLS ist auf ALLEN public-Tabellen aktiv (`profiles` + `subscriptions`)*
```sql
select c.relname as tabelle, c.relrowsecurity as rls_aktiv
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
```
![RLS auf allen Tabellen](evidence/block1/02-rls-alle-tabellen.png)

*3. Die Policy ist restriktiv (`qual = (auth.uid() = id)`, nur SELECT)*
```sql
select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname='public' and tablename='profiles';
```
![Policy-Detail](evidence/block1/03-policy-detail.png)

**Ergebnis:**
| Prüfpunkt | Ergebnis |
|---|---|
| RLS auf `profiles` | ✅ aktiv |
| RLS auf `subscriptions` | ✅ aktiv |
| Lese-Policy restriktiv (`auth.uid() = id`) | ✅ ja |
| Schreibzugriff durch Clients | ✅ standardmäßig verboten |
| Fremde Profile lesbar/änderbar | ✅ nein |

**Fazit:** Zugriffskontrolle serverseitig korrekt umgesetzt. Ein Benutzer kann ausschließlich die eigene Profilzeile lesen; Schreiben durch Clients ist unterbunden. **Block 1 erfüllt** – Zustand durch Audit belegt.

---

### Block 2 — Verfügbarkeit: DoS-/Flooding-Schutz ✅ <a id="block-2"></a>
**M183 Kap. 6 (WAF/Monitoring) · OWASP A06 · Status: umgesetzt & belegt**

**Ziel:** Die Seite muss für echte Nutzer erreichbar bleiben, auch wenn jemand sie mit Anfragen flutet (DoS/Flooding). Kein einzelner Endpunkt darf den Betrieb lahmlegen.

**Architektur-Analyse (Floodflächen):** Die App ist ein statisches SPA + JSON, ausgeliefert über das Vercel-CDN; die dynamische Fläche ist Supabase (Login/Profiles). Volumetrische Angriffe treffen daher v. a. das CDN-Edge. Der Schutz wird als **Defense in Depth über drei Ebenen** umgesetzt.

#### Ebene 1 — Edge/CDN (Vercel)
Gehashte Build-Assets werden mit Langzeit-Caching ausgeliefert, sodass wiederholte/flutende Anfragen vom CDN-Cache beantwortet werden und nicht den Ursprung belasten:
```jsonc
// vercel.json
{
  "source": "/assets/(.*)",
  "headers": [
    { "key": "Cache-Control", "value": "public, max-age=31536000, s-maxage=31536000, immutable" }
  ]
}
```
Die Daten-Endpunkte (`/data/*`, `/results*`) sind bereits gecacht (`s-maxage`, `stale-while-revalidate`). Ergänzend greift Vercels plattformseitige **DDoS-Mitigation** automatisch.

#### Ebene 2 — Authentifizierung (Supabase)
Supabase erzwingt serverseitige **Rate-Limits** auf Auth-Endpunkten (Login/Registrierung/E-Mail). Die App fängt ein `429 Too Many Requests` sauber ab:
```ts
// LoginPage.tsx (Registrierung)
if ((error as { status?: number }).status === 429) {
  setAuthError("Zu viele Versuche. Bitte kurz warten und erneut versuchen.");
  return;
}
```

#### Ebene 3 — Anwendung/Client (Code)
**a) 429/503-aware Backoff** im zentralen API-Client – respektiert `Retry-After` statt sofort erneut zu feuern (und nutzt das bestehende In-Flight-Dedupe gegen Doppelanfragen):
```ts
// apiClient.ts
if (response.status === 429 || response.status === 503) {
  const retryAfter = response.headers.get("retry-after");
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) {
    apiError.retryAfterMs = Math.min(seconds * 1000, 5000);
  }
}
// ...im Retry: backoffMs = apiError.retryAfterMs ?? retryDelayMs * (attempt + 1)
```
**b) Client-seitiger Login-Cooldown** (Defense in Depth, ergänzt die Supabase-Limits): nach 5 Fehlversuchen 30 s Sperre:
```ts
// LoginPage.tsx
const now = Date.now();
if (cooldownUntil > now) {
  setAuthError(`Zu viele Login-Versuche. Bitte ${Math.ceil((cooldownUntil - now) / 1000)}s warten.`);
  return;
}
// ...im Fehlerfall: nach 5 Versuchen -> setCooldownUntil(Date.now() + 30000)
```

#### Verifikation

**V1 — CDN-Cache greift (Befehl + Ausgabe)**
Antwort-Header des Daten-Endpunkts prüfen; der **zweite** Abruf liefert `HIT`, weil die Antwort dann aus dem Edge-Cache kommt:
```bash
curl -I https://blackmarketreader.com/data/bm-crafter-eu.json
```
Ausgabe (2. Abruf):
```http
HTTP/2 200
content-type: application/json; charset=utf-8
cache-control: public, max-age=300, s-maxage=300, stale-while-revalidate=86400
x-vercel-cache: HIT
age: 137
x-content-type-options: nosniff
x-frame-options: DENY
referrer-policy: strict-origin-when-cross-origin
content-security-policy: frame-ancestors 'none';
server: Vercel
x-vercel-id: fra1::iad1::7m8qd-1749726003123-9f2c1ab4e5d6
```
**Bedeutung:** `s-maxage` + `stale-while-revalidate` weisen das CDN an, die Antwort am Edge zu cachen; `x-vercel-cache: HIT` belegt, dass wiederholte (auch flutende) Anfragen aus dem Cache statt vom Ursprung beantwortet werden → die Last wird am Edge abgefangen.

**V2 — Last-Test (Befehl + Ausgabe)**
50 schnelle Anfragen, Status-Codes zählen:
```bash
for i in $(seq 1 50); do
  curl -s -o /dev/null -w "%{http_code}\n" https://blackmarketreader.com/
done | sort | uniq -c
```
Ausgabe:
```text
     50 200
```
**Bedeutung:** Alle 50 Anfragen werden mit `200` bedient — die CDN-Auslieferung bleibt unter Last erreichbar, kein Origin-Zusammenbruch.

**V3 — Login-Cooldown (Code-Beleg)**
Greift rein clientseitig nach 5 Fehlversuchen (ergänzt die serverseitigen Supabase-Limits):
```ts
const now = Date.now();
if (cooldownUntil > now) {
  setAuthError(`Zu viele Login-Versuche. Bitte ${Math.ceil((cooldownUntil - now) / 1000)}s warten.`);
  return;
}
```
**UI-Nachweis:** Nach dem 5. Fehlversuch erscheint „Zu viele Login-Versuche. Bitte 30s warten." und der Login bleibt 30 s wirkungslos:

![Login-Cooldown nach 5 Fehlversuchen](evidence/block2/04-login-cooldown.png)

**V4 — Tests/Build:** TypeScript-Typecheck grün, **alle 61 Unit-Tests bestanden** (keine Regression durch die Code-Änderungen).

#### Nachweise (Plattform-Schutz)

*Vercel-Firewall aktiv – im Zeitraum u. a. 60 Anfragen „challenged":*
![Vercel Firewall aktiv](evidence/block2/01-vercel-firewall-active.png)

*Aktive Vercel-Regel „DDoS Mitigation":*
![Vercel DDoS Mitigation](evidence/block2/02-vercel-ddos-mitigation.png)

*Supabase Auth-Rate-Limits (Token-Refresh 150/5min, Verification 30/5min, Anonymous 30/h, E-Mail 2/h):*
![Supabase Rate Limits](evidence/block2/03-supabase-rate-limits.png)

**Fazit:** Verfügbarkeit über drei Ebenen abgesichert – CDN-Caching/DDoS-Mitigation (Vercel), Auth-Rate-Limits (Supabase) und app-seitiger 429-Backoff + Login-Cooldown. **Block 2 erfüllt.**

---

### Block 3–10 — ⏳ ausstehend
Werden nach gleichem Schema dokumentiert (Analyse → Maßnahme → Nachweis), sobald umgesetzt.
