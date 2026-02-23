# Changelog

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
