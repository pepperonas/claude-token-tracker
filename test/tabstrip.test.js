const { loadFrontend } = require('./helpers/frontend');

// The tab strip scrolls sideways and hides its scrollbar. Two things went wrong
// with that: selecting a tab that sat outside the visible part left nothing
// marked active (the reveal was gated on the window being narrow, not on the
// strip actually overflowing), and a tab cut mid-word was the only hint that
// more existed.

/** A strip with a known box and content width. */
function strip({ clientWidth = 583, scrollWidth = 1143, scrollLeft = 0 } = {}) {
  const classes = new Set();
  return {
    clientWidth, scrollWidth, scrollLeft,
    className: 'tabs-left',
    classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      contains: (n) => classes.has(n),
      add: (n) => classes.add(n),
      remove: (n) => classes.delete(n),
    },
    _classes: classes,
    addEventListener() {},
  };
}

describe('tab strip', () => {
  let F, fn;

  beforeAll(() => {
    F = loadFrontend();
    fn = F.pick(['tabStripOverflows', 'revealActiveTab', 'updateTabScrollHints']);
  });

  describe('does it overflow', () => {
    it('is true when the tabs need more room than the strip has', () => {
      // Measured at a 1200px window: twelve tabs want 1143px, the strip gets
      // 583 because the period controls on the right take the rest.
      expect(fn.tabStripOverflows(strip({ clientWidth: 583, scrollWidth: 1143 }))).toBe(true);
    });

    it('is false when everything fits', () => {
      expect(fn.tabStripOverflows(strip({ clientWidth: 1143, scrollWidth: 1143 }))).toBe(false);
    });

    it('ignores a sub-pixel difference', () => {
      // Layout rounding must not make a strip that fits look scrollable.
      expect(fn.tabStripOverflows(strip({ clientWidth: 583, scrollWidth: 583.6 }))).toBe(false);
    });

    it('survives a missing strip', () => {
      expect(fn.tabStripOverflows(null)).toBe(false);
      expect(fn.tabStripOverflows(undefined)).toBe(false);
    });
  });

  describe('revealing the selected tab', () => {
    function button(s) {
      let called = null;
      return {
        closest: () => s,
        scrollIntoView(opts) { called = opts; },
        get calledWith() { return called; },
      };
    }

    it('scrolls the tab into view when the strip overflows', () => {
      const b = button(strip({ clientWidth: 583, scrollWidth: 1143 }));
      fn.revealActiveTab(b);
      expect(b.calledWith).toBeTruthy();
      expect(b.calledWith.inline).toBe('center');
    });

    it('never scrolls the page vertically while reaching sideways', () => {
      const b = button(strip({ clientWidth: 583, scrollWidth: 1143 }));
      fn.revealActiveTab(b);
      expect(b.calledWith.block).toBe('nearest');
    });

    it('leaves the strip alone when every tab is already visible', () => {
      const b = button(strip({ clientWidth: 1143, scrollWidth: 1143 }));
      fn.revealActiveTab(b);
      expect(b.calledWith).toBeNull();
    });

    it('does not depend on the window width', () => {
      // The old gate was `innerWidth <= 600`, which is why a 1200px window kept
      // the selected tab off-screen.
      F.evalIn('window.innerWidth = 1600');
      const b = button(strip({ clientWidth: 583, scrollWidth: 1143 }));
      fn.revealActiveTab(b);
      expect(b.calledWith).toBeTruthy();
    });

    it('survives a button that is not inside a strip', () => {
      const b = { closest: () => null, scrollIntoView() { throw new Error('should not scroll'); } };
      expect(() => fn.revealActiveTab(b)).not.toThrow();
    });
  });

  describe('edge hints', () => {
    const marks = (s) => [...s._classes].sort();

    it('marks only the right edge at the start', () => {
      const s = strip({ scrollLeft: 0 });
      fn.updateTabScrollHints(s);
      expect(marks(s)).toEqual(['scroll-end']);
    });

    it('marks only the left edge at the end', () => {
      const s = strip({ scrollLeft: 1143 - 583 });
      fn.updateTabScrollHints(s);
      expect(marks(s)).toEqual(['scroll-start']);
    });

    it('marks both edges in the middle', () => {
      const s = strip({ scrollLeft: 200 });
      fn.updateTabScrollHints(s);
      expect(marks(s)).toEqual(['scroll-end', 'scroll-start']);
    });

    it('marks nothing when there is nothing to scroll', () => {
      const s = strip({ clientWidth: 1143, scrollWidth: 1143, scrollLeft: 0 });
      fn.updateTabScrollHints(s);
      expect(marks(s)).toEqual([]);
    });

    it('survives a missing strip', () => {
      expect(() => fn.updateTabScrollHints(null)).not.toThrow();
    });
  });
});
