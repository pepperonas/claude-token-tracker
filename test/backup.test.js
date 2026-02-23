const path = require('path');
const fs = require('fs');
const os = require('os');
const { initDB, closeDB, insertMessages } = require('../lib/db');
const { backupToPath, pruneBackups, exportJSON } = require('../lib/backup');
const { SAMPLE_MESSAGES } = require('./fixtures/sample-messages');

describe('backup', () => {
  let tmpDir;
  let dbPath;
  let backupDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-backup-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    backupDir = path.join(tmpDir, 'backups');
    initDB(dbPath);
    insertMessages(SAMPLE_MESSAGES.slice(0, 3), () => 1);
  });

  afterEach(() => {
    closeDB();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('backupToPath', () => {
    it('creates a backup file', () => {
      const result = backupToPath(backupDir);
      expect(result.path).toBeTruthy();
      expect(fs.existsSync(result.path)).toBe(true);
      expect(result.size).toBeGreaterThan(0);
    });

    it('creates backup directory if needed', () => {
      const nestedDir = path.join(backupDir, 'deep', 'nested');
      const result = backupToPath(nestedDir);
      expect(fs.existsSync(result.path)).toBe(true);
    });

    it('throws without destination', () => {
      expect(() => backupToPath('')).toThrow();
    });
  });

  describe('pruneBackups', () => {
    it('keeps only N most recent backups', () => {
      fs.mkdirSync(backupDir, { recursive: true });
      // Create 5 fake backup files
      for (let i = 1; i <= 5; i++) {
        fs.writeFileSync(
          path.join(backupDir, `tracker-backup-2026-02-2${i}T00-00-00.db`),
          'data'
        );
      }

      const removed = pruneBackups(backupDir, 3);
      expect(removed).toBe(2);

      const remaining = fs.readdirSync(backupDir).filter(f => f.startsWith('tracker-backup-'));
      expect(remaining.length).toBe(3);
    });

    it('returns 0 for non-existent directory', () => {
      expect(pruneBackups('/nonexistent/path')).toBe(0);
    });

    it('returns 0 when fewer than keep limit', () => {
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(path.join(backupDir, 'tracker-backup-2026-02-20T00-00-00.db'), 'data');
      expect(pruneBackups(backupDir, 10)).toBe(0);
    });
  });

  describe('exportJSON', () => {
    it('exports messages as JSON', () => {
      const result = exportJSON();
      expect(result.count).toBe(3);
      expect(result.messages).toHaveLength(3);
      expect(result.exportedAt).toBeTruthy();
    });
  });
});
