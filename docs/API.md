# API reference

64 routes. Unless stated otherwise a route is `GET`, returns JSON, and accepts
the period parameters below.

## Authentication

| Mode | Rule |
|---|---|
| **Single-user** (default) | No authentication. The server binds to `localhost` and every route is open to anything that can reach the port. |
| **Multi-user** (`MULTI_USER=true`) | Every `/api/*` route requires a session cookie from the GitHub OAuth flow, except the four exceptions below. |

Exceptions that never require a session:

| Route | Authorised by |
|---|---|
| `GET /api/pricing` | nothing — deliberately public for transparency |
| `GET /api/public/share/:token` | the 48-character share token |
| `POST /api/sync` | device API key (`Authorization: Bearer …`) |
| `GET /api/sync-agent/install.{sh,ps1}` | API key in the query string |

**CORS**: `sendJSON()` sets no `Access-Control-Allow-Origin` at all; it only
passes through one a route set beforehand. Only the public share endpoint does,
and only for an allowlisted origin. Do not reintroduce a wildcard — a blanket
`*` let any website read the (unauthenticated) local API, and because
`writeHead()` wins over `setHeader()` it also silently overrode the share
endpoint's allowlist.

## Common parameters

| Parameter | Applies to | Meaning |
|---|---|---|
| `from`, `to` | all analytics routes | Inclusive `YYYY-MM-DD` local dates. Omit both for all time. |
| `device` | all analytics routes | Numeric device ID. Omit for the aggregated all-devices view. |

---

## Analytics

| Route | Description |
|---|---|
| `/api/overview` | KPI totals: tokens by type, cost, sessions, messages, lines, `totalActiveMin`, `avgActiveMinPerDay`, `activeDays`, rate-limit hits. |
| `/api/daily` | Per-day aggregates including a four-part cost breakdown (`inputCost`, `outputCost`, `cacheReadCost`, `cacheCreateCost`). |
| `/api/daily-by-model` | Daily tokens split by model. |
| `/api/daily-cost-breakdown` | Daily cost split by token type. |
| `/api/cumulative-cost` | Running cost total over the period. |
| `/api/hourly` | Activity by hour of day (local time). |
| `/api/hourly-by-model` | Hourly split by model. |
| `/api/hourly-weekday` | 7 × 24 grid for the overview heatmap, with per-cell tokens/messages/cost and global maxima for colour scaling. |
| `/api/day-of-week` | Activity by weekday. |
| `/api/trends` | The overview trend cards and their five charts in **one** payload: four now-anchored comparisons (today, calendar week, month, rolling 7 days), each against the previous period cut off at the same point; plus `daily90` and `momentum`. Independent of the period filter. |
| `/api/sessions` | Sessions with `durationMin`, `activeMin`, tokens, cost, lines, tool calls. |
| `/api/active-sessions` | Sessions with a message in the last 10 minutes. |
| `/api/session-depth`, `/api/session-efficiency` | Distribution and per-session efficiency metrics. |
| `/api/projects` | Per-project totals. |
| `/api/project-detail?name=…` | One project in full: totals, per-component cost, cache-TTL coverage, `spanMin`, `totalActiveMin`, daily series, model and tool breakdown, session list. |
| `/api/project-report?name=…` | **HTML, not JSON.** A standalone print-optimised report. `&download=1` sets a `Content-Disposition` filename; `&print=1` opens the browser print dialog on load (this is the PDF path — there is no server-side PDF engine). |
| `/api/models`, `/api/model-efficiency` | Per-model totals and efficiency. |
| `/api/tools` | Tool call counts. |
| `/api/tool-stats` | Tool cost attribution — message cost distributed proportionally across that message's tool calls. |
| `/api/tool-cost-daily` | Tool cost over time. |
| `/api/mcp-servers` | Breakdown by MCP server, detected from the `mcp__server__tool` prefix. |
| `/api/subagent-stats` | Sub-agent messages, tokens and cost. |
| `/api/cache-efficiency` | Cache hit rate and savings. |
| `/api/productivity`, `/api/efficiency-trend` | Tokens/min, lines/hour, cost/line and their trend. |
| `/api/stop-reasons` | Distribution of `stop_reason`. |
| `/api/rate-limits` | Rate-limit events, total and per day. |
| `/api/global-averages` | This account against the average of all users (multi-user only). |

## Achievements

