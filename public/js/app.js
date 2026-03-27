// App state
let state = {
  period: localStorage.getItem('customDate') ? 'custom' : (localStorage.getItem('period') || '30d'),
  customDate: localStorage.getItem('customDate') || '',
  activeTab: 'overview',
  sessionFilter: { project: '', model: '' },
  includeCache: true,
  multiUser: false,
  user: null,
  demoMode: false,
  device: localStorage.getItem('device') || '',
  devices: [],
  periodB: localStorage.getItem('periodB') || 'off',
  periodBFrom: localStorage.getItem('periodBFrom') || '',
  periodBTo: localStorage.getItem('periodBTo') || ''
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
  if (state.device) params.push('device=' + state.device);
  return params.length ? '?' + params.join('&') : '';
}

function isSingleDay() {
  return state.period === 'today' || (state.period === 'custom' && !!state.customDate);
}

function hourlyToChartData(hourly) {
  return hourly.map(h => ({ ...h, date: String(h.hour).padStart(2, '0') + ':00' }));
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

function storeTableData(tbodyId, rows, cellDefs, limit, onRowClick) {
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
  tableState[tbodyId].onRowClick = onRowClick || null;
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
  if (ts.onRowClick) {
    const trs = tbody.querySelectorAll('tr');
    trs.forEach((tr, i) => {
      if (rows[i]) {
        tr.className = 'project-clickable';
        tr.onclick = () => ts.onRowClick(rows[i]);
      }
    });
  }
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
  const curlEl = document.getElementById('sync-curl-value');
  const psEl = document.getElementById('sync-ps-value');
  if (curlEl) {
    curlEl.textContent = (!apiKey || apiKey === '-') ? '...' :
      `curl -sL "${location.origin}/api/sync-agent/install.sh?key=${apiKey}" | bash`;
  }
  if (psEl) {
    psEl.textContent = (!apiKey || apiKey === '-') ? '...' :
      `powershell -ExecutionPolicy Bypass -Command "irm '${location.origin}/api/sync-agent/install.ps1?key=${apiKey}' | iex"`;
  }
}

function copyCurlCommand() {
  const el = document.getElementById('sync-curl-value');
  if (el && el.textContent !== '...') {
    navigator.clipboard.writeText(el.textContent);
    flashCopyButton('copy-curl-cmd');
  }
}

function copyPsCommand() {
  const el = document.getElementById('sync-ps-value');
  if (el && el.textContent !== '...') {
    navigator.clipboard.writeText(el.textContent);
    flashCopyButton('copy-ps-cmd');
  }
}

function downloadPsScript() {
  const key = document.getElementById('api-key-value').textContent;
  if (key && key !== '-') {
    window.location.href = `/api/sync-agent/install.ps1?key=${encodeURIComponent(key)}`;
  }
}

function detectSyncOs() {
  return /Win/.test(navigator.platform) ? 'windows' : 'unix';
}

function switchSyncOs(os) {
  const unixPanel = document.getElementById('sync-panel-unix');
  const winPanel = document.getElementById('sync-panel-windows');
  const unixBtn = document.getElementById('sync-os-unix');
  const winBtn = document.getElementById('sync-os-windows');
  if (!unixPanel || !winPanel) return;
  if (os === 'windows') {
    unixPanel.style.display = 'none';
    winPanel.style.display = 'block';
    unixBtn.classList.remove('active');
    winBtn.classList.add('active');
  } else {
    unixPanel.style.display = 'block';
    winPanel.style.display = 'none';
    unixBtn.classList.add('active');
    winBtn.classList.remove('active');
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
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
    if (b.dataset.tab === tab && window.innerWidth <= 600) {
      b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  });
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
  if (picker) picker.value = period === 'today' ? toLocalDate(new Date()) : '';
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === period));
  loadTab(state.activeTab);
}

// --- Period navigation (prev/next) ---
function navigatePeriod(direction) {
  // direction: -1 = prev, +1 = next
  let days = 1;
  switch (state.period) {
    case 'today': days = 1; break;
    case 'custom': days = 1; break;
    case '7d': days = 7; break;
    case '30d': days = 30; break;
    case 'all': return; // no navigation for "all"
  }

  const offset = direction * days;

  if (state.period === 'today' || state.period === 'custom') {
    // Navigate the custom date picker
    const current = state.customDate ? new Date(state.customDate) : new Date();
    current.setDate(current.getDate() + offset);
    const newDate = toLocalDate(current);
    state.period = 'custom';
    state.customDate = newDate;
    localStorage.setItem('customDate', newDate);
    const picker = document.getElementById('custom-date-picker');
    if (picker) picker.value = newDate;
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    if (days === 1) {
      // Check if it's today
      const today = toLocalDate(new Date());
      if (newDate === today) {
        state.period = 'today';
        state.customDate = '';
        localStorage.removeItem('customDate');
        localStorage.setItem('period', 'today');
        if (picker) picker.value = today;
        document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === 'today'));
      }
    }
  } else {
    // For 7d/30d: shift the window by setting a custom date range via custom date
    const now = new Date();
    const currentEnd = toLocalDate(now);
    const currentStart = toLocalDate(new Date(now - days * 86400000));

    // Calculate new end date
    const newEnd = new Date(now.getTime() + offset * 86400000);
    const newDate = toLocalDate(newEnd);

    // If shifting forward would go beyond today, do nothing
    if (direction > 0 && newEnd > now) return;

    state.period = 'custom';
    state.customDate = newDate;
    localStorage.setItem('customDate', newDate);
    const picker = document.getElementById('custom-date-picker');
    if (picker) picker.value = newDate;
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  }
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
    case 'github': return loadGithub();
    case 'claude-api': return loadClaudeApi();
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

async function loadPlanUsage() {
  const section = document.getElementById('plan-usage-section');
  if (!section) return;
  try {
    const res = await api('plan-usage');
    if (!res || !res.planUsage) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    const pu = res.planUsage;

    _renderUsageBar('plan-session', pu.currentSession?.percentUsed,
      _formatResetSeconds(pu.currentSession?.resetsInSeconds));
    _renderUsageBar('plan-weekly-all', pu.weeklyAllModels?.percentUsed,
      _formatResetDate(pu.weeklyAllModels?.resetsAt));
    _renderUsageBar('plan-weekly-sonnet', pu.weeklySonnet?.percentUsed,
      _formatResetDate(pu.weeklySonnet?.resetsAt));

    const ageEl = document.getElementById('plan-usage-age');
    if (pu.fetchedAt) {
      const ageMin = Math.round((Date.now() - new Date(pu.fetchedAt).getTime()) / 60000);
      ageEl.textContent = t('planUpdatedAgo').replace('{0}', ageMin < 1 ? '< 1' : String(ageMin));
    }

    if (res.error === 'TOKEN_EXPIRED') {
      const err = document.createElement('div');
      err.className = 'plan-usage-error';
      err.textContent = t('planTokenExpired');
      section.querySelector('.plan-usage-grid').appendChild(err);
    }
  } catch {
    section.style.display = 'none';
  }
}

function _renderUsageBar(prefix, pct, resetText) {
  const bar = document.getElementById(prefix + '-bar');
  const pctEl = document.getElementById(prefix + '-pct');
  const resetEl = document.getElementById(prefix + '-reset');
  if (!bar || !pctEl) return;

  if (pct == null) {
    pctEl.textContent = '\u2014';
    bar.style.width = '0%';
    bar.className = 'plan-usage-bar';
    return;
  }

  pctEl.textContent = pct + ' % ' + t('planUsed');
  bar.style.width = Math.min(pct, 100) + '%';
  bar.className = 'plan-usage-bar' + (pct >= 90 ? ' danger' : pct >= 70 ? ' warn' : '');
  if (resetEl && resetText) resetEl.textContent = resetText;
}

function _formatResetSeconds(seconds) {
  if (!seconds && seconds !== 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return t('planResetIn').replace('{h}', h).replace('{m}', m);
}

function _formatResetDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const lang = currentLang === 'de' ? 'de-DE' : 'en-US';
  const day = d.toLocaleDateString(lang, { weekday: 'short' });
  const time = d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  return t('planResetAt').replace('{day}', day).replace('{time}', time);
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
  loadPlanUsage();

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
  document.getElementById('kpi-rate-limits').textContent = formatNumber(overview.rateLimitHits || 0);

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

  // Charts — use hourly breakdown when viewing a single day
  if (isSingleDay()) {
    const hd = hourlyToChartData(hourly);
    createDailyTokenChart('chart-daily-tokens', hd, false);
    createDailyCostChart('chart-daily-cost', hd);
  } else {
    createDailyTokenChart('chart-daily-tokens', daily, false);
    createDailyCostChart('chart-daily-cost', daily);
  }
  createModelDoughnut('chart-model-dist', models, false);
  createHourlyChart('chart-hourly', hourly);
  createOverviewLinesChart('chart-overview-lines', daily, hourly, isSingleDay() ? 'today' : state.period);

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

  // Make chart bars clickable
  const chart = chartInstances['chart-projects'];
  if (chart) {
    chart.options.onClick = (_evt, elements) => {
      if (elements.length > 0) {
        const idx = elements[0].index;
        const top = projects.slice(0, 15);
        if (top[idx]) openProjectDetail(top[idx].name);
      }
    };
    chart.canvas.style.cursor = 'pointer';
    chart.update();
  }

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

  storeTableData('projects-tbody', projects, cellDefs, 0, (p) => openProjectDetail(p.name));
}



// --- Project Detail Dialog ---
let _projectDetailData = null;

