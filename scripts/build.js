const gplay = require('google-play-scraper');
const fs = require('fs');
const path = require('path');
const https = require('https');

const { getGitHubSnapshot } = require('./github');
const { renderPage } = require('./render');

// ─── Paths ───────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const APPS_JSON = path.join(ROOT, 'apps.json');
const CACHE_JSON = path.join(__dirname, 'cache.json');
const OUTPUT_HTML = path.join(ROOT, 'index.html');

// Repositories that are not projects (profile README, this site, tooling).
const EXPLORER_EXCLUDED_REPOS = new Set([
  'AGENTS.md',
  'homebrew-tap',
  'jeiel85',
  'jeiel85.github.io',
]);
// Companion repos (design guides) belong to an app, not a project of their own.
const EXPLORER_EXCLUDED_SUFFIXES = ['-designguide'];

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

  for (const [pkg, name] of Object.entries(LOCKED_ANDROID_PACKAGES)) {
    const matchingProj = projects.find(p => p.package === pkg);
    if (!matchingProj) {
      const sameNameProj = projects.find(p => p.name === name);
      if (sameNameProj) {
        throw new Error(`[Lockdown Violation] Package name for "${name}" has been modified from "${pkg}" to "${sameNameProj.package}"! Android package names are locked down.`);
      } else {
        throw new Error(`[Lockdown Violation] Locked Android project "${name}" (${pkg}) has been removed from apps.json!`);
      }
    }
  }

  for (const proj of projects) {
    if (proj.platform === 'android' || !proj.platform) {
      if (!proj.package) {
        throw new Error(`[Validation Error] Android project "${proj.name}" is missing a "package" field.`);
      }
      const packageRegex = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+[0-9a-z_]$/i;
      if (!packageRegex.test(proj.package)) {
        throw new Error(`[Validation Error] Android project "${proj.name}" has an invalid package name format: "${proj.package}".`);
      }
      if (proj.optInUrl && !proj.optInUrl.includes(proj.package)) {
        throw new Error(`[Validation Error] Android project "${proj.name}" has an optInUrl ("${proj.optInUrl}") that does not match its package name ("${proj.package}").`);
      }
    }
  }
  console.log('✅ Android package names validated successfully (No modifications detected).\n');
}

