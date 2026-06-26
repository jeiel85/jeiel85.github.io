const gplay = require('google-play-scraper');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Paths ───────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const APPS_JSON = path.join(ROOT, 'apps.json');
const CACHE_JSON = path.join(__dirname, 'cache.json');
const OUTPUT_HTML = path.join(ROOT, 'index.html');

const GITHUB_EXCLUDED_REPOS = new Set([
  'AGENTS.md',
  'homebrew-tap',
  'jeiel85',
  'jeiel85.github.io',
]);

const GITHUB_EXCLUDED_SUFFIXES = [
  '-android',
  '-designguide',
];

// ─── Avatar Gradients (for apps without Play Store icons) ─
const GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
  'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)',
  'linear-gradient(135deg, #13547a 0%, #80d0c7 100%)',
  'linear-gradient(135deg, #c471f5 0%, #fa71cd 100%)',
];

// ─── Android Package Lockdown & Validation ───────────
const LOCKED_ANDROID_PACKAGES = {
  "app.briodo": "BrioDo — Do it with brio.",
  "io.jeiel85.dockmode": "DockMode - Standby Clock",
  "com.jeiel85.luminadaily": "Lumina Daily - 오늘의 명언",
  "com.markleaf.notes": "Markleaf",
  "com.jeiel85.nightseedbastion": "Nightseed Bastion",
  "com.nightseed.survivor": "Nightseed Survivor",
  "io.pulpit.ink": "Pulpit Ink — 설교 녹음·필기",
  "com.veritasbible.app": "Veritas Bible — 오프라인 한영 성경",
  "com.jeiel85.wildhavenidle": "Wild Haven Idle",
  "com.jeiel.zephyr_sky": "Zephyr Sky",
  "com.bebecup.app": "베베컵",
  "com.markscene.app": "MarkScene",
  "io.stargaze.explorer": "별자리 탐험: AR 별자리 가이드",
  "com.jeiel85.breathspace": "숨 쉴 틈 — Breath Space",
  "com.jeiel85.daddypocket": "아빠 용돈 — Daddy Pocket",
  "com.flux.hourglass": "아워 글래스 — Flux Hourglass",
  "com.jeiel85.retropixelracer": "Retro Pixel Racer — 레트로 픽셀 레이서",
  "com.dualframe.recorder": "DualFrame Recorder",
  "com.jeiel85.daybits": "DayBits — 1일 1클립 비디오 다이어리",
  "com.jeiel85.forestpetgarden": "Forest Pet Garden — 포레스트 펫 가든",
  "com.jeiel85.daddycarbook": "가족 차량 관리 — Daddy Car Book",
  "com.jeiel85.clearpdflocal": "ClearPDF Local — 로컬 PDF 리더",
  "com.jeiel85.daddyweekend": "Daddy Weekend — 아빠 주말 코스",
  "com.jeiel.daddylog": "Daddy Log — 두피케어기록",
  "com.jeiel.daddygifttracker": "Daddy Gift Tracker — 경조사 장부",
  "com.jeiel.daddyheartjournal": "Daddy Heart Journal — 마음 일기장",
  "com.jeiel85.daddymode": "Daddy Mode Switch — 아빠 모드 전환",
  "com.jeiel85.healingfishing": "Yoonseul Fishing — 윤슬낚시",
  "com.jeiel.contextactionassistant": "Context Action Assistant"
};

function validateAndroidPackages(projects) {
  console.log('🔒 Validating Android package names (Lockdown Active)...');

  // Check if any locked package has been modified or removed
  for (const [pkg, name] of Object.entries(LOCKED_ANDROID_PACKAGES)) {
    const matchingProj = projects.find(p => p.package === pkg);
    if (!matchingProj) {
      // Find if there's a project with the same name but different package
      const sameNameProj = projects.find(p => p.name === name);
      if (sameNameProj) {
        throw new Error(`[Lockdown Violation] Package name for "${name}" has been modified from "${pkg}" to "${sameNameProj.package}"! Android package names are locked down.`);
      } else {
        throw new Error(`[Lockdown Violation] Locked Android project "${name}" (${pkg}) has been removed from apps.json!`);
      }
    }
  }

  // Validate format and opt-in links for all Android projects
  for (const proj of projects) {
    if (proj.platform === 'android' || !proj.platform) {
      if (!proj.package) {
        throw new Error(`[Validation Error] Android project "${proj.name}" is missing a "package" field.`);
      }

      // Standard package name format check
      const packageRegex = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+[0-9a-z_]$/i;
      if (!packageRegex.test(proj.package)) {
        throw new Error(`[Validation Error] Android project "${proj.name}" has an invalid package name format: "${proj.package}".`);
      }

      // Opt-in link validation (if provided)
      if (proj.optInUrl && !proj.optInUrl.includes(proj.package)) {
        throw new Error(`[Validation Error] Android project "${proj.name}" has an optInUrl ("${proj.optInUrl}") that does not match its package name ("${proj.package}").`);
      }
    }
  }
  console.log('✅ Android package names validated successfully (No modifications detected).\n');
}

