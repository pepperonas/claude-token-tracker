# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                # Start server on port 5010
npm test                 # Run all tests (vitest)
npm run test:watch       # Tests in watch mode
npm run test:coverage    # Coverage report
npm run lint             # ESLint (lib/ + server.js only)
npx vitest run test/parser.test.js  # Run a single test file
bash scripts/deploy.sh   # Deploy to VPS (tracker.celox.io)
```

No build step — vanilla JS frontend served directly from `public/`.

## Architecture

Dashboard that tracks Claude Code token usage. Pure Node.js HTTP server (no Express), SQLite database, vanilla JS frontend with Chart.js. Supports single-user (local) and multi-user (hosted) modes.

### Data Flow

**Single-user mode (default):**
```
~/.claude/projects/**/session.jsonl
    → lib/parser.js (incremental byte-offset parsing, dedup by message ID)
    → lib/db.js (SQLite with WAL mode, INSERT OR REPLACE)
    → lib/aggregator.js (in-memory stats, pre-computed on startup)
    → server.js (25+ JSON API endpoints + SSE live updates)
    → public/ (Chart.js charts, i18n DE/EN, cache toggle)
```

**Multi-user mode (`MULTI_USER=true`):**
```
sync-agent (client machine) → POST /api/sync (API key auth)
    → lib/db.js (per-user message storage with user_id)
    → lib/aggregator.js AggregatorCache (per-user, lazy loaded, 30min eviction)
    → server.js (GitHub OAuth + session cookies)
    → public/ (login overlay, user info, sync setup)
