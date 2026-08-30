const fs = require('fs');
const os = require('os');
const path = require('path');

// lib/cache.js reads DATA_DIR at require time, so the env has to be set before
// the module (and lib/config) is pulled in.
describe('cache (legacy JSON persistence)', () => {
  let tmpDir;
  let cache;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-cache-test-'));
    process.env.DATA_DIR = tmpDir;
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/cache')];
    cache = require('../lib/cache');
  });

  afterEach(() => {
    delete process.env.DATA_DIR;
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/cache')];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns an empty parse state when no file exists yet', () => {
    // A fresh install has no file. Returning {} rather than throwing is what
    // lets the first parse start from offset 0 on every file.
    expect(cache.readParseState()).toEqual({});
  });

  it('returns null for a missing cache rather than throwing', () => {
    expect(cache.readCache()).toBeNull();
  });

  it('round-trips a parse state', () => {
    const state = { '/a/b.jsonl': { size: 12, mtime: '1', offset: 12 } };
    cache.writeParseState(state);
    expect(cache.readParseState()).toEqual(state);
  });

  it('round-trips cached messages', () => {
    const msgs = [{ id: 'm1', inputTokens: 5 }, { id: 'm2', inputTokens: 7 }];
    cache.writeCache(msgs);
    expect(cache.readCache()).toEqual(msgs);
  });

  it('treats a corrupt file as absent instead of crashing the boot', () => {
    // A truncated write (power loss, full disk) must not stop the server from
    // starting — the data is rebuildable from the DB and the JSONL.
    fs.writeFileSync(path.join(tmpDir, 'parse-state.json'), '{"broken":');
    fs.writeFileSync(path.join(tmpDir, 'cache.json'), 'not json at all');
    expect(cache.readParseState()).toEqual({});
    expect(cache.readCache()).toBeNull();
  });

  it('creates the data directory on first write', () => {
    const nested = path.join(tmpDir, 'does', 'not', 'exist');
    process.env.DATA_DIR = nested;
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/cache')];
    const c2 = require('../lib/cache');
    c2.writeParseState({ x: 1 });
    expect(fs.existsSync(path.join(nested, 'parse-state.json'))).toBe(true);
  });
});
