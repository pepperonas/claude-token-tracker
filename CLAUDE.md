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

No build step — vanilla JS frontend served directly from `public/`. Environment config via `.env` (see `.env.example`).

## Architecture

Dashboard that tracks Claude Code token usage. Pure Node.js HTTP server (no Express), SQLite database, vanilla JS frontend with Chart.js. Supports single-user (local) and multi-user (hosted) modes.

### Data Flow

**Single-user mode (default):**
```
~/.claude/projects/**/session.jsonl
    → lib/parser.js (incremental byte-offset parsing, dedup by message ID)
    → lib/db.js (SQLite with WAL mode, INSERT OR REPLACE)
    → lib/aggregator.js (in-memory stats, pre-computed on startup)
    → server.js (60+ JSON API endpoints + SSE live updates)
    → public/ (Chart.js charts, i18n DE/EN, cache toggle)
```

**Multi-user mode (`MULTI_USER=true`):**
```
sync-agent (client machine) → POST /api/sync (API key auth)
    → lib/db.js (per-user message storage with user_id)
    → lib/aggregator.js AggregatorCache (per-user, lazy loaded, incremental sync updates, 30min eviction)
    → server.js (GitHub OAuth + session cookies)
    → public/ (login overlay, user info, sync setup)
```

### Key Modules

