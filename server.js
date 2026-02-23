const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { PORT, STATS_CACHE_FILE, MULTI_USER, BASE_URL } = require('./lib/config');
const { parseAll } = require('./lib/parser');
const Aggregator = require('./lib/aggregator');
const { AggregatorCache } = require('./lib/aggregator');
const { calculateCost } = require('./lib/pricing');
const {
  initDB, insertMessages, getAllMessages, getParseState, setParseState, closeDB,
  insertMessagesForUser, getMessagesForUser,
  regenerateApiKey, cleanExpiredSessions, findUserByApiKey
} = require('./lib/db');
const Watcher = require('./lib/watcher');
const { authenticateRequest, authenticateApiKey, handleAuthRoute } = require('./lib/auth');

const PUBLIC_DIR = path.join(__dirname, 'public');

// Read sync-agent files for install script generation
const SYNC_AGENT_INDEX = fs.readFileSync(path.join(__dirname, 'sync-agent', 'index.js'), 'utf-8');
const SYNC_AGENT_PKG = fs.readFileSync(path.join(__dirname, 'sync-agent', 'package.json'), 'utf-8');

// MIME types
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

// --- Read Claude's own stats-cache.json ---
function readStatsCache() {
  try {
    return JSON.parse(fs.readFileSync(STATS_CACHE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

// --- Init ---
console.log('Starting Claude Token Tracker...');
if (MULTI_USER) console.log('Multi-user mode enabled');

// 1. Initialize DB
initDB();

// 2. Load existing messages from SQLite (single-user aggregator)
const aggregator = new Aggregator();
const existingMessages = getAllMessages();
if (existingMessages.length > 0) {
  aggregator.addMessages(existingMessages);
  console.log(`Loaded ${existingMessages.length} messages from database`);
}

// 3. Parse new JSONL data incrementally (only in single-user mode)
const t0 = Date.now();
const savedParseState = getParseState();
const { messages: newMessages, parseState: newParseState } = parseAll(savedParseState);
let parseState = newParseState;

if (newMessages.length > 0) {
  const existingIds = new Set(existingMessages.map(m => m.id));
  const trulyNew = newMessages.filter(m => !existingIds.has(m.id));
  if (trulyNew.length > 0) {
    insertMessages(trulyNew, calculateCost);
    aggregator.addMessages(trulyNew);
    console.log(`Parsed ${trulyNew.length} new messages in ${Date.now() - t0}ms`);
  }
}

// 4. Save parse state
setParseState(parseState);

// Start file watcher (single-user only)
const watcher = new Watcher(aggregator, parseState, (newMsgs) => {
  insertMessages(newMsgs, calculateCost);
  setParseState(parseState);
});
if (!MULTI_USER) {
  watcher.start();
}

// Multi-user aggregator cache
const aggregatorCache = MULTI_USER ? new AggregatorCache(getMessagesForUser) : null;

// Clean expired sessions periodically (multi-user)
let sessionCleanupTimer = null;
if (MULTI_USER) {
  sessionCleanupTimer = setInterval(() => cleanExpiredSessions(), 60 * 60 * 1000);
}

// --- Backup system ---
let backup = null;
try {
  backup = require('./lib/backup');
  backup.startAutoBackup();
} catch {
  // backup module not yet available during Phase 2
}

// --- HTTP Server ---
function sendJSON(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
  res.end(body);
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

/**
 * Read request body as JSON
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/**
 * Get the aggregator for the current request.
 * In single-user mode: returns the global aggregator.
 * In multi-user mode: returns a per-user aggregator from the cache.
 */
function getAggregator(user) {
  if (!MULTI_USER) return aggregator;
  return aggregatorCache.get(user.id);
}

/**
 * Generate a self-contained install script for the sync agent
 */
function generateInstallScript(serverUrl, apiKey) {
  return `#!/bin/bash
set -e

GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
RED='\\033[0;31m'
BLUE='\\033[0;34m'
BOLD='\\033[1m'
NC='\\033[0m'

info() { echo -e "\$BLUE▸\$NC \$1"; }
ok()   { echo -e "\$GREEN✓\$NC \$1"; }
warn() { echo -e "\$YELLOW⚠\$NC \$1"; }
err()  { echo -e "\$RED✗\$NC \$1"; }

INSTALL_DIR="\$HOME/claude-sync-agent"

echo -e "\$BOLD""Claude Sync Agent Installer""\$NC"
echo ""

# --- 1. Prerequisites ---
if ! command -v node &> /dev/null; then
  err "Node.js is not installed. Install Node.js 18+ first."
  exit 1
fi
NODE_VERSION=\$(node -v | sed 's/v//' | cut -d. -f1)
if [ "\$NODE_VERSION" -lt 18 ]; then
  err "Node.js 18+ required (found \$(node -v))"
  exit 1
fi
ok "Node.js \$(node -v)"

if ! command -v npm &> /dev/null; then
  err "npm is not installed."
  exit 1
fi

# --- 2. Handle existing installation ---
if [ -d "\$INSTALL_DIR" ]; then
  warn "Directory \$INSTALL_DIR already exists."
  read -p "   Overwrite? [y/N] " -n 1 -r
  echo
  if [[ ! \$REPLY =~ ^[Yy]\$ ]]; then
    echo "Aborted."
    exit 0
  fi
  # Stop existing service
  OS_PRE=\$(uname -s)
  if [ "\$OS_PRE" = "Darwin" ]; then
    PLIST_PRE="\$HOME/Library/LaunchAgents/io.celox.claude-sync-agent.plist"
    [ -f "\$PLIST_PRE" ] && launchctl unload "\$PLIST_PRE" 2>/dev/null || true
  elif [ "\$OS_PRE" = "Linux" ]; then
    systemctl --user stop claude-sync-agent 2>/dev/null || true
  fi
fi

# --- 3. Install files ---
info "Installing to \$INSTALL_DIR ..."
mkdir -p "\$INSTALL_DIR"

cat > "\$INSTALL_DIR/index.js" << 'SYNCAGENTEOF'
${SYNC_AGENT_INDEX}
SYNCAGENTEOF

cat > "\$INSTALL_DIR/package.json" << 'SYNCAGENTEOF'
${SYNC_AGENT_PKG}
SYNCAGENTEOF

cat > "\$INSTALL_DIR/config.json" << SYNCAGENTEOF
{
  "serverUrl": "${serverUrl}",
  "apiKey": "${apiKey}"
}
SYNCAGENTEOF

ok "Files written"

# --- 4. Install dependencies ---
info "Installing dependencies..."
cd "\$INSTALL_DIR"
npm install --production --silent 2>&1 | tail -1
ok "Dependencies installed"

# --- 5. Verify server connection ---
info "Verifying server connection..."
HTTP_STATUS=\$(curl -s -o /dev/null -w "%{http_code}" \\
  -X POST \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[]}' \\
  "${serverUrl}/api/sync" 2>/dev/null || echo "000")

if [ "\$HTTP_STATUS" = "400" ]; then
  ok "Server connection verified"
elif [ "\$HTTP_STATUS" = "401" ]; then
  warn "API key rejected — regenerate it on the website"
elif [ "\$HTTP_STATUS" = "000" ]; then
  warn "Could not reach server at ${serverUrl}"
else
  warn "Unexpected response (HTTP \$HTTP_STATUS)"
fi

# --- 6. Autostart ---
NODE_PATH=\$(which node)
OS=\$(uname -s)

setup_launchd() {
  local PLIST_DIR="\$HOME/Library/LaunchAgents"
  local PLIST="\$PLIST_DIR/io.celox.claude-sync-agent.plist"
  mkdir -p "\$PLIST_DIR"

  [ -f "\$PLIST" ] && launchctl unload "\$PLIST" 2>/dev/null || true

  cat > "\$PLIST" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>io.celox.claude-sync-agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>\$NODE_PATH</string>
        <string>\$INSTALL_DIR/index.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>\$INSTALL_DIR/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>\$INSTALL_DIR/stderr.log</string>
    <key>WorkingDirectory</key>
    <string>\$INSTALL_DIR</string>
</dict>
</plist>
PLISTEOF

  launchctl load "\$PLIST" 2>/dev/null
  ok "Autostart configured (launchd)"
  ok "Agent is running — survives reboots"
  echo ""
  info "Logs:    tail -f \$INSTALL_DIR/stdout.log"
  info "Stop:    launchctl unload \$PLIST"
  info "Restart: launchctl unload \$PLIST && launchctl load \$PLIST"
  info "Remove:  launchctl unload \$PLIST && rm \$PLIST"
}

setup_systemd() {
  local SERVICE_DIR="\$HOME/.config/systemd/user"
  local SERVICE="\$SERVICE_DIR/claude-sync-agent.service"
  mkdir -p "\$SERVICE_DIR"

  cat > "\$SERVICE" << SERVICEEOF
[Unit]
Description=Claude Sync Agent
After=network.target

[Service]
ExecStart=\$NODE_PATH \$INSTALL_DIR/index.js
WorkingDirectory=\$INSTALL_DIR
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
SERVICEEOF

  systemctl --user daemon-reload
  systemctl --user enable claude-sync-agent 2>/dev/null
  systemctl --user restart claude-sync-agent
  ok "Autostart configured (systemd)"
  ok "Agent is running — survives reboots"
  echo ""
  info "Logs:    journalctl --user -u claude-sync-agent -f"
  info "Stop:    systemctl --user stop claude-sync-agent"
  info "Restart: systemctl --user restart claude-sync-agent"
  info "Remove:  systemctl --user disable --now claude-sync-agent"
}

echo ""
if [ "\$OS" = "Darwin" ] || [ "\$OS" = "Linux" ]; then
  read -p "\$(echo -e "\$BLUE▸\$NC") Set up autostart? [Y/n] " -n 1 -r
  echo
  if [[ ! \$REPLY =~ ^[Nn]\$ ]]; then
    if [ "\$OS" = "Darwin" ]; then
      setup_launchd
    else
      if command -v systemctl &> /dev/null; then
        setup_systemd
      else
        warn "systemd not available"
        info "Use PM2 instead:"
        info "  pm2 start \$INSTALL_DIR/index.js --name claude-sync"
        info "  pm2 save"
      fi
    fi
  else
    info "Start manually: node \$INSTALL_DIR/index.js"
    info "Or with PM2:    pm2 start \$INSTALL_DIR/index.js --name claude-sync && pm2 save"
  fi
else
  warn "Unknown OS — skipping autostart"
  info "Start manually: node \$INSTALL_DIR/index.js"
fi

echo ""
echo -e "\$GREEN\$BOLD=== Installation complete ===\$NC"
echo "  Directory: \$INSTALL_DIR"
echo "  Server:    ${serverUrl}"
echo ""
`;
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query = parsed.query;

  // Auth routes (always accessible)
  if (pathname.startsWith('/auth/')) {
    if (handleAuthRoute(req, res, pathname, sendJSON)) return;
  }

  // Config endpoint (tells frontend about mode)
  if (pathname === '/api/config') {
    return sendJSON(res, { multiUser: MULTI_USER });
  }

  // Sync endpoint — API key auth, separate from session auth
  if (pathname === '/api/sync' && req.method === 'POST') {
    const user = authenticateApiKey(req);
    if (!user) return sendJSON(res, { error: 'Unauthorized' }, 401);

    readBody(req).then(body => {
      const messages = body.messages;
      if (!Array.isArray(messages) || messages.length === 0) {
        return sendJSON(res, { error: 'No messages provided' }, 400);
      }

      insertMessagesForUser(messages, calculateCost, user.id);

      // Invalidate aggregator cache for this user
      if (aggregatorCache) aggregatorCache.invalidateUser(user.id);

      // Broadcast SSE update to this user's clients
      watcher.broadcast({ type: 'update', count: messages.length, userId: user.id });

      return sendJSON(res, { inserted: messages.length });
    }).catch(err => {
      return sendJSON(res, { error: 'Invalid JSON: ' + err.message }, 400);
    });
    return;
  }

  // Sync agent install script download
  if (pathname === '/api/sync-agent/install.sh' && req.method === 'GET') {
    if (!MULTI_USER) return sendJSON(res, { error: 'Not available in single-user mode' }, 404);

    // Auth via session cookie or ?key= query parameter
    let scriptUser = authenticateRequest(req);
    if (!scriptUser && query.key) {
      scriptUser = findUserByApiKey(query.key);
    }
    if (!scriptUser) return sendJSON(res, { error: 'Unauthorized' }, 401);

    const script = generateInstallScript(BASE_URL, scriptUser.api_key);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="install-sync-agent.sh"',
      'Cache-Control': 'no-cache'
    });
    return res.end(script);
  }

  // Static files — always accessible (login page needs them)
  if (!pathname.startsWith('/api/')) {
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(PUBLIC_DIR, filePath);

    // Prevent path traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    return serveStatic(res, filePath);
  }

  // --- All /api/* routes below require authentication in multi-user mode ---
  const user = authenticateRequest(req);
  if (MULTI_USER && !user) {
    return sendJSON(res, { error: 'Unauthorized' }, 401);
  }

  const agg = getAggregator(user);

  // API routes
  if (pathname === '/api/active-sessions') {
    const minutes = parseInt(query.minutes) || 10;
    return sendJSON(res, agg.getActiveSessions(minutes));
  }

  if (pathname === '/api/overview') {
    return sendJSON(res, agg.getOverview(query.from, query.to));
  }

  if (pathname === '/api/daily') {
    return sendJSON(res, agg.getDaily(query.from, query.to));
  }

  if (pathname === '/api/daily-by-model') {
    return sendJSON(res, agg.getDailyByModel(query.from, query.to));
  }

  if (pathname === '/api/sessions') {
    return sendJSON(res, agg.getSessions(query.project, query.model, query.from, query.to));
  }

  if (pathname.startsWith('/api/session/')) {
    const id = pathname.split('/api/session/')[1];
    const session = agg.getSession(id);
    if (!session) return sendJSON(res, { error: 'Not found' }, 404);
    return sendJSON(res, session);
  }

  if (pathname === '/api/projects') {
    return sendJSON(res, agg.getProjects(query.from, query.to));
  }

  if (pathname === '/api/models') {
    return sendJSON(res, agg.getModels(query.from, query.to));
  }

  if (pathname === '/api/tools') {
    return sendJSON(res, agg.getTools(query.from, query.to));
  }

  if (pathname === '/api/hourly') {
    return sendJSON(res, agg.getHourly(query.from, query.to));
  }

  // Insights API endpoints
  if (pathname === '/api/stop-reasons') {
    return sendJSON(res, agg.getStopReasons(query.from, query.to));
  }

  if (pathname === '/api/day-of-week') {
    return sendJSON(res, agg.getDayOfWeek(query.from, query.to));
  }

  if (pathname === '/api/cache-efficiency') {
    return sendJSON(res, agg.getCacheEfficiency(query.from, query.to));
  }

  if (pathname === '/api/cumulative-cost') {
    return sendJSON(res, agg.getCumulativeCost(query.from, query.to));
  }

  if (pathname === '/api/daily-cost-breakdown') {
    return sendJSON(res, agg.getDailyCostBreakdown(query.from, query.to));
  }

  if (pathname === '/api/session-efficiency') {
    return sendJSON(res, agg.getSessionEfficiency(query.from, query.to));
  }

  // Claude's own stats-cache with cost calculation (single-user only)
  if (pathname === '/api/stats-cache') {
    if (MULTI_USER) {
      return sendJSON(res, { error: 'Not available in multi-user mode' }, 404);
    }
    const sc = readStatsCache();
    if (!sc) return sendJSON(res, { error: 'stats-cache.json not found' }, 404);
    const modelsWithCost = {};
    let totalCost = 0;
    for (const [model, usage] of Object.entries(sc.modelUsage || {})) {
      const cost = calculateCost(model, {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadInputTokens,
        cacheCreateTokens: usage.cacheCreationInputTokens
      });
      totalCost += cost;
      modelsWithCost[model] = { ...usage, estimatedCost: Math.round(cost * 100) / 100 };
    }
    return sendJSON(res, {
      ...sc,
      modelUsage: modelsWithCost,
      totalEstimatedCost: Math.round(totalCost * 100) / 100
    });
  }

  if (pathname === '/api/live') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('data: {"type":"connected"}\n\n');
    // Tag SSE client with userId for multi-user filtering
    if (MULTI_USER && user) {
      res._userId = user.id;
    }
    watcher.addSSEClient(res);
    return;
  }

  if (pathname === '/api/rebuild' && req.method === 'POST') {
    if (MULTI_USER) {
      // In multi-user mode, just invalidate the user's cache
      if (aggregatorCache) aggregatorCache.invalidateUser(user.id);
      return sendJSON(res, { rebuilt: true, messages: 0, timeMs: 0 });
    }
    aggregator.reset();
    const _t0 = Date.now();
    const { messages, parseState: newState } = parseAll({});
    Object.assign(parseState, newState);
    aggregator.addMessages(messages);
    insertMessages(messages, calculateCost);
    setParseState(parseState);
    return sendJSON(res, { rebuilt: true, messages: messages.length, timeMs: Date.now() - _t0 });
  }

  // Sync key management
  if (pathname === '/api/sync-key' && req.method === 'GET') {
    if (!MULTI_USER) return sendJSON(res, { error: 'Not available in single-user mode' }, 404);
    return sendJSON(res, { apiKey: user.api_key });
  }

  if (pathname === '/api/sync-key' && req.method === 'POST') {
    if (!MULTI_USER) return sendJSON(res, { error: 'Not available in single-user mode' }, 404);
    const newKey = regenerateApiKey(user.id);
    return sendJSON(res, { apiKey: newKey });
  }

  // Backup endpoints
  if (pathname === '/api/backup' && req.method === 'POST') {
    if (!backup) return sendJSON(res, { error: 'Backup module not available' }, 500);
    try {
      const result = backup.backupNow();
      return sendJSON(res, result);
    } catch (err) {
      return sendJSON(res, { error: err.message }, 500);
    }
  }

  if (pathname === '/api/export' && req.method === 'GET') {
    if (!backup) return sendJSON(res, { error: 'Backup module not available' }, 500);
    try {
      const data = backup.exportJSON();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="claude-tracker-export-${new Date().toISOString().slice(0, 10)}.json"`,
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify(data, null, 2));
    } catch (err) {
      return sendJSON(res, { error: err.message }, 500);
    }
  }

  // 404
  sendJSON(res, { error: 'Not found' }, 404);
});

// Export for testing
function startServer(port) {
  const p = port || PORT;
  return new Promise((resolve) => {
    server.listen(p, () => {
      console.log(`Dashboard: http://localhost:${p}`);
      console.log(`API: http://localhost:${p}/api/overview`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer();
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  watcher.stop();
  setParseState(parseState);
  if (backup) backup.stopAutoBackup();
  if (aggregatorCache) aggregatorCache.stop();
  if (sessionCleanupTimer) clearInterval(sessionCleanupTimer);
  closeDB();
  process.exit(0);
});

module.exports = { server, startServer, aggregator };
