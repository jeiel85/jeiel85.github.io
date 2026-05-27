const gplay = require('google-play-scraper');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Paths ───────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const APPS_JSON = path.join(ROOT, 'apps.json');
const CACHE_JSON = path.join(__dirname, 'cache.json');
const OUTPUT_HTML = path.join(ROOT, 'index.html');

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

async function scrapePlayStoreHTML(packageName) {
  try {
    const url = `https://play.google.com/store/apps/details?id=${packageName}&hl=ko&gl=kr`;
    console.log(`  Fallback HTML scraping: ${packageName}...`);
    const { status, html } = await fetchPage(url);

    if (status !== 200) {
      console.warn(`  ⚠ Play Store returned ${status} for ${packageName}`);
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
    console.warn(`  ⚠ Fallback scraping failed for ${packageName}: ${err.message}`);
    return null;
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

// ─── Card HTML Generator ─────────────────────────────
function getCardHTML(project, scraped, index) {
  const isAndroid = project.platform === 'android' || !project.platform;
  const isWeb = project.platform === 'web';
  const isDesktop = project.platform === 'desktop';

  // 1. Icon configuration with existence check
  let iconHTML;
  let hasLocalIcon = false;
  if (project.iconUrl) {
    const fullIconPath = path.join(ROOT, project.iconUrl);
    if (fs.existsSync(fullIconPath)) {
      hasLocalIcon = true;
    }
  }

  const iconSrc = hasLocalIcon ? project.iconUrl : (scraped && scraped.icon);
  if (iconSrc) {
    iconHTML = `<img class="app-icon" src="${iconSrc}" alt="${escapeHtml(project.name)}" loading="lazy" />`;
  } else {
    const gradient = GRADIENTS[index % GRADIENTS.length];
    const letter = project.name.charAt(0).toUpperCase();
    iconHTML = `<div class="app-icon-letter" style="background: ${gradient}">${letter}</div>`;
  }

  // 2. Title & Package/Repo Area
  const subLabel = isAndroid 
    ? project.package 
    : (project.githubUrl ? project.githubUrl.replace('https://github.com/', '') : 'Open Source');

  // 3. Description (manual has priority for non-Android, scraped for Android)
  let descriptionText = project.description || '';
  if (isAndroid && scraped && scraped.summary) {
    descriptionText = scraped.summary;
  }
  const descHTML = descriptionText ? `<p class="app-desc">${escapeHtml(descriptionText)}</p>` : '';

  // 4. Stats (rating, downloads - Android only)
  let statsHTML = '';
  if (isAndroid && scraped && scraped.score) {
    statsHTML = `
      <div class="app-stats">
        <span class="stat-rating" title="Rating: ${scraped.score ? scraped.score.toFixed(1) : 'N/A'}">
          <span class="stars">${getStars(scraped.score)}</span>
          <span class="rating-value">${scraped.score ? scraped.score.toFixed(1) : ''}</span>
        </span>
        ${scraped.installs ? `<span class="stat-downloads"><span class="dl-icon">↓</span> ${scraped.installs}</span>` : ''}
      </div>`;
  }

  // 5. Category/Genre badge
  let genreHTML = '';
  if (isAndroid && scraped && scraped.genre) {
    genreHTML = `<span class="app-genre">${escapeHtml(scraped.genre)}</span>`;
  }

  // 6. Action buttons
  let buttonsHTML = '';
  if (isAndroid) {
    const playStoreUrl = `https://play.google.com/store/apps/details?id=${project.package}`;
    const optInUrl = project.optInUrl || `https://play.google.com/apps/testing/${project.package}`;
    if (project.status === 'production') {
      buttonsHTML = `
        <div class="app-actions">
          <a href="${playStoreUrl}" target="_blank" rel="noopener" class="btn btn-android">
            <span class="btn-icon">▶</span> Play Store
          </a>
        </div>`;
    } else if (project.status === 'closed_testing') {
      buttonsHTML = `
        <div class="app-actions">
          <a href="${optInUrl}" target="_blank" rel="noopener" class="btn btn-secondary">
            🧪 Join Beta
          </a>
          <a href="${playStoreUrl}" target="_blank" rel="noopener" class="btn btn-ghost">
            ▶ Play Store
          </a>
        </div>`;
    } else {
      buttonsHTML = `
        <div class="app-actions">
          <span class="btn btn-disabled">🚧 Coming Soon</span>
        </div>`;
    }
  } else if (isWeb) {
    buttonsHTML = `
      <div class="app-actions">
        ${project.url ? `
        <a href="${project.url}" target="_blank" rel="noopener" class="btn btn-web">
          🌐 Launch Web App
        </a>` : ''}
        ${project.githubUrl ? `
        <a href="${project.githubUrl}" target="_blank" rel="noopener" class="btn btn-ghost">
          💻 GitHub
        </a>` : ''}
      </div>`;
  } else if (isDesktop) {
    buttonsHTML = `
      <div class="app-actions">
        ${project.githubUrl ? `
        <a href="${project.githubUrl}" target="_blank" rel="noopener" class="btn btn-desktop">
          💾 Download / GitHub
        </a>` : ''}
        ${project.url ? `
        <a href="${project.url}" target="_blank" rel="noopener" class="btn btn-ghost">
          📥 Direct Download
        </a>` : ''}
      </div>`;
  }

  return `
    <article class="app-card" data-platform="${project.platform || 'android'}" style="animation-delay: ${index * 0.05}s">
      <div class="card-header">
        ${iconHTML}
        <div class="card-title-area">
          <h3 class="app-name" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</h3>
          <span class="app-package" title="${subLabel}">${subLabel}</span>
        </div>
      </div>
      ${descHTML}
      <div class="card-meta">
        <span class="platform-badge ${getPlatformClass(project.platform)}">${getPlatformLabel(project.platform)}</span>
        <span class="status-badge ${getStatusClass(project.status)}">${getStatusLabel(project.status)}</span>
        ${genreHTML}
      </div>
      ${statsHTML}
      ${buttonsHTML}
    </article>`;
}

// ─── CSS ─────────────────────────────────────────────
function getCSS() {
  return `
    :root {
      --bg-base: #040508;
      --bg-surface: #0a0b10;
      --bg-card: rgba(255, 255, 255, 0.022);
      --bg-card-hover: rgba(255, 255, 255, 0.045);
      --border: rgba(255, 255, 255, 0.05);
      --border-hover: rgba(255, 255, 255, 0.12);
      --text-primary: #f3f3f7;
      --text-secondary: #8e8e9f;
      --text-muted: #535368;
      
      --radius-sm: 10px;
      --radius-md: 14px;
      --radius-lg: 20px;
      --radius-full: 100px;

      /* Platform Colors */
      --color-android: #10b981;
      --color-android-bg: rgba(16, 185, 129, 0.08);
      --color-android-border: rgba(16, 185, 129, 0.22);
      
      --color-web: #3b82f6;
      --color-web-bg: rgba(59, 130, 246, 0.08);
      --color-web-border: rgba(59, 130, 246, 0.22);

      --color-desktop: #8b5cf6;
      --color-desktop-bg: rgba(139, 92, 246, 0.08);
      --color-desktop-border: rgba(139, 92, 246, 0.22);

      --color-ios: #f43f5e;
      --color-ios-bg: rgba(244, 63, 94, 0.08);
      --color-ios-border: rgba(244, 63, 94, 0.22);

      --color-amber: #f59e0b;
      --color-amber-bg: rgba(245, 158, 11, 0.08);
      --color-amber-border: rgba(245, 158, 11, 0.22);

      --color-gray: #6b7280;
      --color-gray-bg: rgba(107, 114, 128, 0.08);
      --color-gray-border: rgba(107, 114, 128, 0.2);
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

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
    .bg-effects {
      position: fixed;
      inset: 0;
      z-index: -1;
      overflow: hidden;
      pointer-events: none;
    }
    .bg-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(120px);
      opacity: 0.35;
    }
    .bg-orb-1 {
      width: 750px; height: 750px;
      background: radial-gradient(circle, rgba(16,185,129,0.07), transparent 70%);
      top: -250px; left: -150px;
      animation: orbFloat1 25s ease-in-out infinite;
    }
    .bg-orb-2 {
      width: 600px; height: 600px;
      background: radial-gradient(circle, rgba(139,92,246,0.06), transparent 70%);
      bottom: -200px; right: -100px;
      animation: orbFloat2 30s ease-in-out infinite;
    }
    .bg-orb-3 {
      width: 500px; height: 500px;
      background: radial-gradient(circle, rgba(59,130,246,0.05), transparent 70%);
      top: 35%; left: 45%;
      animation: orbFloat3 22s ease-in-out infinite;
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

    /* ── Container ── */
    .container {
      max-width: 1140px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* ── Header ── */
    .header {
      padding: 64px 0 40px;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(180deg, rgba(10,11,16,0.5) 0%, transparent 100%);
    }
    
    .profile-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 32px;
      align-items: center;
    }
    
    @media (min-width: 860px) {
      .profile-grid {
        grid-template-columns: 1.2fr 1fr;
      }
    }

    .profile-left {
      text-align: center;
    }
    
    @media (min-width: 860px) {
      .profile-left {
        text-align: left;
      }
    }

    .dev-avatar {
      width: 96px;
      height: 96px;
      border-radius: 50%;
      border: 3px solid rgba(139, 92, 246, 0.25);
      margin: 0 auto 20px;
      display: block;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    @media (min-width: 860px) {
      .dev-avatar {
        margin: 0 0 20px 0;
      }
    }
    
    .dev-avatar:hover {
      border-color: rgba(139, 92, 246, 0.5);
      box-shadow: 0 0 30px rgba(139, 92, 246, 0.15);
      transform: scale(1.05);
    }
    .dev-name {
      font-size: 2.8rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      background: linear-gradient(135deg, #ffffff 0%, #c4b5fd 40%, #818cf8 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    .dev-subtitle {
      color: var(--text-secondary);
      font-size: 1.15rem;
      font-weight: 500;
      margin-bottom: 16px;
    }

    /* ── Profile Badges ── */
    .profile-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-bottom: 24px;
    }
    @media (min-width: 860px) {
      .profile-badges {
        justify-content: flex-start;
      }
    }
    .badge-img {
      height: 28px;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.15);
    }

    /* ── Stats ── */
    .stats-row {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    @media (min-width: 860px) {
      .stats-row {
        justify-content: flex-start;
      }
    }
    .stat-box {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 12px 20px;
      text-align: center;
      min-width: 100px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .stat-box:hover {
      border-color: var(--border-hover);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    }
    .stat-value {
      font-size: 1.6rem;
      font-weight: 700;
      color: var(--text-primary);
    }
    .stat-value.android { color: var(--color-android); }
    .stat-value.web { color: var(--color-web); }
    .stat-value.desktop { color: var(--color-desktop); }
    .stat-value.gray { color: var(--color-gray); }
    .stat-label {
      font-size: 0.72rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 3px;
    }

    /* ── GitHub Widget Box ── */
    .github-box {
      background: rgba(255, 255, 255, 0.015);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 20px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    
    .github-box-title {
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .github-box-title::before {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-android);
      box-shadow: 0 0 10px var(--color-android);
    }
    
    .github-graph-img {
      width: 100%;
      border-radius: var(--radius-sm);
      filter: drop-shadow(0 4px 12px rgba(0,0,0,0.15));
      transition: transform 0.3s ease;
    }
    .github-graph-img:hover {
      transform: scale(1.01);
    }

    /* ── Filter ── */
    .filter-bar {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin: 40px 0 28px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 8px 20px;
      border-radius: var(--radius-full);
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-secondary);
      font-family: inherit;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.25s ease;
      outline: none;
      user-select: none;
    }
    .filter-btn:hover {
      background: rgba(255,255,255,0.04);
      color: var(--text-primary);
      border-color: var(--border-hover);
    }
    .filter-btn.active {
      background: rgba(255,255,255,0.07);
      color: var(--text-primary);
      border-color: rgba(255,255,255,0.18);
      box-shadow: 0 0 12px rgba(255,255,255,0.02);
    }
    .filter-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: rgba(255,255,255,0.07);
      font-size: 0.68rem;
      margin-left: 6px;
      color: var(--text-secondary);
    }
    .filter-btn.active .filter-count {
      background: rgba(255,255,255,0.15);
      color: var(--text-primary);
    }

    /* ── Grid ── */
    .app-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
      gap: 20px;
      padding-bottom: 64px;
    }

    /* ── Card ── */
    .app-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      display: flex;
      flex-direction: column;
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 0;
      transform: translateY(24px);
      animation: cardIn 0.5s ease forwards;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }
    .app-card:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-hover);
      transform: translateY(-5px);
      box-shadow:
        0 20px 40px rgba(0, 0, 0, 0.35),
        0 0 0 1px rgba(255,255,255,0.04) inset;
    }
    .app-card.hidden {
      display: none;
    }

    @keyframes cardIn {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* ── Card Header ── */
    .card-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 16px;
    }
    .app-icon {
      width: 56px;
      height: 56px;
      border-radius: var(--radius-sm);
      flex-shrink: 0;
      object-fit: cover;
      box-shadow: 0 3px 8px rgba(0,0,0,0.3);
    }
    .app-icon-letter {
      width: 56px;
      height: 56px;
      border-radius: var(--radius-sm);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
      font-weight: 700;
      color: #fff;
      text-shadow: 0 1px 3px rgba(0,0,0,0.2);
      box-shadow: 0 3px 8px rgba(0,0,0,0.3);
    }
    .card-title-area {
      min-width: 0;
      flex: 1;
    }
    .app-name {
      font-size: 1.05rem;
      font-weight: 700;
      line-height: 1.35;
      color: var(--text-primary);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .app-package {
      font-size: 0.72rem;
      color: var(--text-muted);
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
      margin-top: 3px;
    }

    /* ── Description ── */
    .app-desc {
      font-size: 0.86rem;
      color: var(--text-secondary);
      line-height: 1.6;
      margin-bottom: 16px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      flex-grow: 1; /* Pushes the buttons to the bottom of the card */
    }

    /* ── Meta (badges) ── */
    .card-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    
    .platform-badge, .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      border-radius: var(--radius-full);
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.01em;
    }

    .platform-android {
      background: var(--color-android-bg);
      color: var(--color-android);
      border: 1px solid var(--color-android-border);
    }
    .platform-web {
      background: var(--color-web-bg);
      color: var(--color-web);
      border: 1px solid var(--color-web-border);
    }
    .platform-desktop {
      background: var(--color-desktop-bg);
      color: var(--color-desktop);
      border: 1px solid var(--color-desktop-border);
    }
    .platform-ios {
      background: var(--color-ios-bg);
      color: var(--color-ios);
      border: 1px solid var(--color-ios-border);
    }

    .status-production {
      background: var(--color-android-bg);
      color: var(--color-android);
      border: 1px solid var(--color-android-border);
    }
    .status-testing {
      background: var(--color-amber-bg);
      color: var(--color-amber);
      border: 1px solid var(--color-amber-border);
    }
    .status-draft {
      background: var(--color-gray-bg);
      color: var(--color-gray);
      border: 1px solid var(--color-gray-border);
    }
    
    .app-genre {
      font-size: 0.7rem;
      color: var(--text-muted);
      padding: 2px 8px;
      border-radius: var(--radius-full);
      border: 1px solid var(--border);
    }

    /* ── Stats ── */
    .app-stats {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
      font-size: 0.8rem;
    }
    .stat-rating {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .stars {
      display: inline-flex;
      gap: 1px;
      font-size: 0.82rem;
    }
    .star-filled { color: #f59e0b; }
    .star-half { color: #f59e0b; opacity: 0.5; }
    .star-empty { color: rgba(255,255,255,0.08); }
    .rating-value {
      color: var(--text-secondary);
      font-weight: 600;
    }
    .stat-downloads {
      color: var(--text-secondary);
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .dl-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: rgba(16,185,129,0.1);
      color: var(--color-android);
      font-size: 0.65rem;
      font-weight: 700;
    }

    /* ── Buttons ── */
    .app-actions {
      display: flex;
      gap: 8px;
      margin-top: auto; /* Aligns all actions perfectly to bottom */
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 16px;
      border-radius: var(--radius-sm);
      font-family: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.25s ease;
      cursor: pointer;
      border: none;
      white-space: nowrap;
      flex: 1;
      justify-content: center;
    }
    .btn-icon {
      font-size: 0.65rem;
    }
    
    .btn-android {
      background: linear-gradient(135deg, var(--color-android), #059669);
      color: #fff;
    }
    .btn-android:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
      box-shadow: 0 6px 14px rgba(16,185,129,0.22);
    }
    
    .btn-web {
      background: linear-gradient(135deg, var(--color-web), #2563eb);
      color: #fff;
    }
    .btn-web:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
      box-shadow: 0 6px 14px rgba(59,130,246,0.22);
    }

    .btn-desktop {
      background: linear-gradient(135deg, var(--color-desktop), #7c3aed);
      color: #fff;
    }
    .btn-desktop:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
      box-shadow: 0 6px 14px rgba(139,92,246,0.22);
    }

    .btn-secondary {
      background: var(--color-amber-bg);
      color: var(--color-amber);
      border: 1px solid var(--color-amber-border);
    }
    .btn-secondary:hover {
      background: rgba(245,158,11,0.16);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(245,158,11,0.12);
    }
    .btn-ghost {
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }
    .btn-ghost:hover {
      background: rgba(255,255,255,0.035);
      color: var(--text-primary);
      border-color: var(--border-hover);
    }
    .btn-disabled {
      background: var(--color-gray-bg);
      color: var(--color-gray);
      cursor: default;
      border: 1px solid var(--color-gray-border);
      flex: 1;
    }

    /* ── No Results ── */
    .no-results {
      text-align: center;
      color: var(--text-muted);
      padding: 60px 0;
      font-size: 0.95rem;
      display: none;
    }

    /* ── Footer ── */
    .footer {
      text-align: center;
      padding: 40px 0 56px;
      color: var(--text-muted);
      font-size: 0.8rem;
      border-top: 1px solid var(--border);
      background: linear-gradient(0deg, rgba(10,11,16,0.4) 0%, transparent 100%);
    }
    .footer a {
      color: var(--text-secondary);
      text-decoration: none;
      transition: color 0.2s;
    }
    .footer a:hover {
      color: var(--text-primary);
    }
    .footer .update-time {
      margin-bottom: 8px;
      color: var(--text-muted);
    }
    .footer .links {
      display: flex;
      gap: 8px;
      justify-content: center;
      align-items: center;
    }
    .footer .sep {
      color: var(--text-muted);
      opacity: 0.4;
    }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .header { padding: 48px 0 32px; }
      .dev-name { font-size: 2.2rem; }
      .stats-row { gap: 8px; }
      .stat-box { padding: 10px 16px; min-width: 85px; }
      .stat-value { font-size: 1.4rem; }
      .app-grid { grid-template-columns: 1fr; gap: 16px; }
      .filter-bar { gap: 6px; margin: 32px 0 24px; }
      .filter-btn { padding: 6px 16px; font-size: 0.8rem; }
    }
    @media (max-width: 480px) {
      .container { padding: 0 16px; }
      .dev-avatar { width: 76px; height: 76px; }
      .dev-name { font-size: 1.8rem; }
      .stat-box { min-width: 75px; padding: 8px 12px; }
      .stat-value { font-size: 1.2rem; }
      .app-card { padding: 20px; }
    }
  `;
}

// ─── JavaScript ──────────────────────────────────────
function getJS() {
  return `
    document.addEventListener('DOMContentLoaded', () => {
      const filterBtns = document.querySelectorAll('.filter-btn');
      const cards = document.querySelectorAll('.app-card');
      const noResults = document.querySelector('.no-results');

      filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          filterBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          const filter = btn.dataset.filter;
          let visibleCount = 0;

          cards.forEach((card) => {
            const match = filter === 'all' || card.dataset.platform === filter;
            card.classList.toggle('hidden', !match);
            if (match) {
              visibleCount++;
              // Re-trigger animation
              card.style.animation = 'none';
              card.offsetHeight;
              card.style.animationDelay = (visibleCount * 0.03) + 's';
              card.style.animation = '';
            }
          });

          if (noResults) {
            noResults.style.display = visibleCount === 0 ? 'block' : 'none';
          }
        });
      });
    });
  `;
}

// ─── HTML Generator ──────────────────────────────────
function generateHTML(config, scrapedData) {
  const { developer, projects } = config;

  // Filter out hidden projects early!
  const visibleProjects = projects.filter(p => !p.hidden);

  const counts = {
    total: visibleProjects.length,
    android: visibleProjects.filter(p => p.platform === 'android' || !p.platform).length,
    web: visibleProjects.filter(p => p.platform === 'web').length,
    desktop: visibleProjects.filter(p => p.platform === 'desktop').length,
  };

  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + kstOffset);
  const timestamp = kst.toISOString().replace('T', ' ').substring(0, 16) + ' KST';

  const cardsHTML = visibleProjects.map((project, i) => {
    const scraped = scrapedData[project.package] || null;
    return getCardHTML(project, scraped, i);
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(developer.name)} — Portfolio</title>
  <meta name="description" content="${escapeHtml(developer.name)}의 개발 포트폴리오. ${counts.total}개의 프로젝트를 확인해보세요." />
  <meta name="author" content="${escapeHtml(developer.name)}" />
  <meta property="og:title" content="${escapeHtml(developer.name)} — Portfolio" />
  <meta property="og:description" content="Android ${counts.android}개 | Web ${counts.web}개 | Desktop ${counts.desktop}개" />
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

  <header class="header">
    <div class="container">
      <div class="profile-grid">
        <div class="profile-left">
          <img
            class="dev-avatar"
            src="https://github.com/${developer.githubUsername}.png"
            alt="${escapeHtml(developer.name)}"
            width="96"
            height="96"
          />
          <h1 class="dev-name">${escapeHtml(developer.name)}</h1>
          <p class="dev-subtitle">${escapeHtml(developer.description || 'Developer')}</p>
          
          <div class="profile-badges">
            <img class="badge-img" src="https://img.shields.io/badge/40대-아재개발자-FF6B35?style=for-the-badge" alt="40대 아재개발자" />
            <img class="badge-img" src="https://img.shields.io/badge/두%20아들-육아중인%20아빠-4A90D9?style=for-the-badge" alt="두 아들 육아중인 아빠" />
            <img class="badge-img" src="https://img.shields.io/badge/9to6-직장인-17A589?style=for-the-badge" alt="9to6 직장인" />
            <img class="badge-img" src="https://img.shields.io/badge/개발자-바이브코더-8E44AD?style=for-the-badge" alt="개발자 바이브코더" />
            <img class="badge-img" src="https://img.shields.io/badge/예수님을%20믿는-크리스챤-C0392B?style=for-the-badge" alt="크리스챤" />
          </div>

          <div class="stats-row">
            <div class="stat-box">
              <div class="stat-value">${counts.total}</div>
              <div class="stat-label">Total</div>
            </div>
            <div class="stat-box">
              <div class="stat-value android">${counts.android}</div>
              <div class="stat-label">Android</div>
            </div>
            <div class="stat-box">
              <div class="stat-value web">${counts.web}</div>
              <div class="stat-label">Web</div>
            </div>
            <div class="stat-box">
              <div class="stat-value desktop">${counts.desktop}</div>
              <div class="stat-label">Desktop</div>
            </div>
          </div>
        </div>

        <div class="profile-right">
          <div class="github-box">
            <div class="github-box-title">GitHub Activity Graph</div>
            <a href="https://github.com/${developer.githubUsername}" target="_blank" rel="noopener">
              <img
                class="github-graph-img"
                src="https://github-readme-activity-graph.vercel.app/graph?username=${developer.githubUsername}&theme=react-dark"
                alt="GitHub Activity Graph"
                loading="lazy"
              />
            </a>
          </div>
        </div>
      </div>
    </div>
  </header>

  <main class="container">
    <div class="filter-bar">
      <button class="filter-btn active" data-filter="all">All<span class="filter-count">${counts.total}</span></button>
      <button class="filter-btn" data-filter="android">📱 Android<span class="filter-count">${counts.android}</span></button>
      <button class="filter-btn" data-filter="web">🌐 Web<span class="filter-count">${counts.web}</span></button>
      <button class="filter-btn" data-filter="desktop">💻 Desktop<span class="filter-count">${counts.desktop}</span></button>
    </div>

    <div class="app-grid" id="app-grid">
      ${cardsHTML}
    </div>

    <div class="no-results">No projects found for this filter.</div>
  </main>

  <footer class="footer">
    <div class="container">
      <p class="update-time">Last updated: ${timestamp}</p>
      <p class="links">
        <a href="https://github.com/${developer.githubUsername}" target="_blank">GitHub Profile</a>
        <span class="sep">·</span>
        <a href="https://play.google.com/store/apps/dev?id=${developer.accountId}" target="_blank">Google Play Dev</a>
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
  console.log('📱 Building expanded app portfolio...\n');

  const config = JSON.parse(fs.readFileSync(APPS_JSON, 'utf-8'));
  const cache = loadCache();

  // 1. Scrape Android production apps (full data from Play Store)
  const androidApps = config.projects.filter(p => (p.platform === 'android' || !p.platform) && !p.hidden);
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

main().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
