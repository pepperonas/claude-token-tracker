<p align="center">
  <a href="README_EN.md"><img src="https://img.shields.io/badge/%F0%9F%87%AC%F0%9F%87%A7_English-Switch_Language-blue?style=for-the-badge" alt="Switch to English"></a>
</p>

<p align="center">
  <a href="https://github.com/pepperonas/claude-token-tracker/actions/workflows/ci.yml"><img src="https://github.com/pepperonas/claude-token-tracker/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Lizenz-MIT-blue.svg" alt="Lizenz: MIT"></a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white" alt="Node.js >= 18">
  <img src="https://img.shields.io/badge/Version-0.0.6-orange.svg" alt="Version">
  <img src="https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Chart.js-4.x-FF6384?logo=chartdotjs&logoColor=white" alt="Chart.js">
  <img src="https://img.shields.io/badge/Tests-148%20bestanden-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/Plattform-macOS%20%7C%20Linux-lightgrey" alt="Plattform">
  <a href="https://github.com/pepperonas/claude-token-tracker/pulls"><img src="https://img.shields.io/badge/PRs-willkommen-brightgreen.svg" alt="PRs willkommen"></a>
</p>

---

<p align="center">
  <img src="public/og-image.png" alt="Claude Token Tracker" width="720">
</p>

# Claude Token Tracker

Dashboard zur Analyse deiner Claude Code Token-Nutzung. Liest die JSONL-Sitzungsdateien von Claude Code, berechnet API-äquivalente Kosten, trackt Codezeilen und zeigt alles in Echtzeit an. Unterstützt **Single-User** (lokal) und **Multi-User** (gehostet mit GitHub OAuth + Sync Agent).

## Features

### Dashboard & Visualisierung

- **17 interaktive Charts** über 9 Tabs (Übersicht, Sitzungen, Projekte, Tools, Modelle, Insights, Produktivität, Achievements, Info)
- **Aktive Sitzungen** — Live-Anzeige aktuell laufender Claude-Code-Sessions mit Projekt, Modell, Dauer und Kosten
- **Token-Aufschlüsselung** — Detail-KPI-Cards für Input, Output, Cache Read und Cache Create Tokens mit Einzelkosten
- **Lines of Code** — Write (grün), Edit (gelb), Delete (rot) mit Netto-Änderungsberechnung und adaptivem Stunden-/Tages-Chart
- **Globaler Zeitraumfilter** — Heute / 7 Tage / 30 Tage / Gesamt mit Vor-/Zurück-Navigationspfeilen, wirkt auf alle Tabs
- **Sortierbare Tabellen** — Alle Datentabellen durch Klick auf Spaltenüberschriften sortierbar
- **CSS-only Tooltips** mit Erklärungen auf KPI-Labels und Chart-Titeln
- **Chart-Legenden-Persistenz** — Legenden-Auswahl und Zeitraumfilter werden im localStorage gespeichert
- **Mobil-optimiert** — optimiert für Smartphones (ab 393px) mit Touch-Targets, adaptiven Charts und kompaktem Layout
- **Zweisprachige UI** (Deutsch / Englisch) mit Tab-, Zeitraum- und Einstellungspersistenz

### Datenverarbeitung

- **Inkrementelles Parsing** — nur neue Daten werden verarbeitet (Byte-Offset-Tracking)
- **SQLite-Datenbank** mit WAL-Modus für persistente Speicherung und schnelle Abfragen
- **In-Memory Aggregation** — vorberechnete Maps für schnelle API-Antworten
- **Echtzeit-Updates** via Server-Sent Events (animationsfrei bei Live-Updates)
- **API-äquivalente Kostenschätzung** für alle Claude-Modelle (Opus 4.5/4.6, Sonnet 4.5, Haiku 4.5, Sonnet 3.7)
- **Automatisches Backup** (konfigurierbar, z.B. in Google Drive)

