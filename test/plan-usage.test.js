const fs = require('fs');
const os = require('os');
const path = require('path');
const { _normalizeUsageResponse } = require('../lib/plan-usage');

describe('plan-usage', () => {
  describe('_normalizeUsageResponse', () => {
    // The claude.ai usage endpoint is unofficial and has shipped both casings.
    // Handling only one of them silently produces a dashboard full of nulls,
    // which looks exactly like "no data" — hence a test for each shape.
    it('reads the snake_case shape', () => {
      const r = _normalizeUsageResponse({
        current_session: { percent_used: 42, resets_in_seconds: 900, expires_at: '2026-08-30T12:00:00Z' },
        weekly_limits: {
          all_models: { percent_used: 61, resets_at: '2026-09-02T00:00:00Z' },
          sonnet_only: { percent_used: 12, resets_at: '2026-09-02T00:00:00Z' }
        }
      });
      expect(r.currentSession.percentUsed).toBe(42);
      expect(r.currentSession.resetsInSeconds).toBe(900);
      expect(r.weeklyAllModels.percentUsed).toBe(61);
      expect(r.weeklySonnet.percentUsed).toBe(12);
    });

    it('reads the camelCase shape identically', () => {
      const r = _normalizeUsageResponse({
        current_session: { percentUsed: 42, resetsInSeconds: 900, expiresAt: '2026-08-30T12:00:00Z' },
        weeklyLimits: {
          allModels: { percentUsed: 61, resetsAt: '2026-09-02T00:00:00Z' },
          sonnetOnly: { percentUsed: 12, resetsAt: '2026-09-02T00:00:00Z' }
        }
      });
      expect(r.currentSession.percentUsed).toBe(42);
      expect(r.weeklyAllModels.percentUsed).toBe(61);
      expect(r.weeklySonnet.percentUsed).toBe(12);
    });

    it('distinguishes a missing value from zero', () => {
      // `?? null` rather than `|| null`: 0% used is a real reading and must not
      // be reported as "unknown".
      const r = _normalizeUsageResponse({ current_session: { percent_used: 0 } });
      expect(r.currentSession.percentUsed).toBe(0);
      expect(r.currentSession.resetsInSeconds).toBeNull();
    });

    it('omits sections the response does not carry', () => {
      const r = _normalizeUsageResponse({ current_session: { percent_used: 5 } });
      expect(r.currentSession).toBeDefined();
      expect(r.weeklyAllModels).toBeUndefined();
      expect(r.weeklySonnet).toBeUndefined();
    });

    it('produces the exact field names the frontend reads', () => {
      // The dashboard reads pu.currentSession / pu.weeklyAllModels /
      // pu.weeklySonnet. A rename here shows up as three empty progress bars,
      // not as an error — so the contract is pinned rather than assumed.
      const r = _normalizeUsageResponse({
        current_session: { percent_used: 1 },
        weekly_limits: { all_models: { percent_used: 2 }, sonnet_only: { percent_used: 3 } }
      });
      expect(Object.keys(r).sort()).toEqual(['currentSession', 'weeklyAllModels', 'weeklySonnet']);
    });

    it('matches the sync agent\'s own copy of the normaliser', () => {
      // sync-agent/index.js carries its own inline normaliser (it must not
      // import from the server). If the two drift, a hosted account silently
      // gets a different payload shape than a local one.
      const fsx = require('fs');
      const pathx = require('path');
      const agent = fsx.readFileSync(pathx.join(__dirname, '..', 'sync-agent', 'index.js'), 'utf8');
      for (const field of ['currentSession', 'weeklyAllModels', 'weeklySonnet']) {
        expect(agent).toContain(field);
      }
      for (const alias of ['percent_used', 'percentUsed', 'resets_at', 'resetsAt']) {
        expect(agent).toContain(alias);
      }
    });

    it('survives an empty payload', () => {
      expect(() => _normalizeUsageResponse({})).not.toThrow();
      expect(_normalizeUsageResponse({})).toEqual({});
    });
  });

  describe('token storage', () => {
    let tmpDir, planUsage, db;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-plan-test-'));
      process.env.DB_PATH = path.join(tmpDir, 'test.db');
      process.env.SESSION_SECRET = 'test-secret-for-plan-usage';
      for (const m of ['../lib/config', '../lib/db', '../lib/plan-usage', '../lib/anthropic-api']) {
        delete require.cache[require.resolve(m)];
      }
      db = require('../lib/db');
      db.initDB();
      planUsage = require('../lib/plan-usage');
      planUsage.initPlanUsage(db);
    });

    afterEach(() => {
      try { db.closeDB(); } catch { /* already closed */ }
      delete process.env.DB_PATH;
      delete process.env.SESSION_SECRET;
      for (const m of ['../lib/config', '../lib/db', '../lib/plan-usage', '../lib/anthropic-api']) {
        delete require.cache[require.resolve(m)];
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('stores a synced payload and serves it back', () => {
      planUsage.storeSyncedPlanUsage(0, { currentSession: { percentUsed: 33 } });
      const raw = db.getMetadata('plan_usage_0');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw).currentSession.percentUsed).toBe(33);
    });

    it('stamps fetchedAt when the sync agent did not', () => {
      // Without a timestamp the frontend cannot tell fresh data from a week-old
      // reading, and the cache-age logic divides by NaN.
      planUsage.storeSyncedPlanUsage(0, { currentSession: { percentUsed: 10 } });
      const stored = JSON.parse(db.getMetadata('plan_usage_0'));
      expect(stored.fetchedAt).toBeTruthy();
      expect(Number.isNaN(Date.parse(stored.fetchedAt))).toBe(false);
    });

    it('ignores an empty payload instead of writing null', () => {
      planUsage.storeSyncedPlanUsage(0, null);
      expect(db.getMetadata('plan_usage_0')).toBeFalsy();
    });
  });
});
