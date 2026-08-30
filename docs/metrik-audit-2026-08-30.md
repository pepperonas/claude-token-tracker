# Metrik-Audit — wie der Tracker rechnet, und wo er falsch lag

Stand 2026-08-30. Geprüft wurden alle Zahlen, die im Projekt-Detail-Dialog stehen,
gegen die Rohdaten (`~/.claude/projects/**/*.jsonl`, 1188 Dateien / 443.037 Zeilen /
179.509 Assistant-Nachrichten) und gegen die offizielle Anthropic-Preisdoku.

## Rechenweg (Ist-Zustand)

| Kennzahl | Quelle | Formel |
|---|---|---|
| Nachrichten | JSONL-Zeilen `type:"assistant"` mit `usage` | dedupliziert über `message.id`, letzter Eintrag gewinnt (Streaming schreibt dieselbe ID mehrfach) |
| Tokens | `usage.*` | `input + output + cache_read + cache_creation` |
| Kosten | `lib/pricing.js` | je Komponente `Tokens/1e6 × Preis`, Preise live von LiteLLM, sonst hartcodierter Fallback |
| Sessions | `sessionId` | Anzahl distinkter IDs |
| Netto-Zeilen | `tool_use`-Blöcke | nur `Edit` (old/new_string) und `Write` (content) |
| Aktive Zeit | Zeitstempel-Folge | Summe der Abstände, je Abstand **auf 5 Min gedeckelt** |

Belege: 0 Nachrichten ohne `message.id`, 0 IDs über Projekt- oder Session-Grenzen
hinweg — die Zuordnung ist stabil. 14.995 Sub-Agent-Nachrichten liegen alle unter
`/subagents/`, das Flag stimmt.

## Befunde

### 1 — 1-Stunden-Cache wird zum 5-Minuten-Preis abgerechnet (Kosten zu niedrig)

`usage.cache_creation.ephemeral_1h_input_tokens` wird nicht gelesen. Der Tracker
rechnet jeden Cache-Write mit 1,25× Input-Preis. Laut Anthropic-Preisdoku kostet
ein 1-Stunden-Write aber **2× Input**.

**90,5 % aller Cache-Write-Tokens im Datenbestand sind 1h-Writes** (1.562.642.276
von 1.726.262.729). Nachgerechnet über das vorhandene JSONL-Fenster:

| Modell | heute | korrekt | Delta | 1h-Anteil |
|---|---|---|---|---|
| Opus 5 | $11.943,74 | $12.804,44 | +$860,70 | 98,1 % |
| Fable 5 | $10.716,19 | $11.768,34 | +$1.052,15 | 98,1 % |
| Opus 4.8 | $7.251,11 | $7.881,31 | +$630,20 | 92,7 % |
| Opus 4.6 | $1.449,14 | $1.612,60 | +$163,46 | 95,1 % |
| Opus 4.7 | $835,16 | $877,92 | +$42,76 | 24,6 % |
| **Summe** | **$32.246,90** | **$34.996,18** | **+$2.749,27 (+8,5 %)** | |

Schwere: **hoch**. Die Hauptzahl der App ist systematisch um ~8,5 % zu niedrig.

### 2 — `claude-opus-5` fehlt im Offline-Fallback

Die hartcodierte `PRICING`-Tabelle endet bei Opus 4.8. Opus 5 ist mit 38.911
Nachrichten / 19,5 Mrd. Tokens das meistgenutzte Modell und fällt ohne LiteLLM
auf `DEFAULT_PRICING` (Sonnet, $3/$15) zurück — also grob zu niedrig.
Live derzeit unauffällig, weil LiteLLM erreichbar ist; ein Offline-Boot oder ein
Ausfall der Quelle verfälscht sofort die Kosten des größten Postens.

Schwere: **hoch (latent)**. Genau die Regel, die für Opus 4.8 schon dokumentiert
ist, wurde bei Opus 5 nicht nachgezogen.

### 3 — „Gesamtzeit" im Projekt-Dialog ist keine Zeit

Angezeigt wird die **Summe der Session-Spannen** (letzte minus erste Nachricht je
Session, aufsummiert). Das zählt Leerlauf als Arbeit und parallele Sessions doppelt.

Für `claude/inspector/rust`:

- angezeigt: **2344,2 h**
- tatsächlich vergangene Wanduhrzeit zwischen erster und letzter Nachricht: 2062,4 h
- ehrliche aktive Zeit (projektweite Zeitachse, 5-Min-Deckel): **196,0 h**

Die Zahl ist also nicht nur zu hoch, sie ist **größer als der gesamte Zeitraum**
(114 %). Im 10-Tage-Filter (max. 240 h) zeigt der Dialog 658,9 h. Faktor ~12
gegenüber der belastbaren Zahl.

