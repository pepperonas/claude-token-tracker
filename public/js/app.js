// App state
let state = {
  period: '30d',
  activeTab: 'overview',
  sessionFilter: { project: '', model: '' },
  includeCache: localStorage.getItem('includeCache') === 'true' // default: false
};

// --- Cache toggle helpers ---
function getDisplayTokens(obj) {
  if (state.includeCache) {
    return (obj.inputTokens || 0) + (obj.outputTokens || 0) + (obj.cacheReadTokens || 0) + (obj.cacheCreateTokens || 0);
  }
  return (obj.inputTokens || 0) + (obj.outputTokens || 0);
}

function getDisplayCost(obj) {
  // obj must have inputCost/outputCost/cacheReadCost/cacheCreateCost OR estimatedCost+cost breakdown
  if (obj.inputCost !== undefined) {
    if (state.includeCache) {
      return obj.inputCost + obj.outputCost + obj.cacheReadCost + obj.cacheCreateCost;
    }
    return obj.inputCost + obj.outputCost;
  }
  // Fallback: use estimatedCost (includes cache) or cost field
  return obj.estimatedCost !== undefined ? obj.estimatedCost : (obj.cost || 0);
}

function toggleCache() {
  state.includeCache = !state.includeCache;
  localStorage.setItem('includeCache', state.includeCache);
  updateCacheToggleUI();
  loadTab(state.activeTab);
}

function updateCacheToggleUI() {
  const btn = document.getElementById('cache-toggle');
  if (btn) {
    btn.classList.toggle('active', state.includeCache);
    btn.textContent = state.includeCache ? t('cacheOn') : t('cacheOff');
  }
}

// --- API helpers ---
async function api(path) {
  const res = await fetch('/api/' + path);
  return res.json();
}

function getPeriodRange() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  let from = '';
  switch (state.period) {
    case 'today': from = to; break;
    case '7d': from = new Date(now - 7 * 86400000).toISOString().slice(0, 10); break;
    case '30d': from = new Date(now - 30 * 86400000).toISOString().slice(0, 10); break;
    case 'all': from = ''; break;
  }
  return { from, to };
}

function periodQuery() {
  const { from, to } = getPeriodRange();
  const params = [];
  if (from) params.push('from=' + from);
  if (to) params.push('to=' + to);
  return params.length ? '?' + params.join('&') : '';
}

// --- Safe DOM table builder ---
function buildTableRows(tbody, rows, cellDefs) {
  tbody.textContent = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const def of cellDefs) {
      const td = document.createElement('td');
      if (def.className) td.className = def.className;
      td.textContent = def.value(row);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

// --- Tab switching ---
function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  loadTab(tab);
}

// --- Period switching ---
function setPeriod(period) {
  state.period = period;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === period));
  loadTab(state.activeTab);
}

// --- Data loading ---
async function loadTab(tab) {
  switch (tab) {
    case 'overview': return loadOverview();
    case 'sessions': return loadSessions();
    case 'projects': return loadProjects();
    case 'tools': return loadTools();
    case 'models': return loadModels();
    case 'insights': return loadInsights();
    case 'info': return; // static content
  }
}

async function loadOverview() {
  const [overview, daily, models, hourly, statsCache] = await Promise.all([
    api('overview' + periodQuery()),
    api('daily' + periodQuery()),
    api('models'),
    api('hourly'),
    api('stats-cache').catch(() => null)
  ]);

  // KPI Cards — respect cache toggle
  const displayTokens = getDisplayTokens(overview);
  const displayCost = getDisplayCost(overview);

  document.getElementById('kpi-tokens').textContent = formatTokens(displayTokens);
  if (state.includeCache) {
    document.getElementById('kpi-tokens-sub').textContent =
      LANG[currentLang].kpiTokensSub(formatTokens(overview.inputTokens), formatTokens(overview.outputTokens), formatTokens(overview.cacheReadTokens));
  } else {
    document.getElementById('kpi-tokens-sub').textContent =
      LANG[currentLang].kpiTokensSubNoCache(formatTokens(overview.inputTokens), formatTokens(overview.outputTokens));
  }
  document.getElementById('kpi-cost').textContent = formatCost(displayCost);
  document.getElementById('kpi-cost-sub').textContent = t('costSubLabel');
  document.getElementById('kpi-sessions').textContent = formatNumber(overview.sessions);
  document.getElementById('kpi-messages').textContent = formatNumber(overview.messages);

  // Stats-cache banner (official Claude totals)
  const banner = document.getElementById('stats-banner');
  const bannerItems = document.getElementById('stats-banner-items');
  if (statsCache && !statsCache.error) {
    banner.style.display = '';
    bannerItems.textContent = '';
    const items = [
      { label: t('messagesLabel'), value: formatNumber(statsCache.totalMessages) + ' (' + t('totalMsgsOfficial') + ')' },
      { label: t('sessionsLabel'), value: formatNumber(statsCache.totalSessions) },
      { label: t('estimatedCost'), value: formatCost(statsCache.totalEstimatedCost) },
    ];
    for (const item of items) {
      const span = document.createElement('span');
      span.className = 'stats-item';
      const lbl = document.createElement('span');
      lbl.className = 'stats-item-label';
      lbl.textContent = item.label + ': ';
      const val = document.createElement('span');
      val.className = 'stats-item-value';
      val.textContent = item.value;
      span.appendChild(lbl);
      span.appendChild(val);
      bannerItems.appendChild(span);
    }
  } else {
    banner.style.display = 'none';
  }

  // Charts — pass includeCache flag
  createDailyTokenChart('chart-daily-tokens', daily, state.includeCache);
  createDailyCostChart('chart-daily-cost', daily);
  createModelDoughnut('chart-model-dist', models, state.includeCache);
  createHourlyChart('chart-hourly', hourly);
}

