// DEPRECATED: This module is retained for migration purposes.
// New code should use lib/db.js for persistence.

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const CACHE_FILE = path.join(DATA_DIR, 'cache.json');
const PARSE_STATE_FILE = path.join(DATA_DIR, 'parse-state.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readParseState() {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(PARSE_STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeParseState(state) {
  ensureDataDir();
  fs.writeFileSync(PARSE_STATE_FILE, JSON.stringify(state));
}

function readCache() {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writeCache(messages) {
  ensureDataDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(messages));
}

module.exports = { readParseState, writeParseState, readCache, writeCache };
