const path = require('path');

// config.js resolves everything from process.env at require time. We snapshot and
// restore the relevant vars, and re-require the module fresh for each scenario.
const CONFIG_ENV_KEYS = [
  'HOME', 'CLAUDE_DIR', 'PORT', 'BACKUP_PATH', 'BACKUP_INTERVAL_HOURS',
  'MULTI_USER', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'SESSION_SECRET',
  'BASE_URL', 'GITHUB_TOKEN', 'GITHUB_CACHE_TTL_MINUTES', 'SHARE_ADMIN_KEY',
  'DATA_DIR', 'DB_PATH'
];

function loadConfig(overrides = {}) {
  for (const k of CONFIG_ENV_KEYS) delete process.env[k];
  Object.assign(process.env, overrides);
  delete require.cache[require.resolve('../lib/config')];
  return require('../lib/config');
}

describe('config', () => {
  const saved = {};

  beforeEach(() => {
    for (const k of CONFIG_ENV_KEYS) saved[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of CONFIG_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
    delete require.cache[require.resolve('../lib/config')];
  });

  describe('database location', () => {
    it('defaults the DB into the repo data/ directory', () => {
      const cfg = loadConfig({});
      expect(cfg.DATA_DIR).toBe(path.join(__dirname, '..', 'data'));
      expect(cfg.DB_PATH).toBe(path.join(cfg.DATA_DIR, 'tracker.db'));
    });

    it('follows DATA_DIR for the default DB file', () => {
      const cfg = loadConfig({ DATA_DIR: '/tmp/tracker-data' });
      expect(cfg.DATA_DIR).toBe(path.resolve('/tmp/tracker-data'));
      expect(cfg.DB_PATH).toBe(path.join(path.resolve('/tmp/tracker-data'), 'tracker.db'));
    });

    it('lets DB_PATH override the file outright (tests boot on a throwaway DB)', () => {
      const cfg = loadConfig({ DATA_DIR: '/tmp/tracker-data', DB_PATH: '/tmp/other/x.db' });
      expect(cfg.DB_PATH).toBe(path.resolve('/tmp/other/x.db'));
    });

    it('resolves relative paths against the working directory', () => {
      const cfg = loadConfig({ DB_PATH: 'tmp/rel.db' });
      expect(path.isAbsolute(cfg.DB_PATH)).toBe(true);
      expect(cfg.DB_PATH).toBe(path.resolve('tmp/rel.db'));
    });
  });

  describe('defaults', () => {
    it('defaults PORT to 5010 when unset or unparseable', () => {
      expect(loadConfig({}).PORT).toBe(5010);
      expect(loadConfig({ PORT: 'not-a-number' }).PORT).toBe(5010);
    });

    it('defaults MULTI_USER to false unless exactly the string "true"', () => {
      expect(loadConfig({}).MULTI_USER).toBe(false);
      expect(loadConfig({ MULTI_USER: 'false' }).MULTI_USER).toBe(false);
      expect(loadConfig({ MULTI_USER: '1' }).MULTI_USER).toBe(false);
      expect(loadConfig({ MULTI_USER: 'TRUE' }).MULTI_USER).toBe(false);
      expect(loadConfig({ MULTI_USER: 'true' }).MULTI_USER).toBe(true);
    });

    it('defaults GITHUB_CACHE_TTL_MINUTES to 15', () => {
      expect(loadConfig({}).GITHUB_CACHE_TTL_MINUTES).toBe(15);
      expect(loadConfig({ GITHUB_CACHE_TTL_MINUTES: '120' }).GITHUB_CACHE_TTL_MINUTES).toBe(120);
    });

    it('defaults BACKUP_INTERVAL_HOURS to 6', () => {
      expect(loadConfig({}).BACKUP_INTERVAL_HOURS).toBe(6);
      expect(loadConfig({ BACKUP_INTERVAL_HOURS: '24' }).BACKUP_INTERVAL_HOURS).toBe(24);
    });

    it('defaults string secrets to empty string', () => {
      const cfg = loadConfig({});
      expect(cfg.GITHUB_CLIENT_ID).toBe('');
      expect(cfg.GITHUB_CLIENT_SECRET).toBe('');
      expect(cfg.SESSION_SECRET).toBe('');
      expect(cfg.GITHUB_TOKEN).toBe('');
      expect(cfg.SHARE_ADMIN_KEY).toBe('');
      expect(cfg.BACKUP_PATH).toBe('');
    });
  });

  describe('BASE_URL', () => {
    it('defaults to localhost with the resolved port', () => {
      expect(loadConfig({ PORT: '7777' }).BASE_URL).toBe('http://localhost:7777');
    });

    it('honours an explicit BASE_URL', () => {
      expect(loadConfig({ BASE_URL: 'https://tracker.celox.io' }).BASE_URL).toBe('https://tracker.celox.io');
    });
  });

  describe('directory resolution', () => {
    it('derives CLAUDE_DIR from HOME by default and PROJECTS_DIR beneath it', () => {
      const cfg = loadConfig({ HOME: '/home/tester' });
      expect(cfg.CLAUDE_DIR).toBe(path.join('/home/tester', '.claude'));
      expect(cfg.PROJECTS_DIR).toBe(path.join('/home/tester', '.claude', 'projects'));
      expect(cfg.STATS_CACHE_FILE).toBe(path.join('/home/tester', '.claude', 'stats-cache.json'));
    });

    it('honours an explicit CLAUDE_DIR (resolved to absolute)', () => {
      const cfg = loadConfig({ CLAUDE_DIR: '/custom/claude' });
      expect(cfg.CLAUDE_DIR).toBe('/custom/claude');
      expect(cfg.PROJECTS_DIR).toBe(path.join('/custom/claude', 'projects'));
    });

    it('places the DB inside the project data dir', () => {
      const cfg = loadConfig({});
      expect(cfg.DB_PATH).toBe(path.join(cfg.DATA_DIR, 'tracker.db'));
      expect(cfg.DATA_DIR.endsWith(path.join('token-tracker', 'data'))
        || cfg.DATA_DIR.endsWith(`${path.sep}data`)).toBe(true);
    });
  });
});
