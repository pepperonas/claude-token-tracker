const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { PORT, STATS_CACHE_FILE, MULTI_USER, BASE_URL } = require('./lib/config');
const { parseAll, backfillRateLimitEvents } = require('./lib/parser');
const Aggregator = require('./lib/aggregator');
const { AggregatorCache } = require('./lib/aggregator');
const { calculateCost } = require('./lib/pricing');
const {
  initDB, insertMessages, getAllMessages, getParseState, setParseState, closeDB,
  insertMessagesForUser, getMessagesForUser,
  regenerateApiKey, cleanExpiredSessions, findUserByApiKey,
  getUnlockedAchievements, unlockAchievementsBatch,
  getMetadata, setMetadata,
  insertRateLimitEvents, insertRateLimitEventsForUser,
  getAllRateLimitEvents, getRateLimitEventsForUser,
  createDevice, getDevicesForUser, getDeviceById, findDeviceByApiKey, findUserById,
  renameDevice, deleteDevice, regenerateDeviceKey, updateDeviceLastSync
} = require('./lib/db');
const achievements = require('./lib/achievements');
const { generateExportHTML } = require('./lib/export-html');
const Watcher = require('./lib/watcher');
const { authenticateRequest, authenticateApiKey, handleAuthRoute } = require('./lib/auth');
const github = require('./lib/github');
const anthropicApi = require('./lib/anthropic-api');
const planUsage = require('./lib/plan-usage');

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
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
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

// 1b. Initialize GitHub module with DB reference
github.initGithub(require('./lib/db'));

// 1c. Initialize Anthropic API module with DB reference
anthropicApi.initAnthropicApi(require('./lib/db'));

// 1d. Initialize Plan Usage module with DB reference
planUsage.initPlanUsage(require('./lib/db'));

// 2. Load existing messages and parse JSONL (single-user only; multi-user uses per-user cache)
const aggregator = new Aggregator();
let parseState = {};
if (!MULTI_USER) {
  const existingMessages = getAllMessages();
  if (existingMessages.length > 0) {
    aggregator.addMessages(existingMessages);
    console.log(`Loaded ${existingMessages.length} messages from database`);
  }

  const existingRateLimitEvents = getAllRateLimitEvents();
  if (existingRateLimitEvents.length > 0) {
    aggregator.addRateLimitEvents(existingRateLimitEvents);
    console.log(`Loaded ${existingRateLimitEvents.length} rate-limit events from database`);
  }

  // Parse new JSONL data incrementally
  const t0 = Date.now();
  const savedParseState = getParseState();
  const { messages: newMessages, rateLimitEvents: newRateLimitEvents, parseState: newParseState } = parseAll(savedParseState);
  parseState = newParseState;

  if (newMessages.length > 0) {
    const existingIds = new Set(existingMessages.map(m => m.id));
    const trulyNew = newMessages.filter(m => !existingIds.has(m.id));
    if (trulyNew.length > 0) {
      insertMessages(trulyNew, calculateCost);
      aggregator.addMessages(trulyNew);
      console.log(`Parsed ${trulyNew.length} new messages in ${Date.now() - t0}ms`);
    }
  }

  if (newRateLimitEvents.length > 0) {
    insertRateLimitEvents(newRateLimitEvents);
    aggregator.addRateLimitEvents(newRateLimitEvents);
    console.log(`Parsed ${newRateLimitEvents.length} new rate-limit events`);
  }

  // Backfill rate-limit events if needed
  if (existingRateLimitEvents.length === 0 && newRateLimitEvents.length === 0) {
    const backfilled = backfillRateLimitEvents();
    if (backfilled.length > 0) {
      insertRateLimitEvents(backfilled);
      aggregator.addRateLimitEvents(backfilled);
      console.log(`Backfilled ${backfilled.length} rate-limit events from existing JSONL files`);
    }
  }

  setParseState(parseState);
} else {
  console.log('Multi-user mode: skipping global aggregator (per-user cache used instead)');
}

// DB helper for achievements module
const achievementsDb = { getUnlockedAchievements, unlockAchievementsBatch };

