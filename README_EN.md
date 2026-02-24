<p align="center">
  <a href="README_DE.md"><img src="https://img.shields.io/badge/%F0%9F%87%A9%F0%9F%87%AA_Deutsch-Sprache_wechseln-blue?style=for-the-badge" alt="Auf Deutsch wechseln"></a>
</p>

<p align="center">
  <a href="https://github.com/pepperonas/claude-token-tracker/actions/workflows/ci.yml"><img src="https://github.com/pepperonas/claude-token-tracker/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white" alt="Node.js >= 18">
  <img src="https://img.shields.io/badge/version-0.0.4-orange.svg" alt="Version">
  <img src="https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Chart.js-4.x-FF6384?logo=chartdotjs&logoColor=white" alt="Chart.js">
  <img src="https://img.shields.io/badge/Tests-148%20passing-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey" alt="Platform">
  <a href="https://github.com/pepperonas/claude-token-tracker/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
</p>

---

<p align="center">
  <img src="public/og-image.png" alt="Claude Token Tracker" width="720">
</p>

# Claude Token Tracker

Dashboard for analyzing your Claude Code token usage. Reads Claude Code's JSONL session files, calculates API-equivalent costs, tracks lines of code, and displays everything in real-time. Supports **single-user** (local) and **multi-user** (hosted with GitHub OAuth + Sync Agent).

## Features

### Dashboard & Visualization

- **16 interactive charts** across 9 tabs (Overview, Sessions, Projects, Tools, Models, Insights, Productivity, Achievements, Info)
- **Active sessions** — live display of currently running Claude Code sessions with project, model, duration, and cost
- **Token breakdown** — detail KPI cards for input, output, cache read, and cache create tokens with individual costs
- **Lines of Code** — Write (green), Edit (yellow), Delete (red) with Net Change calculation and adaptive hourly/daily chart
- **Global period filter** — Today / 7 Days / 30 Days / All Time, applies to all tabs
- **Sortable tables** — all data tables sortable by clicking column headers
- **CSS-only tooltips** with explanations on KPI labels and chart titles
- **Chart legend persistence** — legend selections and period filter persist in localStorage
- **Bilingual UI** (German / English) with tab, period, and settings persistence

### Data Processing

- **Incremental parsing** — only new data is processed (byte-offset tracking)
- **SQLite database** with WAL mode for persistent storage and fast queries
- **In-memory aggregation** — pre-computed maps for fast API responses
- **Real-time updates** via Server-Sent Events (animation-free on live updates)
- **API-equivalent cost estimation** for all Claude models (Opus 4.5/4.6, Sonnet 4.5, Haiku 4.5, Sonnet 3.7)
- **Automatic backups** (configurable, e.g. to Google Drive)

### Multi-User & Deployment

- **Multi-user mode** — GitHub OAuth, personal API keys, per-user data isolation
- **Sync Agent** — one-click install via curl, watches local session files and uploads to server
- **Autostart** — install script automatically sets up launchd (macOS) or systemd (Linux)
- **SEO-optimized** with Open Graph, Twitter Cards, and structured meta tags
- **CI/CD pipeline** with GitHub Actions (lint + tests)
- **Demo mode** — non-logged-in visitors see sample data dashboard; sign in with GitHub to view your own data
- **500 achievements** — gamification system across 12 categories (tokens, sessions, messages, cost, lines, models, tools, time, projects, streaks, cache, special) with 5 tiers (bronze to diamond)
- **Productivity tab** — Tokens/Min, Lines/Hour, Cost/Line, Cache Savings, Code Ratio with trend indicators
- **Period comparison** — always-visible inline pill selector (Off / Prev. Period / Last 7d / 30d / 90d / Custom) instantly compares two periods side-by-side with 8 metrics (Tokens/Min, Lines/Hour, Cost/Line, Tokens/Line, Lines/Turn, Tools/Turn, I/O Ratio, Coding Hours), delta percentages, and color-coded improvement/regression indicators — one click to activate, no toggle needed
- **HTML export** — download self-contained dark-theme report with KPI cards, charts, and tables
- **Global comparison** — compare your stats against the average of all users (multi-user mode)
- **148 automated tests** (unit + integration + multi-user API + achievements)

## Architecture

```
Single-User:
  ~/.claude/projects/**/*.jsonl
      -> Parser (incremental, byte-offset)
      -> SQLite (WAL, INSERT OR REPLACE)
      -> Aggregator (in-memory, pre-computed maps)
      -> HTTP Server (20+ JSON endpoints + SSE)
      -> Frontend (Chart.js, i18n DE/EN, sortable tables)

Multi-User:
  Sync Agent (client) -> POST /api/sync (API key auth)
      -> SQLite (per user, user_id)
      -> AggregatorCache (lazy, 30min eviction)
      -> HTTP Server (GitHub OAuth + session cookies)
      -> Frontend (login overlay, sync setup, active sessions)
```

