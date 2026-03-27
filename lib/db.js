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
  db.pragma('mmap_size = 268435456');

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
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON user_sessions(expires_at);
  `);

  // Achievements table
  db.exec(`
    CREATE TABLE IF NOT EXISTS achievements (
      user_id INTEGER NOT NULL DEFAULT 0,
      achievement_key TEXT NOT NULL,
      unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, achievement_key)
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
    if (!cols.find(c => c.name === 'is_subagent')) {
      db.exec('ALTER TABLE messages ADD COLUMN is_subagent INTEGER DEFAULT 0');
    }
  }

  // Add call_count to message_tools if missing (migration)
  {
    const cols = db.prepare("PRAGMA table_info(message_tools)").all();
    if (!cols.find(c => c.name === 'call_count')) {
      db.exec('ALTER TABLE message_tools ADD COLUMN call_count INTEGER DEFAULT 1');
    }
  }

  // Rate limit events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      session_id TEXT,
      project TEXT,
      user_id INTEGER DEFAULT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rle_timestamp ON rate_limit_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_rle_date ON rate_limit_events(substr(timestamp, 1, 10));
  `);

  // GitHub cache table
  db.exec(`
    CREATE TABLE IF NOT EXISTS github_cache (
      user_id INTEGER NOT NULL DEFAULT 0,
      cache_key TEXT NOT NULL,
      data TEXT,
      fetched_at TEXT,
      PRIMARY KEY (user_id, cache_key)
    );
  `);

  // Project shares table
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_shares (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      label TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_shares_project ON project_shares(project);
  `);

  // Add github_token and anthropic_key_encrypted columns if they don't exist (migration)
  {
    const cols = db.prepare("PRAGMA table_info(users)").all();
    if (!cols.find(c => c.name === 'github_token')) {
      db.exec('ALTER TABLE users ADD COLUMN github_token TEXT');
    }
    if (!cols.find(c => c.name === 'anthropic_key_encrypted')) {
      db.exec('ALTER TABLE users ADD COLUMN anthropic_key_encrypted TEXT');
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

  // Devices table
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      last_sync_at TEXT
    );
    -- idx_devices_api_key removed: redundant with UNIQUE constraint auto-index
    -- idx_devices_user_id removed: covered by idx_devices_user_created
  `);
  // Drop redundant indexes on existing DBs
  db.exec('DROP INDEX IF EXISTS idx_devices_api_key');
  db.exec('DROP INDEX IF EXISTS idx_devices_user_id');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_devices_user_created ON devices(user_id, created_at);
  `);

  // Add device_id to messages if missing
  {
    const msgCols = db.prepare("PRAGMA table_info(messages)").all();
    if (!msgCols.find(c => c.name === 'device_id')) {
      db.exec('ALTER TABLE messages ADD COLUMN device_id INTEGER DEFAULT NULL');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_device_id ON messages(device_id)');
    }
  }

  // Add device_id to rate_limit_events if missing
  {
    const rleCols = db.prepare("PRAGMA table_info(rate_limit_events)").all();
    if (!rleCols.find(c => c.name === 'device_id')) {
      db.exec('ALTER TABLE rate_limit_events ADD COLUMN device_id INTEGER DEFAULT NULL');
    }
  }

  // Compound indexes for multi-user/device queries (only if columns exist)
  {
    const msgCols = db.prepare("PRAGMA table_info(messages)").all();
    if (msgCols.find(c => c.name === 'user_id') && msgCols.find(c => c.name === 'device_id')) {
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_user_device_ts ON messages(user_id, device_id, timestamp)');
    }
    const rleCols = db.prepare("PRAGMA table_info(rate_limit_events)").all();
    if (rleCols.find(c => c.name === 'user_id') && rleCols.find(c => c.name === 'device_id')) {
      db.exec('CREATE INDEX IF NOT EXISTS idx_rle_user_device_ts ON rate_limit_events(user_id, device_id, timestamp)');
    }
  }

  // Run ANALYZE for query planner statistics
  db.pragma('optimize');

  // Migrate existing user api_keys to devices table
  _migrateApiKeysToDevices();

  return db;
}

