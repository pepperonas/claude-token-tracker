const http = require('http');

// We test the API by making HTTP requests to the server
// The server needs to be running, so we import it

let baseUrl;
let serverInstance;

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(baseUrl + path, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

function post(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(baseUrl + path, { method: 'POST' }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('API endpoints', () => {
  beforeAll(async () => {
    // Use dynamic port to avoid conflicts
    const port = 5010 + Math.floor(Math.random() * 1000);
    baseUrl = `http://localhost:${port}`;

    const { startServer } = require('../server');
    serverInstance = await startServer(port);
  });

  afterAll(() => {
    if (serverInstance) serverInstance.close();
  });

  it('GET /api/overview returns overview data', async () => {
    const { status, body } = await get('/api/overview');
    expect(status).toBe(200);
    expect(body).toHaveProperty('totalTokens');
    expect(body).toHaveProperty('estimatedCost');
    expect(body).toHaveProperty('sessions');
    expect(body).toHaveProperty('messages');
  });

  it('GET /api/overview supports date filtering', async () => {
    const { status, body } = await get('/api/overview?from=2026-02-20&to=2026-02-22');
    expect(status).toBe(200);
    expect(typeof body.totalTokens).toBe('number');
  });

  it('GET /api/daily returns daily data', async () => {
    const { status, body } = await get('/api/daily');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/daily-by-model returns model breakdown', async () => {
    const { status, body } = await get('/api/daily-by-model');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/sessions returns sessions', async () => {
    const { status, body } = await get('/api/sessions');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/projects returns projects', async () => {
    const { status, body } = await get('/api/projects');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/models returns models', async () => {
    const { status, body } = await get('/api/models');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/tools returns tools', async () => {
    const { status, body } = await get('/api/tools');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/hourly returns 24 hours', async () => {
    const { status, body } = await get('/api/hourly');
    expect(status).toBe(200);
    expect(body).toHaveLength(24);
  });

  // Insights endpoints
  it('GET /api/stop-reasons returns stop reason data', async () => {
    const { status, body } = await get('/api/stop-reasons');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/day-of-week returns 7 days', async () => {
    const { status, body } = await get('/api/day-of-week');
    expect(status).toBe(200);
    expect(body).toHaveLength(7);
  });

  it('GET /api/cache-efficiency returns efficiency data', async () => {
    const { status, body } = await get('/api/cache-efficiency');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/cumulative-cost returns cumulative data', async () => {
    const { status, body } = await get('/api/cumulative-cost');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/daily-cost-breakdown returns breakdown', async () => {
    const { status, body } = await get('/api/daily-cost-breakdown');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/session-efficiency returns efficiency', async () => {
    const { status, body } = await get('/api/session-efficiency');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/session/:id returns 404 for unknown session', async () => {
    const { status, body } = await get('/api/session/nonexistent-session-id');
    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('POST /api/rebuild rebuilds data', { timeout: 30000 }, async () => {
    const { status, body } = await post('/api/rebuild');
    expect(status).toBe(200);
    expect(body.rebuilt).toBe(true);
    expect(typeof body.messages).toBe('number');
  });

  it('GET /api/productivity returns productivity metrics', async () => {
    const { status, body } = await get('/api/productivity');
    expect(status).toBe(200);
    expect(body).toHaveProperty('tokensPerMin');
    expect(body).toHaveProperty('linesPerHour');
    expect(body).toHaveProperty('msgsPerSession');
    expect(body).toHaveProperty('costPerLine');
    expect(body).toHaveProperty('cacheSavings');
    expect(body).toHaveProperty('codeRatio');
    expect(body).toHaveProperty('codingHours');
    expect(body).toHaveProperty('totalLines');
    expect(body).toHaveProperty('trends');
    expect(body).toHaveProperty('dailyProductivity');
    expect(body).toHaveProperty('stopReasons');
    expect(Array.isArray(body.dailyProductivity)).toBe(true);
    expect(Array.isArray(body.stopReasons)).toBe(true);
  });

  it('GET /api/productivity supports date filtering', async () => {
    const { status, body } = await get('/api/productivity?from=2026-02-20&to=2026-02-22');
    expect(status).toBe(200);
    expect(typeof body.tokensPerMin).toBe('number');
    expect(typeof body.linesPerHour).toBe('number');
  });

  it('GET /api/export-html returns HTML document', async () => {
    const res = await new Promise((resolve, reject) => {
      http.get(baseUrl + '/api/export-html', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
      }).on('error', reject);
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<!DOCTYPE html>');
    expect(res.body).toContain('Claude Token Tracker');
  });

  it('prevents path traversal on static files', async () => {
    const { status } = await get('/../package.json');
    // Should either return 403 or a regular 404 (path normalization)
    expect([403, 404]).toContain(status);
  });
});
