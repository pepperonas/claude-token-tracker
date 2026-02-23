/**
 * Achievements system — 100 achievements unlockable through Claude Code usage.
 * Checked against aggregator stats and stored in the DB.
 */

const ACHIEVEMENTS = [
  // --- Tokens (1-10) ---
  { key: 'tokens_1k', category: 'tokens', tier: 'bronze', check: s => s.totalTokens >= 1_000 },
  { key: 'tokens_10k', category: 'tokens', tier: 'bronze', check: s => s.totalTokens >= 10_000 },
  { key: 'tokens_100k', category: 'tokens', tier: 'silver', check: s => s.totalTokens >= 100_000 },
  { key: 'tokens_500k', category: 'tokens', tier: 'silver', check: s => s.totalTokens >= 500_000 },
  { key: 'tokens_1m', category: 'tokens', tier: 'gold', check: s => s.totalTokens >= 1_000_000 },
  { key: 'tokens_5m', category: 'tokens', tier: 'gold', check: s => s.totalTokens >= 5_000_000 },
  { key: 'tokens_10m', category: 'tokens', tier: 'platinum', check: s => s.totalTokens >= 10_000_000 },
  { key: 'tokens_50m', category: 'tokens', tier: 'platinum', check: s => s.totalTokens >= 50_000_000 },
  { key: 'tokens_100m', category: 'tokens', tier: 'diamond', check: s => s.totalTokens >= 100_000_000 },
  { key: 'tokens_500m', category: 'tokens', tier: 'diamond', check: s => s.totalTokens >= 500_000_000 },

  // --- Sessions (11-18) ---
  { key: 'sessions_1', category: 'sessions', tier: 'bronze', check: s => s.totalSessions >= 1 },
  { key: 'sessions_5', category: 'sessions', tier: 'bronze', check: s => s.totalSessions >= 5 },
  { key: 'sessions_10', category: 'sessions', tier: 'silver', check: s => s.totalSessions >= 10 },
  { key: 'sessions_25', category: 'sessions', tier: 'silver', check: s => s.totalSessions >= 25 },
  { key: 'sessions_50', category: 'sessions', tier: 'gold', check: s => s.totalSessions >= 50 },
  { key: 'sessions_100', category: 'sessions', tier: 'gold', check: s => s.totalSessions >= 100 },
  { key: 'sessions_250', category: 'sessions', tier: 'platinum', check: s => s.totalSessions >= 250 },
  { key: 'sessions_500', category: 'sessions', tier: 'diamond', check: s => s.totalSessions >= 500 },

  // --- Messages (19-26) ---
  { key: 'messages_10', category: 'messages', tier: 'bronze', check: s => s.totalMessages >= 10 },
  { key: 'messages_50', category: 'messages', tier: 'bronze', check: s => s.totalMessages >= 50 },
  { key: 'messages_100', category: 'messages', tier: 'silver', check: s => s.totalMessages >= 100 },
  { key: 'messages_500', category: 'messages', tier: 'silver', check: s => s.totalMessages >= 500 },
  { key: 'messages_1k', category: 'messages', tier: 'gold', check: s => s.totalMessages >= 1_000 },
  { key: 'messages_5k', category: 'messages', tier: 'gold', check: s => s.totalMessages >= 5_000 },
  { key: 'messages_10k', category: 'messages', tier: 'platinum', check: s => s.totalMessages >= 10_000 },
  { key: 'messages_50k', category: 'messages', tier: 'diamond', check: s => s.totalMessages >= 50_000 },

  // --- Cost (27-34) ---
  { key: 'cost_1', category: 'cost', tier: 'bronze', check: s => s.totalCost >= 1 },
  { key: 'cost_5', category: 'cost', tier: 'bronze', check: s => s.totalCost >= 5 },
  { key: 'cost_10', category: 'cost', tier: 'silver', check: s => s.totalCost >= 10 },
  { key: 'cost_25', category: 'cost', tier: 'silver', check: s => s.totalCost >= 25 },
  { key: 'cost_50', category: 'cost', tier: 'gold', check: s => s.totalCost >= 50 },
  { key: 'cost_100', category: 'cost', tier: 'gold', check: s => s.totalCost >= 100 },
  { key: 'cost_250', category: 'cost', tier: 'platinum', check: s => s.totalCost >= 250 },
  { key: 'cost_500', category: 'cost', tier: 'diamond', check: s => s.totalCost >= 500 },

  // --- Lines (35-46) ---
  { key: 'lines_written_100', category: 'lines', tier: 'bronze', check: s => s.totalLinesWritten >= 100 },
  { key: 'lines_written_1k', category: 'lines', tier: 'silver', check: s => s.totalLinesWritten >= 1_000 },
  { key: 'lines_written_10k', category: 'lines', tier: 'gold', check: s => s.totalLinesWritten >= 10_000 },
  { key: 'lines_written_50k', category: 'lines', tier: 'platinum', check: s => s.totalLinesWritten >= 50_000 },
  { key: 'lines_edited_100', category: 'lines', tier: 'bronze', check: s => s.totalLinesAdded >= 100 },
  { key: 'lines_edited_1k', category: 'lines', tier: 'silver', check: s => s.totalLinesAdded >= 1_000 },
  { key: 'lines_edited_10k', category: 'lines', tier: 'gold', check: s => s.totalLinesAdded >= 10_000 },
  { key: 'lines_deleted_100', category: 'lines', tier: 'bronze', check: s => s.totalLinesRemoved >= 100 },
  { key: 'lines_deleted_1k', category: 'lines', tier: 'silver', check: s => s.totalLinesRemoved >= 1_000 },
  { key: 'lines_deleted_10k', category: 'lines', tier: 'gold', check: s => s.totalLinesRemoved >= 10_000 },
  { key: 'lines_net_1k', category: 'lines', tier: 'silver', check: s => s.netLines >= 1_000 },
  { key: 'lines_net_10k', category: 'lines', tier: 'gold', check: s => s.netLines >= 10_000 },

  // --- Models (47-56) ---
  { key: 'model_sonnet', category: 'models', tier: 'bronze', check: s => s.modelNames.some(m => /sonnet/i.test(m)) },
  { key: 'model_opus', category: 'models', tier: 'bronze', check: s => s.modelNames.some(m => /opus/i.test(m)) },
  { key: 'model_haiku', category: 'models', tier: 'bronze', check: s => s.modelNames.some(m => /haiku/i.test(m)) },
  { key: 'model_diversity_2', category: 'models', tier: 'silver', check: s => s.modelCount >= 2 },
  { key: 'model_diversity_3', category: 'models', tier: 'gold', check: s => s.modelCount >= 3 },
  { key: 'model_diversity_4', category: 'models', tier: 'platinum', check: s => s.modelCount >= 4 },
  { key: 'model_sonnet_1k', category: 'models', tier: 'silver', check: s => s.modelMessages.sonnet >= 1_000 },
  { key: 'model_opus_1k', category: 'models', tier: 'gold', check: s => s.modelMessages.opus >= 1_000 },
  { key: 'model_opus_100', category: 'models', tier: 'silver', check: s => s.modelMessages.opus >= 100 },
  { key: 'model_haiku_100', category: 'models', tier: 'silver', check: s => s.modelMessages.haiku >= 100 },

  // --- Tools (57-68) ---
  { key: 'tool_read', category: 'tools', tier: 'bronze', check: s => s.toolNames.has('Read') },
  { key: 'tool_write', category: 'tools', tier: 'bronze', check: s => s.toolNames.has('Write') },
  { key: 'tool_edit', category: 'tools', tier: 'bronze', check: s => s.toolNames.has('Edit') },
  { key: 'tool_bash', category: 'tools', tier: 'bronze', check: s => s.toolNames.has('Bash') },
  { key: 'tool_grep', category: 'tools', tier: 'bronze', check: s => s.toolNames.has('Grep') },
  { key: 'tool_glob', category: 'tools', tier: 'bronze', check: s => s.toolNames.has('Glob') },
  { key: 'tool_diversity_5', category: 'tools', tier: 'silver', check: s => s.toolCount >= 5 },
  { key: 'tool_diversity_10', category: 'tools', tier: 'gold', check: s => s.toolCount >= 10 },
  { key: 'tool_diversity_15', category: 'tools', tier: 'platinum', check: s => s.toolCount >= 15 },
  { key: 'tool_1k_calls', category: 'tools', tier: 'silver', check: s => s.totalToolCalls >= 1_000 },
  { key: 'tool_10k_calls', category: 'tools', tier: 'gold', check: s => s.totalToolCalls >= 10_000 },
  { key: 'tool_50k_calls', category: 'tools', tier: 'platinum', check: s => s.totalToolCalls >= 50_000 },

  // --- Time (69-78) ---
  { key: 'early_bird_1', category: 'time', tier: 'bronze', check: s => s.earlyBirdSessions >= 1 },
  { key: 'early_bird_10', category: 'time', tier: 'silver', check: s => s.earlyBirdSessions >= 10 },
  { key: 'night_owl_1', category: 'time', tier: 'bronze', check: s => s.nightOwlSessions >= 1 },
  { key: 'night_owl_10', category: 'time', tier: 'silver', check: s => s.nightOwlSessions >= 10 },
  { key: 'marathon_1', category: 'time', tier: 'silver', check: s => s.marathonSessions >= 1 },
  { key: 'marathon_5', category: 'time', tier: 'gold', check: s => s.marathonSessions >= 5 },
  { key: 'marathon_10', category: 'time', tier: 'platinum', check: s => s.marathonSessions >= 10 },
  { key: 'peak_50_msgs', category: 'time', tier: 'silver', check: s => s.peakDayMessages >= 50 },
  { key: 'peak_100_msgs', category: 'time', tier: 'gold', check: s => s.peakDayMessages >= 100 },
  { key: 'peak_200_msgs', category: 'time', tier: 'platinum', check: s => s.peakDayMessages >= 200 },

  // --- Projects (79-84) ---
  { key: 'project_1', category: 'projects', tier: 'bronze', check: s => s.projectCount >= 1 },
  { key: 'project_3', category: 'projects', tier: 'silver', check: s => s.projectCount >= 3 },
  { key: 'project_5', category: 'projects', tier: 'gold', check: s => s.projectCount >= 5 },
  { key: 'project_10', category: 'projects', tier: 'platinum', check: s => s.projectCount >= 10 },
  { key: 'project_15', category: 'projects', tier: 'diamond', check: s => s.projectCount >= 15 },
  { key: 'project_20', category: 'projects', tier: 'diamond', check: s => s.projectCount >= 20 },

  // --- Streaks (85-92) ---
  { key: 'streak_3', category: 'streaks', tier: 'bronze', check: s => s.longestStreak >= 3 },
  { key: 'streak_7', category: 'streaks', tier: 'silver', check: s => s.longestStreak >= 7 },
  { key: 'streak_14', category: 'streaks', tier: 'gold', check: s => s.longestStreak >= 14 },
  { key: 'streak_30', category: 'streaks', tier: 'platinum', check: s => s.longestStreak >= 30 },
  { key: 'streak_60', category: 'streaks', tier: 'diamond', check: s => s.longestStreak >= 60 },
  { key: 'active_days_7', category: 'streaks', tier: 'bronze', check: s => s.activeDays >= 7 },
  { key: 'active_days_30', category: 'streaks', tier: 'silver', check: s => s.activeDays >= 30 },
  { key: 'active_days_100', category: 'streaks', tier: 'gold', check: s => s.activeDays >= 100 },

  // --- Cache (93-96) ---
  { key: 'cache_rate_50', category: 'cache', tier: 'silver', check: s => s.avgCacheRate >= 50 },
  { key: 'cache_rate_70', category: 'cache', tier: 'gold', check: s => s.avgCacheRate >= 70 },
  { key: 'cache_rate_80', category: 'cache', tier: 'platinum', check: s => s.avgCacheRate >= 80 },
  { key: 'cache_rate_90', category: 'cache', tier: 'diamond', check: s => s.avgCacheRate >= 90 },

  // --- Special (97-100) ---
  { key: 'holiday_coding', category: 'special', tier: 'silver', check: s => s.codedOnHoliday },
  { key: 'palindrome_date', category: 'special', tier: 'gold', check: s => s.codedOnPalindrome },
  { key: 'weekend_warrior', category: 'special', tier: 'bronze', check: s => s.weekendWarrior },
  { key: 'all_hours', category: 'special', tier: 'platinum', check: s => s.allHoursCovered },
];