### Multi-User & Deployment

- **Multi-User-Modus** — GitHub OAuth, persönliche API-Keys, Datenisolation pro User
- **Sync Agent** — Ein-Klick-Installation via curl, überwacht lokale Sitzungsdateien und überträgt an den Server
- **Autostart** — Install-Script richtet automatisch launchd (macOS) oder systemd (Linux) ein
- **SEO-optimiert** mit Open Graph, Twitter Cards und strukturierten Meta-Tags
- **CI/CD Pipeline** mit GitHub Actions (Lint + Tests)
- **Demo-Modus** — nicht eingeloggte Besucher sehen ein Beispiel-Dashboard; mit GitHub anmelden, um eigene Daten zu sehen
- **500 Achievements** — Gamification-System über 12 Kategorien (Tokens, Sessions, Nachrichten, Kosten, Lines, Modelle, Tools, Zeit, Projekte, Streaks, Cache, Spezial) mit 5 Stufen (Bronze bis Diamant), stufenbasierten Punkten (10–250), Zeitverlauf-Chart und täglichen Freischaltungs-Statistiken
- **Produktivitäts-Tab** — Tokens/Min, Zeilen/Stunde, Kosten/Zeile, Cache-Ersparnis, Code-Anteil mit Trend-Indikatoren
- **Perioden-Vergleich** — immer sichtbare Pill-Leiste (Aus / Vorperiode / Letzte 7T / 30T / 90T / Eigener) vergleicht zwei Zeiträume sofort nebeneinander mit 8 Metriken (Tokens/Min, Zeilen/Stunde, Kosten/Zeile, Tokens/Zeile, Zeilen/Nachricht, Tools/Nachricht, I/O-Verhältnis, Coding-Stunden), Delta-Prozenten und farbcodierten Verbesserungs-/Verschlechterungsanzeigen — ein Klick genügt, kein separater Toggle nötig
- **HTML-Export** — interaktiver Snapshot mit Chart.js, 8 Tabs (Übersicht, Charts, Sitzungen, Projekte, Modelle, Tools, Produktivität, Achievements), 12+ Charts und sortierbaren Tabellen
- **Globaler Vergleich** — eigene Statistiken gegen den Durchschnitt aller Nutzer vergleichen (Multi-User-Modus)
- **148 automatisierte Tests** (Unit + Integration + Multi-User API + Achievements)

## Architektur

```
Single-User:
  ~/.claude/projects/**/*.jsonl
      → Parser (inkrementell, Byte-Offset)
      → SQLite (WAL, INSERT OR REPLACE)
      → Aggregator (In-Memory, vorberechnete Maps)
      → HTTP-Server (20+ JSON-Endpoints + SSE)
      → Frontend (Chart.js, i18n DE/EN, sortierbare Tabellen)

Multi-User:
  Sync Agent (Client) → POST /api/sync (API-Key Auth)
      → SQLite (pro User, user_id)
      → AggregatorCache (lazy, 30min Eviction)
      → HTTP-Server (GitHub OAuth + Session Cookies)
      → Frontend (Login-Overlay, Sync-Setup, Active Sessions)
```

### Modulübersicht

