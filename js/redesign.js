/* ═══════════════════════════════════════════════════════════
   REDESIGN — home hub + busca global (Ctrl+K)
   Carrega por último: todos os dados e funções do app já existem.
   ═══════════════════════════════════════════════════════════ */

/* ---------- helpers ---------- */
function _rdName(obj) {
  // usa o helper de idioma do app quando existir
  if (typeof t === 'function') { try { return t(obj, 'name'); } catch (e) {} }
  return obj.name || obj.name_en || '';
}
function _rdUi(key, fallback) {
  if (typeof ui === 'function') {
    var v = ui(key);
    if (v && v !== key) return v;
  }
  return fallback;
}
function _rdEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- destaque da home (edite aqui para trocar os heróis do banner) ---------- */
const HOME_FEATURED = {
  heroIds: [1084, 1032], // Shion de Áries, Hypnos — os banners atuais
  endsAt: null           // ex.: '2026-09-15T23:59:00-03:00' para countdown; null mostra "confira o calendário"
};

const FACTION_LABELS = {
  santuario: { pt: 'Santuário', en: 'Sanctuary', es: 'Santuario' },
  submundo:  { pt: 'Submundo', en: 'Underworld', es: 'Inframundo' },
  asgard:    { pt: 'Asgard', en: 'Asgard', es: 'Asgard' },
  atlantida: { pt: 'Atlântida', en: 'Atlantis', es: 'Atlántida' }
};
function _rdFaction(f) {
  var lang = (typeof _lang !== 'undefined' && _lang) ? _lang : 'pt';
  var l = FACTION_LABELS[f];
  return l ? (l[lang] || l.pt) : (f || '');
}

function renderHomeFeatured() {
  var box = document.getElementById('homeFeatured');
  if (!box || typeof CODEX_HEROES === 'undefined') return;
  var ids = HOME_FEATURED.heroIds || (HOME_FEATURED.heroId ? [HOME_FEATURED.heroId] : []);
  var heroes = ids.map(function (id) {
    return CODEX_HEROES.find(function (x) { return x.id === id; });
  }).filter(Boolean);
  if (!heroes.length) { box.style.display = 'none'; return; }

  var countdown = '';
  if (HOME_FEATURED.endsAt) {
    var ms = new Date(HOME_FEATURED.endsAt).getTime() - Date.now();
    if (ms > 0) {
      var d = Math.floor(ms / 86400000), hrs = Math.floor((ms % 86400000) / 3600000);
      countdown = '<span class="home-featured-ends">' + _rdUi('home.featured.endsIn', 'termina em') +
        ' <strong>' + d + 'd ' + hrs + 'h</strong></span>';
    }
  }
  if (!countdown) {
    countdown = '<span class="home-featured-ends">' + _rdUi('home.featured.seeCalendar', 'confira o calendário') + '</span>';
  }

  var rows = heroes.map(function (h) {
    return '<div class="home-featured-body" role="button" tabindex="0" ' +
      'onclick="navigateToTab(\'heroes\');showHeroDetail(' + h.id + ')" ' +
      'onkeydown="if(event.key===\'Enter\'){navigateToTab(\'heroes\');showHeroDetail(' + h.id + ')}">' +
      '<div class="home-featured-ring"><img src="' + _rdEsc(h.image) + '" alt="' + _rdEsc(_rdName(h)) + '" loading="lazy" decoding="async"></div>' +
      '<div class="home-featured-info">' +
        '<div class="home-featured-badges">' +
          '<span class="rd-badge rd-badge-' + _rdEsc(h.rarity) + '">' + _rdEsc((h.rarity || '').toUpperCase()) + '</span>' +
          '<span class="rd-badge rd-badge-faction rd-f-' + _rdEsc(h.faction) + '">' + _rdEsc(_rdFaction(h.faction)) + '</span>' +
        '</div>' +
        '<div class="home-featured-name">' + _rdEsc(_rdName(h)) + '</div>' +
      '</div>' +
      '<span class="home-featured-go" aria-hidden="true">→</span>' +
    '</div>';
  }).join('');

  box.style.display = '';
  box.innerHTML =
    '<div class="home-featured-head">' +
      '<span class="home-featured-kicker"><span class="home-featured-dot"></span>' + _rdUi('home.featured.kicker', 'Em destaque') + '</span>' +
      countdown +
    '</div>' +
    rows +
    '<div class="home-featured-actions">' +
      '<button class="home-featured-btn" onclick="navigateToTab(\'banners\')">' + _rdUi('home.featured.calendar', 'Calendário de banners') + '</button>' +
    '</div>';
}