- **`lib/parser.js`** — Reads JSONL files, extracts token counts/tools/model from `type: 'assistant'` messages and rate-limit events from `type: 'queue-operation'` with `content: '/rate-limit-options'`. Tracks byte offsets per file for incremental parsing. Deduplicates by `message.id` (last entry wins for streaming). Builds `toolCounts` map (`{ Read: 2, Write: 1 }`) for per-tool call counts (streaming merge via `Math.max`). Detects sub-agent messages via `/subagents/` in file path (`isSubagent` flag). Returns `{ messages, rateLimitEvents, newOffset }`.
- **`lib/aggregator.js`** — In-memory analytics engine. Maintains `_daily`, `_sessions`, `_projects`, `_models`, `_tools`, `_hourly`, `_rateLimits`, `_toolStats`, `_mcpServers`, `_subagentStats`, `_subagentDaily`, `_toolCostDaily` maps. All API data served from these pre-computed structures. Tool cost attribution: proportionally distributes message cost/tokens across tool calls (`costPerCall = cost / totalCalls`). `parseMcpTool(name)` categorizes tools as built-in vs MCP (via `mcp__server__tool` prefix). `computeActiveMinutes(timestamps, maxGapMin=5)` calculates actual working time by summing inter-message gaps capped at 5 min (distinguishes active coding from idle/waiting). Sessions track `_timestamps` array and expose `activeMin` field. Methods: `getToolStats(from, to)`, `getMcpServers(from, to)`, `getSubagentStats(from, to)`, `getToolCostDaily(from, to)`, `getProjectDetail(name, from, to)` (returns comprehensive project data: tokens, cost, sessions, lines, daily breakdown, model/tool breakdown, `totalActiveMin`). `addRateLimitEvents()` tracks rate-limit hits per day, `getRateLimits(from, to)` returns `{ total, daily }`. `AggregatorCache` class provides per-user lazy loading with 30min eviction for multi-user mode. Composite cache keys: `"userId:deviceId"` or `"userId:all"`. `addToUser(userId, messages, rateLimitEvents)` incrementally updates all cached aggregators for a user (avoids full rebuild, does NOT reset eviction timer — only user requests via `get()` keep cache alive). Max-age of 2h forces full DB rebuild even for active caches (guards against incremental drift). `invalidateUser(userId)` clears all entries for that user.
- **`lib/db.js`** — SQLite layer with `messages`, `message_tools`, `parse_state`, `metadata`, `users`, `user_sessions`, `achievements`, `github_cache`, `rate_limit_events`, `devices`, `project_shares` tables. `message_tools` has `call_count` column for per-tool call counts, `messages` has `is_subagent` and `device_id` columns, `rate_limit_events` has `device_id` column. All multi-row inserts use `db.transaction()`. Queries reconstruct `toolCounts` map via `GROUP_CONCAT(mt.call_count)`. User-scoped functions: `insertMessagesForUser()`, `getMessagesForUser()`. Rate-limit functions: `insertRateLimitEvents()`, `insertRateLimitEventsForUser()`, `getAllRateLimitEvents()`, `getRateLimitEventsForUser()`. Device functions: `createDevice()`, `getDevicesForUser()`, `findDeviceByApiKey()`, `getDeviceById()`, `renameDevice()`, `deleteDevice()`, `regenerateDeviceKey()`, `updateDeviceLastSync()`. Share functions: `createProjectShare(project, label, expiresInDays)` generates 48-char hex token, `getProjectShare(id)` with expiry check, `listProjectShares()`, `deleteProjectShare(id)`. Migration: `_migrateApiKeysToDevices()` moves legacy `users.api_key` to `devices` table on startup. **Indexes**: compound `idx_messages_user_device_ts(user_id, device_id, timestamp)` and `idx_rle_user_device_ts(user_id, device_id, timestamp)` for multi-user/device queries (created conditionally after column migrations), `idx_sessions_expires_at` for session cleanup, `idx_devices_user_created(user_id, created_at)` for sorted device lists.
- **`lib/auth.js`** — GitHub OAuth flow (server-side, native `https.request`), session management (`crypto.randomBytes` tokens, HttpOnly cookies, 30-day expiry), `authenticateRequest()` middleware. `authenticateApiKey()` returns `{ user, device }` — looks up device first via `findDeviceByApiKey`, falls back to legacy `findUserByApiKey`. Single-user mode returns DUMMY_USER.
- **`lib/pricing.js`** — Per-model pricing (input/output/cacheRead/cacheCreate per 1M tokens). Opus 4.5/4.6: $15/$75, Sonnet 4.5/4.6: $3/$15, Haiku 4.5: $0.80/$4. Unknown models fall back to Sonnet pricing.
- **`lib/watcher.js`** — Chokidar file watcher (no `awaitWriteFinish` — it blocks events on continuously written JSONL files). On file change: incremental parse → update aggregator → broadcast SSE (with userId filtering in multi-user mode). **Chokidar 4.x compat**: `ignored` uses a path-based function (not regex) — a dotfile regex would match `.claude` in the watched path and silently ignore all files.
- **`lib/achievements.js`** — 700 achievement definitions across 14 categories with 5 tiers. Tier-based points (Bronze: 10, Silver: 25, Gold: 50, Platinum: 100, Diamond: 250). `buildStats(agg)` computes comprehensive stats from aggregator. `checkAchievements()` inserts newly unlocked achievements and returns new keys. `getAchievementsByKeys(keys)` returns details for SSE notifications. `getAchievementsResponse()` returns all 700 with unlock status and point values. New achievements trigger `achievement-unlocked` SSE events with emoji/tier/points data, shown as animated slide-in popup in frontend. Categories: tokens, sessions, messages, cost, lines, models, tools, time, projects, streaks, cache, special, efficiency, ratelimits.
- **`lib/export-html.js`** — Generates self-contained interactive HTML export with Chart.js (CDN), 8 tabbed views (Overview, Charts, Sessions, Projects, Models, Tools, Productivity, Achievements), sortable tables, rate-limit KPI + daily chart. Tools tab includes cost/type columns from `toolStats` data. Mobile-responsive with breakpoints at 768px/480px/412px (S24 Ultra). Called by `GET /api/export-html`.
- **`lib/github.js`** — GitHub integration via GraphQL (contributions, repos, PRs) and REST (billing, actions usage, code frequency, languages). `cachedFetch()` with configurable TTL (`GITHUB_CACHE_TTL_MINUTES`, default 60) stores in `github_cache` SQLite table. Token resolution: per-user `github_token` in multi-user, `GITHUB_TOKEN` env var in single-user. `getActionsUsageByRepo()` iterates top 20 repos → workflows → timing endpoints with OS multipliers (Ubuntu 1x, macOS 10x, Windows 2x). PR stats include `codeByState` (additions/deletions per state) and `totalChangedFiles`. Billing detects plan (Pro if includedMinutes >= 3000) and includes storage quotas.
- **`lib/anthropic-api.js`** — Anthropic Admin API integration for organization usage/cost tracking. Follows `github.js` pattern exactly: `initAnthropicApi(db)`, SWR `cachedFetch()` reusing `github_cache` table with `anthropic-` key prefix, configurable TTL (`ANTHROPIC_CACHE_TTL_MINUTES`, default 60). `getDashboardData()` fetches 4 requests in parallel (usage by model, usage by api_key_id+model, cost report, API key names) and combines into aggregated dashboard data: daily costs/tokens by model, model breakdown, cache efficiency, plus per-API-key data (`keyBreakdown`, `keyTotals`, `dailyTokensByKey`). Key costs calculated via `lib/pricing.js` since cost endpoint doesn't support `group_by api_key_id`. `getApiKeyNamesDirect()` fetches key id→name mapping, cached separately (`anthropic-apikeys`). Token resolution: single-user checks `metadata` table (encrypted), then `ANTHROPIC_ADMIN_KEY` env var fallback; multi-user uses per-user `anthropic_key_encrypted` column. Keys encrypted with AES-256-GCM using `SESSION_SECRET`. Budget stored in `metadata` table.
- **`lib/plan-usage.js`** — Claude.ai plan usage limits (current session %, weekly all-models %, Sonnet-only %). OAuth token auto-detection: macOS Keychain (`security find-generic-password`) → `~/.config/claude/credentials.json` → encrypted metadata fallback. Fetches from unofficial `api.claude.ai/api/organizations/{org_id}/usage` endpoint (org ID via `/api/bootstrap`). 5-minute in-memory + metadata cache to respect rate limits. `_normalizeUsageResponse()` handles snake_case/camelCase variants. `storeSyncedPlanUsage()` accepts data from sync agent. Token encrypted with AES-256-GCM (reuses `anthropic-api.js` encryption).
- **`lib/backup.js`** — SQLite `VACUUM INTO` for atomic backups, auto-pruning to 10 copies. Safety check: rejects new backups that are <50% the size of the last backup to prevent saving corrupt/empty DBs.
- **`server.js`** — Vanilla `http.createServer`. Exports `startServer()` for test use. ~60 routes: auth (`/auth/*`), sync (`/api/sync`), sync-agent install (`/api/sync-agent/install.sh`), active sessions (`/api/active-sessions`), config (`/api/config`), GitHub endpoints (`/api/github/*`), Anthropic API endpoints (`/api/anthropic/*`), plan-usage endpoints (`/api/plan-usage`, `/api/plan-usage/token`, `/api/plan-usage/refresh`), rate-limits (`/api/rate-limits`), tool-stats (`/api/tool-stats`, `/api/mcp-servers`, `/api/subagent-stats`, `/api/tool-cost-daily`), device CRUD (`/api/devices`, `/api/devices/:id`, `/api/devices/:id/regenerate-key`), project-detail (`/api/project-detail?name=...`), share management (`/api/shares`, `/api/shares/projects`, `/api/share-admin-key` — admin key or session auth), public share (`/api/public/share/:token` — no auth, rate-limited 30 req/min/IP, CORS restricted to ops.celox.io/tracker.celox.io, global `_shareAggCache` with 5-min TTL avoids re-aggregating all messages per request), database download (`/api/download-db` — streams SQLite file), export-html, all analytics endpoints. Auth gate on `/api/*` in multi-user mode. `generateInstallScript()` embeds sync-agent files + config into a self-contained bash installer. Sync endpoint accepts optional `rateLimitEvents` array and `planUsage` object alongside `messages` (backwards-compatible), passes `deviceId` to insert functions. Uses `aggregatorCache.addToUser()` for incremental cache updates instead of full invalidation — prevents Event Loop blocking on large datasets. **Important**: the `addToUser()` message mapping must use `m.id` (not `m.uuid`) to match the sync agent's message format — using `m.uuid` causes all messages to deduplicate under `undefined`, losing all but the last message per sync batch. Analytics endpoints accept `?device=<id>` query parameter for per-device filtering. Achievement checks broadcast `achievement-unlocked` SSE events when new achievements are found.