// ─── GitHub Repository Sync ──────────────────────────
function fetchJSON(url, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));

  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'sitdory-portfolio-builder',
      'Accept': 'application/vnd.github+json',
    };

    const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        return fetchJSON(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 160)}`));
        }

        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchGitHubRepos(username) {
  const repos = [];
  for (let page = 1; page <= 10; page++) {
    const url = `https://api.github.com/users/${username}/repos?type=owner&sort=pushed&direction=desc&per_page=100&page=${page}`;
    const batch = await fetchJSON(url);
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

function isAndroidRepository(repo) {
  const repoName = (repo.name || '').toLowerCase();
  const description = (repo.description || '').toLowerCase();
  const topics = Array.isArray(repo.topics)
    ? repo.topics.map(topic => topic.toLowerCase())
    : [];

  return repoName.endsWith('-android')
    || topics.some(topic => topic === 'android' || topic === 'android-app' || topic === 'android-game')
    || description.includes('android')
    || description.includes('안드로이드');
}

function isPortfolioCandidate(repo) {
  if (repo.private || repo.fork) return false;
  if (GITHUB_EXCLUDED_REPOS.has(repo.name)) return false;
  if (GITHUB_EXCLUDED_SUFFIXES.some(suffix => repo.name.endsWith(suffix))) return false;
  if (isAndroidRepository(repo)) return false;

  const homepage = (repo.homepage || '').trim();
  const topics = Array.isArray(repo.topics) ? repo.topics : [];

  return Boolean(homepage)
    || repo.name.endsWith('-web')
    || repo.name.endsWith('-desktop')
    || repo.name.endsWith('-windows')
    || topics.includes('github-pages')
    || topics.includes('pwa');
}

function inferPlatform(repo) {
  if (repo.name.endsWith('-desktop') || repo.name.endsWith('-windows')) {
    return 'desktop';
  }
  return 'web';
}

