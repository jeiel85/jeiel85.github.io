const gplay = require('google-play-scraper');
const fs = require('fs');
const path = require('path');

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

// ─── Helpers ─────────────────────────────────────────
function escapeHtml(str) {
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
    default: return status;
  }
}

function getStatusClass(status) {
  switch (status) {
    case 'production': return 'status-production';
    case 'closed_testing': return 'status-testing';
    case 'draft': return 'status-draft';
    default: return '';
  }
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
function getCardHTML(app, scraped, index) {
  const playStoreUrl = `https://play.google.com/store/apps/details?id=${app.package}`;
  const optInUrl = app.optInUrl || `https://play.google.com/apps/testing/${app.package}`;

  // Icon
  let iconHTML;
  if (scraped && scraped.icon) {
    iconHTML = `<img class="app-icon" src="${scraped.icon}" alt="${escapeHtml(app.name)}" loading="lazy" />`;
  } else {
    const gradient = GRADIENTS[index % GRADIENTS.length];
    const letter = app.name.charAt(0).toUpperCase();
    iconHTML = `<div class="app-icon-letter" style="background: ${gradient}">${letter}</div>`;
  }

  // Description
  let descHTML = '';
  if (scraped && scraped.summary) {
    descHTML = `<p class="app-desc">${escapeHtml(scraped.summary)}</p>`;
  }

  // Stats (rating, downloads)
  let statsHTML = '';
  if (scraped && scraped.score) {
    statsHTML = `
      <div class="app-stats">
        <span class="stat-rating" title="Rating: ${scraped.score ? scraped.score.toFixed(1) : 'N/A'}">
          <span class="stars">${getStars(scraped.score)}</span>
          <span class="rating-value">${scraped.score ? scraped.score.toFixed(1) : ''}</span>
        </span>
        ${scraped.installs ? `<span class="stat-downloads"><span class="dl-icon">↓</span> ${scraped.installs}</span>` : ''}
      </div>`;
  }

  // Genre badge
  let genreHTML = '';
  if (scraped && scraped.genre) {
    genreHTML = `<span class="app-genre">${escapeHtml(scraped.genre)}</span>`;
  }

  // Action buttons
  let buttonsHTML = '';
  if (app.status === 'production') {
    buttonsHTML = `
      <div class="app-actions">
        <a href="${playStoreUrl}" target="_blank" rel="noopener" class="btn btn-primary">
          <span class="btn-icon">▶</span> Play Store
        </a>
      </div>`;
  } else if (app.status === 'closed_testing') {
    buttonsHTML = `
      <div class="app-actions">
        <a href="${optInUrl}" target="_blank" rel="noopener" class="btn btn-secondary">
          🧪 Join Beta
        </a>
        <a href="${playStoreUrl}" target="_blank" rel="noopener" class="btn btn-ghost">
          ▶ Play Store
        </a>
      </div>`;
  } else if (app.status === 'draft') {
    buttonsHTML = `
      <div class="app-actions">
        <span class="btn btn-disabled">🚧 Coming Soon</span>
      </div>`;
  }

  return `
    <article class="app-card" data-status="${app.status}" style="animation-delay: ${index * 0.06}s">
      <div class="card-header">
        ${iconHTML}
        <div class="card-title-area">
          <h3 class="app-name" title="${escapeHtml(app.name)}">${escapeHtml(app.name)}</h3>
          <span class="app-package">${app.package}</span>
        </div>
      </div>
      ${descHTML}
      <div class="card-meta">
        <span class="status-badge ${getStatusClass(app.status)}">${getStatusLabel(app.status)}</span>
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
      --bg-base: #06070a;
      --bg-surface: #0c0d12;
      --bg-card: rgba(255, 255, 255, 0.025);
      --bg-card-hover: rgba(255, 255, 255, 0.045);
      --border: rgba(255, 255, 255, 0.06);
      --border-hover: rgba(255, 255, 255, 0.13);
      --text-primary: #f0f0f5;
      --text-secondary: #8b8b9e;
      --text-muted: #55556a;
      --green: #10b981;
      --green-bg: rgba(16, 185, 129, 0.1);
      --green-border: rgba(16, 185, 129, 0.25);
      --amber: #f59e0b;
      --amber-bg: rgba(245, 158, 11, 0.1);
      --amber-border: rgba(245, 158, 11, 0.25);
      --gray: #6b7280;
      --gray-bg: rgba(107, 114, 128, 0.1);
      --gray-border: rgba(107, 114, 128, 0.25);
      --blue: #3b82f6;
      --purple: #8b5cf6;
      --radius-sm: 10px;
      --radius-md: 14px;
      --radius-lg: 20px;
      --radius-full: 100px;
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
      filter: blur(100px);
      opacity: 0.4;
    }
    .bg-orb-1 {
      width: 700px; height: 700px;
      background: radial-gradient(circle, rgba(16,185,129,0.07), transparent 70%);
      top: -250px; left: -150px;
      animation: orbFloat1 25s ease-in-out infinite;
    }
    .bg-orb-2 {
      width: 550px; height: 550px;
      background: radial-gradient(circle, rgba(139,92,246,0.06), transparent 70%);
      bottom: -200px; right: -100px;
      animation: orbFloat2 30s ease-in-out infinite;
    }
    .bg-orb-3 {
      width: 400px; height: 400px;
      background: radial-gradient(circle, rgba(59,130,246,0.04), transparent 70%);
      top: 40%; left: 50%;
      animation: orbFloat3 20s ease-in-out infinite;
    }

    @keyframes orbFloat1 {
      0%, 100% { transform: translate(0, 0) scale(1); }
      33% { transform: translate(40px, -30px) scale(1.05); }
      66% { transform: translate(-20px, 25px) scale(0.97); }
    }
    @keyframes orbFloat2 {
      0%, 100% { transform: translate(0, 0) scale(1); }
      40% { transform: translate(-35px, -25px) scale(1.03); }
      70% { transform: translate(25px, 15px) scale(0.96); }
    }
    @keyframes orbFloat3 {
      0%, 100% { transform: translate(-50%, 0) scale(1); }
      50% { transform: translate(-50%, -40px) scale(1.08); }
    }

    /* ── Container ── */
    .container {
      max-width: 1120px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* ── Header ── */
    .header {
      text-align: center;
      padding: 72px 0 48px;
    }
    .dev-avatar {
      width: 92px;
      height: 92px;
      border-radius: 50%;
      border: 3px solid rgba(139, 92, 246, 0.3);
      margin: 0 auto 22px;
      display: block;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 0 0 0 rgba(139, 92, 246, 0);
    }
    .dev-avatar:hover {
      border-color: rgba(139, 92, 246, 0.6);
      box-shadow: 0 0 30px rgba(139, 92, 246, 0.15);
      transform: scale(1.05);
    }
    .dev-name {
      font-size: 2.6rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      background: linear-gradient(135deg, #ffffff 0%, #c4b5fd 40%, #818cf8 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 6px;
    }
    .dev-subtitle {
      color: var(--text-secondary);
      font-size: 1.05rem;
      font-weight: 400;
    }

    /* ── Stats ── */
    .stats-row {
      display: flex;
      gap: 14px;
      justify-content: center;
      margin-top: 36px;
      flex-wrap: wrap;
    }
    .stat-box {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 18px 28px;
      text-align: center;
      min-width: 120px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .stat-box:hover {
      border-color: var(--border-hover);
      transform: translateY(-3px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    }
    .stat-value {
      font-size: 1.8rem;
      font-weight: 700;
      color: var(--text-primary);
    }
    .stat-value.green { color: var(--green); }
    .stat-value.amber { color: var(--amber); }
    .stat-value.gray { color: var(--gray); }
    .stat-label {
      font-size: 0.78rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-top: 4px;
    }

    /* ── Filter ── */
    .filter-bar {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin: 44px 0 32px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 8px 22px;
      border-radius: var(--radius-full);
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-secondary);
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.25s ease;
      outline: none;
      user-select: none;
    }
    .filter-btn:hover {
      background: rgba(255,255,255,0.05);
      color: var(--text-primary);
      border-color: var(--border-hover);
    }
    .filter-btn.active {
      background: rgba(255,255,255,0.08);
      color: var(--text-primary);
      border-color: rgba(255,255,255,0.2);
      box-shadow: 0 0 12px rgba(255,255,255,0.03);
    }
    .filter-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      border-radius: 10px;
      background: rgba(255,255,255,0.08);
      font-size: 0.7rem;
      margin-left: 6px;
    }

    /* ── Grid ── */
    .app-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
      gap: 18px;
      padding-bottom: 60px;
    }

    /* ── Card ── */
    .app-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 0;
      transform: translateY(24px);
      animation: cardIn 0.5s ease forwards;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .app-card:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-hover);
      transform: translateY(-5px);
      box-shadow:
        0 20px 50px rgba(0, 0, 0, 0.3),
        0 0 0 1px rgba(255,255,255,0.05) inset;
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
      margin-bottom: 14px;
    }
    .app-icon {
      width: 54px;
      height: 54px;
      border-radius: var(--radius-sm);
      flex-shrink: 0;
      object-fit: cover;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .app-icon-letter {
      width: 54px;
      height: 54px;
      border-radius: var(--radius-sm);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.35rem;
      font-weight: 700;
      color: #fff;
      text-shadow: 0 1px 3px rgba(0,0,0,0.25);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .card-title-area {
      min-width: 0;
      flex: 1;
    }
    .app-name {
      font-size: 1rem;
      font-weight: 600;
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
      margin-top: 2px;
    }

    /* ── Description ── */
    .app-desc {
      font-size: 0.85rem;
      color: var(--text-secondary);
      line-height: 1.55;
      margin-bottom: 14px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* ── Meta (badges) ── */
    .card-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      border-radius: var(--radius-full);
      font-size: 0.73rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .status-production {
      background: var(--green-bg);
      color: var(--green);
      border: 1px solid var(--green-border);
    }
    .status-testing {
      background: var(--amber-bg);
      color: var(--amber);
      border: 1px solid var(--amber-border);
    }
    .status-draft {
      background: var(--gray-bg);
      color: var(--gray);
      border: 1px solid var(--gray-border);
    }
    .app-genre {
      font-size: 0.72rem;
      color: var(--text-muted);
      padding: 3px 10px;
      border-radius: var(--radius-full);
      border: 1px solid var(--border);
    }

    /* ── Stats ── */
    .app-stats {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 14px;
      font-size: 0.82rem;
    }
    .stat-rating {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .stars {
      display: inline-flex;
      gap: 1px;
      font-size: 0.85rem;
    }
    .star-filled { color: #fbbf24; }
    .star-half { color: #fbbf24; opacity: 0.5; }
    .star-empty { color: rgba(255,255,255,0.12); }
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
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(59,130,246,0.1);
      color: var(--blue);
      font-size: 0.7rem;
      font-weight: 700;
    }

    /* ── Buttons ── */
    .app-actions {
      display: flex;
      gap: 8px;
      margin-top: 6px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 18px;
      border-radius: var(--radius-sm);
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: 500;
      text-decoration: none;
      transition: all 0.25s ease;
      cursor: pointer;
      border: none;
      white-space: nowrap;
    }
    .btn-icon {
      font-size: 0.7rem;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--green), #059669);
      color: #fff;
    }
    .btn-primary:hover {
      filter: brightness(1.15);
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(16,185,129,0.3);
    }
    .btn-secondary {
      background: var(--amber-bg);
      color: var(--amber);
      border: 1px solid var(--amber-border);
    }
    .btn-secondary:hover {
      background: rgba(245,158,11,0.18);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(245,158,11,0.15);
    }
    .btn-ghost {
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }
    .btn-ghost:hover {
      background: rgba(255,255,255,0.05);
      color: var(--text-primary);
      border-color: var(--border-hover);
    }
    .btn-disabled {
      background: var(--gray-bg);
      color: var(--gray);
      cursor: default;
      border: 1px solid var(--gray-border);
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
      padding: 36px 0 52px;
      color: var(--text-muted);
      font-size: 0.8rem;
      border-top: 1px solid var(--border);
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
      .header { padding: 52px 0 36px; }
      .dev-name { font-size: 2rem; }
      .stats-row { gap: 10px; }
      .stat-box { padding: 14px 20px; min-width: 100px; }
      .stat-value { font-size: 1.5rem; }
      .app-grid { grid-template-columns: 1fr; gap: 14px; }
      .filter-bar { gap: 6px; }
      .filter-btn { padding: 7px 16px; font-size: 0.8rem; }
    }
    @media (max-width: 480px) {
      .container { padding: 0 16px; }
      .dev-avatar { width: 68px; height: 68px; }
      .dev-name { font-size: 1.6rem; }
      .stat-box { min-width: 85px; padding: 12px 16px; }
      .stat-value { font-size: 1.3rem; }
      .app-card { padding: 18px; }
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
            const match = filter === 'all' || card.dataset.status === filter;
            card.classList.toggle('hidden', !match);
            if (match) {
              visibleCount++;
              // Re-trigger animation
              card.style.animation = 'none';
              card.offsetHeight;
              card.style.animationDelay = (visibleCount * 0.04) + 's';
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
  const { developer, apps } = config;

  const counts = {
    total: apps.length,
    production: apps.filter(a => a.status === 'production').length,
    testing: apps.filter(a => a.status === 'closed_testing').length,
    draft: apps.filter(a => a.status === 'draft').length,
  };

  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + kstOffset);
  const timestamp = kst.toISOString().replace('T', ' ').substring(0, 16) + ' KST';

  const cardsHTML = apps.map((app, i) => {
    const scraped = scrapedData[app.package] || null;
    return getCardHTML(app, scraped, i);
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(developer.name)} — App Portfolio</title>
  <meta name="description" content="${escapeHtml(developer.name)}의 Android 앱 포트폴리오. ${counts.total}개의 앱을 확인해보세요." />
  <meta name="author" content="${escapeHtml(developer.name)}" />
  <meta property="og:title" content="${escapeHtml(developer.name)} — App Portfolio" />
  <meta property="og:description" content="Android 앱 ${counts.total}개 | Production ${counts.production} | Testing ${counts.testing}" />
  <meta property="og:type" content="website" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
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
      <img
        class="dev-avatar"
        src="https://github.com/${developer.githubUsername}.png"
        alt="${escapeHtml(developer.name)}"
        width="92"
        height="92"
      />
      <h1 class="dev-name">${escapeHtml(developer.name)}</h1>
      <p class="dev-subtitle">${escapeHtml(developer.description || 'App Developer')}</p>

      <div class="stats-row">
        <div class="stat-box">
          <div class="stat-value">${counts.total}</div>
          <div class="stat-label">Total Apps</div>
        </div>
        <div class="stat-box">
          <div class="stat-value green">${counts.production}</div>
          <div class="stat-label">Production</div>
        </div>
        <div class="stat-box">
          <div class="stat-value amber">${counts.testing}</div>
          <div class="stat-label">Testing</div>
        </div>
        ${counts.draft > 0 ? `
        <div class="stat-box">
          <div class="stat-value gray">${counts.draft}</div>
          <div class="stat-label">Draft</div>
        </div>` : ''}
      </div>
    </div>
  </header>

  <main class="container">
    <div class="filter-bar">
      <button class="filter-btn active" data-filter="all">All<span class="filter-count">${counts.total}</span></button>
      <button class="filter-btn" data-filter="production">Production<span class="filter-count">${counts.production}</span></button>
      <button class="filter-btn" data-filter="closed_testing">Testing<span class="filter-count">${counts.testing}</span></button>
      ${counts.draft > 0 ? `<button class="filter-btn" data-filter="draft">Draft<span class="filter-count">${counts.draft}</span></button>` : ''}
    </div>

    <div class="app-grid" id="app-grid">
      ${cardsHTML}
    </div>

    <div class="no-results">No apps found for this filter.</div>
  </main>

  <footer class="footer">
    <div class="container">
      <p class="update-time">Last updated: ${timestamp}</p>
      <p class="links">
        <a href="https://github.com/${developer.githubUsername}" target="_blank">GitHub</a>
        <span class="sep">·</span>
        <a href="https://play.google.com/store/apps/dev?id=${developer.accountId}" target="_blank">Google Play</a>
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
  console.log('📱 Building app portfolio...\n');

  const config = JSON.parse(fs.readFileSync(APPS_JSON, 'utf-8'));
  const cache = loadCache();

  // Scrape production apps
  const productionApps = config.apps.filter(a => a.status === 'production');
  if (productionApps.length > 0) {
    console.log(`🔍 Scraping ${productionApps.length} production app(s)...`);
    for (const app of productionApps) {
      const data = await scrapeApp(app.package);
      if (data) {
        cache[app.package] = { ...data, _lastScraped: new Date().toISOString() };
        console.log(`  ✓ ${app.name}`);
      } else if (cache[app.package]) {
        console.log(`  ↻ Using cached data for ${app.name}`);
      }
    }
    saveCache(cache);
    console.log('');
  }

  // Generate HTML
  console.log('🎨 Generating HTML...');
  const html = generateHTML(config, cache);
  fs.writeFileSync(OUTPUT_HTML, html, 'utf-8');

  console.log(`✅ Portfolio saved: ${OUTPUT_HTML}`);
  console.log(`   Total apps: ${config.apps.length}`);
  console.log(`   Production: ${productionApps.length}`);
  console.log(`   Scraped data cached: ${Object.keys(cache).length} app(s)`);
}

main().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
