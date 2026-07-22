const fs = require('fs');
const os = require('os');
const path = require('path');

// The watcher had two silent-failure modes worth guarding: a dotfile *regex*
// for chokidar's `ignored` matched `.claude` inside the watched path and
// dropped every event, and SSE fan-out has to survive dead clients. Events are
// synthesized (`emit`) instead of waiting for real filesystem notifications, so
// these tests are deterministic and fast on CI.

describe('watcher', () => {
  let tmpDir, projectsDir, Watcher, agg, parseState, updates;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-watcher-test-'));
    projectsDir = path.join(tmpDir, 'claude', 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });
    process.env.CLAUDE_DIR = path.join(tmpDir, 'claude');
    for (const m of ['../lib/config', '../lib/watcher']) delete require.cache[require.resolve(m)];
    Watcher = require('../lib/watcher');

    const Aggregator = require('../lib/aggregator');
    agg = new Aggregator();
    parseState = {};
    updates = [];
  });

  afterEach(() => {
    delete process.env.CLAUDE_DIR;
    for (const m of ['../lib/config', '../lib/watcher']) delete require.cache[require.resolve(m)];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const startWatcher = () => {
    const w = new Watcher(agg, parseState, (msgs, rl) => updates.push({ msgs, rl }));
    w.start();
    return w;
  };

  const writeSession = (name, entries) => {
    const file = path.join(projectsDir, name);
    fs.writeFileSync(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
    return file;
  };

  const assistantEntry = (id, ts, tokens = 100) => ({
    type: 'assistant',
    timestamp: ts,
    sessionId: 'sess-w',
    message: {
      id, model: 'claude-opus-4-8', stop_reason: 'end_turn',
      usage: { input_tokens: tokens, output_tokens: tokens },
      content: [{ type: 'tool_use', name: 'Read', input: {} }]
    }
  });

  describe('ignored predicate', () => {
    it('does not ignore paths containing a .claude segment', () => {
      const w = startWatcher();
      // Chokidar 4 normalizes `ignored` into an array of matchers
      const ignored = [].concat(w.watcher.options.ignored).find(x => typeof x === 'function');
      expect(ignored('/home/me/.claude/projects/app/session.jsonl')).toBe(false);
      expect(ignored('/home/me/.claude')).toBe(false);
      w.stop();
    });

    it('ignores other dotfiles and sub-agent transcripts', () => {
      const w = startWatcher();
      const ignored = [].concat(w.watcher.options.ignored).find(x => typeof x === 'function');
      expect(ignored('/home/me/.claude/projects/.DS_Store')).toBe(true);
      expect(ignored('/home/me/.claude/projects/app/subagents/x.jsonl')).toBe(true);
      w.stop();
    });
  });

  describe('file events', () => {
    it('parses a new session file and feeds the aggregator', () => {
      const w = startWatcher();
      const file = writeSession('new.jsonl', [assistantEntry('w1', '2026-02-20T10:00:00.000Z')]);
      w.watcher.emit('add', file);

      expect(agg.messageCount).toBe(1);
      expect(agg.hasMessage('w1')).toBe(true);
      expect(updates).toHaveLength(1);
      w.stop();
    });

    it('picks up only the appended bytes on change (incremental offsets)', () => {
      const w = startWatcher();
      const file = writeSession('inc.jsonl', [assistantEntry('i1', '2026-02-20T10:00:00.000Z')]);
      w.watcher.emit('add', file);
      expect(agg.messageCount).toBe(1);

      fs.appendFileSync(file, JSON.stringify(assistantEntry('i2', '2026-02-20T10:05:00.000Z')) + '\n');
      w.watcher.emit('change', file);

      expect(agg.messageCount).toBe(2);
      expect(updates).toHaveLength(2);
      expect(updates[1].msgs.map(m => m.id)).toEqual(['i2']);
      w.stop();
    });

    it('ignores non-JSONL files and sub-agent paths', () => {
      const w = startWatcher();
      const txt = path.join(projectsDir, 'notes.txt');
      fs.writeFileSync(txt, 'hello');
      w.watcher.emit('add', txt);
      w.watcher.emit('change', txt);

      const subDir = path.join(projectsDir, 'subagents');
      fs.mkdirSync(subDir);
      const sub = writeSession(path.join('subagents', 'a.jsonl'), [assistantEntry('s1', '2026-02-20T10:00:00.000Z')]);
      w.watcher.emit('add', sub);

      expect(agg.messageCount).toBe(0);
      expect(updates).toHaveLength(0);
      w.stop();
    });

    it('survives a corrupt file instead of crashing the watcher', () => {
      const w = startWatcher();
      const file = path.join(projectsDir, 'broken.jsonl');
      fs.writeFileSync(file, '{not json\n');
      expect(() => w.watcher.emit('add', file)).not.toThrow();
      expect(agg.messageCount).toBe(0);
      w.stop();
    });

    it('forwards rate-limit events without any token messages', () => {
      const w = startWatcher();
      const file = writeSession('rl.jsonl', [
        { type: 'queue-operation', content: '/rate-limit-options', timestamp: '2026-02-20T10:00:00.000Z', sessionId: 'sess-w' }
      ]);
      w.watcher.emit('add', file);

      expect(agg.messageCount).toBe(0);
      expect(updates).toHaveLength(1);
      expect(updates[0].rl).toHaveLength(1);
      expect(agg.getRateLimits().total).toBe(1);
      w.stop();
    });
  });

  describe('SSE fan-out', () => {
    const fakeClient = (opts = {}) => {
      const written = [];
      const handlers = {};
      return {
        written,
        _userId: opts.userId,
        write: opts.throws ? () => { throw new Error('socket closed'); } : (p) => written.push(p),
        on: (evt, fn) => { handlers[evt] = fn; },
        fire: (evt) => handlers[evt] && handlers[evt]()
      };
    };

    it('broadcasts to every connected client as SSE frames', () => {
      const w = new Watcher(agg, parseState, null);
      const a = fakeClient(), b = fakeClient();
      w.addSSEClient(a); w.addSSEClient(b);

      w.broadcast({ type: 'update', count: 3 });
      expect(a.written[0]).toBe('data: {"type":"update","count":3}\n\n');
      expect(b.written).toHaveLength(1);
    });

    it('only reaches the targeted user when the payload carries a userId', () => {
      const w = new Watcher(agg, parseState, null);
      const mine = fakeClient({ userId: 7 });
      const other = fakeClient({ userId: 8 });
      const anonymous = fakeClient();
      [mine, other, anonymous].forEach(c => w.addSSEClient(c));

      w.broadcast({ type: 'update', userId: 7 });
      expect(mine.written).toHaveLength(1);
      expect(other.written).toHaveLength(0);
      expect(anonymous.written).toHaveLength(1);   // untagged clients still get it
    });

    it('drops clients whose socket is gone', () => {
      const w = new Watcher(agg, parseState, null);
      const dead = fakeClient({ throws: true });
      const alive = fakeClient();
      w.addSSEClient(dead); w.addSSEClient(alive);

      w.broadcast({ type: 'update' });
      expect(w.sseClients.has(dead)).toBe(false);
      expect(w.sseClients.has(alive)).toBe(true);
      expect(alive.written).toHaveLength(1);
    });

    it('unregisters a client when its response closes', () => {
      const w = new Watcher(agg, parseState, null);
      const c = fakeClient();
      w.addSSEClient(c);
      expect(w.sseClients.size).toBe(1);
      c.fire('close');
      expect(w.sseClients.size).toBe(0);
    });
  });
});
