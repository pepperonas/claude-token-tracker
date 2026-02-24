const { PRICING, getModelLabel } = require('./pricing');

/**
 * Generate a self-contained HTML export document with inline CSS
 * @param {object} overview - Overview data from aggregator
 * @param {Array} daily - Daily data from aggregator
 * @param {Array} sessions - Sessions data from aggregator
 * @param {Array} projects - Projects data from aggregator
 * @param {Array} models - Models data from aggregator
 * @param {string} periodLabel - Human-readable period label
 * @returns {string} Complete HTML document as string
 */
function generateExportHTML({ overview, daily, sessions, projects, models, periodLabel }) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  function fmt(n) {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  }

  function fmtCost(n) {
    return '$' + Number(n).toFixed(2);
  }

  function fmtNum(n) {
    return Number(n).toLocaleString('en-US');
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Build daily cost bars (CSS-only chart)
  const maxCost = Math.max(...daily.map(d => d.cost), 0.01);
  const costBars = daily.slice(-30).map(d => {
    const pct = Math.round((d.cost / maxCost) * 100);
    const dateLabel = d.date.slice(5); // MM-DD
    return `<div style="display:flex;align-items:end;gap:2px;flex:1;min-width:18px;flex-direction:column;">
      <div style="font-size:9px;color:#8b949e;transform:rotate(-45deg);white-space:nowrap;">${fmtCost(d.cost)}</div>
      <div style="width:100%;background:#39d2c0;border-radius:3px 3px 0 0;height:${Math.max(pct, 2)}px;min-height:2px;"></div>
      <div style="font-size:8px;color:#8b949e;text-align:center;width:100%;overflow:hidden;">${esc(dateLabel)}</div>
    </div>`;
  }).join('');

  // Build sessions table (top 50)
  const topSessions = sessions.slice(0, 50);
  const sessionRows = topSessions.map(s => `<tr>
    <td>${esc(s.firstTs ? s.firstTs.slice(0, 16).replace('T', ' ') : '-')}</td>
    <td>${esc(s.project)}</td>
    <td>${esc(s.models.join(', '))}</td>
    <td style="text-align:right;">${s.durationMin}m</td>
    <td style="text-align:right;">${fmtNum(s.messages)}</td>
    <td style="text-align:right;">${fmt(s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreateTokens)}</td>
    <td style="text-align:right;">${fmtCost(s.cost)}</td>
  </tr>`).join('');

  // Build projects table
  const projectRows = projects.map(p => `<tr>
    <td>${esc(p.name)}</td>
    <td style="text-align:right;">${fmt(p.totalTokens)}</td>
    <td style="text-align:right;">${fmtNum(p.sessions)}</td>
    <td style="text-align:right;">${fmtNum(p.messages)}</td>
    <td style="text-align:right;">${fmtCost(p.cost)}</td>
  </tr>`).join('');

  // Build models table
  const modelRows = models.map(m => `<tr>
    <td>${esc(m.label)}</td>
    <td style="text-align:right;">${fmt(m.inputTokens)}</td>
    <td style="text-align:right;">${fmt(m.outputTokens)}</td>
    <td style="text-align:right;">${fmt(m.cacheReadTokens)}</td>
    <td style="text-align:right;">${fmtNum(m.messages)}</td>
    <td style="text-align:right;">${fmtCost(m.cost)}</td>
  </tr>`).join('');

  const totalLines = (overview.linesWritten || 0) + (overview.linesAdded || 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Token Tracker — Export ${esc(periodLabel)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#0d1117;color:#e6edf3;padding:32px;max-width:1100px;margin:0 auto}
h1{font-size:20px;font-weight:700;margin-bottom:4px}
.period{font-size:13px;color:#8b949e;margin-bottom:24px}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.kpi{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:16px}
.kpi-label{font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.kpi-value{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}
.kpi:nth-child(1) .kpi-value{color:#58a6ff}
.kpi:nth-child(2) .kpi-value{color:#3fb950}
.kpi:nth-child(3) .kpi-value{color:#bc8cff}
.kpi:nth-child(4) .kpi-value{color:#d29922}
.chart-section{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:16px;margin-bottom:24px}
.chart-section h2{font-size:13px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}
.bar-chart{display:flex;align-items:end;height:120px;gap:1px;padding-top:20px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px}
th{text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#8b949e;border-bottom:1px solid #30363d}
td{padding:8px 10px;border-bottom:1px solid #21262d;font-variant-numeric:tabular-nums}
tr:hover td{background:#1c2128}
.table-section{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:16px;margin-bottom:24px;overflow-x:auto}
.table-section h2{font-size:13px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}
.footer{font-size:11px;color:#8b949e;text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #30363d}
@media print{body{background:#fff;color:#000;padding:16px}.kpi,.chart-section,.table-section{background:#f6f8fa;border-color:#d0d7de}.kpi-label,.chart-section h2,.table-section h2{color:#57606a}th{color:#57606a;border-color:#d0d7de}td{border-color:#d8dee4}.kpi:nth-child(1) .kpi-value,.kpi:nth-child(2) .kpi-value,.kpi:nth-child(3) .kpi-value,.kpi:nth-child(4) .kpi-value{color:#000}.footer{color:#57606a;border-color:#d0d7de}}
@media(max-width:600px){.kpi-grid{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<h1>Claude Token Tracker</h1>
<div class="period">${esc(periodLabel)} &mdash; Exported ${esc(now)}</div>

<div class="kpi-grid">
  <div class="kpi">
    <div class="kpi-label">Total Tokens</div>
    <div class="kpi-value">${fmt(overview.totalTokens)}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Estimated Cost</div>
    <div class="kpi-value">${fmtCost(overview.estimatedCost)}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Sessions</div>
    <div class="kpi-value">${fmtNum(overview.sessions)}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Lines of Code</div>
    <div class="kpi-value">${fmtNum(totalLines)}</div>
  </div>
</div>

<div class="chart-section">
  <h2>Daily Cost (last ${daily.slice(-30).length} days)</h2>
  <div class="bar-chart">${costBars}</div>
</div>

<div class="table-section">
  <h2>Sessions (Top ${topSessions.length})</h2>
  <table>
    <thead><tr><th>Date</th><th>Project</th><th>Model</th><th style="text-align:right">Duration</th><th style="text-align:right">Messages</th><th style="text-align:right">Tokens</th><th style="text-align:right">Cost</th></tr></thead>
    <tbody>${sessionRows}</tbody>
  </table>
</div>

<div class="table-section">
  <h2>Projects</h2>
  <table>
    <thead><tr><th>Project</th><th style="text-align:right">Tokens</th><th style="text-align:right">Sessions</th><th style="text-align:right">Messages</th><th style="text-align:right">Cost</th></tr></thead>
    <tbody>${projectRows}</tbody>
  </table>
</div>

<div class="table-section">
  <h2>Models</h2>
  <table>
    <thead><tr><th>Model</th><th style="text-align:right">Input</th><th style="text-align:right">Output</th><th style="text-align:right">Cache Read</th><th style="text-align:right">Messages</th><th style="text-align:right">Cost</th></tr></thead>
    <tbody>${modelRows}</tbody>
  </table>
</div>

<div class="footer">
  Generated by Claude Token Tracker &mdash; ${esc(now)}
</div>
</body>
</html>`;
}

module.exports = { generateExportHTML };
