const path = require('path');

const HOME = process.env.HOME || require('os').homedir();

const CLAUDE_DIR = process.env.CLAUDE_DIR
  ? path.resolve(process.env.CLAUDE_DIR)
  : path.join(HOME, '.claude');

const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const DATA_DIR = path.join(__dirname, '..', 'data');
const PORT = parseInt(process.env.PORT, 10) || 5010;
const DB_PATH = path.join(DATA_DIR, 'tracker.db');
const BACKUP_PATH = process.env.BACKUP_PATH || '';
const BACKUP_INTERVAL_HOURS = parseInt(process.env.BACKUP_INTERVAL_HOURS, 10) || 6;
const STATS_CACHE_FILE = path.join(CLAUDE_DIR, 'stats-cache.json');

module.exports = {
  HOME,
  CLAUDE_DIR,
  PROJECTS_DIR,
  DATA_DIR,
  PORT,
  DB_PATH,
  BACKUP_PATH,
  BACKUP_INTERVAL_HOURS,
  STATS_CACHE_FILE
};
