

// Mostra a versão no footer (quando o DOM carregar)
function showAppVersion() {
  const el = document.getElementById('app-version');
  if (el) {
    el.textContent = `TRIADE ${APP_VERSION} · ${APP_VERSION_DATE}`;
  }
  // Avisa se atualizou pra uma versão nova (detecta versão salva)
  try {
    const last = localStorage.getItem('triade_app_version');
    if (last && last !== APP_VERSION) {
      // Nova versão detectada — notifica e limpa cache antigo
      setTimeout(() => {
        toast({
          title: '✨ Nova versão!',
          msg: `Atualizado de ${last} → ${APP_VERSION}`,
          type: 'success',
          duration: 5000
        });
      }, 1500);
      // Limpa cache antigo de dados (força refresh)
      localStorage.removeItem(cacheKey());
    }
    localStorage.setItem('triade_app_version', APP_VERSION);
  } catch(_) {}
}
document.addEventListener('DOMContentLoaded', showAppVersion);
document.addEventListener('DOMContentLoaded', function() {
  // Aplica o idioma carregado (do localStorage ou default)
  applyLangToUI();
});

// Mapeamento de bosses (ordem fixa)
// Imagens dos bosses em base64
const BOSS_IMGS = {
  saga: "img/bosses/saga.webp",
  mascara: "img/bosses/mascara.webp",
  aiolia: "img/bosses/aiolia.webp",
  milo: "img/bosses/milo.webp"
};

const BOSSES = [
  {key:"saga", name:"EVIL SAGA", tag:"⟁ Geminiano das Trevas", roman:"I"},
  {key:"mascara", name:"MÁSCARA DA MORTE", tag:"⟁ Cancer das Sombras", roman:"II"},
  {key:"aiolia", name:"AIOLIA", tag:"⟁ Leão Dourado", roman:"III"},
  {key:"milo", name:"MILO", tag:"⟁ Escorpião Dourado", roman:"IV"},
];

// Símbolos zodíacais por nick (adicione aqui quem quiser)
const ZODIAC = {
  "Hanter": "♏",
  // Adicione mais: "Nick": "♌", etc
};

let lastRecentNick = null;

// ═══════════ LOAD ═══════════
// ═══════════ CACHE LOCAL ═══════════
// Reduz chamadas à API: serve cache imediato e atualiza em background.
// TTL configurável + invalidação por hash do conteúdo.
function cacheKey() { return 'triade_cache_v1_' + guildSlug(); }
const CACHE_TTL_MS = 30 * 1000; // 30 segundos

function readCache() {
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || !cached.t || !cached.data) return null;
    return cached;
  } catch(_) { return null; }
}

function writeCache(data) {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({
      t: Date.now(),
      data: data
    }));
  } catch(_) {} // se quota excedida, ignora
}

// Hash simples pra detectar mudanças (evita re-renders desnecessários)
function hashData(data) {
  try {
    const s = JSON.stringify({
      p: (data.players || []).map(p => [p.nick, p.power]).sort(),
      g: data.gvg || [],
      e: data.events || []
    });
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return h;
  } catch(_) { return Date.now(); }
}

let lastDataHash = null;
let isLoading = false;

function renderEverything(data) {
  renderAll(data.players);
  renderRanking(data.players);
  renderGVG(data.gvg || [], data.players);
  renderEvents(data.events || []);
  populateNickSelect(data.players);
  document.getElementById('last-update').textContent =
    ui('footer.lastSync') + ': ' + new Date().toLocaleString(getLocale());
}

async function loadData(forceRefresh) {
  if (isLoading && !forceRefresh) return; // Evita chamadas concorrentes
  isLoading = true;

  // 1. Servir cache imediato se válido (TTL não expirado)
  const cached = readCache();
  const now = Date.now();
  const cacheValid = cached && (now - cached.t) < CACHE_TTL_MS;

  if (cached && !forceRefresh) {
    // Sempre renderiza do cache primeiro (mesmo se expirado) — UI instantânea
    try {
      renderEverything(cached.data);
      lastDataHash = hashData(cached.data);
    } catch(e) {
      console.warn('Erro ao renderizar do cache:', e);
    }

    // Se cache ainda fresco, não busca rede agora
    if (cacheValid) {
      isLoading = false;
      return;
    }
  }

  // 2. Buscar da rede
  try {
    const res = await fetch(API_URL + "?t=" + Date.now() + "&guild=" + encodeURIComponent(guildSlug()));
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Erro desconhecido");

    writeCache(data);

    // Re-renderiza apenas se o conteúdo mudou
    const newHash = hashData(data);
    if (newHash !== lastDataHash) {
      renderEverything(data);
      lastDataHash = newHash;
    } else {
      // Conteúdo igual: só atualiza o timestamp
      document.getElementById('last-update').textContent =
        ui('footer.lastSync') + ': ' + new Date().toLocaleString(getLocale());
    }
  } catch(err) {
    // Se já temos algo do cache na tela, só loga o erro e mantém o cache
    if (cached) {
      console.warn('Falha ao buscar atualização, mantendo cache:', err.message);
      document.getElementById('last-update').textContent =
        "⚠ Offline (usando cache de " + new Date(cached.t).toLocaleTimeString('pt-BR') + ")";
    } else {
      // Nenhum cache: mostrar erro
      document.getElementById('bosses-container').innerHTML =
        `<div class="loading" style="color:var(--error);">⚠ Erro ao carregar: ${err.message}<br><span style="font-size:.9rem">Verifique a URL da API no código.</span></div>`;
      document.getElementById('week-grid').innerHTML =
        `<div class="loading" style="grid-column: 1 / -1;color:var(--error);">⚠ Erro ao carregar eventos</div>`;
      document.getElementById('gvg-grid').innerHTML =
        `<div class="loading" style="grid-column: 1 / -1;color:var(--error);">⚠ Erro ao carregar GVG</div>`;
    }
  } finally {
    isLoading = false;
  }
}

// ═══════════ RANKING ═══════════
let rankingExpanded = false;

function renderRanking(players) {
  const sorted = [...players].sort((a,b) => b.power - a.power);
  if (sorted.length === 0) return;
  
  const maxPower = sorted[0].power;
  const podiumDiv = document.getElementById('podium-container');
  const tableDiv = document.getElementById('ranking-table');
  const moreBtn = document.getElementById('show-more-btn');
  
  // ═══ PÓDIO (Top 3) ═══
  const top3 = sorted.slice(0, 3);
  if (top3.length >= 3) {
    podiumDiv.innerHTML = `
      <div class="podium">
        <div class="podium-place silver">
          <div class="podium-medal">🥈</div>
          <div class="podium-rank">2º</div>
          <div class="podium-nick">${formatNick(top3[1].nick)}</div>
          <div class="podium-power">⚡ ${top3[1].power.toLocaleString('pt-BR')}</div>
        </div>
        <div class="podium-place gold">
          <div class="podium-crown">👑</div>
          <div class="podium-medal">🥇</div>
          <div class="podium-rank">1º</div>
          <div class="podium-nick">${formatNick(top3[0].nick)}</div>
          <div class="podium-power">⚡ ${top3[0].power.toLocaleString('pt-BR')}</div>
        </div>
        <div class="podium-place bronze">
          <div class="podium-medal">🥉</div>
          <div class="podium-rank">3º</div>
          <div class="podium-nick">${formatNick(top3[2].nick)}</div>
          <div class="podium-power">⚡ ${top3[2].power.toLocaleString('pt-BR')}</div>
        </div>
      </div>
    `;
  } else {
    podiumDiv.innerHTML = '';
  }
  
  // ═══ TABELA RANKEADA ═══
  function renderTableRows(showAll) {
    const limit = showAll ? sorted.length : Math.min(10, sorted.length);
    let html = '';
    for (let i = 0; i < limit; i++) {
      const p = sorted[i];
      const pos = i + 1;
      const pct = (p.power / maxPower) * 100;
      const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '';
      const cls = pos === 1 ? 'top1' : pos === 2 ? 'top2' : pos === 3 ? 'top3' : pos <= 10 ? 'top10' : '';
      
      html += `
        <div class="rank-row ${cls}">
          <span class="rank-pos">${pos}º</span>
          <span class="rank-medal">${medal}</span>
          <span class="rank-nick">${formatNick(p.nick)}</span>
          <div class="rank-bar"><div class="rank-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
          <span class="rank-power">${p.power.toLocaleString('pt-BR')}</span>
        </div>
      `;
    }
    return html;
  }
  
  tableDiv.innerHTML = renderTableRows(rankingExpanded);
  
  // Botão ver mais/menos
  if (sorted.length > 10) {
    moreBtn.style.display = 'block';
    moreBtn.textContent = rankingExpanded 
      ? `▲ Mostrar apenas Top 10 ▲`
      : `▼ Ver todos os ${sorted.length} cavaleiros ▼`;
    moreBtn.onclick = () => {
      rankingExpanded = !rankingExpanded;
      tableDiv.innerHTML = renderTableRows(rankingExpanded);
      moreBtn.textContent = rankingExpanded 
        ? `▲ Mostrar apenas Top 10 ▲`
        : `▼ Ver todos os ${sorted.length} cavaleiros ▼`;
    };
  } else {
    moreBtn.style.display = 'none';
  }
}