async function openProjectDetail(projectName) {
  const dialog = document.getElementById('project-detail-dialog');
  dialog.style.display = 'flex';
  document.getElementById('project-detail-title').textContent = projectName;

  const pq = periodQuery();
  const data = await api('project-detail?name=' + encodeURIComponent(projectName) + pq.replace('?', '&'));
  _projectDetailData = data;

  // KPIs
  const kpiGrid = document.getElementById('project-detail-kpis');
  kpiGrid.textContent = '';
  const kpis = [
    { label: t('totalTokensH'), value: formatTokens(data.totalTokens), cls: 'c-blue' },
    { label: t('cost'), value: formatCost(data.cost), cls: 'c-orange' },
    { label: t('sessionsLabel'), value: formatNumber(data.sessions), cls: 'c-green' },
    { label: t('messagesLabel'), value: formatNumber(data.messages), cls: 'c-purple' },
    { label: t('pdTotalTime'), value: data.totalDurationMin > 0 ? _formatDuration(data.totalDurationMin) : '-', cls: 'c-cyan' },
    { label: t('pdNetLines'), value: _formatNetLines(data), cls: 'c-green' },
  ];
  for (const k of kpis) {
    const div = document.createElement('div');
    div.className = 'kpi ' + k.cls;
    div.innerHTML = '';
    const lbl = document.createElement('div');
    lbl.className = 'kpi-label';
    lbl.textContent = k.label;
    const val = document.createElement('div');
    val.className = 'kpi-value';
    val.textContent = k.value;
    div.appendChild(lbl);
    div.appendChild(val);
    kpiGrid.appendChild(div);
  }

  // Daily chart
  _renderProjectDailyChart(data.daily);

  // Models chart
  _renderProjectModelsChart(data.models);

  // Tools
  const toolsSection = document.getElementById('project-detail-tools-section');
  const toolsList = document.getElementById('project-detail-tools');
  if (data.tools && data.tools.length > 0) {
    toolsSection.style.display = '';
    toolsList.textContent = '';
    for (const t of data.tools) {
      const tag = document.createElement('span');
      tag.className = 'pd-tool-tag';
      const nameSpan = document.createTextNode(t.name + ' ');
      const countSpan = document.createElement('span');
      countSpan.className = 'pd-tool-count';
      countSpan.textContent = t.calls;
      tag.appendChild(nameSpan);
      tag.appendChild(countSpan);
      toolsList.appendChild(tag);
    }
  } else {
    toolsSection.style.display = 'none';
  }

  // Sessions table
  const tbody = document.getElementById('project-detail-sessions-tbody');
  tbody.textContent = '';
  for (const s of data.sessionList) {
    const tr = document.createElement('tr');
    const cells = [
      s.firstTs ? s.firstTs.slice(0, 10) : '-',
      s.models.join(', '),
      s.durationMin > 0 ? s.durationMin + 'm' : '<1m',
      formatNumber(s.messages),
      formatTokens(s.totalTokens),
      _sessionLines(s),
      formatCost(s.cost)
    ];
    for (let i = 0; i < cells.length; i++) {
      const td = document.createElement('td');
      if (i >= 2) td.className = 'num';
      td.textContent = cells[i];
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  // Export button
  document.getElementById('project-detail-export').onclick = () => {
    const json = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      const btn = document.getElementById('project-detail-export');
      const orig = btn.textContent;
      btn.textContent = t('pdExportSuccess');
      setTimeout(() => { btn.textContent = orig; }, 2000);
    });
  };
}

function closeProjectDetail() {
  document.getElementById('project-detail-dialog').style.display = 'none';
  _projectDetailData = null;
  destroyChart('chart-project-detail-daily');
  destroyChart('chart-project-detail-models');
}

function _formatDuration(min) {
  if (min < 60) return min + 'm';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h + 'h ' + m + 'm';
}

function _formatNetLines(data) {
  const net = (data.linesAdded || 0) + (data.linesWritten || 0) - (data.linesRemoved || 0);
  if (net === 0 && !data.linesAdded && !data.linesWritten && !data.linesRemoved) return '-';
  return (net >= 0 ? '+' : '') + formatNumber(net);
}

function _sessionLines(s) {
  const a = s.linesAdded || 0;
  const r = s.linesRemoved || 0;
  const w = s.linesWritten || 0;
  if (a + r + w === 0) return '-';
  return '+' + formatNumber(a) + ' -' + formatNumber(r);
}

function _renderProjectDailyChart(daily) {
  destroyChart('chart-project-detail-daily');
  if (!daily || daily.length === 0) return;
  const ctx = document.getElementById('chart-project-detail-daily').getContext('2d');
  chartInstances['chart-project-detail-daily'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: daily.map(d => d.date.slice(5)),
      datasets: [
        { label: 'Input', data: daily.map(d => d.inputTokens), backgroundColor: COLORS.input + 'cc', stack: 's' },
        { label: 'Output', data: daily.map(d => d.outputTokens), backgroundColor: COLORS.output + 'cc', stack: 's' },
        { label: 'Cache', data: daily.map(d => d.cacheReadTokens + d.cacheCreateTokens), backgroundColor: COLORS.cacheRead + '80', stack: 's' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
      scales: {
        x: { ticks: { maxRotation: 45, font: { size: 10 } } },
        y: { ticks: { callback: v => formatTokens(v) }, stacked: true }
      }
    }
  });
}

function _renderProjectModelsChart(models) {
  destroyChart('chart-project-detail-models');
  if (!models || models.length === 0) return;
  const ctx = document.getElementById('chart-project-detail-models').getContext('2d');
  chartInstances['chart-project-detail-models'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: models.map(m => m.name),
      datasets: [{ data: models.map(m => m.tokens), backgroundColor: [COLORS.input, COLORS.output, COLORS.cacheRead, COLORS.cacheCreate, '#bc8cff', '#39d2c0'] }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
        tooltip: { callbacks: { label: (ctx) => ctx.label + ': ' + formatTokens(ctx.raw) } }
      }
    }
  });
}

// Close modal on overlay click or Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('project-detail-dialog').style.display !== 'none') {
    closeProjectDetail();
  }
});
document.getElementById('project-detail-dialog')?.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) closeProjectDetail();
});

async function loadTools() {
  const pq = periodQuery();
  const singleDay = isSingleDay();
  const [tools, toolStats, mcpServers, subagentStats, toolCostDaily] = await Promise.all([
    api('tools' + pq),
    api('tool-stats' + pq),
    api('mcp-servers' + pq),
    api('subagent-stats' + pq),
    singleDay ? Promise.resolve(null) : api('tool-cost-daily' + pq)
  ]);

  // KPIs
  const totalCalls = toolStats.reduce((a, t) => a + t.calls, 0);
  const totalCost = toolStats.reduce((a, t) => a + t.cost, 0);
  document.getElementById('kpi-unique-tools-val').textContent = formatNumber(toolStats.length);
  document.getElementById('kpi-total-calls-val').textContent = formatNumber(totalCalls);
  document.getElementById('kpi-tools-cost-val').textContent = formatCost(totalCost);
  document.getElementById('kpi-mcp-servers-val').textContent = formatNumber(mcpServers.length);

  // Charts
  createToolBarChart('chart-tools', tools);
  createToolCostBarChart('chart-tool-cost', toolStats);
  if (toolCostDaily) {
    createToolCostDailyChart('chart-tool-cost-daily', toolCostDaily);
  }

  // MCP Servers section
  const mcpSection = document.getElementById('mcp-servers-section');
  const mcpCards = document.getElementById('mcp-servers-cards');
  if (mcpServers.length > 0) {
    mcpSection.style.display = '';
    mcpCards.textContent = '';
    for (const srv of mcpServers) {
      const card = document.createElement('div');
      card.className = 'kpi';
      const label = document.createElement('div');
      label.className = 'kpi-label';
      label.textContent = srv.name;
      const value = document.createElement('div');
      value.className = 'kpi-value';
      value.textContent = formatNumber(srv.totalCalls) + ' calls';
      const sub = document.createElement('div');
      sub.className = 'kpi-sub';
      sub.textContent = formatCost(srv.totalCost) + ' · ' + srv.tools.length + ' tools';
      card.appendChild(label);
      card.appendChild(value);
      card.appendChild(sub);
      mcpCards.appendChild(card);
    }
  } else {
    mcpSection.style.display = 'none';
  }

  // Sub-agent section
  const subSection = document.getElementById('subagent-section');
  const subKpis = document.getElementById('subagent-kpis');
  if (subagentStats.messages > 0) {
    subSection.style.display = '';
    subKpis.textContent = '';
    const items = [
      { label: t('subAgentMessages'), value: formatNumber(subagentStats.messages), sub: subagentStats.pctMessages + '% ' + t('subAgentPct') },
      { label: t('subAgentTokens'), value: formatTokens(subagentStats.tokens) },
      { label: t('subAgentCost'), value: formatCost(subagentStats.cost), sub: subagentStats.pctCost + '% ' + t('subAgentPct') }
    ];
    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'kpi';
      const lbl = document.createElement('div');
      lbl.className = 'kpi-label';
      lbl.textContent = item.label;
      const val = document.createElement('div');
      val.className = 'kpi-value';
      val.textContent = item.value;
      card.appendChild(lbl);
      card.appendChild(val);
      if (item.sub) {
        const sub = document.createElement('div');
        sub.className = 'kpi-sub';
        sub.textContent = item.sub;
        card.appendChild(sub);
      }
      subKpis.appendChild(card);
    }
  } else {
    subSection.style.display = 'none';
  }

  // Enhanced table with cost data
  const thead = document.querySelector('#tools-table thead tr');
  if (thead) {
    thead.textContent = '';
    const headers = [
      { text: t('tool') },
      { text: t('type') },
      { text: t('calls'), cls: 'num' },
      { text: t('estCost'), cls: 'num' },
      { text: t('tokens'), cls: 'num' },
      { text: t('pctTotal'), cls: 'num' }
    ];
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h.text;
      if (h.cls) th.className = h.cls;
      thead.appendChild(th);
    }
  }

  storeTableData('tools-tbody', toolStats, [
    { value: ts => ts.displayName || ts.name },
    { value: ts => ts.type === 'mcp' ? 'MCP' : t('builtIn') },
    { value: ts => formatNumber(ts.calls), className: 'num' },
    { value: ts => formatCost(ts.cost), className: 'num' },
    { value: ts => formatTokens(ts.tokens), className: 'num' },
    { value: ts => ts.percentage + '%', className: 'num' }
  ]);
}

