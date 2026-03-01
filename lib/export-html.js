const { PRICING, getModelLabel } = require('./pricing');

/**
 * Generate a self-contained, interactive HTML export document.
 * Includes Chart.js (CDN), tabbed navigation, all KPIs, interactive charts, and sortable tables.
 * Serves as a full snapshot of the dashboard at export time.
 */
function generateExportHTML({ overview, daily, sessions, projects, models, tools, hourly, productivity, stopReasons, weekday, achievements, periodLabel }) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Serialize data for inline JS
  const J = (v) => JSON.stringify(v);

  const totalLines = (overview.linesWritten || 0) + (overview.linesAdded || 0);
  const netLines = (overview.linesWritten || 0) + (overview.linesAdded || 0) - (overview.linesRemoved || 0);

  // Achievements summary
  const achUnlocked = achievements ? achievements.filter(a => a.unlocked).length : 0;
  const achTotal = achievements ? achievements.length : 0;
  const achPoints = achievements ? achievements.filter(a => a.unlocked).reduce((s, a) => s + (a.points || 0), 0) : 0;
  const achMaxPoints = achievements ? achievements.reduce((s, a) => s + (a.points || 0), 0) : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Token Tracker — Snapshot ${esc(periodLabel)}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0d1117;--surface:#161b22;--surface2:#1c2128;--border:#30363d;--text:#e6edf3;--text-muted:#8b949e;--accent:#58a6ff;--green:#3fb950;--purple:#bc8cff;--yellow:#d29922;--red:#f85149;--teal:#39d2c0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);padding:0;margin:0}