### Sync Agent

Standalone CLI tool in `sync-agent/` directory (v0.1.0). Watches `~/.claude/projects/` on client machine and uploads token data + rate-limit events to the hosted server via `POST /api/sync` with API key auth. Has its own `package.json` (only `chokidar` dependency) and inline parser (no imports from main project). Event-based sync (~600ms latency), batches of max 500 messages, exponential backoff retry. Rate-limit events sent alongside messages in sync payload. Stability: `watcher.on('error')` handler for FSEvents errors, `unhandledRejection` guard, 30-minute heartbeat log, suppressed repeated plan-usage errors. **Chokidar 4.x compat**: `ignored` uses a path-based function (not regex) because Chokidar 4.x tests the full path — a dotfile regex like `/(^|[\/\\])\../` would match `.claude` in the watched path and silently ignore all files.

**Web-based install**: `GET /api/sync-agent/install.sh?key=API_KEY` (or `?key=API_KEY&device=ID`) returns a personalized shell script that installs the agent with pre-configured `config.json`, verifies server connectivity, and sets up autostart (launchd on macOS, systemd on Linux). Supports device-specific API keys. The script is generated server-side by `generateInstallScript()` which embeds `sync-agent/index.js` and `sync-agent/package.json` via heredocs. Windows: `GET /api/sync-agent/install.ps1?key=API_KEY`.

