const { ACHIEVEMENTS, buildStats, checkAchievements, getAchievementsResponse } = require('../lib/achievements');

// Mock aggregator that returns configurable data
function createMockAggregator(overrides = {}) {
  const defaults = {
    overview: {
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0,
      inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheCreateCost: 0,
      sessions: 0, messages: 0,
      linesAdded: 0, linesRemoved: 0, linesWritten: 0
    },
    sessions: [],
    projects: [],
    models: [],
    tools: [],
    daily: [],
    hourly: Array.from({ length: 24 }, (_, h) => ({ hour: h, messages: 0 }))
  };

  const data = { ...defaults, ...overrides };

  return {
    getOverview: () => data.overview,
    getSessions: () => data.sessions,
    getProjects: () => data.projects,
    getModels: () => data.models,
    getTools: () => data.tools,
    getDaily: () => data.daily,
    getHourly: () => data.hourly
  };
}

// Mock DB for achievements
function createMockDb() {
  const store = new Map();
  return {
    getUnlockedAchievements: (userId) => {
      return (store.get(userId) || []).map(key => ({ achievement_key: key, unlocked_at: '2025-01-01' }));
    },
    unlockAchievementsBatch: (userId, keys) => {
      const existing = store.get(userId) || [];
      store.set(userId, [...existing, ...keys]);
    },
    _store: store
  };
}

