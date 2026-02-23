#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const readline = require('readline');

const HOME = process.env.HOME || require('os').homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const STATE_PATH = path.join(__dirname, '.sync-state.json');

// --- Inline parser (standalone, no imports from main project) ---

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
  try { stat = fs.statSync(filePath); } catch { return { messages: [], newOffset: fromOffset }; }
  if (stat.size <= fromOffset) return { messages: [], newOffset: fromOffset };

  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(stat.size - fromOffset);
  fs.readSync(fd, buf, 0, buf.length, fromOffset);
  fs.closeSync(fd);

  const lines = buf.toString('utf-8').split('\n');
  const msgMap = new Map();
  let sessionId = null;
  const project = extractProjectName(filePath);

  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    if (!sessionId && obj.sessionId) sessionId = obj.sessionId;

    if (obj.type === 'assistant' && obj.message) {
      const msg = obj.message;
      const usage = msg.usage;
      if (!usage) continue;

      const msgId = msg.id || obj.uuid;
      const model = msg.model || '<synthetic>';
      const timestamp = obj.timestamp;

      const tools = [];
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') tools.push(block.name);
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
        stopReason: msg.stop_reason
      });
    }
  }

  return { messages: [...msgMap.values()], newOffset: stat.size };
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

// --- HTTP request helper ---

function sendBatch(serverUrl, apiKey, messages) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(serverUrl + '/api/sync');
    const isHttps = urlObj.protocol === 'https:';
    const mod = isHttps ? https : http;

    const body = JSON.stringify({ messages });

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

async function sendWithRetry(serverUrl, apiKey, messages, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await sendBatch(serverUrl, apiKey, messages);
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

async function fullSync(config) {
  const state = loadState();
  const files = findSessionFiles();
  let totalSent = 0;

  for (const filePath of files) {
    const prev = state[filePath];
    const offset = prev ? prev.offset : 0;

    const { messages, newOffset } = parseSessionFile(filePath, offset);
    if (messages.length > 0) {
      // Send in batches of 500
      for (let i = 0; i < messages.length; i += 500) {
        const batch = messages.slice(i, i + 500);
        const result = await sendWithRetry(config.serverUrl, config.apiKey, batch);
        totalSent += result.inserted || batch.length;
        process.stdout.write(`  Synced ${totalSent} messages...\r`);
      }
    }

    state[filePath] = { offset: newOffset };
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
      const { messages, newOffset } = parseSessionFile(filePath, offset);

      if (messages.length > 0) {
        await sendWithRetry(config.serverUrl, config.apiKey, messages);
        console.log(`[${new Date().toTimeString().slice(0, 8)}] Synced ${messages.length} messages from ${path.basename(filePath)}`);
      }

      state[filePath] = { offset: newOffset };
      saveState(state);
    } catch (err) {
      console.error(`Error syncing ${filePath}: ${err.message}`);
    }
  };

  watcher.on('change', processFile);
  watcher.on('add', processFile);

  // Keep alive
  process.on('SIGINT', () => {
    console.log('\nStopping sync agent...');
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
