const { generateExportHTML } = require('../lib/export-html');

// Minimal but realistic input shaped like the data server.js feeds the export.
function makeInput(overrides = {}) {
  return {
    overview: {
      totalTokens: 9_000_000_000, inputTokens: 1_300_000, outputTokens: 19_400_000,
      cacheReadTokens: 8_900_000_000, cacheCreateTokens: 12_000_000,
      estimatedCost: 3343.57, inputCost: 4.2, outputCost: 291, cacheReadCost: 900, cacheCreateCost: 15,
      sessions: 342, messages: 23033, rateLimitHits: 0,
      linesWritten: 5000, linesAdded: 1200, linesRemoved: 800
    },
    daily: [{ date: '2026-06-15', totalTokens: 1000, cost: 1.5 }],
    sessions: [{ id: 's1', date: '2026-06-15', project: 'claude/token-tracker', model: 'claude-opus-4-6', totalTokens: 500, cost: 1.2 }],
    projects: [{ project: 'claude/token-tracker', totalTokens: 500, sessions: 1, messages: 10, cost: 1.2 }],
    models: [{ model: 'claude-opus-4-6', inputTokens: 100, outputTokens: 200, messages: 10, cost: 1.2 }],
    tools: [{ name: 'Read', calls: 5 }],
    toolStats: [{ name: 'Read', type: 'built-in', calls: 5, cost: 0.1, tokens: 100 }],
    hourly: [{ hour: 9, count: 3 }],
    productivity: {
      tokensPerMin: 100, linesPerHour: 50, msgsPerSession: 5.2, costPerLine: 0.123,
      cacheSavings: 12.5, codeRatio: 60.4, codingHours: 3.5, totalLines: 6200,
      tokensPerLine: 80, toolsPerTurn: 2.1, linesPerTurn: 1.4, ioRatio: 12.3
    },
    stopReasons: [{ reason: 'end_turn', count: 100 }],
    weekday: [{ day: 'Mon', count: 10 }],
    achievements: [
      { key: 'a1', category: 'tokens', tier: 'gold', emoji: '🏆', points: 50, unlocked: true, unlockedAt: '2026-06-10' },
      { key: 'a2', category: 'tokens', tier: 'bronze', emoji: '🥉', points: 10, unlocked: false }
    ],
    rateLimits: { total: 0, daily: [] },
    periodLabel: 'Last 30 Days',
    githubData: null,
    anthropicData: null,
    ...overrides
  };
}

describe('generateExportHTML', () => {
  it('returns a complete HTML document', () => {
    const html = generateExportHTML(makeInput());
    expect(typeof html).toBe('string');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
  });

  it('embeds Chart.js and the inline DATA payload', () => {
    const html = generateExportHTML(makeInput());
    expect(html).toContain('cdn.jsdelivr.net/npm/chart.js');
    expect(html).toContain('var DATA = {');
    // The serialized project name should make it into the inline data.
    expect(html).toContain('claude/token-tracker');
  });

  it('renders overview KPIs with humanized number formatting', () => {
    const html = generateExportHTML(makeInput());
    expect(html).toContain('9.0B');       // totalTokens 9e9 → "9.0B"
    expect(html).toContain('$3343.57');   // estimatedCost
    expect(html).toContain('23,033');     // messages via toLocaleString('en-US')
  });

  it('escapes the period label to prevent HTML/script injection', () => {
    const html = generateExportHTML(makeInput({ periodLabel: '<script>alert(1)</script>"x"' }));
    expect(html).not.toContain('<script>alert(1)</script>"x"');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;x&quot;');
  });

  it('omits the GitHub and Claude API tabs when their data is absent', () => {
    const html = generateExportHTML(makeInput({ githubData: null, anthropicData: null }));
    expect(html).not.toContain('GitHub Tab');
    expect(html).not.toContain('Claude API Tab');
    expect(html).toContain('var DATA = {');
  });

  it('includes the GitHub tab when githubData is provided', () => {
    const githubData = {
      billing: {
        actions: { plan: 'Pro', totalMinutesUsed: 120, includedMinutes: 3000, percentUsed: 4 },
        storage: { estimatedStorageGB: 1.23, includedStorageGB: 2, daysLeftInCycle: 12 },
        resetDate: '2026-07-01'
      },
      stats: {
        totalContributions: 1234, commitCount: 500, repoCount: 12, totalStars: 88,
        prStats: { total: 30, merged: 25, totalAdditions: 9000, totalDeletions: 3000, netLines: 6000, totalChangedFiles: 400 },
        repos: []
      },
      actions: { repos: [], total: 0 }
    };
    const html = generateExportHTML(makeInput({ githubData }));
    expect(html).toContain('GitHub Tab');
    expect(html).toContain('Pro');           // plan badge
    expect(html).toContain('1,234');         // contributions formatted
  });

  it('includes the Claude API tab when anthropicData is provided', () => {
    const anthropicData = {
      totalCost: 42.5, totalTokens: 1_000_000, totalInput: 400_000, totalOutput: 600_000,
      totalCacheRead: 0, totalCacheCreate: 0, avgCostPerDay: 1.4, cacheEfficiency: 73,
      dailyCosts: [], dailyTokens: [], modelBreakdown: [], keyTotals: [], keyBreakdown: {}, dailyTokensByKey: {}
    };
    const html = generateExportHTML(makeInput({ anthropicData }));
    expect(html).toContain('Claude API Tab');
    expect(html).toContain('$42.50');
    expect(html).toContain('73%');           // cache efficiency
  });

  it('counts unlocked achievements and sums their points', () => {
    const html = generateExportHTML(makeInput());
    // 1 of 2 unlocked → "1 / 2"; 50 unlocked points of 60 total.
    expect(html).toContain('1 / 2');     // Unlocked KPI
    expect(html).toContain('>50<');      // Total Points (fmtNum(50))
    expect(html).toContain('>60<');      // Max Points (fmtNum(60))
  });

  it('does not throw on empty / minimal data', () => {
    const empty = {
      overview: {}, daily: [], sessions: [], projects: [], models: [], tools: [],
      toolStats: [], hourly: [], productivity: null, stopReasons: [], weekday: [],
      achievements: [], rateLimits: { daily: [] }, periodLabel: 'All Time',
      githubData: null, anthropicData: null
    };
    expect(() => generateExportHTML(empty)).not.toThrow();
    const html = generateExportHTML(empty);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('All Time');     // period label still renders
    expect(html).toContain('0 / 0');        // achievements summary with no defs
    // productivity null falls back to zero placeholders rather than throwing.
    expect(html).toContain('0.000');        // costPerLine fallback
  });

  it('caps the embedded sessions payload at 200 rows', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      id: 's' + i, date: '2026-06-15', project: 'p/' + i, model: 'claude-opus-4-6', totalTokens: 1, cost: 0
    }));
    const html = generateExportHTML(makeInput({ sessions: many }));
    // The header reflects the true count, but the inline DATA is sliced to 200.
    expect(html).toContain('Sessions (500)');
    expect(html).toContain('"p/199"');
    expect(html).not.toContain('"p/200"');
  });
});
