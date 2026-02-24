// App state
let state = {
  period: localStorage.getItem('customDate') ? 'custom' : (localStorage.getItem('period') || '30d'),
  customDate: localStorage.getItem('customDate') || '',
  activeTab: 'overview',
  sessionFilter: { project: '', model: '' },
  includeCache: true,
  multiUser: false,
  user: null,
  demoMode: false
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

// --- API helpers ---
async function api(path) {
  if (state.demoMode && typeof DEMO_DATA !== 'undefined') {
    const basePath = path.replace(/\?.*$/, '');
    if (DEMO_DATA[basePath] !== undefined) {
      return JSON.parse(JSON.stringify(DEMO_DATA[basePath]));
    }
  }
  const res = await fetch('/api/' + path);
  if (res.status === 401 && state.multiUser) {
    showLoginOverlay();
    throw new Error('Unauthorized');
  }
  return res.json();
}

function toLocalDate(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function getPeriodRange() {
  const now = new Date();
  const to = toLocalDate(now);
  let from = '';
  switch (state.period) {
    case 'today': from = to; break;
    case '7d': from = toLocalDate(new Date(now - 7 * 86400000)); break;
    case '30d': from = toLocalDate(new Date(now - 30 * 86400000)); break;
    case 'all': from = ''; break;
    case 'custom': return { from: state.customDate, to: state.customDate };
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

// --- Sortable tables ---
const tableState = {};

function parseSortValue(str) {
  if (typeof str !== 'string') return str;
  str = str.trim();
  if (str === '-') return -Infinity;
  if (str.startsWith('$')) str = str.slice(1);
  if (str.endsWith('%')) str = str.slice(0, -1);
  const suffixMatch = str.match(/^([\d,.]+)\s*([KMB])$/i);
  if (suffixMatch) {
    const num = parseFloat(suffixMatch[1].replace(/,/g, ''));
    const mult = { K: 1e3, M: 1e6, B: 1e9 }[suffixMatch[2].toUpperCase()];
    return num * mult;
  }
  const durMatch = str.match(/^(\d+)m$/);
  if (durMatch) return parseInt(durMatch[1]);
  const num = parseFloat(str.replace(/,/g, ''));
  if (!isNaN(num)) return num;
  if (/^\d{4}-\d{2}/.test(str)) return new Date(str).getTime() || 0;
  return null;
}

function storeTableData(tbodyId, rows, cellDefs, limit) {
  if (!tableState[tbodyId]) {
    tableState[tbodyId] = { sortCol: -1, sortAsc: true };
  }
  if (tableState[tbodyId].cellDefs && tableState[tbodyId].cellDefs.length !== cellDefs.length) {
    tableState[tbodyId].sortCol = -1;
    tableState[tbodyId].sortAsc = true;
  }
  tableState[tbodyId].rows = rows;
  tableState[tbodyId].cellDefs = cellDefs;
  tableState[tbodyId].limit = limit || 0;
  renderSortedTable(tbodyId);
  initTableSort(tbodyId);
}

function renderSortedTable(tbodyId) {
  const ts = tableState[tbodyId];
  if (!ts) return;
  let rows = ts.rows;
  if (ts.sortCol >= 0 && ts.cellDefs[ts.sortCol]) {
    const cellDef = ts.cellDefs[ts.sortCol];
    rows = [...rows].sort((a, b) => {
      const aStr = cellDef.value(a);
      const bStr = cellDef.value(b);
      const aNum = parseSortValue(aStr);
      const bNum = parseSortValue(bStr);
      if (aNum !== null && bNum !== null) {
        return ts.sortAsc ? aNum - bNum : bNum - aNum;
      }
      return ts.sortAsc ? String(aStr).localeCompare(String(bStr)) : String(bStr).localeCompare(String(aStr));
    });
  }
  if (ts.limit > 0) rows = rows.slice(0, ts.limit);
  const tbody = document.getElementById(tbodyId);
  buildTableRows(tbody, rows, ts.cellDefs);
  updateSortIndicators(tbodyId);
}

function handleSort(tbodyId, colIndex) {
  const ts = tableState[tbodyId];
  if (!ts) return;
  if (ts.sortCol === colIndex) {
    ts.sortAsc = !ts.sortAsc;
  } else {
    ts.sortCol = colIndex;
    ts.sortAsc = true;
  }
  renderSortedTable(tbodyId);
}

function updateSortIndicators(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  const table = tbody.closest('table');
  if (!table) return;
  const ths = table.querySelectorAll('thead th');
  const ts = tableState[tbodyId];
  ths.forEach((th, i) => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (ts && ts.sortCol === i) {
      th.classList.add(ts.sortAsc ? 'sort-asc' : 'sort-desc');
    }
  });
}

function initTableSort(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  const table = tbody.closest('table');
  if (!table) return;
  const thead = table.querySelector('thead');
  if (thead._sortInit) return;
  thead._sortInit = true;
  thead.addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th) return;
    const ths = [...thead.querySelectorAll('th')];
    const colIndex = ths.indexOf(th);
    if (colIndex >= 0) handleSort(tbodyId, colIndex);
  });
}

