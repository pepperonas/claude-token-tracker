# Architecture

A dashboard that reads Claude Code's own session logs, keeps them in SQLite,
and serves analytics from an in-memory aggregator. No framework on either side,
no build step, two runtime dependencies.

---

## Data flow

### Single-user (local)

```
~/.claude/projects/**/*.jsonl
  │  lib/parser.js      incremental byte-offset read, dedup by message.id
  ▼
lib/db.js               SQLite, WAL mode, 12 tables, INSERT OR REPLACE
  │
  ▼
lib/aggregator.js       in-memory maps, pre-computed on startup
  │
  ▼
server.js               node:http, 64 JSON routes + SSE
  │
  ▼
public/                 vanilla JS, Chart.js, i18n DE/EN
```

`lib/watcher.js` (chokidar) re-parses only the appended bytes on change, updates
the aggregator in place and pushes an SSE frame.

### Multi-user (hosted)

```
sync-agent/  (client machine)  ──POST /api/sync──▶  server.js
                                                      │
                            per-user rows in SQLite ◀─┤
                                                      ▼
                                              AggregatorCache
                                    (per user+device, lazy, 30 min idle
                                     eviction, 2 h max age)
```

The file watcher is off — a hosted server has no `~/.claude`. GitHub OAuth
issues the session cookie; each machine gets its own device API key.

---

## Modules

| Module | Responsibility |
|---|---|
| `lib/parser.js` | JSONL → message objects. Byte offsets per file for incremental reads; dedup by `message.id` (streaming writes the same ID repeatedly); extracts tools, line counts, the cache-write TTL split and rate-limit events. |
| `lib/db.js` | Schema, migrations, all SQL. Streaming generators for whole-DB scans. |
| `lib/aggregator.js` | Every analytics answer. Pre-computed maps plus per-message cached derived values. |
| `lib/pricing.js` | Price resolution: epoch → LiteLLM override → built-in fallback → default. Cost calculation including both cache-write tiers. |
| `lib/pricing-fetcher.js` | Daily LiteLLM refresh, cached in the DB so the first calculation after a restart is already fresh. |
| `lib/achievements.js` | 1,200 definitions, the stats they read, and the historical backfill. |
| `lib/auth.js` | GitHub OAuth, sessions, API-key authentication. |
| `lib/github.js`, `lib/anthropic-api.js`, `lib/plan-usage.js` | External integrations, all cached. |
| `lib/report-project.js` | Standalone per-project HTML report. |
| `lib/export-html.js` | Self-contained interactive HTML snapshot. |
| `lib/backup.js` | `VACUUM INTO` snapshots with a shrink guard. |
| `lib/export-db.js` | Per-account SQLite snapshot for the database download. |
| `lib/watcher.js` | File watching and SSE fan-out. |

---

## Decisions worth knowing

### The database is the long-term store, not the JSONL

Claude Code prunes old session files, so `~/.claude/projects` is a rolling
window. On the reference machine roughly half the historical files are already
gone. `data/tracker.db` holds everything ever parsed, which is why
`POST /api/rebuild` reloads the DB **before** re-parsing JSONL on top.

### Analytics are served from memory, not from SQL

All period-filtered queries iterate the in-memory message map. To make that
affordable at ~250k messages, `_applyDelta` computes each message's date, hour,
weekday, cost and resolved pricing **once** and caches them on the object. Every
query loop reads those cached fields instead of allocating a `Date` and
re-resolving a price per message per request — the difference was 45–185 ms per
endpoint.

Consequence: costs are frozen when a message is added. A pricing refresh takes
effect on the next `/api/rebuild` or restart.

### Memory is managed explicitly

Whole-DB scans use generators (`streamAllMessages`), not arrays — materialising
two 250k-object arrays at once permanently inflated resident memory by hundreds
of megabytes. Repeated strings (project, model, session ID, tool names) are
interned. `mmap_size` stays at 0. Ten seconds after `listen` a one-shot full GC
returns the startup churn to the OS: ~509 MB → ~130 MB.

### Project merges are non-destructive

A merge writes a `project_aliases` row. `_addMessage` rewrites the project name
at the single choke-point every message passes through, so the merge applies to
existing *and* future messages across every view without touching stored data.
Un-merging restores the original split.

In multi-user mode the cross-user share aggregator deliberately applies **no**
alias map: folding it with one user's merges would let that user rewrite project
name resolution for everyone's shares.

### Charts update in place

`renderChart()` swaps `data`/`options` on an existing Chart.js instance and calls
`update('none')`. Destroying and recreating blanked the canvas and replayed the
draw animation on every live refresh.

### Entrance animations are disarmed permanently, not toggled

Re-applying an animation property restarts it, so a suppress-then-unsuppress gate
made all entrance animations replay whenever the gate lifted. `body.motion-settled`
is added 1.6 s after load and never removed.

---

## Database

12 tables. The ones that carry data:

| Table | Contents |
|---|---|
| `messages` | One row per API message. `user_id` and `device_id` scope it in multi-user mode; both `NULL` in single-user. |
| `message_tools` | Tool name and call count per message. |
| `rate_limit_events` | Rate-limit hits. |
| `parse_state` | Byte offset, size and mtime per JSONL file. |
| `project_aliases` | Merge map, per user. |
| `achievements` | Unlocked keys with their (backdated) unlock time. |
| `users`, `user_sessions`, `devices` | Multi-user accounts, sessions and machines. |
| `project_shares` | Share tokens. |
| `github_cache` | Cached external API responses. |
| `metadata` | Key/value: pricing cache, migration flags, plan usage. |

Migrations are additive `ALTER TABLE` guarded by `PRAGMA table_info`. Nothing is
ever dropped, and there is no `DELETE FROM messages` anywhere in the codebase.

---

## Testing

`vitest`, no test framework config beyond the defaults. The rule that matters:
**nothing may touch the real environment.** The API tests point `DB_PATH` and
`CLAUDE_DIR` at a throwaway directory *before* requiring `lib/config`, and seed
a deterministic multi-day history. An earlier version booted against the real
database, took 33 seconds, failed on CI (which has no data) and rewrote the
developer's own achievements.

The frontend has no module system (plain `<script>` globals, no build step), so
`test/helpers/frontend.js` loads the bundles into a `vm` sandbox with a minimal
DOM stub and tests the pure helpers from there. ⚠️ Top-level `const`/`let` do
**not** become sandbox globals — only `var` and function declarations do — so
lexical bindings like `LANG` and `state` are read back with `ctx.pick([...])`.

Prefer asserting numbers over shapes: `expect(body.messages).toBe(45 * 6)`
catches an aggregation regression, `expect(Array.isArray(body))` does not.