```

### Key Modules

- **`lib/parser.js`** — Reads JSONL files, extracts token counts/tools/model from `type: 'assistant'` messages. Tracks byte offsets per file for incremental parsing. Deduplicates by `message.id` (last entry wins for streaming).
- **`lib/aggregator.js`** — In-memory analytics engine. Maintains `_daily`, `_sessions`, `_projects`, `_models`, `_tools`, `_hourly` maps. All API data served from these pre-computed structures. `AggregatorCache` class provides per-user lazy loading with 30min eviction for multi-user mode.
- **`lib/db.js`** — SQLite layer with `messages`, `message_tools`, `parse_state`, `metadata`, `users`, `user_sessions` tables. All multi-row inserts use `db.transaction()`. User-scoped functions: `insertMessagesForUser()`, `getMessagesForUser()`.
- **`lib/auth.js`** — GitHub OAuth flow (server-side, native `https.request`), session management (`crypto.randomBytes` tokens, HttpOnly cookies, 30-day expiry), `authenticateRequest()` middleware. Single-user mode returns DUMMY_USER.
- **`lib/pricing.js`** — Per-model pricing (input/output/cacheRead/cacheCreate per 1M tokens). Unknown models fall back to Sonnet 4.5 pricing.
- **`lib/watcher.js`** — Chokidar file watcher with `awaitWriteFinish` debouncing. On file change: incremental parse → update aggregator → broadcast SSE (with userId filtering in multi-user mode).
- **`lib/achievements.js`** — 500 achievement definitions across 12 categories with 5 tiers. Tier-based points (Bronze: 10, Silver: 25, Gold: 50, Platinum: 100, Diamond: 250). `buildStats(agg)` computes comprehensive stats from aggregator. `checkAchievements()` inserts newly unlocked achievements. `getAchievementsResponse()` returns all 500 with unlock status and point values.
- **`lib/export-html.js`** — Generates self-contained HTML export with inline dark-theme CSS. Contains KPI cards, CSS-only bar chart, sessions/projects/models tables. Called by `GET /api/export-html`.
- **`lib/github.js`** — GitHub integration via GraphQL (contributions, repos, PRs) and REST (billing, actions usage, code frequency, languages). `cachedFetch()` with configurable TTL (`GITHUB_CACHE_TTL_MINUTES`, default 15) stores in `github_cache` SQLite table. Token resolution: per-user `github_token` in multi-user, `GITHUB_TOKEN` env var in single-user. `getActionsUsageByRepo()` iterates top 20 repos → workflows → timing endpoints with OS multipliers (Ubuntu 1x, macOS 10x, Windows 2x). PR stats include `codeByState` (additions/deletions per state) and `totalChangedFiles`. Billing detects plan (Pro if includedMinutes >= 3000) and includes storage quotas.
- **`lib/backup.js`** — SQLite `VACUUM INTO` for atomic backups, auto-pruning to 10 copies.
- **`server.js`** — Vanilla `http.createServer`. Exports `startServer()` for test use. Routes: auth (`/auth/*`), sync (`/api/sync`), sync-agent install (`/api/sync-agent/install.sh`), active sessions (`/api/active-sessions`), config (`/api/config`), GitHub endpoints (`/api/github/*`), all analytics endpoints. Auth gate on `/api/*` in multi-user mode. `generateInstallScript()` embeds sync-agent files + config into a self-contained bash installer.

### Sync Agent

Standalone CLI tool in `sync-agent/` directory. Watches `~/.claude/projects/` on client machine and uploads token data to the hosted server via `POST /api/sync` with API key auth. Has its own `package.json` (only `chokidar` dependency) and inline parser (no imports from main project). Event-based sync (~600ms latency), batches of max 500 messages, exponential backoff retry.

**Web-based install**: `GET /api/sync-agent/install.sh?key=API_KEY` returns a personalized shell script that installs the agent with pre-configured `config.json`, verifies server connectivity, and sets up autostart (launchd on macOS, systemd on Linux). The script is generated server-side by `generateInstallScript()` which embeds `sync-agent/index.js` and `sync-agent/package.json` via heredocs.

### Frontend

- **No framework** — vanilla DOM with `textContent` (no `innerHTML`)
- **State**: Single global `state` object (activeTab, period, includeCache, sessionFilter, multiUser, user)
- **Auth flow**: `checkAuth()` on load → `/api/config` to detect mode → `/auth/me` to check session → show login overlay or dashboard
- **Cache toggle**: Cached tokens visible by default (shows real resource consumption). `getDisplayTokens()` / `getDisplayCost()` filter based on `state.includeCache`. Persisted in `localStorage`.
- **i18n**: `data-i18n` attributes on HTML elements, `t(key)` lookup function, translations in `public/js/i18n.js`
- **Charts**: Each chart function destroys the old instance before recreating (`chartInstances` map). Global `chartAnimateNext` flag disables animation on SSE-triggered updates (set to `false` before `loadTab()` in SSE handler).
- **Period navigation**: Prev/next arrow buttons beside the date picker jump by the selected period duration (1 day for today/custom, 7/30 days for those periods). Disabled for "All Time".
- **Active sessions**: `loadActiveSessions()` fetches `/api/active-sessions` and renders cards in overview tab. Sessions with `lastTs` within 10 minutes are shown.
- **Achievements**: Timeline chart (bar+line) showing daily unlocks and cumulative points. Tier-based point values displayed on each card. Stats header shows total points and average achievements per day.
- **GitHub tab**: Billing (plan badge, minutes/storage/packages with progress bars, OS breakdown doughnut), contribution heatmap, commit/language/PR charts, PR Code Impact (additions/deletions/net/changedFiles KPIs + grouped bar by state), Actions Usage by Repository (horizontal bar + workflow table), code frequency per repo, repo table.
- **Tab persistence**: Active tab saved to `localStorage`, restored on page reload.
- **Mobile-responsive**: CSS breakpoints at 900px, 600px, 480px, 393px. Touch targets (44px min), hidden tab scrollbar with scroll mask, adaptive chart heights via `!important` overrides on `.chart-container`. `isMobile()` / `isNarrow()` helpers in `charts.js` adjust font sizes, point radii, label truncation, and legend visibility. Debounced `window.resize` handler calls `.resize()` on all `chartInstances`.

## Multi-User Mode

Activated by setting `MULTI_USER=true` in `.env`. Requires:
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth App credentials
- `SESSION_SECRET` — random secret for session tokens (currently unused, reserved)
- `BASE_URL` — public URL (e.g. `https://tracker.celox.io`)

Key differences from single-user:
- File watcher disabled (data comes via sync agent)
- All `/api/*` routes require session cookie auth
- Per-user data isolation via `user_id` column on messages
- `AggregatorCache` provides per-user aggregator instances
- Login overlay shown until GitHub OAuth completes
- Stats-cache endpoint disabled (no local `.claude/` directory)

## Deployment

VPS deployment to tracker.celox.io (69.62.121.168):
- Port: 3007, PM2 process: `token-tracker` (started with `--node-args='--env-file=.env'`)
- Nginx reverse proxy with SSL (certbot)
- `scripts/deploy.sh` handles rsync + npm ci + PM2 restart

## Conventions

- **CommonJS** throughout backend (`require`/`module.exports`)
- **Timestamps**: ISO 8601 strings, dates as `YYYY-MM-DD` sliced from timestamps
- **Token counts**: Always integers, default 0
- **Costs**: Rounded to 2 decimals
- **Unused variables**: Prefix with `_` (ESLint configured for this)
- **German text**: Use proper umlauts (ü, ö, ä, ß), never ASCII substitutes (ue, oe, ae, ss)
- **Tests**: Use vitest globals (no imports needed), temp dirs via `fs.mkdtempSync()`, API tests spawn server on random port. Multi-user tests set `MULTI_USER=true` in env and clear require cache.
- **ESLint**: Flat config (ESLint 9), only covers `lib/` and `server.js`