// --- Auth / Login ---
function showLoginOverlay() {
  document.getElementById('login-overlay').style.display = 'flex';
}

function hideLoginOverlay() {
  document.getElementById('login-overlay').style.display = 'none';
}

function updateUserUI(user) {
  const userInfo = document.getElementById('user-info');
  if (user && state.multiUser) {
    userInfo.style.display = 'flex';
    document.getElementById('user-avatar').src = user.avatarUrl || '';
    document.getElementById('user-name').textContent = user.displayName || user.username;
  } else {
    userInfo.style.display = 'none';
  }
}

async function checkAuth() {
  try {
    // Check if multi-user mode
    const config = await fetch('/api/config').then(r => r.json());
    state.multiUser = config.multiUser;

    if (!state.multiUser) {
      // Single-user mode — no auth needed
      hideLoginOverlay();
      return true;
    }

    // Multi-user: check auth status
    const authRes = await fetch('/auth/me').then(r => r.json());
    if (authRes.authenticated) {
      state.user = authRes.user;
      state.demoMode = false;
      hideLoginOverlay();
      hideDemoBanner();
      updateUserUI(authRes.user);
      return true;
    } else {
      // Not authenticated — enter demo mode
      state.demoMode = true;
      hideLoginOverlay();
      showDemoBanner();
      return true;
    }
  } catch {
    // If config endpoint fails, assume single-user
    hideLoginOverlay();
    return true;
  }
}

function showDemoBanner() {
  const banner = document.getElementById('demo-banner');
  if (banner) banner.style.display = '';
  const headerLogin = document.getElementById('header-login-btn');
  if (headerLogin) headerLogin.style.display = '';
  // Hide rebuild button and sync-setup in demo mode
  const rebuildBtn = document.getElementById('rebuild-btn');
  if (rebuildBtn) rebuildBtn.style.display = 'none';
  const syncSetup = document.getElementById('sync-setup');
  if (syncSetup) syncSetup.style.display = 'none';
}

function hideDemoBanner() {
  const banner = document.getElementById('demo-banner');
  if (banner) banner.style.display = 'none';
  const headerLogin = document.getElementById('header-login-btn');
  if (headerLogin) headerLogin.style.display = 'none';
}

async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  state.user = null;
  updateUserUI(null);
  showLoginOverlay();
}

// --- Sync Key management ---
async function loadSyncKey() {
  if (!state.multiUser) return;
  const syncSetup = document.getElementById('sync-setup');
  if (!syncSetup) return;

  syncSetup.style.display = '';
  try {
    const data = await api('sync-key');
    const key = data.apiKey || '-';
    document.getElementById('api-key-value').textContent = key;
    updateCurlCommand(key);
  } catch {
    document.getElementById('api-key-value').textContent = '-';
    updateCurlCommand(null);
  }
}

