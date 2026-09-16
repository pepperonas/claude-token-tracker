const fs = require('fs');
const path = require('path');

// The footer once showed a hardcoded v0.0.7 while package.json said 0.2.1.
// A version that is written down twice drifts, and nothing fails when it does —
// so these pin that there is exactly one source and everything reads from it.

const root = (...p) => path.join(__dirname, '..', ...p);
const pkg = require('../package.json');

describe('version', () => {
  it('is valid semver', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  it('is not written into the markup', () => {
    const html = fs.readFileSync(root('public', 'index.html'), 'utf-8');
    const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
    expect(footer).toContain('id="footer-version"');
    // no literal vN.N.N anywhere in the footer
    expect(footer).not.toMatch(/v\d+\.\d+\.\d+/);
  });

  it('is served to the frontend', () => {
    const server = fs.readFileSync(root('server.js'), 'utf-8');
    expect(server).toContain("require('./package.json').version");
    // and it is part of the config payload the frontend already fetches
    const config = server.slice(server.indexOf("pathname === '/api/config'"));
    expect(config.slice(0, 400)).toContain('version: APP_VERSION');
  });

  it('is rendered from that payload, not from a constant', () => {
    const app = fs.readFileSync(root('public', 'js', 'app.js'), 'utf-8');
    expect(app).toContain('showVersion(config.version)');
    const fn = app.slice(app.indexOf('function showVersion'));
    expect(fn.slice(0, 600)).toContain("'v' + version");
  });

  it('has a changelog entry, dated, at the top', () => {
    const log = fs.readFileSync(root('CHANGELOG.md'), 'utf-8');
    const headings = [...log.matchAll(/^## \[(\d+\.\d+\.\d+)\] — (\d{4}-\d{2}-\d{2})$/gm)];
    expect(headings.length).toBeGreaterThan(1);
    expect(headings[0][1]).toBe(pkg.version);
    // newest first, and every version appears once
    const versions = headings.map(h => h[1]);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('links the footer version at the changelog it claims to open', () => {
    const html = fs.readFileSync(root('public', 'index.html'), 'utf-8');
    const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
    expect(footer).toMatch(/id="footer-version"[\s\S]{0,200}CHANGELOG\.md/);
    const i18n = fs.readFileSync(root('public', 'js', 'i18n.js'), 'utf-8');
    expect(i18n).toContain('versionTitle:');
  });
});
