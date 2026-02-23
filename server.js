const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { PORT, STATS_CACHE_FILE } = require('./lib/config');
const { parseAll } = require('./lib/parser');
const Aggregator = require('./lib/aggregator');
const { calculateCost } = require('./lib/pricing');
const { initDB, insertMessages, getAllMessages, getParseState, setParseState, closeDB } = require('./lib/db');
const Watcher = require('./lib/watcher');

const PUBLIC_DIR = path.join(__dirname, 'public');

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

// 1. Initialize DB
initDB();

// 2. Load existing messages from SQLite
const aggregator = new Aggregator();
const existingMessages = getAllMessages();
if (existingMessages.length > 0) {
  aggregator.addMessages(existingMessages);
  console.log(`Loaded ${existingMessages.length} messages from database`);
}

// 3. Parse new JSONL data incrementally
const t0 = Date.now();
const savedParseState = getParseState();
const { messages: newMessages, parseState: newParseState } = parseAll(savedParseState);
let parseState = newParseState;

if (newMessages.length > 0) {
  // Filter out messages already in DB
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

// Start file watcher
const watcher = new Watcher(aggregator, parseState, (newMsgs) => {
  insertMessages(newMsgs, calculateCost);
  setParseState(parseState);
});
watcher.start();

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

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query = parsed.query;

  // API routes
  if (pathname === '/api/overview') {
    return sendJSON(res, aggregator.getOverview(query.from, query.to));
  }

  if (pathname === '/api/daily') {
    return sendJSON(res, aggregator.getDaily(query.from, query.to));
  }

  if (pathname === '/api/daily-by-model') {
    return sendJSON(res, aggregator.getDailyByModel(query.from, query.to));
  }

  if (pathname === '/api/sessions') {
    return sendJSON(res, aggregator.getSessions(query.project, query.model));
  }

  if (pathname.startsWith('/api/session/')) {
    const id = pathname.split('/api/session/')[1];
    const session = aggregator.getSession(id);
    if (!session) return sendJSON(res, { error: 'Not found' }, 404);
    return sendJSON(res, session);
  }

  if (pathname === '/api/projects') {
    return sendJSON(res, aggregator.getProjects());
  }

  if (pathname === '/api/models') {
    return sendJSON(res, aggregator.getModels());
  }

  if (pathname === '/api/tools') {
    return sendJSON(res, aggregator.getTools());
  }

  if (pathname === '/api/hourly') {
    return sendJSON(res, aggregator.getHourly());
  }

  // Insights API endpoints
  if (pathname === '/api/stop-reasons') {
    return sendJSON(res, aggregator.getStopReasons());
  }

  if (pathname === '/api/day-of-week') {
    return sendJSON(res, aggregator.getDayOfWeek());
  }

  if (pathname === '/api/cache-efficiency') {
    return sendJSON(res, aggregator.getCacheEfficiency(query.from, query.to));
  }

  if (pathname === '/api/cumulative-cost') {
    return sendJSON(res, aggregator.getCumulativeCost(query.from, query.to));
  }

  if (pathname === '/api/daily-cost-breakdown') {
    return sendJSON(res, aggregator.getDailyCostBreakdown(query.from, query.to));
  }

  if (pathname === '/api/session-efficiency') {
    return sendJSON(res, aggregator.getSessionEfficiency());
  }

  // Claude's own stats-cache with cost calculation
  if (pathname === '/api/stats-cache') {
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
    watcher.addSSEClient(res);
    return;
  }

  if (pathname === '/api/rebuild' && req.method === 'POST') {
    aggregator.reset();
    const t0 = Date.now();
    const { messages, parseState: newState } = parseAll({});
    Object.assign(parseState, newState);
    aggregator.addMessages(messages);
    insertMessages(messages, calculateCost);
    setParseState(parseState);
    return sendJSON(res, { rebuilt: true, messages: messages.length, timeMs: Date.now() - t0 });
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

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);

  // Prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  serveStatic(res, filePath);
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
  closeDB();
  process.exit(0);
});

module.exports = { server, startServer, aggregator };