async function regenerateSyncKey() {
  try {
    const data = await fetch('/api/sync-key', { method: 'POST' }).then(r => r.json());
    const key = data.apiKey || '-';
    document.getElementById('api-key-value').textContent = key;
    updateCurlCommand(key);
  } catch {
    // ignore
  }
}

function copySyncKey() {
  const key = document.getElementById('api-key-value').textContent;
  if (key && key !== '-') {
    navigator.clipboard.writeText(key);
    flashCopyButton('copy-api-key');
  }
}

function updateCurlCommand(apiKey) {
  const el = document.getElementById('sync-curl-value');
  if (!el) return;
  if (!apiKey || apiKey === '-') {
    el.textContent = '...';
    return;
  }
  el.textContent = `curl -sL "${location.origin}/api/sync-agent/install.sh?key=${apiKey}" | bash`;
}

function copyCurlCommand() {
  const el = document.getElementById('sync-curl-value');
  if (el && el.textContent !== '...') {
    navigator.clipboard.writeText(el.textContent);
    flashCopyButton('copy-curl-cmd');
  }
}

function flashCopyButton(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = t('copied');
  btn.classList.add('btn-copied');
  setTimeout(() => {
    btn.textContent = orig;
    btn.classList.remove('btn-copied');
  }, 1500);
}

function downloadInstallScript() {
  const key = document.getElementById('api-key-value').textContent;
  if (key && key !== '-') {
    window.location.href = `/api/sync-agent/install.sh?key=${encodeURIComponent(key)}`;
  }
}

// --- Tab switching ---
function switchTab(tab) {
  state.activeTab = tab;
  localStorage.setItem('activeTab', tab);
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  loadTab(tab);
}

// --- Period switching ---
function setPeriod(period) {
  state.period = period;
  state.customDate = '';
  localStorage.setItem('period', period);
  localStorage.removeItem('customDate');
  const picker = document.getElementById('custom-date-picker');
  if (picker) picker.value = '';
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
    case 'productivity': return loadProductivity();
    case 'achievements': return loadAchievements();
    case 'info': return loadInfo();
    case 'settings': return loadSettings();
  }
}

