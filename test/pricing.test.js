const { calculateCost, getModelLabel, getPricing, getPricingMeta, cacheCreate1hPrice, PRICING, DEFAULT_PRICING, _setOverrides, _setEpochs } = require('../lib/pricing');

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

    it('has an offline fallback for Sonnet 5 at the standard $2 rate', () => {
      // The $2/$10 launch price BECAME the standard price — Anthropic cancelled
      // the increase to $3/$15 once scheduled for 2026-09-01.
      const cost = calculateCost('claude-sonnet-5', { inputTokens: 1_000_000 });
      expect(cost).toBe(2);
    });

    it('has an offline fallback for Opus 5 (not undercounted as Sonnet)', () => {
      // Opus 5 is the most-used model in real data; without a fallback entry an
      // offline boot priced 19.5B tokens at Sonnet rates.
      const cost = calculateCost('claude-opus-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
      expect(cost).toBe(30);
      expect(cost).not.toBe(DEFAULT_PRICING.input + DEFAULT_PRICING.output);
    });

    it('charges 1-hour cache writes at 2x input, not the 5m 1.25x rate', () => {
      // Verified against the official pricing table: Opus 5 base input $5 →
      // 5m write $6.25, 1h write $10. Claude Code writes mostly to the 1h cache,
      // so treating every write as 5m understated cost by ~8.5% in real data.
      const fiveMin = calculateCost('claude-opus-5', {
        cacheCreateTokens: 1_000_000, cacheCreate5m: 1_000_000, cacheCreate1h: 0
      });
      const oneHour = calculateCost('claude-opus-5', {
        cacheCreateTokens: 1_000_000, cacheCreate5m: 0, cacheCreate1h: 1_000_000
      });
      expect(fiveMin).toBeCloseTo(6.25, 4);
      expect(oneHour).toBeCloseTo(10, 4);
    });

    it('splits a mixed-TTL cache write across both rates', () => {
      const cost = calculateCost('claude-opus-5', {
        cacheCreateTokens: 1_000_000, cacheCreate5m: 400_000, cacheCreate1h: 600_000
      });
      // 0.4 * 6.25 + 0.6 * 10 = 2.5 + 6 = 8.5
      expect(cost).toBeCloseTo(8.5, 4);
    });

    it('prices a write with no TTL split at the 5m rate (legacy rows)', () => {
      // Messages stored before the split was parsed carry only the total. They
      // must keep the old price rather than be silently re-priced upward on
      // data that can no longer be verified.
      const cost = calculateCost('claude-fable-5', { cacheCreateTokens: 1_000_000 });
      expect(cost).toBeCloseTo(12.5, 4);
    });

    it('clamps a 1h figure that exceeds the reported total', () => {
      // Defensive: a malformed sync payload must not produce more cache-write
      // tokens than the message actually reported.
      const cost = calculateCost('claude-opus-5', {
        cacheCreateTokens: 1_000_000, cacheCreate1h: 5_000_000
      });
      expect(cost).toBeCloseTo(10, 4);
    });

    it('derives the 1h price from input so it can never drift', () => {
      for (const id of Object.keys(PRICING)) {
        const p = PRICING[id];
        expect(cacheCreate1hPrice(p)).toBeCloseTo(p.input * 2, 6);
        // Sanity: the 1h tier is always dearer than the 5m tier.
        expect(cacheCreate1hPrice(p)).toBeGreaterThan(p.cacheCreate);
      }
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

  describe('time-aware pricing (PRICING_EPOCHS)', () => {
    afterEach(() => {
      _setOverrides({}, { source: 'fallback', fetchedAt: null });
    });

    // The real PRICING_EPOCHS table is empty (no live model has changed price
    // under the same ID). These exercise the MECHANISM with an injected window,
    // so the table can reflect reality without losing coverage.
    const EPOCH_MODEL = 'claude-sonnet-4-5';
    beforeEach(() => {
      _setEpochs({
        [EPOCH_MODEL]: [
          { from: null, to: '2026-08-31', label: 'Sonnet 4.5', input: 2, output: 10, cacheRead: 0.2, cacheCreate: 2.5 }
        ]
      });
    });
    afterEach(() => { _setEpochs({}); });

    it('prices inside the epoch window at the historical rate', () => {
      const cost = calculateCost(EPOCH_MODEL, {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000
      }, '2026-07-02T10:00:00Z');
      expect(cost).toBeCloseTo(12, 2); // epoch 2 + 10; current is 3 + 15
    });

    it('prices after the epoch window at the current rate', () => {
      const cost = calculateCost(EPOCH_MODEL, {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000
      }, '2026-09-01T00:00:00Z');
      expect(cost).toBeCloseTo(18, 2);
    });

    it('epoch prices win over live LiteLLM overrides — history stays stable', () => {
      // LiteLLM only knows the CURRENT price; a message from inside the
      // epoch window must keep its historical price even after a refresh.
      _setOverrides({
        [EPOCH_MODEL]: { label: 'Sonnet 4.5', input: 3, output: 15, cacheRead: 0.3, cacheCreate: 3.75 }
      }, { source: 'litellm', fetchedAt: '2026-09-15T00:00:00Z' });
      const intro = calculateCost(EPOCH_MODEL, { inputTokens: 1_000_000 }, '2026-08-31T23:00:00Z');
      const after = calculateCost(EPOCH_MODEL, { inputTokens: 1_000_000 }, '2026-09-01T01:00:00Z');
      expect(intro).toBe(2);
      expect(after).toBe(3);
    });

    it('reads the timestamp from the usage object (message) when not passed explicitly', () => {
      // Aggregator call sites pass the full message as usage — its own
      // timestamp must make the cost time-aware without any extra argument.
      const cost = calculateCost(EPOCH_MODEL, {
        inputTokens: 1_000_000,
        timestamp: '2026-07-15T12:00:00Z'
      });
      expect(cost).toBe(2);
    });

    it('falls back to current pricing when no timestamp is available', () => {
      const cost = calculateCost(EPOCH_MODEL, { inputTokens: 1_000_000 });
      expect(cost).toBe(3);
    });

    it('ships an empty epoch table — no model currently has a price history', () => {
      _setEpochs({});
      const { epochs } = getPricingMeta();
      expect(Object.keys(epochs)).toEqual([]);
    });

    it('models without epochs are unaffected by timestamps', () => {
      const a = calculateCost('claude-opus-4-8', { inputTokens: 1_000_000 }, '2025-01-01T00:00:00Z');
      const b = calculateCost('claude-opus-4-8', { inputTokens: 1_000_000 }, '2026-12-01T00:00:00Z');
      expect(a).toBe(5);
      expect(b).toBe(5);
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
