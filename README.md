<p align="center">
  <img src="public/og-image.png" alt="Claude Token Tracker" width="720">
</p>

<h1 align="center">Claude Token Tracker</h1>

<p align="center">
  Real-time dashboard for Claude Code token usage, API-equivalent cost estimation, and coding activity tracking.
</p>

<!-- BADGES:START -->

<p align="center">
  <img src="https://img.shields.io/badge/version-v0.3.0-ff6b00?style=for-the-badge&logo=semanticrelease&logoColor=white" alt="Version 0.3.0">
  <img src="https://img.shields.io/badge/lines_of_code-39.1k-58a6ff?style=for-the-badge&logo=javascript&logoColor=white" alt="39150 lines of code across 66 files">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/tests-531_passing-3fb950?style=for-the-badge&logo=vitest&logoColor=white" alt="531 tests passing">
  <img src="https://img.shields.io/badge/achievements-1200-8957e5?style=for-the-badge&logo=trophy&logoColor=white" alt="1200 achievements">
  <img src="https://img.shields.io/badge/build_step-none-1a7f37?style=for-the-badge&logo=esbuild&logoColor=white" alt="no build step">
</p>

<p align="center">
  <a href="https://github.com/pepperonas/claude-token-tracker/actions/workflows/ci.yml"><img src="https://github.com/pepperonas/claude-token-tracker/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <img src="https://img.shields.io/github/license/pepperonas/claude-token-tracker?style=flat-square&label=license&color=blue&logo=opensourceinitiative&logoColor=white" alt="license">
  <img src="https://img.shields.io/github/v/release/pepperonas/claude-token-tracker?style=flat-square&label=release&color=orange&logo=github&logoColor=white" alt="release">
  <img src="https://img.shields.io/github/last-commit/pepperonas/claude-token-tracker?style=flat-square&label=last%20commit&color=informational&logo=git&logoColor=white" alt="last commit">
  <img src="https://img.shields.io/github/commit-activity/m/pepperonas/claude-token-tracker?style=flat-square&label=commits%2Fmonth&color=informational&logo=git&logoColor=white" alt="commits/month">
  <img src="https://img.shields.io/github/languages/code-size/pepperonas/claude-token-tracker?style=flat-square&label=code%20size&color=informational&logo=github&logoColor=white" alt="code size">
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/pepperonas/claude-token-tracker?style=flat-square&label=stars&color=gold&logo=github&logoColor=white" alt="stars">
  <img src="https://img.shields.io/github/forks/pepperonas/claude-token-tracker?style=flat-square&label=forks&color=informational&logo=github&logoColor=white" alt="forks">
  <img src="https://img.shields.io/github/issues/pepperonas/claude-token-tracker?style=flat-square&label=open%20issues&color=informational&logo=github&logoColor=white" alt="open issues">
  <img src="https://img.shields.io/github/issues-pr/pepperonas/claude-token-tracker?style=flat-square&label=open%20PRs&color=informational&logo=github&logoColor=white" alt="open PRs">
  <img src="https://img.shields.io/github/contributors/pepperonas/claude-token-tracker?style=flat-square&label=contributors&color=informational&logo=github&logoColor=white" alt="contributors">
  <a href="https://github.com/pepperonas/claude-token-tracker/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs welcome"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/API_routes-70-0969da?style=flat-square" alt="70 API routes">
  <img src="https://img.shields.io/badge/DB_tables-12-0969da?style=flat-square" alt="12 database tables">
  <img src="https://img.shields.io/badge/lib_modules-18-0969da?style=flat-square" alt="18 library modules">
  <img src="https://img.shields.io/badge/charts-43-FF6384?style=flat-square&logo=chartdotjs&logoColor=white" alt="43 chart types">
  <img src="https://img.shields.io/badge/doc_pages-5-6f42c1?style=flat-square&logo=readthedocs&logoColor=white" alt="5 documentation pages">
  <img src="https://img.shields.io/badge/test_files-31-3fb950?style=flat-square&logo=vitest&logoColor=white" alt="31 test files">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/achievement_categories-14-8957e5?style=flat-square" alt="14 achievement categories">
  <img src="https://img.shields.io/badge/tiers-5_bronze_to_diamond-8957e5?style=flat-square" alt="5 tiers">
  <img src="https://img.shields.io/badge/models_priced-14-D4A574?style=flat-square&logo=anthropic&logoColor=white" alt="14 models in the fallback price table">
  <img src="https://img.shields.io/badge/i18n_keys-5874_x_2-bf8700?style=flat-square" alt="5874 translation keys in 2 languages">
  <img src="https://img.shields.io/badge/languages-DE_%7C_EN-bf8700?style=flat-square" alt="German and English">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D20.12-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js &gt;=20.12">
  <img src="https://img.shields.io/badge/better--sqlite3-11.0.0-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="better-sqlite3 11.0.0">
  <img src="https://img.shields.io/badge/chokidar-4.0.0-orange?style=flat-square&logo=files&logoColor=white" alt="chokidar 4.0.0">
  <img src="https://img.shields.io/badge/Chart.js-4.4.7-FF6384?style=flat-square&logo=chartdotjs&logoColor=white" alt="Chart.js 4.4.7">
  <img src="https://img.shields.io/badge/Vitest-4.1.8-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest 4.1.8">
  <img src="https://img.shields.io/badge/ESLint-9.0.0-4B32C3?style=flat-square&logo=eslint&logoColor=white" alt="ESLint 9.0.0">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime_deps-2-cf222e?style=flat-square" alt="2 runtime dependencies">
  <img src="https://img.shields.io/badge/dev_deps-3-cf222e?style=flat-square" alt="3 dev dependencies">
  <img src="https://img.shields.io/badge/framework-none-1a7f37?style=flat-square" alt="no frontend framework">
  <img src="https://img.shields.io/badge/bundler-none-1a7f37?style=flat-square" alt="no bundler">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square&logo=opensourceinitiative&logoColor=white" alt="MIT license">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/storage-SQLite_WAL-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite in WAL mode">
  <img src="https://img.shields.io/badge/live_updates-SSE-FF6600?style=flat-square&logo=lightning&logoColor=white" alt="Server-Sent Events">
  <img src="https://img.shields.io/badge/auth-GitHub_OAuth-181717?style=flat-square&logo=github&logoColor=white" alt="GitHub OAuth">
  <img src="https://img.shields.io/badge/secrets-AES----256----GCM-critical?style=flat-square&logo=letsencrypt&logoColor=white" alt="AES-256-GCM encrypted">
  <img src="https://img.shields.io/badge/pricing-live_via_LiteLLM-6f42c1?style=flat-square&logo=anthropic&logoColor=white" alt="live pricing from LiteLLM">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/cache_tiers-5min_%2B_1h-0969da?style=flat-square" alt="both cache-write tiers priced">
  <img src="https://img.shields.io/badge/cost_model-time--aware-0969da?style=flat-square" alt="historical prices pinned per message">
  <img src="https://img.shields.io/badge/data-never_deleted-1a7f37?style=flat-square" alt="no DELETE FROM messages anywhere">
  <img src="https://img.shields.io/badge/offline-works_fully-lightgrey?style=flat-square" alt="works without network access">
  <img src="https://img.shields.io/badge/mobile-responsive_393px%2B-purple?style=flat-square" alt="mobile responsive from 393px">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS_%7C_Linux_%7C_Windows-lightgrey?style=flat-square&logo=linux&logoColor=white" alt="runs on macOS, Linux and Windows">
  <img src="https://img.shields.io/badge/deploy-PM2_%2B_nginx-2B037A?style=flat-square&logo=pm2&logoColor=white" alt="PM2 and nginx">
  <img src="https://img.shields.io/badge/sync_agent-included-success?style=flat-square&logo=rsync&logoColor=white" alt="sync agent included">
  <a href="https://tracker.celox.io"><img src="https://img.shields.io/badge/demo-tracker.celox.io-blue?style=flat-square&logo=googlechrome&logoColor=white" alt="Live demo"></a>
