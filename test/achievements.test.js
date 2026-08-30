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
    it('should have exactly 1200 achievements', () => {
      expect(ACHIEVEMENTS.length).toBe(1200);
    });

    it('should have unique keys', () => {
      const keys = ACHIEVEMENTS.map(a => a.key);
      expect(new Set(keys).size).toBe(1200);
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

    it('should return all 1200 achievements with unlock status', () => {
      const db = createMockDb();
      db.unlockAchievementsBatch(0, ['tokens_1k', 'sessions_1']);

      const response = getAchievementsResponse(0, db);

      expect(response.length).toBe(1200);

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

describe('achievement catalogue (1200 definitions)', () => {
  const { ACHIEVEMENTS } = require('../lib/achievements');
  const fs = require('fs');
  const path = require('path');
  const i18nSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'i18n.js'), 'utf8');
  // The English block comes first in the file, the German one after it.
  const deStart = i18nSrc.indexOf("achievementCat_sessions: 'Sitzungen'");
  const EN = i18nSrc.slice(0, deStart);
  const DE = i18nSrc.slice(deStart);

  it('has unique keys', () => {
    const keys = ACHIEVEMENTS.map(a => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every achievement a name and description in both languages', () => {
    // A missing string renders as the raw key in the UI — easy to ship, ugly
    // to discover. 1200 entries make this impossible to eyeball.
    const missing = [];
    for (const a of ACHIEVEMENTS) {
      for (const [part, lang] of [[EN, 'en'], [DE, 'de']]) {
        if (!part.includes(`    ach_${a.key}: `)) missing.push(`${lang}:${a.key}`);
        if (!part.includes(`    ach_${a.key}_desc: `)) missing.push(`${lang}:${a.key}_desc`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('gives every achievement a valid tier, category and emoji', () => {
    const tiers = new Set(['bronze', 'silver', 'gold', 'platinum', 'diamond']);
    for (const a of ACHIEVEMENTS) {
      expect(tiers.has(a.tier)).toBe(true);
      expect(typeof a.category).toBe('string');
      expect(a.category.length).toBeGreaterThan(0);
      expect(typeof a.emoji).toBe('string');
      expect(a.emoji.length).toBeGreaterThan(0);
      expect(typeof a.check).toBe('function');
    }
  });

  it('every check survives an all-zero stats object', () => {
    // A fresh install builds stats where every counter is 0 and every object
    // is empty. One check reaching into an undefined nested field would throw
    // during startup, before the dashboard ever renders.
    const zero = {
      totalTokens: 0, totalSessions: 0, totalMessages: 0, totalCost: 0,
      totalLinesWritten: 0, totalLinesAdded: 0, totalLinesRemoved: 0, netLines: 0,
      modelNames: [], modelCount: 0, modelMessages: { sonnet: 0, opus: 0, haiku: 0 },
      toolNames: new Set(), toolCount: 0, totalToolCalls: 0, toolCallsByName: {},
      activeDays: 0, longestStreak: 0, avgCacheRate: 0, outputRatio: 0,
      modelMessagesOf: () => 0,
      totalActiveHours: 0, maxSessionActiveMin: 0, avgActiveMinPerSession: 0,
      mcpServerCount: 0, mcpToolCalls: 0, subagentMessages: 0, subagentCost: 0,
      cacheSavingsUsd: 0, maxHoursInDay: 0, longestWeekdayStreak: 0,
      maxModelsInSession: 0, multiModelSessions: 0
    };
    const proxied = new Proxy(zero, {
      get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && k.startsWith('has') ? false : 0))
    });
    for (const a of ACHIEVEMENTS) {
      expect(() => a.check(proxied)).not.toThrow();
    }
  });

  it('has no achievement that is unreachable by construction', () => {
    // output_ratio_* once demanded a 60-80% output share while the real figure
    // is 0.2% (cache reads dominate); model_haiku_majority demanded Haiku above
    // 50% of all messages against 2.9% actual. Those were not hard, they were
    // impossible. Pin the corrected bounds so nobody restores them.
    const byKey = Object.fromEntries(ACHIEVEMENTS.map(a => [a.key, a]));
    const highOutput = { ...{}, outputRatio: 0.05 };
    expect(byKey.output_ratio_80.check(highOutput)).toBe(true);
    const haikuHeavy = { totalMessages: 1000, modelMessages: { haiku: 200, opus: 0, sonnet: 0 } };
    expect(byKey.model_haiku_majority.check(haikuHeavy)).toBe(true);
    // A decade of unbroken daily work is padding, not a goal.
    expect(byKey.active_days_3650.check({ activeDays: 1200 })).toBe(true);
  });

  it('keeps at least 400 of the second wave locked against the baseline it was built for', () => {
    // The brief: 500 new achievements, at least 400 of them still ahead. The
    // thresholds were derived from a measured snapshot (208 active days,
    // 248,230 messages, 80.6B tokens, $59,189, 3,474 sessions, 1,733.65 hours
    // of real work). Re-checking against that snapshot is what makes "hard but
    // achievable" verifiable instead of a claim — every one of the 500 was
    // locked when it shipped.
    const BASELINE = {
      totalTokens: 80_754_687_261, totalOutputTokens: 164_336_638, totalInputTokens: 7_476_204,
      totalCacheCreateTokens: 1_438_368_966, totalCacheReadTokens: 79_028_869_717,
      totalMessages: 248_230, totalSessions: 3_474, totalCost: 59_189,
      totalLinesWritten: 1_341_822, totalLinesAdded: 703_523, totalLinesRemoved: 321_744,
      netLines: 1_723_601, totalToolCalls: 237_712, toolCount: 82,
      toolCallsByName: { Bash: 104_597, Edit: 44_179, Read: 41_640, Write: 10_117, Grep: 8_656, Glob: 1_598 },
      projectCount: 189, maxProjectMessages: 26_745, maxProjectCost: 10_730, maxProjectSessions: 530,
      projectsAbove100Usd: 60, projectsAbove500Usd: 25, projectsAbove1kUsd: 16,
      projectsAbove50Sessions: 15, maxProjectsInDay: 17,
      maxSessionsInDay: 134, daysAbove10Sessions: 87, sessionsAbove100Msgs: 297, sessionsAbove500Msgs: 79,
      maxMessagesInSession: 14_200, peakDayMessages: 5_214, daysAbove500Msgs: 149, daysAbove2kMsgs: 36,
      maxDayCost: 1_771, maxCostInSession: 5_156, daysAbove50Cost: 163,
      maxDayLines: 40_163, maxLinesInSession: 101_678, daysAbove1kLines: 178,
      activeDays: 208, longestStreak: 53, uniqueWeeksActive: 34, fullWeekendCount: 26,
      monthsActive: 9, longestWeekdayStreak: 47, daysWith8Hours: 50, maxHoursInDay: 19,
      totalActiveHours: 1_733.65, maxSessionActiveMin: 6_414, avgActiveMinPerSession: 29.9,
      deepSessions_1h: 207, deepSessions_2h: 133, deepSessions_3h: 91,
      deepSessions_4h: 71, deepSessions_6h: 53, deepSessions_8h: 46,
      maxDayActiveMin: 6_547, deepDays_2h: 105, deepDays_4h: 81, deepDays_6h: 65,
      deepDays_8h: 53, deepDays_10h: 46,
      mcpServerCount: 6, mcpToolCalls: 12_294, subagentMessages: 24_059, subagentCost: 1_543,
      cacheSavingsUsd: 400_598, avgCacheRate: 98.2, outputRatio: 0.00204,
      multiModelSessions: 371, tripleModelDayCount: 96, maxModelsInSession: 9,
      modelMessages: { opus: 204_867, sonnet: 10_095, haiku: 7_181 },
      modelMessagesOf: (label) => ({
        'Opus 5': 41_353, 'Fable 5': 25_515, 'Haiku 4.5': 7_181, 'Sonnet 5': 2_141, 'Opus 4.8': 49_553
      })[label] || 0
    };
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'achievements.js'), 'utf8');
    const waveTwoStart = src.indexOf('Wave 2 — 500 achievements');
    const waveTwoKeys = new Set(
      src.slice(waveTwoStart, src.indexOf('\n];'))
        .split('\n').filter(l => /^\s*\{\s*key:/.test(l))
        .map(l => l.match(/key: '([^']+)'/)[1])
    );
    expect(waveTwoKeys.size).toBe(500);

    const waveTwo = ACHIEVEMENTS.filter(a => waveTwoKeys.has(a.key));
    const unlocked = waveTwo.filter(a => a.check(BASELINE));
    expect(waveTwo.length - unlocked.length).toBeGreaterThanOrEqual(400);
    // In fact none of them were reachable on day one.
    expect(unlocked.map(a => a.key)).toEqual([]);
  });

  it('keeps the second wave on real working time, never on session spans', () => {
    // durationMin is last-minus-first message including idle; on real data it
    // ran 36x higher than actual work. Wave 2 must not inherit that.
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'achievements.js'), 'utf8');
    const arrayEnd = src.indexOf('\n];');
    const waveTwo = src.slice(src.indexOf('Wave 2 — 500 achievements'), arrayEnd);
    // Strip comments first: the block explains WHY durationMin is avoided, so a
    // raw text search matches the explanation and passes/fails on prose.
    const code = waveTwo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/durationMin/);
    expect(code).toMatch(/totalActiveHours/);
  });
});
