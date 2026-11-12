(function () {
  'use strict';

  var dataEl = document.getElementById('portfolio-data');
  if (!dataEl) return;
  var DATA = JSON.parse(dataEl.textContent);
  var PROJECTS = DATA.projects;
  var CAT = DATA.labels.category;
  var CHANNEL = DATA.labels.channel;
  var byId = {};
  PROJECTS.forEach(function (p) { byId[p.id] = p; });

  var PAGE = 24;
  var state = { q: '', cat: 'all', channel: '', topic: '', lang: '', sort: 'pick', limit: PAGE };

  // ─── helpers ─────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function num(n) { return Number(n || 0).toLocaleString('ko-KR'); }
  function dateDot(iso) { return iso ? iso.slice(0, 10).replace(/-/g, '.') : ''; }
  function rel(iso) {
    var diff = (Date.now() - Date.parse(iso)) / 1000;
    if (!isFinite(diff)) return '';
    if (diff < 3600) return Math.max(1, Math.round(diff / 60)) + '분 전';
    if (diff < 86400) return Math.round(diff / 3600) + '시간 전';
    var days = Math.round(diff / 86400);
    if (days < 31) return days + '일 전';
    var months = Math.round(days / 30.4);
    if (months < 12) return months + '개월 전';
    return Math.round(months / 12) + '년 전';
  }
  function hydrateTimes(root) {
    (root || document).querySelectorAll('time[data-rel]').forEach(function (t) {
      var r = rel(t.getAttribute('datetime'));
      if (r) { t.title = dateDot(t.getAttribute('datetime')); t.textContent = r; }
    });
  }

  function badge(p) {
    if (p.channels.indexOf('play') >= 0) return '<span class="cover-badge b-play">Google Play</span>';
    if (p.channels.indexOf('testing') >= 0) return '<span class="cover-badge b-testing">비공개 테스트</span>';
    if (p.latestRelease) return '<span class="cover-badge">' + esc(p.latestRelease.tag) + '</span>';
    if (p.links.live) return '<span class="cover-badge">Live</span>';
    return '';
  }

  function fallbackHTML(p) {
    return '<div class="cover-fallback">' + (p.icon
      ? '<img src="' + esc(p.icon) + '" alt="" loading="lazy" />'
      : '<span>' + esc(p.title.charAt(0).toUpperCase()) + '</span>') + '</div>';
  }

  function pickCover(p) {
    var land = p.images.filter(function (i) { return !i.portrait; });
    // Animated GIFs are often several MB; keep them for the detail view only.
    var still = land.filter(function (i) { return !/\.gif(\?|$)/i.test(i.url); });
    return still[0] || null;
  }

  function coverHTML(p) {
    var portrait = p.images.filter(function (i) { return i.portrait; });
    var shots = p.images.length > 1 ? '<span class="cover-shots">스크린샷 ' + p.images.length + '</span>' : '';
    if (portrait.length >= 2) {
      return '<div class="cover cover--phones">' + badge(p) + portrait.slice(0, 3).map(function (i) {
        return '<img src="' + esc(i.url) + '" alt="" loading="lazy" />';
      }).join('') + shots + '</div>';
    }
    var img = pickCover(p);
    if (img) return '<div class="cover">' + badge(p) + '<img src="' + esc(img.url) + '" alt="" loading="lazy" />' + shots + '</div>';
    return '<div class="cover">' + badge(p) + fallbackHTML(p) + '</div>';
  }

  function langDot(p) {
    var l = p.languages[0];
    if (!l) return '';
    return '<span><i style="background:' + esc(l.color || '#8b93b5') + '"></i>' + esc(l.name) + '</span>';
  }

  function cardHTML(p) {
    var meta = [langDot(p)];
    if (p.stars) meta.push('<span>★ ' + num(p.stars) + '</span>');
    if (p.commits) meta.push('<span>커밋 ' + num(p.commits) + '</span>');
    if (p.pushedAt) meta.push('<span title="' + dateDot(p.pushedAt) + '">' + rel(p.pushedAt) + '</span>');
    return '<a class="card cat-' + p.category + '" href="#project/' + esc(p.id) + '" data-open="' + esc(p.id) + '">'
      + coverHTML(p)
      + '<div class="card-body">'
      + '<p class="card-kicker"><i class="cat-dot"></i>' + esc(CAT[p.category]) + (p.archived ? ' · 보관됨' : '') + '</p>'
      + '<h3 class="card-title">' + esc(p.title) + '</h3>'
      + (p.description ? '<p class="card-desc">' + esc(p.description) + '</p>' : '')
      + '<p class="card-meta">' + meta.join('') + '</p>'
      + '</div></a>';
  }

  // ─── filtering ───────────────────────────────────
  function haystack(p) {
    if (!p._hay) {
      p._hay = [p.title, p.description, p.repo, CAT[p.category], p.topics.join(' '),
        p.languages.map(function (l) { return l.name; }).join(' ')].join(' ').toLowerCase();
    }
    return p._hay;
  }
  function matches(p) {
    if (state.cat !== 'all' && p.category !== state.cat) return false;
    if (state.channel && p.channels.indexOf(state.channel) < 0) return false;
    if (state.topic && p.topics.indexOf(state.topic) < 0) return false;
    if (state.lang && !p.languages.some(function (l) { return l.name === state.lang; })) return false;
    if (state.q) {
      var words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      var hay = haystack(p);
      if (!words.every(function (w) { return hay.indexOf(w) >= 0; })) return false;
    }
    return true;
  }
  function time(iso) { return iso ? Date.parse(iso) : 0; }
  function pickRank(p) {
    if (p.featured) return 0;
    if (p.curated) return 1;
    if (p.images.length) return 2;
    return 3;
  }
  var SORTS = {
    pick: function (a, b) { return pickRank(a) - pickRank(b) || time(b.pushedAt) - time(a.pushedAt); },
    recent: function (a, b) { return time(b.pushedAt) - time(a.pushedAt); },
    'new': function (a, b) { return time(b.createdAt) - time(a.createdAt); },
    stars: function (a, b) { return b.stars - a.stars || time(b.pushedAt) - time(a.pushedAt); },
    commits: function (a, b) { return b.commits - a.commits; },
  };

  var grid = document.getElementById('grid');
  var moreBtn = document.getElementById('more');
  var countEl = document.getElementById('result-count');
  var activeEl = document.getElementById('active-filters');
  var qInput = document.getElementById('q');
  var channelSel = document.getElementById('channel');
  var sortSel = document.getElementById('sort');

  function renderActive() {
    var chips = [];
    if (state.topic) chips.push('<button type="button" class="chip-x" data-clear="topic">토픽: ' + esc(state.topic) + ' ✕</button>');
    if (state.lang) chips.push('<button type="button" class="chip-x" data-clear="lang">언어: ' + esc(state.lang) + ' ✕</button>');
    activeEl.innerHTML = chips.join('');
    activeEl.hidden = !chips.length;
  }

  function render() {
    if (!grid) return;
    var list = PROJECTS.filter(matches).sort(SORTS[state.sort] || SORTS.pick);
    var shown = list.slice(0, state.limit);
    grid.innerHTML = shown.length
      ? shown.map(cardHTML).join('')
      : '<p class="empty">조건에 맞는 프로젝트가 없습니다. 검색어를 지우거나 다른 분류를 골라 보세요.</p>';
    countEl.textContent = list.length === PROJECTS.length
      ? '프로젝트 ' + num(list.length) + '개'
      : '프로젝트 ' + num(PROJECTS.length) + '개 중 ' + num(list.length) + '개';
    var left = list.length - shown.length;
    moreBtn.hidden = left <= 0;
    moreBtn.textContent = '더 보기 (' + num(left) + '개 남음)';
    renderActive();
  }

  function setCat(cat) {
    state.cat = cat;
    document.querySelectorAll('.seg').forEach(function (b) {
      var on = b.getAttribute('data-cat') === cat;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function resetFilters() {
    state.q = ''; state.topic = ''; state.lang = ''; state.channel = ''; state.limit = PAGE;
    if (qInput) qInput.value = '';
    if (channelSel) channelSel.value = '';
    setCat('all');
  }

  function jumpToExplorer() {
    render();
    var target = document.getElementById('projects');
    if (target) target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  if (grid) {
    var debounce;
    qInput.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () { state.q = qInput.value.trim(); state.limit = PAGE; render(); }, 120);
    });
    channelSel.addEventListener('change', function () { state.channel = channelSel.value; state.limit = PAGE; render(); });
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; render(); });
    document.querySelectorAll('.seg').forEach(function (b) {
      b.addEventListener('click', function () { setCat(b.getAttribute('data-cat')); state.limit = PAGE; render(); });
    });
    moreBtn.addEventListener('click', function () { state.limit += PAGE; render(); });
    activeEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-clear]');
      if (!b) return;
      state[b.getAttribute('data-clear')] = '';
      render();
    });
  }

  // Ops tiles, language rows and topic chips filter the explorer.
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-filter-channel],[data-filter-lang],[data-filter-topic]');
    if (!el || !grid) return;
    resetFilters();
    if (el.hasAttribute('data-filter-channel')) { state.channel = el.getAttribute('data-filter-channel'); channelSel.value = state.channel; }
    if (el.hasAttribute('data-filter-lang')) state.lang = el.getAttribute('data-filter-lang');
    if (el.hasAttribute('data-filter-topic')) state.topic = el.getAttribute('data-filter-topic');
    if (dialog && dialog.open) dialog.close();
    jumpToExplorer();
  });

  // ─── detail dialog ───────────────────────────────
  var dialog = document.getElementById('detail');
  var dialogInner = document.getElementById('detail-inner');

  function metricsHTML(p) {
    var rows = [];
    if (p.play && p.play.installs) rows.push(['설치', esc(p.play.installs)]);
    if (p.play && p.play.score) rows.push(['평점', p.play.score.toFixed(1) + ' / 5']);
    if (p.stars) rows.push(['GitHub ★', num(p.stars)]);
    if (p.commits) rows.push(['커밋', num(p.commits)]);
    if (p.releases) rows.push(['릴리스', num(p.releases) + '회']);
    if (p.latestRelease) rows.push(['최신 버전', esc(p.latestRelease.tag)]);
    else if (p.play && p.play.version) rows.push(['최신 버전', esc(p.play.version)]);
    if (p.workflows) rows.push(['CI 워크플로', p.workflows + '개']);
    if (p.createdAt) rows.push(['시작', dateDot(p.createdAt)]);
    if (p.pushedAt) rows.push(['마지막 커밋', rel(p.pushedAt)]);
    if (p.license) rows.push(['라이선스', esc(p.license)]);
    if (!rows.length) return '';
    return '<dl class="metrics">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>';
  }

  function langBarHTML(p) {
    if (!p.languages.length) return '';
    var total = p.languages.reduce(function (s, l) { return s + l.bytes; }, 0) || 1;
    var top = p.languages.slice(0, 5);
    return '<div class="langbar" aria-hidden="true">' + top.map(function (l) {
      return '<span style="flex:' + (l.bytes / total).toFixed(4) + ';background:' + esc(l.color || '#8b93b5') + '"></span>';
    }).join('') + '</div><ul class="langbar-legend">' + top.map(function (l) {
      return '<li><i style="background:' + esc(l.color || '#8b93b5') + '"></i>' + esc(l.name) + ' <span>' + Math.round(l.bytes / total * 100) + '%</span></li>';
    }).join('') + '</ul>';
  }

  function linksHTML(p) {
    var out = [];
    var android = p.platform === 'android' || p.category === 'android';
    if (p.links.play) out.push('<a class="btn btn-lamp" href="' + esc(p.links.play) + '" target="_blank" rel="noopener">Google Play에서 보기</a>');
    if (p.links.live) {
      var label = android ? '소개 페이지' : p.category === 'game' ? '바로 플레이' : p.category === 'desktop' ? '홈페이지' : '라이브 데모 열기';
      out.push('<a class="btn ' + (out.length ? 'btn-ghost' : 'btn-lamp') + '" href="' + esc(p.links.live) + '" target="_blank" rel="noopener">' + label + '</a>');
    }
    if (p.links.releases) out.push('<a class="btn btn-ghost" href="' + esc(p.links.releases) + '" target="_blank" rel="noopener">' + (p.latestRelease ? esc(p.latestRelease.tag) + ' 내려받기' : '릴리스') + '</a>');
    if (p.links.github) out.push('<a class="btn btn-ghost" href="' + esc(p.links.github) + '" target="_blank" rel="noopener">GitHub 레포</a>');
    return out.length ? '<div class="actions">' + out.join('') + '</div>' : '';
  }

  function galleryHTML(p) {
    if (!p.images.length) return '';
    var first = p.images[0];
    var thumbs = p.images.length > 1 ? '<div class="detail-thumbs">' + p.images.map(function (img, i) {
      return '<button type="button" class="thumb' + (i === 0 ? ' is-active' : '') + '" data-i="' + i + '" aria-label="' + (i + 1) + '번째 이미지 보기"><img src="' + esc(img.url) + '" alt="" loading="lazy" /></button>';
    }).join('') + '</div>' : '';
    return '<div class="detail-gallery"><div class="detail-stage' + (first.portrait ? ' detail-stage--phone' : '') + '">'
      + '<img src="' + esc(first.url) + '" alt="' + esc(first.alt) + '" /></div>' + thumbs + '</div>';
  }

  function openDetail(id, push) {
    var p = byId[id];
    if (!p || !dialog) return;
    var channels = p.channels.map(function (c) { return '<span>' + esc(CHANNEL[c]) + '</span>'; }).join('');
    var excerpt = p.excerpt && p.excerpt !== p.description ? '<p class="detail-excerpt">' + esc(p.excerpt) + '</p>' : '';
    var topics = p.topics.length ? '<div class="detail-topics">' + p.topics.map(function (t) {
      return '<button type="button" class="topic" data-filter-topic="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('') + '</div>' : '';
    dialogInner.innerHTML = '<button type="button" class="detail-close" aria-label="닫기">✕</button>'
      + galleryHTML(p)
      + '<div class="detail-body cat-' + p.category + '">'
      + '<p class="kicker"><i class="cat-dot"></i>' + esc(CAT[p.category]) + (p.repo ? ' · ' + esc(p.repo) : '') + '</p>'
      + '<h2 class="detail-title" id="detail-title">' + (p.icon ? '<img class="title-icon" src="' + esc(p.icon) + '" alt="" />' : '') + '<span>' + esc(p.title) + '</span></h2>'
      + '<div class="detail-channels">' + channels + '</div>'
      + (p.description ? '<p class="detail-desc">' + esc(p.description) + '</p>' : '')
      + excerpt + metricsHTML(p) + langBarHTML(p) + topics + linksHTML(p)
      + '</div>';
    if (!dialog.open) dialog.showModal();
    dialogInner.scrollTop = 0;
    if (push && location.hash !== '#project/' + id) history.pushState(null, '', '#project/' + id);
  }

  function closeDetail() {
    if (dialog && dialog.open) dialog.close();
  }

  if (dialog) {
    dialog.addEventListener('close', function () {
      if (/^#project\//.test(location.hash)) history.pushState(null, '', location.pathname + location.search);
    });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog || e.target.closest('.detail-close')) { closeDetail(); return; }
      var t = e.target.closest('.detail-thumbs .thumb');
      if (t) {
        var p = byId[(location.hash.match(/^#project\/(.+)$/) || [])[1]];
        var img = p && p.images[Number(t.getAttribute('data-i'))];
        if (!img) return;
        var stage = dialog.querySelector('.detail-stage');
        stage.classList.toggle('detail-stage--phone', Boolean(img.portrait));
        stage.innerHTML = '<img src="' + esc(img.url) + '" alt="' + esc(img.alt) + '" />';
        dialog.querySelectorAll('.detail-thumbs .thumb').forEach(function (b) { b.classList.toggle('is-active', b === t); });
      }
    });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-open]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    openDetail(a.getAttribute('data-open'), true);
  });

  function syncHash() {
    var m = location.hash.match(/^#project\/(.+)$/);
    if (m && byId[decodeURIComponent(m[1])]) openDetail(decodeURIComponent(m[1]), false);
    else closeDetail();
  }
  window.addEventListener('popstate', syncHash);

  // Broken README image URLs fall back to the icon tile instead of a hole.
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    var cover = img.closest('.cover');
    var card = img.closest('.card');
    if (cover && card && !img.closest('.cover-fallback')) {
      var p = byId[card.getAttribute('data-open')];
      img.remove();
      if (p && !cover.querySelector('img') && !cover.querySelector('.cover-fallback')) cover.insertAdjacentHTML('beforeend', fallbackHTML(p));
      return;
    }
    var thumb = img.closest('.thumb');
    if (thumb) { thumb.remove(); return; }
    var phone = img.closest('.phones');
    if (phone) img.remove();
  }, true);

  // ─── featured galleries ──────────────────────────
  document.querySelectorAll('[data-gallery]').forEach(function (g) {
    g.addEventListener('click', function (e) {
      var t = e.target.closest('.thumb');
      if (!t) return;
      var stageImg = g.querySelector('.feature-stage img');
      stageImg.src = t.getAttribute('data-src');
      stageImg.alt = t.getAttribute('data-alt') || '';
      g.querySelectorAll('.thumb').forEach(function (b) { b.classList.toggle('is-active', b === t); });
    });
  });

  // ─── skyline ─────────────────────────────────────
  var sky = document.querySelector('.skyline');
  if (sky) {
    var scroller = sky.querySelector('.skyline-scroll');
    var tip = sky.querySelector('.skyline-tip');
    var WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
    // The newest weeks are on the right; start there on narrow screens.
    scroller.scrollLeft = scroller.scrollWidth;
    var hot = null;
    sky.addEventListener('pointermove', function (e) {
      var w = e.target.closest && e.target.closest('.win');
      if (hot && hot !== w) hot.classList.remove('is-hot');
      if (!w) { tip.hidden = true; hot = null; return; }
      hot = w;
      w.classList.add('is-hot');
      var d = w.getAttribute('data-d');
      var n = Number(w.getAttribute('data-n'));
      var wd = WEEKDAY[new Date(d + 'T00:00:00Z').getUTCDay()];
      tip.textContent = dateDot(d) + ' (' + wd + ') · ' + (n ? '기여 ' + num(n) + '회' : '불 꺼진 날');
      var box = sky.getBoundingClientRect();
      var r = w.getBoundingClientRect();
      tip.style.left = (r.left + r.width / 2 - box.left) + 'px';
      tip.style.top = (r.top - box.top) + 'px';
      tip.hidden = false;
    });
    sky.addEventListener('pointerleave', function () {
      tip.hidden = true;
      if (hot) hot.classList.remove('is-hot');
      hot = null;
    });
  }

  hydrateTimes();
  render();
  syncHash();
})();