// ═══════════ SISTEMA DE ABAS + ROTEAMENTO ═══════════
// Mapa: tabId interno ↔ slug da URL ↔ título da página
// ═══════════ MAPA DE ROTAS ═══════════
// Abas principais (mostradas na nav superior)
const TAB_ROUTES = {
  'inicio':    { slug: '',              title: 'Início',        title_en: 'Home',         desc: 'Guia completo de Saint Seiya EX (Rebirth 2): codex, team builder, tier list e roleta.', desc_en: 'Complete Saint Seiya EX (Rebirth 2) guide: codex, team builder, tier list and roulette.', private: false },
  'guilda':    { slug: 'guilda',        title: 'Guilda',      title_en: 'Guild',     desc: 'Área restrita aos membros da Legião TRIADE.', desc_en: 'Restricted area for members of the TRIADE Legion.', private: true, isParent: true },
  'heroes':    { slug: 'herois',        title: 'Heróis',      title_en: 'Heroes',     desc: 'Codex completo dos 103 Cavaleiros do Zodíaco.', desc_en: 'Complete codex of the 103 Knights of the Zodiac.', private: false },
  'artifacts': { slug: 'artefatos',     title: 'Artefatos',  title_en: 'Artifacts', desc: 'Codex dos 34 artefatos lendários.', desc_en: 'Codex of the 34 legendary artifacts.', private: false },
  'cards':     { slug: 'cartas',        title: 'Cartas',     title_en: 'Cards',     desc: 'Codex de Ultimate Power Cards.', desc_en: 'Codex of Ultimate Power Cards.', private: false },
  'tier':      { slug: 'tier-list',     title: 'Tier List',  title_en: 'Tier List', desc: 'Tier list interativa dos Cavaleiros do Zodíaco.', desc_en: 'Interactive tier list of the Knights of the Zodiac.', private: false },
  'roleta':    { slug: 'roleta',        title: 'Roleta de Cavaleiros', title_en: 'Knights Roulette', desc: 'Sorteie cavaleiros e construa sua Tier List ao vivo, ideal para vídeos e lives.', desc_en: 'Spin to draw knights and build your Tier List live, perfect for videos and streams.', private: false },
  'banners':   { slug: 'banners',       title: 'Calendário de Banners', title_en: 'Banner Calendar', desc: 'Previsão da ordem de banners no servidor global, com base no Taiwan.', desc_en: 'Forecast of banner order on the global server, based on Taiwan.', private: false },
  'team':      { slug: 'team-builder',  title: 'Team Builder', title_en: 'Team Builder', desc: 'Monte a equipe perfeita com 9 cavaleiros + 2 suportes + equipamentos.', desc_en: 'Build the perfect team with 9 knights + 2 supports + equipment.', private: false }
};

// Sub-abas dentro de Guilda (todas privadas)
const GUILD_SUBTAB_ROUTES = {
  'update':    { slug: 'atualizar',     title: 'Atualizar Poder', title_en: 'Update Power', desc: 'Atualize seu poder de Cavaleiro.', desc_en: 'Update your Knight power.' },
  'bosses':    { slug: 'bosses',        title: 'Bosses',      title_en: 'Bosses',     desc: 'Distribuição de Bosses da Legião TRIADE.', desc_en: 'Boss distribution of the TRIADE Legion.' },
  'ranking':   { slug: 'ranking',       title: 'Ranking',    title_en: 'Ranking',   desc: 'Ranking de poder dos Cavaleiros da Legião TRIADE.', desc_en: 'Power ranking of the Knights of the TRIADE Legion.' },
  'gvg':       { slug: 'gvg',           title: 'GVG',         title_en: 'GVG',       desc: 'Guerra de Guildas — distribuição de papéis.', desc_en: 'Guild War — role distribution.' },
  'eventos':   { slug: 'eventos',       title: 'Eventos',    title_en: 'Events',    desc: 'Calendário de eventos da Legião TRIADE.', desc_en: 'Events calendar of the TRIADE Legion.' },
  'stats':     { slug: 'estatisticas',  title: 'Estatísticas', title_en: 'Statistics', desc: 'Histórico de evolução de poder da Legião.', desc_en: 'Power evolution history of the Legion.' },
  'vote':      { slug: 'votacao',       title: 'Votação',    title_en: 'Voting',    desc: 'Votação comunitária dos tiers dos Cavaleiros.', desc_en: 'Community voting on Knight tiers.' },
  'pendentes': { slug: 'pendentes',     title: 'Solicitações Pendentes', title_en: 'Pending Requests', desc: 'Aprovação de novos membros da guilda.', desc_en: 'Approval of new guild members.' },
  'elenco':    { slug: 'elenco',        title: 'Membros',    title_en: 'Members',   desc: 'Gestão dos membros da guilda.', desc_en: 'Guild members management.' },
  'discord':   { slug: 'discord',       title: 'Discord',    title_en: 'Discord',   desc: 'Webhook do Discord da guilda.', desc_en: 'Guild Discord webhook.' },
  'guildas':   { slug: 'guildas',       title: 'Guildas',    title_en: 'Guilds',    desc: 'Aprovação de novas guildas.', desc_en: 'New guild approval.' }
};
const GUILD_DEFAULT_SUBTAB = 'update'; // Sub-aba padrão ao entrar em /guilda

// Slug → tabId reverso
const SLUG_TO_TAB = {};
Object.entries(TAB_ROUTES).forEach(([id, info]) => {
  SLUG_TO_TAB[info.slug] = id;
});

// Estado da sub-aba ativa dentro de Guilda
let _activeGuildSubtab = GUILD_DEFAULT_SUBTAB;

