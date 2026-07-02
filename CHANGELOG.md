# Changelog

## [Unreleased] - 2026-07-02

### Fixed
- **Live refreshes no longer re-render/flicker the whole GUI** — only the KPI numbers animate now. Three sources eliminated: (1) charts were destroyed + recreated on every refresh (blank-canvas flash) — `renderChart()` now updates existing instances in place (`chart.data`/`chart.options` swap + `update('none')`, all 40 chart creators converted; legend-visibility restore made idempotent for doughnuts so in-place updates don't un-hide slices); (2) the usage heatmap rebuilt all its DOM cells per refresh — same-shape renders now update cell colours/titles in place (the entrance wave still plays on first paint and single-day ↔ multi-day shape changes); (3) `loadActiveSessions`/`loadPlanUsage`/`loadGlobalComparison` were fire-and-forget, so their DOM updates landed *after* the SSE handler removed `motion-quiet` and replayed entrance animations — `loadOverview` now awaits them (still parallel)

### Performance
- **4–10× faster API endpoints** (measured with 144k messages): per-message derived values (`_date`, `_ms`, `_hour`, `_day`, `_cost`, `_pricing`) are now computed once in `_applyDelta` (the single choke point) and cached on the message object — period-filtered queries no longer allocate a `Date` and re-resolve pricing per message per request. Overview all-time 140ms → 15ms, productivity 186ms → 32ms (30d), chart endpoints 45–66ms → 5–17ms
- `computeActiveMinutes` works on numeric epoch-ms timestamps (sessions store `_timestamps` as numbers) — eliminates two `Date` allocations per gap (~288k per overview request before)
- `getOverview` derives the per-type cost breakdown from the precomputed per-day sums instead of its own full message scan
- **ETag + `Cache-Control: must-revalidate` for static assets** — browser reloads revalidate (304, 0 bytes) instead of re-downloading ~640KB of JS/CSS

### Added
- **Token ↔ Cost toggle for the overview charts** — a pill toggle above the charts switches the daily chart (stacked by input/output/cache-read/cache-create), model doughnut, hourly chart, and usage heatmap between token counts and dollars. Persisted in `localStorage` (`metricMode`), survives reloads, works for single-day and multi-day ranges, respects the cache toggle, localized DE/EN, covered by demo data. New backend fields: per-day cost breakdown on `/api/daily`, `costNoCache` + `maxCost`/`maxCostNoCache` on `/api/hourly-weekday`
- **Time-aware pricing (`PRICING_EPOCHS`)** — `calculateCost(model, usage, timestamp)` resolves time-windowed prices per model, so past messages permanently keep the price that was in effect when they were sent (the live LiteLLM feed only knows the *current* price). First real epoch: Sonnet 5 introductory pricing ($2/$10 per MTok through 2026-08-31, then $3/$15). Aggregator call sites pass the message object, whose own `timestamp` makes every cost calculation time-aware automatically. Epochs are exposed in `GET /api/pricing`

### Fixed
- Per-component cost breakdowns (hourly chart, insights, project detail) used the hard-coded `PRICING` table with a Sonnet-price fallback, ignoring live LiteLLM overrides — now resolved via `getPricing(model, timestamp)` everywhere

### Tests
- Test suite expanded to **238** (9 new: pricing-epoch resolution incl. override precedence and timestamp fallback, per-day cost-breakdown sum, heatmap cost cells/maxima, time-aware heatmap cost)

## [Unreleased] - 2026-07-01

### Fixed
- **New-model label derivation** — `_deriveLabel` now handles the newest ID shapes: single-digit versions with no minor (`claude-sonnet-5` → "Sonnet 5"), a brand-new family (`claude-fable-5` → "Fable 5"), and dated base IDs whose release-date suffix was being misread as a minor version (`claude-opus-4-20250514` → "Opus 4", was "Opus 4.20250514"). Model **costs** were already auto-detected correctly from LiteLLM — this fixes only the display label. The family set is now open/extensible (`opus|sonnet|haiku|fable`)
- **Stale offline pricing fallback** — the hard-coded `PRICING` safety net (used only when LiteLLM is unreachable at boot with an empty cache) is refreshed to the current generation (Opus 4.8/4.7, Sonnet 5, Fable 5, plus bare-ID variants). Previously a fresh offline boot would undercount e.g. Opus 4.8 as Sonnet pricing via `DEFAULT_PRICING`

### Docs
- README badge stack expanded (all three variants) with rows for auto-synced LiteLLM pricing, per-model support (Opus 4.8 / Sonnet 5 / Fable 5 / Haiku 4.5), single/multi-user + multi-device modes, and the MD3-Expressive/heatmap/accessibility feature set

### Tests
- Test suite expanded to **229** (13 new): new-generation label derivation, trailing-alias/two-digit-minor labels, unrecognized-family fallback, Fable pricing, offline-fallback pricing for Opus 4.8 / Sonnet 5 / Fable 5, Opus 4.8 full-formula + bare-ID pricing, hard-coded-label precedence over overrides, and `getPricingMeta` origin tagging

## [Unreleased] - 2026-06-27

### Added
- **Usage heatmap** — weekday × hour grid in the overview that visualizes token-usage intensity. Multi-day ranges render a 7×24 grid (rows Mon→Sun); a single day renders a 24-hour strip. Cache-toggle aware, with a per-cell tooltip (tokens · messages · cost) and a colour legend. Lightweight CSS grid (no extra dependency). New `Aggregator.getHourlyWeekday()` + `GET /api/hourly-weekday`, plus demo-data coverage
- **Weekday labels on dates** — chart axis labels now carry the weekday (`Sat 06-27`), and a new period-range header in the status bar shows the selected window with weekdays (`Thu 05/28/2026 – Sat 06/27/2026`). `formatPeriodLabel` (comparison labels) updated too
- **Material 3 Expressive motion** for the new UI — the heatmap reveals with a diagonal spring wave (per-cell `--d = row+col` stagger), cells spring on hover with an accent glow, and the period-range header spring-swaps when the range changes. Motion uses authentic MD3 motion-physics springs rendered as CSS `linear()` easings (`--ease-spatial-expressive`, `--ease-spatial-expressive-fast`, `--ease-effects-expressive`) derived from the official spring tokens. Gated to real navigations (calm on live/SSE refreshes) with a `prefers-reduced-motion` guard

### Fixed
- Heatmap CSS classes use a dedicated `uheat-` prefix to avoid colliding with the GitHub contribution graph's `.heatmap-grid` (`grid-auto-flow: column`), which otherwise scrambled the weekday rows into a horizontal zigzag

### Tests
- Test suite expanded to **216** (added 4 `getHourlyWeekday` cases: grid shape, totals, local-time bucketing, from/to filter)

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

### Fixed
- **Project merge was destructive after a re-parse** — the aggregator mutated the shared message object's `project` to the canonical name, and the watcher/`/api/rebuild` add to the aggregator *before* they insert into the DB, so every new/re-parsed message persisted the canonical name and un-merge could no longer restore the split. The aggregator now clones on fold instead of mutating, keeping the original name in the DB
- Merge dialog: `_mergeKey` could throw on an empty/`/`-only project name (crashing suggestions); ownership validation now also accepts already-merged source names (so an existing alias can be redirected); merged-project badge reads the live alias list (count + tooltip no longer desync after a re-sort); merge/un-merge surface a refresh error instead of silently leaving a stale table

### Tests
- Test suite expanded to **212** (added `project-merge`, `export-html`, `anthropic-api` crypto, `config` coverage, and a non-destructive-fold regression test)

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
