// GitHub snapshot collector.
//
// One GraphQL pass collects everything the portfolio shows about public repos
// (languages, commits, releases, CI workflows, README screenshots) plus the
// contribution calendar. The result is cached in github-cache.json so a failed
// API call never blanks the site: the previous snapshot is reused instead.

const https = require('https');
const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'github-cache.json');
const PAGE_SIZE = 25;
const MAX_IMAGES = 8;
const EXCERPT_LENGTH = 320;

const REPO_QUERY = `
query($login: String!, $after: String) {
  user(login: $login) {
    repositories(first: ${PAGE_SIZE}, after: $after, privacy: PUBLIC, ownerAffiliations: OWNER, isFork: false, orderBy: {field: PUSHED_AT, direction: DESC}) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        description
        url
        homepageUrl
        stargazerCount
        forkCount
        createdAt
        pushedAt
        isArchived
        diskUsage
        licenseInfo { spdxId }
        primaryLanguage { name color }
        languages(first: 8, orderBy: {field: SIZE, direction: DESC}) {
          totalSize
          edges { size node { name color } }
        }
        repositoryTopics(first: 20) { nodes { topic { name } } }
        releases(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) {
          totalCount
          nodes { tagName publishedAt url }
        }
        defaultBranchRef {
          name
          target { ... on Commit { history { totalCount } } }
        }
        workflows: object(expression: "HEAD:.github/workflows") { ... on Tree { entries { name } } }
        readmeUpper: object(expression: "HEAD:README.md") { ... on Blob { text } }
        readmeLower: object(expression: "HEAD:readme.md") { ... on Blob { text } }
      }
    }
  }
}`;

const CALENDAR_QUERY = `
query($login: String!) {
  user(login: $login) {
    createdAt
    followers { totalCount }
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount weekday } }
      }
    }
  }
}`;

function graphql(query, variables, token) {
  const body = JSON.stringify({ query, variables });
  return new Promise((resolve, reject) => {
    const req = https.request('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'User-Agent': 'sitdory-portfolio-builder',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`GraphQL HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        let json;
        try {
          json = JSON.parse(data);
        } catch (err) {
          return reject(new Error(`GraphQL response is not JSON: ${err.message}`));
        }
        if (json.errors && json.errors.length) {
          return reject(new Error(`GraphQL error: ${json.errors.map(e => e.message).join('; ')}`));
        }
        resolve(json.data);
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('GraphQL request timed out')));
    req.write(body);
    req.end();
  });
}

// ─── README parsing ─────────────────────────────────
const BADGE_HOSTS = /(shields\.io|badgen\.net|trendshift\.io|badge\.fury\.io|codecov\.io|sonarcloud\.io|deepscan|forthebadge|github\.com\/[^/]+\/[^/]+\/(actions\/)?workflows\/[^)]*badge|readme-typing-svg|komarev\.com|visitor-badge|hits\.seeyoufarm)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i;
const NON_SCREENSHOT_NAME = /(^|[\/_-])(logo|icon|favicon|badge|avatar|banner-small|qr|qrcode)[\w-]*\.(png|jpe?g|gif|webp|avif)/i;

function resolveImageUrl(raw, repoName, branch, owner) {
  let url = raw.trim().replace(/^<|>$/g, '');
  if (!url || url.startsWith('data:') || url.startsWith('#')) return null;

  if (/^https?:\/\//i.test(url)) {
    // github.com/<o>/<r>/blob/<branch>/<path> → raw file
    const blob = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+?)(\?.*)?$/i);
    if (blob) return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}`;
    return url;
  }

  const clean = url.replace(/^\.\//, '').replace(/^\//, '').split('#')[0].split('?')[0];
  // README paths may already be percent-encoded ("My%20Shot.png"); decode before encoding once.
  const segment = s => {
    try { return encodeURIComponent(decodeURIComponent(s)); } catch { return encodeURIComponent(s); }
  };
  return `https://raw.githubusercontent.com/${owner}/${repoName}/${branch}/${clean.split('/').map(segment).join('/')}`;
}

function extractImages(markdown, repoName, branch, owner) {
  if (!markdown) return [];
  const found = [];
  const mdImage = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
  const htmlImage = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;

  while ((m = mdImage.exec(markdown))) found.push({ index: m.index, alt: m[1], src: m[2] });
  while ((m = htmlImage.exec(markdown))) {
    const altMatch = m[0].match(/\balt\s*=\s*["']([^"']*)["']/i);
    found.push({ index: m.index, alt: altMatch ? altMatch[1] : '', src: m[1] });
  }
  found.sort((a, b) => a.index - b.index);

  const seen = new Set();
  const images = [];
  for (const item of found) {
    const url = resolveImageUrl(item.src, repoName, branch, owner);
    if (!url || seen.has(url)) continue;
    if (BADGE_HOSTS.test(url)) continue;
    if (/\.svg(\?.*)?$/i.test(url)) continue;
    const isAttachment = /github\.com\/user-attachments\/assets\//i.test(url)
      || /user-images\.githubusercontent\.com/i.test(url);
    if (!isAttachment && !IMAGE_EXT.test(url)) continue;
    if (NON_SCREENSHOT_NAME.test(url)) continue;
    seen.add(url);
    images.push({ url, alt: item.alt.trim().slice(0, 120) });
    if (images.length >= MAX_IMAGES) break;
  }
  return images;
}