async function loadSessions() {
  const sessions = await api('sessions');

  // Populate project filter
  const projectSelect = document.getElementById('filter-project');
  const projects = [...new Set(sessions.map(s => s.project))].sort();
  const currentProject = projectSelect.value;
  projectSelect.textContent = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = t('allProjects');
  projectSelect.appendChild(allOpt);
  for (const p of projects) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    if (p === currentProject) opt.selected = true;
    projectSelect.appendChild(opt);
  }

  let filtered = sessions;
  if (state.sessionFilter.project) {
    filtered = filtered.filter(s => s.project === state.sessionFilter.project);
  }

  const tbody = document.getElementById('sessions-tbody');
  buildTableRows(tbody, filtered.slice(0, 100), [
    { value: s => s.firstTs ? s.firstTs.slice(0, 16).replace('T', ' ') : '-' },
    { value: s => s.project },
    { value: s => s.models.join(', ') },
    { value: s => s.durationMin + 'm', className: 'num' },
    { value: s => formatNumber(s.messages), className: 'num' },
    { value: s => formatNumber(s.toolCalls), className: 'num' },
    { value: s => formatTokens(getDisplayTokens(s)), className: 'num' },
    { value: s => formatCost(s.cost), className: 'num' }
  ]);
}

async function loadProjects() {
  const projects = await api('projects');
  createProjectBarChart('chart-projects', projects, state.includeCache);

  const tbody = document.getElementById('projects-tbody');
  const cellDefs = [
    { value: p => p.name },
    { value: p => formatTokens(getDisplayTokens(p)), className: 'num' },
    { value: p => formatTokens(p.inputTokens), className: 'num' },
    { value: p => formatTokens(p.outputTokens), className: 'num' },
  ];
  if (state.includeCache) {
    cellDefs.push({ value: p => formatTokens(p.cacheReadTokens), className: 'num' });
  }
  cellDefs.push(
    { value: p => formatNumber(p.sessions), className: 'num' },
    { value: p => formatNumber(p.messages), className: 'num' },
    { value: p => formatCost(p.cost), className: 'num' }
  );

  // Update table headers for cache visibility
  const thead = document.querySelector('#tab-projects thead tr');
  if (thead) {
    thead.textContent = '';
    const headers = [
      { text: t('project') },
      { text: t('totalTokensH'), cls: 'num' },
      { text: t('input'), cls: 'num' },
      { text: t('output'), cls: 'num' },
    ];
    if (state.includeCache) {
      headers.push({ text: t('cacheRead'), cls: 'num' });
    }
    headers.push(
      { text: t('sessionsLabel'), cls: 'num' },
      { text: t('messagesLabel'), cls: 'num' },
      { text: t('cost'), cls: 'num' }
    );
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h.text;
      if (h.cls) th.className = h.cls;
      thead.appendChild(th);
    }
  }

  buildTableRows(tbody, projects, cellDefs);
}

async function loadTools() {
  const tools = await api('tools');
  createToolBarChart('chart-tools', tools);

  const tbody = document.getElementById('tools-tbody');
  buildTableRows(tbody, tools, [
    { value: t => t.name },
    { value: t => formatNumber(t.count), className: 'num' },
    { value: t => t.percentage + '%', className: 'num' }
  ]);
}

