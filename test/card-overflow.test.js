const { rule, hasRule } = require('./helpers/css');

// The usage heatmap is deliberately 540px wide — 24 hours at a cell size you
// can still read — and carries its own `overflow-x: auto` so it scrolls inside
// its card. That never got to act: the card is a grid item, a grid item
// defaults to `min-width: auto` and refuses to shrink below its content, so at
// a 393px viewport the card grew to 570px and pushed the page 185px sideways,
// where `overflow-x: hidden` on the body cut it off.

describe('cards and wide content', () => {
  it('lets a card shrink below its content', () => {
    expect(rule('.chart-box')).toMatch(/min-width:\s*0/);
  });

  it('keeps the heatmap its own scroll container', () => {
    // Without this the min-width above would just squash the cells instead.
    expect(rule('.uheat')).toMatch(/overflow-x:\s*auto/);
    expect(rule('.uheat-grid')).toMatch(/min-width:\s*540px/);
  });

  it('keeps the body clipping sideways, which is what made the overflow silent', () => {
    // Worth pinning: with the clip in place an overflow is invisible rather
    // than merely ugly, so a regression would not announce itself.
    expect(rule('body')).toMatch(/overflow-x:\s*hidden/);
  });
});

describe('tab strip affordance', () => {
  it('fades the edge that still has tabs behind it', () => {
    expect(hasRule('.tabs-left.scroll-end')).toBe(true);
    expect(hasRule('.tabs-left.scroll-start')).toBe(true);
    expect(rule('.tabs-left.scroll-end')).toMatch(/mask-image:\s*linear-gradient/);
    expect(rule('.tabs-left.scroll-start')).toMatch(/mask-image:\s*linear-gradient/);
  });

  it('fades both edges when the strip is scrolled to the middle', () => {
    expect(hasRule('.tabs-left.scroll-start.scroll-end')).toBe(true);
  });

  it('still hides the scrollbar, which is why the fade is needed', () => {
    expect(rule('.tabs-left')).toMatch(/scrollbar-width:\s*none/);
    expect(rule('.tabs-left')).toMatch(/overflow-x:\s*auto/);
  });
});
