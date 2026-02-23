![CI](https://github.com/pepperonas/claude-token-tracker/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Node.js >= 18](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)
![Version](https://img.shields.io/badge/version-0.0.1-orange.svg)

[Deutsch](#deutsch) | [English](#english)

---

# Deutsch

## Claude Token Tracker

Ein lokales Dashboard zur Analyse deiner Claude Code Token-Nutzung. Liest die JSONL-Sitzungsdateien aus `~/.claude/projects/`, berechnet API-aequivalente Kosten und zeigt alles in Echtzeit an.

### Features

- **11 interaktive Charts** ueber 7 Tabs (Uebersicht, Sitzungen, Projekte, Tools, Modelle, Insights, Info)
- **Cache-Token-Toggle** — gecachte Tokens standardmaessig ausgeblendet, per Klick einblendbar
- **Info-Tab** mit Erklaerungen aller Token-Typen, Kostenberechnung und Modell-Preistabelle
- **SQLite-Datenbank** fuer persistente Speicherung und schnelle Abfragen
- **Echtzeit-Updates** via Server-Sent Events (Live-Indikator)
- **Automatisches Backup** (konfigurierbar, z.B. in Google Drive)
- **Zweisprachige UI** (Deutsch / Englisch)
- **API-aequivalente Kostenschaetzung** fuer alle Claude-Modelle (Opus, Sonnet, Haiku)
- **Inkrementelles Parsing** — nur neue Daten werden verarbeitet
- **CSS-only Tooltips** mit Erklaerungen auf KPI-Labels und Chart-Titeln
- **CI/CD Pipeline** mit GitHub Actions (Lint + Tests)
- **84 automatisierte Tests** (Unit + Integration)

### Screenshot

*Platzhalter — wird nach erstem Release ergaenzt*

### Installation

```bash
git clone https://github.com/pepperonas/claude-token-tracker.git
cd claude-token-tracker
npm install
npm start
```

Dashboard oeffnen: [http://localhost:5010](http://localhost:5010)

### Konfiguration

Erstelle eine `.env` Datei (optional):

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `PORT` | `5010` | Server-Port |
| `CLAUDE_DIR` | `~/.claude` | Pfad zum Claude-Verzeichnis |
| `BACKUP_PATH` | *(leer)* | Zielverzeichnis fuer automatische Backups |
| `BACKUP_INTERVAL_HOURS` | `6` | Backup-Intervall in Stunden |

### Backup einrichten

1. Setze `BACKUP_PATH` in `.env` (z.B. Google Drive Ordner)
2. Der Tracker erstellt automatisch SQLite-Backups beim Start und im konfigurierten Intervall
3. Manuelles Backup: `curl -X POST http://localhost:5010/api/backup`
4. JSON-Export: `curl http://localhost:5010/api/export > export.json`

### Entwicklung

```bash
npm test              # Alle Tests ausfuehren
npm run test:watch    # Tests im Watch-Modus
npm run test:coverage # Coverage-Report
npm run lint          # ESLint ausfuehren
```

### Lizenz

MIT — siehe [LICENSE](LICENSE)

---

# English

## Claude Token Tracker

A local dashboard for analyzing your Claude Code token usage. Reads JSONL session files from `~/.claude/projects/`, calculates API-equivalent costs, and displays everything in real-time.

### Features

- **11 interactive charts** across 7 tabs (Overview, Sessions, Projects, Tools, Models, Insights, Info)
- **Cache token toggle** — cached tokens hidden by default, one-click to include
- **Info tab** explaining all token types, cost calculation, and model pricing table
- **SQLite database** for persistent storage and fast queries
- **Real-time updates** via Server-Sent Events (live indicator)
- **Automatic backups** (configurable, e.g. to Google Drive)
- **Bilingual UI** (German / English)
- **API-equivalent cost estimation** for all Claude models (Opus, Sonnet, Haiku)
- **Incremental parsing** — only new data is processed
- **CSS-only tooltips** with explanations on KPI labels and chart titles
- **CI/CD pipeline** with GitHub Actions (lint + tests)
- **84 automated tests** (unit + integration)

### Screenshot

*Placeholder — to be added after first release*

### Installation

```bash
git clone https://github.com/pepperonas/claude-token-tracker.git
cd claude-token-tracker
npm install
npm start
```

Open dashboard: [http://localhost:5010](http://localhost:5010)

### Configuration

Create a `.env` file (optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5010` | Server port |
| `CLAUDE_DIR` | `~/.claude` | Path to Claude directory |
| `BACKUP_PATH` | *(empty)* | Destination directory for automatic backups |
| `BACKUP_INTERVAL_HOURS` | `6` | Backup interval in hours |

### Backup Setup

1. Set `BACKUP_PATH` in `.env` (e.g. Google Drive folder)
2. The tracker automatically creates SQLite backups on startup and at the configured interval
3. Manual backup: `curl -X POST http://localhost:5010/api/backup`
4. JSON export: `curl http://localhost:5010/api/export > export.json`

### Development

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run lint          # Run ESLint
```

### License

MIT — see [LICENSE](LICENSE)
