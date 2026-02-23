// App state
let state = {
  period: '30d',
  activeTab: 'overview',
  sessionFilter: { project: '', model: '' }
};

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

  // KPI Cards
  document.getElementById('kpi-tokens').textContent = formatTokens(overview.totalTokens);
  document.getElementById('kpi-tokens-sub').textContent =
    LANG[currentLang].kpiTokensSub(formatTokens(overview.inputTokens), formatTokens(overview.outputTokens), formatTokens(overview.cacheReadTokens));
  document.getElementById('kpi-cost').textContent = formatCost(overview.estimatedCost);
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

  // Charts
  createDailyTokenChart('chart-daily-tokens', daily);
  createDailyCostChart('chart-daily-cost', daily);
  createModelDoughnut('chart-model-dist', models);
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
    { value: s => formatTokens(s.totalTokens), className: 'num' },
    { value: s => formatCost(s.cost), className: 'num' }
  ]);
}

async function loadProjects() {
  const projects = await api('projects');
  createProjectBarChart('chart-projects', projects);

  const tbody = document.getElementById('projects-tbody');
  buildTableRows(tbody, projects, [
    { value: p => p.name },
    { value: p => formatTokens(p.totalTokens), className: 'num' },
    { value: p => formatTokens(p.inputTokens), className: 'num' },
    { value: p => formatTokens(p.outputTokens), className: 'num' },
    { value: p => formatTokens(p.cacheReadTokens), className: 'num' },
    { value: p => formatNumber(p.sessions), className: 'num' },
    { value: p => formatNumber(p.messages), className: 'num' },
    { value: p => formatCost(p.cost), className: 'num' }
  ]);
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
  buildTableRows(tbody, models, [
    { value: m => m.label },
    { value: m => formatTokens(m.inputTokens), className: 'num' },
    { value: m => formatTokens(m.outputTokens), className: 'num' },
    { value: m => formatTokens(m.cacheReadTokens), className: 'num' },
    { value: m => formatTokens(m.cacheCreateTokens), className: 'num' },
    { value: m => formatNumber(m.messages), className: 'num' },
    { value: m => formatCost(m.cost), className: 'num' }
  ]);
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

  createCostBreakdownChart('chart-cost-breakdown', costBreakdown);
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
  } catch (e) {
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
      loadTab(state.activeTab);
    });
  });

  document.getElementById('filter-project')?.addEventListener('change', (e) => {
    state.sessionFilter.project = e.target.value;
    loadSessions();
  });

  document.getElementById('rebuild-btn')?.addEventListener('click', rebuild);

  switchTab('overview');
  connectSSE();
});
