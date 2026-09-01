const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const READMES = ['README.md', 'README_EN.md', 'README_DE.md'];
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const START = '<!-- BADGES:START -->';
const END = '<!-- BADGES:END -->';

const split = (name) => {
  const txt = read(name);
  const a = txt.indexOf(START);
  const b = txt.indexOf(END);
  return { generated: txt.slice(a, b), outside: txt.slice(0, a) + txt.slice(b), all: txt };
};

describe('badges', () => {
  it('has the generated block in every README', () => {
    for (const r of READMES) {
      expect(read(r)).toContain(START);
      expect(read(r)).toContain(END);
    }
  });

  it('leads with version and lines of code, in that order, at the top', () => {
    // The two numbers that should be readable at a glance, above everything
    // else — and in the large style, not lost in a flat-square wall.
    for (const r of READMES) {
      const { generated } = split(r);
      // Compare whole <img> tags, not substring offsets: 'badge/version-' sits
      // inside the tag, so slicing at it leaves the tag's own opening behind
      // and the "nothing above" check trips over it.
      const imgs = [...generated.matchAll(/<img src="[^"]+"[^>]*>/g)].map(m => m[0]);
      expect(imgs.length).toBeGreaterThan(40);
      expect(imgs[0]).toContain('badge/version-');
      expect(imgs[1]).toContain('badge/lines_of_code-');
      for (const seg of imgs.slice(0, 2)) expect(seg).toContain('style=for-the-badge');
    }
  });

  it('states the real version and line count', () => {
    const version = require('../package.json').version;
    const files = execFileSync('git', ['ls-files', '*.js', '*.css', '*.html'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean).filter(f => !f.includes('node_modules/'));
    let lines = 0;
    for (const f of files) {
      const p = path.join(ROOT, f);
      if (!fs.existsSync(p)) continue;
      const txt = fs.readFileSync(p, 'utf8');
      if (!txt.length) continue;
      lines += txt.split('\n').length - (txt.endsWith('\n') ? 1 : 0);
    }
    const expectK = (lines / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    for (const r of READMES) {
      const { generated } = split(r);
      expect(generated).toContain(`badge/version-v${version}-`);
      expect(generated).toContain(`badge/lines_of_code-${expectK}-`);
    }
  });

  it('keeps every value-carrying badge inside the generated block', () => {
    // The whole point: a hand-written badge is a number nobody updates. The
    // achievement badge sat at 700 for months. Only badges without a value —
    // the language switcher and the donate button — may live outside.
    const allowed = /Deutsch|English|Donate|Spenden|PayPal|PRs-welcome/i;
    const offenders = [];
    for (const r of READMES) {
      const { outside } = split(r);
      for (const m of outside.matchAll(/<img src="(https:\/\/(?:img\.shields\.io|github\.com)[^"]+)"/g)) {
        if (!allowed.test(m[1])) offenders.push(`${r}: ${m[1].slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('produces well-formed shields URLs', () => {
    for (const r of READMES) {
      const { generated } = split(r);
      const urls = [...generated.matchAll(/<img src="(https:\/\/img\.shields\.io[^"]+)"/g)].map(m => m[1]);
      expect(urls.length).toBeGreaterThan(40);
      for (const u of urls) {
        expect(() => new URL(u)).not.toThrow();
        // A literal space breaks the image silently — shields wants %20 or _.
        expect(u).not.toMatch(/ /);
      }
    }
  });

  it('gives every badge alt text', () => {
    // Badges are images; without alt text a screen reader announces nothing.
    for (const r of READMES) {
      const { generated } = split(r);
      const imgs = [...generated.matchAll(/<img [^>]*>/g)].map(m => m[0]);
      expect(imgs.length).toBeGreaterThan(40);
      for (const img of imgs) expect(img).toMatch(/alt="[^"]+"/);
    }
  });

  it('emits an identical block in all three READMEs', () => {
    const [a, b, c] = READMES.map(r => split(r).generated);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('is reproducible — a second run changes nothing', () => {
    // --check exits 1 when it would rewrite something, which is how CI notices
    // that someone edited a generated number by hand.
    const res = require('child_process').spawnSync(
      process.execPath, [path.join(ROOT, 'scripts', 'update-badges.js'), '--check'],
      { cwd: ROOT, encoding: 'utf8' }
    );
    expect(res.status).toBe(0);
  });
});
