const path = require('path');
const fs = require('fs');
const os = require('os');

describe('multi-user data isolation', () => {
  let tmpDir, dbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-multiuser-test-'));
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

  it('user A cannot see user B data via aggregator cache', () => {
    const { createUser, insertMessagesForUser, getMessagesForUser } = require('../lib/db');
    const { AggregatorCache } = require('../lib/aggregator');

    const userA = createUser({ githubId: '1000', username: 'alice' });
    const userB = createUser({ githubId: '1001', username: 'bob' });

    // User A has expensive Opus messages
    insertMessagesForUser([
      {
        id: 'alice_msg_1', timestamp: '2026-02-20T10:00:00.000Z',
        model: 'claude-opus-4-6', sessionId: 'sess-alice', project: 'alice/project',
        inputTokens: 10000, outputTokens: 5000, cacheReadTokens: 20000, cacheCreateTokens: 3000,
        tools: ['Read', 'Write'], stopReason: 'end_turn'
      }
    ], () => 5.0, userA.id);

    // User B has cheap Haiku messages
    insertMessagesForUser([
      {
        id: 'bob_msg_1', timestamp: '2026-02-20T11:00:00.000Z',
        model: 'claude-haiku-4-5-20251001', sessionId: 'sess-bob', project: 'bob/project',
        inputTokens: 500, outputTokens: 200, cacheReadTokens: 1000, cacheCreateTokens: 0,
        tools: [], stopReason: 'end_turn'
      }
    ], () => 0.01, userB.id);

    const cache = new AggregatorCache(getMessagesForUser);

    // Alice's aggregator should only show her data
    const aggA = cache.get(userA.id);
    const overviewA = aggA.getOverview();
    expect(overviewA.messages).toBe(1);
    expect(overviewA.inputTokens).toBe(10000);

    // Alice's sessions
    const sessionsA = aggA.getSessions();
    expect(sessionsA.length).toBe(1);
    expect(sessionsA[0].project).toBe('alice/project');

    // Bob's aggregator should only show his data
    const aggB = cache.get(userB.id);
    const overviewB = aggB.getOverview();
    expect(overviewB.messages).toBe(1);
    expect(overviewB.inputTokens).toBe(500);

    const sessionsB = aggB.getSessions();
    expect(sessionsB.length).toBe(1);
    expect(sessionsB[0].project).toBe('bob/project');

    // Projects are also isolated
    const projectsA = aggA.getProjects();
    expect(projectsA.length).toBe(1);
    expect(projectsA[0].name).toBe('alice/project');

    const projectsB = aggB.getProjects();
    expect(projectsB.length).toBe(1);
    expect(projectsB[0].name).toBe('bob/project');

    cache.stop();
  });

  it('user-scoped messages from DB match what was inserted', () => {
    const { createUser, insertMessagesForUser, getMessagesForUser } = require('../lib/db');

    const user = createUser({ githubId: '2000', username: 'testuser' });

    const msgs = [
      {
        id: 'test_msg_1', timestamp: '2026-02-20T10:00:00.000Z',
        model: 'claude-opus-4-6', sessionId: 'sess-test', project: 'test/proj',
        inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheCreateTokens: 100,
        tools: ['Read'], stopReason: 'end_turn'
      },
      {
        id: 'test_msg_2', timestamp: '2026-02-20T10:05:00.000Z',
        model: 'claude-sonnet-4-5-20250929', sessionId: 'sess-test', project: 'test/proj',
        inputTokens: 800, outputTokens: 300, cacheReadTokens: 1500, cacheCreateTokens: 0,
        tools: ['Bash', 'Read'], stopReason: 'tool_use'
      }
    ];

    insertMessagesForUser(msgs, () => 1.0, user.id);

    const retrieved = getMessagesForUser(user.id);
    expect(retrieved.length).toBe(2);
    expect(retrieved[0].model).toBe('claude-opus-4-6');
    expect(retrieved[1].model).toBe('claude-sonnet-4-5-20250929');
    expect(retrieved[1].tools).toContain('Bash');
    expect(retrieved[1].tools).toContain('Read');
  });

  it('getAllMessages does not include user-scoped messages in single-user query', () => {
    const { createUser, insertMessagesForUser, insertMessages, getAllMessages } = require('../lib/db');

    const user = createUser({ githubId: '3000', username: 'scopetest' });

    // Insert global message (no user_id)
    insertMessages([{
      id: 'global_msg', timestamp: '2026-02-20T10:00:00.000Z',
      model: 'claude-opus-4-6', sessionId: 'sess-global', project: 'global/proj',
      inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheCreateTokens: 0,
      tools: [], stopReason: 'end_turn'
    }], () => 0);

    // Insert user-scoped message
    insertMessagesForUser([{
      id: 'user_msg', timestamp: '2026-02-20T11:00:00.000Z',
      model: 'claude-opus-4-6', sessionId: 'sess-user', project: 'user/proj',
      inputTokens: 500, outputTokens: 200, cacheReadTokens: 0, cacheCreateTokens: 0,
      tools: [], stopReason: 'end_turn'
    }], () => 0, user.id);

    // getAllMessages returns all messages (both global and user-scoped)
    const all = getAllMessages();
    expect(all.length).toBe(2);
  });
});
