#!/usr/bin/env node
/**
 * Refreshes the live badges in all READMEs.
 *
 * The numbers used to be hand-maintained and drifted constantly (the badge
 * claimed 238 tests while the suite had 255, and "25k+ LOC" was a guess). CI
 * runs this on every push to main and commits the result, so the badges can no
 * longer lie.
 *
 * Usage:
 *   node scripts/update-badges.js [--report <vitest-json>] [--check]
 *
 *   --report  vitest JSON report (`vitest run --reporter=json --outputFile=…`)
 *             — the authoritative test count. Without it the script falls back
 *             to counting `it(`/`test(` calls in test/, which is close but can
 *             miss dynamically generated cases.
 *   --check   exit 1 instead of writing when something would change (CI dry run)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const READMES = ['README.md', 'README_EN.md', 'README_DE.md'];
const START = '<!-- BADGES:START -->';
const END = '<!-- BADGES:END -->';
const CODE_GLOBS = ['*.js', '*.css', '*.html'];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || true);
}

/** Total lines across tracked source files (git is the source of truth). */
function countLoc() {
  const files = execFileSync('git', ['ls-files', ...CODE_GLOBS], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter(f => !f.includes('node_modules/'));
  let lines = 0;
  for (const f of files) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;                    // deleted but still indexed
    const txt = fs.readFileSync(p, 'utf8');
    if (txt.length === 0) continue;
    lines += txt.split('\n').length - (txt.endsWith('\n') ? 1 : 0);
  }
  return { lines, files: files.length };
}

/** Test count: from the vitest JSON report if given, else by counting it()/test(). */
function countTests(reportPath) {
  if (reportPath && fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (typeof report.numTotalTests === 'number') return report.numTotalTests;
    if (Array.isArray(report.testResults)) {
      return report.testResults.reduce((s, f) => s + (f.assertionResults || []).length, 0);
    }
  }
  const dir = path.join(ROOT, 'test');
  let count = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.test.js')) continue;
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    count += (txt.match(/^\s*(?:it|test)\s*\(/gm) || []).length;
  }
  return count;
}

/**
 * Facts derived from the code itself. Every one of these was hand-written in a
 * badge at some point and every one of them drifted — the achievement badge
 * still claimed 700 after the catalogue had grown to 1200.
 */
function countProject() {
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const db = fs.readFileSync(path.join(ROOT, 'lib', 'db.js'), 'utf8');
  const i18n = fs.readFileSync(path.join(ROOT, 'public', 'js', 'i18n.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  const routes = new Set([
    ...(server.match(/pathname === '\/api\/[a-z0-9/-]+'/g) || []),
    ...(server.match(/pathname\.startsWith\('\/api\/[a-z0-9/-]+'/g) || [])
  ]);

  const achievements = fs
    .readFileSync(path.join(ROOT, 'lib', 'achievements.js'), 'utf8')
    .split('\n')
    .filter(l => /^\s*\{\s*key:\s*'/.test(l)).length;

  return {
    routes: routes.size,
    tables: (db.match(/CREATE TABLE IF NOT EXISTS/g) || []).length,
    achievements,
    // Two locales x (name + description) per achievement, plus the UI strings.
    i18nKeys: (i18n.match(/^\s{4}[a-zA-Z_][a-zA-Z0-9_]*:/gm) || []).length,
    deps: Object.keys(pkg.dependencies || {}).length,
    node: (pkg.engines && pkg.engines.node) || '>=20',
    version: pkg.version,
    testFiles: fs.readdirSync(path.join(ROOT, 'test')).filter(f => f.endsWith('.test.js')).length
  };
}

function fmtLoc(lines) {
  return lines >= 1000 ? (lines / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(lines);
}

const badge = (label, value, color, opts = {}) => {
  const enc = (t) => String(t).replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '_');
  const logo = opts.logo ? `&logo=${opts.logo}&logoColor=${opts.logoColor || 'white'}` : '';
  const style = opts.big ? 'for-the-badge' : 'flat-square';
  return `  <img src="https://img.shields.io/badge/${enc(label)}-${enc(value)}-${color}?style=${style}${logo}" alt="${opts.alt || `${label} ${value}`}">`;
};

function badgeBlock({ tests, lines: loc, files, p }) {
  return [
    START,
    '<p align="center">',
    badge('tests', `${tests} passing`, '3fb950', { big: true, logo: 'vitest', alt: `${tests} tests passing` }),
    badge('code', `${fmtLoc(loc)} lines`, '58a6ff', { big: true, logo: 'javascript', alt: `${loc} lines of code across ${files} files` }),
    badge('achievements', p.achievements, '8957e5', { big: true, logo: 'trophy', alt: `${p.achievements} achievements` }),
    '</p>',
    '',
    '<p align="center">',
    badge('API routes', p.routes, '0969da', { alt: `${p.routes} API routes` }),
    badge('DB tables', p.tables, '0969da', { alt: `${p.tables} database tables` }),
    badge('test files', p.testFiles, '3fb950', { alt: `${p.testFiles} test files` }),
    badge('i18n keys', `${p.i18nKeys} x2`, 'bf8700', { alt: `${p.i18nKeys} translation keys in two languages` }),
    badge('runtime deps', p.deps, 'cf222e', { alt: `${p.deps} runtime dependencies` }),
    badge('build step', 'none', '1a7f37', { alt: 'no build step' }),
    '</p>',
    END
  ].join('\n');
}

function main() {
  const stats = { ...countLoc(), tests: countTests(arg('--report')), p: countProject() };
  const block = badgeBlock(stats);
  const check = process.argv.includes('--check');
  let changed = 0;

  for (const name of READMES) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    const txt = fs.readFileSync(file, 'utf8');
    const s = txt.indexOf(START), e = txt.indexOf(END);
    if (s === -1 || e === -1) {
      console.error(`! ${name}: no ${START} / ${END} markers — skipped`);
      continue;
    }
    // The same number also appears in prose ("**411 automated tests**"). It
    // drifted independently of the badge — README_DE claimed 333 while the
    // suite had 411 — so it is rewritten from the same source.
    let next = txt.slice(0, s) + block + txt.slice(e + END.length);
    next = next.replace(/\*\*\d[\d,.]*\s+(automated tests|automatisierte Tests)\*\*/g,
      (_, unit) => `**${stats.tests} ${unit}**`);
    if (next === txt) continue;
    changed++;
    if (!check) fs.writeFileSync(file, next);
    console.log(`${check ? 'would update' : 'updated'} ${name}`);
  }

  console.log(`tests: ${stats.tests} · code: ${stats.lines} lines in ${stats.files} files · ` +
    `${stats.p.routes} routes · ${stats.p.tables} tables · ${stats.p.achievements} achievements · ` +
    `${stats.p.i18nKeys} i18n keys · ${stats.p.deps} deps`);
  if (check && changed) process.exit(1);
}

main();
