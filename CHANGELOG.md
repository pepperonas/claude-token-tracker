# Changelog

## [0.0.4] - 2026-02-24

### Added
- **Period-over-Period Comparison** in the Productivity tab — compare any two time periods side-by-side
  - "Compare Periods" toggle button activates the comparison section
  - Period B selector: Previous (auto-computed same-length preceding window), 7d, 30d, 90d, or Custom date range
  - 8 comparison metrics: Tokens/Min, Lines/Hour, Cost/Line, Tokens/Line, Lines/Turn, Tools/Turn, I/O Ratio, Coding Hours
  - Visual comparison cards with dual bar charts (Period A blue, Period B grey)
  - Delta percentage with color-coded indicators (green = improvement, red = regression)
  - Respects "lower is better" semantics for Cost/Line and Tokens/Line
  - Hint text below each metric shows whether higher or lower is better
  - Period labels show exact date ranges for both periods
  - State persisted in localStorage (active period B selection, custom date range)
  - Automatically recalculates when global period selector changes
  - Reuses existing `/api/productivity` endpoint (no backend changes needed)
- 11 new i18n keys in both EN and DE (periodComparison, compareToggle, compareTo, previousPeriod, periodA, periodB, improvement, regression, noChange, betterLower, betterHigher)
- 2 new aggregator tests for period-isolated productivity data
- ~100 lines of CSS for comparison section, Period B selector, delta indicators

### Changed
- Test count: 146 → 148 (2 new aggregator tests)

## [0.1.0] - 2026-02-23

### Added
- Multi-user mode with GitHub OAuth login (`MULTI_USER=true`)
- Per-user data isolation (user_id on messages, user-scoped aggregator cache)
- `users` and `user_sessions` database tables
- `lib/auth.js` — GitHub OAuth flow, session management, cookie-based auth
- `AggregatorCache` class — per-user lazy loading with 30min eviction
- Sync Agent CLI (`sync-agent/`) — standalone tool to upload token data from client to server
- `POST /api/sync` endpoint with API key authentication
- `GET/POST /api/sync-key` for API key management
- `GET /api/config` endpoint (tells frontend about multi-user mode)
- Login overlay with GitHub sign-in button
- User avatar and name in header with logout button
- Sync Agent setup section in Info tab (API key display, installation instructions)
- `scripts/deploy.sh` for VPS deployment (tracker.celox.io)
- SSE broadcast filtering by userId in multi-user mode
- 25 new tests: auth (13), sync (4), multi-user isolation (3), aggregator cache (5)
- New i18n keys for login, logout, sync setup (DE + EN)

### Changed
- Server routes refactored: auth gate on `/api/*` in multi-user mode
- Static files served before auth check (login page needs CSS/JS)
- File watcher disabled in multi-user mode (data comes via sync agent)
- Stats-cache endpoint returns 404 in multi-user mode

## [0.0.1] - 2026-02-23

### Added
- Initial release
- Token usage dashboard with 5 tabs (Overview, Sessions, Projects, Tools, Models)
- Real-time updates via SSE
- Bilingual UI (German/English)
- 7 chart types (daily tokens, daily cost, model distribution, hourly activity, project bar, tool bar, model area)
- API-equivalent cost calculation for all Claude models
- Incremental JSONL parsing with file watcher
- SQLite database for persistent storage
- Automatic backup system with configurable schedule
- Insights tab with 6 additional charts
- CSS-only tooltips with bilingual explanations
- CI/CD pipeline with GitHub Actions
- Comprehensive test suite (vitest + supertest)