Schwere: **hoch**. Eine physikalisch unmögliche Zahl an prominenter Stelle.

### 4 — Aktive Zeit im Projekt-Dialog wird je Session summiert

`totalActiveMin` addiert `activeMin` pro Session. Parallel laufende Sessions
(Haupt-Session + Sub-Agenten + zweites Terminal) zählen dieselbe Minute mehrfach.
Gemessen 217,5 h statt 196,0 h auf gemeinsamer Zeitachse = **+11 %**.
Für die Übersicht wurde genau das schon korrigiert, im Projekt-Dialog nicht.

Schwere: **mittel**.

### 5 — Der Projekt-Dialog ignoriert den Cache-Umschalter

Die Projekte-Tabelle rechnet über `getDisplayTokens()` und respektiert
„Cache-Tokens einbeziehen". Der Dialog zeigt fest `totalTokens` inklusive Cache.
Ergebnis: Tabelle 26,7 Mio, Dialog 13,0 Mrd — für dasselbe Projekt, nebeneinander.

Schwere: **mittel**.

### 6 — Sonnet-5-Preisepoche ist überholt

Die Epoche kappt die Einführungspreise ($2/$10) zum 2026-08-31 und fällt danach
auf $3/$15 zurück. Anthropic hat die Erhöhung **abgesagt**, $2/$10 ist der
Standardpreis. Live folgenlos (LiteLLM liefert $2/$10), aber der Fallback
und die Epoche behaupten etwas Falsches.

Schwere: **niedrig**.

### 7 — Zwei Session-Definitionen nebeneinander

Die Tabelle zählt Sessions mit Nachrichten **im Zeitraum**, der Dialog zählt
Sessions, die den Zeitraum **überlappen**. Bei Zeitraumfiltern divergieren die
Zahlen.

Schwere: **niedrig**.

### 8 — Nicht erfasst (bewusst, aber undokumentiert)

Aktuell im Datenbestand alle bei null, deshalb kein Fehlbetrag — aber die App
sagt nirgends, dass sie das nicht kann:

- Websuche ($10 / 1000 Suchen) — `server_tool_use.web_search_requests`: 0
- Fast-Mode (Opus 5/4.8 zu $10/$50 statt $5/$25) — `usage.speed`: durchweg `standard`
- Datenresidenz `inference_geo: "us"` (1,1×) — durchweg `not_available`
- Batch-API (−50 %) — `service_tier`: durchweg `standard`
- Zeilen aus `Bash`-Edits (sed/heredoc) und `NotebookEdit` fließen nicht in die
  Netto-Zeilen ein; gezählt werden nur `Edit` und `Write`.

## Plan

**A — Preise korrigieren** (Befund 1, 2, 6)
1. Parser liest `cache_creation.ephemeral_5m/1h_input_tokens`.
2. Zwei additive Spalten `cache_create_5m` / `cache_create_1h`; Summe ≠ 0 heißt
   „Aufteilung bekannt", beide 0 bei vorhandenem Cache-Write heißt „Altbestand".
3. `calculateCost` rechnet den 1h-Anteil mit `input × 2`, den Rest wie bisher.
   Altbestand bleibt bei 1,25× — kein Rückwirken auf Zahlen, die niemand mehr
   belegen kann; die App weist den Anteil aus.
4. `claude-opus-5` in die Fallback-Tabelle; Sonnet-5-Epoche entfernen, Fallback
   auf $2/$10. Epoche-Mechanik bleibt (Test-Hook statt echtem Modell).
5. Sync-Agent zieht mit — sonst verliert die gehostete Instanz die Aufteilung.

**B — Zeit und Zählweise** (Befund 3, 4, 5, 7)
6. `getProjectDetail` sammelt Zeitstempel im selben Scan und rechnet die aktive
   Zeit auf **einer** Zeitachse (`computeActiveMinutes`) statt je Session.
7. KPI „Gesamtzeit" → „Aktive Zeit"; die Session-Spannen-Summe entfällt als KPI,
   die Zeitraum-Spanne kommt als Kontext dazu.
8. Sessions im Dialog = distinkte Session-IDs der Nachrichten im Zeitraum.
9. Token-KPI über `getDisplayTokens()`.

**C — Erklärungen in der App** (Befund 8 und alles darüber)
10. Info-Symbol an jeder KPI mit Kurzformel; ein Dialog „Wie wird gerechnet?"
    mit Rechenweg, Preisquelle, Deckelung und der Liste des Nichterfassten.

**D — Projekt-Report**
11. `GET /api/project-report` liefert einen eigenständigen HTML-Report je Projekt
    (Kosten, Tokens, Modelle, Verlauf, Sessions, Methodik) — druckoptimiert,
    ohne CDN, Diagramme als Inline-SVG. PDF über den Druckdialog des Browsers.