| Modul | Beschreibung |
|-------|-------------|
| `lib/parser.js` | Liest JSONL-Dateien, extrahiert Token-Zähler, Tools, Modell und Lines-of-Code aus `type: 'assistant'` Nachrichten |
| `lib/aggregator.js` | In-Memory Analytics-Engine mit `_daily`, `_sessions`, `_projects`, `_models`, `_tools`, `_hourly` Maps |
| `lib/db.js` | SQLite-Schicht mit `messages`, `message_tools`, `parse_state`, `metadata`, `users`, `user_sessions`, `achievements` Tabellen |
| `lib/pricing.js` | Modellpreise (Input/Output/CacheRead/CacheCreate pro 1M Tokens) |
| `lib/watcher.js` | Chokidar File-Watcher mit debounced inkrementellem Parsing |
| `lib/auth.js` | GitHub OAuth Flow, Session-Management, Cookie-basierte Authentifizierung |
| `lib/backup.js` | SQLite `VACUUM INTO` für atomare Backups, Auto-Pruning auf 10 Kopien |
| `lib/achievements.js` | 500 Achievement-Definitionen mit Check-Logik, Stats-Builder, stufenbasierten Punkten und Unlock-Tracking |
| `lib/export-html.js` | Interaktiver HTML-Snapshot-Generator mit Chart.js, 8 Tabs, 12+ Charts und sortierbaren Tabellen |
| `server.js` | Vanilla `http.createServer` mit 25+ API-Routen, SSE und statischen Dateien |
| `sync-agent/` | Standalone CLI-Tool für Client-seitiges Watching und Uploading |

## Installation

```bash
git clone https://github.com/pepperonas/claude-token-tracker.git
cd claude-token-tracker
npm install
npm start
```

