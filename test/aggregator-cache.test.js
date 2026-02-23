const path = require('path');
const fs = require('fs');
const os = require('os');

describe('AggregatorCache', () => {
  let tmpDir, dbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-aggcache-test-'));
    dbPath = path.join(tmpDir, 'test.db');

    process.env.MULTI_USER = 'true';
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/db')];
    delete require.cache[require.resolve('../lib/aggregator')];

    const { initDB } = require('../lib/db');
    initDB(dbPath);
  });

  afterEach(() => {
    const { closeDB } = require('../lib/db');
    closeDB();
    fs.rmSync(tmpDir, { recursive: true, force: true });

    process.env.MULTI_USER = 'false';
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/db')];
    delete require.cache[require.resolve('../lib/aggregator')];
  });

  it('creates per-user aggregators lazily', () => {
    const { createUser, insertMessagesForUser, getMessagesForUser } = require('../lib/db');
    const { AggregatorCache } = require('../lib/aggregator');

    const user1 = createUser({ githubId: '10', username: 'user1' });
    const user2 = createUser({ githubId: '11', username: 'user2' });

    insertMessagesForUser([{
      id: 'u1_msg', timestamp: '2026-02-20T10:00:00.000Z',
      model: 'claude-opus-4-6', sessionId: 'sess-1', project: 'proj1',
      inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheCreateTokens: 0,
      tools: [], stopReason: 'end_turn'
    }], () => 0, user1.id);

    insertMessagesForUser([{
      id: 'u2_msg', timestamp: '2026-02-20T11:00:00.000Z',
      model: 'claude-opus-4-6', sessionId: 'sess-2', project: 'proj2',
      inputTokens: 2000, outputTokens: 800, cacheReadTokens: 0, cacheCreateTokens: 0,
      tools: [], stopReason: 'end_turn'
    }], () => 0, user2.id);

    const cache = new AggregatorCache(getMessagesForUser);

    // Before any access
    expect(cache.size).toBe(0);

    // Access user1 — lazy creates
    const agg1 = cache.get(user1.id);
    expect(cache.size).toBe(1);
    expect(agg1.getOverview().messages).toBe(1);
    expect(agg1.getOverview().inputTokens).toBe(1000);

    // Access user2
    const agg2 = cache.get(user2.id);
    expect(cache.size).toBe(2);
    expect(agg2.getOverview().messages).toBe(1);
    expect(agg2.getOverview().inputTokens).toBe(2000);

    cache.stop();
  });

  it('invalidates a user and reloads on next access', () => {
    const { createUser, insertMessagesForUser, getMessagesForUser } = require('../lib/db');
    const { AggregatorCache } = require('../lib/aggregator');

    const user = createUser({ githubId: '20', username: 'invaltest' });

    insertMessagesForUser([{
      id: 'inv_msg1', timestamp: '2026-02-20T10:00:00.000Z',
      model: 'claude-opus-4-6', sessionId: 'sess-inv', project: 'proj-inv',
      inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheCreateTokens: 0,
      tools: [], stopReason: 'end_turn'
    }], () => 0, user.id);

    const cache = new AggregatorCache(getMessagesForUser);

    // First access
    let agg = cache.get(user.id);
    expect(agg.getOverview().messages).toBe(1);

    // Add more messages
    insertMessagesForUser([{
      id: 'inv_msg2', timestamp: '2026-02-20T11:00:00.000Z',
      model: 'claude-opus-4-6', sessionId: 'sess-inv', project: 'proj-inv',
      inputTokens: 2000, outputTokens: 800, cacheReadTokens: 0, cacheCreateTokens: 0,
      tools: [], stopReason: 'end_turn'
    }], () => 0, user.id);

    // Without invalidation, cache still shows old data
    agg = cache.get(user.id);
    expect(agg.getOverview().messages).toBe(1);

    // Invalidate
    cache.invalidateUser(user.id);
    expect(cache.size).toBe(0);

    // Re-access — fresh data
    agg = cache.get(user.id);
    expect(agg.getOverview().messages).toBe(2);
    expect(agg.getOverview().inputTokens).toBe(3000);

    cache.stop();
  });

  it('evicts inactive users after timeout', () => {
    const { createUser, insertMessagesForUser, getMessagesForUser } = require('../lib/db');
    const { AggregatorCache } = require('../lib/aggregator');

    const user = createUser({ githubId: '30', username: 'evicttest' });
    insertMessagesForUser([{
      id: 'evict_msg', timestamp: '2026-02-20T10:00:00.000Z',
      model: 'claude-opus-4-6', sessionId: 'sess-evict', project: 'proj-evict',
      inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheCreateTokens: 0,
      tools: [], stopReason: 'end_turn'
    }], () => 0, user.id);

    const cache = new AggregatorCache(getMessagesForUser);
    cache.get(user.id);
    expect(cache.size).toBe(1);

    // Manually set lastAccess to 31 minutes ago
    const entry = cache._cache.get(user.id);
    entry.lastAccess = Date.now() - 31 * 60 * 1000;

    // Trigger eviction
    cache._evict();
    expect(cache.size).toBe(0);

    cache.stop();
  });

  it('does not evict recently accessed users', () => {
    const { createUser, insertMessagesForUser, getMessagesForUser } = require('../lib/db');
    const { AggregatorCache } = require('../lib/aggregator');

    const user = createUser({ githubId: '40', username: 'noevict' });
    insertMessagesForUser([{
      id: 'noevict_msg', timestamp: '2026-02-20T10:00:00.000Z',
      model: 'claude-opus-4-6', sessionId: 'sess-noevict', project: 'proj',
      inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheCreateTokens: 0,
      tools: [], stopReason: 'end_turn'
    }], () => 0, user.id);

    const cache = new AggregatorCache(getMessagesForUser);
    cache.get(user.id);

    // Trigger eviction — user was just accessed, should stay
    cache._evict();
    expect(cache.size).toBe(1);

    cache.stop();
  });

  it('caches repeat access (same object returned)', () => {
    const { createUser, insertMessagesForUser, getMessagesForUser } = require('../lib/db');
    const { AggregatorCache } = require('../lib/aggregator');

    const user = createUser({ githubId: '50', username: 'cachetest' });
    insertMessagesForUser([{
      id: 'cache_msg', timestamp: '2026-02-20T10:00:00.000Z',
      model: 'claude-opus-4-6', sessionId: 'sess-cache', project: 'proj',
      inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheCreateTokens: 0,
      tools: [], stopReason: 'end_turn'
    }], () => 0, user.id);

    const cache = new AggregatorCache(getMessagesForUser);
    const agg1 = cache.get(user.id);
    const agg2 = cache.get(user.id);

    // Same object (cache hit)
    expect(agg1).toBe(agg2);

    cache.stop();
  });
});
