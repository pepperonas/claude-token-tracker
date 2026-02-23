const fs = require('fs');
const path = require('path');
const { BACKUP_PATH, BACKUP_INTERVAL_HOURS } = require('./config');
const { getDB, getAllMessages } = require('./db');

let backupTimer = null;

/**
 * Create an atomic backup using SQLite VACUUM INTO
 */
function backupToPath(destDir) {
  if (!destDir) throw new Error('No backup path configured');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destFile = path.join(destDir, `tracker-backup-${timestamp}.db`);

  const db = getDB();
  if (!db) throw new Error('Database not initialized');

  db.exec(`VACUUM INTO '${destFile.replace(/'/g, "''")}'`);

  return { path: destFile, timestamp, size: fs.statSync(destFile).size };
}

/**
 * Keep only the most recent N backups, delete older ones
 */
function pruneBackups(dir, keep = 10) {
  if (!dir || !fs.existsSync(dir)) return 0;

  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith('tracker-backup-') && f.endsWith('.db'))
    .sort()
    .reverse();

  let removed = 0;
  for (let i = keep; i < files.length; i++) {
    fs.unlinkSync(path.join(dir, files[i]));
    removed++;
  }
  return removed;
}

/**
 * Export all messages as JSON
 */
function exportJSON() {
  const messages = getAllMessages();
  return {
    exportedAt: new Date().toISOString(),
    count: messages.length,
    messages
  };
}

/**
 * Perform backup now (manual trigger)
 */
function backupNow() {
  const dest = BACKUP_PATH;
  if (!dest) return { success: false, error: 'BACKUP_PATH not configured' };

  const result = backupToPath(dest);
  const pruned = pruneBackups(dest);
  return { success: true, ...result, pruned };
}

/**
 * Start auto-backup timer
 */
function startAutoBackup() {
  if (!BACKUP_PATH) {
    console.log('Auto-backup disabled (BACKUP_PATH not set)');
    return;
  }

  // Initial backup
  try {
    const result = backupToPath(BACKUP_PATH);
    pruneBackups(BACKUP_PATH);
    console.log(`Initial backup created: ${result.path}`);
  } catch (err) {
    console.error('Initial backup failed:', err.message);
  }

  // Schedule recurring backups
  const intervalMs = BACKUP_INTERVAL_HOURS * 60 * 60 * 1000;
  backupTimer = setInterval(() => {
    try {
      const result = backupToPath(BACKUP_PATH);
      pruneBackups(BACKUP_PATH);
      console.log(`Scheduled backup created: ${result.path}`);
    } catch (err) {
      console.error('Scheduled backup failed:', err.message);
    }
  }, intervalMs);

  console.log(`Auto-backup enabled every ${BACKUP_INTERVAL_HOURS}h to ${BACKUP_PATH}`);
}

/**
 * Stop auto-backup and create final backup
 */
function stopAutoBackup() {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }

  if (BACKUP_PATH) {
    try {
      backupToPath(BACKUP_PATH);
      console.log('Final backup created on shutdown');
    } catch (err) {
      console.error('Final backup failed:', err.message);
    }
  }
}

module.exports = { backupToPath, pruneBackups, exportJSON, backupNow, startAutoBackup, stopAutoBackup };
