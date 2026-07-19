const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  initDB, closeDB,
  insertMessages, getAllMessages,
  getParseState, setParseState,
  getMetadata, setMetadata
} = require('../lib/db');
const { SAMPLE_MESSAGES } = require('./fixtures/sample-messages');

describe('db', () => {
  let tmpDir;
  let dbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-db-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    initDB(dbPath);
  });

  afterEach(() => {
    closeDB();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('schema', () => {
    it('creates all tables', () => {
      const { getDB } = require('../lib/db');
      const db = getDB();
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
      expect(tables).toContain('messages');
      expect(tables).toContain('message_tools');
      expect(tables).toContain('parse_state');
      expect(tables).toContain('metadata');
    });
  });

  describe('insertMessages / getAllMessages', () => {
    it('inserts and retrieves messages', () => {
      const msgs = SAMPLE_MESSAGES.slice(0, 3);
      insertMessages(msgs, () => 1.5);

      const retrieved = getAllMessages();
      expect(retrieved.length).toBe(3);
      expect(retrieved[0].id).toBe('msg_001');
      expect(retrieved[0].inputTokens).toBe(5000);
    });

    it('preserves tools', () => {
      insertMessages([SAMPLE_MESSAGES[0]], () => 0);
      const retrieved = getAllMessages();
      expect(retrieved[0].tools).toContain('Read');
      expect(retrieved[0].tools).toContain('Write');
    });

    it('upserts (last write wins)', () => {
      const msg = { ...SAMPLE_MESSAGES[0] };
      insertMessages([msg], () => 1);

      const updated = { ...msg, inputTokens: 9999 };
      insertMessages([updated], () => 2);

      const retrieved = getAllMessages();
      expect(retrieved.length).toBe(1);
      expect(retrieved[0].inputTokens).toBe(9999);
    });

    it('handles messages without tools', () => {
      const msg = { ...SAMPLE_MESSAGES[3] }; // no tools
      insertMessages([msg], () => 0);
      const retrieved = getAllMessages();
      expect(retrieved[0].tools).toEqual([]);
    });

    it('handles batch insert', () => {
      insertMessages(SAMPLE_MESSAGES, () => 0);
      const retrieved = getAllMessages();
      expect(retrieved.length).toBe(SAMPLE_MESSAGES.length);
    });

    it('unlockAchievementsBatchAt stores explicit timestamps; clear removes them', () => {
      const { unlockAchievementsBatchAt, clearAchievementsForUser, getUnlockedAchievements } = require('../lib/db');
      unlockAchievementsBatchAt(0, [
        { key: 'tokens_1k', at: '2026-01-05T10:11:00.000Z' },
        { key: 'messages_10', at: '2026-01-06T12:00:00.000Z' }
      ]);
      const rows = getUnlockedAchievements(0);
      const map = Object.fromEntries(rows.map(r => [r.achievement_key, r.unlocked_at]));
      expect(map['tokens_1k']).toBe('2026-01-05T10:11:00.000Z');
      expect(map['messages_10']).toBe('2026-01-06T12:00:00.000Z');
      clearAchievementsForUser(0);
      expect(getUnlockedAchievements(0).length).toBe(0);
    });

    it('rebuild semantics: DB-only messages survive reset + DB reload + JSONL re-parse', () => {
      // Claude Code prunes old JSONL — the DB is the long-term store. The
      // /api/rebuild sequence must therefore reload the DB before re-parsing
      // JSONL, otherwise pruned history vanishes from the live aggregator.
      const { streamAllMessages } = require('../lib/db');
      const Aggregator = require('../lib/aggregator');
      insertMessages([SAMPLE_MESSAGES[0]], () => 0); // in DB; its JSONL is "pruned"
      const agg = new Aggregator();
      agg.addMessages([SAMPLE_MESSAGES[0], SAMPLE_MESSAGES[1]]);
      // rebuild: reset → reload from DB → re-parse the JSONL that still exists
      agg.reset();
      agg.addMessages(streamAllMessages());
      agg.addMessages([SAMPLE_MESSAGES[1]]);
      insertMessages([SAMPLE_MESSAGES[1]], () => 0);
      expect(agg.messageCount).toBe(2);
      expect(agg.hasMessage(SAMPLE_MESSAGES[0].id)).toBe(true);
      expect(agg.hasMessage(SAMPLE_MESSAGES[1].id)).toBe(true);
    });

    it('streamAllMessages yields the same messages as getAllMessages', () => {
      const { streamAllMessages } = require('../lib/db');
      insertMessages(SAMPLE_MESSAGES, () => 0);
      const streamed = [...streamAllMessages()];
      expect(streamed).toEqual(getAllMessages());
      expect(streamed.length).toBe(SAMPLE_MESSAGES.length);
      expect(streamed[0].tools).toContain('Read');
      expect(streamed[0].toolCounts.Read).toBeGreaterThanOrEqual(1);
    });
  });

  describe('parse state', () => {
    it('saves and retrieves parse state', () => {
      const state = {
        '/path/to/file1.jsonl': { size: 1000, mtime: '123456', offset: 500 },
        '/path/to/file2.jsonl': { size: 2000, mtime: '789012', offset: 2000 }
      };
      setParseState(state);

      const retrieved = getParseState();
      expect(retrieved['/path/to/file1.jsonl'].size).toBe(1000);
      expect(retrieved['/path/to/file1.jsonl'].offset).toBe(500);
      expect(retrieved['/path/to/file2.jsonl'].size).toBe(2000);
    });

    it('updates existing parse state entries', () => {
      setParseState({ '/file.jsonl': { size: 100, mtime: '1', offset: 50 } });
      setParseState({ '/file.jsonl': { size: 200, mtime: '2', offset: 200 } });

      const retrieved = getParseState();
      expect(retrieved['/file.jsonl'].size).toBe(200);
      expect(retrieved['/file.jsonl'].offset).toBe(200);
    });
  });

  describe('metadata', () => {
    it('sets and gets metadata', () => {
      setMetadata('version', '0.0.1');
      expect(getMetadata('version')).toBe('0.0.1');
    });

    it('returns null for missing keys', () => {
      expect(getMetadata('nonexistent')).toBeNull();
    });

    it('overwrites existing values', () => {
      setMetadata('key', 'value1');
      setMetadata('key', 'value2');
      expect(getMetadata('key')).toBe('value2');
    });
  });
});