async function loadActiveSessions() {
  try {
    const sessions = await api('active-sessions');
    const container = document.getElementById('active-sessions');
    const grid = document.getElementById('active-sessions-grid');
    const countEl = document.getElementById('active-count');

    if (!sessions || sessions.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = '';
    countEl.textContent = sessions.length;
    grid.textContent = '';

    for (const s of sessions) {
      const card = document.createElement('div');
      card.className = 'active-session-card';

      const project = document.createElement('div');
      project.className = 'active-session-project';
      project.textContent = s.project;

      const meta = document.createElement('div');
      meta.className = 'active-session-meta';
      meta.textContent = `${s.models.join(', ')} · ${s.durationMin}m · ${formatNumber(s.messages)} msgs · ${formatCost(s.cost)}`;

      const ago = document.createElement('div');
      ago.className = 'active-session-ago';
      const secsAgo = Math.round((Date.now() - new Date(s.lastTs).getTime()) / 1000);
      if (secsAgo < 60) ago.textContent = `${secsAgo}s ago`;
      else ago.textContent = `${Math.round(secsAgo / 60)}m ago`;

      card.appendChild(project);
      card.appendChild(meta);
      card.appendChild(ago);
      grid.appendChild(card);
    }
  } catch {
    // ignore
  }
}

async function loadOverview() {
  const [overview, daily, models, hourly, statsCache] = await Promise.all([
    api('overview' + periodQuery()),
    api('daily' + periodQuery()),
    api('models' + periodQuery()),
    api('hourly' + periodQuery()),
    (state.multiUser || state.demoMode) ? Promise.resolve(null) : api('stats-cache').catch(() => null)
  ]);

  loadActiveSessions();

  // KPI Cards — respect cache toggle
  const displayTokens = getDisplayTokens(overview);
  const displayCost = getDisplayCost(overview);

  document.getElementById('kpi-tokens').textContent = formatTokens(displayTokens);
  document.getElementById('kpi-tokens-sub').textContent =
    LANG[currentLang].kpiTokensSub(formatTokens(overview.inputTokens), formatTokens(overview.outputTokens), formatTokens(overview.cacheReadTokens));
  document.getElementById('kpi-cost').textContent = formatCost(displayCost);
  document.getElementById('kpi-cost-sub').textContent = t('costSubLabel');
  document.getElementById('kpi-sessions').textContent = formatNumber(overview.sessions);
  document.getElementById('kpi-messages').textContent = formatNumber(overview.messages);

  // Detail KPI cards
  document.getElementById('kpi-input-tokens').textContent = formatTokens(overview.inputTokens);
  document.getElementById('kpi-input-cost').textContent = formatCost(overview.inputCost || 0);
  document.getElementById('kpi-output-tokens').textContent = formatTokens(overview.outputTokens);
  document.getElementById('kpi-output-cost').textContent = formatCost(overview.outputCost || 0);
  document.getElementById('kpi-cache-read-tokens').textContent = formatTokens(overview.cacheReadTokens);
  document.getElementById('kpi-cache-read-cost').textContent = formatCost(overview.cacheReadCost || 0);
  document.getElementById('kpi-cache-create-tokens').textContent = formatTokens(overview.cacheCreateTokens);
  document.getElementById('kpi-cache-create-cost').textContent = formatCost(overview.cacheCreateCost || 0);

  // Lines of Code detail cards
  const lA = overview.linesAdded || 0;
  const lR = overview.linesRemoved || 0;
  const lW = overview.linesWritten || 0;
  const netLines = lW + lA - lR;
  const sessCount = overview.sessions || 1;
  const dayCount = daily.length || 1;

  document.getElementById('kpi-lines-written').textContent = formatNumber(lW);
  document.getElementById('kpi-lines-written-sub').textContent = `~${formatNumber(Math.round(lW / dayCount))} ${t('linesPerDay')}`;
  document.getElementById('kpi-lines-edited').textContent = formatNumber(lA);
  document.getElementById('kpi-lines-edited-sub').textContent = `~${formatNumber(Math.round(lA / dayCount))} ${t('linesPerDay')}`;
  document.getElementById('kpi-lines-deleted').textContent = formatNumber(lR);
  document.getElementById('kpi-lines-deleted-sub').textContent = `~${formatNumber(Math.round(lR / dayCount))} ${t('linesPerDay')}`;
  document.getElementById('kpi-lines-net').textContent = (netLines >= 0 ? '+' : '') + formatNumber(netLines);
  document.getElementById('kpi-lines-net-sub').textContent = t('netChangeDesc');

  // Stats-cache banner (official Claude totals — single-user only)
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
  createDailyTokenChart('chart-daily-tokens', daily, false);
  createDailyCostChart('chart-daily-cost', daily);
  createModelDoughnut('chart-model-dist', models, false);
  createHourlyChart('chart-hourly', hourly);
  createOverviewLinesChart('chart-overview-lines', daily, hourly, state.period);

  loadGlobalComparison();
}

async function loadSessions() {
  const pq = periodQuery();
  const sessions = await api('sessions' + pq);

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

  // Update sessions table headers dynamically (to include lines columns)
  const sessionThead = document.querySelector('#tab-sessions thead tr');
  if (sessionThead) {
    sessionThead.textContent = '';
    const sHeaders = [
      { text: t('date') },
      { text: t('project') },
      { text: t('model') },
      { text: t('duration'), cls: 'num' },
      { text: t('messages'), cls: 'num' },
      { text: t('toolCalls'), cls: 'num' },
      { text: t('tokens'), cls: 'num' },
      { text: '+/-', cls: 'num' },
      { text: t('cost'), cls: 'num' }
    ];
    for (const h of sHeaders) {
      const th = document.createElement('th');
      th.textContent = h.text;
      if (h.cls) th.className = h.cls;
      sessionThead.appendChild(th);
    }
  }

  storeTableData('sessions-tbody', filtered, [
    { value: s => s.firstTs ? s.firstTs.slice(0, 16).replace('T', ' ') : '-' },
    { value: s => s.project },
    { value: s => s.models.join(', ') },
    { value: s => s.durationMin + 'm', className: 'num' },
    { value: s => formatNumber(s.messages), className: 'num' },
    { value: s => formatNumber(s.toolCalls), className: 'num' },
    { value: s => formatTokens(getDisplayTokens(s)), className: 'num' },
    { value: s => {
      const a = s.linesAdded || 0;
      const r = s.linesRemoved || 0;
      const w = s.linesWritten || 0;
      if (a + r + w === 0) return '-';
      return `+${formatNumber(a)} -${formatNumber(r)} w${formatNumber(w)}`;
    }, className: 'num' },
    { value: s => formatCost(s.cost), className: 'num' }
  ], 100);
}

async function loadProjects() {
  const projects = await api('projects' + periodQuery());
  createProjectBarChart('chart-projects', projects, false);

  const tbody = document.getElementById('projects-tbody');
  const cellDefs = [
    { value: p => p.name },
    { value: p => formatTokens(getDisplayTokens(p)), className: 'num' },
    { value: p => formatTokens(p.inputTokens), className: 'num' },
    { value: p => formatTokens(p.outputTokens), className: 'num' },
    { value: p => formatTokens(p.cacheReadTokens), className: 'num' },
    { value: p => {
      const a = p.linesAdded || 0;
      const r = p.linesRemoved || 0;
      const w = p.linesWritten || 0;
      if (a + r + w === 0) return '-';
      return `+${formatNumber(a)} -${formatNumber(r)} w${formatNumber(w)}`;
    }, className: 'num' },
    { value: p => formatNumber(p.sessions), className: 'num' },
    { value: p => formatNumber(p.messages), className: 'num' },
    { value: p => formatCost(p.cost), className: 'num' }
  ];

  // Update table headers
  const thead = document.querySelector('#tab-projects thead tr');
  if (thead) {
    thead.textContent = '';
    const headers = [
      { text: t('project') },
      { text: t('totalTokensH'), cls: 'num' },
      { text: t('input'), cls: 'num' },
      { text: t('output'), cls: 'num' },
      { text: t('cacheRead'), cls: 'num' },
      { text: '+/-', cls: 'num' },
      { text: t('sessionsLabel'), cls: 'num' },
      { text: t('messagesLabel'), cls: 'num' },
      { text: t('cost'), cls: 'num' }
    ];
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h.text;
      if (h.cls) th.className = h.cls;
      thead.appendChild(th);
    }
  }

  storeTableData('projects-tbody', projects, cellDefs);
}