### Frontend

- **No framework** — vanilla DOM with `textContent` (no `innerHTML`)
- **State**: Single global `state` object (activeTab, period, includeCache, sessionFilter, multiUser, user, device, devices)
- **Auth flow**: `checkAuth()` on load → `/api/config` to detect mode → `/auth/me` to check session → show login overlay or dashboard
- **Cache toggle**: Cached tokens visible by default (shows real resource consumption). `getDisplayTokens()` / `getDisplayCost()` filter based on `state.includeCache`. Persisted in `localStorage`.
- **i18n**: `data-i18n` attributes on HTML elements, `t(key)` lookup function, translations in `public/js/i18n.js`
- **Charts**: Each chart function destroys the old instance before recreating (`chartInstances` map). Global `chartAnimateNext` flag disables animation on SSE-triggered updates (set to `false` before `loadTab()` in SSE handler).
- **Period navigation**: Prev/next arrow buttons beside the date picker jump by the selected period duration (1 day for today/custom, 7/30 days for those periods). Disabled for "All Time".
- **Active sessions**: `loadActiveSessions()` fetches `/api/active-sessions` and renders cards in overview tab. Sessions with `lastTs` within 10 minutes are shown.
- **Plan usage**: `loadPlanUsage()` fetches `/api/plan-usage` and renders 3 progress bars (session, weekly all-models, weekly Sonnet) in overview tab between active sessions and KPIs. Hidden when no OAuth token or data available. Refresh button clears server cache and re-fetches. Uses `_renderUsageBar()` with warn (≥70%) and danger (≥90%) color thresholds.
- **Achievements**: Timeline chart (bar+line) showing daily unlocks and cumulative points. Tier-based point values displayed on each card. Stats header shows total points and average achievements per day. Real-time unlock notification popup (bottom-right, slide-in animation, auto-dismiss 15s, closeable via X). Multiple achievements stack vertically. Triggered by `achievement-unlocked` SSE events.
- **Tools tab**: Tool Cost Attribution with proportional cost/token distribution per tool. KPI row (Unique Tools, Total Calls, Est. Cost, MCP Servers), 3 charts (Tool Usage bar, Tool Cost Attribution bar, Tool Cost Over Time stacked area), MCP server breakdown cards (auto-detected via `mcp__` prefix, conditionally shown), sub-agent tracking section (via `/subagents/` path, conditionally shown), enhanced 6-column table (Tool, Type, Calls, Est. Cost, Tokens, %). Fetches 5 endpoints in parallel.
- **GitHub tab**: Billing (plan badge, minutes/storage/packages with progress bars, OS breakdown doughnut), contribution heatmap, commit/language/PR charts, PR Code Impact (additions/deletions/net/changedFiles KPIs + grouped bar by state), Actions Usage by Repository (horizontal bar + workflow table), code frequency per repo, repo table. Period-filterable: contributions KPI, commits chart, code stats. Non-filterable sections (billing, actions usage, repos table) show `gh-period-hint` badges when a period filter is active via `_setGhPeriodHint()`.
- **Project detail dialog**: Click any project in chart or table to open a modal with 6 KPIs (tokens, cost, sessions, messages, active time, net lines), daily tokens stacked bar chart, model distribution doughnut, top tools as tag pills, sessions table. JSON export to clipboard. `openProjectDetail()` fetches `/api/project-detail`, `closeProjectDetail()` via Escape/overlay click.
- **Claude API tab**: Anthropic Admin API usage/cost dashboard. Setup card when no key, budget feature (stored in metadata), 4 KPIs (total cost, tokens, avg cost/day, cache efficiency), 4 charts (daily costs stacked by model, daily tokens stacked by type, model doughnut, cumulative cost trend line), model table. Per-API-key section: horizontal stacked bar chart (cost per key by model), key table (tokens, input, output, cache %, calculated cost, last used), key timeline (stacked area chart, only shown when >1 key). Period filtering on daily data. Follows `loadGithub()` pattern with SWR cache + smooth refresh.
- **Device switcher**: Dropdown beside period filter to switch between devices or "All Devices" (aggregated). Hidden when ≤1 device. Device management in Settings: add/rename/delete devices, regenerate keys, show install command with OS auto-detection (`detectSyncOs()`). Device selection persisted in `localStorage`.
- **Tab persistence**: Active tab saved to `localStorage`, restored on page reload.
- **Mobile-responsive**: CSS breakpoints at 900px, 600px, 480px, 393px. Touch targets (44px min), hidden tab scrollbar with scroll mask, adaptive chart heights via `!important` overrides on `.chart-container`. `isMobile()` / `isNarrow()` helpers in `charts.js` adjust font sizes, point radii, label truncation, and legend visibility. Debounced `window.resize` handler calls `.resize()` on all `chartInstances`.