// Aplica visualmente a aba ativa (sem mexer na URL)
// ════════════════════════════════════════════════════════════
// 📅 ABA BANNERS — modal de zoom
// ════════════════════════════════════════════════════════════
function abrirBannersModal() {
  const modal = document.getElementById('bannersModal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden'; // trava scroll do body
}
function fecharBannersModal(ev) {
  // Se clicou no conteúdo da imagem (não o fundo), não fecha — só se for no fundo ou no botão X
  if (ev && ev.target && ev.target.tagName === 'IMG') return;
  const modal = document.getElementById('bannersModal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
}
// Fechar com tecla ESC
document.addEventListener('keydown', function(ev) {
  if (ev.key === 'Escape') {
    const modal = document.getElementById('bannersModal');
    if (modal && modal.style.display === 'flex') {
      fecharBannersModal();
    }
  }
});
// Wire-up: clique na imagem abre o modal
document.addEventListener('DOMContentLoaded', function() {
  const wrapper = document.getElementById('bannersImgWrapper');
  if (wrapper) wrapper.addEventListener('click', abrirBannersModal);
});

function applyTabUI(tabId, doScroll) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (!btn) return false;

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');

  const subnav = document.getElementById('guildSubnav');
  const guildHeader = document.getElementById('guildHeader');

  // Se for aba "guilda": mostra header + subnav + ativa sub-aba
  if (tabId === 'guilda') {
    if (subnav) subnav.style.display = '';
    if (guildHeader) guildHeader.style.display = '';
    applyGuildSubtab(_activeGuildSubtab);
  } else {
    if (subnav) subnav.style.display = 'none';
    if (guildHeader) guildHeader.style.display = 'none';
    const content = document.getElementById('tab-' + tabId);
    if (content) content.classList.add('active');
    runTabInitHook(tabId);
  }

  if (doScroll) {
    // Topo da página: o topbar fixo fica no lugar e o conteúdo aparece
    // logo abaixo (rolar até o botão o esconderia sob a barra fixa)
    window.scrollTo({top: 0, behavior: 'smooth'});
  }
  updatePageMeta(tabId);
  return true;
}

// Aplica visualmente uma sub-aba da guilda
function applyGuildSubtab(subtabId) {
  if (!GUILD_SUBTAB_ROUTES[subtabId]) subtabId = GUILD_DEFAULT_SUBTAB;
  _activeGuildSubtab = subtabId;

  // Estado visual das sub-tabs
  document.querySelectorAll('.guild-subtab').forEach(b => b.classList.remove('active'));
  const subBtn = document.querySelector(`.guild-subtab[data-subtab="${subtabId}"]`);
  if (subBtn) subBtn.classList.add('active');

  // Mostra o conteúdo correto (que continua usando os IDs originais)
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const content = document.getElementById('tab-' + subtabId);
  if (content) content.classList.add('active');

  runTabInitHook(subtabId);
  updatePageMeta('guilda', subtabId);
}

// Hooks de inicialização (preserva comportamento original)
function runTabInitHook(tabId) {
  if (tabId === 'heroes') {
    if (typeof hideHeroDetail === 'function') hideHeroDetail();
    if (typeof initHeroesTab === 'function') initHeroesTab();
    else if (typeof renderHeroes === 'function') renderHeroes();
  }
  if (tabId === 'artifacts' && typeof initArtifactsTab === 'function') initArtifactsTab();
  if (tabId === 'cards' && typeof initCardsTab === 'function') initCardsTab();
  if (tabId === 'stats' && typeof initStatsTab === 'function') initStatsTab();
  if (tabId === 'tier' && typeof initTierTab === 'function') initTierTab();
  if (tabId === 'roleta' && typeof initRoletaTab === 'function') initRoletaTab();
  if (tabId === 'vote' && typeof initVoteTab === 'function') initVoteTab();
  if (tabId === 'team' && typeof initTeamTab === 'function') initTeamTab();
  if (tabId === 'update' && typeof initUpdatePoderTab === 'function') initUpdatePoderTab();
  if (tabId === 'elenco' && typeof initElencoTab === 'function') initElencoTab();
  if (tabId === 'discord' && typeof initGuildConfig === 'function') initGuildConfig();
  if (tabId === 'guildas' && typeof initGuildasTab === 'function') initGuildasTab();
}

// Atualiza title/meta — agora aceita sub-aba opcional
function updatePageMeta(tabId, subtabId) {
  let info;
  if (tabId === 'guilda' && subtabId && GUILD_SUBTAB_ROUTES[subtabId]) {
    info = GUILD_SUBTAB_ROUTES[subtabId];
  } else {
    info = TAB_ROUTES[tabId];
  }
  if (!info) return;
  // Escolhe título/descrição baseado no idioma
  const useEn = (typeof _lang !== 'undefined' && _lang === 'en');
  const titleStr = useEn && info.title_en ? info.title_en : info.title;
  const descStr  = useEn && info.desc_en  ? info.desc_en  : info.desc;
  const baseTitle = useEn
    ? 'Saint Seiya EX / Rebirth 2 — Codex, Team Builder & Tier List'
    : 'Saint Seiya EX / Rebirth 2 — Codex, Team Builder e Tier List';
  document.title = (tabId === 'inicio') ? baseTitle : `${titleStr} · Saint Seiya EX`;

  // Helper pra criar/atualizar meta tag por seletor
  const upsertMeta = (selector, attrName, attrValue, contentValue) => {
    let el = document.querySelector(selector);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attrName, attrValue);
      document.head.appendChild(el);
    }
    el.setAttribute('content', contentValue);
  };

  // Meta description
  upsertMeta('meta[name="description"]', 'name', 'description', descStr);

  // Open Graph
  upsertMeta('meta[property="og:title"]', 'property', 'og:title', document.title);
  upsertMeta('meta[property="og:description"]', 'property', 'og:description', descStr);

  // og:url e canonical (URL atual)
  const currentUrl = 'https://saintseiyaex.netlify.app' + location.pathname;
  upsertMeta('meta[property="og:url"]', 'property', 'og:url', currentUrl);
  // Canonical link
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', currentUrl);

  // og:locale baseado no idioma
  const locale = useEn ? 'en_US' : (typeof _lang !== 'undefined' && _lang === 'es' ? 'es_ES' : 'pt_BR');
  upsertMeta('meta[property="og:locale"]', 'property', 'og:locale', locale);

  // Twitter Card
  upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', document.title);
  upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', descStr);
}

// Navega pra uma aba principal e atualiza URL
function navigateToTab(tabId, options) {
  options = options || {};
  const info = TAB_ROUTES[tabId];
  if (!info) return;

  // ⚠️ Gate de privacidade
  if (info.private && typeof isLoggedIn === 'function' && !isLoggedIn()) {
    if (typeof openAuthModal === 'function') {
      openAuthModal('login');
      setTimeout(() => {
        const msg = document.querySelector('#authView-login .auth-msg');
        if (msg) {
          msg.textContent = '🔒 ' + ui('msg.loginRequired');
          msg.className = 'auth-msg info';
        }
      }, 50);
    }
    return;
  }

  const success = applyTabUI(tabId, options.scroll !== false);
  if (!success) return;

  // Atualiza URL sem recarregar
  if (!options.skipHistory) {
    let path;
    if (tabId === 'guilda') {
      const sub = GUILD_SUBTAB_ROUTES[_activeGuildSubtab];
      path = '/guilda' + (sub ? '/' + sub.slug : '');
    } else {
      path = info.slug ? '/' + info.slug : '/';
    }
    const newUrl = path + location.search + location.hash;
    if (location.pathname !== path) {
      history.pushState({tab: tabId, subtab: _activeGuildSubtab}, '', newUrl);
    }
  }
}

// Navega pra uma sub-aba da Guilda
function navigateToGuildSubtab(subtabId, options) {
  options = options || {};
  const info = GUILD_SUBTAB_ROUTES[subtabId];
  if (!info) return;

  // Gate: precisa estar logado
  if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
    if (typeof openAuthModal === 'function') {
      openAuthModal('login');
    }
    return;
  }

  applyGuildSubtab(subtabId);

  if (!options.skipHistory) {
    const path = '/guilda/' + info.slug;
    const newUrl = path + location.search + location.hash;
    if (location.pathname !== path) {
      history.pushState({tab: 'guilda', subtab: subtabId}, '', newUrl);
    }
  }
}

