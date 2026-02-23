// API-equivalent pricing per million tokens
const PRICING = {
  'claude-opus-4-6': {
    label: 'Opus 4.6',
    input: 15,
    output: 75,
    cacheRead: 1.50,
    cacheCreate: 18.75
  },
  'claude-opus-4-5-20251101': {
    label: 'Opus 4.5',
    input: 15,
    output: 75,
    cacheRead: 1.50,
    cacheCreate: 18.75
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
    input: 0.80,
    output: 4,
    cacheRead: 0.08,
    cacheCreate: 1
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

function getPricing(model) {
  return PRICING[model] || DEFAULT_PRICING;
}

function getModelLabel(model) {
  if (model === '<synthetic>') return 'System';
  return (PRICING[model] || DEFAULT_PRICING).label;
}

function calculateCost(model, usage) {
  const p = getPricing(model);
  const input = (usage.inputTokens || 0) / 1_000_000 * p.input;
  const output = (usage.outputTokens || 0) / 1_000_000 * p.output;
  const cacheRead = (usage.cacheReadTokens || 0) / 1_000_000 * p.cacheRead;
  const cacheCreate = (usage.cacheCreateTokens || 0) / 1_000_000 * p.cacheCreate;
  return input + output + cacheRead + cacheCreate;
}

module.exports = { PRICING, DEFAULT_PRICING, getPricing, getModelLabel, calculateCost };
