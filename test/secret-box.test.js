const path = require('path');

describe('secret-box', () => {
  let box;

  function load(secret) {
    if (secret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = secret;
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/secret-box')];
    return require('../lib/secret-box');
  }

  const ORIGINAL = process.env.SESSION_SECRET;

  beforeEach(() => { box = load('test-session-secret'); });

  afterEach(() => {
    load(ORIGINAL);
    if (ORIGINAL === undefined) delete process.env.SESSION_SECRET;
  });

  it('round-trips a value', () => {
    const token = 'gho_16CharsOfNothingInParticular1234';
    const stored = box.encrypt(token);
    expect(stored).not.toContain(token);
    expect(box.decrypt(stored)).toBe(token);
  });

  it('produces a different ciphertext every time', () => {
    // A fresh IV per call: two accounts holding the same token must not be
    // recognisable as such from the stored rows.
    const a = box.encrypt('same-token');
    const b = box.encrypt('same-token');
    expect(a).not.toBe(b);
    expect(box.decrypt(a)).toBe(box.decrypt(b));
  });

  it('refuses a tampered value instead of returning garbage', () => {
    // Change the last hex digit to one it definitely is not. Substituting a
    // fixed character silently leaves the value untouched one time in sixteen,
    // and the "tamper" then decrypts fine — which is how this test flaked.
    const bend = (hex) => hex.slice(0, -1) + (hex.endsWith('a') ? 'b' : 'a');
    const stored = box.encrypt('gho_secret');
    const [iv, tag, data] = stored.split(':');

    // Deterministic self-check: a fixed substitution is a no-op for one digit
    // in sixteen, and the flake only showed up when that digit came up.
    for (const d of '0123456789abcdef') expect(bend('ff' + d)).not.toBe('ff' + d);
    expect(box.decrypt([iv, tag, bend(data)].join(':'))).toBeNull();
    expect(box.decrypt([iv, bend(tag), data].join(':'))).toBeNull();
    expect(box.decrypt([bend(iv), tag, data].join(':'))).toBeNull();
  });

  it('cannot read what another secret wrote', () => {
    const stored = box.encrypt('gho_secret');
    const other = load('a-completely-different-secret');
    expect(other.decrypt(stored)).toBeNull();
  });

  it('returns null for anything that is not a ciphertext', () => {
    for (const junk of ['', 'gho_plaintext_token', 'not:hex:here', 'a:b']) {
      expect(box.decrypt(junk)).toBeNull();
    }
  });

  describe('format detection', () => {
    it('recognises its own output', () => {
      expect(box.isEncrypted(box.encrypt('x'))).toBe(true);
    });

    it('does not mistake a stored credential for a ciphertext', () => {
      // These are the shapes actually found in the column; none may be read as
      // encrypted, or a migration would skip them and leave them in the clear.
      for (const plain of [
        'gho_16CharsOfNothingInParticular1234',
        'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
        'ghu_zzz',
        'a'.repeat(40),                 // legacy 40-hex OAuth token
        'sk-ant-admin01-abcdef',
      ]) {
        expect(box.isEncrypted(plain)).toBe(false);
      }
    });

    it('is shape only — a tampered value still looks encrypted and fails to decrypt', () => {
      const stored = box.encrypt('x');
      const broken = stored.slice(0, -1) + (stored.endsWith('a') ? 'b' : 'a');
      expect(box.isEncrypted(broken)).toBe(true);
      expect(box.decrypt(broken)).toBeNull();
    });

    it('rejects a wrong-length IV or tag', () => {
      expect(box.isEncrypted('abc:' + 'a'.repeat(32) + ':ff')).toBe(false);
      expect(box.isEncrypted('a'.repeat(24) + ':abc:ff')).toBe(false);
    });

    it('rejects non-strings', () => {
      for (const v of [null, undefined, 42, {}, []]) expect(box.isEncrypted(v)).toBe(false);
    });
  });

  describe('without a session secret', () => {
    it('reports that it cannot encrypt', () => {
      const none = load('');
      expect(none.hasKey()).toBe(false);
      expect(() => none.encrypt('x')).toThrow(/SESSION_SECRET/);
      expect(none.decrypt('anything')).toBeNull();
    });

    it('reports that it can once a secret is configured', () => {
      expect(box.hasKey()).toBe(true);
    });
  });
});