// Resolve o que mostrar baseado na URL
function resolveRouteFromURL() {
  const path = location.pathname.replace(/^\/+|\/+$/g, '');

  // /stream → modo OBS
  if (path === 'stream') {
    document.body.classList.add('stream-mode');
    _activeGuildSubtab = 'vote';
    applyTabUI('guilda', false);
    return;
  }
  if (location.search.indexOf('modo=stream') !== -1) {
    document.body.classList.add('stream-mode');
    _activeGuildSubtab = 'vote';
    applyTabUI('guilda', false);
    return;
  }

  // /guilda ou /guilda/<sub>
  if (path === 'guilda' || path.indexOf('guilda/') === 0) {
    if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
      // Não logado: vai pro Início e mostra modal
      applyTabUI('inicio', false);
      history.replaceState({tab: 'inicio'}, '', '/');
      setTimeout(() => {
        if (!isLoggedIn() && typeof openAuthModal === 'function') {
          openAuthModal('login');
          setTimeout(() => {
            const msg = document.querySelector('#authView-login .auth-msg');
            if (msg) {
              msg.textContent = '🔒 ' + ui('msg.loginRequired');
              msg.className = 'auth-msg info';
            }
          }, 50);
        }
      }, 200);
      return;
    }
    // Logado: identifica sub-aba
    const parts = path.split('/');
    const subSlug = parts[1] || '';
    let subId = GUILD_DEFAULT_SUBTAB;
    for (const k in GUILD_SUBTAB_ROUTES) {
      if (GUILD_SUBTAB_ROUTES[k].slug === subSlug) { subId = k; break; }
    }
    _activeGuildSubtab = subId;
    applyTabUI('guilda', false);
    return;
  }

  // /herois/<slug> → detalhe de herói (páginas pré-renderizadas p/ SEO)
  if (path.indexOf('herois/') === 0) {
    applyTabUI('heroes', false);
    const heroSlug = path.split('/')[1] || '';
    if (typeof openHeroBySlug === 'function') openHeroBySlug(heroSlug);
    return;
  }

  // /artefatos/<slug> → detalhe de artefato (F5 mantém a página aberta)
  if (path.indexOf('artefatos/') === 0) {
    applyTabUI('artifacts', false);
    const artSlug = path.split('/')[1] || '';
    if (typeof openArtifactBySlug === 'function') openArtifactBySlug(artSlug);
    return;
  }

  // /cartas/<slug> → detalhe de carta
  if (path.indexOf('cartas/') === 0) {
    applyTabUI('cards', false);
    const cardSlug = path.split('/')[1] || '';
    if (typeof openCardBySlug === 'function') openCardBySlug(cardSlug);
    return;
  }

  // Outras rotas: aba principal pelo slug
  const tabId = SLUG_TO_TAB[path];
  if (tabId) {
    const info = TAB_ROUTES[tabId];
    if (info.private && typeof isLoggedIn === 'function' && !isLoggedIn()) {
      applyTabUI('inicio', false);
      history.replaceState({tab: 'inicio'}, '', '/');
    } else {
      applyTabUI(tabId, false);
    }
  } else {
    applyTabUI('inicio', false);
    if (path !== '') history.replaceState({tab: 'inicio'}, '', '/');
  }
}

// Click nas abas principais
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-tab');
    navigateToTab(target);
  });
});

// Click nas sub-tabs da Guilda
document.querySelectorAll('.guild-subtab').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-subtab');
    navigateToGuildSubtab(target);
  });
});

// Botões voltar/avançar do navegador
window.addEventListener('popstate', () => {
  resolveRouteFromURL();
});

// Resolve URL inicial ao carregar
document.addEventListener('DOMContentLoaded', resolveRouteFromURL);
if (document.readyState !== 'loading') {
  resolveRouteFromURL();
}

// Resolve o que mostrar baseado na URL atual (ao carregar a página ou navegar)
function resolveRouteFromURL_OLD_REMOVED() {
  // Bloco antigo removido — substituído pela versão com sub-tabs acima
  return;
}

// ═══════════ GVG (Guerra de Guildas) ═══════════
function renderGVG(gvgList, players) {
  const grid = document.getElementById('gvg-grid');
  
  // Cria mapa nick → poder pra exibir o poder de cada um
  const powerMap = {};
  players.forEach(p => { powerMap[p.nick.toLowerCase()] = p.power; });
  
  // Separar por papel
  const ataque = [];
  const defesa = [];
  gvgList.forEach(g => {
    const papel = String(g.papel).toLowerCase();
    const power = powerMap[g.nick.toLowerCase()] || 0;
    const item = {nick: g.nick, power: power, observacao: g.observacao};
    if (papel.includes('ataque') || papel.includes('atk')) ataque.push(item);
    else if (papel.includes('defesa') || papel.includes('def')) defesa.push(item);
  });
  
  // Ordenar por poder dentro de cada grupo
  ataque.sort((a,b) => b.power - a.power);
  defesa.sort((a,b) => b.power - a.power);
  
  if (ataque.length === 0 && defesa.length === 0) {
    grid.innerHTML = `<div class="loading" style="grid-column: 1 / -1;">${ui('gvg.notRegistered')}<br><span style="font-size:.85rem;color:var(--ink-dim);">${ui('gvg.notRegisteredHint')}</span></div>`;
    return;
  }
  
  function renderBlock(titulo, icon, lista, classe) {
    const total = lista.reduce((s,p) => s+p.power, 0);
    const playersHTML = lista.map((p, i) => {
      const obsHTML = p.observacao 
        ? `<div class="gvg-obs">💡 ${escapeHtml(p.observacao)}</div>` 
        : '';
      return `<div class="gvg-player ${p.observacao ? 'has-obs' : ''}">
        <span class="gvg-pos">${String(i+1).padStart(2,'0')}</span>
        <span class="gvg-nick">${formatNick(p.nick)}</span>
        <span class="gvg-power">${p.power.toLocaleString(getLocale())}</span>
        ${obsHTML}
      </div>`;
    }).join('') || `<div class="loading" style="padding:30px 16px;">— ${ui('gvg.empty')} —</div>`;
    
    const locale = getLocale();
    return `
      <div class="gvg-block ${classe}">
        <div class="gvg-header">
          <div class="gvg-icon">${icon}</div>
          <div class="gvg-title">${titulo}</div>
          <div class="gvg-stats">
            <span><b>${lista.length}</b> ${ui('gvg.members')}</span>
            <span><b>${total.toLocaleString(locale)}</b> ${ui('gvg.power')}</span>
          </div>
        </div>
        <div class="gvg-list">${playersHTML}</div>
      </div>
    `;
  }
  
  grid.innerHTML = 
    renderBlock(ui('gvg.attack'), '⚔', ataque, 'ataque') + 
    renderBlock(ui('gvg.defense'), '🛡', defesa, 'defesa');
}

// ═══════════ EVENTOS — CALENDÁRIO ═══════════
const DIAS_SEMANA = [
  {full:"Domingo", short:"DOM", aliases:["domingo","dom","sunday"]},
  {full:"Segunda", short:"SEG", aliases:["segunda","seg","monday","segunda-feira"]},
  {full:"Terça",   short:"TER", aliases:["terça","ter","tuesday","terca","terça-feira","terca-feira"]},
  {full:"Quarta",  short:"QUA", aliases:["quarta","qua","wednesday","quarta-feira"]},
  {full:"Quinta",  short:"QUI", aliases:["quinta","qui","thursday","quinta-feira"]},
  {full:"Sexta",   short:"SEX", aliases:["sexta","sex","friday","sexta-feira"]},
  {full:"Sábado",  short:"SÁB", aliases:["sábado","sabado","sab","saturday"]}
];

