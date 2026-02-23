/**
 * Achievements system — 250 achievements unlockable through Claude Code usage.
 * Checked against aggregator stats and stored in the DB.
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
  { key: 'output_ratio_60', category: 'special', tier: 'gold', emoji: '📤', check: s => s.outputRatio >= 0.6 },
  { key: 'all_weekdays', category: 'special', tier: 'gold', emoji: '📅', check: s => s.allWeekdaysCovered },
  { key: 'triple_model_day', category: 'special', tier: 'platinum', emoji: '🎨', check: s => s.hasTripleModelDay },
  { key: 'dawn_dusk_session', category: 'special', tier: 'gold', emoji: '🌗', check: s => s.hasDawnAndDusk },
  { key: 'efficiency_master', category: 'special', tier: 'gold', emoji: '🎯', check: s => s.avgTokensPerMessage > 0 && s.avgTokensPerMessage < 5_000 },
  { key: 'big_session_cost_25', category: 'special', tier: 'platinum', emoji: '💰', check: s => s.maxCostInSession >= 25 },
  { key: 'lines_session_1k', category: 'special', tier: 'gold', emoji: '📑', check: s => s.maxLinesInSession >= 1_000 },
  { key: 'lines_session_5k', category: 'special', tier: 'platinum', emoji: '📗', check: s => s.maxLinesInSession >= 5_000 },
  { key: 'millennium', category: 'special', tier: 'diamond', emoji: '🏆', check: s => s.totalSessions >= 1_000 && s.totalMessages >= 100_000 && s.totalCost >= 1_000 },
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
 * Get all 250 achievements with unlock status for API response.
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
