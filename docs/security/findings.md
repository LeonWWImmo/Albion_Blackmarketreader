# 🧾 Härtungs-Tracker

Status-Board der geplanten Härtungsmaßnahmen. Wird während der Umsetzung gepflegt (ein Commit pro Statuswechsel).

> ⚠️ **Verantwortungsvolle Offenlegung (Responsible Disclosure):** Dieses Repo ist öffentlich und die App läuft produktiv. Daher werden hier **keine konkreten Exploit-Anleitungen, exakten Pfade oder Proof-of-Concepts zu noch offenen Punkten** veröffentlicht. Detaillierte Vorher-/Nachher-Nachweise (Screenshots, Kommandos) werden zu einem Punkt **erst ergänzt, nachdem dieser behoben ist**. Bis dahin bleiben die Beschreibungen bewusst auf Maßnahmen-Ebene.

**Status-Legende:** ⚪ geplant · 🟠 in Arbeit · 🟢 umgesetzt & verifiziert

| ID | Härtungsmaßnahme | Block | Priorität | Status | Risiko nachher | Nachweis |
|---|---|---|---|---|---|---|
| H-01 | Zugriffskontrolle serverseitig durchsetzen (Auth + RLS) | 1 | 🔴 hoch | ⚪ geplant | – | – |
| H-02 | Verfügbarkeit härten (Rate-Limiting / Überlastschutz) | 2 | 🔴 hoch | ⚪ geplant | – | – |
| H-03 | Logging & Audit-Trail einführen | 3 | 🔴 hoch | ⚪ geplant | – | – |
| H-04 | Schlüssel-/Secret-Handling absichern & dokumentieren | 4 | 🟡 mittel | ⚪ geplant | – | – |
| H-05 | Eingabevalidierung der Endpunkte | 5 | 🟡 mittel | ⚪ geplant | – | – |
| H-06 | Security-Header & Repo-Hygiene | 6 | 🟡 mittel | ⚪ geplant | – | – |
| H-07 | Lieferkette härten (Pinning, Updates, Audit) | 7 | 🟡 mittel | ⚪ geplant | – | – |
| H-08 | Automatisierte Sicherheits-Scans (SAST/DAST) | 8 | 🔧 Werkzeug | ⚪ geplant | – | – |
| H-09 | Backup- & Wiederherstellungskonzept | 9 | 🟡 mittel | ⚪ geplant | – | – |
| H-10 | Risikobewertung & Abschlussbericht | 10 | 📄 Prozess | ⚪ geplant | – | – |

---

## Detailprotokoll

> Pro Maßnahme werden nach der Umsetzung dokumentiert: Ausgangslage (allgemein), umgesetzter Fix und Verifikation (Re-Test). Konkrete Nachweise erscheinen hier erst nach Behebung des jeweiligen Punkts.

### H-01 — Zugriffskontrolle (Sessionhandling, Auth & Autorisierung)
- **Ausgangslage (allgemein):** Zugriffskontrolle wird aktuell überwiegend clientseitig durchgesetzt; sie soll serverseitig und auf Datenbankebene (RLS) verankert werden.
- **Geplanter Fix:** Authentifizierter Daten-Endpunkt + Row Level Security je Tabelle.
- **Verifikation:** _wird nach Umsetzung ergänzt._

_(H-02 … H-10 folgen nach gleichem Schema – jeweils nach Umsetzung.)_
