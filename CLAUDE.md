# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                # Start server on port 5010
npm test                 # Run all 84 tests (vitest)
npm run test:watch       # Tests in watch mode
npm run test:coverage    # Coverage report
npm run lint             # ESLint (lib/ + server.js only)
npx vitest run test/parser.test.js  # Run a single test file
```

No build step — vanilla JS frontend served directly from `public/`.

## Architecture

Local dashboard that tracks Claude Code token usage. Pure Node.js HTTP server (no Express), SQLite database, vanilla JS frontend with Chart.js.

### Data Flow

```
~/.claude/projects/**/session.jsonl
    → lib/parser.js (incremental byte-offset parsing, dedup by message ID)
    → lib/db.js (SQLite with WAL mode, INSERT OR REPLACE)
    → lib/aggregator.js (in-memory stats, pre-computed on startup)
    → server.js (17 JSON API endpoints + SSE live updates)
    → public/ (Chart.js charts, i18n DE/EN, cache toggle)
```

### Key Modules

- **`lib/parser.js`** — Reads JSONL files, extracts token counts/tools/model from `type: 'assistant'` messages. Tracks byte offsets per file for incremental parsing. Deduplicates by `message.id` (last entry wins for streaming).
- **`lib/aggregator.js`** — In-memory analytics engine. Maintains `_daily`, `_sessions`, `_projects`, `_models`, `_tools`, `_hourly` maps. All API data served from these pre-computed structures.
- **`lib/db.js`** — SQLite layer with `messages`, `message_tools`, `parse_state`, `metadata` tables. All multi-row inserts use `db.transaction()`.
- **`lib/pricing.js`** — Per-model pricing (input/output/cacheRead/cacheCreate per 1M tokens). Unknown models fall back to Sonnet 4.5 pricing.
- **`lib/watcher.js`** — Chokidar file watcher with `awaitWriteFinish` debouncing. On file change: incremental parse → update aggregator → broadcast SSE to connected clients.
- **`lib/backup.js`** — SQLite `VACUUM INTO` for atomic backups, auto-pruning to 10 copies.
- **`server.js`** — Vanilla `http.createServer`. Exports `startServer()` which returns `{ server, port }` for test use. Startup: initDB → load from SQLite → parse new JSONL → insert to DB → start watcher.

### Frontend

- **No framework** — vanilla DOM with `textContent` (no `innerHTML`)
- **State**: Single global `state` object (activeTab, period, includeCache, sessionFilter)
- **Cache toggle**: Cached tokens hidden by default. `getDisplayTokens()` / `getDisplayCost()` filter based on `state.includeCache`. Persisted in `localStorage`.
- **i18n**: `data-i18n` attributes on HTML elements, `t(key)` lookup function, translations in `public/js/i18n.js`
- **Charts**: Each chart function destroys the old instance before recreating (`chartInstances` map)

## Conventions

- **CommonJS** throughout backend (`require`/`module.exports`)
- **Timestamps**: ISO 8601 strings, dates as `YYYY-MM-DD` sliced from timestamps
- **Token counts**: Always integers, default 0
- **Costs**: Rounded to 2 decimals
- **Unused variables**: Prefix with `_` (ESLint configured for this)
- **German text**: Use proper umlauts (ü, ö, ä, ß), never ASCII substitutes (ue, oe, ae, ss)
- **Tests**: Use vitest globals (no imports needed), temp dirs via `fs.mkdtempSync()`, API tests spawn server on random port
- **ESLint**: Flat config (ESLint 9), only covers `lib/` and `server.js`
