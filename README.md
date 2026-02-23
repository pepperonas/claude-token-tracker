![CI](https://github.com/pepperonas/claude-token-tracker/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Node.js >= 18](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)
![Version](https://img.shields.io/badge/version-0.1.0-orange.svg)

[Deutsch](#deutsch) | [English](#english)

---

# Deutsch

## Claude Token Tracker

Dashboard zur Analyse deiner Claude Code Token-Nutzung. Liest die JSONL-Sitzungsdateien von Claude Code, berechnet API-äquivalente Kosten und zeigt alles in Echtzeit an. Unterstützt **Single-User** (lokal) und **Multi-User** (gehostet mit GitHub OAuth + Sync Agent).

### Features

- **11 interaktive Charts** über 7 Tabs (Übersicht, Sitzungen, Projekte, Tools, Modelle, Insights, Info)
- **Aktive Sitzungen** — Live-Anzeige aktuell laufender Claude-Code-Sessions mit Projekt, Modell, Dauer und Kosten
- **Token-Aufschlüsselung** — Detail-KPI-Cards für Input, Output, Cache Read und Cache Create Tokens mit Einzelkosten
- **Sortierbare Tabellen** — Alle Datentabellen durch Klick auf Spaltenüberschriften sortierbar
- **Multi-User-Modus** — GitHub OAuth, persönliche API-Keys, Datenisolation pro User
- **Sync Agent** — Ein-Klick-Installation via curl, überwacht lokale Sitzungsdateien und überträgt an den Server
- **Autostart** — Install-Script richtet automatisch launchd (macOS) oder systemd (Linux) ein
- **SQLite-Datenbank** mit WAL-Modus für persistente Speicherung und schnelle Abfragen
- **Echtzeit-Updates** via Server-Sent Events (animationsfrei bei Live-Updates)
- **Automatisches Backup** (konfigurierbar, z.B. in Google Drive)
- **Zweisprachige UI** (Deutsch / Englisch) mit Tab-, Zeitraum- und Einstellungspersistenz
- **API-äquivalente Kostenschätzung** für alle Claude-Modelle (Opus 4.5/4.6, Sonnet 4.5, Haiku 4.5, Sonnet 3.7)
- **Inkrementelles Parsing** — nur neue Daten werden verarbeitet (Byte-Offset-Tracking)
- **CSS-only Tooltips** mit Erklärungen auf KPI-Labels und Chart-Titeln
- **SEO-optimiert** mit Open Graph, Twitter Cards und strukturierten Meta-Tags
- **CI/CD Pipeline** mit GitHub Actions (Lint + Tests)
- **109 automatisierte Tests** (Unit + Integration + Multi-User API)

### Architektur

```
Single-User:
  ~/.claude/projects/**/*.jsonl
      -> Parser (inkrementell, Byte-Offset)
      -> SQLite (WAL, INSERT OR REPLACE)
      -> Aggregator (In-Memory, vorberechnet)
      -> HTTP-Server (20+ JSON-Endpoints + SSE)
      -> Frontend (Chart.js, i18n DE/EN, sortierbare Tabellen)

Multi-User:
  Sync Agent (Client) -> POST /api/sync (API-Key Auth)
      -> SQLite (pro User, user_id)
      -> AggregatorCache (lazy, 30min Eviction)
      -> HTTP-Server (GitHub OAuth + Session Cookies)
      -> Frontend (Login-Overlay, Sync-Setup, Active Sessions)
```

### Installation

```bash
git clone https://github.com/pepperonas/claude-token-tracker.git
cd claude-token-tracker
npm install
npm start
```

Dashboard öffnen: [http://localhost:5010](http://localhost:5010)

### Konfiguration

Erstelle eine `.env` Datei (optional für Single-User, erforderlich für Multi-User):

#### Allgemein

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `PORT` | `5010` | Server-Port |
| `CLAUDE_DIR` | `~/.claude` | Pfad zum Claude-Verzeichnis |
| `BACKUP_PATH` | *(leer)* | Zielverzeichnis für automatische Backups |
| `BACKUP_INTERVAL_HOURS` | `6` | Backup-Intervall in Stunden |

#### Multi-User-Modus

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `MULTI_USER` | `false` | Multi-User-Modus aktivieren |
| `BASE_URL` | `http://localhost:PORT` | Öffentliche URL (für OAuth-Redirect) |
| `GITHUB_CLIENT_ID` | — | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | — | GitHub OAuth App Client Secret |
| `SESSION_SECRET` | — | Geheimer Schlüssel für Sessions |

### Multi-User-Modus

Der Multi-User-Modus ermöglicht es mehreren Personen, ihre Token-Daten auf einem zentralen Server zu tracken.

1. **GitHub OAuth App erstellen** unter [github.com/settings/developers](https://github.com/settings/developers)
   - Authorization callback URL: `https://deine-domain.de/auth/github/callback`
2. **`.env` konfigurieren** mit den OAuth-Credentials und `MULTI_USER=true`
3. **Server starten** — Login via GitHub erscheint automatisch

Jeder User bekommt einen persönlichen **API-Key** für den Sync Agent, einsehbar im Info-Tab.

### Sync Agent

Der Sync Agent läuft auf dem Rechner des Users und überträgt lokale Claude-Code-Sitzungsdaten automatisch an den Server.

#### Ein-Klick-Installation (empfohlen)

1. Im Dashboard einloggen -> Info-Tab -> **Sync Agent einrichten**
2. Den angezeigten curl-Befehl kopieren oder das Install-Script herunterladen
3. Im Terminal ausführen:

```bash
curl -sL "https://deine-domain.de/api/sync-agent/install.sh?key=DEIN_API_KEY" | bash
```

Das Script:
- Prüft Node.js >= 18 und npm
- Installiert den Agent nach `~/claude-sync-agent/`
- Konfiguriert API-Key und Server-URL automatisch
- Verifiziert die Server-Verbindung
- Richtet Autostart ein (launchd auf macOS, systemd auf Linux)
- Startet den Agent sofort

#### Manuelle Installation

```bash
cd sync-agent
npm install
node index.js setup    # Server-URL und API-Key eingeben
node index.js          # Starten (Full Sync + Watch)
```

#### Autostart mit PM2 (Alternative)

```bash
pm2 start ~/claude-sync-agent/index.js --name claude-sync
pm2 save
```

#### Funktionsweise

- Überwacht `~/.claude/projects/` via Chokidar (File-Watcher)
- Inkrementelles Parsing (nur neue Daten, Byte-Offset-Tracking)
- Sendet Batches von max. 500 Nachrichten per `POST /api/sync`
- Exponential Backoff bei Verbindungsfehlern (3 Retries)
- Reaktionszeit: ~600ms nach jeder Claude-Antwort

### Aktive Sitzungen

Im Übersicht-Tab werden aktive Claude-Code-Sessions live angezeigt (grüne Sektion oberhalb der KPI-Cards). Eine Sitzung gilt als aktiv, wenn die letzte Nachricht innerhalb der letzten 10 Minuten lag. Pro Session werden Projekt, Modell, Dauer, Nachrichten und Kosten angezeigt. Die Anzeige aktualisiert sich automatisch via SSE — ohne Chart-Animationen.

### Backup

1. Setze `BACKUP_PATH` in `.env` (z.B. Google Drive Ordner)
2. Der Tracker erstellt automatisch SQLite-Backups beim Start und im konfigurierten Intervall
3. Manuelles Backup: `curl -X POST http://localhost:5010/api/backup`
4. JSON-Export: `curl http://localhost:5010/api/export > export.json`

### Deployment

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

### Entwicklung

```bash
npm test              # Alle 109 Tests ausführen (vitest)
npm run test:watch    # Tests im Watch-Modus
npm run test:coverage # Coverage-Report
npm run lint          # ESLint (lib/ + server.js)
```

### Autor

Entwickelt von [Martin Pfeffer](https://celox.io) | [GitHub](https://github.com/pepperonas)

### Lizenz

MIT — siehe [LICENSE](LICENSE)

---

# English

## Claude Token Tracker

Dashboard for analyzing your Claude Code token usage. Reads Claude Code's JSONL session files, calculates API-equivalent costs, and displays everything in real-time. Supports **single-user** (local) and **multi-user** (hosted with GitHub OAuth + Sync Agent).

### Features

- **11 interactive charts** across 7 tabs (Overview, Sessions, Projects, Tools, Models, Insights, Info)
- **Active sessions** — live display of currently running Claude Code sessions with project, model, duration, and cost
- **Token breakdown** — detail KPI cards for input, output, cache read, and cache create tokens with individual costs
- **Sortable tables** — all data tables sortable by clicking column headers
- **Multi-user mode** — GitHub OAuth, personal API keys, per-user data isolation
- **Sync Agent** — one-click install via curl, watches local session files and uploads to server
- **Autostart** — install script automatically sets up launchd (macOS) or systemd (Linux)
- **SQLite database** with WAL mode for persistent storage and fast queries
- **Real-time updates** via Server-Sent Events (animation-free on live updates)
- **Automatic backups** (configurable, e.g. to Google Drive)
- **Bilingual UI** (German / English) with tab, period, and settings persistence
- **API-equivalent cost estimation** for all Claude models (Opus 4.5/4.6, Sonnet 4.5, Haiku 4.5, Sonnet 3.7)
- **Incremental parsing** — only new data is processed (byte-offset tracking)
- **CSS-only tooltips** with explanations on KPI labels and chart titles
- **SEO-optimized** with Open Graph, Twitter Cards, and structured meta tags
- **CI/CD pipeline** with GitHub Actions (lint + tests)
- **109 automated tests** (unit + integration + multi-user API)

### Architecture

```
Single-User:
  ~/.claude/projects/**/*.jsonl
      -> Parser (incremental, byte-offset)
      -> SQLite (WAL, INSERT OR REPLACE)
      -> Aggregator (in-memory, pre-computed)
      -> HTTP Server (20+ JSON endpoints + SSE)
      -> Frontend (Chart.js, i18n DE/EN, sortable tables)

Multi-User:
  Sync Agent (client) -> POST /api/sync (API key auth)
      -> SQLite (per user, user_id)
      -> AggregatorCache (lazy, 30min eviction)
      -> HTTP Server (GitHub OAuth + session cookies)
      -> Frontend (login overlay, sync setup, active sessions)
```

### Installation

```bash
git clone https://github.com/pepperonas/claude-token-tracker.git
cd claude-token-tracker
npm install
npm start
```

Open dashboard: [http://localhost:5010](http://localhost:5010)

### Configuration

Create a `.env` file (optional for single-user, required for multi-user):

#### General

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5010` | Server port |
| `CLAUDE_DIR` | `~/.claude` | Path to Claude directory |
| `BACKUP_PATH` | *(empty)* | Destination directory for automatic backups |
| `BACKUP_INTERVAL_HOURS` | `6` | Backup interval in hours |

#### Multi-User Mode

| Variable | Default | Description |
|----------|---------|-------------|
| `MULTI_USER` | `false` | Enable multi-user mode |
| `BASE_URL` | `http://localhost:PORT` | Public URL (for OAuth redirect) |
| `GITHUB_CLIENT_ID` | — | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | — | GitHub OAuth App Client Secret |
| `SESSION_SECRET` | — | Secret key for sessions |

### Multi-User Mode

Multi-user mode allows multiple people to track their token data on a central server.

1. **Create a GitHub OAuth App** at [github.com/settings/developers](https://github.com/settings/developers)
   - Authorization callback URL: `https://your-domain.com/auth/github/callback`
2. **Configure `.env`** with OAuth credentials and `MULTI_USER=true`
3. **Start the server** — GitHub login appears automatically

Each user gets a personal **API key** for the Sync Agent, visible in the Info tab.

### Sync Agent

The Sync Agent runs on the user's machine and automatically uploads local Claude Code session data to the server.

#### One-Click Install (recommended)

1. Log into the dashboard -> Info tab -> **Sync Agent Setup**
2. Copy the displayed curl command or download the install script
3. Run in terminal:

```bash
curl -sL "https://your-domain.com/api/sync-agent/install.sh?key=YOUR_API_KEY" | bash
```

The script:
- Checks Node.js >= 18 and npm
- Installs the agent to `~/claude-sync-agent/`
- Configures API key and server URL automatically
- Verifies server connectivity
- Sets up autostart (launchd on macOS, systemd on Linux)
- Starts the agent immediately

#### Manual Installation

```bash
cd sync-agent
npm install
node index.js setup    # Enter server URL and API key
node index.js          # Start (full sync + watch)
```

#### Autostart with PM2 (alternative)

```bash
pm2 start ~/claude-sync-agent/index.js --name claude-sync
pm2 save
```

#### How It Works

- Watches `~/.claude/projects/` via Chokidar (file watcher)
- Incremental parsing (new data only, byte-offset tracking)
- Sends batches of up to 500 messages via `POST /api/sync`
- Exponential backoff on connection errors (3 retries)
- Response time: ~600ms after each Claude response

### Active Sessions

The Overview tab displays currently active Claude Code sessions live (green section above the KPI cards). A session is considered active if its last message was within the past 10 minutes. Each session shows project, model, duration, messages, and cost. The display updates automatically via SSE — without chart animations.

### Backup

1. Set `BACKUP_PATH` in `.env` (e.g. Google Drive folder)
2. The tracker automatically creates SQLite backups on startup and at the configured interval
3. Manual backup: `curl -X POST http://localhost:5010/api/backup`
4. JSON export: `curl http://localhost:5010/api/export > export.json`

### Deployment

Example deployment with PM2 + Nginx + SSL:

```bash
# On the server
git clone https://github.com/pepperonas/claude-token-tracker.git
cd claude-token-tracker
npm ci --production
cp .env.example .env   # Configure
pm2 start server.js --name token-tracker --node-args='--env-file=.env'
pm2 save
```

Nginx reverse proxy with SSL (certbot) recommended for multi-user mode.

### Development

```bash
npm test              # Run all 109 tests (vitest)
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run lint          # ESLint (lib/ + server.js)
```

### Author

Built by [Martin Pfeffer](https://celox.io) | [GitHub](https://github.com/pepperonas)

### License

MIT — see [LICENSE](LICENSE)
