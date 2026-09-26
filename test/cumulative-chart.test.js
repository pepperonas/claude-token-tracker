const fs = require('fs');
const path = require('path');
const { loadFrontend } = require('./helpers/frontend');

// The overview carries a second, cumulative reading of the same four series
// that the "Lines of Code & Messages" chart shows per day. What is worth
// pinning is the arithmetic (a running total nobody re-derives by eye) and the
// two decisions that make the chart honest: one shared y-axis, and curves that
// are not stacked.

const root = (...p) => path.join(__dirname, '..', ...p);
const CHARTS = fs.readFileSync(root('public', 'js', 'charts.js'), 'utf-8');

/** The body of one top-level function, comments stripped. */
function fnBody(name) {
  const bare = CHARTS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const i = bare.indexOf(`function ${name}(`);
  if (i === -1) throw new Error(`no function ${name}`);
  const next = bare.indexOf('\nfunction ', i + 1);
  return bare.slice(i, next === -1 ? bare.length : next);
}

describe('cumulative overview chart', () => {
  let cumulativeRows;

  beforeAll(() => {
    cumulativeRows = loadFrontend().pick(['cumulativeRows']).cumulativeRows;
  });

  describe('running totals', () => {
    it('adds each row to the ones before it', () => {
      const out = cumulativeRows(
        [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }], ['a']);
      expect(out.map(r => r.a)).toEqual([1, 3, 6, 10]);
    });

    it('keeps the columns independent of each other', () => {
      const out = cumulativeRows(
        [{ a: 1, b: 10 }, { a: 2, b: 20 }], ['a', 'b']);
      expect(out.map(r => r.a)).toEqual([1, 3]);
      expect(out.map(r => r.b)).toEqual([10, 30]);
    });

    it('ends on the plain sum of the column', () => {
      const rows = [{ n: 5 }, { n: 0 }, { n: 7 }, { n: 13 }];
      const out = cumulativeRows(rows, ['n']);
      expect(out[out.length - 1].n).toBe(25);
    });

    it('never decreases while the input is non-negative', () => {
      const rows = Array.from({ length: 50 }, (_, i) => ({ n: i % 7 }));
      const out = cumulativeRows(rows, ['n']).map(r => r.n);
      expect(out.every((v, i) => i === 0 || v >= out[i - 1])).toBe(true);
    });

    it('does not touch the rows it was given', () => {
      // The same payload feeds the chart above; cumulating must not rewrite it.
      const rows = [{ a: 1, other: 'x' }, { a: 2, other: 'y' }];
      const before = JSON.stringify(rows);
      cumulativeRows(rows, ['a']);
      expect(JSON.stringify(rows)).toBe(before);
    });

    it('carries only the requested columns', () => {
      const out = cumulativeRows([{ a: 1, b: 2 }], ['a']);
      expect(Object.keys(out[0])).toEqual(['a']);
    });
  });

  describe('rows the API can actually send', () => {
    it('counts a missing column as zero instead of poisoning the curve', () => {
      // A day with no edits has no linesAdded at all. Without the guard the
      // first such row turns every later point into NaN — an empty chart from
      // one gap, which is exactly how this fails silently.
      const out = cumulativeRows([{ a: 5 }, {}, { a: 5 }], ['a']);
      expect(out.map(r => r.a)).toEqual([5, 5, 10]);
    });

    it('survives null, undefined and unparseable values', () => {
      const out = cumulativeRows(
        [{ a: 1 }, { a: null }, { a: undefined }, { a: 'nope' }, { a: 2 }], ['a']);
      expect(out.map(r => r.a)).toEqual([1, 1, 1, 1, 3]);
    });

    it('reads numeric strings, which JSON sometimes carries', () => {
      expect(cumulativeRows([{ a: '3' }, { a: '4' }], ['a']).map(r => r.a)).toEqual([3, 7]);
    });

    it('survives a hole in the row list', () => {
      expect(() => cumulativeRows([{ a: 1 }, null, { a: 1 }], ['a'])).not.toThrow();
      expect(cumulativeRows([{ a: 1 }, null, { a: 1 }], ['a']).map(r => r.a)).toEqual([1, 1, 2]);
    });

    it('returns an empty list for no rows at all', () => {
      expect(cumulativeRows([], ['a'])).toEqual([]);
      expect(cumulativeRows(null, ['a'])).toEqual([]);
      expect(cumulativeRows(undefined, ['a'])).toEqual([]);
    });
  });

  describe('the two decisions that make it readable', () => {
    it('plots everything against one y-axis', () => {
      // Cumulated over a period the four series land within roughly 5x of each
      // other, so they share a scale. A second axis would let an arbitrary
      // scaling choice decide which curve looks bigger.
      const body = fnBody('createCumulativeLinesChart');
      expect(body).not.toMatch(/yAxisID/);
      expect(body).not.toMatch(/\by1\b/);
      expect(body).toMatch(/scales:\s*\{[\s\S]*?\by:\s*\{/);
    });

    it('does not stack the curves', () => {
      // written + edited + deleted adds removals to additions — a total nobody
      // wants; the point of the cumulative view is comparing the curves.
      expect(fnBody('createCumulativeLinesChart')).not.toMatch(/stacked/);
    });

    it('keeps the colour of each series identical to the chart above it', () => {
      const body = fnBody('createCumulativeLinesChart');
      for (const [key, colour] of [
        ['linesWritten', '#3fb950'], ['linesAdded', '#d29922'], ['linesRemoved', '#f85149'],
      ]) {
        expect(body).toMatch(new RegExp(`${key}[\\s\\S]{0,120}${colour}`));
      }
      expect(body).toMatch(/messages[\s\S]{0,120}COLORS\.input/);
    });

    it('reads a single day hour by hour, like the chart above it', () => {
      expect(fnBody('createCumulativeLinesChart')).toMatch(/period === 'today'/);
    });
  });

  describe('wiring', () => {
    const HTML = fs.readFileSync(root('public', 'index.html'), 'utf-8');
    const APP = fs.readFileSync(root('public', 'js', 'app.js'), 'utf-8');

    it('sits below the chart it cumulates, inside the overview', () => {
      const overview = HTML.slice(HTML.indexOf('id="tab-overview"'), HTML.indexOf('id="tab-sessions"'));
      const above = overview.indexOf('chart-overview-lines');
      const below = overview.indexOf('chart-overview-cumulative');
      expect(above).toBeGreaterThan(-1);
      expect(below).toBeGreaterThan(above);
    });

    it('is actually drawn — the overview asks for it', () => {
      expect(APP).toMatch(/createCumulativeLinesChart\('chart-overview-cumulative'/);
    });

    it('gets the same period the chart above gets', () => {
      const call = APP.slice(APP.indexOf("createCumulativeLinesChart('chart-overview-cumulative'"));
      expect(call.slice(0, 160)).toContain("isSingleDay() ? 'today' : state.period");
    });

    it('has a title and a tooltip in both languages', () => {
      const i18n = fs.readFileSync(root('public', 'js', 'i18n.js'), 'utf-8');
      for (const key of ['cumulativeLinesAndMessages', 'tooltipCumulativeLinesAndMessages']) {
        expect((i18n.match(new RegExp(`^\\s{4}${key}:`, 'gm')) || []).length).toBe(2);
        expect(HTML).toContain(key);
      }
    });
  });
});