## Multi-User Mode

Activated by setting `MULTI_USER=true` in `.env`. Requires:
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth App credentials
- `SESSION_SECRET` — random secret used for AES-256-GCM encryption of Anthropic admin keys in DB
- `BASE_URL` — public URL (e.g. `https://tracker.celox.io`)

Key differences from single-user:
- File watcher disabled (data comes via sync agent)
- All `/api/*` routes require session cookie auth
- Per-user data isolation via `user_id` column on messages
- Per-device isolation via `device_id` column on messages and rate_limit_events
- `AggregatorCache` provides per-user, per-device aggregator instances with incremental updates
- Global aggregator skipped at startup (no unnecessary load of all messages)
- Multi-device support: each device gets its own API key, install command, and sync agent
- Login overlay shown until GitHub OAuth completes
- Stats-cache endpoint disabled (no local `.claude/` directory)

## Local (MacBook)

LaunchAgent `io.celox.token-tracker` runs the local dashboard on port 5010:
- `RunAtLoad: true` + `KeepAlive: true` — survives reboots and crashes
- Plist: `~/Library/LaunchAgents/io.celox.token-tracker.plist`
- Logs: `stdout.log` / `stderr.log` in project directory
- Dashboard: http://localhost:5010

## Deployment

VPS deployment to tracker.celox.io:
- Port: 3007, PM2 process: `token-tracker` (started with `--node-args='--env-file=.env'`)
- Nginx reverse proxy with SSL (certbot)
- `scripts/deploy.sh` handles rsync + npm ci + PM2 restart

## TODO

- **Plan Usage Limits**: `lib/plan-usage.js` and sync-agent support fetching claude.ai plan usage (session %, weekly all-models %, Sonnet-only %) — frontend section in Overview tab ready but hidden. Currently blocked: Claude Code OAuth token (`sk-ant-oat01-*`) lacks scopes for claude.ai web API (`/api/organizations/{org_id}/usage`). Needs official Anthropic Usage API endpoint or web-session-based auth. Code is in place and will activate automatically once a working token/endpoint is available.

## Conventions

- **CommonJS** throughout backend (`require`/`module.exports`)
- **Timestamps**: ISO 8601 strings, dates as `YYYY-MM-DD` sliced from timestamps
- **Token counts**: Always integers, default 0
- **Costs**: Rounded to 2 decimals
- **Unused variables**: Prefix with `_` (ESLint configured for this)
- **German text**: Use proper umlauts (ü, ö, ä, ß), never ASCII substitutes (ue, oe, ae, ss)
- **Tests**: Use vitest globals (no imports needed), temp dirs via `fs.mkdtempSync()`, API tests spawn server on random port. Multi-user tests set `MULTI_USER=true` in env and clear require cache.
- **ESLint**: Flat config (ESLint 9), only covers `lib/` and `server.js`