// Retorna índice 0..6 do dia (0=domingo) ou -1 se não reconhecer.
// Aceita: "domingo", "Segunda-feira", "ter", "sab", etc.
function normalizarDia(diaTexto) {
  const t = String(diaTexto).toLowerCase().trim();
  for (let i = 0; i < DIAS_SEMANA.length; i++) {
    if (DIAS_SEMANA[i].aliases.includes(t)) return i;
  }
  return -1;
}

// Tira acentos, "-feira", espaços
function normDiaStr(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace('-feira', '')
    .replace(/\s+/g, '')
    .trim();
}

// Mapeia nomes/abreviações pro índice 0..6 (0=domingo)
function diaParaIndice(s) {
  const n = normDiaStr(s);
  const mapa = {
    'dom':0, 'domingo':0,
    'seg':1, 'segunda':1,
    'ter':2, 'terca':2,
    'qua':3, 'quarta':3,
    'qui':4, 'quinta':4,
    'sex':5, 'sexta':5,
    'sab':6, 'sabado':6
  };
  return mapa[n];
}

// Parser completo: aceita "domingo", "quinta-domingo", "segunda,quarta,sexta",
// "sexta-segunda" (atravessa semana), etc. Retorna array de índices 0..6.
function parseDiasEvento(raw) {
  const txt = String(raw || '').toLowerCase().trim();
  if (!txt) return [];

  const resultado = new Set();
  const partes = txt.split(',');

  for (let p = 0; p < partes.length; p++) {
    const parte = partes[p].trim();
    if (!parte) continue;

    // Normaliza ANTES de checar range (porque "segunda-feira" tem hífen mas não é range)
    const partNorm = normDiaStr(parte);

    if (partNorm.indexOf('-') !== -1) {
      const lados = partNorm.split('-');
      if (lados.length === 2) {
        const ini = diaParaIndice(lados[0]);
        const fim = diaParaIndice(lados[1]);
        if (ini !== undefined && fim !== undefined) {
          // Expande o range (circular)
          let i = ini;
          let safety = 0;
          while (safety++ < 8) {
            resultado.add(i);
            if (i === fim) break;
            i = (i + 1) % 7;
          }
          continue;
        }
      }
    }

    const idx = diaParaIndice(partNorm);
    if (idx !== undefined) resultado.add(idx);
  }

  return Array.from(resultado);
}

function timeToMinutes(t) {
  if (!t) return 9999;
  const m = String(t).match(/(\d{1,2}):?(\d{2})?/);
  if (!m) return 9999;
  return parseInt(m[1]||0) * 60 + parseInt(m[2]||0);
}

function renderEvents(events) {
  const grid = document.getElementById('week-grid');
  const hoje = new Date().getDay(); // 0=Dom, 6=Sáb
  
  // Agrupar eventos por dia — um evento com range aparece em todos os dias do range
  const buckets = [[], [], [], [], [], [], []];
  events.forEach(ev => {
    const dias = parseDiasEvento(ev.dia);
    dias.forEach(idx => {
      if (idx >= 0 && idx <= 6) buckets[idx].push(ev);
    });
  });
  
  // Ordenar eventos de cada dia por horário
  buckets.forEach(b => b.sort((a,b) => timeToMinutes(a.horario) - timeToMinutes(b.horario)));
  
  grid.innerHTML = '';
  DIAS_SEMANA.forEach((dia, idx) => {
    const isToday = idx === hoje;
    const eventos = buckets[idx];
    
    // Calcula posição relativa do dia desta coluna em relação a hoje:
    // 0 = hoje, 1..6 = futuro, -1..-6 = passado (semana corrente)
    // Convenção da semana: domingo (0) é o início — pra simplificar, usamos "dias até esse índice na semana atual"
    // Ex: hoje=quinta (4), idx=domingo (0) → já passou (idx < hoje)
    // Ex: hoje=quinta (4), idx=sábado (6) → futuro (idx > hoje)
    let estado;
    if (idx === hoje) {
      estado = 'ativo';      // verde
    } else if (idx > hoje) {
      estado = 'upcoming';   // azul (em breve)
    } else {
      estado = 'encerrado';  // cinza (já passou)
    }
    
    let eventsHTML = '';
    if (eventos.length === 0) {
      eventsHTML = `<div class="empty-day">— ${ui('events.noEvents')} —</div>`;
    } else {
      eventsHTML = eventos.map(ev => {
        // Estado visual = estado da coluna (não do status do backend)
        const cls = estado === 'ativo' ? '' : (estado === 'upcoming' ? 'upcoming' : 'encerrado');
        const label = estado === 'ativo' ? ui('events.active') : (estado === 'upcoming' ? ui('events.upcoming') : ui('events.ended'));
        
        const desc = ev.descricao ? `<div class="event-desc">${escapeHtml(ev.descricao)}</div>` : '';
        const recompensa = ev.recompensa ? `<div class="event-reward">🎁 ${escapeHtml(ev.recompensa)}</div>` : '';
        const detail = (desc || recompensa) ? 
          `<div class="event-detail">${desc}${recompensa}</div>` : '';
        
        return `<div class="event-card ${cls}" onclick="this.classList.toggle('expanded')">
          <div class="event-time">${escapeHtml(ev.horario || '--:--')} <span class="event-status-dot"></span><span class="event-status-label">${label}</span></div>
          <div class="event-name">${escapeHtml(ev.nome)}</div>
          ${detail}
        </div>`;
      }).join('');
    }
    
    // Tradução dos dias da semana (pro inglês e espanhol)
    const diasEn = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const diasShortEn = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const diasEs = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const diasShortEs = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
    const diaFull = _lang === 'en' ? diasEn[idx] : _lang === 'es' ? diasEs[idx] : dia.full;
    const diaShort = _lang === 'en' ? diasShortEn[idx] : _lang === 'es' ? diasShortEs[idx] : dia.short;
    const todayLabel = ui('events.today');
    
    grid.insertAdjacentHTML('beforeend', `
      <div class="day-col ${isToday ? 'today' : ''}">
        <div class="day-header">
          <div class="day-name">${diaFull}</div>
          <div class="day-short">${isToday ? '◆ ' + todayLabel + ' ◆' : diaShort}</div>
        </div>
        <div class="day-events">${eventsHTML}</div>
      </div>
    `);
  });
}

