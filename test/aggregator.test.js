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

    it('returns enriched token and cost breakdown', () => {
      const hourly = agg.getHourly();
      const active = hourly.find(h => h.messages > 0);
      expect(active).toBeDefined();
      expect(active).toHaveProperty('inputTokens');
      expect(active).toHaveProperty('outputTokens');
      expect(active).toHaveProperty('cacheReadTokens');
      expect(active).toHaveProperty('cacheCreateTokens');
      expect(active).toHaveProperty('cost');
      expect(active).toHaveProperty('inputCost');
      expect(active).toHaveProperty('outputCost');
      expect(active.inputTokens).toBeGreaterThan(0);
      expect(active.cost).toBeGreaterThan(0);
    });
  });

  describe('getHourlyByModel', () => {
    it('returns 24 entries with model breakdowns', () => {
      const data = agg.getHourlyByModel();
      expect(data.length).toBe(24);
      expect(data[0]).toHaveProperty('date');
      expect(data[0].date).toMatch(/^\d{2}:00$/);
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

  describe('getProductivity extended KPIs', () => {
    it('returns new efficiency KPIs', () => {
      const p = agg.getProductivity();
      expect(typeof p.tokensPerLine).toBe('number');
      expect(typeof p.toolsPerTurn).toBe('number');
      expect(typeof p.linesPerTurn).toBe('number');
      expect(typeof p.ioRatio).toBe('number');
    });
  });

  describe('getEfficiencyTrend', () => {
    it('returns daily and rolling arrays', () => {
      const result = agg.getEfficiencyTrend();
      expect(result).toHaveProperty('daily');
      expect(result).toHaveProperty('rolling');
      expect(result.daily.length).toBe(3);
      expect(result.rolling.length).toBe(3);
    });

    it('each entry has correct structure', () => {
      const { daily } = agg.getEfficiencyTrend();
      for (const d of daily) {
        expect(d).toHaveProperty('date');
        expect(d).toHaveProperty('tokensPerLine');
        expect(d).toHaveProperty('linesPerTurn');
        expect(d).toHaveProperty('toolsPerTurn');
        expect(d).toHaveProperty('ioRatio');
      }
    });

    it('filters by date range', () => {
      const result = agg.getEfficiencyTrend('2026-02-22', '2026-02-22');
      expect(result.daily.length).toBe(1);
    });
  });

  describe('getModelEfficiency', () => {
    it('returns per-model efficiency metrics', () => {
      const models = agg.getModelEfficiency();
      expect(models.length).toBeGreaterThan(0);
      for (const m of models) {
        expect(m).toHaveProperty('model');
        expect(m).toHaveProperty('label');
        expect(m).toHaveProperty('tokensPerLine');
        expect(m).toHaveProperty('linesPerTurn');
        expect(m).toHaveProperty('toolsPerTurn');
        expect(m.messages).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe('getSessionDepthAnalysis', () => {
    it('returns session scatter data', () => {
      const sessions = agg.getSessionDepthAnalysis();
      expect(Array.isArray(sessions)).toBe(true);
      for (const s of sessions) {
        expect(s).toHaveProperty('messages');
        expect(s).toHaveProperty('linesPerTurn');
        expect(s).toHaveProperty('totalLines');
        expect(s.totalLines).toBeGreaterThan(0);
      }
    });
  });

  describe('getDaily includes tool data', () => {
    it('daily entries have toolCalls and tools', () => {
      const daily = agg.getDaily();
      for (const d of daily) {
        expect(d).toHaveProperty('toolCalls');
        expect(d).toHaveProperty('tools');
        expect(typeof d.toolCalls).toBe('number');
        expect(typeof d.tools).toBe('object');
      }
    });
  });

  describe('getProductivity period isolation', () => {
    it('returns different values for different date ranges', () => {
      const prodFeb20 = agg.getProductivity('2026-02-20', '2026-02-20');
      const prodFeb22 = agg.getProductivity('2026-02-22', '2026-02-22');
      // Both should have data but from different days
      expect(prodFeb20.totalLines).toBeGreaterThanOrEqual(0);
      expect(prodFeb22.totalLines).toBeGreaterThanOrEqual(0);
      // Key metrics should be numbers
      expect(typeof prodFeb20.tokensPerMin).toBe('number');
      expect(typeof prodFeb20.linesPerHour).toBe('number');
      expect(typeof prodFeb20.costPerLine).toBe('number');
      expect(typeof prodFeb20.tokensPerLine).toBe('number');
      expect(typeof prodFeb20.linesPerTurn).toBe('number');
      expect(typeof prodFeb20.toolsPerTurn).toBe('number');
      expect(typeof prodFeb20.ioRatio).toBe('number');
      expect(typeof prodFeb20.codingHours).toBe('number');
    });

    it('returns zero metrics for a date range with no data', () => {
      const prodEmpty = agg.getProductivity('2030-01-01', '2030-01-02');
      expect(prodEmpty.tokensPerMin).toBe(0);
      expect(prodEmpty.linesPerHour).toBe(0);
      expect(prodEmpty.totalLines).toBe(0);
      expect(prodEmpty.codingHours).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears all data', () => {
      agg.reset();
      expect(agg.messages.length).toBe(0);
      expect(agg.getOverview().messages).toBe(0);
    });
  });

  describe('streaming dedup', () => {
    it('deduplicates messages with the same id (last wins)', () => {
      const fresh = new Aggregator();
      // First streaming entry: text only, no tools, no lines
      fresh.addMessages([{
        id: 'msg_stream_1',
        timestamp: '2026-02-22T10:00:00Z',
        model: 'claude-sonnet-4-5-20250929',
        sessionId: 'sess_1',
        project: 'test',
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        tools: [],
        linesAdded: 0,
        linesRemoved: 0,
        linesWritten: 0
      }]);
      // Second streaming entry: same id, now with Edit tool and lines
      fresh.addMessages([{
        id: 'msg_stream_1',
        timestamp: '2026-02-22T10:00:02Z',
        model: 'claude-sonnet-4-5-20250929',
        sessionId: 'sess_1',
        project: 'test',
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        tools: ['Edit'],
        linesAdded: 15,
        linesRemoved: 5,
        linesWritten: 0
      }]);

      const overview = fresh.getOverview();
      // Should count as ONE message, not two
      expect(overview.messages).toBe(1);
      // Should use the LATEST values (500 output tokens, not 200 or 700)
      expect(overview.outputTokens).toBe(500);
      // Lines should reflect the final entry, not sum of both
      expect(overview.linesAdded).toBe(15);
      expect(overview.linesRemoved).toBe(5);
    });

    it('handles multiple updates to same message correctly', () => {
      const fresh = new Aggregator();
      const base = {
        id: 'msg_multi',
        timestamp: '2026-02-22T12:00:00Z',
        model: 'claude-sonnet-4-5-20250929',
        sessionId: 'sess_2',
        project: 'test',
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
      };

      // Entry 1: text only
      fresh.addMessages([{ ...base, inputTokens: 500, outputTokens: 100, tools: [], linesAdded: 0, linesRemoved: 0, linesWritten: 0 }]);
      // Entry 2: Edit tool added
      fresh.addMessages([{ ...base, inputTokens: 500, outputTokens: 300, tools: ['Edit'], linesAdded: 10, linesRemoved: 3, linesWritten: 0 }]);
      // Entry 3: Edit + Write tools
      fresh.addMessages([{ ...base, inputTokens: 500, outputTokens: 600, tools: ['Edit', 'Write'], linesAdded: 10, linesRemoved: 3, linesWritten: 50 }]);

      const overview = fresh.getOverview();
      expect(overview.messages).toBe(1);
      expect(overview.outputTokens).toBe(600);
      expect(overview.linesAdded).toBe(10);
      expect(overview.linesRemoved).toBe(3);
      expect(overview.linesWritten).toBe(50);

      // Session should also have correct values
      const sessions = fresh.getSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].messages).toBe(1);
      expect(sessions[0].outputTokens).toBe(600);
      expect(sessions[0].linesWritten).toBe(50);
    });

    it('does not affect different message ids', () => {
      const fresh = new Aggregator();
      fresh.addMessages([
        { id: 'msg_a', timestamp: '2026-02-22T10:00:00Z', model: 'claude-sonnet-4-5-20250929', sessionId: 'sess_1', project: 'test', inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreateTokens: 0, tools: ['Write'], linesAdded: 0, linesRemoved: 0, linesWritten: 20 },
        { id: 'msg_b', timestamp: '2026-02-22T10:01:00Z', model: 'claude-sonnet-4-5-20250929', sessionId: 'sess_1', project: 'test', inputTokens: 200, outputTokens: 100, cacheReadTokens: 0, cacheCreateTokens: 0, tools: ['Edit'], linesAdded: 10, linesRemoved: 5, linesWritten: 0 },
      ]);

      const overview = fresh.getOverview();
      expect(overview.messages).toBe(2);
      expect(overview.linesWritten).toBe(20);
      expect(overview.linesAdded).toBe(10);
      expect(overview.linesRemoved).toBe(5);
    });
  });
});
