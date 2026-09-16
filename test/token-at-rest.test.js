const path = require('path');
const fs = require('fs');
const os = require('os');

// OAuth access tokens are held encrypted in the users table. What matters
// beyond "it is encrypted" is that an account whose token was stored before
// that keeps working — in place, without anyone having to sign in again.

const SECRET = 'test-session-secret';

function reload({ multiUser = true, secret = SECRET } = {}) {
  process.env.MULTI_USER = multiUser ? 'true' : 'false';
  if (secret === null) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = secret;
  for (const m of ['../lib/config', '../lib/secret-box', '../lib/db', '../lib/github']) {
    delete require.cache[require.resolve(m)];
  }
  return { db: require('../lib/db'), box: require('../lib/secret-box'), github: require('../lib/github') };
}

describe('OAuth tokens at rest', () => {
  let tmpDir, dbPath, db, box, github;
  const ORIGINAL_SECRET = process.env.SESSION_SECRET;

  function boot(opts) {
    ({ db, box, github } = reload(opts));
    db.initDB(dbPath);
  }

  /** Writes a token straight into the column, the way it was stored before. */
  function storePlaintext(userId, token) {
    db.getDB().prepare('UPDATE users SET github_token = ? WHERE id = ?').run(token, userId);
  }
  const column = (userId) =>
    db.getDB().prepare('SELECT github_token FROM users WHERE id = ?').get(userId).github_token;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-token-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    boot();
  });

  afterEach(() => {
    try { db.closeDB(); } catch { /* already closed */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env.MULTI_USER = 'false';
    if (ORIGINAL_SECRET === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = ORIGINAL_SECRET;
    for (const m of ['../lib/config', '../lib/secret-box', '../lib/db', '../lib/github']) {
      delete require.cache[require.resolve(m)];
    }
  });

  describe('storing', () => {
    it('never leaves the token readable in the column', () => {
      const user = db.createUser({ githubId: '1', username: 'alice' });
      db.updateUserGithubToken(user.id, 'gho_alice_token');

      expect(column(user.id)).not.toContain('gho_alice_token');
      expect(box.isEncrypted(column(user.id))).toBe(true);
      expect(db.readGithubToken(column(user.id))).toBe('gho_alice_token');
    });

    it('does not leave it in the file either', () => {
      const user = db.createUser({ githubId: '1', username: 'alice' });
      db.updateUserGithubToken(user.id, 'gho_alice_token');
      db.closeDB();
      expect(fs.readFileSync(dbPath).toString('latin1')).not.toContain('gho_alice_token');
    });

    it('clears the column when the token is removed', () => {
      const user = db.createUser({ githubId: '1', username: 'alice' });
      db.updateUserGithubToken(user.id, 'gho_alice_token');
      db.updateUserGithubToken(user.id, null);
      expect(column(user.id)).toBeNull();
      expect(db.readGithubToken(column(user.id))).toBeNull();
    });
  });

  describe('accounts that predate encryption', () => {
    it('keeps working before the migration has run', () => {
      // The value is still in the clear in the column, and the read path must
      // hand it over unchanged — otherwise those accounts break the moment the
      // code ships and before any migration touches them.
      const user = db.createUser({ githubId: '1', username: 'legacy' });
      storePlaintext(user.id, 'gho_legacy_token');

      expect(db.readGithubToken(column(user.id))).toBe('gho_legacy_token');
      expect(github.getToken({ github_token: column(user.id) })).toBe('gho_legacy_token');
    });

    it('is migrated in place, with the same token still usable afterwards', () => {
      const a = db.createUser({ githubId: '1', username: 'legacy-a' });
      const b = db.createUser({ githubId: '2', username: 'legacy-b' });
      storePlaintext(a.id, 'gho_token_a');
      storePlaintext(b.id, 'gho_token_b');

      expect(db.encryptStoredGithubTokens()).toBe(2);

      expect(box.isEncrypted(column(a.id))).toBe(true);
      expect(box.isEncrypted(column(b.id))).toBe(true);
      expect(github.getToken({ github_token: column(a.id) })).toBe('gho_token_a');
      expect(github.getToken({ github_token: column(b.id) })).toBe('gho_token_b');
    });

    it('runs by itself when the database is opened', () => {
      const user = db.createUser({ githubId: '1', username: 'legacy' });
      storePlaintext(user.id, 'gho_on_boot');
      db.closeDB();

      boot(); // a restart, nothing else
      expect(box.isEncrypted(column(user.id))).toBe(true);
      expect(github.getToken({ github_token: column(user.id) })).toBe('gho_on_boot');
    });

    it('is idempotent — a second pass re-encrypts nothing', () => {
      const user = db.createUser({ githubId: '1', username: 'legacy' });
      storePlaintext(user.id, 'gho_once');
      expect(db.encryptStoredGithubTokens()).toBe(1);
      const stored = column(user.id);

      expect(db.encryptStoredGithubTokens()).toBe(0);
      expect(column(user.id)).toBe(stored); // untouched, not re-wrapped
    });

    it('leaves accounts without a token alone', () => {
      db.createUser({ githubId: '1', username: 'no-token' });
      expect(db.encryptStoredGithubTokens()).toBe(0);
    });
  });

  describe('when the token cannot be decrypted', () => {
    it('yields null rather than a value that would be sent to GitHub', () => {
      // A rotated SESSION_SECRET is the realistic case. The account is not
      // broken — the next sign-in stores a fresh token — but until then the
      // GitHub panel must stay empty instead of authenticating with garbage.
      const user = db.createUser({ githubId: '1', username: 'alice' });
      db.updateUserGithubToken(user.id, 'gho_alice_token');
      const stored = column(user.id);
      db.closeDB();

      boot({ secret: 'a-different-secret' });
      expect(github.getToken({ github_token: stored })).toBeNull();
      expect(db.readGithubToken(stored)).toBeNull();
    });

    it('a fresh sign-in makes the account whole again', () => {
      const user = db.createUser({ githubId: '1', username: 'alice' });
      db.updateUserGithubToken(user.id, 'gho_old');
      db.closeDB();

      boot({ secret: 'a-different-secret' });
      expect(github.getToken({ github_token: column(user.id) })).toBeNull();

      db.updateUserGithubToken(user.id, 'gho_new_after_login');
      expect(github.getToken({ github_token: column(user.id) })).toBe('gho_new_after_login');
    });
  });

  describe('without a session secret', () => {
    it('stores as before and migrates nothing, instead of failing a sign-in', () => {
      db.closeDB();
      boot({ secret: '' });

      const user = db.createUser({ githubId: '1', username: 'alice' });
      db.updateUserGithubToken(user.id, 'gho_no_secret');
      expect(column(user.id)).toBe('gho_no_secret');
      expect(db.encryptStoredGithubTokens()).toBe(0);
      expect(github.getToken({ github_token: column(user.id) })).toBe('gho_no_secret');
    });
  });
});