</p>

<p align="center">
  <a href="docs/API.md"><img src="https://img.shields.io/badge/docs-API-informational?style=flat-square&logo=readthedocs&logoColor=white" alt="API reference"></a>
  <a href="docs/ARCHITECTURE.md"><img src="https://img.shields.io/badge/docs-Architecture-informational?style=flat-square&logo=readthedocs&logoColor=white" alt="Architecture"></a>
  <a href="docs/METRICS.md"><img src="https://img.shields.io/badge/docs-Metrics-informational?style=flat-square&logo=readthedocs&logoColor=white" alt="Metrics"></a>
  <a href="docs/CONFIGURATION.md"><img src="https://img.shields.io/badge/docs-Configuration-informational?style=flat-square&logo=readthedocs&logoColor=white" alt="Configuration"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/docs-Contributing-informational?style=flat-square&logo=readthedocs&logoColor=white" alt="Contributing"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/docs-Changelog-informational?style=flat-square&logo=readthedocs&logoColor=white" alt="Changelog"></a>
</p>

<!-- BADGES:END -->

---

<p align="center">
  <a href="README_DE.md"><img src="https://img.shields.io/badge/%F0%9F%87%A9%F0%9F%87%AA_Deutsch-Dokumentation-black?style=for-the-badge" alt="Deutsch"></a>
  &nbsp;&nbsp;
  <a href="README_EN.md"><img src="https://img.shields.io/badge/%F0%9F%87%AC%F0%9F%87%A7_English-Documentation-black?style=for-the-badge" alt="English"></a>
