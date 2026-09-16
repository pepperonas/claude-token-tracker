/**
 * Per-account database snapshot.
 *
 * Builds a standalone SQLite file holding exactly one account's own usage data.
 * A fresh file is ATTACHed to the live connection, the schema of each data
 * table is copied verbatim out of `sqlite_master` (so the snapshot follows
 * schema migrations automatically) and only the rows belonging to the
 * requesting account are inserted.
 *
 * Carried over — this is the account's own data:
 *   messages, message_tools, rate_limit_events, achievements, project_aliases
 *
 * Deliberately left out — server state, not account data:
 *   users, user_sessions  account records and live session tokens
 *   devices               sync API keys (a lost device key is regenerated,
 *                         never shipped inside a downloadable file)
 *   github_cache          cached third-party API payloads
 *   metadata              server configuration and encrypted credentials
 *   parse_state           byte offsets of files on the server's disk
 *   project_shares        operator-level share links
 *
 * The table list is an allowlist on purpose: a table added by a future
 * migration is absent from the snapshot until someone decides it is account
 * data and adds it here. Silence is the safe default.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

/**
 * Tables copied into a snapshot, in insert order.
 * `messages` must precede `message_tools` — foreign keys are enforced.
 * `own` builds the row filter; `col` is the column carrying the account id,
 * or null when the rows are reached through a join.
 */
const DATA_TABLES = [
  { name: 'messages', col: 'user_id' },
  { name: 'message_tools', col: null },
  { name: 'rate_limit_events', col: 'user_id' },
  { name: 'achievements', col: 'user_id' },
  { name: 'project_aliases', col: 'user_id' },
];

/**
 * Row filter for one account.
 *
 * Multi-user rows carry the account id. Single-user rows were written before
 * accounts existed and carry NULL or 0 depending on the table's default, so
 * both spellings mean "the local account" there. The CAST makes the comparison
 * work whether the column is stored as INTEGER (messages) or TEXT
 * (project_aliases).
 *
 * `messages.user_id` is only added by the multi-user migration, so the column
 * can legitimately be absent. Without it, rows cannot be attributed: a
 * single-user database has exactly one account and every row is its own, while
 * a multi-user one must yield nothing rather than guess. Fail closed.
 *
 * The account id is bound as TEXT and only the COLUMN is cast. better-sqlite3
 * binds a JS number as REAL, so casting the parameter instead would compare
 * against '1.0' and quietly match nothing — an empty snapshot rather than a
 * loud failure.
 */
function ownRows(col, multiUser, present = true) {
  if (!col) return '1=1';
  if (!present) return multiUser ? '1=0' : '1=1';
  return multiUser
    ? `CAST(${col} AS TEXT) = @uid`
    : `(${col} IS NULL OR CAST(${col} AS TEXT) = '0')`;
}

function hasColumn(db, table, col) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().some(c => c.name === col);
}

function tableSchema(db, table) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  return row && row.sql ? row.sql : null;
}

/**
 * Point a `CREATE TABLE foo (...)` statement at the attached database.
 * Only the leading table reference is rewritten; the body is left untouched so
 * column definitions and constraints stay exactly as the live schema has them.
 */
function retarget(sql, table, alias) {
  const re = new RegExp(
    `^\\s*CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["'\`\\[]?${table}["'\`\\]]?`,
    'i'
  );
  if (!re.test(sql)) throw new Error(`Unexpected schema statement for table "${table}"`);
  return sql.replace(re, `CREATE TABLE ${alias}."${table}"`);
}

/**
 * Write a snapshot of one account's data and return its path.
 * The caller owns the file and must delete it when the response is done.
 *
 * @param {object} db            live better-sqlite3 connection
 * @param {number|string} opts.userId    account id (0 in single-user mode)
 * @param {boolean} opts.multiUser       whether rows are account-scoped
 * @param {string} [opts.dir]            directory for the file (default: tmp)
 */
function buildUserSnapshot(db, { userId, multiUser, dir } = {}) {
  // Unique alias and filename: two downloads may run at the same time, and an
  // alias collision would abort the second one mid-flight.
  const alias = `snap_${crypto.randomBytes(6).toString('hex')}`;
  const file = path.join(
    dir || os.tmpdir(),
    `tracker-export-${crypto.randomBytes(8).toString('hex')}.db`
  );

  // message_tools inherits its owner through the message it belongs to.
  const messagesOwned = hasColumn(db, 'messages', 'user_id');

  db.prepare(`ATTACH DATABASE ? AS ${alias}`).run(file);
  try {
    for (const { name, col } of DATA_TABLES) {
      const sql = tableSchema(db, name);
      if (!sql) continue; // table not present in this schema version
      db.exec(retarget(sql, name, alias));

      const select = name === 'message_tools'
        ? `SELECT mt.* FROM main.message_tools mt
             JOIN main.messages m ON m.id = mt.message_id
            WHERE ${ownRows('m.user_id', multiUser, messagesOwned)}`
        : `SELECT * FROM main."${name}" WHERE ${ownRows(col, multiUser, hasColumn(db, name, col))}`;

      // Bind only when the filter actually references the parameter —
      // better-sqlite3 rejects values passed to a statement that takes none.
      const stmt = db.prepare(`INSERT INTO ${alias}."${name}" ${select}`);
      if (select.includes('@uid')) stmt.run({ uid: String(userId) });
      else stmt.run();
    }
  } catch (err) {
    try { db.prepare(`DETACH DATABASE ${alias}`).run(); } catch { /* already gone */ }
    try { fs.unlinkSync(file); } catch { /* never created */ }
    throw err;
  }
  db.prepare(`DETACH DATABASE ${alias}`).run();

  return file;
}

module.exports = { buildUserSnapshot, DATA_TABLES, ownRows, retarget };