// ─── Play Store scraping ─────────────────────────────
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
      screenshots: Array.isArray(data.screenshots) ? data.screenshots.slice(0, 8) : [],
    };
  } catch (err) {
    console.warn(`  ⚠ Failed to scrape ${packageName}: ${err.message}`);
    return null;
  }
}

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
      if (!quiet) console.warn(`  ⚠ Play Store returned ${status} for ${packageName}`);
      return null;
    }

    const result = {};
    const iconMatches = html.match(/https:\/\/play-lh\.googleusercontent\.com\/[^"'\s\])>]+/gi) || [];
    if (iconMatches.length > 0) {
      result.icon = iconMatches[0].split('=')[0] + '=w240-h240-rw';
    }
    const titleMatch = html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)
      || html.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i);
    if (titleMatch) result.title = titleMatch[1];
    const descMatch = html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i)
      || html.match(/content=["']([^"']+)["']\s+property=["']og:description["']/i);
    if (descMatch) result.summary = descMatch[1];

    // Store screenshots carry data-screenshot-index; each appears twice (gallery + lightbox).
    const shots = [];
    const shotRe = /<img\b[^>]*\bsrc="(https:\/\/play-lh\.googleusercontent\.com\/[^"=]+)[^"]*"[^>]*data-screenshot-index="\d+"/gi;
    let m;
    while ((m = shotRe.exec(html)) && shots.length < 8) {
      if (!shots.includes(m[1])) shots.push(m[1]);
    }
    if (shots.length) result.screenshots = shots;

    const installs = html.match(/>([\d.,]+(?:천|만|억)?\+)<\/div><div[^>]*>다운로드/);
    if (installs) result.installs = installs[1];
    const rating = html.match(/aria-label="별표 5개 만점에 ([\d.]+)개/);
    if (rating) result.score = Number(rating[1]);

    return Object.keys(result).length > 0 ? result : null;
  } catch (err) {
    if (!quiet) console.warn(`  ⚠ Fallback scraping failed for ${packageName}: ${err.message}`);
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

// ─── Play cache & icons ──────────────────────────────
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

// ─── Model ───────────────────────────────────────────
const GAME_TOPICS = new Set([
  'game', 'games', 'gamedev', 'game-development', 'browser-game', 'indie-game', 'android-game',
  'html5-game', 'webgl-game', 'web-game', 'godot', 'godot-engine', 'godot4', 'unity', 'unity3d',
  'roguelike', 'roguelite', 'rpg', 'arpg', 'idle-game', 'puzzle-game', 'racing-game', 'platformer',
  'shooter', 'fps', 'arcade', 'arcade-game', 'survival-game', 'cozy-game', 'rhythm-game',
  'tower-defense', 'phaser', 'game-engine', 'pixel-art', 'voxel', 'strategy-game', 'simulation-game',
]);
const DESKTOP_TOPICS = new Set(['windows', 'desktop-app', 'desktop', 'wpf', 'winforms', 'tauri', 'electron', 'windows-11', 'windows-10', 'system-tray', 'tray-app']);
const CLI_TOPICS = new Set(['cli', 'command-line', 'terminal', 'cli-tool', 'library', 'sdk']);

function repoNameFromUrl(url) {
  const m = (url || '').match(/github\.com\/[^/]+\/([^/#?]+)/i);
  return m ? m[1].replace(/\.git$/, '').toLowerCase() : null;
}

function repoDisplayName(repoName) {
  const upper = { ai: 'AI', cli: 'CLI', pdf: 'PDF', pwa: 'PWA', qr: 'QR', ui: 'UI', fps: 'FPS', rpg: 'RPG', '3d': '3D', '2d': '2D', gta: 'GTA', lotr: 'LOTR', ar: 'AR' };
  return repoName
    .split(/[-_]/)
    .filter(Boolean)
    .map(part => {
      const lower = part.toLowerCase();
      if (upper[lower]) return upper[lower];
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function isGame(repo, text) {
  if (repo && repo.topics.some(t => GAME_TOPICS.has(t))) return true;
  if (repo && repo.primaryLanguage === 'GDScript') return true;
  return /게임|\bgame\b|roguelite|roguelike/i.test(text || '');
}

function categorize(project, repo) {
  const text = `${project ? project.description || '' : ''} ${repo ? repo.description : ''}`;
  if (isGame(repo, text)) return 'game';
  if (project && project.platform) {
    if (project.platform === 'android' || project.platform === 'desktop') return project.platform;
  }
  if (repo) {
    const name = repo.name.toLowerCase();
    if (name.endsWith('-android') || repo.topics.includes('android') || repo.topics.includes('android-app')) return 'android';
    if (/-(windows|desktop)$/.test(name) || repo.topics.some(t => DESKTOP_TOPICS.has(t))) return 'desktop';
    if (repo.topics.some(t => CLI_TOPICS.has(t)) || /\bCLI\b/.test(repo.description)) return 'tool';
  }
  if (project && project.platform === 'web') return 'web';
  return repo && repo.homepage ? 'web' : 'tool';
}

function isHttpsUrl(url) {
  return typeof url === 'string' && /^https:\/\//i.test(url);
}

function playScreenshotUrl(url) {
  // Play image URLs accept a size suffix; request a phone-friendly height.
  return url.includes('=') ? url.replace(/=[^=]*$/, '=h720') : `${url}=h720`;
}

function buildProject({ project, repo, scraped, developer }) {
  const isAndroid = project && (project.platform === 'android' || !project.platform);
  const category = categorize(project, repo);
  const title = project ? project.name : repoDisplayName(repo.name);

  let description = (project && project.description) || (repo && repo.description) || '';
  if (isAndroid && scraped && scraped.summary) description = scraped.summary;

  const images = [];
  if (scraped && Array.isArray(scraped.screenshots)) {
    scraped.screenshots.filter(isHttpsUrl).forEach(url => images.push({ url: playScreenshotUrl(url), alt: `${title} 스크린샷`, portrait: true }));
  }
  if (repo) repo.images.filter(img => isHttpsUrl(img.url)).forEach(img => images.push({ url: img.url, alt: img.alt || `${title} 미리보기` }));

  const homepage = (project && project.url) || (repo && repo.homepage) || '';
  const live = isHttpsUrl(homepage) && !/github\.com\//i.test(homepage) ? homepage : '';

  const links = {
    live,
    github: repo ? repo.url : '',
    play: isAndroid && project.status === 'production' ? `https://play.google.com/store/apps/details?id=${project.package}` : '',
    optIn: isAndroid && project.optInUrl ? project.optInUrl : '',
    releases: repo && repo.releases > 0 ? `${repo.url}/releases` : '',
  };

  // Delivery channels: how this project actually reaches people.
  const channels = [];
  if (isAndroid && project.status === 'production') channels.push('play');
  if (isAndroid && project.status === 'closed_testing') channels.push('testing');
  if (repo && repo.releases > 0) channels.push('release');
  if (live) channels.push('live');
  if (repo && repo.workflows > 0) channels.push('ci');
  if (!channels.length) channels.push('source');

  let icon = '';
  if (project && project.iconUrl && fs.existsSync(path.join(ROOT, project.iconUrl))) icon = project.iconUrl;
  else if (scraped && isHttpsUrl(scraped.icon)) icon = scraped.icon;

  const id = repo ? repo.name.toLowerCase() : (project.package || title).toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return {
    id,
    title,
    description,
    excerpt: repo ? repo.excerpt : '',
    category,
    platform: project ? project.platform || 'android' : null,
    status: project ? project.status : 'source',
    curated: Boolean(project),
    featured: Boolean(project && project.featured),
    icon,
    images: images.slice(0, 10),
    channels,
    links,
    repo: repo ? repo.name : null,
    stars: repo ? repo.stars : 0,
    commits: repo ? repo.commits : 0,
    releases: repo ? repo.releases : 0,
    latestRelease: repo ? repo.latestRelease : null,
    workflows: repo ? repo.workflows : 0,
    createdAt: repo ? repo.createdAt : null,
    pushedAt: repo ? repo.pushedAt : null,
    archived: repo ? repo.archived : false,
    license: repo ? repo.license : null,
    primaryLanguage: repo ? repo.primaryLanguage : null,
    languages: repo ? repo.languages : [],
    topics: repo ? repo.topics : [],
    play: scraped && isAndroid && project.status === 'production' ? {
      score: scraped.score || null,
      installs: scraped.installs || null,
      version: scraped.version || null,
      genre: scraped.genre || null,
    } : null,
  };
}

function computeCalendarStats(calendar) {
  if (!calendar || !Array.isArray(calendar.days) || !calendar.days.length) return null;
  const days = calendar.days;
  let longest = 0;
  let run = 0;
  let busiest = days[0];
  for (const d of days) {
    if (d.count > 0) { run++; longest = Math.max(longest, run); } else { run = 0; }
    if (d.count > busiest.count) busiest = d;
  }
  // Current streak may still be open today (today's count can be zero until evening).
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) current++;
    else if (i === days.length - 1) continue;
    else break;
  }
  return {
    total: calendar.total,
    activeDays: days.filter(d => d.count > 0).length,
    span: days.length,
    longestStreak: longest,
    currentStreak: current,
    busiest,
  };
}

function monthKey(iso) {
  return iso.slice(0, 7);
}

function buildModel(config, playCache, snapshot) {
  const { developer } = config;
  const repos = snapshot && Array.isArray(snapshot.repos) ? snapshot.repos : [];
  const repoByName = new Map(repos.map(r => [r.name.toLowerCase(), r]));
  // A curated project marked hidden must also keep its repository out of discovery.
  const hiddenProjectRepos = config.projects.filter(p => p.hidden).map(p => repoNameFromUrl(p.githubUrl)).filter(Boolean);
  const hiddenRepos = new Set([...EXPLORER_EXCLUDED_REPOS, ...(config.hiddenRepos || []), ...hiddenProjectRepos].map(n => n.toLowerCase()));

  const projects = [];
  const usedRepos = new Set();
  for (const project of config.projects.filter(p => !p.hidden)) {
    const repoName = repoNameFromUrl(project.githubUrl);
    const repo = repoName ? repoByName.get(repoName) || null : null;
    if (repoName && !repo && repos.length) {
      console.warn(`  ⚠ ${project.name}: ${project.githubUrl} is not a public repository; GitHub link hidden.`);
    }
    if (repo) usedRepos.add(repo.name.toLowerCase());
    projects.push(buildProject({ project, repo, scraped: playCache[project.package] || null, developer }));
  }
  for (const repo of repos) {
    const key = repo.name.toLowerCase();
    if (usedRepos.has(key) || hiddenRepos.has(key)) continue;
    if (EXPLORER_EXCLUDED_SUFFIXES.some(suffix => key.endsWith(suffix))) continue;
    projects.push(buildProject({ project: null, repo, scraped: null, developer }));
  }

  // Aggregates over every public non-fork repository.
  const languageBytes = new Map();
  for (const repo of repos) {
    for (const lang of repo.languages) {
      const entry = languageBytes.get(lang.name) || { name: lang.name, color: lang.color, bytes: 0, repos: 0 };
      entry.bytes += lang.bytes;
      languageBytes.set(lang.name, entry);
    }
    if (repo.primaryLanguage && languageBytes.has(repo.primaryLanguage)) {
      languageBytes.get(repo.primaryLanguage).repos++;
    }
  }
  const totalBytes = [...languageBytes.values()].reduce((s, l) => s + l.bytes, 0) || 1;
  const languages = [...languageBytes.values()]
    .sort((a, b) => b.bytes - a.bytes)
    .map(l => ({ ...l, share: l.bytes / totalBytes }));

  const TOPIC_STOPLIST = new Set(['korean', 'hacktoberfest', 'portfolio', 'github-pages']);
  const topicCounts = new Map();
  for (const repo of repos) {
    for (const t of repo.topics) {
      if (TOPIC_STOPLIST.has(t)) continue;
      topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
    }
  }
  const topics = [...topicCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .filter(t => t.count >= 2)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 36);

  // New repositories per month over the last 12 months.
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ key: d.toISOString().slice(0, 7), month: d.getUTCMonth() + 1, year: d.getUTCFullYear(), created: 0 });
  }
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));
  for (const repo of repos) {
    const idx = monthIndex.get(monthKey(repo.createdAt));
    if (idx !== undefined) months[idx].created++;
  }

  const android = config.projects.filter(p => !p.hidden && (p.platform === 'android' || !p.platform));
  const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
  const stats = {
    publicRepos: repos.length,
    commits: repos.reduce((s, r) => s + r.commits, 0),
    releases: repos.reduce((s, r) => s + r.releases, 0),
    releasedRepos: repos.filter(r => r.releases > 0).length,
    stars: repos.reduce((s, r) => s + r.stars, 0),
    ciRepos: repos.filter(r => r.workflows > 0).length,
    workflows: repos.reduce((s, r) => s + r.workflows, 0),
    liveSites: projects.filter(p => p.links.live).length,
    activeLastMonth: repos.filter(r => Date.parse(r.pushedAt) >= monthAgo).length,
    playLive: android.filter(p => p.status === 'production').length,
    playTesting: android.filter(p => p.status === 'closed_testing').length,
    androidApps: android.length,
    languages: languages.length,
  };

  const recent = projects
    .filter(p => p.pushedAt)
    .sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt))
    .slice(0, 8)
    .map(p => p.id);

  return {
    developer: {
      name: developer.name,
      role: developer.description || 'Developer',
      tagline: developer.tagline || '',
      github: `https://github.com/${developer.githubUsername}`,
      githubUsername: developer.githubUsername,
      play: `https://play.google.com/store/apps/dev?id=${developer.accountId}`,
    },
    generatedAt: new Date().toISOString(),
    snapshotAt: snapshot ? snapshot.fetchedAt : null,
    calendar: snapshot && snapshot.calendar ? snapshot.calendar : null,
    calendarStats: computeCalendarStats(snapshot && snapshot.calendar),
    stats,
    months,
    languages,
    topics,
    recent,
    projects,
  };
}

