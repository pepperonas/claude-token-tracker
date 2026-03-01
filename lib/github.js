const https = require('https');
const { MULTI_USER } = require('./config');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_CACHE_TTL_MINUTES = parseInt(process.env.GITHUB_CACHE_TTL_MINUTES, 10) || 15;

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

function cachedFetch(userId, cacheKey, fetchFn) {
  if (!_db) return fetchFn();

  const db = _db.getDB();
  const row = db.prepare(
    'SELECT data, fetched_at FROM github_cache WHERE user_id = ? AND cache_key = ?'
  ).get(userId || 0, cacheKey);

  if (row) {
    const age = (Date.now() - new Date(row.fetched_at).getTime()) / 60000;
    if (age < GITHUB_CACHE_TTL_MINUTES) {
      return Promise.resolve(JSON.parse(row.data));
    }
  }

  return fetchFn().then(result => {
    db.prepare(
      'INSERT OR REPLACE INTO github_cache (user_id, cache_key, data, fetched_at) VALUES (?, ?, ?, ?)'
    ).run(userId || 0, cacheKey, JSON.stringify(result), new Date().toISOString());
    return result;
  });
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
      // GitHub is computing stats, return empty
      return [];
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

async function getBillingInfo(token, userId) {
  return cachedFetch(userId, 'billing', async () => {
    // Get login from /user
    const userRes = await restRequest(token, '/user');
    if (userRes.statusCode !== 200) {
      throw new Error('Failed to get GitHub user: ' + (userRes.data.message || userRes.statusCode));
    }
    const login = userRes.data.login;

    // Fetch all three billing endpoints in parallel
    const [actionsRes, packagesRes, storageRes] = await Promise.all([
      restRequest(token, `/users/${login}/settings/billing/actions`),
      restRequest(token, `/users/${login}/settings/billing/packages`),
      restRequest(token, `/users/${login}/settings/billing/shared-storage`)
    ]);

    if (actionsRes.statusCode !== 200) {
      throw new Error('Billing API failed: ' + (actionsRes.data.message || actionsRes.statusCode));
    }

    const a = actionsRes.data;
    const p = packagesRes.statusCode === 200 ? packagesRes.data : {};
    const s = storageRes.statusCode === 200 ? storageRes.data : {};

    const includedMinutes = a.included_minutes || 0;
    const totalMinutesUsed = a.total_minutes_used || 0;
    const percentUsed = includedMinutes > 0
      ? Math.round(totalMinutesUsed / includedMinutes * 1000) / 10
      : 0;

    // Calculate reset date from days_left_in_billing_cycle
    const daysLeft = s.days_left_in_billing_cycle || 0;
    const resetDate = new Date();
    resetDate.setDate(resetDate.getDate() + daysLeft);
    const resetDateStr = resetDate.toISOString().slice(0, 10);

    const plan = includedMinutes >= 3000 ? 'Pro' : 'Free';
    const includedStorageGB = plan === 'Pro' ? 2 : 0.5;

    return {
      actions: {
        totalMinutesUsed,
        includedMinutes,
        totalPaidMinutesUsed: a.total_paid_minutes_used || 0,
        minutesUsedBreakdown: a.minutes_used_breakdown || {},
        percentUsed,
        plan
      },
      storage: {
        estimatedStorageGB: s.estimated_storage_for_month || 0,
        includedStorageGB,
        daysLeftInCycle: daysLeft
      },
      packages: {
        totalGigabytesBandwidthUsed: p.total_gigabytes_bandwidth_used || 0,
        includedGigabytesBandwidth: p.included_gigabytes_bandwidth || 0
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
  clearCache
};
