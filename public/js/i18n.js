const LANG = {
  en: {
    title: 'Claude Token Tracker',
    today: 'Today',
    days7: '7 Days',
    days30: '30 Days',
    allTime: 'All Time',
    live: 'Live',
    rebuildCache: 'Rebuild Cache',
    rebuilding: 'Rebuilding...',
    // Tabs
    overview: 'Overview',
    sessions: 'Sessions',
    projects: 'Projects',
    tools: 'Tools',
    models: 'Models',
    insights: 'Insights',
    // KPI
    totalTokens: 'Total Tokens',
    estimatedCost: 'Estimated Cost',
    sessionsLabel: 'Sessions',
    messagesLabel: 'Messages',
    costSubLabel: 'API-equivalent estimate',
    uniqueSessions: 'Unique sessions',
    assistantResponses: 'Assistant responses',
    kpiTokensSub: (i, o, c) => `In: ${i} | Out: ${o} | Cache: ${c}`,
    // Charts
    dailyTokenUsage: 'Daily Token Usage',
    dailyCostTrend: 'Daily Cost Trend',
    modelDistribution: 'Model Distribution',
    activityByHour: 'Activity by Hour',
    tokensByProject: 'Tokens by Project',
    toolUsage: 'Tool Usage',
    modelUsageOverTime: 'Model Usage Over Time',
    // Insights
    costBreakdown: 'Cost Breakdown',
    cumulativeCost: 'Cumulative Cost',
    weekdayActivity: 'Weekday Activity',
    cacheEfficiency: 'Cache Efficiency',
    stopReasons: 'Stop Reasons',
    sessionEfficiency: 'Session Efficiency',
    // Table headers
    date: 'Date',
    project: 'Project',
    model: 'Model',
    duration: 'Duration',
    messages: 'Messages',
    toolCalls: 'Tools',
    tokens: 'Tokens',
    cost: 'Cost',
    totalTokensH: 'Total Tokens',
    input: 'Input',
    output: 'Output',
    cacheRead: 'Cache Read',
    cacheCreate: 'Cache Create',
    calls: 'Calls',
    pctTotal: '% of Total',
    tool: 'Tool',
    allProjects: 'All Projects',
    // Chart legends
    inputLabel: 'Input',
    outputLabel: 'Output',
    cacheReadLabel: 'Cache Read',
    cacheCreateLabel: 'Cache Create',
    apiEquivCost: 'API-equivalent Cost',
    // Stats-cache
    officialStats: 'Claude Stats (All Time)',
    parsedFromFiles: 'from session files on disk',
    totalMsgsOfficial: 'official total',
    // Data source
    dataSource: 'Source: JSONL session files',
    // Tooltips
    tooltipTotalTokens: 'Sum of input, output, cache-read, and cache-create tokens for the selected period',
    tooltipEstimatedCost: 'Cost estimate based on official API pricing per model — not actual billing',
    tooltipSessions: 'Number of unique Claude Code sessions (each CLI invocation = 1 session)',
    tooltipMessages: 'Number of assistant responses (API round-trips)',
    tooltipDailyTokens: 'Stacked bar chart showing token consumption by type per day',
    tooltipDailyCost: 'API-equivalent cost trend over time',
    tooltipModelDist: 'Token share per Claude model (Opus, Sonnet, Haiku)',
    tooltipHourly: 'When are you most active? Messages grouped by hour of day',
    tooltipCostBreakdown: 'Cost split by token type: input, output, cache-read, cache-create',
    tooltipCumulativeCost: 'Running total of estimated costs over time',
    tooltipWeekday: 'Messages and costs grouped by day of week',
    tooltipCacheEfficiency: 'Daily cache hit rate: cache-read / (input + cache-read + cache-create)',
    tooltipStopReasons: 'Why did the model stop? end_turn = natural, tool_use = called a tool',
    tooltipSessionEfficiency: 'Tokens per message vs. cost per message — lower-left is most efficient',
  },
  de: {
    title: 'Claude Token Tracker',
    today: 'Heute',
    days7: '7 Tage',
    days30: '30 Tage',
    allTime: 'Gesamt',
    live: 'Live',
    rebuildCache: 'Cache neu aufbauen',
    rebuilding: 'Wird aufgebaut...',
    // Tabs
    overview: 'Uebersicht',
    sessions: 'Sitzungen',
    projects: 'Projekte',
    tools: 'Tools',
    models: 'Modelle',
    insights: 'Insights',
    // KPI
    totalTokens: 'Tokens gesamt',
    estimatedCost: 'Geschaetzte Kosten',
    sessionsLabel: 'Sitzungen',
    messagesLabel: 'Nachrichten',
    costSubLabel: 'API-aequivalente Schaetzung',
    uniqueSessions: 'Einzigartige Sitzungen',
    assistantResponses: 'Assistenten-Antworten',
    kpiTokensSub: (i, o, c) => `In: ${i} | Out: ${o} | Cache: ${c}`,
    // Charts
    dailyTokenUsage: 'Taeglicher Token-Verbrauch',
    dailyCostTrend: 'Taeglicher Kosten-Trend',
    modelDistribution: 'Modell-Verteilung',
    activityByHour: 'Aktivitaet nach Uhrzeit',
    tokensByProject: 'Tokens nach Projekt',
    toolUsage: 'Tool-Nutzung',
    modelUsageOverTime: 'Modell-Nutzung im Zeitverlauf',
    // Insights
    costBreakdown: 'Kostenaufschluesselung',
    cumulativeCost: 'Kumulative Kosten',
    weekdayActivity: 'Wochentags-Aktivitaet',
    cacheEfficiency: 'Cache-Effizienz',
    stopReasons: 'Stop Reasons',
    sessionEfficiency: 'Session-Effizienz',
    // Table headers
    date: 'Datum',
    project: 'Projekt',
    model: 'Modell',
    duration: 'Dauer',
    messages: 'Nachrichten',
    toolCalls: 'Tools',
    tokens: 'Tokens',
    cost: 'Kosten',
    totalTokensH: 'Tokens gesamt',
    input: 'Input',
    output: 'Output',
    cacheRead: 'Cache Read',
    cacheCreate: 'Cache Create',
    calls: 'Aufrufe',
    pctTotal: '% gesamt',
    tool: 'Tool',
    allProjects: 'Alle Projekte',
    // Chart legends
    inputLabel: 'Input',
    outputLabel: 'Output',
    cacheReadLabel: 'Cache Read',
    cacheCreateLabel: 'Cache Create',
    apiEquivCost: 'API-aequivalente Kosten',
    // Stats-cache
    officialStats: 'Claude Stats (gesamt)',
    parsedFromFiles: 'aus Sitzungsdateien auf Disk',
    totalMsgsOfficial: 'offizielle Gesamtzahl',
    // Data source
    dataSource: 'Quelle: JSONL-Sitzungsdateien',
    // Tooltips
    tooltipTotalTokens: 'Summe aus Input-, Output-, Cache-Read- und Cache-Create-Tokens im gewaehlten Zeitraum',
    tooltipEstimatedCost: 'Kostenschaetzung basierend auf offiziellen API-Preisen pro Modell — keine echte Abrechnung',
    tooltipSessions: 'Anzahl einzigartiger Claude-Code-Sitzungen (jeder CLI-Aufruf = 1 Sitzung)',
    tooltipMessages: 'Anzahl der Assistenten-Antworten (API-Roundtrips)',
    tooltipDailyTokens: 'Gestapeltes Balkendiagramm: Token-Verbrauch nach Typ pro Tag',
    tooltipDailyCost: 'API-aequivalenter Kostentrend ueber die Zeit',
    tooltipModelDist: 'Token-Anteil pro Claude-Modell (Opus, Sonnet, Haiku)',
    tooltipHourly: 'Wann bist du am aktivsten? Nachrichten gruppiert nach Tageszeit',
    tooltipCostBreakdown: 'Kosten aufgeteilt nach Token-Typ: Input, Output, Cache-Read, Cache-Create',
    tooltipCumulativeCost: 'Laufende Gesamtkosten ueber die Zeit',
    tooltipWeekday: 'Nachrichten und Kosten gruppiert nach Wochentag',
    tooltipCacheEfficiency: 'Taegliche Cache-Hit-Rate: Cache-Read / (Input + Cache-Read + Cache-Create)',
    tooltipStopReasons: 'Warum hat das Modell gestoppt? end_turn = natuerlich, tool_use = Tool aufgerufen',
    tooltipSessionEfficiency: 'Tokens pro Nachricht vs. Kosten pro Nachricht — unten links ist am effizientesten',
  }
};

let currentLang = localStorage.getItem('lang') || 'de';

function t(key) {
  return LANG[currentLang][key] || LANG.en[key] || key;
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  applyTranslations();
}

function applyTranslations() {
  // Update all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  // Update lang buttons
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === currentLang);
  });
}