async function loadModels() {
  const [models, dailyByModel] = await Promise.all([
    api('models'),
    api('daily-by-model' + periodQuery())
  ]);

  createModelAreaChart('chart-model-area', dailyByModel);

  const tbody = document.getElementById('models-tbody');
  const cellDefs = [
    { value: m => m.label },
    { value: m => formatTokens(m.inputTokens), className: 'num' },
    { value: m => formatTokens(m.outputTokens), className: 'num' },
  ];
  if (state.includeCache) {
    cellDefs.push(
      { value: m => formatTokens(m.cacheReadTokens), className: 'num' },
      { value: m => formatTokens(m.cacheCreateTokens), className: 'num' }
    );
  }
  cellDefs.push(
    { value: m => formatNumber(m.messages), className: 'num' },
    { value: m => formatCost(m.cost), className: 'num' }
  );

  // Update table headers
  const thead = document.querySelector('#tab-models thead tr');
  if (thead) {
    thead.textContent = '';
    const headers = [
      { text: t('model') },
      { text: t('input'), cls: 'num' },
      { text: t('output'), cls: 'num' },
    ];
    if (state.includeCache) {
      headers.push(
        { text: t('cacheRead'), cls: 'num' },
        { text: t('cacheCreate'), cls: 'num' }
      );
    }
    headers.push(
      { text: t('messagesLabel'), cls: 'num' },
      { text: t('cost'), cls: 'num' }
    );
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h.text;
      if (h.cls) th.className = h.cls;
      thead.appendChild(th);
    }
  }

  buildTableRows(tbody, models, cellDefs);
}

async function loadInsights() {
  const pq = periodQuery();
  const [costBreakdown, cumulativeCost, weekday, cacheEfficiency, stopReasons, sessionEfficiency] = await Promise.all([
    api('daily-cost-breakdown' + pq),
    api('cumulative-cost' + pq),
    api('day-of-week'),
    api('cache-efficiency' + pq),
    api('stop-reasons'),
    api('session-efficiency')
  ]);

  createCostBreakdownChart('chart-cost-breakdown', costBreakdown, state.includeCache);
  createCumulativeCostChart('chart-cumulative-cost', cumulativeCost);
  createWeekdayChart('chart-weekday', weekday);
  createCacheEfficiencyChart('chart-cache-efficiency', cacheEfficiency);
  createStopReasonsChart('chart-stop-reasons', stopReasons);
  createSessionEfficiencyChart('chart-session-efficiency', sessionEfficiency);
}

// --- SSE Live Updates ---
function connectSSE() {
  const evtSource = new EventSource('/api/live');
  const dot = document.getElementById('live-dot');

  evtSource.onopen = () => { dot.classList.remove('disconnected'); };

  evtSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'update' || data.type === 'new-session') {
      loadTab(state.activeTab);
    }
  };

  evtSource.onerror = () => { dot.classList.add('disconnected'); };
}

// --- Rebuild ---
async function rebuild() {
  const btn = document.getElementById('rebuild-btn');
  btn.textContent = t('rebuilding');
  btn.disabled = true;
  try {
    const result = await fetch('/api/rebuild', { method: 'POST' }).then(r => r.json());
    btn.textContent = `OK (${result.messages} msgs, ${result.timeMs}ms)`;
    setTimeout(() => { btn.textContent = t('rebuildCache'); btn.disabled = false; }, 3000);
    loadTab(state.activeTab);
  } catch (_e) {
    btn.textContent = 'Error!';
    setTimeout(() => { btn.textContent = t('rebuildCache'); btn.disabled = false; }, 3000);
  }
}

// --- Tooltip application ---
function applyTooltips() {
  document.querySelectorAll('[data-tooltip-key]').forEach(el => {
    const key = el.dataset.tooltipKey;
    const text = t(key);
    if (text && text !== key) {
      el.setAttribute('data-tooltip', text);
    }
  });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initChartDefaults();
  applyTranslations();
  applyTooltips();
  updateCacheToggleUI();

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => setPeriod(btn.dataset.period));
  });

  // Language switcher
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setLang(btn.dataset.lang);
      applyTooltips();
      updateCacheToggleUI();
      loadTab(state.activeTab);
    });
  });

  document.getElementById('filter-project')?.addEventListener('change', (e) => {
    state.sessionFilter.project = e.target.value;
    loadSessions();
  });

  document.getElementById('rebuild-btn')?.addEventListener('click', rebuild);
  document.getElementById('cache-toggle')?.addEventListener('click', toggleCache);

  switchTab('overview');
  connectSSE();
});
