const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('./config');

let db = null;

function initDB(dbPath) {
  const resolvedPath = dbPath || DB_PATH;
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      timestamp TEXT,
      model TEXT,
      session_id TEXT,
      project TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_create_tokens INTEGER DEFAULT 0,
      stop_reason TEXT,
      cost REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS message_tools (
      message_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      PRIMARY KEY (message_id, tool_name),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS parse_state (
      file_path TEXT PRIMARY KEY,
      file_size INTEGER,
      mtime TEXT,
      byte_offset INTEGER
    );

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project);
    CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(model);
    CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(substr(timestamp, 1, 10));
  `);

  return db;
}

function getDB() {
  return db;
}

function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Insert messages into DB (upsert — last write wins)
 */
function insertMessages(messages, costFn) {
  const insertMsg = db.prepare(`
    INSERT OR REPLACE INTO messages
      (id, timestamp, model, session_id, project, input_tokens, output_tokens,
       cache_read_tokens, cache_create_tokens, stop_reason, cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteMsgTools = db.prepare('DELETE FROM message_tools WHERE message_id = ?');
  const insertTool = db.prepare('INSERT OR IGNORE INTO message_tools (message_id, tool_name) VALUES (?, ?)');

  const insertMany = db.transaction((msgs) => {
    for (const msg of msgs) {
      const cost = costFn ? costFn(msg.model, msg) : 0;
      insertMsg.run(
        msg.id, msg.timestamp, msg.model, msg.sessionId, msg.project,
        msg.inputTokens, msg.outputTokens, msg.cacheReadTokens, msg.cacheCreateTokens,
        msg.stopReason || null, cost
      );
      deleteMsgTools.run(msg.id);
      for (const tool of (msg.tools || [])) {
        insertTool.run(msg.id, tool);
      }
    }
  });

  insertMany(messages);
}

/**
 * Get all messages from DB (for aggregator bootstrap)
 */
function getAllMessages() {
  const rows = db.prepare(`
    SELECT m.*, GROUP_CONCAT(mt.tool_name) as tools
    FROM messages m
    LEFT JOIN message_tools mt ON m.id = mt.message_id
    GROUP BY m.id
    ORDER BY m.timestamp
  `).all();

  return rows.map(row => ({
    id: row.id,
    timestamp: row.timestamp,
    model: row.model,
    sessionId: row.session_id,
    project: row.project,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheCreateTokens: row.cache_create_tokens,
    stopReason: row.stop_reason,
    tools: row.tools ? row.tools.split(',') : []
  }));
}

/**
 * Get parse state from DB
 */
function getParseState() {
  const rows = db.prepare('SELECT * FROM parse_state').all();
  const state = {};
  for (const row of rows) {
    state[row.file_path] = {
      size: row.file_size,
      mtime: row.mtime,
      offset: row.byte_offset
    };
  }
  return state;
}

/**
 * Save parse state to DB
 */
function setParseState(state) {
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO parse_state (file_path, file_size, mtime, byte_offset)
    VALUES (?, ?, ?, ?)
  `);

  const saveAll = db.transaction((entries) => {
    for (const [filePath, s] of entries) {
      upsert.run(filePath, s.size, s.mtime, s.offset);
    }
  });

  saveAll(Object.entries(state));
}

/**
 * Get metadata value
 */
function getMetadata(key) {
  const row = db.prepare('SELECT value FROM metadata WHERE key = ?').get(key);
  return row ? row.value : null;
}

/**
 * Set metadata value
 */
function setMetadata(key, value) {
  db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(key, value);
}

module.exports = {
  initDB, getDB, closeDB,
  insertMessages, getAllMessages,
  getParseState, setParseState,
  getMetadata, setMetadata
};