// 5. Check achievements on startup (single-user)
if (!MULTI_USER) {
  try {
    const newAch = achievements.checkAchievements(aggregator, 0, achievementsDb);
    if (newAch.length > 0) console.log(`Unlocked ${newAch.length} new achievements`);
  } catch (e) { console.error('Achievement check failed on startup:', e.message); }
}

// Start file watcher (single-user only)
const watcher = new Watcher(aggregator, parseState, (newMsgs, rleEvents) => {
  if (newMsgs.length > 0) insertMessages(newMsgs, calculateCost);
  if (rleEvents && rleEvents.length > 0) insertRateLimitEvents(rleEvents);
  setParseState(parseState);
  try {
    const newAch = achievements.checkAchievements(aggregator, 0, achievementsDb);
    if (newAch.length > 0) {
      watcher.broadcast({ type: 'achievement-unlocked', achievements: achievements.getAchievementsByKeys(newAch) });
    }
  } catch (e) { console.error('Achievement check failed:', e.message); }
});
if (!MULTI_USER) {
  watcher.start();
}

// Multi-user aggregator cache
const aggregatorCache = MULTI_USER ? new AggregatorCache(getMessagesForUser, getRateLimitEventsForUser) : null;

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
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.length });
    res.end(data);
  });
}

/**
 * Read request body as JSON
 */
function readBody(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) { req.destroy(); return reject(new Error('Body too large')); }
      data += chunk;
    });
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
 * If deviceId is provided, returns a device-filtered aggregator.
 */
