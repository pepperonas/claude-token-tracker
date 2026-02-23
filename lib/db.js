const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DB_PATH, MULTI_USER } = require('./config');

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

  // Multi-user tables (always created so schema is consistent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      github_id TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      api_key TEXT UNIQUE,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
  `);

  // Add lines columns if they don't exist (migration)
  {
    const cols = db.prepare("PRAGMA table_info(messages)").all();
    if (!cols.find(c => c.name === 'lines_added')) {
      db.exec('ALTER TABLE messages ADD COLUMN lines_added INTEGER DEFAULT 0');
      db.exec('ALTER TABLE messages ADD COLUMN lines_removed INTEGER DEFAULT 0');
      db.exec('ALTER TABLE messages ADD COLUMN lines_written INTEGER DEFAULT 0');
    }
  }

  // Add user_id column to messages if MULTI_USER and column doesn't exist
  if (MULTI_USER) {
    const cols = db.prepare("PRAGMA table_info(messages)").all();
    if (!cols.find(c => c.name === 'user_id')) {
      db.exec('ALTER TABLE messages ADD COLUMN user_id INTEGER DEFAULT NULL');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_user_timestamp ON messages(user_id, timestamp)');
    }
  }

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
       cache_read_tokens, cache_create_tokens, stop_reason, cost,
       lines_added, lines_removed, lines_written)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteMsgTools = db.prepare('DELETE FROM message_tools WHERE message_id = ?');
  const insertTool = db.prepare('INSERT OR IGNORE INTO message_tools (message_id, tool_name) VALUES (?, ?)');

  const insertMany = db.transaction((msgs) => {
    for (const msg of msgs) {
      const cost = costFn ? costFn(msg.model, msg) : 0;
      insertMsg.run(
        msg.id, msg.timestamp, msg.model, msg.sessionId, msg.project,
        msg.inputTokens, msg.outputTokens, msg.cacheReadTokens, msg.cacheCreateTokens,
        msg.stopReason || null, cost,
        msg.linesAdded || 0, msg.linesRemoved || 0, msg.linesWritten || 0
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
    tools: row.tools ? row.tools.split(',') : [],
    linesAdded: row.lines_added || 0,
    linesRemoved: row.lines_removed || 0,
    linesWritten: row.lines_written || 0
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

// --- User management ---

function createUser({ githubId, username, displayName, avatarUrl }) {
  const apiKey = crypto.randomBytes(32).toString('hex');
  const stmt = db.prepare(`
    INSERT INTO users (github_id, username, display_name, avatar_url, api_key, last_login)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(github_id) DO UPDATE SET
      username = excluded.username,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      last_login = datetime('now')
  `);
  stmt.run(githubId, username, displayName || null, avatarUrl || null, apiKey);
  return findUserByGithubId(githubId);
}

function findUserByGithubId(githubId) {
  return db.prepare('SELECT * FROM users WHERE github_id = ?').get(githubId) || null;
}

function findUserByApiKey(apiKey) {
  return db.prepare('SELECT * FROM users WHERE api_key = ?').get(apiKey) || null;
}

function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

function updateLastLogin(userId) {
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(userId);
}

function regenerateApiKey(userId) {
  const apiKey = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE users SET api_key = ? WHERE id = ?').run(apiKey, userId);
  return apiKey;
}

// --- Session management ---

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return { token, expiresAt };
}

function getSession(token) {
  const row = db.prepare('SELECT * FROM user_sessions WHERE token = ? AND expires_at > datetime(\'now\')').get(token);
  return row || null;
}

function deleteSession(token) {
  db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token);
}

function cleanExpiredSessions() {
  db.prepare("DELETE FROM user_sessions WHERE expires_at <= datetime('now')").run();
}

// --- User-scoped message functions ---

function insertMessagesForUser(messages, costFn, userId) {
  const insertMsg = db.prepare(`
    INSERT OR REPLACE INTO messages
      (id, timestamp, model, session_id, project, input_tokens, output_tokens,
       cache_read_tokens, cache_create_tokens, stop_reason, cost,
       lines_added, lines_removed, lines_written, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteMsgTools = db.prepare('DELETE FROM message_tools WHERE message_id = ?');
  const insertTool = db.prepare('INSERT OR IGNORE INTO message_tools (message_id, tool_name) VALUES (?, ?)');

  const insertMany = db.transaction((msgs) => {
    for (const msg of msgs) {
      const cost = costFn ? costFn(msg.model, msg) : 0;
      insertMsg.run(
        msg.id, msg.timestamp, msg.model, msg.sessionId, msg.project,
        msg.inputTokens, msg.outputTokens, msg.cacheReadTokens, msg.cacheCreateTokens,
        msg.stopReason || null, cost,
        msg.linesAdded || 0, msg.linesRemoved || 0, msg.linesWritten || 0, userId
      );
      deleteMsgTools.run(msg.id);
      for (const tool of (msg.tools || [])) {
        insertTool.run(msg.id, tool);
      }
    }
  });

  insertMany(messages);
}

function getMessagesForUser(userId) {
  const rows = db.prepare(`
    SELECT m.*, GROUP_CONCAT(mt.tool_name) as tools
    FROM messages m
    LEFT JOIN message_tools mt ON m.id = mt.message_id
    WHERE m.user_id = ?
    GROUP BY m.id
    ORDER BY m.timestamp
  `).all(userId);

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
    tools: row.tools ? row.tools.split(',') : [],
    linesAdded: row.lines_added || 0,
    linesRemoved: row.lines_removed || 0,
    linesWritten: row.lines_written || 0
  }));
}

module.exports = {
  initDB, getDB, closeDB,
  insertMessages, getAllMessages,
  getParseState, setParseState,
  getMetadata, setMetadata,
  // Multi-user
  createUser, findUserByGithubId, findUserByApiKey, findUserById,
  updateLastLogin, regenerateApiKey,
  createSession, getSession, deleteSession, cleanExpiredSessions,
  insertMessagesForUser, getMessagesForUser
};