async function loadTools() {
  const tools = await api('tools' + periodQuery());
  createToolBarChart('chart-tools', tools);

  storeTableData('tools-tbody', tools, [
    { value: t => t.name },
    { value: t => formatNumber(t.count), className: 'num' },
    { value: t => t.percentage + '%', className: 'num' }
  ]);
}

async function loadModels() {
  const [models, dailyByModel] = await Promise.all([
    api('models' + periodQuery()),
    api('daily-by-model' + periodQuery())
  ]);

  createModelAreaChart('chart-model-area', dailyByModel);

  const tbody = document.getElementById('models-tbody');
  const cellDefs = [
    { value: m => m.label },
    { value: m => formatTokens(m.inputTokens), className: 'num' },
    { value: m => formatTokens(m.outputTokens), className: 'num' },
    { value: m => formatTokens(m.cacheReadTokens), className: 'num' },
    { value: m => formatTokens(m.cacheCreateTokens), className: 'num' },
  ];
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
      { text: t('cacheRead'), cls: 'num' },
      { text: t('cacheCreate'), cls: 'num' },
    ];
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

  storeTableData('models-tbody', models, cellDefs);
}

async function loadInsights() {
  const pq = periodQuery();
  const [costBreakdown, cumulativeCost, weekday, cacheEfficiency, stopReasons, sessionEfficiency, daily] = await Promise.all([
    api('daily-cost-breakdown' + pq),
    api('cumulative-cost' + pq),
    api('day-of-week' + pq),
    api('cache-efficiency' + pq),
    api('stop-reasons' + pq),
    api('session-efficiency' + pq),
    api('daily' + pq)
  ]);

  createCostBreakdownChart('chart-cost-breakdown', costBreakdown, false);
  createCumulativeCostChart('chart-cumulative-cost', cumulativeCost);
  createWeekdayChart('chart-weekday', weekday);
  createCacheEfficiencyChart('chart-cache-efficiency', cacheEfficiency);
  createStopReasonsChart('chart-stop-reasons', stopReasons);
  createSessionEfficiencyChart('chart-session-efficiency', sessionEfficiency);
  createDailyLinesChart('chart-daily-lines', daily);
}