/**
 * Build comprehensive stats object from aggregator data for achievement checking.
 */
function buildStats(agg) {
  const overview = agg.getOverview();
  const sessions = agg.getSessions();
  const projects = agg.getProjects();
  const modelsArr = agg.getModels();
  const tools = agg.getTools();
  const daily = agg.getDaily();
  const hourly = agg.getHourly();

  // Total tokens (all types)
  const totalTokens = (overview.inputTokens || 0) + (overview.outputTokens || 0) +
    (overview.cacheReadTokens || 0) + (overview.cacheCreateTokens || 0);

  // Total cost
  const totalCost = (overview.inputCost || 0) + (overview.outputCost || 0) +
    (overview.cacheReadCost || 0) + (overview.cacheCreateCost || 0);

  // Lines
  const totalLinesWritten = overview.linesWritten || 0;
  const totalLinesAdded = overview.linesAdded || 0;
  const totalLinesRemoved = overview.linesRemoved || 0;
  const netLines = totalLinesWritten + totalLinesAdded - totalLinesRemoved;

  // Models
  const modelNames = modelsArr.map(m => m.label || m.model);
  const modelCount = modelsArr.length;
  const modelMessages = { sonnet: 0, opus: 0, haiku: 0 };
  for (const m of modelsArr) {
    const name = (m.label || m.model || '').toLowerCase();
    if (name.includes('sonnet')) modelMessages.sonnet += m.messages || 0;
    if (name.includes('opus')) modelMessages.opus += m.messages || 0;
    if (name.includes('haiku')) modelMessages.haiku += m.messages || 0;
  }

  // Tools
  const toolNames = new Set(tools.map(t => t.name));
  const toolCount = toolNames.size;
  const totalToolCalls = tools.reduce((sum, t) => sum + (t.count || 0), 0);

  // Sessions analysis (early bird, night owl, marathon)
  let earlyBirdSessions = 0;
  let nightOwlSessions = 0;
  let marathonSessions = 0;
  for (const s of sessions) {
    if (s.firstTs) {
      const hour = parseInt(s.firstTs.slice(11, 13), 10);
      if (hour < 7) earlyBirdSessions++;
      if (hour >= 0 && hour < 5) nightOwlSessions++;
    }
    if (s.durationMin >= 120) marathonSessions++;
  }

  // Daily stats (peak, streaks, active days)
  let peakDayMessages = 0;
  const activeDates = [];
  for (const d of daily) {
    if (d.messages > peakDayMessages) peakDayMessages = d.messages;
    if (d.messages > 0) activeDates.push(d.date);
  }

  const activeDays = activeDates.length;

  // Longest streak
  let longestStreak = 0;
  if (activeDates.length > 0) {
    const sorted = [...activeDates].sort();
    let currentStreak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]);
      const curr = new Date(sorted[i]);
      const diffDays = Math.round((curr - prev) / 86400000);
      if (diffDays === 1) {
        currentStreak++;
      } else {
        if (currentStreak > longestStreak) longestStreak = currentStreak;
        currentStreak = 1;
      }
    }
    if (currentStreak > longestStreak) longestStreak = currentStreak;
  }

  // Cache rate
  const totalInput = overview.inputTokens || 0;
  const totalCacheRead = overview.cacheReadTokens || 0;
  const totalCacheCreate = overview.cacheCreateTokens || 0;
  const cacheBase = totalInput + totalCacheRead + totalCacheCreate;
  const avgCacheRate = cacheBase > 0 ? (totalCacheRead / cacheBase) * 100 : 0;

  // Hourly coverage (all 24 hours)
  const hoursWithActivity = new Set();
  for (const h of hourly) {
    if (h.messages > 0) hoursWithActivity.add(h.hour);
  }
  const allHoursCovered = hoursWithActivity.size >= 24;

  // Special dates
  const holidays = new Set([
    '01-01', '07-04', '12-25', '12-31', // Major holidays
    '02-14', '10-31', '11-28', '05-01'
  ]);
  let codedOnHoliday = false;
  let codedOnPalindrome = false;
  let weekendWarrior = false;

  // Track weekends by ISO week for weekend warrior
  const weekendWeeks = {};

  for (const date of activeDates) {
    const mmdd = date.slice(5);
    if (holidays.has(mmdd)) codedOnHoliday = true;

    // Palindrome: YYYY-MM-DD → YYYYMMDD, check if palindrome
    const plain = date.replace(/-/g, '');
    if (plain === plain.split('').reverse().join('')) codedOnPalindrome = true;

    // Weekend check
    const d = new Date(date + 'T12:00:00Z');
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) {
      // Get ISO week key (use the Monday of the week)
      const monday = new Date(d);
      monday.setUTCDate(monday.getUTCDate() - ((dow + 6) % 7));
      const weekKey = monday.toISOString().slice(0, 10);
      if (!weekendWeeks[weekKey]) weekendWeeks[weekKey] = new Set();
      weekendWeeks[weekKey].add(dow);
    }
  }

  // Weekend warrior: both Sat (6) and Sun (0) in same week
  for (const days of Object.values(weekendWeeks)) {
    if (days.has(0) && days.has(6)) {
      weekendWarrior = true;
      break;
    }
  }

  return {
    totalTokens,
    totalSessions: overview.sessions || 0,
    totalMessages: overview.messages || 0,
    totalCost,
    totalLinesWritten,
    totalLinesAdded,
    totalLinesRemoved,
    netLines,
    modelNames,
    modelCount,
    modelMessages,
    toolNames,
    toolCount,
    totalToolCalls,
    earlyBirdSessions,
    nightOwlSessions,
    marathonSessions,
    peakDayMessages,
    activeDays,
    longestStreak,
    avgCacheRate,
    allHoursCovered,
    codedOnHoliday,
    codedOnPalindrome,
    weekendWarrior,
    projectCount: projects.length,
  };
}