function getAggregator(user, deviceId) {
  if (!MULTI_USER) return aggregator;
  return aggregatorCache.get(user.id, deviceId || null);
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
  info "Updating existing installation at \$INSTALL_DIR ..."
  # Stop existing service before overwriting
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

/**
 * Generate a self-contained PowerShell install script for the sync agent (Windows)
 */
function generateWindowsInstallScript(serverUrl, apiKey) {
  // Use single-quoted heredocs (@'...'@) for index.js and package.json (no interpolation)
  // Use double-quoted heredoc (@"..."@) for config.json (needs variable interpolation)
  return `#Requires -Version 5.0
$ErrorActionPreference = "Stop"

function Write-Info($msg)  { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "  $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "  $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "  $msg" -ForegroundColor Red }

$InstallDir = Join-Path $env:USERPROFILE "claude-sync-agent"

Write-Host ""
Write-Host "  Claude Sync Agent Installer" -ForegroundColor White
Write-Host ""

# --- 1. Prerequisites ---
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Err "Node.js is not installed. Install Node.js 18+ first."
    exit 1
}
$nodeVersion = (node -v) -replace '^v', ''
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 18) {
    Write-Err "Node.js 18+ required (found v$nodeVersion)"
    exit 1
}
Write-Ok "Node.js v$nodeVersion"

# --- 2. Handle existing installation ---
if (Test-Path $InstallDir) {
    Write-Info "Updating existing installation at $InstallDir ..."
    $task = Get-ScheduledTask -TaskName "ClaudeSyncAgent" -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName "ClaudeSyncAgent" -ErrorAction SilentlyContinue
    }
}

# --- 3. Install files ---
Write-Info "Installing to $InstallDir ..."
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

$indexJs = @'
${SYNC_AGENT_INDEX}
'@
Set-Content -Path (Join-Path $InstallDir "index.js") -Value $indexJs -Encoding UTF8

$packageJson = @'
${SYNC_AGENT_PKG}
'@
Set-Content -Path (Join-Path $InstallDir "package.json") -Value $packageJson -Encoding UTF8

$configJson = @"
{
  "serverUrl": "${serverUrl}",
  "apiKey": "${apiKey}"
}
"@
Set-Content -Path (Join-Path $InstallDir "config.json") -Value $configJson -Encoding UTF8

Write-Ok "Files written"

# --- 4. Install dependencies ---
Write-Info "Installing dependencies..."
Push-Location $InstallDir
& npm.cmd install --production --silent 2>&1 | Out-Null
Pop-Location
Write-Ok "Dependencies installed"

# --- 5. Verify server connection ---
Write-Info "Verifying server connection..."
try {
    $response = Invoke-WebRequest -Uri "${serverUrl}/api/sync" -Method POST \`
        -Headers @{ "Authorization" = "Bearer ${apiKey}"; "Content-Type" = "application/json" } \`
        -Body '{"messages":[]}' -UseBasicParsing -ErrorAction Stop
    Write-Ok "Server connection verified"
} catch {
    $status = 0
    if ($_.Exception.Response) {
        $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status -eq 400) {
        Write-Ok "Server connection verified"
    } elseif ($status -eq 401) {
        Write-Warn "API key rejected - regenerate it on the website"
    } else {
        Write-Warn "Could not reach server at ${serverUrl}"
    }
}

# --- 6. Autostart (Task Scheduler) ---
Write-Info "Setting up autostart (Task Scheduler)..."
$nodePath = (Get-Command node).Source
$action = New-ScheduledTaskAction -Execute $nodePath -Argument (Join-Path $InstallDir "index.js") -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 0)
Register-ScheduledTask -TaskName "ClaudeSyncAgent" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName "ClaudeSyncAgent" -ErrorAction SilentlyContinue
Write-Ok "Autostart configured (Task Scheduler)"
Write-Ok "Agent is running — survives reboots"

Write-Host ""
Write-Host "  === Installation complete ===" -ForegroundColor Green
Write-Host "  Directory: $InstallDir"
Write-Host "  Server:    ${serverUrl}"
Write-Host ""
Write-Info "Stop:    Stop-ScheduledTask -TaskName ClaudeSyncAgent"
Write-Info "Restart: Start-ScheduledTask -TaskName ClaudeSyncAgent"
Write-Info "Remove:  Unregister-ScheduledTask -TaskName ClaudeSyncAgent -Confirm:\`$false"
Write-Host ""
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
    return sendJSON(res, { multiUser: MULTI_USER, hasGithubToken: !!process.env.GITHUB_TOKEN });
  }

  // Sync endpoint — API key auth, separate from session auth
  if (pathname === '/api/sync' && req.method === 'POST') {
    const auth = authenticateApiKey(req);
    if (!auth) return sendJSON(res, { error: 'Unauthorized' }, 401);
    const syncUser = auth.user;
    const syncDevice = auth.device;
    const deviceId = syncDevice ? syncDevice.id : null;

    readBody(req).then(body => {
      const messages = body.messages;
      const rateLimitEvents = body.rateLimitEvents;
      const hasMessages = Array.isArray(messages) && messages.length > 0;
      const hasRateLimitEvents = Array.isArray(rateLimitEvents) && rateLimitEvents.length > 0;

      const hasPlanUsage = !!body.planUsage;
      if (!hasMessages && !hasRateLimitEvents && !hasPlanUsage) {
        return sendJSON(res, { error: 'No data provided' }, 400);
      }

      if (hasMessages) {
        insertMessagesForUser(messages, calculateCost, syncUser.id, deviceId);
      }

      if (hasRateLimitEvents) {
        insertRateLimitEventsForUser(rateLimitEvents, syncUser.id, deviceId);
      }

      // Store plan usage data if provided (backwards-compatible)
      if (body.planUsage) {
        planUsage.storeSyncedPlanUsage(syncUser.id, body.planUsage);
      }

      // Update device last sync time
      if (deviceId) updateDeviceLastSync(deviceId);

      // Incrementally update cached aggregators (avoids full rebuild from 67k+ messages)
      if (aggregatorCache && (hasMessages || hasRateLimitEvents)) {
        const aggMessages = hasMessages ? messages.map(m => ({
          id: m.uuid, timestamp: m.timestamp, model: m.model, sessionId: m.sessionId,
          project: m.project, inputTokens: m.inputTokens || 0, outputTokens: m.outputTokens || 0,
          cacheReadTokens: m.cacheReadTokens || 0, cacheCreateTokens: m.cacheCreateTokens || 0,
          stopReason: m.stopReason, tools: m.tools || [], toolCounts: m.toolCounts || {},
          isSubagent: !!(m.isSubagent), linesAdded: m.linesAdded || 0,
          linesRemoved: m.linesRemoved || 0, linesWritten: m.linesWritten || 0
        })) : null;
        aggregatorCache.addToUser(syncUser.id, aggMessages, hasRateLimitEvents ? rateLimitEvents : null);
      }

      // Check achievements for this user (always use all-devices aggregator)
      try {
        const userAgg = aggregatorCache.get(syncUser.id);
        const newAch = achievements.checkAchievements(userAgg, syncUser.id, achievementsDb);
        if (newAch.length > 0) {
          watcher.broadcast({ type: 'achievement-unlocked', achievements: achievements.getAchievementsByKeys(newAch), userId: syncUser.id });
        }
      } catch (e) { console.error('Achievement check failed for user', syncUser.id, ':', e.message); }

      // Broadcast SSE update to this user's clients
      watcher.broadcast({ type: 'update', count: hasMessages ? messages.length : 0, userId: syncUser.id });

      return sendJSON(res, { inserted: hasMessages ? messages.length : 0, rateLimitEvents: hasRateLimitEvents ? rateLimitEvents.length : 0 });
    }).catch(err => {
      return sendJSON(res, { error: 'Invalid JSON: ' + err.message }, 400);
    });
    return;
  }

  // Sync agent install script download — uses device-specific API key
  if (pathname === '/api/sync-agent/install.sh' && req.method === 'GET') {
    if (!MULTI_USER) return sendJSON(res, { error: 'Not available in single-user mode' }, 404);

    let scriptUser = authenticateRequest(req);
    if (!scriptUser && query.key) {
      scriptUser = findUserByApiKey(query.key);
      if (!scriptUser) {
        const dev = findDeviceByApiKey(query.key);
        if (dev) scriptUser = findUserById(dev.user_id);
      }
    }
    if (!scriptUser) return sendJSON(res, { error: 'Unauthorized' }, 401);

    // Resolve device API key
    let apiKey;
    if (query.device) {
      const device = getDeviceById(parseInt(query.device));
      if (!device || device.user_id !== scriptUser.id) return sendJSON(res, { error: 'Device not found' }, 404);
      apiKey = device.api_key;
    } else {
      const devices = getDevicesForUser(scriptUser.id);
      apiKey = devices.length > 0 ? devices[0].api_key : scriptUser.api_key;
    }

    const script = generateInstallScript(BASE_URL, apiKey);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="install-sync-agent.sh"',
      'Cache-Control': 'no-cache'
    });
    return res.end(script);
  }

  // Sync agent PowerShell install script download (Windows)
  if (pathname === '/api/sync-agent/install.ps1' && req.method === 'GET') {
    if (!MULTI_USER) return sendJSON(res, { error: 'Not available in single-user mode' }, 404);

    let scriptUser = authenticateRequest(req);
    if (!scriptUser && query.key) {
      scriptUser = findUserByApiKey(query.key);
      if (!scriptUser) {
        const dev = findDeviceByApiKey(query.key);
        if (dev) scriptUser = findUserById(dev.user_id);
      }
    }
    if (!scriptUser) return sendJSON(res, { error: 'Unauthorized' }, 401);

    let apiKey;
    if (query.device) {
      const device = getDeviceById(parseInt(query.device));
      if (!device || device.user_id !== scriptUser.id) return sendJSON(res, { error: 'Device not found' }, 404);
      apiKey = device.api_key;
    } else {
      const devices = getDevicesForUser(scriptUser.id);
      apiKey = devices.length > 0 ? devices[0].api_key : scriptUser.api_key;
    }

    const script = generateWindowsInstallScript(BASE_URL, apiKey);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="install-sync-agent.ps1"',
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

  const deviceFilter = query.device ? parseInt(query.device) : null;
  const agg = getAggregator(user, deviceFilter);

  // API routes
  if (pathname === '/api/active-sessions') {
    const minutes = parseInt(query.minutes) || 10;
    return sendJSON(res, agg.getActiveSessions(minutes));
  }

  if (pathname === '/api/overview') {
    return sendJSON(res, agg.getOverview(query.from, query.to));
  }

  if (pathname === '/api/rate-limits') {
    return sendJSON(res, agg.getRateLimits(query.from, query.to));
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

  if (pathname === '/api/project-detail') {
    if (!query.name) return sendJSON(res, { error: 'name parameter required' }, 400);
    return sendJSON(res, agg.getProjectDetail(query.name, query.from, query.to));
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

  if (pathname === '/api/tool-stats') {
    return sendJSON(res, agg.getToolStats(query.from, query.to));
  }

  if (pathname === '/api/mcp-servers') {
    return sendJSON(res, agg.getMcpServers(query.from, query.to));
  }

  if (pathname === '/api/subagent-stats') {
    return sendJSON(res, agg.getSubagentStats(query.from, query.to));
  }

  if (pathname === '/api/tool-cost-daily') {
    return sendJSON(res, agg.getToolCostDaily(query.from, query.to));
  }

  if (pathname === '/api/hourly') {
    return sendJSON(res, agg.getHourly(query.from, query.to));
  }

  if (pathname === '/api/hourly-by-model') {
    return sendJSON(res, agg.getHourlyByModel(query.from, query.to));
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

  if (pathname === '/api/productivity') {
    return sendJSON(res, agg.getProductivity(query.from, query.to));
  }
  if (pathname === '/api/efficiency-trend') {
    return sendJSON(res, agg.getEfficiencyTrend(query.from, query.to));
  }
  if (pathname === '/api/model-efficiency') {
    return sendJSON(res, agg.getModelEfficiency(query.from, query.to));
  }
  if (pathname === '/api/session-depth') {
    return sendJSON(res, agg.getSessionDepthAnalysis(query.from, query.to));
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

  if (pathname === '/api/export-html' && req.method === 'GET') {
    const overview = agg.getOverview(query.from, query.to);
    const daily = agg.getDaily(query.from, query.to);
    const sessions = agg.getSessions(null, null, query.from, query.to);
    const projects = agg.getProjects(query.from, query.to);
    const models = agg.getModels(query.from, query.to);
    const tools = agg.getTools(query.from, query.to);
    const toolStats = agg.getToolStats(query.from, query.to);
    const hourly = agg.getHourly(query.from, query.to);
    const productivity = agg.getProductivity(query.from, query.to);
    const stopReasons = agg.getStopReasons(query.from, query.to);
    const weekday = agg.getDayOfWeek(query.from, query.to);
    const rateLimits = agg.getRateLimits(query.from, query.to);
    const exportUserId = MULTI_USER ? user.id : 0;
    const achData = achievements.getAchievementsResponse(exportUserId, achievementsDb);
    const periodLabel = query.from && query.to
      ? `${query.from} — ${query.to}`
      : query.from ? `From ${query.from}` : 'All Time';

    // Fetch GitHub and Anthropic data (best-effort, no secrets exported)
    const githubToken = github.getToken(user);
    const anthropicToken = anthropicApi.getAdminToken(user);
    const promises = [];
    promises.push(githubToken
      ? Promise.all([
        github.getBillingInfo(githubToken, user.id).catch(() => null),
        github.getContributionsAndRepos(githubToken, user.id).catch(() => null),
        github.getActionsUsageByRepo(githubToken, user.id).catch(() => null),
        github.getCodeStats(githubToken, user.id).catch(() => null)
      ])
      : Promise.resolve([null, null, null, null]));
    promises.push(anthropicToken
      ? anthropicApi.getDashboardData(anthropicToken, user.id).catch(() => null)
      : Promise.resolve(null));

    Promise.all(promises).then(([ghResults, anthropicData]) => {
      const [ghBilling, ghStats, ghActions, ghCodeStats] = ghResults;
      const githubData = (ghBilling || ghStats || ghActions || ghCodeStats)
        ? { billing: ghBilling, stats: ghStats, actions: ghActions, codeStats: ghCodeStats }
        : null;
      const html = generateExportHTML({ overview, daily, sessions, projects, models, tools, toolStats, hourly, productivity, stopReasons, weekday, achievements: achData, rateLimits, periodLabel, githubData, anthropicData });
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="claude-tracker-${new Date().toISOString().slice(0, 10)}.html"`,
        'Cache-Control': 'no-cache'
      });
      res.end(html);
    }).catch(err => {
      sendJSON(res, { error: err.message }, 500);
    });
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
    try { achievements.checkAchievements(aggregator, 0, achievementsDb); } catch (e) { console.error('Achievement check failed on rebuild:', e.message); }
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

  // Device management endpoints
  if (pathname === '/api/devices' && req.method === 'GET') {
    const userId = MULTI_USER ? user.id : 0;
    const devices = getDevicesForUser(userId);
    return sendJSON(res, devices.map(d => ({
      id: d.id,
      name: d.name,
      apiKeyLast8: d.api_key.slice(-8),
      createdAt: d.created_at,
      lastSyncAt: d.last_sync_at
    })));
  }

  if (pathname === '/api/devices' && req.method === 'POST') {
    readBody(req).then(body => {
      const name = (body.name || '').trim();
      if (!name) return sendJSON(res, { error: 'Device name required' }, 400);
      if (name.length > 50) return sendJSON(res, { error: 'Name too long (max 50)' }, 400);
      const userId = MULTI_USER ? user.id : 0;
      const device = createDevice(userId, name);
      return sendJSON(res, { id: device.id, name: device.name, apiKey: device.api_key, createdAt: device.created_at });
    }).catch(err => sendJSON(res, { error: err.message }, 400));
    return;
  }

  if (pathname.match(/^\/api\/devices\/\d+$/) && req.method === 'PUT') {
    const deviceId = parseInt(pathname.split('/').pop());
    const device = getDeviceById(deviceId);
    const userId = MULTI_USER ? user.id : 0;
    if (!device || device.user_id !== userId) return sendJSON(res, { error: 'Not found' }, 404);
    readBody(req).then(body => {
      const name = (body.name || '').trim();
      if (!name) return sendJSON(res, { error: 'Device name required' }, 400);
      renameDevice(deviceId, name);
      return sendJSON(res, { renamed: true });
    }).catch(err => sendJSON(res, { error: err.message }, 400));
    return;
  }

  if (pathname.match(/^\/api\/devices\/\d+$/) && req.method === 'DELETE') {
    const deviceId = parseInt(pathname.split('/').pop());
    const device = getDeviceById(deviceId);
    const userId = MULTI_USER ? user.id : 0;
    if (!device || device.user_id !== userId) return sendJSON(res, { error: 'Not found' }, 404);
    const devices = getDevicesForUser(userId);
    if (devices.length <= 1) return sendJSON(res, { error: 'Cannot delete last device' }, 400);
    deleteDevice(deviceId);
    return sendJSON(res, { deleted: true });
  }

  if (pathname.match(/^\/api\/devices\/\d+\/regenerate-key$/) && req.method === 'POST') {
    const deviceId = parseInt(pathname.split('/')[3]);
    const device = getDeviceById(deviceId);
    const userId = MULTI_USER ? user.id : 0;
    if (!device || device.user_id !== userId) return sendJSON(res, { error: 'Not found' }, 404);
    const newKey = regenerateDeviceKey(deviceId);
    return sendJSON(res, { apiKey: newKey });
  }

  // Global comparison endpoint (multi-user only)
  if (pathname === '/api/global-averages') {
    if (!MULTI_USER) return sendJSON(res, { error: 'Not available in single-user mode' }, 404);
    const { getGlobalUserStats } = require('./lib/db');
    return sendJSON(res, getGlobalUserStats(query.from, query.to, user.id));
  }

  // GitHub stats endpoints
  if (pathname === '/api/github/billing' && req.method === 'GET') {
    const token = github.getToken(user);
    if (!token) return sendJSON(res, { error: 'No GitHub token configured' }, 400);
    github.getBillingInfo(token, user.id).then(data => {
      const age = github.getCacheAge(user.id, 'billing');
      sendJSON(res, { ...data, _cached: age !== null, _age: age || 0 });
    }).catch(err => {
      console.error('[billing] error:', err.message);
      sendJSON(res, { error: err.message }, 500);
    });
    return;
  }

  if (pathname === '/api/github/stats' && req.method === 'GET') {
    const token = github.getToken(user);
    if (!token) return sendJSON(res, { error: 'No GitHub token configured' }, 400);
    github.getContributionsAndRepos(token, user.id).then(data => {
      const age = github.getCacheAge(user.id, 'contributions');
      sendJSON(res, { ...data, _cached: age !== null, _age: age || 0 });
    }).catch(err => {
      sendJSON(res, { error: err.message }, 500);
    });
    return;
  }

  if (pathname === '/api/github/code-frequency' && req.method === 'GET') {
    const token = github.getToken(user);
    if (!token) return sendJSON(res, { error: 'No GitHub token configured' }, 400);
    const owner = query.owner;
    const repo = query.repo;
    if (!owner || !repo) return sendJSON(res, { error: 'Missing owner or repo' }, 400);
    github.getCodeFrequency(token, user.id, owner, repo).then(data => {
      sendJSON(res, data);
    }).catch(err => {
      sendJSON(res, { error: err.message }, 500);
    });
    return;
  }

  if (pathname === '/api/github/languages' && req.method === 'GET') {
    const token = github.getToken(user);
    if (!token) return sendJSON(res, { error: 'No GitHub token configured' }, 400);
    const owner = query.owner;
    const repo = query.repo;
    if (!owner || !repo) return sendJSON(res, { error: 'Missing owner or repo' }, 400);
    github.getRepoLanguages(token, user.id, owner, repo).then(data => {
      sendJSON(res, data);
    }).catch(err => {
      sendJSON(res, { error: err.message }, 500);
    });
    return;
  }

  if (pathname === '/api/github/actions-usage' && req.method === 'GET') {
    const token = github.getToken(user);
    if (!token) return sendJSON(res, { error: 'No GitHub token configured' }, 400);
    github.getActionsUsageByRepo(token, user.id).then(data => {
      const age = github.getCacheAge(user.id, 'actions-usage');
      sendJSON(res, { ...data, _cached: age !== null, _age: age || 0 });
    }).catch(err => {
      sendJSON(res, { error: err.message }, 500);
    });
    return;
  }

  if (pathname === '/api/github/code-stats' && req.method === 'GET') {
    const token = github.getToken(user);
    if (!token) return sendJSON(res, { error: 'No GitHub token configured' }, 400);
    github.getCodeStats(token, user.id).then(data => {
      const age = github.getCacheAge(user.id, 'code-stats');
      sendJSON(res, { ...data, _cached: age !== null, _age: age || 0 });
    }).catch(err => {
      sendJSON(res, { error: err.message }, 500);
    });
    return;
  }

  if (pathname === '/api/github/refresh' && req.method === 'POST') {
    github.clearCache(user.id);
    return sendJSON(res, { cleared: true });
  }

  // Per-user Anthropic key management
  if (pathname === '/api/user/anthropic-key' && req.method === 'GET') {
    return sendJSON(res, { hasKey: anthropicApi.hasAdminKey(user) });
  }

  if (pathname === '/api/user/anthropic-key' && req.method === 'POST') {
    readBody(req).then(body => {
      const key = (body.key || '').trim();
      if (!key.startsWith('sk-ant-admin')) {
        return sendJSON(res, { error: 'Invalid key format — must start with sk-ant-admin' }, 400);
      }
      anthropicApi.saveAdminKey(user.id, key);
      return sendJSON(res, { saved: true });
    }).catch(err => sendJSON(res, { error: err.message }, 400));
    return;
  }

  if (pathname === '/api/user/anthropic-key' && req.method === 'DELETE') {
    anthropicApi.deleteAdminKey(user.id);
    anthropicApi.clearCache(user.id);
    return sendJSON(res, { deleted: true });
  }

  // Anthropic API endpoints
  if (pathname === '/api/anthropic/dashboard' && req.method === 'GET') {
    const token = anthropicApi.getAdminToken(user);
    if (!token) return sendJSON(res, { error: 'No Anthropic admin key configured' }, 400);
    anthropicApi.getDashboardData(token, user.id).then(data => {
      const age = anthropicApi.getCacheAge(user.id, 'anthropic-dashboard');
      sendJSON(res, { ...data, _cached: age !== null, _age: age || 0 });
    }).catch(err => {
      console.error('[anthropic] dashboard error:', err.message);
      sendJSON(res, { error: err.message }, 500);
    });
    return;
  }

  if (pathname === '/api/anthropic/refresh' && req.method === 'POST') {
    anthropicApi.clearCache(user.id);
    return sendJSON(res, { cleared: true });
  }

  if (pathname === '/api/anthropic/budget' && req.method === 'GET') {
    const uid = MULTI_USER ? user.id : 0;
    const budget = getMetadata(`anthropic_budget_${uid}`);
    return sendJSON(res, { budget: budget ? parseFloat(budget) : null });
  }

  if (pathname === '/api/anthropic/budget' && req.method === 'POST') {
    readBody(req).then(body => {
      const uid = MULTI_USER ? user.id : 0;
      if (body.budget === null || body.budget === undefined) {
        setMetadata(`anthropic_budget_${uid}`, '');
        return sendJSON(res, { budget: null });
      }
      const val = parseFloat(body.budget);
      if (isNaN(val) || val < 0) return sendJSON(res, { error: 'Invalid budget' }, 400);
      setMetadata(`anthropic_budget_${uid}`, String(val));
      return sendJSON(res, { budget: val });
    }).catch(err => sendJSON(res, { error: err.message }, 400));
    return;
  }

  // Plan Usage endpoints
  if (pathname === '/api/plan-usage' && req.method === 'GET') {
    planUsage.getPlanUsage(user).then(data => {
      sendJSON(res, { planUsage: data, hasToken: planUsage.hasOAuthToken(user) });
    }).catch(err => {
      const isExpired = err.message === 'TOKEN_EXPIRED';
      sendJSON(res, {
        planUsage: null,
        hasToken: planUsage.hasOAuthToken(user),
        error: isExpired ? 'TOKEN_EXPIRED' : err.message
      }, isExpired ? 200 : 200);
    });
    return;
  }

  if (pathname === '/api/plan-usage/token' && req.method === 'POST') {
    readBody(req).then(body => {
      const token = (body.token || '').trim();
      if (!token.startsWith('sk-ant-oat01-')) {
        return sendJSON(res, { error: 'Invalid token format — must start with sk-ant-oat01-' }, 400);
      }
      const uid = MULTI_USER ? user.id : 0;
      planUsage.saveOAuthToken(uid, token);
      planUsage.clearCache(uid);
      return sendJSON(res, { saved: true });
    }).catch(err => sendJSON(res, { error: err.message }, 400));
    return;
  }

  if (pathname === '/api/plan-usage/token' && req.method === 'DELETE') {
    const uid = MULTI_USER ? user.id : 0;
    planUsage.deleteOAuthToken(uid);
    planUsage.clearCache(uid);
    return sendJSON(res, { deleted: true });
  }

  if (pathname === '/api/plan-usage/refresh' && req.method === 'POST') {
    const uid = MULTI_USER ? user.id : 0;
    planUsage.clearCache(uid);
    planUsage.getPlanUsage(user).then(data => {
      sendJSON(res, { planUsage: data });
    }).catch(err => {
      sendJSON(res, { planUsage: null, error: err.message });
    });
    return;
  }

  // Achievements endpoint
  if (pathname === '/api/achievements') {
    const userId = MULTI_USER ? user.id : 0;
    return sendJSON(res, achievements.getAchievementsResponse(userId, achievementsDb));
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
