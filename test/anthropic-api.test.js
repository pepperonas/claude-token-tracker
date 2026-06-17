const path = require('path');
const fs = require('fs');
const os = require('os');

// anthropic-api reads SESSION_SECRET and MULTI_USER from config *at require time*,
// so we set env first and require the module fresh in each test run.
describe('anthropic-api', () => {
  let tmpDir, dbPath, api, db;
  const prevSecret = process.env.SESSION_SECRET;
  const prevMulti = process.env.MULTI_USER;
  const prevAdminKey = process.env.ANTHROPIC_ADMIN_KEY;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-anthropic-test-'));
    dbPath = path.join(tmpDir, 'test.db');

    process.env.SESSION_SECRET = 'test-session-secret-for-encryption';
    process.env.MULTI_USER = 'false';
    delete process.env.ANTHROPIC_ADMIN_KEY;

    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/db')];
    delete require.cache[require.resolve('../lib/anthropic-api')];

    db = require('../lib/db');
    db.initDB(dbPath);
    api = require('../lib/anthropic-api');
    api.initAnthropicApi(db.getDB());
  });

  afterEach(() => {
    db.closeDB();
    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (prevSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = prevSecret;
    if (prevMulti === undefined) delete process.env.MULTI_USER; else process.env.MULTI_USER = prevMulti;
    if (prevAdminKey === undefined) delete process.env.ANTHROPIC_ADMIN_KEY; else process.env.ANTHROPIC_ADMIN_KEY = prevAdminKey;

    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/db')];
    delete require.cache[require.resolve('../lib/anthropic-api')];
  });

  describe('encryptKey / decryptKey (AES-256-GCM)', () => {
    it('round-trips a plaintext key', () => {
      const plain = 'sk-ant-admin-0123456789abcdef';
      const enc = api.encryptKey(plain);
      expect(enc).not.toContain(plain);          // not stored in the clear
      expect(api.decryptKey(enc)).toBe(plain);
    });

    it('produces the iv:tag:ciphertext envelope', () => {
      const enc = api.encryptKey('hello');
      const parts = enc.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toMatch(/^[0-9a-f]{24}$/); // 12-byte IV as hex
      expect(parts[1]).toMatch(/^[0-9a-f]{32}$/); // 16-byte GCM auth tag as hex
    });

    it('uses a fresh IV so the same plaintext encrypts differently each time', () => {
      const a = api.encryptKey('same-input');
      const b = api.encryptKey('same-input');
      expect(a).not.toBe(b);
      expect(api.decryptKey(a)).toBe('same-input');
      expect(api.decryptKey(b)).toBe('same-input');
    });

    it('returns null when the ciphertext has been tampered with (auth tag fails)', () => {
      const enc = api.encryptKey('secret-value');
      const [iv, tag, ct] = enc.split(':');
      // Flip the last hex nibble of the ciphertext.
      const lastChar = ct.slice(-1);
      const flipped = ct.slice(0, -1) + (lastChar === '0' ? '1' : '0');
      expect(api.decryptKey(`${iv}:${tag}:${flipped}`)).toBeNull();
    });

    it('returns null on malformed input rather than throwing', () => {
      expect(api.decryptKey('not-a-valid-envelope')).toBeNull();
      expect(api.decryptKey('')).toBeNull();
      expect(api.decryptKey('a:b:c')).toBeNull();
    });
  });

  describe('admin key storage (single-user)', () => {
    it('saveAdminKey then getAdminToken returns the original key (via encrypted metadata)', () => {
      api.saveAdminKey(null, 'sk-ant-stored-key');
      // It is persisted encrypted, not as plaintext.
      expect(db.getMetadata('anthropic_admin_key')).not.toContain('sk-ant-stored-key');
      expect(api.getAdminToken(null)).toBe('sk-ant-stored-key');
    });

    it('hasAdminKey reflects stored state', () => {
      expect(api.hasAdminKey(null)).toBe(false);
      api.saveAdminKey(null, 'sk-ant-x');
      expect(api.hasAdminKey(null)).toBe(true);
    });

    it('deleteAdminKey clears the stored key', () => {
      api.saveAdminKey(null, 'sk-ant-x');
      api.deleteAdminKey(null);
      expect(api.hasAdminKey(null)).toBe(false);
      expect(api.getAdminToken(null)).toBeNull();
    });

    it('falls back to the ANTHROPIC_ADMIN_KEY env var when no key is stored', () => {
      process.env.ANTHROPIC_ADMIN_KEY = 'sk-ant-from-env';
      expect(api.getAdminToken(null)).toBe('sk-ant-from-env');
      expect(api.hasAdminKey(null)).toBe(true);
    });

    it('prefers a stored key over the env var', () => {
      process.env.ANTHROPIC_ADMIN_KEY = 'sk-ant-from-env';
      api.saveAdminKey(null, 'sk-ant-stored');
      expect(api.getAdminToken(null)).toBe('sk-ant-stored');
    });
  });

  describe('admin token resolution (per-user encrypted column)', () => {
    it('decrypts a per-user anthropic_key_encrypted field', () => {
      const user = { anthropic_key_encrypted: api.encryptKey('sk-ant-user-key') };
      expect(api.getAdminToken(user)).toBe('sk-ant-user-key');
      expect(api.hasAdminKey(user)).toBe(true);
    });

    it('returns null for a user with no key and no fallback', () => {
      expect(api.getAdminToken({ id: 1, username: 'x' })).toBeNull();
    });
  });
});