async function loadAchievements() {
  const data = await api('achievements');
  const unlocked = data.filter(a => a.unlocked).length;
  const total = data.length;

  document.getElementById('achievements-unlocked').textContent = unlocked;
  document.getElementById('achievements-total').textContent = total;
  document.getElementById('achievements-progress-fill').style.width = (total > 0 ? (unlocked / total * 100) : 0) + '%';

  const grid = document.getElementById('achievements-grid');
  grid.textContent = '';

  // Group by category
  const categories = [];
  const catMap = {};
  for (const a of data) {
    if (!catMap[a.category]) {
      catMap[a.category] = [];
      categories.push(a.category);
    }
    catMap[a.category].push(a);
  }

  const tierFallback = {
    bronze: '\u{1F7E4}',    // brown circle
    silver: '\u26AA',       // white circle
    gold: '\u{1F7E1}',     // yellow circle
    platinum: '\u{1F535}',  // blue circle
    diamond: '\u{1F48E}'   // gem
  };

  for (const cat of categories) {
    const section = document.createElement('div');
    section.className = 'achievements-category';

    const header = document.createElement('h3');
    header.className = 'achievements-category-title';
    header.textContent = t('achievementCat_' + cat) || cat;
    section.appendChild(header);

    const cards = document.createElement('div');
    cards.className = 'achievements-cards';

    for (const ach of catMap[cat]) {
      const card = document.createElement('div');
      card.className = 'achievement-card' + (ach.unlocked ? ' unlocked' : ' locked') + ' tier-' + ach.tier;

      const icon = document.createElement('div');
      icon.className = 'achievement-icon';
      icon.textContent = ach.emoji || tierFallback[ach.tier] || '\u2B50';

      const info = document.createElement('div');
      info.className = 'achievement-info';

      const name = document.createElement('div');
      name.className = 'achievement-name';
      name.textContent = t('ach_' + ach.key) || ach.key;

      const desc = document.createElement('div');
      desc.className = 'achievement-desc';
      desc.textContent = t('ach_' + ach.key + '_desc') || '';

      info.appendChild(name);
      info.appendChild(desc);
      card.appendChild(icon);
      card.appendChild(info);

      if (ach.unlocked && ach.unlockedAt) {
        const date = document.createElement('div');
        date.className = 'achievement-date';
        date.textContent = ach.unlockedAt.slice(0, 10);
        card.appendChild(date);
      }

      cards.appendChild(card);
    }

    section.appendChild(cards);
    grid.appendChild(section);
  }
}

