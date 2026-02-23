const https = require('https');
const { MULTI_USER, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, BASE_URL } = require('./config');
const {
  createUser, findUserByApiKey, findUserById,
  updateLastLogin, createSession, getSession, deleteSession
} = require('./db');

const DUMMY_USER = { id: 0, username: 'local', display_name: 'Local User', avatar_url: '' };

/**
 * Parse session token from cookie header
 */
function parseSessionCookie(req) {
  const header = req.headers.cookie || '';
  const match = header.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Authenticate a request — returns user object or null
 * In single-user mode, always returns DUMMY_USER
 */
function authenticateRequest(req) {
  if (!MULTI_USER) return DUMMY_USER;

  const token = parseSessionCookie(req);
  if (!token) return null;

  const session = getSession(token);
  if (!session) return null;

  return findUserById(session.user_id);
}

/**
 * Authenticate via API key (for sync agent)
 * Returns user object or null
 */
function authenticateApiKey(req) {
  if (!MULTI_USER) return DUMMY_USER;

  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match) return null;

  return findUserByApiKey(match[1]);
}

/**
 * Make HTTPS request (returns Promise)
 */
function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

/**
 * Handle GitHub OAuth routes
 * Returns true if the route was handled, false otherwise
 */
function handleAuthRoute(req, res, pathname, sendJSON) {
  // GET /auth/github — redirect to GitHub
  if (pathname === '/auth/github' && req.method === 'GET') {
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: BASE_URL + '/auth/github/callback',
      scope: 'read:user'
    });
    res.writeHead(302, { Location: 'https://github.com/login/oauth/authorize?' + params.toString() });
    res.end();
    return true;
  }

  // GET /auth/github/callback — exchange code for token
  if (pathname === '/auth/github/callback' && req.method === 'GET') {
    const url = new URL(req.url, BASE_URL);
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400);
      res.end('Missing code parameter');
      return true;
    }

    // Exchange code for access token
    const tokenBody = JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code
    });

    httpsRequest({
      hostname: 'github.com',
      path: '/login/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(tokenBody),
        'User-Agent': 'claude-token-tracker'
      }
    }, tokenBody).then(tokenRes => {
      const accessToken = tokenRes.data.access_token;
      if (!accessToken) {
        res.writeHead(401);
        res.end('Failed to get access token');
        return;
      }

      // Get user info
      return httpsRequest({
        hostname: 'api.github.com',
        path: '/user',
        method: 'GET',
        headers: {
          'Authorization': 'token ' + accessToken,
          'Accept': 'application/json',
          'User-Agent': 'claude-token-tracker'
        }
      }).then(userRes => {
        const ghUser = userRes.data;
        if (!ghUser.id) {
          res.writeHead(401);
          res.end('Failed to get user info');
          return;
        }

        // Create or update user in DB
        const user = createUser({
          githubId: String(ghUser.id),
          username: ghUser.login,
          displayName: ghUser.name || ghUser.login,
          avatarUrl: ghUser.avatar_url
        });

        updateLastLogin(user.id);

        // Create session
        const session = createSession(user.id);

        // Set cookie and redirect
        res.writeHead(302, {
          'Set-Cookie': `session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
          'Location': '/'
        });
        res.end();
      });
    }).catch(err => {
      console.error('OAuth error:', err.message);
      res.writeHead(500);
      res.end('Authentication failed');
    });

    return true;
  }

  // GET /auth/me — return current user
  if (pathname === '/auth/me' && req.method === 'GET') {
    const user = authenticateRequest(req);
    if (!user) {
      sendJSON(res, { authenticated: false }, 200);
      return true;
    }
    sendJSON(res, {
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url
      }
    }, 200);
    return true;
  }

  // POST /auth/logout
  if (pathname === '/auth/logout' && req.method === 'POST') {
    const token = parseSessionCookie(req);
    if (token) deleteSession(token);
    res.writeHead(302, {
      'Set-Cookie': 'session=; Path=/; HttpOnly; Max-Age=0',
      'Location': '/'
    });
    res.end();
    return true;
  }

  return false;
}

module.exports = {
  authenticateRequest,
  authenticateApiKey,
  handleAuthRoute,
  parseSessionCookie,
  DUMMY_USER
};
