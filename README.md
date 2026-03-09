<p align="center">
  <img src="public/og-image.png" alt="Claude Token Tracker" width="720">
</p>

<h1 align="center">Claude Token Tracker</h1>

<p align="center">
  Real-time dashboard for Claude Code token usage, API-equivalent cost estimation, and coding activity tracking.
</p>

<p align="center">
  <a href="https://github.com/pepperonas/claude-token-tracker/actions/workflows/ci.yml"><img src="https://github.com/pepperonas/claude-token-tracker/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://github.com/pepperonas/claude-token-tracker/releases"><img src="https://img.shields.io/badge/version-0.1.0-orange.svg" alt="Version"></a>
  <a href="https://github.com/pepperonas/claude-token-tracker/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
  <a href="https://tracker.celox.io"><img src="https://img.shields.io/badge/demo-tracker.celox.io-blue?logo=googlechrome&logoColor=white" alt="Live Demo"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white" alt="Node.js >= 18">
  <img src="https://img.shields.io/badge/SQLite-WAL_Mode-003B57?logo=sqlite&logoColor=white" alt="SQLite WAL">
  <img src="https://img.shields.io/badge/Chart.js-4.x-FF6384?logo=chartdotjs&logoColor=white" alt="Chart.js">
  <img src="https://img.shields.io/badge/Vitest-151_tests-6E9F18?logo=vitest&logoColor=white" alt="Tests">
  <img src="https://img.shields.io/badge/ESLint-9.x-4B32C3?logo=eslint&logoColor=white" alt="ESLint">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/HTML5-Vanilla-E34F26?logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-Responsive-1572B6?logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/SSE-Real--time-FF6600?logo=lightning&logoColor=white" alt="SSE">
  <img src="https://img.shields.io/badge/i18n-DE%20%7C%20EN-lightgrey" alt="i18n">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey?logo=apple&logoColor=white" alt="Platform">
  <img src="https://img.shields.io/badge/deps-2_runtime-success" alt="Dependencies">
  <img src="https://img.shields.io/badge/no_framework-vanilla_JS-yellow" alt="No Framework">
  <img src="https://img.shields.io/badge/API-50+_endpoints-blue" alt="API Endpoints">
  <img src="https://img.shields.io/badge/LOC-17k+-informational" alt="Lines of Code">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/GitHub_OAuth-supported-181717?logo=github&logoColor=white" alt="GitHub OAuth">
  <img src="https://img.shields.io/badge/Anthropic_API-integrated-D4A574?logo=anthropic&logoColor=white" alt="Anthropic API">
  <img src="https://img.shields.io/badge/GitHub_GraphQL-contributions-181717?logo=graphql&logoColor=white" alt="GitHub GraphQL">
  <img src="https://img.shields.io/badge/AES--256--GCM-encrypted-critical" alt="Encryption">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/achievements-700-blueviolet?logo=trophy&logoColor=white" alt="700 Achievements">
  <img src="https://img.shields.io/badge/categories-14-9cf" alt="14 Categories">
  <img src="https://img.shields.io/badge/tiers-5_(Bronze→Diamond)-gold" alt="5 Tiers">
  <img src="https://img.shields.io/badge/charts-25+-FF6384?logo=chartdotjs&logoColor=white" alt="20+ Charts">
  <img src="https://img.shields.io/badge/tabs-10-informational" alt="10 Tabs">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/sync_agent-included-success?logo=upload&logoColor=white" alt="Sync Agent">
  <img src="https://img.shields.io/badge/PM2-production_ready-2B037A?logo=pm2&logoColor=white" alt="PM2">
  <img src="https://img.shields.io/badge/Nginx-reverse_proxy-009639?logo=nginx&logoColor=white" alt="Nginx">
  <img src="https://img.shields.io/badge/Chokidar-4.x-orange?logo=files&logoColor=white" alt="Chokidar">
  <img src="https://img.shields.io/badge/mobile-responsive_(393px+)-purple?logo=smartphone&logoColor=white" alt="Mobile Responsive">
</p>

<p align="center">
  <a href="https://www.paypal.com/donate/?business=martinpaush@gmail.com&currency_code=EUR"><img src="https://img.shields.io/badge/Sponsor_this_project-PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white" alt="Donate via PayPal"></a>
</p>

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