describe('Achievements', () => {
  describe('ACHIEVEMENTS array', () => {
    it('should have exactly 700 achievements', () => {
      expect(ACHIEVEMENTS.length).toBe(700);
    });

    it('should have unique keys', () => {
      const keys = ACHIEVEMENTS.map(a => a.key);
      expect(new Set(keys).size).toBe(700);
    });

    it('should have valid tiers', () => {
      const validTiers = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
      for (const a of ACHIEVEMENTS) {
        expect(validTiers).toContain(a.tier);
      }
    });

    it('should have valid categories', () => {
      const validCategories = [
        'tokens', 'sessions', 'messages', 'cost', 'lines',
        'models', 'tools', 'time', 'projects', 'streaks', 'cache', 'special',
        'efficiency', 'ratelimits'
      ];
      for (const a of ACHIEVEMENTS) {
        expect(validCategories).toContain(a.category);
      }
    });

    it('should have check functions', () => {
      for (const a of ACHIEVEMENTS) {
        expect(typeof a.check).toBe('function');
      }
    });
  });

  describe('buildStats', () => {
    it('should return expected shape', () => {
      const agg = createMockAggregator();
      const stats = buildStats(agg);

      expect(stats).toHaveProperty('totalTokens');
      expect(stats).toHaveProperty('totalSessions');
      expect(stats).toHaveProperty('totalMessages');
      expect(stats).toHaveProperty('totalCost');
      expect(stats).toHaveProperty('totalLinesWritten');
      expect(stats).toHaveProperty('totalLinesAdded');
      expect(stats).toHaveProperty('totalLinesRemoved');
      expect(stats).toHaveProperty('netLines');
      expect(stats).toHaveProperty('modelNames');
      expect(stats).toHaveProperty('modelCount');
      expect(stats).toHaveProperty('modelMessages');
      expect(stats).toHaveProperty('toolNames');
      expect(stats).toHaveProperty('toolCount');
      expect(stats).toHaveProperty('totalToolCalls');
      expect(stats).toHaveProperty('longestStreak');
      expect(stats).toHaveProperty('activeDays');
      expect(stats).toHaveProperty('projectCount');
      expect(stats).toHaveProperty('avgCacheRate');
      // New stats for extended achievements
      expect(stats).toHaveProperty('totalOutputTokens');
      expect(stats).toHaveProperty('totalInputTokens');
      expect(stats).toHaveProperty('longestSessionMin');
      expect(stats).toHaveProperty('maxMessagesInSession');
      expect(stats).toHaveProperty('maxDayTokens');
      expect(stats).toHaveProperty('toolCallsByName');
      expect(stats).toHaveProperty('monthsActive');
      expect(stats).toHaveProperty('fullWeekendCount');
    });

    it('should calculate total tokens correctly', () => {
      const agg = createMockAggregator({
        overview: {
          inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheCreateTokens: 100,
          inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheCreateCost: 0,
          sessions: 1, messages: 5, linesAdded: 0, linesRemoved: 0, linesWritten: 0
        }
      });
      const stats = buildStats(agg);
      expect(stats.totalTokens).toBe(1800);
    });

    it('should calculate longest streak correctly', () => {
      const agg = createMockAggregator({
        daily: [
          { date: '2025-01-01', messages: 5 },
          { date: '2025-01-02', messages: 3 },
          { date: '2025-01-03', messages: 7 },
          { date: '2025-01-05', messages: 2 },
          { date: '2025-01-06', messages: 4 }
        ]
      });
      const stats = buildStats(agg);
      expect(stats.longestStreak).toBe(3);
      expect(stats.activeDays).toBe(5);
    });

    it('should detect marathon sessions', () => {
      const agg = createMockAggregator({
        sessions: [
          { firstTs: '2025-01-01T10:00:00Z', durationMin: 130 },
          { firstTs: '2025-01-02T14:00:00Z', durationMin: 45 }
        ]
      });
      const stats = buildStats(agg);
      expect(stats.marathonSessions).toBe(1);
    });

    it('should detect early bird sessions', () => {
      const agg = createMockAggregator({
        sessions: [
          { firstTs: '2025-01-01T05:30:00Z', durationMin: 30 },
          { firstTs: '2025-01-01T10:00:00Z', durationMin: 60 }
        ]
      });
      const stats = buildStats(agg);
      expect(stats.earlyBirdSessions).toBe(1);
    });

    it('should count model messages correctly', () => {
      const agg = createMockAggregator({
        models: [
          { label: 'Claude Sonnet 4.5', messages: 150 },
          { label: 'Claude Opus 4.6', messages: 80 }
        ]
      });
      const stats = buildStats(agg);
      expect(stats.modelMessages.sonnet).toBe(150);
      expect(stats.modelMessages.opus).toBe(80);
      expect(stats.modelCount).toBe(2);
    });
  });

  describe('checkAchievements', () => {
    it('should unlock new achievements', () => {
      const agg = createMockAggregator({
        overview: {
          inputTokens: 5000, outputTokens: 2000, cacheReadTokens: 0, cacheCreateTokens: 0,
          inputCost: 0.01, outputCost: 0.03, cacheReadCost: 0, cacheCreateCost: 0,
          sessions: 2, messages: 15, linesAdded: 0, linesRemoved: 0, linesWritten: 0
        },
        sessions: [
          { firstTs: '2025-01-01T10:00:00Z', durationMin: 30 },
          { firstTs: '2025-01-02T14:00:00Z', durationMin: 45 }
        ],
        projects: [{ name: 'test-project' }],
        daily: [
          { date: '2025-01-01', messages: 8 },
          { date: '2025-01-02', messages: 7 }
        ]
      });

      const db = createMockDb();
      const newKeys = checkAchievements(agg, 0, db);

      expect(newKeys).toContain('tokens_1k');
      expect(newKeys).toContain('sessions_1');
      expect(newKeys).toContain('messages_10');
      expect(newKeys).toContain('project_1');
    });

    it('should not re-unlock already unlocked achievements', () => {
      const agg = createMockAggregator({
        overview: {
          inputTokens: 5000, outputTokens: 2000, cacheReadTokens: 0, cacheCreateTokens: 0,
          inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheCreateCost: 0,
          sessions: 2, messages: 15, linesAdded: 0, linesRemoved: 0, linesWritten: 0
        },
        sessions: [
          { firstTs: '2025-01-01T10:00:00Z', durationMin: 30 },
          { firstTs: '2025-01-02T14:00:00Z', durationMin: 45 }
        ],
        projects: [{ name: 'test-project' }],
        daily: [
          { date: '2025-01-01', messages: 8 },
          { date: '2025-01-02', messages: 7 }
        ]
      });

      const db = createMockDb();
      const first = checkAchievements(agg, 0, db);
      expect(first.length).toBeGreaterThan(0);

      // Second check should not return the same achievements
      const second = checkAchievements(agg, 0, db);
      for (const key of first) {
        expect(second).not.toContain(key);
      }
    });
  });

  describe('backfillAchievements', () => {
    const Aggregator = require('../lib/aggregator');
    const { backfillAchievements } = require('../lib/achievements');

    const mkMsg = (id, y, mo, d, h, min, tokens = 100) => ({
      id,
      timestamp: new Date(y, mo, d, h, min, 0).toISOString(),
      model: 'claude-sonnet-5', sessionId: 's-' + d, project: 'proj',
      inputTokens: tokens, outputTokens: tokens, cacheReadTokens: 0, cacheCreateTokens: 0,
      tools: ['Read'], linesAdded: 0, linesRemoved: 0, linesWritten: 0
    });

    it('dates unlocks on the day they were historically earned, not today', () => {
      const agg = new Aggregator();
      const msgs = [];
      // Day 1 (2026-01-05): 12 small messages → messages_10 etc. unlock here
      for (let i = 0; i < 12; i++) msgs.push(mkMsg('d1_' + i, 2026, 0, 5, 10, i));
      // Day 2 (2026-01-06): heavy day → tokens_1m unlocks here
      msgs.push(mkMsg('d2_1', 2026, 0, 6, 12, 0, 600000));
      // Day 3 (2026-01-07): small day
      msgs.push(mkMsg('d3_1', 2026, 0, 7, 9, 0));
      agg.addMessages(msgs);

      const calls = { clearedUser: null, entries: null };
      const db = {
        clearAchievementsForUser: (uid) => { calls.clearedUser = uid; },
        unlockAchievementsBatchAt: (_uid, entries) => { calls.entries = entries; }
      };

      const res = backfillAchievements(agg, 0, db);

      expect(calls.clearedUser).toBe(0);
      expect(res.days).toBe(3);
      expect(res.from).toBe('2026-01-05');
      expect(res.to).toBe('2026-01-07');
      expect(res.unlocked).toBe(calls.entries.length);
      expect(res.unlocked).toBeGreaterThan(0);

      const byKey = Object.fromEntries(calls.entries.map(e => [e.key, e.at]));
      // messages_10 was reached on day 1 — must carry day 1's date
      expect(new Date(byKey['messages_10']).getDate()).toBe(5);
      // tokens_1m only after day 2's heavy message
      expect(new Date(byKey['tokens_1m']).getDate()).toBe(6);
      // Ratio achievements are sample-gated: with only 3 active days no
      // gold+ ratio badge may unlock, and bronze/silver ones not before day 3
      for (const e of calls.entries) {
        const def = ACHIEVEMENTS.find(a => a.key === e.key);
        if (/^(avg_|cache_rate_|deletion_ratio_|output_ratio_|tokens_per_msg_|tokens_per_dollar_|msgs_per_session_|sessions_per_day_|model_loyal_|model_(opus|sonnet|haiku)_majority)/.test(e.key)) {
          expect(['bronze', 'silver']).toContain(def.tier);
          expect(new Date(e.at).getDate()).toBe(7); // 3rd active day
        }
      }
      // NOTHING may be stamped with today's date (the bug being fixed)
      const today = new Date().toISOString().slice(0, 10);
      for (const e of calls.entries) {
        expect(e.at.slice(0, 10)).not.toBe(today);
      }
    });

    it('is deterministic: two runs over the same history produce identical dates', () => {
      const build = () => {
        const agg = new Aggregator();
        const msgs = [];
        for (let d = 1; d <= 8; d++) {
          for (let i = 0; i < 5; i++) msgs.push(mkMsg(`r${d}_${i}`, 2026, 0, d, 10, i, 5000 * d));
        }
        agg.addMessages(msgs);
        const entries = [];
        backfillAchievements(agg, 0, {
          clearAchievementsForUser: () => {},
          unlockAchievementsBatchAt: (_u, e) => entries.push(...e)
        });
        return entries.sort((a, b) => a.key.localeCompare(b.key));
      };
      expect(build()).toEqual(build());
    });

    it('prefers the atomic replace API when the db layer offers it', () => {
      const agg = new Aggregator();
      agg.addMessages([mkMsg('one', 2026, 0, 5, 10, 0)]);
      const seen = { replaced: 0, cleared: 0, appended: 0 };
      backfillAchievements(agg, 7, {
        replaceAchievementsForUser: () => { seen.replaced++; },
        clearAchievementsForUser: () => { seen.cleared++; },
        unlockAchievementsBatchAt: () => { seen.appended++; }
      });
      // clear+insert as two statements can be observed half-done by a
      // concurrent watcher check — the single transaction must win.
      expect(seen.replaced).toBe(1);
      expect(seen.cleared).toBe(0);
      expect(seen.appended).toBe(0);
    });

    it('does nothing (and does not wipe) when there is no history', () => {
      const seen = { replaced: null, cleared: 0 };
      const res = backfillAchievements(new Aggregator(), 0, {
        replaceAchievementsForUser: (_u, e) => { seen.replaced = e; },
        clearAchievementsForUser: () => { seen.cleared++; }
      });
      expect(res.unlocked).toBe(0);
      expect(res.days).toBe(0);
      expect(seen.cleared).toBe(0);
    });

    it('gates ratio achievements by tier-scaled active days (3/5/7/14/30)', () => {
      const RATIO = /^(avg_|cache_rate_|deletion_ratio_|output_ratio_|tokens_per_msg_|tokens_per_dollar_|msgs_per_session_|sessions_per_day_|model_loyal_|model_(opus|sonnet|haiku)_majority)/;
      const tiersFor = (days) => {
        const agg = new Aggregator();
        const msgs = [];
        for (let d = 1; d <= days; d++) {
          for (let i = 0; i < 8; i++) {
            msgs.push({
              ...mkMsg(`gate${d}_${i}`, 2026, 0, d, 10, i, 200000),
              cacheReadTokens: 1_000_000, cacheCreateTokens: 200000,
              linesAdded: 5, linesRemoved: 1, linesWritten: 3
            });
          }
        }
        agg.addMessages(msgs);
        const entries = [];
        backfillAchievements(agg, 0, {
          clearAchievementsForUser: () => {},
          unlockAchievementsBatchAt: (_u, e) => entries.push(...e)
        });
        return new Set(entries.filter(e => RATIO.test(e.key))
          .map(e => ACHIEVEMENTS.find(a => a.key === e.key).tier));
      };

      // Identical per-day behaviour — only the sample size grows.
      const short = tiersFor(4);      // below the silver gate (5 days)
      const mid = tiersFor(10);       // past gold (7), below platinum (14)
      const long = tiersFor(31);      // past diamond (30)

      expect(short.has('gold')).toBe(false);
      expect(short.has('platinum')).toBe(false);
      expect(mid.has('gold')).toBe(true);
      expect(mid.has('platinum')).toBe(false);
      expect(mid.has('diamond')).toBe(false);
      expect(long.has('platinum')).toBe(true);
      expect(long.has('diamond')).toBe(true);
    });
  });

  describe('getAchievementsResponse', () => {
    it('should have emoji field on all achievements', () => {
      for (const a of ACHIEVEMENTS) {
        expect(typeof a.emoji).toBe('string');
        expect(a.emoji.length).toBeGreaterThan(0);
      }
    });

    it('should return all 700 achievements with unlock status', () => {
      const db = createMockDb();
      db.unlockAchievementsBatch(0, ['tokens_1k', 'sessions_1']);

      const response = getAchievementsResponse(0, db);

      expect(response.length).toBe(700);

      const tokens1k = response.find(a => a.key === 'tokens_1k');
      expect(tokens1k.unlocked).toBe(true);
      expect(tokens1k.unlockedAt).toBeTruthy();

      const tokens10k = response.find(a => a.key === 'tokens_10k');
      expect(tokens10k.unlocked).toBe(false);
      expect(tokens10k.unlockedAt).toBeNull();
    });

    it('should include category and tier for each achievement', () => {
      const db = createMockDb();
      const response = getAchievementsResponse(0, db);

      for (const a of response) {
        expect(a).toHaveProperty('key');
        expect(a).toHaveProperty('category');
        expect(a).toHaveProperty('tier');
        expect(a).toHaveProperty('emoji');
        expect(a).toHaveProperty('unlocked');
        expect(a).toHaveProperty('unlockedAt');
      }
    });
  });
});