async function loadModels() {
  const pq = periodQuery();
  const singleDay = isSingleDay();
  const [models, dailyByModel, hourlyByModel] = await Promise.all([
    api('models' + pq),
    singleDay ? Promise.resolve(null) : api('daily-by-model' + pq),
    singleDay ? api('hourly-by-model' + pq) : Promise.resolve(null)
  ]);

  createModelAreaChart('chart-model-area', singleDay ? hourlyByModel : dailyByModel);

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
  const singleDay = isSingleDay();

  const [costBreakdown, cumulativeCost, weekday, cacheEfficiency, stopReasons, sessionEfficiency, daily, hourly] = await Promise.all([
    singleDay ? Promise.resolve(null) : api('daily-cost-breakdown' + pq),
    singleDay ? Promise.resolve(null) : api('cumulative-cost' + pq),
    api('day-of-week' + pq),
    singleDay ? Promise.resolve(null) : api('cache-efficiency' + pq),
    api('stop-reasons' + pq),
    api('session-efficiency' + pq),
    singleDay ? Promise.resolve(null) : api('daily' + pq),
    singleDay ? api('hourly' + pq) : Promise.resolve(null)
  ]);

  if (singleDay) {
    const hd = hourlyToChartData(hourly);
    createCostBreakdownChart('chart-cost-breakdown', hd, false);
    let cum = 0;
    const cumData = hd.map(h => { cum += h.cost || 0; return { date: h.date, cost: Math.round(cum * 100) / 100 }; });
    createCumulativeCostChart('chart-cumulative-cost', cumData);
    const cacheData = hd.map(h => {
      const totalIn = (h.inputTokens || 0) + (h.cacheReadTokens || 0) + (h.cacheCreateTokens || 0);
      return { date: h.date, cacheHitRate: totalIn > 0 ? Math.round((h.cacheReadTokens || 0) / totalIn * 1000) / 10 : 0 };
    });
    createCacheEfficiencyChart('chart-cache-efficiency', cacheData);
    createDailyLinesChart('chart-daily-lines', hd);
  } else {
    createCostBreakdownChart('chart-cost-breakdown', costBreakdown, false);
    createCumulativeCostChart('chart-cumulative-cost', cumulativeCost);
    createCacheEfficiencyChart('chart-cache-efficiency', cacheEfficiency);
    createDailyLinesChart('chart-daily-lines', daily);
  }
  createWeekdayChart('chart-weekday', weekday);
  createStopReasonsChart('chart-stop-reasons', stopReasons);
  createSessionEfficiencyChart('chart-session-efficiency', sessionEfficiency);
}

let _achievementsData = null;
let _achievementSort = 'category';

function formatAchDate(isoStr) {
  if (!isoStr) return '';
  const d = isoStr.slice(0, 10); // YYYY-MM-DD
  const fmt = localStorage.getItem('dateFormat') || 'us';
  const yy = d.slice(0, 4), mm = d.slice(5, 7), dd = d.slice(8, 10);
  return fmt === 'de' ? `${dd}.${mm}.${yy}` : `${mm}/${dd}/${yy}`;
}

async function loadAchievements() {
  const data = await api('achievements');
  _achievementsData = data;

  const unlockedList = data.filter(a => a.unlocked);
  const unlocked = unlockedList.length;
  const total = data.length;

  document.getElementById('achievements-unlocked').textContent = unlocked;
  document.getElementById('achievements-total').textContent = total;
  document.getElementById('achievements-progress-fill').style.width = (total > 0 ? (unlocked / total * 100) : 0) + '%';

  // Points calculation
  const totalPoints = unlockedList.reduce((sum, a) => sum + (a.points || 0), 0);
  document.getElementById('achievements-points').textContent = formatNumber(totalPoints);

  // Average achievements per day
  if (unlockedList.length > 0) {
    const dates = unlockedList.filter(a => a.unlockedAt).map(a => new Date(a.unlockedAt));
    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      const daySpan = Math.max(1, Math.round((maxDate - minDate) / 86400000) + 1);
      const avgPerDay = (unlockedList.length / daySpan).toFixed(1);
      document.getElementById('achievements-avg-per-day').textContent = avgPerDay;
    } else {
      document.getElementById('achievements-avg-per-day').textContent = '0';
    }
  } else {
    document.getElementById('achievements-avg-per-day').textContent = '0';
  }

  // Build timeline data: achievements unlocked per day
  const dayMap = {};
  const pointsMap = {};
  for (const a of unlockedList) {
    if (!a.unlockedAt) continue;
    const day = a.unlockedAt.slice(0, 10);
    dayMap[day] = (dayMap[day] || 0) + 1;
    pointsMap[day] = (pointsMap[day] || 0) + (a.points || 0);
  }
  const sortedDays = Object.keys(dayMap).sort();
  let cumPoints = 0;
  const timelineData = sortedDays.map(day => {
    cumPoints += pointsMap[day] || 0;
    return { date: day, count: dayMap[day], cumulativePoints: cumPoints };
  });
  if (timelineData.length > 0) {
    createAchievementsTimelineChart('chart-achievements-timeline', timelineData);
  } else {
    destroyChart('chart-achievements-timeline');
  }

  // Sort buttons
  document.querySelectorAll('.ach-sort-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === _achievementSort);
  });

  renderAchievementsGrid(data, _achievementSort);
}

const TIER_ORDER = { diamond: 0, platinum: 1, gold: 2, silver: 3, bronze: 4 };

function renderAchievementsGrid(data, sortMode) {
  const grid = document.getElementById('achievements-grid');
  grid.textContent = '';

  const tierFallback = {
    bronze: '\u{1F7E4}', silver: '\u26AA', gold: '\u{1F7E1}',
    platinum: '\u{1F535}', diamond: '\u{1F48E}'
  };

  let groups;

  if (sortMode === 'category') {
    // Group by category (original)
    const catMap = {};
    const catOrder = [];
    for (const a of data) {
      if (!catMap[a.category]) { catMap[a.category] = []; catOrder.push(a.category); }
      catMap[a.category].push(a);
    }
    groups = catOrder.map(cat => ({ label: t('achievementCat_' + cat) || cat, items: catMap[cat] }));
  } else if (sortMode === 'recent') {
    // Unlocked first sorted by date desc, then locked
    const unl = data.filter(a => a.unlocked).sort((a, b) => (b.unlockedAt || '').localeCompare(a.unlockedAt || ''));
    const locked = data.filter(a => !a.unlocked);
    groups = [];
    if (unl.length) groups.push({ label: t('achievementsUnlockedCount') || 'Unlocked', items: unl });
    if (locked.length) groups.push({ label: t('locked') || 'Locked', items: locked });
  } else if (sortMode === 'points-desc') {
    // Sort by points descending, unlocked first
    const sorted = [...data].sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      return (b.points || 0) - (a.points || 0);
    });
    groups = [{ label: '', items: sorted }];
  } else if (sortMode === 'tier') {
    // Group by tier (diamond first)
    const tierMap = {};
    const tierOrder = ['diamond', 'platinum', 'gold', 'silver', 'bronze'];
    for (const a of data) {
      if (!tierMap[a.tier]) tierMap[a.tier] = [];
      tierMap[a.tier].push(a);
    }
    groups = tierOrder.filter(t => tierMap[t]).map(tier => ({
      label: tier.charAt(0).toUpperCase() + tier.slice(1),
      items: tierMap[tier].sort((a, b) => (a.unlocked === b.unlocked ? 0 : a.unlocked ? -1 : 1))
    }));
  }

  for (const group of groups) {
    const section = document.createElement('div');
    section.className = 'achievements-category';

    if (group.label) {
      const header = document.createElement('h3');
      header.className = 'achievements-category-title';
      header.textContent = group.label;
      section.appendChild(header);
    }

    const cards = document.createElement('div');
    cards.className = 'achievements-cards';

    for (const ach of group.items) {
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
        date.textContent = formatAchDate(ach.unlockedAt);
        card.appendChild(date);
      }

      const pts = document.createElement('div');
      pts.className = 'achievement-points';
      pts.textContent = (ach.points || 0) + ' pts';
      card.appendChild(pts);

      cards.appendChild(card);
    }

    section.appendChild(cards);
    grid.appendChild(section);
  }
}

async function loadProductivity() {
  const pq = periodQuery();
  const singleDay = isSingleDay();
  const [data, effTrend, modelEff, sessionDepth, hourly, daily] = await Promise.all([
    api('productivity' + pq),
    singleDay ? Promise.resolve(null) : api('efficiency-trend' + pq),
    api('model-efficiency' + pq),
    api('session-depth' + pq),
    singleDay ? api('hourly' + pq) : Promise.resolve(null),
    singleDay ? Promise.resolve(null) : api('daily' + pq)
  ]);

  // Existing KPIs
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

  // New efficiency KPIs
  document.getElementById('kpi-tokens-per-line').textContent = formatNumber(data.tokensPerLine);
  document.getElementById('kpi-tools-per-turn').textContent = data.toolsPerTurn.toFixed(1);
  document.getElementById('kpi-lines-per-turn').textContent = data.linesPerTurn.toFixed(1);
  document.getElementById('kpi-io-ratio').textContent = data.ioRatio.toFixed(1) + '%';

  // Charts
  if (singleDay) {
    const hd = hourlyToChartData(hourly);
    const prodData = hd.map(h => {
      const lines = (h.linesWritten || 0) + (h.linesAdded || 0);
      return {
        date: h.date,
        linesPerHour: lines,
        costPerLine: lines > 0 ? Math.round((h.cost || 0) / lines * 1000) / 1000 : 0
      };
    });
    createProductivityDailyChart('chart-productivity-daily', prodData);
    createCostEfficiencyChart('chart-cost-efficiency', prodData);
    // Efficiency trend: compute from hourly data
    const effDaily = hd.map(h => {
      const lines = (h.linesWritten || 0) + (h.linesAdded || 0);
      const msgs = h.messages || 0;
      return {
        date: h.date,
        tokensPerLine: lines > 0 ? Math.round((h.outputTokens || 0) / lines) : 0,
        linesPerTurn: msgs > 0 ? Math.round((lines / msgs) * 10) / 10 : 0,
        toolsPerTurn: 0,
        ioRatio: (h.inputTokens || 0) > 0 ? Math.round(((h.outputTokens || 0) / h.inputTokens) * 1000) / 10 : 0
      };
    });
    createEfficiencyTrendChart('chart-efficiency-trend', effDaily, effDaily);
    // Tool evolution from hourly (not applicable for single day)
    destroyChart('chart-tool-evolution');
  } else {
    createProductivityDailyChart('chart-productivity-daily', data.dailyProductivity);
    createCostEfficiencyChart('chart-cost-efficiency', data.dailyProductivity);
    if (effTrend) {
      createEfficiencyTrendChart('chart-efficiency-trend', effTrend.daily, effTrend.rolling);
    }
    if (daily) {
      createToolEvolutionChart('chart-tool-evolution', daily);
    }
  }
  createCodeRatioChart('chart-code-ratio', data.stopReasons);
  createModelComparisonChart('chart-model-comparison', modelEff);
  createSessionDepthChart('chart-session-depth', sessionDepth);

  // Period comparison
  if (state.periodB !== 'off') {
    loadPeriodComparison();
  }
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

// --- Period Comparison ---

function getPeriodBRange() {
  const { from: aFrom, to: aTo } = getPeriodRange();

  if (state.periodB === 'prev') {
    // Previous equivalent period (same as _computeTrends logic)
    const fromDate = aFrom ? new Date(aFrom) : new Date(new Date() - 30 * 86400000);
    const toDate = aTo ? new Date(aTo) : new Date();
    const daySpan = Math.round((toDate - fromDate) / 86400000) + 1;
    const prevTo = new Date(fromDate);
    prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - daySpan + 1);
    return { from: toLocalDate(prevFrom), to: toLocalDate(prevTo) };
  }

  if (state.periodB === 'custom') {
    return { from: state.periodBFrom, to: state.periodBTo };
  }

  // Numeric: 7, 30, 90 days ending yesterday
  const days = parseInt(state.periodB);
  const now = new Date();
  const to = toLocalDate(now);
  const from = toLocalDate(new Date(now - days * 86400000));
  return { from, to };
}

