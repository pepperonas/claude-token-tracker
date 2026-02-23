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
