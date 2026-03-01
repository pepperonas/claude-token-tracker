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

// Multi-user mode
const MULTI_USER = process.env.MULTI_USER === 'true';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_CACHE_TTL_MINUTES = parseInt(process.env.GITHUB_CACHE_TTL_MINUTES, 10) || 15;

module.exports = {
  HOME,
  CLAUDE_DIR,
  PROJECTS_DIR,
  DATA_DIR,
  PORT,
  DB_PATH,
  BACKUP_PATH,
  BACKUP_INTERVAL_HOURS,
  STATS_CACHE_FILE,
  MULTI_USER,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  SESSION_SECRET,
  BASE_URL,
  GITHUB_TOKEN,
  GITHUB_CACHE_TTL_MINUTES
};