- **25+ interactive charts** across 10 tabs with real-time SSE updates
- **Claude API tab** — Anthropic Admin API usage/cost dashboard: budget tracking with progress bar, 4 KPIs (total cost, tokens, avg cost/day, cache efficiency), daily cost/token charts by model, model distribution doughnut, cumulative cost trend. **Per-API-key breakdown**: horizontal stacked bar chart showing cost per key by model, daily cost timeline per key, key comparison table (tokens, input, output, cache %, calculated cost, last used), token history timeline (stacked area). Costs per key calculated via model pricing since the cost API doesn't support `group_by api_key_id`. Key names resolved via `/v1/organizations/api_keys`. AES-256-GCM encrypted key storage, SWR caching with configurable TTL
- **GitHub Integration** — SWR caching, billing with plan detection & percentages, code statistics (LOC by repo), PR Code Impact, Actions Usage by Repository, contribution heatmap
- **Tool Cost Attribution** — proportional cost/token distribution per tool, MCP server breakdown (auto-detected via `mcp__` prefix), sub-agent tracking (via `/subagents/` path), cost-over-time chart, enhanced table with Type/Cost/Tokens columns
- **Rate-Limit Tracking** — automatic detection of Claude Code rate-limit events from JSONL logs, daily aggregation, KPI card, backfill for historical data
- **Period navigation** — prev/next arrows beside date picker jump by selected period duration
- **Productivity tab** — Tokens/Min, Lines/Hour, Cost/Line, Cache Savings, Code Ratio with trend indicators
- **Period comparison** — inline pill selector (Off / Prev. Period / Last 7d / 30d / 90d / Custom) compares two periods side-by-side with 8 metrics, delta %, and color-coded indicators
- **HTML export** — mobile-responsive interactive snapshot with Chart.js, 8 tabs, 12+ charts, and sortable tables. Optimized for phones (412px+) with adaptive layouts
- **Global comparison** — compare your stats against the average of all users (multi-user mode)
- **700 achievements** — gamification system across 14 categories with 5 tiers, tier-based points, timeline chart, daily unlock stats, and real-time unlock notifications via SSE
- **Lines of Code tracking** — Write (green), Edit (yellow), Delete (red) with adaptive hourly/daily chart
- **Multi-user mode** — GitHub OAuth, per-user data isolation, Sync Agent with one-click install (macOS/Linux/Windows)
- **Token breakdown** — Input, Output, Cache Read, Cache Create with per-type API-equivalent cost estimation
- **151 automated tests** — unit, integration, and multi-user API tests
- **Zero-framework frontend** — vanilla JS, 2 runtime dependencies, no build step

## Screenshots

| | |
|---|---|
| ![Overview](public/screenshots/01-overview.png) | ![Sessions](public/screenshots/02-sessions.png) |
| **Overview** — KPI cards, token breakdown, lines of code, daily charts | **Sessions** — sortable table with project, model, duration, tokens, cost |
| ![Projects](public/screenshots/03-projects.png) | ![Tools](public/screenshots/04-tools.png) |
| **Projects** — per-project statistics and cost breakdown | **Tools** — tool cost attribution, MCP server breakdown, sub-agent tracking |
| ![Models](public/screenshots/05-models.png) | ![Insights](public/screenshots/06-insights.png) |
| **Models** — model usage, daily tokens by model, cost breakdown | **Insights** — cache efficiency, stop reasons, lines of code chart |
| ![Productivity](public/screenshots/07-productivity.png) | ![Achievements](public/screenshots/08-achievements.png) |
| **Productivity** — efficiency metrics with period comparison | **Achievements** — 700 achievements across 14 categories with 5 tiers |

### Mobile (iPhone 16 — 393px)

| | | | |
|---|---|---|---|
| ![Overview](public/screenshots/mobile-overview.png) | ![Insights](public/screenshots/mobile-insights.png) | ![Productivity](public/screenshots/mobile-productivity.png) | ![Achievements](public/screenshots/mobile-achievements.png) |
| **Overview** | **Insights** | **Productivity** | **Achievements** |

## Architecture

```
~/.claude/projects/**/*.jsonl
    -> Parser (incremental byte-offset, dedup by message ID)
    -> SQLite (WAL mode, 8 tables)
    -> Aggregator (in-memory pre-computed maps)
    -> HTTP Server (50+ JSON endpoints + SSE)
    -> Frontend (Chart.js, vanilla JS, i18n DE/EN)
```

**Multi-user mode:**
```
Sync Agent (client) -> POST /api/sync (API key auth)
    -> Per-user SQLite storage
    -> AggregatorCache (lazy loaded, 30min eviction)
    -> GitHub OAuth sessions
```

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js >= 18 (native HTTP server, no Express) |
| **Database** | SQLite via better-sqlite3 (WAL mode, transactions) |
| **Frontend** | Vanilla JS + HTML5 + CSS3 (no build step) |
| **Charts** | Chart.js 4.x |
| **File watching** | Chokidar 4.x |
| **Auth** | GitHub OAuth + HttpOnly session cookies |
| **Encryption** | AES-256-GCM (admin API keys) |
| **Testing** | Vitest + Supertest |
| **Linting** | ESLint 9 (flat config) |
| **CI** | GitHub Actions |

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
