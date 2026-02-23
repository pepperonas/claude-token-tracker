/**
 * Realistic test data for Claude Token Tracker tests
 */

const SAMPLE_MESSAGES = [
  {
    id: 'msg_001',
    timestamp: '2026-02-20T10:00:00.000Z',
    model: 'claude-opus-4-6',
    sessionId: 'session-aaa',
    project: 'token/tracker',
    inputTokens: 5000,
    outputTokens: 1500,
    cacheReadTokens: 20000,
    cacheCreateTokens: 3000,
    tools: ['Read', 'Write'],
    stopReason: 'end_turn'
  },
  {
    id: 'msg_002',
    timestamp: '2026-02-20T10:05:00.000Z',
    model: 'claude-opus-4-6',
    sessionId: 'session-aaa',
    project: 'token/tracker',
    inputTokens: 8000,
    outputTokens: 2000,
    cacheReadTokens: 25000,
    cacheCreateTokens: 0,
    tools: ['Bash', 'Read'],
    stopReason: 'tool_use'
  },
  {
    id: 'msg_003',
    timestamp: '2026-02-20T14:00:00.000Z',
    model: 'claude-sonnet-4-5-20250929',
    sessionId: 'session-bbb',
    project: 'claude/remote',
    inputTokens: 3000,
    outputTokens: 800,
    cacheReadTokens: 10000,
    cacheCreateTokens: 2000,
    tools: ['Grep'],
    stopReason: 'end_turn'
  },
  {
    id: 'msg_004',
    timestamp: '2026-02-21T09:00:00.000Z',
    model: 'claude-haiku-4-5-20251001',
    sessionId: 'session-ccc',
    project: 'home',
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 5000,
    cacheCreateTokens: 0,
    tools: [],
    stopReason: 'end_turn'
  },
  {
    id: 'msg_005',
    timestamp: '2026-02-21T09:02:00.000Z',
    model: 'claude-haiku-4-5-20251001',
    sessionId: 'session-ccc',
    project: 'home',
    inputTokens: 1200,
    outputTokens: 600,
    cacheReadTokens: 6000,
    cacheCreateTokens: 500,
    tools: ['Read'],
    stopReason: 'end_turn'
  },
  {
    id: 'msg_006',
    timestamp: '2026-02-21T15:00:00.000Z',
    model: 'claude-opus-4-6',
    sessionId: 'session-ddd',
    project: 'token/tracker',
    inputTokens: 10000,
    outputTokens: 4000,
    cacheReadTokens: 30000,
    cacheCreateTokens: 5000,
    tools: ['Write', 'Bash', 'Read'],
    stopReason: 'tool_use'
  },
  {
    id: 'msg_007',
    timestamp: '2026-02-22T08:30:00.000Z',
    model: 'claude-sonnet-4-5-20250929',
    sessionId: 'session-eee',
    project: 'claude/remote',
    inputTokens: 4000,
    outputTokens: 1200,
    cacheReadTokens: 15000,
    cacheCreateTokens: 1500,
    tools: ['Grep', 'Read'],
    stopReason: 'end_turn'
  },
  {
    id: 'msg_008',
    timestamp: '2026-02-22T10:00:00.000Z',
    model: 'claude-opus-4-6',
    sessionId: 'session-fff',
    project: 'token/tracker',
    inputTokens: 12000,
    outputTokens: 5000,
    cacheReadTokens: 40000,
    cacheCreateTokens: 8000,
    tools: ['Write', 'Edit', 'Bash'],
    stopReason: 'end_turn'
  },
  {
    id: 'msg_009',
    timestamp: '2026-02-22T10:15:00.000Z',
    model: 'claude-opus-4-6',
    sessionId: 'session-fff',
    project: 'token/tracker',
    inputTokens: 15000,
    outputTokens: 3000,
    cacheReadTokens: 50000,
    cacheCreateTokens: 0,
    tools: ['Read'],
    stopReason: 'max_tokens'
  },
  {
    id: 'msg_010',
    timestamp: '2026-02-22T16:00:00.000Z',
    model: 'claude-3-7-sonnet-20250219',
    sessionId: 'session-ggg',
    project: 'home',
    inputTokens: 2000,
    outputTokens: 700,
    cacheReadTokens: 8000,
    cacheCreateTokens: 1000,
    tools: ['Bash'],
    stopReason: 'end_turn'
  }
];

/**
 * Create a JSONL line from a message object (mimics real Claude session files)
 */
function messageToJsonl(msg) {
  return JSON.stringify({
    type: 'assistant',
    sessionId: msg.sessionId,
    timestamp: msg.timestamp,
    uuid: 'uuid-' + msg.id,
    message: {
      id: msg.id,
      model: msg.model,
      stop_reason: msg.stopReason,
      usage: {
        input_tokens: msg.inputTokens,
        output_tokens: msg.outputTokens,
        cache_read_input_tokens: msg.cacheReadTokens,
        cache_creation_input_tokens: msg.cacheCreateTokens
      },
      content: msg.tools.map(name => ({ type: 'tool_use', name }))
    }
  });
}

module.exports = { SAMPLE_MESSAGES, messageToJsonl };