| Route | Description |
|---|---|
| `/api/achievements` | All 1,200 with unlock status, tier, points and unlock date. |
| `POST /api/achievements/recompute` | Replays the history and rewrites unlock dates. **No UI** — the automatic paths (fresh install, `ACH_BACKFILL_FLAG` bump) cover every normal case; this is the maintainer's recovery path. |

## Pricing

| Route | Description |
|---|---|
| `/api/pricing` | **Public.** Effective prices per model with `origin: 'litellm' \| 'fallback'`, the 1-hour cache-write price, epochs, and the last fetch error if any. |
| `POST /api/pricing/refresh` | Force a LiteLLM refresh. |

## Projects: merge

Non-destructive. The original `project` on each message is never modified;
a `project_aliases` row rewrites the name at the single choke-point every
message passes through.

| Route | Description |
|---|---|
| `/api/project-aliases` | Active merges. |
| `POST /api/project-merge` | `{ sources: [], target }`. Every name is validated against the requesting user's own project list. |
| `DELETE /api/project-aliases` | `{ alias }` — un-merge. |

## Devices (multi-user)

| Route | Description |
|---|---|
| `/api/devices` | List, and `POST` to create — returns the API key **once**. |
| `/api/devices/:id` | `PATCH` to rename, `DELETE` to remove. Deleting a device **orphans** its messages (`device_id = NULL`); it never deletes data, and the all-devices view still shows them. |
| `POST /api/devices/:id/regenerate-key` | Invalidates the old key immediately. |

## Sync

| Route | Description |
|---|---|
| `POST /api/sync` | Device API key. Body `{ messages[], rateLimitEvents?[], planUsage? }`. Idempotent — messages are upserted by ID. |
| `/api/sync-key` | The legacy account-level key. |
| `/api/sync-agent/install.sh?key=…` | A personalised installer with the config baked in. `install.ps1` for Windows. |

## Share API

| Route | Auth | Description |
|---|---|---|
| `/api/share-admin-key` | Session | Read, `POST` to regenerate. |
| `/api/shares` | Admin key or session | List, `POST` to create `{ project, label, expires_in_days }`. |
| `/api/shares/:id` | Admin key or session | `DELETE` — revocation takes effect immediately. |
| `/api/shares/projects` | Admin key or session | Projects with stats, for the share picker. |
| `/api/public/share/:token` | **Public** | Sanitised project data. 30 requests/min/IP, CORS allowlist. Never exposes the internal project path. |

## GitHub

All stale-while-revalidate cached; see [CONFIGURATION.md](CONFIGURATION.md).

| Route | Description |
|---|---|
| `/api/github/stats` | Contributions, repositories, pull requests. |
| `/api/github/billing` | Plan detection, Actions minutes, storage, packages. |
| `/api/github/actions-usage` | Per-repository Actions cost with OS multipliers (Ubuntu 1×, macOS 10×, Windows 2×). |
| `/api/github/code-stats`, `/api/github/code-frequency`, `/api/github/languages` | Lines of code and language mix. |
| `POST /api/github/refresh` | Drop the cache and refetch. |

## Anthropic Admin API

| Route | Description |
|---|---|
| `/api/anthropic/dashboard` | Organisation usage and cost, including a per-API-key breakdown. |
| `/api/anthropic/budget` | Read and `POST` a budget. |
| `POST /api/anthropic/refresh` | Force a refresh. |
| `POST /api/user/anthropic-key` | Store the key AES-256-GCM encrypted. |

## Plan usage

| Route | Description |
|---|---|
| `/api/plan-usage` | Session and weekly limits from the claude.ai account. |
| `POST /api/plan-usage/token` | Store the OAuth token. |
| `POST /api/plan-usage/refresh` | Clear the 5-minute cache and refetch. |

## Export and maintenance

| Route | Description |
|---|---|
| `/api/export` | Full JSON export. |
| `/api/export-html` | Self-contained interactive HTML snapshot. |
| `/api/download-db` | Streams the SQLite file. |
| `POST /api/backup` | Take a snapshot now. |
| `POST /api/rebuild` | Reload the DB history **first**, then re-parse JSONL on top. Doing it the other way round silently dropped everything past the JSONL retention window. |
| `/api/config` | Mode and feature flags for the frontend. |
| `/api/stats-cache` | Local `.claude` statistics (single-user only). |

## Live updates

| Route | Description |
|---|---|
| `/api/live` | Server-Sent Events. Emits `update` when the watcher or a sync writes, and `achievement-unlocked` with emoji, tier and points. Filtered by user in multi-user mode. |