function formatPeriodLabel(from, to) {
  if (!from && !to) return t('allTime');
  if (from === to) return from;
  return (from || '...') + ' \u2013 ' + (to || '...');
}

async function loadPeriodComparison() {
  const isActive = state.periodB !== 'off';
  const labels = document.getElementById('period-comparison-labels');
  const grid = document.getElementById('period-comparison-grid');
  if (!isActive) {
    if (labels) labels.style.display = 'none';
    if (grid) grid.textContent = '';
    return;
  }
  if (labels) labels.style.display = '';

  const { from: aFrom, to: aTo } = getPeriodRange();
  const { from: bFrom, to: bTo } = getPeriodBRange();

  // Update period labels
  const aLabel = document.getElementById('period-a-label');
  const bLabel = document.getElementById('period-b-label');
  if (aLabel) aLabel.textContent = t('periodA') + ': ' + formatPeriodLabel(aFrom, aTo);
  if (bLabel) bLabel.textContent = t('periodB') + ': ' + formatPeriodLabel(bFrom, bTo);

  // Fetch productivity for both periods
  const aq = [];
  if (aFrom) aq.push('from=' + aFrom);
  if (aTo) aq.push('to=' + aTo);
  const bq = [];
  if (bFrom) bq.push('from=' + bFrom);
  if (bTo) bq.push('to=' + bTo);

  try {
    const [dataA, dataB] = await Promise.all([
      api('productivity' + (aq.length ? '?' + aq.join('&') : '')),
      api('productivity' + (bq.length ? '?' + bq.join('&') : ''))
    ]);
    renderComparisonCards(dataA, dataB);
  } catch {
    // ignore
  }
}

function renderComparisonCards(dataA, dataB) {
  const grid = document.getElementById('period-comparison-grid');
  if (!grid) return;
  grid.textContent = '';

  const metrics = [
    { label: t('tokensPerMin'), key: 'tokensPerMin', lowerIsBetter: false, format: formatNumber },
    { label: t('linesPerHour'), key: 'linesPerHour', lowerIsBetter: false, format: formatNumber },
    { label: t('costPerLine'), key: 'costPerLine', lowerIsBetter: true, format: v => '$' + v.toFixed(3) },
    { label: t('tokensPerLineLabel'), key: 'tokensPerLine', lowerIsBetter: true, format: formatNumber },
    { label: t('linesPerTurnLabel'), key: 'linesPerTurn', lowerIsBetter: false, format: v => v.toFixed(1) },
    { label: t('toolsPerTurnLabel'), key: 'toolsPerTurn', lowerIsBetter: false, format: v => v.toFixed(1) },
    { label: t('ioRatioLabel'), key: 'ioRatio', lowerIsBetter: false, format: v => v.toFixed(1) + '%' },
    { label: t('codingHours'), key: 'codingHours', lowerIsBetter: false, format: v => v.toFixed(1) + 'h' }
  ];

  for (const m of metrics) {
    const valA = dataA[m.key] || 0;
    const valB = dataB[m.key] || 0;
    const maxVal = Math.max(valA, valB) || 1;

    // Delta percentage
    let deltaPct = 0;
    if (valB > 0) {
      deltaPct = Math.round(((valA - valB) / valB) * 1000) / 10;
    } else if (valA > 0) {
      deltaPct = 100;
    }

    // Determine if the change is an improvement
    const isImprovement = m.lowerIsBetter ? (deltaPct < 0) : (deltaPct > 0);
    const isRegression = m.lowerIsBetter ? (deltaPct > 0) : (deltaPct < 0);

    const card = document.createElement('div');
    card.className = 'comparison-card';

    const label = document.createElement('div');
    label.className = 'comparison-label';
    label.textContent = m.label;

    const bars = document.createElement('div');
    bars.className = 'comparison-bars';

    // Period A bar
    const aBar = document.createElement('div');
    aBar.className = 'comparison-bar-row';
    const aBarLabel = document.createElement('span');
    aBarLabel.className = 'comparison-bar-label';
    aBarLabel.textContent = 'A';
    const aTrack = document.createElement('div');
    aTrack.className = 'comparison-bar-track';
    const aFill = document.createElement('div');
    aFill.className = 'comparison-bar-fill you';
    aFill.style.width = (valA / maxVal * 100) + '%';
    const aVal = document.createElement('span');
    aVal.className = 'comparison-bar-value';
    aVal.textContent = m.format(valA);
    aTrack.appendChild(aFill);
    aBar.appendChild(aBarLabel);
    aBar.appendChild(aTrack);
    aBar.appendChild(aVal);

    // Period B bar
    const bBar = document.createElement('div');
    bBar.className = 'comparison-bar-row';
    const bBarLabel = document.createElement('span');
    bBarLabel.className = 'comparison-bar-label';
    bBarLabel.textContent = 'B';
    const bTrack = document.createElement('div');
    bTrack.className = 'comparison-bar-track';
    const bFill = document.createElement('div');
    bFill.className = 'comparison-bar-fill avg';
    bFill.style.width = (valB / maxVal * 100) + '%';
    const bVal = document.createElement('span');
    bVal.className = 'comparison-bar-value';
    bVal.textContent = m.format(valB);
    bTrack.appendChild(bFill);
    bBar.appendChild(bBarLabel);
    bBar.appendChild(bTrack);
    bBar.appendChild(bVal);

    bars.appendChild(aBar);
    bars.appendChild(bBar);

    // Delta indicator
    const delta = document.createElement('div');
    delta.className = 'comparison-delta';
    if (deltaPct === 0) {
      delta.classList.add('neutral');
      delta.textContent = '\u2192 ' + t('noChange');
    } else {
      const arrow = deltaPct > 0 ? '\u2191' : '\u2193';
      delta.textContent = arrow + ' ' + Math.abs(deltaPct) + '%';
      delta.classList.add(isImprovement ? 'positive' : isRegression ? 'negative' : 'neutral');
    }

    // Hint
    const hint = document.createElement('div');
    hint.className = 'comparison-hint';
    hint.textContent = m.lowerIsBetter ? t('betterLower') : t('betterHigher');

    card.appendChild(label);
    card.appendChild(bars);
    card.appendChild(delta);
    card.appendChild(hint);
    grid.appendChild(card);
  }
}

