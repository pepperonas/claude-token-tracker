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
  const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const server = rd('server.js');
  const db = rd('lib/db.js');
  const i18n = rd('public/js/i18n.js');
  const ach = rd('lib/achievements.js');
  const pricing = rd('lib/pricing.js');
  const charts = rd('public/js/charts.js');
  const indexHtml = rd('public/index.html');
  const pkg = JSON.parse(rd('package.json'));

  const routes = new Set([
    ...(server.match(/pathname === '\/api\/[a-z0-9/-]+'/g) || []),
    ...(server.match(/pathname\.startsWith\('\/api\/[a-z0-9/-]+'/g) || [])
  ]);

  const achLines = ach.split('\n').filter(l => /^\s*\{\s*key:\s*'/.test(l));
  const categories = new Set(achLines.map(l => (l.match(/category: '([^']+)'/) || [])[1]).filter(Boolean));
  const tiers = new Set(achLines.map(l => (l.match(/tier: '([^']+)'/) || [])[1]).filter(Boolean));

  // Version of a dependency as declared, with the range marker stripped: the
  // badge states what the project asks for, not what happens to be installed.
  const dep = (name) => String((pkg.dependencies || {})[name] || (pkg.devDependencies || {})[name] || '')
    .replace(/^[\^~>=<\s]+/, '');
  // Chart.js is loaded from a CDN, so its version lives in the markup.
  const chartJs = (indexHtml.match(/chart\.js@([0-9.]+)/) || [])[1] || '4.x';

  const langs = (i18n.match(/^\s{2}(?:en|de):\s*\{/gm) || []).length || 2;
  const testDir = fs.readdirSync(path.join(ROOT, 'test')).filter(f => f.endsWith('.test.js'));
  const docsDir = fs.existsSync(path.join(ROOT, 'docs'))
    ? fs.readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('.md')) : [];

  return {
    version: pkg.version,
    license: pkg.license || 'MIT',
    node: (pkg.engines && pkg.engines.node) || '>=20',
    repo: String((pkg.repository || {}).url || '').replace(/^git\+|\.git$/g, '')
      .replace('https://github.com/', ''),
    routes: routes.size,
    tables: (db.match(/CREATE TABLE IF NOT EXISTS/g) || []).length,
    achievements: achLines.length,
    categories: categories.size,
    tiers: tiers.size,
    models: (pricing.match(/^\s{2}'claude-[a-z0-9.-]+': \{/gm) || []).length,
    charts: (charts.match(/function create[A-Za-z0-9]*Chart/g) || []).length,
    // Two locales x (name + description) per achievement, plus the UI strings.
    i18nKeys: (i18n.match(/^\s{4}[a-zA-Z_][a-zA-Z0-9_]*:/gm) || []).length,
    langs,
    deps: Object.keys(pkg.dependencies || {}).length,
    devDeps: Object.keys(pkg.devDependencies || {}).length,
    libModules: fs.readdirSync(path.join(ROOT, 'lib')).filter(f => f.endsWith('.js')).length,
    testFiles: testDir.length,
    docs: docsDir.length,
    v: {
      sqlite: dep('better-sqlite3'),
      chokidar: dep('chokidar'),
      vitest: dep('vitest'),
      eslint: dep('eslint'),
      supertest: dep('supertest'),
      chartJs
    }
  };
}

function fmtLoc(lines) {
  return lines >= 1000 ? (lines / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(lines);
}

const badge = (label, value, color, opts = {}) => {
  // shields.io separator escaping first, then percent-encoding: a raw '>' in
  // ">=20.12" produced a broken URL AND terminated the <img> tag early.
  const enc = (t) => encodeURIComponent(
    String(t).replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '_')
  ).replace(/%2F/g, '/');
  const logo = opts.logo ? `&logo=${opts.logo}&logoColor=${opts.logoColor || 'white'}` : '';
  const style = opts.big ? 'for-the-badge' : 'flat-square';
  // alt text is an HTML attribute: a raw '>' from a value like ">=20.12" is
  // valid-ish but confuses simple parsers and reads badly in a screen reader.
  const alt = String(opts.alt || `${label} ${value}`)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `  <img src="https://img.shields.io/badge/${enc(label)}-${enc(value)}-${color}?style=${style}${logo}" alt="${alt}">`;
};

function badgeBlock({ tests, lines: loc, files, p }) {
  const row = (...b) => ['<p align="center">', ...b, '</p>'];
  const gh = (pathSeg, label, color, logo) =>
    `  <img src="https://img.shields.io/github/${pathSeg}/${p.repo}?style=flat-square&label=${encodeURIComponent(label)}&color=${color}${logo ? `&logo=${logo}&logoColor=white` : ''}" alt="${label}">`;

  return [
    START,
    '',
    // --- Hero: the two numbers that should be readable at a glance ----------
    ...row(
      badge('version', `v${p.version}`, 'ff6b00', { big: true, logo: 'semanticrelease', alt: `Version ${p.version}` }),
      badge('lines of code', fmtLoc(loc), '58a6ff', { big: true, logo: 'javascript', alt: `${loc} lines of code across ${files} files` })
    ),
    '',
    ...row(
      badge('tests', `${tests} passing`, '3fb950', { big: true, logo: 'vitest', alt: `${tests} tests passing` }),
      badge('achievements', p.achievements, '8957e5', { big: true, logo: 'trophy', alt: `${p.achievements} achievements` }),
      badge('build step', 'none', '1a7f37', { big: true, logo: 'esbuild', alt: 'no build step' })
    ),
    '',
    // --- Live from GitHub: these refresh themselves, no regeneration ---------
    ...row(
      `  <a href="https://github.com/${p.repo}/actions/workflows/ci.yml"><img src="https://github.com/${p.repo}/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>`,
      gh('license', 'license', 'blue', 'opensourceinitiative'),
      gh('v/release', 'release', 'orange', 'github'),
      gh('last-commit', 'last commit', 'informational', 'git'),
      gh('commit-activity/m', 'commits/month', 'informational', 'git'),
      gh('languages/code-size', 'code size', 'informational', 'github')
    ),
    '',
    ...row(
      gh('stars', 'stars', 'gold', 'github'),
      gh('forks', 'forks', 'informational', 'github'),
      gh('issues', 'open issues', 'informational', 'github'),
      gh('issues-pr', 'open PRs', 'informational', 'github'),
      gh('contributors', 'contributors', 'informational', 'github'),
      `  <a href="https://github.com/${p.repo}/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs welcome"></a>`
    ),
    '',
    // --- Project facts, all derived from the source -------------------------
    ...row(
      badge('API routes', p.routes, '0969da', { alt: `${p.routes} API routes` }),
      badge('DB tables', p.tables, '0969da', { alt: `${p.tables} database tables` }),
      badge('lib modules', p.libModules, '0969da', { alt: `${p.libModules} library modules` }),
      badge('charts', p.charts, 'FF6384', { logo: 'chartdotjs', alt: `${p.charts} chart types` }),
      badge('doc pages', p.docs, '6f42c1', { logo: 'readthedocs', alt: `${p.docs} documentation pages` }),
      badge('test files', p.testFiles, '3fb950', { logo: 'vitest', alt: `${p.testFiles} test files` })
    ),
    '',
    ...row(
      badge('achievement categories', p.categories, '8957e5', { alt: `${p.categories} achievement categories` }),
      badge('tiers', `${p.tiers} bronze to diamond`, '8957e5', { alt: `${p.tiers} tiers` }),
      badge('models priced', p.models, 'D4A574', { logo: 'anthropic', alt: `${p.models} models in the fallback price table` }),
      badge('i18n keys', `${p.i18nKeys} x ${p.langs}`, 'bf8700', { alt: `${p.i18nKeys} translation keys in ${p.langs} languages` }),
      badge('languages', 'DE | EN', 'bf8700', { alt: 'German and English' })
    ),
    '',
    // --- Stack, versions taken from package.json and the markup -------------
    ...row(
      badge('Node.js', p.node, '339933', { logo: 'nodedotjs', alt: `Node.js ${p.node}` }),
      badge('better-sqlite3', p.v.sqlite, '003B57', { logo: 'sqlite', alt: `better-sqlite3 ${p.v.sqlite}` }),
      badge('chokidar', p.v.chokidar, 'orange', { logo: 'files', alt: `chokidar ${p.v.chokidar}` }),
      badge('Chart.js', p.v.chartJs, 'FF6384', { logo: 'chartdotjs', alt: `Chart.js ${p.v.chartJs}` }),
      badge('Vitest', p.v.vitest, '6E9F18', { logo: 'vitest', alt: `Vitest ${p.v.vitest}` }),
      badge('ESLint', p.v.eslint, '4B32C3', { logo: 'eslint', alt: `ESLint ${p.v.eslint}` })
    ),
    '',
    ...row(
      badge('runtime deps', p.deps, 'cf222e', { alt: `${p.deps} runtime dependencies` }),
      badge('dev deps', p.devDeps, 'cf222e', { alt: `${p.devDeps} dev dependencies` }),
      badge('framework', 'none', '1a7f37', { alt: 'no frontend framework' }),
      badge('bundler', 'none', '1a7f37', { alt: 'no bundler' }),
      badge('license', p.license, 'blue', { logo: 'opensourceinitiative', alt: `${p.license} license` })
    ),
    '',
    // --- Behaviour worth stating, each backed by something in the code ------
    ...row(
      badge('storage', 'SQLite WAL', '003B57', { logo: 'sqlite', alt: 'SQLite in WAL mode' }),
      badge('live updates', 'SSE', 'FF6600', { logo: 'lightning', alt: 'Server-Sent Events' }),
      badge('auth', 'GitHub OAuth', '181717', { logo: 'github', alt: 'GitHub OAuth' }),
      badge('secrets', 'AES--256--GCM', 'critical', { logo: 'letsencrypt', alt: 'AES-256-GCM encrypted' }),
      badge('pricing', 'live via LiteLLM', '6f42c1', { logo: 'anthropic', alt: 'live pricing from LiteLLM' })
    ),
    '',
    ...row(
      badge('cache tiers', '5min + 1h', '0969da', { alt: 'both cache-write tiers priced' }),
      badge('cost model', 'time-aware', '0969da', { alt: 'historical prices pinned per message' }),
      badge('data', 'never deleted', '1a7f37', { alt: 'no DELETE FROM messages anywhere' }),
      badge('offline', 'works fully', 'lightgrey', { alt: 'works without network access' }),
      badge('mobile', 'responsive 393px+', 'purple', { alt: 'mobile responsive from 393px' })
    ),
    '',
    ...row(
      badge('platform', 'macOS | Linux | Windows', 'lightgrey', { logo: 'linux', alt: 'runs on macOS, Linux and Windows' }),
      badge('deploy', 'PM2 + nginx', '2B037A', { logo: 'pm2', alt: 'PM2 and nginx' }),
      badge('sync agent', 'included', 'success', { logo: 'rsync', alt: 'sync agent included' }),
      `  <a href="https://tracker.celox.io"><img src="https://img.shields.io/badge/demo-tracker.celox.io-blue?style=flat-square&logo=googlechrome&logoColor=white" alt="Live demo"></a>`
    ),
    '',
    // --- Documentation, linked ----------------------------------------------
    ...row(
      `  <a href="docs/API.md"><img src="https://img.shields.io/badge/docs-API-informational?style=flat-square&logo=readthedocs&logoColor=white" alt="API reference"></a>`,
      `  <a href="docs/ARCHITECTURE.md"><img src="https://img.shields.io/badge/docs-Architecture-informational?style=flat-square&logo=readthedocs&logoColor=white" alt="Architecture"></a>`,
      `  <a href="docs/METRICS.md"><img src="https://img.shields.io/badge/docs-Metrics-informational?style=flat-square&logo=readthedocs&logoColor=white" alt="Metrics"></a>`,
      `  <a href="docs/CONFIGURATION.md"><img src="https://img.shields.io/badge/docs-Configuration-informational?style=flat-square&logo=readthedocs&logoColor=white" alt="Configuration"></a>`,
      `  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/docs-Contributing-informational?style=flat-square&logo=readthedocs&logoColor=white" alt="Contributing"></a>`,
      `  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/docs-Changelog-informational?style=flat-square&logo=readthedocs&logoColor=white" alt="Changelog"></a>`
    ),
    '',
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