function repoDisplayName(repoName) {
  return repoName
    .split('-')
    .filter(Boolean)
    .map(part => {
      const lower = part.toLowerCase();
      if (lower === 'ai') return 'AI';
      if (lower === 'cli') return 'CLI';
      if (lower === 'pdf') return 'PDF';
      if (lower === 'pwa') return 'PWA';
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function normalizeHomepage(homepage) {
  const value = (homepage || '').trim();
  return value || undefined;
}

async function syncGitHubProjects(config) {
  const username = config.developer.githubUsername;
  if (!username) return;

  try {
    console.log(`🔎 Syncing public GitHub repositories for ${username}...`);
    const repos = await fetchGitHubRepos(username);
    const existingGitHubUrls = new Set(
      config.projects
        .map(project => project.githubUrl)
        .filter(Boolean)
        .map(url => url.replace(/\/+$/, '').toLowerCase())
    );

    const additions = repos
      .filter(isPortfolioCandidate)
      .filter(repo => !existingGitHubUrls.has(repo.html_url.toLowerCase()))
      .map(repo => ({
        name: repoDisplayName(repo.name),
        platform: inferPlatform(repo),
        status: 'production',
        description: repo.description || `${repoDisplayName(repo.name)} project.`,
        ...(normalizeHomepage(repo.homepage) ? { url: normalizeHomepage(repo.homepage) } : {}),
        githubUrl: repo.html_url,
        iconUrl: `icons/${repo.name}.png`,
        source: 'github'
      }));

    if (additions.length === 0) {
      console.log('  No new GitHub portfolio repositories found.\n');
      return;
    }

    config.projects.push(...additions);
    fs.writeFileSync(APPS_JSON, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    console.log(`  Added ${additions.length} GitHub project(s):`);
    additions.forEach(project => console.log(`  + ${project.name} (${project.platform})`));
    console.log('');
  } catch (err) {
    console.warn(`  ⚠ GitHub repository sync skipped: ${err.message}\n`);
  }
}

// ─── Scraping ────────────────────────────────────────
async function scrapeApp(packageName) {
  try {
    console.log(`  Scraping: ${packageName}...`);
    const data = await gplay.app({ appId: packageName, lang: 'ko', country: 'kr' });
    return {
      title: data.title,
      summary: data.summary || '',
      icon: data.icon,
      score: data.score,
      scoreText: data.scoreText,
      ratings: data.ratings,
      reviews: data.reviews,
      installs: data.installs,
      minInstalls: data.minInstalls,
      free: data.free,
      genre: data.genre,
      url: data.url,
      updated: data.updated,
      version: data.version,
    };
  } catch (err) {
    console.warn(`  ⚠ Failed to scrape ${packageName}: ${err.message}`);
    return null;
  }
}

// ─── Direct Play Store HTML Scraping (fallback) ─────
function fetchPage(url, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location;
        const redirectUrl = loc.startsWith('http') ? loc : new URL(loc, url).href;
        res.resume();
        return fetchPage(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, html: data }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function scrapePlayStoreHTML(packageName, options = {}) {
  const { quiet = false } = options;

  try {
    const url = `https://play.google.com/store/apps/details?id=${packageName}&hl=ko&gl=kr`;
    console.log(`  Fallback HTML scraping: ${packageName}...`);
    const { status, html } = await fetchPage(url);

    if (status !== 200) {
      if (!quiet) {
        console.warn(`  ⚠ Play Store returned ${status} for ${packageName}`);
      }
      return null;
    }

    const result = {};

    const iconMatches = html.match(/https:\/\/play-lh\.googleusercontent\.com\/[^"'\s\])>]+/gi) || [];
    if (iconMatches.length > 0) {
      const iconBase = iconMatches[0].split('=')[0];
      result.icon = iconBase + '=w240-h240-rw';
    }

    const titleMatch = html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)
      || html.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i);
    if (titleMatch) result.title = titleMatch[1];

    const descMatch = html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i)
      || html.match(/content=["']([^"']+)["']\s+property=["']og:description["']/i);
    if (descMatch) result.summary = descMatch[1];

    if (Object.keys(result).length > 0) {
      return result;
    }
    return null;
  } catch (err) {
    if (!quiet) {
      console.warn(`  ⚠ Fallback scraping failed for ${packageName}: ${err.message}`);
    }
    return null;
  }
}

async function promotePublishedTestingApps(config, cache) {
  const testingApps = config.projects.filter(project =>
    (project.platform === 'android' || !project.platform)
    && project.status === 'closed_testing'
    && !project.hidden
  );

  if (testingApps.length === 0) return;

  console.log(`🧭 Checking ${testingApps.length} closed testing Android app(s) for production launch...`);
  const promoted = [];

  for (const app of testingApps) {
    const data = await scrapePlayStoreHTML(app.package, { quiet: true });
    const hasPublicStorePage = data && (data.title || data.icon || data.summary);

    if (!hasPublicStorePage) {
      console.log(`  - ${app.name} remains closed testing`);
      continue;
    }

    app.status = 'production';
    cache[app.package] = { ...data, _lastScraped: new Date().toISOString() };
    await ensureLocalIcon(app, data);
    promoted.push(app.name);
    console.log(`  ↑ ${app.name} promoted to production`);
  }

  if (promoted.length > 0) {
    fs.writeFileSync(APPS_JSON, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    console.log(`  Updated apps.json for ${promoted.length} production app(s).\n`);
  } else {
    console.log('  No closed testing apps appear public yet.\n');
  }
}

// ─── Cache ───────────────────────────────────────────
function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_JSON, 'utf-8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_JSON, JSON.stringify(cache, null, 2));
}

function downloadFile(url, outputPath, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));

  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        return downloadFile(redirectUrl, outputPath, redirectCount + 1).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const file = fs.createWriteStream(outputPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function ensureLocalIcon(project, scraped) {
  if (!project.iconUrl || !scraped || !scraped.icon) return;

  const fullIconPath = path.join(ROOT, project.iconUrl);
  if (fs.existsSync(fullIconPath)) return;

  try {
    const iconUrl = scraped.icon.includes('=')
      ? scraped.icon.replace(/=[^=]*$/, '=w512-h512-rw')
      : scraped.icon;
    console.log(`  Downloading icon: ${project.package} -> ${path.relative(ROOT, fullIconPath)}`);
    await downloadFile(iconUrl, fullIconPath);
  } catch (err) {
    console.warn(`  ⚠ Failed to download icon for ${project.package}: ${err.message}`);
  }
}

// ─── Helpers ─────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getStatusLabel(status) {
  switch (status) {
    case 'production': return 'Production';
    case 'closed_testing': return 'Closed Testing';
    case 'draft': return 'Draft';
    case 'development': return 'In Dev';
    case 'active': return 'Active';
    case 'github_only': return 'GitHub Only';
    default: return status;
  }
}

function getStatusClass(status) {
  switch (status) {
    case 'production':
    case 'active':
      return 'status-production';
    case 'closed_testing':
    case 'development':
      return 'status-testing';
    case 'draft':
    case 'github_only':
      return 'status-draft';
    default:
      return '';
  }
}

function getPlatformLabel(platform) {
  switch (platform) {
    case 'android': return '📱 Android';
    case 'web': return '🌐 Web App';
    case 'desktop': return '💻 Desktop';
    case 'ios': return '🍎 iOS';
    default: return platform;
  }
}

function getPlatformClass(platform) {
  return `platform-${platform || 'android'}`;
}

function getStars(score) {
  if (!score) return '';
  const full = Math.floor(score);
  const half = score - full >= 0.25 ? 1 : 0;
  const empty = 5 - full - half;
  return '<span class="star-filled">★</span>'.repeat(full)
    + (half ? '<span class="star-half">★</span>' : '')
    + '<span class="star-empty">☆</span>'.repeat(empty);
}

// Resolve the best available icon source for a project (local file preferred,
// then a freshly scraped Play Store icon). Returns '' when none is available.
function resolveIconSrc(project, scraped) {
  if (project.iconUrl) {
    const fullIconPath = path.join(ROOT, project.iconUrl);
    if (fs.existsSync(fullIconPath)) return project.iconUrl;
  }
  return (scraped && scraped.icon) || '';
}

// ─── Featured Project (flagship hero cards) ──────────
function getFeaturedHTML(project, scraped, index) {
  const isAndroid = project.platform === 'android' || !project.platform;
  const isWeb = project.platform === 'web';
  const isDesktop = project.platform === 'desktop';

  const iconSrc = resolveIconSrc(project, scraped);
  const iconHTML = iconSrc
    ? `<img class="feat-icon" src="${iconSrc}" alt="${escapeHtml(project.name)}" loading="lazy" />`
    : `<div class="feat-icon feat-icon-letter" style="background:${GRADIENTS[index % GRADIENTS.length]}">${escapeHtml(project.name.charAt(0).toUpperCase())}</div>`;

  let descriptionText = project.description || '';
  if (isAndroid && scraped && scraped.summary) descriptionText = scraped.summary;
  const descHTML = descriptionText ? `<p class="feat-desc">${escapeHtml(descriptionText)}</p>` : '';

  let statsHTML = '';
  if (isAndroid && scraped && scraped.score) {
    statsHTML = `
        <div class="feat-stats">
          <span class="feat-stat"><span class="stars">${getStars(scraped.score)}</span><span class="rating-value">${scraped.score.toFixed(1)}</span></span>
          ${scraped.installs ? `<span class="feat-stat"><span class="dl-icon">↓</span> ${escapeHtml(scraped.installs)}</span>` : ''}
        </div>`;
  }

  let actionsHTML = '';
  if (isAndroid) {
    const playStoreUrl = `https://play.google.com/store/apps/details?id=${project.package}`;
    actionsHTML = `
        <a href="${playStoreUrl}" target="_blank" rel="noopener" class="btn btn-android"><span class="btn-icon">▶</span> Play Store</a>
        ${project.githubUrl ? `<a href="${project.githubUrl}" target="_blank" rel="noopener" class="btn btn-ghost">💻 GitHub</a>` : ''}`;
  } else if (isWeb) {
    actionsHTML = `
        ${project.url ? `<a href="${project.url}" target="_blank" rel="noopener" class="btn btn-web">🌐 라이브 데모 열기</a>` : ''}
        ${project.githubUrl ? `<a href="${project.githubUrl}" target="_blank" rel="noopener" class="btn btn-ghost">💻 GitHub</a>` : ''}`;
  } else if (isDesktop) {
    const dlUrl = project.url || (project.githubUrl ? `${project.githubUrl}/releases` : '');
    actionsHTML = `
        ${project.githubUrl ? `<a href="${project.githubUrl}" target="_blank" rel="noopener" class="btn btn-desktop">💻 GitHub</a>` : ''}
        ${dlUrl ? `<a href="${dlUrl}" target="_blank" rel="noopener" class="btn btn-ghost">📥 Download</a>` : ''}`;
  }

  return `
      <article class="feat-card ${getPlatformClass(project.platform)}-accent" data-reveal style="--d:${(index * 0.1).toFixed(2)}s">
        <div class="feat-top">
          ${iconHTML}
          <div class="feat-head">
            <div class="feat-badges">
              <span class="platform-badge ${getPlatformClass(project.platform)}">${getPlatformLabel(project.platform)}</span>
              <span class="status-badge ${getStatusClass(project.status)}">${getStatusLabel(project.status)}</span>
            </div>
            <h3 class="feat-name">${escapeHtml(project.name)}</h3>
          </div>
        </div>
        ${descHTML}
        ${statsHTML}
        <div class="feat-actions">${actionsHTML}</div>
      </article>`;
}

// ─── Showcase Project (curated live web cards) ───────
function getShowcaseHTML(project, scraped, index) {
  const iconSrc = resolveIconSrc(project, scraped);
  const iconHTML = iconSrc
    ? `<img class="show-icon" src="${iconSrc}" alt="${escapeHtml(project.name)}" loading="lazy" />`
    : `<div class="show-icon show-icon-letter" style="background:${GRADIENTS[index % GRADIENTS.length]}">${escapeHtml(project.name.charAt(0).toUpperCase())}</div>`;

  const href = project.url || project.githubUrl || '#';
  const descHTML = project.description ? `<p class="show-desc">${escapeHtml(project.description)}</p>` : '';

  return `
      <a class="show-card" href="${href}" target="_blank" rel="noopener" data-reveal style="--d:${(index * 0.06).toFixed(2)}s">
        ${iconHTML}
        <div class="show-info">
          <h4 class="show-name">${escapeHtml(project.name)}</h4>
          ${descHTML}
        </div>
        <span class="show-go" aria-hidden="true">↗</span>
      </a>`;
}

// ─── CSS ─────────────────────────────────────────────
function getCSS() {
  return `
    :root {
      --bg-base: #050609;
      --bg-surface: #0a0b10;
      --bg-card: rgba(255, 255, 255, 0.024);
      --bg-card-hover: rgba(255, 255, 255, 0.05);
      --border: rgba(255, 255, 255, 0.06);
      --border-hover: rgba(255, 255, 255, 0.14);
      --text-primary: #f4f4f8;
      --text-secondary: #9a9aab;
      --text-muted: #5b5b70;

      --radius-sm: 10px;
      --radius-md: 14px;
      --radius-lg: 20px;
      --radius-xl: 28px;
      --radius-full: 100px;

      --color-android: #10b981;
      --color-android-bg: rgba(16, 185, 129, 0.08);
      --color-android-border: rgba(16, 185, 129, 0.22);

      --color-web: #3b82f6;
      --color-web-bg: rgba(59, 130, 246, 0.08);
      --color-web-border: rgba(59, 130, 246, 0.22);

      --color-desktop: #8b5cf6;
      --color-desktop-bg: rgba(139, 92, 246, 0.08);
      --color-desktop-border: rgba(139, 92, 246, 0.22);

      --color-amber: #f59e0b;
      --color-amber-bg: rgba(245, 158, 11, 0.08);
      --color-amber-border: rgba(245, 158, 11, 0.22);

      --color-gray: #6b7280;
      --color-gray-bg: rgba(107, 114, 128, 0.08);
      --color-gray-border: rgba(107, 114, 128, 0.2);
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html {
      scroll-behavior: smooth;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg-base);
      color: var(--text-primary);
      line-height: 1.6;
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* ── Animated Background Orbs ── */
    .bg-effects { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
    .bg-orb { position: absolute; border-radius: 50%; filter: blur(130px); opacity: 0.32; }
    .bg-orb-1 {
      width: 760px; height: 760px;
      background: radial-gradient(circle, rgba(139,92,246,0.10), transparent 70%);
      top: -280px; left: -160px;
      animation: orbFloat1 26s ease-in-out infinite;
    }
    .bg-orb-2 {
      width: 620px; height: 620px;
      background: radial-gradient(circle, rgba(59,130,246,0.08), transparent 70%);
      bottom: -220px; right: -120px;
      animation: orbFloat2 32s ease-in-out infinite;
    }
    .bg-orb-3 {
      width: 520px; height: 520px;
      background: radial-gradient(circle, rgba(16,185,129,0.06), transparent 70%);
      top: 38%; left: 46%;
      animation: orbFloat3 24s ease-in-out infinite;
    }
    @keyframes orbFloat1 {
      0%, 100% { transform: translate(0, 0) scale(1); }
      33% { transform: translate(45px, -35px) scale(1.04); }
      66% { transform: translate(-25px, 20px) scale(0.96); }
    }
    @keyframes orbFloat2 {
      0%, 100% { transform: translate(0, 0) scale(1); }
      40% { transform: translate(-40px, -20px) scale(1.03); }
      70% { transform: translate(30px, 20px) scale(0.95); }
    }
    @keyframes orbFloat3 {
      0%, 100% { transform: translate(-50%, 0) scale(1); }
      50% { transform: translate(-40%, -30px) scale(1.05); }
    }

    .container { max-width: 1080px; margin: 0 auto; padding: 0 24px; }

    /* ── Scroll Reveal ── */
    [data-reveal] {
      opacity: 0;
      transform: translateY(22px);
      transition: opacity 0.7s ease, transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
      transition-delay: var(--d, 0s);
    }
    [data-reveal].in { opacity: 1; transform: none; }
    @media (prefers-reduced-motion: reduce) {
      [data-reveal] { opacity: 1; transform: none; transition: none; }
      .bg-orb { animation: none; }
    }

    /* ── Hero ── */
    .hero {
      position: relative;
      padding: 104px 0 72px;
      text-align: center;
      border-bottom: 1px solid var(--border);
      background: radial-gradient(120% 80% at 50% -10%, rgba(139,92,246,0.10), transparent 60%);
    }
    .hero-avatar {
      width: 104px; height: 104px;
      border-radius: 50%;
      border: 3px solid rgba(139, 92, 246, 0.3);
      display: block;
      margin: 0 auto 26px;
      box-shadow: 0 0 40px rgba(139, 92, 246, 0.18);
      transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.4s ease;
    }
    .hero-avatar:hover { transform: scale(1.05); box-shadow: 0 0 50px rgba(139, 92, 246, 0.3); }
    .hero-name {
      font-size: clamp(2.6rem, 6vw, 3.8rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.05;
      background: linear-gradient(135deg, #ffffff 0%, #c4b5fd 45%, #818cf8 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 14px;
    }
    .hero-role {
      color: var(--text-secondary);
      font-size: 1.05rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      margin-bottom: 18px;
    }
    .hero-tagline {
      max-width: 620px;
      margin: 0 auto 30px;
      color: var(--text-primary);
      font-size: clamp(1.05rem, 2.4vw, 1.3rem);
      line-height: 1.65;
      font-weight: 500;
    }
    .hero-badges {
      display: flex; flex-wrap: wrap; gap: 8px;
      justify-content: center;
      margin-bottom: 34px;
    }
    .badge-img { height: 28px; border-radius: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
    .hero-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

    /* ── Primary / Hero buttons ── */
    .btn-primary {
      background: linear-gradient(135deg, #8b5cf6, #6366f1);
      color: #fff;
      padding: 13px 26px;
      font-size: 0.9rem;
      box-shadow: 0 8px 24px rgba(139, 92, 246, 0.28);
    }
    .btn-primary:hover { filter: brightness(1.08); transform: translateY(-2px); box-shadow: 0 12px 30px rgba(139, 92, 246, 0.4); }
    .btn-outline {
      background: var(--bg-card);
      color: var(--text-primary);
      border: 1px solid var(--border-hover);
      padding: 13px 26px;
      font-size: 0.9rem;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .btn-outline:hover { background: var(--bg-card-hover); transform: translateY(-2px); }

    /* ── Section ── */
    .section { padding: 72px 0; }
    .section + .section { padding-top: 0; }
    .section-head { text-align: center; margin-bottom: 44px; }
    .eyebrow {
      display: inline-block;
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #a78bfa;
      margin-bottom: 12px;
    }
    .section-title {
      font-size: clamp(1.7rem, 4vw, 2.3rem);
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      margin-bottom: 12px;
    }
    .section-sub { color: var(--text-secondary); font-size: 1rem; max-width: 540px; margin: 0 auto; }

    /* ── Featured Cards ── */
    .featured-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 22px;
    }
    @media (min-width: 800px) { .featured-grid { grid-template-columns: repeat(2, 1fr); } }

    .feat-card {
      position: relative;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      padding: 32px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.35s ease, box-shadow 0.35s ease;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .feat-card::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      padding: 1px;
      background: linear-gradient(140deg, var(--accent, rgba(255,255,255,0.18)), transparent 55%);
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      opacity: 0.55;
      pointer-events: none;
    }
    .feat-card.platform-android-accent { --accent: rgba(16, 185, 129, 0.55); }
    .feat-card.platform-web-accent { --accent: rgba(59, 130, 246, 0.55); }
    .feat-card.platform-desktop-accent { --accent: rgba(139, 92, 246, 0.55); }
    .feat-card:hover {
      transform: translateY(-6px);
      border-color: var(--border-hover);
      box-shadow: 0 26px 50px rgba(0, 0, 0, 0.42);
    }
    .feat-top { display: flex; gap: 18px; align-items: center; margin-bottom: 20px; }
    .feat-icon {
      width: 76px; height: 76px;
      border-radius: 18px;
      flex-shrink: 0;
      object-fit: cover;
      box-shadow: 0 6px 18px rgba(0,0,0,0.35);
    }
    .feat-icon-letter {
      display: flex; align-items: center; justify-content: center;
      font-size: 2rem; font-weight: 700; color: #fff;
      text-shadow: 0 1px 3px rgba(0,0,0,0.25);
    }
    .feat-head { min-width: 0; }
    .feat-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    .feat-name {
      font-size: 1.4rem;
      font-weight: 750;
      line-height: 1.25;
      letter-spacing: -0.01em;
      color: var(--text-primary);
    }
    .feat-desc {
      font-size: 0.94rem;
      color: var(--text-secondary);
      line-height: 1.7;
      margin-bottom: 20px;
      flex-grow: 1;
    }
    .feat-stats { display: flex; gap: 18px; margin-bottom: 22px; font-size: 0.86rem; align-items: center; }
    .feat-stat { display: inline-flex; align-items: center; gap: 6px; color: var(--text-secondary); }
    .stars { display: inline-flex; gap: 1px; font-size: 0.92rem; }
    .star-filled { color: #f59e0b; }
    .star-half { color: #f59e0b; opacity: 0.5; }
    .star-empty { color: rgba(255,255,255,0.1); }
    .rating-value { color: var(--text-primary); font-weight: 700; }
    .dl-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 18px; height: 18px; border-radius: 50%;
      background: rgba(16,185,129,0.12); color: var(--color-android);
      font-size: 0.7rem; font-weight: 700;
    }
    .feat-actions { display: flex; gap: 10px; margin-top: auto; flex-wrap: wrap; }

    /* ── Showcase Cards ── */
    .showcase-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }
    .show-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 18px 20px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border);
      background: var(--bg-card);
      text-decoration: none;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s ease, background 0.3s ease;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }
    .show-card:hover {
      transform: translateY(-4px);
      border-color: var(--color-web-border);
      background: var(--bg-card-hover);
    }
    .show-icon {
      width: 52px; height: 52px;
      border-radius: 13px;
      flex-shrink: 0;
      object-fit: cover;
      box-shadow: 0 3px 10px rgba(0,0,0,0.3);
    }
    .show-icon-letter {
      display: flex; align-items: center; justify-content: center;
      font-size: 1.3rem; font-weight: 700; color: #fff;
    }
    .show-info { min-width: 0; flex: 1; }
    .show-name {
      font-size: 0.98rem; font-weight: 700; color: var(--text-primary);
      margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .show-desc {
      font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .show-go {
      color: var(--text-muted); font-size: 1.1rem; flex-shrink: 0;
      transition: transform 0.3s ease, color 0.3s ease;
    }
    .show-card:hover .show-go { color: var(--color-web); transform: translate(2px, -2px); }

    /* ── Badges ── */
    .platform-badge, .status-badge {
      display: inline-flex; align-items: center;
      padding: 3px 10px;
      border-radius: var(--radius-full);
      font-size: 0.68rem; font-weight: 600; letter-spacing: 0.01em;
    }
    .platform-android { background: var(--color-android-bg); color: var(--color-android); border: 1px solid var(--color-android-border); }
    .platform-web { background: var(--color-web-bg); color: var(--color-web); border: 1px solid var(--color-web-border); }
    .platform-desktop { background: var(--color-desktop-bg); color: var(--color-desktop); border: 1px solid var(--color-desktop-border); }
    .status-production { background: var(--color-android-bg); color: var(--color-android); border: 1px solid var(--color-android-border); }
    .status-testing { background: var(--color-amber-bg); color: var(--color-amber); border: 1px solid var(--color-amber-border); }
    .status-draft { background: var(--color-gray-bg); color: var(--color-gray); border: 1px solid var(--color-gray-border); }

    /* ── Buttons (shared) ── */
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 18px;
      border-radius: var(--radius-sm);
      font-family: inherit; font-size: 0.82rem; font-weight: 600;
      text-decoration: none; cursor: pointer; border: none;
      white-space: nowrap; justify-content: center;
      transition: all 0.25s ease;
    }
    .btn-icon { font-size: 0.65rem; }
    .btn-android { background: linear-gradient(135deg, var(--color-android), #059669); color: #fff; }
    .btn-android:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 6px 14px rgba(16,185,129,0.24); }
    .btn-web { background: linear-gradient(135deg, var(--color-web), #2563eb); color: #fff; }
    .btn-web:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 6px 14px rgba(59,130,246,0.24); }
    .btn-desktop { background: linear-gradient(135deg, var(--color-desktop), #7c3aed); color: #fff; }
    .btn-desktop:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 6px 14px rgba(139,92,246,0.24); }
    .btn-ghost { background: transparent; color: var(--text-secondary); border: 1px solid var(--border); }
    .btn-ghost:hover { background: rgba(255,255,255,0.04); color: var(--text-primary); border-color: var(--border-hover); }

    /* ── CTA ── */
    .cta-card {
      text-align: center;
      padding: 56px 32px;
      border-radius: var(--radius-xl);
      border: 1px solid var(--border);
      background:
        radial-gradient(120% 120% at 50% 0%, rgba(139,92,246,0.12), transparent 60%),
        var(--bg-card);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .cta-title { font-size: clamp(1.5rem, 3.5vw, 2rem); font-weight: 800; letter-spacing: -0.02em; margin-bottom: 14px; }
    .cta-text { color: var(--text-secondary); max-width: 520px; margin: 0 auto 28px; line-height: 1.7; }

    /* ── Footer ── */
    .footer {
      text-align: center;
      padding: 40px 0 56px;
      color: var(--text-muted);
      font-size: 0.8rem;
      border-top: 1px solid var(--border);
    }
    .footer a { color: var(--text-secondary); text-decoration: none; transition: color 0.2s; }
    .footer a:hover { color: var(--text-primary); }
    .footer .update-time { margin-bottom: 8px; color: var(--text-muted); }
    .footer .links { display: flex; gap: 8px; justify-content: center; align-items: center; flex-wrap: wrap; }
    .footer .sep { color: var(--text-muted); opacity: 0.4; }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .hero { padding: 80px 0 56px; }
      .section { padding: 56px 0; }
      .feat-card { padding: 26px; }
      .feat-top { gap: 14px; }
      .feat-icon { width: 64px; height: 64px; }
      .feat-name { font-size: 1.25rem; }
    }
    @media (max-width: 480px) {
      .container { padding: 0 16px; }
      .hero-avatar { width: 88px; height: 88px; }
      .showcase-grid { grid-template-columns: 1fr; }
      .btn { flex: 1; }
      .feat-actions .btn { flex: 1; }
    }
  `;
}

// ─── JavaScript ──────────────────────────────────────
function getJS() {
  return `
    document.addEventListener('DOMContentLoaded', () => {
      const els = document.querySelectorAll('[data-reveal]');
      if (!els.length) return;

      if (!('IntersectionObserver' in window)) {
        els.forEach(el => el.classList.add('in'));
        return;
      }

      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

      els.forEach(el => io.observe(el));
    });
  `;
}

// ─── HTML Generator ──────────────────────────────────
function generateHTML(config, scrapedData) {
  const { developer, projects } = config;

  const visibleProjects = projects.filter(p => !p.hidden);
  const featured = visibleProjects.filter(p => p.featured);
  const showcase = visibleProjects.filter(p => p.showcase && !p.featured);
  const totalCount = visibleProjects.length;

  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + kstOffset);
  const timestamp = kst.toISOString().replace('T', ' ').substring(0, 16) + ' KST';

  const githubProfile = `https://github.com/${developer.githubUsername}`;
  const playUrl = `https://play.google.com/store/apps/dev?id=${developer.accountId}`;

  const tagline = developer.tagline
    || '낮에는 직장인이자 두 아들의 아빠, 밤에는 아이디어를 실제 제품으로 만드는 개발자입니다.';

  const featuredHTML = featured
    .map((p, i) => getFeaturedHTML(p, scrapedData[p.package] || null, i))
    .join('\n');

  const showcaseHTML = showcase
    .map((p, i) => getShowcaseHTML(p, scrapedData[p.package] || null, i))
    .join('\n');

  const featuredSection = featured.length ? `
    <section class="section">
      <div class="container">
        <div class="section-head" data-reveal>
          <span class="eyebrow">Featured</span>
          <h2 class="section-title">굵직한 대표작</h2>
          <p class="section-sub">가장 자신 있게 보여드리는, 끝까지 만들어 배포한 프로젝트입니다.</p>
        </div>
        <div class="featured-grid">
          ${featuredHTML}
        </div>
      </div>
    </section>` : '';

  const showcaseSection = showcase.length ? `
    <section class="section">
      <div class="container">
        <div class="section-head" data-reveal>
          <span class="eyebrow">Live on the web</span>
          <h2 class="section-title">바로 써볼 수 있는 웹 경험</h2>
          <p class="section-sub">클릭하면 실제 배포된 사이트가 새 탭으로 열립니다.</p>
        </div>
        <div class="showcase-grid">
          ${showcaseHTML}
        </div>
      </div>
    </section>` : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(developer.name)} — Portfolio</title>
  <meta name="description" content="${escapeHtml(developer.name)}의 개발 포트폴리오. 대표작과 라이브 웹 프로젝트를 만나보세요." />
  <meta name="author" content="${escapeHtml(developer.name)}" />
  <meta property="og:title" content="${escapeHtml(developer.name)} — Portfolio" />
  <meta property="og:description" content="${escapeHtml(tagline)}" />
  <meta property="og:type" content="website" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="icon" href="favicon.png" type="image/png" />
  <style>${getCSS()}</style>
</head>
<body>
  <div class="bg-effects">
    <div class="bg-orb bg-orb-1"></div>
    <div class="bg-orb bg-orb-2"></div>
    <div class="bg-orb bg-orb-3"></div>
  </div>

  <header class="hero">
    <div class="container">
      <img
        class="hero-avatar"
        src="https://github.com/${developer.githubUsername}.png"
        alt="${escapeHtml(developer.name)}"
        width="104"
        height="104"
      />
      <h1 class="hero-name">${escapeHtml(developer.name)}</h1>
      <p class="hero-role">${escapeHtml(developer.description || 'Developer')}</p>
      <p class="hero-tagline">${escapeHtml(tagline)}</p>

      <div class="hero-badges">
        <img class="badge-img" src="https://img.shields.io/badge/40대-아재개발자-FF6B35?style=for-the-badge" alt="40대 아재개발자" />
        <img class="badge-img" src="https://img.shields.io/badge/두%20아들-육아중인%20아빠-4A90D9?style=for-the-badge" alt="두 아들 육아중인 아빠" />
        <img class="badge-img" src="https://img.shields.io/badge/9to6-직장인-17A589?style=for-the-badge" alt="9to6 직장인" />
        <img class="badge-img" src="https://img.shields.io/badge/개발자-바이브코더-8E44AD?style=for-the-badge" alt="개발자 바이브코더" />
        <img class="badge-img" src="https://img.shields.io/badge/예수님을%20믿는-크리스챤-C0392B?style=for-the-badge" alt="크리스챤" />
      </div>

      <div class="hero-cta">
        <a href="${githubProfile}" target="_blank" rel="noopener" class="btn btn-primary">💻 GitHub 프로필 보기 →</a>
        <a href="${playUrl}" target="_blank" rel="noopener" class="btn btn-outline">▶ Google Play</a>
      </div>
    </div>
  </header>

  <main>
    ${featuredSection}
    ${showcaseSection}

    <section class="section">
      <div class="container">
        <div class="cta-card" data-reveal>
          <h2 class="cta-title">더 많은 프로젝트가 궁금하다면</h2>
          <p class="cta-text">지금까지 직접 기획하고 만들어 배포한 ${totalCount}여 개의 앱과 레포지토리가 GitHub 프로필에 모두 정리돼 있습니다.</p>
          <a href="${githubProfile}" target="_blank" rel="noopener" class="btn btn-primary">GitHub에서 전체 보기 →</a>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="container">
      <p class="update-time">Last updated: ${timestamp}</p>
      <p class="links">
        <a href="${githubProfile}" target="_blank" rel="noopener">GitHub Profile</a>
        <span class="sep">·</span>
        <a href="${playUrl}" target="_blank" rel="noopener">Google Play Dev</a>
        <span class="sep">·</span>
        <span>Powered by GitHub Actions</span>
      </p>
    </div>
  </footer>

  <script>${getJS()}</script>
</body>
</html>`;
}

// ─── Main ────────────────────────────────────────────
async function main() {
  console.log('📱 Building curated app portfolio...\n');

  const config = JSON.parse(fs.readFileSync(APPS_JSON, 'utf-8'));

  await syncGitHubProjects(config);

  // Validate and lock down Android package names
  validateAndroidPackages(config.projects);

  const cache = loadCache();

  const androidApps = config.projects.filter(p => (p.platform === 'android' || !p.platform) && !p.hidden);
  await promotePublishedTestingApps(config, cache);

  // 1. Scrape Android production apps (full data from Play Store)
  const productionApps = androidApps.filter(a => a.status === 'production');

  if (productionApps.length > 0) {
    console.log(`🔍 Scraping ${productionApps.length} production Android app(s) from Play Store...`);
    for (const app of productionApps) {
      let data = await scrapeApp(app.package);

      if (!data) {
        data = await scrapePlayStoreHTML(app.package);
      }

      if (data) {
        cache[app.package] = { ...data, _lastScraped: new Date().toISOString() };
        await ensureLocalIcon(app, data);
        console.log(`  ✓ ${app.name}`);
      } else {
        console.log(`  ✗ No data for ${app.name}`);
      }
    }
    console.log('');
  }

  saveCache(cache);

  // Generate HTML
  console.log('🎨 Generating HTML...');
  const html = generateHTML(config, cache).replace(/[ \t]+$/gm, '');
  fs.writeFileSync(OUTPUT_HTML, html, 'utf-8');

  const totalVisible = config.projects.filter(p => !p.hidden).length;
  console.log(`✅ Portfolio saved: ${OUTPUT_HTML}`);
  console.log(`   Total visible projects: ${totalVisible}`);
}

// Run only when executed directly so the render functions can be dry-rendered
// or unit-tested without triggering the network build pipeline.
if (require.main === module) {
  main().catch(err => {
    console.error('❌ Build failed:', err);
    process.exit(1);
  });
}

module.exports = {
  generateHTML,
  getFeaturedHTML,
  getShowcaseHTML,
  getCSS,
  getJS,
};