function setPeriodB(periodB) {
  state.periodB = periodB;
  localStorage.setItem('periodB', periodB);
  document.querySelectorAll('.period-btn-b').forEach(b => b.classList.toggle('active', b.dataset.periodB === periodB));
  const customEl = document.getElementById('period-b-custom');
  if (customEl) customEl.style.display = periodB === 'custom' ? '' : 'none';
  if (periodB === 'off') {
    const labels = document.getElementById('period-comparison-labels');
    const grid = document.getElementById('period-comparison-grid');
    if (labels) labels.style.display = 'none';
    if (grid) grid.textContent = '';
  } else {
    loadPeriodComparison();
  }
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

// --- GitHub Tab ---
let _ghConfig = null;

function _setGhPeriodHint(id, text) {
  let el = document.getElementById(id);
  if (!el) return;
  el.textContent = text ? '(' + text + ')' : '';
  el.style.display = text ? '' : 'none';
}

async function loadGithub() {
  const setupEl = document.getElementById('github-setup');
  const loadingEl = document.getElementById('github-loading');
  const contentEl = document.getElementById('github-content');

  // Check config to determine if token is available
  if (!_ghConfig) {
    try {
      _ghConfig = await api('config');
    } catch {
      _ghConfig = {};
    }
  }

  // In multi-user mode, token comes from OAuth; in single-user, from .env
  // Only show spinner on first load; on refresh keep content visible
  const isRefresh = contentEl.style.display !== 'none';
  setupEl.style.display = 'none';
  if (!isRefresh) {
    loadingEl.style.display = 'flex';
    contentEl.style.display = 'none';
  }

  try {
    // Fast: stats + billing load first, UI shows immediately
    const [data, billing] = await Promise.all([
      api('github/stats'),
      api('github/billing').catch(() => null)
    ]);
    if (data.error) {
      loadingEl.style.display = 'none';
      setupEl.style.display = '';
      const descEl = document.getElementById('github-setup-desc');
      if (_ghConfig.multiUser) {
        descEl.textContent = t('ghSetupDescMulti');
      } else {
        descEl.textContent = t('ghSetupDesc');
      }
      return;
    }

    loadingEl.style.display = 'none';
    contentEl.style.display = '';

    // Billing section
    const billingEl = document.getElementById('github-billing');
    if (billing && !billing.error) {
      billingEl.style.display = '';

      // Plan badge
      const planBadge = document.getElementById('gh-plan-badge');
      const plan = billing.actions.plan || 'Free';
      planBadge.textContent = plan;
      planBadge.className = 'github-plan-badge ' + plan.toLowerCase();

      // Actions minutes
      const minutesUsed = Math.round(billing.actions.totalMinutesUsed);
      const minutesIncluded = billing.actions.includedMinutes;
      const minutesPct = billing.actions.percentUsed;
      document.getElementById('gh-billing-minutes').textContent =
        formatNumber(minutesUsed) + ` (${minutesPct}%)`;
      const ghMinutesUsed = LANG[currentLang].ghMinutesUsed || LANG.en.ghMinutesUsed;
      document.getElementById('gh-billing-minutes-sub').textContent =
        ghMinutesUsed(formatNumber(minutesUsed), formatNumber(minutesIncluded));
      const minutesBar = document.getElementById('gh-billing-minutes-bar');
      minutesBar.style.width = Math.min(minutesPct, 100) + '%';
      minutesBar.className = 'github-billing-bar-fill' +
        (minutesPct >= 90 ? ' danger' : minutesPct >= 70 ? ' warn' : '');

      // Storage with progress bar
      const storageGB = billing.storage.estimatedStorageGB;
      const includedStorageGB = billing.storage.includedStorageGB || 0.5;
      const storagePctVal = includedStorageGB > 0 ? Math.round(storageGB / includedStorageGB * 1000) / 10 : 0;
      const storageLabel = storageGB < 0.01 ? '< 0.01 GB' : storageGB.toFixed(2) + ' GB';
      document.getElementById('gh-billing-storage').textContent =
        storageLabel + ` (${storagePctVal}%)`;
      const ghStorageUsedOf = LANG[currentLang].ghStorageUsedOf || LANG.en.ghStorageUsedOf;
      document.getElementById('gh-billing-storage-sub').textContent =
        ghStorageUsedOf(storageGB < 0.01 ? '< 0.01' : storageGB.toFixed(2), includedStorageGB);
      const storagePct = includedStorageGB > 0 ? (storageGB / includedStorageGB * 100) : 0;
      const storageBar = document.getElementById('gh-billing-storage-bar');
      storageBar.style.width = Math.min(storagePct, 100) + '%';
      storageBar.className = 'github-billing-bar-fill' +
        (storagePct >= 90 ? ' danger' : storagePct >= 70 ? ' warn' : '');

      // Packages bandwidth
      const bwUsed = billing.packages.totalGigabytesBandwidthUsed;
      const bwIncluded = billing.packages.includedGigabytesBandwidth;
      const bwPctVal = bwIncluded > 0 ? Math.round(bwUsed / bwIncluded * 1000) / 10 : 0;
      const bwLabel = bwUsed < 0.01 ? '< 0.01 GB' : bwUsed.toFixed(2) + ' GB';
      document.getElementById('gh-billing-packages').textContent =
        bwLabel + ` (${bwPctVal}%)`;
      const ghBandwidthUsed = LANG[currentLang].ghBandwidthUsed || LANG.en.ghBandwidthUsed;
      document.getElementById('gh-billing-packages-sub').textContent =
        ghBandwidthUsed(bwUsed.toFixed(2), formatNumber(bwIncluded));
      const bwPct = bwIncluded > 0 ? (bwUsed / bwIncluded * 100) : 0;
      const bwBar = document.getElementById('gh-billing-packages-bar');
      bwBar.style.width = Math.min(bwPct, 100) + '%';
      bwBar.className = 'github-billing-bar-fill' +
        (bwPct >= 90 ? ' danger' : bwPct >= 70 ? ' warn' : '');

      // Reset date — format as localized date
      const resetDateStr = billing.resetDate;
      if (resetDateStr) {
        const [ry, rm, rd] = resetDateStr.split('-');
        const resetFormatted = currentLang === 'de'
          ? `${rd}.${rm}.${ry}`
          : `${rm}/${rd}/${ry}`;
        document.getElementById('gh-billing-reset').textContent = resetFormatted;
      } else {
        document.getElementById('gh-billing-reset').textContent = '-';
      }
      const ghResetIn = LANG[currentLang].ghResetIn || LANG.en.ghResetIn;
      document.getElementById('gh-billing-reset-sub').textContent =
        ghResetIn(billing.storage.daysLeftInCycle);

      // Actions OS breakdown chart
      const breakdown = billing.actions.minutesUsedBreakdown;
      const osChartWrapper = document.getElementById('gh-os-chart-wrapper');
      const hasBreakdown = breakdown && Object.values(breakdown).some(v => v > 0);
      if (hasBreakdown) {
        osChartWrapper.style.display = '';
        createGithubActionsOsChart('chart-gh-actions-os', breakdown);
      } else {
        osChartWrapper.style.display = 'none';
      }
    } else {
      billingEl.style.display = 'none';
    }

    // KPIs
    // KPIs — use filtered counts when period is not "all"
    const { from: pFrom, to: pTo } = getPeriodRange();
    const filterByPeriod = (arr, dateKey) => {
      if (!pFrom) return arr;
      return arr.filter(d => d[dateKey] >= pFrom && d[dateKey] <= pTo);
    };
    const filteredHeatmap = filterByPeriod(data.heatmap, 'date');
    const filteredContributions = filteredHeatmap.reduce((s, d) => s + d.count, 0);
    const filteredCommitDaily = filterByPeriod(data.commitDaily, 'date');
    const filteredCommits = filteredCommitDaily.reduce((s, d) => s + d.commits, 0);

    document.getElementById('gh-kpi-contributions').textContent = formatNumber(pFrom ? filteredContributions : data.totalContributions);
    document.getElementById('gh-kpi-commits').textContent = formatNumber(pFrom ? filteredCommits : data.commitCount);
    document.getElementById('gh-kpi-prs').textContent = formatNumber(data.prStats.total);
    const prSubKpi = pFrom
      ? `${t('ghTotal')} · ${t('ghOpen')}: ${data.prStats.open} | ${t('ghMerged')}: ${data.prStats.merged}`
      : `${t('ghOpen')}: ${data.prStats.open} | ${t('ghMerged')}: ${data.prStats.merged}`;
    document.getElementById('gh-kpi-prs-sub').textContent = prSubKpi;
    document.getElementById('gh-kpi-repos').textContent = formatNumber(data.repoCount);
    document.getElementById('gh-kpi-repos-sub').textContent =
      (pFrom ? t('ghTotal') + ' · ' : '') + `${t('ghTotalStars')}: ${data.totalStars} | ${t('ghTotalForks')}: ${data.totalForks}`;

    // Period hint badges on non-filterable sections
    _setGhPeriodHint('gh-billing-period-hint', pFrom ? t('ghCurrentCycle') : '');
    _setGhPeriodHint('gh-actions-period-hint', pFrom ? t('ghNotFilterable') : '');
    _setGhPeriodHint('gh-repos-period-hint', pFrom ? t('ghNotFilterable') : '');

    // Heatmap — always show full year regardless of period
    renderGithubHeatmap(document.getElementById('github-heatmap'), data.heatmap);

    // Charts
    createGithubCommitChart('chart-gh-commits', filteredCommitDaily);
    createGithubLanguageChart('chart-gh-languages', data.languages);
    createGithubPrChart('chart-gh-prs', data.prStats);

    // PR Code Impact section (not filterable by period — PRs have no date in GraphQL)
    const prImpactEl = document.getElementById('github-pr-impact');
    const prStats = data.prStats;
    const prSub = pFrom ? t('ghAcrossPRsTotal') : t('ghAcrossPRs');
    if (prStats.totalAdditions > 0 || prStats.totalDeletions > 0) {
      prImpactEl.style.display = '';
      document.getElementById('gh-pr-additions').textContent = '+' + formatNumber(prStats.totalAdditions);
      document.getElementById('gh-pr-deletions').textContent = '-' + formatNumber(prStats.totalDeletions);
      const net = prStats.netLines;
      document.getElementById('gh-pr-net').textContent = (net >= 0 ? '+' : '') + formatNumber(net);
      document.getElementById('gh-pr-files').textContent = formatNumber(prStats.totalChangedFiles);
      // Update sub labels to indicate total when period is filtered
      document.querySelectorAll('#github-pr-impact .kpi-sub[data-i18n="ghAcrossPRs"]')
        .forEach(el => { el.textContent = prSub; });
      createGithubPrCodeImpactChart('chart-gh-pr-impact', prStats.codeByState);
    } else {
      prImpactEl.style.display = 'none';
    }

    // Repo selector for code frequency
    const repoSelect = document.getElementById('gh-repo-select');
    repoSelect.textContent = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = t('ghSelectRepo');
    repoSelect.appendChild(defaultOpt);
    for (const repo of data.repos.filter(r => !r.isPrivate).slice(0, 30)) {
      const opt = document.createElement('option');
      opt.value = repo.nameWithOwner;
      opt.textContent = repo.name;
      repoSelect.appendChild(opt);
    }
    repoSelect.onchange = function() {
      if (this.value) loadCodeFrequency(this.value);
    };
    // Auto-load first repo
    if (data.repos.length > 0) {
      const first = data.repos.filter(r => !r.isPrivate)[0];
      if (first) {
        repoSelect.value = first.nameWithOwner;
        loadCodeFrequency(first.nameWithOwner);
      }
    }

    // Repos table
    const tbody = document.getElementById('gh-repos-tbody');
    buildTableRows(tbody, data.repos.slice(0, 30), [
      { value: r => r.name },
      { className: 'num', value: r => r.stars },
      { className: 'num', value: r => r.forks },
      { value: r => r.language || '-' },
      { value: r => r.updatedAt ? r.updatedAt.slice(0, 10) : '-' }
    ]);

    // Refresh button + cache age indicator
    const refreshBtn = document.getElementById('gh-refresh-btn');
    refreshBtn.onclick = async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '...';
      await fetch('/api/github/refresh', { method: 'POST' }).catch(() => {});
      refreshBtn.disabled = false;
      refreshBtn.textContent = t('ghRefresh');
      loadGithub();
    };

    // Show "Updated X min ago" next to refresh button
    let cacheAgeEl = document.getElementById('gh-cache-age');
    if (!cacheAgeEl) {
      cacheAgeEl = document.createElement('span');
      cacheAgeEl.id = 'gh-cache-age';
      cacheAgeEl.style.cssText = 'margin-left:8px;font-size:0.82em;opacity:0.55';
      refreshBtn.parentNode.insertBefore(cacheAgeEl, refreshBtn.nextSibling);
    }
    if (typeof data._age === 'number' && data._cached) {
      const age = data._age < 1 ? '< 1' : String(data._age);
      cacheAgeEl.textContent = t('ghCacheAge').replace('{0}', age);
    } else {
      cacheAgeEl.textContent = '';
    }

    // Slow: actions-usage loads lazily in background (many sequential API calls)
    const actionsUsageEl = document.getElementById('github-actions-usage');
    actionsUsageEl.style.display = 'none';
    api('github/actions-usage').then(actionsUsage => {
      if (actionsUsage && !actionsUsage.error && actionsUsage.repos && actionsUsage.repos.length > 0) {
        actionsUsageEl.style.display = '';
        createGithubActionsRepoChart('chart-gh-actions-repo', actionsUsage.repos);

        // Workflow table
        const wfWrapper = document.getElementById('gh-workflows-table-wrapper');
        const wfTbody = document.getElementById('gh-workflows-tbody');
        const wfRows = [];
        for (const repo of actionsUsage.repos) {
          for (const wf of repo.workflows) {
            wfRows.push({ repo: repo.name, workflow: wf.name, minutes: wf.billableMinutes });
          }
        }
        if (wfRows.length > 0) {
          wfWrapper.style.display = '';
          buildTableRows(wfTbody, wfRows.slice(0, 50), [
            { value: r => r.repo },
            { value: r => r.workflow },
            { className: 'num', value: r => r.minutes + ' min' }
          ]);
        } else {
          wfWrapper.style.display = 'none';
        }
      }
    }).catch(() => {});

    // Code stats: LOC across top repos (lazy load)
    const codeStatsEl = document.getElementById('github-code-stats');
    codeStatsEl.style.display = 'none';
    api('github/code-stats').then(cs => {
      if (cs && !cs.error && cs.weekly && cs.weekly.length > 0) {
        // Filter weekly data by selected period
        const filtered = filterByPeriod(cs.weekly, 'week');
        const additions = filtered.reduce((s, w) => s + w.additions, 0);
        const deletions = filtered.reduce((s, w) => s + w.deletions, 0);
        const net = additions - deletions;
        if (additions > 0 || deletions > 0) {
          codeStatsEl.style.display = '';
          document.getElementById('gh-code-additions').textContent = '+' + formatNumber(additions);
          document.getElementById('gh-code-deletions').textContent = '-' + formatNumber(deletions);
          document.getElementById('gh-code-net').textContent = (net >= 0 ? '+' : '') + formatNumber(net);
          document.getElementById('gh-code-repos').textContent = cs.repos;
          document.getElementById('gh-code-additions-sub').textContent =
            t('ghAcrossRepos').replace('{0}', cs.repos);
          document.getElementById('gh-code-deletions-sub').textContent =
            t('ghAcrossRepos').replace('{0}', cs.repos);
          document.getElementById('gh-code-net-sub').textContent =
            t('ghAdditionsMinusDeletions');
        }
      }
    }).catch(() => {});

  } catch (err) {
    loadingEl.style.display = 'none';
    setupEl.style.display = '';
    console.error('GitHub load error:', err);
  }
}

