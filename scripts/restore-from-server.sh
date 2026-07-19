#!/usr/bin/env bash
# Restore the local tracker DB from the hosted server (tracker.celox.io VPS).
#
# Use after a fresh install / machine reset: ~/.claude JSONL is only a rolling
# window (Claude Code prunes old session files), so a fresh local install can
# NOT rebuild the full history from disk. The hosted server holds the complete
# synced message history — this script pulls a consistent snapshot and makes it
# the local DB. Afterwards the tracker restarts, re-parses whatever JSONL still
# exists locally (deduplicated by message id, so nothing double-counts) and
# recomputes achievements with historical dates via the backfill migration.
#
# Usage: bash scripts/restore-from-server.sh
set -euo pipefail

VPS="root@69.62.121.168"
REMOTE_DIR="/root/apps/claude-token-tracker"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/io.celox.token-tracker.plist"
TS="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$LOCAL_DIR/data"

echo "==> Creating consistent snapshot on the server (VACUUM INTO)..."
ssh "$VPS" "rm -f /tmp/tracker-restore.db && sqlite3 $REMOTE_DIR/data/tracker.db \"VACUUM INTO '/tmp/tracker-restore.db'\""

echo "==> Downloading snapshot..."
scp "$VPS:/tmp/tracker-restore.db" "$LOCAL_DIR/data/tracker-restore-$TS.db"
ssh "$VPS" "rm -f /tmp/tracker-restore.db"

echo "==> Stopping local tracker (LaunchAgent)..."
if [ -f "$PLIST" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
fi

if [ -f "$LOCAL_DIR/data/tracker.db" ]; then
  echo "==> Keeping previous DB as tracker.db.pre-restore-$TS"
  mv "$LOCAL_DIR/data/tracker.db" "$LOCAL_DIR/data/tracker.db.pre-restore-$TS"
fi
rm -f "$LOCAL_DIR/data/tracker.db-wal" "$LOCAL_DIR/data/tracker.db-shm"
mv "$LOCAL_DIR/data/tracker-restore-$TS.db" "$LOCAL_DIR/data/tracker.db"

echo "==> Starting local tracker..."
if [ -f "$PLIST" ]; then
  launchctl load "$PLIST"
else
  echo "    (no LaunchAgent found — start manually with: npm start)"
fi

echo "==> Waiting for the dashboard (startup streams the restored history)..."
for _ in $(seq 1 20); do
  if curl -s -o /dev/null -m 2 http://localhost:5010/; then
    break
  fi
  sleep 3
done

MSGS=$(curl -s -m 5 http://localhost:5010/api/overview | python3 -c 'import json,sys; print(json.load(sys.stdin)["messages"])' 2>/dev/null || echo '?')
echo "==> Done. Dashboard reports $MSGS messages."
echo "    Local JSONL will be re-parsed on top automatically (dedup by id);"
echo "    achievements recompute with historical dates on first start."
