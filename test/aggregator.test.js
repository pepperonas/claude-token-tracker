const Aggregator = require('../lib/aggregator');
const { SAMPLE_MESSAGES } = require('./fixtures/sample-messages');

describe('aggregator', () => {
  let agg;

  beforeEach(() => {
    agg = new Aggregator();
    agg.addMessages(SAMPLE_MESSAGES);
  });

  describe('getOverview', () => {
    it('returns correct totals for all data', () => {
      const overview = agg.getOverview();
      expect(overview.messages).toBe(10);
      expect(overview.totalTokens).toBeGreaterThan(0);
      expect(overview.estimatedCost).toBeGreaterThan(0);
      expect(overview.sessions).toBe(7);
    });

    it('filters by date range', () => {
      const overview = agg.getOverview('2026-02-22', '2026-02-22');
      // Messages on Feb 22: msg_007, msg_008, msg_009, msg_010
      expect(overview.messages).toBe(4);
    });

    it('returns zero for future dates', () => {
      const overview = agg.getOverview('2030-01-01', '2030-01-02');
      expect(overview.messages).toBe(0);
      expect(overview.totalTokens).toBe(0);
    });
  });

  describe('getDaily', () => {
    it('returns sorted daily data', () => {
      const daily = agg.getDaily();
      expect(daily.length).toBe(3); // Feb 20, 21, 22
      expect(daily[0].date).toBe('2026-02-20');
      expect(daily[2].date).toBe('2026-02-22');
    });

    it('each day has correct structure', () => {
      const daily = agg.getDaily();
      for (const d of daily) {
        expect(d).toHaveProperty('date');
        expect(d).toHaveProperty('inputTokens');
        expect(d).toHaveProperty('outputTokens');
        expect(d).toHaveProperty('cacheReadTokens');
        expect(d).toHaveProperty('cacheCreateTokens');
        expect(d).toHaveProperty('cost');
        expect(d).toHaveProperty('messages');
      }
    });
  });

  describe('getSessions', () => {
    it('returns all sessions', () => {
      const sessions = agg.getSessions();
      expect(sessions.length).toBe(7);
    });

    it('filters by project', () => {
      const sessions = agg.getSessions('token/tracker');
      expect(sessions.length).toBe(3); // session-aaa, session-ddd, session-fff
      for (const s of sessions) {
        expect(s.project).toBe('token/tracker');
      }
    });

    it('sessions are sorted by firstTs descending', () => {
      const sessions = agg.getSessions();
      for (let i = 1; i < sessions.length; i++) {
        expect(sessions[i - 1].firstTs >= sessions[i].firstTs).toBe(true);
      }
    });
  });

  describe('getSession', () => {
    it('returns session details', () => {
      const session = agg.getSession('session-aaa');
      expect(session).not.toBeNull();
      expect(session.project).toBe('token/tracker');
      expect(session.messages).toBe(2);
    });

    it('returns null for unknown session', () => {
      expect(agg.getSession('nonexistent')).toBeNull();
    });
  });

  describe('getProjects', () => {
    it('returns all projects sorted by total tokens desc', () => {
      const projects = agg.getProjects();
      expect(projects.length).toBe(3); // token/tracker, claude/remote, home
      // First should have most tokens
      expect(projects[0].totalTokens).toBeGreaterThanOrEqual(projects[1].totalTokens);
    });
  });

  describe('getModels', () => {
    it('returns models without synthetic', () => {
      const models = agg.getModels();
      for (const m of models) {
        expect(m.model).not.toBe('<synthetic>');
      }
    });

    it('each model has label', () => {
      const models = agg.getModels();
      for (const m of models) {
        expect(m.label).toBeTruthy();
      }
    });
  });

  describe('getTools', () => {
    it('returns tools sorted by count', () => {
      const tools = agg.getTools();
      expect(tools.length).toBeGreaterThan(0);
      for (let i = 1; i < tools.length; i++) {
        expect(tools[i - 1].count).toBeGreaterThanOrEqual(tools[i].count);
      }
    });

    it('percentages sum to ~100%', () => {
      const tools = agg.getTools();
      const totalPct = tools.reduce((sum, t) => sum + t.percentage, 0);
      expect(totalPct).toBeCloseTo(100, 0);
    });
  });

  describe('getHourly', () => {
    it('returns 24 hours', () => {
      const hourly = agg.getHourly();
      expect(hourly.length).toBe(24);
      expect(hourly[0].hour).toBe(0);
      expect(hourly[23].hour).toBe(23);
    });
  });

  describe('getDailyByModel', () => {
    it('returns daily data with model breakdowns', () => {
      const data = agg.getDailyByModel();
      expect(data.length).toBe(3);
      expect(data[0]).toHaveProperty('date');
    });
  });

  // --- Insights methods ---

  describe('getStopReasons', () => {
    it('returns stop reason distribution', () => {
      const reasons = agg.getStopReasons();
      expect(reasons.length).toBeGreaterThan(0);
      const endTurn = reasons.find(r => r.reason === 'end_turn');
      expect(endTurn).toBeDefined();
      expect(endTurn.count).toBeGreaterThan(0);
    });

    it('percentages sum to ~100%', () => {
      const reasons = agg.getStopReasons();
      const totalPct = reasons.reduce((sum, r) => sum + r.percentage, 0);
      expect(totalPct).toBeCloseTo(100, 0);
    });
  });

  describe('getDayOfWeek', () => {
    it('returns 7 days', () => {
      const dow = agg.getDayOfWeek();
      expect(dow.length).toBe(7);
      expect(dow[0].day).toBe('Sun');
      expect(dow[6].day).toBe('Sat');
    });

    it('has messages on some days', () => {
      const dow = agg.getDayOfWeek();
      const totalMsgs = dow.reduce((sum, d) => sum + d.messages, 0);
      expect(totalMsgs).toBe(10);
    });
  });

  describe('getCacheEfficiency', () => {
    it('returns daily cache hit rates', () => {
      const eff = agg.getCacheEfficiency();
      expect(eff.length).toBe(3);
      for (const e of eff) {
        expect(e.cacheHitRate).toBeGreaterThanOrEqual(0);
        expect(e.cacheHitRate).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('getCumulativeCost', () => {
    it('returns monotonically increasing costs', () => {
      const cum = agg.getCumulativeCost();
      for (let i = 1; i < cum.length; i++) {
        expect(cum[i].cost).toBeGreaterThanOrEqual(cum[i - 1].cost);
      }
    });
  });

  describe('getDailyCostBreakdown', () => {
    it('returns cost breakdown by token type', () => {
      const breakdown = agg.getDailyCostBreakdown();
      expect(breakdown.length).toBe(3);
      for (const d of breakdown) {
        expect(d).toHaveProperty('inputCost');
        expect(d).toHaveProperty('outputCost');
        expect(d).toHaveProperty('cacheReadCost');
        expect(d).toHaveProperty('cacheCreateCost');
      }
    });
  });

  describe('getSessionEfficiency', () => {
    it('returns efficiency metrics per session', () => {
      const eff = agg.getSessionEfficiency();
      expect(eff.length).toBe(7);
      for (const e of eff) {
        expect(e.tokensPerMessage).toBeGreaterThan(0);
        expect(e.costPerMessage).toBeGreaterThan(0);
      }
    });
  });

  describe('getProductivity', () => {
    it('returns all expected fields', () => {
      const p = agg.getProductivity();
      expect(p).toHaveProperty('tokensPerMin');
      expect(p).toHaveProperty('linesPerHour');
      expect(p).toHaveProperty('msgsPerSession');
      expect(p).toHaveProperty('costPerLine');
      expect(p).toHaveProperty('cacheSavings');
      expect(p).toHaveProperty('codeRatio');
      expect(p).toHaveProperty('codingHours');
      expect(p).toHaveProperty('totalLines');
      expect(p).toHaveProperty('trends');
      expect(p).toHaveProperty('dailyProductivity');
      expect(p).toHaveProperty('stopReasons');
    });

    it('returns numeric values', () => {
      const p = agg.getProductivity();
      expect(typeof p.tokensPerMin).toBe('number');
      expect(typeof p.linesPerHour).toBe('number');
      expect(typeof p.msgsPerSession).toBe('number');
      expect(typeof p.costPerLine).toBe('number');
      expect(typeof p.cacheSavings).toBe('number');
      expect(typeof p.codeRatio).toBe('number');
      expect(typeof p.codingHours).toBe('number');
      expect(typeof p.totalLines).toBe('number');
    });

    it('filters by date range', () => {
      const p = agg.getProductivity('2026-02-22', '2026-02-22');
      expect(p.dailyProductivity.length).toBe(1);
      expect(p.dailyProductivity[0].date).toBe('2026-02-22');
    });

    it('returns dailyProductivity with correct structure', () => {
      const p = agg.getProductivity();
      expect(Array.isArray(p.dailyProductivity)).toBe(true);
      for (const d of p.dailyProductivity) {
        expect(d).toHaveProperty('date');
        expect(d).toHaveProperty('linesPerHour');
        expect(d).toHaveProperty('costPerLine');
      }
    });

    it('cacheSavings is non-negative', () => {
      const p = agg.getProductivity();
      expect(p.cacheSavings).toBeGreaterThanOrEqual(0);
    });

    it('computes trends with date range', () => {
      const p = agg.getProductivity('2026-02-21', '2026-02-22');
      expect(typeof p.trends).toBe('object');
      // Trends should have numeric values when a date range is given
      if (p.trends.tokensPerMin !== undefined) {
        expect(typeof p.trends.tokensPerMin).toBe('number');
      }
    });
  });

  describe('reset', () => {
    it('clears all data', () => {
      agg.reset();
      expect(agg.messages.length).toBe(0);
      expect(agg.getOverview().messages).toBe(0);
    });
  });
});
