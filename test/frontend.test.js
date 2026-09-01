const { loadFrontend } = require('./helpers/frontend');

// The frontend is ~11k lines with no module system and, until now, no tests.
// These cover the pure helpers — the ones that carry real logic and have
// already been the source of visible bugs.
describe('frontend helpers', () => {
  let F, G;
  beforeAll(() => {
    F = loadFrontend();
    // Lexical top-level bindings are not sandbox globals — read them back.
    G = F.pick(['LANG', 'state', 'WEEKDAY_SHORT', 'currentLang']);
  });

  describe('number formatting', () => {
    it('scales tokens to B/M/K', () => {
      expect(F.formatTokens(1_500_000_000)).toBe('1.5B');
      expect(F.formatTokens(2_400_000)).toBe('2.4M');
      expect(F.formatTokens(3_500)).toBe('3.5K');
      expect(F.formatTokens(999)).toBe('999');
    });

    it('always shows two decimals for cost', () => {
      // "$10.5" next to "$10.50" in a table reads as a different precision.
      expect(F.formatCost(10.5)).toBe('$10.50');
      expect(F.formatCost(0)).toBe('$0.00');
      expect(F.formatCost(1234.567)).toBe('$1,234.57');
    });

    it('groups plain numbers', () => {
      expect(F.formatNumber(1234567)).toBe('1,234,567');
    });
  });

  describe('cache toggle', () => {
    it('includes cache tokens when the switch is on', () => {
      const p = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 900, cacheCreateTokens: 85 };
      G.state.includeCache = true;
      expect(F.getDisplayTokens(p)).toBe(1000);
    });

    it('drops cache reads and writes when the switch is off', () => {
      // This is the whole point of the switch: cache reads are re-read context,
      // not new text, and they are 98% of the total on real data.
      const p = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 900, cacheCreateTokens: 85 };
      G.state.includeCache = false;
      expect(F.getDisplayTokens(p)).toBe(15);
      G.state.includeCache = true;
    });

    it('treats missing fields as zero rather than NaN', () => {
      expect(F.getDisplayTokens({})).toBe(0);
    });
  });

  describe('weekday-aware dates', () => {
    it('derives the weekday in LOCAL time from a date string', () => {
      // Parsing "2026-06-27" with new Date() gives UTC midnight, which is the
      // previous day at any negative offset — the axis then showed the wrong
      // weekday for half the world.
      F.setLang('en');
      expect(F.weekdayShort('2026-06-27')).toBe('Sat');
      expect(F.weekdayShort('2026-06-28')).toBe('Sun');
      expect(F.weekdayShort('2026-06-29')).toBe('Mon');
    });

    it('localises the weekday', () => {
      F.setLang('de');
      expect(F.weekdayShort('2026-06-27')).toBe('Sa');
      F.setLang('en');
    });

    it('returns empty for anything that is not a date', () => {
      F.setLang('en');
      expect(F.weekdayShort('')).toBe('');
      expect(F.weekdayShort('12:00')).toBe('');
      expect(F.weekdayShort(undefined)).toBe('');
    });

    it('prefixes chart labels with the weekday but leaves hourly labels alone', () => {
      F.setLang('en');
      expect(F.formatChartDate('2026-06-27')).toBe('Sat 06-27');
      expect(F.formatChartDate('14:00')).toBe('14:00');
    });
  });

  describe('moving average', () => {
    it('leaves the leading slots null instead of averaging a partial window', () => {
      // A 7-day average over 3 days is not a 7-day average; drawing it makes the
      // start of the trend line look like a spike.
      const avg = F._movingAvg([1, 2, 3, 4, 5], 3);
      expect(avg.slice(0, 2)).toEqual([null, null]);
      expect(avg[2]).toBeCloseTo(2, 6);
      expect(avg[4]).toBeCloseTo(4, 6);
    });

    it('returns all nulls when the window exceeds the series', () => {
      expect(F._movingAvg([1, 2], 7)).toEqual([null, null]);
    });
  });

  describe('project name shortening', () => {
    it('leaves short names untouched', () => {
      expect(F.shortenProjectName('claude/xword')).toBe('claude/xword');
    });

    it('drops leading segments — the tail is what distinguishes projects', () => {
      const long = 'claude//customers/celox/celox-datenschutz-and-more/deep';
      const short = F.shortenProjectName(long, 30);
      expect(short.length).toBeLessThanOrEqual(30);
      expect(short.startsWith('…/')).toBe(true);
      expect(short.endsWith('deep')).toBe(true);
    });

    it('truncates a single unsplittable segment rather than overflowing', () => {
      const s = F.shortenProjectName('a'.repeat(80), 20);
      expect(s.length).toBeLessThanOrEqual(20);
      expect(s.endsWith('…')).toBe(true);
    });

    it('handles empty input', () => {
      expect(F.shortenProjectName('')).toBe('');
    });
  });

  describe('duration formatting', () => {
    it('formats hours and minutes', () => {
      expect(F._formatDuration(45)).toBe('45m');
      expect(F._formatDuration(90)).toBe('1h 30m');
      expect(F._formatDuration(0)).toBe('0m');
    });

    it('never renders NaN', () => {
      // A session without a duration rendered as "NaNh NaNm" in the table;
      // _formatActiveTime already guarded, _formatDuration did not.
      for (const v of [undefined, null, NaN, -5, 'x']) {
        expect(F._formatDuration(v)).toBe('-');
      }
    });
  });

  describe('merge suggestions', () => {
    const P = (name, tokens = 1000) => ({ name, inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0 });

    it('groups the same project seen under two tool roots', () => {
      const g = F.computeMergeSuggestions([
        P('claude/mrxdown'), P('WebstormProjects/mrxdown'), P('claude/unrelated-thing')
      ]);
      const names = g.map(x => (x.projects || x.members || x).slice().sort().join('|'));
      expect(names.some(n => n.includes('claude/mrxdown') && n.includes('WebstormProjects/mrxdown'))).toBe(true);
    });

    it('does not merge projects that merely share a leaf word', () => {
      // The bug this guards against collapsed every project into one blob:
      // a shared last segment is not evidence of the same codebase.
      const g = F.computeMergeSuggestions([
        P('claude/dr/scraper'), P('Downloads/fuck/off/scraper')
      ]);
      expect(g).toEqual([]);
    });

    it('never proposes a group of one', () => {
      const g = F.computeMergeSuggestions([P('claude/only-one')]);
      expect(g).toEqual([]);
    });

    it('survives an empty project list', () => {
      expect(F.computeMergeSuggestions([])).toEqual([]);
    });
  });

  describe('i18n', () => {
    it('falls back to English, then to the key itself', () => {
      F.setLang('de');
      expect(F.t('__definitely_missing__')).toBe('__definitely_missing__');
      F.setLang('en');
    });

    it('has a German string for every English one', () => {
      // A missing key silently renders the English text (or the raw key) in a
      // German UI — invisible unless someone looks.
      const en = Object.keys(G.LANG.en);
      const missing = en.filter(k => !(k in G.LANG.de));
      expect(missing).toEqual([]);
    });

    it('has no German-only orphans left behind by a rename', () => {
      const de = Object.keys(G.LANG.de);
      const orphans = de.filter(k => !(k in G.LANG.en));
      expect(orphans).toEqual([]);
    });

    it('covers both languages with the same number of keys', () => {
      expect(Object.keys(G.LANG.de).length).toBe(Object.keys(G.LANG.en).length);
    });

    it('has no empty translations', () => {
      const empty = [];
      for (const lang of ['en', 'de']) {
        for (const [k, v] of Object.entries(G.LANG[lang])) {
          if (typeof v === 'string' && v.trim() === '') empty.push(`${lang}:${k}`);
        }
      }
      expect(empty).toEqual([]);
    });

    it('uses real umlauts in German, never ASCII substitutes', () => {
      // House rule: "ue"/"oe"/"ae"/"ss" for umlauts is a bug, not a style.
      const suspects = [];
      for (const [k, v] of Object.entries(G.LANG.de)) {
        if (typeof v !== 'string') continue;
        if (/\b(?:fuer|ueber|koennen|muessen|waehrend|groesse|schliessen|maessig)\b/i.test(v)) {
          suspects.push(k);
        }
      }
      expect(suspects).toEqual([]);
    });
  });
});