### Module Overview

| Module | Description |
|--------|-------------|
| `lib/parser.js` | Reads JSONL files, extracts token counts, tools, model, and lines-of-code from `type: 'assistant'` messages |
| `lib/aggregator.js` | In-memory analytics engine with `_daily`, `_sessions`, `_projects`, `_models`, `_tools`, `_hourly` maps |
| `lib/db.js` | SQLite layer with `messages`, `message_tools`, `parse_state`, `metadata`, `users`, `user_sessions`, `achievements` tables |
| `lib/pricing.js` | Model pricing (input/output/cacheRead/cacheCreate per 1M tokens) |
| `lib/watcher.js` | Chokidar file watcher with debounced incremental parsing |
| `lib/auth.js` | GitHub OAuth flow, session management, cookie-based authentication |
| `lib/backup.js` | SQLite `VACUUM INTO` for atomic backups, auto-pruning to 10 copies |
| `lib/achievements.js` | 500 achievement definitions with check logic, stats builder, and unlock tracking |
| `lib/export-html.js` | Self-contained HTML report generator with inline dark theme CSS |
| `server.js` | Vanilla `http.createServer` with 25+ API routes, SSE, and static file serving |
| `sync-agent/` | Standalone CLI tool for client-side watching and uploading |

## Installation

```bash
git clone https://github.com/pepperonas/claude-token-tracker.git
cd claude-token-tracker
npm install
npm start
```

