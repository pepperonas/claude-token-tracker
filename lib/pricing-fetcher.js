// Fetches up-to-date Claude model pricing from the LiteLLM community-maintained
// `model_prices_and_context_window.json` dataset and feeds it into lib/pricing.js
// as overrides. Falls back to the hard-coded PRICING constant on fetch failure.
//
// Source: https://github.com/BerriAI/litellm
// Refresh cadence: once at startup + every 24h.
//
// LiteLLM format (per token, scientific notation):
//   input_cost_per_token:           3e-06
//   output_cost_per_token:          1.5e-05
//   cache_read_input_token_cost:    3e-07
//   cache_creation_input_token_cost: 3.75e-06
//
// Internal format (per million tokens, decimal): { input: 3, output: 15, cacheRead: 0.30, cacheCreate: 3.75 }

const https = require('https');

const LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 15000;

// Metadata keys (used with db.setMetadata/getMetadata)
const KEY_OVERRIDES = 'pricing_overrides_json';
const KEY_FETCHED_AT = 'pricing_fetched_at';
const KEY_SOURCE = 'pricing_source';

let _db = null;
let _refreshTimer = null;
let _lastError = null;

function _fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: FETCH_TIMEOUT_MS, headers: { 'User-Agent': 'claude-token-tracker' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return _fetchJson(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

/**
 * Extract Anthropic model entries from a LiteLLM payload and convert them
 * to our internal { input, output, cacheRead, cacheCreate } format
 * (USD per 1 million tokens).
 *
 * Accepts both bare model IDs (`claude-sonnet-4-5`) and provider-prefixed
 * variants (`anthropic/claude-sonnet-4-5`). Bedrock/Vertex variants
 * (`anthropic.claude-...`, `claude-3-...@...`) are filtered out — they use
 * different IDs and we only ever see direct Anthropic IDs in the message logs.
 */
function convertLiteLLMToOverrides(litellmData) {
  const overrides = {};
  for (const [key, val] of Object.entries(litellmData)) {
    if (!val || typeof val !== 'object') continue;
    if (val.litellm_provider !== 'anthropic') continue;
    // Normalize the key: strip "anthropic/" prefix, skip Bedrock/Vertex variants
    let modelId = key;
    if (modelId.startsWith('anthropic/')) modelId = modelId.slice('anthropic/'.length);
    if (modelId.startsWith('anthropic.') || modelId.includes('@')) continue; // Bedrock/Vertex
    if (!modelId.startsWith('claude-')) continue;

    // Require at least the input + output costs to be present
    if (typeof val.input_cost_per_token !== 'number' || typeof val.output_cost_per_token !== 'number') continue;

    const entry = {
      label: _deriveLabel(modelId),
      input: _round(val.input_cost_per_token * 1_000_000),
      output: _round(val.output_cost_per_token * 1_000_000),
      cacheRead: _round((val.cache_read_input_token_cost || val.input_cost_per_token * 0.1) * 1_000_000),
      cacheCreate: _round((val.cache_creation_input_token_cost || val.input_cost_per_token * 1.25) * 1_000_000)
    };

    // Don't overwrite a more-specific dated ID with a less-specific alias
    if (!overrides[modelId]) {
      overrides[modelId] = entry;
    }
  }
  return overrides;
}

function _round(n) {
  return Math.round(n * 10000) / 10000; // 4 decimal places
}

function _deriveLabel(modelId) {
  // Handles all layouts Anthropic has shipped over the years:
  //   1. claude-{family}-{major}-{minor}(-{date}?)   e.g. claude-opus-4-6, claude-sonnet-4-5-20250929
  //   2. claude-{major}-{minor}-{family}-{date}      e.g. claude-3-7-sonnet-20250219
  //   3. claude-{major}-{family}-{date}              e.g. claude-3-opus-20240229, claude-4-opus-20250514
  // All resolve to "{Family} {major}.{minor}" or "{Family} {major}".
  let m = modelId.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/); // layout 1
  if (m) {
    const [, family, major, minor] = m;
    return `${_capFamily(family)} ${major}.${minor}`;
  }
  m = modelId.match(/^claude-(\d+)-(\d+)-(opus|sonnet|haiku)/); // layout 2
  if (m) {
    const [, major, minor, family] = m;
    return `${_capFamily(family)} ${major}.${minor}`;
  }
  m = modelId.match(/^claude-(\d+)-(opus|sonnet|haiku)/); // layout 3
  if (m) {
    const [, major, family] = m;
    return `${_capFamily(family)} ${major}`;
  }
  return modelId;
}

function _capFamily(family) {
  return family.charAt(0).toUpperCase() + family.slice(1);
}

/**
 * Fetch fresh prices from LiteLLM, persist to DB, and apply to the
 * pricing module. Returns { source, fetchedAt, count } on success,
 * or throws on failure (caller decides whether to keep stale data).
 */
async function refreshPricing() {
  const pricing = require('./pricing');
  const data = await _fetchJson(LITELLM_URL);
  const overrides = convertLiteLLMToOverrides(data);
  const count = Object.keys(overrides).length;
  if (count === 0) {
    throw new Error('LiteLLM payload contained no Anthropic models');
  }
  const fetchedAt = new Date().toISOString();
  if (_db) {
    _db.setMetadata(KEY_OVERRIDES, JSON.stringify(overrides));
    _db.setMetadata(KEY_FETCHED_AT, fetchedAt);
    _db.setMetadata(KEY_SOURCE, 'litellm');
  }
  pricing._setOverrides(overrides, { source: 'litellm', fetchedAt });
  _lastError = null;
  return { source: 'litellm', fetchedAt, count };
}

/**
 * Boot-time init: load any cached overrides from DB synchronously (so the
 * first cost calculation already uses fresh data), then kick off an async
 * refresh, then schedule periodic refresh every 24h.
 */
function initPricing(db) {
  _db = db;
  const pricing = require('./pricing');

  // Synchronous cache load
  try {
    const cached = db.getMetadata(KEY_OVERRIDES);
    const fetchedAt = db.getMetadata(KEY_FETCHED_AT);
    const source = db.getMetadata(KEY_SOURCE) || 'litellm';
    if (cached) {
      const overrides = JSON.parse(cached);
      pricing._setOverrides(overrides, { source, fetchedAt });
      console.log(`Pricing: loaded ${Object.keys(overrides).length} cached overrides from ${fetchedAt || 'unknown date'}`);
    }
  } catch (e) {
    console.warn('Pricing: failed to load cached overrides:', e.message);
  }

  // Async background refresh
  refreshPricing()
    .then(r => console.log(`Pricing: refreshed ${r.count} models from LiteLLM at ${r.fetchedAt}`))
    .catch(e => {
      _lastError = e.message;
      console.warn('Pricing: refresh failed, falling back to cached/hard-coded prices:', e.message);
    });

  // Periodic refresh
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(() => {
    refreshPricing()
      .then(r => console.log(`Pricing: refreshed ${r.count} models from LiteLLM at ${r.fetchedAt}`))
      .catch(e => {
        _lastError = e.message;
        console.warn('Pricing: periodic refresh failed:', e.message);
      });
  }, REFRESH_INTERVAL_MS);
  _refreshTimer.unref?.(); // don't block process exit (mainly for tests)
}

function stopPricingRefresh() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}

function getLastError() {
  return _lastError;
}

module.exports = {
  initPricing,
  refreshPricing,
  convertLiteLLMToOverrides,
  stopPricingRefresh,
  getLastError,
  _fetchJson // exposed for testing
};