async function loadProductivity() {
  const data = await api('productivity' + periodQuery());

  document.getElementById('kpi-tokens-per-min').textContent = formatNumber(data.tokensPerMin);
  setTrendIndicator('kpi-tokens-per-min-trend', data.trends.tokensPerMin);

  document.getElementById('kpi-lines-per-hour').textContent = formatNumber(data.linesPerHour);
  setTrendIndicator('kpi-lines-per-hour-trend', data.trends.linesPerHour);

  document.getElementById('kpi-msgs-per-session').textContent = data.msgsPerSession.toFixed(1);
  const msgsPerSessionSub = document.getElementById('kpi-msgs-per-session-sub');
  if (msgsPerSessionSub) msgsPerSessionSub.textContent = t('avgPerSession');

  document.getElementById('kpi-cost-per-line').textContent = '$' + data.costPerLine.toFixed(3);
  setTrendIndicator('kpi-cost-per-line-trend', data.trends.costPerLine, true);

  document.getElementById('kpi-cache-savings').textContent = formatCost(data.cacheSavings);
  document.getElementById('kpi-code-ratio').textContent = data.codeRatio.toFixed(1) + '%';
  document.getElementById('kpi-coding-hours').textContent = data.codingHours.toFixed(1) + 'h';
  document.getElementById('kpi-total-lines').textContent = formatNumber(data.totalLines);

  createProductivityDailyChart('chart-productivity-daily', data.dailyProductivity);
  createCostEfficiencyChart('chart-cost-efficiency', data.dailyProductivity);
  createCodeRatioChart('chart-code-ratio', data.stopReasons);
}

function setTrendIndicator(elementId, pctChange, invertColors) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (pctChange === undefined || pctChange === null) {
    el.textContent = '';
    return;
  }
  const isUp = pctChange > 0;
  const isDown = pctChange < 0;
  const arrow = isUp ? '\u2191' : isDown ? '\u2193' : '\u2192';
  const absVal = Math.abs(pctChange);
  el.textContent = arrow + ' ' + absVal + '%';
  el.className = 'kpi-sub kpi-trend';
  if (isUp) el.classList.add(invertColors ? 'trend-down' : 'trend-up');
  else if (isDown) el.classList.add(invertColors ? 'trend-up' : 'trend-down');
}

async function exportHtml() {
  const btn = document.getElementById('export-html-btn');
  btn.textContent = '...';
  btn.disabled = true;
  try {
    const res = await fetch('/api/export-html' + periodQuery());
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'claude-tracker-export.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (_e) {
    // ignore
  }
  btn.textContent = t('exportHtml');
  btn.disabled = false;
}

async function loadGlobalComparison() {
  const container = document.getElementById('global-comparison');
  if (!container) return;
  if (!state.multiUser && !state.demoMode) {
    container.style.display = 'none';
    return;
  }
  try {
    const data = await api('global-averages' + periodQuery());
    if (!data || !data.you || !data.avg || data.userCount < 2) {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';
    const grid = document.getElementById('comparison-grid');
    grid.textContent = '';

    const metrics = [
      { label: t('totalTokens'), you: data.you.totalTokens, avg: data.avg.totalTokens, format: formatTokens },
      { label: t('estimatedCost'), you: data.you.totalCost, avg: data.avg.totalCost, format: formatCost },
      { label: t('sessionsLabel'), you: data.you.totalSessions, avg: data.avg.totalSessions, format: formatNumber },
      { label: t('messagesLabel'), you: data.you.totalMessages, avg: data.avg.totalMessages, format: formatNumber },
      { label: t('totalLinesLabel'), you: data.you.totalLines, avg: data.avg.totalLines, format: formatNumber },
      { label: t('cacheEfficiency'), you: data.you.cacheEfficiency, avg: data.avg.cacheEfficiency, format: v => v.toFixed(1) + '%' }
    ];

    for (const m of metrics) {
      const card = document.createElement('div');
      card.className = 'comparison-card';

      const label = document.createElement('div');
      label.className = 'comparison-label';
      label.textContent = m.label;

      const bars = document.createElement('div');
      bars.className = 'comparison-bars';

      const maxVal = Math.max(m.you, m.avg) || 1;

      const youBar = document.createElement('div');
      youBar.className = 'comparison-bar-row';
      const youLabel = document.createElement('span');
      youLabel.className = 'comparison-bar-label';
      youLabel.textContent = t('you');
      const youTrack = document.createElement('div');
      youTrack.className = 'comparison-bar-track';
      const youFill = document.createElement('div');
      youFill.className = 'comparison-bar-fill you';
      youFill.style.width = (m.you / maxVal * 100) + '%';
      const youVal = document.createElement('span');
      youVal.className = 'comparison-bar-value';
      youVal.textContent = m.format(m.you);
      youTrack.appendChild(youFill);
      youBar.appendChild(youLabel);
      youBar.appendChild(youTrack);
      youBar.appendChild(youVal);

      const avgBar = document.createElement('div');
      avgBar.className = 'comparison-bar-row';
      const avgLabel = document.createElement('span');
      avgLabel.className = 'comparison-bar-label';
      avgLabel.textContent = t('avg');
      const avgTrack = document.createElement('div');
      avgTrack.className = 'comparison-bar-track';
      const avgFill = document.createElement('div');
      avgFill.className = 'comparison-bar-fill avg';
      avgFill.style.width = (m.avg / maxVal * 100) + '%';
      const avgVal = document.createElement('span');
      avgVal.className = 'comparison-bar-value';
      avgVal.textContent = m.format(m.avg);
      avgTrack.appendChild(avgFill);
      avgBar.appendChild(avgLabel);
      avgBar.appendChild(avgTrack);
      avgBar.appendChild(avgVal);

      bars.appendChild(youBar);
      bars.appendChild(avgBar);
      card.appendChild(label);
      card.appendChild(bars);
      grid.appendChild(card);
    }
  } catch {
    container.style.display = 'none';
  }
}

async function loadInfo() {
  // Info tab is now documentation-only, no action needed
}

async function loadSettings() {
  if (state.multiUser) {
    loadSyncKey();
  }
}

// --- SSE Live Updates ---
let sseConnection = null;

function connectSSE() {
  if (sseConnection) sseConnection.close();

  const evtSource = new EventSource('/api/live');
  sseConnection = evtSource;
  const dot = document.getElementById('live-dot');

  evtSource.onopen = () => { dot.classList.remove('disconnected'); };

  evtSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'update' || data.type === 'new-session') {
      chartAnimateNext = false;
      loadTab(state.activeTab);
    }
  };

  evtSource.onerror = () => { dot.classList.add('disconnected'); };
}

