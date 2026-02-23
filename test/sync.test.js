const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('sync API', () => {
  let tmpDir, dbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-sync-test-'));
    dbPath = path.join(tmpDir, 'test.db');

    process.env.MULTI_USER = 'true';
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/db')];

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
  });

  describe('insertMessagesForUser', () => {
    it('inserts messages with user_id', () => {
      const { createUser, insertMessagesForUser, getMessagesForUser } = require('../lib/db');
      const user = createUser({ githubId: '100', username: 'syncuser' });

      const messages = [
        {
          id: 'sync_msg_001',
          timestamp: '2026-02-22T10:00:00.000Z',
          model: 'claude-opus-4-6',
          sessionId: 'session-sync-1',
          project: 'test/project',
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadTokens: 5000,
          cacheCreateTokens: 200,
          tools: ['Read'],
          stopReason: 'end_turn'
        },
        {
          id: 'sync_msg_002',
          timestamp: '2026-02-22T10:05:00.000Z',
          model: 'claude-opus-4-6',
          sessionId: 'session-sync-1',
          project: 'test/project',
          inputTokens: 2000,
          outputTokens: 800,
          cacheReadTokens: 8000,
          cacheCreateTokens: 0,
          tools: ['Write', 'Bash'],
          stopReason: 'tool_use'
        }
      ];

      insertMessagesForUser(messages, () => 1.5, user.id);

      const retrieved = getMessagesForUser(user.id);
      expect(retrieved.length).toBe(2);
      expect(retrieved[0].id).toBe('sync_msg_001');
      expect(retrieved[0].inputTokens).toBe(1000);
      expect(retrieved[1].tools).toContain('Write');
      expect(retrieved[1].tools).toContain('Bash');
    });

    it('isolates data between users', () => {
      const { createUser, insertMessagesForUser, getMessagesForUser } = require('../lib/db');
      const userA = createUser({ githubId: '200', username: 'userA' });
      const userB = createUser({ githubId: '201', username: 'userB' });

      insertMessagesForUser([{
        id: 'msg_a1', timestamp: '2026-02-22T10:00:00.000Z',
        model: 'claude-opus-4-6', sessionId: 'sess-a', project: 'proj-a',
        inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreateTokens: 0,
        tools: [], stopReason: 'end_turn'
      }], () => 0, userA.id);

      insertMessagesForUser([{
        id: 'msg_b1', timestamp: '2026-02-22T11:00:00.000Z',
        model: 'claude-opus-4-6', sessionId: 'sess-b', project: 'proj-b',
        inputTokens: 200, outputTokens: 100, cacheReadTokens: 0, cacheCreateTokens: 0,
        tools: [], stopReason: 'end_turn'
      }], () => 0, userB.id);

      const msgsA = getMessagesForUser(userA.id);
      const msgsB = getMessagesForUser(userB.id);

      expect(msgsA.length).toBe(1);
      expect(msgsA[0].id).toBe('msg_a1');
      expect(msgsB.length).toBe(1);
      expect(msgsB[0].id).toBe('msg_b1');
    });
  });

  describe('API key authentication', () => {
    it('validates API key', () => {
      const { createUser, findUserByApiKey } = require('../lib/db');
      const user = createUser({ githubId: '300', username: 'apitest' });

      const found = findUserByApiKey(user.api_key);
      expect(found).toBeDefined();
      expect(found.id).toBe(user.id);
    });

    it('rejects invalid API key', () => {
      const { findUserByApiKey } = require('../lib/db');
      expect(findUserByApiKey('invalid-key-12345')).toBeNull();
    });
  });
});