.wrap{max-width:1200px;margin:0 auto;padding:24px 32px}
h1{font-size:22px;font-weight:700;margin-bottom:2px}
.sub{font-size:13px;color:var(--text-muted);margin-bottom:20px}
/* Tabs */
.tabs{display:flex;gap:4px;margin-bottom:20px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding-bottom:8px}
.tab-btn{padding:7px 14px;border:none;background:transparent;color:var(--text-muted);font-size:13px;border-radius:6px;cursor:pointer;transition:all .15s}
.tab-btn:hover{color:var(--text);background:var(--surface2)}
.tab-btn.active{background:var(--surface);color:var(--text);font-weight:600}
.tab-panel{display:none}.tab-panel.active{display:block}
/* KPIs */
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px}
.kpi-label{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.kpi-value{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
.kpi-sub{font-size:11px;color:var(--text-muted);margin-top:2px}
.c-blue .kpi-value{color:var(--accent)}.c-green .kpi-value{color:var(--green)}
.c-purple .kpi-value{color:var(--purple)}.c-yellow .kpi-value{color:var(--yellow)}
.c-teal .kpi-value{color:var(--teal)}.c-red .kpi-value{color:var(--red)}
/* Charts */
.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
.chart-grid.full{grid-template-columns:1fr}
.chart-box{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px}
.chart-box h3{font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
.chart-container{position:relative;height:260px}
/* Tables */
.table-section{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:20px;overflow-x:auto}
.table-section h3{font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);border-bottom:1px solid var(--border);cursor:pointer;user-select:none}
th:hover{color:var(--text)}
th.num{text-align:right}
td{padding:7px 10px;border-bottom:1px solid #21262d;font-variant-numeric:tabular-nums}
td.num{text-align:right}
tr:hover td{background:var(--surface2)}
/* Achievements */
.ach-grid{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.ach-card{display:flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px;opacity:0.35}
.ach-card.unlocked{opacity:1;border-color:var(--accent)}
.ach-pts{font-size:10px;color:var(--accent);font-weight:600;margin-left:auto}
.ach-cat-header{width:100%;margin-top:12px;font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px}
/* Footer */
.footer{font-size:11px;color:var(--text-muted);text-align:center;margin-top:32px;padding:16px 0;border-top:1px solid var(--border)}
.footer a{color:var(--accent);text-decoration:none}
/* Responsive */
@media(max-width:768px){
  .wrap{padding:16px}
  .kpi-grid{grid-template-columns:repeat(2,1fr);gap:8px}
  .chart-grid{grid-template-columns:1fr;gap:12px}
  .chart-container{height:220px}
  .tabs{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;gap:2px;padding-bottom:6px}
  .tabs::-webkit-scrollbar{display:none}
  .tab-btn{flex-shrink:0;padding:8px 12px;font-size:12px;min-height:44px}
  h1{font-size:18px}
  .kpi-value{font-size:18px}
  .kpi{padding:10px 12px}
  .chart-box{padding:12px}
  table{font-size:11px}
  th{padding:6px 8px;font-size:9px}
  td{padding:6px 8px}
  .ach-card{padding:8px 10px;font-size:11px}
}
@media(max-width:480px){
  .wrap{padding:12px 10px}
  .kpi-grid{gap:6px;margin-bottom:14px}
  .kpi{padding:10px;border-radius:8px}
  .kpi-label{font-size:10px}
  .kpi-value{font-size:16px}
  .kpi-sub{font-size:10px}
  .chart-container{height:200px}
  .chart-box{padding:10px;border-radius:8px}
  .chart-box h3{font-size:11px;margin-bottom:8px}
  .chart-grid{gap:10px;margin-bottom:14px}
  h1{font-size:16px}
  .sub{font-size:11px;margin-bottom:14px}
  .tab-btn{padding:8px 10px;font-size:11px}
  .table-section{padding:10px;border-radius:8px}
  table{font-size:10px}
  th{padding:5px 6px;font-size:9px}
  td{padding:5px 6px}
  .ach-grid{gap:5px}
  .ach-card{font-size:10px;padding:6px 8px;border-radius:6px}
  .ach-cat-header{font-size:11px;margin-top:10px}
  .footer{font-size:10px;margin-top:20px;padding:12px 0}
}
@media(max-width:412px){
  .kpi-grid{grid-template-columns:repeat(2,1fr);gap:5px}
  .kpi-value{font-size:15px}
  .kpi-label{font-size:9px;letter-spacing:.3px}
  .kpi-sub{font-size:9px}
  .tab-btn{padding:7px 9px;font-size:11px}
  .chart-container{height:180px}
}
@media print{body{background:#fff;color:#000}:root{--bg:#fff;--surface:#f6f8fa;--surface2:#eef1f5;--border:#d0d7de;--text:#1f2328;--text-muted:#57606a}.kpi-value{color:#000!important}}
</style>
</head>
<body>
<div class="wrap">
<h1>Claude Token Tracker — Snapshot</h1>
<div class="sub">${esc(periodLabel)} &mdash; Exported ${esc(now)}</div>

<div class="tabs" id="tabs-bar"></div>

<!-- Overview Tab -->
<div class="tab-panel active" id="tab-overview">
  <div class="kpi-grid">
    <div class="kpi c-blue"><div class="kpi-label">Total Tokens</div><div class="kpi-value">${esc(fmtTokens(overview.totalTokens))}</div><div class="kpi-sub">In: ${esc(fmtTokens(overview.inputTokens))} | Out: ${esc(fmtTokens(overview.outputTokens))}</div></div>
    <div class="kpi c-green"><div class="kpi-label">Estimated Cost</div><div class="kpi-value">${esc(fmtCost(overview.estimatedCost))}</div><div class="kpi-sub">API-equivalent estimate</div></div>
    <div class="kpi c-purple"><div class="kpi-label">Sessions</div><div class="kpi-value">${esc(fmtNum(overview.sessions))}</div><div class="kpi-sub">Unique sessions</div></div>
    <div class="kpi c-yellow"><div class="kpi-label">Messages</div><div class="kpi-value">${esc(fmtNum(overview.messages))}</div><div class="kpi-sub">Assistant responses</div></div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Input Tokens</div><div class="kpi-value" style="color:var(--accent)">${esc(fmtTokens(overview.inputTokens))}</div><div class="kpi-sub">${esc(fmtCost(overview.inputCost || 0))}</div></div>
    <div class="kpi"><div class="kpi-label">Output Tokens</div><div class="kpi-value" style="color:var(--green)">${esc(fmtTokens(overview.outputTokens))}</div><div class="kpi-sub">${esc(fmtCost(overview.outputCost || 0))}</div></div>
    <div class="kpi"><div class="kpi-label">Cache Read</div><div class="kpi-value" style="color:var(--purple)">${esc(fmtTokens(overview.cacheReadTokens))}</div><div class="kpi-sub">${esc(fmtCost(overview.cacheReadCost || 0))}</div></div>
    <div class="kpi"><div class="kpi-label">Cache Create</div><div class="kpi-value" style="color:var(--yellow)">${esc(fmtTokens(overview.cacheCreateTokens))}</div><div class="kpi-sub">${esc(fmtCost(overview.cacheCreateCost || 0))}</div></div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Write</div><div class="kpi-value" style="color:var(--green)">${esc(fmtNum(overview.linesWritten || 0))}</div><div class="kpi-sub">lines</div></div>
    <div class="kpi"><div class="kpi-label">Edit</div><div class="kpi-value" style="color:var(--yellow)">${esc(fmtNum(overview.linesAdded || 0))}</div><div class="kpi-sub">lines</div></div>
    <div class="kpi"><div class="kpi-label">Delete</div><div class="kpi-value" style="color:var(--red)">${esc(fmtNum(overview.linesRemoved || 0))}</div><div class="kpi-sub">lines</div></div>
    <div class="kpi"><div class="kpi-label">Net Change</div><div class="kpi-value" style="color:${netLines >= 0 ? 'var(--green)' : 'var(--red)'}">${netLines >= 0 ? '+' : ''}${esc(fmtNum(netLines))}</div><div class="kpi-sub">lines</div></div>
  </div>
  <div class="chart-grid full"><div class="chart-box"><h3>Daily Token Usage</h3><div class="chart-container"><canvas id="c-daily-tokens"></canvas></div></div></div>
  <div class="chart-grid">
    <div class="chart-box"><h3>Daily Cost Trend</h3><div class="chart-container"><canvas id="c-daily-cost"></canvas></div></div>
    <div class="chart-box"><h3>Model Distribution</h3><div class="chart-container"><canvas id="c-model-dist"></canvas></div></div>
  </div>
  <div class="chart-grid full"><div class="chart-box"><h3>Activity by Hour</h3><div class="chart-container" style="height:200px"><canvas id="c-hourly"></canvas></div></div></div>
</div>

<!-- Charts Tab -->
<div class="tab-panel" id="tab-charts">
  <div class="chart-grid">
    <div class="chart-box"><h3>Cost Breakdown</h3><div class="chart-container"><canvas id="c-cost-breakdown"></canvas></div></div>
    <div class="chart-box"><h3>Cumulative Cost</h3><div class="chart-container"><canvas id="c-cumulative-cost"></canvas></div></div>
  </div>
  <div class="chart-grid">
    <div class="chart-box"><h3>Weekday Activity</h3><div class="chart-container"><canvas id="c-weekday"></canvas></div></div>
    <div class="chart-box"><h3>Stop Reasons</h3><div class="chart-container"><canvas id="c-stop-reasons"></canvas></div></div>
  </div>
  <div class="chart-grid full"><div class="chart-box"><h3>Daily Lines of Code</h3><div class="chart-container"><canvas id="c-daily-lines"></canvas></div></div></div>
</div>

<!-- Sessions Tab -->
<div class="tab-panel" id="tab-sessions">
  <div class="table-section"><h3>Sessions (${sessions.length})</h3><table id="tbl-sessions">
    <thead><tr><th>Date</th><th>Project</th><th>Model</th><th class="num">Duration</th><th class="num">Messages</th><th class="num">Tools</th><th class="num">Tokens</th><th class="num">+/-</th><th class="num">Cost</th></tr></thead>
    <tbody id="tbody-sessions"></tbody>
  </table></div>
</div>

<!-- Projects Tab -->
<div class="tab-panel" id="tab-projects">
  <div class="chart-grid full"><div class="chart-box"><h3>Tokens by Project</h3><div class="chart-container chart-projects" style="height:${Math.max(200, projects.length * 28)}px"><canvas id="c-projects"></canvas></div></div></div>
  <div class="table-section"><h3>Projects</h3><table id="tbl-projects">
    <thead><tr><th>Project</th><th class="num">Tokens</th><th class="num">Input</th><th class="num">Output</th><th class="num">Sessions</th><th class="num">Messages</th><th class="num">Cost</th></tr></thead>
    <tbody id="tbody-projects"></tbody>
  </table></div>
</div>

<!-- Models Tab -->
<div class="tab-panel" id="tab-models">
  <div class="table-section"><h3>Models</h3><table id="tbl-models">
    <thead><tr><th>Model</th><th class="num">Input</th><th class="num">Output</th><th class="num">Cache Read</th><th class="num">Cache Create</th><th class="num">Messages</th><th class="num">Cost</th></tr></thead>
    <tbody id="tbody-models"></tbody>
  </table></div>
</div>

<!-- Tools Tab -->
<div class="tab-panel" id="tab-tools">
  <div class="chart-grid full"><div class="chart-box"><h3>Tool Usage</h3><div class="chart-container chart-tools" style="height:${Math.max(200, (tools || []).length * 24)}px"><canvas id="c-tools"></canvas></div></div></div>
  <div class="table-section"><h3>Tools</h3><table id="tbl-tools">
    <thead><tr><th>Tool</th><th class="num">Calls</th><th class="num">%</th></tr></thead>
    <tbody id="tbody-tools"></tbody>
  </table></div>
</div>

<!-- Productivity Tab -->
<div class="tab-panel" id="tab-productivity">
  <div class="kpi-grid">
    <div class="kpi c-blue"><div class="kpi-label">Tokens/Min</div><div class="kpi-value">${esc(fmtNum(productivity ? productivity.tokensPerMin : 0))}</div></div>
    <div class="kpi c-green"><div class="kpi-label">Lines/Hour</div><div class="kpi-value">${esc(fmtNum(productivity ? productivity.linesPerHour : 0))}</div></div>
    <div class="kpi c-yellow"><div class="kpi-label">Msgs/Session</div><div class="kpi-value">${productivity ? productivity.msgsPerSession.toFixed(1) : '0'}</div></div>
    <div class="kpi c-red"><div class="kpi-label">Cost/Line</div><div class="kpi-value">$${productivity ? productivity.costPerLine.toFixed(3) : '0.000'}</div></div>
  </div>
  <div class="kpi-grid">
    <div class="kpi c-teal"><div class="kpi-label">Cache Savings</div><div class="kpi-value">${esc(fmtCost(productivity ? productivity.cacheSavings : 0))}</div></div>
    <div class="kpi"><div class="kpi-label">Code Ratio</div><div class="kpi-value">${productivity ? productivity.codeRatio.toFixed(1) : '0'}%</div></div>
    <div class="kpi"><div class="kpi-label">Coding Hours</div><div class="kpi-value">${productivity ? productivity.codingHours.toFixed(1) : '0'}h</div></div>
    <div class="kpi"><div class="kpi-label">Total Lines</div><div class="kpi-value">${esc(fmtNum(productivity ? productivity.totalLines : 0))}</div></div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Tokens/Line</div><div class="kpi-value">${esc(fmtNum(productivity ? productivity.tokensPerLine : 0))}</div></div>
    <div class="kpi"><div class="kpi-label">Tools/Turn</div><div class="kpi-value">${productivity ? productivity.toolsPerTurn.toFixed(1) : '0'}</div></div>
    <div class="kpi"><div class="kpi-label">Lines/Turn</div><div class="kpi-value">${productivity ? productivity.linesPerTurn.toFixed(1) : '0'}</div></div>
    <div class="kpi"><div class="kpi-label">I/O Ratio</div><div class="kpi-value">${productivity ? productivity.ioRatio.toFixed(1) : '0'}%</div></div>
  </div>
</div>

<!-- Achievements Tab -->
<div class="tab-panel" id="tab-achievements">
  <div class="kpi-grid">
    <div class="kpi c-green"><div class="kpi-label">Unlocked</div><div class="kpi-value">${achUnlocked} / ${achTotal}</div><div class="kpi-sub">${achTotal > 0 ? (achUnlocked / achTotal * 100).toFixed(1) : 0}%</div></div>
    <div class="kpi c-teal"><div class="kpi-label">Total Points</div><div class="kpi-value">${esc(fmtNum(achPoints))}</div></div>
    <div class="kpi c-purple"><div class="kpi-label">Max Points</div><div class="kpi-value">${esc(fmtNum(achMaxPoints))}</div></div>
    <div class="kpi c-yellow"><div class="kpi-label">Completion</div><div class="kpi-value">${achMaxPoints > 0 ? (achPoints / achMaxPoints * 100).toFixed(1) : 0}%</div><div class="kpi-sub">by points</div></div>
  </div>
  <div class="chart-grid full"><div class="chart-box"><h3>Achievements Timeline</h3><div class="chart-container"><canvas id="c-achievements"></canvas></div></div></div>
  <div class="ach-grid" id="ach-grid"></div>
</div>

<div class="footer">
  Generated by <a href="https://github.com/pepperonas/claude-token-tracker">Claude Token Tracker</a> &mdash; ${esc(now)}
</div>
</div>

<script>
// --- Data ---
var DATA = {
  daily: ${J(daily)},
  sessions: ${J(sessions.slice(0, 200))},
  projects: ${J(projects)},
  models: ${J(models)},
  tools: ${J(tools || [])},
  hourly: ${J(hourly || [])},
  stopReasons: ${J(stopReasons || [])},
  weekday: ${J(weekday || [])},
  achievements: ${J((achievements || []).map(a => ({ key: a.key, category: a.category, tier: a.tier, emoji: a.emoji, points: a.points, unlocked: a.unlocked, unlockedAt: a.unlockedAt })))}
};

// --- Helpers ---
function fmt(n){if(n>=1e9)return(n/1e9).toFixed(1)+'B';if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(1)+'K';return String(n)}
function fmtC(n){return '$'+Number(n).toFixed(2)}
function fmtN(n){return Number(n).toLocaleString('en-US')}
function fmtD(d){if(!d)return'';return d.slice(5,7)+'-'+d.slice(8,10)}

// --- Tab switching ---
var TAB_NAMES=['overview','charts','sessions','projects','models','tools','productivity','achievements'];
var TAB_LABELS=['Overview','Charts','Sessions','Projects','Models','Tools','Productivity','Achievements'];
function initTabs(){
  var bar=document.getElementById('tabs-bar');
  TAB_NAMES.forEach(function(name,i){
    var btn=document.createElement('button');
    btn.className='tab-btn'+(i===0?' active':'');
    btn.textContent=TAB_LABELS[i];
    btn.setAttribute('data-tab',name);
    btn.addEventListener('click',function(){switchTab(name)});
    bar.appendChild(btn);
  });
}
function switchTab(tab){
  document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.remove('active')});
  document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-tab')===tab)});
  document.getElementById('tab-'+tab).classList.add('active');
  if(!window._rendered)window._rendered={};
  if(!window._rendered[tab]){window._rendered[tab]=true;renderTab(tab)}
}

// --- Sortable tables ---
function makeTableSortable(tableId){
  var table=document.getElementById(tableId);if(!table)return;
  var thead=table.querySelector('thead');
  var tbody=table.querySelector('tbody');
  var ths=thead.querySelectorAll('th');
  var sortCol=-1,sortAsc=true;
  ths.forEach(function(th,i){
    th.addEventListener('click',function(){
      if(sortCol===i)sortAsc=!sortAsc;else{sortCol=i;sortAsc=true}
      var rows=Array.from(tbody.querySelectorAll('tr'));
      rows.sort(function(a,b){
        var aT=a.children[i].textContent.trim();
        var bT=b.children[i].textContent.trim();
        var aV=parseVal(aT),bV=parseVal(bT);
        if(aV!==null&&bV!==null)return sortAsc?aV-bV:bV-aV;
        return sortAsc?aT.localeCompare(bT):bT.localeCompare(aT);
      });
      rows.forEach(function(r){tbody.appendChild(r)});
      ths.forEach(function(h){h.style.color=''});
      th.style.color='var(--accent)';
    });
  });
}
function parseVal(s){
  if(s==='-')return-Infinity;
  s=s.replace(/^\\$/,'').replace(/%$/,'').replace(/,/g,'');
  var m=s.match(/^([\\d.]+)\\s*([KMB])$/i);
  if(m)return parseFloat(m[1])*{K:1e3,M:1e6,B:1e9}[m[2].toUpperCase()];
  var dm=s.match(/^(\\d+)m$/);if(dm)return parseInt(dm[1]);
  var n=parseFloat(s);if(!isNaN(n))return n;
  return null;
}

// --- Chart colors ---
var C={input:'#58a6ff',output:'#3fb950',cacheRead:'#bc8cff',cacheCreate:'#d29922',cost:'#39d2c0',red:'#f85149',models:['#58a6ff','#3fb950','#bc8cff','#d29922','#f85149','#39d2c0','#f778ba','#79c0ff','#7ee787','#ffa657']};

// --- Render charts per tab ---
function renderTab(tab){
  switch(tab){
    case 'overview': renderOverview(); break;
    case 'charts': renderCharts(); break;
    case 'sessions': renderSessions(); break;
    case 'projects': renderProjects(); break;
    case 'models': renderModels(); break;
    case 'tools': renderTools(); break;
    case 'achievements': renderAchievements(); break;
  }
}

function addCell(tr,text,cls){var td=document.createElement('td');td.textContent=text;if(cls)td.className=cls;tr.appendChild(td)}

function renderOverview(){
  var d=DATA.daily;
  var xMaxTicks=isNarrow()?8:isMobile()?12:undefined;
  new Chart(document.getElementById('c-daily-tokens'),{type:'bar',data:{labels:d.map(function(x){return fmtD(x.date)}),datasets:[
    {label:'Input',data:d.map(function(x){return x.inputTokens}),backgroundColor:C.input,stack:'s'},
    {label:'Output',data:d.map(function(x){return x.outputTokens}),backgroundColor:C.output,stack:'s'}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+fmt(c.raw)}}}},scales:{x:{stacked:true,grid:{display:false},ticks:{maxTicksLimit:xMaxTicks,font:{size:isMobile()?9:11}}},y:{stacked:true,ticks:{callback:function(v){return fmt(v)},font:{size:isMobile()?9:11}}}}}});
  new Chart(document.getElementById('c-daily-cost'),{type:'line',data:{labels:d.map(function(x){return fmtD(x.date)}),datasets:[{label:'Cost',data:d.map(function(x){return x.cost}),borderColor:C.cost,backgroundColor:'rgba(57,210,192,0.1)',fill:true,tension:0.3,pointRadius:isMobile()?0:1}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{display:false},ticks:{maxTicksLimit:xMaxTicks,font:{size:isMobile()?9:11}}},y:{ticks:{callback:function(v){return fmtC(v)},font:{size:isMobile()?9:11}}}}}});
  var m=DATA.models;
  new Chart(document.getElementById('c-model-dist'),{type:'doughnut',data:{labels:m.map(function(x){return isMobile()&&x.label.length>16?x.label.slice(0,14)+'…':x.label}),datasets:[{data:m.map(function(x){return x.inputTokens+x.outputTokens+x.cacheReadTokens+x.cacheCreateTokens}),backgroundColor:C.models.slice(0,m.length)}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:isMobile()?'bottom':'right',labels:{font:{size:isMobile()?9:11}}}}}});
  var h=DATA.hourly;
  if(h.length){new Chart(document.getElementById('c-hourly'),{type:'bar',data:{labels:h.map(function(x){return isNarrow()?String(x.hour):String(x.hour).padStart(2,'0')+':00'}),datasets:[{label:'Messages',data:h.map(function(x){return x.messages}),backgroundColor:C.input}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{display:false},ticks:{font:{size:isMobile()?8:11},maxRotation:isMobile()?0:undefined}},y:{beginAtZero:true,ticks:{font:{size:isMobile()?9:11}}}}}})}
}

