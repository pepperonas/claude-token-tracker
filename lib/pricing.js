// API-equivalent pricing per million tokens.
//
// PRICING below is the hard-coded fallback (verified 2026-07-01, covers the
// current generation through Opus 4.8 / Sonnet 5 / Fable 5). At runtime,
// lib/pricing-fetcher.js
// fetches live prices from LiteLLM's community-maintained dataset and
// populates _PRICING_OVERRIDES. Lookups try overrides first, then fall back
// to the constant below. This guarantees correct costs continue to be
// computed even if the external source is unreachable — the worst case is
// the values become stale, never wrong-by-orders-of-magnitude.
//
// Cache write = 5-minute TTL tier (1.25x input). 1-hour TTL (2x input) not tracked separately.

const PRICING = {
  'claude-opus-4-8': {
    label: 'Opus 4.8',
    input: 5,
    output: 25,
    cacheRead: 0.50,
    cacheCreate: 6.25
  },
  'claude-opus-4-7': {
    label: 'Opus 4.7',
    input: 5,
    output: 25,
    cacheRead: 0.50,
    cacheCreate: 6.25
  },
  'claude-opus-4-6': {
    label: 'Opus 4.6',
    input: 5,
    output: 25,
    cacheRead: 0.50,
    cacheCreate: 6.25
  },
  'claude-opus-4-5': {
    label: 'Opus 4.5',
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
  'claude-sonnet-5': {
    label: 'Sonnet 5',
    input: 3,
    output: 15,
    cacheRead: 0.30,
    cacheCreate: 3.75
  },
  'claude-sonnet-4-6': {
    label: 'Sonnet 4.6',
    input: 3,
    output: 15,
    cacheRead: 0.30,
    cacheCreate: 3.75
  },
  'claude-sonnet-4-5': {
    label: 'Sonnet 4.5',
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
  'claude-fable-5': {
    label: 'Fable 5',
    input: 10,
    output: 50,
    cacheRead: 1.00,
    cacheCreate: 12.50
  },
  'claude-haiku-4-5': {
    label: 'Haiku 4.5',
    input: 1,
    output: 5,
    cacheRead: 0.10,
    cacheCreate: 1.25
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

// Time-windowed prices for models whose price changed over time while keeping
// the SAME model ID. Resolved FIRST (before LiteLLM overrides): the live
// LiteLLM dataset only knows the *current* price, but a message sent inside
// an epoch window must keep its historical price forever — otherwise past
// costs silently change whenever the current price does.
// `from`/`to` are inclusive UTC dates (YYYY-MM-DD, sliced from the message
// timestamp); null = open-ended. Windows must not overlap per model.
const PRICING_EPOCHS = {
  // Sonnet 5 launched with introductory pricing ($2/$10 per MTok) through
  // 2026-08-31; standard $3/$15 applies afterwards.
  'claude-sonnet-5': [
    {
      from: null,
      to: '2026-08-31',
      label: 'Sonnet 5',
      input: 2,
      output: 10,
      cacheRead: 0.20,
      cacheCreate: 2.50
    }
  ]
};

function _epochPricing(model, timestamp) {
  const epochs = PRICING_EPOCHS[model];
  if (!epochs || !timestamp) return null;
  const date = String(timestamp).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  for (const e of epochs) {
    if ((e.from === null || date >= e.from) && (e.to === null || date <= e.to)) return e;
  }
  return null;
}

// Populated by lib/pricing-fetcher.js at startup (from DB cache) and again
// after each successful LiteLLM fetch.
let _PRICING_OVERRIDES = {};
let _META = { source: 'fallback', fetchedAt: null };

function _setOverrides(overrides, meta) {
  _PRICING_OVERRIDES = overrides || {};
  _META = { source: meta?.source || 'litellm', fetchedAt: meta?.fetchedAt || null };
}

/**
 * Resolve the effective pricing for a model. When a timestamp is given,
 * time-windowed epoch prices win (so historical messages keep the price that
 * was in effect when they were sent); otherwise overrides → fallback → default.
 */
function getPricing(model, timestamp) {
  return _epochPricing(model, timestamp) || _PRICING_OVERRIDES[model] || PRICING[model] || DEFAULT_PRICING;
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

function calculateCost(model, usage, timestamp) {
  // The usage object is usually a full message carrying its own timestamp —
  // fall back to it so every existing call site is automatically time-aware.
  const p = getPricing(model, timestamp !== undefined ? timestamp : usage.timestamp);
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
    epochs: PRICING_EPOCHS,
    models
  };
}

module.exports = {
  PRICING,
  PRICING_EPOCHS,
  DEFAULT_PRICING,
  getPricing,
  getModelLabel,
  calculateCost,
  getPricingMeta,
  _setOverrides
};
