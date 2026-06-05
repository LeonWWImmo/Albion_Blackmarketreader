# Block 1 — Sessionhandling, Authentifizierung & Autorisierung ✅

**M183 Kap. 2 · OWASP A01/A07 · Status: auditiert & verifiziert**

## Ziel
Sicherstellen, dass jeder Benutzer **nur auf die eigenen Daten** zugreifen kann und die Zugriffskontrolle **serverseitig in der Datenbank** (Row Level Security, RLS) verankert ist – nicht nur im Browser.

## Vorgehen
Die App liest/schreibt die Tabelle `profiles` aus dem Browser mit dem öffentlichen Anon-Key. Der wirksame Schutz muss daher per RLS in Supabase/Postgres erfolgen. Es wurde geprüft, ob RLS aktiv ist, ob die Policy wirklich restriktiv ist und ob **alle** public-Tabellen abgedeckt sind.

## Soll-Konfiguration (so wird der Schutz hergestellt)
Die folgende Konfiguration stellt die geprüfte Zugriffskontrolle sicher (in Supabase → SQL Editor):

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

## Verifikation (Nachweise)

**1. RLS ist auf `profiles` aktiv** (`rls_aktiv = true`)
```sql
select relname as tabelle, relrowsecurity as rls_aktiv
from pg_class where relname = 'profiles';
```
![RLS aktiv auf profiles](evidence/block1/01-rls-aktiv-profiles.png)

**2. RLS ist auf ALLEN public-Tabellen aktiv** (`profiles` + `subscriptions`)
```sql
select c.relname as tabelle, c.relrowsecurity as rls_aktiv
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
```
![RLS auf allen Tabellen](evidence/block1/02-rls-alle-tabellen.png)

**3. Die Policy ist restriktiv** (`qual = (auth.uid() = id)`, nur SELECT)
```sql
select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname='public' and tablename='profiles';
```
![Policy-Detail](evidence/block1/03-policy-detail.png)

## Ergebnis
| Prüfpunkt | Ergebnis |
|---|---|
| RLS auf `profiles` | ✅ aktiv |
| RLS auf `subscriptions` | ✅ aktiv |
| Lese-Policy restriktiv (`auth.uid() = id`) | ✅ ja |
| Schreibzugriff durch Clients | ✅ standardmäßig verboten (keine Write-Policy) |
| Fremde Profile lesbar/änderbar | ✅ nein |

**Fazit:** Die Zugriffskontrolle ist serverseitig korrekt umgesetzt. Ein Benutzer kann ausschließlich die eigene Profilzeile lesen; Schreiben durch Clients ist unterbunden. **Block 1 ist erfüllt** – kein Handlungsbedarf, Zustand durch Audit belegt.