function renderCharts(){
  var d=DATA.daily;
  var mt=isNarrow()?8:isMobile()?12:undefined;
  var fs=isMobile()?9:11;
  new Chart(document.getElementById('c-cost-breakdown'),{type:'bar',data:{labels:d.map(function(x){return fmtD(x.date)}),datasets:[
    {label:'Input',data:d.map(function(x){return x.inputCost||0}),backgroundColor:C.input,stack:'s'},
    {label:'Output',data:d.map(function(x){return x.outputCost||0}),backgroundColor:C.output,stack:'s'},
    {label:'Cache Read',data:d.map(function(x){return x.cacheReadCost||0}),backgroundColor:C.cacheRead,stack:'s'},
    {label:'Cache Create',data:d.map(function(x){return x.cacheCreateCost||0}),backgroundColor:C.cacheCreate,stack:'s'}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:fs}}}},scales:{x:{stacked:true,grid:{display:false},ticks:{maxTicksLimit:mt,font:{size:fs}}},y:{stacked:true,ticks:{callback:function(v){return fmtC(v)},font:{size:fs}}}}}});
  var cum=0;var cumD=d.map(function(x){cum+=x.cost||0;return{date:x.date,cost:Math.round(cum*100)/100}});
  new Chart(document.getElementById('c-cumulative-cost'),{type:'line',data:{labels:cumD.map(function(x){return fmtD(x.date)}),datasets:[{label:'Cumulative',data:cumD.map(function(x){return x.cost}),borderColor:C.cost,backgroundColor:'rgba(57,210,192,0.08)',fill:true,tension:0.3,pointRadius:isMobile()?0:1}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{display:false},ticks:{maxTicksLimit:mt,font:{size:fs}}},y:{ticks:{callback:function(v){return fmtC(v)},font:{size:fs}}}}}});
  var w=DATA.weekday;
  if(w.length){new Chart(document.getElementById('c-weekday'),{type:'bar',data:{labels:w.map(function(x){return isMobile()&&x.day.length>3?x.day.slice(0,3):x.day}),datasets:[{label:'Messages',data:w.map(function(x){return x.messages}),backgroundColor:C.input},{label:'Cost',data:w.map(function(x){return x.cost}),backgroundColor:C.cost,yAxisID:'y1'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:fs}}}},scales:{x:{grid:{display:false},ticks:{font:{size:fs}}},y:{position:'left',beginAtZero:true,ticks:{font:{size:fs}}},y1:{position:'right',grid:{drawOnChartArea:false},ticks:{callback:function(v){return fmtC(v)},font:{size:fs}}}}}})}
  var sr=DATA.stopReasons;
  if(sr.length){new Chart(document.getElementById('c-stop-reasons'),{type:'doughnut',data:{labels:sr.map(function(x){return x.reason}),datasets:[{data:sr.map(function(x){return x.count}),backgroundColor:C.models.slice(0,sr.length)}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:isMobile()?'bottom':'right',labels:{font:{size:fs}}}}}})}
  new Chart(document.getElementById('c-daily-lines'),{type:'bar',data:{labels:d.map(function(x){return fmtD(x.date)}),datasets:[
    {label:'Write',data:d.map(function(x){return x.linesWritten||0}),backgroundColor:C.output,stack:'s'},
    {label:'Edit',data:d.map(function(x){return x.linesAdded||0}),backgroundColor:C.cacheCreate,stack:'s'},
    {label:'Delete',data:d.map(function(x){return-(x.linesRemoved||0)}),backgroundColor:C.red,stack:'s'}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:fs}}}},scales:{x:{stacked:true,grid:{display:false},ticks:{maxTicksLimit:mt,font:{size:fs}}},y:{stacked:true,ticks:{font:{size:fs}}}}}});
}

