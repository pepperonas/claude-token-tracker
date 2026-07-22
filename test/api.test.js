const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildHistory } = require('./fixtures/history');

// We test the API by making HTTP requests to the server.
//
// The server is booted against a THROWAWAY database and an empty CLAUDE_DIR
// (both via env, resolved in lib/config at require time). Previously it booted
// on the real `data/tracker.db`: the suite was slow, depended on the developer
// having local data — CI, with an empty DB, failed on the achievement test —
// and `POST /api/achievements/recompute` rewrote the real achievements table.
let baseUrl;
let serverInstance;
let tmpDir;

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(baseUrl + path, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

function post(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(baseUrl + path, { method: 'POST' }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('API endpoints', () => {
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-api-test-'));
    fs.mkdirSync(path.join(tmpDir, 'claude', 'projects'), { recursive: true });
    process.env.DB_PATH = path.join(tmpDir, 'tracker.db');
    process.env.CLAUDE_DIR = path.join(tmpDir, 'claude');

    // config/db/aggregator cache their env-derived state at require time
    for (const m of ['../lib/config', '../lib/db', '../lib/aggregator', '../server']) {
      delete require.cache[require.resolve(m)];
    }

    // Seed a 45-day history BEFORE booting: the server streams the DB into the
    // aggregator on startup, so the endpoints (and the achievement backfill)
    // see a real, multi-day dataset.
    const { initDB, insertMessages, closeDB } = require('../lib/db');
    const { calculateCost } = require('../lib/pricing');
    initDB(process.env.DB_PATH);
    insertMessages(buildHistory({ days: 45, perDay: 6 }), (model, msg) => calculateCost(model, msg, msg.timestamp));
    closeDB();
    delete require.cache[require.resolve('../lib/db')];

    // Use dynamic port to avoid conflicts
    // High range avoids well-known occupied ports (5900 = macOS Screen Sharing
    // sat inside the old 5010–6009 range and made this hook time out flakily)
    const port = 15010 + Math.floor(Math.random() * 1000);
    baseUrl = `http://localhost:${port}`;

    const { startServer } = require('../server');
    serverInstance = await startServer(port);
  });

  afterAll(() => {
    if (serverInstance) serverInstance.close();
    try { require('../lib/watcher').stop(); } catch { /* not started */ }
    try { require('../lib/db').closeDB(); } catch { /* already closed */ }
    delete process.env.DB_PATH;
    delete process.env.CLAUDE_DIR;
    for (const m of ['../lib/config', '../lib/db', '../lib/aggregator', '../server']) {
      delete require.cache[require.resolve(m)];
    }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/overview returns overview data', async () => {
    const { status, body } = await get('/api/overview');
    expect(status).toBe(200);
    expect(body).toHaveProperty('totalTokens');
    expect(body).toHaveProperty('estimatedCost');
    expect(body).toHaveProperty('sessions');
    expect(body).toHaveProperty('messages');
  });

  it('GET /api/overview supports date filtering', async () => {
    const { status, body } = await get('/api/overview?from=2026-02-20&to=2026-02-22');
    expect(status).toBe(200);
    expect(typeof body.totalTokens).toBe('number');
  });

  it('GET /api/daily returns daily data', async () => {
    const { status, body } = await get('/api/daily');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /api/achievements/recompute backdates unlocks to historical days', async () => {
    const { status, body } = await post('/api/achievements/recompute');
    expect(status).toBe(200);
    expect(body.recomputed).toBe(true);
    expect(body.unlocked).toBeGreaterThan(0);
    expect(body.days).toBeGreaterThan(0);
    // Unlocks must be SPREAD across the history (the bug was: everything
    // stamped on one init day). Achievements genuinely earned today may
    // legitimately carry today's date, so assert distribution instead.
    const { status: s2, body: achs } = await get('/api/achievements');
    expect(s2).toBe(200);
    const unlockedDays = achs.filter(x => x.unlocked).map(a => a.unlockedAt.slice(0, 10));
    const distinct = new Set(unlockedDays);
    expect(distinct.size).toBeGreaterThan(1);
    const today = new Date().toISOString().slice(0, 10);
    expect([...distinct].sort()[0] < today).toBe(true);
    // No single day may hold ALL unlocks
    const counts = {};
    for (const d of unlockedDays) counts[d] = (counts[d] || 0) + 1;
    expect(Math.max(...Object.values(counts))).toBeLessThan(unlockedDays.length);
  });

  it('GET /api/trends returns now-anchored trend comparisons', async () => {
    const { status, body } = await get('/api/trends');
    expect(status).toBe(200);
    expect(body).toHaveProperty('generatedAt');
    for (const k of ['today', 'week', 'month', 'rolling7']) {
      expect(body[k]).toHaveProperty('current');
      expect(body[k]).toHaveProperty('prevSame');
      expect(body[k]).toHaveProperty('prevFull');
      expect(body[k].current).toHaveProperty('tokens');
      expect(body[k].current).toHaveProperty('tokensNoCache');
      expect(body[k].current).toHaveProperty('cost');
      expect(body[k].current).toHaveProperty('costNoCache');
      expect(body[k].current).toHaveProperty('messages');
      expect(body[k].current).toHaveProperty('activeMin');
      expect(body[k].series).toHaveProperty('cur');
      expect(body[k].series).toHaveProperty('prev');
    }
    expect(body.today.series.cur.length).toBe(24);
    expect(body.week.series.cur.length).toBe(7);
    expect(typeof body.month.elapsedFraction).toBe('number');
    // Trend charts ride on the same payload (one scan, one request)
    expect(body.daily90.length).toBe(90);
    expect(body.daily90[89]).toHaveProperty('date');
    expect(body.daily90[89]).toHaveProperty('tokensNoCache');
    expect(body.momentum.windowDays).toBe(7);
    expect(Array.isArray(body.momentum.projects)).toBe(true);
    expect(Array.isArray(body.momentum.models)).toBe(true);
  });

  it('GET /api/daily-by-model returns model breakdown', async () => {
    const { status, body } = await get('/api/daily-by-model');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/sessions returns sessions', async () => {
    const { status, body } = await get('/api/sessions');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/projects returns projects', async () => {
    const { status, body } = await get('/api/projects');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/models returns models', async () => {
    const { status, body } = await get('/api/models');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/tools returns tools', async () => {
    const { status, body } = await get('/api/tools');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/hourly returns 24 hours', async () => {
    const { status, body } = await get('/api/hourly');
    expect(status).toBe(200);
    expect(body).toHaveLength(24);
  });

  // Insights endpoints
  it('GET /api/stop-reasons returns stop reason data', async () => {
    const { status, body } = await get('/api/stop-reasons');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/day-of-week returns 7 days', async () => {
    const { status, body } = await get('/api/day-of-week');
    expect(status).toBe(200);
    expect(body).toHaveLength(7);
  });

  it('GET /api/cache-efficiency returns efficiency data', async () => {
    const { status, body } = await get('/api/cache-efficiency');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/cumulative-cost returns cumulative data', async () => {
    const { status, body } = await get('/api/cumulative-cost');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/daily-cost-breakdown returns breakdown', async () => {
    const { status, body } = await get('/api/daily-cost-breakdown');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/session-efficiency returns efficiency', async () => {
    const { status, body } = await get('/api/session-efficiency');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/session/:id returns 404 for unknown session', async () => {
    const { status, body } = await get('/api/session/nonexistent-session-id');
    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('POST /api/rebuild rebuilds data', { timeout: 30000 }, async () => {
    const { status, body } = await post('/api/rebuild');
    expect(status).toBe(200);
    expect(body.rebuilt).toBe(true);
    expect(typeof body.messages).toBe('number');
  });

  it('GET /api/productivity returns productivity metrics', async () => {
    const { status, body } = await get('/api/productivity');
    expect(status).toBe(200);
    expect(body).toHaveProperty('tokensPerMin');
    expect(body).toHaveProperty('linesPerHour');
    expect(body).toHaveProperty('msgsPerSession');
    expect(body).toHaveProperty('costPerLine');
    expect(body).toHaveProperty('cacheSavings');
    expect(body).toHaveProperty('codeRatio');
    expect(body).toHaveProperty('codingHours');
    expect(body).toHaveProperty('totalLines');
    expect(body).toHaveProperty('trends');
    expect(body).toHaveProperty('dailyProductivity');
    expect(body).toHaveProperty('stopReasons');
    expect(Array.isArray(body.dailyProductivity)).toBe(true);
    expect(Array.isArray(body.stopReasons)).toBe(true);
  });

  it('GET /api/productivity supports date filtering', async () => {
    const { status, body } = await get('/api/productivity?from=2026-02-20&to=2026-02-22');
    expect(status).toBe(200);
    expect(typeof body.tokensPerMin).toBe('number');
    expect(typeof body.linesPerHour).toBe('number');
  });

  it('GET /api/efficiency-trend returns daily and rolling data', async () => {
    const { status, body } = await get('/api/efficiency-trend');
    expect(status).toBe(200);
    expect(body).toHaveProperty('daily');
    expect(body).toHaveProperty('rolling');
    expect(Array.isArray(body.daily)).toBe(true);
  });

  it('GET /api/model-efficiency returns per-model data', async () => {
    const { status, body } = await get('/api/model-efficiency');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/session-depth returns session scatter data', async () => {
    const { status, body } = await get('/api/session-depth');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/export-html returns HTML document', async () => {
    const res = await new Promise((resolve, reject) => {
      http.get(baseUrl + '/api/export-html', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
      }).on('error', reject);
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<!DOCTYPE html>');
    expect(res.body).toContain('Claude Token Tracker');
  });

  // --- Assertions against the seeded 45-day history (see fixtures/history.js) --
  // These check actual numbers, not just response shapes: the endpoints are the
  // contract the frontend renders, so a silent aggregation change must fail here.

  it('GET /api/overview reports the full seeded history', async () => {
    const { body } = await get('/api/overview');
    expect(body.messages).toBe(45 * 6);
    expect(body.sessions).toBe(45 * 2);            // 2 session ids per day
    expect(body.totalTokens).toBeGreaterThan(0);
    expect(body.estimatedCost).toBeGreaterThan(0);
    expect(body.activeDays).toBe(45);
    expect(body.totalActiveMin).toBeGreaterThan(0);
    expect(body.avgActiveMinPerDay).toBe(Math.round(body.totalActiveMin / body.activeDays));
  });

  it('GET /api/projects returns the seeded projects, sorted by tokens', async () => {
    const { body } = await get('/api/projects');
    const names = body.map(p => p.name).sort();
    expect(names).toEqual(['acme/api', 'acme/web', 'tools/cli']);
    for (let i = 1; i < body.length; i++) {
      expect(body[i - 1].totalTokens).toBeGreaterThanOrEqual(body[i].totalTokens);
    }
  });

  it('GET /api/models splits the history across the three seeded models', async () => {
    const { body } = await get('/api/models');
    expect(body.length).toBe(3);
    const msgs = body.reduce((s, m) => s + m.messages, 0);
    expect(msgs).toBe(45 * 6);
    for (const m of body) expect(m.label).toBeTruthy();
  });

  it('GET /api/daily covers every seeded day and sums to the overview', async () => {
    const [{ body: daily }, { body: overview }] = await Promise.all([get('/api/daily'), get('/api/overview')]);
    expect(daily.length).toBe(45);
    expect(daily.reduce((s, d) => s + d.messages, 0)).toBe(overview.messages);
    // sorted ascending, no duplicates
    const dates = daily.map(d => d.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(45);
  });

  it('GET /api/trends anchors daily90 on today and ends with the seeded data', async () => {
    const { body } = await get('/api/trends');
    const today = new Date();
    const iso = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
    expect(body.daily90[89].date).toBe(iso);
    expect(body.daily90[89].messages).toBe(6);              // today's seeded batch
    // 45 days of history inside a 90-day window
    expect(body.daily90.filter(d => d.messages > 0).length).toBe(45);
    expect(body.momentum.projects.length).toBe(3);
    expect(body.momentum.models.length).toBe(3);
  });

  it('GET /api/hourly-weekday returns a grid consistent with /api/overview', async () => {
    const [{ body: grid }, { body: overview }] = await Promise.all([get('/api/hourly-weekday'), get('/api/overview')]);
    expect(grid.weekdays.length).toBe(7);
    let messages = 0, maxTokens = 0;
    for (const row of grid.weekdays) {
      expect(row.hours.length).toBe(24);
      for (const cell of row.hours) {
        messages += cell.messages;
        maxTokens = Math.max(maxTokens, cell.tokens);
      }
    }
    expect(messages).toBe(overview.messages);
    expect(grid.maxTokens).toBe(maxTokens);
  });

  it('GET /api/project-detail returns one project\'s slice of the history', async () => {
    const { status, body } = await get('/api/project-detail?name=' + encodeURIComponent('acme/web'));
    expect(status).toBe(200);
    expect(body.name).toBe('acme/web');
    expect(body.messages).toBeGreaterThan(0);
    expect(body.messages).toBeLessThan(45 * 6);
    expect(Array.isArray(body.daily)).toBe(true);
    expect(Array.isArray(body.sessionList)).toBe(true);
    expect(body.sessions).toBeGreaterThan(0);          // count, not a list
    expect(body.totalActiveMin).toBeGreaterThanOrEqual(0);
    expect(Object.keys(body.models).length).toBeGreaterThan(0);
  });

  it('GET /api/tool-stats aggregates the seeded tool calls with cost attribution', async () => {
    const { body } = await get('/api/tool-stats');
    expect(Array.isArray(body)).toBe(true);
    const byName = Object.fromEntries(body.map(t => [t.name, t]));
    expect(Object.keys(byName)).toEqual(expect.arrayContaining(['Read', 'Bash', 'Edit', 'Write', 'Grep']));
    expect(byName.Read.calls).toBeGreaterThan(0);
    expect(byName.Read.type).toBe('built-in');
    expect(byName.Read.cost).toBeGreaterThan(0);
    // Percentages of a full listing add up to ~100
    expect(body.reduce((s, t) => s + t.percentage, 0)).toBeCloseTo(100, 0);
    // The MCP tool must be typed as such, not as built-in
    const mcp = body.find(t => t.name.startsWith('mcp__'));
    expect(mcp.type).toBe('mcp');
    expect(mcp.server).toBeTruthy();
  });

  it('GET /api/mcp-servers groups the seeded mcp__ tool under its server', async () => {
    const { status, body } = await get('/api/mcp-servers');
    expect(status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].name).toBe('playwright');
    expect(body[0].totalCalls).toBeGreaterThan(0);
    expect(body[0].tools.map(t => t.name)).toContain('browser_click');
  });

  it('GET /api/subagent-stats counts the seeded sub-agent messages', async () => {
    const [{ status, body }, { body: overview }] = await Promise.all([get('/api/subagent-stats'), get('/api/overview')]);
    expect(status).toBe(200);
    expect(body.messages).toBeGreaterThan(0);
    expect(body.messages).toBeLessThan(overview.messages);
    expect(body.pctMessages).toBeCloseTo(body.messages / overview.messages * 100, 0);
    expect(Array.isArray(body.daily)).toBe(true);
  });

  it('GET /api/pricing is public and reports the resolution source', async () => {
    const { status, body } = await get('/api/pricing');
    expect(status).toBe(200);
    expect(body).toHaveProperty('source');
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThan(0);
    for (const m of body.models.slice(0, 5)) {
      expect(['litellm', 'fallback']).toContain(m.origin);
    }
  });

  it('period filtering narrows the result set', async () => {
    const { body: all } = await get('/api/overview');
    const today = new Date();
    const iso = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
    const { body: oneDay } = await get(`/api/overview?from=${iso}&to=${iso}`);
    expect(oneDay.messages).toBe(6);
    expect(oneDay.messages).toBeLessThan(all.messages);
    expect(oneDay.totalTokens).toBeLessThan(all.totalTokens);
  });

  it('unknown API routes 404 instead of falling through to the SPA', async () => {
    const { status } = await get('/api/definitely-not-a-route');
    expect(status).toBe(404);
  });

  it('prevents path traversal on static files', async () => {
    const { status } = await get('/../package.json');
    // Should either return 403 or a regular 404 (path normalization)
    expect([403, 404]).toContain(status);
  });
});
