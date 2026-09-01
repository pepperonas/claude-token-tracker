/**
 * Loads the browser bundles into a sandbox so their pure helpers can be unit
 * tested. The frontend has no module system (plain <script> globals, no build
 * step), so the alternative would be either adding a build step for the sake of
 * tests or leaving ~11k lines uncovered.
 *
 * Only top-level declarations are reachable this way; DOM-touching functions
 * are never called, so a minimal stub is enough.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC = path.join(__dirname, '..', '..', 'public', 'js');

function stubElement() {
  return {
    style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [], textContent: '', innerHTML: '', hidden: false, value: '',
    appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    scrollIntoView() {}, animate: () => ({ finished: Promise.resolve() }),
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 })
  };
}

function loadFrontend(files = ['i18n.js', 'charts.js', 'app.js']) {
  const doc = {
    getElementById: () => stubElement(),
    querySelector: () => stubElement(),
    querySelectorAll: () => [],
    createElement: () => stubElement(),
    createTextNode: () => ({}),
    addEventListener() {},
    documentElement: stubElement(),
    body: stubElement()
  };
  const sandbox = {
    document: doc,
    window: {
      addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
      location: { hash: '', search: '', href: 'http://localhost/' },
      innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1
    },
    localStorage: {
      _v: {}, getItem(k) { return this._v[k] ?? null; },
      setItem(k, v) { this._v[k] = String(v); }, removeItem(k) { delete this._v[k]; }
    },
    navigator: { language: 'en-US', userAgent: 'node' },
    fetch: () => Promise.reject(new Error('no network in tests')),
    Chart: function Chart() { return { destroy() {}, update() {}, data: {}, options: {} }; },
    MutationObserver: function () { return { observe() {}, disconnect() {} }; },
    EventSource: function () { return { addEventListener() {}, close() {} }; },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    console, Math, Date, JSON, Intl, URL, URLSearchParams, Set, Map,
    Object, Array, String, Number, Boolean, Promise, RegExp, Error, isNaN, parseInt, parseFloat
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);

  for (const f of files) {
    const src = fs.readFileSync(path.join(PUBLIC, f), 'utf8');
    // A throw here means the file cannot even be parsed — worth failing on.
    vm.runInContext(src, ctx, { filename: f });
  }
  // `const`/`let` at top level do NOT become properties of the sandbox global
  // (only `var` and function declarations do), so lexical bindings like LANG
  // and state have to be read back by evaluating an expression in the same
  // context.
  ctx.pick = (names) => vm.runInContext(
    `({ ${names.map(n => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(', ')} })`,
    ctx
  );
  ctx.evalIn = (expr) => vm.runInContext(`(${expr})`, ctx);
  return ctx;
}

module.exports = { loadFrontend };
