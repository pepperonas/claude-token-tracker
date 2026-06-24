const path = require('path');
const fs = require('fs');
const os = require('os');
const Aggregator = require('../lib/aggregator');

// Helper to build a minimal valid message.
function msg(id, project, sessionId, over = {}) {
  return {
    id,
    timestamp: '2026-03-01T10:00:00.000Z',
    model: 'claude-opus-4-6',
    sessionId,
    project,
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 2000,
    cacheCreateTokens: 0,
    tools: ['Read'],
    stopReason: 'end_turn',
    ...over
  };
}

describe('project merge — aggregator folding', () => {
  it('folds an aliased project into its canonical name in getProjects', () => {
    const agg = new Aggregator();
    agg.setProjectAliases({ 'claude/foo-old': 'claude/foo' });
    agg.addMessages([
      msg('m1', 'claude/foo', 's1'),
      msg('m2', 'claude/foo-old', 's2'),
      msg('m3', 'other/thing', 's3')
    ]);

    const projects = agg.getProjects();
    const names = projects.map(p => p.name);
    expect(names).toContain('claude/foo');
    expect(names).not.toContain('claude/foo-old'); // merged away
    expect(names).toContain('other/thing');

    const foo = projects.find(p => p.name === 'claude/foo');
    expect(foo.messages).toBe(2);   // m1 + m2 combined
    expect(foo.sessions).toBe(2);   // s1 + s2
  });

  it('resolves a request for the merged-away name to the canonical data (shares)', () => {
    const agg = new Aggregator();
    agg.setProjectAliases({ 'claude/foo-old': 'claude/foo' });
    agg.addMessages([
      msg('m1', 'claude/foo', 's1'),
      msg('m2', 'claude/foo-old', 's2')
    ]);

    // A share/detail request for the OLD name must return the canonical project's data.
    const viaOld = agg.getProjectDetail('claude/foo-old');
    const viaNew = agg.getProjectDetail('claude/foo');
    expect(viaOld.messages).toBe(2);
    expect(viaOld.messages).toBe(viaNew.messages);
    expect(viaOld.sessions).toBe(viaNew.sessions);
  });

  it('reassigns sessions to the canonical project', () => {
    const agg = new Aggregator();
    agg.setProjectAliases({ 'a/old': 'a/new' });
    agg.addMessages([msg('m1', 'a/old', 's1')]);
    const sessions = agg.getSessions('a/new');
    expect(sessions.length).toBe(1);
    expect(sessions[0].project).toBe('a/new');
    // querying by the old name also resolves
    expect(agg.getSessions('a/old').length).toBe(1);
  });

  it('un-merge (no alias) keeps the projects separate', () => {
    const agg = new Aggregator();
    agg.addMessages([
      msg('m1', 'claude/foo', 's1'),
      msg('m2', 'claude/foo-old', 's2')
    ]);
    const names = agg.getProjects().map(p => p.name);
    expect(names).toContain('claude/foo');
    expect(names).toContain('claude/foo-old');
  });

  it('follows alias chains (A→B→C) when set as a flattened map', () => {
    const agg = new Aggregator();
    agg.setProjectAliases({ 'p/a': 'p/c', 'p/b': 'p/c' });
    agg.addMessages([
      msg('m1', 'p/a', 's1'),
      msg('m2', 'p/b', 's2'),
      msg('m3', 'p/c', 's3')
    ]);
    const projects = agg.getProjects();
    expect(projects.map(p => p.name)).toEqual(['p/c']);
    expect(projects[0].messages).toBe(3);
  });

  it('does not clear the alias map on reset()', () => {
    const agg = new Aggregator();
    agg.setProjectAliases({ 'x/old': 'x/new' });
    agg.reset();
    expect(agg.resolveProject('x/old')).toBe('x/new');
  });
});

describe('project merge — db alias map', () => {
  let tmpDir, db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-merge-test-'));
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/db')];
    db = require('../lib/db');
    db.initDB(path.join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.closeDB();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/db')];
  });

  it('stores and returns a flattened alias map', () => {
    db.createProjectAlias(0, 'a/old', 'a/new');
    expect(db.getProjectAliasMap(0)).toEqual({ 'a/old': 'a/new' });
  });

  it('flattens chains A→B, B→C to terminal C', () => {
    db.createProjectAlias(0, 'A', 'B');
    db.createProjectAlias(0, 'B', 'C');
    expect(db.getProjectAliasMap(0)).toEqual({ A: 'C', B: 'C' });
  });

  it('drops self-mapping aliases', () => {
    db.createProjectAlias(0, 'same', 'same');
    expect(db.getProjectAliasMap(0)).toEqual({});
  });

  it('neutralizes cycles (A→B, B→A) to no-op without hanging', () => {
    db.createProjectAlias(0, 'A', 'B');
    db.createProjectAlias(0, 'B', 'A');
    // Each entry resolves back to itself through the cycle and is dropped, so the
    // map is empty — a full cycle cancels out rather than hanging or double-folding.
    expect(db.getProjectAliasMap(0)).toEqual({});
  });

  it('scopes aliases per user', () => {
    db.createProjectAlias(0, 'a/old', 'a/new');
    db.createProjectAlias(5, 'b/old', 'b/new');
    expect(db.getProjectAliasMap(0)).toEqual({ 'a/old': 'a/new' });
    expect(db.getProjectAliasMap(5)).toEqual({ 'b/old': 'b/new' });
    // The global (admin) map merges across users.
    expect(db.getAllProjectAliasMap()).toEqual({ 'a/old': 'a/new', 'b/old': 'b/new' });
  });

  it('lists alias rows with metadata and supports deletion (un-merge)', () => {
    db.createProjectAlias(0, 'a/old', 'a/new');
    const rows = db.getProjectAliasRows(0);
    expect(rows.length).toBe(1);
    expect(rows[0].alias).toBe('a/old');
    expect(rows[0].canonical).toBe('a/new');
    expect(rows[0]).toHaveProperty('created_at');

    db.deleteProjectAlias(0, 'a/old');
    expect(db.getProjectAliasMap(0)).toEqual({});
  });

  it('re-merging the same source replaces the prior canonical (INSERT OR REPLACE)', () => {
    db.createProjectAlias(0, 'a/old', 'a/new');
    db.createProjectAlias(0, 'a/old', 'a/other');
    expect(db.getProjectAliasMap(0)).toEqual({ 'a/old': 'a/other' });
  });
});
