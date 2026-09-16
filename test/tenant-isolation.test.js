const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Multi-user mode serves several accounts from one database. These tests boot
// a real server with two accounts and assert over HTTP that a signed-in
// session reaches its own data and nothing else — the data endpoints as well
// as the instance-wide ones (share links, the share admin key, backups), which
// answer to the operator named by OWNER_GITHUB_ID.

let baseUrl;
let serverInstance;
let tmpDir;
let ownerCookie;   // alice, OWNER_GITHUB_ID
let otherCookie;   // bob, an ordinary account
const ADMIN_KEY = 'test-share-admin-key';
const OWNER_GH_ID = '1000';

function request(pathName, { method = 'GET', headers = {}, body = null, encoding = 'utf8' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(baseUrl + pathName, { method, headers }, (res) => {
      res.setEncoding(encoding);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch { /* keep raw */ }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

const asOwner = (p, opts = {}) => request(p, {
  ...opts,
  headers: { Cookie: `session=${ownerCookie}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
});
const asOther = (p, opts = {}) => request(p, {
  ...opts,
  headers: { Cookie: `session=${otherCookie}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
});

function msg(id, who, project) {
  return {
    id,
    timestamp: '2026-09-01T10:00:00.000Z',
    model: 'claude-opus-5',
    sessionId: `sess-${who}`,
    project,
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 200,
    cacheCreateTokens: 100,
    cacheCreate5m: 10,
    cacheCreate1h: 90,
    stopReason: 'end_turn',
    cost: 0.5,
    toolCounts: { Read: 1 },
  };
}

describe('tenant isolation (multi-user, over HTTP)', () => {
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-tenant-test-'));
    fs.mkdirSync(path.join(tmpDir, 'claude', 'projects'), { recursive: true });
    process.env.DB_PATH = path.join(tmpDir, 'tracker.db');
    process.env.CLAUDE_DIR = path.join(tmpDir, 'claude');
    process.env.MULTI_USER = 'true';
    process.env.SHARE_ADMIN_KEY = ADMIN_KEY;
    process.env.OWNER_GITHUB_ID = OWNER_GH_ID;
    process.env.SESSION_SECRET = 'test-session-secret';

    for (const m of ['../lib/config', '../lib/db', '../lib/aggregator', '../lib/auth', '../server']) {
      delete require.cache[require.resolve(m)];
    }

    const db = require('../lib/db');
    const { calculateCost } = require('../lib/pricing');
    db.initDB(process.env.DB_PATH);

    const alice = db.createUser({ githubId: OWNER_GH_ID, username: 'alice', displayName: 'Alice' });
    const bob = db.createUser({ githubId: '2000', username: 'bob', displayName: 'Bob' });
    const cost = (model, m) => calculateCost(model, m, m.timestamp);

    db.insertMessagesForUser(
      [msg('alice-1', 'alice', 'alice/secret-client'), msg('alice-2', 'alice', 'alice/secret-client'),
       // Both accounts happen to have a project of the same name — the case a
       // share link must not blur, because the name alone does not identify it.
       msg('alice-3', 'alice', 'common/app'), msg('alice-4', 'alice', 'common/app')],
      cost, alice.id, null);
    db.insertMessagesForUser(
      [msg('bob-1', 'bob', 'bob/hobby'), msg('bob-2', 'bob', 'common/app')], cost, bob.id, null);
    db.updateUserGithubToken(alice.id, 'gho_alice_private_token');
    db.createDevice(alice.id, 'alice-laptop');

    ownerCookie = db.createSession(alice.id).token;
    otherCookie = db.createSession(bob.id).token;

    db.closeDB();
    delete require.cache[require.resolve('../lib/db')];

    const port = 17010 + Math.floor(Math.random() * 1000);
    baseUrl = `http://localhost:${port}`;
    const { startServer } = require('../server');
    serverInstance = await startServer(port);
  });

  afterAll(() => {
    if (serverInstance) serverInstance.close();
    try { require('../lib/watcher').stop(); } catch { /* not started */ }
    try { require('../lib/db').closeDB(); } catch { /* already closed */ }
    for (const k of ['DB_PATH', 'CLAUDE_DIR', 'SHARE_ADMIN_KEY', 'OWNER_GITHUB_ID', 'SESSION_SECRET']) {
      delete process.env[k];
    }
    process.env.MULTI_USER = 'false';
    for (const m of ['../lib/config', '../lib/db', '../lib/aggregator', '../lib/auth', '../server']) {
      delete require.cache[require.resolve(m)];
    }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('database download', () => {
    it('hands each account a snapshot of its own data', async () => {
      const res = await asOther('/api/download-db', { encoding: 'latin1' });
      expect(res.status).toBe(200);
      expect(res.raw.startsWith('SQLite format 3')).toBe(true);
      expect(res.raw).toContain('bob/hobby');
      expect(res.raw).not.toContain('alice/secret-client');
      expect(res.raw).not.toContain('alice-1');
    });

    it('carries no account records, session tokens, device keys or server config', async () => {
      const res = await asOther('/api/download-db', { encoding: 'latin1' });
      expect(res.raw).not.toContain('gho_alice_private_token');
      expect(res.raw).not.toContain(ownerCookie);
      expect(res.raw).not.toContain('alice-laptop');
      // The tables holding those live nowhere in the file, not even empty.
      // SQLite stores the schema text with the name quoted and the attach
      // alias stripped, so that is the spelling to look for.
      for (const table of ['users', 'user_sessions', 'devices', 'github_cache', 'metadata']) {
        expect(res.raw).not.toContain(`CREATE TABLE "${table}"`);
      }
    });

    it('applies to the operator too — the download is data, not a server image', async () => {
      const res = await asOwner('/api/download-db', { encoding: 'latin1' });
      expect(res.status).toBe(200);
      expect(res.raw).toContain('alice/secret-client');
      expect(res.raw).not.toContain('bob/hobby');
      expect(res.raw).not.toContain('gho_alice_private_token');
    });

    it('still refuses a request without a session', async () => {
      const res = await request('/api/download-db');
      expect(res.status).toBe(401);
    });
  });

  describe('JSON export', () => {
    it('returns only the requesting account\'s messages', async () => {
      const res = await asOther('/api/export');
      expect(res.status).toBe(200);
      expect(res.body.messages.map(m => m.id).sort()).toEqual(['bob-1', 'bob-2']);
    });
  });

  describe('instance-wide functions', () => {
    it('lets the operator read the share admin key', async () => {
      const res = await asOwner('/api/share-admin-key');
      expect(res.status).toBe(200);
      expect(res.body.key).toBe(ADMIN_KEY);
    });

    it('does not hand the share admin key to another account', async () => {
      const res = await asOther('/api/share-admin-key');
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain(ADMIN_KEY);
    });

    it('does not let another account rotate the share admin key', async () => {
      const res = await asOther('/api/share-admin-key', { method: 'POST' });
      expect(res.status).toBe(403);
    });

    it('tells each session whether it operates the instance', async () => {
      const owner = await asOwner('/api/config');
      const other = await asOther('/api/config');
      const anon = await request('/api/config');
      expect(owner.body.isOperator).toBe(true);
      expect(other.body.isOperator).toBe(false);
      expect(anon.body.isOperator).toBe(false);
      // …and it stays a boolean about the requester, never the key itself.
      expect(JSON.stringify(owner.body)).not.toContain(ADMIN_KEY);
    });

    it('does not let another account trigger a server-side backup', async () => {
      const res = await asOther('/api/backup', { method: 'POST' });
      expect(res.status).toBe(403);
    });
  });

  describe('share links', () => {
    it('lists only the requesting account\'s projects as shareable', async () => {
      const mine = await asOther('/api/shares/projects');
      expect(mine.status).toBe(200);
      expect(mine.body.map(p => p.name).sort()).toEqual(['bob/hobby', 'common/app']);

      const operator = await asOwner('/api/shares/projects');
      expect(operator.body.map(p => p.name).sort())
        .toEqual(['alice/secret-client', 'bob/hobby', 'common/app']);
    });

    it('refuses to publish a project the account does not have', async () => {
      const res = await asOther('/api/shares', {
        method: 'POST', body: { project: 'alice/secret-client', label: 'not mine' }
      });
      expect(res.status).toBe(404);

      const shares = await asOwner('/api/shares');
      expect(shares.body.some(s => s.label === 'not mine')).toBe(false);
    });

    it('publishes its own project and resolves the link against its own data', async () => {
      const created = await asOther('/api/shares', {
        method: 'POST', body: { project: 'bob/hobby', label: 'Bob' }
      });
      expect(created.status).toBe(201);

      const pub = await request('/api/public/share/' + created.body.id);
      expect(pub.status).toBe(200);
      expect(pub.body.summary.total_messages).toBe(1);
    });

    it('shows an account only its own share links', async () => {
      const ownerShare = await asOwner('/api/shares', {
        method: 'POST', body: { project: 'alice/secret-client', label: 'Alice internal' }
      });
      expect(ownerShare.status).toBe(201);

      const theirs = await asOther('/api/shares');
      expect(theirs.body.some(s => s.label === 'Alice internal')).toBe(false);
      expect(theirs.body.every(s => s.label === 'Bob')).toBe(true);

      // …and cannot delete one it cannot see.
      const del = await asOther('/api/shares/' + ownerShare.body.id, { method: 'DELETE' });
      expect(del.status).toBe(404);

      const stillThere = await request('/api/public/share/' + ownerShare.body.id);
      expect(stillThere.status).toBe(200);
    });

    it('resolves a shared name against its owner, not against every account', async () => {
      // Both accounts have a project called common/app. The link belongs to
      // one of them and must report that one's numbers.
      const created = await asOther('/api/shares', {
        method: 'POST', body: { project: 'common/app', label: 'Bob common' }
      });
      expect(created.status).toBe(201);

      const pub = await request('/api/public/share/' + created.body.id);
      expect(pub.status).toBe(200);
      // Bob has one message in common/app, Alice two. Three would mean the
      // link resolved the name across every account.
      expect(pub.body.summary.total_messages).toBe(1);
    });

    it('keeps the admin key working for the instance, which is what OPS uses', async () => {
      const projects = await request('/api/shares/projects', {
        headers: { Authorization: `Bearer ${ADMIN_KEY}` }
      });
      expect(projects.status).toBe(200);
      expect(projects.body.map(p => p.name).sort())
        .toEqual(['alice/secret-client', 'bob/hobby', 'common/app']);

      const created = await request('/api/shares', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
        body: { project: 'alice/secret-client', label: 'From OPS' }
      });
      expect(created.status).toBe(201);

      const all = await request('/api/shares', { headers: { Authorization: `Bearer ${ADMIN_KEY}` } });
      expect(all.body.some(s => s.label === 'From OPS')).toBe(true);

      const del = await request('/api/shares/' + created.body.id, {
        method: 'DELETE', headers: { Authorization: `Bearer ${ADMIN_KEY}` }
      });
      expect(del.status).toBe(204);
    });
  });
});