// ─── Main ────────────────────────────────────────────
async function main() {
  console.log('📱 Building portfolio...\n');

  const config = JSON.parse(fs.readFileSync(APPS_JSON, 'utf-8'));
  validateAndroidPackages(config.projects);

  const snapshot = await getGitHubSnapshot(config.developer.githubUsername);
  if (!snapshot) console.warn('  ⚠ No GitHub data available (no token and no cache). GitHub sections will be omitted.\n');

  const cache = loadCache();
  const androidApps = config.projects.filter(p => (p.platform === 'android' || !p.platform) && !p.hidden);
  await promotePublishedTestingApps(config, cache);

  const productionApps = androidApps.filter(a => a.status === 'production');
  if (productionApps.length > 0) {
    console.log(`🔍 Scraping ${productionApps.length} production Android app(s) from Play Store...`);
    for (const app of productionApps) {
      let data = await scrapeApp(app.package);
      if (!data) data = await scrapePlayStoreHTML(app.package);
      if (data) {
        cache[app.package] = { ...(cache[app.package] || {}), ...data, _lastScraped: new Date().toISOString() };
        await ensureLocalIcon(app, data);
        console.log(`  ✓ ${app.name}`);
      } else {
        console.log(`  ✗ No data for ${app.name} (keeping cached store data)`);
      }
    }
    console.log('');
  }
  saveCache(cache);

  console.log('🎨 Generating HTML...');
  const model = buildModel(config, cache, snapshot);
  const html = renderPage(model).replace(/[ \t]+$/gm, '');
  fs.writeFileSync(OUTPUT_HTML, html, 'utf-8');

  console.log(`✅ Portfolio saved: ${OUTPUT_HTML}`);
  console.log(`   Projects in explorer: ${model.projects.length} (${model.projects.filter(p => p.curated).length} curated)`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Build failed:', err);
    process.exit(1);
  });
}

module.exports = { buildModel, categorize, repoDisplayName };