function escapeHtml(s) {
  return String(s||'').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

// ═══════════ DISTRIBUIÇÃO (snake draft) ═══════════
function distribute(players) {
  const sorted = [...players].sort((a,b) => b.power - a.power);
  const groups = [[], [], [], []];
  sorted.forEach((p, i) => {
    const cycle = Math.floor(i / 4);
    let pos = i % 4;
    if (cycle % 2 === 1) pos = 3 - pos;
    groups[pos].push(p);
  });
  return groups;
}

// ═══════════ RENDER ═══════════
function renderAll(players) {
  const groups = distribute(players);
  const container = document.getElementById('bosses-container');
  container.innerHTML = '';
  
  let totalPower = 0;
  players.forEach(p => totalPower += p.power);
  
  document.getElementById('meta-row').innerHTML = `
    <span><b>4</b> ${ui('guild.bosses')}</span>
    <span><b>${players.length}</b> ${ui('guild.knights')}</span>
    <span><b>${totalPower.toLocaleString(getLocale())}</b> ${ui('guild.totalPower')}</span>
  `;
  
  BOSSES.forEach((boss, idx) => {
    const group = groups[idx];
    if (!group.length) return;
    const total = group.reduce((s,p)=>s+p.power, 0);
    const avg = Math.round(total / group.length);
    const head = group[0];
    
    const locale = getLocale();
    const ordemLabels = (_lang === 'en')
      ? ['First', 'Second', 'Third', 'Fourth']
      : (_lang === 'es')
      ? ['Primero', 'Segundo', 'Tercero', 'Cuarto']
      : ['Primeiro', 'Segundo', 'Terceiro', 'Quarto'];
    const ordemLabel = ordemLabels[idx] || ordemLabels[3];

    const html = `
      <section class="boss">
        <div class="boss-grid">
          <div class="boss-art">
            <span class="corner tl"></span><span class="corner tr"></span>
            <span class="corner bl"></span><span class="corner br"></span>
            <img src="${BOSS_IMGS[boss.key]}" alt="${boss.name}" loading="lazy" decoding="async" />
            <div class="badge">
              <div class="order-num">${boss.roman}</div>
              <div class="order-label">${ordemLabel} ${ui('bosses.bossWord')}</div>
            </div>
          </div>
          <div class="boss-info">
            <div class="boss-name">${boss.name}</div>
            <span class="boss-tag">${boss.tag}</span>
            <div class="stats">
              <div class="stat"><span class="stat-label">${ui('bosses.members')}</span><span class="stat-value">${group.length}</span></div>
              <div class="stat"><span class="stat-label">${ui('bosses.totalPower')}</span><span class="stat-value">${total.toLocaleString(locale)}</span></div>
              <div class="stat"><span class="stat-label">${ui('bosses.average')}</span><span class="stat-value">${avg.toLocaleString(locale)}</span></div>
            </div>
            <div class="head-of-key">
              <div class="label">${ui('bosses.keyHead')}</div>
              <div class="name">${formatNick(head.nick)}</div>
              <div class="power">⚡ ${head.power.toLocaleString(locale)} ${ui('bosses.ofPower')}</div>
            </div>
            <div class="roster">
              ${group.map((p, i) => {
                const isRecent = p.nick === lastRecentNick;
                const star = i === 0 ? '⭐ ' : '';
                return `<div class="player ${isRecent?'recent':''}">
                  <span class="pos">${String(i+1).padStart(2,'0')}</span>
                  <span class="pname">${star}${formatNick(p.nick)}</span>
                  <span class="ppwr">${p.power.toLocaleString(locale)}</span>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>
      </section>
    `;
    container.insertAdjacentHTML('beforeend', html);
  });
  
  // Limpar destaque após 3s
  if (lastRecentNick) {
    setTimeout(() => { lastRecentNick = null; }, 3000);
  }
}

function formatNick(nick) {
  const symbol = ZODIAC[nick];
  return symbol ? `${symbol} ${nick}` : nick;
}

// ═══════════ DROPDOWN ═══════════
let playersData = []; // guarda dados completos dos jogadores

function populateNickSelect(players) {
  playersData = players;
  const sel = document.getElementById('sel-nick');
  sel.innerHTML = '<option value="">— Selecione seu nick —</option>';
  players
    .map(p => p.nick)
    .sort((a,b) => a.localeCompare(b))
    .forEach(nick => {
      const opt = document.createElement('option');
      opt.value = nick;
      const playerInfo = players.find(p => p.nick === nick);
      const lock = playerInfo && playerInfo.locked ? ' 🔒' : '';
      opt.textContent = nick + lock;
      sel.appendChild(opt);
    });
}

// ═══════════ STATUS DO NICK SELECIONADO ═══════════
function updateNickStatus() {
  const nick = document.getElementById('sel-nick').value;
  const statusDiv = document.getElementById('nick-status');
  
  if (!nick) {
    statusDiv.textContent = '';
    statusDiv.className = 'nick-status';
    return;
  }
  
  const player = playersData.find(p => p.nick === nick);
  if (!player) return;
  
  if (player.locked) {
    statusDiv.innerHTML = `🔒 ${ui('update.lockedHint').replace('{email}', player.emailMask || '***')}`;
    statusDiv.className = 'nick-status locked';
  } else {
    statusDiv.innerHTML = `🔓 ${ui('update.freeHint')}`;
    statusDiv.className = 'nick-status unlocked';
  }
}
document.getElementById('sel-nick').addEventListener('change', updateNickStatus);

// ═══════════ ABAS DE AUTENTICAÇÃO ═══════════
document.querySelectorAll('.auth-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.getAttribute('data-mode');
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.auth-mode').forEach(m => m.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('mode-' + mode).classList.add('active');
    document.getElementById('feedback').innerHTML = '';
  });
});

// ═══════════ MEMÓRIA DE SESSÃO (token de 6h) ═══════════
const SESSION_KEY = 'triade_session';

function getSessions() {
  try {
    const data = localStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : {};
  } catch(e) { return {}; }
}

function saveSession(email, nick, token) {
  try {
    const obj = getSessions();
    const key = (email + '::' + nick).toLowerCase();
    obj[key] = {token, time: Date.now(), email, nick};
    localStorage.setItem(SESSION_KEY, JSON.stringify(obj));
  } catch(e) {}
}

function getSessionToken(email, nick) {
  if (!email || !nick) return null;
  const obj = getSessions();
  const key = (email + '::' + nick).toLowerCase();
  const entry = obj[key];
  if (!entry) return null;
  // Sessão local expira em 6h também (mesmo TTL do backend)
  if (Date.now() - entry.time > 6 * 60 * 60 * 1000) {
    delete obj[key];
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(obj)); } catch(e) {}
    return null;
  }
  return entry.token;
}

function clearSession(email, nick) {
  try {
    const obj = getSessions();
    const key = (email + '::' + nick).toLowerCase();
    delete obj[key];
    localStorage.setItem(SESSION_KEY, JSON.stringify(obj));
  } catch(e) {}
}

function getSessionRemainingHours(email, nick) {
  const obj = getSessions();
  const key = (email + '::' + nick).toLowerCase();
  const entry = obj[key];
  if (!entry) return 0;
  const restante = 6 * 60 * 60 * 1000 - (Date.now() - entry.time);
  return Math.max(0, Math.ceil(restante / (60 * 60 * 1000)));
}

// Atualiza UI quando email/nick muda
function checkVerifiedStatus() {
  const selNick = document.getElementById('sel-nick');
  const inpEmail = document.getElementById('inp-email');
  // Se algum dos elementos não existir (form antigo foi removido), só retorna
  if (!selNick || !inpEmail) return;

  const nick = selNick.value;
  const email = inpEmail.value.trim();
  const codigoRow = document.getElementById('codigo-row');
  const sendBtn = document.getElementById('btn-send-code');
  const verifiedHint = document.getElementById('verified-hint');
  const codigoInput = document.getElementById('inp-codigo');

  // Mais um guard: se nem o codigoRow/sendBtn/codigoInput existem, sai
  if (!codigoRow || !sendBtn || !codigoInput) return;

  const token = getSessionToken(email, nick);
  
  if (token) {
    // Já tem sessão válida
    const horas = getSessionRemainingHours(email, nick);
    if (verifiedHint) {
      verifiedHint.innerHTML = `✓ ${ui('update.sessionHint').replace('{h}', horas)}`;
      verifiedHint.style.display = 'block';
    }
    codigoRow.style.display = 'grid';
    codigoInput.value = ui('update.sessionActive');
    codigoInput.disabled = true;
    codigoInput.style.color = 'var(--success)';
    sendBtn.textContent = '🔄 ' + ui('update.requestNewCode');
  } else {
    // Sem sessão
    if (verifiedHint) verifiedHint.style.display = 'none';
    codigoInput.disabled = false;
    codigoInput.style.color = '';
    if (codigoInput.value === '✓ SESSÃO ATIVA') codigoInput.value = '';
    sendBtn.textContent = '📨 ' + ui('update.sendCode');
  }
}

const inpEmailEl = document.getElementById('inp-email');
if (inpEmailEl) inpEmailEl.addEventListener('input', checkVerifiedStatus);
const selNickEl = document.getElementById('sel-nick');
if (selNickEl) selNickEl.addEventListener('change', checkVerifiedStatus);

// ═══════════ UTILITÁRIO: Loading state nos botões ═══════════
function setButtonLoading(btn, isLoading, loadingText) {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('loading');
    btn.innerHTML = `<span class="btn-spinner"></span>${loadingText || 'Carregando...'}`;
  } else {
    btn.disabled = false;
    btn.classList.remove('loading');
    if (btn.dataset.originalHtml) {
      btn.innerHTML = btn.dataset.originalHtml;
      delete btn.dataset.originalHtml;
    }
  }
}

// ═══════════ PRÉ-CARREGAR IMAGENS DOS TOP HERÓIS ═══════════
// Aproveita o tempo ocioso após o load pra baixar imagens dos cavaleiros mais usados
// (SSR + cavaleiros de ouro). Quando o usuário abrir o Codex, já está no cache do navegador.
function preloadTopHeroImages() {
  try {
    if (typeof CODEX_HEROES === 'undefined') return;
    // Pega até 24 SSR (cavaleiros de ouro + lideres) — mesma quantidade do primeiro batch lazy
    const tops = CODEX_HEROES
      .filter(h => h.rarity === 'ssr' && h.image)
      .slice(0, 24);
    tops.forEach(h => {
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'lazy';
      img.src = h.image;
    });
  } catch(_) {}
}

// Roda quando o navegador estiver ocioso (não bloqueia carregamento)
if ('requestIdleCallback' in window) {
  requestIdleCallback(preloadTopHeroImages, { timeout: 2000 });
} else {
  setTimeout(preloadTopHeroImages, 1500);
}

// ═══════════ TOAST NOTIFICATIONS ═══════════
// Uso: toast('Mensagem'), toast('Título', 'mensagem'), toast({title, msg, type, duration, icon})
// Tipos: 'success', 'error', 'warn', 'info'
function toast(arg1, arg2, arg3) {
  let cfg;
  if (typeof arg1 === 'object' && arg1 !== null) {
    cfg = arg1;
  } else if (arg2 !== undefined) {
    cfg = { title: arg1, msg: arg2, type: arg3 };
  } else {
    cfg = { msg: arg1 };
  }

  const type = cfg.type || 'info';
  const icons = { success: '✓', error: '✗', warn: '⚠', info: 'ℹ' };
  const icon = cfg.icon || icons[type] || icons.info;
  const duration = cfg.duration || 3500;

  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-body">
      ${cfg.title ? `<div class="toast-title">${cfg.title}</div>` : ''}
      ${cfg.msg ? `<div class="toast-msg">${cfg.msg}</div>` : ''}
    </div>
  `;

  container.appendChild(el);
  // Force reflow pra animar
  requestAnimationFrame(() => el.classList.add('show'));

  // Click pra fechar antes do tempo
  el.addEventListener('click', () => closeToast(el));

  // Auto-fechar
  setTimeout(() => closeToast(el), duration);
}

function closeToast(el) {
  if (!el || el._closing) return;
  el._closing = true;
  el.classList.remove('show');
  el.classList.add('hide');
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 350);
}

// ═══════════ VIBRAÇÃO NO MOBILE ═══════════
// Wrapper seguro pra navigator.vibrate (alguns navegadores não suportam)
function buzz(pattern) {
  try {
    if ('vibrate' in navigator) {
      // pattern pode ser número (ms) ou array [vibrate, pause, vibrate, ...]
      navigator.vibrate(pattern);
    }
  } catch(_) {}
}

// ═══════════ VALIDAÇÃO RIGOROSA DE EMAIL ═══════════
// Retorna {ok: true} ou {ok: false, error: '...'}
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { ok: false, error: 'Email vazio' };
  }
  email = email.trim().toLowerCase();

  // Tamanho razoável
  if (email.length < 5 || email.length > 254) {
    return { ok: false, error: 'Email com tamanho inválido' };
  }

  // Não pode ter espaços
  if (/\s/.test(email)) {
    return { ok: false, error: 'Email não pode ter espaços' };
  }

  // Formato básico (mais rigoroso que o anterior)
  // - letras, números, ., _, -, +
  // - exatamente 1 @
  // - domínio com ponto e TLD de 2+ letras
  const re = /^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
  if (!re.test(email)) {
    return { ok: false, error: 'Formato de email inválido' };
  }

  // Pontos consecutivos (".." é inválido em RFC)
  if (email.includes('..')) {
    return { ok: false, error: 'Email com pontos duplicados' };
  }

  // Não pode começar/terminar a parte local com ponto
  const localPart = email.split('@')[0];
  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return { ok: false, error: 'Email com ponto no início/fim' };
  }

  // Domínios temporários/descartáveis comuns (bloqueia spam)
  const domain = email.split('@')[1];
  const blockedDomains = [
    'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', '10minutemail.com',
    'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'fakeinbox.com',
    'yopmail.com', 'dispostable.com', 'maildrop.cc', 'trashmail.com', 'sharklasers.com'
  ];
  if (blockedDomains.includes(domain)) {
    return { ok: false, error: 'Use um email permanente (descartáveis não aceitos)' };
  }

  return { ok: true, email: email };
}

