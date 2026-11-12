// Page renderer: turns the build model into a single static index.html.
// Server-renders everything that reads well without JavaScript (hero skyline,
// featured work, operations, stack); the project explorer is rendered by
// client.js from the embedded JSON model.

const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf-8');
const CLIENT_JS = fs.readFileSync(path.join(__dirname, 'client.js'), 'utf-8');

const CATEGORY = {
  android: { label: 'Android 앱' },
  web: { label: '웹' },
  desktop: { label: '데스크톱' },
  game: { label: '게임' },
  tool: { label: '도구·CLI' },
};

const CHANNEL = {
  play: 'Google Play 출시',
  testing: 'Play 비공개 테스트',
  release: 'GitHub Releases',
  live: '웹에서 바로 열기',
  ci: 'CI 자동화',
  source: '소스 공개',
};

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const num = n => Number(n || 0).toLocaleString('ko-KR');
const dateDot = iso => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '');

function kstTimestamp(iso) {
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  return `${d.toISOString().slice(0, 16).replace('T', ' ').replace(/-/g, '.')} KST`;
}

// ─── Skyline: one window per day, one building per month ──────────
function quartileLevels(days) {
  const counts = days.map(d => d.count).filter(c => c > 0).sort((a, b) => a - b);
  if (!counts.length) return () => 0;
  const q = p => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))];
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  return c => (c <= 0 ? 0 : c <= q1 ? 1 : c <= q2 ? 2 : c <= q3 ? 3 : 4);
}

function renderSkyline(calendar) {
  if (!calendar || !calendar.days || !calendar.days.length) return '';

  const level = quartileLevels(calendar.days);
  const columns = [];
  for (const day of calendar.days) {
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    if (!columns.length || weekday === 0) columns.push([]);
    columns[columns.length - 1].push({ ...day, weekday });
  }

  const buildings = [];
  for (const col of columns) {
    const key = col[0].date.slice(0, 7);
    const last = buildings[buildings.length - 1];
    if (last && last.key === key) last.cols.push(col);
    else buildings.push({ key, cols: [col] });
  }
  buildings.forEach(b => { b.total = b.cols.flat().reduce((s, d) => s + d.count, 0); });
  const maxTotal = Math.max(1, ...buildings.map(b => b.total));
  const busiestKey = buildings.reduce((a, b) => (b.total > a.total ? b : a)).key;

  const WIN_W = 10, WIN_H = 8, GX = 4, GY = 5, PADX = 7, PADTOP = 10, PADBOT = 9, GAP = 6;
  const SIGN = 36, ROOF_MAX = 84, ROOF_MIN = 10;
  const floors = 7 * WIN_H + 6 * GY;
  const bodyH = PADTOP + floors + PADBOT;
  const groundY = SIGN + ROOF_MAX + bodyH;
  const height = groundY + 8;

  let x = 4;
  let colIndex = 0;
  const parts = [];
  buildings.forEach((b, bi) => {
    const width = b.cols.length * WIN_W + (b.cols.length - 1) * GX + PADX * 2;
    const roof = ROOF_MIN + Math.round((ROOF_MAX - ROOF_MIN) * (b.total / maxTotal));
    const top = groundY - bodyH - roof;
    const [year, month] = b.key.split('-');
    const showYear = bi === 0 || month === '01';
    const isBusiest = b.key === busiestKey;

    parts.push(`<g class="bldg${isBusiest ? ' is-busiest' : ''}">`);
    parts.push(`<rect class="bldg-body tone-${bi % 3}" x="${x}" y="${top}" width="${width}" height="${groundY - top}" rx="2" />`);
    parts.push(`<text class="bldg-sign" x="${x + width / 2}" y="${top - 20}" text-anchor="middle">${showYear ? `’${year.slice(2)} ` : ''}${Number(month)}월</text>`);
    parts.push(`<text class="bldg-count" x="${x + width / 2}" y="${top - 7}" text-anchor="middle">${num(b.total)}</text>`);

    b.cols.forEach((col, ci) => {
      const wx = x + PADX + ci * (WIN_W + GX);
      for (const d of col) {
        const wy = groundY - PADBOT - floors + d.weekday * (WIN_H + GY);
        parts.push(`<rect class="win w${level(d.count)}" x="${wx}" y="${wy}" width="${WIN_W}" height="${WIN_H}" rx="1" style="--c:${colIndex}" data-d="${d.date}" data-n="${d.count}" />`);
      }
      colIndex++;
    });
    parts.push('</g>');
    x += width + GAP;
  });

  const width = x - GAP + 4;
  const busiest = buildings.find(b => b.key === busiestKey);
  const [by, bm] = busiest.key.split('-');
  const label = `지난 1년 GitHub 기여 기록. 하루가 창문 하나이고, 가장 바빴던 달은 ${by}년 ${Number(bm)}월(${num(busiest.total)}회)입니다.`;

  return `
    <figure class="skyline" aria-label="${esc(label)}">
      <div class="skyline-scroll" tabindex="0" role="region" aria-label="기여 기록 스카이라인 (가로 스크롤)">
        <svg class="skyline-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(label)}">
          <line class="ground" x1="0" y1="${groundY + 0.5}" x2="${width}" y2="${groundY + 0.5}" />
          ${parts.join('\n          ')}
        </svg>
      </div>
      <div class="skyline-tip" role="status" aria-live="polite" hidden></div>
    </figure>`;
}