</p>

---

## Quick Start

```bash
git clone https://github.com/pepperonas/claude-token-tracker.git
cd claude-token-tracker
npm install
npm start
```

Open [http://localhost:5010](http://localhost:5010)

## Highlights

- **40+ interactive charts** across 10 tabs with real-time SSE updates
- **Claude API tab** — Anthropic Admin API usage/cost dashboard: budget tracking with progress bar, 4 KPIs (total cost, tokens, avg cost/day, cache efficiency), daily cost/token charts by model, model distribution doughnut, cumulative cost trend. **Per-API-key breakdown**: horizontal stacked bar chart showing cost per key by model, daily cost timeline per key, key comparison table (tokens, input, output, cache %, calculated cost, last used), token history timeline (stacked area). Costs per key calculated via model pricing since the cost API doesn't support `group_by api_key_id`. Key names resolved via `/v1/organizations/api_keys`. AES-256-GCM encrypted key storage, SWR caching with configurable TTL
- **Usage trends** — four live cards (today / this week / this month / last 7 days) comparing against the previous period **cut off at the same point in time** (yesterday up to this hour, last week up to this weekday+time, last month up to this day-of-month, clamped for shorter months), each with a delta badge, overlay sparkline and month-end projection. Below them five comparison charts on the same payload: 90-day volume with 7d/30d moving averages, cumulative month vs. previous month, week comparison Mon–Sun, project momentum (last 7 days vs. the 7 before) and model-mix shift as 100 % stacked bars. Independent of the period filter, honours the cache and token↔cost toggles
- **GitHub Integration** — SWR caching, billing with plan detection & percentages, code statistics (LOC by repo), PR Code Impact, Actions Usage by Repository, contribution heatmap
- **Tool Cost Attribution** — proportional cost/token distribution per tool, MCP server breakdown (auto-detected via `mcp__` prefix), sub-agent tracking (via `/subagents/` path), cost-over-time chart, enhanced table with Type/Cost/Tokens columns
- **Project Detail Dialog** — click any project in chart or table to open a detail modal with 6 KPIs (tokens, cost, sessions, messages, **active time**, net lines), daily token chart, model distribution doughnut, top tools, sessions list, and JSON export to clipboard. Every KPI carries a one-line explanation and opens a **methodology dialog** ("How these numbers are computed") covering the formulas, the 5-minute idle cap, the price source — and what is *not* counted
- **Per-project report (HTML + PDF)** — a standalone, print-optimised report per project: KPIs, cost split by component (including the 5-minute and 1-hour cache-write tiers), cost-over-time chart, model and session tables, and a methodology section so the document explains itself. No CDN, no chart library, charts are inline SVG — it survives being mailed around and printed. "PDF" is the browser's own print-to-PDF
- **Project search & merge** — live substring filter over the Projects table, plus non-destructive merging of projects that are the same codebase (renamed/moved or synced from another device under a different path) into one canonical name, with a 🪄 suggestions button that auto-detects likely duplicates from path names
- **Rate-Limit Tracking** — automatic detection of Claude Code rate-limit events from JSONL logs, daily aggregation, KPI card, backfill for historical data
- **Period navigation** — prev/next arrows beside date picker jump by selected period duration
- **Productivity tab** — Tokens/Min, Lines/Hour, Cost/Line, Cache Savings, Code Ratio with trend indicators
- **Period comparison** — inline pill selector (Off / Prev. Period / Last 7d / 30d / 90d / Custom) compares two periods side-by-side with 8 metrics, delta %, and color-coded indicators
- **HTML export** — mobile-responsive interactive snapshot with Chart.js, 8 tabs, 12+ charts, and sortable tables. Optimized for phones (412px+) with adaptive layouts
- **Global comparison** — compare your stats against the average of all users (multi-user mode)
- **1200 achievements** — gamification system across 14 categories with 5 tiers, tier-based points, timeline chart, daily unlock stats, and real-time unlock notifications via SSE
- **Lines of Code tracking** — Write (green), Edit (yellow), Delete (red) with adaptive hourly/daily chart
- **Usage heatmap** — weekday × hour grid in the overview showing token-usage intensity (rows Mon→Sun for multi-day ranges, a single 24-hour strip for one day), cache-toggle aware with per-cell tooltips
- **Weekday-aware dates** — chart axis labels and the period-range header show the weekday (e.g. `Sa 06-27`, `Thu 05/28/2026 – Sat 06/27/2026`)
- **Multi-device tracking** — track usage across multiple machines (MacBook, VPS, Desktop), per-device API keys, device switcher in dashboard, aggregated "All Devices" view, click-to-rename devices, OS-selectable install commands
- **Multi-user mode** — GitHub OAuth, per-user data isolation, Sync Agent with one-click install (macOS/Linux/Windows)
- **Token breakdown** — Input, Output, Cache Read, Cache Create with per-type API-equivalent cost estimation. Cache writes are billed by **TTL tier** (5 min = 1.25× input, 1 h = 2× input) — Claude Code writes overwhelmingly to the 1-hour cache, so a flat rate understates cost by ~8.5 %
- **Share API** — secure external API for sharing project-specific token usage data with clients. Share tokens (48-char hex, 192-bit entropy) expose sanitized project data (tokens, cost, sessions, code lines, daily breakdown) via public endpoints. Admin key authentication for share management, rate limiting (30 req/min/IP), CORS restrictions, and optional expiry. Used by [OPS](https://github.com/pepperonas/celox-ops) for customer transparency dashboards. Settings UI shows Share Admin Key with copy button.
- **Per-project report (HTML + PDF)** — a standalone, print-optimised report for any project: KPIs, cost split by component including both cache-write tiers, cost over time, model and session tables, and a methodology section so the document explains itself. No CDN and no chart library — charts are inline SVG, so it survives being mailed around and printed. "PDF" is the browser's own print-to-PDF
- **"How it adds up"** — every KPI carries a one-line explanation and opens a methodology dialog covering the formulas, the 5-minute idle cap, where prices come from, and what is deliberately *not* counted (web search, fast mode, US-only inference, the Batch discount, Bash-driven edits)
- **Accurate cache pricing** — cache writes are billed by TTL tier: 5 minutes at 1.25x input, **1 hour at 2x**. Claude Code writes overwhelmingly to the 1-hour cache, so a flat rate understates cost by ~8.5%
- **Database download** — download the full SQLite database from Settings for local backup or analysis
- **531 automated tests** — unit, integration, and multi-user API tests
- **Zero-framework frontend** — vanilla JS, 2 runtime dependencies, no build step

## Screenshots

| | |
|---|---|
| ![Overview](public/screenshots/01-overview.png) | ![Usage trends](public/screenshots/02-trends.png) |
| **Overview** — live sessions, KPI cards, token breakdown, active work time | **Usage trends** — today / week / month / rolling 7d vs. the previous period at the same point, plus the 90-day trend with moving averages |
| ![Trend charts](public/screenshots/03-trend-charts.png) | ![Sessions](public/screenshots/04-sessions.png) |
| **Trend comparisons** — cumulative month vs. previous month, week comparison, project momentum, model-mix shift | **Sessions** — sortable table with project, model, duration, active time, tokens, cost |
| ![Projects](public/screenshots/05-projects.png) | ![Tools](public/screenshots/06-tools.png) |
| **Projects** — per-project tokens and cost, live search, non-destructive merge | **Tools** — tool cost attribution, MCP server breakdown, sub-agent tracking |
| ![Models](public/screenshots/07-models.png) | ![Insights](public/screenshots/08-insights.png) |
| **Models** — model usage over time, per-model tokens and cost | **Insights** — cost breakdown, cumulative cost, weekday activity, cache efficiency |
| ![Productivity](public/screenshots/09-productivity.png) | ![Achievements](public/screenshots/10-achievements.png) |
| **Productivity** — efficiency metrics with period comparison | **Achievements** — 1200 achievements across 14 categories, unlocked with historical dates |

### Mobile (iPhone 16 — 393px)

| | | | | |
|---|---|---|---|---|
| ![Overview](public/screenshots/mobile-overview.png) | ![Trends](public/screenshots/mobile-trends.png) | ![Insights](public/screenshots/mobile-insights.png) | ![Productivity](public/screenshots/mobile-productivity.png) | ![Achievements](public/screenshots/mobile-achievements.png) |
| **Overview** | **Trends** | **Insights** | **Productivity** | **Achievements** |

## Architecture

```
~/.claude/projects/**/*.jsonl
    -> Parser (incremental byte-offset, dedup by message ID)
    -> SQLite (WAL mode, 10 tables)
    -> Aggregator (in-memory pre-computed maps)
    -> HTTP Server (50+ JSON endpoints + SSE)
    -> Frontend (Chart.js, vanilla JS, i18n DE/EN)
```

**Multi-user mode:**
```
Sync Agent (client) -> POST /api/sync (API key auth)
    -> Per-user SQLite storage
    -> AggregatorCache (lazy loaded, incremental sync, 30min eviction)
    -> GitHub OAuth sessions
```

**Share API (external integration):**
```
OPS -> POST /api/shares (admin key auth) -> project_shares table
Customer browser -> GET /api/public/share/:token -> sanitized project data
```

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js >= 20.12 (native HTTP server, no Express) |
| **Database** | SQLite via better-sqlite3 (WAL mode, transactions) |
| **Frontend** | Vanilla JS + HTML5 + CSS3 (no build step) |
| **Charts** | Chart.js 4.x |
| **File watching** | Chokidar 4.x |
| **Auth** | GitHub OAuth + HttpOnly session cookies |
| **Encryption** | AES-256-GCM (admin API keys) |
| **Testing** | Vitest + Supertest |
| **Linting** | ESLint 9 (flat config) |
| **CI** | GitHub Actions |

## Share API

### Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| GET /api/share-admin-key | Session | Get admin key + base URL (settings UI) |
| POST /api/share-admin-key | Session | Regenerate admin key |
| GET /api/shares | Admin Key / Session | List all shares |
| POST /api/shares | Admin Key / Session | Create share { project, label, expires_in_days } |
| DELETE /api/shares/:id | Admin Key / Session | Revoke a share |
| GET /api/shares/projects | Admin Key / Session | List projects with stats |
| GET /api/public/share/:token | Public | Get project data (rate limited) |

### Security

- Share tokens: 48-char hex (24 bytes / 192-bit cryptographic randomness)
- Admin key: 64-char hex, stored in .env, required for management endpoints
- Rate limiting: 30 requests/minute per IP on public endpoint
- CORS: restricted to configured origins (ops.celox.io, tracker.celox.io)
- No internal paths exposed, no project enumeration possible
- Optional expiry dates on share tokens

### Setup

```bash
# Add to .env
SHARE_ADMIN_KEY=your-64-char-hex-key
# Or generate in Settings -> Share API -> "Neu generieren"
```

### Integration with OPS

1. Open Token Tracker -> Settings -> Share API
2. Copy Tracker URL and Share Admin Key
3. Add to OPS .env: TOKEN_TRACKER_BASE_URL and TOKEN_TRACKER_ADMIN_KEY
4. In OPS: Edit customer -> "Projekt verknuepfen" -> select project
5. Customer detail page shows KI-Nutzung tab with charts, costs, and sessions

### Public Response Format

```json
{
  "label": "Project Label",
  "summary": { "total_cost", "total_sessions", "lines_written", "..." },
  "daily": [{ "date", "messages", "cost", "lines_written", "..." }],
  "sessions": [{ "start", "end", "duration_min", "cost", "model", "..." }]
}
```

## Data Continuity & Restore

`~/.claude/projects` JSONL is only a **rolling window** — Claude Code prunes old
session files, so the tracker's SQLite DB (`data/tracker.db`) is the long-term
store of the full history. Continuity across devices and reinstalls:

- **Hosted (multi-user)**: the sync agent pushes every message to the server;
  after a machine reset, install the sync agent with a device key from
  Settings and the same account keeps counting — old history stays intact.
- **Local backups**: set `BACKUP_PATH` (+ optional `BACKUP_INTERVAL_HOURS`) —
  atomic `VACUUM INTO` snapshots, auto-pruned to 10 copies.
- **Full local restore after a reset**: `bash scripts/restore-from-server.sh`
  pulls a consistent DB snapshot from the hosted server, swaps it in and
  restarts. Local JSONL is re-parsed on top (deduplicated by message id) and
  achievements recompute with historical dates automatically.

## Documentation

| Document | Contents |
|---|---|
| [docs/API.md](docs/API.md) | Every route, its authentication and its parameters |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Data flow, modules, and the decisions behind them |
| [docs/METRICS.md](docs/METRICS.md) | What every number means — and which definitions used to be wrong |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Every environment variable, and what is deliberately not configurable |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, ground rules, and how to add an achievement without shipping an impossible one |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [README_EN.md](README_EN.md) / [README_DE.md](README_DE.md) | Long-form manual, English and German |

## Links

- **Try it**: [tracker.celox.io](https://tracker.celox.io)
- **Author**: [Martin Pfeffer](https://celox.io) | [GitHub](https://github.com/pepperonas)
- **License**: [MIT](LICENSE)

---

<p align="center">
  <b>If you find this project useful, consider supporting its development:</b>
</p>

<p align="center">
  <a href="https://www.paypal.com/donate/?business=martinpaush@gmail.com&currency_code=EUR"><img src="https://img.shields.io/badge/Donate-PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white" alt="Donate via PayPal"></a>
</p>
