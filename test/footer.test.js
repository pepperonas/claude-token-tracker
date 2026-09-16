const fs = require('fs');
const path = require('path');

// The footer used to float mid-page on the two tabs whose content is shorter
// than the viewport, with 242px of nothing beneath it, and its version line sat
// under AA because of an `opacity`. Both are layout properties, so these pin
// the CSS that carries them.

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'style.css'), 'utf-8');
/**
 * The base rule for a selector, comments stripped (the file explains the traps
 * in prose, and a prose match would pass for the wrong reason).
 *
 * Anchored at column 0: the same selectors appear again indented inside the
 * media queries, and the first match in the file is the mobile one — reading
 * that instead is how this helper silently tested something else. Ambiguity is
 * an error rather than a guess.
 */
function rule(selector) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits = [...bare.matchAll(new RegExp(`^${esc}\\s*\\{`, 'gm'))];
  if (hits.length === 0) throw new Error(`no top-level rule for ${selector}`);
  if (hits.length > 1) throw new Error(`${hits.length} top-level rules for ${selector} — ambiguous`);
  const i = hits[0].index;
  return bare.slice(i, bare.indexOf('}', i));
}

describe('footer layout', () => {
  it('makes the page a column so the footer can be pushed down', () => {
    const body = rule('body');
    expect(body).toMatch(/display:\s*flex/);
    expect(body).toMatch(/flex-direction:\s*column/);
  });

  it('uses dvh, not just vh, so a phone does not put it below the fold', () => {
    expect(rule('body')).toMatch(/min-height:\s*100dvh/);
    // vh stays as the fallback for browsers without dvh
    expect(rule('body')).toMatch(/min-height:\s*100vh/);
  });

  it('lets the content absorb the slack instead of the footer losing its gap', () => {
    // `margin-top: auto` on the footer would push it down too, but it replaces
    // the 48px gap, which is wanted on pages that do scroll.
    expect(rule('.content')).toMatch(/flex:\s*1\s+0\s+auto/);
    expect(rule('.footer')).toMatch(/margin-top:\s*48px/);
    expect(rule('.footer')).not.toMatch(/margin-top:\s*auto/);
  });

  it('keeps the content full width, or auto margins would shrink it', () => {
    // As a flex item, `margin: 0 auto` centres the box at its content width
    // instead of filling up to max-width — measured 1400px before the change.
    const content = rule('.content');
    expect(content).toMatch(/margin:\s*0\s+auto/);
    expect(content).toMatch(/width:\s*100%/);
    expect(content).toMatch(/max-width:\s*1400px/);
  });

  it('does not dim the version with opacity', () => {
    // opacity multiplies against the background: 6.15:1 became 2.97:1.
    expect(rule('.footer-version')).not.toMatch(/opacity/);
  });

  it('gives every footer element a visible colour rather than a faded one', () => {
    for (const sel of ['.footer-version', '.footer-dev', '.footer-github', '.footer-donate']) {
      expect(rule(sel)).not.toMatch(/opacity:\s*0?\.\d/);
    }
  });
});
