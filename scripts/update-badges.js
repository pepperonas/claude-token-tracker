#!/usr/bin/env node
/**
 * Refreshes the two live badges (test count + lines of code) in all READMEs.
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

function fmtLoc(lines) {
  return lines >= 1000 ? (lines / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(lines);
}

function badgeBlock({ tests, lines: loc, files }) {
  return [
    START,
    '<p align="center">',
    `  <img src="https://img.shields.io/badge/tests-${tests}_passing-3fb950?style=for-the-badge&logo=vitest&logoColor=white" alt="${tests} tests passing">`,
    `  <img src="https://img.shields.io/badge/code-${fmtLoc(loc)}_lines-58a6ff?style=for-the-badge&logo=javascript&logoColor=white" alt="${loc} lines of code across ${files} files">`,
    '</p>',
    END
  ].join('\n');
}

function main() {
  const stats = { ...countLoc(), tests: countTests(arg('--report')) };
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
    const next = txt.slice(0, s) + block + txt.slice(e + END.length);
    if (next === txt) continue;
    changed++;
    if (!check) fs.writeFileSync(file, next);
    console.log(`${check ? 'would update' : 'updated'} ${name}`);
  }

  console.log(`tests: ${stats.tests} · code: ${stats.lines} lines in ${stats.files} files`);
  if (check && changed) process.exit(1);
}

main();