function renderHomeTopTier() {
  var grid = document.getElementById('homeTopTier');
  if (!grid || typeof CODEX_HEROES === 'undefined') return;
  var urs = CODEX_HEROES.filter(function (h) { return h.rarity === 'ur'; });
  grid.innerHTML = urs.map(function (h) {
    return '<div class="home-top-card" role="button" tabindex="0" ' +
      'onclick="navigateToTab(\'heroes\');showHeroDetail(' + h.id + ')" ' +
      'onkeydown="if(event.key===\'Enter\'){navigateToTab(\'heroes\');showHeroDetail(' + h.id + ')}">' +
      '<img src="' + _rdEsc(h.image) + '" alt="' + _rdEsc(_rdName(h)) + '" loading="lazy" decoding="async">' +
      '<div class="home-top-name">' + _rdEsc(_rdName(h)) + '</div>' +
      '<div class="home-top-badges">' +
        '<span class="rd-badge rd-badge-ur">UR</span>' +
        '<span class="rd-badge rd-badge-faction rd-f-' + _rdEsc(h.faction) + '">' + _rdEsc(_rdFaction(h.faction)) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderHomeStats() {
  var el;
  if (typeof CODEX_HEROES !== 'undefined' && (el = document.getElementById('statHeroes'))) el.textContent = CODEX_HEROES.length;
  if (typeof CODEX_ARTIFACTS !== 'undefined' && (el = document.getElementById('statArtifacts'))) el.textContent = CODEX_ARTIFACTS.length;
  if (typeof CODEX_CARDS !== 'undefined' && (el = document.getElementById('statCards'))) el.textContent = CODEX_CARDS.length;
}

function renderRedesignHome() {
  renderHomeStats();
  renderHomeFeatured();
  renderHomeTopTier();
}

/* ---------- busca global (Ctrl+K) ---------- */
var _gsIndex = null;
function _gsBuildIndex() {
  if (_gsIndex) return _gsIndex;
  _gsIndex = [];
  function add(type, id, obj, img) {
    _gsIndex.push({
      type: type, id: id, obj: obj, img: img || '',
      hay: [obj.name, obj.name_en, obj.name_es].filter(Boolean).join(' | ').toLowerCase()
    });
  }
  if (typeof CODEX_HEROES !== 'undefined') CODEX_HEROES.forEach(function (h) { add('hero', h.id, h, h.image); });
  if (typeof CODEX_ARTIFACTS !== 'undefined') CODEX_ARTIFACTS.forEach(function (a) { add('artifact', a.id, a, a.image || a.icon); });
  if (typeof CODEX_CARDS !== 'undefined') CODEX_CARDS.forEach(function (c) { add('card', c.id, c, c.image); });
  return _gsIndex;
}

var _gsGroupLabels = {
  hero: function () { return _rdUi('search.gHeroes', 'Cavaleiros'); },
  artifact: function () { return _rdUi('search.gArtifacts', 'Artefatos'); },
  card: function () { return _rdUi('search.gCards', 'Cartas'); }
};

function _gsGo(type, id) {
  closeGlobalSearch();
  if (type === 'hero') { navigateToTab('heroes'); if (typeof showHeroDetail === 'function') showHeroDetail(Number(id)); }
  else if (type === 'artifact') { navigateToTab('artifacts'); if (typeof showArtifactDetail === 'function') showArtifactDetail(String(id)); }
  else if (type === 'card') { navigateToTab('cards'); if (typeof showCardDetail === 'function') showCardDetail(String(id)); }
}

function _gsRender(q) {
  var out = document.getElementById('gsearchResults');
  if (!out) return;
  q = (q || '').trim().toLowerCase();
  if (q.length < 2) {
    out.innerHTML = '<div class="gsearch-hint">' + _rdUi('search.hint', 'Digite pelo menos 2 letras — heróis, artefatos e cartas.') + '</div>';
    return;
  }
  var idx = _gsBuildIndex();
  var groups = { hero: [], artifact: [], card: [] };
  for (var i = 0; i < idx.length; i++) {
    var e = idx[i];
    if (e.hay.indexOf(q) !== -1 && groups[e.type].length < 8) groups[e.type].push(e);
  }
  var html = '';
  ['hero', 'artifact', 'card'].forEach(function (type) {
    var list = groups[type];
    if (!list.length) return;
    html += '<div class="gsearch-group">' + _rdEsc(_gsGroupLabels[type]()) + '</div>';
    html += list.map(function (e) {
      var badge = e.obj.rarity ? '<span class="rd-badge rd-badge-' + _rdEsc(e.obj.rarity) + '">' + _rdEsc(String(e.obj.rarity).toUpperCase()) + '</span>' : '';
      var idAttr = typeof e.id === 'number' ? e.id : '\'' + _rdEsc(String(e.id)) + '\'';
      return '<button class="gsearch-item" onclick="_gsGo(\'' + e.type + '\',' + idAttr + ')">' +
        (e.img ? '<img src="' + _rdEsc(e.img) + '" alt="" loading="lazy">' : '<span class="gsearch-item-noimg"></span>') +
        '<span class="gsearch-item-name">' + _rdEsc(_rdName(e.obj)) + '</span>' + badge +
      '</button>';
    }).join('');
  });
  out.innerHTML = html || ('<div class="gsearch-hint">' + _rdUi('search.empty', 'Nada encontrado. Tente outro nome (pt, en ou es).') + '</div>');
}

function openGlobalSearch() {
  var ov = document.getElementById('gsearchOverlay');
  if (!ov) return;
  ov.style.display = 'flex';
  document.body.classList.add('gsearch-open');
  var inp = document.getElementById('gsearchInput');
  if (inp) { inp.value = ''; _gsRender(''); setTimeout(function () { inp.focus(); }, 30); }
}
function closeGlobalSearch() {
  var ov = document.getElementById('gsearchOverlay');
  if (!ov) return;
  ov.style.display = 'none';
  document.body.classList.remove('gsearch-open');
}

/* atalho Ctrl+K / Cmd+K + Esc (fase de captura: roda antes dos handlers do app) */
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    var ov = document.getElementById('gsearchOverlay');
    if (ov && ov.style.display !== 'none') closeGlobalSearch(); else openGlobalSearch();
    return;
  }
  if (e.key === 'Escape') {
    var ov2 = document.getElementById('gsearchOverlay');
    if (ov2 && ov2.style.display !== 'none') {
      e.stopPropagation();
      closeGlobalSearch();
    }
  }
}, true);

/* ---------- variáveis de layout do trilho da guilda ---------- */
function _rdRailVars() {
  var wrap = document.querySelector('.wrap');
  var tb = document.getElementById('topbar');
  if (!wrap || !tb) return;
  var r = document.documentElement.style;
  r.setProperty('--rail-left', Math.round(wrap.getBoundingClientRect().left + 28) + 'px');
  r.setProperty('--tb-h', Math.round(tb.getBoundingClientRect().height) + 'px');
}
window.addEventListener('resize', function () {
  clearTimeout(window._rdRailTimer);
  window._rdRailTimer = setTimeout(_rdRailVars, 120);
});

/* ---------- boot ---------- */
(function () {
  _rdRailVars();
  var inp = document.getElementById('gsearchInput');
  if (inp) {
    inp.addEventListener('input', function () {
      var self = this;
      clearTimeout(window._gsTimer);
      window._gsTimer = setTimeout(function () { _gsRender(self.value); }, 120);
    });
  }
  renderRedesignHome();
  // re-renderiza os blocos JS da home quando o idioma muda (nomes traduzidos)
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.lang-btn')) {
      setTimeout(renderRedesignHome, 0);
    }
  });
})();