function _migrateApiKeysToDevices() {
  const deviceCount = db.prepare('SELECT COUNT(*) as cnt FROM devices').get().cnt;
  if (deviceCount > 0) return; // already migrated

  // Migrate multi-user api_keys
  const users = db.prepare('SELECT id, api_key FROM users WHERE api_key IS NOT NULL').all();
  if (users.length === 0) return;

  const insertDevice = db.prepare(
    "INSERT INTO devices (user_id, name, api_key) VALUES (?, ?, ?)"
  );

  // Check if messages has user_id column (only in multi-user mode)
  const msgCols = db.prepare("PRAGMA table_info(messages)").all();
  const hasUserIdCol = !!msgCols.find(c => c.name === 'user_id');

  const migrate = db.transaction(() => {
    for (const u of users) {
      const info = insertDevice.run(u.id, 'MacBook', u.api_key);
      if (hasUserIdCol) {
        db.prepare('UPDATE messages SET device_id = ? WHERE user_id = ? AND device_id IS NULL').run(info.lastInsertRowid, u.id);
        db.prepare('UPDATE rate_limit_events SET device_id = ? WHERE user_id = ? AND device_id IS NULL').run(info.lastInsertRowid, u.id);
      }
    }
  });
  migrate();

  // eslint-disable-next-line no-console
  console.log(`Migrated ${users.length} user API key(s) to devices table`);
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
       lines_added, lines_removed, lines_written, is_subagent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteMsgTools = db.prepare('DELETE FROM message_tools WHERE message_id = ?');
  const insertTool = db.prepare('INSERT OR REPLACE INTO message_tools (message_id, tool_name, call_count) VALUES (?, ?, ?)');

  const insertMany = db.transaction((msgs) => {
    for (const msg of msgs) {
      const cost = costFn ? costFn(msg.model, msg) : 0;
      insertMsg.run(
        msg.id, msg.timestamp, msg.model, msg.sessionId, msg.project,
        msg.inputTokens, msg.outputTokens, msg.cacheReadTokens, msg.cacheCreateTokens,
        msg.stopReason || null, cost,
        msg.linesAdded || 0, msg.linesRemoved || 0, msg.linesWritten || 0,
        msg.isSubagent ? 1 : 0
      );
      deleteMsgTools.run(msg.id);
      if (msg.toolCounts) {
        for (const [name, count] of Object.entries(msg.toolCounts)) {
          insertTool.run(msg.id, name, count);
        }
      } else {
        for (const tool of (msg.tools || [])) {
          insertTool.run(msg.id, tool, 1);
        }
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
    SELECT m.*, GROUP_CONCAT(mt.tool_name) as tools, GROUP_CONCAT(mt.call_count) as tool_counts
    FROM messages m
    LEFT JOIN message_tools mt ON m.id = mt.message_id
    GROUP BY m.id
    ORDER BY m.timestamp
  `).all();

  return rows.map(row => {
    const toolNames = row.tools ? row.tools.split(',') : [];
    const counts = row.tool_counts ? row.tool_counts.split(',').map(Number) : [];
    const toolCounts = {};
    for (let i = 0; i < toolNames.length; i++) {
      toolCounts[toolNames[i]] = counts[i] || 1;
    }
    return {
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
      tools: toolNames,
      toolCounts,
      isSubagent: !!(row.is_subagent),
      linesAdded: row.lines_added || 0,
      linesRemoved: row.lines_removed || 0,
      linesWritten: row.lines_written || 0
    };
  });
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

function updateUserGithubToken(userId, token) {
  db.prepare('UPDATE users SET github_token = ? WHERE id = ?').run(token, userId);
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

function insertMessagesForUser(messages, costFn, userId, deviceId) {
  const insertMsg = db.prepare(`
    INSERT OR REPLACE INTO messages
      (id, timestamp, model, session_id, project, input_tokens, output_tokens,
       cache_read_tokens, cache_create_tokens, stop_reason, cost,
       lines_added, lines_removed, lines_written, user_id, is_subagent, device_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteMsgTools = db.prepare('DELETE FROM message_tools WHERE message_id = ?');
  const insertTool = db.prepare('INSERT OR REPLACE INTO message_tools (message_id, tool_name, call_count) VALUES (?, ?, ?)');

  const insertMany = db.transaction((msgs) => {
    for (const msg of msgs) {
      const cost = costFn ? costFn(msg.model, msg) : 0;
      insertMsg.run(
        msg.id, msg.timestamp, msg.model, msg.sessionId, msg.project,
        msg.inputTokens, msg.outputTokens, msg.cacheReadTokens, msg.cacheCreateTokens,
        msg.stopReason || null, cost,
        msg.linesAdded || 0, msg.linesRemoved || 0, msg.linesWritten || 0, userId,
        msg.isSubagent ? 1 : 0, deviceId || null
      );
      deleteMsgTools.run(msg.id);
      if (msg.toolCounts) {
        for (const [name, count] of Object.entries(msg.toolCounts)) {
          insertTool.run(msg.id, name, count);
        }
      } else {
        for (const tool of (msg.tools || [])) {
          insertTool.run(msg.id, tool, 1);
        }
      }
    }
  });

  insertMany(messages);
}

function getMessagesForUser(userId, deviceId) {
  let sql = `
    SELECT m.*, GROUP_CONCAT(mt.tool_name) as tools, GROUP_CONCAT(mt.call_count) as tool_counts
    FROM messages m
    LEFT JOIN message_tools mt ON m.id = mt.message_id
    WHERE m.user_id = ?`;
  const params = [userId];
  if (deviceId) {
    sql += ' AND m.device_id = ?';
    params.push(deviceId);
  }
  sql += ' GROUP BY m.id ORDER BY m.timestamp';
  const rows = db.prepare(sql).all(...params);

  return rows.map(row => {
    const toolNames = row.tools ? row.tools.split(',') : [];
    const counts = row.tool_counts ? row.tool_counts.split(',').map(Number) : [];
    const toolCounts = {};
    for (let i = 0; i < toolNames.length; i++) {
      toolCounts[toolNames[i]] = counts[i] || 1;
    }
    return {
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
      tools: toolNames,
      toolCounts,
      isSubagent: !!(row.is_subagent),
      linesAdded: row.lines_added || 0,
      linesRemoved: row.lines_removed || 0,
      linesWritten: row.lines_written || 0
    };
  });
}

// --- Achievement functions ---

function getUnlockedAchievements(userId) {
  return db.prepare('SELECT achievement_key, unlocked_at FROM achievements WHERE user_id = ?').all(userId || 0);
}

function unlockAchievementsBatch(userId, keys) {
  if (!keys || keys.length === 0) return;
  const insert = db.prepare(
    'INSERT OR IGNORE INTO achievements (user_id, achievement_key) VALUES (?, ?)'
  );
  const insertAll = db.transaction((ks) => {
    for (const key of ks) {
      insert.run(userId || 0, key);
    }
  });
  insertAll(keys);
}

/**
 * Get global averages across all users (for comparison in multi-user mode)
 */
function getGlobalUserStats(from, to, currentUserId) {
  let dateFilter = '';
  const params = [];
  if (from) {
    dateFilter += ' AND substr(m.timestamp, 1, 10) >= ?';
    params.push(from);
  }
  if (to) {
    dateFilter += ' AND substr(m.timestamp, 1, 10) <= ?';
    params.push(to);
  }

  const query = `
    SELECT
      user_id,
      SUM(input_tokens + output_tokens + cache_read_tokens + cache_create_tokens) as total_tokens,
      SUM(cost) as total_cost,
      COUNT(DISTINCT session_id) as total_sessions,
      COUNT(*) as total_messages,
      SUM(lines_written + lines_added) as total_lines,
      CASE WHEN SUM(input_tokens + cache_read_tokens + cache_create_tokens) > 0
        THEN CAST(SUM(cache_read_tokens) AS REAL) / SUM(input_tokens + cache_read_tokens + cache_create_tokens) * 100
        ELSE 0 END as cache_efficiency
    FROM messages m
    WHERE user_id IS NOT NULL ${dateFilter}
    GROUP BY user_id
  `;

  const rows = db.prepare(query).all(...params);
  if (rows.length === 0) {
    return { you: null, avg: null, userCount: 0 };
  }

  const others = rows.filter(r => r.user_id !== currentUserId);
  const you = rows.find(r => r.user_id === currentUserId);

  if (others.length === 0) {
    return {
      you: you ? {
        totalTokens: you.total_tokens || 0,
        totalCost: Math.round((you.total_cost || 0) * 100) / 100,
        totalSessions: you.total_sessions || 0,
        totalMessages: you.total_messages || 0,
        totalLines: you.total_lines || 0,
        cacheEfficiency: Math.round((you.cache_efficiency || 0) * 10) / 10
      } : null,
      avg: null,
      userCount: rows.length
    };
  }

  const avgTokens = Math.round(others.reduce((s, r) => s + (r.total_tokens || 0), 0) / others.length);
  const avgCost = Math.round(others.reduce((s, r) => s + (r.total_cost || 0), 0) / others.length * 100) / 100;
  const avgSessions = Math.round(others.reduce((s, r) => s + (r.total_sessions || 0), 0) / others.length);
  const avgMessages = Math.round(others.reduce((s, r) => s + (r.total_messages || 0), 0) / others.length);
  const avgLines = Math.round(others.reduce((s, r) => s + (r.total_lines || 0), 0) / others.length);
  const avgCacheEff = Math.round(others.reduce((s, r) => s + (r.cache_efficiency || 0), 0) / others.length * 10) / 10;

  return {
    you: you ? {
      totalTokens: you.total_tokens || 0,
      totalCost: Math.round((you.total_cost || 0) * 100) / 100,
      totalSessions: you.total_sessions || 0,
      totalMessages: you.total_messages || 0,
      totalLines: you.total_lines || 0,
      cacheEfficiency: Math.round((you.cache_efficiency || 0) * 10) / 10
    } : null,
    avg: {
      totalTokens: avgTokens,
      totalCost: avgCost,
      totalSessions: avgSessions,
      totalMessages: avgMessages,
      totalLines: avgLines,
      cacheEfficiency: avgCacheEff
    },
    userCount: rows.length
  };
}

// --- Device management ---

function createDevice(userId, name) {
  const apiKey = crypto.randomBytes(32).toString('hex');
  const info = db.prepare(
    "INSERT INTO devices (user_id, name, api_key) VALUES (?, ?, ?)"
  ).run(userId, name, apiKey);
  return db.prepare('SELECT * FROM devices WHERE id = ?').get(info.lastInsertRowid);
}

function getDevicesForUser(userId) {
  return db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at').all(userId);
}

function findDeviceByApiKey(apiKey) {
  return db.prepare('SELECT * FROM devices WHERE api_key = ?').get(apiKey) || null;
}

function getDeviceById(deviceId) {
  return db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId) || null;
}

function renameDevice(deviceId, name) {
  db.prepare('UPDATE devices SET name = ? WHERE id = ?').run(name, deviceId);
}

function deleteDevice(deviceId) {
  db.prepare('UPDATE messages SET device_id = NULL WHERE device_id = ?').run(deviceId);
  db.prepare('UPDATE rate_limit_events SET device_id = NULL WHERE device_id = ?').run(deviceId);
  db.prepare('DELETE FROM devices WHERE id = ?').run(deviceId);
}

function regenerateDeviceKey(deviceId) {
  const apiKey = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE devices SET api_key = ? WHERE id = ?').run(apiKey, deviceId);
  return apiKey;
}

function updateDeviceLastSync(deviceId) {
  db.prepare("UPDATE devices SET last_sync_at = datetime('now') WHERE id = ?").run(deviceId);
}

// --- Anthropic key management ---

function updateUserAnthropicKey(userId, encryptedKey) {
  db.prepare('UPDATE users SET anthropic_key_encrypted = ? WHERE id = ?').run(encryptedKey, userId);
}

function getUserAnthropicKey(userId) {
  const row = db.prepare('SELECT anthropic_key_encrypted FROM users WHERE id = ?').get(userId);
  return row ? row.anthropic_key_encrypted : null;
}

// --- Rate limit event functions ---

function insertRateLimitEvents(events) {
  if (!events || events.length === 0) return;
  const insert = db.prepare(
    'INSERT OR IGNORE INTO rate_limit_events (id, timestamp, session_id, project) VALUES (?, ?, ?, ?)'
  );
  const insertAll = db.transaction((evts) => {
    for (const evt of evts) {
      insert.run(evt.id, evt.timestamp, evt.sessionId || null, evt.project || null);
    }
  });
  insertAll(events);
}

function insertRateLimitEventsForUser(events, userId, deviceId) {
  if (!events || events.length === 0) return;
  const insert = db.prepare(
    'INSERT OR IGNORE INTO rate_limit_events (id, timestamp, session_id, project, user_id, device_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertAll = db.transaction((evts) => {
    for (const evt of evts) {
      insert.run(evt.id, evt.timestamp, evt.sessionId || null, evt.project || null, userId, deviceId || null);
    }
  });
  insertAll(events);
}

function getAllRateLimitEvents() {
  return db.prepare('SELECT * FROM rate_limit_events ORDER BY timestamp').all().map(row => ({
    id: row.id,
    timestamp: row.timestamp,
    sessionId: row.session_id,
    project: row.project
  }));
}

function getRateLimitEventsForUser(userId, deviceId) {
  let sql = 'SELECT * FROM rate_limit_events WHERE user_id = ?';
  const params = [userId];
  if (deviceId) {
    sql += ' AND device_id = ?';
    params.push(deviceId);
  }
  sql += ' ORDER BY timestamp';
  return db.prepare(sql).all(...params).map(row => ({
    id: row.id,
    timestamp: row.timestamp,
    sessionId: row.session_id,
    project: row.project
  }));
}

// --- Project share functions ---

function createProjectShare(project, label, expiresInDays) {
  const id = crypto.randomBytes(24).toString('hex');
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
    : null;
  db.prepare('INSERT INTO project_shares (id, project, label, expires_at) VALUES (?, ?, ?, ?)').run(id, project, label || null, expiresAt);
  return { id, project, label, expires_at: expiresAt };
}

function getProjectShare(id) {
  const share = db.prepare('SELECT * FROM project_shares WHERE id = ?').get(id);
  if (!share) return null;
  if (share.expires_at && new Date(share.expires_at) < new Date()) return null;
  return share;
}

function listProjectShares() {
  return db.prepare('SELECT * FROM project_shares ORDER BY created_at DESC').all();
}

function deleteProjectShare(id) {
  return db.prepare('DELETE FROM project_shares WHERE id = ?').run(id);
}

module.exports = {
  initDB, getDB, closeDB,
  insertMessages, getAllMessages,
  getParseState, setParseState,
  getMetadata, setMetadata,
  // Multi-user
  createUser, findUserByGithubId, findUserByApiKey, findUserById,
  updateLastLogin, updateUserGithubToken, regenerateApiKey,
  createSession, getSession, deleteSession, cleanExpiredSessions,
  insertMessagesForUser, getMessagesForUser,
  // Devices
  createDevice, getDevicesForUser, findDeviceByApiKey, getDeviceById,
  renameDevice, deleteDevice, regenerateDeviceKey, updateDeviceLastSync,
  // Anthropic key
  updateUserAnthropicKey, getUserAnthropicKey,
  // Achievements
  getUnlockedAchievements, unlockAchievementsBatch,
  // Global comparison
  getGlobalUserStats,
  // Rate limit events
  insertRateLimitEvents, insertRateLimitEventsForUser,
  getAllRateLimitEvents, getRateLimitEventsForUser,
  // Project shares
  createProjectShare, getProjectShare, listProjectShares, deleteProjectShare
};