// ═══════════ ENVIAR CÓDIGO POR EMAIL ═══════════
async function enviarCodigo() {
  const nick = document.getElementById('sel-nick').value;
  const email = document.getElementById('inp-email').value.trim();
  const fb = document.getElementById('feedback');
  const btn = document.getElementById('btn-send-code');
  
  fb.textContent = '';
  fb.className = 'feedback';
  
  if (!nick) { fb.textContent = '⚠ Selecione um nick'; fb.classList.add('err'); return; }
  if (!email) { fb.textContent = '⚠ Informe seu email'; fb.classList.add('err'); return; }
  const emailCheck = validateEmail(email);
  if (!emailCheck.ok) {
    fb.textContent = '⚠ ' + emailCheck.error;
    fb.classList.add('err');
    return;
  }
  // Usa o email normalizado (lowercase, trimmed)
  const emailNorm = emailCheck.email;
  
  setButtonLoading(btn, true, 'Enviando...');
  
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({action: 'sendCode', guild: guildSlug(), nick, email: emailNorm}),
      headers: {'Content-Type': 'text/plain'}
    });
    const data = await res.json();
    
    if (data.ok) {
      fb.innerHTML = `✓ ${data.message}<br><small style="opacity:.8">${ui('update.checkInbox').replace('{m}', data.expiraEm)}</small>`;
      fb.classList.add('ok');
      document.getElementById('codigo-row').style.display = 'grid';
      document.getElementById('inp-codigo').focus();
    } else {
      fb.innerHTML = `✗ ${data.error}`;
      fb.classList.add('err');
    }
  } catch(err) {
    fb.textContent = '✗ Erro: ' + err.message;
    fb.classList.add('err');
  } finally {
    setButtonLoading(btn, false);
  }
}

