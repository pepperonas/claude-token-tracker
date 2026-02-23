#!/usr/bin/env node
/**
 * One-time migration: cache.json → SQLite
 * Usage: node scripts/migrate-json-to-sqlite.js
 */
const path = require('path');
const fs = require('fs');
const { initDB, insertMessages, setParseState } = require('../lib/db');
const { calculateCost } = require('../lib/pricing');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');
const PARSE_STATE_FILE = path.join(DATA_DIR, 'parse-state.json');

console.log('Migrating JSON cache to SQLite...');

// Init DB
initDB();

// Migrate messages
if (fs.existsSync(CACHE_FILE)) {
  const messages = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  if (Array.isArray(messages) && messages.length > 0) {
    // Ensure all messages have an id
    const withIds = messages.map((msg, i) => ({
      ...msg,
      id: msg.id || `migrated-${i}-${msg.timestamp || 'unknown'}`
    }));
    insertMessages(withIds, calculateCost);
    console.log(`Migrated ${withIds.length} messages`);
  } else {
    console.log('No messages to migrate');
  }
} else {
  console.log('No cache.json found, skipping message migration');
}

// Migrate parse state
if (fs.existsSync(PARSE_STATE_FILE)) {
  const state = JSON.parse(fs.readFileSync(PARSE_STATE_FILE, 'utf-8'));
  setParseState(state);
  console.log(`Migrated parse state (${Object.keys(state).length} files)`);
} else {
  console.log('No parse-state.json found, skipping');
}

console.log('Migration complete!');
