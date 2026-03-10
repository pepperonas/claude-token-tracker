#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const readline = require('readline');

const { execFileSync } = require('child_process');
const os = require('os');

const HOME = process.env.HOME || os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const STATE_PATH = path.join(__dirname, '.sync-state.json');
const PLAN_USAGE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// --- Inline parser (standalone, no imports from main project) ---

function countLines(str) {
  if (!str) return 0;
  let n = 1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\n') n++;
  }
  if (str[str.length - 1] === '\n') n--;
  return n;
}

const HOME_PREFIX_RE = new RegExp(
  '^' + HOME.replace(/\//g, '-').replace(/^-/, '-') + '-?'
);

function extractProjectName(filePath) {
  const rel = path.relative(PROJECTS_DIR, filePath);
  const parts = rel.split(path.sep);
  const dirName = parts[0];
  const cleaned = dirName.replace(HOME_PREFIX_RE, '') || 'home';
  return cleaned.replace(/-/g, '/') || 'home';
}

function parseSessionFile(filePath, fromOffset = 0) {
  let stat;
  try { stat = fs.statSync(filePath); } catch { return { messages: [], rateLimitEvents: [], newOffset: fromOffset }; }
  if (stat.size <= fromOffset) return { messages: [], rateLimitEvents: [], newOffset: fromOffset };

  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(stat.size - fromOffset);
  fs.readSync(fd, buf, 0, buf.length, fromOffset);
  fs.closeSync(fd);

  const lines = buf.toString('utf-8').split('\n');
  const msgMap = new Map();
  const rateLimitEvents = [];
  let sessionId = null;
  const project = extractProjectName(filePath);

  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    if (!sessionId && obj.sessionId) sessionId = obj.sessionId;

    // Rate-limit events
    if (obj.type === 'queue-operation' && obj.content === '/rate-limit-options') {
      const sid = obj.sessionId || sessionId || '';
      const id = crypto.createHash('sha256').update(sid + obj.timestamp).digest('hex').slice(0, 16);
      rateLimitEvents.push({ id, timestamp: obj.timestamp, sessionId: sid, project });
      continue;
    }

    if (obj.type === 'assistant' && obj.message) {
      const msg = obj.message;
      const usage = msg.usage;
      if (!usage) continue;

      const msgId = msg.id || obj.uuid;
      const model = msg.model || '<synthetic>';
      const timestamp = obj.timestamp;

      const tools = [];
      let linesAdded = 0, linesRemoved = 0, linesWritten = 0;
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            tools.push(block.name);
            if (block.name === 'Edit' && block.input) {
              linesRemoved += countLines(block.input.old_string);
              linesAdded += countLines(block.input.new_string);
            } else if (block.name === 'Write' && block.input) {
              linesWritten += countLines(block.input.content);
            }
          }
        }
      }

      const prev = msgMap.get(msgId);
      const mergedTools = prev ? [...new Set([...prev.tools, ...tools])] : tools;

      msgMap.set(msgId, {
        id: msgId,
        timestamp,
        model,
        sessionId: obj.sessionId || sessionId,
        project,
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        cacheCreateTokens: usage.cache_creation_input_tokens || 0,
        tools: mergedTools,
        stopReason: msg.stop_reason,
        linesAdded,
        linesRemoved,
        linesWritten
      });
    }
  }

  return { messages: [...msgMap.values()], rateLimitEvents, newOffset: stat.size };
}

function findSessionFiles() {
  const files = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.name.endsWith('.jsonl')) {
        files.push(full);
      }
    }
  }
  walk(PROJECTS_DIR);
  return files;
}

// --- State management ---

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// --- Config ---

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

// --- Plan Usage (OAuth token detection + claude.ai API) ---

let _planUsageCache = null;
let _planUsageFetchedAt = 0;
let _orgId = null;

