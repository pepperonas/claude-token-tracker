const { calculateCost, getModelLabel, getPricing, PRICING, DEFAULT_PRICING } = require('../lib/pricing');

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

  describe('PRICING table', () => {
    it('has at least 4 models', () => {
      expect(Object.keys(PRICING).length).toBeGreaterThanOrEqual(4);
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
