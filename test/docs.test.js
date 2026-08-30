const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Documentation drifts silently: nothing breaks when a route is added and the
// reference is not. These tests make the docs part of the build instead.
describe('documentation stays in sync with the code', () => {
  const server = read('server.js');
  const apiDoc = read('docs/API.md');
  const configDoc = read('docs/CONFIGURATION.md');
  const envExample = read('.env.example');

  // Routes are matched two ways in server.js: exact equality, and startsWith
  // for the parameterised ones. Miss the second form and the reference looks
  // like it documents something that does not exist.
  const routes = [...new Set([
    ...(server.match(/pathname === '\/api\/[a-z0-9/-]+'/g) || [])
      .map(m => m.slice(m.indexOf("'") + 1, -1)),
    ...(server.match(/pathname\.startsWith\('\/api\/[a-z0-9/-]+'/g) || [])
      .map(m => m.slice(m.indexOf("'") + 1, -1))
  ])];

  it('finds the routes it is supposed to check', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it('documents every /api route', () => {
    // Parameterised routes are documented with their parameter (":id", ":token"),
    // so match on the stable prefix.
    const undocumented = routes.filter(r => {
      if (apiDoc.includes(r)) return false;
      const parent = r.split('/').slice(0, 3).join('/');
      return !apiDoc.includes(parent);
    });
    expect(undocumented).toEqual([]);
  });

  it('does not document routes that no longer exist', () => {
    const documented = [...new Set(
      (apiDoc.match(/`(?:GET |POST |DELETE |PATCH )?\/api\/[a-z0-9/:.{},|-]+/gi) || [])
        .map(m => m.replace(/`|GET |POST |DELETE |PATCH /gi, '').trim())
    )];
    const known = (r) => {
      const base = r.split('?')[0].replace(/\/:[a-z]+/gi, '').replace(/\{.*\}/g, '');
      return routes.some(x => x === base || x.startsWith(base) || base.startsWith(x));
    };
    expect(documented.filter(r => !known(r))).toEqual([]);
  });

  it('documents every environment variable the code reads', () => {
    const sources = ['server.js', 'lib/config.js', 'lib/github.js', 'lib/anthropic-api.js',
      'lib/auth.js', 'lib/plan-usage.js', 'lib/pricing-fetcher.js'].map(read).join('\n');
    // HOME/APPDATA are OS-provided, not settings.
    const ignored = new Set(['HOME', 'APPDATA', 'NODE_ENV']);
    const used = [...new Set((sources.match(/process\.env\.([A-Z_]+)/g) || [])
      .map(m => m.replace('process.env.', '')))].filter(v => !ignored.has(v));

    expect(used.length).toBeGreaterThan(10);
    expect(used.filter(v => !configDoc.includes(v))).toEqual([]);
    expect(used.filter(v => !envExample.includes(v))).toEqual([]);
  });

  it('keeps the stated achievement count true', () => {
    const { ACHIEVEMENTS } = require('../lib/achievements');
    const n = ACHIEVEMENTS.length;
    let totalClaims = 0;
    for (const doc of ['README.md', 'README_EN.md', 'README_DE.md', 'CLAUDE.md', 'docs/METRICS.md']) {
      const text = read(doc);
      if (!/achievement/i.test(text)) continue;
      // Only CLAIM forms count. A loose "number next to the word" match also
      // hits prose about the past ("claimed 700 achievements when there were
      // 1200") and fails on the explanation rather than on a stale fact — the
      // same trap as text-searching code for a rule its comment quotes.
      const claims = [
        ...text.matchAll(/\*\*(\d[\d,.]*)\s+(?:achievements|Achievements)\*\*/g),
        ...text.matchAll(/\b(\d[\d,.]*)\s+(?:achievement definitions|Achievement-Definitionen)\b/g),
        ...text.matchAll(/\b(?:All|all|Alle|returns all)\s+(\d[\d,.]*)\s+(?:achievements|Achievements)\b/g)
      ].map(m => Number(m[1].replace(/[,.]/g, '')));
      totalClaims += claims.length;
      for (const c of claims) expect(c).toBe(n);
    }
    // Guard against the check passing because it found nothing to check.
    expect(totalClaims).toBeGreaterThan(3);
  });

  it('keeps the stated test count true', () => {
    // README_DE claimed 333 tests when the suite had 411, and README_EN claimed
    // 374 — prose counts drift exactly like badge counts, just less visibly.
    // Compared against the GENERATED badge rather than a fresh count: the badge
    // comes from a real vitest run, and counting it() calls here would include
    // this very test and never settle.
    const badge = read('README.md').match(/badge\/tests-(\d+)_passing/);
    expect(badge).toBeTruthy();
    const actual = Number(badge[1]);
    for (const doc of ['README.md', 'README_EN.md', 'README_DE.md']) {
      const claims = [...read(doc).matchAll(/\*\*(\d{2,5})\s+(?:automated tests|automatisierte Tests)\*\*/g)]
        .map(m => Number(m[1]));
      for (const c of claims) expect(c).toBe(actual);
    }
  });

  it('links only to documents that exist', () => {
    const docs = ['README.md', 'README_EN.md', 'README_DE.md', 'CONTRIBUTING.md',
      'docs/API.md', 'docs/ARCHITECTURE.md', 'docs/CONFIGURATION.md', 'docs/METRICS.md'];
    const broken = [];
    for (const doc of docs) {
      const dir = path.dirname(path.join(ROOT, doc));
      for (const m of read(doc).matchAll(/\]\(([^)#]+\.md)(?:#[^)]*)?\)/g)) {
        const target = path.resolve(dir, m[1]);
        if (!fs.existsSync(target)) broken.push(`${doc} -> ${m[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('keeps the German and English long-form READMEs structurally in sync', () => {
    // They drifted before: the English one was updated and the German one kept
    // claiming 700 achievements. Same number of sections is a cheap tripwire.
    const sections = (s) => (s.match(/^## /gm) || []).length;
    expect(sections(read('README_DE.md'))).toBe(sections(read('README_EN.md')));
  });

  it('documents the cache-write tiers wherever cost is explained', () => {
    // The 1-hour tier is the single largest correctness fix in the cost model;
    // a document that explains cost without it teaches the wrong number.
    expect(read('docs/METRICS.md')).toMatch(/1-hour cache write/i);
    expect(read('docs/METRICS.md')).toMatch(/2 × input|2x input/i);
  });

  it('names every lib module in the architecture document', () => {
    const modules = fs.readdirSync(path.join(ROOT, 'lib'))
      .filter(f => f.endsWith('.js'))
      // cache.js is the deprecated JSON store, kept only for migration.
      .filter(f => f !== 'cache.js' && f !== 'config.js');
    const arch = read('docs/ARCHITECTURE.md');
    expect(modules.filter(m => !arch.includes(m))).toEqual([]);
  });

  it('has a changelog entry for the current package version', () => {
    const version = require('../package.json').version;
    expect(read('CHANGELOG.md')).toContain(`[${version}]`);
  });
});
