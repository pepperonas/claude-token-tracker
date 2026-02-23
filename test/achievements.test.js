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
    it('should have exactly 500 achievements', () => {
      expect(ACHIEVEMENTS.length).toBe(500);
    });

    it('should have unique keys', () => {
      const keys = ACHIEVEMENTS.map(a => a.key);
      expect(new Set(keys).size).toBe(500);
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
        'models', 'tools', 'time', 'projects', 'streaks', 'cache', 'special'
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

  describe('getAchievementsResponse', () => {
    it('should have emoji field on all achievements', () => {
      for (const a of ACHIEVEMENTS) {
        expect(typeof a.emoji).toBe('string');
        expect(a.emoji.length).toBeGreaterThan(0);
      }
    });

    it('should return all 500 achievements with unlock status', () => {
      const db = createMockDb();
      db.unlockAchievementsBatch(0, ['tokens_1k', 'sessions_1']);

      const response = getAchievementsResponse(0, db);

      expect(response.length).toBe(500);

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
