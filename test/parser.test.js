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
});
