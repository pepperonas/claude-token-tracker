const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CLAUDE_DIR, PROJECTS_DIR, HOME } = require('./config');

/**
 * Build a regex to strip the home-directory prefix from project dir names.
 * e.g. /Users/martin → matches -Users-martin- at the start of a dir name
 */
/**
 * Count content lines in a string (trailing newline does not add a line)
 */
function countLines(str) {
  if (!str) return 0;
  let n = 1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\n') n++;
  }
  if (str[str.length - 1] === '\n') n--;
  return n;
}

const HOME_PREFIX_RE = new RegExp(
  '^' + HOME.replace(/\//g, '-').replace(/^-/, '-') + '-?'
);

/**
 * Find all JSONL session files (including subagents)
 */
function findSessionFiles() {
  const files = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.name.endsWith('.jsonl')) {
        files.push(full);
      }
    }
  }
  walk(PROJECTS_DIR);
  return files;
}

/**
 * Extract project name from path like -Users-martin-cursor-foo → cursor/foo
 */
function extractProjectName(filePath) {
  const rel = path.relative(PROJECTS_DIR, filePath);
  const parts = rel.split(path.sep);
  const dirName = parts[0];
  const cleaned = dirName.replace(HOME_PREFIX_RE, '') || 'home';
  return cleaned.replace(/-/g, '/') || 'home';
}

/**
 * Parse a single JSONL file (or from offset for incremental)
 * Deduplicates by message.id — only keeps the LAST entry per API message
 */
function parseSessionFile(filePath, fromOffset = 0) {
  const stat = fs.statSync(filePath);
  if (stat.size <= fromOffset) return { messages: [], rateLimitEvents: [], newOffset: fromOffset };

  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(stat.size - fromOffset);
  fs.readSync(fd, buf, 0, buf.length, fromOffset);
  fs.closeSync(fd);

  const lines = buf.toString('utf-8').split('\n');
  const msgMap = new Map();
  const rateLimitEvents = [];
  let sessionId = null;
  const project = extractProjectName(filePath);

  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    if (!sessionId && obj.sessionId) sessionId = obj.sessionId;

    // Rate-limit events
    if (obj.type === 'queue-operation' && obj.content === '/rate-limit-options') {
      const sid = obj.sessionId || sessionId || '';
      const id = crypto.createHash('sha256').update(sid + obj.timestamp).digest('hex').slice(0, 16);
      rateLimitEvents.push({ id, timestamp: obj.timestamp, sessionId: sid, project });
      continue;
    }

    if (obj.type === 'assistant' && obj.message) {
      const msg = obj.message;
      const usage = msg.usage;
      if (!usage) continue;

      const msgId = msg.id || obj.uuid;
      const model = msg.model || '<synthetic>';
      const timestamp = obj.timestamp;

      const tools = [];
      const toolCounts = {};
      let linesAdded = 0, linesRemoved = 0, linesWritten = 0;
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            tools.push(block.name);
            toolCounts[block.name] = (toolCounts[block.name] || 0) + 1;
            if (block.name === 'Edit' && block.input) {
              linesRemoved += countLines(block.input.old_string);
              linesAdded += countLines(block.input.new_string);
            } else if (block.name === 'Write' && block.input) {
              linesWritten += countLines(block.input.content);
            }
          }
        }
      }

      const prev = msgMap.get(msgId);
      // Merge tools: use Math.max per tool to handle streaming updates
      let mergedTools, mergedToolCounts;
      if (prev) {
        mergedToolCounts = { ...prev.toolCounts };
        for (const [name, count] of Object.entries(toolCounts)) {
          mergedToolCounts[name] = Math.max(mergedToolCounts[name] || 0, count);
        }
        mergedTools = Object.keys(mergedToolCounts);
      } else {
        mergedToolCounts = toolCounts;
        mergedTools = tools;
      }

      const isSubagent = filePath.includes('/subagents/');

      msgMap.set(msgId, {
        id: msgId,
        timestamp,
        model,
        sessionId: obj.sessionId || sessionId,
        project,
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        cacheCreateTokens: usage.cache_creation_input_tokens || 0,
        tools: mergedTools,
        toolCounts: mergedToolCounts,
        isSubagent,
        stopReason: msg.stop_reason || (tools.length > 0 ? 'tool_use' : 'end_turn'),
        linesAdded,
        linesRemoved,
        linesWritten
      });
    }
  }

  return { messages: [...msgMap.values()], rateLimitEvents, newOffset: stat.size, sessionId };
}

/**
 * Full parse of all session files
 */
function parseAll(parseState = {}) {
  const files = findSessionFiles();
  const allMessages = [];
  const allRateLimitEvents = [];
  const newState = {};

  for (const filePath of files) {
    const prev = parseState[filePath];
    const stat = fs.statSync(filePath);
    const offset = (prev && prev.size <= stat.size && prev.mtime === stat.mtimeMs.toString())
      ? prev.offset
      : 0;

    const { messages, rateLimitEvents, newOffset } = parseSessionFile(filePath, offset);
    allMessages.push(...messages);
    allRateLimitEvents.push(...rateLimitEvents);
    newState[filePath] = {
      size: stat.size,
      mtime: stat.mtimeMs.toString(),
      offset: newOffset
    };
  }

  return { messages: allMessages, rateLimitEvents: allRateLimitEvents, parseState: newState };
}

/**
 * Parse a single file incrementally (for file watcher)
 */
function parseIncremental(filePath, parseState) {
  const prev = parseState[filePath];
  const stat = fs.statSync(filePath);
  const offset = prev ? prev.offset : 0;

  const { messages, rateLimitEvents, newOffset } = parseSessionFile(filePath, offset);
  parseState[filePath] = {
    size: stat.size,
    mtime: stat.mtimeMs.toString(),
    offset: newOffset
  };

  return { messages, rateLimitEvents };
}

/**
 * Backfill: scan ALL session files from offset 0 for rate-limit events only.
 * Lightweight — skips message parsing entirely.
 */
function backfillRateLimitEvents() {
  const files = findSessionFiles();
  const allEvents = [];

  for (const filePath of files) {
    let stat;
    try { stat = fs.statSync(filePath); } catch { continue; }
    if (stat.size === 0) continue;

    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(stat.size);
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);

    const project = extractProjectName(filePath);
    let sessionId = null;

    const lines = buf.toString('utf-8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }

      if (!sessionId && obj.sessionId) sessionId = obj.sessionId;

      if (obj.type === 'queue-operation' && obj.content === '/rate-limit-options') {
        const sid = obj.sessionId || sessionId || '';
        const id = crypto.createHash('sha256').update(sid + obj.timestamp).digest('hex').slice(0, 16);
        allEvents.push({ id, timestamp: obj.timestamp, sessionId: sid, project });
      }
    }
  }

  return allEvents;
}

module.exports = { findSessionFiles, parseSessionFile, parseAll, parseIncremental, extractProjectName, backfillRateLimitEvents, CLAUDE_DIR, PROJECTS_DIR };