function renderSessions(){
  var tbody=document.getElementById('tbody-sessions');
  DATA.sessions.forEach(function(s){
    var tr=document.createElement('tr');
    var lA=s.linesAdded||0,lR=s.linesRemoved||0,lW=s.linesWritten||0;
    var pm=lA+lR+lW===0?'-':'+'+fmtN(lA)+' -'+fmtN(lR)+' w'+fmtN(lW);
    addCell(tr,s.firstTs?s.firstTs.slice(0,16).replace('T',' '):'-');
    addCell(tr,s.project);
    addCell(tr,s.models.join(', '));
    addCell(tr,s.durationMin+'m','num');
    addCell(tr,fmtN(s.messages),'num');
    addCell(tr,fmtN(s.toolCalls||0),'num');
    addCell(tr,fmt(s.inputTokens+s.outputTokens+s.cacheReadTokens+s.cacheCreateTokens),'num');
    addCell(tr,pm,'num');
    addCell(tr,fmtC(s.cost),'num');
    tbody.appendChild(tr);
  });
  makeTableSortable('tbl-sessions');
}

function renderProjects(){
  var p=DATA.projects;
  new Chart(document.getElementById('c-projects'),{type:'bar',data:{labels:p.map(function(x){var n=x.name;return isMobile()&&n.length>20?n.slice(0,18)+'…':n}),datasets:[
    {label:'Input',data:p.map(function(x){return x.inputTokens}),backgroundColor:C.input},
    {label:'Output',data:p.map(function(x){return x.outputTokens}),backgroundColor:C.output}
  ]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,scales:{x:{stacked:true,ticks:{callback:function(v){return fmt(v)},font:{size:isMobile()?9:11}}},y:{stacked:true,ticks:{font:{size:isMobile()?9:11}}}}}});
  var tbody=document.getElementById('tbody-projects');
  p.forEach(function(r){
    var tr=document.createElement('tr');
    addCell(tr,r.name);addCell(tr,fmt(r.totalTokens),'num');addCell(tr,fmt(r.inputTokens),'num');
    addCell(tr,fmt(r.outputTokens),'num');addCell(tr,fmtN(r.sessions),'num');
    addCell(tr,fmtN(r.messages),'num');addCell(tr,fmtC(r.cost),'num');
    tbody.appendChild(tr);
  });
  makeTableSortable('tbl-projects');
}

