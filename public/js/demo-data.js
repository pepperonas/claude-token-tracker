// Demo data for non-authenticated visitors in multi-user mode
// Provides realistic sample data so visitors can explore the dashboard before signing in
const DEMO_DATA = (() => {
  // Generate 15 days of data ending yesterday
  const now = new Date();
  const days = [];
  for (let i = 14; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const models = [
    { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }
  ];

  const projects = ['my-webapp', 'api-server', 'mobile-app'];

  const toolList = [
    'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task', 'WebFetch',
    'WebSearch', 'NotebookEdit', 'TodoRead', 'TodoWrite'
  ];

  // --- Overview ---
  const overview = {
    inputTokens: 1842560,
    outputTokens: 623480,
    cacheReadTokens: 4215890,
    cacheCreateTokens: 312450,
    inputCost: 7.38,
    outputCost: 12.47,
    cacheReadCost: 1.69,
    cacheCreateCost: 1.17,
    estimatedCost: 22.71,
    sessions: 42,
    messages: 847,
    linesAdded: 3240,
    linesRemoved: 1180,
    linesWritten: 5420
  };

  // --- Daily data ---
  const dailyData = days.map((date, i) => {
    const factor = 0.5 + Math.sin(i * 0.7) * 0.3 + (i / 15) * 0.3;
    const input = Math.round(120000 * factor);
    const output = Math.round(42000 * factor);
    const cacheRead = Math.round(280000 * factor);
    const cacheCreate = Math.round(21000 * factor);
    const msgs = Math.round(55 * factor);
    const sess = Math.max(1, Math.round(3 * factor));
    const cost = Math.round((input * 3 / 1e6 + output * 15 / 1e6 + cacheRead * 0.3 / 1e6 + cacheCreate * 3.75 / 1e6) * 100) / 100;
    const lW = Math.round(360 * factor);
    const lA = Math.round(220 * factor);
    const lR = Math.round(80 * factor);
    return {
      date,
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheCreateTokens: cacheCreate,
      inputCost: Math.round(input * 3 / 1e6 * 100) / 100,
      outputCost: Math.round(output * 15 / 1e6 * 100) / 100,
      cacheReadCost: Math.round(cacheRead * 0.3 / 1e6 * 100) / 100,
      cacheCreateCost: Math.round(cacheCreate * 3.75 / 1e6 * 100) / 100,
      estimatedCost: cost,
      cost,
      sessions: sess,
      messages: msgs,
      linesAdded: lA,
      linesRemoved: lR,
      linesWritten: lW
    };
  });

  // --- Sessions ---
  const sessionsData = [];
  let sessionIdx = 0;
  for (const date of days) {
    const count = Math.max(1, Math.round(2 + Math.sin(sessionIdx * 0.5) * 1.5));
    for (let s = 0; s < count && sessionsData.length < 42; s++) {
      const hour = 8 + Math.floor(Math.random() * 12);
      const min = Math.floor(Math.random() * 60);
      const proj = projects[sessionIdx % projects.length];
      const model = models[sessionIdx % models.length];
      const durMin = 10 + Math.floor(Math.random() * 80);
      const msgs = 8 + Math.floor(Math.random() * 35);
      const toolCalls = Math.floor(msgs * 1.8);
      const inputT = msgs * 2200;
      const outputT = msgs * 740;
      const cacheR = msgs * 5100;
      const cacheC = msgs * 380;
      const cost = Math.round((inputT * 3 / 1e6 + outputT * 15 / 1e6 + cacheR * 0.3 / 1e6 + cacheC * 3.75 / 1e6) * 100) / 100;
      const lW = Math.round(msgs * 6.4);
      const lA = Math.round(msgs * 3.8);
      const lR = Math.round(msgs * 1.4);
      sessionsData.push({
        sessionId: `demo-session-${sessionIdx}`,
        firstTs: `${date}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`,
        lastTs: `${date}T${String(hour + Math.floor(durMin / 60)).padStart(2, '0')}:${String((min + durMin) % 60).padStart(2, '0')}:00.000Z`,
        project: proj,
        models: [model.id],
        messages: msgs,
        toolCalls,
        durationMin: durMin,
        inputTokens: inputT,
        outputTokens: outputT,
        cacheReadTokens: cacheR,
        cacheCreateTokens: cacheC,
        inputCost: Math.round(inputT * 3 / 1e6 * 100) / 100,
        outputCost: Math.round(outputT * 15 / 1e6 * 100) / 100,
        cacheReadCost: Math.round(cacheR * 0.3 / 1e6 * 100) / 100,
        cacheCreateCost: Math.round(cacheC * 3.75 / 1e6 * 100) / 100,
        cost,
        linesAdded: lA,
        linesRemoved: lR,
        linesWritten: lW
      });
      sessionIdx++;
    }
  }

  // --- Projects ---
  const projectsData = projects.map((name, i) => {
    const sess = sessionsData.filter(s => s.project === name);
    const inputT = sess.reduce((a, s) => a + s.inputTokens, 0);
    const outputT = sess.reduce((a, s) => a + s.outputTokens, 0);
    const cacheR = sess.reduce((a, s) => a + s.cacheReadTokens, 0);
    const cacheC = sess.reduce((a, s) => a + s.cacheCreateTokens, 0);
    return {
      name,
      inputTokens: inputT,
      outputTokens: outputT,
      cacheReadTokens: cacheR,
      cacheCreateTokens: cacheC,
      inputCost: Math.round(inputT * 3 / 1e6 * 100) / 100,
      outputCost: Math.round(outputT * 15 / 1e6 * 100) / 100,
      cacheReadCost: Math.round(cacheR * 0.3 / 1e6 * 100) / 100,
      cacheCreateCost: Math.round(cacheC * 3.75 / 1e6 * 100) / 100,
      cost: sess.reduce((a, s) => a + s.cost, 0),
      sessions: sess.length,
      messages: sess.reduce((a, s) => a + s.messages, 0),
      linesAdded: sess.reduce((a, s) => a + s.linesAdded, 0),
      linesRemoved: sess.reduce((a, s) => a + s.linesRemoved, 0),
      linesWritten: sess.reduce((a, s) => a + s.linesWritten, 0)
    };
  });

  // --- Models ---
  const modelsData = models.map((m, i) => {
    const sess = sessionsData.filter(s => s.models[0] === m.id);
    const inputT = sess.reduce((a, s) => a + s.inputTokens, 0);
    const outputT = sess.reduce((a, s) => a + s.outputTokens, 0);
    const cacheR = sess.reduce((a, s) => a + s.cacheReadTokens, 0);
    const cacheC = sess.reduce((a, s) => a + s.cacheCreateTokens, 0);
    return {
      model: m.id,
      label: m.label,
      inputTokens: inputT,
      outputTokens: outputT,
      cacheReadTokens: cacheR,
      cacheCreateTokens: cacheC,
      inputCost: Math.round(inputT * 3 / 1e6 * 100) / 100,
      outputCost: Math.round(outputT * 15 / 1e6 * 100) / 100,
      cacheReadCost: Math.round(cacheR * 0.3 / 1e6 * 100) / 100,
      cacheCreateCost: Math.round(cacheC * 3.75 / 1e6 * 100) / 100,
      cost: sess.reduce((a, s) => a + s.cost, 0),
      messages: sess.reduce((a, s) => a + s.messages, 0)
    };
  });

  // --- Tools ---
  const toolCounts = [320, 280, 245, 190, 155, 130, 85, 42, 28, 18, 12, 8];
  const totalToolCalls = toolCounts.reduce((a, b) => a + b, 0);
  const toolsData = toolList.map((name, i) => ({
    name,
    count: toolCounts[i] || 5,
    percentage: Math.round((toolCounts[i] || 5) / totalToolCalls * 1000) / 10
  }));

  // --- Hourly ---
  const hourlyData = Array.from({ length: 24 }, (_, h) => {
    let msgs = 0;
    if (h >= 9 && h <= 18) msgs = 30 + Math.round(Math.sin((h - 9) / 9 * Math.PI) * 40);
    else if (h >= 7 && h <= 22) msgs = 5 + Math.round(Math.random() * 10);
    return { hour: h, messages: msgs, tokens: msgs * 8200, linesWritten: Math.round(msgs * 6.4), linesAdded: Math.round(msgs * 3.8), linesRemoved: Math.round(msgs * 1.4) };
  });

  // --- Daily by model ---
  const dailyByModelData = days.map(date => {
    const entry = { date };
    for (const m of models) {
      const base = m.id.includes('sonnet') ? 60000 : m.id.includes('opus') ? 40000 : 20000;
      entry[m.label] = Math.round(base * (0.7 + Math.random() * 0.6));
    }
    return entry;
  });

  // --- Daily cost breakdown ---
  const dailyCostBreakdownData = dailyData.map(d => ({
    date: d.date,
    inputCost: d.inputCost,
    outputCost: d.outputCost,
    cacheReadCost: d.cacheReadCost,
    cacheCreateCost: d.cacheCreateCost
  }));

  // --- Cumulative cost ---
  let cumCost = 0;
  const cumulativeCostData = dailyData.map(d => {
    cumCost += d.cost;
    return { date: d.date, cumulativeCost: Math.round(cumCost * 100) / 100 };
  });

  // --- Day of week ---
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeekData = weekdayNames.map((name, i) => {
    const isWeekday = i >= 1 && i <= 5;
    return {
      day: name,
      dayIndex: i,
      messages: isWeekday ? 100 + Math.round(Math.random() * 80) : 20 + Math.round(Math.random() * 30),
      cost: isWeekday ? 2.5 + Math.random() * 2 : 0.5 + Math.random() * 0.8
    };
  });

  // --- Cache efficiency ---
  const cacheEfficiencyData = dailyData.map(d => {
    const total = d.inputTokens + d.cacheReadTokens + d.cacheCreateTokens;
    return {
      date: d.date,
      cacheRate: total > 0 ? Math.round(d.cacheReadTokens / total * 1000) / 10 : 0
    };
  });

  // --- Stop reasons ---
  const stopReasonsData = [
    { reason: 'end_turn', count: 520, percentage: 61.4 },
    { reason: 'tool_use', count: 295, percentage: 34.8 },
    { reason: 'max_tokens', count: 32, percentage: 3.8 }
  ];

  // --- Session efficiency ---
  const sessionEfficiencyData = sessionsData.map(s => ({
    sessionId: s.sessionId,
    project: s.project,
    tokensPerMessage: Math.round((s.inputTokens + s.outputTokens) / s.messages),
    costPerMessage: Math.round(s.cost / s.messages * 100) / 100,
    messages: s.messages
  }));

  // --- Active sessions (empty for demo — no live sessions) ---
  const activeSessionsData = [];

  // --- Achievements (35/100 unlocked for demo) ---
  const unlockedKeys = new Set([
    'tokens_1k', 'tokens_10k', 'tokens_100k', 'tokens_500k', 'tokens_1m',
    'sessions_1', 'sessions_5', 'sessions_10', 'sessions_25',
    'messages_10', 'messages_50', 'messages_100', 'messages_500',
    'cost_1', 'cost_5', 'cost_10',
    'lines_written_100', 'lines_written_1k', 'lines_edited_100', 'lines_edited_1k',
    'lines_deleted_100', 'lines_net_1k',
    'model_sonnet', 'model_opus', 'model_haiku', 'model_diversity_2', 'model_diversity_3',
    'tool_read', 'tool_write', 'tool_edit', 'tool_bash', 'tool_grep', 'tool_glob',
    'tool_diversity_5', 'tool_diversity_10',
    'project_1'
  ]);
  const allAchievementKeys = [
    'tokens_1k','tokens_10k','tokens_100k','tokens_500k','tokens_1m','tokens_5m','tokens_10m','tokens_50m','tokens_100m','tokens_500m',
    'sessions_1','sessions_5','sessions_10','sessions_25','sessions_50','sessions_100','sessions_250','sessions_500',
    'messages_10','messages_50','messages_100','messages_500','messages_1k','messages_5k','messages_10k','messages_50k',
    'cost_1','cost_5','cost_10','cost_25','cost_50','cost_100','cost_250','cost_500',
    'lines_written_100','lines_written_1k','lines_written_10k','lines_written_50k',
    'lines_edited_100','lines_edited_1k','lines_edited_10k',
    'lines_deleted_100','lines_deleted_1k','lines_deleted_10k',
    'lines_net_1k','lines_net_10k',
    'model_sonnet','model_opus','model_haiku','model_diversity_2','model_diversity_3','model_diversity_4',
    'model_sonnet_1k','model_opus_1k','model_opus_100','model_haiku_100',
    'tool_read','tool_write','tool_edit','tool_bash','tool_grep','tool_glob',
    'tool_diversity_5','tool_diversity_10','tool_diversity_15',
    'tool_1k_calls','tool_10k_calls','tool_50k_calls',
    'early_bird_1','early_bird_10','night_owl_1','night_owl_10',
    'marathon_1','marathon_5','marathon_10',
    'peak_50_msgs','peak_100_msgs','peak_200_msgs',
    'project_1','project_3','project_5','project_10','project_15','project_20',
    'streak_3','streak_7','streak_14','streak_30','streak_60',
    'active_days_7','active_days_30','active_days_100',
    'cache_rate_50','cache_rate_70','cache_rate_80','cache_rate_90',
    'holiday_coding','palindrome_date','weekend_warrior','all_hours'
  ];
  const catMap = {
    tokens: ['tokens_1k','tokens_10k','tokens_100k','tokens_500k','tokens_1m','tokens_5m','tokens_10m','tokens_50m','tokens_100m','tokens_500m'],
    sessions: ['sessions_1','sessions_5','sessions_10','sessions_25','sessions_50','sessions_100','sessions_250','sessions_500'],
    messages: ['messages_10','messages_50','messages_100','messages_500','messages_1k','messages_5k','messages_10k','messages_50k'],
    cost: ['cost_1','cost_5','cost_10','cost_25','cost_50','cost_100','cost_250','cost_500'],
    lines: ['lines_written_100','lines_written_1k','lines_written_10k','lines_written_50k','lines_edited_100','lines_edited_1k','lines_edited_10k','lines_deleted_100','lines_deleted_1k','lines_deleted_10k','lines_net_1k','lines_net_10k'],
    models: ['model_sonnet','model_opus','model_haiku','model_diversity_2','model_diversity_3','model_diversity_4','model_sonnet_1k','model_opus_1k','model_opus_100','model_haiku_100'],
    tools: ['tool_read','tool_write','tool_edit','tool_bash','tool_grep','tool_glob','tool_diversity_5','tool_diversity_10','tool_diversity_15','tool_1k_calls','tool_10k_calls','tool_50k_calls'],
    time: ['early_bird_1','early_bird_10','night_owl_1','night_owl_10','marathon_1','marathon_5','marathon_10','peak_50_msgs','peak_100_msgs','peak_200_msgs'],
    projects: ['project_1','project_3','project_5','project_10','project_15','project_20'],
    streaks: ['streak_3','streak_7','streak_14','streak_30','streak_60','active_days_7','active_days_30','active_days_100'],
    cache: ['cache_rate_50','cache_rate_70','cache_rate_80','cache_rate_90'],
    special: ['holiday_coding','palindrome_date','weekend_warrior','all_hours']
  };
  const tierMap = {};
  const tiers = ['bronze','bronze','silver','silver','gold','gold','platinum','platinum','diamond','diamond'];
  for (const [cat, keys] of Object.entries(catMap)) {
    keys.forEach((k, i) => { tierMap[k] = tiers[i % tiers.length] || 'bronze'; });
  }
  const achievementsData = allAchievementKeys.map(key => {
    let category = 'special';
    for (const [cat, keys] of Object.entries(catMap)) {
      if (keys.includes(key)) { category = cat; break; }
    }
    return {
      key,
      category,
      tier: tierMap[key] || 'bronze',
      unlocked: unlockedKeys.has(key),
      unlockedAt: unlockedKeys.has(key) ? days[Math.floor(Math.random() * days.length)] + 'T12:00:00Z' : null
    };
  });

  // Build lookup table keyed by API endpoint path
  return {
    'overview': overview,
    'daily': dailyData,
    'sessions': sessionsData,
    'projects': projectsData,
    'models': modelsData,
    'tools': toolsData,
    'hourly': hourlyData,
    'daily-by-model': dailyByModelData,
    'daily-cost-breakdown': dailyCostBreakdownData,
    'cumulative-cost': cumulativeCostData,
    'day-of-week': dayOfWeekData,
    'cache-efficiency': cacheEfficiencyData,
    'stop-reasons': stopReasonsData,
    'session-efficiency': sessionEfficiencyData,
    'active-sessions': activeSessionsData,
    'stats-cache': { error: 'Not available in demo mode' },
    'achievements': achievementsData
  };
})();
