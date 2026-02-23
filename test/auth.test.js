const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

describe('auth', () => {
  let tmpDir, dbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-auth-test-'));
    dbPath = path.join(tmpDir, 'test.db');

    // Force multi-user mode for these tests
    process.env.MULTI_USER = 'true';

    // Clear require cache to pick up new env
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/db')];
    delete require.cache[require.resolve('../lib/auth')];

    const { initDB } = require('../lib/db');
    initDB(dbPath);
  });

  afterEach(() => {
    const { closeDB } = require('../lib/db');
    closeDB();
    fs.rmSync(tmpDir, { recursive: true, force: true });

    process.env.MULTI_USER = 'false';
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/db')];
    delete require.cache[require.resolve('../lib/auth')];
  });

  describe('user CRUD', () => {
    it('creates a user', () => {
      const { createUser, findUserByGithubId } = require('../lib/db');
      const user = createUser({
        githubId: '12345',
        username: 'testuser',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.png'
      });

      expect(user).toBeDefined();
      expect(user.github_id).toBe('12345');
      expect(user.username).toBe('testuser');
      expect(user.display_name).toBe('Test User');
      expect(user.api_key).toBeTruthy();
      expect(user.api_key.length).toBe(64); // 32 bytes hex

      const found = findUserByGithubId('12345');
      expect(found).toBeDefined();
      expect(found.id).toBe(user.id);
    });

    it('upserts on duplicate github_id', () => {
      const { createUser, findUserByGithubId } = require('../lib/db');
      const user1 = createUser({ githubId: '12345', username: 'user1', displayName: 'User 1' });
      const user2 = createUser({ githubId: '12345', username: 'user1-updated', displayName: 'User 1 Updated' });

      const found = findUserByGithubId('12345');
      expect(found.username).toBe('user1-updated');
      expect(found.display_name).toBe('User 1 Updated');
    });

    it('finds user by API key', () => {
      const { createUser, findUserByApiKey } = require('../lib/db');
      const user = createUser({ githubId: '99', username: 'keytest' });
      const found = findUserByApiKey(user.api_key);
      expect(found).toBeDefined();
      expect(found.id).toBe(user.id);
    });

    it('returns null for unknown API key', () => {
      const { findUserByApiKey } = require('../lib/db');
      expect(findUserByApiKey('nonexistent')).toBeNull();
    });

    it('regenerates API key', () => {
      const { createUser, regenerateApiKey, findUserByApiKey } = require('../lib/db');
      const user = createUser({ githubId: '42', username: 'regentest' });
      const oldKey = user.api_key;
      const newKey = regenerateApiKey(user.id);

      expect(newKey).not.toBe(oldKey);
      expect(newKey.length).toBe(64);
      expect(findUserByApiKey(oldKey)).toBeNull();
      expect(findUserByApiKey(newKey)).toBeDefined();
    });
  });

  describe('session CRUD', () => {
    it('creates and retrieves a session', () => {
      const { createUser, createSession, getSession } = require('../lib/db');
      const user = createUser({ githubId: '1', username: 'sesstest' });
      const session = createSession(user.id);

      expect(session.token).toBeTruthy();
      expect(session.token.length).toBe(64);
      expect(session.expiresAt).toBeTruthy();

      const found = getSession(session.token);
      expect(found).toBeDefined();
      expect(found.user_id).toBe(user.id);
    });

    it('returns null for expired session', () => {
      const { createUser, getSession } = require('../lib/db');
      const { getDB } = require('../lib/db');
      const user = createUser({ githubId: '2', username: 'exptest' });

      // Insert an already-expired session
      const token = crypto.randomBytes(32).toString('hex');
      const db = getDB();
      db.prepare('INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
        token, user.id, '2020-01-01T00:00:00.000Z'
      );

      expect(getSession(token)).toBeNull();
    });

    it('deletes a session', () => {
      const { createUser, createSession, getSession, deleteSession } = require('../lib/db');
      const user = createUser({ githubId: '3', username: 'deltest' });
      const session = createSession(user.id);

      deleteSession(session.token);
      expect(getSession(session.token)).toBeNull();
    });

    it('cleans expired sessions', () => {
      const { createUser, cleanExpiredSessions, getSession } = require('../lib/db');
      const { getDB } = require('../lib/db');
      const user = createUser({ githubId: '4', username: 'cleantest' });

      const token = crypto.randomBytes(32).toString('hex');
      const db = getDB();
      db.prepare('INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
        token, user.id, '2020-01-01T00:00:00.000Z'
      );

      cleanExpiredSessions();
      expect(getSession(token)).toBeNull();
    });
  });

  describe('authenticateRequest', () => {
    it('returns DUMMY_USER when MULTI_USER is false', () => {
      // Temporarily switch to single-user
      process.env.MULTI_USER = 'false';
      delete require.cache[require.resolve('../lib/config')];
      delete require.cache[require.resolve('../lib/auth')];

      const { authenticateRequest, DUMMY_USER } = require('../lib/auth');
      const req = { headers: {} };
      expect(authenticateRequest(req)).toEqual(DUMMY_USER);
    });
  });

  describe('cookie parsing', () => {
    it('parses session token from cookie', () => {
      const { parseSessionCookie } = require('../lib/auth');
      const req = { headers: { cookie: 'session=abc123; other=xyz' } };
      expect(parseSessionCookie(req)).toBe('abc123');
    });

    it('returns null for missing cookie', () => {
      const { parseSessionCookie } = require('../lib/auth');
      expect(parseSessionCookie({ headers: {} })).toBeNull();
    });

    it('returns null for cookie without session', () => {
      const { parseSessionCookie } = require('../lib/auth');
      const req = { headers: { cookie: 'other=xyz' } };
      expect(parseSessionCookie(req)).toBeNull();
    });
  });
});
