const https = require('https');
const { MULTI_USER } = require('./config');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_CACHE_TTL_MINUTES = parseInt(process.env.GITHUB_CACHE_TTL_MINUTES, 10) || 60;

// DB functions injected at init to avoid circular deps
let _db = null;

function initGithub(db) {
  _db = db;
}

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

function graphqlRequest(token, query, variables) {
  const body = JSON.stringify({ query, variables });
  return httpsRequest({
    hostname: 'api.github.com',
    path: '/graphql',
    method: 'POST',
    headers: {
      'Authorization': 'bearer ' + token,
      'Content-Type': 'application/json',
      'User-Agent': 'claude-token-tracker',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);
}

function restRequest(token, path) {
  return httpsRequest({
    hostname: 'api.github.com',
    path,
    method: 'GET',
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'claude-token-tracker'
    }
  });
}

function getToken(user) {
  if (!MULTI_USER && GITHUB_TOKEN) return GITHUB_TOKEN;
  if (user && user.github_token) return user.github_token;
  return null;
}

// Track in-flight background refreshes to prevent duplicate fetches
const _refreshing = new Map();

function cachedFetch(userId, cacheKey, fetchFn) {
  if (!_db) return fetchFn();

  const db = _db.getDB();
  const uid = userId || 0;
  const row = db.prepare(
    'SELECT data, fetched_at FROM github_cache WHERE user_id = ? AND cache_key = ?'
  ).get(uid, cacheKey);

  if (row) {
    const age = (Date.now() - new Date(row.fetched_at).getTime()) / 60000;
    if (age < GITHUB_CACHE_TTL_MINUTES) {
      // Fresh — return immediately
      return Promise.resolve(JSON.parse(row.data));
    }
    // Stale — return cached data immediately, refresh in background
    const refreshKey = `${uid}:${cacheKey}`;
    if (!_refreshing.has(refreshKey)) {
      const p = fetchFn().then(result => {
        if (result === undefined) return; // skip caching (e.g. 202 computing)
        db.prepare(
          'INSERT OR REPLACE INTO github_cache (user_id, cache_key, data, fetched_at) VALUES (?, ?, ?, ?)'
        ).run(uid, cacheKey, JSON.stringify(result), new Date().toISOString());
      }).catch(err => {
        console.error(`[github] background refresh failed for ${cacheKey}:`, err.message);
      }).finally(() => {
        _refreshing.delete(refreshKey);
      });
      _refreshing.set(refreshKey, p);
    }
    return Promise.resolve(JSON.parse(row.data));
  }

  // No cache — blocking fetch
  return fetchFn().then(result => {
    if (result === undefined) return []; // skip caching, return safe default
    db.prepare(
      'INSERT OR REPLACE INTO github_cache (user_id, cache_key, data, fetched_at) VALUES (?, ?, ?, ?)'
    ).run(uid, cacheKey, JSON.stringify(result), new Date().toISOString());
    return result;
  });
}

function getCacheAge(userId, cacheKey) {
  if (!_db) return null;
  const db = _db.getDB();
  const row = db.prepare(
    'SELECT fetched_at FROM github_cache WHERE user_id = ? AND cache_key = ?'
  ).get(userId || 0, cacheKey);
  if (!row) return null;
  return Math.round((Date.now() - new Date(row.fetched_at).getTime()) / 60000);
}

const CONTRIBUTIONS_QUERY = `
query($login: String!) {
  user(login: $login) {
    login
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalIssueContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            color
          }
        }
      }
    }
    repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: UPDATED_AT, direction: DESC}) {
      totalCount
      nodes {
        name
        nameWithOwner
        stargazerCount
        forkCount
        primaryLanguage { name color }
        updatedAt
        isPrivate
      }
    }
    pullRequests(first: 100, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        state
        additions
        deletions
        changedFiles
      }
    }
  }
}`;

async function getContributionsAndRepos(token, userId) {
  return cachedFetch(userId, 'contributions', async () => {
    // First get the user's login
    const userRes = await restRequest(token, '/user');
    if (userRes.statusCode !== 200) {
      throw new Error('Failed to get GitHub user: ' + (userRes.data.message || userRes.statusCode));
    }
    const login = userRes.data.login;

    const res = await graphqlRequest(token, CONTRIBUTIONS_QUERY, { login });
    if (res.statusCode !== 200 || (res.data.errors && res.data.errors.length > 0)) {
      const msg = res.data.errors ? res.data.errors[0].message : 'GraphQL request failed';
      throw new Error(msg);
    }
    return transformGithubData(res.data.data.user);
  });
}

function transformGithubData(userData) {
  const cc = userData.contributionsCollection;
  const calendar = cc.contributionCalendar;

  // Flatten heatmap days
  const heatmap = [];
  for (const week of calendar.weeks) {
    for (const day of week.contributionDays) {
      heatmap.push({
        date: day.date,
        count: day.contributionCount,
        color: day.color
      });
    }
  }

  // Build commit daily data from heatmap
  const commitDaily = heatmap
    .filter(d => d.count > 0)
    .map(d => ({ date: d.date, commits: d.count }));

  // Repos
  const repos = userData.repositories.nodes.map(r => ({
    name: r.name,
    nameWithOwner: r.nameWithOwner,
    stars: r.stargazerCount,
    forks: r.forkCount,
    language: r.primaryLanguage ? r.primaryLanguage.name : null,
    languageColor: r.primaryLanguage ? r.primaryLanguage.color : null,
    updatedAt: r.updatedAt,
    isPrivate: r.isPrivate
  }));

  const totalStars = repos.reduce((s, r) => s + r.stars, 0);
  const totalForks = repos.reduce((s, r) => s + r.forks, 0);

  // Language distribution
  const langMap = {};
  for (const r of repos) {
    if (r.language) {
      if (!langMap[r.language]) langMap[r.language] = { name: r.language, count: 0, color: r.languageColor };
      langMap[r.language].count++;
    }
  }
  const languages = Object.values(langMap).sort((a, b) => b.count - a.count);

  // PR stats
  const prNodes = userData.pullRequests.nodes;
  const prStats = { total: prNodes.length, open: 0, merged: 0, closed: 0,
    totalAdditions: 0, totalDeletions: 0, netLines: 0, totalChangedFiles: 0,
    codeByState: {} };
  for (const pr of prNodes) {
    if (pr.state === 'OPEN') prStats.open++;
    else if (pr.state === 'MERGED') prStats.merged++;
    else if (pr.state === 'CLOSED') prStats.closed++;
    prStats.totalAdditions += pr.additions || 0;
    prStats.totalDeletions += pr.deletions || 0;
    prStats.totalChangedFiles += pr.changedFiles || 0;
    const stateKey = pr.state.toLowerCase();
    if (!prStats.codeByState[stateKey]) {
      prStats.codeByState[stateKey] = { additions: 0, deletions: 0 };
    }
    prStats.codeByState[stateKey].additions += pr.additions || 0;
    prStats.codeByState[stateKey].deletions += pr.deletions || 0;
  }
  prStats.netLines = prStats.totalAdditions - prStats.totalDeletions;

  return {
    heatmap,
    totalContributions: calendar.totalContributions,
    commitCount: cc.totalCommitContributions,
    prContributions: cc.totalPullRequestContributions,
    repos,
    repoCount: userData.repositories.totalCount,
    totalStars,
    totalForks,
    prStats,
    languages,
    commitDaily
  };
}

async function getCodeFrequency(token, userId, owner, repo) {
  return cachedFetch(userId, `code-freq:${owner}/${repo}`, async () => {
    const res = await restRequest(token, `/repos/${owner}/${repo}/stats/code_frequency`);
    if (res.statusCode === 202) {
      // GitHub is computing stats — don't cache, signal retry
      return undefined;
    }
    if (res.statusCode !== 200 || !Array.isArray(res.data)) return [];
    return res.data.map(([timestamp, additions, deletions]) => ({
      week: new Date(timestamp * 1000).toISOString().slice(0, 10),
      additions,
      deletions
    }));
  });
}

async function getRepoLanguages(token, userId, owner, repo) {
  return cachedFetch(userId, `languages:${owner}/${repo}`, async () => {
    const res = await restRequest(token, `/repos/${owner}/${repo}/languages`);
    if (res.statusCode !== 200) return {};
    return res.data;
  });
}

async function getCodeStats(token, userId) {
  return cachedFetch(userId, 'code-stats', async () => {
    const userRes = await restRequest(token, '/user');
    if (userRes.statusCode !== 200) {
      throw new Error('Failed to get GitHub user: ' + (userRes.data.message || userRes.statusCode));
    }
    const login = userRes.data.login;

    // Get top 10 public repos by push date
    const reposRes = await restRequest(token, `/users/${login}/repos?sort=pushed&per_page=10&type=owner`);
    if (reposRes.statusCode !== 200 || !Array.isArray(reposRes.data)) {
      return { additions: 0, deletions: 0, net: 0, repos: 0, weekly: [] };
    }

    let totalAdditions = 0;
    let totalDeletions = 0;
    let repoCount = 0;
    const weeklyMap = {};

    for (const repo of reposRes.data) {
      const res = await restRequest(token, `/repos/${repo.full_name}/stats/code_frequency`);
      if (res.statusCode === 202 || res.statusCode !== 200 || !Array.isArray(res.data)) continue;
      repoCount++;
      for (const [timestamp, additions, deletions] of res.data) {
        totalAdditions += additions || 0;
        totalDeletions += Math.abs(deletions || 0);
        const week = new Date(timestamp * 1000).toISOString().slice(0, 10);
        if (!weeklyMap[week]) weeklyMap[week] = { week, additions: 0, deletions: 0 };
        weeklyMap[week].additions += additions || 0;
        weeklyMap[week].deletions += Math.abs(deletions || 0);
      }
    }

    const weekly = Object.values(weeklyMap).sort((a, b) => a.week.localeCompare(b.week));
    return {
      additions: totalAdditions,
      deletions: totalDeletions,
      net: totalAdditions - totalDeletions,
      repos: repoCount,
      weekly
    };
  });
}

async function getBillingInfo(token, userId) {
  return cachedFetch(userId, 'billing', async () => {
    const userRes = await restRequest(token, '/user');
    if (userRes.statusCode !== 200) {
      throw new Error('Failed to get GitHub user: ' + (userRes.data.message || userRes.statusCode));
    }
    const login = userRes.data.login;
    const userPlan = (userRes.data.plan && userRes.data.plan.name) || 'free';

    // New billing usage summary API (replaces deprecated /settings/billing/actions etc.)
    const summaryRes = await restRequest(token, `/users/${login}/settings/billing/usage/summary`);
    if (summaryRes.statusCode !== 200) {
      throw new Error('Billing API failed: ' + (summaryRes.data.message || summaryRes.statusCode));
    }

    const items = summaryRes.data.usageItems || [];
    const plan = userPlan === 'pro' ? 'Pro' : 'Free';
    const includedMinutes = plan === 'Pro' ? 3000 : 2000;
    const includedStorageGB = plan === 'Pro' ? 2 : 0.5;

    // Extract Actions minutes by OS from SKUs
    const skuToOs = { actions_linux: 'UBUNTU', actions_macos: 'MACOS', actions_windows: 'WINDOWS' };
    const minutesUsedBreakdown = { UBUNTU: 0, MACOS: 0, WINDOWS: 0 };
    let totalMinutesUsed = 0;
    let totalPaidMinutesUsed = 0;
    let estimatedStorageGB = 0;

    for (const item of items) {
      if (item.product === 'Actions' && item.unitType === 'minutes' && skuToOs[item.sku]) {
        minutesUsedBreakdown[skuToOs[item.sku]] = Math.round(item.grossQuantity || 0);
        totalMinutesUsed += item.grossQuantity || 0;
        totalPaidMinutesUsed += item.netQuantity || 0;
      }
      if (item.sku === 'actions_storage') {
        // grossQuantity is gigabyte-hours; approximate GB = GBh / hours_in_month
        estimatedStorageGB = (item.grossQuantity || 0) / 744;
      }
    }

    totalMinutesUsed = Math.round(totalMinutesUsed);
    const percentUsed = includedMinutes > 0
      ? Math.round(totalMinutesUsed / includedMinutes * 1000) / 10
      : 0;

    // Reset date = end of current billing month
    const now = new Date();
    const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysLeft = Math.ceil((resetDate - now) / 86400000);
    const resetDateStr = resetDate.toISOString().slice(0, 10);

    return {
      actions: {
        totalMinutesUsed,
        includedMinutes,
        totalPaidMinutesUsed,
        minutesUsedBreakdown,
        percentUsed,
        plan
      },
      storage: {
        estimatedStorageGB,
        includedStorageGB,
        daysLeftInCycle: daysLeft
      },
      packages: {
        totalGigabytesBandwidthUsed: 0,
        includedGigabytesBandwidth: plan === 'Pro' ? 2 : 1
      },
      resetDate: resetDateStr
    };
  });
}

const OS_MULTIPLIERS = { UBUNTU: 1, MACOS: 10, WINDOWS: 2 };

async function getActionsUsageByRepo(token, userId) {
  return cachedFetch(userId, 'actions-usage', async () => {
    const userRes = await restRequest(token, '/user');
    if (userRes.statusCode !== 200) {
      throw new Error('Failed to get GitHub user: ' + (userRes.data.message || userRes.statusCode));
    }
    const login = userRes.data.login;

    // Get top 20 repos sorted by push date
    const reposRes = await restRequest(token, `/users/${login}/repos?sort=pushed&per_page=20`);
    if (reposRes.statusCode !== 200 || !Array.isArray(reposRes.data)) {
      return { repos: [], total: 0 };
    }

    const repos = [];
    let total = 0;

    for (const repo of reposRes.data) {
      // List workflows for this repo
      const wfRes = await restRequest(token, `/repos/${repo.full_name}/actions/workflows?per_page=30`);
      if (wfRes.statusCode !== 200 || !wfRes.data.workflows || wfRes.data.workflows.length === 0) continue;

      const workflows = [];
      let repoBillable = 0;

      for (const wf of wfRes.data.workflows) {
        const timingRes = await restRequest(token, `/repos/${repo.full_name}/actions/workflows/${wf.id}/timing`);
        if (timingRes.statusCode !== 200 || !timingRes.data.billable) continue;

        let wfMinutes = 0;
        for (const [os, data] of Object.entries(timingRes.data.billable)) {
          const rawMs = data.total_ms || 0;
          const rawMin = rawMs / 60000;
          const mult = OS_MULTIPLIERS[os] || 1;
          wfMinutes += rawMin * mult;
        }
        wfMinutes = Math.round(wfMinutes * 10) / 10;
        if (wfMinutes > 0) {
          workflows.push({ name: wf.name, billableMinutes: wfMinutes });
          repoBillable += wfMinutes;
        }
      }

      if (repoBillable > 0) {
        repoBillable = Math.round(repoBillable * 10) / 10;
        repos.push({ name: repo.name, billableMinutes: repoBillable, workflows });
        total += repoBillable;
      }
    }

    repos.sort((a, b) => b.billableMinutes - a.billableMinutes);
    return { repos, total: Math.round(total * 10) / 10 };
  });
}

function clearCache(userId) {
  if (!_db) return;
  const db = _db.getDB();
  db.prepare('DELETE FROM github_cache WHERE user_id = ?').run(userId || 0);
}

module.exports = {
  initGithub,
  getToken,
  getContributionsAndRepos,
  getCodeFrequency,
  getRepoLanguages,
  getBillingInfo,
  getActionsUsageByRepo,
  getCodeStats,
  clearCache,
  getCacheAge
};
