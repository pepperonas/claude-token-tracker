// API-equivalent pricing per million tokens.
//
// PRICING below is the hard-coded fallback (verified 2026-04-05 from
// https://www.anthropic.com/pricing). At runtime, lib/pricing-fetcher.js
// fetches live prices from LiteLLM's community-maintained dataset and
// populates _PRICING_OVERRIDES. Lookups try overrides first, then fall back
// to the constant below. This guarantees correct costs continue to be
// computed even if the external source is unreachable — the worst case is
// the values become stale, never wrong-by-orders-of-magnitude.
//
// Cache write = 5-minute TTL tier (1.25x input). 1-hour TTL (2x input) not tracked separately.

const PRICING = {
  'claude-opus-4-6': {
    label: 'Opus 4.6',
    input: 5,
    output: 25,
    cacheRead: 0.50,
    cacheCreate: 6.25
  },
  'claude-opus-4-5-20251101': {
    label: 'Opus 4.5',
    input: 5,
    output: 25,
    cacheRead: 0.50,
    cacheCreate: 6.25
  },
  'claude-sonnet-4-6': {
    label: 'Sonnet 4.6',
    input: 3,
    output: 15,
    cacheRead: 0.30,
    cacheCreate: 3.75
  },
  'claude-sonnet-4-5-20250929': {
    label: 'Sonnet 4.5',
    input: 3,
    output: 15,
    cacheRead: 0.30,
    cacheCreate: 3.75
  },
  'claude-haiku-4-5-20251001': {
    label: 'Haiku 4.5',
    input: 1,
    output: 5,
    cacheRead: 0.10,
    cacheCreate: 1.25
  },
  'claude-3-7-sonnet-20250219': {
    label: 'Sonnet 3.7',
    input: 3,
    output: 15,
    cacheRead: 0.30,
    cacheCreate: 3.75
  }
};

// Fallback for unknown models — use Sonnet pricing
const DEFAULT_PRICING = {
  label: 'Unknown',
  input: 3,
  output: 15,
  cacheRead: 0.30,
  cacheCreate: 3.75
};

// Populated by lib/pricing-fetcher.js at startup (from DB cache) and again
// after each successful LiteLLM fetch.
let _PRICING_OVERRIDES = {};
let _META = { source: 'fallback', fetchedAt: null };

function _setOverrides(overrides, meta) {
  _PRICING_OVERRIDES = overrides || {};
  _META = { source: meta?.source || 'litellm', fetchedAt: meta?.fetchedAt || null };
}

function getPricing(model) {
  return _PRICING_OVERRIDES[model] || PRICING[model] || DEFAULT_PRICING;
}

function getModelLabel(model) {
  if (model === '<synthetic>') return 'System';
  // Prefer label from the hard-coded table (curated short names) over
  // LiteLLM-derived labels which can be ID-ish. Override labels are still
  // used when no hard-coded entry exists.
  if (PRICING[model]) return PRICING[model].label;
  if (_PRICING_OVERRIDES[model]) return _PRICING_OVERRIDES[model].label;
  return DEFAULT_PRICING.label;
}

function calculateCost(model, usage) {
  const p = getPricing(model);
  const input = (usage.inputTokens || 0) / 1_000_000 * p.input;
  const output = (usage.outputTokens || 0) / 1_000_000 * p.output;
  const cacheRead = (usage.cacheReadTokens || 0) / 1_000_000 * p.cacheRead;
  const cacheCreate = (usage.cacheCreateTokens || 0) / 1_000_000 * p.cacheCreate;
  return input + output + cacheRead + cacheCreate;
}

/**
 * Returns a snapshot of the effective pricing state — used by the
 * /api/pricing endpoint for transparency.
 */
function getPricingMeta() {
  const allModelIds = new Set([...Object.keys(PRICING), ...Object.keys(_PRICING_OVERRIDES)]);
  const models = [...allModelIds].sort().map(id => {
    const o = _PRICING_OVERRIDES[id];
    const f = PRICING[id];
    const effective = o || f || DEFAULT_PRICING;
    return {
      model: id,
      label: effective.label,
      input: effective.input,
      output: effective.output,
      cacheRead: effective.cacheRead,
      cacheCreate: effective.cacheCreate,
      origin: o ? _META.source : 'fallback'
    };
  });
  return {
    source: _META.source,
    fetchedAt: _META.fetchedAt,
    overrideCount: Object.keys(_PRICING_OVERRIDES).length,
    fallbackCount: Object.keys(PRICING).length,
    models
  };
}

module.exports = {
  PRICING,
  DEFAULT_PRICING,
  getPricing,
  getModelLabel,
  calculateCost,
  getPricingMeta,
  _setOverrides
};