function renderGithubHeatmap(container, days) {
  container.textContent = '';
  if (!days || days.length === 0) return;

  for (const day of days) {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    let level = 0;
    if (day.count >= 10) level = 4;
    else if (day.count >= 7) level = 3;
    else if (day.count >= 4) level = 2;
    else if (day.count >= 1) level = 1;
    cell.setAttribute('data-level', level);
    cell.setAttribute('data-tooltip', `${day.date}: ${day.count} contributions`);
    container.appendChild(cell);
  }
}

async function loadCodeFrequency(nameWithOwner) {
  const [owner, repo] = nameWithOwner.split('/');
  try {
    const data = await api(`github/code-frequency?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
    if (Array.isArray(data)) {
      createGithubCodeFrequencyChart('chart-gh-code-freq', data);
    }
  } catch (err) {
    console.error('Code frequency error:', err);
  }
}

// --- Claude API Tab ---
let _caConfig = null;

async function loadClaudeApi() {
  const setupEl = document.getElementById('anthropic-setup');
  const loadingEl = document.getElementById('anthropic-loading');
  const contentEl = document.getElementById('anthropic-content');

  // Check config
  if (!_caConfig) {
    try {
      _caConfig = await api('config');
    } catch {
      _caConfig = {};
    }
  }

  const isRefresh = contentEl.style.display !== 'none';
  setupEl.style.display = 'none';
  if (!isRefresh) {
    loadingEl.style.display = 'flex';
    contentEl.style.display = 'none';
  }

  try {
    const [data, budgetRes] = await Promise.all([
      api('anthropic/dashboard'),
      api('anthropic/budget').catch(() => ({ budget: null }))
    ]);

    if (data.error) {
      loadingEl.style.display = 'none';
      setupEl.style.display = '';
      const descEl = document.getElementById('anthropic-setup-desc');
      if (_caConfig.multiUser) {
        descEl.textContent = t('caSetupDescMulti');
      } else {
        descEl.textContent = t('caSetupDesc');
      }
      return;
    }

    loadingEl.style.display = 'none';
    contentEl.style.display = '';

    // Budget section
    const budgetSection = document.getElementById('anthropic-budget-section');
    budgetSection.style.display = '';
    const budgetInput = document.getElementById('anthropic-budget-input');
    const budgetBarWrapper = document.getElementById('anthropic-budget-bar-wrapper');

    if (budgetRes.budget !== null && budgetRes.budget > 0) {
      budgetInput.value = budgetRes.budget;
      budgetBarWrapper.style.display = '';
      const spent = data.totalCost;
      const remaining = Math.max(0, budgetRes.budget - spent);
      const pct = Math.min((spent / budgetRes.budget) * 100, 100);
      document.getElementById('anthropic-budget-spent').textContent = '$' + spent.toFixed(2);
      const budgetRemainingFn = LANG[currentLang].caBudgetRemaining || LANG.en.caBudgetRemaining;
      document.getElementById('anthropic-budget-remaining').textContent =
        budgetRemainingFn(remaining.toFixed(2));
      const bar = document.getElementById('anthropic-budget-bar');
      bar.style.width = pct + '%';
      bar.className = 'github-billing-bar-fill' +
        (pct >= 90 ? ' danger' : pct >= 70 ? ' warn' : '');
    } else {
      budgetBarWrapper.style.display = 'none';
    }

    // Budget save/clear handlers
    document.getElementById('anthropic-budget-save').onclick = async () => {
      const val = parseFloat(budgetInput.value);
      if (isNaN(val) || val <= 0) return;
      await fetch('/api/anthropic/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget: val })
      });
      loadClaudeApi();
    };
    document.getElementById('anthropic-budget-clear').onclick = async () => {
      await fetch('/api/anthropic/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget: null })
      });
      budgetInput.value = '';
      loadClaudeApi();
    };

    // Period filtering on daily data
    const { from: pFrom, to: pTo } = getPeriodRange();
    const filterByPeriod = (arr, dateKey) => {
      if (!pFrom) return arr;
      return arr.filter(d => d[dateKey] >= pFrom && d[dateKey] <= pTo);
    };

    const filteredDailyCosts = filterByPeriod(data.dailyCosts || [], 'date');
    const filteredDailyTokens = filterByPeriod(data.dailyTokens || [], 'date');

    // Recalculate KPIs for filtered range
    const filteredTotalCost = filteredDailyCosts.reduce((s, d) => s + d.total, 0);
    const filteredTotalInput = filteredDailyTokens.reduce((s, d) => s + d.input, 0);
    const filteredTotalOutput = filteredDailyTokens.reduce((s, d) => s + d.output, 0);
    const filteredTotalCacheRead = filteredDailyTokens.reduce((s, d) => s + d.cacheRead, 0);
    const filteredTotalCacheCreate = filteredDailyTokens.reduce((s, d) => s + d.cacheCreate, 0);
    const filteredTotalTokens = filteredTotalInput + filteredTotalOutput + filteredTotalCacheRead + filteredTotalCacheCreate;
    const filteredActiveDays = filteredDailyCosts.filter(d => d.total > 0).length;
    const filteredAvgCost = filteredActiveDays > 0 ? filteredTotalCost / filteredActiveDays : 0;
    const filteredCacheEff = filteredTotalTokens > 0
      ? Math.round((filteredTotalCacheRead / filteredTotalTokens) * 1000) / 10 : 0;

    // KPIs
    document.getElementById('ca-kpi-cost').textContent =
      '$' + (pFrom ? filteredTotalCost : data.totalCost).toFixed(2);
    document.getElementById('ca-kpi-tokens').textContent =
      formatNumber(pFrom ? filteredTotalTokens : data.totalTokens);
    const tokenBreakdownFn = LANG[currentLang].caTokenBreakdown || LANG.en.caTokenBreakdown;
    document.getElementById('ca-kpi-tokens-sub').textContent =
      tokenBreakdownFn(
        formatNumber(pFrom ? filteredTotalInput : data.totalInput),
        formatNumber(pFrom ? filteredTotalOutput : data.totalOutput),
        formatNumber(pFrom ? filteredTotalCacheRead : data.totalCacheRead)
      );
    document.getElementById('ca-kpi-avg-cost').textContent =
      '$' + (pFrom ? filteredAvgCost : data.avgCostPerDay).toFixed(2);
    document.getElementById('ca-kpi-cache').textContent =
      (pFrom ? filteredCacheEff : data.cacheEfficiency) + '%';

    // Charts
    createAnthropicDailyCostChart('chart-ca-daily-cost', filteredDailyCosts);
    createAnthropicDailyTokensChart('chart-ca-daily-tokens', filteredDailyTokens);
    createAnthropicModelChart('chart-ca-model', data.modelBreakdown || []);
    createAnthropicCostTrendChart('chart-ca-cost-trend', filteredDailyCosts);

    // Model table
    const totalCostForShare = data.totalCost || 1;
    const tbody = document.getElementById('ca-model-tbody');
    buildTableRows(tbody, (data.modelBreakdown || []).slice(0, 20), [
      { value: r => r.model },
      { className: 'num', value: r => formatNumber(r.input) },
      { className: 'num', value: r => formatNumber(r.output) },
      { className: 'num', value: r => formatNumber(r.cacheRead) },
      { className: 'num', value: r => '$' + r.cost.toFixed(2) },
      { className: 'num', value: r => (r.cost / totalCostForShare * 100).toFixed(1) + '%' }
    ]);

    // Per-API-key section
    const keyTotals = data.keyTotals || [];
    const keyBreakdown = data.keyBreakdown || [];
    const dailyTokensByKey = data.dailyTokensByKey || [];

    const hasKeyData = keyTotals.length > 0;
    const keyChartWrapper = document.getElementById('ca-key-chart-wrapper');
    const keyCostTimelineWrapper = document.getElementById('ca-key-cost-timeline-wrapper');
    const keyTableWrapper = document.getElementById('ca-key-table-wrapper');
    const keyTimelineWrapper = document.getElementById('ca-key-timeline-wrapper');

    keyChartWrapper.style.display = hasKeyData ? '' : 'none';
    keyCostTimelineWrapper.style.display = hasKeyData ? '' : 'none';
    keyTableWrapper.style.display = hasKeyData ? '' : 'none';

    if (hasKeyData) {
      // Horizontal bar chart: cost per key, stacked by model
      createAnthropicKeyChart('chart-ca-keys', keyTotals, keyBreakdown);

      // Daily cost timeline per key
      const filteredDailyByKey = filterByPeriod(dailyTokensByKey, 'date');
      createAnthropicKeyCostTimelineChart('chart-ca-key-cost-timeline', filteredDailyByKey, keyTotals);

      // Key table
      const keyTbody = document.getElementById('ca-key-tbody');
      buildTableRows(keyTbody, keyTotals.slice(0, 20), [
        { value: r => r.keyName },
        { className: 'num', value: r => formatNumber(r.totalTokens) },
        { className: 'num', value: r => formatNumber(r.totalInput) },
        { className: 'num', value: r => formatNumber(r.totalOutput) },
        { className: 'num', value: r => r.totalTokens > 0
          ? (r.totalCacheRead / r.totalTokens * 100).toFixed(1) + '%' : '0%' },
        { className: 'num', value: r => '$' + r.calculatedCost.toFixed(2) },
        { className: 'num', value: r => r.lastUsed || '-' }
      ]);

      // Token timeline: only show if > 1 key
      if (keyTotals.length > 1) {
        keyTimelineWrapper.style.display = '';
        createAnthropicKeyTimelineChart('chart-ca-key-timeline', filteredDailyByKey, keyTotals);
      } else {
        keyTimelineWrapper.style.display = 'none';
      }
    } else {
      keyCostTimelineWrapper.style.display = 'none';
      keyTimelineWrapper.style.display = 'none';
    }

    // Refresh button + cache age
    const refreshBtn = document.getElementById('ca-refresh-btn');
    refreshBtn.onclick = async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '...';
      await fetch('/api/anthropic/refresh', { method: 'POST' }).catch(() => {});
      refreshBtn.disabled = false;
      refreshBtn.textContent = t('caRefresh');
      loadClaudeApi();
    };

    let cacheAgeEl = document.getElementById('ca-cache-age');
    if (!cacheAgeEl) {
      cacheAgeEl = document.createElement('span');
      cacheAgeEl.id = 'ca-cache-age';
      cacheAgeEl.style.cssText = 'margin-left:8px;font-size:0.82em;opacity:0.55';
      refreshBtn.parentNode.insertBefore(cacheAgeEl, refreshBtn.nextSibling);
    }
    if (typeof data._age === 'number' && data._cached) {
      const age = data._age < 1 ? '< 1' : String(data._age);
      cacheAgeEl.textContent = t('ghCacheAge').replace('{0}', age);
    } else {
      cacheAgeEl.textContent = '';
    }

  } catch (err) {
    loadingEl.style.display = 'none';
    setupEl.style.display = '';
    console.error('Claude API load error:', err);
  }
}

async function loadInfo() {
  // Info tab is now documentation-only, no action needed
}

async function loadSettings() {
  if (state.multiUser) {
    loadSyncKey();
  }
  switchSyncOs(detectSyncOs());
  loadAnthropicKeyStatus();
  loadDeviceManagement();
}

async function loadDevices() {
  try {
    const devices = await api('devices');
    if (!Array.isArray(devices)) return;
    state.devices = devices;
    const switcher = document.getElementById('device-switcher');
    const select = document.getElementById('device-select');
    if (!switcher || !select) return;

    if (devices.length <= 1) {
      switcher.style.display = 'none';
      if (state.device) {
        state.device = '';
        localStorage.removeItem('device');
      }
      return;
    }

    switcher.style.display = '';
    const current = state.device;
    select.textContent = '';
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = t('allDevices');
    select.appendChild(allOpt);
    for (const d of devices) {
      const opt = document.createElement('option');
      opt.value = String(d.id);
      opt.textContent = d.name;
      if (String(d.id) === current) opt.selected = true;
      select.appendChild(opt);
    }
  } catch {
    // ignore
  }
}

async function loadDeviceManagement() {
  const section = document.getElementById('device-management');
  if (!section) return;

  try {
    const devices = await api('devices');
    if (!Array.isArray(devices) || devices.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    state.devices = devices;
    const list = document.getElementById('device-list');
    list.textContent = '';
    // Clear any lingering "new key" box
    const oldKeyBox = section.querySelector('.device-new-key');
    if (oldKeyBox) oldKeyBox.remove();

    for (const d of devices) {
      const row = document.createElement('div');
      row.className = 'device-list-item';

      const info = document.createElement('div');
      info.className = 'device-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'device-item-name';
      nameEl.textContent = d.name;
      const meta = document.createElement('div');
      meta.className = 'device-item-meta';
      const syncText = d.lastSyncAt
        ? t('deviceLastSync') + ': ' + new Date(d.lastSyncAt + 'Z').toLocaleString()
        : t('deviceLastSync') + ': ' + t('deviceNever');
      meta.textContent = syncText + ' · Key: …' + d.apiKeyLast8;
      info.appendChild(nameEl);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'device-actions';

      const installBtn = document.createElement('button');
      installBtn.className = 'btn-small';
      installBtn.textContent = t('installFor');
      installBtn.addEventListener('click', () => {
        const os = detectSyncOs();
        const ext = os === 'windows' ? 'ps1' : 'sh';
        window.location.href = `/api/sync-agent/install.${ext}?device=${d.id}`;
      });

      const regenBtn = document.createElement('button');
      regenBtn.className = 'btn-small';
      regenBtn.textContent = t('regenerateKey');
      regenBtn.addEventListener('click', async () => {
        if (!confirm(t('regenerateConfirm'))) return;
        const res = await fetch(`/api/devices/${d.id}/regenerate-key`, { method: 'POST' });
        const data = await res.json();
        if (data.apiKey) {
          await loadDeviceManagement();
          _showNewDeviceKey(d.name, data.apiKey, document.getElementById('device-list'));
        }
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-small btn-danger';
      delBtn.textContent = '\u00D7';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', async () => {
        if (!confirm(t('deleteDeviceConfirm'))) return;
        const res = await fetch(`/api/devices/${d.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.error) { alert(data.error); return; }
        loadDeviceManagement();
        loadDevices();
      });

      const renameBtn = document.createElement('button');
      renameBtn.className = 'btn-small btn-icon';
      renameBtn.textContent = '\u270E';
      renameBtn.title = t('renameDevice') || 'Rename';
      renameBtn.addEventListener('click', async () => {
        const newName = prompt(t('renameDevicePrompt') || 'New device name:', d.name);
        if (!newName || newName.trim() === '' || newName.trim() === d.name) return;
        const res = await fetch(`/api/devices/${d.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim() })
        });
        const data = await res.json();
        if (!data.error) {
          loadDeviceManagement();
          loadDevices();
        }
      });

      actions.appendChild(renameBtn);
      actions.appendChild(installBtn);
      actions.appendChild(regenBtn);
      actions.appendChild(delBtn);

      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    }
  } catch {
    section.style.display = 'none';
  }
}

function _showNewDeviceKey(name, apiKey, container, osOverride) {
  const existing = container.parentElement.querySelector('.device-new-key');
  if (existing) existing.remove();
  const box = document.createElement('div');
  box.className = 'device-new-key';
  const msg = document.createElement('div');
  msg.textContent = t('deviceCreated');
  msg.style.marginBottom = '6px';
  msg.style.fontSize = '13px';

  // API Key
  const keyLabel = document.createElement('div');
  keyLabel.textContent = 'API Key:';
  keyLabel.style.fontSize = '11px';
  keyLabel.style.color = 'var(--muted)';
  keyLabel.style.marginBottom = '2px';
  const code = document.createElement('code');
  code.textContent = apiKey;
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-small';
  copyBtn.textContent = t('copy') || 'Copy';
  copyBtn.style.marginLeft = '8px';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(apiKey);
    copyBtn.textContent = '\u2713';
    setTimeout(() => { copyBtn.textContent = t('copy') || 'Copy'; }, 1500);
  });

  // Install command with OS toggle
  const installHeader = document.createElement('div');
  installHeader.style.display = 'flex';
  installHeader.style.alignItems = 'center';
  installHeader.style.gap = '8px';
  installHeader.style.marginTop = '8px';
  installHeader.style.marginBottom = '2px';
  const installLabel = document.createElement('div');
  installLabel.textContent = t('installCommand') || 'Install Command:';
  installLabel.style.fontSize = '11px';
  installLabel.style.color = 'var(--muted)';
  const osToggle = document.createElement('div');
  osToggle.style.display = 'flex';
  osToggle.style.gap = '2px';
  const initialOs = osOverride || detectSyncOs();
  const unixBtn = document.createElement('button');
  unixBtn.className = 'btn-small' + (initialOs !== 'windows' ? ' active' : '');
  unixBtn.textContent = 'macOS/Linux';
  unixBtn.style.fontSize = '10px';
  unixBtn.style.padding = '1px 6px';
  const winBtn = document.createElement('button');
  winBtn.className = 'btn-small' + (initialOs === 'windows' ? ' active' : '');
  winBtn.textContent = 'Windows';
  winBtn.style.fontSize = '10px';
  winBtn.style.padding = '1px 6px';
  osToggle.appendChild(unixBtn);
  osToggle.appendChild(winBtn);
  installHeader.appendChild(installLabel);
  installHeader.appendChild(osToggle);
  const installCode = document.createElement('code');
  installCode.style.display = 'block';
  installCode.style.wordBreak = 'break-all';
  installCode.style.fontSize = '12px';
  const curlCmd = `curl -sL "${location.origin}/api/sync-agent/install.sh?key=${apiKey}" | bash`;
  const psCmd = `powershell -ExecutionPolicy Bypass -Command "irm '${location.origin}/api/sync-agent/install.ps1?key=${apiKey}' | iex"`;
  installCode.textContent = initialOs === 'windows' ? psCmd : curlCmd;
  unixBtn.addEventListener('click', () => {
    installCode.textContent = curlCmd;
    unixBtn.classList.add('active');
    winBtn.classList.remove('active');
  });
  winBtn.addEventListener('click', () => {
    installCode.textContent = psCmd;
    winBtn.classList.add('active');
    unixBtn.classList.remove('active');
  });
  const copyInstallBtn = document.createElement('button');
  copyInstallBtn.className = 'btn-small';
  copyInstallBtn.textContent = t('copy') || 'Copy';
  copyInstallBtn.style.marginTop = '4px';
  copyInstallBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(installCode.textContent);
    copyInstallBtn.textContent = '\u2713';
    setTimeout(() => { copyInstallBtn.textContent = t('copy') || 'Copy'; }, 1500);
  });

  box.appendChild(msg);
  box.appendChild(keyLabel);
  box.appendChild(code);
  box.appendChild(copyBtn);
  box.appendChild(installHeader);
  box.appendChild(installCode);
  box.appendChild(copyInstallBtn);
  container.parentElement.insertBefore(box, container.parentElement.querySelector('.device-add-row'));
}

async function loadAnthropicKeyStatus() {
  const section = document.getElementById('anthropic-key-section');
  if (!section) return;
  section.style.display = '';

  try {
    const data = await api('user/anthropic-key');
    const statusEl = document.getElementById('anthropic-key-status');
    const input = document.getElementById('anthropic-key-input');
    if (data.hasKey) {
      statusEl.textContent = t('caKeyConfigured');
      statusEl.className = 'settings-status success';
      input.placeholder = '••••••••••••••••';
    } else {
      statusEl.textContent = '';
      statusEl.className = 'settings-status';
      input.placeholder = 'sk-ant-admin...';
    }
  } catch {
    // ignore
  }

  document.getElementById('save-anthropic-key').onclick = async () => {
    const input = document.getElementById('anthropic-key-input');
    const key = input.value.trim();
    const statusEl = document.getElementById('anthropic-key-status');
    if (!key) return;
    if (!key.startsWith('sk-ant-admin')) {
      statusEl.textContent = t('caKeyInvalid');
      statusEl.className = 'settings-status error';
      return;
    }
    try {
      const res = await fetch('/api/user/anthropic-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      const data = await res.json();
      if (data.error) {
        statusEl.textContent = data.error;
        statusEl.className = 'settings-status error';
      } else {
        statusEl.textContent = t('caKeySaved');
        statusEl.className = 'settings-status success';
        input.value = '';
        input.placeholder = '••••••••••••••••';
      }
    } catch {
      statusEl.textContent = 'Error';
      statusEl.className = 'settings-status error';
    }
  };

  document.getElementById('delete-anthropic-key').onclick = async () => {
    const statusEl = document.getElementById('anthropic-key-status');
    const input = document.getElementById('anthropic-key-input');
    try {
      await fetch('/api/user/anthropic-key', { method: 'DELETE' });
      statusEl.textContent = t('caKeyDeleted');
      statusEl.className = 'settings-status';
      input.placeholder = 'sk-ant-admin...';
      input.value = '';
    } catch {
      statusEl.textContent = 'Error';
      statusEl.className = 'settings-status error';
    }
  };
}

// --- Chart resize handler (debounced) ---
let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    for (const key of Object.keys(chartInstances)) {
      if (chartInstances[key]) chartInstances[key].resize();
    }
  }, 250);
});

// --- Achievement Notifications ---
let achievementNotificationTimer = null;

function showAchievementNotification(achievements) {
  const container = document.getElementById('achievement-notification');
  const list = container.querySelector('.achievement-notification-list');
  const title = container.querySelector('.achievement-notification-title');

  // Append new items (supports accumulation if already visible)
  for (const ach of achievements) {
    const item = document.createElement('div');
    item.className = `achievement-notification-item tier-${ach.tier}`;
    const icon = document.createElement('div');
    icon.className = 'achievement-icon';
    icon.textContent = ach.emoji;
    const info = document.createElement('div');
    info.className = 'achievement-info';
    const name = document.createElement('div');
    name.className = 'achievement-name';
    name.textContent = t('ach_' + ach.key) || ach.key;
    const desc = document.createElement('div');
    desc.className = 'achievement-desc';
    desc.textContent = t('ach_' + ach.key + '_desc') || '';
    info.appendChild(name);
    if (desc.textContent) info.appendChild(desc);
    const pts = document.createElement('div');
    pts.className = 'achievement-points';
    pts.textContent = '+' + ach.points;
    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(pts);
    list.appendChild(item);
  }

  title.textContent = t('achievementUnlocked');
  container.classList.remove('hidden');

  // Re-trigger slide-in animation
  container.style.animation = 'none';
  container.offsetHeight; // force reflow
  container.style.animation = '';

  // Auto-dismiss after 15s
  clearTimeout(achievementNotificationTimer);
  achievementNotificationTimer = setTimeout(() => closeAchievementNotification(), 15000);
}

function closeAchievementNotification() {
  clearTimeout(achievementNotificationTimer);
  const container = document.getElementById('achievement-notification');
  container.classList.add('hidden');
  // Remove all child nodes safely
  const list = container.querySelector('.achievement-notification-list');
  while (list.firstChild) list.removeChild(list.firstChild);
}

// --- SSE Live Updates ---
let sseConnection = null;

function connectSSE() {
  if (sseConnection) sseConnection.close();

  const evtSource = new EventSource('/api/live');
  sseConnection = evtSource;
  const dot = document.getElementById('live-dot');

  evtSource.onopen = () => { dot.classList.remove('disconnected'); };

  let _sseReloadTimer = null;
  evtSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'update' || data.type === 'new-session') {
      chartAnimateNext = false;
      // Debounce rapid SSE updates to prevent duplicate renders
      clearTimeout(_sseReloadTimer);
      _sseReloadTimer = setTimeout(() => loadTab(state.activeTab), 300);
    } else if (data.type === 'achievement-unlocked' && data.achievements) {
      showAchievementNotification(data.achievements);
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

  // Period navigation (prev/next)
  document.getElementById('period-prev')?.addEventListener('click', () => navigatePeriod(-1));
  document.getElementById('period-next')?.addEventListener('click', () => navigatePeriod(1));

  document.getElementById('filter-project')?.addEventListener('change', (e) => {
    state.sessionFilter.project = e.target.value;
    loadSessions();
  });

  // Achievement sort buttons
  document.querySelectorAll('.ach-sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _achievementSort = btn.dataset.sort;
      document.querySelectorAll('.ach-sort-btn').forEach(b => b.classList.toggle('active', b === btn));
      if (_achievementsData) renderAchievementsGrid(_achievementsData, _achievementSort);
    });
  });

  document.getElementById('rebuild-btn')?.addEventListener('click', rebuild);
  document.getElementById('plan-usage-refresh')?.addEventListener('click', async () => {
    const btn = document.getElementById('plan-usage-refresh');
    btn.disabled = true;
    btn.textContent = '...';
    try {
      await fetch('/api/plan-usage/refresh', { method: 'POST' });
      await loadPlanUsage();
    } catch { /* ignore */ }
    btn.disabled = false;
    btn.textContent = t('caRefresh');
  });
  document.getElementById('export-html-btn')?.addEventListener('click', exportHtml);
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  document.getElementById('copy-api-key')?.addEventListener('click', copySyncKey);
  document.getElementById('regenerate-api-key')?.addEventListener('click', regenerateSyncKey);
  document.getElementById('copy-curl-cmd')?.addEventListener('click', copyCurlCommand);
  document.getElementById('download-install-script')?.addEventListener('click', downloadInstallScript);
  document.getElementById('copy-ps-cmd')?.addEventListener('click', copyPsCommand);
  document.getElementById('download-ps-script')?.addEventListener('click', downloadPsScript);

  // Device switcher
  document.getElementById('device-select')?.addEventListener('change', (e) => {
    state.device = e.target.value;
    if (state.device) {
      localStorage.setItem('device', state.device);
    } else {
      localStorage.removeItem('device');
    }
    loadTab(state.activeTab);
  });

  // Device OS toggle
  const osToggle = document.getElementById('device-os-toggle');
  if (osToggle) {
    const detectedOs = detectSyncOs();
    osToggle.querySelectorAll('.btn-small').forEach(btn => {
      btn.classList.toggle('active', (detectedOs === 'windows') === (btn.dataset.os === 'windows'));
      btn.addEventListener('click', () => {
        osToggle.querySelectorAll('.btn-small').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  // Add device button
  document.getElementById('add-device-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('new-device-name');
    const name = (input.value || '').trim();
    if (!name) return;
    const activeOsBtn = document.querySelector('#device-os-toggle .btn-small.active');
    const selectedOs = activeOsBtn?.dataset.os === 'windows' ? 'windows' : 'unix';
    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      input.value = '';
      await loadDeviceManagement();
      _showNewDeviceKey(name, data.apiKey, document.getElementById('device-list'), selectedOs);
      loadDevices();
    } catch { /* ignore */ }
  });

  // Period comparison
  document.querySelectorAll('.period-btn-b').forEach(btn => {
    btn.addEventListener('click', () => setPeriodB(btn.dataset.periodB));
  });
  // Restore active Period B button
  document.querySelectorAll('.period-btn-b').forEach(b => b.classList.toggle('active', b.dataset.periodB === state.periodB));

  const periodBFrom = document.getElementById('period-b-from');
  const periodBTo = document.getElementById('period-b-to');
  if (periodBFrom) {
    if (state.periodBFrom) periodBFrom.value = state.periodBFrom;
    periodBFrom.addEventListener('change', () => {
      state.periodBFrom = periodBFrom.value;
      localStorage.setItem('periodBFrom', periodBFrom.value);
      if (state.periodB === 'custom') loadPeriodComparison();
    });
  }
  if (periodBTo) {
    if (state.periodBTo) periodBTo.value = state.periodBTo;
    periodBTo.addEventListener('change', () => {
      state.periodBTo = periodBTo.value;
      localStorage.setItem('periodBTo', periodBTo.value);
      if (state.periodB === 'custom') loadPeriodComparison();
    });
  }

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
    // Load devices for switcher
    await loadDevices();

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