Open dashboard: [http://localhost:5010](http://localhost:5010)

## Configuration

Create a `.env` file (optional for single-user, required for multi-user):

### General

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5010` | Server port |
| `CLAUDE_DIR` | `~/.claude` | Path to Claude directory |
| `DB_PATH` | `data/tracker.db` | Path to SQLite database |
| `BACKUP_PATH` | *(empty)* | Destination directory for automatic backups |
| `BACKUP_INTERVAL_HOURS` | `6` | Backup interval in hours |

### Multi-User Mode

| Variable | Default | Description |
|----------|---------|-------------|
| `MULTI_USER` | `false` | Enable multi-user mode |
| `BASE_URL` | `http://localhost:PORT` | Public URL (for OAuth redirect) |
| `GITHUB_CLIENT_ID` | — | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | — | GitHub OAuth App Client Secret |
| `SESSION_SECRET` | — | Secret key for sessions |

## Lines of Code

The tracker automatically captures code line changes from JSONL session files:

- **Write** (green) — lines in `content` from Write tool calls (new files / overwrites)
- **Edit** (yellow) — lines in `new_string` from Edit tool calls (replacement text)
- **Delete** (red) — lines in `old_string` from Edit tool calls (removed text)

**Net Change** = write + edit - delete

The data is displayed as:
- **KPI cards** in the overview (Write, Edit, Delete, Net Change)
- **"+/-" column** in the Sessions and Projects tables
- **Daily bar chart** in the Insights tab (green = Write, yellow = Edit, red = Delete)

> After a **Cache Rebuild**, all historical files are re-parsed and lines data is populated.

## Multi-User Mode

Multi-user mode allows multiple people to track their token data on a central server.

1. **Create a GitHub OAuth App** at [github.com/settings/developers](https://github.com/settings/developers)
   - Authorization callback URL: `https://your-domain.com/auth/github/callback`
2. **Configure `.env`** with OAuth credentials and `MULTI_USER=true`
3. **Start the server** — GitHub login appears automatically

Each user gets a personal **API key** for the Sync Agent, visible in the Info tab.

### Differences from Single-User Mode

| Aspect | Single-User | Multi-User |
|--------|-------------|------------|
| Data source | Local JSONL files (Chokidar watcher) | Sync Agent uploads via API |
| Authentication | None | GitHub OAuth + session cookies |
| Data isolation | None (all data belongs to one user) | Per-user via `user_id` column |
| Aggregation | One global aggregator | AggregatorCache (lazy, 30min eviction) |
| File watcher | Active | Disabled |

## Sync Agent

The Sync Agent runs on the user's machine and automatically uploads local Claude Code session data to the server.

### One-Click Install (recommended)

1. Log into the dashboard -> Info tab -> **Sync Agent Setup**
2. Copy the displayed curl command or download the install script
3. Run in terminal:

```bash
curl -sL "https://your-domain.com/api/sync-agent/install.sh?key=YOUR_API_KEY" | bash
```

The script:
- Checks Node.js >= 18 and npm
- Installs the agent to `~/claude-sync-agent/` (auto-updates existing installations)
- Configures API key and server URL automatically
- Verifies server connectivity
- Sets up autostart (launchd on macOS, systemd on Linux)
- Starts the agent immediately

### Manual Installation

```bash
cd sync-agent
npm install
node index.js setup    # Enter server URL and API key
node index.js          # Start (full sync + watch)
```

### Autostart with PM2 (alternative)

```bash
pm2 start ~/claude-sync-agent/index.js --name claude-sync
pm2 save
```

### How It Works

| Property | Value |
|----------|-------|
| File watcher | Chokidar with `awaitWriteFinish` debouncing |
| Parsing | Incremental (byte-offset, new data only) |
| Batch size | Max 500 messages per request |
| Retry | Exponential backoff (3 attempts) |
| Response time | ~600ms after each Claude response |
| State | Persisted in `.sync-state.json` |

## Active Sessions

The Overview tab displays currently active Claude Code sessions live (green section above the KPI cards). A session is considered active if its last message was within the past 10 minutes. Each session shows project, model, duration, messages, and cost. The display updates automatically via SSE — without chart animations.

## Backup

| Method | Command |
|--------|---------|
| Automatic | Set `BACKUP_PATH` in `.env` (e.g. Google Drive) |
| Manual | `curl -X POST http://localhost:5010/api/backup` |
| JSON export | `curl http://localhost:5010/api/export > export.json` |

- Backups are created on startup and at the configured interval
- Maximum 10 backup copies (older ones are automatically deleted)
- Atomic backup via SQLite `VACUUM INTO`

## Deployment

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

### Hosted Version

The tracker runs in production at [tracker.celox.io](https://tracker.celox.io).

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/overview` | GET | KPI data (tokens, cost, sessions, messages, lines) |
| `/api/daily` | GET | Daily aggregates (tokens, cost, lines) |
| `/api/sessions` | GET | All sessions with filters (project, model, period) |
| `/api/projects` | GET | Project statistics |
| `/api/models` | GET | Model statistics |
| `/api/tools` | GET | Tool usage statistics |
| `/api/hourly` | GET | Hourly activity |
| `/api/daily-by-model` | GET | Daily tokens by model |
| `/api/daily-cost-breakdown` | GET | Daily cost by token type |
| `/api/cumulative-cost` | GET | Cumulative cost |
| `/api/day-of-week` | GET | Weekday activity |
| `/api/cache-efficiency` | GET | Daily cache hit rate |
| `/api/stop-reasons` | GET | Stop reason distribution |
| `/api/session-efficiency` | GET | Tokens/message and cost/message |
| `/api/active-sessions` | GET | Active sessions (last 10 min) |
| `/api/achievements` | GET | All 500 achievements with unlock status |
| `/api/productivity` | GET | Productivity metrics (tokens/min, lines/hour, cost/line, trends) |
| `/api/export-html` | GET | Self-contained HTML export |
| `/api/global-averages` | GET | Personal vs average stats (multi-user) |
| `/api/rebuild` | POST | Rebuild cache |
| `/api/backup` | POST | Create manual backup |
| `/api/export` | GET | Full JSON export |
| `/api/sync` | POST | Sync messages (multi-user) |
| `/api/live` | GET | SSE stream for real-time updates |

All GET endpoints support `?from=YYYY-MM-DD&to=YYYY-MM-DD` query parameters.

## Development

```bash
npm test              # Run all 148 tests (vitest)
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run lint          # ESLint (lib/ + server.js)
```

### Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js (vanilla `http`, no Express) |
| Database | SQLite via `better-sqlite3` (WAL mode) |
| Frontend | Vanilla JS, Chart.js 4.x, CSS Custom Properties |
| File watcher | Chokidar 4.x |
| Tests | Vitest + Supertest |
| Linting | ESLint 9 (flat config) |
| CI/CD | GitHub Actions |
| Deployment | PM2 + Nginx + certbot |

### Conventions

- CommonJS backend (`require`/`module.exports`)
- Timestamps: ISO 8601, dates as `YYYY-MM-DD`
- Token counts: always integers, default 0
- Costs: rounded to 2 decimal places
- Unused variables: prefix `_` (ESLint)

## Support

If you find this project useful, consider buying me a coffee:

[![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://www.paypal.com/donate/?business=martinpaush@gmail.com&currency_code=EUR)

## Author

Built by [Martin Pfeffer](https://celox.io) | [GitHub](https://github.com/pepperonas)

## License

MIT — see [LICENSE](LICENSE)
