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
  // activeDays: 12 of 15 demo days have activity (3 "off" days)
  // totalActiveMin: 14h 23m active wall-clock across the period
  // avgActiveMinPerDay: 14h 23m / 12 active days = 72 min/day avg
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
    linesWritten: 5420,
    totalActiveMin: 863,
    avgActiveMinPerDay: 72,
    activeDays: 12,
    rateLimitHits: 4
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
      const sessId = `demo-session-${sessionIdx}`;
      sessionsData.push({
        id: sessId,
        sessionId: sessId,
        firstTs: `${date}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`,
        lastTs: `${date}T${String(hour + Math.floor(durMin / 60)).padStart(2, '0')}:${String((min + durMin) % 60).padStart(2, '0')}:00.000Z`,
        project: proj,
        models: [model.label],
        messages: msgs,
        toolCalls,
        durationMin: durMin,
        activeMin: Math.max(1, Math.min(durMin, Math.round(msgs * 1.4))),
        inputTokens: inputT,
        outputTokens: outputT,
        cacheReadTokens: cacheR,
        cacheCreateTokens: cacheC,
        totalTokens: inputT + outputT + cacheR + cacheC,
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
    const sess = sessionsData.filter(s => s.models[0] === m.label);
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
    const input = msgs * 2200;
    const output = msgs * 740;
    const cacheRead = msgs * 5100;
    const cacheCreate = msgs * 380;
    const cost = Math.round((input * 3 / 1e6 + output * 15 / 1e6 + cacheRead * 0.3 / 1e6 + cacheCreate * 3.75 / 1e6) * 100) / 100;
    return {
      hour: h, messages: msgs, tokens: msgs * 8200,
      inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheCreateTokens: cacheCreate,
      cost,
      inputCost: Math.round(input * 3 / 1e6 * 100) / 100,
      outputCost: Math.round(output * 15 / 1e6 * 100) / 100,
      cacheReadCost: Math.round(cacheRead * 0.3 / 1e6 * 100) / 100,
      cacheCreateCost: Math.round(cacheCreate * 3.75 / 1e6 * 100) / 100,
      linesWritten: Math.round(msgs * 6.4), linesAdded: Math.round(msgs * 3.8), linesRemoved: Math.round(msgs * 1.4)
    };
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
    return { date: d.date, cost: Math.round(cumCost * 100) / 100 };
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

  // --- Hourly × weekday heatmap ---
  let hwMaxTokens = 0, hwMaxNoCache = 0, hwMaxCost = 0, hwMaxCostNoCache = 0;
  const hourlyWeekdayData = {
    weekdays: weekdayNames.map((name, di) => {
      const dayBoost = (di >= 1 && di <= 5) ? 1 : 0.35;
      return {
        dayIndex: di,
        hours: Array.from({ length: 24 }, (_, h) => {
          let msgs = 0;
          if (h >= 9 && h <= 18) msgs = 30 + Math.round(Math.sin((h - 9) / 9 * Math.PI) * 40);
          else if (h >= 7 && h <= 22) msgs = 5 + Math.round(Math.random() * 10);
          msgs = Math.round(msgs * dayBoost);
          const input = msgs * 2200, output = msgs * 740;
          const noCache = input + output;
          const tokens = msgs * 8200;
          if (tokens > hwMaxTokens) hwMaxTokens = tokens;
          if (noCache > hwMaxNoCache) hwMaxNoCache = noCache;
          const costNoCache = Math.round((input * 3 / 1e6 + output * 15 / 1e6) * 100) / 100;
          const cost = Math.round((input * 3 / 1e6 + output * 15 / 1e6 + msgs * 5100 * 0.3 / 1e6 + msgs * 380 * 3.75 / 1e6) * 100) / 100;
          if (cost > hwMaxCost) hwMaxCost = cost;
          if (costNoCache > hwMaxCostNoCache) hwMaxCostNoCache = costNoCache;
          return { hour: h, tokens, tokensNoCache: noCache, messages: msgs, cost, costNoCache };
        })
      };
    }),
    maxTokens: 0, maxTokensNoCache: 0, maxCost: 0, maxCostNoCache: 0
  };
  hourlyWeekdayData.maxTokens = hwMaxTokens;
  hourlyWeekdayData.maxTokensNoCache = hwMaxNoCache;
  hourlyWeekdayData.maxCost = hwMaxCost;
  hourlyWeekdayData.maxCostNoCache = hwMaxCostNoCache;

  // --- Cache efficiency ---
  const cacheEfficiencyData = dailyData.map(d => {
    const total = d.inputTokens + d.cacheReadTokens + d.cacheCreateTokens;
    return {
      date: d.date,
      cacheHitRate: total > 0 ? Math.round(d.cacheReadTokens / total * 1000) / 10 : 0
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

  // --- Achievements (35/500 unlocked for demo) ---
  // Compact definition: [key, category, tier, emoji]
  const achDefs = [
    ['tokens_1k','tokens','bronze','\u{1F524}'],['tokens_10k','tokens','bronze','\u{1F4DD}'],['tokens_100k','tokens','silver','\u{1F50D}'],['tokens_500k','tokens','silver','\u{1F3AF}'],['tokens_1m','tokens','gold','\u{1F4B0}'],['tokens_5m','tokens','gold','\u{1F4AA}'],['tokens_10m','tokens','platinum','\u{1F3D4}'],['tokens_50m','tokens','platinum','\u{1F30B}'],['tokens_100m','tokens','diamond','\u{1F3C6}'],['tokens_500m','tokens','diamond','\u{1F451}'],
    ['sessions_1','sessions','bronze','\u{1F680}'],['sessions_5','sessions','bronze','\u{1F3AE}'],['sessions_10','sessions','silver','\u{1F4C5}'],['sessions_25','sessions','silver','\u{1F3AA}'],['sessions_50','sessions','gold','\u2B50'],['sessions_100','sessions','gold','\u{1F4AF}'],['sessions_250','sessions','platinum','\u26A1'],['sessions_500','sessions','diamond','\u{1F3C5}'],
    ['messages_10','messages','bronze','\u{1F4AC}'],['messages_50','messages','bronze','\u{1F5E8}'],['messages_100','messages','silver','\u{1F4E8}'],['messages_500','messages','silver','\u{1F4EB}'],['messages_1k','messages','gold','\u{1F4EC}'],['messages_5k','messages','gold','\u{1F4EE}'],['messages_10k','messages','platinum','\u{1F396}'],['messages_50k','messages','diamond','\u{1F31F}'],
    ['cost_1','cost','bronze','\u{1F4B5}'],['cost_5','cost','bronze','\u{1F4B6}'],['cost_10','cost','silver','\u{1F4B7}'],['cost_25','cost','silver','\u{1F4B4}'],['cost_50','cost','gold','\u{1F4B0}'],['cost_100','cost','gold','\u{1F911}'],['cost_250','cost','platinum','\u{1F48E}'],['cost_500','cost','diamond','\u{1F3E6}'],
    ['lines_written_100','lines','bronze','\u270F'],['lines_written_1k','lines','silver','\u{1F4DD}'],['lines_written_10k','lines','gold','\u{1F4C4}'],['lines_written_50k','lines','platinum','\u{1F4DA}'],['lines_edited_100','lines','bronze','\u2702'],['lines_edited_1k','lines','silver','\u{1F527}'],['lines_edited_10k','lines','gold','\u2699'],['lines_deleted_100','lines','bronze','\u{1F5D1}'],['lines_deleted_1k','lines','silver','\u{1F4A5}'],['lines_deleted_10k','lines','gold','\u{1F9F9}'],['lines_net_1k','lines','silver','\u{1F4C8}'],['lines_net_10k','lines','gold','\u{1F680}'],
    ['model_sonnet','models','bronze','\u{1F3B5}'],['model_opus','models','bronze','\u{1F3AD}'],['model_haiku','models','bronze','\u{1F338}'],['model_diversity_2','models','silver','\u{1F3A8}'],['model_diversity_3','models','gold','\u{1F308}'],['model_diversity_4','models','platinum','\u{1FA84}'],['model_sonnet_1k','models','silver','\u{1F3B6}'],['model_opus_1k','models','gold','\u{1F3BC}'],['model_opus_100','models','silver','\u{1F3BB}'],['model_haiku_100','models','silver','\u{1F343}'],
    ['tool_read','tools','bronze','\u{1F4D6}'],['tool_write','tools','bronze','\u270D'],['tool_edit','tools','bronze','\u{1F58A}'],['tool_bash','tools','bronze','\u{1F4BB}'],['tool_grep','tools','bronze','\u{1F50E}'],['tool_glob','tools','bronze','\u{1F4C1}'],['tool_diversity_5','tools','silver','\u{1F528}'],['tool_diversity_10','tools','gold','\u{1F9F0}'],['tool_diversity_15','tools','platinum','\u{1F6E0}'],['tool_1k_calls','tools','silver','\u26A1'],['tool_10k_calls','tools','gold','\u{1F50C}'],['tool_50k_calls','tools','platinum','\u2699'],
    ['early_bird_1','time','bronze','\u{1F426}'],['early_bird_10','time','silver','\u{1F305}'],['night_owl_1','time','bronze','\u{1F989}'],['night_owl_10','time','silver','\u{1F319}'],['marathon_1','time','silver','\u{1F3C3}'],['marathon_5','time','gold','\u{1F3C3}\u200D\u2642'],['marathon_10','time','platinum','\u{1F947}'],['peak_50_msgs','time','silver','\u{1F4CA}'],['peak_100_msgs','time','gold','\u{1F525}'],['peak_200_msgs','time','platinum','\u{1F321}'],
    ['project_1','projects','bronze','\u{1F4C2}'],['project_3','projects','silver','\u{1F4C1}'],['project_5','projects','gold','\u{1F5C2}'],['project_10','projects','platinum','\u{1F3E2}'],['project_15','projects','diamond','\u{1F3D7}'],['project_20','projects','diamond','\u{1F306}'],
    ['streak_3','streaks','bronze','\u{1F525}'],['streak_7','streaks','silver','\u{1F5D3}'],['streak_14','streaks','gold','\u{1F4C6}'],['streak_30','streaks','platinum','\u{1F3C6}'],['streak_60','streaks','diamond','\u{1F48E}'],['active_days_7','streaks','bronze','\u{1F4C5}'],['active_days_30','streaks','silver','\u{1F5D3}'],['active_days_100','streaks','gold','\u{1F3AF}'],
    ['cache_rate_50','cache','silver','\u{1F4BE}'],['cache_rate_70','cache','gold','\u{1F5C4}'],['cache_rate_80','cache','platinum','\u{1F3CE}'],['cache_rate_90','cache','diamond','\u26A1'],
    ['holiday_coding','special','silver','\u{1F384}'],['palindrome_date','special','gold','\u{1F504}'],['weekend_warrior','special','bronze','\u2694'],['all_hours','special','platinum','\u{1F550}'],
    // 150 new achievements (101-250)
    ['tokens_1b','tokens','diamond','\u{1F30C}'],['output_1m','tokens','gold','\u{1F4E4}'],['output_5m','tokens','platinum','\u{1F4E6}'],['output_10m','tokens','platinum','\u{1F6F8}'],['output_50m','tokens','diamond','\u{1F4AB}'],['output_100m','tokens','diamond','\u{1F320}'],['input_10m','tokens','gold','\u{1F4E5}'],['input_50m','tokens','platinum','\u{1F4E8}'],['input_100m','tokens','diamond','\u{1F4E9}'],['input_500m','tokens','diamond','\u{1F3AF}'],['cache_tokens_10m','tokens','gold','\u{1F4BE}'],['cache_tokens_100m','tokens','diamond','\u{1F5C4}'],
    ['sessions_750','sessions','diamond','\u{1F3C5}'],['sessions_1k','sessions','diamond','\u{1F451}'],['sessions_2k','sessions','diamond','\u{1F531}'],['sessions_5k','sessions','diamond','\u{1F320}'],['sessions_10k','sessions','diamond','\u{1F30C}'],['session_longest_4h','sessions','gold','\u23F0'],['session_longest_8h','sessions','platinum','\u23F1'],['session_longest_12h','sessions','diamond','\u{1F570}'],['session_max_200_msgs','sessions','platinum','\u{1F5E3}'],['session_max_500_msgs','sessions','diamond','\u{1F4E2}'],
    ['messages_100k','messages','diamond','\u{1F4EC}'],['messages_250k','messages','diamond','\u{1F4EE}'],['messages_500k','messages','diamond','\u{1F48C}'],['messages_1m','messages','diamond','\u2709'],['avg_msgs_session_20','messages','gold','\u{1F4CA}'],['avg_msgs_session_50','messages','platinum','\u{1F4C8}'],['avg_msgs_session_100','messages','diamond','\u{1F3AF}'],
    ['cost_750','cost','diamond','\u{1F4B0}'],['cost_1000','cost','diamond','\u{1F4B8}'],['cost_2500','cost','diamond','\u{1F911}'],['cost_5000','cost','diamond','\u{1F3E6}'],['cost_10000','cost','diamond','\u{1F3DB}'],['cost_day_10','cost','gold','\u{1F4C8}'],['cost_day_25','cost','platinum','\u{1F4CA}'],['cost_day_50','cost','diamond','\u{1F4B9}'],['cost_day_100','cost','diamond','\u{1F3E7}'],['cost_session_10','cost','gold','\u{1F4B3}'],['cost_session_50','cost','diamond','\u{1F48E}'],
    ['lines_written_100k','lines','platinum','\u{1F4DC}'],['lines_written_250k','lines','diamond','\u{1F4CB}'],['lines_written_500k','lines','diamond','\u{1F5DE}'],['lines_written_1m','lines','diamond','\u{1F4DA}'],['lines_edited_50k','lines','platinum','\u270F'],['lines_edited_100k','lines','diamond','\u{1F58A}'],['lines_deleted_50k','lines','platinum','\u{1F5D1}'],['lines_deleted_100k','lines','diamond','\u267B'],['lines_net_50k','lines','platinum','\u{1F4C8}'],['lines_net_100k','lines','diamond','\u{1F3D7}'],['lines_net_250k','lines','diamond','\u{1F306}'],['lines_day_1k','lines','gold','\u26A1'],['lines_day_5k','lines','platinum','\u{1F329}'],['lines_day_10k','lines','diamond','\u{1F30B}'],['lines_day_25k','lines','diamond','\u{1F525}'],
    ['model_sonnet_5k','models','gold','\u{1F3B5}'],['model_sonnet_10k','models','platinum','\u{1F3B6}'],['model_opus_5k','models','platinum','\u{1F3AD}'],['model_opus_10k','models','diamond','\u{1F3BB}'],['model_haiku_1k','models','gold','\u{1F338}'],['model_haiku_5k','models','platinum','\u{1F33A}'],['model_diversity_5','models','diamond','\u{1F3A8}'],
    ['tool_diversity_20','tools','diamond','\u{1F9F0}'],['tool_100k_calls','tools','diamond','\u2699'],['tool_250k_calls','tools','diamond','\u{1F527}'],['tool_500k_calls','tools','diamond','\u{1F6E0}'],['tool_bash_1k','tools','gold','\u{1F4BB}'],['tool_bash_10k','tools','platinum','\u{1F5A5}'],['tool_bash_50k','tools','diamond','\u2328'],['tool_read_10k','tools','gold','\u{1F4D6}'],['tool_read_50k','tools','platinum','\u{1F4D7}'],['tool_edit_10k','tools','gold','\u{1F50F}'],['tool_edit_50k','tools','platinum','\u{1F4D0}'],['tool_write_10k','tools','gold','\u{1F4DD}'],['tool_write_50k','tools','platinum','\u{1F4D8}'],['tool_grep_10k','tools','gold','\u{1F50D}'],['tool_glob_10k','tools','gold','\u{1F5FA}'],['tool_task_1k','tools','gold','\u{1F4CB}'],
    ['early_bird_50','time','gold','\u{1F305}'],['early_bird_100','time','platinum','\u{1F304}'],['early_bird_500','time','diamond','\u2600'],['night_owl_50','time','gold','\u{1F319}'],['night_owl_100','time','platinum','\u{1F311}'],['night_owl_500','time','diamond','\u{1F987}'],['marathon_25','time','platinum','\u{1F3C3}'],['marathon_50','time','diamond','\u{1F3CB}'],['marathon_100','time','diamond','\u{1F9BE}'],['marathon_4h','time','gold','\u23F0'],['marathon_4h_10','time','platinum','\u23F1'],['marathon_8h','time','diamond','\u{1F550}'],['peak_300_msgs','time','platinum','\u{1F4CA}'],['peak_500_msgs','time','diamond','\u{1F4A5}'],['peak_1000_msgs','time','diamond','\u2604'],['peak_tokens_1m','time','platinum','\u{1F321}'],['peak_tokens_5m','time','diamond','\u{1FAE0}'],
    ['project_25','projects','diamond','\u{1F3D8}'],['project_50','projects','diamond','\u{1F307}'],['project_75','projects','diamond','\u{1F303}'],['project_100','projects','diamond','\u{1F30D}'],
    ['streak_90','streaks','diamond','\u{1F525}'],['streak_120','streaks','diamond','\u{1F31F}'],['streak_180','streaks','diamond','\u{1F4AB}'],['streak_365','streaks','diamond','\u2B50'],['active_days_200','streaks','platinum','\u{1F4C6}'],['active_days_365','streaks','diamond','\u{1F5D3}'],['active_days_500','streaks','diamond','\u{1F4C5}'],['active_days_730','streaks','diamond','\u{1F3AF}'],['active_days_1000','streaks','diamond','\u{1F3C6}'],['months_active_6','streaks','gold','\u{1F4C5}'],['months_active_12','streaks','platinum','\u{1F4C6}'],['months_active_24','streaks','diamond','\u{1F5D3}'],['months_active_36','streaks','diamond','\u{1F3DB}'],
    ['cache_rate_95','cache','diamond','\u{1F3CE}'],['cache_rate_99','cache','diamond','\u{1F680}'],['cache_tokens_50m','cache','platinum','\u{1F4BD}'],['cache_tokens_500m','cache','diamond','\u{1F5B2}'],
    ['new_years_coding','special','gold','\u{1F386}'],['friday_13th','special','gold','\u{1F52E}'],['leap_day','special','diamond','\u{1F998}'],['pi_day','special','gold','\u{1F967}'],['star_wars_day','special','gold','\u2694'],['summer_solstice','special','gold','\u2600'],['halloween_night','special','platinum','\u{1F383}'],['christmas_coding','special','gold','\u{1F381}'],['new_years_eve','special','gold','\u{1F387}'],['midnight_marathon','special','gold','\u{1F313}'],['full_weekend_5','special','gold','\u{1F3D6}'],['full_weekend_10','special','platinum','\u26F1'],['full_weekend_25','special','diamond','\u{1F3DD}'],['full_weekend_52','special','diamond','\u{1F334}'],['sunday_coder_10','special','silver','\u2615'],['seven_day_week','special','gold','\u{1F4C5}'],['consec_weekends_4','special','platinum','\u{1F3AA}'],['consec_weekends_8','special','diamond','\u{1F3A1}'],['tokens_session_1m','special','platinum','\u{1F48E}'],['tokens_session_5m','special','diamond','\u{1F31F}'],['tokens_session_10m','special','diamond','\u2728'],['multi_proj_day_3','special','gold','\u{1F500}'],['multi_proj_day_5','special','platinum','\u{1F504}'],['multi_proj_day_10','special','diamond','\u{1F300}'],['century_session','special','gold','\u{1F4AF}'],['output_ratio_60','special','gold','\u{1F4E4}'],['all_weekdays','special','gold','\u{1F4C5}'],['triple_model_day','special','platinum','\u{1F3A8}'],['dawn_dusk_session','special','gold','\u{1F317}'],['efficiency_master','special','gold','\u{1F3AF}'],['big_session_cost_25','special','platinum','\u{1F4B0}'],['lines_session_1k','special','gold','\u{1F4D1}'],['lines_session_5k','special','platinum','\u{1F4D7}'],['millennium','special','diamond','\u{1F3C6}'],
    // 250 new achievements (251-500)
    ['tokens_2b','tokens','diamond','\u{1F30C}'],['tokens_5b','tokens','diamond','\u{1F52E}'],['tokens_10b','tokens','diamond','\u{1F48E}'],['output_250m','tokens','diamond','\u{1F4E4}'],['output_500m','tokens','diamond','\u{1F680}'],['output_1b','tokens','diamond','\u{1F31F}'],['output_2b','tokens','diamond','\u2728'],['input_1b','tokens','diamond','\u{1F4E5}'],['input_2b','tokens','diamond','\u{1F4E9}'],['input_5b','tokens','diamond','\u{1F3AF}'],['cache_read_1b','tokens','diamond','\u{1F4BE}'],['cache_read_2b','tokens','diamond','\u{1F5C4}'],['cache_read_5b','tokens','diamond','\u{1F3E6}'],['output_ratio_70','tokens','platinum','\u{1F4CA}'],['output_ratio_80','tokens','diamond','\u{1F4C8}'],['tokens_per_msg_10k','tokens','gold','\u{1F4DD}'],['tokens_per_msg_25k','tokens','platinum','\u{1F4C4}'],['tokens_per_msg_50k','tokens','diamond','\u{1F4DA}'],['avg_tokens_day_1m','tokens','gold','\u{1F522}'],['avg_tokens_day_10m','tokens','diamond','\u{1F9EE}'],
    ['sessions_15k','sessions','diamond','\u{1F3C5}'],['sessions_20k','sessions','diamond','\u{1F451}'],['sessions_50k','sessions','diamond','\u{1F531}'],['sessions_100k','sessions','diamond','\u{1F320}'],['session_longest_16h','sessions','diamond','\u23F0'],['session_longest_24h','sessions','diamond','\u23F1'],['session_max_1k_msgs','sessions','diamond','\u{1F5E3}'],['session_max_2k_msgs','sessions','diamond','\u{1F4E2}'],['session_cost_100','sessions','diamond','\u{1F4B0}'],['session_cost_250','sessions','diamond','\u{1F4B8}'],['session_cost_500','sessions','diamond','\u{1F911}'],['session_tokens_10m','sessions','platinum','\u{1F522}'],['session_tokens_25m','sessions','diamond','\u{1F9EE}'],['session_tokens_50m','sessions','diamond','\u{1F4DF}'],['sessions_100_msgs_10','sessions','platinum','\u{1F396}'],['sessions_100_msgs_50','sessions','diamond','\u{1F3C6}'],['sessions_100_msgs_100','sessions','diamond','\u{1F451}'],['total_hours_500','sessions','platinum','\u231B'],['total_hours_2k','sessions','diamond','\u23F3'],['total_hours_10k','sessions','diamond','\u{1F570}'],
    ['messages_2m','messages','diamond','\u{1F4AC}'],['messages_5m','messages','diamond','\u{1F5E8}'],['messages_10m','messages','diamond','\u{1F4E8}'],['avg_msgs_session_150','messages','diamond','\u{1F4CA}'],['avg_msgs_session_200','messages','diamond','\u{1F4C8}'],['avg_msgs_day_50','messages','gold','\u{1F4EC}'],['avg_msgs_day_100','messages','platinum','\u{1F4EE}'],['avg_msgs_day_250','messages','diamond','\u{1F48C}'],['avg_msgs_day_500','messages','diamond','\u2709'],['days_100_msgs_10','messages','platinum','\u{1F525}'],['days_100_msgs_50','messages','diamond','\u{1F321}'],['days_100_msgs_100','messages','diamond','\u2604'],['days_500_msgs_5','messages','diamond','\u{1F30B}'],['days_500_msgs_10','messages','diamond','\u{1F3D4}'],['days_500_msgs_25','messages','diamond','\u{1F5FB}'],
    ['cost_15k','cost','diamond','\u{1F4B5}'],['cost_25k','cost','diamond','\u{1F4B6}'],['cost_50k','cost','diamond','\u{1F4B7}'],['cost_100k','cost','diamond','\u{1F4B4}'],['cost_day_250','cost','diamond','\u{1F4C8}'],['cost_day_500','cost','diamond','\u{1F4CA}'],['cost_day_1k','cost','diamond','\u{1F4B9}'],['cost_session_100','cost','diamond','\u{1F4B3}'],['cost_session_250','cost','diamond','\u{1F48E}'],['cost_session_500','cost','diamond','\u{1F3E7}'],['cost_session_1k','cost','diamond','\u{1F3DB}'],['avg_cost_session_5','cost','gold','\u{1F4B2}'],['avg_cost_session_10','cost','platinum','\u{1F4B0}'],['avg_cost_session_25','cost','diamond','\u{1F4B8}'],['avg_cost_session_50','cost','diamond','\u{1F911}'],['avg_cost_day_10','cost','gold','\u{1F4C5}'],['avg_cost_day_25','cost','platinum','\u{1F4C6}'],['avg_cost_day_50','cost','diamond','\u{1F5D3}'],['days_50_cost_10','cost','platinum','\u{1F525}'],['days_50_cost_100','cost','diamond','\u{1F30B}'],
    ['lines_written_2m','lines','diamond','\u{1F4DC}'],['lines_written_5m','lines','diamond','\u{1F4CB}'],['lines_written_10m','lines','diamond','\u{1F5DE}'],['lines_edited_250k','lines','diamond','\u270F'],['lines_edited_500k','lines','diamond','\u{1F58A}'],['lines_edited_1m','lines','diamond','\u{1F527}'],['lines_deleted_250k','lines','diamond','\u{1F5D1}'],['lines_deleted_500k','lines','diamond','\u{1F4A5}'],['lines_deleted_1m','lines','diamond','\u{1F9F9}'],['lines_net_500k','lines','diamond','\u{1F4C8}'],['lines_net_1m','lines','diamond','\u{1F680}'],['lines_net_5m','lines','diamond','\u{1F306}'],['lines_day_50k','lines','diamond','\u26A1'],['lines_day_100k','lines','diamond','\u{1F329}'],['lines_session_10k','lines','platinum','\u{1F4D1}'],['lines_session_25k','lines','diamond','\u{1F4D7}'],['lines_session_50k','lines','diamond','\u{1F4D5}'],['lines_session_100k','lines','diamond','\u{1F4D8}'],['avg_lines_session_500','lines','gold','\u{1F4CA}'],['avg_lines_session_1k','lines','platinum','\u{1F4C8}'],['avg_lines_session_2k','lines','diamond','\u{1F4C9}'],['avg_lines_session_5k','lines','diamond','\u{1F4CB}'],['days_1k_lines_10','lines','platinum','\u{1F525}'],['days_1k_lines_50','lines','diamond','\u{1F321}'],['days_1k_lines_100','lines','diamond','\u2604'],
    ['model_diversity_6','models','diamond','\u{1F3A8}'],['model_sonnet_25k','models','diamond','\u{1F3B5}'],['model_sonnet_50k','models','diamond','\u{1F3B6}'],['model_sonnet_100k','models','diamond','\u{1F3BC}'],['model_opus_25k','models','diamond','\u{1F3AD}'],['model_opus_50k','models','diamond','\u{1F3BB}'],['model_opus_100k','models','diamond','\u{1F3BA}'],['model_haiku_10k','models','platinum','\u{1F338}'],['model_haiku_25k','models','diamond','\u{1F33A}'],['model_haiku_50k','models','diamond','\u{1F343}'],['triple_model_day_10','models','platinum','\u{1F308}'],['triple_model_day_50','models','diamond','\u{1FA84}'],['model_opus_majority','models','diamond','\u{1F451}'],['model_sonnet_majority','models','platinum','\u{1F3AF}'],['model_haiku_majority','models','platinum','\u{1F342}'],
    ['tool_diversity_25','tools','diamond','\u{1F9F0}'],['tool_diversity_30','tools','diamond','\u{1F6E0}'],['tool_1m_calls','tools','diamond','\u26A1'],['tool_2m_calls','tools','diamond','\u{1F50C}'],['tool_5m_calls','tools','diamond','\u2699'],['tool_bash_100k','tools','diamond','\u{1F4BB}'],['tool_bash_250k','tools','diamond','\u{1F5A5}'],['tool_bash_500k','tools','diamond','\u2328'],['tool_read_100k','tools','diamond','\u{1F4D6}'],['tool_read_250k','tools','diamond','\u{1F4D7}'],['tool_read_500k','tools','diamond','\u{1F4DA}'],['tool_edit_100k','tools','diamond','\u{1F50F}'],['tool_edit_250k','tools','diamond','\u{1F4D0}'],['tool_edit_500k','tools','diamond','\u2702'],['tool_write_100k','tools','diamond','\u{1F4DD}'],['tool_write_250k','tools','diamond','\u{1F4D8}'],['tool_grep_50k','tools','platinum','\u{1F50D}'],['tool_grep_100k','tools','diamond','\u{1F50E}'],['tool_grep_250k','tools','diamond','\u{1F9D0}'],['tool_glob_50k','tools','platinum','\u{1F4C1}'],['tool_glob_100k','tools','diamond','\u{1F5FA}'],['tool_task_5k','tools','platinum','\u{1F4CB}'],['tool_task_10k','tools','diamond','\u{1F4CC}'],['tool_task_25k','tools','diamond','\u{1F4CE}'],['tool_task_50k','tools','diamond','\u{1F5C2}'],
    ['early_bird_1000','time','diamond','\u{1F305}'],['night_owl_1000','time','diamond','\u{1F319}'],['marathon_200','time','diamond','\u{1F3C3}'],['marathon_500','time','diamond','\u{1F3CB}'],['marathon_8h_10','time','diamond','\u{1F550}'],['marathon_8h_25','time','diamond','\u{1F551}'],['marathon_8h_50','time','diamond','\u{1F552}'],['marathon_12h_5','time','diamond','\u{1F553}'],['marathon_12h_10','time','diamond','\u{1F554}'],['marathon_12h_25','time','diamond','\u{1F555}'],['marathon_16h_1','time','diamond','\u{1F556}'],['marathon_16h_5','time','diamond','\u{1F557}'],['peak_2000_msgs','time','diamond','\u{1F4CA}'],['peak_5000_msgs','time','diamond','\u{1F4A5}'],['peak_tokens_10m','time','diamond','\u{1F321}'],['peak_tokens_25m','time','diamond','\u{1FAE0}'],['peak_tokens_50m','time','diamond','\u{1F525}'],['weekend_sessions_100','time','platinum','\u{1F3D6}'],['weekend_sessions_500','time','diamond','\u26F1'],['max_sessions_day_10','time','gold','\u{1F4C5}'],['max_sessions_day_25','time','platinum','\u{1F4C6}'],['max_sessions_day_50','time','diamond','\u{1F5D3}'],['consec_months_6','time','gold','\u{1F4C5}'],['consec_months_12','time','platinum','\u{1F4C6}'],['consec_months_24','time','diamond','\u{1F5D3}'],
    ['project_150','projects','diamond','\u{1F3D8}'],['project_200','projects','diamond','\u{1F307}'],['project_300','projects','diamond','\u{1F303}'],['project_500','projects','diamond','\u{1F30D}'],['proj_sessions_100','projects','platinum','\u{1F4C2}'],['proj_sessions_250','projects','diamond','\u{1F4C1}'],['proj_sessions_500','projects','diamond','\u{1F5C2}'],['proj_sessions_1k','projects','diamond','\u{1F3E2}'],['proj_msgs_1k','projects','gold','\u{1F4AC}'],['proj_msgs_5k','projects','platinum','\u{1F5E8}'],['proj_msgs_10k','projects','diamond','\u{1F4E8}'],['proj_msgs_50k','projects','diamond','\u{1F4EC}'],['proj_cost_100','projects','gold','\u{1F4B0}'],['proj_cost_500','projects','platinum','\u{1F4B8}'],['proj_cost_1k','projects','diamond','\u{1F911}'],['proj_cost_5k','projects','diamond','\u{1F3E6}'],['proj_tokens_10m','projects','platinum','\u{1F522}'],['proj_tokens_50m','projects','diamond','\u{1F9EE}'],['proj_tokens_100m','projects','diamond','\u{1F4DF}'],['multi_proj_day_15','projects','diamond','\u{1F500}'],
    ['streak_500','streaks','diamond','\u{1F525}'],['streak_730','streaks','diamond','\u{1F31F}'],['streak_1000','streaks','diamond','\u{1F4AB}'],['streak_1500','streaks','diamond','\u2B50'],['streak_2000','streaks','diamond','\u{1F3C6}'],['active_days_1500','streaks','diamond','\u{1F4C6}'],['active_days_2000','streaks','diamond','\u{1F4C5}'],['active_days_2500','streaks','diamond','\u{1F5D3}'],['active_days_3650','streaks','diamond','\u{1F3AF}'],['months_active_48','streaks','diamond','\u{1F4C5}'],['months_active_60','streaks','diamond','\u{1F3DB}'],['weeks_active_50','streaks','gold','\u{1F4C5}'],['weeks_active_100','streaks','platinum','\u{1F4C6}'],['weeks_active_150','streaks','diamond','\u{1F5D3}'],['weeks_active_200','streaks','diamond','\u{1F3AF}'],['consec_months_active_6','streaks','gold','\u{1F517}'],['consec_months_active_12','streaks','platinum','\u26D3'],['consec_months_active_24','streaks','diamond','\u{1F512}'],['consec_months_active_36','streaks','diamond','\u{1F510}'],['days_5_sessions_25','streaks','diamond','\u{1F4CA}'],
    ['cache_tokens_1b','cache','diamond','\u{1F4BE}'],['cache_tokens_2b','cache','diamond','\u{1F5C4}'],['cache_tokens_5b','cache','diamond','\u{1F5B2}'],['cache_tokens_10b','cache','diamond','\u{1F4BD}'],['cache_and_tokens_100m','cache','platinum','\u{1F3CE}'],['cache_and_tokens_500m','cache','diamond','\u{1F680}'],['cache_and_tokens_1b','cache','diamond','\u26A1'],['cache_and_sessions_1k','cache','diamond','\u{1F527}'],['cache_and_cost_1k','cache','diamond','\u{1F4B0}'],['cache_master_90_100d','cache','diamond','\u{1F3C5}'],['cache_king_95_365d','cache','diamond','\u{1F451}'],['cache_and_msgs_100k','cache','diamond','\u{1F4AC}'],['cache_and_msgs_500k','cache','diamond','\u{1F5E8}'],['cache_and_projects_50','cache','diamond','\u{1F4C2}'],['cache_emperor','cache','diamond','\u{1F3C6}'],
    ['full_weekend_100','special','diamond','\u{1F3D6}'],['full_weekend_200','special','diamond','\u26F1'],['consec_weekends_12','special','diamond','\u{1F3AA}'],['consec_weekends_26','special','diamond','\u{1F3A1}'],['consec_weekends_52','special','diamond','\u{1F3A2}'],['sunday_coder_50','special','gold','\u2615'],['sunday_coder_100','special','platinum','\u{1F375}'],['sunday_coder_200','special','diamond','\u{1FAD6}'],['century_session_10','special','platinum','\u{1F4AF}'],['century_session_50','special','diamond','\u{1F3C5}'],['century_session_100','special','diamond','\u{1F3C6}'],['veteran_1y','special','diamond','\u{1F396}'],['veteran_2y','special','diamond','\u{1F3DB}'],['grandmaster','special','diamond','\u265F'],['unstoppable','special','diamond','\u{1F9BE}'],['diverse_master','special','diamond','\u{1F310}'],['code_factory','special','diamond','\u{1F3ED}'],['token_billionaire','special','diamond','\u{1F934}'],['marathon_lord','special','diamond','\u{1F478}'],['night_lord','special','diamond','\u{1F9DB}'],['early_riser_elite','special','diamond','\u{1F413}'],['project_empire','special','diamond','\u{1F306}'],['infinity_coder','special','diamond','\u267E'],['the_machine','special','diamond','\u{1F916}'],['all_rounder','special','diamond','\u{1F3AA}'],['opus_elite','special','diamond','\u{1F3AD}'],['model_master','special','diamond','\u{1F3A8}'],['proj_above_100s_3','special','diamond','\u{1F3D7}'],['multi_proj_day_20','special','diamond','\u{1F504}'],['sessions_500_msgs_5','special','diamond','\u{1F32A}']
  ];
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
  const achievementsData = achDefs.map(([key, category, tier, emoji]) => ({
    key, category, tier, emoji,
    unlocked: unlockedKeys.has(key),
    unlockedAt: unlockedKeys.has(key) ? days[Math.floor(Math.random() * days.length)] + 'T12:00:00Z' : null
  }));

  // --- Tool stats (enhanced for Tools tab) ---
  // Built-in tools + a few MCP tools with realistic cost/token attribution
  const toolStatsRaw = [
    { name: 'Read', calls: 1240, type: 'built-in' },
    { name: 'Edit', calls: 685, type: 'built-in' },
    { name: 'Bash', calls: 542, type: 'built-in' },
    { name: 'Grep', calls: 418, type: 'built-in' },
    { name: 'Glob', calls: 312, type: 'built-in' },
    { name: 'Write', calls: 248, type: 'built-in' },
    { name: 'Task', calls: 142, type: 'built-in' },
    { name: 'TodoWrite', calls: 96, type: 'built-in' },
    { name: 'WebFetch', calls: 64, type: 'built-in' },
    { name: 'WebSearch', calls: 38, type: 'built-in' },
    { name: 'NotebookEdit', calls: 22, type: 'built-in' },
    { name: 'mcp__github__create_issue', calls: 18, type: 'mcp', server: 'github' },
    { name: 'mcp__github__list_pull_requests', calls: 15, type: 'mcp', server: 'github' },
    { name: 'mcp__github__create_pr_review', calls: 9, type: 'mcp', server: 'github' },
    { name: 'mcp__slack__post_message', calls: 14, type: 'mcp', server: 'slack' },
    { name: 'mcp__slack__search_messages', calls: 7, type: 'mcp', server: 'slack' },
    { name: 'mcp__playwright__browser_navigate', calls: 12, type: 'mcp', server: 'playwright' },
    { name: 'mcp__playwright__browser_snapshot', calls: 8, type: 'mcp', server: 'playwright' }
  ];
  const _toolTotalCalls = toolStatsRaw.reduce((a, t) => a + t.calls, 0);
  const toolStatsData = toolStatsRaw
    .map(t => {
      const costPerCall = t.type === 'mcp' ? 0.018 : 0.012;
      const tokensPerCall = t.type === 'mcp' ? 1850 : 1420;
      const calls = t.calls;
      const tokens = Math.round(calls * tokensPerCall);
      const cost = Math.round(calls * costPerCall * 100) / 100;
      const displayName = t.type === 'mcp' ? t.name.split('__').slice(2).join('__') : t.name;
      return {
        name: t.name,
        displayName,
        type: t.type,
        server: t.server || null,
        calls,
        cost,
        tokens,
        inputTokens: Math.round(tokens * 0.32),
        outputTokens: Math.round(tokens * 0.08),
        cacheReadTokens: Math.round(tokens * 0.55),
        cacheCreateTokens: Math.round(tokens * 0.05),
        messages: Math.max(1, Math.round(calls / 4.5)),
        percentage: Math.round((calls / _toolTotalCalls) * 1000) / 10
      };
    })
    .sort((a, b) => b.cost - a.cost);

  // --- MCP servers (auto-grouped from MCP entries above) ---
  const mcpServersData = (() => {
    const byServer = {};
    for (const t of toolStatsData) {
      if (t.type !== 'mcp') continue;
      const srv = t.server;
      if (!byServer[srv]) byServer[srv] = { name: srv, totalCalls: 0, totalCost: 0, totalTokens: 0, tools: [] };
      byServer[srv].totalCalls += t.calls;
      byServer[srv].totalCost += t.cost;
      byServer[srv].totalTokens += t.tokens;
      byServer[srv].tools.push({ name: t.displayName, calls: t.calls, cost: t.cost, tokens: t.tokens });
    }
    return Object.values(byServer)
      .map(s => ({ ...s, totalCost: Math.round(s.totalCost * 100) / 100 }))
      .sort((a, b) => b.totalCost - a.totalCost);
  })();

  // --- Sub-agent stats ---
  const subagentStatsData = (() => {
    const subMessages = 42;
    const subCost = 1.84;
    const subTokens = 246800;
    const subDaily = days.map((date, i) => {
      const factor = i >= 8 ? (0.4 + Math.random() * 0.7) : 0;
      const msgs = Math.round(4 * factor);
      const tokens = Math.round(28000 * factor);
      const cost = Math.round(0.21 * factor * 100) / 100;
      return msgs > 0 ? { date, messages: msgs, tokens, cost } : null;
    }).filter(Boolean);
    return {
      messages: subMessages,
      tokens: subTokens,
      cost: subCost,
      pctMessages: 5.0,
      pctCost: 8.1,
      daily: subDaily
    };
  })();

  // --- Tool cost daily (stacked area chart input) ---
  // Each day: { date, [toolName]: cost }
  const toolCostDailyData = days.map((date, i) => {
    const factor = 0.5 + Math.sin(i * 0.7) * 0.3 + (i / 15) * 0.3;
    const entry = { date };
    const topTools = ['Read', 'Edit', 'Bash', 'Grep', 'Glob', 'Write'];
    for (const t of topTools) {
      const base = { Read: 1.85, Edit: 1.20, Bash: 0.95, Grep: 0.55, Glob: 0.32, Write: 0.42 }[t];
      entry[t] = Math.round(base * factor * 100) / 100;
    }
    return entry;
  });

  // --- Rate limit events ---
  const rateLimitsData = (() => {
    // 4 hits across the 15-day window, randomly distributed
    const hits = [
      { date: days[3], count: 1 },
      { date: days[6], count: 2 },
      { date: days[11], count: 1 }
    ];
    return { total: hits.reduce((a, h) => a + h.count, 0), daily: hits };
  })();

  // --- Plan usage (Claude.ai plan limits) ---
  const planUsageData = {
    planUsage: {
      currentSession: {
        percentUsed: 38,
        resetsInSeconds: 3 * 3600 + 24 * 60
      },
      weeklyAllModels: {
        percentUsed: 56,
        resetsAt: new Date(Date.now() + 4 * 86400000).toISOString()
      },
      weeklySonnet: {
        percentUsed: 41,
        resetsAt: new Date(Date.now() + 4 * 86400000).toISOString()
      },
      fetchedAt: new Date(Date.now() - 90 * 1000).toISOString()
    }
  };

  // --- GitHub: stats (heatmap, commits, repos, PRs, languages) ---
  const githubStatsData = (() => {
    // 365-day heatmap; commits cluster around weekdays + last 60 days higher
    const heatmap = [];
    const heatmapStart = new Date(now);
    heatmapStart.setDate(heatmapStart.getDate() - 364);
    for (let i = 0; i < 365; i++) {
      const d = new Date(heatmapStart);
      d.setDate(d.getDate() + i);
      const dayOfWeek = d.getDay();
      const recencyBoost = i / 365;
      const weekdayBoost = (dayOfWeek >= 1 && dayOfWeek <= 5) ? 1 : 0.4;
      const r = Math.random();
      let count = 0;
      if (r < 0.30 * weekdayBoost + 0.20 * recencyBoost) count = 1 + Math.floor(Math.random() * 3);
      if (r < 0.12 * weekdayBoost + 0.18 * recencyBoost) count = 4 + Math.floor(Math.random() * 4);
      if (r < 0.04 * weekdayBoost + 0.10 * recencyBoost) count = 8 + Math.floor(Math.random() * 6);
      heatmap.push({
        date: d.toISOString().slice(0, 10),
        count,
        color: count === 0 ? '#161b22' : count < 4 ? '#0e4429' : count < 7 ? '#006d32' : count < 10 ? '#26a641' : '#39d353'
      });
    }
    const commitDaily = heatmap.filter(d => d.count > 0).map(d => ({ date: d.date, commits: d.count }));
    const totalContributions = heatmap.reduce((s, d) => s + d.count, 0);
    const commitCount = commitDaily.reduce((s, d) => s + d.commits, 0);

    const repoNames = [
      ['token-tracker', 'JavaScript', '#f1e05a', 142, 18],
      ['claude-remote', 'JavaScript', '#f1e05a', 89, 11],
      ['smart-home-dashboard', 'HTML', '#e34c26', 67, 8],
      ['go-sling', 'Go', '#00ADD8', 54, 6],
      ['hue-controller', 'JavaScript', '#f1e05a', 38, 4],
      ['lichtwerk-controller', 'JavaScript', '#f1e05a', 31, 3],
      ['yamaha-controller', 'JavaScript', '#f1e05a', 24, 2],
      ['fog-controller', 'JavaScript', '#f1e05a', 19, 2],
      ['raspi-monitor', 'TypeScript', '#3178c6', 47, 5],
      ['playground', 'HTML', '#e34c26', 12, 1],
      ['weather-station', 'Python', '#3572A5', 28, 3],
      ['dotfiles', 'Shell', '#89e051', 15, 2]
    ];
    const repos = repoNames.map(([name, lang, color, stars, forks], i) => ({
      name,
      nameWithOwner: 'demo-user/' + name,
      stars,
      forks,
      language: lang,
      languageColor: color,
      updatedAt: new Date(now - i * 3 * 86400000).toISOString(),
      isPrivate: i >= 9
    }));
    const totalStars = repos.reduce((s, r) => s + r.stars, 0);
    const totalForks = repos.reduce((s, r) => s + r.forks, 0);

    const langMap = {};
    for (const r of repos) {
      if (!langMap[r.language]) langMap[r.language] = { name: r.language, count: 0, color: r.languageColor };
      langMap[r.language].count++;
    }
    const languages = Object.values(langMap).sort((a, b) => b.count - a.count);

    // PR stats — 28 total PRs (20 merged, 5 open, 3 closed)
    const prStats = {
      total: 28,
      open: 5,
      merged: 20,
      closed: 3,
      totalAdditions: 12480,
      totalDeletions: 4720,
      netLines: 7760,
      totalChangedFiles: 184,
      codeByState: {
        merged: { additions: 9450, deletions: 3580 },
        open: { additions: 2240, deletions: 820 },
        closed: { additions: 790, deletions: 320 }
      }
    };

    return {
      heatmap,
      totalContributions,
      commitCount,
      prContributions: 28,
      repos,
      repoCount: repos.length,
      totalStars,
      totalForks,
      prStats,
      languages,
      commitDaily,
      _age: 12,
      _cached: true
    };
  })();

  // --- GitHub: billing (Actions minutes, storage, packages) ---
  const githubBillingData = {
    actions: {
      plan: 'Pro',
      totalMinutesUsed: 1842,
      includedMinutes: 3000,
      percentUsed: 61.4,
      minutesUsedBreakdown: {
        UBUNTU: 1420,
        MACOS: 380,
        WINDOWS: 42
      }
    },
    storage: {
      estimatedStorageGB: 0.84,
      includedStorageGB: 2.0,
      daysLeftInCycle: 12
    },
    packages: {
      totalGigabytesBandwidthUsed: 0.18,
      includedGigabytesBandwidth: 2.0
    },
    resetDate: (() => {
      const d = new Date(now); d.setDate(d.getDate() + 12); return d.toISOString().slice(0, 10);
    })()
  };

  // --- GitHub: actions usage (per-repo workflow minutes) ---
  const githubActionsUsageData = {
    repos: [
      { name: 'token-tracker', totalMinutes: 620, workflows: [
        { name: 'Deploy to VPS', billableMinutes: 420 },
        { name: 'Tests', billableMinutes: 200 }
      ]},
      { name: 'smart-home-dashboard', totalMinutes: 380, workflows: [
        { name: 'Build & Deploy', billableMinutes: 380 }
      ]},
      { name: 'claude-remote', totalMinutes: 260, workflows: [
        { name: 'Tests', billableMinutes: 180 },
        { name: 'Lint', billableMinutes: 80 }
      ]},
      { name: 'go-sling', totalMinutes: 195, workflows: [
        { name: 'Cross-compile', billableMinutes: 195 }
      ]},
      { name: 'raspi-monitor', totalMinutes: 140, workflows: [
        { name: 'CI', billableMinutes: 140 }
      ]},
      { name: 'playground', totalMinutes: 92, workflows: [
        { name: 'Deploy', billableMinutes: 92 }
      ]},
      { name: 'weather-station', totalMinutes: 64, workflows: [
        { name: 'Python tests', billableMinutes: 64 }
      ]}
    ]
  };

  // --- GitHub: code stats (LOC across top repos) ---
  const githubCodeStatsData = (() => {
    const weekly = [];
    const weeks = 52;
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weeks * 7);
    for (let i = 0; i < weeks; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i * 7);
      const factor = 0.3 + Math.sin(i * 0.3) * 0.4 + (i / weeks) * 0.5;
      weekly.push({
        week: d.toISOString().slice(0, 10),
        additions: Math.round(620 * factor),
        deletions: Math.round(280 * factor)
      });
    }
    return { weekly, repos: 8, _age: 12, _cached: true };
  })();

  // --- GitHub: code frequency (per-repo weekly additions/deletions) ---
  const githubCodeFrequencyData = (() => {
    const weeks = 52;
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weeks * 7);
    const data = [];
    for (let i = 0; i < weeks; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i * 7);
      const factor = 0.4 + Math.sin(i * 0.4) * 0.5 + (i / weeks) * 0.4;
      data.push({
        week: d.toISOString().slice(0, 10),
        additions: Math.round(180 * factor),
        deletions: Math.round(90 * factor)
      });
    }
    return data;
  })();

  // --- Anthropic API dashboard data ---
  const anthropicDashboardData = (() => {
    // Generate 30 days of API usage
    const apiDays = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      apiDays.push(d.toISOString().slice(0, 10));
    }
    const apiModels = [
      { id: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
      { id: 'claude-opus-4-6', label: 'Opus 4.6' },
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' }
    ];
    const dailyCosts = apiDays.map((date, i) => {
      const factor = 0.4 + Math.sin(i * 0.5) * 0.3 + (i / 30) * 0.4;
      const entry = { date, total: 0 };
      for (const m of apiModels) {
        const base = m.label.includes('Sonnet') ? 4.2 : m.label.includes('Opus') ? 6.8 : 0.6;
        const c = Math.round(base * factor * 100) / 100;
        entry[m.label] = c;
        entry.total += c;
      }
      entry.total = Math.round(entry.total * 100) / 100;
      return entry;
    });
    const dailyTokens = apiDays.map((date, i) => {
      const factor = 0.4 + Math.sin(i * 0.5) * 0.3 + (i / 30) * 0.4;
      return {
        date,
        input: Math.round(180000 * factor),
        output: Math.round(64000 * factor),
        cacheRead: Math.round(820000 * factor),
        cacheCreate: Math.round(42000 * factor)
      };
    });
    const totalCost = Math.round(dailyCosts.reduce((s, d) => s + d.total, 0) * 100) / 100;
    const totalInput = dailyTokens.reduce((s, d) => s + d.input, 0);
    const totalOutput = dailyTokens.reduce((s, d) => s + d.output, 0);
    const totalCacheRead = dailyTokens.reduce((s, d) => s + d.cacheRead, 0);
    const totalCacheCreate = dailyTokens.reduce((s, d) => s + d.cacheCreate, 0);
    const totalTokens = totalInput + totalOutput + totalCacheRead + totalCacheCreate;
    const activeDays = dailyCosts.filter(d => d.total > 0).length;
    const modelBreakdown = apiModels.map(m => {
      const cost = Math.round(dailyCosts.reduce((s, d) => s + (d[m.label] || 0), 0) * 100) / 100;
      const shareFactor = m.label.includes('Sonnet') ? 0.50 : m.label.includes('Opus') ? 0.42 : 0.08;
      return {
        model: m.label,
        input: Math.round(totalInput * shareFactor),
        output: Math.round(totalOutput * shareFactor),
        cacheRead: Math.round(totalCacheRead * shareFactor),
        cacheCreate: Math.round(totalCacheCreate * shareFactor),
        cost
      };
    });
    // Per-API-key data: 2 keys (matches lib/anthropic-api.js schema)
    const apiKeys = [
      { keyId: 'apikey_01ABCDEFGHJKLMNPQR', keyName: 'prod-app', share: 0.72 },
      { keyId: 'apikey_01ZYXWVUTSRQPONMLK', keyName: 'dev-experiments', share: 0.28 }
    ];
    const keyTotals = apiKeys.map(k => {
      const tokens = Math.round(totalTokens * k.share);
      const input = Math.round(totalInput * k.share);
      const output = Math.round(totalOutput * k.share);
      const cacheRead = Math.round(totalCacheRead * k.share);
      const cacheCreate = Math.round(totalCacheCreate * k.share);
      const calculatedCost = Math.round(totalCost * k.share * 100) / 100;
      return {
        keyId: k.keyId,
        keyName: k.keyName,
        totalTokens: tokens,
        totalInput: input,
        totalOutput: output,
        totalCacheRead: cacheRead,
        totalCacheCreate: cacheCreate,
        calculatedCost,
        lastUsed: apiDays[apiDays.length - 1 - Math.floor(Math.random() * 3)]
      };
    });
    const keyBreakdown = [];
    for (const k of apiKeys) {
      for (const m of apiModels) {
        const mb = modelBreakdown.find(x => x.model === m.label);
        keyBreakdown.push({
          keyId: k.keyId,
          keyName: k.keyName,
          model: m.label,
          input: Math.round(mb.input * k.share),
          output: Math.round(mb.output * k.share),
          cacheRead: Math.round(mb.cacheRead * k.share),
          cacheCreate: Math.round(mb.cacheCreate * k.share),
          calculatedCost: Math.round(mb.cost * k.share * 100) / 100
        });
      }
    }
    const dailyTokensByKey = apiDays.map((date, i) => {
      const byKey = {};
      const dt = dailyTokens[i];
      const dc = dailyCosts[i];
      for (const k of apiKeys) {
        byKey[k.keyId] = {
          keyName: k.keyName,
          input: Math.round(dt.input * k.share),
          output: Math.round(dt.output * k.share),
          cacheRead: Math.round(dt.cacheRead * k.share),
          cacheCreate: Math.round(dt.cacheCreate * k.share),
          total: Math.round((dt.input + dt.output + dt.cacheRead + dt.cacheCreate) * k.share),
          calculatedCost: Math.round(dc.total * k.share * 100) / 100
        };
      }
      return { date, byKey };
    });

    return {
      totalCost,
      totalTokens,
      totalInput,
      totalOutput,
      totalCacheRead,
      totalCacheCreate,
      avgCostPerDay: activeDays > 0 ? Math.round((totalCost / activeDays) * 100) / 100 : 0,
      cacheEfficiency: totalTokens > 0 ? Math.round((totalCacheRead / totalTokens) * 1000) / 10 : 0,
      dailyCosts,
      dailyTokens,
      modelBreakdown,
      keyTotals,
      keyBreakdown,
      dailyTokensByKey,
      _age: 8,
      _cached: true
    };
  })();

  // --- Anthropic budget (set for demo) ---
  const anthropicBudgetData = { budget: 250 };

  // --- Project detail (dynamic factory: called with query params) ---
  function buildProjectDetail(params) {
    const name = params.name || projects[0];
    const matchingSessions = sessionsData.filter(s => s.project === name);
    const inputT = matchingSessions.reduce((a, s) => a + s.inputTokens, 0);
    const outputT = matchingSessions.reduce((a, s) => a + s.outputTokens, 0);
    const cacheR = matchingSessions.reduce((a, s) => a + s.cacheReadTokens, 0);
    const cacheC = matchingSessions.reduce((a, s) => a + s.cacheCreateTokens, 0);
    const cost = matchingSessions.reduce((a, s) => a + s.cost, 0);
    const messages = matchingSessions.reduce((a, s) => a + s.messages, 0);
    const linesAdded = matchingSessions.reduce((a, s) => a + s.linesAdded, 0);
    const linesRemoved = matchingSessions.reduce((a, s) => a + s.linesRemoved, 0);
    const linesWritten = matchingSessions.reduce((a, s) => a + s.linesWritten, 0);

    // Daily breakdown
    const dailyByDate = {};
    for (const s of matchingSessions) {
      const date = s.firstTs.slice(0, 10);
      if (!dailyByDate[date]) {
        dailyByDate[date] = { date, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, cost: 0, messages: 0, linesAdded: 0, linesRemoved: 0, linesWritten: 0 };
      }
      const d = dailyByDate[date];
      d.inputTokens += s.inputTokens;
      d.outputTokens += s.outputTokens;
      d.cacheReadTokens += s.cacheReadTokens;
      d.cacheCreateTokens += s.cacheCreateTokens;
      d.cost += s.cost;
      d.messages += s.messages;
      d.linesAdded += s.linesAdded;
      d.linesRemoved += s.linesRemoved;
      d.linesWritten += s.linesWritten;
    }
    const dailyArr = Object.values(dailyByDate).sort((a, b) => a.date.localeCompare(b.date));

    // Model breakdown
    const modelMap = {};
    for (const s of matchingSessions) {
      const lbl = s.models[0];
      if (!modelMap[lbl]) modelMap[lbl] = { name: lbl, messages: 0, tokens: 0, cost: 0 };
      modelMap[lbl].messages += s.messages;
      modelMap[lbl].tokens += s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreateTokens;
      modelMap[lbl].cost += s.cost;
    }
    const modelArr = Object.values(modelMap).map(m => ({ ...m, cost: Math.round(m.cost * 100) / 100 })).sort((a, b) => b.tokens - a.tokens);

    // Active time approx: messages * 1.4 min avg, capped sensibly
    const totalDurationMin = matchingSessions.reduce((a, s) => a + s.durationMin, 0);
    const totalActiveMin = Math.min(totalDurationMin, Math.round(messages * 1.4));

    return {
      name,
      totalTokens: inputT + outputT + cacheR + cacheC,
      inputTokens: inputT, outputTokens: outputT,
      cacheReadTokens: cacheR, cacheCreateTokens: cacheC,
      cost: Math.round(cost * 100) / 100,
      messages,
      sessions: matchingSessions.length,
      linesAdded, linesRemoved, linesWritten,
      firstTs: matchingSessions[0]?.firstTs || null,
      lastTs: matchingSessions[matchingSessions.length - 1]?.lastTs || null,
      totalDurationMin,
      totalActiveMin,
      models: modelArr,
      tools: [
        { name: 'Read', calls: Math.round(messages * 1.6) },
        { name: 'Edit', calls: Math.round(messages * 0.9) },
        { name: 'Bash', calls: Math.round(messages * 0.7) },
        { name: 'Grep', calls: Math.round(messages * 0.5) },
        { name: 'Glob', calls: Math.round(messages * 0.4) },
        { name: 'Write', calls: Math.round(messages * 0.3) }
      ],
      daily: dailyArr,
      sessionList: matchingSessions.slice(0, 50)
    };
  }

  // --- Devices (empty for demo — no devices configured) ---
  const devicesData = [];

  // --- Usage trends (now-anchored comparisons for the overview trend cards) ---
  const trendsData = (() => {
    const now = new Date();
    const hourShape = (h) => (h >= 9 && h <= 19) ? 0.3 + Math.sin((h - 9) / 10 * Math.PI) : (h >= 7 && h <= 23 ? 0.15 : 0.02);
    const mkBucket = (scale) => {
      const tokens = Math.round(scale * (0.75 + Math.random() * 0.5));
      const tokensNoCache = Math.round(tokens * 0.04);
      const cost = Math.round(tokens / 1e6 * 0.9 * 100) / 100;
      return { tokens, tokensNoCache, cost, costNoCache: Math.round(cost * 0.32 * 100) / 100 };
    };
    const mkHourly = (scale, upToHour) => Array.from({ length: 24 }, (_, h) =>
      (upToHour !== undefined && h > upToHour) ? { tokens: 0, tokensNoCache: 0, cost: 0, costNoCache: 0 } : mkBucket(scale * hourShape(h)));
    const mkDaily = (n, scale, upToDay) => Array.from({ length: n }, (_, i) =>
      (upToDay !== undefined && i >= upToDay) ? { tokens: 0, tokensNoCache: 0, cost: 0, costNoCache: 0 } : mkBucket(scale * (i % 7 >= 5 ? 0.45 : 1)));
    const sumOf = (arr, msgsPerM = 2.6, actPerM = 0.55) => {
      const s = { tokens: 0, tokensNoCache: 0, cost: 0, costNoCache: 0, messages: 0, activeMin: 0 };
      for (const b of arr) { s.tokens += b.tokens; s.tokensNoCache += b.tokensNoCache; s.cost += b.cost; s.costNoCache += b.costNoCache; }
      s.cost = Math.round(s.cost * 100) / 100;
      s.costNoCache = Math.round(s.costNoCache * 100) / 100;
      s.messages = Math.round(s.tokens / 1e6 * msgsPerM);
      s.activeMin = Math.round(s.tokens / 1e6 * actPerM);
      return s;
    };
    const h = now.getHours();
    const dow = (now.getDay() + 6) % 7;
    const dom = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysInPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();

    const todayCur = mkHourly(140e6, h);
    const todayPrev = mkHourly(115e6);
    const weekCur = mkDaily(7, 1.9e9, dow + 1);
    const weekPrev = mkDaily(7, 1.55e9);
    const monthCur = mkDaily(daysInMonth, 1.8e9, dom);
    const monthPrev = mkDaily(daysInPrevMonth, 1.45e9);
    const rollCur = mkDaily(7, 1.85e9);
    const rollPrev = mkDaily(7, 1.5e9);

    // 90-day series with a gentle upward trend + weekend dips
    const day90 = Array.from({ length: 90 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (89 - i));
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      const b = mkBucket(1.35e9 * (0.6 + (i / 89) * 0.8) * (weekend ? 0.4 : 1));
      return {
        date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
        ...b,
        messages: Math.round(b.tokens / 1e6 * 2.6)
      };
    });
    const mkMom = (scale) => { const b = mkBucket(scale); return { ...b, messages: Math.round(b.tokens / 1e6 * 2.6) }; };
    const momentum = {
      windowDays: 7,
      projects: [
        { name: 'my-webapp', cur: mkMom(5.4e9), prev: mkMom(3.1e9) },
        { name: 'api-server', cur: mkMom(2.8e9), prev: mkMom(4.2e9) },
        { name: 'mobile-app', cur: mkMom(1.9e9), prev: mkMom(1.2e9) }
      ],
      models: [
        { name: 'Claude Sonnet 4.5', cur: mkMom(5.1e9), prev: mkMom(5.8e9) },
        { name: 'Claude Opus 4.6', cur: mkMom(4.2e9), prev: mkMom(2.1e9) },
        { name: 'Claude Haiku 4.5', cur: mkMom(0.8e9), prev: mkMom(0.6e9) }
      ]
    };

    const cutSum = (arr, n) => sumOf(arr.slice(0, n));
    return {
      generatedAt: now.toISOString(),
      daily90: day90,
      momentum,
      today: { current: sumOf(todayCur), prevSame: cutSum(todayPrev, h + 1), prevFull: sumOf(todayPrev), series: { cur: todayCur, prev: todayPrev } },
      week: { current: sumOf(weekCur), prevSame: cutSum(weekPrev, dow + 1), prevFull: sumOf(weekPrev), series: { cur: weekCur, prev: weekPrev } },
      month: {
        current: sumOf(monthCur), prevSame: cutSum(monthPrev, Math.min(dom, daysInPrevMonth)), prevFull: sumOf(monthPrev),
        elapsedFraction: Math.min(1, Math.max(0.03, dom / daysInMonth)),
        series: { cur: monthCur, prev: monthPrev }
      },
      rolling7: { current: sumOf(rollCur), prevSame: sumOf(rollPrev), prevFull: sumOf(rollPrev), series: { cur: rollCur, prev: rollPrev } }
    };
  })();

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
    'hourly-by-model': Array.from({ length: 24 }, (_, h) => {
      const entry = { date: String(h).padStart(2, '0') + ':00' };
      for (const m of models) {
        const base = m.id.includes('sonnet') ? 4000 : m.id.includes('opus') ? 2500 : 1200;
        const activity = (h >= 9 && h <= 18) ? 1 + Math.sin((h - 9) / 9 * Math.PI) : (h >= 7 && h <= 22 ? 0.2 : 0);
        entry[m.label] = Math.round(base * activity * (0.7 + Math.random() * 0.6));
      }
      return entry;
    }),
    'daily-cost-breakdown': dailyCostBreakdownData,
    'cumulative-cost': cumulativeCostData,
    'day-of-week': dayOfWeekData,
    'hourly-weekday': hourlyWeekdayData,
    'cache-efficiency': cacheEfficiencyData,
    'stop-reasons': stopReasonsData,
    'session-efficiency': sessionEfficiencyData,
    'active-sessions': activeSessionsData,
    'productivity': (() => {
      const dailyProd = dailyData.map(d => {
        const dayLines = (d.linesWritten || 0) + (d.linesAdded || 0);
        const dayHours = 2 + Math.random() * 4;
        return {
          date: d.date,
          linesPerHour: dayHours > 0 ? Math.round(dayLines / dayHours) : 0,
          costPerLine: dayLines > 0 ? Math.round(d.cost / dayLines * 1000) / 1000 : 0
        };
      });
      return {
        tokensPerMin: 842,
        linesPerHour: 156,
        msgsPerSession: 20.2,
        costPerLine: 0.003,
        cacheSavings: 8.45,
        codeRatio: 34.8,
        codingHours: 56.3,
        totalLines: 8660,
        tokensPerLine: 285,
        toolsPerTurn: 2.4,
        linesPerTurn: 3.8,
        ioRatio: 12.5,
        trends: { tokensPerMin: 12, linesPerHour: -5, costPerLine: -8 },
        dailyProductivity: dailyProd,
        stopReasons: stopReasonsData
      };
    })(),
    'efficiency-trend': (() => {
      const daily = dailyData.map(d => {
        const lines = (d.linesWritten || 0) + (d.linesAdded || 0);
        return {
          date: d.date,
          tokensPerLine: lines > 0 ? Math.round(d.outputTokens / lines) : 0,
          linesPerTurn: d.messages > 0 ? Math.round((lines / d.messages) * 10) / 10 : 0,
          toolsPerTurn: d.messages > 0 ? Math.round((2.5 * d.messages / d.messages) * 10) / 10 : 0,
          ioRatio: d.inputTokens > 0 ? Math.round((d.outputTokens / d.inputTokens) * 1000) / 10 : 0
        };
      });
      const rolling = daily.map((entry, i) => {
        const w = daily.slice(Math.max(0, i - 6), i + 1);
        const avg = (f) => { const v = w.filter(x => x[f] > 0).map(x => x[f]); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length * 10) / 10 : 0; };
        return { date: entry.date, tokensPerLine: avg('tokensPerLine'), linesPerTurn: avg('linesPerTurn'), toolsPerTurn: avg('toolsPerTurn'), ioRatio: avg('ioRatio') };
      });
      return { daily, rolling };
    })(),
    'model-efficiency': [
      { model: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5', messages: 520, totalLines: 5200, tokensPerLine: 240, costPerLine: 0.002, linesPerTurn: 4.2, toolsPerTurn: 2.8, ioRatio: 14.2 },
      { model: 'claude-opus-4-6', label: 'Opus 4.6', messages: 280, totalLines: 3100, tokensPerLine: 380, costPerLine: 0.005, linesPerTurn: 3.1, toolsPerTurn: 2.1, ioRatio: 10.8 },
      { model: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', messages: 47, totalLines: 360, tokensPerLine: 120, costPerLine: 0.001, linesPerTurn: 2.6, toolsPerTurn: 1.9, ioRatio: 18.5 }
    ],
    'session-depth': (() => {
      const projects = ['token/tracker', 'claude/remote', 'smart-home', 'website'];
      return Array.from({ length: 30 }, (_, i) => {
        const msgs = 5 + Math.floor(Math.random() * 80);
        const lines = Math.floor(msgs * (1 + Math.random() * 4));
        return {
          id: 'sess-' + i,
          project: projects[i % projects.length],
          messages: msgs,
          durationMin: msgs * 2 + Math.floor(Math.random() * 60),
          totalLines: lines,
          tokensPerLine: 150 + Math.floor(Math.random() * 300),
          costPerLine: Math.round((0.001 + Math.random() * 0.008) * 1000) / 1000,
          linesPerTurn: Math.round((lines / msgs) * 10) / 10,
          toolsPerTurn: Math.round((1.5 + Math.random() * 2) * 10) / 10
        };
      });
    })(),
    'global-averages': {
      you: { totalTokens: 6994380, totalCost: 22.71, totalSessions: 42, totalMessages: 847, totalLines: 8660, cacheEfficiency: 62.4 },
      avg: { totalTokens: 5200000, totalCost: 18.50, totalSessions: 35, totalMessages: 680, totalLines: 6200, cacheEfficiency: 55.1 },
      userCount: 8
    },
    'stats-cache': { error: 'Not available in demo mode' },
    'achievements': achievementsData,
    'tool-stats': toolStatsData,
    'mcp-servers': mcpServersData,
    'subagent-stats': subagentStatsData,
    'tool-cost-daily': toolCostDailyData,
    'rate-limits': rateLimitsData,
    'plan-usage': planUsageData,
    'trends': trendsData,
    'github/stats': githubStatsData,
    'github/billing': githubBillingData,
    'github/actions-usage': githubActionsUsageData,
    'github/code-stats': githubCodeStatsData,
    'github/code-frequency': githubCodeFrequencyData,
    'anthropic/dashboard': anthropicDashboardData,
    'anthropic/budget': anthropicBudgetData,
    'devices': devicesData,
    'project-detail': buildProjectDetail
  };
})();
