const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseSessionFile, extractProjectName } = require('../lib/parser');
const { messageToJsonl } = require('./fixtures/sample-messages');

describe('parser', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('extractProjectName', () => {
    const home = process.env.HOME || os.homedir();
    const homePrefix = home.replace(/\//g, '-').replace(/^-/, '-');
    const projectsDir = path.join(home, '.claude', 'projects');

    it('extracts project name from path', () => {
      const filePath = path.join(projectsDir, `${homePrefix}-cursor-myproject`, 'abc.jsonl');
      const name = extractProjectName(filePath);
      expect(name).toBe('cursor/myproject');
    });

    it('returns home for empty prefix', () => {
      const filePath = path.join(projectsDir, `${homePrefix}`, 'abc.jsonl');
      const name = extractProjectName(filePath);
      expect(name).toBe('home');
    });
  });

  describe('parseSessionFile', () => {
    it('parses messages from JSONL', () => {
      const lines = [
        messageToJsonl({
          id: 'msg_test_1',
          timestamp: '2026-02-20T10:00:00.000Z',
          model: 'claude-opus-4-6',
          sessionId: 'sess-1',
          project: 'test',
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadTokens: 2000,
          cacheCreateTokens: 100,
          tools: ['Read'],
          stopReason: 'end_turn'
        }),
        messageToJsonl({
          id: 'msg_test_2',
          timestamp: '2026-02-20T10:01:00.000Z',
          model: 'claude-opus-4-6',
          sessionId: 'sess-1',
          project: 'test',
          inputTokens: 2000,
          outputTokens: 800,
          cacheReadTokens: 3000,
          cacheCreateTokens: 0,
          tools: ['Write', 'Bash'],
          stopReason: 'tool_use'
        })
      ];

      const filePath = path.join(tmpDir, 'test.jsonl');
      fs.writeFileSync(filePath, lines.join('\n') + '\n');

      const result = parseSessionFile(filePath);
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].id).toBe('msg_test_1');
      expect(result.messages[0].inputTokens).toBe(1000);
      expect(result.messages[1].tools).toContain('Write');
      expect(result.messages[1].tools).toContain('Bash');
    });

    it('deduplicates by message id (last write wins)', () => {
      const msg1v1 = messageToJsonl({
        id: 'msg_dup',
        timestamp: '2026-02-20T10:00:00.000Z',
        model: 'claude-opus-4-6',
        sessionId: 'sess-1',
        project: 'test',
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        tools: [],
        stopReason: null
      });

      const msg1v2 = messageToJsonl({
        id: 'msg_dup',
        timestamp: '2026-02-20T10:00:00.000Z',
        model: 'claude-opus-4-6',
        sessionId: 'sess-1',
        project: 'test',
        inputTokens: 500,
        outputTokens: 200,
        cacheReadTokens: 1000,
        cacheCreateTokens: 0,
        tools: ['Read'],
        stopReason: 'end_turn'
      });

      const filePath = path.join(tmpDir, 'dedup.jsonl');
      fs.writeFileSync(filePath, msg1v1 + '\n' + msg1v2 + '\n');

      const result = parseSessionFile(filePath);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].inputTokens).toBe(500);
      expect(result.messages[0].tools).toContain('Read');
    });

    it('merges tools across streaming updates', () => {
      const v1 = messageToJsonl({
        id: 'msg_merge',
        timestamp: '2026-02-20T10:00:00.000Z',
        model: 'claude-opus-4-6',
        sessionId: 'sess-1',
        project: 'test',
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        tools: ['Read'],
        stopReason: null
      });

      const v2 = messageToJsonl({
        id: 'msg_merge',
        timestamp: '2026-02-20T10:00:00.000Z',
        model: 'claude-opus-4-6',
        sessionId: 'sess-1',
        project: 'test',
        inputTokens: 500,
        outputTokens: 200,
        cacheReadTokens: 1000,
        cacheCreateTokens: 0,
        tools: ['Write'],
        stopReason: 'end_turn'
      });

      const filePath = path.join(tmpDir, 'merge.jsonl');
      fs.writeFileSync(filePath, v1 + '\n' + v2 + '\n');

      const result = parseSessionFile(filePath);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].tools).toContain('Read');
      expect(result.messages[0].tools).toContain('Write');
    });

    it('handles empty file', () => {
      const filePath = path.join(tmpDir, 'empty.jsonl');
      fs.writeFileSync(filePath, '');
      const result = parseSessionFile(filePath);
      expect(result.messages).toHaveLength(0);
    });

    it('skips invalid JSON lines', () => {
      const valid = messageToJsonl({
        id: 'msg_valid',
        timestamp: '2026-02-20T10:00:00.000Z',
        model: 'claude-opus-4-6',
        sessionId: 'sess-1',
        project: 'test',
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        tools: [],
        stopReason: 'end_turn'
      });

      const filePath = path.join(tmpDir, 'invalid.jsonl');
      fs.writeFileSync(filePath, 'not json\n' + valid + '\n{broken\n');

      const result = parseSessionFile(filePath);
      expect(result.messages).toHaveLength(1);
    });

    it('supports incremental parsing from offset', () => {
      const msg1 = messageToJsonl({
        id: 'msg_first',
        timestamp: '2026-02-20T10:00:00.000Z',
        model: 'claude-opus-4-6',
        sessionId: 'sess-1',
        project: 'test',
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        tools: [],
        stopReason: 'end_turn'
      });

      const msg2 = messageToJsonl({
        id: 'msg_second',
        timestamp: '2026-02-20T10:01:00.000Z',
        model: 'claude-opus-4-6',
        sessionId: 'sess-1',
        project: 'test',
        inputTokens: 200,
        outputTokens: 100,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        tools: [],
        stopReason: 'end_turn'
      });

      const filePath = path.join(tmpDir, 'incremental.jsonl');
      fs.writeFileSync(filePath, msg1 + '\n');

      const result1 = parseSessionFile(filePath);
      expect(result1.messages).toHaveLength(1);
      const offset = result1.newOffset;

      // Append second message
      fs.appendFileSync(filePath, msg2 + '\n');

      const result2 = parseSessionFile(filePath, offset);
      expect(result2.messages).toHaveLength(1);
      expect(result2.messages[0].id).toBe('msg_second');
    });

    it('includes id field in parsed messages', () => {
      const msg = messageToJsonl({
        id: 'msg_with_id',
        timestamp: '2026-02-20T10:00:00.000Z',
        model: 'claude-opus-4-6',
        sessionId: 'sess-1',
        project: 'test',
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        tools: [],
        stopReason: 'end_turn'
      });

      const filePath = path.join(tmpDir, 'withid.jsonl');
      fs.writeFileSync(filePath, msg + '\n');

      const result = parseSessionFile(filePath);
      expect(result.messages[0].id).toBe('msg_with_id');
    });
  });

  describe('rate-limit events', () => {
    const rlLine = (ts, sessionId) => JSON.stringify({
      type: 'queue-operation', content: '/rate-limit-options', timestamp: ts, sessionId
    });

    it('extracts rate-limit events and keeps them out of the messages', () => {
      const filePath = path.join(tmpDir, 'rl.jsonl');
      fs.writeFileSync(filePath, [
        rlLine('2026-02-20T10:00:00.000Z', 'sess-rl'),
        messageToJsonl({
          id: 'm1', timestamp: '2026-02-20T10:01:00.000Z', model: 'claude-opus-4-6',
          sessionId: 'sess-rl', project: 'test', inputTokens: 10, outputTokens: 5,
          cacheReadTokens: 0, cacheCreateTokens: 0, tools: [], stopReason: 'end_turn'
        }),
        rlLine('2026-02-20T11:00:00.000Z', 'sess-rl')
      ].join('\n') + '\n');

      const result = parseSessionFile(filePath);
      expect(result.messages).toHaveLength(1);
      expect(result.rateLimitEvents).toHaveLength(2);
      expect(result.rateLimitEvents[0].sessionId).toBe('sess-rl');
      expect(result.rateLimitEvents[0].timestamp).toBe('2026-02-20T10:00:00.000Z');
    });

    it('derives a stable id from session + timestamp (re-parse must not duplicate)', () => {
      const write = (name) => {
        const p = path.join(tmpDir, name);
        fs.writeFileSync(p, rlLine('2026-02-20T10:00:00.000Z', 'sess-rl') + '\n');
        return parseSessionFile(p).rateLimitEvents[0].id;
      };
      expect(write('a.jsonl')).toBe(write('b.jsonl'));
      // …but a different timestamp is a different event
      const p = path.join(tmpDir, 'c.jsonl');
      fs.writeFileSync(p, rlLine('2026-02-20T12:00:00.000Z', 'sess-rl') + '\n');
      expect(parseSessionFile(p).rateLimitEvents[0].id).not.toBe(write('a.jsonl'));
    });
  });

  describe('sub-agent detection', () => {
    const line = messageToJsonl({
      id: 'sub_1', timestamp: '2026-02-20T10:00:00.000Z', model: 'claude-opus-4-6',
      sessionId: 's', project: 'test', inputTokens: 1, outputTokens: 1,
      cacheReadTokens: 0, cacheCreateTokens: 0, tools: [], stopReason: 'end_turn'
    });

    it('flags messages from a /subagents/ path', () => {
      const dir = path.join(tmpDir, 'subagents');
      fs.mkdirSync(dir);
      const p = path.join(dir, 'x.jsonl');
      fs.writeFileSync(p, line + '\n');
      expect(parseSessionFile(p).messages[0].isSubagent).toBe(true);
    });

    it('does not flag regular session files', () => {
      const p = path.join(tmpDir, 'x.jsonl');
      fs.writeFileSync(p, line + '\n');
      expect(parseSessionFile(p).messages[0].isSubagent).toBe(false);
    });
  });

  describe('line counting from tool input', () => {
    it('counts Edit old/new strings and Write content', () => {
      const raw = JSON.stringify({
        type: 'assistant',
        timestamp: '2026-02-20T10:00:00.000Z',
        sessionId: 'sess-lines',
        message: {
          id: 'lines_1',
          model: 'claude-opus-4-6',
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [
            { type: 'tool_use', name: 'Edit', input: { old_string: 'a\nb', new_string: 'a\nb\nc\nd' } },
            { type: 'tool_use', name: 'Write', input: { content: 'x\ny\nz' } }
          ]
        }
      });
      const p = path.join(tmpDir, 'lines.jsonl');
      fs.writeFileSync(p, raw + '\n');

      const [msg] = parseSessionFile(p).messages;
      expect(msg.linesRemoved).toBe(2);
      expect(msg.linesAdded).toBe(4);
      expect(msg.linesWritten).toBe(3);
      expect(msg.toolCounts).toEqual({ Edit: 1, Write: 1 });
    });
  });

  describe('offsets', () => {
    it('reports the file size as the new offset and skips already-read bytes', () => {
      const p = path.join(tmpDir, 'off.jsonl');
      const first = messageToJsonl({
        id: 'o1', timestamp: '2026-02-20T10:00:00.000Z', model: 'claude-opus-4-6',
        sessionId: 's', project: 'test', inputTokens: 1, outputTokens: 1,
        cacheReadTokens: 0, cacheCreateTokens: 0, tools: [], stopReason: 'end_turn'
      }) + '\n';
      fs.writeFileSync(p, first);
      const r1 = parseSessionFile(p);
      expect(r1.newOffset).toBe(Buffer.byteLength(first));

      const second = messageToJsonl({
        id: 'o2', timestamp: '2026-02-20T10:05:00.000Z', model: 'claude-opus-4-6',
        sessionId: 's', project: 'test', inputTokens: 2, outputTokens: 2,
        cacheReadTokens: 0, cacheCreateTokens: 0, tools: [], stopReason: 'end_turn'
      }) + '\n';
      fs.appendFileSync(p, second);
      const r2 = parseSessionFile(p, r1.newOffset);
      expect(r2.messages.map(m => m.id)).toEqual(['o2']);
      expect(r2.newOffset).toBe(Buffer.byteLength(first) + Buffer.byteLength(second));
    });
  });
});
