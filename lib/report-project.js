'use strict';

/**
 * Standalone, print-optimised per-project report.
 *
 * Deliberately self-contained: no CDN, no external stylesheet, no chart
 * library. The page is meant to be downloaded, mailed around and printed —
 * anything fetched at render time would eventually 404 or be blocked, and a
 * canvas chart prints as a blank box in several browsers. Charts are therefore
 * plain inline SVG.
 *
 * "PDF" is the browser's own print-to-PDF (?print=1 opens the dialog). There is
 * no server-side PDF engine, and adding one would mean a new native dependency
 * for a worse-looking result than the browser's.
 */

const { getPricingMeta } = require('./pricing');

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const nf = (n, d = 0) => Number(n || 0).toLocaleString('de-DE', {
  minimumFractionDigits: d, maximumFractionDigits: d
});
const money = (n) => '$' + nf(n, 2);

function tokens(n) {
  const v = Number(n || 0);
  if (v >= 1e9) return nf(v / 1e9, 2) + ' Mrd.';
  if (v >= 1e6) return nf(v / 1e6, 1) + ' Mio.';
  if (v >= 1e3) return nf(v / 1e3, 1) + ' Tsd.';
  return nf(v);
}

function duration(min) {
  const m = Math.round(Number(min) || 0);
  if (m <= 0) return '–';
  const h = Math.floor(m / 60);
  return h > 0 ? `${nf(h)} h ${m % 60} min` : `${m} min`;
}

