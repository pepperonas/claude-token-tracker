# Changelog

## [0.1.0] - 2026-06-25

### Added
- **Project search** — pill-shaped live substring filter above the Projects table with an `aria-live` result count, clear button, and Escape-to-reset; filters the table only (the top-15 chart stays a stable overview) and persists across period changes. New `data-i18n-placeholder` support in `applyTranslations()`
- **Project merge** — fold projects that are the same codebase (renamed/moved, or synced from another device under a different path) into one canonical name. Non-destructive (originals untouched in the DB) and applied at the aggregator's single `_addMessage` choke-point, so the merge folds existing **and** future messages across all views and survives re-parses/syncs; un-merge restores the original split. New `project_aliases` table, `GET /api/project-aliases`, `POST /api/project-merge`, `DELETE /api/project-aliases`, a merge dialog with checkbox sources + target select + active-merges list, and a "+n merged" badge on combined projects
- **Merge suggestions** — 🪄 button (auto-surfaced when candidates exist) that detects likely-duplicate projects by bucketing on an identity key = path minus its device/tool root segment (`claude/mrxdown` ≡ `WebstormProjects/mrxdown`); discrete buckets, capped at 2–6, no false-merging of names that only share a leaf word
- **Material 3 Expressive motion system** for the dashboard frontend (spring/emphasized easings, staggered card entrance, directional tab transitions, cursor-reactive KPI tilt, value-pop, progressive-enhancement + reduced-motion guards)

### Security
- Project-merge aliases are strictly **per-user scoped**; the cross-user share aggregator applies no alias map, preventing cross-tenant project-name poisoning. The merge endpoint validates that every source/target is a project the requesting user actually owns

### Changed
- CI test matrix and `engines` floor bumped to **Node ≥ 20.12** (vitest 4 imports `util.styleText`, unavailable on Node 18)

### Tests
- Test suite expanded to **211** (added `project-merge`, `export-html`, `anthropic-api` crypto, and `config` coverage)

## [0.0.5] - 2026-02-26

### Added
- **Period Navigation Buttons** — prev/next arrow buttons beside the date picker, jump by the currently selected period duration (1 day, 7 days, 30 days)
- **Achievements Points System** — tier-based point values (Bronze: 10, Silver: 25, Gold: 50, Platinum: 100, Diamond: 250), displayed on each achievement card and as a total score
- **Achievements Timeline Chart** — bar+line chart showing achievements unlocked per day with cumulative points curve
- **Achievements Stats** — total points counter and average achievements per day metric in the achievements header
- 5 new i18n keys in both EN and DE (achievementsPoints, achievementsAvgPerDay, achievementsTimeline, achievementsUnlockedCount, achievementsCumulativePoints)

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