// ─── Shared fragments ───────────────────────────────
function langBar(languages, { legend = true } = {}) {
  if (!languages || !languages.length) return '';
  const total = languages.reduce((s, l) => s + l.bytes, 0) || 1;
  const top = languages.slice(0, 5);
  const segs = top.map(l => `<span style="flex:${(l.bytes / total).toFixed(4)};background:${esc(l.color || '#8b93b5')}" title="${esc(l.name)} ${((l.bytes / total) * 100).toFixed(1)}%"></span>`).join('');
  const leg = legend
    ? `<ul class="langbar-legend">${top.map(l => `<li><i style="background:${esc(l.color || '#8b93b5')}"></i>${esc(l.name)} <span>${((l.bytes / total) * 100).toFixed(0)}%</span></li>`).join('')}</ul>`
    : '';
  return `<div class="langbar" aria-hidden="true">${segs}</div>${leg}`;
}

function linkButtons(p, { primaryClass = 'btn btn-lamp' } = {}) {
  const out = [];
  const isAndroid = p.platform === 'android' || p.category === 'android';
  if (p.links.play) out.push(`<a class="${primaryClass}" href="${esc(p.links.play)}" target="_blank" rel="noopener">Google Play에서 보기</a>`);
  if (p.links.live) {
    const label = isAndroid ? '소개 페이지' : p.category === 'game' ? '바로 플레이' : p.category === 'desktop' ? '홈페이지' : '라이브 데모 열기';
    out.push(`<a class="${out.length ? 'btn btn-ghost' : primaryClass}" href="${esc(p.links.live)}" target="_blank" rel="noopener">${label}</a>`);
  }
  if (p.links.releases) out.push(`<a class="btn btn-ghost" href="${esc(p.links.releases)}" target="_blank" rel="noopener">${p.latestRelease ? `${esc(p.latestRelease.tag)} 내려받기` : '릴리스'}</a>`);
  if (p.links.github) out.push(`<a class="btn btn-ghost" href="${esc(p.links.github)}" target="_blank" rel="noopener">GitHub 레포</a>`);
  return out.join('');
}