function renderModels(){
  var tbody=document.getElementById('tbody-models');
  DATA.models.forEach(function(m){
    var tr=document.createElement('tr');
    addCell(tr,m.label);addCell(tr,fmt(m.inputTokens),'num');addCell(tr,fmt(m.outputTokens),'num');
    addCell(tr,fmt(m.cacheReadTokens),'num');addCell(tr,fmt(m.cacheCreateTokens),'num');
    addCell(tr,fmtN(m.messages),'num');addCell(tr,fmtC(m.cost),'num');
    tbody.appendChild(tr);
  });
  makeTableSortable('tbl-models');
}

function renderTools(){
  var t=DATA.tools;
  if(t.length){new Chart(document.getElementById('c-tools'),{type:'bar',data:{labels:t.map(function(x){var n=x.name;return isMobile()&&n.length>20?n.slice(0,18)+'…':n}),datasets:[{label:'Calls',data:t.map(function(x){return x.count}),backgroundColor:C.input}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,scales:{x:{ticks:{callback:function(v){return fmtN(v)},font:{size:isMobile()?9:11}}},y:{ticks:{font:{size:isMobile()?9:11}}}}}})}
  var tbody=document.getElementById('tbody-tools');
  t.forEach(function(r){
    var tr=document.createElement('tr');
    addCell(tr,r.name);addCell(tr,fmtN(r.count),'num');addCell(tr,r.percentage+'%','num');
    tbody.appendChild(tr);
  });
  makeTableSortable('tbl-tools');
}

function renderAchievements(){
  var ach=DATA.achievements;
  var dayMap={},ptsMap={};
  ach.forEach(function(a){
    if(!a.unlocked||!a.unlockedAt)return;
    var day=a.unlockedAt.slice(0,10);
    dayMap[day]=(dayMap[day]||0)+1;
    ptsMap[day]=(ptsMap[day]||0)+(a.points||0);
  });
  var days=Object.keys(dayMap).sort();
  var cum=0;
  var tData=days.map(function(d){cum+=ptsMap[d]||0;return{date:d,count:dayMap[d],cumPts:cum}});
  if(tData.length){
    var fs=isMobile()?9:11;var mt=isNarrow()?8:isMobile()?12:undefined;
    new Chart(document.getElementById('c-achievements'),{type:'bar',data:{labels:tData.map(function(x){return fmtD(x.date)}),datasets:[
      {label:'Unlocked',data:tData.map(function(x){return x.count}),backgroundColor:C.output,yAxisID:'y',order:2},
      {label:'Cumulative Points',data:tData.map(function(x){return x.cumPts}),borderColor:C.cost,backgroundColor:'transparent',type:'line',yAxisID:'y1',tension:0.3,pointRadius:isMobile()?1:2,order:1}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:fs}}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:mt,font:{size:fs}}},y:{position:'left',beginAtZero:true,ticks:{stepSize:1,font:{size:fs}}},y1:{position:'right',beginAtZero:true,grid:{drawOnChartArea:false},ticks:{font:{size:fs}}}}}});
  }
  var grid=document.getElementById('ach-grid');
  var cats={},catOrder=[];
  ach.forEach(function(a){if(!cats[a.category]){cats[a.category]=[];catOrder.push(a.category)}cats[a.category].push(a)});
  catOrder.forEach(function(cat){
    var h=document.createElement('div');
    h.className='ach-cat-header';
    h.textContent=cat;
    grid.appendChild(h);
    cats[cat].forEach(function(a){
      var card=document.createElement('div');
      card.className='ach-card'+(a.unlocked?' unlocked':'');
      var emoji=document.createElement('span');
      emoji.textContent=a.emoji||'';
      var name=document.createElement('span');
      name.textContent=' '+a.key;
      var pts=document.createElement('span');
      pts.className='ach-pts';
      pts.textContent=(a.points||0)+'pts';
      card.appendChild(emoji);
      card.appendChild(name);
      card.appendChild(pts);
      grid.appendChild(card);
    });
  });
}

// --- Mobile detection ---
function isMobile(){return window.innerWidth<=768}
function isNarrow(){return window.innerWidth<=480}

// --- Init ---
window.addEventListener('DOMContentLoaded',function(){
  Chart.defaults.color='#8b949e';Chart.defaults.borderColor='#30363d40';
  Chart.defaults.font.family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  Chart.defaults.font.size=isMobile()?10:11;
  Chart.defaults.plugins.legend.labels.boxWidth=isMobile()?8:10;
  Chart.defaults.plugins.legend.labels.padding=isMobile()?8:12;
  initTabs();
  renderTab('overview');
  window._rendered={overview:true};
});
<\/script>
</body>
</html>`;
}

// Formatters used in template strings above (server-side)
function fmtTokens(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtCost(n) {
  return '$' + Number(n).toFixed(2);
}

function fmtNum(n) {
  return Number(n).toLocaleString('en-US');
}

module.exports = { generateExportHTML };
