const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');
const { buildUserSnapshot, ownRows, retarget } = require('../lib/export-db');

/** One message belonging to a given account. */
function msg(id, userId) {
  return {
    id,
    timestamp: '2026-09-01T10:00:00.000Z',
    model: 'claude-opus-5',
    sessionId: `sess-${userId}`,
    project: `project-of-user-${userId}`,
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 10,
    cacheCreateTokens: 5,
    cacheCreate5m: 1,
    cacheCreate1h: 4,
    stopReason: 'end_turn',
    cost: 0.12,
    toolCounts: { Read: 2, Write: 1 },
  };
}

function open(file) {
  return new Database(file, { readonly: true });
}

/** Re-require the config-sensitive modules under a given mode. */
function reload(multiUser) {
  process.env.MULTI_USER = multiUser ? 'true' : 'false';
  delete require.cache[require.resolve('../lib/config')];
  delete require.cache[require.resolve('../lib/db')];
  return require('../lib/db');
}

describe('export-db', () => {
  describe('row filter', () => {
    it('scopes to one account id in multi-user mode', () => {
      expect(ownRows('user_id', true)).toContain('@uid');
    });

    it('treats NULL and 0 as the local account in single-user mode', () => {
      const sql = ownRows('user_id', false);
      expect(sql).toContain('IS NULL');
      expect(sql).toContain("'0'");
      expect(sql).not.toContain('@uid');
    });

    it('yields nothing when a multi-user database cannot attribute the rows', () => {
      expect(ownRows('user_id', true, false)).toBe('1=0');
    });

    // better-sqlite3 binds a JS number as REAL: CAST(@uid AS TEXT) is '1.0',
    // which matches no row and produces a silently empty snapshot. Only the
    // column may be cast; the parameter arrives as TEXT.
    it('casts the column, never the bound parameter', () => {
      const sql = ownRows('user_id', true);
      expect(sql).toBe('CAST(user_id AS TEXT) = @uid');
      expect(sql).not.toMatch(/CAST\(\s*@uid/);
    });

    it('yields everything when a single-user database has no account column', () => {
      expect(ownRows('user_id', false, false)).toBe('1=1');
    });
  });

  describe('schema retargeting', () => {
    it('points the create statement at the attached database', () => {
      const out = retarget('CREATE TABLE messages (id TEXT PRIMARY KEY)', 'messages', 'snap_x');
      expect(out).toBe('CREATE TABLE snap_x."messages" (id TEXT PRIMARY KEY)');
    });

    it('handles IF NOT EXISTS and quoting', () => {
      const out = retarget('CREATE TABLE IF NOT EXISTS "messages" (id TEXT)', 'messages', 'snap_x');
      expect(out).toBe('CREATE TABLE snap_x."messages" (id TEXT)');
    });

    it('leaves the column body untouched', () => {
      const body = '(message_id TEXT NOT NULL, FOREIGN KEY (message_id) REFERENCES messages(id))';
      const out = retarget(`CREATE TABLE message_tools ${body}`, 'message_tools', 'snap_x');
      expect(out).toContain(body);
    });

    it('refuses a statement that is not the expected table', () => {
      expect(() => retarget('CREATE TABLE other (id TEXT)', 'messages', 'snap_x'))
        .toThrow(/Unexpected schema/);
    });
  });

  describe('multi-user snapshot', () => {
    let tmpDir, db;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-export-test-'));
      db = reload(true);
      db.initDB(path.join(tmpDir, 'test.db'));

      const cost = (m) => m.cost || 0;
      db.insertMessagesForUser([msg('a1', 1), msg('a2', 1)], cost, 1, null);
      db.insertMessagesForUser([msg('b1', 2), msg('b2', 2), msg('b3', 2)], cost, 2, null);
      db.insertRateLimitEventsForUser(
        [{ id: 'rl-a', timestamp: '2026-09-01T11:00:00.000Z', sessionId: 'sess-1', project: 'p' }], 1, null);
      db.insertRateLimitEventsForUser(
        [{ id: 'rl-b', timestamp: '2026-09-01T11:00:00.000Z', sessionId: 'sess-2', project: 'p' }], 2, null);
      db.unlockAchievementsBatch(1, ['first_message']);
      db.unlockAchievementsBatch(2, ['first_message', 'first_session']);
      db.createProjectAlias(1, 'old-name', 'project-of-user-1');
      db.createProjectAlias(2, 'other-old', 'project-of-user-2');
    });

    afterEach(() => {
      db.closeDB();
      fs.rmSync(tmpDir, { recursive: true, force: true });
      reload(false);
    });

    it("carries only the requesting account's messages", () => {
      const file = buildUserSnapshot(db.getDB(), { userId: 1, multiUser: true, dir: tmpDir });
      const snap = open(file);
      const rows = snap.prepare('SELECT id, project FROM messages ORDER BY id').all();
      snap.close();
      expect(rows.map(r => r.id)).toEqual(['a1', 'a2']);
      expect(rows.every(r => r.project === 'project-of-user-1')).toBe(true);
    });

    it("carries only the requesting account's tool rows", () => {
      const file = buildUserSnapshot(db.getDB(), { userId: 1, multiUser: true, dir: tmpDir });
      const snap = open(file);
      const ids = snap.prepare('SELECT DISTINCT message_id FROM message_tools ORDER BY message_id').all();
      snap.close();
      expect(ids.map(r => r.message_id)).toEqual(['a1', 'a2']);
    });

    it("carries only the requesting account's rate-limit events, achievements and aliases", () => {
      const file = buildUserSnapshot(db.getDB(), { userId: 2, multiUser: true, dir: tmpDir });
      const snap = open(file);
      const rl = snap.prepare('SELECT id FROM rate_limit_events').all().map(r => r.id);
      const ach = snap.prepare('SELECT achievement_key FROM achievements ORDER BY achievement_key').all();
      const aliases = snap.prepare('SELECT alias FROM project_aliases').all().map(r => r.alias);
      snap.close();
      expect(rl).toEqual(['rl-b']);
      expect(ach.map(a => a.achievement_key)).toEqual(['first_message', 'first_session']);
      expect(aliases).toEqual(['other-old']);
    });

    it('never carries accounts, sessions, devices, cache, metadata or shares', () => {
      db.createUser({ githubId: '999', username: 'someone', displayName: 'Someone', avatarUrl: '' });
      db.createDevice(1, 'laptop');
      db.setMetadata('anthropic_key_encrypted', 'super-secret');

      const file = buildUserSnapshot(db.getDB(), { userId: 1, multiUser: true, dir: tmpDir });
      const snap = open(file);
      const tables = snap.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
      snap.close();

      for (const forbidden of ['users', 'user_sessions', 'devices', 'github_cache', 'metadata', 'parse_state', 'project_shares']) {
        expect(tables).not.toContain(forbidden);
      }
      expect(tables.sort()).toEqual(
        ['achievements', 'message_tools', 'messages', 'project_aliases', 'rate_limit_events']);
    });

    it("leaks no foreign byte: the raw file holds nothing of another account", () => {
      db.createUser({ githubId: '999', username: 'someone', displayName: 'Someone', avatarUrl: '' });
      db.updateUserGithubToken(1, 'gho_secret_token_value');

      const file = buildUserSnapshot(db.getDB(), { userId: 1, multiUser: true, dir: tmpDir });
      const raw = fs.readFileSync(file).toString('latin1');

      expect(raw).toContain('project-of-user-1');
      expect(raw).not.toContain('project-of-user-2');
      expect(raw).not.toContain('rl-b');
      expect(raw).not.toContain('gho_secret_token_value');
      expect(raw).not.toContain('someone');
    });

    it('produces an empty but valid snapshot for an account with no data', () => {
      const file = buildUserSnapshot(db.getDB(), { userId: 4242, multiUser: true, dir: tmpDir });
      const snap = open(file);
      expect(snap.prepare('SELECT COUNT(*) c FROM messages').get().c).toBe(0);
      expect(snap.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok');
      snap.close();
    });

    it('writes a distinct file per call so parallel downloads cannot collide', () => {
      const a = buildUserSnapshot(db.getDB(), { userId: 1, multiUser: true, dir: tmpDir });
      const b = buildUserSnapshot(db.getDB(), { userId: 1, multiUser: true, dir: tmpDir });
      expect(a).not.toBe(b);
      expect(fs.existsSync(a)).toBe(true);
      expect(fs.existsSync(b)).toBe(true);
    });

    it('detaches afterwards so the live connection stays usable', () => {
      buildUserSnapshot(db.getDB(), { userId: 1, multiUser: true, dir: tmpDir });
      const attached = db.getDB().prepare('PRAGMA database_list').all().map(r => r.name);
      expect(attached).toEqual(['main']);
      expect(db.getDB().prepare('SELECT COUNT(*) c FROM messages').get().c).toBe(5);
    });
  });

  describe('single-user snapshot', () => {
    let tmpDir, db;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-export-single-'));
      db = reload(false);
      db.initDB(path.join(tmpDir, 'test.db'));
    });

    afterEach(() => {
      db.closeDB();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("carries the local account's rows even without an account column", () => {
      db.insertMessages([msg('local-1', 0), msg('local-2', 0)], (m) => m.cost || 0);
      db.unlockAchievementsBatch(0, ['first_message']);

      const file = buildUserSnapshot(db.getDB(), { userId: 0, multiUser: false, dir: tmpDir });
      const snap = open(file);
      const ids = snap.prepare('SELECT id FROM messages ORDER BY id').all().map(r => r.id);
      const tools = snap.prepare('SELECT COUNT(*) c FROM message_tools').get().c;
      const ach = snap.prepare('SELECT COUNT(*) c FROM achievements').get().c;
      snap.close();

      expect(ids).toEqual(['local-1', 'local-2']);
      expect(tools).toBe(4);
      expect(ach).toBe(1);
    });

    it('still leaves out server state', () => {
      db.insertMessages([msg('local-1', 0)], (m) => m.cost || 0);
      db.setMetadata('anthropic_key_encrypted', 'super-secret');

      const file = buildUserSnapshot(db.getDB(), { userId: 0, multiUser: false, dir: tmpDir });
      expect(fs.readFileSync(file).toString('latin1')).not.toContain('super-secret');
    });
  });
});