function metricsList(p) {
  const rows = [];
  if (p.play && p.play.installs) rows.push(['설치', esc(p.play.installs)]);
  if (p.play && p.play.score) rows.push(['평점', `${p.play.score.toFixed(1)} / 5`]);
  if (p.stars) rows.push(['GitHub ★', num(p.stars)]);
  if (p.commits) rows.push(['커밋', num(p.commits)]);
  if (p.releases) rows.push(['릴리스', `${num(p.releases)}회`]);
  if (p.latestRelease) rows.push(['최신 버전', esc(p.latestRelease.tag)]);
  else if (p.play && p.play.version) rows.push(['최신 버전', esc(p.play.version)]);
  if (p.createdAt) rows.push(['시작', dateDot(p.createdAt)]);
  if (p.pushedAt) rows.push(['마지막 커밋', `<time datetime="${esc(p.pushedAt)}" data-rel>${dateDot(p.pushedAt)}</time>`]);
  if (!rows.length) return '';
  return `<dl class="metrics">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

// ─── Featured ───────────────────────────────────────
function renderFeaturedMedia(p) {
  if (!p.images.length) {
    return `<div class="feature-media feature-media--empty">${p.icon ? `<img class="feature-icon-lg" src="${esc(p.icon)}" alt="" loading="lazy" />` : ''}</div>`;
  }
  const portrait = p.images.filter(i => i.portrait);
  const imgs = p.images.filter(i => !i.portrait);
  // Store screenshots render as a phone strip; a single one is used only when
  // there is no landscape image to put on the stage.
  if (portrait.length >= 2 || (portrait.length && !imgs.length)) {
    return `
        <div class="feature-media feature-media--phones">
          <div class="phones">${portrait.slice(0, 6).map(img => `<img src="${esc(img.url)}" alt="${esc(img.alt)}" loading="lazy" />`).join('')}</div>
        </div>`;
  }
  const thumbs = imgs.length > 1
    ? `<div class="feature-thumbs">${imgs.slice(0, 6).map((img, i) => `<button type="button" class="thumb${i === 0 ? ' is-active' : ''}" data-src="${esc(img.url)}" data-alt="${esc(img.alt)}" aria-label="${i + 1}번째 이미지 보기"><img src="${esc(img.url)}" alt="" loading="lazy" /></button>`).join('')}</div>`
    : '';
  return `
        <div class="feature-media" data-gallery>
          <div class="feature-stage"><img src="${esc(imgs[0].url)}" alt="${esc(imgs[0].alt)}" loading="lazy" /></div>
          ${thumbs}
        </div>`;
}

function renderFeatured(projects) {
  const featured = projects.filter(p => p.featured);
  if (!featured.length) return '';
  const cards = featured.map(p => {
    const channelText = p.channels.filter(c => c !== 'ci').slice(0, 2).map(c => CHANNEL[c]).join(' · ');
    const excerpt = p.excerpt && p.excerpt !== p.description && !p.description.includes(p.excerpt.slice(0, 40))
      ? `<p class="feature-excerpt">${esc(p.excerpt)}</p>` : '';
    return `
      <article class="feature cat-${p.category}" id="feature-${esc(p.id)}">
        ${renderFeaturedMedia(p)}
        <div class="feature-body">
          <p class="kicker"><i class="cat-dot"></i>${CATEGORY[p.category].label}${channelText ? ` · ${channelText}` : ''}</p>
          <h3 class="feature-title">${p.icon ? `<img class="title-icon" src="${esc(p.icon)}" alt="" width="40" height="40" loading="lazy" />` : ''}<span>${esc(p.title)}</span></h3>
          <p class="feature-desc">${esc(p.description)}</p>
          ${excerpt}
          ${metricsList(p)}
          ${langBar(p.languages)}
          <div class="actions">${linkButtons(p)}</div>
        </div>
      </article>`;
  }).join('\n');

  return `
  <section class="section" id="featured" aria-labelledby="featured-title">
    <div class="container">
      <header class="section-head">
        <p class="eyebrow">대표작</p>
        <h2 class="section-title" id="featured-title">먼저 보여드리고 싶은 것들</h2>
        <p class="section-sub">스토어에 올라가 있거나, 수백 번 커밋하며 다듬은 프로젝트입니다. 숫자는 모두 레포와 스토어에서 빌드할 때 가져옵니다.</p>
      </header>
      <div class="features">${cards}</div>
    </div>
  </section>`;
}

// ─── Operations ─────────────────────────────────────
function renderOps(model) {
  const { stats, months, projects } = model;
  if (!stats.publicRepos && !stats.androidApps) return '';
  const byId = new Map(projects.map(p => [p.id, p]));

  const tiles = [
    { channel: 'play', value: stats.playLive, unit: '개 앱', title: 'Google Play 출시', text: '누구나 스토어에서 설치할 수 있는 앱' },
    { channel: 'testing', value: stats.playTesting, unit: '개 앱', title: 'Play 비공개 테스트', text: '출시 전 테스터 트랙에서 다듬는 중' },
    { channel: 'release', value: stats.releases, unit: '회', title: 'GitHub Releases', text: `${num(stats.releasedRepos)}개 레포에서 버전을 붙여 배포` },
    { channel: 'live', value: stats.liveSites, unit: '곳', title: '웹에서 바로 열기', text: '설치 없이 열리는 데모와 소개 페이지' },
    { channel: 'ci', value: stats.workflows, unit: '개', title: 'CI 워크플로', text: `${num(stats.ciRepos)}개 레포의 빌드·배포 자동화` },
  ];
  const tileHTML = tiles.map(t => `
        <button type="button" class="channel" data-filter-channel="${t.channel}">
          <span class="channel-title">${t.title}</span>
          <span class="channel-value"><b>${num(t.value)}</b>${t.unit}</span>
          <span class="channel-text">${t.text}</span>
          <span class="channel-go">목록 보기 →</span>
        </button>`).join('');

  const maxCreated = Math.max(1, ...months.map(m => m.created));
  const bars = months.map(m => `
          <li style="--h:${(m.created / maxCreated).toFixed(3)}">
            <span class="bar-value">${m.created || ''}</span>
            <span class="bar" aria-hidden="true"></span>
            <span class="bar-label">${m.month}월<small>${m.month === 1 || m === months[0] ? m.year : '&nbsp;'}</small></span>
            <span class="sr-only">${m.year}년 ${m.month}월 새 레포 ${m.created}개</span>
          </li>`).join('');

  const recent = model.recent.map(id => byId.get(id)).filter(Boolean).map(p => `
          <li>
            <a href="#project/${esc(p.id)}" class="recent-row" data-open="${esc(p.id)}">
              <span class="recent-icon">${p.icon ? `<img src="${esc(p.icon)}" alt="" loading="lazy" />` : esc(p.title.charAt(0))}</span>
              <span class="recent-main"><b>${esc(p.title)}</b><span>${p.latestRelease ? `${esc(p.latestRelease.tag)} · ` : ''}${p.primaryLanguage ? esc(p.primaryLanguage) : CATEGORY[p.category].label}</span></span>
              <time datetime="${esc(p.pushedAt)}" data-rel>${dateDot(p.pushedAt)}</time>
            </a>
          </li>`).join('');

  return `
  <section class="section" id="ops" aria-labelledby="ops-title">
    <div class="container">
      <header class="section-head">
        <p class="eyebrow">운영</p>
        <h2 class="section-title" id="ops-title">만들고 끝내지 않고, 계속 내보냅니다</h2>
        <p class="section-sub">어디로 배포하고, 무엇을 자동화했는지 레포에서 직접 셌습니다. 지난 30일 동안 손댄 레포만 ${num(stats.activeLastMonth)}개입니다.</p>
      </header>
      <div class="channels">${tileHTML}</div>
      <div class="ops-grid">
        <div class="panel">
          <h3 class="panel-title">매달 새로 시작한 레포</h3>
          <ol class="bars">${bars}</ol>
        </div>
        <div class="panel">
          <h3 class="panel-title">최근에 손댄 프로젝트</h3>
          <ol class="recent">${recent}</ol>
        </div>
      </div>
    </div>
  </section>`;
}

// ─── Stack ──────────────────────────────────────────
function renderStack(model) {
  const { languages, topics, stats } = model;
  if (!languages.length) return '';
  const top = languages.slice(0, 9);
  const restShare = languages.slice(9).reduce((s, l) => s + l.share, 0);
  const segs = top.map(l => `<span style="flex:${l.share.toFixed(4)};background:${esc(l.color || '#8b93b5')}" title="${esc(l.name)} ${(l.share * 100).toFixed(1)}%"></span>`).join('')
    + (restShare > 0 ? `<span style="flex:${restShare.toFixed(4)};background:#3a4366" title="기타 ${(restShare * 100).toFixed(1)}%"></span>` : '');
  const rows = top.map(l => `
          <li>
            <button type="button" class="lang-row" data-filter-lang="${esc(l.name)}">
              <i style="background:${esc(l.color || '#8b93b5')}"></i>
              <span class="lang-name">${esc(l.name)}</span>
              <span class="lang-share">${(l.share * 100).toFixed(1)}%</span>
              <span class="lang-repos">${l.repos ? `주 언어 ${l.repos}개 레포` : ''}</span>
            </button>
          </li>`).join('');

  const maxCount = Math.max(1, ...topics.map(t => t.count));
  const chips = topics.map(t => `<button type="button" class="topic" data-filter-topic="${esc(t.name)}" style="--w:${(t.count / maxCount).toFixed(2)}">${esc(t.name)}<span>${t.count}</span></button>`).join('');

  return `
  <section class="section" id="stack" aria-labelledby="stack-title">
    <div class="container">
      <header class="section-head">
        <p class="eyebrow">기술</p>
        <h2 class="section-title" id="stack-title">실제로 쓰는 언어와 도구</h2>
        <p class="section-sub">공개 레포 ${num(stats.publicRepos)}개의 코드량을 언어별로 합쳤습니다. 항목을 누르면 그 기술로 만든 프로젝트만 모아 볼 수 있습니다.</p>
      </header>
      <div class="stack-grid">
        <div class="panel">
          <h3 class="panel-title">언어별 코드 비중</h3>
          <div class="langbar langbar--big" aria-hidden="true">${segs}</div>
          <ul class="lang-list">${rows}</ul>
        </div>
        <div class="panel">
          <h3 class="panel-title">레포에 붙인 토픽</h3>
          <div class="topics">${chips}</div>
        </div>
      </div>
    </div>
  </section>`;
}

// ─── Explorer shell (filled by client.js) ───────────
function renderExplorer(model) {
  const counts = { all: model.projects.length };
  for (const p of model.projects) counts[p.category] = (counts[p.category] || 0) + 1;
  const cats = ['all', 'android', 'web', 'desktop', 'game', 'tool']
    .filter(c => c === 'all' || counts[c])
    .map(c => `<button type="button" class="seg${c === 'all' ? ' is-on' : ''}" data-cat="${c}" aria-pressed="${c === 'all'}">${c === 'all' ? '전체' : CATEGORY[c].label}<span>${counts[c]}</span></button>`)
    .join('');
  const channelOptions = Object.entries(CHANNEL)
    .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

  return `
  <section class="section" id="projects" aria-labelledby="projects-title">
    <div class="container">
      <header class="section-head">
        <p class="eyebrow">전체 프로젝트</p>
        <h2 class="section-title" id="projects-title">레포 ${num(model.projects.length)}개, 전부 열어 보세요</h2>
        <p class="section-sub">카드를 누르면 README 스크린샷, 언어 구성, 커밋·릴리스 기록과 링크가 열립니다.</p>
      </header>
      <div class="explorer-controls">
        <label class="search">
          <span class="sr-only">프로젝트 검색</span>
          <input type="search" id="q" placeholder="이름, 설명, 기술로 찾기 (예: Kotlin, threejs, PDF)" autocomplete="off" />
        </label>
        <div class="segs" role="group" aria-label="분류">${cats}</div>
        <div class="selects">
          <label><span class="sr-only">배포 채널</span>
            <select id="channel"><option value="">모든 배포 채널</option>${channelOptions}</select>
          </label>
          <label><span class="sr-only">정렬</span>
            <select id="sort">
              <option value="pick">추천순</option>
              <option value="recent">최근 커밋순</option>
              <option value="new">최근 시작순</option>
              <option value="stars">GitHub ★순</option>
              <option value="commits">커밋 많은 순</option>
            </select>
          </label>
        </div>
      </div>
      <div class="active-filters" id="active-filters" hidden></div>
      <p class="result-count" id="result-count" aria-live="polite"></p>
      <div class="grid" id="grid">
        <noscript><p class="empty">프로젝트 목록은 JavaScript로 그립니다. <a href="https://github.com/${esc(model.developer.githubUsername)}?tab=repositories">GitHub에서 전체 레포 보기</a></p></noscript>
      </div>
      <div class="more-wrap"><button type="button" class="btn btn-ghost" id="more" hidden>더 보기</button></div>
    </div>
  </section>

  <dialog class="detail" id="detail" aria-labelledby="detail-title">
    <div class="detail-inner" id="detail-inner"></div>
  </dialog>`;
}

// ─── Page ───────────────────────────────────────────
function renderHero(model) {
  const { developer, calendarStats: cs, stats } = model;
  const caption = cs
    ? `창문 하나가 하루입니다. 지난 ${num(cs.span)}일 중 <b>${num(cs.activeDays)}일</b> 불이 켜졌고, 모두 <b>${num(cs.total)}번</b> 기여했습니다. 건물이 높을수록 그 달이 바빴습니다. 최장 연속 기록은 ${num(cs.longestStreak)}일.`
    : '';

  const kpis = [
    stats.publicRepos && ['공개 레포', num(stats.publicRepos)],
    stats.commits && ['공개 레포 커밋', num(stats.commits)],
    stats.releases && ['릴리스', num(stats.releases)],
    stats.androidApps && ['Android 앱', `${num(stats.androidApps)}`, `출시 ${stats.playLive} · 테스트 ${stats.playTesting}`],
    stats.stars && ['GitHub ★', num(stats.stars)],
  ].filter(Boolean);

  return `
  <header class="hero" id="top">
    <div class="container hero-grid">
      <div class="hero-copy">
        <p class="eyebrow eyebrow--persona">9 to 6 직장인 · 두 아들 아빠 · 바이브코더 · 크리스천</p>
        <h1 class="hero-title">퇴근 후에<br />켜지는 창문들</h1>
      </div>
      <div class="hero-side">
        <img class="avatar" src="https://github.com/${esc(developer.githubUsername)}.png?size=160" alt="${esc(developer.name)} 프로필 사진" width="72" height="72" />
        <p class="hero-name">${esc(developer.name)} <span>${esc(developer.role)}</span></p>
        <p class="hero-tagline">${esc(developer.tagline)}</p>
      </div>
    </div>
    ${renderSkyline(model.calendar)}
    <div class="container">
      ${caption ? `<p class="skyline-caption">${caption}</p>` : ''}
      <dl class="kpis">${kpis.map(([k, v, sub]) => `<div><dt>${k}</dt><dd>${v}${sub ? `<small>${sub}</small>` : ''}</dd></div>`).join('')}</dl>
    </div>
  </header>`;
}

function serializeModel(model) {
  const data = {
    generatedAt: model.generatedAt,
    projects: model.projects.map(p => ({ ...p })),
    labels: { category: Object.fromEntries(Object.entries(CATEGORY).map(([k, v]) => [k, v.label])), channel: CHANNEL },
  };
  // Prevent "</script>" and HTML comment openers from breaking out of the JSON block.
  // Escape '<' and U+2028/9 as JSON unicode escapes (source kept ASCII-only).
  const backslash = String.fromCharCode(92);
  return JSON.stringify(data)
    .replace(/</g, `${backslash}u003c`)
    .split(String.fromCharCode(0x2028)).join(`${backslash}u2028`)
    .split(String.fromCharCode(0x2029)).join(`${backslash}u2029`);
}

function renderPage(model) {
  const { developer } = model;
  const title = `${developer.name} — 퇴근 후에 켜지는 창문들`;
  const description = `${developer.name}의 개발 포트폴리오. 공개 레포 ${model.stats.publicRepos}개, Android 앱 ${model.stats.androidApps}개, 릴리스 ${model.stats.releases}회의 기록을 한 페이지에서 봅니다.`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="author" content="${esc(developer.name)}" />
  <meta name="theme-color" content="#0b1022" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://${esc(developer.githubUsername)}.github.io/" />
  <meta property="og:image" content="https://${esc(developer.githubUsername)}.github.io/brand/el-studio-mark-512.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Hahmlet:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="icon" href="brand/el-studio-mark.svg" type="image/svg+xml" />
  <link rel="icon" href="favicon.png" type="image/png" sizes="64x64" />
  <link rel="apple-touch-icon" href="brand/apple-touch-icon.png" />
  <style>${CSS}</style>
</head>
<body>
  <a class="skip" href="#projects">전체 프로젝트로 건너뛰기</a>
  <nav class="nav" aria-label="주요 메뉴">
    <div class="container nav-inner">
      <a class="nav-brand" href="#top"><img src="brand/el-studio-mark.svg" alt="" width="24" height="24" />${esc(developer.name)}</a>
      <div class="nav-links">
        <a href="#featured">대표작</a>
        <a href="#ops">운영</a>
        <a href="#stack">기술</a>
        <a href="#projects">전체</a>
        <a class="nav-gh" href="${esc(developer.github)}" target="_blank" rel="noopener">GitHub ↗</a>
      </div>
    </div>
  </nav>

  ${renderHero(model)}

  <main>
    ${renderFeatured(model.projects)}
    ${renderOps(model)}
    ${renderStack(model)}
    ${renderExplorer(model)}
  </main>

  <footer class="footer">
    <div class="container footer-inner">
      <p>이 페이지는 매일 오전 6시(KST) GitHub Actions가 GitHub와 Google Play에서 데이터를 다시 모아 새로 빌드합니다.</p>
      <p class="footer-meta">마지막 빌드 ${esc(kstTimestamp(model.generatedAt))}${model.snapshotAt ? ` · GitHub 데이터 ${esc(kstTimestamp(model.snapshotAt))}` : ''}</p>
      <p class="footer-links">
        <a href="${esc(developer.github)}" target="_blank" rel="noopener">GitHub</a>
        <a href="${esc(developer.play)}" target="_blank" rel="noopener">Google Play 개발자 페이지</a>
        <a href="${esc(developer.github)}/${esc(developer.githubUsername)}.github.io" target="_blank" rel="noopener">이 사이트의 소스</a>
      </p>
    </div>
  </footer>

  <script type="application/json" id="portfolio-data">${serializeModel(model)}</script>
  <script>${CLIENT_JS}</script>
</body>
</html>`;
}

module.exports = { renderPage, renderSkyline, esc };
