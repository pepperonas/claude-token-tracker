const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildHistory } = require('./fixtures/history');

// The share API is the only publicly reachable surface of the tracker: an
// unauthenticated endpoint that hands sanitized project data to customer
// dashboards (OPS). These tests boot a real server — on a throwaway DB with an
// empty CLAUDE_DIR, like the other API tests — and cover the security-relevant
// behaviour: token format, expiry, CORS allowlist, rate limiting and the shape
// of the sanitized payload.

let baseUrl;
let serverInstance;
let tmpDir;
const ADMIN_KEY = 'test-share-admin-key';

function request(pathName, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(baseUrl + pathName, { method, headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch { /* keep raw */ }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

const admin = (p, opts = {}) => request(p, {
  ...opts,
  headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
});

describe('share API', () => {
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-share-test-'));
    fs.mkdirSync(path.join(tmpDir, 'claude', 'projects'), { recursive: true });
    process.env.DB_PATH = path.join(tmpDir, 'tracker.db');
    process.env.CLAUDE_DIR = path.join(tmpDir, 'claude');
    process.env.SHARE_ADMIN_KEY = ADMIN_KEY;

    for (const m of ['../lib/config', '../lib/db', '../lib/aggregator', '../server']) {
      delete require.cache[require.resolve(m)];
    }

    const { initDB, insertMessages, closeDB } = require('../lib/db');
    const { calculateCost } = require('../lib/pricing');
    initDB(process.env.DB_PATH);
    insertMessages(buildHistory({ days: 10, perDay: 4, idPrefix: 'share' }),
      (model, msg) => calculateCost(model, msg, msg.timestamp));
    closeDB();
    delete require.cache[require.resolve('../lib/db')];

    const port = 16010 + Math.floor(Math.random() * 1000);
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
    delete process.env.SHARE_ADMIN_KEY;
    for (const m of ['../lib/config', '../lib/db', '../lib/aggregator', '../server']) {
      delete require.cache[require.resolve(m)];
    }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists shareable projects for an admin key', async () => {
    const { status, body } = await admin('/api/shares/projects');
    expect(status).toBe(200);
    expect(body.map(p => p.name).sort()).toEqual(['acme/api', 'acme/web', 'tools/cli']);
    expect(body[0].messages).toBeGreaterThan(0);
    // last_activity used to come out undefined — getProjects() had no lastTs
    expect(body[0].last_activity).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('the admin key is no substitute for a valid share token', async () => {
    // Single-user mode trusts localhost (the whole API is open there), so this
    // asserts the property that must hold regardless: the PUBLIC endpoint is
    // token-only — an admin Bearer key must never unlock a revoked/unknown share.
    const { body: share } = await admin('/api/shares', {
      method: 'POST', body: { project: 'acme/web', label: 'Revoked later' }
    });
    await admin('/api/shares/' + share.id, { method: 'DELETE' });

    const withKey = await request('/api/public/share/' + share.id, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });
    expect(withKey.status).toBe(404);
    const unknownWithKey = await request('/api/public/share/' + 'b'.repeat(48), {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });
    expect(unknownWithKey.status).toBe(404);
  });

  it('does not put a wildcard CORS header on ordinary API responses', async () => {
    // A blanket `Access-Control-Allow-Origin: *` in sendJSON let any website
    // read the (unauthenticated, in single-user mode) dashboard API — and it
    // overrode the share endpoint's origin allowlist.
    for (const p of ['/api/overview', '/api/projects', '/api/shares']) {
      const r = await admin(p, { headers: { Origin: 'https://evil.example' } });
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('creates a share with a 48-char hex token and lists it', async () => {
    const { status, body } = await admin('/api/shares', {
      method: 'POST', body: { project: 'acme/web', label: 'Customer A' }
    });
    expect(status).toBe(201);
    expect(body.id).toMatch(/^[a-f0-9]{48}$/);

    const list = await admin('/api/shares');
    expect(list.body.some(s => s.id === body.id)).toBe(true);
  });

  it('serves sanitized project data without authentication', async () => {
    const { body: share } = await admin('/api/shares', {
      method: 'POST', body: { project: 'acme/api', label: 'Customer B' }
    });
    const { status, body } = await request('/api/public/share/' + share.id);

    expect(status).toBe(200);
    expect(body.label).toBe('Customer B');
    // Snake-case, explicitly whitelisted fields — nothing is spread through
    expect(Object.keys(body).sort()).toEqual(['daily', 'label', 'period', 'sessions', 'summary']);
    expect(body.summary.total_messages).toBeGreaterThan(0);
    expect(body.summary.total_cost).toBeGreaterThan(0);
    expect(Array.isArray(body.daily)).toBe(true);
    expect(Array.isArray(body.sessions)).toBe(true);
    // The internal project path must not leak — only the label the admin chose
    expect(JSON.stringify(body)).not.toContain('acme/api');
  });

  it('honours the period filter on a public share', async () => {
    const { body: share } = await admin('/api/shares', {
      method: 'POST', body: { project: 'acme/web', label: 'Ranged' }
    });
    const today = new Date();
    const iso = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    const full = await request('/api/public/share/' + share.id);
    const day = await request(`/api/public/share/${share.id}?from=${iso}&to=${iso}`);
    expect(day.body.period).toEqual({ from: iso, to: iso });
    expect(day.body.summary.total_messages).toBeLessThan(full.body.summary.total_messages);
    expect(day.body.daily.length).toBe(1);
  });

  it('rejects malformed tokens before touching the database', async () => {
    expect((await request('/api/public/share/short')).status).toBe(400);
    expect((await request('/api/public/share/' + 'z'.repeat(48))).status).toBe(400); // not hex
    expect((await request('/api/public/share/' + 'a'.repeat(48))).status).toBe(404); // well-formed, unknown
  });

  it('stops serving an expired share', async () => {
    const { body: share } = await admin('/api/shares', {
      method: 'POST', body: { project: 'tools/cli', label: 'Expiring', expires_in_days: 1 }
    });
    expect((await request('/api/public/share/' + share.id)).status).toBe(200);

    const { getDB } = require('../lib/db');
    getDB().prepare('UPDATE project_shares SET expires_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), share.id);

    expect((await request('/api/public/share/' + share.id)).status).toBe(404);
  });

  it('deleting a share revokes access immediately', async () => {
    const { body: share } = await admin('/api/shares', {
      method: 'POST', body: { project: 'acme/web', label: 'Revoked' }
    });
    expect((await request('/api/public/share/' + share.id)).status).toBe(200);

    const del = await admin('/api/shares/' + share.id, { method: 'DELETE' });
    expect(del.status).toBe(204);
    expect((await request('/api/public/share/' + share.id)).status).toBe(404);
  });

  it('requires a project when creating a share', async () => {
    const { status, body } = await admin('/api/shares', { method: 'POST', body: { label: 'No project' } });
    expect(status).toBe(400);
    expect(body.error).toMatch(/project/i);
  });

  it('echoes CORS only for allow-listed origins', async () => {
    const { body: share } = await admin('/api/shares', {
      method: 'POST', body: { project: 'acme/web', label: 'CORS' }
    });
    const allowed = await request('/api/public/share/' + share.id, { headers: { Origin: 'https://ops.celox.io' } });
    expect(allowed.headers['access-control-allow-origin']).toBe('https://ops.celox.io');

    const evil = await request('/api/public/share/' + share.id, { headers: { Origin: 'https://evil.example' } });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();

    const preflight = await request('/api/public/share/' + share.id, {
      method: 'OPTIONS', headers: { Origin: 'https://ops.celox.io' }
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-methods']).toContain('GET');
  });

  // Last: the limiter keeps per-IP state on the server, so this test uses its
  // own X-Forwarded-For address and must not run before the others.
  it('rate-limits a single client to 30 requests per minute', async () => {
    const { body: share } = await admin('/api/shares', {
      method: 'POST', body: { project: 'acme/web', label: 'Flood' }
    });
    const ip = '203.0.113.77';
    const codes = [];
    for (let i = 0; i < 32; i++) {
      const r = await request('/api/public/share/' + share.id, { headers: { 'X-Forwarded-For': ip } });
      codes.push(r.status);
    }
    expect(codes.filter(c => c === 200).length).toBe(30);
    const limited = codes.filter(c => c === 429);
    expect(limited.length).toBe(2);

    // A different client is unaffected
    const other = await request('/api/public/share/' + share.id, { headers: { 'X-Forwarded-For': '198.51.100.9' } });
    expect(other.status).toBe(200);
  });
});