/**
 * Check all achievements against current stats.
 * Inserts newly unlocked achievements into DB.
 * Returns array of newly unlocked achievement keys.
 */
function checkAchievements(agg, userId, db) {
  const stats = buildStats(agg);
  const alreadyUnlocked = new Set(
    db.getUnlockedAchievements(userId).map(a => a.achievement_key)
  );

  const newlyUnlocked = [];
  for (const ach of ACHIEVEMENTS) {
    if (alreadyUnlocked.has(ach.key)) continue;
    try {
      if (ach.check(stats)) {
        newlyUnlocked.push(ach.key);
      }
    } catch {
      // Skip achievements that fail to check
    }
  }

  if (newlyUnlocked.length > 0) {
    db.unlockAchievementsBatch(userId, newlyUnlocked);
  }

  return newlyUnlocked;
}

/**
 * Get all 100 achievements with unlock status for API response.
 */
function getAchievementsResponse(userId, db) {
  const unlocked = db.getUnlockedAchievements(userId);
  const unlockedMap = {};
  for (const a of unlocked) {
    unlockedMap[a.achievement_key] = a.unlocked_at;
  }

  return ACHIEVEMENTS.map(ach => ({
    key: ach.key,
    category: ach.category,
    tier: ach.tier,
    unlocked: !!unlockedMap[ach.key],
    unlockedAt: unlockedMap[ach.key] || null
  }));
}

module.exports = {
  ACHIEVEMENTS,
  buildStats,
  checkAchievements,
  getAchievementsResponse
};