Dashboard öffnen: [http://localhost:5010](http://localhost:5010)

## Konfiguration

Erstelle eine `.env` Datei (optional für Single-User, erforderlich für Multi-User):

### Allgemein

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `PORT` | `5010` | Server-Port |
| `CLAUDE_DIR` | `~/.claude` | Pfad zum Claude-Verzeichnis |
| `DB_PATH` | `data/tracker.db` | Pfad zur SQLite-Datenbank |
| `BACKUP_PATH` | *(leer)* | Zielverzeichnis für automatische Backups |
| `BACKUP_INTERVAL_HOURS` | `6` | Backup-Intervall in Stunden |

### Multi-User-Modus

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `MULTI_USER` | `false` | Multi-User-Modus aktivieren |
| `BASE_URL` | `http://localhost:PORT` | Öffentliche URL (für OAuth-Redirect) |
| `GITHUB_CLIENT_ID` | — | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | — | GitHub OAuth App Client Secret |
| `SESSION_SECRET` | — | Geheimer Schlüssel für Sessions |

## Lines of Code

Der Tracker erfasst automatisch Codezeilen-Änderungen aus den JSONL-Sitzungsdateien:

- **Write** (grün) — Zeilen in `content` bei Write-Tool-Aufrufen (neue Dateien / Überschreiben)
- **Edit** (gelb) — Zeilen in `new_string` bei Edit-Tool-Aufrufen (Ersetzungstext)
- **Delete** (rot) — Zeilen in `old_string` bei Edit-Tool-Aufrufen (entfernter Text)

**Netto-Änderung** = write + edit - delete

Die Daten werden angezeigt als:
- **KPI-Cards** in der Übersicht (Write, Edit, Delete, Net Change)
- **Spalte "+/-"** in den Sessions- und Projekte-Tabellen
- **Tägliches Balkendiagramm** im Insights-Tab (grün = Write, gelb = Edit, rot = Delete)

> Nach einem **Cache Rebuild** werden alle historischen Dateien neu geparst und die Lines-Daten befüllt.

## Multi-User-Modus

Der Multi-User-Modus ermöglicht es mehreren Personen, ihre Token-Daten auf einem zentralen Server zu tracken.

1. **GitHub OAuth App erstellen** unter [github.com/settings/developers](https://github.com/settings/developers)
   - Authorization callback URL: `https://deine-domain.de/auth/github/callback`
2. **`.env` konfigurieren** mit den OAuth-Credentials und `MULTI_USER=true`
3. **Server starten** — Login via GitHub erscheint automatisch

Jeder User bekommt einen persönlichen **API-Key** für den Sync Agent, einsehbar im Info-Tab.

### Unterschiede zum Single-User-Modus

| Aspekt | Single-User | Multi-User |
|--------|-------------|------------|
| Datenquelle | Lokale JSONL-Dateien (Chokidar-Watcher) | Sync Agent Uploads via API |
| Authentifizierung | Keine | GitHub OAuth + Session Cookies |
| Datenisolation | Keine (alle Daten gehören einem User) | Per-User via `user_id` Spalte |
| Aggregation | Ein globaler Aggregator | AggregatorCache (lazy, 30min Eviction) |
| File Watcher | Aktiv | Deaktiviert |

## Sync Agent

Der Sync Agent läuft auf dem Rechner des Users und überträgt lokale Claude-Code-Sitzungsdaten automatisch an den Server.

### Ein-Klick-Installation (empfohlen)

1. Im Dashboard einloggen → Info-Tab → **Sync Agent einrichten**
2. Den angezeigten curl-Befehl kopieren oder das Install-Script herunterladen
3. Im Terminal ausführen:

```bash
curl -sL "https://deine-domain.de/api/sync-agent/install.sh?key=DEIN_API_KEY" | bash
```

Das Script:
- Prüft Node.js >= 18 und npm
- Installiert den Agent nach `~/claude-sync-agent/` (aktualisiert bestehende Installationen automatisch)
- Konfiguriert API-Key und Server-URL automatisch
- Verifiziert die Server-Verbindung
- Richtet Autostart ein (launchd auf macOS, systemd auf Linux)
- Startet den Agent sofort

### Manuelle Installation

```bash
cd sync-agent
npm install
node index.js setup    # Server-URL und API-Key eingeben
node index.js          # Starten (Full Sync + Watch)
```

### Autostart mit PM2 (Alternative)

```bash
pm2 start ~/claude-sync-agent/index.js --name claude-sync
pm2 save
```

### Funktionsweise

| Eigenschaft | Wert |
|-------------|------|
| File-Watcher | Chokidar mit `awaitWriteFinish` Debouncing |
| Parsing | Inkrementell (Byte-Offset, nur neue Daten) |
| Batch-Größe | Max. 500 Nachrichten pro Request |
| Retry | Exponential Backoff (3 Versuche) |
| Reaktionszeit | ~600ms nach jeder Claude-Antwort |
| Zustand | Persistiert in `.sync-state.json` |

## Aktive Sitzungen

Im Übersicht-Tab werden aktive Claude-Code-Sessions live angezeigt (grüne Sektion oberhalb der KPI-Cards). Eine Sitzung gilt als aktiv, wenn die letzte Nachricht innerhalb der letzten 10 Minuten lag. Pro Session werden Projekt, Modell, Dauer, Nachrichten und Kosten angezeigt. Die Anzeige aktualisiert sich automatisch via SSE — ohne Chart-Animationen.

## Backup

| Methode | Befehl |
|---------|--------|
| Automatisch | `BACKUP_PATH` in `.env` setzen (z.B. Google Drive) |
| Manuell | `curl -X POST http://localhost:5010/api/backup` |
| JSON-Export | `curl http://localhost:5010/api/export > export.json` |

- Backups werden beim Start und im konfigurierten Intervall erstellt
- Maximal 10 Backup-Kopien (ältere werden automatisch gelöscht)
- Atomares Backup via SQLite `VACUUM INTO`

## Deployment

Beispiel-Deployment mit PM2 + Nginx + SSL:

```bash
# Auf dem Server
git clone https://github.com/pepperonas/claude-token-tracker.git
cd claude-token-tracker
npm ci --production
cp .env.example .env   # Konfigurieren
pm2 start server.js --name token-tracker --node-args='--env-file=.env'
pm2 save
```

Nginx Reverse Proxy mit SSL (certbot) empfohlen für den Multi-User-Modus.

### Hosted Version

Der Tracker läuft produktiv unter [tracker.celox.io](https://tracker.celox.io).

## API-Endpunkte

| Endpunkt | Methode | Beschreibung |
|----------|---------|-------------|
| `/api/overview` | GET | KPI-Daten (Tokens, Kosten, Sessions, Messages, Lines) |
| `/api/daily` | GET | Tägliche Aggregate (Tokens, Kosten, Lines) |
| `/api/sessions` | GET | Alle Sessions mit Filter (Projekt, Modell, Zeitraum) |
| `/api/projects` | GET | Projektstatistiken |
| `/api/models` | GET | Modellstatistiken |
| `/api/tools` | GET | Tool-Nutzungsstatistiken |
| `/api/hourly` | GET | Stündliche Aktivität |
| `/api/daily-by-model` | GET | Tägliche Tokens nach Modell |
| `/api/daily-cost-breakdown` | GET | Tägliche Kosten nach Token-Typ |
| `/api/cumulative-cost` | GET | Kumulative Kosten |
| `/api/day-of-week` | GET | Wochentags-Aktivität |
| `/api/cache-efficiency` | GET | Tägliche Cache-Hit-Rate |
| `/api/stop-reasons` | GET | Verteilung der Stop-Reasons |
| `/api/session-efficiency` | GET | Tokens/Message und Kosten/Message |
| `/api/active-sessions` | GET | Aktive Sessions (letzte 10 Min.) |
| `/api/achievements` | GET | Alle 500 Achievements mit Unlock-Status |
| `/api/productivity` | GET | Produktivitäts-Metriken (Tokens/Min, Zeilen/Stunde, Kosten/Zeile, Trends) |
| `/api/export-html` | GET | Interaktiver HTML-Snapshot (Chart.js, 8 Tabs, 12+ Charts) |
| `/api/global-averages` | GET | Eigene vs. durchschnittliche Statistiken (Multi-User) |
| `/api/rebuild` | POST | Cache neu aufbauen |
| `/api/backup` | POST | Manuelles Backup erstellen |
| `/api/export` | GET | Vollständiger JSON-Export |
| `/api/sync` | POST | Nachrichten synchronisieren (Multi-User) |
| `/api/live` | GET | SSE-Stream für Echtzeit-Updates |

Alle GET-Endpunkte unterstützen `?from=YYYY-MM-DD&to=YYYY-MM-DD` Query-Parameter.

## Entwicklung

```bash
npm test              # Alle 148 Tests ausführen (vitest)
npm run test:watch    # Tests im Watch-Modus
npm run test:coverage # Coverage-Report
npm run lint          # ESLint (lib/ + server.js)
```

### Tech-Stack

| Komponente | Technologie |
|-----------|-------------|
| Backend | Node.js (vanilla `http`, kein Express) |
| Datenbank | SQLite via `better-sqlite3` (WAL-Modus) |
| Frontend | Vanilla JS, Chart.js 4.x, CSS Custom Properties |
| File-Watcher | Chokidar 4.x |
| Tests | Vitest + Supertest |
| Linting | ESLint 9 (Flat Config) |
| CI/CD | GitHub Actions |
| Deployment | PM2 + Nginx + certbot |

### Konventionen

- CommonJS Backend (`require`/`module.exports`)
- Timestamps: ISO 8601, Daten als `YYYY-MM-DD`
- Token-Zähler: immer Integer, Default 0
- Kosten: auf 2 Dezimalstellen gerundet
- Unbenutzte Variablen: Prefix `_` (ESLint)
- Deutsche Texte: richtige Umlaute (ü, ö, ä, ß), niemals ASCII-Ersatz

## Unterstützung

Wenn dir dieses Projekt gefällt, freue ich mich über eine kleine Spende:

[![Spenden](https://img.shields.io/badge/Spenden-PayPal-blue.svg)](https://www.paypal.com/donate/?business=martinpaush@gmail.com&currency_code=EUR)

## Autor

Entwickelt von [Martin Pfeffer](https://celox.io) | [GitHub](https://github.com/pepperonas)

## Lizenz

MIT — siehe [LICENSE](LICENSE)
