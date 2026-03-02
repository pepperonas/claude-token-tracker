const https = require('https');
const crypto = require('crypto');
const { SESSION_SECRET, MULTI_USER } = require('./config');

const ANTHROPIC_CACHE_TTL_MINUTES = parseInt(process.env.ANTHROPIC_CACHE_TTL_MINUTES, 10) || 60;

let _db = null;

function initAnthropicApi(db) {
  _db = db;
}

// --- AES-256-GCM encryption for admin keys ---

function _deriveKey() {
  if (!SESSION_SECRET) throw new Error('SESSION_SECRET is required for key encryption');
  return crypto.createHash('sha256').update(SESSION_SECRET).digest();
}

function encryptKey(plaintext) {
  const key = _deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

function decryptKey(encrypted) {
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

function httpsRequest(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function getAdminToken(user) {
  // Multi-user: per-user encrypted key
  if (user && user.anthropic_key_encrypted) {
    return decryptKey(user.anthropic_key_encrypted);
  }
  // Single-user: check metadata table, then env var
  if (!MULTI_USER && _db) {
    const { getMetadata } = require('./db');
    const stored = getMetadata('anthropic_admin_key');
    if (stored) {
      try { return decryptKey(stored); } catch { /* fall through */ }
    }
  }
  if (!MULTI_USER && process.env.ANTHROPIC_ADMIN_KEY) {
    return process.env.ANTHROPIC_ADMIN_KEY;
  }
  return null;
}

function saveAdminKey(userId, plainKey) {
  if (!_db) throw new Error('DB not initialized');
  const encrypted = encryptKey(plainKey);
  if (!MULTI_USER) {
    const { setMetadata } = require('./db');
    setMetadata('anthropic_admin_key', encrypted);
    return;
  }
  const { updateUserAnthropicKey } = require('./db');
  updateUserAnthropicKey(userId, encrypted);
}

function deleteAdminKey(userId) {
  if (!_db) throw new Error('DB not initialized');
  if (!MULTI_USER) {
    const { setMetadata } = require('./db');
    setMetadata('anthropic_admin_key', '');
    return;
  }
  const { updateUserAnthropicKey } = require('./db');
  updateUserAnthropicKey(userId, null);
}

function hasAdminKey(user) {
  if (user && user.anthropic_key_encrypted) return true;
  if (!MULTI_USER) {
    if (process.env.ANTHROPIC_ADMIN_KEY) return true;
    if (_db) {
      const { getMetadata } = require('./db');
      return !!getMetadata('anthropic_admin_key');
    }
  }
  return false;
}

function apiRequest(token, path) {
  return httpsRequest({
    hostname: 'api.anthropic.com',
    path,
    method: 'GET',
    headers: {
      'x-api-key': token,
      'anthropic-version': '2023-06-01',
      'User-Agent': 'claude-token-tracker'
    }
  });
}

// Track in-flight background refreshes
const _refreshing = new Map();

function cachedFetch(userId, cacheKey, fetchFn) {
  if (!_db) return fetchFn();

  const db = _db.getDB();
  const uid = userId || 0;
  const row = db.prepare(
    'SELECT data, fetched_at FROM github_cache WHERE user_id = ? AND cache_key = ?'
  ).get(uid, cacheKey);

  if (row) {
    const age = (Date.now() - new Date(row.fetched_at).getTime()) / 60000;
    if (age < ANTHROPIC_CACHE_TTL_MINUTES) {
      return Promise.resolve(JSON.parse(row.data));
    }
    // Stale — return cached, refresh in background
    const refreshKey = `${uid}:${cacheKey}`;
    if (!_refreshing.has(refreshKey)) {
      const p = fetchFn().then(result => {
        if (result === undefined) return;
        db.prepare(
          'INSERT OR REPLACE INTO github_cache (user_id, cache_key, data, fetched_at) VALUES (?, ?, ?, ?)'
        ).run(uid, cacheKey, JSON.stringify(result), new Date().toISOString());
      }).catch(err => {
        console.error(`[anthropic] background refresh failed for ${cacheKey}:`, err.message);
      }).finally(() => {
        _refreshing.delete(refreshKey);
      });
      _refreshing.set(refreshKey, p);
    }
    return Promise.resolve(JSON.parse(row.data));
  }

  // No cache — blocking fetch
  return fetchFn().then(result => {
    if (result === undefined) return {};
    db.prepare(
      'INSERT OR REPLACE INTO github_cache (user_id, cache_key, data, fetched_at) VALUES (?, ?, ?, ?)'
    ).run(uid, cacheKey, JSON.stringify(result), new Date().toISOString());
    return result;
  });
}

function getCacheAge(userId, cacheKey) {
  if (!_db) return null;
  const db = _db.getDB();
  const row = db.prepare(
    'SELECT fetched_at FROM github_cache WHERE user_id = ? AND cache_key = ?'
  ).get(userId || 0, cacheKey);
  if (!row) return null;
  return Math.round((Date.now() - new Date(row.fetched_at).getTime()) / 60000);
}

function buildDateRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    starting_at: from.toISOString(),
    ending_at: to.toISOString()
  };
}

/**
 * Fetch all pages from a paginated Anthropic Admin API endpoint.
 */
async function fetchAllPages(token, basePath) {
  const allData = [];
  let page = null;

  for (let i = 0; i < 20; i++) { // safety limit
    const sep = basePath.includes('?') ? '&' : '?';
    const pagePath = page ? `${basePath}${sep}page=${encodeURIComponent(page)}` : basePath;
    const res = await apiRequest(token, pagePath);
    if (res.statusCode !== 200) {
      const msg = res.data?.error?.message || res.data?.message || res.statusCode;
      throw new Error('Anthropic API failed: ' + msg);
    }
    if (res.data.data) {
      allData.push(...res.data.data);
    }
    if (!res.data.has_more) break;
    page = res.data.next_page;
  }
  return allData;
}

async function getUsageReportDirect(token) {
  const { starting_at, ending_at } = buildDateRange(30);
  const path = `/v1/organizations/usage_report/messages?starting_at=${encodeURIComponent(starting_at)}&ending_at=${encodeURIComponent(ending_at)}&bucket_width=1d&group_by[]=model&limit=31`;
  return fetchAllPages(token, path);
}

async function getCostReportDirect(token) {
  const { starting_at, ending_at } = buildDateRange(30);
  const path = `/v1/organizations/cost_report?starting_at=${encodeURIComponent(starting_at)}&ending_at=${encodeURIComponent(ending_at)}&bucket_width=1d&group_by[]=description&limit=31`;
  return fetchAllPages(token, path);
}

async function getDashboardData(token, userId) {
  return cachedFetch(userId, 'anthropic-dashboard', async () => {
    const [usageBuckets, costBuckets] = await Promise.all([
      getUsageReportDirect(token),
      getCostReportDirect(token)
    ]);

    // Process usage data
    // Each bucket: { starting_at, ending_at, results: [{ uncached_input_tokens, output_tokens, cache_read_input_tokens, cache_creation: { ephemeral_1h_input_tokens, ephemeral_5m_input_tokens }, model, ... }] }
    const dailyTokens = [];
    const modelTokenMap = {};
    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreate = 0;

    for (const bucket of usageBuckets) {
      const date = bucket.starting_at ? bucket.starting_at.slice(0, 10) : '';
      if (!bucket.results) continue;

      for (const r of bucket.results) {
        const model = r.model || 'unknown';
        const input = r.uncached_input_tokens || 0;
        const output = r.output_tokens || 0;
        const cacheRead = r.cache_read_input_tokens || 0;
        const cc = r.cache_creation || {};
        const cacheCreate = (cc.ephemeral_1h_input_tokens || 0) + (cc.ephemeral_5m_input_tokens || 0);

        totalInput += input;
        totalOutput += output;
        totalCacheRead += cacheRead;
        totalCacheCreate += cacheCreate;

        // Daily aggregation
        let dayEntry = dailyTokens.find(d => d.date === date);
        if (!dayEntry) {
          dayEntry = { date, input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
          dailyTokens.push(dayEntry);
        }
        dayEntry.input += input;
        dayEntry.output += output;
        dayEntry.cacheRead += cacheRead;
        dayEntry.cacheCreate += cacheCreate;

        // Model aggregation
        if (!modelTokenMap[model]) {
          modelTokenMap[model] = { model, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, cost: 0 };
        }
        modelTokenMap[model].input += input;
        modelTokenMap[model].output += output;
        modelTokenMap[model].cacheRead += cacheRead;
        modelTokenMap[model].cacheCreate += cacheCreate;
      }
    }

    // Process cost data
    // Each bucket: { starting_at, ending_at, results: [{ amount (cents string), model, description, cost_type, ... }] }
    const dailyCosts = [];
    let totalCost = 0;
    const modelCostMap = {};

    for (const bucket of costBuckets) {
      const date = bucket.starting_at ? bucket.starting_at.slice(0, 10) : '';

      if (!bucket.results) continue;
      for (const result of bucket.results) {
        // amount is in cents as a string, convert to dollars
        const costUsd = parseFloat(result.amount || '0') / 100;
        const model = result.model || result.description || 'unknown';

        totalCost += costUsd;

        let dayEntry = dailyCosts.find(d => d.date === date);
        if (!dayEntry) {
          dayEntry = { date, total: 0, byModel: {} };
          dailyCosts.push(dayEntry);
        }
        dayEntry.total += costUsd;
        dayEntry.byModel[model] = (dayEntry.byModel[model] || 0) + costUsd;

        modelCostMap[model] = (modelCostMap[model] || 0) + costUsd;
      }
    }

    // Merge costs into model breakdown
    for (const [model, cost] of Object.entries(modelCostMap)) {
      if (modelTokenMap[model]) {
        modelTokenMap[model].cost = cost;
      } else {
        modelTokenMap[model] = { model, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, cost };
      }
    }

    const modelBreakdown = Object.values(modelTokenMap)
      .sort((a, b) => b.cost - a.cost);

    dailyTokens.sort((a, b) => a.date.localeCompare(b.date));
    dailyCosts.sort((a, b) => a.date.localeCompare(b.date));

    const totalTokens = totalInput + totalOutput + totalCacheRead + totalCacheCreate;
    const daysWithData = dailyCosts.filter(d => d.total > 0).length;
    const avgCostPerDay = daysWithData > 0 ? totalCost / daysWithData : 0;
    const cacheEfficiency = totalTokens > 0
      ? Math.round((totalCacheRead / totalTokens) * 1000) / 10
      : 0;

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      totalTokens,
      totalInput,
      totalOutput,
      totalCacheRead,
      totalCacheCreate,
      avgCostPerDay: Math.round(avgCostPerDay * 100) / 100,
      cacheEfficiency,
      dailyCosts,
      dailyTokens,
      modelBreakdown
    };
  });
}

function clearCache(userId) {
  if (!_db) return;
  const db = _db.getDB();
  db.prepare('DELETE FROM github_cache WHERE user_id = ? AND cache_key LIKE ?')
    .run(userId || 0, 'anthropic-%');
}

module.exports = {
  initAnthropicApi,
  getAdminToken,
  getDashboardData,
  clearCache,
  getCacheAge,
  saveAdminKey,
  deleteAdminKey,
  hasAdminKey,
  encryptKey,
  decryptKey
};
