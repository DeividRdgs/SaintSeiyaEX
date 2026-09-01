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
    1009, 1063, 1100, 1090, 1056, 1070,
  ],
  // heróis que ainda não chegaram no servidor global (mostram o selo PENDENTE)
  pending: [1064, 1019, 1073, 1078, 1066, 1009, 1063, 1100, 1090, 1056, 1070],
  emptySlots: 8,
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

// Cadeia de fallback da arte do card:
//  1º arte HD do jogo (img/banners/hd/<id>.webp, sem selo -> mostra selo por cima)
//  2º recorte do pôster (img/banners/<id>.webp, selo já gravado -> esconde o selo por cima)
//  3º retrato do codex (img/heroes/<id>.webp -> selo por cima)
function bnxArtFallback(img, id) {
  var cell = img.parentNode && img.parentNode.parentNode;
  var step = img.getAttribute('data-fb') || '0';
  if (step === '0') {          // sem card emoldurado -> arte HD crua
    img.setAttribute('data-fb', '1');
    img.src = 'img/banners/hd/' + id + '.webp';
  } else if (step === '1') {   // sem HD -> recorte do pôster (selo já gravado)
    img.setAttribute('data-fb', '2');
    img.src = 'img/banners/' + id + '.webp';
    if (cell) cell.classList.add('bnx-baked');
  } else if (step === '2') {   // por fim, retrato do codex
    img.setAttribute('data-fb', '3');
    img.src = 'img/heroes/' + id + '.webp';
    if (cell) cell.classList.remove('bnx-baked');
  } else {
    img.onerror = null;
  }
}

function renderBannersCalendar() {
  var grid = document.getElementById('bnxGrid');
  if (!grid || typeof CODEX_HEROES === 'undefined') return;

  var pendingList = BANNER_CALENDAR.pending || [];
  var pendLabel = _bnxEsc(_bnxUi('banners.pending', 'Pendente'));
  var html = '';
  (BANNER_CALENDAR.heroIds || []).forEach(function (id) {
    var h = CODEX_HEROES.find(function (x) { return x.id === id; });
    if (!h) return;
    var nome = _bnxEsc(_bnxName(h));
    var badge = h.rarity === 'ur' ? 'ur' : 'ssr';
    var isPending = pendingList.indexOf(id) !== -1;
    html +=
      '<div class="bnx-cell' + (isPending ? ' bnx-is-pending' : '') + '" role="button" tabindex="0" ' +
        'onclick="navigateToTab(\'heroes\');showHeroDetail(' + h.id + ')" ' +
        'onkeydown="if(event.key===\'Enter\'){navigateToTab(\'heroes\');showHeroDetail(' + h.id + ')}">' +
        '<div class="bnx-frame">' +
          '<img class="bnx-art" src="img/banners/framed/' + h.id + '.webp" alt="" decoding="async" ' +
            'onerror="bnxArtFallback(this,' + h.id + ')">' +
          '<img class="bnx-badge" src="img/rarity/' + badge + '.webp" alt="' + badge.toUpperCase() + '" loading="lazy" decoding="async">' +
          (isPending ? '<span class="bnx-pending">' + pendLabel + '</span>' : '') +
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

// ─────────── compartilhar o calendário como imagem ───────────
function _bnxLoadHtml2canvas(cb) {
  if (window.html2canvas) return cb(window.html2canvas);
  var s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  s.onload = function () { cb(window.html2canvas || null); };
  s.onerror = function () { cb(null); };
  document.head.appendChild(s);
}

function bnxShareFallback(url) {
  url = url || location.href;
  if (document.getElementById('bnxShareMenu')) return;
  var text = encodeURIComponent(_bnxUi('banners.shareText', 'Calendário de Banners — Saint Seiya EX'));
  var u = encodeURIComponent(url);
  var menu = document.createElement('div');
  menu.className = 'bnx-share-menu';
  menu.id = 'bnxShareMenu';
  menu.innerHTML =
    '<a href="https://wa.me/?text=' + text + '%20' + u + '" target="_blank" rel="noopener">WhatsApp</a>' +
    '<a href="https://twitter.com/intent/tweet?text=' + text + '&url=' + u + '" target="_blank" rel="noopener">X / Twitter</a>' +
    '<a href="https://www.facebook.com/sharer/sharer.php?u=' + u + '" target="_blank" rel="noopener">Facebook</a>' +
    '<a href="https://t.me/share/url?url=' + u + '&text=' + text + '" target="_blank" rel="noopener">Telegram</a>';
  var bar = document.querySelector('.bnx-share-bar');
  if (bar && bar.parentNode) bar.parentNode.insertBefore(menu, bar.nextSibling);
}

function bnxShareCalendar() {
  var btn = document.getElementById('bnxShareBtn');
  var poster = document.querySelector('.bnx-poster');
  if (!poster) return;
  var label = btn ? btn.querySelector('span:last-child') : null;
  var oldTxt = label ? label.textContent : '';
  if (btn) { btn.disabled = true; if (label) label.textContent = _bnxUi('banners.sharePrep', 'Gerando imagem...'); }
  function restore() { if (btn) { btn.disabled = false; if (label) label.textContent = oldTxt || _bnxUi('banners.share', 'Compartilhar imagem'); } }

  _bnxLoadHtml2canvas(function (h2c) {
    if (!h2c) { restore(); bnxShareFallback(location.href); return; }
    h2c(poster, {
      backgroundColor: '#0b0703',
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true, logging: false
    }).then(function (canvas) {
      canvas.toBlob(function (blob) {
        restore();
        if (!blob) { bnxShareFallback(location.href); return; }
        var file = new File([blob], 'calendario-banners.png', { type: 'image/png' });
        // Web Share API com arquivo (celular): abre o menu nativo de compartilhar
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({
            files: [file],
            title: _bnxUi('banners.shareText', 'Calendário de Banners — Saint Seiya EX')
          }).catch(function () {});
          return;
        }
        // desktop: baixa a imagem e mostra os links das redes
        var dl = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = dl; a.download = 'calendario-banners.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(dl); }, 5000);
        bnxShareFallback(location.href);
      }, 'image/png');
    }).catch(function () { restore(); bnxShareFallback(location.href); });
  });
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