function dateLabel(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Vertical bar chart as inline SVG. `pick` reads the plotted value from a row.
 * Bars scale to the largest value; an all-zero series renders as a flat axis
 * rather than dividing by zero.
 */
function barChart(rows, pick, opts = {}) {
  const W = 720, H = 200, padL = 52, padB = 26, padT = 10, padR = 6;
  if (!rows.length) return '<p class="muted">Keine Daten im Zeitraum.</p>';
  const vals = rows.map(pick);
  const max = Math.max(...vals, 0);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const bw = plotW / rows.length;
  const y = (v) => (max > 0 ? padT + plotH - (v / max) * plotH : padT + plotH);

  const bars = rows.map((r, i) => {
    const v = vals[i];
    const h = Math.max(max > 0 && v > 0 ? 1 : 0, padT + plotH - y(v));
    const x = padL + i * bw;
    return `<rect x="${(x + bw * 0.12).toFixed(1)}" y="${y(v).toFixed(1)}" `
      + `width="${(bw * 0.76).toFixed(1)}" height="${h.toFixed(1)}" class="bar">`
      + `<title>${esc(r.date)}: ${esc(opts.fmt ? opts.fmt(v) : nf(v))}</title></rect>`;
  }).join('');

  // Three gridlines are enough to read a magnitude off; more clutters print.
  const grid = [0, 0.5, 1].map(f => {
    const gy = padT + plotH - f * plotH;
    return `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" class="grid"/>`
      + `<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" class="axis" text-anchor="end">`
      + `${esc(opts.fmt ? opts.fmt(max * f) : nf(max * f))}</text>`;
  }).join('');

  // Label at most ~8 ticks, otherwise the axis becomes an ink blot.
  const step = Math.max(1, Math.ceil(rows.length / 8));
  const xLabels = rows.map((r, i) => {
    if (i % step !== 0) return '';
    const x = padL + i * bw + bw / 2;
    return `<text x="${x.toFixed(1)}" y="${H - 8}" class="axis" text-anchor="middle">`
      + `${esc(String(r.date).slice(5))}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" `
    + `aria-label="${esc(opts.label || 'Verlauf')}">${grid}${bars}${xLabels}</svg>`;
}

/**
 * Horizontal share bars — reads better in print than a pie.
 * Sorted by the plotted value: the caller's list is ordered by tokens, and a
 * cost bar chart whose bars do not descend reads as broken.
 */
function shareBars(items, pick, fmt) {
  if (!items.length) return '<p class="muted">Keine Daten im Zeitraum.</p>';
  const sorted = [...items].sort((a, b) => pick(b) - pick(a));
  const max = Math.max(...sorted.map(pick), 0);
  return '<div class="shares">' + sorted.map(it => {
    const v = pick(it);
    const pct = max > 0 ? (v / max) * 100 : 0;
    return `<div class="share-row"><span class="share-name">${esc(it.name)}</span>`
      + `<span class="share-track"><span class="share-fill" style="width:${pct.toFixed(1)}%"></span></span>`
      + `<span class="share-val">${esc(fmt(v))}</span></div>`;
  }).join('') + '</div>';
}

function kpi(label, value, note) {
  return `<div class="kpi"><div class="kpi-label">${esc(label)}</div>`
    + `<div class="kpi-value">${esc(value)}</div>`
    + (note ? `<div class="kpi-note">${esc(note)}</div>` : '') + '</div>';
}

/**
 * @param {object} data  getProjectDetail() payload
 * @param {object} opts  { periodLabel, print, generatedAt }
 */
function generateProjectReport(data, opts = {}) {
  const periodLabel = opts.periodLabel || 'Gesamter Zeitraum';
  const generated = opts.generatedAt ? new Date(opts.generatedAt) : new Date();
  const pricing = getPricingMeta();

  const ccKnown = (data.cacheCreate5mTokens || 0) + (data.cacheCreate1hTokens || 0);
  const ccTotal = ccKnown + (data.cacheCreateUnsplitTokens || 0);
  const ccPct = ccTotal > 0 ? Math.round((ccKnown / ccTotal) * 100) : 100;

  const costRows = [
    ['Eingabe', data.inputTokens, data.inputCost],
    ['Ausgabe', data.outputTokens, data.outputCost],
    ['Cache gelesen', data.cacheReadTokens, data.cacheReadCost],
    ['Cache geschrieben (5 Min)', (data.cacheCreate5mTokens || 0) + (data.cacheCreateUnsplitTokens || 0), data.cacheCreate5mCost],
    ['Cache geschrieben (1 Std)', data.cacheCreate1hTokens || 0, data.cacheCreate1hCost]
  ].filter(r => (r[1] || 0) > 0 || (r[2] || 0) > 0);

  const costTotal = costRows.reduce((a, r) => a + (r[2] || 0), 0);

  const sessions = (data.sessionList || []).slice(0, 25);

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Token-Report — ${esc(data.name)}</title>
<style>
  :root { --ink:#16181d; --muted:#5c6472; --line:#e2e5ea; --accent:#3b5bdb; --bg:#fff; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page { max-width:820px; margin:0 auto; padding:32px 28px 56px; }
  header { border-bottom:2px solid var(--ink); padding-bottom:14px; margin-bottom:24px; }
  h1 { margin:0 0 4px; font-size:22px; letter-spacing:-.2px; word-break:break-word; }
  .sub { color:var(--muted); font-size:13px; }
  h2 { margin:32px 0 12px; font-size:15px; text-transform:uppercase; letter-spacing:.6px;
       color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:6px; }
  .kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  .kpi { border:1px solid var(--line); border-radius:8px; padding:12px 14px; }
  .kpi-label { font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted); }
  .kpi-value { font-size:21px; font-weight:600; margin-top:2px;
               font-variant-numeric:tabular-nums; word-break:break-word; }
  .kpi-note { font-size:11px; color:var(--muted); margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
  th,td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); font-size:13px; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:var(--muted); }
  td.num, th.num { text-align:right; }
  tfoot td { font-weight:600; border-top:2px solid var(--ink); border-bottom:none; }
  .chart { width:100%; height:auto; }
  .bar { fill:var(--accent); }
  .grid { stroke:var(--line); stroke-width:1; }
  .axis { fill:var(--muted); font-size:10px; }
  .shares { display:flex; flex-direction:column; gap:6px; }
  .share-row { display:grid; grid-template-columns:150px 1fr 92px; gap:10px; align-items:center; font-size:13px; }
  .share-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .share-track { background:var(--line); border-radius:3px; height:10px; }
  .share-fill { display:block; background:var(--accent); border-radius:3px; height:10px; }
  .share-val { text-align:right; font-variant-numeric:tabular-nums; }
  .tags { display:flex; flex-wrap:wrap; gap:6px; }
  .tag { border:1px solid var(--line); border-radius:20px; padding:3px 10px; font-size:12px; }
  .tag b { font-weight:600; }
  .muted { color:var(--muted); }
  .meth p { margin:0 0 10px; }
  .meth dt { font-weight:600; margin-top:12px; }
  .meth dd { margin:2px 0 0; color:var(--muted); }
  .note { border-left:3px solid var(--accent); padding:8px 12px; background:#f6f8fd;
          border-radius:0 6px 6px 0; font-size:13px; margin:12px 0; }
  footer { margin-top:36px; padding-top:12px; border-top:1px solid var(--line);
           color:var(--muted); font-size:11px; }
  /* Deliberately NOT sticky: a floating bar covered a table row while
     scrolling, and hiding data is worse than scrolling back up for a button. */
  .toolbar { padding:0 0 10px; display:flex; gap:8px; justify-content:flex-end; }
  .toolbar button { font:inherit; font-size:13px; padding:6px 14px; border:1px solid var(--line);
                    background:#fff; border-radius:20px; cursor:pointer; }
  .toolbar button:hover { border-color:var(--accent); color:var(--accent); }
  @media print {
    .toolbar { display:none; }
    .page { max-width:none; padding:0; }
    h2 { break-after:avoid; }
    table, .kpis, svg { break-inside:avoid; }
    tr { break-inside:avoid; }
    @page { size:A4; margin:16mm 14mm; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="toolbar"><button onclick="window.print()">Drucken / als PDF sichern</button></div>

  <header>
    <h1>${esc(data.name)}</h1>
    <div class="sub">Token- und Kostenreport &middot; ${esc(periodLabel)}
      &middot; erstellt ${esc(generated.toLocaleString('de-DE'))}</div>
  </header>

  <div class="kpis">
    ${kpi('Kosten (API-äquivalent)', money(data.cost))}
    ${kpi('Tokens gesamt', tokens(data.totalTokens), `davon ${tokens(data.cacheReadTokens)} Cache-Lesen`)}
    ${kpi('Nachrichten', nf(data.messages))}
    ${kpi('Sitzungen', nf(data.sessions))}
    ${kpi('Aktive Zeit', duration(data.totalActiveMin), `Spanne ${duration(data.spanMin)}`)}
    ${kpi('Netto-Zeilen', `+${nf(data.linesAdded)} / −${nf(data.linesRemoved)}`,
    `${nf(data.linesWritten)} geschrieben`)}
  </div>

  <div class="note">Die Kosten sind der Betrag, den dieselbe Nutzung über die Claude-API kosten
    würde. In einem Claude-Abo fällt er nicht an — die Zahl misst Verbrauch, sie ist keine Rechnung.</div>

  <h2>Kosten nach Komponente</h2>
  <table>
    <thead><tr><th>Komponente</th><th class="num">Tokens</th><th class="num">Kosten</th><th class="num">Anteil</th></tr></thead>
    <tbody>
      ${costRows.map(([label, tok, c]) => `<tr><td>${esc(label)}</td>`
    + `<td class="num">${esc(nf(tok))}</td><td class="num">${esc(money(c))}</td>`
    + `<td class="num">${esc(costTotal > 0 ? nf((c / costTotal) * 100, 1) + ' %' : '–')}</td></tr>`).join('')}
    </tbody>
    <tfoot><tr><td>Summe</td><td class="num">${esc(nf(data.totalTokens))}</td>
      <td class="num">${esc(money(data.cost))}</td><td class="num">100 %</td></tr></tfoot>
  </table>

  <h2>Kostenverlauf</h2>
  ${barChart(data.daily || [], d => d.cost, { fmt: v => money(v), label: 'Kosten je Tag' })}

  <h2>Modelle</h2>
  ${shareBars((data.models || []).map(m => ({ name: m.name, cost: m.cost, messages: m.messages })),
    m => m.cost, v => money(v))}
  <table style="margin-top:14px;">
    <thead><tr><th>Modell</th><th class="num">Nachrichten</th><th class="num">Tokens</th><th class="num">Kosten</th></tr></thead>
    <tbody>${(data.models || []).map(m => `<tr><td>${esc(m.name)}</td>`
    + `<td class="num">${esc(nf(m.messages))}</td><td class="num">${esc(tokens(m.tokens))}</td>`
    + `<td class="num">${esc(money(m.cost))}</td></tr>`).join('')}</tbody>
  </table>

  ${(data.tools || []).length ? `<h2>Werkzeuge</h2><div class="tags">${(data.tools || []).map(t =>
    `<span class="tag">${esc(t.name)} <b>${esc(nf(t.calls))}</b></span>`).join('')}</div>` : ''}

  ${sessions.length ? `<h2>Sitzungen (${nf(sessions.length)} von ${nf(data.sessions)})</h2>
  <table>
    <thead><tr><th>Beginn</th><th>Modell</th><th class="num">Aktiv</th>
      <th class="num">Nachrichten</th><th class="num">Tokens</th><th class="num">Kosten</th></tr></thead>
    <tbody>${sessions.map(s => `<tr><td>${esc(dateLabel(s.firstTs))}</td>`
    + `<td>${esc((s.models || []).join(', '))}</td>`
    + `<td class="num">${esc(duration(s.activeMin))}</td>`
    + `<td class="num">${esc(nf(s.messages))}</td>`
    + `<td class="num">${esc(tokens(s.totalTokens))}</td>`
    + `<td class="num">${esc(money(s.cost))}</td></tr>`).join('')}</tbody>
  </table>` : ''}

  <h2>Rechenweg</h2>
  <div class="meth">
    <p>Alle Werte stammen aus den JSONL-Protokollen, die Claude Code unter
      <code>~/.claude/projects</code> schreibt. Geschätzt wird nichts, außer es steht dabei.</p>
    <dl>
      <dt>Tokens</dt><dd>Eingabe + Ausgabe + Cache-Lesen + Cache-Schreiben aus dem
        <code>usage</code>-Objekt jeder API-Antwort. Cache-Lesen überwiegt meist deutlich —
        das ist wiederverwendeter Kontext, kein neuer Text.</dd>
      <dt>Kosten</dt><dd>Je Nachricht Tokens / 1.000.000 × Preis der Komponente, zum Preis
        des Nachrichtendatums. Cache-Schreibvorgänge haben zwei Stufen: 5 Minuten zu
        1,25× Eingabepreis, 1 Stunde zu 2×.</dd>
      <dt>Nachrichten</dt><dd>Assistenz-Antworten mit <code>usage</code>-Objekt, dedupliziert
        über die API-Nachrichten-ID (Streaming schreibt dieselbe ID mehrfach).</dd>
      <dt>Aktive Zeit</dt><dd>Abstände zwischen aufeinanderfolgenden Nachrichten auf einer
        gemeinsamen Zeitachse, jeder Abstand auf 5 Minuten gedeckelt. Parallele Sitzungen
        teilen sich die Achse — dieselbe Minute wird nie doppelt gezählt.</dd>
      <dt>Netto-Zeilen</dt><dd>Aus den <code>Edit</code>- und <code>Write</code>-Aufrufen
        im Protokoll. Änderungen über Bash (sed, Heredocs) sind unsichtbar; die Zahl ist
        eine Untergrenze.</dd>
      <dt>Preisquelle</dt><dd>${esc(pricing.source === 'litellm'
      ? 'LiteLLM-Datensatz, zuletzt abgerufen ' + (pricing.fetchedAt ? new Date(pricing.fetchedAt).toLocaleString('de-DE') : 'unbekannt')
      : 'Eingebaute Fallback-Tabelle (kein Live-Abruf verfügbar)')}.</dd>
      <dt>Nicht erfasst</dt><dd>Websuchen (10 $ je 1.000), Fast-Mode (2×), US-Inferenz (1,1×)
        und der Batch-Rabatt (−50 %).</dd>
      ${ccTotal > 0 ? `<dt>Abdeckung der Cache-Stufen</dt><dd>Für ${ccPct} % der
        Cache-Schreibtokens ist die Laufzeit (5 Min / 1 Std) bekannt. Der Rest stammt aus
        Nachrichten, die vor der Erfassung dieser Aufteilung gespeichert wurden, und wird
        zum 5-Minuten-Satz berechnet.</dd>` : ''}
    </dl>
  </div>

  <footer>
    Claude Token Tracker &middot; Zeitraum ${esc(periodLabel)} &middot;
    Datenstand ${esc(dateLabel(data.firstTs))} – ${esc(dateLabel(data.lastTs))}
  </footer>
</div>
${opts.print ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},250);});</script>' : ''}
</body>
</html>`;
}

module.exports = { generateProjectReport };
