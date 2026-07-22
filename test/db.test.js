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

  describe('devices', () => {
    it('creates devices with unique API keys and finds them by key', () => {
      const { createUser, createDevice, findDeviceByApiKey, getDevicesForUser } = require('../lib/db');
      const user = createUser({ githubId: '42', username: 'dev' });
      const a = createDevice(user.id, 'MacBook');
      const b = createDevice(user.id, 'VPS');

      expect(a.api_key).not.toBe(b.api_key);
      expect(a.api_key).toHaveLength(64);
      expect(findDeviceByApiKey(a.api_key).name).toBe('MacBook');
      expect(findDeviceByApiKey('nope')).toBeNull();
      expect(getDevicesForUser(user.id).map(d => d.name)).toEqual(['MacBook', 'VPS']);
    });

    it('renames, regenerates keys and invalidates the old key', () => {
      const { createUser, createDevice, renameDevice, regenerateDeviceKey, findDeviceByApiKey, getDeviceById } = require('../lib/db');
      const user = createUser({ githubId: '43', username: 'dev2' });
      const dev = createDevice(user.id, 'Old name');

      renameDevice(dev.id, 'New name');
      expect(getDeviceById(dev.id).name).toBe('New name');

      const newKey = regenerateDeviceKey(dev.id);
      expect(newKey).not.toBe(dev.api_key);
      expect(findDeviceByApiKey(dev.api_key)).toBeNull();
      expect(findDeviceByApiKey(newKey).id).toBe(dev.id);
    });

    it('deleting a device orphans its messages instead of deleting them', () => {
      // NOTE: `user_id` on messages only exists in multi-user mode, `device_id`
      // always does — so this single-user case assigns the device directly.
      const { createUser, createDevice, deleteDevice, getDeviceById, getDB } = require('../lib/db');
      const user = createUser({ githubId: '44', username: 'dev3' });
      const dev = createDevice(user.id, 'Retired');
      insertMessages([SAMPLE_MESSAGES[0]], () => 1);
      getDB().prepare('UPDATE messages SET device_id = ?').run(dev.id);

      deleteDevice(dev.id);
      expect(getDeviceById(dev.id)).toBeNull();
      const rows = getDB().prepare('SELECT id, device_id FROM messages').all();
      expect(rows).toHaveLength(1);            // history survives
      expect(rows[0].device_id).toBeNull();    // …just unassigned
    });
  });

  describe('rate-limit events', () => {
    it('inserts events and ignores duplicate ids', () => {
      const { insertRateLimitEvents, getAllRateLimitEvents } = require('../lib/db');
      const evt = { id: 'rl1', timestamp: '2026-02-20T10:00:00.000Z', sessionId: 's1', project: 'p' };
      insertRateLimitEvents([evt, { ...evt, id: 'rl2', timestamp: '2026-02-20T11:00:00.000Z' }]);
      insertRateLimitEvents([evt]); // re-parse of the same file

      const all = getAllRateLimitEvents();
      expect(all.map(e => e.id)).toEqual(['rl1', 'rl2']);
      expect(all[0].sessionId).toBe('s1');
    });

    it('tolerates an empty batch', () => {
      const { insertRateLimitEvents, getAllRateLimitEvents } = require('../lib/db');
      expect(() => insertRateLimitEvents([])).not.toThrow();
      expect(() => insertRateLimitEvents(null)).not.toThrow();
      expect(getAllRateLimitEvents()).toEqual([]);
    });
  });

  describe('project shares', () => {
    it('creates a share with a 48-char token and looks it up', () => {
      const { createProjectShare, getProjectShare, listProjectShares } = require('../lib/db');
      const share = createProjectShare('acme/web', 'Customer A', 30);
      expect(share.id).toHaveLength(48);
      expect(getProjectShare(share.id).project).toBe('acme/web');
      expect(listProjectShares()).toHaveLength(1);
    });

    it('hides expired shares but keeps them listed for management', () => {
      const { createProjectShare, getProjectShare, listProjectShares, getDB } = require('../lib/db');
      const share = createProjectShare('acme/api', 'Expired', 1);
      getDB().prepare('UPDATE project_shares SET expires_at = ? WHERE id = ?')
        .run(new Date(Date.now() - 1000).toISOString(), share.id);

      expect(getProjectShare(share.id)).toBeNull();       // public lookup fails
      expect(listProjectShares().map(s => s.id)).toContain(share.id); // admin still sees it
    });

    it('shares without an expiry never expire, and delete removes them', () => {
      const { createProjectShare, getProjectShare, deleteProjectShare } = require('../lib/db');
      const share = createProjectShare('tools/cli', null, null);
      expect(share.expires_at).toBeNull();
      expect(getProjectShare(share.id)).not.toBeNull();
      deleteProjectShare(share.id);
      expect(getProjectShare(share.id)).toBeNull();
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