function _getOAuthTokenFromKeychain() {
  if (os.platform() !== 'darwin') return null;
  try {
    const raw = execFileSync('security', [
      'find-generic-password', '-s', 'Claude Code-credentials', '-w'
    ], { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const parsed = JSON.parse(raw);
    return (parsed.claudeAiOauth && parsed.claudeAiOauth.accessToken) || null;
  } catch {
    return null;
  }
}

function _getOAuthTokenFromFile() {
  let credPath;
  if (os.platform() === 'win32') {
    credPath = path.join(process.env.APPDATA || '', 'Claude', 'credentials.json');
  } else {
    credPath = path.join(HOME, '.config', 'claude', 'credentials.json');
  }
  try {
    const data = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    return (data.claudeAiOauth && data.claudeAiOauth.accessToken) || data.accessToken || null;
  } catch {
    return null;
  }
}

function getOAuthToken() {
  return _getOAuthTokenFromKeychain() || _getOAuthTokenFromFile() || null;
}

function _apiGet(url, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'claude-code/1.0',
        'anthropic-client-platform': 'claude-code',
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          return reject(new Error('TOKEN_EXPIRED'));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function _getOrgId(token) {
  if (_orgId) return _orgId;
  const data = await _apiGet('https://claude.ai/api/bootstrap', token);
  if (data.account && data.account.memberships) {
    for (const m of data.account.memberships) {
      if (m.organization && m.organization.uuid) {
        _orgId = m.organization.uuid;
        return _orgId;
      }
    }
  }
  if (data.organizations && data.organizations.length > 0) {
    _orgId = data.organizations[0].uuid || data.organizations[0].id;
    return _orgId;
  }
  throw new Error('Could not find organization ID');
}

async function fetchPlanUsage() {
  const token = getOAuthToken();
  if (!token) return null;

  // Use cache if fresh
  if (_planUsageCache && (Date.now() - _planUsageFetchedAt) < PLAN_USAGE_INTERVAL_MS) {
    return _planUsageCache;
  }

  try {
    const orgId = await _getOrgId(token);
    const raw = await _apiGet(`https://claude.ai/api/organizations/${orgId}/usage`, token);

    const result = {};
    if (raw.current_session || raw.currentSession) {
      const cs = raw.current_session || raw.currentSession;
      result.currentSession = {
        percentUsed: cs.percent_used ?? cs.percentUsed ?? null,
        resetsInSeconds: cs.resets_in_seconds ?? cs.resetsInSeconds ?? null,
        expiresAt: cs.expires_at ?? cs.expiresAt ?? null
      };
    }
    if (raw.weekly_limits || raw.weeklyLimits) {
      const wl = raw.weekly_limits || raw.weeklyLimits;
      if (wl.all_models || wl.allModels) {
        const am = wl.all_models || wl.allModels;
        result.weeklyAllModels = {
          percentUsed: am.percent_used ?? am.percentUsed ?? null,
          resetsAt: am.resets_at ?? am.resetsAt ?? null
        };
      }
      if (wl.sonnet_only || wl.sonnetOnly) {
        const so = wl.sonnet_only || wl.sonnetOnly;
        result.weeklySonnet = {
          percentUsed: so.percent_used ?? so.percentUsed ?? null,
          resetsAt: so.resets_at ?? so.resetsAt ?? null
        };
      }
    }
    result.fetchedAt = new Date().toISOString();
    _planUsageCache = result;
    _planUsageFetchedAt = Date.now();
    return result;
  } catch (err) {
    if (_planUsageCache) return _planUsageCache;
    console.error(`Plan usage fetch error: ${err.message}`);
    return null;
  }
}

// --- HTTP request helper ---

function sendBatch(serverUrl, apiKey, messages, rateLimitEvents, planUsage) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(serverUrl + '/api/sync');
    const isHttps = urlObj.protocol === 'https:';
    const mod = isHttps ? https : http;

    const payload = { messages };
    if (rateLimitEvents && rateLimitEvents.length > 0) {
      payload.rateLimitEvents = rateLimitEvents;
    }
    if (planUsage) {
      payload.planUsage = planUsage;
    }
    const body = JSON.stringify(payload);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'claude-token-tracker-sync-agent'
      }
    };

    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || data}`));
          }
        } catch {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendWithRetry(serverUrl, apiKey, messages, rateLimitEvents, planUsage, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await sendBatch(serverUrl, apiKey, messages, rateLimitEvents, planUsage);
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`  Retry in ${delay / 1000}s: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// --- Setup command ---

async function setup() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  console.log('Claude Token Tracker — Sync Agent Setup\n');

  const serverUrl = (await ask('Server URL (e.g. https://tracker.celox.io): ')).trim().replace(/\/$/, '');
  const apiKey = (await ask('API Key: ')).trim();

  rl.close();

  if (!serverUrl || !apiKey) {
    console.error('Both server URL and API key are required.');
    process.exit(1);
  }

  const config = { serverUrl, apiKey };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`\nConfig saved to ${CONFIG_PATH}`);
  console.log('Run `node index.js` to start syncing.');
}

// --- Full sync ---

async function backfillRateLimitEvents(config) {
  const files = findSessionFiles();
  const allEvents = [];

  for (const filePath of files) {
    let stat;
    try { stat = fs.statSync(filePath); } catch { continue; }
    if (stat.size === 0) continue;

    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(stat.size);
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);

    const project = extractProjectName(filePath);
    let sessionId = null;

    const lines = buf.toString('utf-8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (!sessionId && obj.sessionId) sessionId = obj.sessionId;
      if (obj.type === 'queue-operation' && obj.content === '/rate-limit-options') {
        const sid = obj.sessionId || sessionId || '';
        const id = crypto.createHash('sha256').update(sid + obj.timestamp).digest('hex').slice(0, 16);
        allEvents.push({ id, timestamp: obj.timestamp, sessionId: sid, project });
      }
    }
  }

  if (allEvents.length > 0) {
    // Send in batches of 500
    for (let i = 0; i < allEvents.length; i += 500) {
      const batch = allEvents.slice(i, i + 500);
      await sendWithRetry(config.serverUrl, config.apiKey, [], batch, null);
    }
    console.log(`Backfilled ${allEvents.length} rate-limit events from existing JSONL files`);
  }

  return allEvents.length;
}