// ═══════════ ATUALIZAR (com código/token ou senha) ═══════════
async function atualizarPoder(modo) {
  const nick = document.getElementById('sel-nick').value;
  const power = document.getElementById('inp-power').value;
  const fb = document.getElementById('feedback');
  
  fb.textContent = '';
  fb.className = 'feedback';
  
  if (!nick) { fb.textContent = '⚠ Selecione um nick'; fb.classList.add('err'); return; }
  if (!power || isNaN(power) || Number(power) < 0) { 
    fb.textContent = '⚠ ' + ui('msg.invalidPower'); fb.classList.add('err'); return; 
  }
  
  let payload = {action: 'update', guild: guildSlug(), nick, power: Number(power)};
  let btn;
  let usandoSessao = false;
  
  if (modo === 'logado') {
    // NOVO: usa o authToken do login email+senha
    if (typeof _authState === 'undefined' || !_authState || !_authState.token) {
      fb.textContent = '⚠ ' + ui('msg.mustLogin'); fb.classList.add('err');
      return;
    }
    payload.authToken = _authState.token;
    btn = document.getElementById('btn-update-logado');
  } else if (modo === 'senha') {
    const senha = document.getElementById('inp-senha').value;
    if (!senha) { fb.textContent = '⚠ Informe a senha'; fb.classList.add('err'); return; }
    payload.senha = senha;
    btn = document.getElementById('btn-update-senha');
  } else {
    const email = document.getElementById('inp-email').value.trim();
    const codigoInput = document.getElementById('inp-codigo').value.trim();
    if (!email) { fb.textContent = '⚠ Informe seu email'; fb.classList.add('err'); return; }
    
    payload.email = email;
    
    // Tenta usar token de sessão primeiro
    const token = getSessionToken(email, nick);
    if (token && codigoInput === '✓ SESSÃO ATIVA') {
      payload.token = token;
      usandoSessao = true;
    } else {
      // Sem sessão — exige código
      if (!codigoInput || codigoInput.length !== 6) { 
        fb.textContent = '⚠ ' + ui('msg.invalidCode'); fb.classList.add('err'); return; 
      }
      payload.codigo = codigoInput;
    }
    
    btn = document.getElementById('btn-update-codigo');
  }
  
  setButtonLoading(btn, true, 'Atualizando...');
  
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {'Content-Type': 'text/plain'}
    });
    const data = await res.json();
    
    if (data.ok) {
      let msg = `✓ <b>${data.nick}</b> atualizado: ${data.oldPower.toLocaleString('pt-BR')} → <b>${data.newPower.toLocaleString('pt-BR')}</b>`;
      if (data.emailVinculadoAgora) msg += ' 🔒 (email vinculado!)';
      if (data.master) msg += ' 👑 (master)';
      else if (data.admin) msg += ' ⚔ (líder)';
      if (usandoSessao) msg += ' ⚡ (sessão ativa)';
      fb.innerHTML = msg;
      fb.classList.add('ok');
      lastRecentNick = data.nick;
      
      // Salva token de sessão se veio um novo (após código)
      if (data.token && payload.email) {
        saveSession(payload.email, nick, data.token);
      }
      
      // Limpa campos sensíveis
      document.getElementById('inp-power').value = '';
      document.getElementById('inp-senha').value = '';
      // Atualiza UI da sessão
      checkVerifiedStatus();
      
      setTimeout(() => loadData(true), 500); // força refresh (ignora cache)
    } else {
      fb.innerHTML = `✗ ${data.error}`;
      fb.classList.add('err');
      
      // Se sessão expirou no backend, limpa local
      if (data.sessionExpired && payload.email) {
        clearSession(payload.email, nick);
        checkVerifiedStatus();
      }
    }
  } catch(err) {
    fb.textContent = '✗ Erro: ' + err.message;
    fb.classList.add('err');
  } finally {
    setButtonLoading(btn, false);
  }
}

// Eventos dos botões (guards porque alguns elementos foram removidos da UI)
function safeOn(id, ev, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(ev, handler);
}
safeOn('btn-send-code', 'click', enviarCodigo);
safeOn('btn-update-codigo', 'click', () => atualizarPoder('codigo'));
safeOn('btn-update-senha', 'click', () => atualizarPoder('senha'));

// Novo botão: atualizar com usuário logado (authToken)
safeOn('btn-update-logado', 'click', () => atualizarPoder('logado'));

// Enter nos campos
safeOn('inp-email', 'keydown', e => { if (e.key === 'Enter') enviarCodigo(); });
safeOn('inp-codigo', 'keydown', e => { if (e.key === 'Enter') atualizarPoder('codigo'); });
safeOn('inp-senha', 'keydown', e => { if (e.key === 'Enter') {
  // Decide qual atualizar dependendo de qual botão está visível
  if (document.getElementById('btn-update-senha')) atualizarPoder('senha');
}});
safeOn('inp-power', 'keydown', e => { if (e.key === 'Enter' && document.getElementById('btn-update-logado')) atualizarPoder('logado'); });

// Inicialização da sub-aba "Atualizar Poder" — preenche dados do usuário logado
function initUpdatePoderTab() {
  if (typeof _authState !== 'undefined' && _authState && _authState.user) {
    const nickEl = document.getElementById('update-user-nick');
    if (nickEl) nickEl.textContent = _authState.user.nick || _authState.user.email;
    // Tenta selecionar o nick do usuário no dropdown
    const sel = document.getElementById('sel-nick');
    if (sel && _authState.user.nick) {
      const nickLower = String(_authState.user.nick).toLowerCase();
      for (let i = 0; i < sel.options.length; i++) {
        if (String(sel.options[i].value).toLowerCase() === nickLower) {
          sel.selectedIndex = i;
          break;
        }
      }
    }
  }
}

// Inicial
loadData();
// Auto-refresh a cada 60s
setInterval(loadData, 60000);

// Nota: Modo stream (?modo=stream ou /stream) é tratado pelo roteador em resolveRouteFromURL()

// ═══════════════════════════════════════════════════════════════════
// ⚜ CODEX: HEROES / ARTIFACTS / TEAM BUILDER ⚜
// ═══════════════════════════════════════════════════════════════════

// 🏛️ FACÇÕES (origem do cavaleiro)
const CODEX_FACTIONS = {
  santuario: { name: 'Santuário', name_en: 'Sanctuary', name_es: 'Santuario', icon: '⚜️', color: '#d4af37' },
  submundo:  { name: 'Submundo',  name_en: 'Underworld', name_es: 'Inframundo', icon: '💀', color: '#9d4edd' },
  asgard:    { name: 'Asgard',    name_en: 'Asgard', name_es: 'Asgard', icon: '❄️', color: '#74c0fc' },
  atlantida: { name: 'Atlântida', name_en: 'Atlantis', name_es: 'Atlántida', icon: '🌊', color: '#4cc9f0' }
};

// 🎯 POSIÇÃO (formação)
const CODEX_POSITIONS = {
  frente: { name: 'Frente', name_en: 'Front', name_es: 'Frente', icon: '🛡️', color: '#ef476f' },
  meio:   { name: 'Meio',   name_en: 'Middle', name_es: 'Medio', icon: '⚔️', color: '#ffd166' },
  tras:   { name: 'Trás',   name_en: 'Back',  name_es: 'Atrás', icon: '🏹', color: '#06d6a0' }
};

// 💥 TIPO DE DANO
const CODEX_DAMAGE = {
  fisico: { name: 'Físico', name_en: 'Physical', name_es: 'Físico', icon: '⚔️', color: '#ff6b35' },
  mental: { name: 'Mental', name_en: 'Mental',   name_es: 'Mental', icon: '🧠', color: '#9d4edd' }
};

// 🎴 CLASSES
const CODEX_CLASSES = {
  lutador:  { name: 'Lutador',  name_en: 'Fighter', name_es: 'Luchador',  icon: '👊' },
  tanque:   { name: 'Tanque',   name_en: 'Tank',    name_es: 'Tanque',    icon: '🛡️' },
  suporte:  { name: 'Suporte',  name_en: 'Support', name_es: 'Soporte',   icon: '✨' },
  arqueiro: { name: 'Arqueiro', name_en: 'Archer',  name_es: 'Arquero',   icon: '🏹' },
  mago:     { name: 'Mago',     name_en: 'Mage',    name_es: 'Mago',      icon: '🔮' }
};

// 🌟 RARIDADES
const CODEX_RARITIES = ['ur', 'ssr', 'sr', 'r'];

// 🦸 DADOS DOS HERÓIS — edite/adicione aqui