// First prose paragraph of the README, stripped of markdown, as a short excerpt.
function extractExcerpt(markdown) {
  if (!markdown) return '';
  const lines = markdown
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .split(/\r?\n/);

  // Prose lines only: headings, HTML, images, link rows, tables, lists and
  // admonitions ("> [!NOTE]") end a paragraph. Plain blockquotes count as prose.
  const paragraphs = [];
  let current = [];
  const flush = () => { if (current.length) { paragraphs.push(current.join(' ')); current = []; } };
  for (const line of lines) {
    let t = line.trim();
    if (/^>\s*[^\s[!]/.test(t)) t = t.replace(/^>\s*/, '');
    if (!t || /^(#|<|!\[|\[!\[|\||[-*+]\s|\d+\.\s|>|---|===)/.test(t)) {
      flush();
      continue;
    }
    current.push(t);
  }
  flush();

  const plain = paragraphs
    .map(p => p
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[*_`~]+/g, '')
      .replace(/\s+/g, ' ')
      .trim())
    .find(p => p.length >= 30 && !/^(https?:|\||[-=]{3})/.test(p));

  if (!plain) return '';
  return plain.length > EXCERPT_LENGTH ? `${plain.slice(0, EXCERPT_LENGTH - 1).trim()}…` : plain;
}

function normalizeRepo(node, owner) {
  const branch = node.defaultBranchRef ? node.defaultBranchRef.name : 'main';
  const readme = (node.readmeUpper && node.readmeUpper.text) || (node.readmeLower && node.readmeLower.text) || '';
  const latest = node.releases.nodes[0] || null;
  const workflowEntries = node.workflows && Array.isArray(node.workflows.entries)
    ? node.workflows.entries.filter(e => /\.ya?ml$/i.test(e.name))
    : [];

  return {
    name: node.name,
    description: node.description || '',
    url: node.url,
    homepage: (node.homepageUrl || '').trim(),
    stars: node.stargazerCount,
    forks: node.forkCount,
    createdAt: node.createdAt,
    pushedAt: node.pushedAt,
    archived: node.isArchived,
    sizeKb: node.diskUsage || 0,
    license: node.licenseInfo ? node.licenseInfo.spdxId : null,
    primaryLanguage: node.primaryLanguage ? node.primaryLanguage.name : null,
    languages: node.languages.edges.map(e => ({ name: e.node.name, color: e.node.color, bytes: e.size })),
    topics: node.repositoryTopics.nodes.map(n => n.topic.name),
    releases: node.releases.totalCount,
    latestRelease: latest ? { tag: latest.tagName, date: latest.publishedAt, url: latest.url } : null,
    commits: node.defaultBranchRef && node.defaultBranchRef.target && node.defaultBranchRef.target.history
      ? node.defaultBranchRef.target.history.totalCount
      : 0,
    workflows: workflowEntries.length,
    images: extractImages(readme, node.name, branch, owner),
    excerpt: extractExcerpt(readme),
  };
}

async function fetchRepos(login, token) {
  const repos = [];
  let after = null;
  for (let page = 0; page < 40; page++) {
    const data = await graphql(REPO_QUERY, { login, after }, token);
    const conn = data.user.repositories;
    repos.push(...conn.nodes.map(node => normalizeRepo(node, login)));
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return repos;
}

async function fetchCalendar(login, token) {
  const data = await graphql(CALENDAR_QUERY, { login }, token);
  const cal = data.user.contributionsCollection.contributionCalendar;
  return {
    accountCreatedAt: data.user.createdAt,
    followers: data.user.followers.totalCount,
    total: cal.totalContributions,
    days: cal.weeks.flatMap(w => w.contributionDays.map(d => ({ date: d.date, count: d.contributionCount }))),
  };
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function saveCache(snapshot) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(snapshot, null, 1) + '\n', 'utf-8');
}

// Returns { fetchedAt, repos, calendar, stale } — fresh data when the API is
// reachable, otherwise the cached snapshot (stale: true), otherwise null.
async function getGitHubSnapshot(login) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const cached = loadCache();

  if (!token) {
    console.warn('  ⚠ GITHUB_TOKEN is not set; GraphQL needs a token. Using cached GitHub snapshot.');
    return cached ? { ...cached, stale: true } : null;
  }

  const snapshot = { fetchedAt: new Date().toISOString(), repos: null, calendar: null };

  try {
    console.log(`🔎 Fetching public repositories of ${login} (GraphQL)...`);
    snapshot.repos = await fetchRepos(login, token);
    console.log(`  ✓ ${snapshot.repos.length} public repositories`);
  } catch (err) {
    console.warn(`  ⚠ Repository fetch failed, keeping cached repositories: ${err.message}`);
    snapshot.repos = cached ? cached.repos : null;
    snapshot.reposStale = true;
  }

  try {
    snapshot.calendar = await fetchCalendar(login, token);
    console.log(`  ✓ Contribution calendar (${snapshot.calendar.total} contributions)`);
  } catch (err) {
    console.warn(`  ⚠ Contribution calendar fetch failed, keeping cached calendar: ${err.message}`);
    snapshot.calendar = cached ? cached.calendar : null;
    snapshot.calendarStale = true;
  }

  if (!snapshot.repos && !snapshot.calendar) return null;
  if (!snapshot.reposStale || !snapshot.calendarStale) {
    saveCache({ fetchedAt: snapshot.fetchedAt, repos: snapshot.repos, calendar: snapshot.calendar });
  }
  console.log('');
  return snapshot;
}

module.exports = { getGitHubSnapshot, extractImages, extractExcerpt };
