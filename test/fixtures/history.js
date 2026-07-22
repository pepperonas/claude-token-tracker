/**
 * Deterministic multi-day message history.
 *
 * Tests that exercise whole-history behaviour (API endpoints, achievement
 * backfill, trends) need data that actually spans days — a handful of messages
 * on one afternoon unlocks nothing and makes date-anchored assertions
 * meaningless. This builder produces a realistically shaped history: several
 * projects, models and tools, code lines, growing volume over time (so
 * tier-based achievements unlock progressively instead of all at once) and a
 * couple of sub-agent / max_tokens messages.
 *
 * Everything is derived from the index — no randomness, so a failing test
 * reproduces exactly.
 */

const PROJECTS = ['acme/web', 'acme/api', 'tools/cli'];
const MODELS = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'];
const TOOL_SETS = [['Read', 'Edit'], ['Bash'], ['Write', 'Read', 'Grep'], [], ['mcp__playwright__browser_click']];

/**
 * @param {object} [opts]
 * @param {number} [opts.days=45]      number of consecutive days, ending today
 * @param {number} [opts.perDay=6]     messages per day
 * @param {Date}   [opts.endDate]      last day of the history (default: today)
 * @param {string} [opts.idPrefix='hist']
 * @returns {Array<object>} messages in chronological order
 */
function buildHistory(opts = {}) {
  const days = opts.days || 45;
  const perDay = opts.perDay || 6;
  const end = opts.endDate ? new Date(opts.endDate) : new Date();
  const prefix = opts.idPrefix || 'hist';
  const messages = [];

  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(end.getFullYear(), end.getMonth(), end.getDate() - d);
    const age = days - d;                 // 1 = oldest day
    const scale = 1 + age / days;         // volume grows over the history
    for (let i = 0; i < perDay; i++) {
      const idx = age * perDay + i;
      const ts = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8 + (i % 11), (i * 13) % 60, 0);
      const tools = TOOL_SETS[idx % TOOL_SETS.length];
      messages.push({
        id: `${prefix}_${d}_${i}`,
        timestamp: ts.toISOString(),
        model: MODELS[idx % MODELS.length],
        sessionId: `${prefix}-sess-${d}-${i % 2}`,
        project: PROJECTS[idx % PROJECTS.length],
        inputTokens: Math.round(1500 * scale),
        outputTokens: Math.round(900 * scale),
        cacheReadTokens: Math.round(45000 * scale),
        cacheCreateTokens: Math.round(7000 * scale),
        tools,
        toolCounts: tools.reduce((acc, t, n) => { acc[t] = 1 + (n % 2); return acc; }, {}),
        linesAdded: (idx % 17) * 3,
        linesRemoved: idx % 7,
        linesWritten: (idx % 11) * 2,
        stopReason: idx % 9 === 0 ? 'max_tokens' : (tools.length ? 'tool_use' : 'end_turn'),
        isSubagent: idx % 13 === 0
      });
    }
  }
  return messages;
}

/** Local YYYY-MM-DD for a Date (matches the aggregator's date bucketing). */
function localDate(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

module.exports = { buildHistory, localDate, PROJECTS, MODELS, TOOL_SETS };
