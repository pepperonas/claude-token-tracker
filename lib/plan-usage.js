const https = require('https');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { MULTI_USER } = require('./config');

const PLAN_USAGE_TTL_MS = 5 * 60 * 1000; // 5 minutes — respect rate limits

let _db = null;
let _cache = { data: null, fetchedAt: 0 };
let _orgId = null;

function initPlanUsage(db) {
  _db = db;
}

// --- OAuth token retrieval ---

function _getOAuthTokenFromKeychain() {
  try {
    const raw = execFileSync('security', [
      'find-generic-password', '-s', 'Claude Code-credentials', '-w'
    ], { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const parsed = JSON.parse(raw);
    return (parsed.claudeAiOauth && parsed.claudeAiOauth.accessToken) || null;
  } catch {
    return null;
  }
}

function _getOAuthTokenFromFile() {
  const platform = os.platform();
  let credPath;
  if (platform === 'win32') {
    credPath = path.join(process.env.APPDATA || '', 'Claude', 'credentials.json');
  } else {
    credPath = path.join(os.homedir(), '.config', 'claude', 'credentials.json');
  }
  try {
    const data = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    return (data.claudeAiOauth && data.claudeAiOauth.accessToken) || data.accessToken || null;
  } catch {
    return null;
  }
}

function _getStoredToken() {
  if (!_db) return null;
  const { getMetadata } = require('./db');
  const stored = getMetadata('plan_usage_oauth_token');
  if (!stored) return null;
  try {
    const { decryptKey } = require('./anthropic-api');
    return decryptKey(stored);
  } catch {
    return null;
  }
}

function getOAuthToken(user) {
  // Multi-user: stored per-user token only
  if (MULTI_USER && user) {
    const { getMetadata } = require('./db');
    const stored = getMetadata(`plan_usage_oauth_token_${user.id}`);
    if (!stored) return null;
    try {
      const { decryptKey } = require('./anthropic-api');
      return decryptKey(stored);
    } catch { return null; }
  }

  // Single-user: try auto-detect first, then stored token
  if (os.platform() === 'darwin') {
    const token = _getOAuthTokenFromKeychain();
    if (token) return token;
  }
  const fileToken = _getOAuthTokenFromFile();
  if (fileToken) return fileToken;
  return _getStoredToken();
}

function saveOAuthToken(userId, plainToken) {
  if (!_db) throw new Error('DB not initialized');
  const { encryptKey } = require('./anthropic-api');
  const { setMetadata } = require('./db');
  const encrypted = encryptKey(plainToken);
  const key = MULTI_USER ? `plan_usage_oauth_token_${userId}` : 'plan_usage_oauth_token';
  setMetadata(key, encrypted);
}

function deleteOAuthToken(userId) {
  if (!_db) throw new Error('DB not initialized');
  const { setMetadata } = require('./db');
  const key = MULTI_USER ? `plan_usage_oauth_token_${userId}` : 'plan_usage_oauth_token';
  setMetadata(key, '');
}

function hasOAuthToken(user) {
  return !!getOAuthToken(user);
}

// --- API calls ---

function _httpsGet(url, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'claude-code/1.0',
        'anthropic-client-platform': 'claude-code',
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          return reject(new Error('TOKEN_EXPIRED'));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

async function _getOrgId(token) {
  if (_orgId) return _orgId;
  const data = await _httpsGet('https://claude.ai/api/bootstrap', token);
  // Navigate response to find org UUID
  if (data.account && data.account.memberships) {
    for (const m of data.account.memberships) {
      if (m.organization && m.organization.uuid) {
        _orgId = m.organization.uuid;
        return _orgId;
      }
    }
  }
  if (data.organizations && data.organizations.length > 0) {
    _orgId = data.organizations[0].uuid || data.organizations[0].id;
    return _orgId;
  }
  throw new Error('Could not find organization ID in bootstrap response');
}

async function fetchPlanUsage(token) {
  const orgId = await _getOrgId(token);
  const data = await _httpsGet(`https://claude.ai/api/organizations/${orgId}/usage`, token);
  return data;
}

// --- Cached access ---

async function getPlanUsage(user) {
  const token = getOAuthToken(user);
  if (!token) return null;

  const uid = (MULTI_USER && user) ? user.id : 0;
  const cacheKey = `plan_usage_${uid}`;

  // Check in-memory cache
  if (_cache.data && (Date.now() - _cache.fetchedAt) < PLAN_USAGE_TTL_MS) {
    return _cache.data;
  }

  // Check metadata cache
  if (_db) {
    const { getMetadata } = require('./db');
    const stored = getMetadata(cacheKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.fetchedAt && (Date.now() - new Date(parsed.fetchedAt).getTime()) < PLAN_USAGE_TTL_MS) {
          _cache = { data: parsed, fetchedAt: new Date(parsed.fetchedAt).getTime() };
          return parsed;
        }
      } catch { /* stale or invalid */ }
    }
  }

  // Fetch fresh data
  try {
    const raw = await fetchPlanUsage(token);
    const result = _normalizeUsageResponse(raw);
    result.fetchedAt = new Date().toISOString();

    // Store in cache
    _cache = { data: result, fetchedAt: Date.now() };
    if (_db) {
      const { setMetadata } = require('./db');
      setMetadata(cacheKey, JSON.stringify(result));
    }
    return result;
  } catch (err) {
    // Return stale cache if available
    if (_cache.data) return _cache.data;
    throw err;
  }
}

function _normalizeUsageResponse(raw) {
  const result = {};

  // Current session
  if (raw.current_session) {
    result.currentSession = {
      percentUsed: raw.current_session.percent_used ?? raw.current_session.percentUsed ?? null,
      resetsInSeconds: raw.current_session.resets_in_seconds ?? raw.current_session.resetsInSeconds ?? null,
      expiresAt: raw.current_session.expires_at ?? raw.current_session.expiresAt ?? null
    };
  }

  // Weekly limits
  if (raw.weekly_limits || raw.weeklyLimits) {
    const wl = raw.weekly_limits || raw.weeklyLimits;
    if (wl.all_models || wl.allModels) {
      const am = wl.all_models || wl.allModels;
      result.weeklyAllModels = {
        percentUsed: am.percent_used ?? am.percentUsed ?? null,
        resetsAt: am.resets_at ?? am.resetsAt ?? null
      };
    }
    if (wl.sonnet_only || wl.sonnetOnly) {
      const so = wl.sonnet_only || wl.sonnetOnly;
      result.weeklySonnet = {
        percentUsed: so.percent_used ?? so.percentUsed ?? null,
        resetsAt: so.resets_at ?? so.resetsAt ?? null
      };
    }
  }

  return result;
}

function clearCache(userId) {
  _cache = { data: null, fetchedAt: 0 };
  _orgId = null;
  if (_db) {
    const { setMetadata } = require('./db');
    const uid = MULTI_USER ? userId : 0;
    setMetadata(`plan_usage_${uid}`, '');
  }
}

function storeSyncedPlanUsage(userId, planUsage) {
  if (!_db || !planUsage) return;
  const { setMetadata } = require('./db');
  const key = `plan_usage_${userId}`;
  if (!planUsage.fetchedAt) planUsage.fetchedAt = new Date().toISOString();
  setMetadata(key, JSON.stringify(planUsage));
  _cache = { data: planUsage, fetchedAt: new Date(planUsage.fetchedAt).getTime() };
}

module.exports = {
  initPlanUsage,
  getOAuthToken,
  saveOAuthToken,
  deleteOAuthToken,
  hasOAuthToken,
  getPlanUsage,
  fetchPlanUsage,
  clearCache,
  storeSyncedPlanUsage
};
