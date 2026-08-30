const { generateProjectReport } = require('../lib/report-project');

const DATA = {
  name: 'claude/demo-projekt',
  totalTokens: 1_234_567_890,
  inputTokens: 1000, outputTokens: 2000,
  cacheReadTokens: 1_200_000_000, cacheCreateTokens: 34_564_890,
  cacheCreate5mTokens: 4_564_890, cacheCreate1hTokens: 20_000_000,
  cacheCreateUnsplitTokens: 10_000_000,
  inputCost: 0.01, outputCost: 0.05, cacheReadCost: 600, cacheCreate5mCost: 91, cacheCreate1hCost: 200,
  cost: 891.06,
  messages: 4242, sessions: 77,
  linesAdded: 5000, linesRemoved: 1200, linesWritten: 800,
  firstTs: '2026-06-01T08:00:00.000Z', lastTs: '2026-08-29T20:00:00.000Z',
  spanMin: 129_120, sessionSpanSumMin: 200_000, totalActiveMin: 11_760,
  models: [
    { name: 'Opus 5', messages: 3000, tokens: 900_000_000, cost: 700.5 },
    { name: 'Haiku 4.5', messages: 1242, tokens: 334_567_890, cost: 190.56 }
  ],
  tools: [{ name: 'Bash', calls: 900 }, { name: 'Edit', calls: 450 }],
  daily: [
    { date: '2026-08-27', cost: 12.5, messages: 100 },
    { date: '2026-08-28', cost: 40.25, messages: 300 },
    { date: '2026-08-29', cost: 0, messages: 0 }
  ],
  sessionList: [
    { firstTs: '2026-08-28T09:00:00.000Z', models: ['Opus 5'], activeMin: 95, messages: 300, totalTokens: 5_000_000, cost: 40.25 }
  ]
};

describe('generateProjectReport', () => {
  it('produces a complete standalone HTML document', () => {
    const html = generateProjectReport(DATA, { periodLabel: 'Gesamter Zeitraum' });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
    expect(html).toContain('claude/demo-projekt');
  });

  it('loads nothing from the network — the report must survive being mailed around', () => {
    const html = generateProjectReport(DATA, {});
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/https?:\/\//i);
  });

  it('escapes project names so a folder name cannot inject markup', () => {
    // Project names come from directory names on disk — attacker-influencable
    // input in a document that gets shared around.
    const html = generateProjectReport({ ...DATA, name: '</title><script>alert(1)</script>' }, {});
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('renders the cost components and their share', () => {
    const html = generateProjectReport(DATA, {});
    expect(html).toContain('Cache geschrieben (1 Std)');
    expect(html).toContain('Cache gelesen');
    expect(html).toContain('$891,06');
  });

  it('reports active time, not the session-span sum', () => {
    // 11760 min = 196 h. The span sum (200000 min) must never be shown as a KPI.
    const html = generateProjectReport(DATA, {});
    expect(html).toContain('196 h 0 min');
    expect(html).not.toContain('3.333 h');
  });

  it('states the cache-TTL coverage so the cost basis is auditable', () => {
    const html = generateProjectReport(DATA, {});
    // 24.564.890 known of 34.564.890 total = 71 %
    expect(html).toContain('Für 71 %');
  });

  it('renders a bar per day in the cost chart', () => {
    const html = generateProjectReport(DATA, {});
    const bars = html.match(/class="bar"/g) || [];
    expect(bars.length).toBe(DATA.daily.length);
  });

  it('orders the model bars by the value they plot, not by the caller order', () => {
    // getProjectDetail sorts models by TOKENS; the bars plot COST. Without a
    // re-sort the bars do not descend and the chart reads as broken.
    const html = generateProjectReport({
      ...DATA,
      models: [
        { name: 'Kleinkosten', messages: 1, tokens: 900_000_000, cost: 1 },
        { name: 'Grosskosten', messages: 1, tokens: 1, cost: 500 }
      ]
    }, {});
    const order = [...html.matchAll(/class="share-name">([^<]+)</g)].map(m => m[1]);
    expect(order).toEqual(['Grosskosten', 'Kleinkosten']);
  });

  it('does not float the toolbar over the content', () => {
    // A sticky toolbar covered a table row while scrolling.
    const html = generateProjectReport(DATA, {});
    expect(html).not.toMatch(/\.toolbar\s*\{[^}]*position:\s*sticky/);
  });

  it('survives an empty period without dividing by zero', () => {
    const empty = { ...DATA, daily: [], models: [], tools: [], sessionList: [], totalActiveMin: 0 };
    const html = generateProjectReport(empty, {});
    expect(html).toContain('Keine Daten im Zeitraum.');
    expect(html).not.toContain('NaN');
  });

  it('only auto-opens the print dialog when explicitly asked', () => {
    // The toolbar button always calls window.print(); what must be conditional
    // is the hook that fires it on load (the "PDF" entry point).
    const plain = generateProjectReport(DATA, {});
    const printing = generateProjectReport(DATA, { print: true });
    expect(plain).toContain('onclick="window.print()"');
    expect(plain).not.toContain('addEventListener("load"');
    expect(printing).toContain('addEventListener("load"');
  });

  it('says plainly that the cost is API-equivalent, not an invoice', () => {
    const html = generateProjectReport(DATA, {});
    expect(html).toContain('keine Rechnung');
  });
});
