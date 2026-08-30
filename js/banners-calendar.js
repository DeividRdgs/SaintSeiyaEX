/* ═══════════════════════════════════════════════════════════
   CALENDÁRIO DE BANNERS — página no estilo do poster do jogo
   (substitui a imagem fixa; artes em img/banners/<id>.webp)
   Carrega depois dos dados: CODEX_HEROES e helpers já existem.
   ═══════════════════════════════════════════════════════════ */

/* ---------- edite aqui para atualizar o calendário ----------
   heroIds: IDs do codex na ordem de lançamento prevista.
   Novo banner anunciado? Acrescente o ID no fim da lista — se não houver
   arte recortada em img/banners/<id>.webp, a página usa o retrato do codex
   (img/heroes/<id>.webp) com selo de raridade automático.
   emptySlots: quantos cards "?" mostrar depois do último herói. */
const BANNER_CALENDAR = {
  heroIds: [
    1029, 1094, 1055, 1083, 1042, 1030, 1089, 1003, 1086, 1071, 1095, 1046, 1051, 1001,
    1021, 1014, 1092, 1085, 1048, 1032, 1043, 1061, 1084, 1064, 1019, 1073, 1078, 1066,
  ],
  emptySlots: 14,
};

function _bnxName(h) {
  if (typeof t === 'function') { try { return t(h, 'name'); } catch (e) {} }
  return h.name || h.name_en || '';
}
function _bnxUi(key, fallback) {
  if (typeof ui === 'function') {
    var v = ui(key);
    if (v && v !== key) return v;
  }
  return fallback;
}
function _bnxEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderBannersCalendar() {
  var grid = document.getElementById('bnxGrid');
  if (!grid || typeof CODEX_HEROES === 'undefined') return;

  var html = '';
  (BANNER_CALENDAR.heroIds || []).forEach(function (id) {
    var h = CODEX_HEROES.find(function (x) { return x.id === id; });
    if (!h) return;
    var nome = _bnxEsc(_bnxName(h));
    var badge = h.rarity === 'ur' ? 'badge-ur' : 'badge-ssr';
    html +=
      '<div class="bnx-cell" role="button" tabindex="0" ' +
        'onclick="navigateToTab(\'heroes\');showHeroDetail(' + h.id + ')" ' +
        'onkeydown="if(event.key===\'Enter\'){navigateToTab(\'heroes\');showHeroDetail(' + h.id + ')}">' +
        '<div class="bnx-frame">' +
          '<img class="bnx-art" src="img/banners/' + h.id + '.webp" alt="" loading="lazy" decoding="async" ' +
            'onerror="this.onerror=null;this.src=\'img/heroes/' + h.id + '.webp\';this.parentNode.parentNode.classList.add(\'bnx-noart\')">' +
          '<img class="bnx-badge" src="img/banners/' + badge + '.webp" alt="' + _bnxEsc((h.rarity || '').toUpperCase()) + '">' +
        '</div>' +
        '<div class="bnx-name">' + nome + '</div>' +
      '</div>';
  });

  var soon = _bnxEsc(_bnxUi('banners.soon', 'Em breve'));
  for (var i = 0; i < (BANNER_CALENDAR.emptySlots || 0); i++) {
    html +=
      '<div class="bnx-cell bnx-cell-empty">' +
        '<div class="bnx-frame"><img class="bnx-art" src="img/slot-vazio.webp" alt="" loading="lazy" decoding="async"></div>' +
        '<div class="bnx-name bnx-name-soon">' + soon + '</div>' +
      '</div>';
  }

  grid.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', function () {
  renderBannersCalendar();
  // re-renderiza quando o idioma muda (nomes traduzidos)
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.lang-btn')) {
      setTimeout(renderBannersCalendar, 0);
    }
  });
});
