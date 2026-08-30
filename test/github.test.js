const fs = require('fs');
const os = require('os');
const path = require('path');

describe('github integration', () => {
  let tmpDir, db, github;

  function load({ multiUser = false, token = null } = {}) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-gh-test-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    if (multiUser) process.env.MULTI_USER = 'true'; else delete process.env.MULTI_USER;
    if (token) process.env.GITHUB_TOKEN = token; else delete process.env.GITHUB_TOKEN;
    for (const m of ['../lib/config', '../lib/db', '../lib/github']) {
      delete require.cache[require.resolve(m)];
    }
    db = require('../lib/db');
    db.initDB();
    github = require('../lib/github');
    github.initGithub(db);
  }

  afterEach(() => {
    try { db.closeDB(); } catch { /* already closed */ }
    delete process.env.DB_PATH;
    delete process.env.MULTI_USER;
    delete process.env.GITHUB_TOKEN;
    for (const m of ['../lib/config', '../lib/db', '../lib/github']) {
      delete require.cache[require.resolve(m)];
    }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getToken', () => {
    it('uses the env token in single-user mode', () => {
      load({ token: 'ghp_env' });
      expect(github.getToken(null)).toBe('ghp_env');
    });

    it('prefers the env token over a user record in single-user mode', () => {
      load({ token: 'ghp_env' });
      expect(github.getToken({ github_token: 'ghp_user' })).toBe('ghp_env');
    });

    it('ignores the env token in multi-user mode', () => {
      // On a hosted instance the operator's own token must never be handed to
      // another account's dashboard.
      load({ multiUser: true, token: 'ghp_operator' });
      expect(github.getToken(null)).toBeNull();
      expect(github.getToken({ github_token: 'ghp_user' })).toBe('ghp_user');
    });

    it('returns null when nothing is configured', () => {
      load();
      expect(github.getToken(null)).toBeNull();
      expect(github.getToken({})).toBeNull();
    });
  });

  describe('cachedFetch (stale-while-revalidate)', () => {
    it('calls through when no DB is attached', async () => {
      load();
      github.initGithub(null);
      let calls = 0;
      const v = await github._cachedFetch(0, 'k', async () => { calls++; return { a: 1 }; });
      expect(v).toEqual({ a: 1 });
      expect(calls).toBe(1);
    });

    it('serves a fresh entry from cache without calling the fetcher again', async () => {
      load();
      let calls = 0;
      const fetcher = async () => { calls++; return { n: calls }; };
      await github._cachedFetch(0, 'repos', fetcher);
      const second = await github._cachedFetch(0, 'repos', fetcher);
      expect(calls).toBe(1);
      expect(second).toEqual({ n: 1 });
    });

    it('keeps caches separate per user', async () => {
      load();
      await github._cachedFetch(1, 'repos', async () => ({ owner: 'one' }));
      const other = await github._cachedFetch(2, 'repos', async () => ({ owner: 'two' }));
      expect(other).toEqual({ owner: 'two' });
      const back = await github._cachedFetch(1, 'repos', async () => ({ owner: 'never' }));
      expect(back).toEqual({ owner: 'one' });
    });

    it('serves stale data immediately and refreshes in the background', async () => {
      load();
      await github._cachedFetch(0, 'stats', async () => ({ v: 'old' }));
      // Age the entry past the TTL by rewriting its timestamp.
      const raw = db.getDB();
      raw.prepare("UPDATE github_cache SET fetched_at = ? WHERE cache_key = 'stats'")
        .run(new Date(Date.now() - 999 * 60000).toISOString());

      let refreshed;
      const p = new Promise(res => { refreshed = res; });
      const served = await github._cachedFetch(0, 'stats', async () => { refreshed(); return { v: 'new' }; });
      // The caller gets the stale value straight away — a slow GitHub API must
      // never make the dashboard wait.
      expect(served).toEqual({ v: 'old' });
      await p; // background refresh did run
    });

    it('does not cache an undefined result', async () => {
      // GitHub answers 202 while it computes statistics; that must not be
      // frozen into the cache as "no data" for the whole TTL.
      load();
      const first = await github._cachedFetch(0, 'freq', async () => undefined);
      // The caller gets a safe empty default, and crucially nothing is written:
      // the next call reaches the fetcher again instead of serving "no data"
      // for the whole TTL.
      expect(first).toEqual([]);
      const second = await github._cachedFetch(0, 'freq', async () => ({ real: true }));
      expect(second).toEqual({ real: true });
    });
  });

  describe('Actions cost model', () => {
    it('bills macOS 10x and Windows 2x against Linux', () => {
      // These multipliers are GitHub's billing rates; getting them wrong makes
      // the Actions usage panel quietly understate a macOS-heavy repo.
      load();
      expect(github._OS_MULTIPLIERS).toEqual({ UBUNTU: 1, MACOS: 10, WINDOWS: 2 });
    });
  });

  describe('cache maintenance', () => {
    it('clearCache drops the entries and resets the reported age', async () => {
      load();
      await github._cachedFetch(0, 'repos', async () => ({ a: 1 }));
      expect(github.getCacheAge(0, 'repos')).not.toBeNull();
      github.clearCache(0);
      expect(github.getCacheAge(0, 'repos')).toBeNull();
    });
  });
});