async function fullSync(config) {
  const state = loadState();
  const files = findSessionFiles();
  let totalSent = 0;
  let planUsageSent = false;

  // One-time backfill for rate-limit events from already-parsed files
  if (!state._rateLimitBackfillDone) {
    await backfillRateLimitEvents(config);
    state._rateLimitBackfillDone = true;
    saveState(state);
  }

  // Fetch plan usage to include in sync
  const planUsage = await fetchPlanUsage();

  for (const filePath of files) {
    const prev = state[filePath];
    const offset = prev ? prev.offset : 0;

    const { messages, rateLimitEvents, newOffset } = parseSessionFile(filePath, offset);
    if (messages.length > 0 || rateLimitEvents.length > 0) {
      if (messages.length > 0) {
        // Send in batches of 500
        for (let i = 0; i < messages.length; i += 500) {
          const batch = messages.slice(i, i + 500);
          // Attach rate-limit events and plan usage only to the first batch
          const rle = (i === 0) ? rateLimitEvents : [];
          const pu = (!planUsageSent && i === 0) ? planUsage : null;
          const result = await sendWithRetry(config.serverUrl, config.apiKey, batch, rle, pu);
          if (pu) planUsageSent = true;
          totalSent += result.inserted || batch.length;
          process.stdout.write(`  Synced ${totalSent} messages...\r`);
        }
      } else {
        // Rate-limit events only (no messages)
        const pu = !planUsageSent ? planUsage : null;
        await sendWithRetry(config.serverUrl, config.apiKey, [], rateLimitEvents, pu);
        if (pu) planUsageSent = true;
      }
    }

    state[filePath] = { offset: newOffset };
  }

  // If no files had changes but we have plan usage, send it standalone
  if (!planUsageSent && planUsage) {
    await sendWithRetry(config.serverUrl, config.apiKey, [], [], planUsage);
    planUsageSent = true;
    console.log('Synced plan usage data');
  }

  saveState(state);
  return totalSent;
}

// --- Watch mode ---

async function watch(config) {
  let chokidar;
  try {
    chokidar = require('chokidar');
  } catch {
    console.error('chokidar not installed. Run: npm install');
    process.exit(1);
  }

  const state = loadState();

  console.log(`Watching ${PROJECTS_DIR} for changes...`);

  const watcher = chokidar.watch(PROJECTS_DIR, {
    ignored: [/(^|[\/\\])\../, /subagents/],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
  });

  const processFile = async (filePath) => {
    if (!filePath.endsWith('.jsonl')) return;
    if (filePath.includes('/subagents/')) return;

    try {
      const prev = state[filePath];
      const offset = prev ? prev.offset : 0;
      const { messages, rateLimitEvents, newOffset } = parseSessionFile(filePath, offset);

      if (messages.length > 0 || rateLimitEvents.length > 0) {
        const planUsage = await fetchPlanUsage();
        await sendWithRetry(config.serverUrl, config.apiKey, messages, rateLimitEvents, planUsage);
        const parts = [];
        if (messages.length > 0) parts.push(`${messages.length} messages`);
        if (rateLimitEvents.length > 0) parts.push(`${rateLimitEvents.length} rate-limit events`);
        if (planUsage) parts.push('plan usage');
        console.log(`[${new Date().toTimeString().slice(0, 8)}] Synced ${parts.join(', ')} from ${path.basename(filePath)}`);
      }

      state[filePath] = { offset: newOffset };
      saveState(state);
    } catch (err) {
      console.error(`Error syncing ${filePath}: ${err.message}`);
    }
  };

  watcher.on('change', processFile);
  watcher.on('add', processFile);

  // Periodic plan usage sync (every 5 min, even without file changes)
  const planUsageTimer = setInterval(async () => {
    try {
      const planUsage = await fetchPlanUsage();
      if (planUsage) {
        await sendWithRetry(config.serverUrl, config.apiKey, [], [], planUsage);
        console.log(`[${new Date().toTimeString().slice(0, 8)}] Synced plan usage`);
      }
    } catch (err) {
      console.error(`Plan usage sync error: ${err.message}`);
    }
  }, PLAN_USAGE_INTERVAL_MS);

  // Keep alive
  process.on('SIGINT', () => {
    console.log('\nStopping sync agent...');
    clearInterval(planUsageTimer);
    watcher.close();
    saveState(state);
    process.exit(0);
  });
}

// --- Main ---

async function main() {
  const command = process.argv[2];

  if (command === 'setup') {
    return setup();
  }

  const config = loadConfig();
  if (!config) {
    console.error('No config found. Run: node index.js setup');
    process.exit(1);
  }

  console.log(`Claude Token Tracker Sync Agent`);
  console.log(`Server: ${config.serverUrl}\n`);

  // Initial full sync
  console.log('Running initial sync...');
  const count = await fullSync(config);
  console.log(`Initial sync complete: ${count} messages sent.\n`);

  // Start watching
  await watch(config);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
