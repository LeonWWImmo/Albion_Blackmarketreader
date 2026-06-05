# 📊 Risikomatrix

**Methode (M183 Kap. 8):** Jede Härtungsmaßnahme adressiert ein Risiko, das nach **Eintrittswahrscheinlichkeit (W)** und **Schadenspotenzial (S)** bewertet wird. Das Risiko ergibt sich aus `W × S`. Daraus leitet sich Dringlichkeit und Umsetzungsreihenfolge ab.

> ⚠️ **Responsible Disclosure:** Beschreibungen bleiben bewusst auf Maßnahmen-/Kategorie-Ebene. Keine konkreten Exploit-Details zu noch offenen Punkten (öffentliches Repo, produktive App). Siehe [findings.md](findings.md).

## Bewertungsskala

| Stufe | Eintrittswahrscheinlichkeit (W) | Schadenspotenzial (S) |
|---|---|---|
| 1 | Gering – aufwendig/unwahrscheinlich | Gering – kaum Auswirkung |
| 2 | Mittel – mit etwas Aufwand machbar | Mittel – begrenzter Schaden |
| 3 | Hoch – sehr wahrscheinlich | Hoch – schwerer Schaden (Daten, Verfügbarkeit, Ruf) |

**Risiko = W × S:** 🟢 Grün 1–2 (Restrisiko akzeptierbar) · 🟡 Gelb 3–4 (beobachten/beheben) · 🔴 Rot 6–9 (zwingend beheben).

---

## Risikomatrix (Heatmap)

```
 S=3  │  🟡 3      🔴 6      🔴 9
      │  (H-04)   (H-02,    (H-01)
      │            H-03)
 S=2  │  🟢 2      🟡 4      🟡 3
      │           (H-05,H-06,
      │            H-07,H-09)
 S=1  │  🟢 1      🟢 2      🟡 3
      │
      └────────────────────────────
         W=1       W=2       W=3
```

---

## Bewertung pro Maßnahme

| ID | Härtungsmaßnahme (adressiertes Risiko) | Block | W | S | Risiko | Stufe |
|---|---|---|---|---|---|---|
| **H-01** | Zugriffskontrolle serverseitig + RLS verankern (statt nur clientseitig) | 1 | 3 | 3 | **9** | 🔴 Rot |
| **H-02** | Verfügbarkeit gegen Überlastung/Flooding schützen | 2 | 2 | 3 | **6** | 🔴 Rot |
| **H-03** | Sicherheitsereignisse protokollieren (Logging/Audit-Trail) | 3 | 3 | 2 | **6** | 🔴 Rot |
| **H-04** | Schlüssel/Secret-Handling absichern (Trennung public/secret) | 4 | 1 | 3 | **3** | 🟡 Gelb |
| **H-05** | Eingabevalidierung der Endpunkte | 5 | 2 | 2 | **4** | 🟡 Gelb |
| **H-06** | Security-Header (CSP/HSTS) + Repo-Hygiene | 6 | 2 | 2 | **4** | 🟡 Gelb |
| **H-07** | Lieferkette härten (Pinning, Updates, Audit) | 7 | 2 | 2 | **4** | 🟡 Gelb |
| **H-08** | Automatisierte Sicherheits-Scans (SAST/DAST) | 8 | — | — | Werkzeug | 🔧 |
| **H-09** | Backup- & Wiederherstellungskonzept | 9 | 2 | 2 | **4** | 🟡 Gelb |
| **H-10** | Risiken systematisch bewerten & dokumentieren | 10 | — | — | Prozess | 📄 |

> Hinweis zu S-Werten: H-04 ist aktuell unwahrscheinlich (HTTPS wird durch die Plattform erzwungen, der Anon-Key ist bewusst öffentlich), hätte aber bei Eintritt hohen Schaden. H-09 erhält „mittel" beim Schaden, weil die Marktdaten aus der öffentlichen Albion-API + Git rekonstruierbar sind.

---

## Ableitung der Umsetzungsreihenfolge

Sortierung primär nach Risiko (🔴 → 🟡), korrigiert um technische Abhängigkeiten:

1. **H-01 (Block 1)** – höchstes Risiko (9) **und** Fundament: schafft die Basis (Auth-Endpunkt + RLS), auf der H-05, H-03 u. a. aufsetzen.
2. **H-02 (Block 2)** – Rot (6), schützt die Verfügbarkeit.
3. **H-03 (Block 3)** – Rot (6); **nach** 1 & 2, damit Auth- und Überlast-Ereignisse direkt protokolliert werden.
4. **H-05 (Block 5)** – Gelb (4); **direkt nach** Block 1, da die neuen Endpunkte sofort validiert werden müssen.
5. **H-06 (Block 6)** – Gelb (4); Repo-Hygiene + Basis für HTTPS/HSTS/CSP.
6. **H-04 (Block 4)** – Gelb (3); nutzt das in Block 6 gesetzte HSTS.
7. **H-07 (Block 7)** – Gelb (4); unabhängig, CI-/Dependency-Härtung.
8. **H-09 (Block 9)** – Gelb (4); unabhängig, Backup-Konzept.
9. **H-08 (Block 8)** – Werkzeug; **nach** den Fixes, um Wirksamkeit zu prüfen und Restpunkte zu finden.
10. **H-10 (Block 10)** – Abschluss; Re-Test + Risikomatrix „nachher" + Bericht.

> **Restrisiko nach Umsetzung:** Ziel ist, alle 🔴/🟡-Punkte in den 🟢-Bereich zu bringen. Die Spalte „Risiko nachher" wird in [findings.md](findings.md) nachgeführt.
