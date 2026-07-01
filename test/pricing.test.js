const { calculateCost, getModelLabel, getPricing, getPricingMeta, PRICING, DEFAULT_PRICING, _setOverrides } = require('../lib/pricing');

describe('pricing', () => {
  describe('calculateCost', () => {
    it('calculates cost for Opus 4.6', () => {
      const cost = calculateCost('claude-opus-4-6', {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheCreateTokens: 1_000_000
      });
      // 5 + 25 + 0.50 + 6.25 = 36.75
      expect(cost).toBeCloseTo(36.75, 2);
    });

    it('calculates cost for Sonnet 4.5', () => {
      const cost = calculateCost('claude-sonnet-4-5-20250929', {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 0,
        cacheCreateTokens: 0
      });
      // 3 + 15 = 18
      expect(cost).toBeCloseTo(18, 2);
    });

    it('calculates cost for Haiku 4.5', () => {
      const cost = calculateCost('claude-haiku-4-5-20251001', {
        inputTokens: 500_000,
        outputTokens: 200_000,
        cacheReadTokens: 300_000,
        cacheCreateTokens: 100_000
      });
      // 0.5 + 1.0 + 0.03 + 0.125 = 1.655
      expect(cost).toBeCloseTo(1.655, 3);
    });

    it('handles zero tokens', () => {
      const cost = calculateCost('claude-opus-4-6', {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreateTokens: 0
      });
      expect(cost).toBe(0);
    });

    it('has an offline fallback for the current generation (Opus 4.8 not undercounted as Sonnet)', () => {
      // If LiteLLM is unreachable at boot, Opus 4.8 must still price as Opus,
      // not fall through to DEFAULT_PRICING (Sonnet 3/15).
      const cost = calculateCost('claude-opus-4-8', { inputTokens: 1_000_000 });
      expect(cost).toBe(5);
      expect(cost).not.toBe(DEFAULT_PRICING.input);
    });

    it('has an offline fallback for Fable 5', () => {
      const cost = calculateCost('claude-fable-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
      // 10 + 50 = 60
      expect(cost).toBeCloseTo(60, 2);
    });

    it('has an offline fallback for Sonnet 5', () => {
      const cost = calculateCost('claude-sonnet-5', { inputTokens: 1_000_000 });
      expect(cost).toBe(3);
    });

    it('uses default pricing for unknown models', () => {
      const cost = calculateCost('unknown-model-xyz', {
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreateTokens: 0
      });
      expect(cost).toBe(DEFAULT_PRICING.input);
    });

    it('handles missing token fields gracefully', () => {
      const cost = calculateCost('claude-opus-4-6', {});
      expect(cost).toBe(0);
    });
  });

  describe('getModelLabel', () => {
    it('returns correct label for known models', () => {
      expect(getModelLabel('claude-opus-4-6')).toBe('Opus 4.6');
      expect(getModelLabel('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5');
      expect(getModelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
      expect(getModelLabel('claude-opus-4-8')).toBe('Opus 4.8');
      expect(getModelLabel('claude-sonnet-5')).toBe('Sonnet 5');
      expect(getModelLabel('claude-fable-5')).toBe('Fable 5');
    });

    it('returns System for synthetic', () => {
      expect(getModelLabel('<synthetic>')).toBe('System');
    });

    it('returns Unknown for unrecognized models', () => {
      expect(getModelLabel('some-future-model')).toBe('Unknown');
    });
  });

  describe('getPricing', () => {
    it('returns pricing for known models', () => {
      const p = getPricing('claude-opus-4-6');
      expect(p.input).toBe(5);
      expect(p.output).toBe(25);
    });

    it('returns default pricing for unknown models', () => {
      const p = getPricing('unknown');
      expect(p).toBe(DEFAULT_PRICING);
    });
  });

  describe('calculateCost — current generation full formula', () => {
    it('calculates cost for Opus 4.8 with cache tokens', () => {
      const cost = calculateCost('claude-opus-4-8', {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheCreateTokens: 1_000_000
      });
      // 5 + 25 + 0.50 + 6.25 = 36.75
      expect(cost).toBeCloseTo(36.75, 2);
    });

    it('prices the bare (undated) IDs used in newer logs', () => {
      // Claude Code now emits bare IDs like claude-opus-4-5 / claude-sonnet-4-5
      expect(calculateCost('claude-opus-4-5', { inputTokens: 1_000_000 })).toBe(5);
      expect(calculateCost('claude-sonnet-4-5', { inputTokens: 1_000_000 })).toBe(3);
      expect(calculateCost('claude-haiku-4-5', { inputTokens: 1_000_000 })).toBe(1);
    });
  });

  describe('override precedence', () => {
    afterEach(() => {
      _setOverrides({}, { source: 'fallback', fetchedAt: null });
    });

    it('getModelLabel prefers the curated hard-coded label over a LiteLLM-derived one', () => {
      _setOverrides({
        'claude-opus-4-8': { label: 'claude-opus-4-8', input: 5, output: 25, cacheRead: 0.5, cacheCreate: 6.25 }
      }, { source: 'litellm', fetchedAt: '2026-07-01T00:00:00Z' });
      // Hard-coded PRICING has the curated "Opus 4.8" — it must win.
      expect(getModelLabel('claude-opus-4-8')).toBe('Opus 4.8');
    });

    it('getModelLabel falls back to the override label when no hard-coded entry exists', () => {
      _setOverrides({
        'claude-newmodel-9': { label: 'Newmodel 9', input: 1, output: 2, cacheRead: 0.1, cacheCreate: 1.25 }
      }, { source: 'litellm', fetchedAt: '2026-07-01T00:00:00Z' });
      expect(getModelLabel('claude-newmodel-9')).toBe('Newmodel 9');
    });

    it('getPricingMeta tags each model with its origin (litellm vs fallback)', () => {
      _setOverrides({
        'claude-opus-4-8': { label: 'Opus 4.8', input: 5, output: 25, cacheRead: 0.5, cacheCreate: 6.25 }
      }, { source: 'litellm', fetchedAt: '2026-07-01T00:00:00Z' });
      const meta = getPricingMeta();
      const overridden = meta.models.find(m => m.model === 'claude-opus-4-8');
      const fallbackOnly = meta.models.find(m => m.model === 'claude-3-7-sonnet-20250219');
      expect(overridden.origin).toBe('litellm');
      expect(fallbackOnly.origin).toBe('fallback');
      expect(meta.overrideCount).toBe(1);
    });
  });

  describe('PRICING table', () => {
    it('has at least 4 models', () => {
      expect(Object.keys(PRICING).length).toBeGreaterThanOrEqual(4);
    });

    it('covers the current generation offline (Opus 4.8, Sonnet 5, Fable 5)', () => {
      expect(PRICING).toHaveProperty('claude-opus-4-8');
      expect(PRICING).toHaveProperty('claude-sonnet-5');
      expect(PRICING).toHaveProperty('claude-fable-5');
    });

    it('all entries have required fields', () => {
      for (const [model, p] of Object.entries(PRICING)) {
        expect(p).toHaveProperty('label');
        expect(p).toHaveProperty('input');
        expect(p).toHaveProperty('output');
        expect(p).toHaveProperty('cacheRead');
        expect(p).toHaveProperty('cacheCreate');
        expect(typeof p.input).toBe('number');
      }
    });
  });
});
