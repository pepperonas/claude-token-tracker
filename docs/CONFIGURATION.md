# Configuration

Every setting is optional. With no configuration at all the tracker runs a
single-user dashboard on `http://localhost:5010`, reads `~/.claude/projects`
and stores everything in `./data/tracker.db`.

Configuration is read from the environment. A `.env` file in the project root
is picked up when the process is started with `node --env-file=.env server.js`
(the VPS deployment does this via PM2). **The macOS LaunchAgent does not read
`.env`** — it runs plain `node server.js`, so local settings belong in the
plist's `EnvironmentVariables` block instead.

---

## Core

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5010` | HTTP port. |
| `CLAUDE_DIR` | `~/.claude` | Root of the Claude Code installation. `PROJECTS_DIR` is derived as `$CLAUDE_DIR/projects`. |
| `DATA_DIR` | `./data` | Where the tracker keeps its own files. |
| `DB_PATH` | `$DATA_DIR/tracker.db` | SQLite database. Set it explicitly to move the DB off the project directory. |

`CLAUDE_DIR` and `DB_PATH` are read at require time by `lib/config.js`. Tests
rely on that: they point both at a throwaway directory **before** requiring
`lib/db`, which is what keeps the suite from touching a real installation.

---

## Backups

| Variable | Default | Description |
|---|---|---|
| `BACKUP_PATH` | *(unset — no backups)* | Directory for periodic snapshots. Setting it enables the feature. |
| `BACKUP_INTERVAL_HOURS` | `24` | Hours between snapshots. One is taken at startup. |

Snapshots use SQLite `VACUUM INTO`, so they are atomic and safe while the
database is being written. The 10 most recent are kept. A new snapshot smaller
than **half** the previous one is rejected rather than saved — a corrupt or
truncated database must not quietly replace a good backup.

---

## Multi-user mode

| Variable | Default | Description |
|---|---|---|
| `MULTI_USER` | `false` | Turns the hosted mode on. |
| `GITHUB_CLIENT_ID` | — | **Required** when `MULTI_USER=true`. OAuth app client ID. |
| `GITHUB_CLIENT_SECRET` | — | **Required** when `MULTI_USER=true`. |
| `SESSION_SECRET` | — | **Required** when `MULTI_USER=true`. `openssl rand -hex 32`. Also the AES-256-GCM key for stored Anthropic admin keys. |
| `BASE_URL` | `http://localhost:$PORT` | Public URL, used for OAuth callbacks and in generated install scripts. |

Switching this on changes four things at once:

1. Every `/api/*` route requires a session cookie (exceptions below).
2. Messages are stored and read per `user_id`, and per `device_id` within that.
3. The file watcher is **off** — a hosted server has no `~/.claude` to watch.
   Data arrives through `POST /api/sync` from the sync agent instead.
4. The global aggregator is not built at startup; `AggregatorCache` builds one
   per user on demand and evicts it after 30 minutes of no requests.

**Rotating `SESSION_SECRET` invalidates all sessions and makes previously
stored Anthropic keys undecryptable.** They have to be re-entered.

---

## GitHub tab

| Variable | Default | Description |
|---|---|---|
| `GITHUB_TOKEN` | — | Single-user only: a personal access token (`repo`, `read:user`). Ignored in multi-user mode, where each account's OAuth token is used. |
| `GITHUB_CACHE_TTL_MINUTES` | `60` | How long a cached GitHub response counts as fresh. |

Responses are cached stale-while-revalidate: past the TTL the cached value is
still served immediately and a refresh runs in the background, so a slow
GitHub API never blocks the dashboard.

---

## Claude API tab

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_ADMIN_KEY` | — | Admin API key for organisation-level usage and cost. |
| `ANTHROPIC_CACHE_TTL_MINUTES` | `60` | Cache lifetime for those responses. |

The key can also be stored from the UI, in which case it is encrypted with
AES-256-GCM using `SESSION_SECRET` and kept in the database. The environment
variable is the fallback when nothing is stored.

---

## Share API

| Variable | Default | Description |
|---|---|---|
| `SHARE_ADMIN_KEY` | — | 64-char hex. Required for the share **management** endpoints. |

Without it the management endpoints are reachable with a dashboard session
only. The public read endpoint `GET /api/public/share/:token` never needs it —
it is authorised by the 48-character share token alone.

---

## What is *not* configurable, and why

| Behaviour | Value | Reason |
|---|---|---|
| Idle-gap cap for active time | 5 minutes | Changing it silently redefines every historical time figure. See [METRICS.md](METRICS.md). |
| Aggregator cache eviction | 30 min idle / 2 h max age | The max age forces a rebuild from the DB so incremental updates cannot drift. |
| Public share rate limit | 30 requests/min/IP | The only unauthenticated surface; the limit is deliberately not weakened by configuration. |
| SQLite `mmap_size` | `0` | A 256 MB mmap counted the whole database file toward resident memory while analytics are served from the in-memory aggregator anyway. |