window.addEventListener('beforeunload', () => {
  if (sseConnection) sseConnection.close();
});

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
document.addEventListener('DOMContentLoaded', async () => {
  initChartDefaults();
  applyTranslations();
  applyTooltips();

  // Check auth before loading data
  const authed = await checkAuth();

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

  // Date format toggle
  const savedFmt = localStorage.getItem('dateFormat') || 'us';
  document.querySelectorAll('.date-fmt-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.fmt === savedFmt);
    btn.addEventListener('click', () => {
      setChartDateFormat(btn.dataset.fmt);
      document.querySelectorAll('.date-fmt-btn').forEach(b => b.classList.toggle('active', b.dataset.fmt === btn.dataset.fmt));
      loadTab(state.activeTab);
    });
  });

  document.getElementById('filter-project')?.addEventListener('change', (e) => {
    state.sessionFilter.project = e.target.value;
    loadSessions();
  });

  document.getElementById('rebuild-btn')?.addEventListener('click', rebuild);
  document.getElementById('export-html-btn')?.addEventListener('click', exportHtml);
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  document.getElementById('copy-api-key')?.addEventListener('click', copySyncKey);
  document.getElementById('regenerate-api-key')?.addEventListener('click', regenerateSyncKey);
  document.getElementById('copy-curl-cmd')?.addEventListener('click', copyCurlCommand);
  document.getElementById('download-install-script')?.addEventListener('click', downloadInstallScript);

  // Custom date picker
  const datePicker = document.getElementById('custom-date-picker');
  if (datePicker) {
    datePicker.addEventListener('change', () => {
      const val = datePicker.value;
      if (!val) return;
      state.period = 'custom';
      state.customDate = val;
      localStorage.setItem('customDate', val);
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      loadTab(state.activeTab);
    });
  }

  if (authed) {
    // Restore saved period
    if (state.customDate) {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    } else {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === state.period));
    }
    const savedTab = localStorage.getItem('activeTab') || 'overview';
    switchTab(savedTab);
    if (!state.demoMode) connectSSE();
  }
});
