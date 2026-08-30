const { getPricing } = require('./pricing');

/**
 * Achievements system — 1200 achievements unlockable through Claude Code usage.
 * Checked against aggregator stats and stored in the DB.
 *
 * Wave 1 (700) covers the ramp from first prompt to heavy daily use.
 * Wave 2 (500, added 2026-08-30) starts where wave 1 runs out: every threshold
 * is derived from a measured snapshot of real usage rather than guessed, and
 * all 500 were locked on the day they shipped.
 */

const ACHIEVEMENTS = [
  // --- Tokens (1-10) ---
  { key: 'tokens_1k', category: 'tokens', tier: 'bronze', emoji: '🔤', check: s => s.totalTokens >= 1_000 },
  { key: 'tokens_10k', category: 'tokens', tier: 'bronze', emoji: '📝', check: s => s.totalTokens >= 10_000 },
  { key: 'tokens_100k', category: 'tokens', tier: 'silver', emoji: '🔍', check: s => s.totalTokens >= 100_000 },
  { key: 'tokens_500k', category: 'tokens', tier: 'silver', emoji: '🎯', check: s => s.totalTokens >= 500_000 },
  { key: 'tokens_1m', category: 'tokens', tier: 'gold', emoji: '💰', check: s => s.totalTokens >= 1_000_000 },
  { key: 'tokens_5m', category: 'tokens', tier: 'gold', emoji: '💪', check: s => s.totalTokens >= 5_000_000 },
  { key: 'tokens_10m', category: 'tokens', tier: 'platinum', emoji: '🏔️', check: s => s.totalTokens >= 10_000_000 },
  { key: 'tokens_50m', category: 'tokens', tier: 'platinum', emoji: '🌋', check: s => s.totalTokens >= 50_000_000 },
  { key: 'tokens_100m', category: 'tokens', tier: 'diamond', emoji: '🏆', check: s => s.totalTokens >= 100_000_000 },
  { key: 'tokens_500m', category: 'tokens', tier: 'diamond', emoji: '👑', check: s => s.totalTokens >= 500_000_000 },

  // --- Sessions (11-18) ---
  { key: 'sessions_1', category: 'sessions', tier: 'bronze', emoji: '🚀', check: s => s.totalSessions >= 1 },
  { key: 'sessions_5', category: 'sessions', tier: 'bronze', emoji: '🎮', check: s => s.totalSessions >= 5 },
  { key: 'sessions_10', category: 'sessions', tier: 'silver', emoji: '📅', check: s => s.totalSessions >= 10 },
  { key: 'sessions_25', category: 'sessions', tier: 'silver', emoji: '🎪', check: s => s.totalSessions >= 25 },
  { key: 'sessions_50', category: 'sessions', tier: 'gold', emoji: '⭐', check: s => s.totalSessions >= 50 },
  { key: 'sessions_100', category: 'sessions', tier: 'gold', emoji: '💯', check: s => s.totalSessions >= 100 },
  { key: 'sessions_250', category: 'sessions', tier: 'platinum', emoji: '⚡', check: s => s.totalSessions >= 250 },
  { key: 'sessions_500', category: 'sessions', tier: 'diamond', emoji: '🏅', check: s => s.totalSessions >= 500 },

  // --- Messages (19-26) ---
  { key: 'messages_10', category: 'messages', tier: 'bronze', emoji: '💬', check: s => s.totalMessages >= 10 },
  { key: 'messages_50', category: 'messages', tier: 'bronze', emoji: '🗨️', check: s => s.totalMessages >= 50 },
  { key: 'messages_100', category: 'messages', tier: 'silver', emoji: '📨', check: s => s.totalMessages >= 100 },
  { key: 'messages_500', category: 'messages', tier: 'silver', emoji: '📫', check: s => s.totalMessages >= 500 },
  { key: 'messages_1k', category: 'messages', tier: 'gold', emoji: '📬', check: s => s.totalMessages >= 1_000 },
  { key: 'messages_5k', category: 'messages', tier: 'gold', emoji: '📮', check: s => s.totalMessages >= 5_000 },
  { key: 'messages_10k', category: 'messages', tier: 'platinum', emoji: '🎖️', check: s => s.totalMessages >= 10_000 },
  { key: 'messages_50k', category: 'messages', tier: 'diamond', emoji: '🌟', check: s => s.totalMessages >= 50_000 },

  // --- Cost (27-34) ---
  { key: 'cost_1', category: 'cost', tier: 'bronze', emoji: '💵', check: s => s.totalCost >= 1 },
  { key: 'cost_5', category: 'cost', tier: 'bronze', emoji: '💶', check: s => s.totalCost >= 5 },
  { key: 'cost_10', category: 'cost', tier: 'silver', emoji: '💷', check: s => s.totalCost >= 10 },
  { key: 'cost_25', category: 'cost', tier: 'silver', emoji: '💴', check: s => s.totalCost >= 25 },
  { key: 'cost_50', category: 'cost', tier: 'gold', emoji: '💰', check: s => s.totalCost >= 50 },
  { key: 'cost_100', category: 'cost', tier: 'gold', emoji: '🤑', check: s => s.totalCost >= 100 },
  { key: 'cost_250', category: 'cost', tier: 'platinum', emoji: '💎', check: s => s.totalCost >= 250 },
  { key: 'cost_500', category: 'cost', tier: 'diamond', emoji: '🏦', check: s => s.totalCost >= 500 },

  // --- Lines (35-46) ---
  { key: 'lines_written_100', category: 'lines', tier: 'bronze', emoji: '✏️', check: s => s.totalLinesWritten >= 100 },
  { key: 'lines_written_1k', category: 'lines', tier: 'silver', emoji: '📝', check: s => s.totalLinesWritten >= 1_000 },
  { key: 'lines_written_10k', category: 'lines', tier: 'gold', emoji: '📄', check: s => s.totalLinesWritten >= 10_000 },
  { key: 'lines_written_50k', category: 'lines', tier: 'platinum', emoji: '📚', check: s => s.totalLinesWritten >= 50_000 },
  { key: 'lines_edited_100', category: 'lines', tier: 'bronze', emoji: '✂️', check: s => s.totalLinesAdded >= 100 },
  { key: 'lines_edited_1k', category: 'lines', tier: 'silver', emoji: '🔧', check: s => s.totalLinesAdded >= 1_000 },
  { key: 'lines_edited_10k', category: 'lines', tier: 'gold', emoji: '⚙️', check: s => s.totalLinesAdded >= 10_000 },
  { key: 'lines_deleted_100', category: 'lines', tier: 'bronze', emoji: '🗑️', check: s => s.totalLinesRemoved >= 100 },
  { key: 'lines_deleted_1k', category: 'lines', tier: 'silver', emoji: '💥', check: s => s.totalLinesRemoved >= 1_000 },
  { key: 'lines_deleted_10k', category: 'lines', tier: 'gold', emoji: '🧹', check: s => s.totalLinesRemoved >= 10_000 },
  { key: 'lines_net_1k', category: 'lines', tier: 'silver', emoji: '📈', check: s => s.netLines >= 1_000 },
  { key: 'lines_net_10k', category: 'lines', tier: 'gold', emoji: '🚀', check: s => s.netLines >= 10_000 },

  // --- Models (47-56) ---
  { key: 'model_sonnet', category: 'models', tier: 'bronze', emoji: '🎵', check: s => s.modelNames.some(m => /sonnet/i.test(m)) },
  { key: 'model_opus', category: 'models', tier: 'bronze', emoji: '🎭', check: s => s.modelNames.some(m => /opus/i.test(m)) },
  { key: 'model_haiku', category: 'models', tier: 'bronze', emoji: '🌸', check: s => s.modelNames.some(m => /haiku/i.test(m)) },
  { key: 'model_diversity_2', category: 'models', tier: 'silver', emoji: '🎨', check: s => s.modelCount >= 2 },
  { key: 'model_diversity_3', category: 'models', tier: 'gold', emoji: '🌈', check: s => s.modelCount >= 3 },
  { key: 'model_diversity_4', category: 'models', tier: 'platinum', emoji: '🪄', check: s => s.modelCount >= 4 },
  { key: 'model_sonnet_1k', category: 'models', tier: 'silver', emoji: '🎶', check: s => s.modelMessages.sonnet >= 1_000 },
  { key: 'model_opus_1k', category: 'models', tier: 'gold', emoji: '🎼', check: s => s.modelMessages.opus >= 1_000 },
  { key: 'model_opus_100', category: 'models', tier: 'silver', emoji: '🎻', check: s => s.modelMessages.opus >= 100 },
  { key: 'model_haiku_100', category: 'models', tier: 'silver', emoji: '🍃', check: s => s.modelMessages.haiku >= 100 },

  // --- Tools (57-68) ---
  { key: 'tool_read', category: 'tools', tier: 'bronze', emoji: '📖', check: s => s.toolNames.has('Read') },
  { key: 'tool_write', category: 'tools', tier: 'bronze', emoji: '✍️', check: s => s.toolNames.has('Write') },
  { key: 'tool_edit', category: 'tools', tier: 'bronze', emoji: '🖊️', check: s => s.toolNames.has('Edit') },
  { key: 'tool_bash', category: 'tools', tier: 'bronze', emoji: '💻', check: s => s.toolNames.has('Bash') },
  { key: 'tool_grep', category: 'tools', tier: 'bronze', emoji: '🔎', check: s => s.toolNames.has('Grep') },
  { key: 'tool_glob', category: 'tools', tier: 'bronze', emoji: '📁', check: s => s.toolNames.has('Glob') },
  { key: 'tool_diversity_5', category: 'tools', tier: 'silver', emoji: '🔨', check: s => s.toolCount >= 5 },
  { key: 'tool_diversity_10', category: 'tools', tier: 'gold', emoji: '🧰', check: s => s.toolCount >= 10 },
  { key: 'tool_diversity_15', category: 'tools', tier: 'platinum', emoji: '🛠️', check: s => s.toolCount >= 15 },
  { key: 'tool_1k_calls', category: 'tools', tier: 'silver', emoji: '⚡', check: s => s.totalToolCalls >= 1_000 },
  { key: 'tool_10k_calls', category: 'tools', tier: 'gold', emoji: '🔌', check: s => s.totalToolCalls >= 10_000 },
  { key: 'tool_50k_calls', category: 'tools', tier: 'platinum', emoji: '⚙️', check: s => s.totalToolCalls >= 50_000 },

  // --- Time (69-78) ---
  { key: 'early_bird_1', category: 'time', tier: 'bronze', emoji: '🐦', check: s => s.earlyBirdSessions >= 1 },
  { key: 'early_bird_10', category: 'time', tier: 'silver', emoji: '🌅', check: s => s.earlyBirdSessions >= 10 },
  { key: 'night_owl_1', category: 'time', tier: 'bronze', emoji: '🦉', check: s => s.nightOwlSessions >= 1 },
  { key: 'night_owl_10', category: 'time', tier: 'silver', emoji: '🌙', check: s => s.nightOwlSessions >= 10 },
  { key: 'marathon_1', category: 'time', tier: 'silver', emoji: '🏃', check: s => s.marathonSessions >= 1 },
  { key: 'marathon_5', category: 'time', tier: 'gold', emoji: '🏃‍♂️', check: s => s.marathonSessions >= 5 },
  { key: 'marathon_10', category: 'time', tier: 'platinum', emoji: '🥇', check: s => s.marathonSessions >= 10 },
  { key: 'peak_50_msgs', category: 'time', tier: 'silver', emoji: '📊', check: s => s.peakDayMessages >= 50 },
  { key: 'peak_100_msgs', category: 'time', tier: 'gold', emoji: '🔥', check: s => s.peakDayMessages >= 100 },
  { key: 'peak_200_msgs', category: 'time', tier: 'platinum', emoji: '🌡️', check: s => s.peakDayMessages >= 200 },

  // --- Projects (79-84) ---
  { key: 'project_1', category: 'projects', tier: 'bronze', emoji: '📂', check: s => s.projectCount >= 1 },
  { key: 'project_3', category: 'projects', tier: 'silver', emoji: '📁', check: s => s.projectCount >= 3 },
  { key: 'project_5', category: 'projects', tier: 'gold', emoji: '🗂️', check: s => s.projectCount >= 5 },
  { key: 'project_10', category: 'projects', tier: 'platinum', emoji: '🏢', check: s => s.projectCount >= 10 },
  { key: 'project_15', category: 'projects', tier: 'diamond', emoji: '🏗️', check: s => s.projectCount >= 15 },
  { key: 'project_20', category: 'projects', tier: 'diamond', emoji: '🌆', check: s => s.projectCount >= 20 },

  // --- Streaks (85-92) ---
  { key: 'streak_3', category: 'streaks', tier: 'bronze', emoji: '🔥', check: s => s.longestStreak >= 3 },
  { key: 'streak_7', category: 'streaks', tier: 'silver', emoji: '🗓️', check: s => s.longestStreak >= 7 },
  { key: 'streak_14', category: 'streaks', tier: 'gold', emoji: '📆', check: s => s.longestStreak >= 14 },
  { key: 'streak_30', category: 'streaks', tier: 'platinum', emoji: '🏆', check: s => s.longestStreak >= 30 },
  { key: 'streak_60', category: 'streaks', tier: 'diamond', emoji: '💎', check: s => s.longestStreak >= 60 },
  { key: 'active_days_7', category: 'streaks', tier: 'bronze', emoji: '📅', check: s => s.activeDays >= 7 },
  { key: 'active_days_30', category: 'streaks', tier: 'silver', emoji: '🗓️', check: s => s.activeDays >= 30 },
  { key: 'active_days_100', category: 'streaks', tier: 'gold', emoji: '🎯', check: s => s.activeDays >= 100 },

  // --- Cache (93-96) ---
  { key: 'cache_rate_50', category: 'cache', tier: 'silver', emoji: '💾', check: s => s.avgCacheRate >= 50 },
  { key: 'cache_rate_70', category: 'cache', tier: 'gold', emoji: '🗄️', check: s => s.avgCacheRate >= 70 },
  { key: 'cache_rate_80', category: 'cache', tier: 'platinum', emoji: '🏎️', check: s => s.avgCacheRate >= 80 },
  { key: 'cache_rate_90', category: 'cache', tier: 'diamond', emoji: '⚡', check: s => s.avgCacheRate >= 90 },

  // --- Special (97-100) ---
  { key: 'holiday_coding', category: 'special', tier: 'silver', emoji: '🎄', check: s => s.codedOnHoliday },
  { key: 'palindrome_date', category: 'special', tier: 'gold', emoji: '🔄', check: s => s.codedOnPalindrome },
  { key: 'weekend_warrior', category: 'special', tier: 'bronze', emoji: '⚔️', check: s => s.weekendWarrior },
  { key: 'all_hours', category: 'special', tier: 'platinum', emoji: '🕐', check: s => s.allHoursCovered },

  // =====================================================================
  // NEW ACHIEVEMENTS (101-250)
  // =====================================================================

  // --- Tokens extended (101-112) ---
  { key: 'tokens_1b', category: 'tokens', tier: 'diamond', emoji: '🌌', check: s => s.totalTokens >= 1_000_000_000 },
  { key: 'output_1m', category: 'tokens', tier: 'gold', emoji: '📤', check: s => s.totalOutputTokens >= 1_000_000 },
  { key: 'output_5m', category: 'tokens', tier: 'platinum', emoji: '📦', check: s => s.totalOutputTokens >= 5_000_000 },
  { key: 'output_10m', category: 'tokens', tier: 'platinum', emoji: '🛸', check: s => s.totalOutputTokens >= 10_000_000 },
  { key: 'output_50m', category: 'tokens', tier: 'diamond', emoji: '💫', check: s => s.totalOutputTokens >= 50_000_000 },
  { key: 'output_100m', category: 'tokens', tier: 'diamond', emoji: '🌠', check: s => s.totalOutputTokens >= 100_000_000 },
  { key: 'input_10m', category: 'tokens', tier: 'gold', emoji: '📥', check: s => s.totalInputTokens >= 10_000_000 },
  { key: 'input_50m', category: 'tokens', tier: 'platinum', emoji: '📨', check: s => s.totalInputTokens >= 50_000_000 },
  { key: 'input_100m', category: 'tokens', tier: 'diamond', emoji: '📩', check: s => s.totalInputTokens >= 100_000_000 },
  { key: 'input_500m', category: 'tokens', tier: 'diamond', emoji: '🎯', check: s => s.totalInputTokens >= 500_000_000 },
  { key: 'cache_tokens_10m', category: 'tokens', tier: 'gold', emoji: '💾', check: s => s.totalCacheReadTokens >= 10_000_000 },
  { key: 'cache_tokens_100m', category: 'tokens', tier: 'diamond', emoji: '🗄️', check: s => s.totalCacheReadTokens >= 100_000_000 },

  // --- Sessions extended (113-122) ---
  { key: 'sessions_750', category: 'sessions', tier: 'diamond', emoji: '🏅', check: s => s.totalSessions >= 750 },
  { key: 'sessions_1k', category: 'sessions', tier: 'diamond', emoji: '👑', check: s => s.totalSessions >= 1_000 },
  { key: 'sessions_2k', category: 'sessions', tier: 'diamond', emoji: '🔱', check: s => s.totalSessions >= 2_000 },
  { key: 'sessions_5k', category: 'sessions', tier: 'diamond', emoji: '🌠', check: s => s.totalSessions >= 5_000 },
  { key: 'sessions_10k', category: 'sessions', tier: 'diamond', emoji: '🌌', check: s => s.totalSessions >= 10_000 },
  { key: 'session_longest_4h', category: 'sessions', tier: 'gold', emoji: '⏰', check: s => s.longestSessionMin >= 240 },
  { key: 'session_longest_8h', category: 'sessions', tier: 'platinum', emoji: '⏱️', check: s => s.longestSessionMin >= 480 },
  { key: 'session_longest_12h', category: 'sessions', tier: 'diamond', emoji: '🕰️', check: s => s.longestSessionMin >= 720 },
  { key: 'session_max_200_msgs', category: 'sessions', tier: 'platinum', emoji: '🗣️', check: s => s.maxMessagesInSession >= 200 },
  { key: 'session_max_500_msgs', category: 'sessions', tier: 'diamond', emoji: '📢', check: s => s.maxMessagesInSession >= 500 },

  // --- Messages extended (123-129) ---
  { key: 'messages_100k', category: 'messages', tier: 'diamond', emoji: '📬', check: s => s.totalMessages >= 100_000 },
  { key: 'messages_250k', category: 'messages', tier: 'diamond', emoji: '📮', check: s => s.totalMessages >= 250_000 },
  { key: 'messages_500k', category: 'messages', tier: 'diamond', emoji: '💌', check: s => s.totalMessages >= 500_000 },
  { key: 'messages_1m', category: 'messages', tier: 'diamond', emoji: '✉️', check: s => s.totalMessages >= 1_000_000 },
  { key: 'avg_msgs_session_20', category: 'messages', tier: 'gold', emoji: '📊', check: s => s.avgMessagesPerSession >= 20 },
  { key: 'avg_msgs_session_50', category: 'messages', tier: 'platinum', emoji: '📈', check: s => s.avgMessagesPerSession >= 50 },
  { key: 'avg_msgs_session_100', category: 'messages', tier: 'diamond', emoji: '🎯', check: s => s.avgMessagesPerSession >= 100 },

  // --- Cost extended (130-140) ---
  { key: 'cost_750', category: 'cost', tier: 'diamond', emoji: '💰', check: s => s.totalCost >= 750 },
  { key: 'cost_1000', category: 'cost', tier: 'diamond', emoji: '💸', check: s => s.totalCost >= 1_000 },
  { key: 'cost_2500', category: 'cost', tier: 'diamond', emoji: '🤑', check: s => s.totalCost >= 2_500 },
  { key: 'cost_5000', category: 'cost', tier: 'diamond', emoji: '🏦', check: s => s.totalCost >= 5_000 },
  { key: 'cost_10000', category: 'cost', tier: 'diamond', emoji: '🏛️', check: s => s.totalCost >= 10_000 },
  { key: 'cost_day_10', category: 'cost', tier: 'gold', emoji: '📈', check: s => s.maxDayCost >= 10 },
  { key: 'cost_day_25', category: 'cost', tier: 'platinum', emoji: '📊', check: s => s.maxDayCost >= 25 },
  { key: 'cost_day_50', category: 'cost', tier: 'diamond', emoji: '💹', check: s => s.maxDayCost >= 50 },
  { key: 'cost_day_100', category: 'cost', tier: 'diamond', emoji: '🏧', check: s => s.maxDayCost >= 100 },
  { key: 'cost_session_10', category: 'cost', tier: 'gold', emoji: '💳', check: s => s.maxCostInSession >= 10 },
  { key: 'cost_session_50', category: 'cost', tier: 'diamond', emoji: '💎', check: s => s.maxCostInSession >= 50 },

  // --- Lines extended (141-155) ---
  { key: 'lines_written_100k', category: 'lines', tier: 'platinum', emoji: '📜', check: s => s.totalLinesWritten >= 100_000 },
  { key: 'lines_written_250k', category: 'lines', tier: 'diamond', emoji: '📋', check: s => s.totalLinesWritten >= 250_000 },
  { key: 'lines_written_500k', category: 'lines', tier: 'diamond', emoji: '🗞️', check: s => s.totalLinesWritten >= 500_000 },
  { key: 'lines_written_1m', category: 'lines', tier: 'diamond', emoji: '📚', check: s => s.totalLinesWritten >= 1_000_000 },
  { key: 'lines_edited_50k', category: 'lines', tier: 'platinum', emoji: '✏️', check: s => s.totalLinesAdded >= 50_000 },
  { key: 'lines_edited_100k', category: 'lines', tier: 'diamond', emoji: '🖊️', check: s => s.totalLinesAdded >= 100_000 },
  { key: 'lines_deleted_50k', category: 'lines', tier: 'platinum', emoji: '🗑️', check: s => s.totalLinesRemoved >= 50_000 },
  { key: 'lines_deleted_100k', category: 'lines', tier: 'diamond', emoji: '♻️', check: s => s.totalLinesRemoved >= 100_000 },
  { key: 'lines_net_50k', category: 'lines', tier: 'platinum', emoji: '📈', check: s => s.netLines >= 50_000 },
  { key: 'lines_net_100k', category: 'lines', tier: 'diamond', emoji: '🏗️', check: s => s.netLines >= 100_000 },
  { key: 'lines_net_250k', category: 'lines', tier: 'diamond', emoji: '🌆', check: s => s.netLines >= 250_000 },
  { key: 'lines_day_1k', category: 'lines', tier: 'gold', emoji: '⚡', check: s => s.maxDayLines >= 1_000 },
  { key: 'lines_day_5k', category: 'lines', tier: 'platinum', emoji: '🌩️', check: s => s.maxDayLines >= 5_000 },
  { key: 'lines_day_10k', category: 'lines', tier: 'diamond', emoji: '🌋', check: s => s.maxDayLines >= 10_000 },
  { key: 'lines_day_25k', category: 'lines', tier: 'diamond', emoji: '🔥', check: s => s.maxDayLines >= 25_000 },

  // --- Models extended (156-162) ---
  { key: 'model_sonnet_5k', category: 'models', tier: 'gold', emoji: '🎵', check: s => s.modelMessages.sonnet >= 5_000 },
  { key: 'model_sonnet_10k', category: 'models', tier: 'platinum', emoji: '🎶', check: s => s.modelMessages.sonnet >= 10_000 },
  { key: 'model_opus_5k', category: 'models', tier: 'platinum', emoji: '🎭', check: s => s.modelMessages.opus >= 5_000 },
  { key: 'model_opus_10k', category: 'models', tier: 'diamond', emoji: '🎻', check: s => s.modelMessages.opus >= 10_000 },
  { key: 'model_haiku_1k', category: 'models', tier: 'gold', emoji: '🌸', check: s => s.modelMessages.haiku >= 1_000 },
  { key: 'model_haiku_5k', category: 'models', tier: 'platinum', emoji: '🌺', check: s => s.modelMessages.haiku >= 5_000 },
  { key: 'model_diversity_5', category: 'models', tier: 'diamond', emoji: '🎨', check: s => s.modelCount >= 5 },

  // --- Tools extended (163-178) ---
  { key: 'tool_diversity_20', category: 'tools', tier: 'diamond', emoji: '🧰', check: s => s.toolCount >= 20 },
  { key: 'tool_100k_calls', category: 'tools', tier: 'diamond', emoji: '⚙️', check: s => s.totalToolCalls >= 100_000 },
  { key: 'tool_250k_calls', category: 'tools', tier: 'diamond', emoji: '🔧', check: s => s.totalToolCalls >= 250_000 },
  { key: 'tool_500k_calls', category: 'tools', tier: 'diamond', emoji: '🛠️', check: s => s.totalToolCalls >= 500_000 },
  { key: 'tool_bash_1k', category: 'tools', tier: 'gold', emoji: '💻', check: s => (s.toolCallsByName.Bash || 0) >= 1_000 },
  { key: 'tool_bash_10k', category: 'tools', tier: 'platinum', emoji: '🖥️', check: s => (s.toolCallsByName.Bash || 0) >= 10_000 },
  { key: 'tool_bash_50k', category: 'tools', tier: 'diamond', emoji: '⌨️', check: s => (s.toolCallsByName.Bash || 0) >= 50_000 },
  { key: 'tool_read_10k', category: 'tools', tier: 'gold', emoji: '📖', check: s => (s.toolCallsByName.Read || 0) >= 10_000 },
  { key: 'tool_read_50k', category: 'tools', tier: 'platinum', emoji: '📗', check: s => (s.toolCallsByName.Read || 0) >= 50_000 },
  { key: 'tool_edit_10k', category: 'tools', tier: 'gold', emoji: '🔏', check: s => (s.toolCallsByName.Edit || 0) >= 10_000 },
  { key: 'tool_edit_50k', category: 'tools', tier: 'platinum', emoji: '📐', check: s => (s.toolCallsByName.Edit || 0) >= 50_000 },
  { key: 'tool_write_10k', category: 'tools', tier: 'gold', emoji: '📝', check: s => (s.toolCallsByName.Write || 0) >= 10_000 },
  { key: 'tool_write_50k', category: 'tools', tier: 'platinum', emoji: '📘', check: s => (s.toolCallsByName.Write || 0) >= 50_000 },
  { key: 'tool_grep_10k', category: 'tools', tier: 'gold', emoji: '🔍', check: s => (s.toolCallsByName.Grep || 0) >= 10_000 },
  { key: 'tool_glob_10k', category: 'tools', tier: 'gold', emoji: '🗺️', check: s => (s.toolCallsByName.Glob || 0) >= 10_000 },
  { key: 'tool_task_1k', category: 'tools', tier: 'gold', emoji: '📋', check: s => (s.toolCallsByName.Task || 0) >= 1_000 },

  // --- Time extended (179-195) ---
  { key: 'early_bird_50', category: 'time', tier: 'gold', emoji: '🌅', check: s => s.earlyBirdSessions >= 50 },
  { key: 'early_bird_100', category: 'time', tier: 'platinum', emoji: '🌄', check: s => s.earlyBirdSessions >= 100 },
  { key: 'early_bird_500', category: 'time', tier: 'diamond', emoji: '☀️', check: s => s.earlyBirdSessions >= 500 },
  { key: 'night_owl_50', category: 'time', tier: 'gold', emoji: '🌙', check: s => s.nightOwlSessions >= 50 },
  { key: 'night_owl_100', category: 'time', tier: 'platinum', emoji: '🌑', check: s => s.nightOwlSessions >= 100 },
  { key: 'night_owl_500', category: 'time', tier: 'diamond', emoji: '🦇', check: s => s.nightOwlSessions >= 500 },
  { key: 'marathon_25', category: 'time', tier: 'platinum', emoji: '🏃', check: s => s.marathonSessions >= 25 },
  { key: 'marathon_50', category: 'time', tier: 'diamond', emoji: '🏋️', check: s => s.marathonSessions >= 50 },
  { key: 'marathon_100', category: 'time', tier: 'diamond', emoji: '🦾', check: s => s.marathonSessions >= 100 },
  { key: 'marathon_4h', category: 'time', tier: 'gold', emoji: '⏰', check: s => s.marathonSessions_4h >= 1 },
  { key: 'marathon_4h_10', category: 'time', tier: 'platinum', emoji: '⏱️', check: s => s.marathonSessions_4h >= 10 },
  { key: 'marathon_8h', category: 'time', tier: 'diamond', emoji: '🕐', check: s => s.marathonSessions_8h >= 1 },
  { key: 'peak_300_msgs', category: 'time', tier: 'platinum', emoji: '📊', check: s => s.peakDayMessages >= 300 },
  { key: 'peak_500_msgs', category: 'time', tier: 'diamond', emoji: '💥', check: s => s.peakDayMessages >= 500 },
  { key: 'peak_1000_msgs', category: 'time', tier: 'diamond', emoji: '☄️', check: s => s.peakDayMessages >= 1_000 },
  { key: 'peak_tokens_1m', category: 'time', tier: 'platinum', emoji: '🌡️', check: s => s.maxDayTokens >= 1_000_000 },
  { key: 'peak_tokens_5m', category: 'time', tier: 'diamond', emoji: '🫠', check: s => s.maxDayTokens >= 5_000_000 },

  // --- Projects extended (196-199) ---
  { key: 'project_25', category: 'projects', tier: 'diamond', emoji: '🏘️', check: s => s.projectCount >= 25 },
  { key: 'project_50', category: 'projects', tier: 'diamond', emoji: '🌇', check: s => s.projectCount >= 50 },
  { key: 'project_75', category: 'projects', tier: 'diamond', emoji: '🌃', check: s => s.projectCount >= 75 },
  { key: 'project_100', category: 'projects', tier: 'diamond', emoji: '🌍', check: s => s.projectCount >= 100 },

  // --- Streaks extended (200-212) ---
  { key: 'streak_90', category: 'streaks', tier: 'diamond', emoji: '🔥', check: s => s.longestStreak >= 90 },
  { key: 'streak_120', category: 'streaks', tier: 'diamond', emoji: '🌟', check: s => s.longestStreak >= 120 },
  { key: 'streak_180', category: 'streaks', tier: 'diamond', emoji: '💫', check: s => s.longestStreak >= 180 },
  { key: 'streak_365', category: 'streaks', tier: 'diamond', emoji: '⭐', check: s => s.longestStreak >= 365 },
  { key: 'active_days_200', category: 'streaks', tier: 'platinum', emoji: '📆', check: s => s.activeDays >= 200 },
  { key: 'active_days_365', category: 'streaks', tier: 'diamond', emoji: '🗓️', check: s => s.activeDays >= 365 },
  { key: 'active_days_500', category: 'streaks', tier: 'diamond', emoji: '📅', check: s => s.activeDays >= 500 },
  { key: 'active_days_730', category: 'streaks', tier: 'diamond', emoji: '🎯', check: s => s.activeDays >= 730 },
  { key: 'active_days_1000', category: 'streaks', tier: 'diamond', emoji: '🏆', check: s => s.activeDays >= 1_000 },
  { key: 'months_active_6', category: 'streaks', tier: 'gold', emoji: '📅', check: s => s.monthsActive >= 6 },
  { key: 'months_active_12', category: 'streaks', tier: 'platinum', emoji: '📆', check: s => s.monthsActive >= 12 },
  { key: 'months_active_24', category: 'streaks', tier: 'diamond', emoji: '🗓️', check: s => s.monthsActive >= 24 },
  { key: 'months_active_36', category: 'streaks', tier: 'diamond', emoji: '🏛️', check: s => s.monthsActive >= 36 },

  // --- Cache extended (213-216) ---
  { key: 'cache_rate_95', category: 'cache', tier: 'diamond', emoji: '🏎️', check: s => s.avgCacheRate >= 95 },
  { key: 'cache_rate_99', category: 'cache', tier: 'diamond', emoji: '🚀', check: s => s.avgCacheRate >= 99 },
  { key: 'cache_tokens_50m', category: 'cache', tier: 'platinum', emoji: '💽', check: s => s.totalCacheReadTokens >= 50_000_000 },
  { key: 'cache_tokens_500m', category: 'cache', tier: 'diamond', emoji: '🖲️', check: s => s.totalCacheReadTokens >= 500_000_000 },

  // --- Special extended (217-250) ---
  { key: 'new_years_coding', category: 'special', tier: 'gold', emoji: '🎆', check: s => s.codedOnNewYear },
  { key: 'friday_13th', category: 'special', tier: 'gold', emoji: '🔮', check: s => s.codedOnFriday13 },
  { key: 'leap_day', category: 'special', tier: 'diamond', emoji: '🦘', check: s => s.codedOnLeapDay },
  { key: 'pi_day', category: 'special', tier: 'gold', emoji: '🥧', check: s => s.codedOnPiDay },
  { key: 'star_wars_day', category: 'special', tier: 'gold', emoji: '⚔️', check: s => s.codedOnStarWarsDay },
  { key: 'summer_solstice', category: 'special', tier: 'gold', emoji: '☀️', check: s => s.codedOnSolstice },
  { key: 'halloween_night', category: 'special', tier: 'platinum', emoji: '🎃', check: s => s.codedOnHalloweenNight },
  { key: 'christmas_coding', category: 'special', tier: 'gold', emoji: '🎁', check: s => s.codedOnChristmas },
  { key: 'new_years_eve', category: 'special', tier: 'gold', emoji: '🎇', check: s => s.codedOnNewYearsEve },
  { key: 'midnight_marathon', category: 'special', tier: 'gold', emoji: '🌓', check: s => s.hasMidnightMarathon },
  { key: 'full_weekend_5', category: 'special', tier: 'gold', emoji: '🏖️', check: s => s.fullWeekendCount >= 5 },
  { key: 'full_weekend_10', category: 'special', tier: 'platinum', emoji: '⛱️', check: s => s.fullWeekendCount >= 10 },
  { key: 'full_weekend_25', category: 'special', tier: 'diamond', emoji: '🏝️', check: s => s.fullWeekendCount >= 25 },
  { key: 'full_weekend_52', category: 'special', tier: 'diamond', emoji: '🌴', check: s => s.fullWeekendCount >= 52 },
  { key: 'sunday_coder_10', category: 'special', tier: 'silver', emoji: '☕', check: s => s.sundaysActive >= 10 },
  { key: 'seven_day_week', category: 'special', tier: 'gold', emoji: '📅', check: s => s.longestStreak >= 7 },
  { key: 'consec_weekends_4', category: 'special', tier: 'platinum', emoji: '🎪', check: s => s.consecutiveFullWeekends >= 4 },
  { key: 'consec_weekends_8', category: 'special', tier: 'diamond', emoji: '🎡', check: s => s.consecutiveFullWeekends >= 8 },
  { key: 'tokens_session_1m', category: 'special', tier: 'platinum', emoji: '💎', check: s => s.maxTokensInSession >= 1_000_000 },
  { key: 'tokens_session_5m', category: 'special', tier: 'diamond', emoji: '🌟', check: s => s.maxTokensInSession >= 5_000_000 },
  { key: 'tokens_session_10m', category: 'special', tier: 'diamond', emoji: '✨', check: s => s.maxTokensInSession >= 10_000_000 },
  { key: 'multi_proj_day_3', category: 'special', tier: 'gold', emoji: '🔀', check: s => s.maxProjectsInDay >= 3 },
  { key: 'multi_proj_day_5', category: 'special', tier: 'platinum', emoji: '🔄', check: s => s.maxProjectsInDay >= 5 },
  { key: 'multi_proj_day_10', category: 'special', tier: 'diamond', emoji: '🌀', check: s => s.maxProjectsInDay >= 10 },
  { key: 'century_session', category: 'special', tier: 'gold', emoji: '💯', check: s => s.maxMessagesInSession >= 100 },
  { key: 'output_ratio_60', category: 'special', tier: 'gold', emoji: '📤', check: s => s.outputRatio >= 0.004 }, // war 0.6 — bei 98% Cache-Leseanteil unerreichbar (real 0.002)
  { key: 'all_weekdays', category: 'special', tier: 'gold', emoji: '📅', check: s => s.allWeekdaysCovered },
  { key: 'triple_model_day', category: 'special', tier: 'platinum', emoji: '🎨', check: s => s.hasTripleModelDay },
  { key: 'dawn_dusk_session', category: 'special', tier: 'gold', emoji: '🌗', check: s => s.hasDawnAndDusk },
  { key: 'efficiency_master', category: 'special', tier: 'gold', emoji: '🎯', check: s => s.avgTokensPerMessage > 0 && s.avgTokensPerMessage < 5_000 },
  { key: 'big_session_cost_25', category: 'special', tier: 'platinum', emoji: '💰', check: s => s.maxCostInSession >= 25 },
  { key: 'lines_session_1k', category: 'special', tier: 'gold', emoji: '📑', check: s => s.maxLinesInSession >= 1_000 },
  { key: 'lines_session_5k', category: 'special', tier: 'platinum', emoji: '📗', check: s => s.maxLinesInSession >= 5_000 },
  { key: 'millennium', category: 'special', tier: 'diamond', emoji: '🏆', check: s => s.totalSessions >= 1_000 && s.totalMessages >= 100_000 && s.totalCost >= 1_000 },

  // =====================================================================
  // VERY HARD / EXTREMELY HARD ACHIEVEMENTS (251-500)
  // =====================================================================

  // --- Tokens extreme (251-270) ---
  { key: 'tokens_2b', category: 'tokens', tier: 'diamond', emoji: '🌌', check: s => s.totalTokens >= 2_000_000_000 },
  { key: 'tokens_5b', category: 'tokens', tier: 'diamond', emoji: '🔮', check: s => s.totalTokens >= 5_000_000_000 },
  { key: 'tokens_10b', category: 'tokens', tier: 'diamond', emoji: '💎', check: s => s.totalTokens >= 10_000_000_000 },
  { key: 'output_250m', category: 'tokens', tier: 'diamond', emoji: '📤', check: s => s.totalOutputTokens >= 250_000_000 },
  { key: 'output_500m', category: 'tokens', tier: 'diamond', emoji: '🚀', check: s => s.totalOutputTokens >= 500_000_000 },
  { key: 'output_1b', category: 'tokens', tier: 'diamond', emoji: '🌟', check: s => s.totalOutputTokens >= 1_000_000_000 },
  { key: 'output_2b', category: 'tokens', tier: 'diamond', emoji: '✨', check: s => s.totalOutputTokens >= 2_000_000_000 },
  { key: 'input_1b', category: 'tokens', tier: 'diamond', emoji: '📥', check: s => s.totalInputTokens >= 1_000_000_000 },
  { key: 'input_2b', category: 'tokens', tier: 'diamond', emoji: '📩', check: s => s.totalInputTokens >= 2_000_000_000 },
  { key: 'input_5b', category: 'tokens', tier: 'diamond', emoji: '🎯', check: s => s.totalInputTokens >= 5_000_000_000 },
  { key: 'cache_read_1b', category: 'tokens', tier: 'diamond', emoji: '💾', check: s => s.totalCacheReadTokens >= 1_000_000_000 },
  { key: 'cache_read_2b', category: 'tokens', tier: 'diamond', emoji: '🗄️', check: s => s.totalCacheReadTokens >= 2_000_000_000 },
  { key: 'cache_read_5b', category: 'tokens', tier: 'diamond', emoji: '🏦', check: s => s.totalCacheReadTokens >= 5_000_000_000 },
  { key: 'output_ratio_70', category: 'tokens', tier: 'platinum', emoji: '📊', check: s => s.outputRatio >= 0.008 }, // war 0.7
  { key: 'output_ratio_80', category: 'tokens', tier: 'diamond', emoji: '📈', check: s => s.outputRatio >= 0.015 }, // war 0.8
  { key: 'tokens_per_msg_10k', category: 'tokens', tier: 'gold', emoji: '📝', check: s => s.avgTokensPerMessage >= 10_000 },
  { key: 'tokens_per_msg_25k', category: 'tokens', tier: 'platinum', emoji: '📄', check: s => s.avgTokensPerMessage >= 25_000 },
  { key: 'tokens_per_msg_50k', category: 'tokens', tier: 'diamond', emoji: '📚', check: s => s.avgTokensPerMessage >= 50_000 },
  { key: 'avg_tokens_day_1m', category: 'tokens', tier: 'gold', emoji: '🔢', check: s => s.avgTokensPerDay >= 1_000_000 },
  { key: 'avg_tokens_day_10m', category: 'tokens', tier: 'diamond', emoji: '🧮', check: s => s.avgTokensPerDay >= 10_000_000 },

  // --- Sessions extreme (271-290) ---
  { key: 'sessions_15k', category: 'sessions', tier: 'diamond', emoji: '🏅', check: s => s.totalSessions >= 15_000 },
  { key: 'sessions_20k', category: 'sessions', tier: 'diamond', emoji: '👑', check: s => s.totalSessions >= 20_000 },
  { key: 'sessions_50k', category: 'sessions', tier: 'diamond', emoji: '🔱', check: s => s.totalSessions >= 50_000 },
  { key: 'sessions_100k', category: 'sessions', tier: 'diamond', emoji: '🌠', check: s => s.totalSessions >= 100_000 },
  { key: 'session_longest_16h', category: 'sessions', tier: 'diamond', emoji: '⏰', check: s => s.longestSessionMin >= 960 },
  { key: 'session_longest_24h', category: 'sessions', tier: 'diamond', emoji: '⏱️', check: s => s.longestSessionMin >= 1440 },
  { key: 'session_max_1k_msgs', category: 'sessions', tier: 'diamond', emoji: '🗣️', check: s => s.maxMessagesInSession >= 1_000 },
  { key: 'session_max_2k_msgs', category: 'sessions', tier: 'diamond', emoji: '📢', check: s => s.maxMessagesInSession >= 2_000 },
  { key: 'session_cost_100', category: 'sessions', tier: 'diamond', emoji: '💰', check: s => s.maxCostInSession >= 100 },
  { key: 'session_cost_250', category: 'sessions', tier: 'diamond', emoji: '💸', check: s => s.maxCostInSession >= 250 },
  { key: 'session_cost_500', category: 'sessions', tier: 'diamond', emoji: '🤑', check: s => s.maxCostInSession >= 500 },
  { key: 'session_tokens_10m', category: 'sessions', tier: 'platinum', emoji: '🔢', check: s => s.maxTokensInSession >= 10_000_000 },
  { key: 'session_tokens_25m', category: 'sessions', tier: 'diamond', emoji: '🧮', check: s => s.maxTokensInSession >= 25_000_000 },
  { key: 'session_tokens_50m', category: 'sessions', tier: 'diamond', emoji: '📟', check: s => s.maxTokensInSession >= 50_000_000 },
  { key: 'sessions_100_msgs_10', category: 'sessions', tier: 'platinum', emoji: '🎖️', check: s => s.sessionsAbove100Msgs >= 10 },
  { key: 'sessions_100_msgs_50', category: 'sessions', tier: 'diamond', emoji: '🏆', check: s => s.sessionsAbove100Msgs >= 50 },
  { key: 'sessions_100_msgs_100', category: 'sessions', tier: 'diamond', emoji: '👑', check: s => s.sessionsAbove100Msgs >= 100 },
  { key: 'total_hours_500', category: 'sessions', tier: 'platinum', emoji: '⏳', check: s => s.totalSessionHours >= 500 },
  { key: 'total_hours_2k', category: 'sessions', tier: 'diamond', emoji: '⌛', check: s => s.totalSessionHours >= 2_000 },
  { key: 'total_hours_10k', category: 'sessions', tier: 'diamond', emoji: '🕰️', check: s => s.totalSessionHours >= 10_000 },

  // --- Messages extreme (291-305) ---
  { key: 'messages_2m', category: 'messages', tier: 'diamond', emoji: '💬', check: s => s.totalMessages >= 2_000_000 },
  { key: 'messages_5m', category: 'messages', tier: 'diamond', emoji: '🗨️', check: s => s.totalMessages >= 5_000_000 },
  { key: 'messages_10m', category: 'messages', tier: 'diamond', emoji: '📨', check: s => s.totalMessages >= 10_000_000 },
  { key: 'avg_msgs_session_150', category: 'messages', tier: 'diamond', emoji: '📊', check: s => s.avgMessagesPerSession >= 150 },
  { key: 'avg_msgs_session_200', category: 'messages', tier: 'diamond', emoji: '📈', check: s => s.avgMessagesPerSession >= 200 },
  { key: 'avg_msgs_day_50', category: 'messages', tier: 'gold', emoji: '📬', check: s => s.activeDays > 0 && (s.totalMessages / s.activeDays) >= 50 },
  { key: 'avg_msgs_day_100', category: 'messages', tier: 'platinum', emoji: '📮', check: s => s.activeDays > 0 && (s.totalMessages / s.activeDays) >= 100 },
  { key: 'avg_msgs_day_250', category: 'messages', tier: 'diamond', emoji: '💌', check: s => s.activeDays > 0 && (s.totalMessages / s.activeDays) >= 250 },
  { key: 'avg_msgs_day_500', category: 'messages', tier: 'diamond', emoji: '✉️', check: s => s.activeDays > 0 && (s.totalMessages / s.activeDays) >= 500 },
  { key: 'days_100_msgs_10', category: 'messages', tier: 'platinum', emoji: '🔥', check: s => s.daysAbove100Msgs >= 10 },
  { key: 'days_100_msgs_50', category: 'messages', tier: 'diamond', emoji: '🌡️', check: s => s.daysAbove100Msgs >= 50 },
  { key: 'days_100_msgs_100', category: 'messages', tier: 'diamond', emoji: '☄️', check: s => s.daysAbove100Msgs >= 100 },
  { key: 'days_500_msgs_5', category: 'messages', tier: 'diamond', emoji: '🌋', check: s => s.daysAbove500Msgs >= 5 },
  { key: 'days_500_msgs_10', category: 'messages', tier: 'diamond', emoji: '🏔️', check: s => s.daysAbove500Msgs >= 10 },
  { key: 'days_500_msgs_25', category: 'messages', tier: 'diamond', emoji: '🗻', check: s => s.daysAbove500Msgs >= 25 },

  // --- Cost extreme (306-325) ---
  { key: 'cost_15k', category: 'cost', tier: 'diamond', emoji: '💵', check: s => s.totalCost >= 15_000 },
  { key: 'cost_25k', category: 'cost', tier: 'diamond', emoji: '💶', check: s => s.totalCost >= 25_000 },
  { key: 'cost_50k', category: 'cost', tier: 'diamond', emoji: '💷', check: s => s.totalCost >= 50_000 },
  { key: 'cost_100k', category: 'cost', tier: 'diamond', emoji: '💴', check: s => s.totalCost >= 100_000 },
  { key: 'cost_day_250', category: 'cost', tier: 'diamond', emoji: '📈', check: s => s.maxDayCost >= 250 },
  { key: 'cost_day_500', category: 'cost', tier: 'diamond', emoji: '📊', check: s => s.maxDayCost >= 500 },
  { key: 'cost_day_1k', category: 'cost', tier: 'diamond', emoji: '💹', check: s => s.maxDayCost >= 1_000 },
  { key: 'cost_session_100', category: 'cost', tier: 'diamond', emoji: '💳', check: s => s.maxCostInSession >= 100 },
  { key: 'cost_session_250', category: 'cost', tier: 'diamond', emoji: '💎', check: s => s.maxCostInSession >= 250 },
  { key: 'cost_session_500', category: 'cost', tier: 'diamond', emoji: '🏧', check: s => s.maxCostInSession >= 500 },
  { key: 'cost_session_1k', category: 'cost', tier: 'diamond', emoji: '🏛️', check: s => s.maxCostInSession >= 1_000 },
  { key: 'avg_cost_session_5', category: 'cost', tier: 'gold', emoji: '💲', check: s => s.avgCostPerSession >= 5 },
  { key: 'avg_cost_session_10', category: 'cost', tier: 'platinum', emoji: '💰', check: s => s.avgCostPerSession >= 10 },
  { key: 'avg_cost_session_25', category: 'cost', tier: 'diamond', emoji: '💸', check: s => s.avgCostPerSession >= 25 },
  { key: 'avg_cost_session_50', category: 'cost', tier: 'diamond', emoji: '🤑', check: s => s.avgCostPerSession >= 50 },
  { key: 'avg_cost_day_10', category: 'cost', tier: 'gold', emoji: '📅', check: s => s.avgCostPerDay >= 10 },
  { key: 'avg_cost_day_25', category: 'cost', tier: 'platinum', emoji: '📆', check: s => s.avgCostPerDay >= 25 },
  { key: 'avg_cost_day_50', category: 'cost', tier: 'diamond', emoji: '🗓️', check: s => s.avgCostPerDay >= 50 },
  { key: 'days_50_cost_10', category: 'cost', tier: 'platinum', emoji: '🔥', check: s => s.daysAbove50Cost >= 10 },
  { key: 'days_50_cost_100', category: 'cost', tier: 'diamond', emoji: '🌋', check: s => s.daysAbove50Cost >= 100 },

  // --- Lines extreme (326-350) ---
  { key: 'lines_written_2m', category: 'lines', tier: 'diamond', emoji: '📜', check: s => s.totalLinesWritten >= 2_000_000 },
  { key: 'lines_written_5m', category: 'lines', tier: 'diamond', emoji: '📋', check: s => s.totalLinesWritten >= 5_000_000 },
  { key: 'lines_written_10m', category: 'lines', tier: 'diamond', emoji: '🗞️', check: s => s.totalLinesWritten >= 10_000_000 },
  { key: 'lines_edited_250k', category: 'lines', tier: 'diamond', emoji: '✏️', check: s => s.totalLinesAdded >= 250_000 },
  { key: 'lines_edited_500k', category: 'lines', tier: 'diamond', emoji: '🖊️', check: s => s.totalLinesAdded >= 500_000 },
  { key: 'lines_edited_1m', category: 'lines', tier: 'diamond', emoji: '🔧', check: s => s.totalLinesAdded >= 1_000_000 },
  { key: 'lines_deleted_250k', category: 'lines', tier: 'diamond', emoji: '🗑️', check: s => s.totalLinesRemoved >= 250_000 },
  { key: 'lines_deleted_500k', category: 'lines', tier: 'diamond', emoji: '💥', check: s => s.totalLinesRemoved >= 500_000 },
  { key: 'lines_deleted_1m', category: 'lines', tier: 'diamond', emoji: '🧹', check: s => s.totalLinesRemoved >= 1_000_000 },
  { key: 'lines_net_500k', category: 'lines', tier: 'diamond', emoji: '📈', check: s => s.netLines >= 500_000 },
  { key: 'lines_net_1m', category: 'lines', tier: 'diamond', emoji: '🚀', check: s => s.netLines >= 1_000_000 },
  { key: 'lines_net_5m', category: 'lines', tier: 'diamond', emoji: '🌆', check: s => s.netLines >= 5_000_000 },
  { key: 'lines_day_50k', category: 'lines', tier: 'diamond', emoji: '⚡', check: s => s.maxDayLines >= 50_000 },
  { key: 'lines_day_100k', category: 'lines', tier: 'diamond', emoji: '🌩️', check: s => s.maxDayLines >= 100_000 },
  { key: 'lines_session_10k', category: 'lines', tier: 'platinum', emoji: '📑', check: s => s.maxLinesInSession >= 10_000 },
  { key: 'lines_session_25k', category: 'lines', tier: 'diamond', emoji: '📗', check: s => s.maxLinesInSession >= 25_000 },
  { key: 'lines_session_50k', category: 'lines', tier: 'diamond', emoji: '📕', check: s => s.maxLinesInSession >= 50_000 },
  { key: 'lines_session_100k', category: 'lines', tier: 'diamond', emoji: '📘', check: s => s.maxLinesInSession >= 100_000 },
  { key: 'avg_lines_session_500', category: 'lines', tier: 'gold', emoji: '📊', check: s => s.avgLinesPerSession >= 500 },
  { key: 'avg_lines_session_1k', category: 'lines', tier: 'platinum', emoji: '📈', check: s => s.avgLinesPerSession >= 1_000 },
  { key: 'avg_lines_session_2k', category: 'lines', tier: 'diamond', emoji: '📉', check: s => s.avgLinesPerSession >= 2_000 },
  { key: 'avg_lines_session_5k', category: 'lines', tier: 'diamond', emoji: '📋', check: s => s.avgLinesPerSession >= 5_000 },
  { key: 'days_1k_lines_10', category: 'lines', tier: 'platinum', emoji: '🔥', check: s => s.daysAbove1kLines >= 10 },
  { key: 'days_1k_lines_50', category: 'lines', tier: 'diamond', emoji: '🌡️', check: s => s.daysAbove1kLines >= 50 },
  { key: 'days_1k_lines_100', category: 'lines', tier: 'diamond', emoji: '☄️', check: s => s.daysAbove1kLines >= 100 },

  // --- Models extreme (351-365) ---
  { key: 'model_diversity_6', category: 'models', tier: 'diamond', emoji: '🎨', check: s => s.modelCount >= 6 },
  { key: 'model_sonnet_25k', category: 'models', tier: 'diamond', emoji: '🎵', check: s => s.modelMessages.sonnet >= 25_000 },
  { key: 'model_sonnet_50k', category: 'models', tier: 'diamond', emoji: '🎶', check: s => s.modelMessages.sonnet >= 50_000 },
  { key: 'model_sonnet_100k', category: 'models', tier: 'diamond', emoji: '🎼', check: s => s.modelMessages.sonnet >= 100_000 },
  { key: 'model_opus_25k', category: 'models', tier: 'diamond', emoji: '🎭', check: s => s.modelMessages.opus >= 25_000 },
  { key: 'model_opus_50k', category: 'models', tier: 'diamond', emoji: '🎻', check: s => s.modelMessages.opus >= 50_000 },
  { key: 'model_opus_100k', category: 'models', tier: 'diamond', emoji: '🎺', check: s => s.modelMessages.opus >= 100_000 },
  { key: 'model_haiku_10k', category: 'models', tier: 'platinum', emoji: '🌸', check: s => s.modelMessages.haiku >= 10_000 },
  { key: 'model_haiku_25k', category: 'models', tier: 'diamond', emoji: '🌺', check: s => s.modelMessages.haiku >= 25_000 },
  { key: 'model_haiku_50k', category: 'models', tier: 'diamond', emoji: '🍃', check: s => s.modelMessages.haiku >= 50_000 },
  { key: 'triple_model_day_10', category: 'models', tier: 'platinum', emoji: '🌈', check: s => s.tripleModelDayCount >= 10 },
  { key: 'triple_model_day_50', category: 'models', tier: 'diamond', emoji: '🪄', check: s => s.tripleModelDayCount >= 50 },
  { key: 'model_opus_majority', category: 'models', tier: 'diamond', emoji: '👑', check: s => s.totalMessages > 0 && s.modelMessages.opus > s.totalMessages * 0.5 },
  { key: 'model_sonnet_majority', category: 'models', tier: 'platinum', emoji: '🎯', check: s => s.totalMessages > 0 && s.modelMessages.sonnet > s.totalMessages * 0.5 },
  { key: 'model_haiku_majority', category: 'models', tier: 'platinum', emoji: '🍂', check: s => s.totalMessages > 0 && s.modelMessages.haiku > s.totalMessages * 0.08 }, // war 0.5 — Haiku laege bei 2,9%, Opus bei 82,6%

  // --- Tools extreme (366-390) ---
  { key: 'tool_diversity_25', category: 'tools', tier: 'diamond', emoji: '🧰', check: s => s.toolCount >= 25 },
  { key: 'tool_diversity_30', category: 'tools', tier: 'diamond', emoji: '🛠️', check: s => s.toolCount >= 30 },
  { key: 'tool_1m_calls', category: 'tools', tier: 'diamond', emoji: '⚡', check: s => s.totalToolCalls >= 1_000_000 },
  { key: 'tool_2m_calls', category: 'tools', tier: 'diamond', emoji: '🔌', check: s => s.totalToolCalls >= 2_000_000 },
  { key: 'tool_5m_calls', category: 'tools', tier: 'diamond', emoji: '⚙️', check: s => s.totalToolCalls >= 5_000_000 },
  { key: 'tool_bash_100k', category: 'tools', tier: 'diamond', emoji: '💻', check: s => (s.toolCallsByName.Bash || 0) >= 100_000 },
  { key: 'tool_bash_250k', category: 'tools', tier: 'diamond', emoji: '🖥️', check: s => (s.toolCallsByName.Bash || 0) >= 250_000 },
  { key: 'tool_bash_500k', category: 'tools', tier: 'diamond', emoji: '⌨️', check: s => (s.toolCallsByName.Bash || 0) >= 500_000 },
  { key: 'tool_read_100k', category: 'tools', tier: 'diamond', emoji: '📖', check: s => (s.toolCallsByName.Read || 0) >= 100_000 },
  { key: 'tool_read_250k', category: 'tools', tier: 'diamond', emoji: '📗', check: s => (s.toolCallsByName.Read || 0) >= 250_000 },
  { key: 'tool_read_500k', category: 'tools', tier: 'diamond', emoji: '📚', check: s => (s.toolCallsByName.Read || 0) >= 500_000 },
  { key: 'tool_edit_100k', category: 'tools', tier: 'diamond', emoji: '🔏', check: s => (s.toolCallsByName.Edit || 0) >= 100_000 },
  { key: 'tool_edit_250k', category: 'tools', tier: 'diamond', emoji: '📐', check: s => (s.toolCallsByName.Edit || 0) >= 250_000 },
  { key: 'tool_edit_500k', category: 'tools', tier: 'diamond', emoji: '✂️', check: s => (s.toolCallsByName.Edit || 0) >= 500_000 },
  { key: 'tool_write_100k', category: 'tools', tier: 'diamond', emoji: '📝', check: s => (s.toolCallsByName.Write || 0) >= 100_000 },
  { key: 'tool_write_250k', category: 'tools', tier: 'diamond', emoji: '📘', check: s => (s.toolCallsByName.Write || 0) >= 250_000 },
  { key: 'tool_grep_50k', category: 'tools', tier: 'platinum', emoji: '🔍', check: s => (s.toolCallsByName.Grep || 0) >= 50_000 },
  { key: 'tool_grep_100k', category: 'tools', tier: 'diamond', emoji: '🔎', check: s => (s.toolCallsByName.Grep || 0) >= 100_000 },
  { key: 'tool_grep_250k', category: 'tools', tier: 'diamond', emoji: '🧐', check: s => (s.toolCallsByName.Grep || 0) >= 250_000 },
  { key: 'tool_glob_50k', category: 'tools', tier: 'platinum', emoji: '📁', check: s => (s.toolCallsByName.Glob || 0) >= 50_000 },
  { key: 'tool_glob_100k', category: 'tools', tier: 'diamond', emoji: '🗺️', check: s => (s.toolCallsByName.Glob || 0) >= 100_000 },
  { key: 'tool_task_5k', category: 'tools', tier: 'platinum', emoji: '📋', check: s => (s.toolCallsByName.Task || 0) >= 5_000 },
  { key: 'tool_task_10k', category: 'tools', tier: 'diamond', emoji: '📌', check: s => (s.toolCallsByName.Task || 0) >= 10_000 },
  { key: 'tool_task_25k', category: 'tools', tier: 'diamond', emoji: '📎', check: s => (s.toolCallsByName.Task || 0) >= 25_000 },
  { key: 'tool_task_50k', category: 'tools', tier: 'diamond', emoji: '🗂️', check: s => (s.toolCallsByName.Task || 0) >= 50_000 },

  // --- Time extreme (391-415) ---
  { key: 'early_bird_1000', category: 'time', tier: 'diamond', emoji: '🌅', check: s => s.earlyBirdSessions >= 1_000 },
  { key: 'night_owl_1000', category: 'time', tier: 'diamond', emoji: '🌙', check: s => s.nightOwlSessions >= 1_000 },
  { key: 'marathon_200', category: 'time', tier: 'diamond', emoji: '🏃', check: s => s.marathonSessions >= 200 },
  { key: 'marathon_500', category: 'time', tier: 'diamond', emoji: '🏋️', check: s => s.marathonSessions >= 500 },
  { key: 'marathon_8h_10', category: 'time', tier: 'diamond', emoji: '🕐', check: s => s.marathonSessions_8h >= 10 },
  { key: 'marathon_8h_25', category: 'time', tier: 'diamond', emoji: '🕑', check: s => s.marathonSessions_8h >= 25 },
  { key: 'marathon_8h_50', category: 'time', tier: 'diamond', emoji: '🕒', check: s => s.marathonSessions_8h >= 50 },
  { key: 'marathon_12h_5', category: 'time', tier: 'diamond', emoji: '🕓', check: s => s.marathonSessions_12h >= 5 },
  { key: 'marathon_12h_10', category: 'time', tier: 'diamond', emoji: '🕔', check: s => s.marathonSessions_12h >= 10 },
  { key: 'marathon_12h_25', category: 'time', tier: 'diamond', emoji: '🕕', check: s => s.marathonSessions_12h >= 25 },
  { key: 'marathon_16h_1', category: 'time', tier: 'diamond', emoji: '🕖', check: s => s.marathonSessions_16h >= 1 },
  { key: 'marathon_16h_5', category: 'time', tier: 'diamond', emoji: '🕗', check: s => s.marathonSessions_16h >= 5 },
  { key: 'peak_2000_msgs', category: 'time', tier: 'diamond', emoji: '📊', check: s => s.peakDayMessages >= 2_000 },
  { key: 'peak_5000_msgs', category: 'time', tier: 'diamond', emoji: '💥', check: s => s.peakDayMessages >= 5_000 },
  { key: 'peak_tokens_10m', category: 'time', tier: 'diamond', emoji: '🌡️', check: s => s.maxDayTokens >= 10_000_000 },
  { key: 'peak_tokens_25m', category: 'time', tier: 'diamond', emoji: '🫠', check: s => s.maxDayTokens >= 25_000_000 },
  { key: 'peak_tokens_50m', category: 'time', tier: 'diamond', emoji: '🔥', check: s => s.maxDayTokens >= 50_000_000 },
  { key: 'weekend_sessions_100', category: 'time', tier: 'platinum', emoji: '🏖️', check: s => s.weekendSessionCount >= 100 },
  { key: 'weekend_sessions_500', category: 'time', tier: 'diamond', emoji: '⛱️', check: s => s.weekendSessionCount >= 500 },
  { key: 'max_sessions_day_10', category: 'time', tier: 'gold', emoji: '📅', check: s => s.maxSessionsInDay >= 10 },
  { key: 'max_sessions_day_25', category: 'time', tier: 'platinum', emoji: '📆', check: s => s.maxSessionsInDay >= 25 },
  { key: 'max_sessions_day_50', category: 'time', tier: 'diamond', emoji: '🗓️', check: s => s.maxSessionsInDay >= 50 },
  { key: 'consec_months_6', category: 'time', tier: 'gold', emoji: '📅', check: s => s.consecutiveMonthsActive >= 6 },
  { key: 'consec_months_12', category: 'time', tier: 'platinum', emoji: '📆', check: s => s.consecutiveMonthsActive >= 12 },
  { key: 'consec_months_24', category: 'time', tier: 'diamond', emoji: '🗓️', check: s => s.consecutiveMonthsActive >= 24 },

  // --- Projects extreme (416-435) ---
  { key: 'project_150', category: 'projects', tier: 'diamond', emoji: '🏘️', check: s => s.projectCount >= 150 },
  { key: 'project_200', category: 'projects', tier: 'diamond', emoji: '🌇', check: s => s.projectCount >= 200 },
  { key: 'project_300', category: 'projects', tier: 'diamond', emoji: '🌃', check: s => s.projectCount >= 300 },
  { key: 'project_500', category: 'projects', tier: 'diamond', emoji: '🌍', check: s => s.projectCount >= 500 },
  { key: 'proj_sessions_100', category: 'projects', tier: 'platinum', emoji: '📂', check: s => s.maxProjectSessions >= 100 },
  { key: 'proj_sessions_250', category: 'projects', tier: 'diamond', emoji: '📁', check: s => s.maxProjectSessions >= 250 },
  { key: 'proj_sessions_500', category: 'projects', tier: 'diamond', emoji: '🗂️', check: s => s.maxProjectSessions >= 500 },
  { key: 'proj_sessions_1k', category: 'projects', tier: 'diamond', emoji: '🏢', check: s => s.maxProjectSessions >= 1_000 },
  { key: 'proj_msgs_1k', category: 'projects', tier: 'gold', emoji: '💬', check: s => s.maxProjectMessages >= 1_000 },
  { key: 'proj_msgs_5k', category: 'projects', tier: 'platinum', emoji: '🗨️', check: s => s.maxProjectMessages >= 5_000 },
  { key: 'proj_msgs_10k', category: 'projects', tier: 'diamond', emoji: '📨', check: s => s.maxProjectMessages >= 10_000 },
  { key: 'proj_msgs_50k', category: 'projects', tier: 'diamond', emoji: '📬', check: s => s.maxProjectMessages >= 50_000 },
  { key: 'proj_cost_100', category: 'projects', tier: 'gold', emoji: '💰', check: s => s.maxProjectCost >= 100 },
  { key: 'proj_cost_500', category: 'projects', tier: 'platinum', emoji: '💸', check: s => s.maxProjectCost >= 500 },
  { key: 'proj_cost_1k', category: 'projects', tier: 'diamond', emoji: '🤑', check: s => s.maxProjectCost >= 1_000 },
  { key: 'proj_cost_5k', category: 'projects', tier: 'diamond', emoji: '🏦', check: s => s.maxProjectCost >= 5_000 },
  { key: 'proj_tokens_10m', category: 'projects', tier: 'platinum', emoji: '🔢', check: s => s.maxProjectTokens >= 10_000_000 },
  { key: 'proj_tokens_50m', category: 'projects', tier: 'diamond', emoji: '🧮', check: s => s.maxProjectTokens >= 50_000_000 },
  { key: 'proj_tokens_100m', category: 'projects', tier: 'diamond', emoji: '📟', check: s => s.maxProjectTokens >= 100_000_000 },
  { key: 'multi_proj_day_15', category: 'projects', tier: 'diamond', emoji: '🔀', check: s => s.maxProjectsInDay >= 15 },

  // --- Streaks extreme (436-455) ---
  { key: 'streak_500', category: 'streaks', tier: 'diamond', emoji: '🔥', check: s => s.longestStreak >= 500 },
  { key: 'streak_730', category: 'streaks', tier: 'diamond', emoji: '🌟', check: s => s.longestStreak >= 730 },
  { key: 'streak_1000', category: 'streaks', tier: 'diamond', emoji: '💫', check: s => s.longestStreak >= 1_000 },
  { key: 'streak_1500', category: 'streaks', tier: 'diamond', emoji: '⭐', check: s => s.longestStreak >= 400 }, // war 1500 Tage (4,1 Jahre am Stueck)
  { key: 'streak_2000', category: 'streaks', tier: 'diamond', emoji: '🏆', check: s => s.longestStreak >= 500 }, // war 2000 Tage (5,5 Jahre am Stueck)
  { key: 'active_days_1500', category: 'streaks', tier: 'diamond', emoji: '📆', check: s => s.activeDays >= 1_500 },
  { key: 'active_days_2000', category: 'streaks', tier: 'diamond', emoji: '📅', check: s => s.activeDays >= 2_000 },
  { key: 'active_days_2500', category: 'streaks', tier: 'diamond', emoji: '🗓️', check: s => s.activeDays >= 2_500 },
  { key: 'active_days_3650', category: 'streaks', tier: 'diamond', emoji: '🎯', check: s => s.activeDays >= 1_200 }, // war 3650 (zehn Jahre)
  { key: 'months_active_48', category: 'streaks', tier: 'diamond', emoji: '📅', check: s => s.monthsActive >= 48 },
  { key: 'months_active_60', category: 'streaks', tier: 'diamond', emoji: '🏛️', check: s => s.monthsActive >= 42 }, // war 60 Monate
  { key: 'weeks_active_50', category: 'streaks', tier: 'gold', emoji: '📅', check: s => s.uniqueWeeksActive >= 50 },
  { key: 'weeks_active_100', category: 'streaks', tier: 'platinum', emoji: '📆', check: s => s.uniqueWeeksActive >= 100 },
  { key: 'weeks_active_150', category: 'streaks', tier: 'diamond', emoji: '🗓️', check: s => s.uniqueWeeksActive >= 150 },
  { key: 'weeks_active_200', category: 'streaks', tier: 'diamond', emoji: '🎯', check: s => s.uniqueWeeksActive >= 200 },
  { key: 'consec_months_active_6', category: 'streaks', tier: 'gold', emoji: '🔗', check: s => s.consecutiveMonthsActive >= 6 },
  { key: 'consec_months_active_12', category: 'streaks', tier: 'platinum', emoji: '⛓️', check: s => s.consecutiveMonthsActive >= 12 },
  { key: 'consec_months_active_24', category: 'streaks', tier: 'diamond', emoji: '🔒', check: s => s.consecutiveMonthsActive >= 24 },
  { key: 'consec_months_active_36', category: 'streaks', tier: 'diamond', emoji: '🔐', check: s => s.consecutiveMonthsActive >= 36 },
  { key: 'days_5_sessions_25', category: 'streaks', tier: 'diamond', emoji: '📊', check: s => s.daysAbove5Sessions >= 25 },

  // --- Cache extreme (456-470) ---
  { key: 'cache_tokens_1b', category: 'cache', tier: 'diamond', emoji: '💾', check: s => s.totalCacheReadTokens >= 1_000_000_000 },
  { key: 'cache_tokens_2b', category: 'cache', tier: 'diamond', emoji: '🗄️', check: s => s.totalCacheReadTokens >= 2_000_000_000 },
  { key: 'cache_tokens_5b', category: 'cache', tier: 'diamond', emoji: '🖲️', check: s => s.totalCacheReadTokens >= 5_000_000_000 },
  { key: 'cache_tokens_10b', category: 'cache', tier: 'diamond', emoji: '💽', check: s => s.totalCacheReadTokens >= 10_000_000_000 },
  { key: 'cache_and_tokens_100m', category: 'cache', tier: 'platinum', emoji: '🏎️', check: s => s.avgCacheRate >= 70 && s.totalTokens >= 100_000_000 },
  { key: 'cache_and_tokens_500m', category: 'cache', tier: 'diamond', emoji: '🚀', check: s => s.avgCacheRate >= 80 && s.totalTokens >= 500_000_000 },
  { key: 'cache_and_tokens_1b', category: 'cache', tier: 'diamond', emoji: '⚡', check: s => s.avgCacheRate >= 90 && s.totalTokens >= 1_000_000_000 },
  { key: 'cache_and_sessions_1k', category: 'cache', tier: 'diamond', emoji: '🔧', check: s => s.avgCacheRate >= 70 && s.totalSessions >= 1_000 },
  { key: 'cache_and_cost_1k', category: 'cache', tier: 'diamond', emoji: '💰', check: s => s.avgCacheRate >= 90 && s.totalCost >= 1_000 },
  { key: 'cache_master_90_100d', category: 'cache', tier: 'diamond', emoji: '🏅', check: s => s.avgCacheRate >= 90 && s.activeDays >= 100 },
  { key: 'cache_king_95_365d', category: 'cache', tier: 'diamond', emoji: '👑', check: s => s.avgCacheRate >= 95 && s.activeDays >= 365 },
  { key: 'cache_and_msgs_100k', category: 'cache', tier: 'diamond', emoji: '💬', check: s => s.avgCacheRate >= 80 && s.totalMessages >= 100_000 },
  { key: 'cache_and_msgs_500k', category: 'cache', tier: 'diamond', emoji: '🗨️', check: s => s.avgCacheRate >= 85 && s.totalMessages >= 500_000 },
  { key: 'cache_and_projects_50', category: 'cache', tier: 'diamond', emoji: '📂', check: s => s.avgCacheRate >= 80 && s.projectCount >= 50 },
  { key: 'cache_emperor', category: 'cache', tier: 'diamond', emoji: '🏆', check: s => s.avgCacheRate >= 95 && s.totalTokens >= 1_000_000_000 && s.activeDays >= 365 },

  // --- Special / Compound extreme (471-500) ---
  { key: 'full_weekend_100', category: 'special', tier: 'diamond', emoji: '🏖️', check: s => s.fullWeekendCount >= 100 },
  { key: 'full_weekend_200', category: 'special', tier: 'diamond', emoji: '⛱️', check: s => s.fullWeekendCount >= 200 },
  { key: 'consec_weekends_12', category: 'special', tier: 'diamond', emoji: '🎪', check: s => s.consecutiveFullWeekends >= 12 },
  { key: 'consec_weekends_26', category: 'special', tier: 'diamond', emoji: '🎡', check: s => s.consecutiveFullWeekends >= 26 },
  { key: 'consec_weekends_52', category: 'special', tier: 'diamond', emoji: '🎢', check: s => s.consecutiveFullWeekends >= 52 },
  { key: 'sunday_coder_50', category: 'special', tier: 'gold', emoji: '☕', check: s => s.sundaysActive >= 50 },
  { key: 'sunday_coder_100', category: 'special', tier: 'platinum', emoji: '🍵', check: s => s.sundaysActive >= 100 },
  { key: 'sunday_coder_200', category: 'special', tier: 'diamond', emoji: '🫖', check: s => s.sundaysActive >= 200 },
  { key: 'century_session_10', category: 'special', tier: 'platinum', emoji: '💯', check: s => s.sessionsAbove100Msgs >= 10 },
  { key: 'century_session_50', category: 'special', tier: 'diamond', emoji: '🏅', check: s => s.sessionsAbove100Msgs >= 50 },
  { key: 'century_session_100', category: 'special', tier: 'diamond', emoji: '🏆', check: s => s.sessionsAbove100Msgs >= 100 },
  { key: 'veteran_1y', category: 'special', tier: 'diamond', emoji: '🎖️', check: s => s.activeDays >= 365 && s.totalCost >= 500 },
  { key: 'veteran_2y', category: 'special', tier: 'diamond', emoji: '🏛️', check: s => s.activeDays >= 730 && s.totalCost >= 1_000 },
  { key: 'grandmaster', category: 'special', tier: 'diamond', emoji: '♟️', check: s => s.totalSessions >= 500 && s.totalMessages >= 50_000 && s.totalCost >= 500 },
  { key: 'unstoppable', category: 'special', tier: 'diamond', emoji: '🦾', check: s => s.longestStreak >= 100 && s.totalMessages >= 10_000 },
  { key: 'diverse_master', category: 'special', tier: 'diamond', emoji: '🌐', check: s => s.toolCount >= 20 && s.modelCount >= 5 && s.projectCount >= 50 },
  { key: 'code_factory', category: 'special', tier: 'diamond', emoji: '🏭', check: s => s.netLines >= 100_000 && s.totalSessions >= 500 },
  { key: 'token_billionaire', category: 'special', tier: 'diamond', emoji: '🤴', check: s => s.totalTokens >= 1_000_000_000 && s.totalCost >= 1_000 },
  { key: 'marathon_lord', category: 'special', tier: 'diamond', emoji: '👸', check: s => s.marathonSessions >= 100 && s.totalMessages >= 10_000 },
  { key: 'night_lord', category: 'special', tier: 'diamond', emoji: '🧛', check: s => s.nightOwlSessions >= 500 && s.marathonSessions >= 100 },
  { key: 'early_riser_elite', category: 'special', tier: 'diamond', emoji: '🐓', check: s => s.earlyBirdSessions >= 500 && s.totalMessages >= 50_000 },
  { key: 'project_empire', category: 'special', tier: 'diamond', emoji: '🌆', check: s => s.projectCount >= 100 && s.totalSessions >= 10_000 },
  { key: 'infinity_coder', category: 'special', tier: 'diamond', emoji: '♾️', check: s => s.totalTokens >= 500_000_000 && s.totalMessages >= 100_000 && s.totalCost >= 5_000 },
  { key: 'the_machine', category: 'special', tier: 'diamond', emoji: '🤖', check: s => s.totalTokens >= 10_000_000_000 && s.totalCost >= 10_000 },
  { key: 'all_rounder', category: 'special', tier: 'diamond', emoji: '🎪', check: s => s.allHoursCovered && s.allWeekdaysCovered && s.modelCount >= 5 && s.toolCount >= 20 },
  { key: 'opus_elite', category: 'special', tier: 'diamond', emoji: '🎭', check: s => s.modelMessages.opus >= 50_000 && s.totalCost >= 1_000 },
  { key: 'model_master', category: 'special', tier: 'diamond', emoji: '🎨', check: s => s.modelMessages.sonnet >= 10_000 && s.modelMessages.opus >= 10_000 && s.modelMessages.haiku >= 10_000 },
  { key: 'proj_above_100s_3', category: 'special', tier: 'diamond', emoji: '🏗️', check: s => s.projectsAbove100Sessions >= 3 },
  { key: 'multi_proj_day_20', category: 'special', tier: 'diamond', emoji: '🔄', check: s => s.maxProjectsInDay >= 20 },
  { key: 'sessions_500_msgs_5', category: 'special', tier: 'diamond', emoji: '🌪️', check: s => s.sessionsAbove500Msgs >= 5 },

  // =====================================================================
  // NEW CREATIVE ACHIEVEMENTS (501-700)
  // =====================================================================

  // --- Tokens creative (501-515) ---
  { key: 'cache_create_1m', category: 'tokens', tier: 'gold', emoji: '🏗️', check: s => s.totalCacheCreateTokens >= 1_000_000 },
  { key: 'cache_create_10m', category: 'tokens', tier: 'platinum', emoji: '🧱', check: s => s.totalCacheCreateTokens >= 10_000_000 },
  { key: 'cache_create_50m', category: 'tokens', tier: 'diamond', emoji: '🏰', check: s => s.totalCacheCreateTokens >= 50_000_000 },
  { key: 'cache_create_100m', category: 'tokens', tier: 'diamond', emoji: '🏯', check: s => s.totalCacheCreateTokens >= 100_000_000 },
  { key: 'cache_create_500m', category: 'tokens', tier: 'diamond', emoji: '🗼', check: s => s.totalCacheCreateTokens >= 500_000_000 },
  { key: 'avg_tokens_day_25m', category: 'tokens', tier: 'diamond', emoji: '🔢', check: s => s.avgTokensPerDay >= 25_000_000 },
  { key: 'avg_tokens_day_50m', category: 'tokens', tier: 'diamond', emoji: '🧮', check: s => s.avgTokensPerDay >= 50_000_000 },
  { key: 'tokens_per_msg_100k', category: 'tokens', tier: 'diamond', emoji: '📄', check: s => s.avgTokensPerMessage >= 100_000 },
  { key: 'tokens_25b', category: 'tokens', tier: 'diamond', emoji: '🪐', check: s => s.totalTokens >= 25_000_000_000 },
  { key: 'tokens_50b', category: 'tokens', tier: 'diamond', emoji: '🌍', check: s => s.totalTokens >= 50_000_000_000 },
  { key: 'output_5b', category: 'tokens', tier: 'diamond', emoji: '📡', check: s => s.totalOutputTokens >= 5_000_000_000 },
  { key: 'input_10b', category: 'tokens', tier: 'diamond', emoji: '📻', check: s => s.totalInputTokens >= 10_000_000_000 },
  { key: 'days_1m_tokens_10', category: 'tokens', tier: 'platinum', emoji: '🌡️', check: s => s.daysAbove1mTokens >= 10 },
  { key: 'days_1m_tokens_50', category: 'tokens', tier: 'diamond', emoji: '🔥', check: s => s.daysAbove1mTokens >= 50 },
  { key: 'days_1m_tokens_100', category: 'tokens', tier: 'diamond', emoji: '☄️', check: s => s.daysAbove1mTokens >= 100 },

  // --- Sessions creative (516-530) ---
  { key: 'avg_session_dur_30', category: 'sessions', tier: 'silver', emoji: '⏱️', check: s => s.avgSessionDurationMin >= 30 },
  { key: 'avg_session_dur_60', category: 'sessions', tier: 'gold', emoji: '⏰', check: s => s.avgSessionDurationMin >= 60 },
  { key: 'avg_session_dur_120', category: 'sessions', tier: 'platinum', emoji: '🕰️', check: s => s.avgSessionDurationMin >= 120 },
  { key: 'avg_session_dur_240', category: 'sessions', tier: 'diamond', emoji: '🕐', check: s => s.avgSessionDurationMin >= 240 },
  { key: 'short_sessions_10', category: 'sessions', tier: 'bronze', emoji: '⚡', check: s => s.shortSessions >= 10 },
  { key: 'short_sessions_50', category: 'sessions', tier: 'silver', emoji: '🏎️', check: s => s.shortSessions >= 50 },
  { key: 'short_sessions_100', category: 'sessions', tier: 'gold', emoji: '💨', check: s => s.shortSessions >= 100 },
  { key: 'short_sessions_500', category: 'sessions', tier: 'platinum', emoji: '🚀', check: s => s.shortSessions >= 500 },
  { key: 'sessions_per_day_3', category: 'sessions', tier: 'silver', emoji: '📊', check: s => s.sessionsPerActiveDay >= 3 },
  { key: 'sessions_per_day_5', category: 'sessions', tier: 'gold', emoji: '📈', check: s => s.sessionsPerActiveDay >= 5 },
  { key: 'sessions_per_day_10', category: 'sessions', tier: 'platinum', emoji: '📉', check: s => s.sessionsPerActiveDay >= 10 },
  { key: 'sessions_per_day_20', category: 'sessions', tier: 'diamond', emoji: '🎢', check: s => s.sessionsPerActiveDay >= 20 },
  { key: 'days_10_sessions_5', category: 'sessions', tier: 'gold', emoji: '📅', check: s => s.daysAbove10Sessions >= 5 },
  { key: 'days_10_sessions_25', category: 'sessions', tier: 'platinum', emoji: '📆', check: s => s.daysAbove10Sessions >= 25 },
  { key: 'days_10_sessions_100', category: 'sessions', tier: 'diamond', emoji: '🗓️', check: s => s.daysAbove10Sessions >= 100 },

  // --- Messages creative (531-545) ---
  { key: 'avg_msgs_day_200', category: 'messages', tier: 'platinum', emoji: '📬', check: s => s.avgMessagesPerDay >= 200 },
  { key: 'avg_msgs_day_400', category: 'messages', tier: 'diamond', emoji: '📮', check: s => s.avgMessagesPerDay >= 400 },
  { key: 'avg_msgs_day_750', category: 'messages', tier: 'diamond', emoji: '💌', check: s => s.avgMessagesPerDay >= 750 },
  { key: 'avg_msgs_day_1k', category: 'messages', tier: 'diamond', emoji: '✉️', check: s => s.avgMessagesPerDay >= 1_000 },
  { key: 'days_2k_msgs_1', category: 'messages', tier: 'platinum', emoji: '🔥', check: s => s.daysAbove2kMsgs >= 1 },
  { key: 'days_2k_msgs_5', category: 'messages', tier: 'diamond', emoji: '🌡️', check: s => s.daysAbove2kMsgs >= 5 },
  { key: 'days_2k_msgs_25', category: 'messages', tier: 'diamond', emoji: '☄️', check: s => s.daysAbove2kMsgs >= 25 },
  { key: 'busiest_month_5k', category: 'messages', tier: 'gold', emoji: '📅', check: s => s.busiestMonthMessages >= 5_000 },
  { key: 'busiest_month_10k', category: 'messages', tier: 'platinum', emoji: '📆', check: s => s.busiestMonthMessages >= 10_000 },
  { key: 'busiest_month_25k', category: 'messages', tier: 'diamond', emoji: '🗓️', check: s => s.busiestMonthMessages >= 25_000 },
  { key: 'busiest_month_50k', category: 'messages', tier: 'diamond', emoji: '🏆', check: s => s.busiestMonthMessages >= 50_000 },
  { key: 'messages_20k', category: 'messages', tier: 'gold', emoji: '📨', check: s => s.totalMessages >= 20_000 },
  { key: 'messages_25k', category: 'messages', tier: 'gold', emoji: '📩', check: s => s.totalMessages >= 25_000 },
  { key: 'messages_30k', category: 'messages', tier: 'platinum', emoji: '📫', check: s => s.totalMessages >= 30_000 },
  { key: 'messages_75k', category: 'messages', tier: 'diamond', emoji: '📪', check: s => s.totalMessages >= 75_000 },

  // --- Cost creative (546-560) ---
  { key: 'cost_1500', category: 'cost', tier: 'diamond', emoji: '💵', check: s => s.totalCost >= 1_500 },
  { key: 'cost_2000', category: 'cost', tier: 'diamond', emoji: '💶', check: s => s.totalCost >= 2_000 },
  { key: 'cost_3000', category: 'cost', tier: 'diamond', emoji: '💷', check: s => s.totalCost >= 3_000 },
  { key: 'cost_7500', category: 'cost', tier: 'diamond', emoji: '💴', check: s => s.totalCost >= 7_500 },
  { key: 'avg_cost_msg_01', category: 'cost', tier: 'silver', emoji: '💲', check: s => s.avgCostPerMessage >= 0.01 },
  { key: 'avg_cost_msg_05', category: 'cost', tier: 'gold', emoji: '💰', check: s => s.avgCostPerMessage >= 0.05 },
  { key: 'avg_cost_msg_10', category: 'cost', tier: 'platinum', emoji: '💸', check: s => s.avgCostPerMessage >= 0.10 },
  { key: 'avg_cost_msg_25', category: 'cost', tier: 'diamond', emoji: '🤑', check: s => s.avgCostPerMessage >= 0.25 },
  { key: 'cost_per_line_001', category: 'cost', tier: 'silver', emoji: '📝', check: s => s.totalLinesWritten > 0 && s.totalCost / s.totalLinesWritten >= 0.001 },
  { key: 'cost_per_line_005', category: 'cost', tier: 'gold', emoji: '📄', check: s => s.totalLinesWritten > 0 && s.totalCost / s.totalLinesWritten >= 0.005 },
  { key: 'cost_per_line_01', category: 'cost', tier: 'platinum', emoji: '📃', check: s => s.totalLinesWritten > 0 && s.totalCost / s.totalLinesWritten >= 0.01 },
  { key: 'cost_session_1500', category: 'cost', tier: 'diamond', emoji: '🏦', check: s => s.maxCostInSession >= 1_500 },
  { key: 'cost_day_150', category: 'cost', tier: 'diamond', emoji: '📊', check: s => s.maxDayCost >= 150 },
  { key: 'cost_day_200', category: 'cost', tier: 'diamond', emoji: '📈', check: s => s.maxDayCost >= 200 },
  { key: 'avg_cost_day_100', category: 'cost', tier: 'diamond', emoji: '💹', check: s => s.avgCostPerDay >= 100 },

  // --- Lines creative (561-575) ---
  { key: 'deletion_ratio_20', category: 'lines', tier: 'silver', emoji: '🧹', check: s => s.deletionRatio >= 0.2 },
  { key: 'deletion_ratio_40', category: 'lines', tier: 'gold', emoji: '🗑️', check: s => s.deletionRatio >= 0.4 },
  { key: 'deletion_ratio_60', category: 'lines', tier: 'platinum', emoji: '♻️', check: s => s.deletionRatio >= 0.6 },
  { key: 'deletion_ratio_80', category: 'lines', tier: 'diamond', emoji: '💥', check: s => s.deletionRatio >= 0.8 },
  { key: 'lines_per_msg_5', category: 'lines', tier: 'silver', emoji: '📝', check: s => s.linesPerMessage >= 5 },
  { key: 'lines_per_msg_10', category: 'lines', tier: 'gold', emoji: '📄', check: s => s.linesPerMessage >= 10 },
  { key: 'lines_per_msg_25', category: 'lines', tier: 'platinum', emoji: '📃', check: s => s.linesPerMessage >= 25 },
  { key: 'lines_per_msg_50', category: 'lines', tier: 'diamond', emoji: '📜', check: s => s.linesPerMessage >= 50 },
  { key: 'proj_lines_10k', category: 'lines', tier: 'gold', emoji: '📂', check: s => s.maxProjectLinesWritten >= 10_000 },
  { key: 'proj_lines_50k', category: 'lines', tier: 'platinum', emoji: '📁', check: s => s.maxProjectLinesWritten >= 50_000 },
  { key: 'proj_lines_100k', category: 'lines', tier: 'diamond', emoji: '🗂️', check: s => s.maxProjectLinesWritten >= 100_000 },
  { key: 'proj_lines_250k', category: 'lines', tier: 'diamond', emoji: '🏗️', check: s => s.maxProjectLinesWritten >= 250_000 },
  { key: 'lines_written_750k', category: 'lines', tier: 'diamond', emoji: '📋', check: s => s.totalLinesWritten >= 750_000 },
  { key: 'lines_edited_200k', category: 'lines', tier: 'diamond', emoji: '🔧', check: s => s.totalLinesAdded >= 200_000 },
  { key: 'lines_deleted_200k', category: 'lines', tier: 'diamond', emoji: '🧨', check: s => s.totalLinesRemoved >= 200_000 },

  // --- Models creative (576-587) ---
  { key: 'model_diversity_7', category: 'models', tier: 'diamond', emoji: '🎨', check: s => s.modelCount >= 7 },
  { key: 'model_diversity_8', category: 'models', tier: 'diamond', emoji: '🌈', check: s => s.modelCount >= 8 },
  { key: 'model_diversity_10', category: 'models', tier: 'diamond', emoji: '🪄', check: s => s.modelCount >= 10 },
  { key: 'model_sonnet_200k', category: 'models', tier: 'diamond', emoji: '🎵', check: s => s.modelMessages.sonnet >= 200_000 },
  { key: 'model_opus_200k', category: 'models', tier: 'diamond', emoji: '🎭', check: s => s.modelMessages.opus >= 200_000 },
  { key: 'model_haiku_100k', category: 'models', tier: 'diamond', emoji: '🌸', check: s => s.modelMessages.haiku >= 100_000 },
  { key: 'triple_model_day_100', category: 'models', tier: 'diamond', emoji: '🌈', check: s => s.tripleModelDayCount >= 100 },
  { key: 'model_loyal_sonnet_80', category: 'models', tier: 'platinum', emoji: '🎯', check: s => s.totalMessages > 0 && s.modelMessages.sonnet > s.totalMessages * 0.8 },
  { key: 'model_loyal_opus_80', category: 'models', tier: 'diamond', emoji: '👑', check: s => s.totalMessages > 0 && s.modelMessages.opus > s.totalMessages * 0.8 },
  { key: 'model_balanced', category: 'models', tier: 'platinum', emoji: '⚖️', check: s => s.modelMessages.sonnet > 0 && s.modelMessages.opus > 0 && Math.abs(s.modelMessages.sonnet - s.modelMessages.opus) < Math.max(s.modelMessages.sonnet, s.modelMessages.opus) * 0.2 },
  { key: 'model_opus_500k', category: 'models', tier: 'diamond', emoji: '🎺', check: s => s.modelMessages.opus >= 500_000 },
  { key: 'model_sonnet_500k', category: 'models', tier: 'diamond', emoji: '🎼', check: s => s.modelMessages.sonnet >= 500_000 },

  // --- Tools creative (588-602) ---
  { key: 'tool_diversity_35', category: 'tools', tier: 'diamond', emoji: '🧰', check: s => s.toolCount >= 35 },
  { key: 'tool_diversity_40', category: 'tools', tier: 'diamond', emoji: '🛠️', check: s => s.toolCount >= 40 },
  { key: 'avg_tools_session_50', category: 'tools', tier: 'silver', emoji: '🔨', check: s => s.avgToolCallsPerSession >= 50 },
  { key: 'avg_tools_session_100', category: 'tools', tier: 'gold', emoji: '⚒️', check: s => s.avgToolCallsPerSession >= 100 },
  { key: 'avg_tools_session_250', category: 'tools', tier: 'platinum', emoji: '🪓', check: s => s.avgToolCallsPerSession >= 250 },
  { key: 'avg_tools_session_500', category: 'tools', tier: 'diamond', emoji: '⛏️', check: s => s.avgToolCallsPerSession >= 500 },
  { key: 'read_write_ratio_3', category: 'tools', tier: 'silver', emoji: '📖', check: s => s.toolReadWriteRatio >= 3 },
  { key: 'read_write_ratio_5', category: 'tools', tier: 'gold', emoji: '📗', check: s => s.toolReadWriteRatio >= 5 },
  { key: 'read_write_ratio_10', category: 'tools', tier: 'platinum', emoji: '📚', check: s => s.toolReadWriteRatio >= 10 },
  { key: 'tool_mcp_user', category: 'tools', tier: 'gold', emoji: '🔌', check: s => s.toolNames.has('mcp__') || [...s.toolNames].some(t => t.startsWith('mcp__')) },
  { key: 'tool_notebook_edit', category: 'tools', tier: 'silver', emoji: '📓', check: s => s.toolNames.has('NotebookEdit') },
  { key: 'tool_web_search', category: 'tools', tier: 'silver', emoji: '🌐', check: s => s.toolNames.has('WebSearch') },
  { key: 'tool_web_fetch', category: 'tools', tier: 'silver', emoji: '🕸️', check: s => s.toolNames.has('WebFetch') },
  { key: 'tool_10m_calls', category: 'tools', tier: 'diamond', emoji: '⚡', check: s => s.totalToolCalls >= 10_000_000 },
  { key: 'tool_bash_1m', category: 'tools', tier: 'diamond', emoji: '💻', check: s => (s.toolCallsByName.Bash || 0) >= 1_000_000 },

  // --- Time creative (603-617) ---
  { key: 'afternoon_coder_50', category: 'time', tier: 'gold', emoji: '☀️', check: s => s.afternoonSessions >= 50 },
  { key: 'afternoon_coder_200', category: 'time', tier: 'platinum', emoji: '🌤️', check: s => s.afternoonSessions >= 200 },
  { key: 'afternoon_coder_500', category: 'time', tier: 'diamond', emoji: '🌞', check: s => s.afternoonSessions >= 500 },
  { key: 'evening_coder_50', category: 'time', tier: 'gold', emoji: '🌆', check: s => s.eveningSessions >= 50 },
  { key: 'evening_coder_200', category: 'time', tier: 'platinum', emoji: '🌇', check: s => s.eveningSessions >= 200 },
  { key: 'evening_coder_500', category: 'time', tier: 'diamond', emoji: '🌃', check: s => s.eveningSessions >= 500 },
  { key: 'total_hours_1k', category: 'time', tier: 'diamond', emoji: '⏳', check: s => s.totalSessionHours >= 1_000 },
  { key: 'total_hours_5k', category: 'time', tier: 'diamond', emoji: '⌛', check: s => s.totalSessionHours >= 5_000 },
  { key: 'weekday_sessions_100', category: 'time', tier: 'gold', emoji: '💼', check: s => s.weekdaySessionCount >= 100 },
  { key: 'weekday_sessions_500', category: 'time', tier: 'platinum', emoji: '🏢', check: s => s.weekdaySessionCount >= 500 },
  { key: 'weekday_sessions_1k', category: 'time', tier: 'diamond', emoji: '🏛️', check: s => s.weekdaySessionCount >= 1_000 },
  { key: 'saturday_warrior_10', category: 'time', tier: 'silver', emoji: '🏖️', check: s => s.saturdaysActive >= 10 },
  { key: 'saturday_warrior_50', category: 'time', tier: 'gold', emoji: '⛱️', check: s => s.saturdaysActive >= 50 },
  { key: 'saturday_warrior_100', category: 'time', tier: 'platinum', emoji: '🏝️', check: s => s.saturdaysActive >= 100 },
  { key: 'weekend_streak_5', category: 'time', tier: 'gold', emoji: '🔗', check: s => s.weekendStreakMax >= 5 },

  // --- Projects creative (618-632) ---
  { key: 'proj_above_500_msgs_3', category: 'projects', tier: 'gold', emoji: '📂', check: s => s.projectsAbove500Msgs >= 3 },
  { key: 'proj_above_500_msgs_5', category: 'projects', tier: 'platinum', emoji: '📁', check: s => s.projectsAbove500Msgs >= 5 },
  { key: 'proj_above_500_msgs_10', category: 'projects', tier: 'diamond', emoji: '🗂️', check: s => s.projectsAbove500Msgs >= 10 },
  { key: 'proj_above_5k_msgs_1', category: 'projects', tier: 'gold', emoji: '💬', check: s => s.projectsAbove5kMsgs >= 1 },
  { key: 'proj_above_5k_msgs_3', category: 'projects', tier: 'platinum', emoji: '🗨️', check: s => s.projectsAbove5kMsgs >= 3 },
  { key: 'proj_above_5k_msgs_5', category: 'projects', tier: 'diamond', emoji: '📨', check: s => s.projectsAbove5kMsgs >= 5 },
  { key: 'proj_diversity_week_3', category: 'projects', tier: 'silver', emoji: '🔀', check: s => s.projectDiversityPerWeek >= 3 },
  { key: 'proj_diversity_week_5', category: 'projects', tier: 'gold', emoji: '🔄', check: s => s.projectDiversityPerWeek >= 5 },
  { key: 'proj_diversity_week_10', category: 'projects', tier: 'platinum', emoji: '🌀', check: s => s.projectDiversityPerWeek >= 10 },
  { key: 'proj_diversity_week_15', category: 'projects', tier: 'diamond', emoji: '🎡', check: s => s.projectDiversityPerWeek >= 15 },
  { key: 'proj_tokens_500m', category: 'projects', tier: 'diamond', emoji: '🔢', check: s => s.maxProjectTokens >= 500_000_000 },
  { key: 'proj_tokens_1b', category: 'projects', tier: 'diamond', emoji: '🧮', check: s => s.maxProjectTokens >= 1_000_000_000 },
  { key: 'proj_cost_10k', category: 'projects', tier: 'diamond', emoji: '🤑', check: s => s.maxProjectCost >= 10_000 },
  { key: 'proj_sessions_2k', category: 'projects', tier: 'diamond', emoji: '🏢', check: s => s.maxProjectSessions >= 2_000 },
  { key: 'project_35', category: 'projects', tier: 'platinum', emoji: '🏘️', check: s => s.projectCount >= 35 },

  // --- Streaks creative (633-647) ---
  { key: 'streak_21', category: 'streaks', tier: 'gold', emoji: '🔥', check: s => s.longestStreak >= 21 },
  { key: 'streak_45', category: 'streaks', tier: 'platinum', emoji: '🌟', check: s => s.longestStreak >= 45 },
  { key: 'streak_250', category: 'streaks', tier: 'diamond', emoji: '💫', check: s => s.longestStreak >= 250 },
  { key: 'weekend_streak_10', category: 'streaks', tier: 'platinum', emoji: '🔗', check: s => s.weekendStreakMax >= 10 },
  { key: 'weekend_streak_20', category: 'streaks', tier: 'diamond', emoji: '⛓️', check: s => s.weekendStreakMax >= 20 },
  { key: 'weekend_streak_50', category: 'streaks', tier: 'diamond', emoji: '🔒', check: s => s.weekendStreakMax >= 50 },
  { key: 'consec_months_active_48', category: 'streaks', tier: 'diamond', emoji: '🔐', check: s => s.consecutiveMonthsActive >= 48 },
  { key: 'weeks_active_250', category: 'streaks', tier: 'diamond', emoji: '🗓️', check: s => s.uniqueWeeksActive >= 250 },
  { key: 'active_days_50', category: 'streaks', tier: 'gold', emoji: '📅', check: s => s.activeDays >= 50 },
  { key: 'active_days_75', category: 'streaks', tier: 'gold', emoji: '📆', check: s => s.activeDays >= 75 },
  { key: 'active_days_150', category: 'streaks', tier: 'platinum', emoji: '🎯', check: s => s.activeDays >= 150 },
  { key: 'active_days_250', category: 'streaks', tier: 'platinum', emoji: '🏆', check: s => s.activeDays >= 250 },
  { key: 'days_5_sessions_10', category: 'streaks', tier: 'gold', emoji: '📊', check: s => s.daysAbove5Sessions >= 10 },
  { key: 'days_5_sessions_50', category: 'streaks', tier: 'platinum', emoji: '📈', check: s => s.daysAbove5Sessions >= 50 },
  { key: 'months_active_3', category: 'streaks', tier: 'silver', emoji: '📅', check: s => s.monthsActive >= 3 },

  // --- Cache creative (648-659) ---
  { key: 'cache_create_1b', category: 'cache', tier: 'diamond', emoji: '🏗️', check: s => s.totalCacheCreateTokens >= 1_000_000_000 },
  { key: 'cache_rate_60', category: 'cache', tier: 'silver', emoji: '💾', check: s => s.avgCacheRate >= 60 },
  { key: 'cache_rate_75', category: 'cache', tier: 'gold', emoji: '🗄️', check: s => s.avgCacheRate >= 75 },
  { key: 'cache_rate_85', category: 'cache', tier: 'platinum', emoji: '🏎️', check: s => s.avgCacheRate >= 85 },
  { key: 'cache_and_lines_100k', category: 'cache', tier: 'platinum', emoji: '📝', check: s => s.avgCacheRate >= 80 && s.totalLinesWritten >= 100_000 },
  { key: 'cache_and_lines_500k', category: 'cache', tier: 'diamond', emoji: '📄', check: s => s.avgCacheRate >= 85 && s.totalLinesWritten >= 500_000 },
  { key: 'cache_and_streak_30', category: 'cache', tier: 'platinum', emoji: '🔥', check: s => s.avgCacheRate >= 80 && s.longestStreak >= 30 },
  { key: 'cache_and_tools_50k', category: 'cache', tier: 'platinum', emoji: '🔧', check: s => s.avgCacheRate >= 80 && s.totalToolCalls >= 50_000 },
  { key: 'cache_and_tools_250k', category: 'cache', tier: 'diamond', emoji: '⚙️', check: s => s.avgCacheRate >= 85 && s.totalToolCalls >= 250_000 },
  { key: 'cache_and_marathon_50', category: 'cache', tier: 'diamond', emoji: '🏃', check: s => s.avgCacheRate >= 80 && s.marathonSessions >= 50 },
  { key: 'cache_and_models_5', category: 'cache', tier: 'platinum', emoji: '🌈', check: s => s.avgCacheRate >= 80 && s.modelCount >= 5 },
  { key: 'cache_tokens_250m', category: 'cache', tier: 'diamond', emoji: '💽', check: s => s.totalCacheReadTokens >= 250_000_000 },

  // --- Special creative (660-677) ---
  { key: 'valentines_coder', category: 'special', tier: 'gold', emoji: '💝', check: s => s.codedOnValentines },
  { key: 'april_fools_coder', category: 'special', tier: 'gold', emoji: '🃏', check: s => s.codedOnAprilFools },
  { key: 'may_day_coder', category: 'special', tier: 'gold', emoji: '🌷', check: s => s.codedOnMayDay },
  { key: 'groundhog_coder', category: 'special', tier: 'gold', emoji: '🦫', check: s => s.codedOnGroundhogDay },
  { key: 'earth_day_coder', category: 'special', tier: 'gold', emoji: '🌍', check: s => s.codedOnEarthDay },
  { key: 'towel_day_coder', category: 'special', tier: 'gold', emoji: '🐬', check: s => s.codedOnTowelDay },
  { key: 'programmers_day', category: 'special', tier: 'platinum', emoji: '💻', check: s => s.codedOnProgrammersDay },
  { key: 'sysadmin_day', category: 'special', tier: 'platinum', emoji: '🖥️', check: s => s.codedOnSysAdminDay },
  { key: 'polyglot_tools', category: 'special', tier: 'diamond', emoji: '🌐', check: s => s.toolCount >= 15 && s.modelCount >= 4 && s.projectCount >= 20 },
  { key: 'big_spender_fast', category: 'special', tier: 'diamond', emoji: '🤑', check: s => s.totalCost >= 1_000 && s.activeDays <= 30 },
  { key: 'productive_weekend', category: 'special', tier: 'gold', emoji: '🏖️', check: s => s.weekendSessionCount >= 10 && s.totalLinesWritten >= 10_000 },
  { key: 'token_marathon', category: 'special', tier: 'diamond', emoji: '🏃‍♂️', check: s => s.maxDayTokens >= 50_000_000 && s.marathonSessions >= 10 },
  { key: 'silent_grinder', category: 'special', tier: 'platinum', emoji: '🥷', check: s => s.totalMessages >= 10_000 && s.activeDays >= 30 && s.longestStreak >= 14 },
  { key: 'opus_whale', category: 'special', tier: 'diamond', emoji: '🐋', check: s => s.modelMessages.opus >= 10_000 && s.totalCost >= 2_000 },
  { key: 'speed_demon', category: 'special', tier: 'platinum', emoji: '⚡', check: s => s.avgMessagesPerDay >= 500 && s.shortSessions >= 50 },
  { key: 'the_architect', category: 'special', tier: 'diamond', emoji: '🏛️', check: s => s.totalLinesWritten >= 100_000 && s.projectCount >= 25 && s.totalSessions >= 100 },
  { key: 'cost_efficient', category: 'special', tier: 'platinum', emoji: '🎯', check: s => s.totalLinesWritten >= 50_000 && s.totalCost > 0 && s.totalLinesWritten / s.totalCost >= 500 },
  { key: 'midnight_oil', category: 'special', tier: 'gold', emoji: '🕯️', check: s => s.nightOwlSessions >= 25 && s.earlyBirdSessions >= 25 },

  // --- Efficiency (NEW category, 678-692) ---
  { key: 'tokens_per_dollar_1m', category: 'efficiency', tier: 'bronze', emoji: '📊', check: s => s.tokensPerDollar >= 1_000_000 },
  { key: 'tokens_per_dollar_2m', category: 'efficiency', tier: 'silver', emoji: '📈', check: s => s.tokensPerDollar >= 2_000_000 },
  { key: 'tokens_per_dollar_5m', category: 'efficiency', tier: 'gold', emoji: '📉', check: s => s.tokensPerDollar >= 5_000_000 },
  { key: 'tokens_per_dollar_10m', category: 'efficiency', tier: 'platinum', emoji: '💹', check: s => s.tokensPerDollar >= 10_000_000 },
  { key: 'tokens_per_dollar_25m', category: 'efficiency', tier: 'diamond', emoji: '🏆', check: s => s.tokensPerDollar >= 25_000_000 },
  { key: 'lines_per_dollar_50', category: 'efficiency', tier: 'bronze', emoji: '📝', check: s => s.linesPerDollar >= 50 },
  { key: 'lines_per_dollar_100', category: 'efficiency', tier: 'silver', emoji: '📄', check: s => s.linesPerDollar >= 100 },
  { key: 'lines_per_dollar_250', category: 'efficiency', tier: 'gold', emoji: '📃', check: s => s.linesPerDollar >= 250 },
  { key: 'lines_per_dollar_500', category: 'efficiency', tier: 'platinum', emoji: '📜', check: s => s.linesPerDollar >= 500 },
  { key: 'lines_per_dollar_1k', category: 'efficiency', tier: 'diamond', emoji: '📋', check: s => s.linesPerDollar >= 1_000 },
  { key: 'msgs_per_session_50', category: 'efficiency', tier: 'gold', emoji: '💬', check: s => s.messagesPerSession >= 50 },
  { key: 'msgs_per_session_100', category: 'efficiency', tier: 'platinum', emoji: '🗨️', check: s => s.messagesPerSession >= 100 },
  { key: 'msgs_per_session_200', category: 'efficiency', tier: 'diamond', emoji: '📨', check: s => s.messagesPerSession >= 200 },
  { key: 'efficient_combo', category: 'efficiency', tier: 'platinum', emoji: '🎯', check: s => s.avgCacheRate >= 80 && s.tokensPerDollar >= 2_000_000 && s.linesPerDollar >= 100 },
  { key: 'hyper_efficient', category: 'efficiency', tier: 'diamond', emoji: '⚡', check: s => s.avgCacheRate >= 90 && s.tokensPerDollar >= 5_000_000 && s.linesPerDollar >= 250 },

  // --- Rate Limits (NEW category, 693-700) ---
  { key: 'rate_limit_1', category: 'ratelimits', tier: 'bronze', emoji: '🚦', check: s => s.totalRateLimitHits >= 1 },
  { key: 'rate_limit_5', category: 'ratelimits', tier: 'silver', emoji: '🚧', check: s => s.totalRateLimitHits >= 5 },
  { key: 'rate_limit_10', category: 'ratelimits', tier: 'gold', emoji: '⛔', check: s => s.totalRateLimitHits >= 10 },
  { key: 'rate_limit_25', category: 'ratelimits', tier: 'gold', emoji: '🛑', check: s => s.totalRateLimitHits >= 25 },
  { key: 'rate_limit_50', category: 'ratelimits', tier: 'platinum', emoji: '🔴', check: s => s.totalRateLimitHits >= 50 },
  { key: 'rate_limit_100', category: 'ratelimits', tier: 'platinum', emoji: '🚨', check: s => s.totalRateLimitHits >= 100 },
  { key: 'rate_limit_250', category: 'ratelimits', tier: 'diamond', emoji: '🆘', check: s => s.totalRateLimitHits >= 250 },
  { key: 'rate_limit_500', category: 'ratelimits', tier: 'diamond', emoji: '💀', check: s => s.totalRateLimitHits >= 500 },

  // ===========================================================================
  // Wave 2 — 500 achievements added 2026-08-30.
  //
  // Every threshold is DERIVED from the real history at the time of writing
  // (208 active days: 248k messages, 80.6B tokens, $59k, 3,474 sessions,
  // 1,734 hours of real work) as "today + measured rate x horizon", so
  // "hard but achievable" is a measurement rather than a guess. All 500 were
  // locked at introduction; the nearest sit about three weeks of work away,
  // the furthest about twenty months.
  //
  // Time-based entries here use activeMin (gap-capped real work), NOT the
  // durationMin the first wave used — that one counts idle time and was
  // inflated 36x on real data. The two are deliberately never mixed.
  // ===========================================================================

  // --- wave 2: time ---
  { key: 'deep_hours_2k', category: 'time', tier: 'gold', emoji: '🪵', check: s => s.totalActiveHours >= 2000 },
  { key: 'deep_hours_2p5k', category: 'time', tier: 'platinum', emoji: '🔨', check: s => s.totalActiveHours >= 2500 },
  { key: 'deep_hours_3k', category: 'time', tier: 'platinum', emoji: '⚒️', check: s => s.totalActiveHours >= 3000 },
  { key: 'deep_hours_4k', category: 'time', tier: 'diamond', emoji: '🏗️', check: s => s.totalActiveHours >= 4000 },
  { key: 'deep_hours_4p5k', category: 'time', tier: 'diamond', emoji: '⛏️', check: s => s.totalActiveHours >= 4500 },
  { key: 'deep_hours_5k', category: 'time', tier: 'diamond', emoji: '🔥', check: s => s.totalActiveHours >= 5000 },
  { key: 'deep_hours_6k', category: 'time', tier: 'diamond', emoji: '🏭', check: s => s.totalActiveHours >= 6000 },
  { key: 'deep_session_7k', category: 'time', tier: 'gold', emoji: '🎯', check: s => s.maxSessionActiveMin >= 7000 },
  { key: 'deep_session_9k', category: 'time', tier: 'platinum', emoji: '🧗', check: s => s.maxSessionActiveMin >= 9000 },
  { key: 'deep_session_12k', category: 'time', tier: 'diamond', emoji: '🏔️', check: s => s.maxSessionActiveMin >= 12000 },
  { key: 'deep_session_15k', category: 'time', tier: 'diamond', emoji: '🚀', check: s => s.maxSessionActiveMin >= 15000 },
  { key: 'deep_session_17p5k', category: 'time', tier: 'diamond', emoji: '🛰️', check: s => s.maxSessionActiveMin >= 17500 },
  { key: 'deep_session_25k', category: 'time', tier: 'diamond', emoji: '🌌', check: s => s.maxSessionActiveMin >= 25000 },
  { key: 'deep_sess_2h_150', category: 'time', tier: 'gold', emoji: '📗', check: s => s.deepSessions_2h >= 150 },
  { key: 'deep_sess_2h_200', category: 'time', tier: 'platinum', emoji: '📘', check: s => s.deepSessions_2h >= 200 },
  { key: 'deep_sess_2h_250', category: 'time', tier: 'diamond', emoji: '📙', check: s => s.deepSessions_2h >= 250 },
  { key: 'deep_sess_2h_300', category: 'time', tier: 'diamond', emoji: '📕', check: s => s.deepSessions_2h >= 300 },
  { key: 'deep_sess_2h_350', category: 'time', tier: 'diamond', emoji: '📚', check: s => s.deepSessions_2h >= 350 },
  { key: 'deep_sess_2h_450', category: 'time', tier: 'diamond', emoji: '🗄️', check: s => s.deepSessions_2h >= 450 },
  { key: 'deep_sess_4h_80', category: 'time', tier: 'gold', emoji: '🕓', check: s => s.deepSessions_4h >= 80 },
  { key: 'deep_sess_4h_100', category: 'time', tier: 'platinum', emoji: '🕗', check: s => s.deepSessions_4h >= 100 },
  { key: 'deep_sess_4h_120', category: 'time', tier: 'platinum', emoji: '⏳', check: s => s.deepSessions_4h >= 120 },
  { key: 'deep_sess_4h_150', category: 'time', tier: 'diamond', emoji: '⌛', check: s => s.deepSessions_4h >= 150 },
  { key: 'deep_sess_4h_200', category: 'time', tier: 'diamond', emoji: '🧭', check: s => s.deepSessions_4h >= 200 },
  { key: 'deep_sess_4h_250', category: 'time', tier: 'diamond', emoji: '🎖️', check: s => s.deepSessions_4h >= 250 },
  { key: 'deep_sess_8h_50', category: 'time', tier: 'gold', emoji: '🌅', check: s => s.deepSessions_8h >= 50 },
  { key: 'deep_sess_8h_70', category: 'time', tier: 'platinum', emoji: '🌇', check: s => s.deepSessions_8h >= 70 },
  { key: 'deep_sess_8h_90', category: 'time', tier: 'diamond', emoji: '🌃', check: s => s.deepSessions_8h >= 90 },
  { key: 'deep_sess_8h_120', category: 'time', tier: 'diamond', emoji: '🌌', check: s => s.deepSessions_8h >= 120 },
  { key: 'deep_sess_8h_150', category: 'time', tier: 'diamond', emoji: '💫', check: s => s.deepSessions_8h >= 150 },
  { key: 'deep_day_peak_8k', category: 'time', tier: 'gold', emoji: '☀️', check: s => s.maxDayActiveMin >= 8000 },
  { key: 'deep_day_peak_10k', category: 'time', tier: 'platinum', emoji: '🔆', check: s => s.maxDayActiveMin >= 10000 },
  { key: 'deep_day_peak_15k', category: 'time', tier: 'diamond', emoji: '🌞', check: s => s.maxDayActiveMin >= 15000 },
  { key: 'deep_day_peak_17p5k', category: 'time', tier: 'diamond', emoji: '🔥', check: s => s.maxDayActiveMin >= 17500 },
  { key: 'deep_day_peak_25k', category: 'time', tier: 'diamond', emoji: '☄️', check: s => s.maxDayActiveMin >= 25000 },
  { key: 'deep_days_4h_90', category: 'time', tier: 'gold', emoji: '📆', check: s => s.deepDays_4h >= 90 },
  { key: 'deep_days_4h_120', category: 'time', tier: 'platinum', emoji: '🗓️', check: s => s.deepDays_4h >= 120 },
  { key: 'deep_days_4h_150', category: 'time', tier: 'diamond', emoji: '📅', check: s => s.deepDays_4h >= 150 },
  { key: 'deep_days_4h_175', category: 'time', tier: 'diamond', emoji: '🧱', check: s => s.deepDays_4h >= 175 },
  { key: 'deep_days_4h_200', category: 'time', tier: 'diamond', emoji: '🏢', check: s => s.deepDays_4h >= 200 },
  { key: 'deep_days_4h_250', category: 'time', tier: 'diamond', emoji: '🏙️', check: s => s.deepDays_4h >= 250 },
  { key: 'deep_days_4h_300', category: 'time', tier: 'diamond', emoji: '🌆', check: s => s.deepDays_4h >= 300 },
  { key: 'deep_days_8h_60', category: 'time', tier: 'gold', emoji: '⚙️', check: s => s.deepDays_8h >= 60 },
  { key: 'deep_days_8h_80', category: 'time', tier: 'platinum', emoji: '🛠️', check: s => s.deepDays_8h >= 80 },
  { key: 'deep_days_8h_90', category: 'time', tier: 'platinum', emoji: '🏗️', check: s => s.deepDays_8h >= 90 },
  { key: 'deep_days_8h_120', category: 'time', tier: 'diamond', emoji: '🧰', check: s => s.deepDays_8h >= 120 },
  { key: 'deep_days_8h_150', category: 'time', tier: 'diamond', emoji: '🔧', check: s => s.deepDays_8h >= 150 },
  { key: 'deep_days_8h_175', category: 'time', tier: 'diamond', emoji: '🦾', check: s => s.deepDays_8h >= 175 },
  { key: 'cmb_endure_1', category: 'time', tier: 'gold', emoji: '🧗', check: s => s.totalActiveHours >= 3000 && s.deepDays_4h >= 150 },
  { key: 'cmb_endure_2', category: 'time', tier: 'platinum', emoji: '🏔️', check: s => s.totalActiveHours >= 4000 && s.deepDays_4h >= 200 },
  { key: 'cmb_endure_3', category: 'time', tier: 'platinum', emoji: '🗻', check: s => s.totalActiveHours >= 6000 && s.deepDays_4h >= 250 },
  { key: 'cmb_endure_4', category: 'time', tier: 'diamond', emoji: '🌋', check: s => s.totalActiveHours >= 8000 && s.deepDays_4h >= 400 },
  { key: 'cmb_endure_5', category: 'time', tier: 'diamond', emoji: '🏆', check: s => s.totalActiveHours >= 15000 && s.deepDays_4h >= 500 },
  { key: 'cmb_deep_streak_1', category: 'time', tier: 'gold', emoji: '🔥', check: s => s.deepSessions_8h >= 80 && s.longestStreak >= 80 },
  { key: 'cmb_deep_streak_2', category: 'time', tier: 'platinum', emoji: '🌟', check: s => s.deepSessions_8h >= 100 && s.longestStreak >= 150 },
  { key: 'cmb_deep_streak_3', category: 'time', tier: 'platinum', emoji: '💫', check: s => s.deepSessions_8h >= 150 && s.longestStreak >= 150 },
  { key: 'cmb_deep_streak_4', category: 'time', tier: 'diamond', emoji: '☄️', check: s => s.deepSessions_8h >= 200 && s.longestStreak >= 150 },
  { key: 'cmb_deep_streak_5', category: 'time', tier: 'diamond', emoji: '🌌', check: s => s.deepSessions_8h >= 300 && s.longestStreak >= 150 },
  { key: 'lm_hours_5000', category: 'time', tier: 'platinum', emoji: '⏳', check: s => s.totalActiveHours >= 5_000 },
  { key: 'lm_hours_10000', category: 'time', tier: 'diamond', emoji: '🧠', check: s => s.totalActiveHours >= 10_000 },
  { key: 'avg_active_session_45', category: 'time', tier: 'gold', emoji: '🎯', check: s => s.avgActiveMinPerSession >= 45 },
  { key: 'avg_active_session_60', category: 'time', tier: 'platinum', emoji: '🧘', check: s => s.avgActiveMinPerSession >= 60 },
  { key: 'avg_active_session_90', category: 'time', tier: 'diamond', emoji: '🕉️', check: s => s.avgActiveMinPerSession >= 90 },

  // --- wave 2: tokens ---
  { key: 'tok2_90b', category: 'tokens', tier: 'gold', emoji: '🌊', check: s => s.totalTokens >= 90000000000 },
  { key: 'tok2_120b', category: 'tokens', tier: 'platinum', emoji: '🌀', check: s => s.totalTokens >= 120000000000 },
  { key: 'tok2_150b', category: 'tokens', tier: 'diamond', emoji: '🌪️', check: s => s.totalTokens >= 150000000000 },
  { key: 'tok2_175b', category: 'tokens', tier: 'diamond', emoji: '🌋', check: s => s.totalTokens >= 175000000000 },
  { key: 'tok2_200b', category: 'tokens', tier: 'diamond', emoji: '☄️', check: s => s.totalTokens >= 200000000000 },
  { key: 'tok2_250b', category: 'tokens', tier: 'diamond', emoji: '🪐', check: s => s.totalTokens >= 250000000000 },
  { key: 'tok2_300b', category: 'tokens', tier: 'diamond', emoji: '🌠', check: s => s.totalTokens >= 300000000000 },
  { key: 'out2_200m', category: 'tokens', tier: 'gold', emoji: '🖊️', check: s => s.totalOutputTokens >= 200000000 },
  { key: 'out2_250m', category: 'tokens', tier: 'platinum', emoji: '✒️', check: s => s.totalOutputTokens >= 250000000 },
  { key: 'out2_300m', category: 'tokens', tier: 'diamond', emoji: '🖋️', check: s => s.totalOutputTokens >= 300000000 },
  { key: 'out2_350m', category: 'tokens', tier: 'diamond', emoji: '📜', check: s => s.totalOutputTokens >= 350000000 },
  { key: 'out2_400m', category: 'tokens', tier: 'diamond', emoji: '📖', check: s => s.totalOutputTokens >= 400000000 },
  { key: 'out2_500m', category: 'tokens', tier: 'diamond', emoji: '📚', check: s => s.totalOutputTokens >= 500000000 },
  { key: 'out2_600m', category: 'tokens', tier: 'diamond', emoji: '🏺', check: s => s.totalOutputTokens >= 600000000 },
  { key: 'inp2_9m', category: 'tokens', tier: 'gold', emoji: '👂', check: s => s.totalInputTokens >= 9000000 },
  { key: 'inp2_10m', category: 'tokens', tier: 'platinum', emoji: '🎧', check: s => s.totalInputTokens >= 10000000 },
  { key: 'inp2_12m', category: 'tokens', tier: 'platinum', emoji: '📡', check: s => s.totalInputTokens >= 12000000 },
  { key: 'inp2_15m', category: 'tokens', tier: 'diamond', emoji: '🔭', check: s => s.totalInputTokens >= 15000000 },
  { key: 'inp2_17p5m', category: 'tokens', tier: 'diamond', emoji: '🛰️', check: s => s.totalInputTokens >= 17500000 },
  { key: 'inp2_25m', category: 'tokens', tier: 'diamond', emoji: '🌐', check: s => s.totalInputTokens >= 25000000 },
  { key: 'ccw2_1p75b', category: 'tokens', tier: 'gold', emoji: '📦', check: s => s.totalCacheCreateTokens >= 1750000000 },
  { key: 'ccw2_2b', category: 'tokens', tier: 'platinum', emoji: '🗃️', check: s => s.totalCacheCreateTokens >= 2000000000 },
  { key: 'ccw2_2p5b', category: 'tokens', tier: 'platinum', emoji: '🏬', check: s => s.totalCacheCreateTokens >= 2500000000 },
  { key: 'ccw2_3b', category: 'tokens', tier: 'diamond', emoji: '🏭', check: s => s.totalCacheCreateTokens >= 3000000000 },
  { key: 'ccw2_3p5b', category: 'tokens', tier: 'diamond', emoji: '🗄️', check: s => s.totalCacheCreateTokens >= 3500000000 },
  { key: 'ccw2_4b', category: 'tokens', tier: 'diamond', emoji: '🏛️', check: s => s.totalCacheCreateTokens >= 4000000000 },
  { key: 'ccw2_5b', category: 'tokens', tier: 'diamond', emoji: '🌋', check: s => s.totalCacheCreateTokens >= 5000000000 },
  { key: 'lm_tokens_100b', category: 'tokens', tier: 'platinum', emoji: '🌌', check: s => s.totalTokens >= 100_000_000_000 },
  { key: 'lm_tokens_250b', category: 'tokens', tier: 'diamond', emoji: '🪐', check: s => s.totalTokens >= 250_000_000_000 },
  { key: 'lm_tokens_500b', category: 'tokens', tier: 'diamond', emoji: '✴️', check: s => s.totalTokens >= 500_000_000_000 },
  { key: 'lm_tokens_1t', category: 'tokens', tier: 'diamond', emoji: '🌠', check: s => s.totalTokens >= 1_000_000_000_000 },

  // --- wave 2: messages ---
  { key: 'msg2_300k', category: 'messages', tier: 'gold', emoji: '🗣️', check: s => s.totalMessages >= 300000 },
  { key: 'msg2_350k', category: 'messages', tier: 'platinum', emoji: '📢', check: s => s.totalMessages >= 350000 },
  { key: 'msg2_400k', category: 'messages', tier: 'platinum', emoji: '📣', check: s => s.totalMessages >= 400000 },
  { key: 'msg2_450k', category: 'messages', tier: 'diamond', emoji: '🎙️', check: s => s.totalMessages >= 450000 },
  { key: 'msg2_600k', category: 'messages', tier: 'diamond', emoji: '📻', check: s => s.totalMessages >= 600000 },
  { key: 'msg2_700k', category: 'messages', tier: 'diamond', emoji: '📡', check: s => s.totalMessages >= 700000 },
  { key: 'msg2_800k', category: 'messages', tier: 'diamond', emoji: '🛰️', check: s => s.totalMessages >= 800000 },
  { key: 'msg_sess2_17p5k', category: 'messages', tier: 'platinum', emoji: '💬', check: s => s.maxMessagesInSession >= 17500 },
  { key: 'msg_sess2_20k', category: 'messages', tier: 'platinum', emoji: '🗨️', check: s => s.maxMessagesInSession >= 20000 },
  { key: 'msg_sess2_25k', category: 'messages', tier: 'platinum', emoji: '🗯️', check: s => s.maxMessagesInSession >= 25000 },
  { key: 'msg_sess2_30k', category: 'messages', tier: 'diamond', emoji: '📨', check: s => s.maxMessagesInSession >= 30000 },
  { key: 'msg_sess2_40k', category: 'messages', tier: 'diamond', emoji: '📬', check: s => s.maxMessagesInSession >= 40000 },
  { key: 'msg_sess2_50k', category: 'messages', tier: 'diamond', emoji: '📯', check: s => s.maxMessagesInSession >= 50000 },
  { key: 'msg_day2_6k', category: 'messages', tier: 'gold', emoji: '📈', check: s => s.peakDayMessages >= 6000 },
  { key: 'msg_day2_8k', category: 'messages', tier: 'platinum', emoji: '📊', check: s => s.peakDayMessages >= 8000 },
  { key: 'msg_day2_9k', category: 'messages', tier: 'platinum', emoji: '🚦', check: s => s.peakDayMessages >= 9000 },
  { key: 'msg_day2_12k', category: 'messages', tier: 'diamond', emoji: '🚀', check: s => s.peakDayMessages >= 12000 },
  { key: 'msg_day2_15k', category: 'messages', tier: 'diamond', emoji: '🌡️', check: s => s.peakDayMessages >= 15000 },
  { key: 'msg_day2_17p5k', category: 'messages', tier: 'diamond', emoji: '🔺', check: s => s.peakDayMessages >= 17500 },
  { key: 'msg_d500_175', category: 'messages', tier: 'gold', emoji: '🥉', check: s => s.daysAbove500Msgs >= 175 },
  { key: 'msg_d500_250', category: 'messages', tier: 'platinum', emoji: '🥈', check: s => s.daysAbove500Msgs >= 250 },
  { key: 'msg_d500_350', category: 'messages', tier: 'diamond', emoji: '🥇', check: s => s.daysAbove500Msgs >= 350 },
  { key: 'msg_d500_400', category: 'messages', tier: 'diamond', emoji: '🏅', check: s => s.daysAbove500Msgs >= 400 },
  { key: 'msg_d500_500', category: 'messages', tier: 'diamond', emoji: '🎖️', check: s => s.daysAbove500Msgs >= 500 },
  { key: 'msg_d2k_40', category: 'messages', tier: 'gold', emoji: '⚡', check: s => s.daysAbove2kMsgs >= 40 },
  { key: 'msg_d2k_60', category: 'messages', tier: 'platinum', emoji: '🔋', check: s => s.daysAbove2kMsgs >= 60 },
  { key: 'msg_d2k_70', category: 'messages', tier: 'diamond', emoji: '🌩️', check: s => s.daysAbove2kMsgs >= 70 },
  { key: 'msg_d2k_90', category: 'messages', tier: 'diamond', emoji: '⛈️', check: s => s.daysAbove2kMsgs >= 90 },
  { key: 'msg_d2k_120', category: 'messages', tier: 'diamond', emoji: '🌀', check: s => s.daysAbove2kMsgs >= 120 },
  { key: 'lm_msgs_500k', category: 'messages', tier: 'platinum', emoji: '📯', check: s => s.totalMessages >= 500_000 },
  { key: 'lm_msgs_1m', category: 'messages', tier: 'diamond', emoji: '🎺', check: s => s.totalMessages >= 1_000_000 },

  // --- wave 2: cost ---
  { key: 'cost2_70k', category: 'cost', tier: 'gold', emoji: '🪙', check: s => s.totalCost >= 70000 },
  { key: 'cost2_80k', category: 'cost', tier: 'platinum', emoji: '💵', check: s => s.totalCost >= 80000 },
  { key: 'cost2_90k', category: 'cost', tier: 'platinum', emoji: '💰', check: s => s.totalCost >= 90000 },
  { key: 'cost2_120k', category: 'cost', tier: 'diamond', emoji: '🏦', check: s => s.totalCost >= 120000 },
  { key: 'cost2_150k', category: 'cost', tier: 'diamond', emoji: '💎', check: s => s.totalCost >= 150000 },
  { key: 'cost2_175k', category: 'cost', tier: 'diamond', emoji: '👑', check: s => s.totalCost >= 175000 },
  { key: 'cost2_200k', category: 'cost', tier: 'diamond', emoji: '🏛️', check: s => s.totalCost >= 200000 },
  { key: 'cost_day2_2k', category: 'cost', tier: 'gold', emoji: '💸', check: s => s.maxDayCost >= 2000 },
  { key: 'cost_day2_2p5k', category: 'cost', tier: 'platinum', emoji: '🧾', check: s => s.maxDayCost >= 2500 },
  { key: 'cost_day2_3k', category: 'cost', tier: 'platinum', emoji: '🏷️', check: s => s.maxDayCost >= 3000 },
  { key: 'cost_day2_4k', category: 'cost', tier: 'diamond', emoji: '💳', check: s => s.maxDayCost >= 4000 },
  { key: 'cost_day2_5k', category: 'cost', tier: 'diamond', emoji: '🪙', check: s => s.maxDayCost >= 5000 },
  { key: 'cost_day2_6k', category: 'cost', tier: 'diamond', emoji: '🔥', check: s => s.maxDayCost >= 6000 },
  { key: 'cost_sess2_6k', category: 'cost', tier: 'gold', emoji: '🎰', check: s => s.maxCostInSession >= 6000 },
  { key: 'cost_sess2_8k', category: 'cost', tier: 'platinum', emoji: '🃏', check: s => s.maxCostInSession >= 8000 },
  { key: 'cost_sess2_10k', category: 'cost', tier: 'diamond', emoji: '🎲', check: s => s.maxCostInSession >= 10000 },
  { key: 'cost_sess2_15k', category: 'cost', tier: 'diamond', emoji: '💠', check: s => s.maxCostInSession >= 15000 },
  { key: 'cost_sess2_17p5k', category: 'cost', tier: 'diamond', emoji: '🏰', check: s => s.maxCostInSession >= 17500 },
  { key: 'cost_d50_200', category: 'cost', tier: 'platinum', emoji: '📅', check: s => s.daysAbove50Cost >= 200 },
  { key: 'cost_d50_250', category: 'cost', tier: 'platinum', emoji: '🗓️', check: s => s.daysAbove50Cost >= 250 },
  { key: 'cost_d50_300', category: 'cost', tier: 'diamond', emoji: '📆', check: s => s.daysAbove50Cost >= 300 },
  { key: 'cost_d50_350', category: 'cost', tier: 'diamond', emoji: '💼', check: s => s.daysAbove50Cost >= 350 },
  { key: 'cost_d50_450', category: 'cost', tier: 'diamond', emoji: '🏢', check: s => s.daysAbove50Cost >= 450 },
  { key: 'cost_d50_600', category: 'cost', tier: 'diamond', emoji: '🏙️', check: s => s.daysAbove50Cost >= 600 },
  { key: 'lm_cost_100k', category: 'cost', tier: 'platinum', emoji: '🏦', check: s => s.totalCost >= 100_000 },
  { key: 'lm_cost_250k', category: 'cost', tier: 'diamond', emoji: '💎', check: s => s.totalCost >= 250_000 },
  { key: 'lm_cost_500k', category: 'cost', tier: 'diamond', emoji: '👑', check: s => s.totalCost >= 500_000 },

  // --- wave 2: cache ---
  { key: 'cache_save_450k', category: 'cache', tier: 'gold', emoji: '🪃', check: s => s.cacheSavingsUsd >= 450000 },
  { key: 'cache_save_600k', category: 'cache', tier: 'platinum', emoji: '♻️', check: s => s.cacheSavingsUsd >= 600000 },
  { key: 'cache_save_700k', category: 'cache', tier: 'platinum', emoji: '🧊', check: s => s.cacheSavingsUsd >= 700000 },
  { key: 'cache_save_900k', category: 'cache', tier: 'diamond', emoji: '🛡️', check: s => s.cacheSavingsUsd >= 900000 },
  { key: 'cache_save_1m', category: 'cache', tier: 'diamond', emoji: '⚗️', check: s => s.cacheSavingsUsd >= 1000000 },
  { key: 'cache_save_1p2m', category: 'cache', tier: 'diamond', emoji: '🧪', check: s => s.cacheSavingsUsd >= 1200000 },
  { key: 'cache_save_1p5m', category: 'cache', tier: 'diamond', emoji: '🏅', check: s => s.cacheSavingsUsd >= 1500000 },
  { key: 'cache_read2_90b', category: 'cache', tier: 'gold', emoji: '🔁', check: s => s.totalCacheReadTokens >= 90000000000 },
  { key: 'cache_read2_120b', category: 'cache', tier: 'platinum', emoji: '🔂', check: s => s.totalCacheReadTokens >= 120000000000 },
  { key: 'cache_read2_150b', category: 'cache', tier: 'diamond', emoji: '♻️', check: s => s.totalCacheReadTokens >= 150000000000 },
  { key: 'cache_read2_200b', category: 'cache', tier: 'diamond', emoji: '🌀', check: s => s.totalCacheReadTokens >= 200000000000 },
  { key: 'cache_read2_250b', category: 'cache', tier: 'diamond', emoji: '🎡', check: s => s.totalCacheReadTokens >= 250000000000 },
  { key: 'cache_read2_300b', category: 'cache', tier: 'diamond', emoji: '🎢', check: s => s.totalCacheReadTokens >= 300000000000 },
  { key: 'cmb_thrift_1', category: 'cache', tier: 'gold', emoji: '🪶', check: s => s.cacheSavingsUsd >= 800000 && s.avgCacheRate >= 95 },
  { key: 'cmb_thrift_2', category: 'cache', tier: 'platinum', emoji: '🧊', check: s => s.cacheSavingsUsd >= 1000000 && s.avgCacheRate >= 95 },
  { key: 'cmb_thrift_3', category: 'cache', tier: 'platinum', emoji: '♻️', check: s => s.cacheSavingsUsd >= 1500000 && s.avgCacheRate >= 95 },
  { key: 'cmb_thrift_4', category: 'cache', tier: 'diamond', emoji: '🛡️', check: s => s.cacheSavingsUsd >= 2000000 && s.avgCacheRate >= 95 },
  { key: 'cmb_thrift_5', category: 'cache', tier: 'diamond', emoji: '🕊️', check: s => s.cacheSavingsUsd >= 2500000 && s.avgCacheRate >= 95 },
  { key: 'lm_save_1m', category: 'cache', tier: 'diamond', emoji: '🕊️', check: s => s.cacheSavingsUsd >= 1_000_000 },
  { key: 'lm_save_2m', category: 'cache', tier: 'diamond', emoji: '🏵️', check: s => s.cacheSavingsUsd >= 2_000_000 },

  // --- wave 2: lines ---
  { key: 'lw2_1p5m', category: 'lines', tier: 'gold', emoji: '🧱', check: s => s.totalLinesWritten >= 1500000 },
  { key: 'lw2_1p75m', category: 'lines', tier: 'platinum', emoji: '🧰', check: s => s.totalLinesWritten >= 1750000 },
  { key: 'lw2_2m', category: 'lines', tier: 'platinum', emoji: '🏠', check: s => s.totalLinesWritten >= 2000000 },
  { key: 'lw2_2p5m', category: 'lines', tier: 'diamond', emoji: '🏘️', check: s => s.totalLinesWritten >= 2500000 },
  { key: 'lw2_3m', category: 'lines', tier: 'diamond', emoji: '🏙️', check: s => s.totalLinesWritten >= 3000000 },
  { key: 'lw2_3p5m', category: 'lines', tier: 'diamond', emoji: '🌉', check: s => s.totalLinesWritten >= 3500000 },
  { key: 'lw2_4m', category: 'lines', tier: 'diamond', emoji: '🗼', check: s => s.totalLinesWritten >= 4000000 },
  { key: 'lw2_4p5m', category: 'lines', tier: 'diamond', emoji: '🌇', check: s => s.totalLinesWritten >= 4500000 },
  { key: 'la2_800k', category: 'lines', tier: 'gold', emoji: '➕', check: s => s.totalLinesAdded >= 800000 },
  { key: 'la2_1m', category: 'lines', tier: 'platinum', emoji: '🔧', check: s => s.totalLinesAdded >= 1000000 },
  { key: 'la2_1p2m', category: 'lines', tier: 'platinum', emoji: '🪛', check: s => s.totalLinesAdded >= 1200000 },
  { key: 'la2_1p5m', category: 'lines', tier: 'diamond', emoji: '⚙️', check: s => s.totalLinesAdded >= 1500000 },
  { key: 'la2_1p75m', category: 'lines', tier: 'diamond', emoji: '🛠️', check: s => s.totalLinesAdded >= 1750000 },
  { key: 'la2_2m', category: 'lines', tier: 'diamond', emoji: '🧩', check: s => s.totalLinesAdded >= 2000000 },
  { key: 'la2_2p5m', category: 'lines', tier: 'diamond', emoji: '🎛️', check: s => s.totalLinesAdded >= 2500000 },
  { key: 'ld2_350k', category: 'lines', tier: 'gold', emoji: '✂️', check: s => s.totalLinesRemoved >= 350000 },
  { key: 'ld2_450k', category: 'lines', tier: 'platinum', emoji: '🧹', check: s => s.totalLinesRemoved >= 450000 },
  { key: 'ld2_600k', category: 'lines', tier: 'diamond', emoji: '🔥', check: s => s.totalLinesRemoved >= 600000 },
  { key: 'ld2_700k', category: 'lines', tier: 'diamond', emoji: '🌊', check: s => s.totalLinesRemoved >= 700000 },
  { key: 'ld2_900k', category: 'lines', tier: 'diamond', emoji: '🕳️', check: s => s.totalLinesRemoved >= 900000 },
  { key: 'ld2_1p2m', category: 'lines', tier: 'diamond', emoji: '🌪️', check: s => s.totalLinesRemoved >= 1200000 },
  { key: 'ln2_2m', category: 'lines', tier: 'gold', emoji: '📗', check: s => s.netLines >= 2000000 },
  { key: 'ln2_2p5m', category: 'lines', tier: 'platinum', emoji: '📘', check: s => s.netLines >= 2500000 },
  { key: 'ln2_3m', category: 'lines', tier: 'platinum', emoji: '📙', check: s => s.netLines >= 3000000 },
  { key: 'ln2_3p5m', category: 'lines', tier: 'diamond', emoji: '📕', check: s => s.netLines >= 3500000 },
  { key: 'ln2_4m', category: 'lines', tier: 'diamond', emoji: '📚', check: s => s.netLines >= 4000000 },
  { key: 'ln2_5m', category: 'lines', tier: 'diamond', emoji: '🏛️', check: s => s.netLines >= 5000000 },
  { key: 'ln2_6m', category: 'lines', tier: 'diamond', emoji: '🌍', check: s => s.netLines >= 6000000 },
  { key: 'ld_day2_45k', category: 'lines', tier: 'gold', emoji: '⚡', check: s => s.maxDayLines >= 45000 },
  { key: 'ld_day2_60k', category: 'lines', tier: 'platinum', emoji: '🌩️', check: s => s.maxDayLines >= 60000 },
  { key: 'ld_day2_70k', category: 'lines', tier: 'platinum', emoji: '🔥', check: s => s.maxDayLines >= 70000 },
  { key: 'ld_day2_90k', category: 'lines', tier: 'diamond', emoji: '🌋', check: s => s.maxDayLines >= 90000 },
  { key: 'ld_day2_120k', category: 'lines', tier: 'diamond', emoji: '☄️', check: s => s.maxDayLines >= 120000 },
  { key: 'ld_day2_150k', category: 'lines', tier: 'diamond', emoji: '💥', check: s => s.maxDayLines >= 150000 },
  { key: 'ld_sess2_120k', category: 'lines', tier: 'gold', emoji: '🖨️', check: s => s.maxLinesInSession >= 120000 },
  { key: 'ld_sess2_150k', category: 'lines', tier: 'platinum', emoji: '📃', check: s => s.maxLinesInSession >= 150000 },
  { key: 'ld_sess2_200k', category: 'lines', tier: 'diamond', emoji: '📜', check: s => s.maxLinesInSession >= 200000 },
  { key: 'ld_sess2_250k', category: 'lines', tier: 'diamond', emoji: '🗞️', check: s => s.maxLinesInSession >= 250000 },
  { key: 'ld_sess2_350k', category: 'lines', tier: 'diamond', emoji: '📰', check: s => s.maxLinesInSession >= 350000 },
  { key: 'ld_d1k_200', category: 'lines', tier: 'gold', emoji: '📐', check: s => s.daysAbove1kLines >= 200 },
  { key: 'ld_d1k_250', category: 'lines', tier: 'platinum', emoji: '📏', check: s => s.daysAbove1kLines >= 250 },
  { key: 'ld_d1k_300', category: 'lines', tier: 'platinum', emoji: '🧮', check: s => s.daysAbove1kLines >= 300 },
  { key: 'ld_d1k_400', category: 'lines', tier: 'diamond', emoji: '🗜️', check: s => s.daysAbove1kLines >= 400 },
  { key: 'ld_d1k_500', category: 'lines', tier: 'diamond', emoji: '🏗️', check: s => s.daysAbove1kLines >= 500 },
  { key: 'ld_d1k_600', category: 'lines', tier: 'diamond', emoji: '🏭', check: s => s.daysAbove1kLines >= 600 },
  { key: 'cmb_output_1', category: 'lines', tier: 'gold', emoji: '🧱', check: s => s.totalLinesWritten >= 2500000 && s.totalActiveHours >= 3000 },
  { key: 'cmb_output_2', category: 'lines', tier: 'platinum', emoji: '🏗️', check: s => s.totalLinesWritten >= 3000000 && s.totalActiveHours >= 4000 },
  { key: 'cmb_output_3', category: 'lines', tier: 'platinum', emoji: '🏙️', check: s => s.totalLinesWritten >= 5000000 && s.totalActiveHours >= 6000 },
  { key: 'cmb_output_4', category: 'lines', tier: 'diamond', emoji: '🌉', check: s => s.totalLinesWritten >= 6000000 && s.totalActiveHours >= 6000 },
  { key: 'cmb_output_5', category: 'lines', tier: 'diamond', emoji: '🗽', check: s => s.totalLinesWritten >= 10000000 && s.totalActiveHours >= 6000 },
  { key: 'lm_lines_3m', category: 'lines', tier: 'platinum', emoji: '📚', check: s => s.totalLinesWritten >= 3_000_000 },
  { key: 'lm_lines_5m', category: 'lines', tier: 'diamond', emoji: '🏛️', check: s => s.totalLinesWritten >= 5_000_000 },

  // --- wave 2: tools ---
  { key: 'tc2_300k', category: 'tools', tier: 'platinum', emoji: '🔨', check: s => s.totalToolCalls >= 300000 },
  { key: 'tc2_350k', category: 'tools', tier: 'platinum', emoji: '🪚', check: s => s.totalToolCalls >= 350000 },
  { key: 'tc2_400k', category: 'tools', tier: 'platinum', emoji: '🪓', check: s => s.totalToolCalls >= 400000 },
  { key: 'tc2_450k', category: 'tools', tier: 'diamond', emoji: '⚒️', check: s => s.totalToolCalls >= 450000 },
  { key: 'tc2_500k', category: 'tools', tier: 'diamond', emoji: '🛠️', check: s => s.totalToolCalls >= 500000 },
  { key: 'tc2_600k', category: 'tools', tier: 'diamond', emoji: '🧰', check: s => s.totalToolCalls >= 600000 },
  { key: 'tc2_700k', category: 'tools', tier: 'diamond', emoji: '🏭', check: s => s.totalToolCalls >= 700000 },
  { key: 'tc2_800k', category: 'tools', tier: 'diamond', emoji: '🦾', check: s => s.totalToolCalls >= 800000 },
  { key: 'tcnt2_90', category: 'tools', tier: 'gold', emoji: '🧭', check: s => s.toolCount >= 90 },
  { key: 'tcnt2_120', category: 'tools', tier: 'platinum', emoji: '🗺️', check: s => s.toolCount >= 120 },
  { key: 'tcnt2_175', category: 'tools', tier: 'diamond', emoji: '🔭', check: s => s.toolCount >= 175 },
  { key: 'tcnt2_250', category: 'tools', tier: 'diamond', emoji: '🧬', check: s => s.toolCount >= 250 },
  { key: 'tcnt2_300', category: 'tools', tier: 'diamond', emoji: '🌐', check: s => s.toolCount >= 300 },
  { key: 'mcp_calls_15k', category: 'tools', tier: 'gold', emoji: '🔌', check: s => s.mcpToolCalls >= 15000 },
  { key: 'mcp_calls_17p5k', category: 'tools', tier: 'platinum', emoji: '🧩', check: s => s.mcpToolCalls >= 17500 },
  { key: 'mcp_calls_20k', category: 'tools', tier: 'platinum', emoji: '🛰️', check: s => s.mcpToolCalls >= 20000 },
  { key: 'mcp_calls_25k', category: 'tools', tier: 'diamond', emoji: '🌉', check: s => s.mcpToolCalls >= 25000 },
  { key: 'mcp_calls_30k', category: 'tools', tier: 'diamond', emoji: '🕸️', check: s => s.mcpToolCalls >= 30000 },
  { key: 'mcp_calls_35k', category: 'tools', tier: 'diamond', emoji: '🧠', check: s => s.mcpToolCalls >= 35000 },
  { key: 'mcp_calls_40k', category: 'tools', tier: 'diamond', emoji: '🌐', check: s => s.mcpToolCalls >= 40000 },
  { key: 'mcp_srv_7', category: 'tools', tier: 'gold', emoji: '🔗', check: s => s.mcpServerCount >= 7 },
  { key: 'mcp_srv_9', category: 'tools', tier: 'platinum', emoji: '🧲', check: s => s.mcpServerCount >= 9 },
  { key: 'mcp_srv_12', category: 'tools', tier: 'diamond', emoji: '🛠️', check: s => s.mcpServerCount >= 12 },
  { key: 'mcp_srv_15', category: 'tools', tier: 'diamond', emoji: '🏗️', check: s => s.mcpServerCount >= 15 },
  { key: 'mcp_srv_20', category: 'tools', tier: 'diamond', emoji: '🌍', check: s => s.mcpServerCount >= 20 },
  { key: 'sub_msg_30k', category: 'tools', tier: 'platinum', emoji: '🐝', check: s => s.subagentMessages >= 30000 },
  { key: 'sub_msg_35k', category: 'tools', tier: 'platinum', emoji: '🐜', check: s => s.subagentMessages >= 35000 },
  { key: 'sub_msg_40k', category: 'tools', tier: 'platinum', emoji: '🕸️', check: s => s.subagentMessages >= 40000 },
  { key: 'sub_msg_45k', category: 'tools', tier: 'diamond', emoji: '🧑‍🤝‍🧑', check: s => s.subagentMessages >= 45000 },
  { key: 'sub_msg_60k', category: 'tools', tier: 'diamond', emoji: '👥', check: s => s.subagentMessages >= 60000 },
  { key: 'sub_msg_70k', category: 'tools', tier: 'diamond', emoji: '🏛️', check: s => s.subagentMessages >= 70000 },
  { key: 'sub_msg_80k', category: 'tools', tier: 'diamond', emoji: '🌐', check: s => s.subagentMessages >= 80000 },
  { key: 'sub_cost_1p75k', category: 'tools', tier: 'gold', emoji: '💼', check: s => s.subagentCost >= 1750 },
  { key: 'sub_cost_2p5k', category: 'tools', tier: 'platinum', emoji: '🧾', check: s => s.subagentCost >= 2500 },
  { key: 'sub_cost_3k', category: 'tools', tier: 'diamond', emoji: '🏢', check: s => s.subagentCost >= 3000 },
  { key: 'sub_cost_3p5k', category: 'tools', tier: 'diamond', emoji: '🏦', check: s => s.subagentCost >= 3500 },
  { key: 'sub_cost_4k', category: 'tools', tier: 'diamond', emoji: '🏛️', check: s => s.subagentCost >= 4000 },
  { key: 'sub_cost_5k', category: 'tools', tier: 'diamond', emoji: '👔', check: s => s.subagentCost >= 5000 },
  { key: 'tl_bash_120k', category: 'tools', tier: 'gold', emoji: '🐚', check: s => (s.toolCallsByName['Bash'] || 0) >= 120000 },
  { key: 'tl_bash_150k', category: 'tools', tier: 'platinum', emoji: '🌀', check: s => (s.toolCallsByName['Bash'] || 0) >= 150000 },
  { key: 'tl_bash_200k', category: 'tools', tier: 'diamond', emoji: '🧿', check: s => (s.toolCallsByName['Bash'] || 0) >= 200000 },
  { key: 'tl_bash_250k', category: 'tools', tier: 'diamond', emoji: '🌊', check: s => (s.toolCallsByName['Bash'] || 0) >= 250000 },
  { key: 'tl_bash_300k', category: 'tools', tier: 'diamond', emoji: '🐉', check: s => (s.toolCallsByName['Bash'] || 0) >= 300000 },
  { key: 'tl_bash_350k', category: 'tools', tier: 'diamond', emoji: '🌌', check: s => (s.toolCallsByName['Bash'] || 0) >= 350000 },
  { key: 'tl_edit_50k', category: 'tools', tier: 'gold', emoji: '✏️', check: s => (s.toolCallsByName['Edit'] || 0) >= 50000 },
  { key: 'tl_edit_60k', category: 'tools', tier: 'platinum', emoji: '🖍️', check: s => (s.toolCallsByName['Edit'] || 0) >= 60000 },
  { key: 'tl_edit_80k', category: 'tools', tier: 'diamond', emoji: '🖊️', check: s => (s.toolCallsByName['Edit'] || 0) >= 80000 },
  { key: 'tl_edit_100k', category: 'tools', tier: 'diamond', emoji: '🪶', check: s => (s.toolCallsByName['Edit'] || 0) >= 100000 },
  { key: 'tl_edit_120k', category: 'tools', tier: 'diamond', emoji: '📝', check: s => (s.toolCallsByName['Edit'] || 0) >= 120000 },
  { key: 'tl_edit_150k', category: 'tools', tier: 'diamond', emoji: '🎨', check: s => (s.toolCallsByName['Edit'] || 0) >= 150000 },
  { key: 'tl_read_50k', category: 'tools', tier: 'gold', emoji: '👀', check: s => (s.toolCallsByName['Read'] || 0) >= 50000 },
  { key: 'tl_read_60k', category: 'tools', tier: 'platinum', emoji: '🔍', check: s => (s.toolCallsByName['Read'] || 0) >= 60000 },
  { key: 'tl_read_70k', category: 'tools', tier: 'platinum', emoji: '📖', check: s => (s.toolCallsByName['Read'] || 0) >= 70000 },
  { key: 'tl_read_90k', category: 'tools', tier: 'diamond', emoji: '🕵️', check: s => (s.toolCallsByName['Read'] || 0) >= 90000 },
  { key: 'tl_read_120k', category: 'tools', tier: 'diamond', emoji: '🧐', check: s => (s.toolCallsByName['Read'] || 0) >= 120000 },
  { key: 'tl_read_150k', category: 'tools', tier: 'diamond', emoji: '🦉', check: s => (s.toolCallsByName['Read'] || 0) >= 150000 },
  { key: 'tl_write_12k', category: 'tools', tier: 'gold', emoji: '📄', check: s => (s.toolCallsByName['Write'] || 0) >= 12000 },
  { key: 'tl_write_15k', category: 'tools', tier: 'platinum', emoji: '📃', check: s => (s.toolCallsByName['Write'] || 0) >= 15000 },
  { key: 'tl_write_17p5k', category: 'tools', tier: 'platinum', emoji: '📑', check: s => (s.toolCallsByName['Write'] || 0) >= 17500 },
  { key: 'tl_write_25k', category: 'tools', tier: 'diamond', emoji: '🗂️', check: s => (s.toolCallsByName['Write'] || 0) >= 25000 },
  { key: 'tl_write_30k', category: 'tools', tier: 'diamond', emoji: '📚', check: s => (s.toolCallsByName['Write'] || 0) >= 30000 },
  { key: 'tl_write_35k', category: 'tools', tier: 'diamond', emoji: '🏛️', check: s => (s.toolCallsByName['Write'] || 0) >= 35000 },
  { key: 'tl_grep_10k', category: 'tools', tier: 'gold', emoji: '🔎', check: s => (s.toolCallsByName['Grep'] || 0) >= 10000 },
  { key: 'tl_grep_12k', category: 'tools', tier: 'platinum', emoji: '🧲', check: s => (s.toolCallsByName['Grep'] || 0) >= 12000 },
  { key: 'tl_grep_15k', category: 'tools', tier: 'platinum', emoji: '🎣', check: s => (s.toolCallsByName['Grep'] || 0) >= 15000 },
  { key: 'tl_grep_20k', category: 'tools', tier: 'diamond', emoji: '⛏️', check: s => (s.toolCallsByName['Grep'] || 0) >= 20000 },
  { key: 'tl_grep_25k', category: 'tools', tier: 'diamond', emoji: '🛰️', check: s => (s.toolCallsByName['Grep'] || 0) >= 25000 },
  { key: 'tl_grep_30k', category: 'tools', tier: 'diamond', emoji: '🧬', check: s => (s.toolCallsByName['Grep'] || 0) >= 30000 },
  { key: 'tl_glob_1p75k', category: 'tools', tier: 'gold', emoji: '🗺️', check: s => (s.toolCallsByName['Glob'] || 0) >= 1750 },
  { key: 'tl_glob_2p5k', category: 'tools', tier: 'platinum', emoji: '🧭', check: s => (s.toolCallsByName['Glob'] || 0) >= 2500 },
  { key: 'tl_glob_3k', category: 'tools', tier: 'diamond', emoji: '📍', check: s => (s.toolCallsByName['Glob'] || 0) >= 3000 },
  { key: 'tl_glob_3p5k', category: 'tools', tier: 'diamond', emoji: '🛤️', check: s => (s.toolCallsByName['Glob'] || 0) >= 3500 },
  { key: 'tl_glob_4p5k', category: 'tools', tier: 'diamond', emoji: '🌐', check: s => (s.toolCallsByName['Glob'] || 0) >= 4500 },
  { key: 'tl_glob_6k', category: 'tools', tier: 'diamond', emoji: '🪐', check: s => (s.toolCallsByName['Glob'] || 0) >= 6000 },
  { key: 'cmb_toolset_1', category: 'tools', tier: 'gold', emoji: '🧰', check: s => (s.toolCallsByName['Bash']||0) >= 200000 && (s.toolCallsByName['Edit']||0) >= 80000 && (s.toolCallsByName['Read']||0) >= 80000 },
  { key: 'cmb_toolset_2', category: 'tools', tier: 'platinum', emoji: '⚒️', check: s => (s.toolCallsByName['Bash']||0) >= 250000 && (s.toolCallsByName['Edit']||0) >= 100000 && (s.toolCallsByName['Read']||0) >= 100000 },
  { key: 'cmb_toolset_3', category: 'tools', tier: 'platinum', emoji: '🛠️', check: s => (s.toolCallsByName['Bash']||0) >= 400000 && (s.toolCallsByName['Edit']||0) >= 150000 && (s.toolCallsByName['Read']||0) >= 150000 },
  { key: 'cmb_toolset_4', category: 'tools', tier: 'diamond', emoji: '🏭', check: s => (s.toolCallsByName['Bash']||0) >= 500000 && (s.toolCallsByName['Edit']||0) >= 200000 && (s.toolCallsByName['Read']||0) >= 200000 },
  { key: 'cmb_toolset_5', category: 'tools', tier: 'diamond', emoji: '🦾', check: s => (s.toolCallsByName['Bash']||0) >= 800000 && (s.toolCallsByName['Edit']||0) >= 300000 && (s.toolCallsByName['Read']||0) >= 250000 },
  { key: 'cmb_orchestra_1', category: 'tools', tier: 'gold', emoji: '🎻', check: s => s.subagentMessages >= 40000 && s.mcpToolCalls >= 20000 },
  { key: 'cmb_orchestra_2', category: 'tools', tier: 'platinum', emoji: '🎺', check: s => s.subagentMessages >= 80000 && s.mcpToolCalls >= 40000 },
  { key: 'cmb_orchestra_3', category: 'tools', tier: 'platinum', emoji: '🥁', check: s => s.subagentMessages >= 100000 && s.mcpToolCalls >= 50000 },
  { key: 'cmb_orchestra_4', category: 'tools', tier: 'diamond', emoji: '🎼', check: s => s.subagentMessages >= 150000 && s.mcpToolCalls >= 80000 },
  { key: 'cmb_orchestra_5', category: 'tools', tier: 'diamond', emoji: '🎩', check: s => s.subagentMessages >= 200000 && s.mcpToolCalls >= 100000 },
  { key: 'lm_tools_500k', category: 'tools', tier: 'platinum', emoji: '🛠️', check: s => s.totalToolCalls >= 500_000 },
  { key: 'lm_tools_1m', category: 'tools', tier: 'diamond', emoji: '🦾', check: s => s.totalToolCalls >= 1_000_000 },
  { key: 'lm_subagents_100k', category: 'tools', tier: 'diamond', emoji: '👥', check: s => s.subagentMessages >= 100_000 },
  { key: 'lm_mcp_25', category: 'tools', tier: 'diamond', emoji: '🌐', check: s => s.mcpServerCount >= 25 },

  // --- wave 2: models ---
  { key: 'mdl_o5_45k', category: 'models', tier: 'gold', emoji: '🌟', check: s => s.modelMessagesOf('Opus 5') >= 45000 },
  { key: 'mdl_o5_60k', category: 'models', tier: 'platinum', emoji: '💫', check: s => s.modelMessagesOf('Opus 5') >= 60000 },
  { key: 'mdl_o5_70k', category: 'models', tier: 'platinum', emoji: '✨', check: s => s.modelMessagesOf('Opus 5') >= 70000 },
  { key: 'mdl_o5_90k', category: 'models', tier: 'diamond', emoji: '🔮', check: s => s.modelMessagesOf('Opus 5') >= 90000 },
  { key: 'mdl_o5_120k', category: 'models', tier: 'diamond', emoji: '👑', check: s => s.modelMessagesOf('Opus 5') >= 120000 },
  { key: 'mdl_o5_150k', category: 'models', tier: 'diamond', emoji: '🏆', check: s => s.modelMessagesOf('Opus 5') >= 150000 },
  { key: 'mdl_f5_30k', category: 'models', tier: 'gold', emoji: '📖', check: s => s.modelMessagesOf('Fable 5') >= 30000 },
  { key: 'mdl_f5_40k', category: 'models', tier: 'platinum', emoji: '🪄', check: s => s.modelMessagesOf('Fable 5') >= 40000 },
  { key: 'mdl_f5_50k', category: 'models', tier: 'diamond', emoji: '🎭', check: s => s.modelMessagesOf('Fable 5') >= 50000 },
  { key: 'mdl_f5_70k', category: 'models', tier: 'diamond', emoji: '🎨', check: s => s.modelMessagesOf('Fable 5') >= 70000 },
  { key: 'mdl_f5_90k', category: 'models', tier: 'diamond', emoji: '🦄', check: s => s.modelMessagesOf('Fable 5') >= 90000 },
  { key: 'mdl_h45_8k', category: 'models', tier: 'gold', emoji: '🍃', check: s => s.modelMessagesOf('Haiku 4.5') >= 8000 },
  { key: 'mdl_h45_12k', category: 'models', tier: 'platinum', emoji: '🌾', check: s => s.modelMessagesOf('Haiku 4.5') >= 12000 },
  { key: 'mdl_h45_15k', category: 'models', tier: 'diamond', emoji: '🎋', check: s => s.modelMessagesOf('Haiku 4.5') >= 15000 },
  { key: 'mdl_h45_20k', category: 'models', tier: 'diamond', emoji: '🏞️', check: s => s.modelMessagesOf('Haiku 4.5') >= 20000 },
  { key: 'mdl_h45_25k', category: 'models', tier: 'diamond', emoji: '⛩️', check: s => s.modelMessagesOf('Haiku 4.5') >= 25000 },
  { key: 'mdl_s5_2p5k', category: 'models', tier: 'gold', emoji: '🎼', check: s => s.modelMessagesOf('Sonnet 5') >= 2500 },
  { key: 'mdl_s5_3p5k', category: 'models', tier: 'platinum', emoji: '🎻', check: s => s.modelMessagesOf('Sonnet 5') >= 3500 },
  { key: 'mdl_s5_4k', category: 'models', tier: 'diamond', emoji: '🎺', check: s => s.modelMessagesOf('Sonnet 5') >= 4000 },
  { key: 'mdl_s5_6k', category: 'models', tier: 'diamond', emoji: '🎹', check: s => s.modelMessagesOf('Sonnet 5') >= 6000 },
  { key: 'mdl_s5_7k', category: 'models', tier: 'diamond', emoji: '🎩', check: s => s.modelMessagesOf('Sonnet 5') >= 7000 },
  { key: 'mdl_multi_450', category: 'models', tier: 'gold', emoji: '🔀', check: s => s.multiModelSessions >= 450 },
  { key: 'mdl_multi_500', category: 'models', tier: 'platinum', emoji: '🎚️', check: s => s.multiModelSessions >= 500 },
  { key: 'mdl_multi_700', category: 'models', tier: 'diamond', emoji: '🎛️', check: s => s.multiModelSessions >= 700 },
  { key: 'mdl_multi_800', category: 'models', tier: 'diamond', emoji: '🧪', check: s => s.multiModelSessions >= 800 },
  { key: 'mdl_multi_1k', category: 'models', tier: 'diamond', emoji: '⚗️', check: s => s.multiModelSessions >= 1000 },
  { key: 'mdl_multi_1p2k', category: 'models', tier: 'diamond', emoji: '🧬', check: s => s.multiModelSessions >= 1200 },
  { key: 'mdl_triple_120', category: 'models', tier: 'platinum', emoji: '🎲', check: s => s.tripleModelDayCount >= 120 },
  { key: 'mdl_triple_150', category: 'models', tier: 'platinum', emoji: '🃏', check: s => s.tripleModelDayCount >= 150 },
  { key: 'mdl_triple_175', category: 'models', tier: 'diamond', emoji: '🎰', check: s => s.tripleModelDayCount >= 175 },
  { key: 'mdl_triple_200', category: 'models', tier: 'diamond', emoji: '🎪', check: s => s.tripleModelDayCount >= 200 },
  { key: 'mdl_triple_250', category: 'models', tier: 'diamond', emoji: '🎡', check: s => s.tripleModelDayCount >= 250 },
  { key: 'mdl_triple_350', category: 'models', tier: 'diamond', emoji: '🌈', check: s => s.tripleModelDayCount >= 350 },
  { key: 'cmb_models_1', category: 'models', tier: 'gold', emoji: '🎭', check: s => s.modelMessagesOf('Opus 5') >= 80000 && s.modelMessagesOf('Fable 5') >= 40000 },
  { key: 'cmb_models_2', category: 'models', tier: 'platinum', emoji: '🎨', check: s => s.modelMessagesOf('Opus 5') >= 150000 && s.modelMessagesOf('Fable 5') >= 80000 },
  { key: 'cmb_models_3', category: 'models', tier: 'platinum', emoji: '🌈', check: s => s.modelMessagesOf('Opus 5') >= 200000 && s.modelMessagesOf('Fable 5') >= 150000 },
  { key: 'cmb_models_4', category: 'models', tier: 'diamond', emoji: '🔮', check: s => s.modelMessagesOf('Opus 5') >= 250000 && s.modelMessagesOf('Fable 5') >= 200000 },
  { key: 'cmb_models_5', category: 'models', tier: 'diamond', emoji: '👑', check: s => s.modelMessagesOf('Opus 5') >= 400000 && s.modelMessagesOf('Fable 5') >= 250000 },
  { key: 'lm_models_in_session_11', category: 'models', tier: 'diamond', emoji: '🎪', check: s => s.maxModelsInSession >= 11 },

  // --- wave 2: projects ---
  { key: 'prj2_250', category: 'projects', tier: 'platinum', emoji: '🌱', check: s => s.projectCount >= 250 },
  { key: 'prj2_300', category: 'projects', tier: 'platinum', emoji: '🌿', check: s => s.projectCount >= 300 },
  { key: 'prj2_400', category: 'projects', tier: 'diamond', emoji: '🌳', check: s => s.projectCount >= 400 },
  { key: 'prj2_450', category: 'projects', tier: 'diamond', emoji: '🌲', check: s => s.projectCount >= 450 },
  { key: 'prj2_600', category: 'projects', tier: 'diamond', emoji: '🏞️', check: s => s.projectCount >= 600 },
  { key: 'prj2_700', category: 'projects', tier: 'diamond', emoji: '🗺️', check: s => s.projectCount >= 700 },
  { key: 'prj_msg2_30k', category: 'projects', tier: 'gold', emoji: '🏠', check: s => s.maxProjectMessages >= 30000 },
  { key: 'prj_msg2_40k', category: 'projects', tier: 'platinum', emoji: '🏡', check: s => s.maxProjectMessages >= 40000 },
  { key: 'prj_msg2_45k', category: 'projects', tier: 'platinum', emoji: '🏘️', check: s => s.maxProjectMessages >= 45000 },
  { key: 'prj_msg2_60k', category: 'projects', tier: 'diamond', emoji: '🏢', check: s => s.maxProjectMessages >= 60000 },
  { key: 'prj_msg2_70k', category: 'projects', tier: 'diamond', emoji: '🏬', check: s => s.maxProjectMessages >= 70000 },
  { key: 'prj_msg2_90k', category: 'projects', tier: 'diamond', emoji: '🏰', check: s => s.maxProjectMessages >= 90000 },
  { key: 'prj_cost2_12k', category: 'projects', tier: 'gold', emoji: '💠', check: s => s.maxProjectCost >= 12000 },
  { key: 'prj_cost2_15k', category: 'projects', tier: 'platinum', emoji: '💎', check: s => s.maxProjectCost >= 15000 },
  { key: 'prj_cost2_20k', category: 'projects', tier: 'diamond', emoji: '🔷', check: s => s.maxProjectCost >= 20000 },
  { key: 'prj_cost2_25k', category: 'projects', tier: 'diamond', emoji: '🏆', check: s => s.maxProjectCost >= 25000 },
  { key: 'prj_cost2_30k', category: 'projects', tier: 'diamond', emoji: '👑', check: s => s.maxProjectCost >= 30000 },
  { key: 'prj_cost2_35k', category: 'projects', tier: 'diamond', emoji: '🌟', check: s => s.maxProjectCost >= 35000 },
  { key: 'prj_sess2_600', category: 'projects', tier: 'gold', emoji: '🔁', check: s => s.maxProjectSessions >= 600 },
  { key: 'prj_sess2_800', category: 'projects', tier: 'platinum', emoji: '🔄', check: s => s.maxProjectSessions >= 800 },
  { key: 'prj_sess2_900', category: 'projects', tier: 'platinum', emoji: '♾️', check: s => s.maxProjectSessions >= 900 },
  { key: 'prj_sess2_1p2k', category: 'projects', tier: 'diamond', emoji: '🧗', check: s => s.maxProjectSessions >= 1200 },
  { key: 'prj_sess2_1p5k', category: 'projects', tier: 'diamond', emoji: '🏔️', check: s => s.maxProjectSessions >= 1500 },
  { key: 'prj_sess2_1p75k', category: 'projects', tier: 'diamond', emoji: '🗻', check: s => s.maxProjectSessions >= 1750 },
  { key: 'prj_100usd_70', category: 'projects', tier: 'gold', emoji: '📁', check: s => s.projectsAbove100Usd >= 70 },
  { key: 'prj_100usd_90', category: 'projects', tier: 'platinum', emoji: '🗃️', check: s => s.projectsAbove100Usd >= 90 },
  { key: 'prj_100usd_120', category: 'projects', tier: 'diamond', emoji: '🗄️', check: s => s.projectsAbove100Usd >= 120 },
  { key: 'prj_100usd_150', category: 'projects', tier: 'diamond', emoji: '🏢', check: s => s.projectsAbove100Usd >= 150 },
  { key: 'prj_100usd_175', category: 'projects', tier: 'diamond', emoji: '🏙️', check: s => s.projectsAbove100Usd >= 175 },
  { key: 'prj_100usd_200', category: 'projects', tier: 'diamond', emoji: '🌆', check: s => s.projectsAbove100Usd >= 200 },
  { key: 'prj_500usd_30', category: 'projects', tier: 'gold', emoji: '🥉', check: s => s.projectsAbove500Usd >= 30 },
  { key: 'prj_500usd_40', category: 'projects', tier: 'platinum', emoji: '🥈', check: s => s.projectsAbove500Usd >= 40 },
  { key: 'prj_500usd_50', category: 'projects', tier: 'diamond', emoji: '🥇', check: s => s.projectsAbove500Usd >= 50 },
  { key: 'prj_500usd_70', category: 'projects', tier: 'diamond', emoji: '🏅', check: s => s.projectsAbove500Usd >= 70 },
  { key: 'prj_500usd_90', category: 'projects', tier: 'diamond', emoji: '🏆', check: s => s.projectsAbove500Usd >= 90 },
  { key: 'prj_1kusd_17p5', category: 'projects', tier: 'gold', emoji: '💰', check: s => s.projectsAbove1kUsd >= 17.5 },
  { key: 'prj_1kusd_25', category: 'projects', tier: 'platinum', emoji: '🏦', check: s => s.projectsAbove1kUsd >= 25 },
  { key: 'prj_1kusd_30', category: 'projects', tier: 'diamond', emoji: '💎', check: s => s.projectsAbove1kUsd >= 30 },
  { key: 'prj_1kusd_40', category: 'projects', tier: 'diamond', emoji: '👑', check: s => s.projectsAbove1kUsd >= 40 },
  { key: 'prj_1kusd_60', category: 'projects', tier: 'diamond', emoji: '🌐', check: s => s.projectsAbove1kUsd >= 60 },
  { key: 'prj_50sess_17p5', category: 'projects', tier: 'gold', emoji: '🧭', check: s => s.projectsAbove50Sessions >= 17.5 },
  { key: 'prj_50sess_25', category: 'projects', tier: 'platinum', emoji: '🛤️', check: s => s.projectsAbove50Sessions >= 25 },
  { key: 'prj_50sess_30', category: 'projects', tier: 'diamond', emoji: '🚉', check: s => s.projectsAbove50Sessions >= 30 },
  { key: 'prj_50sess_40', category: 'projects', tier: 'diamond', emoji: '🗼', check: s => s.projectsAbove50Sessions >= 40 },
  { key: 'prj_50sess_50', category: 'projects', tier: 'diamond', emoji: '🌉', check: s => s.projectsAbove50Sessions >= 50 },
  { key: 'prj_day2_20', category: 'projects', tier: 'gold', emoji: '🤹', check: s => s.maxProjectsInDay >= 20 },
  { key: 'prj_day2_25', category: 'projects', tier: 'platinum', emoji: '🎪', check: s => s.maxProjectsInDay >= 25 },
  { key: 'prj_day2_35', category: 'projects', tier: 'diamond', emoji: '🌀', check: s => s.maxProjectsInDay >= 35 },
  { key: 'prj_day2_45', category: 'projects', tier: 'diamond', emoji: '🎠', check: s => s.maxProjectsInDay >= 45 },
  { key: 'prj_day2_60', category: 'projects', tier: 'diamond', emoji: '🎡', check: s => s.maxProjectsInDay >= 60 },
  { key: 'cmb_breadth_1', category: 'projects', tier: 'gold', emoji: '🌾', check: s => s.projectCount >= 250 && s.projectsAbove100Usd >= 80 },
  { key: 'cmb_breadth_2', category: 'projects', tier: 'platinum', emoji: '🌻', check: s => s.projectCount >= 400 && s.projectsAbove100Usd >= 150 },
  { key: 'cmb_breadth_3', category: 'projects', tier: 'platinum', emoji: '🌳', check: s => s.projectCount >= 500 && s.projectsAbove100Usd >= 150 },
  { key: 'cmb_breadth_4', category: 'projects', tier: 'diamond', emoji: '🏞️', check: s => s.projectCount >= 800 && s.projectsAbove100Usd >= 250 },
  { key: 'cmb_breadth_5', category: 'projects', tier: 'diamond', emoji: '🌍', check: s => s.projectCount >= 1000 && s.projectsAbove100Usd >= 300 },
  { key: 'cmb_devotion_1', category: 'projects', tier: 'gold', emoji: '❤️', check: s => s.maxProjectMessages >= 50000 && s.maxProjectCost >= 20000 },
  { key: 'cmb_devotion_2', category: 'projects', tier: 'platinum', emoji: '🧡', check: s => s.maxProjectMessages >= 60000 && s.maxProjectCost >= 25000 },
  { key: 'cmb_devotion_3', category: 'projects', tier: 'platinum', emoji: '💛', check: s => s.maxProjectMessages >= 100000 && s.maxProjectCost >= 40000 },
  { key: 'cmb_devotion_4', category: 'projects', tier: 'diamond', emoji: '💚', check: s => s.maxProjectMessages >= 150000 && s.maxProjectCost >= 50000 },
  { key: 'cmb_devotion_5', category: 'projects', tier: 'diamond', emoji: '💙', check: s => s.maxProjectMessages >= 200000 && s.maxProjectCost >= 80000 },
  { key: 'lm_projects_250', category: 'projects', tier: 'platinum', emoji: '🗺️', check: s => s.projectCount >= 250 },
  { key: 'lm_projects_400', category: 'projects', tier: 'diamond', emoji: '🌍', check: s => s.projectCount >= 400 },

  // --- wave 2: sessions ---
  { key: 'ses2_4k', category: 'sessions', tier: 'gold', emoji: '🚪', check: s => s.totalSessions >= 4000 },
  { key: 'ses2_5k', category: 'sessions', tier: 'platinum', emoji: '🛎️', check: s => s.totalSessions >= 5000 },
  { key: 'ses2_6k', category: 'sessions', tier: 'platinum', emoji: '🗝️', check: s => s.totalSessions >= 6000 },
  { key: 'ses2_7k', category: 'sessions', tier: 'diamond', emoji: '🏛️', check: s => s.totalSessions >= 7000 },
  { key: 'ses2_8k', category: 'sessions', tier: 'diamond', emoji: '🎬', check: s => s.totalSessions >= 8000 },
  { key: 'ses2_10k', category: 'sessions', tier: 'diamond', emoji: '🎭', check: s => s.totalSessions >= 10000 },
  { key: 'ses2_12k', category: 'sessions', tier: 'diamond', emoji: '🏟️', check: s => s.totalSessions >= 12000 },
  { key: 'ses_day2_150', category: 'sessions', tier: 'gold', emoji: '🔥', check: s => s.maxSessionsInDay >= 150 },
  { key: 'ses_day2_200', category: 'sessions', tier: 'platinum', emoji: '🌪️', check: s => s.maxSessionsInDay >= 200 },
  { key: 'ses_day2_300', category: 'sessions', tier: 'diamond', emoji: '⚡', check: s => s.maxSessionsInDay >= 300 },
  { key: 'ses_day2_350', category: 'sessions', tier: 'diamond', emoji: '💥', check: s => s.maxSessionsInDay >= 350 },
  { key: 'ses_day2_450', category: 'sessions', tier: 'diamond', emoji: '🌋', check: s => s.maxSessionsInDay >= 450 },
  { key: 'ses_d10_100', category: 'sessions', tier: 'gold', emoji: '📌', check: s => s.daysAbove10Sessions >= 100 },
  { key: 'ses_d10_120', category: 'sessions', tier: 'platinum', emoji: '📍', check: s => s.daysAbove10Sessions >= 120 },
  { key: 'ses_d10_150', category: 'sessions', tier: 'platinum', emoji: '🗓️', check: s => s.daysAbove10Sessions >= 150 },
  { key: 'ses_d10_200', category: 'sessions', tier: 'diamond', emoji: '🧷', check: s => s.daysAbove10Sessions >= 200 },
  { key: 'ses_d10_250', category: 'sessions', tier: 'diamond', emoji: '🪢', check: s => s.daysAbove10Sessions >= 250 },
  { key: 'ses_d10_300', category: 'sessions', tier: 'diamond', emoji: '⛓️', check: s => s.daysAbove10Sessions >= 300 },
  { key: 'ses_100m_350', category: 'sessions', tier: 'gold', emoji: '🧵', check: s => s.sessionsAbove100Msgs >= 350 },
  { key: 'ses_100m_450', category: 'sessions', tier: 'platinum', emoji: '🪡', check: s => s.sessionsAbove100Msgs >= 450 },
  { key: 'ses_100m_500', category: 'sessions', tier: 'platinum', emoji: '🧶', check: s => s.sessionsAbove100Msgs >= 500 },
  { key: 'ses_100m_700', category: 'sessions', tier: 'diamond', emoji: '🕸️', check: s => s.sessionsAbove100Msgs >= 700 },
  { key: 'ses_100m_800', category: 'sessions', tier: 'diamond', emoji: '🪢', check: s => s.sessionsAbove100Msgs >= 800 },
  { key: 'ses_100m_1k', category: 'sessions', tier: 'diamond', emoji: '🌐', check: s => s.sessionsAbove100Msgs >= 1000 },
  { key: 'ses_500m_90', category: 'sessions', tier: 'gold', emoji: '🏋️', check: s => s.sessionsAbove500Msgs >= 90 },
  { key: 'ses_500m_120', category: 'sessions', tier: 'platinum', emoji: '🤼', check: s => s.sessionsAbove500Msgs >= 120 },
  { key: 'ses_500m_150', category: 'sessions', tier: 'diamond', emoji: '🥊', check: s => s.sessionsAbove500Msgs >= 150 },
  { key: 'ses_500m_175', category: 'sessions', tier: 'diamond', emoji: '🛡️', check: s => s.sessionsAbove500Msgs >= 175 },
  { key: 'ses_500m_250', category: 'sessions', tier: 'diamond', emoji: '⚔️', check: s => s.sessionsAbove500Msgs >= 250 },
  { key: 'ses_500m_300', category: 'sessions', tier: 'diamond', emoji: '🐉', check: s => s.sessionsAbove500Msgs >= 300 },
  { key: 'cmb_density_1', category: 'sessions', tier: 'gold', emoji: '🧊', check: s => s.daysAbove10Sessions >= 150 && s.deepDays_6h >= 100 },
  { key: 'cmb_density_2', category: 'sessions', tier: 'platinum', emoji: '🧱', check: s => s.daysAbove10Sessions >= 200 && s.deepDays_6h >= 150 },
  { key: 'cmb_density_3', category: 'sessions', tier: 'platinum', emoji: '🪨', check: s => s.daysAbove10Sessions >= 250 && s.deepDays_6h >= 200 },
  { key: 'cmb_density_4', category: 'sessions', tier: 'diamond', emoji: '⛰️', check: s => s.daysAbove10Sessions >= 400 && s.deepDays_6h >= 250 },
  { key: 'cmb_density_5', category: 'sessions', tier: 'diamond', emoji: '🌑', check: s => s.daysAbove10Sessions >= 500 && s.deepDays_6h >= 400 },

  // --- wave 2: streaks ---
  { key: 'strk2_60', category: 'streaks', tier: 'gold', emoji: '🔥', check: s => s.longestStreak >= 60 },
  { key: 'strk2_70', category: 'streaks', tier: 'platinum', emoji: '🕯️', check: s => s.longestStreak >= 70 },
  { key: 'strk2_90', category: 'streaks', tier: 'platinum', emoji: '🏮', check: s => s.longestStreak >= 90 },
  { key: 'strk2_100', category: 'streaks', tier: 'diamond', emoji: '🔆', check: s => s.longestStreak >= 100 },
  { key: 'strk2_120', category: 'streaks', tier: 'diamond', emoji: '☀️', check: s => s.longestStreak >= 120 },
  { key: 'strk2_150', category: 'streaks', tier: 'diamond', emoji: '🌟', check: s => s.longestStreak >= 150 },
  { key: 'strk2_175', category: 'streaks', tier: 'diamond', emoji: '♾️', check: s => s.longestStreak >= 175 },
  { key: 'wdstrk_60', category: 'streaks', tier: 'platinum', emoji: '💼', check: s => s.longestWeekdayStreak >= 60 },
  { key: 'wdstrk_70', category: 'streaks', tier: 'platinum', emoji: '📋', check: s => s.longestWeekdayStreak >= 70 },
  { key: 'wdstrk_80', category: 'streaks', tier: 'platinum', emoji: '🗂️', check: s => s.longestWeekdayStreak >= 80 },
  { key: 'wdstrk_100', category: 'streaks', tier: 'diamond', emoji: '🏢', check: s => s.longestWeekdayStreak >= 100 },
  { key: 'wdstrk_150', category: 'streaks', tier: 'diamond', emoji: '⏰', check: s => s.longestWeekdayStreak >= 150 },
  { key: 'wdstrk_175', category: 'streaks', tier: 'diamond', emoji: '🎩', check: s => s.longestWeekdayStreak >= 175 },
  { key: 'adays2_250', category: 'streaks', tier: 'gold', emoji: '🌱', check: s => s.activeDays >= 250 },
  { key: 'adays2_300', category: 'streaks', tier: 'platinum', emoji: '🌿', check: s => s.activeDays >= 300 },
  { key: 'adays2_350', category: 'streaks', tier: 'platinum', emoji: '🍀', check: s => s.activeDays >= 350 },
  { key: 'adays2_400', category: 'streaks', tier: 'diamond', emoji: '🌳', check: s => s.activeDays >= 400 },
  { key: 'adays2_450', category: 'streaks', tier: 'diamond', emoji: '🌲', check: s => s.activeDays >= 450 },
  { key: 'adays2_500', category: 'streaks', tier: 'diamond', emoji: '🏔️', check: s => s.activeDays >= 500 },
  { key: 'adays2_600', category: 'streaks', tier: 'diamond', emoji: '🗿', check: s => s.activeDays >= 600 },
  { key: 'adays2_700', category: 'streaks', tier: 'diamond', emoji: '🌍', check: s => s.activeDays >= 700 },
  { key: 'weeks2_40', category: 'streaks', tier: 'gold', emoji: '📅', check: s => s.uniqueWeeksActive >= 40 },
  { key: 'weeks2_45', category: 'streaks', tier: 'platinum', emoji: '🗓️', check: s => s.uniqueWeeksActive >= 45 },
  { key: 'weeks2_60', category: 'streaks', tier: 'platinum', emoji: '📆', check: s => s.uniqueWeeksActive >= 60 },
  { key: 'weeks2_70', category: 'streaks', tier: 'diamond', emoji: '🧿', check: s => s.uniqueWeeksActive >= 70 },
  { key: 'weeks2_80', category: 'streaks', tier: 'diamond', emoji: '🎯', check: s => s.uniqueWeeksActive >= 80 },
  { key: 'weeks2_100', category: 'streaks', tier: 'diamond', emoji: '🏅', check: s => s.uniqueWeeksActive >= 100 },
  { key: 'weeks2_120', category: 'streaks', tier: 'diamond', emoji: '👑', check: s => s.uniqueWeeksActive >= 120 },
  { key: 'fweek2_30', category: 'streaks', tier: 'gold', emoji: '🛋️', check: s => s.fullWeekendCount >= 30 },
  { key: 'fweek2_40', category: 'streaks', tier: 'platinum', emoji: '☕', check: s => s.fullWeekendCount >= 40 },
  { key: 'fweek2_45', category: 'streaks', tier: 'platinum', emoji: '🌤️', check: s => s.fullWeekendCount >= 45 },
  { key: 'fweek2_60', category: 'streaks', tier: 'diamond', emoji: '🏖️', check: s => s.fullWeekendCount >= 60 },
  { key: 'fweek2_70', category: 'streaks', tier: 'diamond', emoji: '🎣', check: s => s.fullWeekendCount >= 70 },
  { key: 'fweek2_90', category: 'streaks', tier: 'diamond', emoji: '🧘', check: s => s.fullWeekendCount >= 90 },
  { key: 'hrs_day_60', category: 'streaks', tier: 'gold', emoji: '🕗', check: s => s.daysWith8Hours >= 60 },
  { key: 'hrs_day_70', category: 'streaks', tier: 'platinum', emoji: '🕛', check: s => s.daysWith8Hours >= 70 },
  { key: 'hrs_day_90', category: 'streaks', tier: 'diamond', emoji: '🕕', check: s => s.daysWith8Hours >= 90 },
  { key: 'hrs_day_120', category: 'streaks', tier: 'diamond', emoji: '🌗', check: s => s.daysWith8Hours >= 120 },
  { key: 'hrs_day_150', category: 'streaks', tier: 'diamond', emoji: '🌘', check: s => s.daysWith8Hours >= 150 },
  { key: 'hrs_day_175', category: 'streaks', tier: 'diamond', emoji: '🌑', check: s => s.daysWith8Hours >= 175 },
  { key: 'cmb_rhythm_1', category: 'streaks', tier: 'gold', emoji: '🎵', check: s => s.uniqueWeeksActive >= 50 && s.longestWeekdayStreak >= 80 },
  { key: 'cmb_rhythm_2', category: 'streaks', tier: 'platinum', emoji: '🎶', check: s => s.uniqueWeeksActive >= 80 && s.longestWeekdayStreak >= 100 },
  { key: 'cmb_rhythm_3', category: 'streaks', tier: 'platinum', emoji: '🥁', check: s => s.uniqueWeeksActive >= 100 && s.longestWeekdayStreak >= 150 },
  { key: 'cmb_rhythm_4', category: 'streaks', tier: 'diamond', emoji: '🎼', check: s => s.uniqueWeeksActive >= 150 && s.longestWeekdayStreak >= 150 },
  { key: 'cmb_rhythm_5', category: 'streaks', tier: 'diamond', emoji: '♾️', check: s => s.uniqueWeeksActive >= 200 && s.longestWeekdayStreak >= 150 },
  { key: 'lm_day_hours_22', category: 'streaks', tier: 'diamond', emoji: '🕰️', check: s => s.maxHoursInDay >= 22 },
  { key: 'lm_day_hours_24', category: 'streaks', tier: 'diamond', emoji: '🌗', check: s => s.maxHoursInDay >= 24 },

  // --- wave 2: special ---
  { key: 'cmb_scale_1', category: 'special', tier: 'gold', emoji: '📐', check: s => s.totalMessages >= 400000 && s.totalCost >= 100000 },
  { key: 'cmb_scale_2', category: 'special', tier: 'platinum', emoji: '📏', check: s => s.totalMessages >= 500000 && s.totalCost >= 150000 },
  { key: 'cmb_scale_3', category: 'special', tier: 'platinum', emoji: '🗼', check: s => s.totalMessages >= 800000 && s.totalCost >= 200000 },
  { key: 'cmb_scale_4', category: 'special', tier: 'diamond', emoji: '🌆', check: s => s.totalMessages >= 1000000 && s.totalCost >= 250000 },
  { key: 'cmb_scale_5', category: 'special', tier: 'diamond', emoji: '🌐', check: s => s.totalMessages >= 1500000 && s.totalCost >= 400000 },
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
  const toolCallsByName = Object.fromEntries(tools.map(t => [t.name, t.count || 0]));

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

  // Session extremes
  const longestSessionMin = sessions.length > 0
    ? Math.max(...sessions.map(s => s.durationMin || 0))
    : 0;
  const maxMessagesInSession = sessions.length > 0
    ? Math.max(...sessions.map(s => s.messages || 0))
    : 0;
  const maxTokensInSession = sessions.length > 0
    ? Math.max(...sessions.map(s => s.totalTokens || 0))
    : 0;
  const maxCostInSession = sessions.length > 0
    ? Math.max(...sessions.map(s => s.cost || 0))
    : 0;
  const maxLinesInSession = sessions.length > 0
    ? Math.max(...sessions.map(s => (s.linesWritten || 0) + (s.linesAdded || 0)))
    : 0;
  const marathonSessions_4h = sessions.filter(s => (s.durationMin || 0) >= 240).length;
  const marathonSessions_8h = sessions.filter(s => (s.durationMin || 0) >= 480).length;

  // Average messages per session
  const avgMessagesPerSession = (overview.sessions || 0) > 0
    ? (overview.messages || 0) / (overview.sessions || 1)
    : 0;

  // Daily stats (peak, streaks, active days)
  let peakDayMessages = 0;
  const activeDates = [];
  for (const d of daily) {
    if (d.messages > peakDayMessages) peakDayMessages = d.messages;
    if (d.messages > 0) activeDates.push(d.date);
  }

  const activeDays = activeDates.length;

  // Daily extremes
  const maxDayTokens = daily.length > 0
    ? Math.max(...daily.map(d => (d.inputTokens || 0) + (d.outputTokens || 0) + (d.cacheReadTokens || 0) + (d.cacheCreateTokens || 0)))
    : 0;
  const maxDayCost = daily.length > 0
    ? Math.max(...daily.map(d => {
      if (d.cost != null) return d.cost;
      return (d.inputCost || 0) + (d.outputCost || 0) + (d.cacheReadCost || 0) + (d.cacheCreateCost || 0);
    }))
    : 0;
  const maxDayLines = daily.length > 0
    ? Math.max(...daily.map(d => (d.linesWritten || 0) + (d.linesAdded || 0)))
    : 0;

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
    '01-01', '07-04', '12-25', '12-31',
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

    // Palindrome: YYYY-MM-DD -> YYYYMMDD, check if palindrome
    const plain = date.replace(/-/g, '');
    if (plain === plain.split('').reverse().join('')) codedOnPalindrome = true;

    // Weekend check
    const d = new Date(date + 'T12:00:00Z');
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) {
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

  // Full weekend count (both Sat and Sun active in the same week)
  const fullWeekendCount = Object.values(weekendWeeks).filter(d => d.has(0) && d.has(6)).length;

  // Consecutive full weekends
  const consecutiveFullWeekends = (() => {
    const fullWeekKeys = Object.entries(weekendWeeks)
      .filter(([_key, days]) => days.has(0) && days.has(6))
      .map(([key]) => key)
      .sort();
    if (fullWeekKeys.length === 0) return 0;
    let maxConsec = 1;
    let current = 1;
    for (let i = 1; i < fullWeekKeys.length; i++) {
      const prev = new Date(fullWeekKeys[i - 1]);
      const curr = new Date(fullWeekKeys[i]);
      const diffDays = Math.round((curr - prev) / 86400000);
      if (diffDays === 7) {
        current++;
      } else {
        if (current > maxConsec) maxConsec = current;
        current = 1;
      }
    }
    if (current > maxConsec) maxConsec = current;
    return maxConsec;
  })();

  // Sundays active
  const sundaysActive = activeDates.filter(d => new Date(d + 'T12:00:00Z').getUTCDay() === 0).length;

  // Months active
  const monthsActive = new Set(activeDates.map(d => d.slice(0, 7))).size;

  // Output ratio and avg tokens per message
  const outputRatio = totalTokens > 0 ? (overview.outputTokens || 0) / totalTokens : 0;
  const avgTokensPerMessage = (overview.messages || 0) > 0
    ? totalTokens / (overview.messages || 1)
    : 0;

  // Multi-project day (group sessions by date, count unique projects per date)
  const maxProjectsInDay = (() => {
    const projByDate = {};
    for (const s of sessions) {
      const date = (s.firstTs || '').slice(0, 10);
      if (!date) continue;
      if (!projByDate[date]) projByDate[date] = new Set();
      projByDate[date].add(s.project);
    }
    return Math.max(0, ...Object.values(projByDate).map(s => s.size));
  })();

  // Midnight marathon (session spanning midnight)
  const hasMidnightMarathon = sessions.some(
    s => s.firstTs && s.lastTs && s.firstTs.slice(0, 10) !== s.lastTs.slice(0, 10)
  );

  // Dawn and dusk same day (session before 7am AND session after 22:00 on same day)
  const hasDawnAndDusk = (() => {
    const dawnDays = new Set();
    const duskDays = new Set();
    for (const s of sessions) {
      if (!s.firstTs) continue;
      const hour = parseInt(s.firstTs.slice(11, 13), 10);
      const date = s.firstTs.slice(0, 10);
      if (hour < 7) dawnDays.add(date);
      if (hour >= 22) duskDays.add(date);
    }
    for (const d of dawnDays) {
      if (duskDays.has(d)) return true;
    }
    return false;
  })();

  // Triple model day (3+ distinct models used on same day)
  const hasTripleModelDay = (() => {
    const modelsByDate = {};
    for (const s of sessions) {
      const date = (s.firstTs || '').slice(0, 10);
      if (!date) continue;
      if (!modelsByDate[date]) modelsByDate[date] = new Set();
      const models = Array.isArray(s.models) ? s.models : [s.model || ''];
      for (const m of models) {
        if (m) modelsByDate[date].add(m);
      }
    }
    return Object.values(modelsByDate).some(s => s.size >= 3);
  })();

  // All weekdays covered (at least one message on each of Mon-Sun)
  const allWeekdaysCovered = (() => {
    const weekdays = new Set();
    for (const d of activeDates) {
      weekdays.add(new Date(d + 'T12:00:00Z').getUTCDay());
    }
    return weekdays.size >= 7;
  })();

  // Special date checks
  const codedOnNewYear = activeDates.some(d => d.slice(5) === '01-01');
  const codedOnChristmas = activeDates.some(d => d.slice(5) === '12-25');
  const codedOnNewYearsEve = activeDates.some(d => d.slice(5) === '12-31');
  const codedOnPiDay = activeDates.some(d => d.slice(5) === '03-14');
  const codedOnStarWarsDay = activeDates.some(d => d.slice(5) === '05-04');
  const codedOnSolstice = activeDates.some(d => d.slice(5) === '06-21');
  const codedOnLeapDay = activeDates.some(d => d.slice(5) === '02-29');
  const codedOnFriday13 = activeDates.some(d => {
    const dt = new Date(d + 'T12:00:00Z');
    return dt.getUTCDay() === 5 && dt.getUTCDate() === 13;
  });
  const codedOnHalloweenNight = (() => {
    const oct31Active = activeDates.some(d => d.slice(5) === '10-31');
    return oct31Active && nightOwlSessions > 0;
  })();

  // --- New stats for achievements 251-500 ---
  // Session hours
  const totalSessionHours = sessions.reduce((sum, s) => sum + ((s.durationMin || 0) / 60), 0);

  // Sessions with 100+ and 500+ messages
  const sessionsAbove100Msgs = sessions.filter(s => (s.messages || 0) >= 100).length;
  const sessionsAbove500Msgs = sessions.filter(s => (s.messages || 0) >= 500).length;

  // Days with 100+ messages and $50+ cost
  const daysAbove100Msgs = daily.filter(d => (d.messages || 0) >= 100).length;
  const daysAbove500Msgs = daily.filter(d => (d.messages || 0) >= 500).length;
  const daysAbove50Cost = daily.filter(d => {
    const c = d.cost != null ? d.cost : ((d.inputCost || 0) + (d.outputCost || 0) + (d.cacheReadCost || 0) + (d.cacheCreateCost || 0));
    return c >= 50;
  }).length;

  // Per-project extremes
  const projectSessions = {};
  const projectMessages = {};
  const projectCost = {};
  const projectTokens = {};
  for (const s of sessions) {
    const p = s.project || 'unknown';
    projectSessions[p] = (projectSessions[p] || 0) + 1;
    projectMessages[p] = (projectMessages[p] || 0) + (s.messages || 0);
    projectCost[p] = (projectCost[p] || 0) + (s.cost || 0);
    projectTokens[p] = (projectTokens[p] || 0) + (s.totalTokens || 0);
  }
  const maxProjectSessions = Math.max(0, ...Object.values(projectSessions));
  const maxProjectMessages = Math.max(0, ...Object.values(projectMessages));
  const maxProjectCost = Math.max(0, ...Object.values(projectCost));
  const maxProjectTokens = Math.max(0, ...Object.values(projectTokens));
  const projectsAbove100Sessions = Object.values(projectSessions).filter(v => v >= 100).length;
  const projectsAbove1kMsgs = Object.values(projectMessages).filter(v => v >= 1000).length;

  // Averages
  const avgCostPerSession = (overview.sessions || 0) > 0 ? totalCost / overview.sessions : 0;
  const avgCostPerDay = activeDays > 0 ? totalCost / activeDays : 0;
  const avgTokensPerDay = activeDays > 0 ? totalTokens / activeDays : 0;

  // Daily session counts
  const sessionsByDate = {};
  for (const s of sessions) {
    const date = (s.firstTs || '').slice(0, 10);
    if (date) sessionsByDate[date] = (sessionsByDate[date] || 0) + 1;
  }
  const maxSessionsInDay = Math.max(0, ...Object.values(sessionsByDate));
  const daysAbove5Sessions = Object.values(sessionsByDate).filter(v => v >= 5).length;

  // Weekend sessions
  const weekendSessionCount = sessions.filter(s => {
    if (!s.firstTs) return false;
    const dow = new Date(s.firstTs.slice(0, 10) + 'T12:00:00Z').getUTCDay();
    return dow === 0 || dow === 6;
  }).length;

  // Consecutive months active
  const consecutiveMonthsActive = (() => {
    const months = [...new Set(activeDates.map(d => d.slice(0, 7)))].sort();
    if (months.length === 0) return 0;
    let max = 1, cur = 1;
    for (let i = 1; i < months.length; i++) {
      const [py, pm] = months[i-1].split('-').map(Number);
      const [cy, cm] = months[i].split('-').map(Number);
      if ((cy * 12 + cm) - (py * 12 + pm) === 1) { cur++; }
      else { if (cur > max) max = cur; cur = 1; }
    }
    if (cur > max) max = cur;
    return max;
  })();

  // Unique weeks active
  const uniqueWeeksActive = (() => {
    const weeks = new Set();
    for (const d of activeDates) {
      const dt = new Date(d + 'T12:00:00Z');
      const jan1 = new Date(dt.getUTCFullYear(), 0, 1);
      const weekNum = Math.ceil(((dt - jan1) / 86400000 + jan1.getUTCDay() + 1) / 7);
      weeks.add(`${dt.getUTCFullYear()}-W${weekNum}`);
    }
    return weeks.size;
  })();

  // Average lines per session
  const avgLinesPerSession = (overview.sessions || 0) > 0
    ? (totalLinesWritten + totalLinesAdded) / overview.sessions : 0;

  // Days with 1k+ lines
  const daysAbove1kLines = daily.filter(d => ((d.linesWritten || 0) + (d.linesAdded || 0)) >= 1000).length;

  // Marathon sessions by duration
  const marathonSessions_12h = sessions.filter(s => (s.durationMin || 0) >= 720).length;
  const marathonSessions_16h = sessions.filter(s => (s.durationMin || 0) >= 960).length;

  // Triple model days count
  const tripleModelDayCount = (() => {
    const modelsByDate = {};
    for (const s of sessions) {
      const date = (s.firstTs || '').slice(0, 10);
      if (!date) continue;
      if (!modelsByDate[date]) modelsByDate[date] = new Set();
      const models = Array.isArray(s.models) ? s.models : [s.model || ''];
      for (const m of models) { if (m) modelsByDate[date].add(m); }
    }
    return Object.values(modelsByDate).filter(s => s.size >= 3).length;
  })();

  // ---------------------------------------------------------------------------
  // Metrics added 2026-08-30 for the second wave of 500 achievements.
  //
  // The pre-existing time metrics all read `durationMin` — last minus first
  // message of a session, idle time included. Measured on real data that is
  // inflated by a factor of 36 (62,147h of "session time" against 1,732h of
  // actual work; a single session spanned 168 days). Everything new here uses
  // `activeMin`, the gap-capped working time, and is named *Active* so the two
  // can never be confused. The old fields stay untouched — existing unlocks
  // must not be revoked.
  // ---------------------------------------------------------------------------
  const activeMinOf = (x) => x.activeMin || 0;
  const totalActiveHours = sessions.reduce((sum, x) => sum + activeMinOf(x), 0) / 60;
  const maxSessionActiveMin = sessions.length ? Math.max(...sessions.map(activeMinOf)) : 0;
  const avgActiveMinPerSession = sessions.length ? (totalActiveHours * 60) / sessions.length : 0;
  const countActiveAtLeast = (min) => sessions.filter(x => activeMinOf(x) >= min).length;
  const deepSessions_1h = countActiveAtLeast(60);
  const deepSessions_2h = countActiveAtLeast(120);
  const deepSessions_3h = countActiveAtLeast(180);
  const deepSessions_4h = countActiveAtLeast(240);
  const deepSessions_6h = countActiveAtLeast(360);
  const deepSessions_8h = countActiveAtLeast(480);

  // Active working time per calendar day, summed across that day's sessions.
  const activeMinByDate = {};
  for (const x of sessions) {
    const date = (x.firstTs || '').slice(0, 10);
    if (!date) continue;
    activeMinByDate[date] = (activeMinByDate[date] || 0) + activeMinOf(x);
  }
  const maxDayActiveMin = Math.max(0, ...Object.values(activeMinByDate));
  const countDaysActiveAtLeast = (min) => Object.values(activeMinByDate).filter(v => v >= min).length;
  const deepDays_2h = countDaysActiveAtLeast(120);
  const deepDays_4h = countDaysActiveAtLeast(240);
  const deepDays_6h = countDaysActiveAtLeast(360);
  const deepDays_8h = countDaysActiveAtLeast(480);
  const deepDays_10h = countDaysActiveAtLeast(600);

  // MCP servers and sub-agents. Both are already tracked per message; neither
  // had any achievement attached to it.
  const mcpServers = new Set();
  let mcpToolCalls = 0;
  let builtinToolCalls = 0;
  for (const [name, count] of Object.entries(toolCallsByName)) {
    if (name.startsWith('mcp__')) {
      const parts = name.split('__');
      if (parts[1]) mcpServers.add(parts[1]);
      mcpToolCalls += count;
    } else {
      builtinToolCalls += count;
    }
  }
  const mcpServerCount = mcpServers.size;
  const mcpToolShare = totalToolCalls > 0 ? mcpToolCalls / totalToolCalls : 0;

  const subagentStats = (() => {
    try { return agg.getSubagentStats(); } catch { return null; }
  })();
  const subagentMessages = subagentStats ? (subagentStats.messages || 0) : 0;
  const subagentCost = subagentStats ? (subagentStats.cost || 0) : 0;
  const subagentShare = (overview.messages || 0) > 0 ? subagentMessages / overview.messages : 0;

  // Cache economics. The 1h tier is recorded since 2026-08-30; `cacheSavings`
  // is what the cache reads WOULD have cost at full input price minus what they
  // actually cost — i.e. money the cache saved, not money spent.
  const cacheSavingsUsd = (() => {
    let saved = 0;
    for (const m of modelsArr) {
      const read = m.cacheReadTokens || 0;
      if (!read) continue;
      const p = getPricing(m.model);
      saved += (read / 1e6) * (p.input - p.cacheRead);
    }
    return saved;
  })();

  // Model generations. The existing model stats lump every Opus together;
  // these separate the individual releases so newer models become their own goal.
  const messagesByModelLabel = {};
  for (const m of modelsArr) {
    messagesByModelLabel[m.label || m.model] = m.messages || 0;
  }
  const modelMessagesOf = (label) => messagesByModelLabel[label] || 0;
  const maxModelsInSession = sessions.length
    ? Math.max(...sessions.map(x => (Array.isArray(x.models) ? x.models.length : 0)))
    : 0;
  const multiModelSessions = sessions.filter(x => Array.isArray(x.models) && x.models.length >= 2).length;

  // Project depth beyond plain counts.
  const projectCostValues = Object.values(projectCost);
  const projectsAbove100Usd = projectCostValues.filter(v => v >= 100).length;
  const projectsAbove500Usd = projectCostValues.filter(v => v >= 500).length;
  const projectsAbove1kUsd = projectCostValues.filter(v => v >= 1000).length;
  const projectsAbove10Sessions = Object.values(projectSessions).filter(v => v >= 10).length;
  const projectsAbove50Sessions = Object.values(projectSessions).filter(v => v >= 50).length;

  // Rhythm: how many distinct clock hours a single day covered, and how far the
  // working day stretched at its widest.
  const hoursByDate = {};
  for (const x of sessions) {
    const ts = x.firstTs || '';
    const date = ts.slice(0, 10);
    if (!date) continue;
    if (!hoursByDate[date]) hoursByDate[date] = new Set();
    hoursByDate[date].add(parseInt(ts.slice(11, 13), 10));
  }
  const maxHoursInDay = Math.max(0, ...Object.values(hoursByDate).map(h => h.size));
  const daysWith8Hours = Object.values(hoursByDate).filter(h => h.size >= 8).length;
  const daysWith12Hours = Object.values(hoursByDate).filter(h => h.size >= 12).length;

  // Weekday streak: consecutive Mon–Fri worked, weekends neither break nor extend.
  const longestWeekdayStreak = (() => {
    const set = new Set(activeDates);
    const sorted = [...activeDates].sort();
    if (!sorted.length) return 0;
    let best = 0, run = 0;
    const cursor = new Date(sorted[0] + 'T12:00:00Z');
    const last = new Date(sorted[sorted.length - 1] + 'T12:00:00Z');
    while (cursor <= last) {
      const dow = cursor.getUTCDay();
      if (dow !== 0 && dow !== 6) {
        if (set.has(cursor.toISOString().slice(0, 10))) { run++; if (run > best) best = run; }
        else run = 0;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return best;
  })();

  return {
    // --- added 2026-08-30 (wave 2) -----------------------------------------
    totalActiveHours,
    maxSessionActiveMin,
    avgActiveMinPerSession,
    deepSessions_1h, deepSessions_2h, deepSessions_3h,
    deepSessions_4h, deepSessions_6h, deepSessions_8h,
    maxDayActiveMin,
    deepDays_2h, deepDays_4h, deepDays_6h, deepDays_8h, deepDays_10h,
    mcpServerCount, mcpToolCalls, builtinToolCalls, mcpToolShare,
    subagentMessages, subagentCost, subagentShare,
    cacheSavingsUsd,
    modelMessagesOf,
    maxModelsInSession, multiModelSessions,
    projectsAbove100Usd, projectsAbove500Usd, projectsAbove1kUsd,
    projectsAbove10Sessions, projectsAbove50Sessions,
    maxHoursInDay, daysWith8Hours, daysWith12Hours,
    longestWeekdayStreak,
    // -----------------------------------------------------------------------
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

    // New fields
    totalOutputTokens: overview.outputTokens || 0,
    totalInputTokens: overview.inputTokens || 0,
    totalCacheReadTokens: overview.cacheReadTokens || 0,
    longestSessionMin,
    maxMessagesInSession,
    maxTokensInSession,
    maxCostInSession,
    maxLinesInSession,
    avgMessagesPerSession,
    marathonSessions_4h,
    marathonSessions_8h,
    maxDayTokens,
    maxDayCost,
    maxDayLines,
    toolCallsByName,
    fullWeekendCount,
    consecutiveFullWeekends,
    sundaysActive,
    monthsActive,
    outputRatio,
    avgTokensPerMessage,
    maxProjectsInDay,
    hasMidnightMarathon,
    hasDawnAndDusk,
    hasTripleModelDay,
    allWeekdaysCovered,
    codedOnNewYear,
    codedOnChristmas,
    codedOnNewYearsEve,
    codedOnPiDay,
    codedOnStarWarsDay,
    codedOnSolstice,
    codedOnLeapDay,
    codedOnFriday13,
    codedOnHalloweenNight,

    // New stats for 251-500
    totalSessionHours,
    sessionsAbove100Msgs,
    sessionsAbove500Msgs,
    daysAbove100Msgs,
    daysAbove500Msgs,
    daysAbove50Cost,
    maxProjectSessions,
    maxProjectMessages,
    maxProjectCost,
    maxProjectTokens,
    projectsAbove100Sessions,
    projectsAbove1kMsgs,
    avgCostPerSession,
    avgCostPerDay,
    avgTokensPerDay,
    maxSessionsInDay,
    daysAbove5Sessions,
    weekendSessionCount,
    consecutiveMonthsActive,
    uniqueWeeksActive,
    avgLinesPerSession,
    daysAbove1kLines,
    marathonSessions_12h,
    marathonSessions_16h,
    tripleModelDayCount,

    // New stats for 501-700
    totalRateLimitHits: (() => {
      try { const rl = agg.getRateLimits(); return rl ? rl.total || 0 : 0; } catch { return 0; }
    })(),
    totalCacheCreateTokens: overview.cacheCreateTokens || 0,
    avgSessionDurationMin: (overview.sessions || 0) > 0 ? totalSessionHours * 60 / overview.sessions : 0,
    avgToolCallsPerSession: (overview.sessions || 0) > 0 ? totalToolCalls / overview.sessions : 0,
    avgCostPerMessage: (overview.messages || 0) > 0 ? totalCost / overview.messages : 0,
    deletionRatio: (totalLinesWritten || 1) > 0 ? totalLinesRemoved / (totalLinesWritten || 1) : 0,
    sessionsPerActiveDay: activeDays > 0 ? (overview.sessions || 0) / activeDays : 0,
    daysAbove10Sessions: Object.values(sessionsByDate).filter(v => v >= 10).length,
    daysAbove1mTokens: daily.filter(d => ((d.inputTokens || 0) + (d.outputTokens || 0) + (d.cacheReadTokens || 0) + (d.cacheCreateTokens || 0)) >= 1_000_000).length,
    busiestMonthMessages: (() => {
      const monthMsgs = {};
      for (const d of daily) { const m = (d.date || '').slice(0, 7); if (m) monthMsgs[m] = (monthMsgs[m] || 0) + (d.messages || 0); }
      return Math.max(0, ...Object.values(monthMsgs));
    })(),
    shortSessions: sessions.filter(s => (s.durationMin || 0) > 0 && (s.durationMin || 0) < 15).length,
    avgMessagesPerDay: activeDays > 0 ? (overview.messages || 0) / activeDays : 0,
    weekdaySessionCount: sessions.filter(s => {
      if (!s.firstTs) return false;
      const dow = new Date(s.firstTs.slice(0, 10) + 'T12:00:00Z').getUTCDay();
      return dow >= 1 && dow <= 5;
    }).length,
    saturdaysActive: activeDates.filter(d => new Date(d + 'T12:00:00Z').getUTCDay() === 6).length,
    codedOnValentines: activeDates.some(d => d.slice(5) === '02-14'),
    codedOnAprilFools: activeDates.some(d => d.slice(5) === '04-01'),
    codedOnMayDay: activeDates.some(d => d.slice(5) === '05-01'),
    codedOnGroundhogDay: activeDates.some(d => d.slice(5) === '02-02'),
    codedOnEarthDay: activeDates.some(d => d.slice(5) === '04-22'),
    codedOnTowelDay: activeDates.some(d => d.slice(5) === '05-25'),
    codedOnProgrammersDay: activeDates.some(d => {
      const dt = new Date(d + 'T12:00:00Z');
      const jan1 = new Date(dt.getUTCFullYear(), 0, 1);
      const dayOfYear = Math.floor((dt - jan1) / 86400000) + 1;
      return dayOfYear === 256;
    }),
    codedOnSysAdminDay: activeDates.some(d => {
      const dt = new Date(d + 'T12:00:00Z');
      if (dt.getUTCMonth() !== 6) return false; // July
      if (dt.getUTCDay() !== 5) return false; // Friday
      const lastDay = new Date(dt.getUTCFullYear(), 7, 0).getUTCDate();
      return dt.getUTCDate() > lastDay - 7;
    }),
    daysAbove2kMsgs: daily.filter(d => (d.messages || 0) >= 2000).length,
    projectsAbove500Msgs: Object.values(projectMessages).filter(v => v >= 500).length,
    projectsAbove5kMsgs: Object.values(projectMessages).filter(v => v >= 5000).length,
    maxProjectLinesWritten: (() => {
      const projLines = {};
      for (const s of sessions) {
        const p = s.project || 'unknown';
        projLines[p] = (projLines[p] || 0) + (s.linesWritten || 0) + (s.linesAdded || 0);
      }
      return Math.max(0, ...Object.values(projLines));
    })(),
    afternoonSessions: sessions.filter(s => {
      if (!s.firstTs) return false;
      const hour = parseInt(s.firstTs.slice(11, 13), 10);
      return hour >= 12 && hour < 17;
    }).length,
    eveningSessions: sessions.filter(s => {
      if (!s.firstTs) return false;
      const hour = parseInt(s.firstTs.slice(11, 13), 10);
      return hour >= 17 && hour < 22;
    }).length,
    toolReadWriteRatio: (() => {
      const reads = (toolCallsByName.Read || 0) + (toolCallsByName.Grep || 0) + (toolCallsByName.Glob || 0);
      const writes = (toolCallsByName.Write || 0) + (toolCallsByName.Edit || 0);
      return writes > 0 ? reads / writes : 0;
    })(),
    linesPerMessage: (overview.messages || 0) > 0 ? totalLinesWritten / overview.messages : 0,
    tokensPerDollar: totalCost > 0 ? totalTokens / totalCost : 0,
    linesPerDollar: totalCost > 0 ? totalLinesWritten / totalCost : 0,
    messagesPerSession: (overview.sessions || 0) > 0 ? (overview.messages || 0) / overview.sessions : 0,
    projectDiversityPerWeek: (() => {
      const projByWeek = {};
      for (const s of sessions) {
        const date = (s.firstTs || '').slice(0, 10);
        if (!date) continue;
        const dt = new Date(date + 'T12:00:00Z');
        const jan1 = new Date(dt.getUTCFullYear(), 0, 1);
        const weekNum = Math.ceil(((dt - jan1) / 86400000 + jan1.getUTCDay() + 1) / 7);
        const weekKey = `${dt.getUTCFullYear()}-W${weekNum}`;
        if (!projByWeek[weekKey]) projByWeek[weekKey] = new Set();
        projByWeek[weekKey].add(s.project);
      }
      const vals = Object.values(projByWeek).map(s => s.size);
      return vals.length > 0 ? Math.max(...vals) : 0;
    })(),
    weekendStreakMax: (() => {
      const weekendDates = activeDates
        .filter(d => { const dow = new Date(d + 'T12:00:00Z').getUTCDay(); return dow === 0 || dow === 6; })
        .sort();
      if (weekendDates.length === 0) return 0;
      let max = 1, cur = 1;
      for (let i = 1; i < weekendDates.length; i++) {
        const diff = Math.round((new Date(weekendDates[i]) - new Date(weekendDates[i-1])) / 86400000);
        if (diff === 1 || diff === 6 || diff === 7) cur++;
        else { if (cur > max) max = cur; cur = 1; }
      }
      return Math.max(max, cur);
    })(),
  };
}

/**
 * Ratio/average achievements (cache rate, per-message/per-session/per-day
 * averages, model share, …) are meaningless on a tiny sample: on the very
 * first day of a history a 90% cache rate over a handful of messages would
 * award diamonds immediately — the "95 unlocks on day one" pile. They only
 * become eligible once enough ACTIVE DAYS back the ratio, scaled by tier
 * (a diamond ratio badge needs a month of evidence). Cumulative thresholds
 * and single-day/session records stay ungated — those really did happen.
 */
const RATIO_KEY_RE = /^(avg_|cache_rate_|deletion_ratio_|output_ratio_|tokens_per_msg_|tokens_per_dollar_|msgs_per_session_|sessions_per_day_|model_loyal_|model_(opus|sonnet|haiku)_majority)/;
const MIN_ACTIVE_DAYS_BY_TIER = { bronze: 3, silver: 5, gold: 7, platinum: 14, diamond: 30 };

function achievementPasses(ach, stats) {
  if (RATIO_KEY_RE.test(ach.key) &&
      (stats.activeDays || 0) < (MIN_ACTIVE_DAYS_BY_TIER[ach.tier] || 3)) {
    return false;
  }
  return ach.check(stats);
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
      if (achievementPasses(ach, stats)) {
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
 * Backfill achievements with HISTORICAL unlock dates by replaying the message
 * history day by day: a fresh Aggregator is fed one day at a time and every
 * still-locked achievement is re-checked after each day, so `unlocked_at`
 * lands on the day the condition was actually first met — instead of hundreds
 * of unlocks stamped "now" when the app is initialized on an existing Claude
 * history. Rewrites the user's achievements table (clear + insert). Returns
 * { unlocked, days, from, to }.
 */
function backfillAchievements(agg, userId, db) {
  const Aggregator = require('./aggregator');

  // Chronological messages grouped by local day (uses the cached _date/_ms
  // fields every aggregated message carries)
  const msgs = [...agg._messageById.values()]
    .filter(m => m.timestamp)
    .sort((a, b) => (a._ms || 0) - (b._ms || 0));
  const byDay = new Map();
  for (const m of msgs) {
    const day = m._date || m.timestamp.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(m);
  }
  const days = [...byDay.keys()].sort();
  const rateLimitsByDay = agg._rateLimits || {};

  const replay = new Aggregator();
  const pending = new Map(ACHIEVEMENTS.map(a => [a.key, a]));
  const unlockedEntries = [];

  for (const day of days) {
    const dayMsgs = byDay.get(day);
    replay.addMessages(dayMsgs);
    const rlCount = rateLimitsByDay[day];
    if (rlCount) {
      replay.addRateLimitEvents(Array.from({ length: rlCount }, (_, i) =>
        ({ id: 'backfill-' + day + '-' + i, timestamp: day + 'T12:00:00' })));
    }
    const stats = buildStats(replay);
    const at = dayMsgs[dayMsgs.length - 1].timestamp; // last activity that day
    for (const [key, ach] of pending) {
      try {
        if (achievementPasses(ach, stats)) {
          unlockedEntries.push({ key, at });
          pending.delete(key);
        }
      } catch {
        // Skip achievements that fail to check
      }
    }
  }

  // Atomic replace when available (real db.js) — clear + insert as separate
  // calls otherwise (test mocks)
  if (db.replaceAchievementsForUser) {
    db.replaceAchievementsForUser(userId, unlockedEntries);
  } else {
    db.clearAchievementsForUser(userId);
    db.unlockAchievementsBatchAt(userId, unlockedEntries);
  }

  return {
    unlocked: unlockedEntries.length,
    days: days.length,
    from: days[0] || null,
    to: days[days.length - 1] || null
  };
}

/** Points per tier */
const TIER_POINTS = {
  bronze: 10,
  silver: 25,
  gold: 50,
  platinum: 100,
  diamond: 250
};

/**
 * Get all 700 achievements with unlock status for API response.
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
    emoji: ach.emoji,
    points: TIER_POINTS[ach.tier] || 10,
    unlocked: !!unlockedMap[ach.key],
    unlockedAt: unlockedMap[ach.key] || null
  }));
}

/**
 * Look up achievement details by keys (for SSE notifications).
 */
function getAchievementsByKeys(keys) {
  const keySet = new Set(keys);
  return ACHIEVEMENTS
    .filter(a => keySet.has(a.key))
    .map(a => ({ key: a.key, category: a.category, tier: a.tier, emoji: a.emoji, points: TIER_POINTS[a.tier] || 10 }));
}

module.exports = {
  ACHIEVEMENTS,
  buildStats,
  checkAchievements,
  backfillAchievements,
  getAchievementsResponse,
  getAchievementsByKeys
};
