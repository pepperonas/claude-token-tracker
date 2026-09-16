/**
 * AES-256-GCM for credentials held at rest in the database.
 *
 * The key is derived from SESSION_SECRET, so a deployment that rotates that
 * secret can no longer read what it stored. That is a deliberate trade: a
 * credential that cannot be decrypted is a credential the next login replaces,
 * whereas a second long-lived secret would be one more thing to keep safe.
 *
 * Wire format is `ivHex:authTagHex:ciphertextHex`. The colons are what makes a
 * stored value recognisable: neither a GitHub token (`gho_…`, `ghp_…`, or the
 * older 40 hex characters) nor an Anthropic key contains one, so a row written
 * before encryption existed can be told apart from a row written after it —
 * which is how a migration stays idempotent and how a legacy row keeps working
 * until it is migrated.
 */

const crypto = require('crypto');
const { SESSION_SECRET } = require('./config');

/** Whether this instance can encrypt at all. */
function hasKey() {
  return !!SESSION_SECRET;
}

function _deriveKey() {
  if (!SESSION_SECRET) throw new Error('SESSION_SECRET is required for credential encryption');
  return crypto.createHash('sha256').update(SESSION_SECRET).digest();
}

function encrypt(plaintext) {
  const key = _deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

/** Returns null on anything that does not decrypt cleanly, including a tampered tag. */
function decrypt(encrypted) {
  try {
    const [ivHex, authTagHex, ciphertext] = encrypted.split(':');
    const key = _deriveKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Whether a stored value was written by encrypt().
 *
 * Shape only — three hex fields separated by colons, with an IV of 12 bytes and
 * a GCM tag of 16. It answers "which format is this", never "is this valid";
 * a tampered value still looks encrypted and is rejected by decrypt().
 */
function isEncrypted(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/i.test(value);
}

/**
 * The usable value behind a stored credential, whatever its form.
 *
 * A value written before encryption existed is returned as-is, so a row keeps
 * working whether or not the migration has run. A value that looks encrypted
 * but does not decrypt — a rotated SESSION_SECRET, a damaged row — yields null
 * rather than a string that would be sent to an API as a bearer token.
 */
function read(stored) {
  if (!stored) return null;
  return isEncrypted(stored) ? decrypt(stored) : stored;
}

module.exports = { encrypt, decrypt, isEncrypted, hasKey, read };
