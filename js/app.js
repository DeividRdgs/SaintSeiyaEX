


// ═══════ HEROES TAB ═══════
let codexFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };

function initHeroesTab() {
  const sels = {
    rarity:   document.getElementById('codexFilterRarity'),
    faction:  document.getElementById('codexFilterFaction'),
    class:    document.getElementById('codexFilterClass'),
    position: document.getElementById('codexFilterPosition'),
    damage:   document.getElementById('codexFilterDamage')
  };
  const search = document.getElementById('heroSearch');
  const clearBtn = document.getElementById('codexFiltersClear');
  if (!sels.rarity || sels.rarity.dataset.init) return;
  sels.rarity.dataset.init = '1';

  const populate = (sel, options, allKey = 'filter.allFem') => {
    const allLabel = ui(allKey);
    sel.innerHTML = `<option value="todos">${allLabel}</option>` +
      Object.entries(options).map(([k, v]) => `<option value="${k}">${v.icon||''} ${t(v,'name')||k.toUpperCase()}</option>`).join('');
    sel.addEventListener('change', () => {
      const key = sel.id.replace('codexFilter', '').toLowerCase();
      codexFilter[key] = sel.value;
      renderCodexHeroes();
    });
  };

  // Raridades em ordem fixa
  sels.rarity.innerHTML = `<option value="todos">${ui('filter.allFem')}</option>` +
    ['ur','ssr','sr','r'].map(r => `<option value="${r}">${r.toUpperCase()}</option>`).join('');
  sels.rarity.addEventListener('change', () => {
    codexFilter.rarity = sels.rarity.value;
    renderCodexHeroes();
  });

  populate(sels.faction, CODEX_FACTIONS, 'filter.allFem');
  populate(sels.class, CODEX_CLASSES, 'filter.allFem');
  populate(sels.position, CODEX_POSITIONS, 'filter.allFem');
  populate(sels.damage, CODEX_DAMAGE, 'filter.allMasc');

  if (search) {
    search.addEventListener('input', e => {
      clearTimeout(window._heroSearchTimer);
      window._heroSearchTimer = setTimeout(() => {
        codexFilter.search = e.target.value;
        renderCodexHeroes();
      }, 180);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      codexFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };
      Object.values(sels).forEach(s => s.value = 'todos');
      if (search) search.value = '';
      renderCodexHeroes();
    });
  }

  renderCodexHeroes();
}

function getFilteredHeroes() {
  return CODEX_HEROES.filter(h => {
    if (codexFilter.rarity !== 'todos' && h.rarity !== codexFilter.rarity) return false;
    if (codexFilter.faction !== 'todos' && h.faction !== codexFilter.faction) return false;
    if (codexFilter.class !== 'todos' && h.class !== codexFilter.class) return false;
    if (codexFilter.position !== 'todos' && h.position !== codexFilter.position) return false;
    if (codexFilter.damage !== 'todos' && h.damage !== codexFilter.damage) return false;
    if (codexFilter.search) {
      const q = codexFilter.search.toLowerCase();
      // Busca em nome e título nos DOIS idiomas — útil pra membros estrangeiros
      const nomePt = (h.name || '').toLowerCase();
      const nomeEn = (h.name_en || '').toLowerCase();
      const titPt = (h.title || '').toLowerCase();
      const titEn = (h.title_en || '').toLowerCase();
      if (!nomePt.includes(q) && !nomeEn.includes(q) && !titPt.includes(q) && !titEn.includes(q)) return false;
    }
    return true;
  });
}

function heroCardHTML(h, onClickAttr = `onclick="showHeroDetail(${h.id})"`) {
  const fac = CODEX_FACTIONS[h.faction] || { color: '#888', icon: '?' };
  const portraitClass = h.image ? 'hero-portrait has-image' : 'hero-portrait';
  const nomeIdioma = t(h, 'name');
  // codex usa o card do cavaleiro emoldurado (showcard + moldura do jogo por raridade);
  // cai na showcard crua e depois no retrato se faltar
  const portraitInner = h.image
    ? `<img src="img/heroes/framed/${h.id}.webp" alt="${nomeIdioma}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='img/banners/hd/${h.id}.webp';var c=this.closest('.hero-card');if(c){c.classList.remove('codex-card-framed');c.classList.remove('codex-card-knight');}" />`
    : `<span class="glyph">${h.glyph || '⚔️'}</span>`;
  return `
    <div class="hero-card codex-card codex-card-framed codex-card-knight r-${h.rarity}" ${onClickAttr} style="cursor:pointer;">
      <div class="${portraitClass}">
        <div class="rays"></div>
        ${portraitInner}
        <span class="hero-rarity-badge ${h.rarity}" data-label="${h.rarity.toUpperCase()}"></span>
        <span class="hero-faction-badge ${h.faction}" data-icon="${fac.icon}" title="${fac.name}"></span>
      </div>
      <div class="hero-info">
        <div class="hero-name">${nomeIdioma}</div>
        <div class="hero-class">${t(CODEX_CLASSES[h.class]||{}, 'name') || h.class}</div>
      </div>
    </div>
  `;
}

// ═══════════ LAZY RENDER (paginação progressiva) ═══════════
// Em vez de renderizar 103 cards de uma vez, vai carregando 24 a cada vez
// que o usuário chega perto do fim. Usa IntersectionObserver pra detectar.
const LAZY_BATCH_SIZE = 24;
const _lazyStates = {}; // por grid id

// API genérica: lazyRenderGrid({ grid, items, htmlFor, emptyHTML })
function lazyRenderGrid({ grid, items, htmlFor, emptyHTML }) {
  if (!grid) return;
  const id = grid.id || 'anon';

  // Limpar estado anterior
  const prev = _lazyStates[id];
  if (prev && prev.observer) {
    prev.observer.disconnect();
  }
  grid.innerHTML = '';

  if (!items || items.length === 0) {
    grid.innerHTML = emptyHTML || '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--ink-dim);font-style:italic;">Nenhum item encontrado.</div>';
    return;
  }

  const state = {
    items: items,
    rendered: 0,
    htmlFor: htmlFor,
    observer: null,
    sentinel: null,
    grid: grid
  };
  _lazyStates[id] = state;

  // Renderiza primeiro batch
  renderNextBatch(state);

  // Se já renderizou tudo, sai
  if (state.rendered >= items.length) return;

  // Cria sentinela e observa
  const sentinel = document.createElement('div');
  sentinel.style.cssText = 'grid-column: 1/-1; height: 1px; visibility: hidden;';
  grid.appendChild(sentinel);
  state.sentinel = sentinel;

  state.observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        renderNextBatch(state);
        if (state.rendered >= state.items.length) {
          state.observer.disconnect();
          if (state.sentinel) state.sentinel.remove();
        }
      }
    }
  }, {
    root: null,
    rootMargin: '400px',
    threshold: 0
  });

  state.observer.observe(sentinel);
}

function renderNextBatch(state) {
  const start = state.rendered;
  const end = Math.min(start + LAZY_BATCH_SIZE, state.items.length);
  if (start >= end) return;

  const fragment = document.createDocumentFragment();
  const temp = document.createElement('div');
  temp.innerHTML = state.items.slice(start, end).map(state.htmlFor).join('');
  while (temp.firstChild) fragment.appendChild(temp.firstChild);

  if (state.sentinel && state.sentinel.parentNode === state.grid) {
    state.grid.insertBefore(fragment, state.sentinel);
    // Re-anexa o sentinel no fim pra garantir que sempre está depois dos itens
    state.grid.appendChild(state.sentinel);
  } else {
    state.grid.appendChild(fragment);
  }

  state.rendered = end;

  // Se ainda tem mais itens e o sentinel já está visível, renderiza próximo batch
  // (evita ficar travado quando viewport é maior que o batch)
  if (state.rendered < state.items.length && state.sentinel) {
    const rect = state.sentinel.getBoundingClientRect();
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < viewportH + 400) {
      // Sentinel ainda visível com margin — agenda mais um batch
      requestAnimationFrame(() => {
        if (state.rendered < state.items.length) renderNextBatch(state);
      });
    }
  }
}

function renderCodexHeroes() {
  const list = getFilteredHeroes();
  const count = document.getElementById('heroCount');
  const grid = document.getElementById('heroesGrid');
  if (!grid) return;
  count.textContent = `${list.length} ${ui('hero.of')} ${CODEX_HEROES.length} ${ui('hero.heroes')}`;

  lazyRenderGrid({
    grid: grid,
    items: list,
    htmlFor: h => heroCardHTML(h),
    emptyHTML: `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--ink-dim);font-style:italic;">${ui('hero.empty')}</div>`
  });
}
// Alias usado pelo sistema i18n
function renderHeroes() { return renderCodexHeroes(); }

function showHeroDetail(id) {
  const h = CODEX_HEROES.find(x => x.id === id);
  if (!h) return;
  const fac = CODEX_FACTIONS[h.faction] || {};
  const cls = CODEX_CLASSES[h.class] || {};
  const pos = CODEX_POSITIONS[h.position] || {};
  const dmg = CODEX_DAMAGE[h.damage] || {};

  // Idioma atual
  const nomeH = t(h, 'name');
  const titleH = t(h, 'title');
  const bioH = t(h, 'bio');

  document.getElementById('heroes-view').style.display = 'none';
  const detail = document.getElementById('hero-detail-view');
  detail.style.display = 'block';
  detail.innerHTML = `
    <button class="hero-back" onclick="hideHeroDetail()">← ${ui('hero.backList')}</button>
    <div class="hero-detail">
      <div class="hero-card codex-card r-${h.rarity}" style="cursor:default;">
        <div class="hero-portrait${h.image ? ' has-image' : ''}">
          <div class="rays"></div>
          ${h.image ? `<img src="${h.image}" alt="${nomeH}" />` : `<span class="glyph">${h.glyph||'⚔️'}</span>`}
          <span class="hero-rarity-badge ${h.rarity}" data-label="${h.rarity.toUpperCase()}"></span>
          ${fac && fac.icon ? `<span class="hero-faction-badge ${h.faction||''}" data-icon="${fac.icon}" title="${t(fac,'name')||''}"></span>` : ''}
        </div>
        <div class="hero-info">
          <div class="hero-name">${nomeH}</div>
        </div>
      </div>
      <div>
        <div class="hero-detail-rarity ${h.rarity}">★ ${h.rarity.toUpperCase()}</div>
        <h1 class="hero-detail-name">${nomeH}</h1>
        ${titleH ? `<p class="hero-detail-title">"${titleH}"</p>` : ''}
        <div class="hero-tags">
          ${fac.name ? `<span class="hero-tag" style="border-color: ${fac.color}; color: ${fac.color}">${fac.icon} ${t(fac,'name')}</span>` : ''}
          ${cls.name ? `<span class="hero-tag">${cls.icon} ${t(cls,'name')}</span>` : ''}
          ${pos.name ? `<span class="hero-tag" style="border-color: ${pos.color}; color: ${pos.color}">${pos.icon} ${t(pos,'name')}</span>` : ''}
          ${dmg.name ? `<span class="hero-tag" style="border-color: ${dmg.color}; color: ${dmg.color}">${dmg.icon} ${ui('hero.damage')} ${t(dmg,'name')}</span>` : ''}
          ${(h.tags||[]).map(tg => `<span class="hero-tag">${tg}</span>`).join('')}
        </div>
        ${bioH && !bioH.includes('Ajuste esta descrição') ? `<div class="hero-bio">${bioH}</div>` : ''}
      </div>
    </div>
    <h2 class="codex-section-title">${ui('hero.abilities')}</h2>
    <div class="skill-tabs">
      <button class="skill-tab active" data-tab="skills" onclick="switchSkillTab(this,'skills')">${ui('hero.tabSkills')}</button>
      <button class="skill-tab" data-tab="despertar" onclick="switchSkillTab(this,'despertar')">${ui('hero.tabAwakening')}</button>
      <button class="skill-tab" data-tab="bonds" onclick="switchSkillTab(this,'bonds')">${ui('hero.tabBonds')}</button>
    </div>

    <div class="skill-panel" data-panel="skills">
      <div class="skills-list">
        ${(h.skills||[]).length ? (h.skills||[]).map(s => `
          <div class="skill-item">
            <div class="skill-icon-wrap${s.icon ? '' : ' no-icon'}">
              ${s.icon ? `<img src="${s.icon}" alt="${t(s,'name')}" loading="lazy">` : ''}
            </div>
            <div class="skill-body">
              <div class="skill-header">
                <span class="skill-name">${t(s,'name')}</span>
                <span class="skill-type">${s.type}</span>
              </div>
              <div class="skill-desc">${t(s,'desc')}</div>
              ${s.cd ? `<div class="skill-cd">⏳ ${ui('hero.cooldown')}: ${s.cd} ${ui('hero.turns')}</div>` : ''}
            </div>
          </div>
        `).join('') : `<p class="skill-empty">${ui('hero.noSkills')}</p>`}
      </div>
    </div>

    <div class="skill-panel" data-panel="despertar" style="display:none;">
      <div class="skills-list">
        ${(h.awakening||[]).length ? (h.awakening||[]).map(s => `
          <div class="skill-item">
            <div class="skill-icon-wrap${s.icon ? '' : ' no-icon'}">
              ${s.icon ? `<img src="${s.icon}" alt="${t(s,'name')}" loading="lazy">` : ''}
            </div>
            <div class="skill-body">
              <div class="skill-header">
                <span class="skill-name">${t(s,'name')}</span>
                <span class="skill-type">${s.type}</span>
              </div>
              <div class="skill-desc">${t(s,'desc')}</div>
            </div>
          </div>
        `).join('') : `<p class="skill-empty">${ui('hero.noAwakening')}</p>`}
      </div>
    </div>

    <div class="skill-panel" data-panel="bonds" style="display:none;">
      ${(h.supportAttrs||[]).length ? `
        <div class="bond-block">
          <h3 class="bond-block-title">${ui('hero.supportAttrs')}</h3>
          <div class="support-attrs">
            ${((_lang === 'es' && (h.supportAttrs_es||[]).length) ? h.supportAttrs_es : (_lang === 'en' && (h.supportAttrs_en||[]).length) ? h.supportAttrs_en : (h.supportAttrs||[])).map(a => `<span class="support-attr">${a}</span>`).join('')}
          </div>
        </div>` : ''}
      ${(h.combos||[]).length ? `
        <div class="bond-block">
          <h3 class="bond-block-title">${ui('hero.combos')}</h3>
          ${(h.combos||[]).map(c => `
            <div class="skill-item">
              <div class="skill-icon-wrap${c.icon ? '' : ' no-icon'}">
                ${c.icon ? `<img src="${c.icon}" alt="${t(c,'skillNome')}" loading="lazy">` : ''}
              </div>
              <div class="skill-body">
                <div class="skill-header">
                  <span class="skill-name">${t(c,'skillNome') || t(c,'nome')}</span>
                  <span class="skill-type">${ui('hero.combo')}</span>
                </div>
                ${t(c,'nome') ? `<div class="combo-group">🤝 ${t(c,'nome')}</div>` : ''}
                ${(() => {
                  const parc = (_lang === 'es' && c.parceiros_es && c.parceiros_es.length) ? c.parceiros_es
                             : (_lang === 'en' && c.parceiros_en && c.parceiros_en.length) ? c.parceiros_en
                             : (c.parceiros || []);
                  return parc.length ? `<div class="combo-partners">${ui('hero.with')}: ${parc.join(', ')}</div>` : '';
                })()}
                <div class="skill-desc">${t(c,'skillDesc') || ''}</div>
              </div>
            </div>
          `).join('')}
        </div>` : ''}
      ${(h.bonds||[]).length ? `
        <div class="bond-block">
          <h3 class="bond-block-title">${ui('hero.bonds')}</h3>
          <div class="bonds-grid">
            ${(h.bonds||[]).map(b => `
              <div class="bond-card">
                <div class="bond-name">${t(b,'nome')}</div>
                ${b.membros && b.membros.length ? `
                  <div class="bond-members">
                    ${b.membros.map(m => m.codexId
                      ? `<img class="bond-member" src="${m.icone}" alt="${m.nome}" title="${m.nome}" loading="lazy" onclick="showHeroDetail(${m.codexId})">`
                      : `<img class="bond-member no-link" src="${m.icone}" alt="" title="" loading="lazy">`
                    ).join('')}
                  </div>` : ''}
                <div class="bond-bonus">${t(b,'bonus')}</div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}
      ${!(h.supportAttrs||[]).length && !(h.combos||[]).length && !(h.bonds||[]).length
        ? `<p class="skill-empty">${ui('hero.noBonds')}</p>` : ''}
    </div>

    <div class="hero-back-bottom">
      <button class="hero-back" onclick="hideHeroDetail()">← ${ui('hero.backList2')}</button>
    </div>
  `;
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function hideHeroDetail() {
  document.getElementById('heroes-view').style.display = 'block';
  document.getElementById('hero-detail-view').style.display = 'none';
  window.scrollTo({top: 0, behavior: 'smooth'});
}

// Troca de aba na seção de habilidades do cavaleiro
function switchSkillTab(btn, aba) {
  const container = btn.closest('#hero-detail-view') || document;
  container.querySelectorAll('.skill-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  container.querySelectorAll('.skill-panel').forEach(p => {
    p.style.display = (p.getAttribute('data-panel') === aba) ? 'block' : 'none';
  });
}

// ═══════ ARTIFACT DETAIL (página de detalhes) ═══════
function showArtifactDetail(id) {
  const a = CODEX_ARTIFACTS.find(x => x.id === id);
  if (!a) return;
  const rarity = a.rarity || 'r';
  const displayName = t(a, 'name');
  const displayType = t(a, 'type');
  const displayEffect = t(a, 'effect');
  const safeName = String(displayName).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

  // Busca detalhes extras (lore, levels) — chave canônica é o nome em PT
  const details = (typeof ARTIFACT_DETAILS !== 'undefined') ? ARTIFACT_DETAILS[a.name] : null;

  const RARITY_LABEL_PT = { ssr: 'SSR · Lendário', sr: 'SR · Super Raro', r: 'R · Raro', n: 'N · Normal', ur: 'UR · Ultra Raro' };
  const RARITY_LABEL_EN = { ssr: 'SSR · Legendary', sr: 'SR · Super Rare', r: 'R · Rare', n: 'N · Normal', ur: 'UR · Ultra Rare' };
  const RARITY_LABEL_ES = { ssr: 'SSR · Legendario', sr: 'SR · Super Raro', r: 'R · Raro', n: 'N · Normal', ur: 'UR · Ultra Raro' };
  const RARITY_LABEL = (_lang === 'en') ? RARITY_LABEL_EN : (_lang === 'es') ? RARITY_LABEL_ES : RARITY_LABEL_PT;

  const view = document.getElementById('artifacts-view');
  const detail = document.getElementById('artifact-detail-view');
  if (!view || !detail) return;
  view.style.display = 'none';
  detail.style.display = 'block';

  // Lore + efeito base — fallback chain ES → EN → PT
  const useEn = (_lang === 'en');
  const useEs = (_lang === 'es');
  const pickLangField = (field) => {
    if (!details) return '';
    if (useEs) {
      if (details[field + '_es']) return details[field + '_es'];
      if (details[field + '_en']) return details[field + '_en'];
    }
    if (useEn && details[field + '_en']) return details[field + '_en'];
    return details[field] || '';
  };
  const loreText = pickLangField('lore');
  const effectText = pickLangField('effect');
  const lore = loreText ? `<div class="artifact-detail-lore">${escapeArtifactHtml(loreText)}</div>` : '';
  const effectBase = effectText ? effectText : displayEffect;

  // Levels em abas (R / SR / SSR / UR)
  const tierLabelsPt = { r: 'Nível R — Base', sr: 'Nível SR — Evolução Inicial', ssr: 'Nível SSR — Evolução', ur: 'Nível UR — Ascensão Suprema' };
  const tierLabelsEn = { r: 'R Level — Base', sr: 'SR Level — Initial Evolution', ssr: 'SSR Level — Evolution', ur: 'UR Level — Supreme Ascension' };
  const tierLabelsEs = { r: 'Nivel R — Base', sr: 'Nivel SR — Evolución Inicial', ssr: 'Nivel SSR — Evolución', ur: 'Nivel UR — Ascensión Suprema' };
  const tLabels = useEn ? tierLabelsEn : useEs ? tierLabelsEs : tierLabelsPt;

  // Helper pra pegar os levels do idioma correto (fallback ES → EN → PT)
  const pickLevels = (key) => {
    if (!details) return null;
    if (useEs) {
      if (details[key + '_es'] && details[key + '_es'].length) return details[key + '_es'];
      if (details[key + '_en'] && details[key + '_en'].length) return details[key + '_en'];
    }
    if (useEn && details[key + '_en'] && details[key + '_en'].length) return details[key + '_en'];
    return details[key];
  };

  const tiers = [];
  const rL = pickLevels('rLevels');
  if (rL && rL.length) {
    tiers.push({ key: 'r',   label: '🔷 R',   full: tLabels.r,   levels: rL });
  }
  const srL = pickLevels('srLevels');
  if (srL && srL.length) {
    tiers.push({ key: 'sr',  label: '🟣 SR',  full: tLabels.sr,  levels: srL });
  }
  const ssrL = pickLevels('ssrLevels');
  if (ssrL && ssrL.length) {
    tiers.push({ key: 'ssr', label: '⭐ SSR', full: tLabels.ssr, levels: ssrL });
  }
  const urL = pickLevels('urLevels');
  if (urL && urL.length) {
    tiers.push({ key: 'ur',  label: '🩸 UR',  full: tLabels.ur,  levels: urL });
  }

  let levelsHtml = '';
  if (tiers.length > 0) {
    const defaultIdx = tiers.length - 1;

    const tabsButtons = tiers.map((tt, i) => `
      <button class="artifact-tier-tab ${tt.key} ${i === defaultIdx ? 'active' : ''}"
              data-tier-tab="${tt.key}"
              onclick="switchArtifactTier('${tt.key}')">${tt.label}</button>
    `).join('');

    const tabsPanels = tiers.map((tt, i) => `
      <div class="artifact-tier-panel ${tt.key} ${i === defaultIdx ? 'active' : ''}" data-tier-panel="${tt.key}">
        <div class="artifact-detail-tier ${tt.key}">
          <div class="artifact-detail-tier-title">${escapeArtifactHtml(tt.full)}</div>
          <ol class="artifact-detail-levels">
            ${tt.levels.map(l => `<li>${escapeArtifactHtml(l)}</li>`).join('')}
          </ol>
        </div>
      </div>
    `).join('');

    levelsHtml = `
      <h2 class="codex-section-title">${ui('artifacts.progression')}</h2>
      <div class="artifact-tier-tabs-wrap">
        <div class="artifact-tier-tabs">${tabsButtons}</div>
        <div class="artifact-tier-panels">${tabsPanels}</div>
      </div>
    `;
  }

  detail.innerHTML = `
    <button class="hero-back" onclick="hideArtifactDetail()">← ${ui('artifacts.backTop')}</button>
    <div class="hero-detail">
      <div class="hero-card codex-card r-${rarity}" style="cursor:default;">
        <div class="hero-portrait${a.image ? ' has-image' : ''}">
          <div class="rays"></div>
          ${a.image ? `<img src="${a.image}" alt="${safeName}" />` : `<span class="glyph">${a.icon||'💎'}</span>`}
          <span class="hero-rarity-badge ${rarity}" data-label="${rarity.toUpperCase()}"></span>
        </div>
        <div class="hero-info">
          <div class="hero-name">${safeName}</div>
        </div>
      </div>
      <div>
        <div class="hero-detail-rarity ${rarity}">★ ${RARITY_LABEL[rarity] || rarity.toUpperCase()}</div>
        <h1 class="hero-detail-name">${safeName}</h1>
        ${displayType ? `<p class="hero-detail-title">"${escapeArtifactHtml(displayType)}"</p>` : ''}
        ${lore}
        <div class="artifact-detail-effect">
          <div class="artifact-detail-effect-title">⚔ ${ui('artifacts.effect')}</div>
          <div class="artifact-detail-effect-body">${escapeArtifactHtml(effectBase)}</div>
        </div>
      </div>
    </div>
    ${levelsHtml}
    <div class="hero-back-bottom">
      <button class="hero-back" onclick="hideArtifactDetail()">← ${ui('artifacts.backBottom')}</button>
    </div>
  `;
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function hideArtifactDetail() {
  document.getElementById('artifacts-view').style.display = 'block';
  document.getElementById('artifact-detail-view').style.display = 'none';
  window.scrollTo({top: 0, behavior: 'smooth'});
}

// Troca de aba SR/SSR/UR dentro do detalhe do artefato
function switchArtifactTier(tierKey) {
  document.querySelectorAll('.artifact-tier-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.artifact-tier-panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`.artifact-tier-tab[data-tier-tab="${tierKey}"]`);
  const panel = document.querySelector(`.artifact-tier-panel[data-tier-panel="${tierKey}"]`);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');
}

function escapeArtifactHtml(str) {
  return String(str || '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
}

// ═══════ CARD DETAIL (página de detalhes de carta com tabela de níveis) ═══════
function showCardDetail(id) {
  const c = CODEX_CARDS.find(x => x.id === id);
  if (!c) return;
  const rarity = c.rarity || 'n';
  const useEn = (_lang === 'en');
  const useEs = (_lang === 'es');

  // Fallback chain ES → EN → PT
  const pickCardField = (field) => {
    if (useEs) {
      if (c[field + '_es']) return c[field + '_es'];
      if (c[field + '_en']) return c[field + '_en'];
    }
    if (useEn && c[field + '_en']) return c[field + '_en'];
    return c[field] || '';
  };
  const displayName = pickCardField('name');
  const displayLore = pickCardField('lore');
  const displayEffect = pickCardField('effect');
  const safeName = escapeArtifactHtml(displayName);

  const RARITY_LABEL_PT = { ssr:'SSR · Lendária', sr:'SR · Super Rara', r:'R · Rara', n:'N · Normal', ur:'UR · Ultra Rara' };
  const RARITY_LABEL_EN = { ssr:'SSR · Legendary', sr:'SR · Super Rare', r:'R · Rare', n:'N · Normal', ur:'UR · Ultra Rare' };
  const RARITY_LABEL_ES = { ssr:'SSR · Legendaria', sr:'SR · Super Rara', r:'R · Rara', n:'N · Normal', ur:'UR · Ultra Rara' };
  const RARITY_LABEL = useEn ? RARITY_LABEL_EN : useEs ? RARITY_LABEL_ES : RARITY_LABEL_PT;

  const view = document.getElementById('cards-view');
  const detail = document.getElementById('card-detail-view');
  if (!view || !detail) return;
  view.style.display = 'none';
  detail.style.display = 'block';

  // Lore (se houver) ou efeito básico
  const loreHtml = displayLore
    ? `<div class="card-detail-lore">${escapeArtifactHtml(displayLore)}</div>`
    : '';

  const effectLabel = useEn ? '⚔ Effect' : useEs ? '⚔ Efecto' : '⚔ Efeito';
  const effectHtml = displayEffect && displayEffect !== 'Edite este efeito depois.'
    ? `<div class="card-detail-effect">
         <div class="card-detail-effect-title">${effectLabel}</div>
         <div class="card-detail-effect-body">${escapeArtifactHtml(displayEffect)}</div>
       </div>`
    : '';

  // Tabela de níveis (1-7) + despertar (8-14) em 2 colunas
  let tableHtml = '';
  if ((c.levels && c.levels.length) || (c.awakening && c.awakening.length)) {

    function buildTable(items, title, isAwakening) {
      if (!items || !items.length) return '';
      const titleClass = isAwakening ? 'card-lv-section-title awakening' : 'card-lv-section-title';
      const locale = getLocale();
      const rows = items.map(lv => {
        // Effect com fallback chain ES → EN → PT
        let effText = lv.effect || '';
        if (useEs && lv.effect_es) effText = lv.effect_es;
        else if (useEs && lv.effect_en) effText = lv.effect_en;
        else if (useEn && lv.effect_en) effText = lv.effect_en;
        return `
        <tr${isAwakening ? ' class="card-lv-awakened"' : ''}>
          <td class="card-lv-star">${lv.stars}★</td>
          <td class="card-lv-effect">${escapeArtifactHtml(effText)}</td>
          <td class="card-lv-num">${lv.copies !== undefined && lv.copies !== null ? lv.copies : '—'}</td>
          <td class="card-lv-num card-lv-refund">${lv.accumulated !== undefined && lv.accumulated !== null ? lv.accumulated : '—'}</td>
          <td class="card-lv-num">${lv.cost !== undefined && lv.cost !== null ? Number(lv.cost).toLocaleString(locale) : '—'}</td>
        </tr>
      `;
      }).join('');
      const thEffect = useEn ? 'Effect' : useEs ? 'Efecto' : 'Efeito';
      const thCopies = useEn ? 'Copies' : useEs ? 'Copias' : 'Cópias';
      const thAcc = useEn ? 'Acc.' : useEs ? 'Acum.' : 'Acum.';
      const thCost = useEn ? 'Cost' : useEs ? 'Costo' : 'Custo';
      return `
        <div class="card-lv-table-wrap">
          <div class="${titleClass}">${title}</div>
          <table class="card-lv-table">
            <thead>
              <tr>
                <th class="card-lv-star-h">★</th>
                <th class="card-lv-effect-h">${thEffect}</th>
                <th class="card-lv-num">${thCopies}</th>
                <th class="card-lv-num">${thAcc}</th>
                <th class="card-lv-num">${thCost}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }

    const levelsTitle = useEn ? '★ Evolution' : useEs ? '★ Evolución' : '★ Evolução';
    const awakeningTitle = useEn ? '✦ Awakening' : useEs ? '✦ Despertar' : '✦ Despertar';
    const tableLevels = buildTable(c.levels, levelsTitle, false);
    const tableAwakening = buildTable(c.awakening, awakeningTitle, true);

    const progressionTitle = useEn ? 'Progression' : useEs ? 'Progresión' : 'Progressão';
    tableHtml = `
      <h2 class="codex-section-title">${progressionTitle}</h2>
      <div class="card-lv-grid">
        ${tableLevels}
        ${tableAwakening}
      </div>
    `;
  }

  const backTopLabel = useEn ? '← Back to Cards' : useEs ? '← Volver a Cartas' : '← Voltar às Cartas';
  const backBotLabel = useEn ? '← Back to List' : useEs ? '← Volver a la Lista' : '← Voltar para a Lista';

  detail.innerHTML = `
    <button class="hero-back" onclick="hideCardDetail()">${backTopLabel}</button>
    <div class="hero-detail">
      <div class="hero-card codex-card r-${rarity}" style="cursor:default;">
        <div class="hero-portrait${c.image ? ' has-image' : ''}">
          <div class="rays"></div>
          ${c.image ? `<img src="${c.image}" alt="${safeName}" />` : `<span class="glyph">🃏</span>`}
          <span class="hero-rarity-badge ${rarity}" data-label="${rarity.toUpperCase()}"></span>
        </div>
        <div class="hero-info">
          <div class="hero-name">${safeName}</div>
        </div>
      </div>
      <div>
        <div class="hero-detail-rarity ${rarity}">★ ${RARITY_LABEL[rarity] || rarity.toUpperCase()}</div>
        <h1 class="hero-detail-name">${safeName}</h1>
        ${loreHtml}
        ${effectHtml}
      </div>
    </div>
    ${tableHtml}
    <div class="hero-back-bottom">
      <button class="hero-back" onclick="hideCardDetail()">${backBotLabel}</button>
    </div>
  `;
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function hideCardDetail() {
  document.getElementById('cards-view').style.display = 'block';
  document.getElementById('card-detail-view').style.display = 'none';
  window.scrollTo({top: 0, behavior: 'smooth'});
}

// ═══════ ARTIFACTS TAB ═══════
let artifactFilter = { search: '', rarity: 'todos' };

function initArtifactsTab() {
  // Garante que volta pra view de lista quando reentrar na aba
  if (typeof hideArtifactDetail === 'function') hideArtifactDetail();

  const search = document.getElementById('artifactSearch');
  const sel = document.getElementById('artifactFilterRarity');
  const clearBtn = document.getElementById('artifactFiltersClear');
  if (!search || search.dataset.init) return;
  search.dataset.init = '1';

  // Popular dropdown de raridade
  if (sel) {
    sel.innerHTML = `<option value="todos">${ui('filter.allFem')}</option>` +
      ['ssr','sr','r'].map(r => `<option value="${r}">${r.toUpperCase()}</option>`).join('');
    sel.addEventListener('change', () => {
      artifactFilter.rarity = sel.value;
      renderCodexArtifacts();
    });
  }

  search.addEventListener('input', e => {
    clearTimeout(window._artifactSearchTimer);
    window._artifactSearchTimer = setTimeout(() => {
      artifactFilter.search = e.target.value;
      renderCodexArtifacts();
    }, 180);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      artifactFilter = { search: '', rarity: 'todos' };
      if (sel) sel.value = 'todos';
      search.value = '';
      renderCodexArtifacts();
    });
  }

  renderCodexArtifacts();
}

function renderCodexArtifacts() {
  const list = CODEX_ARTIFACTS.filter(a => {
    if (artifactFilter.rarity !== 'todos' && a.rarity !== artifactFilter.rarity) return false;
    if (artifactFilter.search) {
      const q = artifactFilter.search.toLowerCase();
      // Busca multilíngue: name e type em PT e EN
      const namePt = (a.name || '').toLowerCase();
      const nameEn = (a.name_en || '').toLowerCase();
      const typePt = (a.type || '').toLowerCase();
      const typeEn = (a.type_en || '').toLowerCase();
      if (!namePt.includes(q) && !nameEn.includes(q) && !typePt.includes(q) && !typeEn.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => t(a, 'name').localeCompare(t(b, 'name'), _lang === 'pt' ? 'pt-BR' : 'en'));
  const count = document.getElementById('artifactCount');
  const grid = document.getElementById('artifactsGrid');
  if (!grid) return;
  count.textContent = `${list.length} ${ui('hero.of')} ${CODEX_ARTIFACTS.length} ${ui('hero.artifacts')}`;

  lazyRenderGrid({
    grid: grid,
    items: list,
    htmlFor: a => {
      const rarity = a.rarity || 'r';
      const displayName = t(a, 'name');
      const safeName = String(displayName).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
      const portraitClass = a.image ? 'hero-portrait has-image' : 'hero-portrait';
      const portraitInner = a.image
        ? `<img src="${a.image}" alt="${safeName}" loading="lazy" decoding="async" />`
        : `<span class="glyph">${a.icon || '💎'}</span>`;
      return `
        <div class="hero-card codex-card codex-card-artifact r-${rarity}" onclick="showArtifactDetail('${a.id}')" style="cursor:pointer;" title="${ui('hero.clickDetails')}">
          <div class="${portraitClass}">
            <div class="rays"></div>
            ${portraitInner}
            <span class="hero-rarity-badge ${rarity}" data-label="${rarity.toUpperCase()}"></span>
          </div>
          <div class="hero-info">
            <div class="hero-name">${safeName}</div>
          </div>
        </div>
      `;
    },
    emptyHTML: `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--ink-dim);font-style:italic;">${ui('artifacts.empty')}</div>`
  });
}
// Alias usado pelo sistema i18n
function renderArtifacts() { return renderCodexArtifacts(); }

// ═══════ CARTAS TAB ═══════
let cardFilter = { search: '', rarity: 'todos' };

function populateCardRarityFilter() {
  const sel = document.getElementById('cardFilterRarity');
  if (!sel) return;
  const savedValue = sel.value || cardFilter.rarity || 'todos';
  const allLabel = ui('filter.allFem'); // "Todas" / "All"
  sel.innerHTML = `<option value="todos">${allLabel}</option>` +
    ['ssr','sr','r','n'].map(r => `<option value="${r}">${r.toUpperCase()}</option>`).join('');
  sel.value = savedValue;
}

function initCardsTab() {
  const search = document.getElementById('cardSearch');
  const sel = document.getElementById('cardFilterRarity');
  const clearBtn = document.getElementById('cardFiltersClear');
  if (!search || search.dataset.init) return;
  search.dataset.init = '1';

  populateCardRarityFilter();
  if (sel) {
    sel.addEventListener('change', () => {
      cardFilter.rarity = sel.value;
      renderCodexCards();
    });
  }

  search.addEventListener('input', e => {
    clearTimeout(window._cardSearchTimer);
    window._cardSearchTimer = setTimeout(() => {
      cardFilter.search = e.target.value;
      renderCodexCards();
    }, 180);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      cardFilter = { search: '', rarity: 'todos' };
      if (sel) sel.value = 'todos';
      search.value = '';
      renderCodexCards();
    });
  }

  renderCodexCards();
}

function renderCodexCards() {
  const RARITY_ORDER = ['ssr','sr','r','n'];
  const useEn = (_lang === 'en');
  const useEs = (_lang === 'es');
  // Helper de nome com fallback ES→EN→PT
  const pickName = (c) => {
    if (useEs && c.name_es) return c.name_es;
    if (useEs && c.name_en) return c.name_en;
    if (useEn && c.name_en) return c.name_en;
    return c.name;
  };
  const list = CODEX_CARDS.filter(c => {
    if (cardFilter.rarity !== 'todos' && c.rarity !== cardFilter.rarity) return false;
    if (cardFilter.search) {
      const q = cardFilter.search.toLowerCase();
      const inName = c.name.toLowerCase().includes(q) || (c.name_en || '').toLowerCase().includes(q) || (c.name_es || '').toLowerCase().includes(q);
      const inEffect = (c.effect||'').toLowerCase().includes(q) || (c.effect_en||'').toLowerCase().includes(q) || (c.effect_es||'').toLowerCase().includes(q);
      if (!inName && !inEffect) return false;
    }
    return true;
  }).sort((a, b) => {
    const ar = RARITY_ORDER.indexOf(a.rarity), br = RARITY_ORDER.indexOf(b.rarity);
    if (ar !== br) return ar - br;
    return pickName(a).localeCompare(pickName(b), getLocale());
  });
  const count = document.getElementById('cardCount');
  const grid = document.getElementById('cardsGrid');
  if (!grid) return;
  if (count) {
    const countLabel = useEn
      ? `${list.length} of ${CODEX_CARDS.length} cards`
      : useEs
      ? `${list.length} de ${CODEX_CARDS.length} cartas`
      : `${list.length} de ${CODEX_CARDS.length} cartas`;
    count.textContent = countLabel;
  }

  lazyRenderGrid({
    grid: grid,
    items: list,
    htmlFor: c => {
      const rarity = c.rarity || 'n';
      const cardName = pickName(c);
      const safeName = String(cardName).replace(/[<>&"]/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch]));
      const portraitClass = c.image ? 'hero-portrait has-image' : 'hero-portrait';
      // carta emoldurada (moldura do jogo por raridade); cai na imagem crua se faltar
      const portraitInner = c.image
        ? `<img src="img/cards/framed/${c.id}.webp" alt="${safeName}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${c.image}';var hc=this.closest('.hero-card');if(hc)hc.classList.remove('codex-card-framed');" />`
        : `<span class="glyph">🃏</span>`;
      const titleLabel = useEn ? 'Click for details' : useEs ? 'Haz clic para ver detalles' : 'Clique para ver detalhes';
      return `
        <div class="hero-card codex-card codex-card-framed r-${rarity}" onclick="showCardDetail('${c.id}')" style="cursor:pointer;" title="${titleLabel}">
          <div class="${portraitClass}">
            <div class="rays"></div>
            ${portraitInner}
            <span class="hero-rarity-badge ${rarity}" data-label="${rarity.toUpperCase()}"></span>
          </div>
          <div class="hero-info">
            <div class="hero-name">${safeName}</div>
          </div>
        </div>
      `;
    },
    emptyHTML: `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--ink-dim);font-style:italic;">${useEn ? 'No cards found.' : useEs ? 'No se encontraron cartas.' : 'Nenhuma carta encontrada.'}</div>`
  });
}

// ═══════════════════════════════════════════════════
// 📊 ESTATÍSTICAS — Histórico de Poder + Gráfico
// ═══════════════════════════════════════════════════
let _statsData = null;       // dados crus da API (por jogador)
let _statsRange = 30;        // dias selecionados
let _statsSelected = '__top10__'; // jogador selecionado
let _statsInit = false;

async function initStatsTab() {
  // Atualiza visibilidade do bloco de relatório (depende de ser líder)
  updateStatsReportBlock();

  if (_statsInit) {
    renderStats();
    return;
  }
  _statsInit = true;

  // Hooks
  document.getElementById('statsPlayerSelect').addEventListener('change', e => {
    _statsSelected = e.target.value;
    renderStats();
  });
  document.getElementById('statsRangeSelect').addEventListener('change', e => {
    _statsRange = parseInt(e.target.value);
    renderStats();
  });
  document.getElementById('statsRefreshBtn').addEventListener('click', () => {
    loadStatsData(true);
  });

  // Carrega dados pela primeira vez
  await loadStatsData(false);
}

async function loadStatsData(force) {
  // Cache localStorage por 2 minutos
  const CACHE_KEY_STATS = 'triade_stats_v1';
  const TTL = 2 * 60 * 1000;
  const now = Date.now();

  if (!force) {
    try {
      const raw = localStorage.getItem(CACHE_KEY_STATS);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && (now - cached.t) < TTL && cached.data) {
          _statsData = cached.data;
          renderStats();
          return;
        }
      }
    } catch(_) {}
  }

  // Mostra loading
  const empty = document.getElementById('statsEmpty');
  if (empty) {
    empty.style.display = 'flex';
    empty.innerHTML = `<div style="font-size:2em;animation:spin 1s linear infinite;">⏳</div><div>${ui('stats.loadingHistory')}</div>`;
  }

  try {
    const res = await fetch(API_URL + '?action=historico&t=' + Date.now());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Erro desconhecido');

    _statsData = json.players || {};
    try {
      localStorage.setItem(CACHE_KEY_STATS, JSON.stringify({ t: now, data: _statsData }));
    } catch(_) {}

    renderStats();
  } catch(err) {
    if (empty) {
      empty.style.display = 'flex';
      empty.innerHTML = `<div style="font-size:2em;opacity:.5;">⚠</div><div>${ui('stats.errorLoading')}: ${err.message}</div>`;
    }
  }
}

function renderStats() {
  if (!_statsData) return;

  // 1. Popular dropdown de jogadores
  const sel = document.getElementById('statsPlayerSelect');
  const currentValue = sel.value;
  const players = Object.keys(_statsData).sort();
  sel.innerHTML = '<option value="__top10__">🏆 Top 10 (comparativo)</option>' +
    players.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  if (currentValue && players.indexOf(currentValue) !== -1) sel.value = currentValue;
  else if (currentValue === '__top10__') sel.value = '__top10__';

  // 2. Filtrar pelo range
  const limite = Date.now() - (_statsRange * 24 * 60 * 60 * 1000);
  const filtered = {};
  for (const p in _statsData) {
    filtered[p] = (_statsData[p] || []).filter(pt => pt.ts >= limite);
  }

  // 3. Renderizar resumo, gráfico e leaderboard
  renderStatsSummary(filtered);
  renderStatsChart(filtered);
  renderStatsLeaderboard(filtered);
}

function renderStatsSummary(data) {
  const cont = document.getElementById('statsSummary');
  if (!cont) return;

  // Calcula totais agregados
  let totalAtualizacoes = 0;
  let totalGanhoPoder = 0;
  let jogadoresAtivos = 0;
  let maiorGanho = { nick: '', delta: 0 };

  for (const p in data) {
    const pts = data[p];
    if (pts.length === 0) continue;
    jogadoresAtivos++;
    totalAtualizacoes += pts.length;
    if (pts.length >= 2) {
      const delta = pts[pts.length - 1].power - pts[0].power;
      totalGanhoPoder += delta;
      if (delta > maiorGanho.delta) maiorGanho = { nick: p, delta: delta };
    }
  }

  const locale = getLocale();
  cont.innerHTML = `
    <div class="stat-card">
      <div class="stat-card-label">👥 ${ui('stats.activePlayers')}</div>
      <div class="stat-card-value">${jogadoresAtivos}</div>
      <div class="stat-card-sub">${ui('stats.activeSub')}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-label">🔄 ${ui('stats.updates')}</div>
      <div class="stat-card-value">${totalAtualizacoes}</div>
      <div class="stat-card-sub">${ui('stats.inXDays').replace('{x}', _statsRange)}</div>
    </div>
    <div class="stat-card ${totalGanhoPoder >= 0 ? 'positive' : 'negative'}">
      <div class="stat-card-label">⚡ ${ui('stats.powerGain')}</div>
      <div class="stat-card-value">${totalGanhoPoder >= 0 ? '+' : ''}${totalGanhoPoder.toLocaleString(locale)}</div>
      <div class="stat-card-sub">${ui('stats.legionSum')}</div>
    </div>
    <div class="stat-card positive">
      <div class="stat-card-label">🚀 ${ui('stats.topEvolution')}</div>
      <div class="stat-card-value" style="font-size:1.1rem;">${maiorGanho.nick || '—'}</div>
      <div class="stat-card-sub">+${maiorGanho.delta.toLocaleString(locale)}</div>
    </div>
  `;
}

function renderStatsChart(data) {
  const canvas = document.getElementById('statsChart');
  const empty = document.getElementById('statsEmpty');
  if (!canvas || !empty) return;

  // Decide quais séries plotar
  let series = [];
  if (_statsSelected === '__top10__') {
    // Top 10 pelo poder mais recente
    const sorted = Object.keys(data)
      .map(p => {
        const arr = data[p];
        const lastPower = arr.length ? arr[arr.length - 1].power : 0;
        return { nick: p, power: lastPower, points: arr };
      })
      .filter(x => x.points.length > 0)
      .sort((a, b) => b.power - a.power)
      .slice(0, 10);
    series = sorted.map(x => ({ nick: x.nick, points: x.points }));
  } else {
    const arr = data[_statsSelected] || [];
    if (arr.length > 0) {
      series = [{ nick: _statsSelected, points: arr }];
    }
  }

  if (series.length === 0 || series.every(s => s.points.length === 0)) {
    empty.style.display = 'flex';
    empty.innerHTML = `<div style="font-size:3em;opacity:.3;">📈</div><div>${ui('stats.noData')}</div><div style="font-size:.85em;opacity:.7;margin-top:4px;">${ui('stats.noDataHint')}</div>`;
    canvas.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  canvas.style.display = 'block';

  drawChart(canvas, series);
}

// Desenhar gráfico em Canvas puro (sem dependência externa)
function drawChart(canvas, series) {
  const ctx = canvas.getContext('2d');
  // Adapta tamanho ao container (responsivo)
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = cssW;
  const h = cssH;
  ctx.clearRect(0, 0, w, h);

  // Margens
  const ml = 70, mr = 20, mt = 20, mb = 50;
  const cw = w - ml - mr;
  const ch = h - mt - mb;

  // Calcular range de valores
  let allTs = [], allPower = [];
  series.forEach(s => s.points.forEach(pt => { allTs.push(pt.ts); allPower.push(pt.power); }));
  if (allTs.length === 0) return;
  let minTs = Math.min(...allTs), maxTs = Math.max(...allTs);
  let minP = Math.min(...allPower), maxP = Math.max(...allPower);
  if (minTs === maxTs) { minTs -= 86400000; maxTs += 86400000; } // adiciona 1 dia pra cada lado
  if (minP === maxP) { minP = Math.max(0, minP - 1000); maxP = maxP + 1000; }
  // Acrescenta padding visual
  const padP = (maxP - minP) * 0.1;
  minP = Math.max(0, minP - padP);
  maxP = maxP + padP;

  // Função de mapeamento (data → x, poder → y)
  const x = ts => ml + ((ts - minTs) / (maxTs - minTs)) * cw;
  const y = p  => mt + ch - ((p - minP) / (maxP - minP)) * ch;

  // ═══ Eixos e grid ═══
  ctx.strokeStyle = 'rgba(212,175,55,.15)';
  ctx.lineWidth = 1;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.fillStyle = '#b8a988';

  // Linhas horizontais (5 níveis de Y)
  for (let i = 0; i <= 5; i++) {
    const yPos = mt + (ch / 5) * i;
    ctx.beginPath();
    ctx.moveTo(ml, yPos);
    ctx.lineTo(w - mr, yPos);
    ctx.stroke();
    const val = maxP - ((maxP - minP) / 5) * i;
    ctx.textAlign = 'right';
    ctx.fillText(formatPowerShort(val), ml - 8, yPos + 4);
  }

  // Labels do eixo X (datas)
  const numTicks = 5;
  ctx.textAlign = 'center';
  for (let i = 0; i <= numTicks; i++) {
    const ts = minTs + ((maxTs - minTs) / numTicks) * i;
    const xPos = x(ts);
    ctx.beginPath();
    ctx.moveTo(xPos, mt + ch);
    ctx.lineTo(xPos, mt + ch + 4);
    ctx.stroke();
    const d = new Date(ts);
    const lbl = String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
    ctx.fillText(lbl, xPos, mt + ch + 18);
  }

  // ═══ Plotar séries ═══
  const COLORS = ['#d4af37','#f5d76e','#c084fc','#60a5fa','#5cb85c','#ff6b9d','#fbbf24','#34d399','#a78bfa','#fb923c'];

  series.forEach((s, idx) => {
    if (s.points.length === 0) return;
    const color = COLORS[idx % COLORS.length];

    // Linha
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    s.points.forEach((pt, i) => {
      const xp = x(pt.ts), yp = y(pt.power);
      if (i === 0) ctx.moveTo(xp, yp);
      else ctx.lineTo(xp, yp);
    });
    ctx.stroke();

    // Pontos
    ctx.fillStyle = color;
    s.points.forEach(pt => {
      ctx.beginPath();
      ctx.arc(x(pt.ts), y(pt.power), 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // ═══ Legenda ═══
  ctx.font = '11px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  let lx = ml, ly = mt - 6;
  series.forEach((s, idx) => {
    const color = COLORS[idx % COLORS.length];
    const label = s.nick;
    const tw = ctx.measureText(label).width + 18;
    if (lx + tw > w - mr) return; // não cabe, pula
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly - 8, 8, 8);
    ctx.fillStyle = '#f3e9d2';
    ctx.fillText(label, lx + 12, ly);
    lx += tw + 6;
  });
}

function formatPowerShort(n) {
  if (n >= 1e9) return (n/1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(0) + 'k';
  return Math.round(n).toString();
}

function renderStatsLeaderboard(data) {
  const cont = document.getElementById('statsLeaderboard');
  if (!cont) return;

  // Calcula delta de cada jogador (último - primeiro do período)
  const rows = Object.keys(data)
    .map(p => {
      const pts = data[p];
      if (pts.length === 0) return null;
      const start = pts[0].power;
      const end = pts[pts.length - 1].power;
      const delta = end - start;
      const pct = start > 0 ? (delta / start) * 100 : 0;
      return { nick: p, start, end, delta, pct };
    })
    .filter(x => x !== null)
    .sort((a, b) => b.delta - a.delta);

  if (rows.length === 0) {
    cont.innerHTML = '';
    return;
  }

  cont.innerHTML = `
    <h3>🏆 ${ui('stats.topEvolved')}</h3>
    ${rows.slice(0, 15).map((r, i) => {
      const deltaCls = r.delta > 0 ? '' : (r.delta < 0 ? 'negative' : 'zero');
      const arrow = r.delta > 0 ? '▲' : (r.delta < 0 ? '▼' : '—');
      const pctStr = r.pct === 0 ? '0%' : (r.pct > 0 ? '+' : '') + r.pct.toFixed(1) + '%';
      const locale = getLocale();
      const ord = _lang === 'pt' ? 'º' : '';
      return `
        <div class="stats-leader-row">
          <span class="stats-leader-rank">${i + 1}${ord}</span>
          <span class="stats-leader-nick">${escapeHtml(r.nick)}</span>
          <span class="stats-leader-delta ${deltaCls}">${arrow} ${r.delta >= 0 ? '+' : ''}${r.delta.toLocaleString(locale)}</span>
          <span class="stats-leader-percent">${pctStr}</span>
        </div>
      `;
    }).join('')}
  `;
}

// ═══════════════════════════════════════════════════
// 🎖 TIER LIST
// Drag-and-drop dos cavaleiros entre tiers S/A/B/C/D.
// Salva em localStorage e pode ser compartilhada.
// ═══════════════════════════════════════════════════
const TIER_STORAGE_KEY = 'triade_tier_list_v1';
const TIER_LIST_LEVELS = ['S','A','B','C','D'];
let _tierState = {};
let _tierFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };
let _tierInit = false;

function initTierTab() {
  if (_tierInit) {
    renderTierAll();
    return;
  }
  _tierInit = true;

  loadTierState();

  // ════ Hookup dos filtros (mesma mecânica do codex de heroes) ════
  const sels = {
    rarity:   document.getElementById('tierFilterRarity'),
    faction:  document.getElementById('tierFilterFaction'),
    class:    document.getElementById('tierFilterClass'),
    position: document.getElementById('tierFilterPosition'),
    damage:   document.getElementById('tierFilterDamage')
  };
  const search = document.getElementById('tierSearch');
  const clearBtn = document.getElementById('tierFiltersClear');

  const populate = (sel, options, allKey = 'filter.allFem') => {
    if (!sel) return;
    sel.innerHTML = `<option value="todos">${ui(allKey)}</option>` +
      Object.entries(options).map(([k, v]) => `<option value="${k}">${v.icon||''} ${t(v,'name')||k.toUpperCase()}</option>`).join('');
    sel.addEventListener('change', () => {
      const key = sel.id.replace('tierFilter', '').toLowerCase();
      _tierFilter[key] = sel.value;
      renderTierPool();
    });
  };

  if (sels.rarity) {
    sels.rarity.innerHTML = `<option value="todos">${ui('filter.allFem')}</option>` +
      ['ur','ssr','sr','r'].map(r => `<option value="${r}">${r.toUpperCase()}</option>`).join('');
    sels.rarity.addEventListener('change', () => {
      _tierFilter.rarity = sels.rarity.value;
      renderTierPool();
    });
  }

  populate(sels.faction, CODEX_FACTIONS, 'filter.allFem');
  populate(sels.class, CODEX_CLASSES, 'filter.allFem');
  populate(sels.position, CODEX_POSITIONS, 'filter.allFem');
  populate(sels.damage, CODEX_DAMAGE, 'filter.allMasc');

  if (search) {
    search.addEventListener('input', e => {
      clearTimeout(window._tierSearchTimer);
      window._tierSearchTimer = setTimeout(() => {
        _tierFilter.search = e.target.value;
        renderTierPool();
      }, 180);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      _tierFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };
      Object.values(sels).forEach(s => { if (s) s.value = 'todos'; });
      if (search) search.value = '';
      renderTierPool();
    });
  }

  // Botões
  document.getElementById('tierResetBtn').addEventListener('click', () => {
    if (confirm(ui('tier.confirmReset'))) {
      _tierState = {};
      saveTierState();
      renderTierAll();
      toast({ msg: 'Tier list resetada', type: 'info' });
    }
  });

  document.getElementById('tierShareBtn').addEventListener('click', exportTierList);
  document.getElementById('tierImportBtn').addEventListener('click', openTierImportModal);

  setupTierDropZones();
  setupSpinHandlers();
  renderTierAll();
}

function loadTierState() {
  try {
    const raw = localStorage.getItem(TIER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        _tierState = parsed;
      }
    }
  } catch(_) {}
  // Garante estrutura
  TIER_LIST_LEVELS.forEach(t => {
    if (!Array.isArray(_tierState[t])) _tierState[t] = [];
  });
}

function saveTierState() {
  try {
    localStorage.setItem(TIER_STORAGE_KEY, JSON.stringify(_tierState));
  } catch(_) {}
}

function getTierUsedIds() {
  const used = new Set();
  TIER_LIST_LEVELS.forEach(t => {
    (_tierState[t] || []).forEach(id => used.add(id));
  });
  return used;
}

function tierCardHTML(hero) {
  const r = hero.rarity || 'r';
  const heroName = t(hero, 'name');
  const img = hero.image
    ? `<img src="${hero.image}" alt="${escapeHtml(heroName)}" loading="lazy">`
    : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:24px;">${hero.glyph || '⚔'}</div>`;
  // Pega só o "primeiro pedaço" do nome (antes de "de" em PT ou "of" em EN)
  const shortName = heroName.split(',')[0].split(' de ')[0].split(' of ')[0];
  return `
    <div class="tier-card r-${r}" draggable="true" data-hero-id="${hero.id}" title="${escapeHtml(heroName)}">
      ${img}
      <div class="tier-card-name">${escapeHtml(shortName)}</div>
    </div>
  `;
}

function renderTierAll() {
  renderTierPool();
  renderTierGrid();
  updateTierStatus();
  setupTierDragHandlers();
}
// Alias usado pelo sistema i18n
function renderTier() { return renderTierAll(); }

function renderTierPool() {
  const pool = document.getElementById('tierPool');
  const count = document.getElementById('tierPoolCount');
  if (!pool) return;
  const used = getTierUsedIds();
  const q = (_tierFilter.search || '').toLowerCase();

  const available = CODEX_HEROES.filter(h => {
    if (used.has(h.id)) return false;
    if (_tierFilter.rarity !== 'todos' && h.rarity !== _tierFilter.rarity) return false;
    if (_tierFilter.faction !== 'todos' && h.faction !== _tierFilter.faction) return false;
    if (_tierFilter.class !== 'todos' && h.class !== _tierFilter.class) return false;
    if (_tierFilter.position !== 'todos' && h.position !== _tierFilter.position) return false;
    if (_tierFilter.damage !== 'todos' && h.damage !== _tierFilter.damage) return false;
    if (q) {
      // Busca multilíngue: name e title em PT e EN
      const nomePt = (h.name || '').toLowerCase();
      const nomeEn = (h.name_en || '').toLowerCase();
      const titPt = (h.title || '').toLowerCase();
      const titEn = (h.title_en || '').toLowerCase();
      if (!nomePt.includes(q) && !nomeEn.includes(q) && !titPt.includes(q) && !titEn.includes(q)) return false;
    }
    return true;
  });

  if (count) {
    const totalDisponivel = CODEX_HEROES.length - used.size;
    count.textContent = `${available.length} ${ui('hero.of')} ${totalDisponivel} ${ui('tier.available')}`;
  }

  if (available.length === 0) {
    pool.innerHTML = `<div style="color:var(--ink-dim);font-style:italic;padding:20px;width:100%;text-align:center;">— ${ui('tier.empty')} —</div>`;
    return;
  }

  pool.innerHTML = available.map(tierCardHTML).join('');
  setupTierDragHandlers();
}

function renderTierGrid() {
  TIER_LIST_LEVELS.forEach(t => {
    const slot = document.querySelector(`.tier-slot[data-tier="${t}"]`);
    if (!slot) return;
    const ids = _tierState[t] || [];
    const heroes = ids.map(id => CODEX_HEROES.find(h => h.id === id)).filter(Boolean);
    slot.innerHTML = heroes.map(tierCardHTML).join('');
  });
}

function updateTierStatus() {
  const info = document.getElementById('tierStatusInfo');
  if (!info) return;
  const total = CODEX_HEROES.length;
  const placed = getTierUsedIds().size;
  const breakdown = TIER_LIST_LEVELS
    .map(t => `${t}:${(_tierState[t] || []).length}`)
    .join(' · ');
  info.innerHTML = `<strong>${placed}</strong>/${total} ${ui('tier.heroesLower')} · ${breakdown}`;
}

// ════ Drag and drop ════
let _tierDraggedId = null;

function setupTierDragHandlers() {
  // Cards são re-renderizados, então pega todos novamente
  document.querySelectorAll('.tier-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      _tierDraggedId = card.dataset.heroId;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', _tierDraggedId); } catch(_) {}
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      _tierDraggedId = null;
      document.querySelectorAll('.tier-slot, .tier-pool').forEach(el => el.classList.remove('drag-over'));
    });
  });
}

function setupTierDropZones() {
  // Drop nos tiers (S/A/B/C/D)
  document.querySelectorAll('.tier-slot').forEach(slot => {
    slot.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      slot.classList.add('drag-over');
      // Calcular posição de inserção baseada no mouse
      const afterCard = getDragAfterCard(slot, e.clientX, e.clientY);
      // Remove indicadores anteriores
      slot.querySelectorAll('.tier-card').forEach(c => c.classList.remove('drop-before', 'drop-after'));
      if (afterCard) {
        afterCard.classList.add('drop-before');
      } else {
        // vai pro fim — marca o último com 'drop-after'
        const cards = slot.querySelectorAll('.tier-card:not(.dragging)');
        if (cards.length > 0) {
          cards[cards.length - 1].classList.add('drop-after');
        }
      }
    });
    slot.addEventListener('dragleave', e => {
      // Só remove se saiu pra fora mesmo (não pra um filho)
      if (!slot.contains(e.relatedTarget)) {
        slot.classList.remove('drag-over');
        slot.querySelectorAll('.tier-card').forEach(c => c.classList.remove('drop-before', 'drop-after'));
      }
    });
    slot.addEventListener('drop', e => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      const tier = slot.dataset.tier;
      const heroId = parseInt(_tierDraggedId || e.dataTransfer.getData('text/plain'));
      if (!heroId || !tier) return;

      // Onde inserir: antes de qual card?
      const afterCard = getDragAfterCard(slot, e.clientX, e.clientY);
      const insertBeforeId = afterCard ? parseInt(afterCard.dataset.heroId) : null;

      // Limpar indicadores
      slot.querySelectorAll('.tier-card').forEach(c => c.classList.remove('drop-before', 'drop-after'));

      // Remove de qualquer tier que esteja
      TIER_LIST_LEVELS.forEach(t => {
        _tierState[t] = (_tierState[t] || []).filter(id => id !== heroId);
      });
      // Adiciona no destino, na posição correta
      const arr = _tierState[tier] || (_tierState[tier] = []);
      if (insertBeforeId !== null) {
        const idx = arr.indexOf(insertBeforeId);
        if (idx >= 0) {
          arr.splice(idx, 0, heroId);
        } else {
          arr.push(heroId);
        }
      } else {
        arr.push(heroId);
      }
      saveTierState();
      renderTierAll();
      buzz(20);
    });
  });

  // Drop no pool (= remover do tier)
  const pool = document.getElementById('tierPool');
  if (pool) {
    pool.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      pool.classList.add('drag-over');
    });
    pool.addEventListener('dragleave', e => {
      if (!pool.contains(e.relatedTarget)) {
        pool.classList.remove('drag-over');
      }
    });
    pool.addEventListener('drop', e => {
      e.preventDefault();
      pool.classList.remove('drag-over');
      const heroId = parseInt(_tierDraggedId || e.dataTransfer.getData('text/plain'));
      if (!heroId) return;
      let removed = false;
      TIER_LIST_LEVELS.forEach(t => {
        const before = (_tierState[t] || []).length;
        _tierState[t] = (_tierState[t] || []).filter(id => id !== heroId);
        if ((_tierState[t] || []).length < before) removed = true;
      });
      if (removed) {
        saveTierState();
        renderTierAll();
        buzz(20);
      }
    });
  }
}

/**
 * Dado um container (.tier-slot) e a posição do mouse (x,y),
 * retorna o card .tier-card "logo após" a posição do drop.
 * Se retornar null, significa que o card vai pro fim.
 *
 * Como os cards têm flex-wrap (várias linhas), priorizamos comparação por LINHA:
 * - Se Y do mouse < topo do card → linha anterior → ignora esse card
 * - Se Y do mouse > base do card → linha posterior → ignora esse card
 * - Mesma linha: compara X com o centro horizontal do card
 */
function getDragAfterCard(container, x, y) {
  const cards = [...container.querySelectorAll('.tier-card:not(.dragging)')];
  if (cards.length === 0) return null;

  // Achar cards na MESMA linha do mouse (Y entre topo e base do card)
  const naLinha = cards.filter(c => {
    const r = c.getBoundingClientRect();
    return y >= r.top && y <= r.bottom;
  });

  if (naLinha.length > 0) {
    // Acha o primeiro card cujo centro horizontal está depois do mouse
    for (const c of naLinha) {
      const r = c.getBoundingClientRect();
      if (x < r.left + r.width / 2) return c;
    }
    // Se passou todos da linha, vai depois do último da linha
    // → retorna o primeiro card da PRÓXIMA linha (se houver)
    const ultimoNaLinha = naLinha[naLinha.length - 1];
    const idx = cards.indexOf(ultimoNaLinha);
    return cards[idx + 1] || null;
  }

  // Mouse fora de qualquer linha de card existente:
  // Acha o primeiro card cujo TOPO está depois da posição Y do mouse
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    if (y < r.top) return c;
  }
  return null; // vai pro fim
}

// ════════════════════════════════════════════════════════════════
//   ROLETA DE CAVALEIROS (Spin Wheel)
// ════════════════════════════════════════════════════════════════
let _spinState = {
  sorteados: new Set(),   // ids já sorteados (e colocados em tier)
  pulados: new Set(),     // ids pulados (não conta como já sorteado)
  resultadoAtual: null,   // id do cavaleiro atualmente exibido como resultado
  girando: false
};

function openSpinModal() {
  const modal = document.getElementById('spinModal');
  if (!modal) return;
  modal.classList.add('active');
  // Limpar resultado anterior
  document.getElementById('spinResult').style.display = 'none';
  _spinState.resultadoAtual = null;
  // Renderizar pista vazia + atualizar contador
  renderSpinTrackPreview();
  updateSpinProgress();
}

function closeSpinModal() {
  const modal = document.getElementById('spinModal');
  if (!modal) return;
  modal.classList.remove('active');
  _spinState.girando = false;
}

function getSpinAvailableHeroes() {
  // Retorna lista de heróis ainda não sorteados
  return CODEX_HEROES.filter(h => !_spinState.sorteados.has(h.id));
}

function updateSpinProgress() {
  const total = CODEX_HEROES.length;
  const sorteados = _spinState.sorteados.size;
  const fill = document.getElementById('spinProgressFill');
  const text = document.getElementById('spinProgressText');
  if (fill) fill.style.width = `${(sorteados / total) * 100}%`;
  if (text) {
    // Usar formato com placeholders
    const tpl = ui('spin.progressText');
    text.textContent = tpl.replace('{x}', sorteados).replace('{total}', total);
  }
  // Habilita/desabilita botão de girar
  const btn = document.getElementById('spinStartBtn');
  if (btn) {
    const available = getSpinAvailableHeroes();
    btn.disabled = available.length === 0;
    if (available.length === 0) {
      btn.textContent = ui('spin.allDone');
    } else {
      btn.textContent = ui('spin.spinButton');
    }
  }
}

function spinTrackCardHTML(hero) {
  const r = hero.rarity || 'r';
  const heroName = t(hero, 'name');
  // Pega só "primeiro pedaço" do nome
  const shortName = heroName.split(',')[0].split(' de ')[0].split(' of ')[0];
  const img = hero.image
    ? `<img src="${hero.image}" alt="" loading="lazy">`
    : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:28px;">${hero.glyph || '⚔'}</div>`;
  return `
    <div class="spin-track-card r-${r}">
      ${img}
      <div class="spin-track-card-name">${escapeHtml(shortName)}</div>
    </div>
  `;
}

function renderSpinTrackPreview() {
  // Mostra alguns heróis disponíveis na pista (sem animação)
  const track = document.getElementById('spinTrack');
  if (!track) return;
  const available = getSpinAvailableHeroes();
  if (available.length === 0) {
    track.innerHTML = `<div style="padding:40px;text-align:center;color:var(--ink-dim);font-style:italic;width:100%;">${ui('spin.noHeroes')}</div>`;
    return;
  }
  // Mostra 7 cards aleatórios como preview
  const shuffled = [...available].sort(() => Math.random() - 0.5).slice(0, 7);
  track.style.transition = 'none';
  track.style.transform = 'translateX(0)';
  track.innerHTML = shuffled.map(spinTrackCardHTML).join('');
}

function startSpin() {
  if (_spinState.girando) return;
  const available = getSpinAvailableHeroes();
  if (available.length === 0) {
    toast({ msg: ui('spin.allDone'), type: 'info' });
    return;
  }

  _spinState.girando = true;
  // Esconde resultado anterior
  document.getElementById('spinResult').style.display = 'none';
  document.getElementById('spinStartBtn').disabled = true;

  // Escolhe o vencedor
  const vencedor = available[Math.floor(Math.random() * available.length)];

  // Monta uma sequência longa de cards (que vai rolar)
  const tamanho = 40 + Math.floor(Math.random() * 10);  // 40 a 50
  const sequencia = [];
  for (let i = 0; i < tamanho; i++) {
    sequencia.push(available[Math.floor(Math.random() * available.length)]);
  }
  // Insere vencedor numa posição quase no fim (~85% do caminho)
  const posVencedor = Math.floor(tamanho * 0.85);
  sequencia[posVencedor] = vencedor;

  const track = document.getElementById('spinTrack');
  track.innerHTML = sequencia.map(spinTrackCardHTML).join('');

  // Reset de posição antes da animação
  track.style.transition = 'none';
  track.style.transform = 'translateX(0)';

  // Espera o navegador renderizar (pra podermos MEDIR o card real)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Mede a posição real do card vencedor no DOM (mais robusto que hardcode)
      const cards = track.querySelectorAll('.spin-track-card');
      if (cards.length <= posVencedor) {
        // Fallback de segurança
        _spinState.girando = false;
        document.getElementById('spinStartBtn').disabled = false;
        return;
      }
      const cardVencedor = cards[posVencedor];
      const trackWrap = track.parentElement; // .spin-track-wrap

      // Posição do CENTRO do card vencedor relativo à PISTA (.spin-track-wrap)
      const cardRect = cardVencedor.getBoundingClientRect();
      const wrapRect = trackWrap.getBoundingClientRect();
      // Centro horizontal do card (em coords da viewport)
      const cardCenterX = cardRect.left + cardRect.width / 2;
      // Centro horizontal do wrap (= onde está o ponteiro)
      const wrapCenterX = wrapRect.left + wrapRect.width / 2;
      // Quanto preciso transladar pra alinhar
      const targetOffset = wrapCenterX - cardCenterX;

      // Duração entre 3.5s e 5s
      const duracao = 3500 + Math.random() * 1500;
      track.style.transition = `transform ${duracao}ms cubic-bezier(.16, .8, .25, 1)`;
      track.style.transform = `translateX(${targetOffset}px)`;

      // Quando terminar a animação, mostra o resultado
      setTimeout(() => {
        _spinState.girando = false;
        _spinState.resultadoAtual = vencedor.id;
        // Destaca visualmente o card vencedor
        cardVencedor.style.boxShadow = '0 0 24px rgba(212,175,55,.8), 0 0 0 3px var(--gold)';
        cardVencedor.style.zIndex = '2';
        cardVencedor.style.position = 'relative';
        showSpinResult(vencedor);
        buzz(40);
      }, duracao + 100);
    });
  });
}

function showSpinResult(hero) {
  const card = document.getElementById('spinResultCard');
  const wrap = document.getElementById('spinResult');
  if (!card || !wrap) return;

  const r = hero.rarity || 'r';
  const useEs = (_lang === 'es');
  const useEn = (_lang === 'en');
  const heroName = t(hero, 'name');
  const heroTitle = t(hero, 'title') || '';

  const RARITY_LABEL_PT = { ssr:'SSR', sr:'SR', r:'R', n:'N' };
  const rarityLabel = (RARITY_LABEL_PT[r] || r).toUpperCase();

  const img = hero.image
    ? `<img src="${hero.image}" alt="${escapeHtml(heroName)}">`
    : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:42px;">${hero.glyph || '⚔'}</div>`;

  card.innerHTML = `
    <div class="spin-result-portrait">${img}</div>
    <div class="spin-result-info">
      <div class="spin-result-name">${escapeHtml(heroName)}</div>
      ${heroTitle ? `<div class="spin-result-title">${escapeHtml(heroTitle)}</div>` : ''}
      <div class="spin-result-rarity r-${r}">${rarityLabel}</div>
    </div>
  `;
  wrap.style.display = 'flex';
  // Atualiza botão
  const btn = document.getElementById('spinStartBtn');
  if (btn) {
    btn.disabled = false;
    btn.textContent = ui('spin.spinAgain');
  }
}

function placeResultInTier(tier) {
  if (!_spinState.resultadoAtual) return;
  const heroId = _spinState.resultadoAtual;
  // Remove de qualquer tier que esteja (caso já tenha sido colocado)
  TIER_LIST_LEVELS.forEach(t => {
    _tierState[t] = (_tierState[t] || []).filter(id => id !== heroId);
  });
  // Adiciona no tier escolhido
  if (!_tierState[tier]) _tierState[tier] = [];
  _tierState[tier].push(heroId);
  saveTierState();
  renderTierAll();
  // Marca como sorteado e remove do pool da roleta
  _spinState.sorteados.add(heroId);
  _spinState.pulados.delete(heroId);
  _spinState.resultadoAtual = null;
  // Esconde resultado, atualiza
  document.getElementById('spinResult').style.display = 'none';
  updateSpinProgress();
  renderSpinTrackPreview();
  // Feedback
  const hero = CODEX_HEROES.find(h => h.id === heroId);
  const tpl = ui('spin.placed');
  toast({ msg: tpl.replace('{nome}', t(hero, 'name')).replace('{tier}', tier), type: 'success' });
  buzz(20);
  // Auto-sorteia próximo após 600ms
  if (getSpinAvailableHeroes().length > 0) {
    setTimeout(() => {
      if (document.getElementById('spinModal').classList.contains('active') && !_spinState.girando) {
        startSpin();
      }
    }, 600);
  } else {
    toast({ msg: ui('spin.allDone'), type: 'info' });
  }
}

function skipCurrent() {
  // Marca como "pulado" (não sorteia de novo até resetar)
  if (_spinState.resultadoAtual) {
    _spinState.pulados.add(_spinState.resultadoAtual);
    _spinState.sorteados.add(_spinState.resultadoAtual);
    _spinState.resultadoAtual = null;
  }
  document.getElementById('spinResult').style.display = 'none';
  updateSpinProgress();
  // Inicia nova rodada
  if (getSpinAvailableHeroes().length > 0) {
    startSpin();
  }
}

function resetSpinPool() {
  if (_spinState.sorteados.size === 0) return;
  if (!confirm(ui('spin.confirmReset'))) return;
  _spinState.sorteados.clear();
  _spinState.pulados.clear();
  _spinState.resultadoAtual = null;
  document.getElementById('spinResult').style.display = 'none';
  updateSpinProgress();
  renderSpinTrackPreview();
  toast({ msg: ui('spin.resetDone'), type: 'info' });
}

function setupSpinHandlers() {
  // Botão abre o modal
  const openBtn = document.getElementById('tierSpinBtn');
  if (openBtn) openBtn.addEventListener('click', openSpinModal);
  // Fechar modal
  const closeBtn = document.getElementById('spinModalClose');
  if (closeBtn) closeBtn.addEventListener('click', closeSpinModal);
  // Click no overlay fecha
  const modal = document.getElementById('spinModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeSpinModal();
    });
  }
  // Botão girar
  const spinBtn = document.getElementById('spinStartBtn');
  if (spinBtn) spinBtn.addEventListener('click', startSpin);
  // Botão restaurar
  const resetBtn = document.getElementById('spinResetPoolBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetSpinPool);
  // Botões de tier (S/A/B/C/D)
  document.querySelectorAll('.spin-tier-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tier = btn.dataset.tier;
      placeResultInTier(tier);
    });
  });
  // Botão pular
  const skipBtn = document.getElementById('spinSkipBtn');
  if (skipBtn) skipBtn.addEventListener('click', skipCurrent);
  // ESC fecha
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
      closeSpinModal();
    }
  });
}

// ════════════════════════════════════════════════════════════════
//   PÁGINA DEDICADA: ROLETA (Tab Roleta)
//   3 builds diferentes por cavaleiro sorteado + filtros
// ════════════════════════════════════════════════════════════════
let _roletaPageInit = false;
let _roletaPageGirando = false;
let _roletaPageResultado = null;  // id do cavaleiro sorteado atualmente
// Storage de builds: chave = `${heroId}_${buildIdx}`, valor = { artifact, cards[5] }
let _roletaBuilds = {};
// Contexto pra modal de seleção
let _roletaModalCtx = { heroId: null, buildIdx: -1, slot: -1, tipo: null }; // tipo: 'artifact' | 'card'
// Filtros (igual à Tier List)
let _roletaFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };

function initRoletaTab() {
  if (!_roletaPageInit) {
    _roletaPageInit = true;
    // Handlers principais
    document.getElementById('rolPageSpinBtn').addEventListener('click', startSpinPage);
    document.getElementById('rolPageResetBtn').addEventListener('click', resetSpinPagePool);
    document.getElementById('rolPageSkipBtn').addEventListener('click', skipPageCurrent);
    const nextBtn = document.getElementById('rolPageNextBtn');
    if (nextBtn) nextBtn.addEventListener('click', nextKnight);
    // Botão manual
    const manualBtn = document.getElementById('rolPageManualBtn');
    if (manualBtn) manualBtn.addEventListener('click', openManualHeroPicker);

    // ─── Hookup dos filtros ───
    const sels = {
      rarity:   document.getElementById('rolPageFilterRarity'),
      faction:  document.getElementById('rolPageFilterFaction'),
      class:    document.getElementById('rolPageFilterClass'),
      position: document.getElementById('rolPageFilterPosition'),
      damage:   document.getElementById('rolPageFilterDamage')
    };
    const clearBtn = document.getElementById('rolPageFilterClear');

    const populate = (sel, options, allKey = 'filter.allFem') => {
      if (!sel) return;
      sel.innerHTML = `<option value="todos">${ui(allKey)}</option>` +
        Object.entries(options).map(([k, v]) => `<option value="${k}">${v.icon||''} ${t(v,'name')||k.toUpperCase()}</option>`).join('');
      sel.addEventListener('change', () => {
        const key = sel.id.replace('rolPageFilter', '').toLowerCase();
        _roletaFilter[key] = sel.value;
        renderRoletaPagePreview();
        updateRoletaPageProgress();
      });
    };

    if (sels.rarity) {
      sels.rarity.innerHTML = `<option value="todos">${ui('filter.allFem')}</option>` +
        ['ur','ssr','sr','r'].map(r => `<option value="${r}">${r.toUpperCase()}</option>`).join('');
      sels.rarity.addEventListener('change', () => {
        _roletaFilter.rarity = sels.rarity.value;
        renderRoletaPagePreview();
        updateRoletaPageProgress();
      });
    }
    populate(sels.faction, CODEX_FACTIONS, 'filter.allFem');
    populate(sels.class, CODEX_CLASSES, 'filter.allFem');
    populate(sels.position, CODEX_POSITIONS, 'filter.allFem');
    populate(sels.damage, CODEX_DAMAGE, 'filter.allMasc');

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        _roletaFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };
        Object.values(sels).forEach(s => { if (s) s.value = 'todos'; });
        renderRoletaPagePreview();
        updateRoletaPageProgress();
      });
    }
  }
  // Sempre re-renderiza ao abrir
  renderRoletaPagePreview();
  updateRoletaPageProgress();
}

// Retorna heróis disponíveis aplicando filtros + removendo sorteados
function getRoletaAvailableHeroes() {
  const f = _roletaFilter;
  return CODEX_HEROES.filter(h => {
    if (_spinState.sorteados.has(h.id)) return false;
    if (f.rarity !== 'todos' && h.rarity !== f.rarity) return false;
    if (f.faction !== 'todos' && h.faction !== f.faction) return false;
    if (f.class !== 'todos' && h.class !== f.class) return false;
    if (f.position !== 'todos' && h.position !== f.position) return false;
    if (f.damage !== 'todos' && h.damage !== f.damage) return false;
    return true;
  });
}

function renderRoletaPagePreview() {
  const track = document.getElementById('rolPageTrack');
  if (!track) return;
  const available = getRoletaAvailableHeroes();
  if (available.length === 0) {
    track.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ink-dim);font-style:italic;width:100%;">${ui('spin.noHeroes')}</div>`;
    return;
  }
  const shuffled = [...available].sort(() => Math.random() - 0.5).slice(0, 9);
  track.style.transition = 'none';
  track.style.transform = 'translateX(0)';
  track.innerHTML = shuffled.map(spinTrackCardHTML).join('');
}

function updateRoletaPageProgress() {
  const total = CODEX_HEROES.length;
  const sorteados = _spinState.sorteados.size;
  const disponiveis = getRoletaAvailableHeroes().length;
  const fill = document.getElementById('rolPageProgressFill');
  const text = document.getElementById('rolPageProgressText');
  if (fill) fill.style.width = `${(sorteados / total) * 100}%`;
  if (text) {
    const tpl = ui('spin.progressText');
    let textContent = tpl.replace('{x}', sorteados).replace('{total}', total);
    // Adicionar info de disponíveis se filtrados
    const hasFilter = _roletaFilter.rarity !== 'todos' || _roletaFilter.faction !== 'todos' ||
                      _roletaFilter.class !== 'todos' || _roletaFilter.position !== 'todos' ||
                      _roletaFilter.damage !== 'todos';
    if (hasFilter) {
      const filterTpl = ui('spin.availableInPool');
      textContent += ' · ' + filterTpl.replace('{n}', disponiveis);
    }
    text.textContent = textContent;
  }
  const btn = document.getElementById('rolPageSpinBtn');
  if (btn) {
    btn.disabled = disponiveis === 0;
    if (disponiveis === 0) {
      btn.textContent = ui('spin.allDone');
    } else if (_roletaPageResultado) {
      btn.textContent = ui('spin.spinAgain');
    } else {
      btn.textContent = ui('spin.spinButton');
    }
  }
  // Botão manual: desabilita se não tem mais cavaleiros (qualquer um, sem filtro)
  const manualBtn = document.getElementById('rolPageManualBtn');
  if (manualBtn) {
    const semDisponiveis = (CODEX_HEROES.length - sorteados) === 0;
    manualBtn.disabled = semDisponiveis || _roletaPageGirando;
  }
}

function startSpinPage() {
  if (_roletaPageGirando) return;
  const available = getRoletaAvailableHeroes();
  if (available.length === 0) {
    toast({ msg: ui('spin.allDone'), type: 'info' });
    return;
  }

  _roletaPageGirando = true;
  document.getElementById('rolPageResult').style.display = 'none';
  document.getElementById('rolPageSpinBtn').disabled = true;

  // Escolhe o vencedor
  const vencedor = available[Math.floor(Math.random() * available.length)];

  // Monta sequência longa
  const tamanho = 60 + Math.floor(Math.random() * 20);  // 60-80 cards (mais que antes)
  const sequencia = [];
  for (let i = 0; i < tamanho; i++) {
    sequencia.push(available[Math.floor(Math.random() * available.length)]);
  }
  const posVencedor = Math.floor(tamanho * 0.88);
  sequencia[posVencedor] = vencedor;

  const track = document.getElementById('rolPageTrack');
  track.innerHTML = sequencia.map(spinTrackCardHTML).join('');

  // Reset posição
  track.style.transition = 'none';
  track.style.transform = 'translateX(0)';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const cards = track.querySelectorAll('.spin-track-card');
      if (cards.length <= posVencedor) {
        _roletaPageGirando = false;
        document.getElementById('rolPageSpinBtn').disabled = false;
        return;
      }
      const cardVencedor = cards[posVencedor];
      const trackWrap = track.parentElement;

      const cardRect = cardVencedor.getBoundingClientRect();
      const wrapRect = trackWrap.getBoundingClientRect();
      const cardCenterX = cardRect.left + cardRect.width / 2;
      const wrapCenterX = wrapRect.left + wrapRect.width / 2;
      const targetOffset = wrapCenterX - cardCenterX;

      // ★ TEMPO DE GIRO 4× MAIOR: 14000 a 20000 ms (era 3500-5000)
      const duracao = 14000 + Math.random() * 6000;
      track.style.transition = `transform ${duracao}ms cubic-bezier(.12, .85, .2, 1)`;
      track.style.transform = `translateX(${targetOffset}px)`;

      setTimeout(() => {
        _roletaPageGirando = false;
        _roletaPageResultado = vencedor.id;
        // Destaca o card vencedor
        cardVencedor.style.boxShadow = '0 0 28px rgba(212,175,55,.9), 0 0 0 4px var(--gold)';
        cardVencedor.style.zIndex = '2';
        cardVencedor.style.position = 'relative';
        showRoletaPageResult(vencedor);
        buzz(60);
      }, duracao + 100);
    });
  });
}

function showRoletaPageResult(hero) {
  const wrap = document.getElementById('rolPageResult');
  if (!wrap) return;

  const r = hero.rarity || 'r';
  const heroName = t(hero, 'name');
  const heroTitle = t(hero, 'title') || '';

  // Portrait
  const portraitEl = document.getElementById('rolPageResultPortrait');
  if (portraitEl) {
    if (hero.image) {
      portraitEl.innerHTML = `<img src="${hero.image}" alt="${escapeHtml(heroName)}">`;
    } else {
      portraitEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:80px;">${hero.glyph || '⚔'}</div>`;
    }
  }

  // Nome
  const nameEl = document.getElementById('rolPageResultName');
  if (nameEl) nameEl.textContent = heroName;

  // Title
  const titleEl = document.getElementById('rolPageResultTitle');
  if (titleEl) titleEl.textContent = heroTitle;

  // Badges (raridade + facção + classe)
  const badgesEl = document.getElementById('rolPageResultBadges');
  if (badgesEl) {
    const rarityLabel = (r || 'n').toUpperCase();
    const faction = hero.faction ? (CODEX_FACTIONS[hero.faction] || {}) : null;
    const factionName = faction ? t(faction, 'name') : '';
    const heroClass = hero.class ? (CODEX_CLASSES[hero.class] || {}) : null;
    const className = heroClass ? t(heroClass, 'name') : '';
    badgesEl.innerHTML = `
      <span class="badge r-${r}">${rarityLabel}</span>
      ${factionName ? `<span class="badge faction">${faction.icon || ''} ${factionName}</span>` : ''}
      ${className ? `<span class="badge faction">${heroClass.icon || ''} ${className}</span>` : ''}
    `;
  }

  // Inicializa os 3 builds (se ainda não existem) e renderiza
  setupRoletaBuilds(hero.id);
  renderRoletaBuilds(hero.id);

  wrap.style.display = 'flex';
  // Scroll suave pro resultado com offset (respiro de 80px no topo)
  setTimeout(() => {
    const rect = wrap.getBoundingClientRect();
    const topbar = document.getElementById('topbar');
    const tbH = topbar ? topbar.getBoundingClientRect().height : 0;
    const scrollTarget = window.pageYOffset + rect.top - tbH - 24;
    window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
  }, 200);
  // Atualizar texto do botão
  updateRoletaPageProgress();
}

// Inicializa storage dos 3 builds pra um herói (se ainda não existem)
function setupRoletaBuilds(heroId) {
  for (let i = 0; i < 3; i++) {
    const key = `${heroId}_${i}`;
    if (!_roletaBuilds[key]) {
      _roletaBuilds[key] = {
        artifact: null,
        cards: [null, null, null, null, null],
        // Time: 5 mains (slot 0 já é o próprio cavaleiro sorteado) + 2 supports
        team: [heroId, null, null, null, null],  // ids
        supports: [null, null]                    // ids
      };
    } else {
      // Garante que slot 0 do time seja sempre o cavaleiro sorteado (mesmo se já tinha build salva)
      if (!_roletaBuilds[key].team) _roletaBuilds[key].team = [heroId, null, null, null, null];
      if (!_roletaBuilds[key].supports) _roletaBuilds[key].supports = [null, null];
      _roletaBuilds[key].team[0] = heroId;
    }
  }
}

// Renderiza os 3 builds visíveis (artefato + 5 cartas em cada)
function renderRoletaBuilds(heroId) {
  const hero = CODEX_HEROES.find(h => h.id === heroId);
  if (!hero) return;
  const portrait = hero.image
    ? `<img src="${hero.image}" alt="${escapeHtml(t(hero,'name'))}" loading="lazy">`
    : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:32px;">${hero.glyph || '⚔'}</div>`;
  // Nome curto do cavaleiro
  const heroShortName = t(hero, 'name').split(',')[0].split(' de ')[0].split(' of ')[0];

  // Helper: renderiza um slot de cavaleiro do time (main ou support)
  const renderTeamSlot = (slotHeroId, buildIdx, slotKey, slotIdx, fixed) => {
    // slotKey = 'team' | 'supports'
    if (slotHeroId) {
      const h = CODEX_HEROES.find(x => x.id === slotHeroId);
      if (!h) return '';
      const r = h.rarity || 'r';
      const img = h.image
        ? `<img src="${h.image}" alt="${escapeHtml(t(h,'name'))}" loading="lazy">`
        : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:18px;">${h.glyph || '⚔'}</div>`;
      const short = t(h, 'name').split(',')[0].split(' de ')[0].split(' of ')[0];
      // Fixed = slot do cavaleiro principal (slot 0 do team), não pode remover
      const cursorStyle = fixed ? 'style="cursor:default;"' : '';
      const onclickAttr = fixed ? '' : `onclick="openRoletaTeamPicker(${heroId}, ${buildIdx}, '${slotKey}', ${slotIdx})"`;
      const removeBtn = fixed ? '' : `<button class="slot-remove" onclick="event.stopPropagation();removeRoletaTeamSlot(${heroId}, ${buildIdx}, '${slotKey}', ${slotIdx})">×</button>`;
      return `<div class="roleta-slot-wrap">
        <div class="roleta-team-slot filled r-${r}" ${cursorStyle} ${onclickAttr} title="${escapeHtml(t(h,'name'))}">
          ${removeBtn}
          ${img}
        </div>
        <div class="roleta-slot-name" title="${escapeHtml(t(h,'name'))}">${escapeHtml(short)}</div>
      </div>`;
    } else {
      return `<div class="roleta-slot-wrap">
        <div class="roleta-team-slot" onclick="openRoletaTeamPicker(${heroId}, ${buildIdx}, '${slotKey}', ${slotIdx})" title="${ui('team.pickHero') || 'Selecionar cavaleiro'}"><span class="empty-mark">+</span></div>
        <div class="roleta-slot-name roleta-slot-name-empty">—</div>
      </div>`;
    }
  };

  for (let buildIdx = 0; buildIdx < 3; buildIdx++) {
    const buildEl = document.querySelector(`.roleta-build[data-build-idx="${buildIdx}"] .roleta-build-equipment`);
    if (!buildEl) continue;
    const key = `${heroId}_${buildIdx}`;
    const build = _roletaBuilds[key] || { artifact: null, cards: [null,null,null,null,null], team: [heroId,null,null,null,null], supports: [null,null] };

    // Slot do cavaleiro (com nome embaixo)
    const heroSlotHTML = `
      <div class="roleta-slot-wrap">
        <div class="roleta-art-slot filled r-${hero.rarity || 'ssr'}" style="border-style:solid;cursor:default;" title="${escapeHtml(t(hero,'name'))}">
          ${portrait}
        </div>
        <div class="roleta-slot-name" title="${escapeHtml(t(hero,'name'))}">${escapeHtml(heroShortName)}</div>
      </div>`;

    // Slot artefato (com nome embaixo se equipado)
    let artHTML;
    if (!build.artifact) {
      artHTML = `<div class="roleta-slot-wrap">
        <div class="roleta-art-slot" onclick="openRoletaArtifactPicker(${heroId}, ${buildIdx})" title="${ui('team.tooltipEquipArtifact') || 'Equipar artefato'}"><span class="empty-mark">+</span></div>
        <div class="roleta-slot-name roleta-slot-name-empty">—</div>
      </div>`;
    } else {
      const a = build.artifact;
      const r = a.rarity || 'r';
      const artName = (a.name || '').split(',')[0];
      artHTML = `<div class="roleta-slot-wrap">
        <div class="roleta-art-slot filled r-${r}" onclick="openRoletaArtifactPicker(${heroId}, ${buildIdx})" title="${escapeHtml(a.name)}">
          <button class="slot-remove" onclick="event.stopPropagation();removeRoletaArtifact(${heroId}, ${buildIdx})">×</button>
          <img src="${a.image}" alt="${escapeHtml(a.name)}" loading="lazy">
        </div>
        <div class="roleta-slot-name" title="${escapeHtml(a.name)}">${escapeHtml(artName)}</div>
      </div>`;
    }

    // Slots cartas (5) — com nome embaixo se equipada
    const cardsHTML = build.cards.map((c, idx) => {
      if (!c) {
        return `<div class="roleta-slot-wrap">
          <div class="roleta-card-slot" onclick="openRoletaCardPicker(${heroId}, ${buildIdx}, ${idx})" title="${ui('team.tooltipEquipCard') || 'Equipar carta'}">${ui('team.card') || 'CARTA'}</div>
          <div class="roleta-slot-name roleta-slot-name-empty">—</div>
        </div>`;
      }
      const r = c.rarity || 'n';
      const cName = t(c, 'name');
      const cShort = cName.split(',')[0];
      return `<div class="roleta-slot-wrap">
        <div class="roleta-card-slot filled r-${r}" onclick="openRoletaCardPicker(${heroId}, ${buildIdx}, ${idx})" title="${escapeHtml(cName)}">
          <button class="slot-remove" onclick="event.stopPropagation();removeRoletaCard(${heroId}, ${buildIdx}, ${idx})">×</button>
          <span class="slot-rarity-tag">${r.toUpperCase()}</span>
          <img src="${c.image}" alt="${escapeHtml(cName)}" loading="lazy">
        </div>
        <div class="roleta-slot-name" title="${escapeHtml(cName)}">${escapeHtml(cShort)}</div>
      </div>`;
    }).join('');

    // ─── Linha do time (5 mains + 2 supports) ───
    // O slot 0 do main já é o cavaleiro sorteado (fixed)
    const teamHTML = build.team.map((id, idx) => renderTeamSlot(id, buildIdx, 'team', idx, idx === 0)).join('');
    const supportsHTML = build.supports.map((id, idx) => renderTeamSlot(id, buildIdx, 'supports', idx, false)).join('');

    buildEl.innerHTML = `
      <div class="roleta-build-row-equipment">
        ${heroSlotHTML}
        <span class="roleta-build-separator">+</span>
        ${artHTML}
        <span class="roleta-build-separator">+</span>
        ${cardsHTML}
      </div>
      <div class="roleta-build-row-team">
        <div class="roleta-build-team-label">${ui('spin.teamLabel') || 'Time:'}</div>
        ${teamHTML}
        <span class="roleta-build-team-separator">|</span>
        <div class="roleta-build-team-label">${ui('spin.supportsLabel') || 'Suportes:'}</div>
        ${supportsHTML}
      </div>
    `;
  }
}

// ─── Picker de herói pra slots de time da Roleta ───
function openRoletaTeamPicker(heroId, buildIdx, slotKey, slotIdx) {
  _roletaModalCtx = { heroId, buildIdx, slot: slotIdx, tipo: 'team', slotKey };
  _modalHeroFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };
  renderRoletaHeroPicker();
  document.getElementById('codexModal').classList.add('active');
}

function renderRoletaHeroPicker() {
  const { heroId, buildIdx, slot, slotKey } = _roletaModalCtx;
  const f = _modalHeroFilter;
  const key = `${heroId}_${buildIdx}`;
  const build = _roletaBuilds[key] || { team: [heroId,null,null,null,null], supports: [null,null] };

  // Cavaleiros já no time/supports desta build (sem o slot atual)
  const usados = new Set();
  (build.team || []).forEach((id, idx) => {
    if (id && !(slotKey === 'team' && idx === slot)) usados.add(id);
  });
  (build.supports || []).forEach((id, idx) => {
    if (id && !(slotKey === 'supports' && idx === slot)) usados.add(id);
  });

  const filtered = CODEX_HEROES.filter(h => {
    if (usados.has(h.id)) return false;
    if (f.rarity !== 'todos' && h.rarity !== f.rarity) return false;
    if (f.faction !== 'todos' && h.faction !== f.faction) return false;
    if (f.class !== 'todos' && h.class !== f.class) return false;
    if (f.position !== 'todos' && h.position !== f.position) return false;
    if (f.damage !== 'todos' && h.damage !== f.damage) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const nomePt = (h.name || '').toLowerCase();
      const nomeEn = (h.name_en || '').toLowerCase();
      const nomeEs = (h.name_es || '').toLowerCase();
      if (!nomePt.includes(q) && !nomeEn.includes(q) && !nomeEs.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const order = {ur:0, ssr:1, sr:2, r:3, n:4};
    const ar = order[a.rarity] ?? 9, br = order[b.rarity] ?? 9;
    if (ar !== br) return ar - br;
    return (t(a,'name') || a.name).localeCompare(t(b,'name') || b.name, getLocale());
  });

  const slotLabel = slotKey === 'supports'
    ? `${ui('team.supportSlot') || 'Suporte'} ${slot + 1}`
    : `${ui('team.knight') || 'Cavaleiro'} ${slot + 1}`;
  document.getElementById('codexModalTitle').textContent = `Build ${buildIdx + 1} — ${slotLabel} — ${ui('team.pickHero') || 'Selecione um cavaleiro'}`;
  document.getElementById('codexModalBody').innerHTML = `
    ${renderModalFilterToolbar('hero', f, CODEX_HEROES.length, filtered.length)}
    <div class="heroes-grid" style="margin-top:14px;">
      ${filtered.length ? filtered.map(h => heroCardHTML(h, `onclick="equipRoletaTeamHero(${h.id})"`)).join('')
        : `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ink-dim);font-style:italic;">${ui('team.noHeroFilter') || 'Nenhum cavaleiro encontrado.'}</div>`}
    </div>
  `;
  setupRoletaModalHeroFilterHandlers();
}

function setupRoletaModalHeroFilterHandlers() {
  const f = _modalHeroFilter;
  const refresh = () => renderRoletaHeroPicker();

  ['rarity','faction','class','position','damage'].forEach(k => {
    const el = document.getElementById('modalFilter_hero_' + k);
    if (el) el.addEventListener('change', e => { f[k] = e.target.value; refresh(); });
  });

  const search = document.getElementById('modalFilter_hero_search');
  if (search) {
    search.addEventListener('input', e => {
      clearTimeout(window._modalRoletaHeroSearchTimer);
      window._modalRoletaHeroSearchTimer = setTimeout(() => {
        f.search = e.target.value;
        refresh();
        setTimeout(() => {
          const nx = document.getElementById('modalFilter_hero_search');
          if (nx) { nx.focus(); nx.setSelectionRange(nx.value.length, nx.value.length); }
        }, 0);
      }, 180);
    });
  }
  const clearBtn = document.getElementById('modalFilter_hero_clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      _modalHeroFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };
      refresh();
    });
  }
}

function equipRoletaTeamHero(pickedHeroId) {
  const { heroId, buildIdx, slot, slotKey } = _roletaModalCtx;
  if (!heroId || buildIdx < 0 || slot < 0) return;
  const key = `${heroId}_${buildIdx}`;
  if (!_roletaBuilds[key]) _roletaBuilds[key] = { artifact: null, cards: [null,null,null,null,null], team: [heroId,null,null,null,null], supports: [null,null] };
  if (slotKey === 'supports') {
    _roletaBuilds[key].supports[slot] = pickedHeroId;
  } else {
    _roletaBuilds[key].team[slot] = pickedHeroId;
  }
  closeCodexModal();
  _roletaModalCtx = { heroId: null, buildIdx: -1, slot: -1, tipo: null };
  buzz(20);
  renderRoletaBuilds(heroId);
}

function removeRoletaTeamSlot(heroId, buildIdx, slotKey, slotIdx) {
  const key = `${heroId}_${buildIdx}`;
  if (!_roletaBuilds[key]) return;
  if (slotKey === 'supports') {
    _roletaBuilds[key].supports[slotIdx] = null;
  } else {
    // Não permitir remover o slot 0 (cavaleiro principal)
    if (slotIdx === 0) return;
    _roletaBuilds[key].team[slotIdx] = null;
  }
  renderRoletaBuilds(heroId);
}

// ─── Abrir picker de artefato (versão Roleta) ───
function openRoletaArtifactPicker(heroId, buildIdx) {
  _roletaModalCtx = { heroId, buildIdx, slot: -1, tipo: 'artifact' };
  _modalArtifactFilter = { search: '', rarity: 'todos' };
  renderRoletaArtifactPicker();
  document.getElementById('codexModal').classList.add('active');
}

function renderRoletaArtifactPicker() {
  const heroId = _roletaModalCtx.heroId;
  const hero = CODEX_HEROES.find(h => h.id === heroId);
  const heroName = hero ? t(hero, 'name').split(',')[0] : 'Herói';
  const f = _modalArtifactFilter;

  const RARITY_ORDER = ['ssr','sr','r'];
  const filtered = CODEX_ARTIFACTS.filter(a => {
    if (f.rarity !== 'todos' && a.rarity !== f.rarity) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!a.name.toLowerCase().includes(q) && !(a.type||'').toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const ar = RARITY_ORDER.indexOf(a.rarity), br = RARITY_ORDER.indexOf(b.rarity);
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  const titleLabel = _lang === 'es' ? 'Selecciona un Artefacto' : _lang === 'en' ? 'Select an Artifact' : 'Selecione um Artefato';
  document.getElementById('codexModalTitle').textContent = `${heroName} (Build ${_roletaModalCtx.buildIdx+1}) — ${titleLabel}`;
  document.getElementById('codexModalBody').innerHTML = `
    ${renderModalFilterToolbar('artifact', f, CODEX_ARTIFACTS.length, filtered.length)}
    <div class="artifacts-grid" style="margin-top:14px;">
      ${filtered.length ? filtered.map(a => {
        const r = a.rarity || 'r';
        const safeName = String(a.name).replace(/[<>&"]/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch]));
        const portraitClass = a.image ? 'hero-portrait has-image' : 'hero-portrait';
        const portraitInner = a.image
          ? `<img src="${a.image}" alt="${safeName}" loading="lazy" />`
          : `<span class="glyph">${a.icon||'💎'}</span>`;
        return `
          <div class="hero-card codex-card r-${r}" onclick="equipRoletaArtifact('${a.id}')" title="${(a.effect||'').replace(/"/g,'&quot;')}">
            <div class="${portraitClass}">
              <div class="rays"></div>
              ${portraitInner}
              <span class="hero-rarity-badge ${r}" data-label="${r.toUpperCase()}"></span>
            </div>
            <div class="hero-info">
              <div class="hero-name">${safeName}</div>
            </div>
          </div>
        `;
      }).join('') : `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ink-dim);font-style:italic;">${ui('hero.noneFound') || 'Nenhum artefato encontrado.'}</div>`}
    </div>
  `;
  // Conectar handlers de filtro (mas redirecionar pra função da Roleta)
  setupRoletaModalArtifactFilterHandlers();
}

// Handlers de filtro do modal de artefato (versão Roleta)
function setupRoletaModalArtifactFilterHandlers() {
  const f = _modalArtifactFilter;
  const refresh = () => renderRoletaArtifactPicker();

  const rar = document.getElementById('modalFilter_artifact_rarity');
  if (rar) rar.addEventListener('change', e => { f.rarity = e.target.value; refresh(); });

  const search = document.getElementById('modalFilter_artifact_search');
  if (search) {
    search.addEventListener('input', e => {
      clearTimeout(window._modalRoletaArtSearchTimer);
      window._modalRoletaArtSearchTimer = setTimeout(() => {
        f.search = e.target.value;
        refresh();
        setTimeout(() => {
          const nx = document.getElementById('modalFilter_artifact_search');
          if (nx) { nx.focus(); nx.setSelectionRange(nx.value.length, nx.value.length); }
        }, 0);
      }, 180);
    });
  }
  const clearBtn = document.getElementById('modalFilter_artifact_clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      _modalArtifactFilter = { search: '', rarity: 'todos' };
      refresh();
    });
  }
}

function equipRoletaArtifact(artifactId) {
  const art = CODEX_ARTIFACTS.find(a => a.id === artifactId);
  if (!art) return;
  const { heroId, buildIdx } = _roletaModalCtx;
  if (!heroId || buildIdx < 0) return;
  const key = `${heroId}_${buildIdx}`;
  if (!_roletaBuilds[key]) _roletaBuilds[key] = { artifact: null, cards: [null,null,null,null,null] };
  _roletaBuilds[key].artifact = art;
  closeCodexModal();
  _roletaModalCtx = { heroId: null, buildIdx: -1, slot: -1, tipo: null };
  buzz(20);
  renderRoletaBuilds(heroId);
}

function removeRoletaArtifact(heroId, buildIdx) {
  const key = `${heroId}_${buildIdx}`;
  if (_roletaBuilds[key]) _roletaBuilds[key].artifact = null;
  renderRoletaBuilds(heroId);
}

// ─── Abrir picker de carta (versão Roleta) ───
function openRoletaCardPicker(heroId, buildIdx, slotIdx) {
  _roletaModalCtx = { heroId, buildIdx, slot: slotIdx, tipo: 'card' };
  _modalCardFilter = { search: '', rarity: 'todos' };
  renderRoletaCardPicker();
  document.getElementById('codexModal').classList.add('active');
}

function renderRoletaCardPicker() {
  const heroId = _roletaModalCtx.heroId;
  const buildIdx = _roletaModalCtx.buildIdx;
  const slotAtual = _roletaModalCtx.slot;
  const hero = CODEX_HEROES.find(h => h.id === heroId);
  const heroName = hero ? t(hero, 'name').split(',')[0] : 'Herói';
  const f = _modalCardFilter;

  // ─── Cartas já equipadas nesta build (em OUTROS slots) ───
  // O slot atual continua mostrando todas (pra poder trocar)
  const key = `${heroId}_${buildIdx}`;
  const build = _roletaBuilds[key];
  const cartasJaEquipadas = new Set();
  if (build && build.cards) {
    build.cards.forEach((c, idx) => {
      if (c && idx !== slotAtual) cartasJaEquipadas.add(c.id);
    });
  }

  const RARITY_ORDER = ['ssr','sr','r','n'];
  const filtered = CODEX_CARDS.filter(c => {
    // Remove cartas já equipadas nesta build (em outros slots)
    if (cartasJaEquipadas.has(c.id)) return false;
    if (f.rarity !== 'todos' && c.rarity !== f.rarity) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const nomePt = (c.name || '').toLowerCase();
      const nomeEn = (c.name_en || '').toLowerCase();
      const nomeEs = (c.name_es || '').toLowerCase();
      if (!nomePt.includes(q) && !nomeEn.includes(q) && !nomeEs.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const ar = RARITY_ORDER.indexOf(a.rarity), br = RARITY_ORDER.indexOf(b.rarity);
    if (ar !== br) return ar - br;
    return (t(a,'name') || a.name).localeCompare(t(b,'name') || b.name, getLocale());
  });

  const titleLabel = _lang === 'es' ? `Selecciona una Carta (slot ${slotAtual + 1})` : _lang === 'en' ? `Select a Card (slot ${slotAtual + 1})` : `Selecione uma Carta (slot ${slotAtual + 1})`;
  document.getElementById('codexModalTitle').textContent = `${heroName} (Build ${buildIdx+1}) — ${titleLabel}`;
  document.getElementById('codexModalBody').innerHTML = `
    ${renderModalFilterToolbar('card', f, CODEX_CARDS.length, filtered.length)}
    <div class="artifacts-grid" style="margin-top:14px;">
      ${filtered.length ? filtered.map(c => {
        const r = c.rarity || 'n';
        const cardName = t(c, 'name');
        const safeName = String(cardName).replace(/[<>&"]/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch]));
        const portraitClass = c.image ? 'hero-portrait has-image' : 'hero-portrait';
        const portraitInner = c.image
          ? `<img src="${c.image}" alt="${safeName}" loading="lazy" />`
          : `<span class="glyph">🃏</span>`;
        return `
          <div class="hero-card codex-card r-${r}" onclick="equipRoletaCard('${c.id}')" title="${(t(c,'effect')||'').replace(/"/g,'&quot;')}">
            <div class="${portraitClass}">
              <div class="rays"></div>
              ${portraitInner}
              <span class="hero-rarity-badge ${r}" data-label="${r.toUpperCase()}"></span>
            </div>
            <div class="hero-info">
              <div class="hero-name">${safeName}</div>
            </div>
          </div>
        `;
      }).join('') : `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ink-dim);font-style:italic;">${ui('hero.noneFound') || 'Nenhuma carta encontrada.'}</div>`}
    </div>
  `;
  // Conectar handlers de filtro (redirecionando pra função da Roleta)
  setupRoletaModalCardFilterHandlers();
}

function setupRoletaModalCardFilterHandlers() {
  const f = _modalCardFilter;
  const refresh = () => renderRoletaCardPicker();

  const rar = document.getElementById('modalFilter_card_rarity');
  if (rar) rar.addEventListener('change', e => { f.rarity = e.target.value; refresh(); });

  const search = document.getElementById('modalFilter_card_search');
  if (search) {
    search.addEventListener('input', e => {
      clearTimeout(window._modalRoletaCardSearchTimer);
      window._modalRoletaCardSearchTimer = setTimeout(() => {
        f.search = e.target.value;
        refresh();
        setTimeout(() => {
          const nx = document.getElementById('modalFilter_card_search');
          if (nx) { nx.focus(); nx.setSelectionRange(nx.value.length, nx.value.length); }
        }, 0);
      }, 180);
    });
  }
  const clearBtn = document.getElementById('modalFilter_card_clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      _modalCardFilter = { search: '', rarity: 'todos' };
      refresh();
    });
  }
}

function equipRoletaCard(cardId) {
  const card = CODEX_CARDS.find(c => c.id === cardId);
  if (!card) return;
  const { heroId, buildIdx, slot } = _roletaModalCtx;
  if (!heroId || buildIdx < 0 || slot < 0) return;
  const key = `${heroId}_${buildIdx}`;
  if (!_roletaBuilds[key]) _roletaBuilds[key] = { artifact: null, cards: [null,null,null,null,null] };
  _roletaBuilds[key].cards[slot] = card;
  closeCodexModal();
  _roletaModalCtx = { heroId: null, buildIdx: -1, slot: -1, tipo: null };
  buzz(20);
  renderRoletaBuilds(heroId);
}

function removeRoletaCard(heroId, buildIdx, slotIdx) {
  const key = `${heroId}_${buildIdx}`;
  if (_roletaBuilds[key]) _roletaBuilds[key].cards[slotIdx] = null;
  renderRoletaBuilds(heroId);
}

// ─── Próximo Cavaleiro / Pular ───
function nextKnight() {
  if (_roletaPageResultado !== null) {
    // Marca como sorteado (não volta na roleta)
    _spinState.sorteados.add(_roletaPageResultado);
    _roletaPageResultado = null;
  }
  document.getElementById('rolPageResult').style.display = 'none';
  updateRoletaPageProgress();
  renderRoletaPagePreview();
  // Auto-sortear próximo
  if (getRoletaAvailableHeroes().length > 0) {
    setTimeout(() => { startSpinPage(); }, 400);
  } else {
    toast({ msg: ui('spin.allDone'), type: 'info' });
  }
}

function skipPageCurrent() {
  if (_roletaPageResultado !== null) {
    // Marca como pulado (também conta como já sorteado pra não voltar)
    _spinState.pulados.add(_roletaPageResultado);
    _spinState.sorteados.add(_roletaPageResultado);
    _roletaPageResultado = null;
  }
  document.getElementById('rolPageResult').style.display = 'none';
  updateRoletaPageProgress();
  if (getRoletaAvailableHeroes().length > 0) {
    setTimeout(() => { startSpinPage(); }, 400);
  }
}

// ─── Picker pra escolher cavaleiro MANUALMENTE (sem girar) ───
function openManualHeroPicker() {
  if (_roletaPageGirando) return;
  // Reaproveita contexto pra dizer "estou em modo manual"
  _roletaModalCtx = { heroId: null, buildIdx: -1, slot: -1, tipo: 'manual' };
  _modalHeroFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };
  renderManualHeroPicker();
  document.getElementById('codexModal').classList.add('active');
}

function renderManualHeroPicker() {
  const f = _modalHeroFilter;

  // Cavaleiros disponíveis = todos - já sorteados (sem aplicar os filtros da roleta)
  const filtered = CODEX_HEROES.filter(h => {
    if (_spinState.sorteados.has(h.id)) return false;
    if (f.rarity !== 'todos' && h.rarity !== f.rarity) return false;
    if (f.faction !== 'todos' && h.faction !== f.faction) return false;
    if (f.class !== 'todos' && h.class !== f.class) return false;
    if (f.position !== 'todos' && h.position !== f.position) return false;
    if (f.damage !== 'todos' && h.damage !== f.damage) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const nomePt = (h.name || '').toLowerCase();
      const nomeEn = (h.name_en || '').toLowerCase();
      const nomeEs = (h.name_es || '').toLowerCase();
      if (!nomePt.includes(q) && !nomeEn.includes(q) && !nomeEs.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const order = {ur:0, ssr:1, sr:2, r:3, n:4};
    const ar = order[a.rarity] ?? 9, br = order[b.rarity] ?? 9;
    if (ar !== br) return ar - br;
    return (t(a,'name') || a.name).localeCompare(t(b,'name') || b.name, getLocale());
  });

  document.getElementById('codexModalTitle').textContent = ui('spin.manualPickerTitle') || '🎯 Escolha o Cavaleiro Manualmente';
  document.getElementById('codexModalBody').innerHTML = `
    ${renderModalFilterToolbar('hero', f, CODEX_HEROES.length, filtered.length)}
    <div class="heroes-grid" style="margin-top:14px;">
      ${filtered.length ? filtered.map(h => heroCardHTML(h, `onclick="selectHeroManually(${h.id})"`)).join('')
        : `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ink-dim);font-style:italic;">${ui('team.noHeroFilter') || 'Nenhum cavaleiro encontrado.'}</div>`}
    </div>
  `;
  setupManualHeroFilterHandlers();
}

function setupManualHeroFilterHandlers() {
  const f = _modalHeroFilter;
  const refresh = () => renderManualHeroPicker();

  ['rarity','faction','class','position','damage'].forEach(k => {
    const el = document.getElementById('modalFilter_hero_' + k);
    if (el) el.addEventListener('change', e => { f[k] = e.target.value; refresh(); });
  });

  const search = document.getElementById('modalFilter_hero_search');
  if (search) {
    search.addEventListener('input', e => {
      clearTimeout(window._manualHeroSearchTimer);
      window._manualHeroSearchTimer = setTimeout(() => {
        f.search = e.target.value;
        refresh();
        setTimeout(() => {
          const nx = document.getElementById('modalFilter_hero_search');
          if (nx) { nx.focus(); nx.setSelectionRange(nx.value.length, nx.value.length); }
        }, 0);
      }, 180);
    });
  }
  const clearBtn = document.getElementById('modalFilter_hero_clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      _modalHeroFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };
      refresh();
    });
  }
}

function selectHeroManually(heroId) {
  const hero = CODEX_HEROES.find(h => h.id === heroId);
  if (!hero) return;
  closeCodexModal();
  _roletaModalCtx = { heroId: null, buildIdx: -1, slot: -1, tipo: null };
  // Define o resultado e mostra como se tivesse sido sorteado (sem animação)
  _roletaPageResultado = heroId;
  buzz(20);
  showRoletaPageResult(hero);
  updateRoletaPageProgress();
}

function resetSpinPagePool() {
  if (_spinState.sorteados.size === 0 && Object.keys(_roletaBuilds).length === 0) return;
  if (!confirm(ui('spin.confirmReset'))) return;
  _spinState.sorteados.clear();
  _spinState.pulados.clear();
  _roletaPageResultado = null;
  _roletaBuilds = {};  // Limpa também as builds armazenadas
  document.getElementById('rolPageResult').style.display = 'none';
  updateRoletaPageProgress();
  renderRoletaPagePreview();
  toast({ msg: ui('spin.resetDone'), type: 'info' });
}

// ════ Export/Import (reusa o mesmo modal de share do team builder) ════
function exportTierList() {
  const total = getTierUsedIds().size;
  if (total === 0) {
    toast({ msg: ui('tier.addBeforeShare'), type: 'warn' });
    return;
  }
  // Estrutura: { v:1, t: 'tier', S: [ids], A: [ids], ... }
  const data = { v: 1, t: 'tier' };
  TIER_LIST_LEVELS.forEach(lv => data[lv] = _tierState[lv] || []);
  const code = encodeTeamData(data); // reusa a função do team builder
  const url = buildShareUrl(code);

  // Abre o modal de share com aba export
  document.getElementById('shareLinkInput').value = url;
  document.getElementById('shareSummary').innerHTML = `
    <strong>🎖 Tier List</strong><br>
    ${TIER_LIST_LEVELS.map(t => `<strong>${t}:</strong> ${(_tierState[t]||[]).length}`).join(' · ')}<br>
    <em>Total: ${total} cavaleiros</em>
  `;
  // Limpa import
  const imp = document.getElementById('shareImportInput');
  if (imp) imp.value = '';
  switchShareTab('export');
  // Marca como tier (pra import saber)
  document.getElementById('shareModal').dataset.context = 'tier';
  document.getElementById('shareModal').classList.add('active');
}

function openTierImportModal() {
  const expInput = document.getElementById('shareLinkInput');
  if (expInput) expInput.value = '';
  const summary = document.getElementById('shareSummary');
  if (summary) summary.innerHTML = `<em>${ui('tier.pasteCode')}</em>`;
  const imp = document.getElementById('shareImportInput');
  if (imp) imp.value = '';
  switchShareTab('import');
  document.getElementById('shareModal').dataset.context = 'tier';
  document.getElementById('shareModal').classList.add('active');
  setTimeout(() => { if (imp) imp.focus(); }, 100);
}

function loadTierFromCode(code) {
  const data = decodeTeamData(code);
  if (!data || data.t !== 'tier') {
    return false; // não é tier list, deixa o team builder lidar
  }
  // Reset
  _tierState = {};
  TIER_LIST_LEVELS.forEach(t => {
    _tierState[t] = Array.isArray(data[t]) ? data[t].filter(id => CODEX_HEROES.find(h => h.id === id)) : [];
  });
  saveTierState();
  closeShareModal();
  // Se a aba tier estiver visível, re-renderiza; senão, da próxima vez que abrir
  if (document.getElementById('tab-tier').classList.contains('active')) {
    renderTierAll();
  }
  toast({ title: '✓ Tier list importada!', msg: `${getTierUsedIds().size} cavaleiros carregados`, type: 'success' });
  return true;
}

// ═══════════════════════════════════════════════════
// 🗳 VOTAÇÃO COMUNITÁRIA
// Admin abre votação de cavaleiro → todos votam S/A/B/C/D
// Polling a cada 5s pra atualizar resultados em tempo real
// ═══════════════════════════════════════════════════
const VOTE_STORAGE_VOTER_ID = 'triade_voter_id';
const VOTE_STORAGE_LAST_VOTE = 'triade_last_vote';
let _voteState = { active: false, heroId: null, heroName: null, results: null, total: 0, youtubeUrl: '' };
let _votePollInterval = null;
let _voteAdminPanelVisible = false;
let _voteInit = false;

// Gera/lê voter ID único (anônimo) por navegador
function getVoterId() {
  let id = localStorage.getItem(VOTE_STORAGE_VOTER_ID);
  if (!id) {
    id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(VOTE_STORAGE_VOTER_ID, id); } catch(_) {}
  }
  return id;
}

// Extrai ID do vídeo do YouTube de várias formas de URL
function extractYoutubeId(url) {
  if (!url) return '';
  url = String(url).trim();
  // Se for só o ID (11 chars alfanuméricos)
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  // youtube.com/watch?v=ID
  let m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  // youtu.be/ID
  m = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  // youtube.com/live/ID
  m = url.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  // youtube.com/embed/ID
  m = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  // shorts
  m = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  return '';
}

function initVoteTab() {
  // Detecta modo stream (?modo=stream)
  if (location.search.indexOf('modo=stream') !== -1) {
    document.body.classList.add('stream-mode');
  }

  if (_voteInit) {
    loadVoteState();
    return;
  }
  _voteInit = true;

  // Hookups
  document.getElementById('voteAdminToggle').addEventListener('click', () => toggleVoteAdmin());
  document.getElementById('voteAdminClose').addEventListener('click', () => toggleVoteAdmin(false));
  document.getElementById('voteOpenBtn').addEventListener('click', voteOpenSubmit);
  document.getElementById('voteCloseBtn').addEventListener('click', voteCloseSubmit);
  document.getElementById('voteCancelBtn').addEventListener('click', voteCancelSubmit);
  document.getElementById('voteSaveYoutube').addEventListener('click', voteSaveYoutubeSubmit);
  document.getElementById('voteHeroPickerBtn').addEventListener('click', openVoteHeroPicker);

  // Botões de votar
  document.querySelectorAll('.vote-tier-btn').forEach(btn => {
    btn.addEventListener('click', () => castVote(btn.dataset.tier));
  });

  // Carrega estado + inicia polling
  loadVoteState();
  startVotePolling();
}

function startVotePolling() {
  if (_votePollInterval) clearInterval(_votePollInterval);
  // Em modo stream, polling mais frequente (3s) pra ficar bem responsivo na live
  const interval = document.body.classList.contains('stream-mode') ? 3000 : 5000;
  _votePollInterval = setInterval(loadVoteState, interval);
}

function stopVotePolling() {
  if (_votePollInterval) {
    clearInterval(_votePollInterval);
    _votePollInterval = null;
  }
}

async function loadVoteState() {
  try {
    const res = await fetch(API_URL + '?action=votacao&t=' + Date.now());
    const data = await res.json();
    if (!data.ok) return;

    _voteState.youtubeUrl = data.youtubeUrl || '';

    // Detecta se foi auto-fechada pelo timer
    if (data.autoFechado && data.ultimaVotacao) {
      const u = data.ultimaVotacao;
      toast({
        title: `⏱ Votação encerrada — ${u.heroName}`,
        msg: `${u.total} votos · Vencedora: ${u.vencedora}`,
        type: 'success',
        duration: 7000
      });
      buzz(60);
    }

    if (data.ativa) {
      const wasActive = _voteState.active;
      _voteState.active = true;
      _voteState.heroId = data.heroId;
      _voteState.heroName = data.heroName;
      _voteState.results = data.resultados;
      _voteState.total = data.total;
      _voteState.fechaEmTs = Number(data.fechaEmTs || 0);
    } else {
      _voteState.active = false;
      _voteState.fechaEmTs = 0;
    }

    renderVote();
  } catch(_) {}
}

// Tick do countdown (atualiza a cada segundo, independente do polling)
let _voteCountdownInterval = null;
function startCountdownTick() {
  stopCountdownTick();
  _voteCountdownInterval = setInterval(updateCountdownDisplay, 1000);
  updateCountdownDisplay();
}
function stopCountdownTick() {
  if (_voteCountdownInterval) {
    clearInterval(_voteCountdownInterval);
    _voteCountdownInterval = null;
  }
}
function updateCountdownDisplay() {
  const el = document.getElementById('voteCountdown');
  if (!el) return;
  if (!_voteState.active || !_voteState.fechaEmTs) {
    el.style.display = 'none';
    return;
  }
  const diff = _voteState.fechaEmTs - Date.now();
  if (diff <= 0) {
    el.style.display = 'block';
    el.className = 'vote-countdown critical';
    el.innerHTML = `
      <div class="vote-countdown-label">⏱ Encerrando</div>
      <div class="vote-countdown-time">00:00</div>
    `;
    // Próximo polling vai detectar auto-fechamento
    return;
  }
  const totalSec = Math.ceil(diff / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const txt = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');

  let cls = 'vote-countdown';
  if (totalSec <= 10) cls += ' critical';
  else if (totalSec <= 30) cls += ' warning';

  el.style.display = 'block';
  el.className = cls;
  el.innerHTML = `
    <div class="vote-countdown-label">⏱ Tempo restante</div>
    <div class="vote-countdown-time">${txt}</div>
  `;
}

function renderVote() {
  const idle = document.getElementById('voteIdle');
  const active = document.getElementById('voteActive');

  if (!_voteState.active) {
    idle.style.display = 'block';
    active.style.display = 'none';
    // Atualiza painel admin (se aberto, mostra "abrir")
    document.getElementById('voteAdminOpenSection').style.display = '';
    document.getElementById('voteAdminCloseSection').style.display = 'none';
    stopCountdownTick();
    const cd = document.getElementById('voteCountdown');
    if (cd) cd.style.display = 'none';
    return;
  }

  idle.style.display = 'none';
  active.style.display = 'grid';

  // Liga ou desliga o tick do countdown conforme tem timer
  if (_voteState.fechaEmTs && _voteState.fechaEmTs > 0) {
    startCountdownTick();
  } else {
    stopCountdownTick();
    const cd = document.getElementById('voteCountdown');
    if (cd) cd.style.display = 'none';
  }

  // Vídeo embedado
  const videoCol = document.getElementById('voteVideoCol');
  const ytId = extractYoutubeId(_voteState.youtubeUrl);
  if (ytId) {
    // Verifica se já está renderizado pra não recarregar o vídeo
    if (!videoCol.dataset.ytId || videoCol.dataset.ytId !== ytId) {
      videoCol.dataset.ytId = ytId;
      videoCol.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytId}?autoplay=0&rel=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }
  } else {
    videoCol.dataset.ytId = '';
    videoCol.innerHTML = `<div class="vote-video-empty">📺 ${ui('vote.noVideo')}<br><small>${ui('vote.noVideoHint')}</small></div>`;
  }

  // Card do herói
  const hero = CODEX_HEROES.find(h => h.id === _voteState.heroId);
  const heroCard = document.getElementById('voteHeroCard');
  if (hero) {
    heroCard.innerHTML = `
      ${hero.image ? `<img src="${hero.image}" alt="${escapeHtml(hero.name)}">` : ''}
      <div class="vote-hero-name">${escapeHtml(hero.name)}</div>
    `;
  } else {
    heroCard.innerHTML = `<div class="vote-hero-name">${escapeHtml(_voteState.heroName)}</div>`;
  }

  // Voto já dado?
  let lastVote = null;
  try {
    const stored = JSON.parse(localStorage.getItem(VOTE_STORAGE_LAST_VOTE) || '{}');
    if (stored.heroId === _voteState.heroId) lastVote = stored.tier;
  } catch(_) {}

  document.querySelectorAll('.vote-tier-btn').forEach(btn => {
    btn.classList.toggle('voted', btn.dataset.tier === lastVote);
  });

  const status = document.getElementById('voteStatus');
  if (lastVote) {
    status.innerHTML = `✓ ${ui('vote.yourVote')}: <strong>${lastVote}</strong> · ${ui('vote.canChange')}`;
    status.classList.remove('muted');
  } else {
    status.innerHTML = 'Clique numa tier pra votar';
    status.classList.add('muted');
  }

  // Resultados
  renderVoteResults();

  // Painel admin (se aberto)
  document.getElementById('voteAdminOpenSection').style.display = 'none';
  document.getElementById('voteAdminCloseSection').style.display = '';
  document.getElementById('voteAdminActiveInfo').textContent = `${_voteState.heroName} — ${_voteState.total} voto(s)`;
}

function renderVoteResults() {
  const cont = document.getElementById('voteResults');
  if (!cont || !_voteState.results) return;

  const order = ['S','A','B','C','D'];
  const total = _voteState.total;
  const maxVotes = Math.max(1, ...order.map(t => _voteState.results[t] || 0));

  cont.innerHTML = `
    <div class="vote-results-header">
      <span>📊 Resultado parcial</span>
      <span class="vote-results-total">${total} voto${total !== 1 ? 's' : ''}</span>
    </div>
    ${order.map(t => {
      const count = _voteState.results[t] || 0;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      const widthPct = total > 0 ? (count / maxVotes) * 100 : 0;
      return `
        <div class="vote-result-row">
          <span class="vote-result-label tier-${t}">${t}</span>
          <div class="vote-result-bar-wrap">
            <div class="vote-result-bar tier-${t}" style="width:${widthPct}%;"></div>
          </div>
          <span class="vote-result-count">${count} (${pct}%)</span>
        </div>
      `;
    }).join('')}
  `;
}

async function castVote(tier) {
  if (!_voteState.active || !tier) return;
  const heroId = _voteState.heroId;
  const voterId = getVoterId();

  // Otimismo: atualiza UI antes da resposta
  document.querySelectorAll('.vote-tier-btn').forEach(btn => {
    btn.classList.toggle('voted', btn.dataset.tier === tier);
  });
  buzz(30);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'votar', heroId: heroId, tier: tier, voterId: voterId })
    });
    const data = await res.json();
    if (data.ok) {
      try {
        localStorage.setItem(VOTE_STORAGE_LAST_VOTE, JSON.stringify({heroId: heroId, tier: tier}));
      } catch(_) {}
      // Recarrega imediatamente pra ver o resultado novo
      loadVoteState();
    } else {
      toast({ msg: data.error || 'Erro ao votar', type: 'error' });
    }
  } catch(err) {
    toast({ msg: ui('msg.connError'), type: 'error' });
  }
}

function toggleVoteAdmin(force) {
  const panel = document.getElementById('voteAdminPanel');
  const show = (force === undefined) ? panel.style.display === 'none' : force;
  panel.style.display = show ? 'block' : 'none';
  _voteAdminPanelVisible = show;
  if (show) {
    // Pré-carrega URL do YouTube no input
    document.getElementById('voteYoutubeUrl').value = _voteState.youtubeUrl || '';
  }
}

// Cavaleiro escolhido pelo admin pra abrir votação
let _voteSelectedHeroId = null;

// Abre modal de seleção do cavaleiro (igual ao do team builder)
function openVoteHeroPicker() {
  // Estado do filtro (próprio dessa busca)
  if (!window._voteHeroFilter) {
    window._voteHeroFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };
  }
  const f = window._voteHeroFilter;

  // Filtra a lista
  const list = CODEX_HEROES.filter(h => {
    if (f.rarity !== 'todos' && h.rarity !== f.rarity) return false;
    if (f.faction !== 'todos' && h.faction !== f.faction) return false;
    if (f.class !== 'todos' && h.class !== f.class) return false;
    if (f.position !== 'todos' && h.position !== f.position) return false;
    if (f.damage !== 'todos' && h.damage !== f.damage) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!h.name.toLowerCase().includes(q) && !(h.title||'').toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const order = {ur:0, ssr:1, sr:2, r:3, n:4};
    const ar = order[a.rarity] ?? 9, br = order[b.rarity] ?? 9;
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  // Helper pra montar option de select
  const optionsHtml = (obj, allLabel = ui('filter.allMasc'), currentVal = 'todos') => {
    return `<option value="todos"${currentVal === 'todos' ? ' selected' : ''}>${allLabel}</option>` +
      Object.entries(obj).map(([k, v]) =>
        `<option value="${k}"${currentVal === k ? ' selected' : ''}>${v.icon || ''} ${t(v,'name') || k.toUpperCase()}</option>`
      ).join('');
  };

  document.getElementById('codexModalTitle').textContent = ui('vote.pickHero');
  document.getElementById('codexModalBody').innerHTML = `
    <div class="team-pool-toolbar" style="margin-bottom:14px;">
      <div class="team-pool-filters">
        <div class="team-filter-item">
          <label>${ui('filter.rarity')}</label>
          <select id="voteFilterRarity">
            <option value="todos"${f.rarity === 'todos' ? ' selected' : ''}>${ui('filter.allFem')}</option>
            ${['ur','ssr','sr','r'].map(r => `<option value="${r}"${f.rarity === r ? ' selected' : ''}>${r.toUpperCase()}</option>`).join('')}
          </select>
        </div>
        <div class="team-filter-item">
          <label>${ui('filter.faction')}</label>
          <select id="voteFilterFaction">${optionsHtml(CODEX_FACTIONS, ui('filter.allFem'), f.faction)}</select>
        </div>
        <div class="team-filter-item">
          <label>${ui('filter.class')}</label>
          <select id="voteFilterClass">${optionsHtml(CODEX_CLASSES, ui('filter.allFem'), f.class)}</select>
        </div>
        <div class="team-filter-item">
          <label>${ui('filter.position')}</label>
          <select id="voteFilterPosition">${optionsHtml(CODEX_POSITIONS, ui('filter.allFem'), f.position)}</select>
        </div>
        <div class="team-filter-item">
          <label>${ui('filter.damage')}</label>
          <select id="voteFilterDamage">${optionsHtml(CODEX_DAMAGE, ui('filter.allMasc'), f.damage)}</select>
        </div>
        <div class="team-filter-item team-filter-search">
          <label>${ui('filter.search')}</label>
          <input type="text" id="voteFilterSearch" placeholder="${ui('filter.searchPlaceholder')}" value="${escapeHtml(f.search || '')}">
        </div>
        <button class="team-filter-clear" id="voteFilterClear" title="${ui('filter.clearTitle')}">${ui('filter.clear')}</button>
      </div>
    </div>
    <div style="margin-bottom:10px;font-family:'JetBrains Mono',monospace;font-size:.8rem;color:var(--ink-dim);text-align:right;">
      ${list.length} ${ui('hero.of')} ${CODEX_HEROES.length} ${ui('hero.heroes')}
    </div>
    <div class="heroes-grid" id="voteHeroPickerGrid">
      ${list.length === 0
        ? `<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--ink-dim);font-style:italic;">${ui('vote.noHero')}</div>`
        : list.map(h => heroCardHTML(h, `onclick="selectVoteHero(${h.id})"`)).join('')
      }
    </div>
  `;

  // Re-hookup dos filtros do modal
  const rerenderModal = () => openVoteHeroPicker();

  document.getElementById('voteFilterRarity').addEventListener('change', e => { f.rarity = e.target.value; rerenderModal(); });
  document.getElementById('voteFilterFaction').addEventListener('change', e => { f.faction = e.target.value; rerenderModal(); });
  document.getElementById('voteFilterClass').addEventListener('change', e => { f.class = e.target.value; rerenderModal(); });
  document.getElementById('voteFilterPosition').addEventListener('change', e => { f.position = e.target.value; rerenderModal(); });
  document.getElementById('voteFilterDamage').addEventListener('change', e => { f.damage = e.target.value; rerenderModal(); });

  const searchInput = document.getElementById('voteFilterSearch');
  searchInput.addEventListener('input', e => {
    clearTimeout(window._voteFilterSearchTimer);
    window._voteFilterSearchTimer = setTimeout(() => {
      f.search = e.target.value;
      rerenderModal();
      // Re-foca depois do re-render
      setTimeout(() => {
        const newInput = document.getElementById('voteFilterSearch');
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(newInput.value.length, newInput.value.length);
        }
      }, 0);
    }, 200);
  });

  document.getElementById('voteFilterClear').addEventListener('click', () => {
    window._voteHeroFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };
    rerenderModal();
  });

  document.getElementById('codexModal').classList.add('active');
}

// Quando admin clica num herói no modal
function selectVoteHero(heroId) {
  const h = CODEX_HEROES.find(x => x.id === heroId);
  if (!h) return;
  _voteSelectedHeroId = heroId;
  const label = document.getElementById('voteHeroPickerLabel');
  if (label) {
    label.textContent = `${h.rarity.toUpperCase()} · ${h.name}`;
    label.classList.add('has-hero');
  }
  closeCodexModal();
}

async function voteOpenSubmit() {
  const senha = document.getElementById('voteAdminSenha').value;
  const heroId = _voteSelectedHeroId;
  const duracaoInput = document.getElementById('voteDuration');
  const duracao = duracaoInput ? (parseInt(duracaoInput.value) || 0) : 0;
  
  if (!senha) { toast({ msg: 'Informe a senha', type: 'warn' }); return; }
  if (!heroId) { toast({ msg: 'Escolha um cavaleiro', type: 'warn' }); return; }
  const hero = CODEX_HEROES.find(h => h.id === heroId);
  if (!hero) { toast({ msg: ui('msg.invalidKnight'), type: 'error' }); return; }

  const btn = document.getElementById('voteOpenBtn');
  setButtonLoading(btn, true, 'Abrindo...');

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'abrirVotacao', senha, heroId, heroName: hero.name, duracao })
    });
    const data = await res.json();
    if (data.ok) {
      const msgTimer = duracao > 0 ? ` · ⏱ ${duracao} min` : '';
      toast({ title: '🗳 Votação aberta!', msg: hero.name + msgTimer, type: 'success' });
      // Reset do picker e duração
      _voteSelectedHeroId = null;
      const label = document.getElementById('voteHeroPickerLabel');
      if (label) {
        label.textContent = 'Escolher cavaleiro...';
        label.classList.remove('has-hero');
      }
      if (duracaoInput) duracaoInput.value = '';
      loadVoteState();
    } else {
      toast({ msg: data.error || 'Erro', type: 'error' });
    }
  } catch(err) {
    toast({ msg: ui('msg.connError'), type: 'error' });
  } finally {
    setButtonLoading(btn, false);
  }
}

async function voteCloseSubmit() {
  const senha = document.getElementById('voteAdminSenha').value;
  if (!senha) { toast({ msg: 'Informe a senha', type: 'warn' }); return; }
  if (!confirm(ui('vote.confirmClose'))) return;

  const btn = document.getElementById('voteCloseBtn');
  setButtonLoading(btn, true, 'Fechando...');

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'fecharVotacao', senha })
    });
    const data = await res.json();
    if (data.ok) {
      toast({
        title: `🏆 Votação fechada — ${data.heroName}`,
        msg: `${data.total} votos · Vencedora: ${data.vencedora}`,
        type: 'success',
        duration: 6000
      });
      loadVoteState();
    } else {
      toast({ msg: data.error || 'Erro', type: 'error' });
    }
  } catch(err) {
    toast({ msg: ui('msg.connError'), type: 'error' });
  } finally {
    setButtonLoading(btn, false);
  }
}

async function voteCancelSubmit() {
  const senha = document.getElementById('voteAdminSenha').value;
  if (!senha) { toast({ msg: 'Informe a senha', type: 'warn' }); return; }
  if (!confirm(ui('vote.confirmCancel'))) return;

  const btn = document.getElementById('voteCancelBtn');
  setButtonLoading(btn, true, 'Cancelando...');

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'cancelarVotacao', senha })
    });
    const data = await res.json();
    if (data.ok) {
      toast({
        title: '❌ Votação cancelada',
        msg: `${data.heroName} — votos descartados`,
        type: 'warn',
        duration: 5000
      });
      loadVoteState();
    } else {
      toast({ msg: data.error || 'Erro', type: 'error' });
    }
  } catch(err) {
    toast({ msg: ui('msg.connError'), type: 'error' });
  } finally {
    setButtonLoading(btn, false);
  }
}

async function voteSaveYoutubeSubmit() {
  const senha = document.getElementById('voteAdminSenha').value;
  const youtubeUrl = document.getElementById('voteYoutubeUrl').value.trim();
  if (!senha) { toast({ msg: 'Informe a senha', type: 'warn' }); return; }

  const btn = document.getElementById('voteSaveYoutube');
  setButtonLoading(btn, true, 'Salvando...');

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'configCanal', senha, youtubeUrl })
    });
    const data = await res.json();
    if (data.ok) {
      toast({ msg: '✓ URL do YouTube salva!', type: 'success' });
      _voteState.youtubeUrl = youtubeUrl;
      renderVote();
    } else {
      toast({ msg: data.error || 'Erro', type: 'error' });
    }
  } catch(err) {
    toast({ msg: ui('msg.connError'), type: 'error' });
  } finally {
    setButtonLoading(btn, false);
  }
}

// ═══════ TEAM BUILDER ═══════
// Equipe: grade 3x3 (índices 0-8) + 2 suportes (slot extra, aceita qualquer cavaleiro)
// Restrições: máximo 5 cavaleiros na grade, máximo 2 suportes, máximo 3 por coluna,
//             cavaleiro só pode ser colocado em slot da SUA posição (na grade)
//             slot de suporte aceita QUALQUER cavaleiro (é apenas um slot extra)
let codexTeamMain = [null, null, null, null, null, null, null, null, null]; // 9 slots
let codexTeamSupport = [null, null];
let codexModalSlot = -1;
let codexModalGroup = 'main';

// Filtros da pool do team builder
let teamPoolFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };

const MAX_CAVALEIROS = 5;
const MAX_SUPORTES = 2;
const MAX_POR_COLUNA = 3;

const POSITION_TO_COL = { tras: 0, meio: 1, frente: 2 };
// COL_NAMES agora é função pra refletir idioma atual
function getColName(col) {
  if (col === 0) return ui('team.back');
  if (col === 1) return ui('team.middle');
  return ui('team.front');
}

function getSlotColumn(slotIdx) { return slotIdx % 3; }
function countCavaleiros() { return codexTeamMain.filter(h => h).length; }
function countSuportes() { return codexTeamSupport.filter(h => h).length; }
function countCol(col) {
  let n = 0;
  for (let row = 0; row < 3; row++) {
    if (codexTeamMain[row * 3 + col]) n++;
  }
  return n;
}

function initTeamTab() {
  const pool = document.getElementById('teamPoolGrid');
  const clearBtn = document.getElementById('teamClearBtn');
  if (!pool || pool.dataset.init) return;
  pool.dataset.init = '1';

  // Inicializar filtros da pool
  initTeamPoolFilters();

  // ── Múltiplos times: carrega do localStorage e aplica o ativo ──
  loadSavedTeamsFromStorage();
  _suspendTeamAutosave = true;
  const activeEncoded = savedTeams[activeTeamIdx] ? savedTeams[activeTeamIdx].encoded : '';
  if (activeEncoded) {
    const data = decodeTeamData(activeEncoded);
    applyTeamData(data || {});
  }
  _suspendTeamAutosave = false;

  clearBtn.addEventListener('click', () => {
    // Limpa apenas o time ativo (os outros nas outras abas permanecem)
    codexTeamMain = [null, null, null, null, null, null, null, null, null];
    codexTeamSupport = [null, null];
    heroArtifacts = {};
    heroCards = {};
    renderTeamSlotsUI(); // dispara autosave que persiste o time ativo vazio
  });
  renderTeamSlotsUI();
  renderTeamPool();
  renderTeamTabs();
}

// === FILTROS DA POOL DO TEAM BUILDER (selects) ===
function initTeamPoolFilters() {
  const sels = {
    rarity:   document.getElementById('teamFilterRarity'),
    faction:  document.getElementById('teamFilterFaction'),
    class:    document.getElementById('teamFilterClass'),
    position: document.getElementById('teamFilterPosition'),
    damage:   document.getElementById('teamFilterDamage')
  };
  const search = document.getElementById('teamSearch');
  const clearBtn = document.getElementById('teamFiltersClear');
  if (!sels.rarity) return;

  // Popular selects
  const populate = (sel, options, allKey = 'filter.allFem') => {
    sel.innerHTML = `<option value="todos">${ui(allKey)}</option>` +
      Object.entries(options).map(([k, v]) => `<option value="${k}">${v.icon||''} ${t(v,'name')||k.toUpperCase()}</option>`).join('');
    sel.addEventListener('change', () => {
      const key = sel.id.replace('teamFilter', '').toLowerCase();
      teamPoolFilter[key] = sel.value;
      renderTeamPool();
    });
  };

  // Raridades em ordem fixa
  sels.rarity.innerHTML = `<option value="todos">${ui('filter.allFem')}</option>` +
    ['ur','ssr','sr','r'].map(r => `<option value="${r}">${r.toUpperCase()}</option>`).join('');
  sels.rarity.addEventListener('change', () => {
    teamPoolFilter.rarity = sels.rarity.value;
    renderTeamPool();
  });

  populate(sels.faction, CODEX_FACTIONS, 'filter.allFem');
  populate(sels.class, CODEX_CLASSES, 'filter.allFem');
  populate(sels.position, CODEX_POSITIONS, 'filter.allFem');
  populate(sels.damage, CODEX_DAMAGE, 'filter.allMasc');

  if (search) {
    search.addEventListener('input', e => {
      clearTimeout(window._teamSearchTimer);
      window._teamSearchTimer = setTimeout(() => {
        teamPoolFilter.search = e.target.value;
        renderTeamPool();
      }, 180);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      teamPoolFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };
      Object.values(sels).forEach(s => s.value = 'todos');
      if (search) search.value = '';
      renderTeamPool();
    });
  }
}

function getFilteredTeamPool() {
  return CODEX_HEROES.filter(h => {
    if (teamPoolFilter.rarity !== 'todos' && h.rarity !== teamPoolFilter.rarity) return false;
    if (teamPoolFilter.faction !== 'todos' && h.faction !== teamPoolFilter.faction) return false;
    if (teamPoolFilter.class !== 'todos' && h.class !== teamPoolFilter.class) return false;
    if (teamPoolFilter.position !== 'todos' && h.position !== teamPoolFilter.position) return false;
    if (teamPoolFilter.damage !== 'todos' && h.damage !== teamPoolFilter.damage) return false;
    if (teamPoolFilter.search) {
      const q = teamPoolFilter.search.toLowerCase();
      if (!h.name.toLowerCase().includes(q) && !(h.title||'').toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function renderTeamPool() {
  const pool = document.getElementById('teamPoolGrid');
  const count = document.getElementById('teamPoolCount');
  if (!pool) return;
  const list = getFilteredTeamPool();
  if (count) count.textContent = `${list.length} ${ui('hero.of')} ${CODEX_HEROES.length} ${ui('hero.heroes')}`;
  if (list.length === 0) {
    pool.innerHTML = `<div style="padding:40px 20px;color:var(--ink-dim);font-style:italic;width:100%;text-align:center;">${ui('team.noHeroFilter')}</div>`;
    return;
  }
  const usedIds = getUsedIds();
  pool.innerHTML = list.map(h => {
    const isUsed = usedIds.includes(h.id);
    const card = heroCardHTML(h, `onclick="quickAddToTeam(${h.id})"`);
    const usedClass = isUsed ? ' team-pool-used' : '';
    const dragAttr = isUsed ? 'draggable="false"' : 'draggable="true"';
    return card.replace('<div class="hero-card', `<div ${dragAttr} data-hero-id="${h.id}" class="hero-card${usedClass}`);
  }).join('');

  pool.querySelectorAll('.hero-card[draggable="true"]').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      const id = card.dataset.heroId;
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'copy';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
}

function buildSlotHTML(h, i, group) {
  let tag, allowedPositionLabel;
  if (group === 'support') {
    tag = ui('team.support');
    allowedPositionLabel = ui('team.supportSlotLabel');
  } else {
    const col = i % 3;
    tag = getColName(col);
    allowedPositionLabel = col === 0 ? ui('team.backLine') : col === 1 ? ui('team.middleLine') : ui('team.frontLine');
  }
  const slotClass = group === 'support' ? 'support' : '';
  if (!h) {
    return `
      <div class="team-slot ${slotClass}" data-group="${group}" data-slot="${i}" onclick="openCodexModal('${group}', ${i})">
        <span class="empty-label">${allowedPositionLabel}</span>
      </div>
    `;
  }
  const fac = CODEX_FACTIONS[h.faction] || { color: '#888' };
  const heroName = t(h, 'name');
  const slotInner = h.image
    ? `<img src="${h.image}" alt="${heroName}" class="slot-img" loading="lazy" />`
    : `<span class="slot-glyph">${h.glyph||'⚔️'}</span>`;
  // Slot preenchido é arrastável e tem data com a origem do cavaleiro
  return `
    <div class="team-slot filled ${slotClass}" draggable="true"
         data-group="${group}" data-slot="${i}"
         data-hero-id="${h.id}" data-from-team="1"
         style="background: linear-gradient(135deg, ${fac.color}22, var(--bg-2));"
         title="${ui('team.slotTooltip')}">
      <span class="slot-tag">${tag}</span>
      <button class="remove-btn" onclick="event.stopPropagation();removeFromTeam('${group}', ${i})" title="${ui('team.remove')}">×</button>
      ${slotInner}
      <span class="slot-name">${heroName.split(',')[0].split(' de ')[0].split(' of ')[0]}</span>
    </div>
  `;
}

function renderTeamSlotsUI() {
  const mainSlots = document.getElementById('teamSlots');
  const supSlots = document.getElementById('teamSupportSlots');
  if (!mainSlots) return;

  mainSlots.innerHTML = codexTeamMain.map((h, i) => buildSlotHTML(h, i, 'main')).join('');
  if (supSlots) supSlots.innerHTML = codexTeamSupport.map((h, i) => buildSlotHTML(h, i, 'support')).join('');

  // Habilitar dragstart nos slots PREENCHIDOS pra mover/trocar
  document.querySelectorAll('.team-slot[draggable="true"]').forEach(slot => {
    slot.addEventListener('dragstart', (e) => {
      const heroId = slot.dataset.heroId;
      const fromGroup = slot.dataset.group;
      const fromSlot = slot.dataset.slot;
      // Codifica origem no payload pra distinguir de drag da pool
      e.dataTransfer.setData('text/plain', heroId);
      e.dataTransfer.setData('application/x-team-source', JSON.stringify({
        group: fromGroup, slot: parseInt(fromSlot, 10)
      }));
      e.dataTransfer.effectAllowed = 'move';
      slot.classList.add('dragging');
    });
    slot.addEventListener('dragend', () => slot.classList.remove('dragging'));
  });

  // Drop em qualquer slot (vazio ou preenchido)
  document.querySelectorAll('.team-slot').forEach(slot => {
    slot.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      slot.classList.add('drag-over');
    });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      const heroId = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!heroId) return;
      const targetGroup = slot.dataset.group;
      const targetIdx = parseInt(slot.dataset.slot, 10);

      // Tenta ler origem (se veio de outro slot da equipe)
      let source = null;
      try {
        const raw = e.dataTransfer.getData('application/x-team-source');
        if (raw) source = JSON.parse(raw);
      } catch(_) {}

      if (source) {
        // É um movimento/swap entre slots da equipe
        moveBetweenSlots(source.group, source.slot, targetGroup, targetIdx);
      } else {
        // Veio da pool externa
        addHeroToSlot(heroId, targetGroup, targetIdx);
      }
    });
  });

  updateTeamCounter();
  renderTeamStatsUI();
  // Re-renderiza pool pra marcar heróis já usados (e desmarcar removidos)
  renderTeamPool();
  // Atualiza as Combinations Skills com base nos cavaleiros do time
  if (typeof renderTeamCombos === 'function') renderTeamCombos();
  // Auto-salva no slot ativo (a função respeita _suspendTeamAutosave durante carregamentos)
  if (typeof autosaveActiveTeam === 'function') autosaveActiveTeam();
}

// Mostra as Combinations Skills (bonds + combos) cujos membros estão TODOS no time montado
function renderTeamCombos() {
  const box = document.getElementById('teamCombosList');
  if (!box) return;

  const useEn = (_lang === 'en');
  const useEs = (_lang === 'es');

  // Junta todos os cavaleiros do time (main + support), ignorando vazios
  // Detecção de presença sempre por nome PT (chave canônica)
  const noTime = [...(codexTeamMain || []), ...(codexTeamSupport || [])].filter(Boolean);
  const nomesNoTime = new Set(noTime.map(h => h.name));

  if (noTime.length === 0) {
    box.innerHTML = `<p class="team-combos-empty">${ui('team.combosBuild')}</p>`;
    return;
  }

  // Coleta os bonds de todos os cavaleiros do time, sem repetir
  const vistos = new Set();
  const ativos = [];
  noTime.forEach(h => {
    (h.bonds || []).forEach(b => {
      // chave única do bond: nome PT + membros PT (sempre canônico)
      const chave = 'bond:' + b.nome + '|' + (b.membros || []).map(m => m.nome || m).join(',');
      if (vistos.has(chave)) return;
      // o bond ativa se TODOS os membros (que têm nome) estão no time (match por nome PT)
      const membros = b.membros || [];
      const comNome = membros.filter(m => (m.nome || m));
      if (comNome.length === 0) return;
      const todosPresentes = comNome.every(m => nomesNoTime.has(m.nome || m));
      if (todosPresentes) {
        vistos.add(chave);
        ativos.push({ tipo: 'bond', data: b });
      }
    });
  });

  // ─── COMBOS: skill conjunta entre 2+ cavaleiros ──────────────
  // Cada cavaleiro com combo tem combos: [{ nome, parceiros: [nomes PT], skillNome, skillDesc, icon, ... }]
  // O combo ativa se TODOS os parceiros + o próprio dono estão no time.
  noTime.forEach(h => {
    (h.combos || []).forEach(c => {
      const parceiros = c.parceiros || [];
      if (parceiros.length === 0) return;
      // chave única: dono + nome combo + parceiros (ordenados pra evitar duplicação)
      const chave = 'combo:' + c.nome + '|' + [h.name, ...parceiros].sort().join(',');
      if (vistos.has(chave)) return;
      // Todos os parceiros precisam estar no time
      const todosParcerosPresentes = parceiros.every(p => nomesNoTime.has(p));
      if (todosParcerosPresentes) {
        vistos.add(chave);
        ativos.push({ tipo: 'combo', data: c, dono: h });
      }
    });
  });

  if (ativos.length === 0) {
    box.innerHTML = `<p class="team-combos-empty">${ui('team.combosNone')}</p>`;
    return;
  }

  // Helper de fallback ES → EN → PT pra bonds
  const pickBondField = (b, field) => {
    if (useEs && b[field + '_es']) return b[field + '_es'];
    if (useEs && b[field + '_en']) return b[field + '_en'];
    if (useEn && b[field + '_en']) return b[field + '_en'];
    return b[field] || '';
  };
  // Helper de fallback de nome de herói (no ícone do membro)
  const pickHeroName = (heroPtName) => {
    if (!heroPtName) return '';
    const heroMatch = (typeof CODEX_HEROES !== 'undefined' && CODEX_HEROES)
      ? CODEX_HEROES.find(h => h.name === heroPtName)
      : null;
    if (!heroMatch) return heroPtName;
    if (useEs && heroMatch.name_es) return heroMatch.name_es;
    if (useEs && heroMatch.name_en) return heroMatch.name_en;
    if (useEn && heroMatch.name_en) return heroMatch.name_en;
    return heroMatch.name;
  };
  // Helper pra renderizar membro como ícone clicável
  const renderMember = (heroPtName, iconePtName) => {
    const hero = (typeof CODEX_HEROES !== 'undefined' && CODEX_HEROES)
      ? CODEX_HEROES.find(h => h.name === heroPtName)
      : null;
    // Tenta pegar o ícone: 1º o que veio do bond, 2º o portrait do herói
    const icone = iconePtName || (hero ? hero.image : '');
    if (!icone) return '';
    const displayName = pickHeroName(heroPtName);
    const codexId = hero ? hero.id : null;
    return `<img class="team-combo-member" src="${icone}" alt="${displayName}" title="${displayName}" loading="lazy"${codexId ? ` onclick="showHeroDetail(${codexId})"` : ''}>`;
  };

  box.innerHTML = ativos.map(item => {
    if (item.tipo === 'bond') {
      const b = item.data;
      const nomeBond = pickBondField(b, 'nome');
      const bonusBond = pickBondField(b, 'bonus');
      return `
      <div class="team-combo-card">
        ${b.membros && b.membros.length ? `
          <div class="team-combo-members">
            ${b.membros.map(m => renderMember(m.nome, m.icone)).join('')}
          </div>` : ''}
        <div class="team-combo-name">${nomeBond}</div>
        <div class="team-combo-bonus">${bonusBond}</div>
      </div>
      `;
    } else {
      // tipo === 'combo'
      const c = item.data;
      const dono = item.dono;
      const nomeCombo = (useEs && c.skillNome_es) ? c.skillNome_es
                      : (useEn && c.skillNome_en) ? c.skillNome_en
                      : (c.skillNome || c.nome || '');
      const descCombo = (useEs && c.skillDesc_es) ? c.skillDesc_es
                      : (useEn && c.skillDesc_en) ? c.skillDesc_en
                      : (c.skillDesc || '');
      // Lista de membros: dono + parceiros
      const todosMembros = [dono.name, ...(c.parceiros || [])];
      return `
      <div class="team-combo-card team-combo-card-combo">
        <div class="team-combo-members">
          ${todosMembros.map(nome => renderMember(nome, null)).join('')}
        </div>
        <div class="team-combo-name">⚡ ${nomeCombo}</div>
        <div class="team-combo-bonus">${descCombo}</div>
      </div>
      `;
    }
  }).join('');
}

// Move/troca um cavaleiro de um slot pra outro, validando regras
function moveBetweenSlots(fromGroup, fromIdx, toGroup, toIdx) {
  // Mesmo slot: nada a fazer
  if (fromGroup === toGroup && fromIdx === toIdx) return;

  const fromArr = fromGroup === 'main' ? codexTeamMain : codexTeamSupport;
  const toArr = toGroup === 'main' ? codexTeamMain : codexTeamSupport;
  const heroFrom = fromArr[fromIdx];
  const heroTo = toArr[toIdx];
  if (!heroFrom) return;

  // Validar destino para o herói que vem
  // (isMoving=true porque já está na equipe, ignora limite total)
  const v1 = validatePlacement(heroFrom, toGroup, toIdx, true);
  if (!v1.ok) {
    showTeamWarning(v1.reason);
    return;
  }

  // Se destino tem cavaleiro, é um SWAP — validar a origem para o que vai ser deslocado
  if (heroTo) {
    const v2 = validatePlacement(heroTo, fromGroup, fromIdx, true);
    if (!v2.ok) {
      showTeamWarning(`Não pode trocar: ${v2.reason}`);
      return;
    }
    // Faz a troca
    fromArr[fromIdx] = heroTo;
    toArr[toIdx] = heroFrom;
  } else {
    // Slot destino vazio — só move
    fromArr[fromIdx] = null;
    toArr[toIdx] = heroFrom;

    // Recentralização: se movemos pra OUTRA coluna da grade principal (não swap, não mesma coluna),
    // a coluna de origem pode ter ficado fora do estado canônico → normaliza ela.
    // Não aplica em swaps (a coluna não esvaziou) nem em movimentos dentro da mesma coluna
    // (o usuário escolheu aquela posição de propósito).
    if (fromGroup === 'main') {
      const fromCol = fromIdx % 3;
      const toCol = (toGroup === 'main') ? (toIdx % 3) : -1;
      if (fromCol !== toCol) {
        normalizeColumn(fromCol);
      }
    }
  }
  renderTeamSlotsUI();
}

function updateTeamCounter() {
  const counter = document.getElementById('teamCounter');
  if (!counter) return;
  const cav = countCavaleiros();
  const sup = countSuportes();
  counter.innerHTML = `
    <span class="counter-item${cav === MAX_CAVALEIROS ? ' full' : ''}">⚔ ${ui('team.knights')}: ${cav}/${MAX_CAVALEIROS}</span>
    <span class="counter-item${sup === MAX_SUPORTES ? ' full' : ''}">✨ ${ui('team.supports')}: ${sup}/${MAX_SUPORTES}</span>
  `;
}

function renderTeamStatsUI() {
  // Painel de totalizadores foi removido — só atualiza equipamento
  const stats = document.getElementById('teamStats');
  if (stats) {
    const all = [...codexTeamMain, ...codexTeamSupport].filter(h => h);
    const totalAtk = all.reduce((s, h) => s + h.stats.atk, 0);
    const totalDef = all.reduce((s, h) => s + h.stats.def, 0);
    const totalHp = all.reduce((s, h) => s + h.stats.hp, 0);
    const avgVel = all.length ? Math.round(all.reduce((s, h) => s + h.stats.vel, 0) / all.length) : 0;
    const power = totalAtk + totalDef + Math.floor(totalHp / 4);
    stats.innerHTML = `
      <div><div class="team-stat-label">Poder Total</div><div class="team-stat-value">${power.toLocaleString()}</div></div>
      <div><div class="team-stat-label">ATK Total</div><div class="team-stat-value">${totalAtk.toLocaleString()}</div></div>
      <div><div class="team-stat-label">DEF Total</div><div class="team-stat-value">${totalDef.toLocaleString()}</div></div>
      <div><div class="team-stat-label">HP Total</div><div class="team-stat-value">${totalHp.toLocaleString()}</div></div>
      <div><div class="team-stat-label">VEL Média</div><div class="team-stat-value">${avgVel}</div></div>
    `;
  }

  // Renderizar equipamentos toda vez que stats mudam (cavaleiros entraram/saíram)
  renderHeroEquipment();
}

// === HERO EQUIPMENT (artefato + cartas) ===
let heroCards = {};         // heroId → array de 5 cartas (placeholder, futuro)
let heroArtifacts = {};     // heroId → 1 artefato
let artifactModalContext = { heroId: null };

function renderHeroEquipment() {
  const container = document.getElementById('heroEquipmentList');
  if (!container) return;

  // Sempre renderiza MAX_CAVALEIROS linhas fixas (5), na ordem dos slots da formação.
  // Slots sem cavaleiro viram uma linha "vazia" aguardando.
  const slots = [];
  for (let i = 0; i < codexTeamMain.length; i++) {
    if (codexTeamMain[i]) slots.push(codexTeamMain[i]);
    if (slots.length >= MAX_CAVALEIROS) break;
  }
  while (slots.length < MAX_CAVALEIROS) slots.push(null);

  container.innerHTML = slots.map((hero, rowIdx) => {
    // ─── Linha vazia (placeholder fixo) ───
    if (!hero) {
      const emptyCards = Array.from({ length: 5 }, () => `
        <div class="artifact-slot card-slot" title="${ui('team.tooltipAddKnight')}">
          <span class="empty-text">${ui('team.card')}</span>
        </div>
      `).join('');
      return `
        <div class="hero-eq-row hero-eq-row-empty">
          <div class="hero-eq-portrait hero-eq-portrait-empty">
            <span class="hero-eq-portrait-mark">＋</span>
            <div class="hero-eq-name">${ui('team.empty')}</div>
          </div>
          <div class="hero-art-slot hero-art-slot-empty" title="${ui('team.tooltipAddKnight')}">
            <span class="empty-mark">+</span>
          </div>
          <div class="hero-eq-slots">${emptyCards}</div>
        </div>
      `;
    }

    // ─── Linha preenchida ───
    if (!heroCards[hero.id]) {
      heroCards[hero.id] = [null, null, null, null, null];
    }
    const cards = heroCards[hero.id];
    const art = heroArtifacts[hero.id] || null;

    const portrait = hero.image
      ? `<img src="${hero.image}" alt="${hero.name}" loading="lazy" />`
      : `<span style="font-size:50px">⚔️</span>`;

    // Slot redondo do artefato
    let artifactSlotHTML;
    if (!art) {
      artifactSlotHTML = `
        <div class="hero-art-slot" onclick="openArtifactModal(${hero.id})" title="Equipar artefato">
          <span class="empty-mark">+</span>
        </div>
      `;
    } else {
      const r = art.rarity || 'r';
      artifactSlotHTML = `
        <div class="hero-art-slot filled r-${r}" onclick="openArtifactModal(${hero.id})" title="${art.name} — clique para trocar">
          <button class="slot-remove" onclick="event.stopPropagation();removeArtifact(${hero.id})" title="Remover">×</button>
          <img src="${art.image}" alt="${art.name}" loading="lazy" />
          <span class="slot-rarity-tag">${r.toUpperCase()}</span>
        </div>
      `;
    }

    // 5 slots de cartas — clique abre modal pra escolher carta
    // Classe card-slot transforma o slot quadrado em moldura, com a carta vertical (95/152) centralizada
    const cardSlotsHTML = cards.map((card, idx) => {
      if (!card) {
        return `
          <div class="artifact-slot card-slot" onclick="openCardModal(${hero.id}, ${idx})" title="${ui('team.tooltipEquipCard')}">
            <span class="empty-text">${ui('team.card')}</span>
          </div>
        `;
      }
      const r = card.rarity || 'n';
      return `
        <div class="artifact-slot card-slot filled r-${r}" onclick="openCardModal(${hero.id}, ${idx})" title="${card.name} — clique para trocar">
          <span class="slot-rarity-tag">${r.toUpperCase()}</span>
          <button class="slot-remove" onclick="event.stopPropagation();removeHeroCard(${hero.id}, ${idx})" title="Remover">×</button>
          <img src="${card.image}" alt="${card.name}" loading="lazy" />
        </div>
      `;
    }).join('');

    return `
      <div class="hero-eq-row">
        <div class="hero-eq-portrait">
          ${portrait}
          <div class="hero-eq-name">${hero.name.split(',')[0].split(' de ')[0]}</div>
        </div>
        ${artifactSlotHTML}
        <div class="hero-eq-slots">${cardSlotsHTML}</div>
      </div>
    `;
  }).join('');
  // Auto-salva no slot ativo (equipamentos mudaram)
  if (typeof autosaveActiveTeam === 'function') autosaveActiveTeam();
}

let _modalArtifactFilter = { search: '', rarity: 'todos' };

function openArtifactModal(heroId) {
  artifactModalContext = { heroId };
  _modalArtifactFilter = { search: '', rarity: 'todos' };
  renderArtifactModalContent();
  document.getElementById('codexModal').classList.add('active');
}

function renderArtifactModalContent() {
  const heroId = artifactModalContext.heroId;
  const hero = codexTeamMain.find(h => h && h.id === heroId);
  const heroName = hero ? hero.name.split(',')[0] : 'Herói';
  const f = _modalArtifactFilter;

  const RARITY_ORDER = ['ssr','sr','r'];
  const filtered = CODEX_ARTIFACTS.filter(a => {
    if (f.rarity !== 'todos' && a.rarity !== f.rarity) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!a.name.toLowerCase().includes(q) && !(a.type||'').toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const ar = RARITY_ORDER.indexOf(a.rarity), br = RARITY_ORDER.indexOf(b.rarity);
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  document.getElementById('codexModalTitle').textContent = `${heroName} — Selecione um Artefato`;
  document.getElementById('codexModalBody').innerHTML = `
    ${renderModalFilterToolbar('artifact', f, CODEX_ARTIFACTS.length, filtered.length)}
    <div class="artifacts-grid" style="margin-top:14px;">
      ${filtered.length ? filtered.map(a => {
        const r = a.rarity || 'r';
        const safeName = String(a.name).replace(/[<>&"]/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch]));
        const portraitClass = a.image ? 'hero-portrait has-image' : 'hero-portrait';
        const portraitInner = a.image
          ? `<img src="${a.image}" alt="${safeName}" loading="lazy" />`
          : `<span class="glyph">${a.icon||'💎'}</span>`;
        return `
          <div class="hero-card codex-card r-${r}" onclick="equipArtifact('${a.id}')" title="${(a.effect||'').replace(/"/g,'&quot;')}">
            <div class="${portraitClass}">
              <div class="rays"></div>
              ${portraitInner}
              <span class="hero-rarity-badge ${r}" data-label="${r.toUpperCase()}"></span>
            </div>
            <div class="hero-info">
              <div class="hero-name">${safeName}</div>
            </div>
          </div>
        `;
      }).join('')
      : '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ink-dim);font-style:italic;">Nenhum artefato com esses filtros.</div>'}
    </div>
  `;

  setupModalArtifactFilterHandlers();
}

function setupModalArtifactFilterHandlers() {
  const f = _modalArtifactFilter;
  const refresh = () => renderArtifactModalContent();

  const rar = document.getElementById('modalFilter_artifact_rarity');
  if (rar) rar.addEventListener('change', e => { f.rarity = e.target.value; refresh(); });

  const search = document.getElementById('modalFilter_artifact_search');
  if (search) {
    search.addEventListener('input', e => {
      clearTimeout(window._modalArtSearchTimer);
      window._modalArtSearchTimer = setTimeout(() => {
        f.search = e.target.value;
        refresh();
        setTimeout(() => {
          const nx = document.getElementById('modalFilter_artifact_search');
          if (nx) { nx.focus(); nx.setSelectionRange(nx.value.length, nx.value.length); }
        }, 0);
      }, 180);
    });
  }

  const clearBtn = document.getElementById('modalFilter_artifact_clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      _modalArtifactFilter = { search: '', rarity: 'todos' };
      refresh();
    });
  }
}

function equipArtifact(artifactId) {
  const art = CODEX_ARTIFACTS.find(a => a.id === artifactId);
  if (!art || !artifactModalContext.heroId) return;
  heroArtifacts[artifactModalContext.heroId] = art;
  closeCodexModal();
  artifactModalContext = { heroId: null };
  buzz(30); // feedback tátil curto
  renderHeroEquipment();
}

function removeArtifact(heroId) {
  delete heroArtifacts[heroId];
  renderHeroEquipment();
}

// === CARTAS DO TEAM BUILDER ===
let cardModalContext = { heroId: null, slot: -1 };

let _modalCardFilter = { search: '', rarity: 'todos' };

function openCardModal(heroId, slotIdx) {
  cardModalContext = { heroId, slot: slotIdx };
  _modalCardFilter = { search: '', rarity: 'todos' };
  renderCardModalContent();
  document.getElementById('codexModal').classList.add('active');
}

function renderCardModalContent() {
  const heroId = cardModalContext.heroId;
  const slotIdx = cardModalContext.slot;
  const f = _modalCardFilter;

  // Cartas já equipadas POR ESSE herói (nos outros slots) — pra evitar duplicar
  const heroCardArr = heroCards[heroId] || [];
  const usedByThisHero = heroCardArr.filter((c, i) => c && i !== slotIdx).map(c => c.id);

  const RARITY_ORDER = ['ssr','sr','r','n'];
  const useEnCard = (_lang === 'en');
  const filtered = CODEX_CARDS.filter(c => {
    if (f.rarity !== 'todos' && c.rarity !== f.rarity) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const inName = c.name.toLowerCase().includes(q) || (c.name_en || '').toLowerCase().includes(q);
      const inEffect = (c.effect||'').toLowerCase().includes(q) || (c.effect_en||'').toLowerCase().includes(q);
      if (!inName && !inEffect) return false;
    }
    return true;
  }).sort((a, b) => {
    const ar = RARITY_ORDER.indexOf(a.rarity), br = RARITY_ORDER.indexOf(b.rarity);
    if (ar !== br) return ar - br;
    const nameA = useEnCard && a.name_en ? a.name_en : a.name;
    const nameB = useEnCard && b.name_en ? b.name_en : b.name;
    return nameA.localeCompare(nameB, getLocale());
  });

  const hero = codexTeamMain.find(h => h && h.id === heroId);
  const heroNameRaw = hero ? (useEnCard && hero.name_en ? hero.name_en : hero.name) : (useEnCard ? 'Hero' : 'Herói');
  const heroName = hero ? heroNameRaw.split(',')[0] : heroNameRaw;

  const slotLabel = useEnCard ? `Slot ${slotIdx+1}: Select a Card` : `Slot ${slotIdx+1}: Selecione uma Carta`;
  document.getElementById('codexModalTitle').textContent = `${heroName} — ${slotLabel}`;
  document.getElementById('codexModalBody').innerHTML = `
    ${renderModalFilterToolbar('card', f, CODEX_CARDS.length, filtered.length)}
    <div class="artifacts-grid" style="margin-top:14px;">
      ${filtered.length ? filtered.map(c => {
        const r = c.rarity || 'n';
        const isUsed = usedByThisHero.includes(c.id);
        const opacity = isUsed ? '0.35' : '1';
        const onclick = isUsed
          ? `onclick="alert(ui('team.cardAlreadyEquipped'))"`
          : `onclick="equipCard('${c.id}')"`;
        const cardName = useEnCard && c.name_en ? c.name_en : c.name;
        const cardEffect = useEnCard && c.effect_en ? c.effect_en : (c.effect || '');
        const safeName = String(cardName).replace(/[<>&"]/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch]));
        const portraitClass = c.image ? 'hero-portrait has-image' : 'hero-portrait';
        const portraitInner = c.image
          ? `<img src="${c.image}" alt="${safeName}" loading="lazy" />`
          : `<span class="glyph">🃏</span>`;
        return `
          <div class="hero-card codex-card r-${r}" ${onclick} style="opacity:${opacity};" title="${cardEffect.replace(/"/g,'&quot;')}">
            <div class="${portraitClass}">
              <div class="rays"></div>
              ${portraitInner}
              <span class="hero-rarity-badge ${r}" data-label="${r.toUpperCase()}"></span>
            </div>
            <div class="hero-info">
              <div class="hero-name">${safeName}</div>
            </div>
          </div>
        `;
      }).join('')
      : `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ink-dim);font-style:italic;">${useEnCard ? 'No card matches these filters.' : 'Nenhuma carta com esses filtros.'}</div>`}
    </div>
  `;

  setupModalCardFilterHandlers();
}

function setupModalCardFilterHandlers() {
  const f = _modalCardFilter;
  const refresh = () => renderCardModalContent();

  const rar = document.getElementById('modalFilter_card_rarity');
  if (rar) rar.addEventListener('change', e => { f.rarity = e.target.value; refresh(); });

  const search = document.getElementById('modalFilter_card_search');
  if (search) {
    search.addEventListener('input', e => {
      clearTimeout(window._modalCardSearchTimer);
      window._modalCardSearchTimer = setTimeout(() => {
        f.search = e.target.value;
        refresh();
        setTimeout(() => {
          const nx = document.getElementById('modalFilter_card_search');
          if (nx) { nx.focus(); nx.setSelectionRange(nx.value.length, nx.value.length); }
        }, 0);
      }, 180);
    });
  }

  const clearBtn = document.getElementById('modalFilter_card_clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      _modalCardFilter = { search: '', rarity: 'todos' };
      refresh();
    });
  }
}

function equipCard(cardId) {
  const card = CODEX_CARDS.find(c => c.id === cardId);
  if (!card || !cardModalContext.heroId) return;
  const heroId = cardModalContext.heroId;
  const slot = cardModalContext.slot;
  if (!heroCards[heroId]) {
    heroCards[heroId] = [null, null, null, null, null];
  }
  heroCards[heroId][slot] = card;
  closeCodexModal();
  cardModalContext = { heroId: null, slot: -1 };
  buzz(30); // feedback tátil
  renderHeroEquipment();
}

function removeHeroCard(heroId, slotIdx) {
  if (heroCards[heroId]) {
    heroCards[heroId][slotIdx] = null;
    renderHeroEquipment();
  }
}

function getUsedIds() {
  return [...codexTeamMain, ...codexTeamSupport].filter(h => h).map(h => h.id);
}

function showTeamWarning(msg) {
  const w = document.getElementById('teamWarning');
  if (!w) { alert(msg); return; }
  w.textContent = '⚠ ' + msg;
  w.classList.add('show');
  clearTimeout(window._teamWarnTimer);
  window._teamWarnTimer = setTimeout(() => w.classList.remove('show'), 3500);
}

// Validação central: pode esse cavaleiro entrar nesse slot/grupo?
function validatePlacement(hero, group, slotIdx, isMoving = false) {
  // Slot de suporte aceita QUALQUER cavaleiro - só checa o limite de 2
  if (group === 'support') {
    if (isMoving) return { ok: true };
    if (countSuportes() >= MAX_SUPORTES && !codexTeamSupport[slotIdx]) {
      return { ok: false, reason: `Máximo de ${MAX_SUPORTES} suportes atingido.` };
    }
    return { ok: true };
  }
  // Slot da grade: cavaleiro precisa ter posição igual à coluna
  const col = getSlotColumn(slotIdx);
  const heroCol = POSITION_TO_COL[hero.position];
  if (heroCol === undefined || heroCol !== col) {
    const heroPosName = getColName(heroCol) || hero.position;
    const slotPosName = getColName(col);
    return { ok: false, reason: `${hero.name} é da linha "${heroPosName}" e não pode ir na linha "${slotPosName}".` };
  }
  if (isMoving) return { ok: true };
  if (countCavaleiros() >= MAX_CAVALEIROS && !codexTeamMain[slotIdx]) {
    return { ok: false, reason: `Máximo de ${MAX_CAVALEIROS} cavaleiros atingido.` };
  }
  if (countCol(col) >= MAX_POR_COLUNA && !codexTeamMain[slotIdx]) {
    return { ok: false, reason: `Máximo de ${MAX_POR_COLUNA} cavaleiros na linha "${getColName(col)}".` };
  }
  return { ok: true };
}

// Click rápido: tenta colocar na coluna correta primeiro;
// se cheia/incompatível, joga em suporte como fallback.
function quickAddToTeam(heroId) {
  const h = CODEX_HEROES.find(x => x.id === heroId);
  if (!h) return;
  if (getUsedIds().includes(heroId)) {
    showHeroDetail(heroId);
    return;
  }

  const targetCol = POSITION_TO_COL[h.position];

  // Tentar colocar na grade principal (coluna correta)
  // LÓGICA:
  // - 1º cavaleiro da coluna: vai pro MEIO (row 1)
  // - 2º cavaleiro da coluna: o do meio vai pra row 0, o novo vai pra row 2
  // - 3º cavaleiro: ocupa o slot vago restante (row 1, meio)
  if (targetCol !== undefined && countCavaleiros() < MAX_CAVALEIROS && countCol(targetCol) < MAX_POR_COLUNA) {
    const inCol = countCol(targetCol);
    const slotsInCol = [0, 1, 2].map(row => row * 3 + targetCol);
    // [topo, meio, base]

    if (inCol === 0) {
      // Coluna vazia → entra no MEIO
      codexTeamMain[slotsInCol[1]] = h;
      buzz(20);
      renderTeamSlotsUI();
      return;
    }
    if (inCol === 1 && codexTeamMain[slotsInCol[1]]) {
      // Tem só 1 cavaleiro NO MEIO → move pro topo, novo entra na base
      codexTeamMain[slotsInCol[0]] = codexTeamMain[slotsInCol[1]];
      codexTeamMain[slotsInCol[1]] = null;
      codexTeamMain[slotsInCol[2]] = h;
      buzz(20);
      renderTeamSlotsUI();
      return;
    }
    // Outros casos (>= 2 na coluna OU 1 fora do meio): preenche o primeiro slot vazio
    for (const slotIdx of slotsInCol) {
      if (codexTeamMain[slotIdx] === null) {
        codexTeamMain[slotIdx] = h;
        buzz(20);
        renderTeamSlotsUI();
        return;
      }
    }
  }

  // Senão, tentar suporte
  if (countSuportes() < MAX_SUPORTES) {
    const idx = codexTeamSupport.indexOf(null);
    if (idx >= 0) {
      codexTeamSupport[idx] = h;
      buzz(20);
      renderTeamSlotsUI();
      return;
    }
  }

  // Tudo cheio (feedback de erro: vibração diferente)
  buzz([40, 30, 40]); // 2 pulsos rápidos = "negativo"
  if (countCavaleiros() >= MAX_CAVALEIROS) {
    showTeamWarning(`Cavaleiros e suportes cheios. Remova alguém primeiro.`);
  } else if (countCol(targetCol) >= MAX_POR_COLUNA) {
    showTeamWarning(`Linha "${getColName(targetCol)}" cheia (${MAX_POR_COLUNA}/${MAX_POR_COLUNA}). Use o slot de suporte ou remova alguém.`);
  } else {
    showTeamWarning(`Equipe cheia.`);
  }
}

function addHeroToSlot(heroId, group, slotIdx) {
  const h = CODEX_HEROES.find(x => x.id === heroId);
  if (!h) return;

  let wasInMain = -1, wasInSupport = -1;
  for (let i = 0; i < codexTeamMain.length; i++) {
    if (codexTeamMain[i] && codexTeamMain[i].id === heroId) wasInMain = i;
  }
  for (let i = 0; i < codexTeamSupport.length; i++) {
    if (codexTeamSupport[i] && codexTeamSupport[i].id === heroId) wasInSupport = i;
  }
  const isMoving = (wasInMain >= 0 || wasInSupport >= 0);

  const v = validatePlacement(h, group, slotIdx, isMoving);
  if (!v.ok) {
    showTeamWarning(v.reason);
    return;
  }

  if (wasInMain >= 0) codexTeamMain[wasInMain] = null;
  if (wasInSupport >= 0) codexTeamSupport[wasInSupport] = null;

  if (group === 'main') codexTeamMain[slotIdx] = h;
  else codexTeamSupport[slotIdx] = h;
  renderTeamSlotsUI();
}

// Estado do filtro dentro do modal de herói (Team Builder)
let _modalHeroFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };

function openCodexModal(group, slot) {
  codexModalGroup = group;
  codexModalSlot = slot;
  // Reseta filtros sempre que abrir
  _modalHeroFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };
  renderHeroModalContent();
  document.getElementById('codexModal').classList.add('active');
}

function renderHeroModalContent() {
  const group = codexModalGroup;
  const slot = codexModalSlot;
  const usedIds = getUsedIds();
  const f = _modalHeroFilter;

  // Restrição de posição do slot (continua igual)
  let pool;
  if (group === 'support') {
    pool = CODEX_HEROES;
  } else {
    const col = getSlotColumn(slot);
    pool = CODEX_HEROES.filter(h => POSITION_TO_COL[h.position] === col);
  }
  // Não mostra os já usados
  pool = pool.filter(h => !usedIds.includes(h.id));

  // Aplica filtros adicionais do modal
  const available = pool.filter(h => {
    if (f.rarity !== 'todos' && h.rarity !== f.rarity) return false;
    if (f.faction !== 'todos' && h.faction !== f.faction) return false;
    if (f.class !== 'todos' && h.class !== f.class) return false;
    if (f.position !== 'todos' && h.position !== f.position) return false;
    if (f.damage !== 'todos' && h.damage !== f.damage) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!h.name.toLowerCase().includes(q) && !(h.title||'').toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const order = {ur:0, ssr:1, sr:2, r:3, n:4};
    const ar = order[a.rarity] ?? 9, br = order[b.rarity] ?? 9;
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  let tag;
  if (group === 'support') {
    tag = `${ui('team.supportSlot')} ${slot+1}`;
  } else {
    const col = slot % 3;
    const colName = col === 0 ? ui('team.backLine') : col === 1 ? ui('team.middleLine') : ui('team.frontLine');
    tag = colName;
  }
  document.getElementById('codexModalTitle').textContent = `${tag} — ${ui('team.pickHero')}`;

  document.getElementById('codexModalBody').innerHTML = `
    ${renderModalFilterToolbar('hero', f, pool.length, available.length)}
    <div class="heroes-grid" style="margin-top:14px;">
      ${available.length ? available.map(h => heroCardHTML(h, `onclick="addToCodexTeamFromModal(${h.id})"`)).join('')
        : `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ink-dim);font-style:italic;">${ui('team.noHeroFilter')}</div>`}
    </div>
  `;

  setupModalHeroFilterHandlers();
}

// Toolbar genérica de filtros pra modais (hero / artifact / card)
function renderModalFilterToolbar(kind, filterState, totalPool, totalShown) {
  const f = filterState;
  const optionsHtml = (obj, allLabel, curVal) => {
    return `<option value="todos"${curVal === 'todos' ? ' selected' : ''}>${allLabel}</option>` +
      Object.entries(obj).map(([k, v]) =>
        `<option value="${k}"${curVal === k ? ' selected' : ''}>${v.icon || ''} ${t(v,'name') || k.toUpperCase()}</option>`
      ).join('');
  };
  const prefix = `modalFilter_${kind}`;

  let raritiesList, includeFaction, includeClass, includePosition, includeDamage;
  if (kind === 'hero') {
    raritiesList = ['ur','ssr','sr','r'];
    includeFaction = includeClass = includePosition = includeDamage = true;
  } else if (kind === 'artifact') {
    raritiesList = ['ssr','sr','r'];
    includeFaction = includeClass = includePosition = includeDamage = false;
  } else if (kind === 'card') {
    raritiesList = ['ssr','sr','r','n'];
    includeFaction = includeClass = includePosition = includeDamage = false;
  }

  const tipoLabel = kind === 'hero' ? ui('hero.heroes') : kind === 'artifact' ? ui('hero.artifacts') : ui('hero.cards');

  return `
    <div class="team-pool-toolbar" style="margin-bottom:0;">
      <div class="team-pool-filters">
        <div class="team-filter-item">
          <label>${ui('filter.rarity')}</label>
          <select id="${prefix}_rarity">
            <option value="todos"${f.rarity === 'todos' ? ' selected' : ''}>${ui('filter.allFem')}</option>
            ${raritiesList.map(r => `<option value="${r}"${f.rarity === r ? ' selected' : ''}>${r.toUpperCase()}</option>`).join('')}
          </select>
        </div>
        ${includeFaction ? `
        <div class="team-filter-item">
          <label>${ui('filter.faction')}</label>
          <select id="${prefix}_faction">${optionsHtml(CODEX_FACTIONS, ui('filter.allFem'), f.faction)}</select>
        </div>` : ''}
        ${includeClass ? `
        <div class="team-filter-item">
          <label>${ui('filter.class')}</label>
          <select id="${prefix}_class">${optionsHtml(CODEX_CLASSES, ui('filter.allFem'), f.class)}</select>
        </div>` : ''}
        ${includePosition ? `
        <div class="team-filter-item">
          <label>${ui('filter.position')}</label>
          <select id="${prefix}_position">${optionsHtml(CODEX_POSITIONS, ui('filter.allFem'), f.position)}</select>
        </div>` : ''}
        ${includeDamage ? `
        <div class="team-filter-item">
          <label>${ui('filter.damage')}</label>
          <select id="${prefix}_damage">${optionsHtml(CODEX_DAMAGE, ui('filter.allMasc'), f.damage)}</select>
        </div>` : ''}
        <div class="team-filter-item team-filter-search">
          <label>${ui('filter.search')}</label>
          <input type="text" id="${prefix}_search" placeholder="${ui('filter.searchShort')}" value="${escapeHtml(f.search || '')}">
        </div>
        <button class="team-filter-clear" id="${prefix}_clear" title="${ui('filter.clearTitle')}">${ui('filter.clear')}</button>
      </div>
    </div>
    <div style="margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:.75rem;color:var(--ink-dim);text-align:right;">
      ${totalShown} ${ui('hero.of')} ${totalPool} ${tipoLabel}
    </div>
  `;
}

function setupModalHeroFilterHandlers() {
  const f = _modalHeroFilter;
  const refresh = () => renderHeroModalContent();

  ['rarity','faction','class','position','damage'].forEach(k => {
    const el = document.getElementById('modalFilter_hero_' + k);
    if (el) el.addEventListener('change', e => { f[k] = e.target.value; refresh(); });
  });

  const search = document.getElementById('modalFilter_hero_search');
  if (search) {
    search.addEventListener('input', e => {
      clearTimeout(window._modalHeroSearchTimer);
      window._modalHeroSearchTimer = setTimeout(() => {
        f.search = e.target.value;
        refresh();
        // Re-foca após re-render
        setTimeout(() => {
          const nx = document.getElementById('modalFilter_hero_search');
          if (nx) { nx.focus(); nx.setSelectionRange(nx.value.length, nx.value.length); }
        }, 0);
      }, 180);
    });
  }

  const clearBtn = document.getElementById('modalFilter_hero_clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      _modalHeroFilter = { search: '', rarity: 'todos', faction: 'todos', class: 'todos', position: 'todos', damage: 'todos' };
      refresh();
    });
  }
}

function closeCodexModal() {
  document.getElementById('codexModal').classList.remove('active');
  codexModalSlot = -1;
}

function addToCodexTeamFromModal(heroId) {
  const h = CODEX_HEROES.find(x => x.id === heroId);
  if (codexModalSlot < 0 || !h) return;

  const v = validatePlacement(h, codexModalGroup, codexModalSlot, false);
  if (!v.ok) {
    showTeamWarning(v.reason);
    return;
  }

  if (codexModalGroup === 'main') codexTeamMain[codexModalSlot] = h;
  else codexTeamSupport[codexModalSlot] = h;
  closeCodexModal();
  renderTeamSlotsUI();
}

// Normaliza uma coluna pro estado canônico:
//   1 cavaleiro → meio
//   2 cavaleiros → topo + base (pontas), preservando ordem (mais alto → topo, mais baixo → base)
//   3 cavaleiros → todos os slots (nada a fazer)
// Preserva a identidade de cada cavaleiro e seus equipamentos (heroArtifacts/heroCards usam heroId).
function normalizeColumn(col) {
  const slotsInCol = [0, 1, 2].map(row => row * 3 + col); // [topo, meio, base]
  const heroes = slotsInCol.map(i => codexTeamMain[i]).filter(h => h);
  // Limpa a coluna
  slotsInCol.forEach(i => { codexTeamMain[i] = null; });
  if (heroes.length === 1) {
    codexTeamMain[slotsInCol[1]] = heroes[0]; // meio
  } else if (heroes.length === 2) {
    codexTeamMain[slotsInCol[0]] = heroes[0]; // topo
    codexTeamMain[slotsInCol[2]] = heroes[1]; // base
  } else if (heroes.length === 3) {
    codexTeamMain[slotsInCol[0]] = heroes[0];
    codexTeamMain[slotsInCol[1]] = heroes[1];
    codexTeamMain[slotsInCol[2]] = heroes[2];
  }
}

function removeFromTeam(group, slot) {
  if (group === 'main') {
    const hero = codexTeamMain[slot];
    if (hero) {
      delete heroArtifacts[hero.id];
      delete heroCards[hero.id];
    }
    codexTeamMain[slot] = null;

    // Normaliza a coluna pro estado canônico (1=meio, 2=pontas, 3=todos)
    normalizeColumn(slot % 3);
  } else {
    const hero = codexTeamSupport[slot];
    if (hero) {
      delete heroArtifacts[hero.id];
    }
    codexTeamSupport[slot] = null;
  }
  renderTeamSlotsUI();
}

function addToCodexTeam(heroId) { addToCodexTeamFromModal(heroId); }
function removeFromCodexTeam(slot) { removeFromTeam('main', slot); }

// ═══════ COMPARTILHAR TIME ═══════
// Estrutura serializada: { v: 1, m: [heroIds...9], s: [supIds...2], a: { heroId: artifactId } }
// Codificada em base64url e compartilhada como CÓDIGO (não URL — pra evitar problemas com iframe do Google Sites)

// ═══════ MÚLTIPLOS TIMES SALVOS (até 3 abas) ═══════
// Cada time salvo é um objeto { encoded } — string base64url gerada por encodeTeamData
// Persistido em localStorage. O time ativo é o que está sendo editado.
const MAX_SAVED_TEAMS = 3;
const LS_SAVED_TEAMS = 'triadeSavedTeams';
const LS_ACTIVE_TEAM = 'triadeActiveTeamIdx';
let savedTeams = [];          // [{ encoded: '...' }, ...]
let activeTeamIdx = 0;
let _suspendTeamAutosave = false; // evita salvar enquanto carregamos um time

function loadSavedTeamsFromStorage() {
  try {
    const raw = localStorage.getItem(LS_SAVED_TEAMS);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) savedTeams = arr.slice(0, MAX_SAVED_TEAMS);
    }
    const idx = parseInt(localStorage.getItem(LS_ACTIVE_TEAM) || '0', 10);
    if (!isNaN(idx) && idx >= 0 && idx < savedTeams.length) activeTeamIdx = idx;
  } catch (e) { /* silencioso */ }
  if (savedTeams.length === 0) {
    savedTeams = [{ encoded: '' }];
    activeTeamIdx = 0;
  }
}

function persistSavedTeams() {
  try {
    localStorage.setItem(LS_SAVED_TEAMS, JSON.stringify(savedTeams));
    localStorage.setItem(LS_ACTIVE_TEAM, String(activeTeamIdx));
  } catch (e) { /* localStorage cheio/desabilitado — ignora silenciosamente */ }
}

// Aplica um objeto decodificado nas estruturas globais. Não renderiza UI.
function applyTeamData(data) {
  codexTeamMain = [null, null, null, null, null, null, null, null, null];
  codexTeamSupport = [null, null];
  heroArtifacts = {};
  heroCards = {};
  if (!data || !data.v) return;
  if (Array.isArray(data.m)) {
    data.m.forEach((hid, i) => {
      if (i >= 9 || !hid) return;
      const hero = CODEX_HEROES.find(h => h.id === hid);
      if (hero) codexTeamMain[i] = hero;
    });
  }
  if (Array.isArray(data.s)) {
    data.s.forEach((hid, i) => {
      if (i >= 2 || !hid) return;
      const hero = CODEX_HEROES.find(h => h.id === hid);
      if (hero) codexTeamSupport[i] = hero;
    });
  }
  if (data.a && typeof data.a === 'object') {
    Object.entries(data.a).forEach(([hid, aid]) => {
      const art = CODEX_ARTIFACTS.find(a => a.id === aid);
      if (art) heroArtifacts[hid] = art;
    });
  }
  if (data.c && typeof data.c === 'object') {
    Object.entries(data.c).forEach(([hid, ids]) => {
      if (!Array.isArray(ids)) return;
      heroCards[hid] = ids.map(cid => cid ? (CODEX_CARDS.find(c => c.id === cid) || null) : null);
      while (heroCards[hid].length < 5) heroCards[hid].push(null);
    });
  }
}

// Conta heróis (main+support) num time decodificado
function countHeroesInEncoded(encoded) {
  if (!encoded) return 0;
  const data = decodeTeamData(encoded);
  if (!data) return 0;
  let n = 0;
  if (Array.isArray(data.m)) n += data.m.filter(x => x).length;
  if (Array.isArray(data.s)) n += data.s.filter(x => x).length;
  return n;
}

function renderTeamTabs() {
  const wrap = document.getElementById('teamTabsWrapper');
  if (!wrap) return;
  const tabsHTML = savedTeams.map((t, i) => {
    const isActive = i === activeTeamIdx;
    // Pro time ATIVO usamos o estado vivo (não o encoded armazenado, que pode estar desatualizado)
    const count = isActive
      ? (codexTeamMain.filter(h => h).length + codexTeamSupport.filter(h => h).length)
      : countHeroesInEncoded(t.encoded);
    const canDelete = savedTeams.length > 1;
    return `
      <button class="team-tab ${isActive ? 'active' : ''}"
              onclick="switchTeam(${i})"
              title="${ui('team.team')} ${i + 1}">
        ${ui('team.team')} ${i + 1}<span class="team-tab-count">(${count}/11)</span>
        ${canDelete ? `<span class="team-tab-close" onclick="event.stopPropagation();deleteTeam(${i})" title="${ui('team.removeTeam')}">×</span>` : ''}
      </button>
    `;
  }).join('');
  const canAdd = savedTeams.length < MAX_SAVED_TEAMS;
  const addBtn = `
    <button class="team-tab-add"
            onclick="addTeam()"
            title="${canAdd ? ui('team.newTeam') : ui('team.maxTeams')}"
            ${canAdd ? '' : 'disabled'}>+</button>
  `;
  wrap.innerHTML = tabsHTML + addBtn;
}

// Salva o estado atual no slot ativo (chamado automaticamente após mudanças)
function autosaveActiveTeam() {
  if (_suspendTeamAutosave) return;
  if (!savedTeams[activeTeamIdx]) return;
  const data = buildTeamShareData();
  savedTeams[activeTeamIdx].encoded = encodeTeamData(data);
  persistSavedTeams();
  // Atualiza contador da aba sem re-render completo
  renderTeamTabs();
}

function switchTeam(idx) {
  if (idx === activeTeamIdx) return;
  if (idx < 0 || idx >= savedTeams.length) return;
  // 1) Salva o time atual antes de trocar
  autosaveActiveTeam();
  // 2) Troca o ativo
  activeTeamIdx = idx;
  // 3) Carrega o time novo (sem disparar autosave)
  _suspendTeamAutosave = true;
  const encoded = savedTeams[idx].encoded;
  if (encoded) {
    const data = decodeTeamData(encoded);
    applyTeamData(data || {});
  } else {
    // Time vazio
    applyTeamData({});
  }
  _suspendTeamAutosave = false;
  persistSavedTeams();
  // 4) Re-renderiza tudo
  renderTeamSlotsUI();
  renderTeamTabs();
  // Feedback
  if (typeof toast === 'function') toast({ msg: `Time ${idx + 1} carregado`, type: 'info' });
}

function addTeam() {
  if (savedTeams.length >= MAX_SAVED_TEAMS) return;
  // Salva o atual antes de criar o novo
  autosaveActiveTeam();
  savedTeams.push({ encoded: '' });
  activeTeamIdx = savedTeams.length - 1;
  // Limpa estado e renderiza
  _suspendTeamAutosave = true;
  applyTeamData({});
  _suspendTeamAutosave = false;
  persistSavedTeams();
  renderTeamSlotsUI();
  renderTeamTabs();
  if (typeof toast === 'function') toast({ msg: `Time ${activeTeamIdx + 1} criado`, type: 'success' });
}

function deleteTeam(idx) {
  if (savedTeams.length <= 1) return;
  if (idx < 0 || idx >= savedTeams.length) return;
  const count = idx === activeTeamIdx
    ? (codexTeamMain.filter(h => h).length + codexTeamSupport.filter(h => h).length)
    : countHeroesInEncoded(savedTeams[idx].encoded);
  if (count > 0 && !confirm(ui('team.confirmRemove').replace('{n}', idx + 1))) return;
  savedTeams.splice(idx, 1);
  // Ajusta o índice ativo
  if (idx === activeTeamIdx) {
    activeTeamIdx = Math.max(0, idx - 1);
    _suspendTeamAutosave = true;
    const encoded = savedTeams[activeTeamIdx].encoded;
    applyTeamData(encoded ? (decodeTeamData(encoded) || {}) : {});
    _suspendTeamAutosave = false;
    renderTeamSlotsUI();
  } else if (idx < activeTeamIdx) {
    activeTeamIdx--;
  }
  persistSavedTeams();
  renderTeamTabs();
}

function buildTeamShareData() {
  return {
    v: 1,
    m: codexTeamMain.map(h => h ? h.id : 0),
    s: codexTeamSupport.map(h => h ? h.id : 0),
    a: Object.fromEntries(
      Object.entries(heroArtifacts).map(([hid, art]) => [hid, art.id])
    ),
    c: Object.fromEntries(
      Object.entries(heroCards)
        .filter(([_, cards]) => cards && cards.some(x => x))
        .map(([hid, cards]) => [hid, cards.map(c => c ? c.id : 0)])
    )
  };
}

function encodeTeamData(data) {
  const json = JSON.stringify(data);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeTeamData(str) {
  try {
    let b64 = String(str || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function showTeamShareToast(msg, type = '') {
  // Redireciona pro sistema global de toasts (mais elegante)
  // Aceita: 'success', 'error', 'warn', 'info'
  toast({ msg: msg, type: type || 'info' });
}

function buildTeamSummary() {
  const mains = codexTeamMain.filter(h => h);
  const sups = codexTeamSupport.filter(h => h);
  const artifactsCount = Object.keys(heroArtifacts).length;

  if (mains.length === 0 && sups.length === 0) {
    return '<em>Nenhum cavaleiro na equipe.</em>';
  }
  return `
    <strong>Cavaleiros (${mains.length}/5):</strong> ${mains.map(h => h.name.split(',')[0].split(' de ')[0]).join(', ') || '—'}<br>
    <strong>Suportes (${sups.length}/2):</strong> ${sups.map(h => h.name.split(',')[0].split(' de ')[0]).join(', ') || '—'}<br>
    <strong>Artefatos equipados:</strong> ${artifactsCount}
  `;
}

function openShareModal() {
  const total = codexTeamMain.filter(h => h).length + codexTeamSupport.filter(h => h).length;
  if (total === 0) {
    showTeamShareToast('Adicione cavaleiros à equipe antes de compartilhar.', 'error');
    return;
  }
  // Gera URL completa (auto-carrega o time ao abrir)
  const code = encodeTeamData(buildTeamShareData());
  const url = buildShareUrl(code);
  document.getElementById('shareLinkInput').value = url;
  document.getElementById('shareSummary').innerHTML = buildTeamSummary();
  const imp = document.getElementById('shareImportInput');
  if (imp) imp.value = '';
  switchShareTab('export');
  document.getElementById('shareModal').classList.add('active');
}

// Monta URL pronta pra compartilhar
// IMPORTANTE: usa raiz '/' em vez de location.pathname porque o SPA muda o pathname
// quando troca de aba (ex: /team-builder), e esse path não existe como arquivo no Netlify.
// Compartilhar a URL real causaria 404 no destinatário.
function buildShareUrl(code) {
  const base = location.origin + '/';
  return base + '?time=' + code;
}

function closeShareModal() {
  document.getElementById('shareModal').classList.remove('active');
}

function switchShareTab(name) {
  document.querySelectorAll('.share-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.stab === name));
  document.querySelectorAll('.share-pane').forEach(p =>
    p.classList.toggle('active', p.id === 'share-pane-' + name));
}

async function copyShareLink() {
  const input = document.getElementById('shareLinkInput');
  if (!input) return;
  const code = input.value || '';
  if (!code) {
    showTeamShareToast('Nada para copiar.', 'error');
    return;
  }

  let copied = false;

  // Estratégia 1: Clipboard API (HTTPS necessário)
  try {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(code);
      copied = true;
    }
  } catch(_) {}

  // Estratégia 2: execCommand com input próprio (fallback)
  if (!copied) {
    try {
      input.removeAttribute('readonly');
      input.focus();
      input.select();
      input.setSelectionRange(0, code.length);
      copied = document.execCommand('copy');
      input.setAttribute('readonly', 'readonly');
      input.blur();
    } catch(_) {}
  }

  // Estratégia 3: criar textarea temporário
  if (!copied) {
    try {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.left = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      copied = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch(_) {}
  }

  if (copied) {
    showTeamShareToast('✓ Código copiado! Cole e envie pra quem quiser.', 'success');
  } else {
    // Última tentativa: deixa selecionado pro usuário copiar manualmente
    input.removeAttribute('readonly');
    input.focus();
    input.select();
    showTeamShareToast('Não foi possível copiar automaticamente. Use Ctrl+C com o texto selecionado.', 'error');
  }
}

// Abre o modal direto na aba "Importar" — sem precisar de time montado
function openImportModal() {
  // Limpa o campo de exportar (caso tenha algo antigo) e o de importar
  const expInput = document.getElementById('shareLinkInput');
  if (expInput) {
    expInput.value = encodeTeamData(buildTeamShareData()); // mostra time atual mesmo se vazio
  }
  const summary = document.getElementById('shareSummary');
  if (summary) summary.innerHTML = buildTeamSummary();

  const imp = document.getElementById('shareImportInput');
  if (imp) imp.value = '';

  switchShareTab('import');
  document.getElementById('shareModal').classList.add('active');

  // Foca no input de importar
  setTimeout(() => { if (imp) imp.focus(); }, 100);
}

function loadTeamFromCode(code) {
  const data = decodeTeamData(code);
  if (!data || !data.v) {
    showTeamShareToast('Código inválido. Verifique se copiou tudo.', 'error');
    return false;
  }

  // Resetar
  codexTeamMain = [null, null, null, null, null, null, null, null, null];
  codexTeamSupport = [null, null];
  heroArtifacts = {};
  heroCards = {};

  let loaded = 0;
  if (Array.isArray(data.m)) {
    data.m.forEach((hid, i) => {
      if (i >= 9 || !hid) return;
      const hero = CODEX_HEROES.find(h => h.id === hid);
      if (hero) { codexTeamMain[i] = hero; loaded++; }
    });
  }
  if (Array.isArray(data.s)) {
    data.s.forEach((hid, i) => {
      if (i >= 2 || !hid) return;
      const hero = CODEX_HEROES.find(h => h.id === hid);
      if (hero) { codexTeamSupport[i] = hero; loaded++; }
    });
  }
  if (data.a && typeof data.a === 'object') {
    Object.entries(data.a).forEach(([hid, aid]) => {
      const art = CODEX_ARTIFACTS.find(a => a.id === aid);
      if (art) heroArtifacts[hid] = art;
    });
  }
  if (data.c && typeof data.c === 'object') {
    Object.entries(data.c).forEach(([hid, ids]) => {
      if (!Array.isArray(ids)) return;
      heroCards[hid] = ids.map(cid => cid ? (CODEX_CARDS.find(c => c.id === cid) || null) : null);
      // Garante array de 5
      while (heroCards[hid].length < 5) heroCards[hid].push(null);
    });
  }

  renderTeamSlotsUI();
  closeShareModal();
  showTeamShareToast(`✓ Time carregado! ${loaded} cavaleiros importados.`, 'success');
  return true;
}

function loadTeamFromImport() {
  const input = document.getElementById('shareImportInput');
  let code = (input.value || '').trim();
  if (!code) {
    showTeamShareToast('Cole o código antes de carregar.', 'error');
    return;
  }

  // Extrai código se colaram URL completa
  code = extractCodeFromUrl(code);

  // Detecta se é tier list (estrutura diferente do team)
  const data = decodeTeamData(code);
  if (data && data.t === 'tier') {
    loadTierFromCode(code);
    return;
  }

  loadTeamFromCode(code);
}

// Aceita URL completa OU código puro — sempre retorna só o código
function extractCodeFromUrl(input) {
  const s = String(input || '').trim();
  // Já é só o código (não tem ? nem :)
  if (!s.includes('?') && !s.includes('://')) return s;
  // Procura por ?time= ou &time=
  const m = s.match(/[?&]time=([^&#\s]+)/i);
  return m ? m[1] : s;
}

// Hook nos botões
document.addEventListener('DOMContentLoaded', () => {
  const shareBtn = document.getElementById('teamShareBtn');
  if (shareBtn) shareBtn.addEventListener('click', openShareModal);

  const importBtn = document.getElementById('teamImportBtn');
  if (importBtn) importBtn.addEventListener('click', openImportModal);

  const copyBtn = document.getElementById('shareCopyBtn');
  if (copyBtn) copyBtn.addEventListener('click', copyShareLink);

  const loadBtn = document.getElementById('shareLoadBtn');
  if (loadBtn) loadBtn.addEventListener('click', loadTeamFromImport);

  // Enter no campo de importar carrega o time
  const impInput = document.getElementById('shareImportInput');
  if (impInput) {
    impInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadTeamFromImport();
      }
    });
  }

  // Tabs do modal
  document.querySelectorAll('.share-tab').forEach(t => {
    t.addEventListener('click', () => switchShareTab(t.dataset.stab));
  });

  const shareModal = document.getElementById('shareModal');
  if (shareModal) {
    shareModal.addEventListener('click', (e) => {
      if (e.target === shareModal) closeShareModal();
    });
  }

  // ═══════ AUTO-IMPORT: carrega time/tier da URL ?time=... ═══════
  // Roda 1x ao abrir página, com pequeno delay pra garantir que codex já carregou
  setTimeout(autoLoadFromUrl, 400);
});

// Importa time/tier list automaticamente se a URL tiver ?time=CODIGO
function autoLoadFromUrl() {
  try {
    const params = new URLSearchParams(location.search);
    const code = params.get('time');
    if (!code) return;
    const data = decodeTeamData(code);
    if (!data) {
      showTeamShareToast('Código inválido na URL.', 'error');
      return;
    }
    // Limpa o parâmetro da URL pra não recarregar em refresh
    const cleanUrl = location.origin + location.pathname + location.hash;
    history.replaceState(null, '', cleanUrl);

    if (data.t === 'tier') {
      // Tier list
      if (typeof loadTierFromCode === 'function') {
        loadTierFromCode(code);
        showTeamShareToast('🎖 Tier List carregada da URL!', 'success');
        // Navega pra aba Tier
        if (typeof switchTab === 'function') switchTab('tier');
      }
    } else {
      // Team
      if (typeof loadTeamFromCode === 'function') {
        loadTeamFromCode(code);
        showTeamShareToast('⚒ Time carregado da URL!', 'success');
        if (typeof switchTab === 'function') switchTab('team');
      }
    }
  } catch (e) {
    console.warn('Auto-import falhou:', e);
  }
}

// Fechar modal ao clicar fora
document.getElementById('codexModal').addEventListener('click', e => {
  if (e.target.id === 'codexModal') closeCodexModal();
});

// ═══════ ATALHOS DE TECLADO ═══════
document.addEventListener('keydown', e => {
  // Não interfere se está digitando em input/textarea/select
  const tag = (e.target && e.target.tagName) || '';
  const isTyping = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable);

  // ESC → fecha qualquer modal aberto / volta da view de detalhe do herói
  if (e.key === 'Escape') {
    // 1. Modal de compartilhar
    const shareModal = document.getElementById('shareModal');
    if (shareModal && shareModal.classList.contains('active')) {
      closeShareModal();
      return;
    }
    // 2. Modal do codex (heróis/artefatos/cartas)
    const codexModal = document.getElementById('codexModal');
    if (codexModal && codexModal.classList.contains('active')) {
      closeCodexModal();
      return;
    }
    // 3. Modal de auth
    const authModal = document.getElementById('authModal');
    if (authModal && authModal.classList.contains('active')) {
      closeAuthModal();
      return;
    }
    // 4. Modal admin auth
    const authAdminModal = document.getElementById('authAdminModal');
    if (authAdminModal && authAdminModal.classList.contains('active')) {
      closeAuthAdminModal();
      return;
    }
    // 4b. Modal de contato
    const contactModal = document.getElementById('contactModal');
    if (contactModal && contactModal.classList.contains('active')) {
      closeContactModal();
      return;
    }
    // 5. View de detalhe de herói
    const detail = document.getElementById('hero-detail-view');
    if (detail && detail.style.display !== 'none' && detail.style.display !== '') {
      hideHeroDetail();
      return;
    }
  }

  if (isTyping) return; // Os atalhos abaixo não rodam se estiver digitando

  // Atalhos numéricos pra trocar de aba (1-8)
  if (e.key >= '1' && e.key <= '8' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const idx = parseInt(e.key, 10) - 1;
    const tabs = document.querySelectorAll('.tab-btn');
    if (tabs[idx]) {
      tabs[idx].click();
      e.preventDefault();
    }
  }
});

// ════════════════════════════════════════════════════════════
// 🔐 SISTEMA DE AUTENTICAÇÃO (frontend)
// ════════════════════════════════════════════════════════════
const AUTH_STORAGE_KEY = 'triade_auth_v1';
let _authState = { token: null, user: null, validated: false };

// ─── Persistência local ───
function authLoadFromStorage() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.token) {
        _authState.token = parsed.token;
        _authState.user = parsed.user;
      }
    }
  } catch(_) {}
}
function authSaveToStorage() {
  try {
    if (_authState.token && _authState.user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({token: _authState.token, user: _authState.user}));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch(_) {}
}

function isLoggedIn() {
  return !!(_authState.token && _authState.user);
}

// Verifica se o token salvo ainda é válido no backend
async function authValidateStoredToken() {
  if (!_authState.token) {
    _authState.validated = true;
    return false;
  }
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'authValidateToken', token: _authState.token })
    });
    const data = await res.json();
    if (data.ok) {
      _authState.user = data.user;
      _authState.validated = true;
      authSaveToStorage();
      updateAuthUI();
      return true;
    } else {
      // Token inválido/expirado
      _authState.token = null;
      _authState.user = null;
      _authState.validated = true;
      authSaveToStorage();
      updateAuthUI();
      return false;
    }
  } catch(_) {
    _authState.validated = true;
    return false;
  }
}

// Atualiza UI conforme estado de auth (botão login/logout, cadeados)
// ════════════════════════════════════════════════════════════
// 🌗 TOGGLE DE TEMA (Dark / Light)
// ════════════════════════════════════════════════════════════
function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme'); // dark é default
  }
  // Atualiza meta theme-color (cor da barra do navegador mobile)
  const meta = document.getElementById('themeColorMeta');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f5f1ea' : '#0e0e12');
}

function toggleTheme() {
  const current = getCurrentTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('triadeTheme', next); } catch(e) {}
}

function initTheme() {
  // Já foi aplicado no script inicial (anti-flash), só garante consistência
  let saved = null;
  try { saved = localStorage.getItem('triadeTheme'); } catch(e) {}
  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved);
  } else {
    applyTheme('dark'); // default
  }
}

// Aplica tema no load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

function updateAuthUI() {
  const loginBtn = document.getElementById('authLoginBtn');
  const userInfo = document.getElementById('authUserInfo');
  const adminBtn = document.getElementById('authAdminLinkBtn');
  if (isLoggedIn()) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (userInfo) {
      userInfo.style.display = 'flex';
      userInfo.querySelector('.auth-user-nick').textContent = _authState.user.nick || _authState.user.email;
    }
    // Botão Pendentes só aparece se for líder
    if (adminBtn) {
      adminBtn.style.display = (_authState.user && _authState.user.isLeader) ? '' : 'none';
    }
    // Bloco "Modo Líder" só aparece se for líder
    var modoLiderBlock = document.getElementById('modo-lider-block');
    if (modoLiderBlock) {
      modoLiderBlock.style.display = (_authState.user && _authState.user.isLeader) ? '' : 'none';
    }
  } else {
    if (loginBtn) loginBtn.style.display = '';
    if (userInfo) userInfo.style.display = 'none';
    if (adminBtn) adminBtn.style.display = 'none';
    var modoLiderBlock2 = document.getElementById('modo-lider-block');
    if (modoLiderBlock2) modoLiderBlock2.style.display = 'none';
  }
  // Atualiza cadeados nas abas
  updateTabsLockUI();
  // Atualiza visibilidade do bloco de relatório no painel de Stats
  if (typeof updateStatsReportBlock === 'function') updateStatsReportBlock();
}

function updateTabsLockUI() {
  // Só a aba "Guilda" pode ficar travada (todas as áreas privadas ficam dentro dela)
  const btn = document.querySelector('.tab-btn[data-tab="guilda"]');
  if (!btn) return;
  if (!isLoggedIn()) {
    btn.classList.add('locked-tab');
    if (!btn.querySelector('.lock-icon')) {
      const lockIcon = document.createElement('span');
      lockIcon.className = 'lock-icon';
      lockIcon.textContent = ' 🔒';
      btn.appendChild(lockIcon);
    }
  } else {
    btn.classList.remove('locked-tab');
    const lock = btn.querySelector('.lock-icon');
    if (lock) lock.remove();
  }
}

// Verifica se pode acessar uma aba; se não, mostra modal
function canAccessTab(tabId) {
  const info = TAB_ROUTES[tabId];
  if (!info) return true;
  if (!info.private) return true;
  return isLoggedIn();
}

// ─── Modais ───
function openAuthModal(view) {
  view = view || 'login';
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.add('active');
  switchAuthView(view);
}
function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('active');
}
function switchAuthView(view) {
  document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('authView-' + view);
  if (target) target.classList.add('active');
  // Limpa msgs
  document.querySelectorAll('.auth-msg').forEach(m => { m.textContent = ''; m.className = 'auth-msg'; });
  // Auto-focus 1º input
  setTimeout(() => {
    const inp = target && target.querySelector('input, select');
    if (inp) inp.focus();
  }, 100);
  // Carrega lista de nicks ao abrir cadastro
  if (view === 'register') {
    authLoadNicksDisponiveis();
  }
}

// Carrega nicks da Jogadores que ainda não têm conta
async function authLoadNicksDisponiveis() {
  const sel = document.getElementById('authRegNick');
  if (!sel) return;
  sel.innerHTML = `<option value="">${ui('auth.regNickLoading')}</option>`;
  sel.disabled = true;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'authGetNicks' })
    });
    const data = await res.json();
    if (data.ok && Array.isArray(data.nicks)) {
      if (data.nicks.length === 0) {
        sel.innerHTML = `<option value="">${ui('auth.noNicks')}</option>`;
      } else {
        sel.innerHTML = `<option value="">${ui('auth.selectNick')}</option>` +
          data.nicks.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n.replace(/</g, '&lt;')}</option>`).join('');
      }
    } else {
      sel.innerHTML = `<option value="">${ui('auth.errorLoadNicks')}</option>`;
    }
  } catch(err) {
    sel.innerHTML = `<option value="">${ui('auth.connectionError')}</option>`;
  } finally {
    sel.disabled = false;
  }
}

function authShowMsg(viewId, msg, type) {
  const el = document.querySelector('#authView-' + viewId + ' .auth-msg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'auth-msg ' + (type || '');
}

// ─── Submits ───
async function authSubmitLogin(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('authLoginEmail').value.trim().toLowerCase();
  const senha = document.getElementById('authLoginPassword').value;
  if (!email || !senha) { authShowMsg('login', 'Preencha email e senha', 'error'); return; }

  const btn = document.getElementById('authLoginSubmitBtn');
  setButtonLoading(btn, true, 'Entrando...');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'authLogin', email, senha })
    });
    const data = await res.json();
    if (data.ok) {
      _authState.token = data.token;
      _authState.user = data.user;
      authSaveToStorage();
      updateAuthUI();
      closeAuthModal();
      toast({ title: '⚔ Bem-vindo', msg: data.user.nick, type: 'success' });
    } else {
      authShowMsg('login', data.error || 'Erro', 'error');
    }
  } catch(err) {
    authShowMsg('login', 'Erro de conexão', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function authSubmitRegister(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('authRegEmail').value.trim().toLowerCase();
  const nick = document.getElementById('authRegNick').value.trim();
  const senha = document.getElementById('authRegPassword').value;
  const senha2 = document.getElementById('authRegPassword2').value;

  if (!email || !nick || !senha) { authShowMsg('register', 'Preencha todos os campos', 'error'); return; }
  if (senha !== senha2) { authShowMsg('register', 'As senhas não coincidem', 'error'); return; }
  if (senha.length < 6) { authShowMsg('register', 'A senha precisa ter pelo menos 6 caracteres', 'error'); return; }

  const btn = document.getElementById('authRegSubmitBtn');
  setButtonLoading(btn, true, 'Cadastrando...');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'authRegister', email, senha, nick })
    });
    const data = await res.json();
    if (data.ok) {
      switchAuthView('pending');
    } else {
      authShowMsg('register', data.error || 'Erro', 'error');
    }
  } catch(err) {
    authShowMsg('register', 'Erro de conexão', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function authSubmitForgot(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('authForgotEmail').value.trim().toLowerCase();
  if (!email) { authShowMsg('forgot', 'Informe o email', 'error'); return; }

  const btn = document.getElementById('authForgotSubmitBtn');
  setButtonLoading(btn, true, 'Enviando...');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'authForgotPassword', email })
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('authResetEmail').value = email;
      switchAuthView('reset');
      authShowMsg('reset', data.message || 'Código enviado por email', 'ok');
    } else {
      authShowMsg('forgot', data.error || 'Erro', 'error');
    }
  } catch(err) {
    authShowMsg('forgot', 'Erro de conexão', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function authSubmitReset(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('authResetEmail').value.trim().toLowerCase();
  const codigo = document.getElementById('authResetCode').value.trim();
  const novaSenha = document.getElementById('authResetPassword').value;
  if (!email || !codigo || !novaSenha) { authShowMsg('reset', 'Preencha tudo', 'error'); return; }

  const btn = document.getElementById('authResetSubmitBtn');
  setButtonLoading(btn, true, 'Salvando...');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'authResetPassword', email, codigo, novaSenha })
    });
    const data = await res.json();
    if (data.ok) {
      toast({ msg: ui('msg.passwordReset'), type: 'success' });
      switchAuthView('login');
      document.getElementById('authLoginEmail').value = email;
    } else {
      authShowMsg('reset', data.error || 'Erro', 'error');
    }
  } catch(err) {
    authShowMsg('reset', 'Erro de conexão', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function authLogout() {
  const token = _authState.token;
  _authState.token = null;
  _authState.user = null;
  authSaveToStorage();
  updateAuthUI();
  toast({ msg: ui('msg.loggedOut'), type: 'info' });
  // Se estava na área da Guilda, manda pro Início
  const currentBtn = document.querySelector('.tab-btn.active');
  if (currentBtn && currentBtn.dataset.tab === 'guilda') {
    navigateToTab('inicio');
  }
  // Avisa backend (best effort)
  if (token) {
    try {
      fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'authLogout', token })
      });
    } catch(_) {}
  }
}

// ─── Painel admin de aprovação ───
async function openAuthAdminPanel() {
  // Se não está logado, pede senha (compat antiga)
  if (!_authState || !_authState.token) {
    const senha = prompt('Você precisa estar logado como líder. Senha de admin (compatibilidade):');
    if (!senha) return;
    return openAuthAdminPanelLegacy(senha);
  }

  // Logado: usa authToken
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'authListPending', authToken: _authState.token })
    });
    const data = await res.json();
    if (!data.ok) {
      toast({ msg: data.error || 'Erro ao carregar pendentes', type: 'error' });
      if (data.sessionExpired) {
        if (typeof authLogout === 'function') authLogout();
      }
      return;
    }
    renderAuthAdminPanel(data.pendentes || []);
  } catch(err) {
    toast({ msg: ui('msg.connError'), type: 'error' });
  }
}

// Fallback antigo (senha admin)
async function openAuthAdminPanelLegacy(senha) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'authListPending', senha })
    });
    const data = await res.json();
    if (!data.ok) { toast({ msg: data.error || 'Erro', type: 'error' }); return; }
    renderAuthAdminPanel(data.pendentes || [], senha);
  } catch(err) {
    toast({ msg: ui('msg.connError'), type: 'error' });
  }
}

// Recarrega a lista (após aprovar/negar)
async function reloadAuthAdminPanel() {
  const body = document.getElementById('authAdminBody');
  const senhaLegacy = body && body.dataset.senha;

  try {
    const payload = senhaLegacy
      ? { action: 'authListPending', senha: senhaLegacy }
      : { action: 'authListPending', authToken: (_authState && _authState.token) || '' };

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) {
      renderAuthAdminPanel(data.pendentes || [], senhaLegacy);
    }
  } catch(err) {
    // silencia — usuário já viu o toast da ação principal
  }
}

function renderAuthAdminPanel(pendentes, senhaLegacy) {
  const modal = document.getElementById('authAdminModal');
  const body = document.getElementById('authAdminBody');
  if (!modal || !body) return;
  modal.classList.add('active');

  // Guarda senha legacy (se houver) pra recarregar lista
  if (senhaLegacy) {
    body.dataset.senha = senhaLegacy;
  } else {
    delete body.dataset.senha;
  }

  if (!pendentes || pendentes.length === 0) {
    body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--ink-dim);font-style:italic;">${ui('admin.noPending')} 🎉</div>`;
    return;
  }

  body.innerHTML = pendentes.map((p, idx) => {
    const emailSafe = escapeHtml(p.email);
    const emailAttr = emailSafe.replace(/'/g, '&#39;');
    return `
    <div class="auth-admin-row">
      <div class="auth-admin-info">
        <div class="auth-admin-nick">${escapeHtml(p.nick)}</div>
        <div class="auth-admin-email">${emailSafe}</div>
        <div class="auth-admin-date">${escapeHtml(p.criadoEm)}</div>
      </div>
      <div class="auth-admin-controls">
        <select class="auth-admin-guilda" id="adminGuilda_${idx}">
          <option value="Triade" selected>Triade</option>
          <option value="__other__">Outra…</option>
        </select>
        <input type="text" class="auth-admin-guilda-other" id="adminGuildaOther_${idx}"
               placeholder="Digite o nome…" style="display:none;" maxlength="40">
        <div class="auth-admin-actions">
          <button class="auth-admin-btn approve" onclick="authApprovePending('${emailAttr}', ${idx})">✓ Aprovar</button>
          <button class="auth-admin-btn deny" onclick="authDenyPending('${emailAttr}')">✕ Negar</button>
        </div>
      </div>
    </div>
  `;}).join('');

  // Listener pra mostrar input quando "Outra…" for selecionado
  pendentes.forEach((_, idx) => {
    const sel = document.getElementById('adminGuilda_' + idx);
    const inp = document.getElementById('adminGuildaOther_' + idx);
    if (!sel || !inp) return;
    sel.addEventListener('change', () => {
      if (sel.value === '__other__') {
        inp.style.display = '';
        inp.focus();
      } else {
        inp.style.display = 'none';
        inp.value = '';
      }
    });
  });
}

// Constrói payload de auth (authToken se logado, senha senão)
function buildAuthAdminPayload() {
  const body = document.getElementById('authAdminBody');
  const senhaLegacy = body && body.dataset.senha;
  if (senhaLegacy) return { senha: senhaLegacy };
  if (_authState && _authState.token) return { authToken: _authState.token };
  return {};
}

async function authApprovePending(email, idx) {
  // Resolve guilda
  let guilda = 'Triade';
  const sel = document.getElementById('adminGuilda_' + idx);
  if (sel) {
    if (sel.value === '__other__') {
      const inp = document.getElementById('adminGuildaOther_' + idx);
      const val = (inp && inp.value || '').trim();
      if (!val) {
        toast({ msg: 'Digite o nome da guilda', type: 'error' });
        if (inp) inp.focus();
        return;
      }
      guilda = val;
    } else {
      guilda = sel.value || 'Triade';
    }
  }

  const authPayload = buildAuthAdminPayload();
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify(Object.assign({ action: 'authApprove', email, guilda }, authPayload))
    });
    const data = await res.json();
    if (data.ok) {
      toast({ msg: '✓ ' + email + ' aprovado em ' + guilda, type: 'success' });
      reloadAuthAdminPanel();
    } else {
      toast({ msg: data.error || 'Erro', type: 'error' });
    }
  } catch(err) {
    toast({ msg: ui('msg.connError'), type: 'error' });
  }
}

async function authDenyPending(email) {
  if (!confirm('Negar acesso de ' + email + '?')) return;
  const authPayload = buildAuthAdminPayload();
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify(Object.assign({ action: 'authDeny', email }, authPayload))
    });
    const data = await res.json();
    if (data.ok) {
      toast({ msg: '✕ ' + email + ' negado', type: 'warn' });
      reloadAuthAdminPanel();
    } else {
      toast({ msg: data.error || 'Erro', type: 'error' });
    }
  } catch(err) {
    toast({ msg: ui('msg.connError'), type: 'error' });
  }
}

function closeAuthAdminModal() {
  const modal = document.getElementById('authAdminModal');
  if (modal) modal.classList.remove('active');
}

// ════════════════════════════════════════════════════════════
// 📤 RELATÓRIO DE ATUALIZAÇÕES (envio manual pro Discord)
// ════════════════════════════════════════════════════════════
function updateStatsReportBlock() {
  const block = document.getElementById('statsReportBlock');
  if (!block) return;
  const isLeader = (typeof _authState !== 'undefined' && _authState && _authState.user && _authState.user.isLeader);
  block.style.display = isLeader ? '' : 'none';
}

async function enviarRelatorioAgora() {
  if (!_authState || !_authState.token) {
    toast({ msg: ui('msg.leaderRequired'), type: 'error' });
    return;
  }
  const btn = document.getElementById('statsReportBtn');
  const fb = document.getElementById('statsReportFeedback');
  if (fb) { fb.textContent = ''; fb.className = 'stats-report-feedback'; }

  if (!confirm(ui('msg.confirmReport'))) return;

  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Enviando...';
  }

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'relatorioDisparar', authToken: _authState.token })
    });
    const data = await res.json();
    if (data.ok) {
      const s = data.stats || {};
      if (fb) {
        fb.textContent = `✓ ${ui('msg.reportSent')} ${s.atualizados || 0} ${ui('msg.updated')} · ${s.pendentes || 0} ${ui('msg.pending')} · ${s.nuncaAtualizaram || 0} ${ui('msg.neverUpdated')}.`;
        fb.className = 'stats-report-feedback ok';
      }
      toast({ msg: '📤 ' + ui('msg.reportSentToast'), type: 'success' });
    } else {
      if (fb) {
        fb.textContent = '✗ ' + (data.error || 'Erro ao enviar');
        fb.className = 'stats-report-feedback err';
      }
      toast({ msg: data.error || ui('msg.reportError'), type: 'error' });
      if (data.sessionExpired && typeof authLogout === 'function') authLogout();
    }
  } catch(err) {
    if (fb) {
      fb.textContent = '✗ ' + ui('msg.connError');
      fb.className = 'stats-report-feedback err';
    }
    toast({ msg: ui('msg.connError'), type: 'error' });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📤 Enviar Agora';
    }
  }
}

// ════════════════════════════════════════════════════════════
// 💬 MODAL DE CONTATO (formulário de outras guildas)
// ════════════════════════════════════════════════════════════
function openContactModal() {
  const modal = document.getElementById('contactModal');
  if (!modal) return;
  modal.classList.add('active');
  // Reseta para form
  document.querySelectorAll('#contactModal .auth-view').forEach(v => v.classList.remove('active'));
  const form = document.getElementById('contactView-form');
  if (form) form.classList.add('active');
  // Limpa msg
  const msg = document.querySelector('#contactView-form .auth-msg');
  if (msg) { msg.textContent = ''; msg.className = 'auth-msg'; }
  // Foco no primeiro campo vazio
  setTimeout(() => {
    const nome = document.getElementById('contactNome');
    if (nome && !nome.value) { nome.focus(); return; }
    const email = document.getElementById('contactEmail');
    if (email && !email.value) { email.focus(); return; }
    const mensagem = document.getElementById('contactMensagem');
    if (mensagem) mensagem.focus();
  }, 100);
}

function closeContactModal() {
  const modal = document.getElementById('contactModal');
  if (modal) modal.classList.remove('active');
}

function contactShowMsg(msg, type) {
  const el = document.querySelector('#contactView-form .auth-msg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'auth-msg ' + (type || '');
}

async function contactSubmit(e) {
  if (e) e.preventDefault();
  const nome = document.getElementById('contactNome').value.trim();
  const email = document.getElementById('contactEmail').value.trim().toLowerCase();
  const guilda = document.getElementById('contactGuilda').value.trim();
  const mensagem = document.getElementById('contactMensagem').value.trim();

  if (!nome || !email || !mensagem) {
    contactShowMsg('Preencha nome, email e mensagem', 'error');
    return;
  }
  if (mensagem.length < 10) {
    contactShowMsg('Escreva uma mensagem com pelo menos 10 caracteres', 'error');
    return;
  }
  if (!validateEmail(email)) {
    contactShowMsg('Email inválido', 'error');
    return;
  }

  const btn = document.getElementById('contactSubmitBtn');
  setButtonLoading(btn, true, 'Enviando...');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'contactSend', nome, email, guilda, mensagem })
    });
    const data = await res.json();
    if (data.ok) {
      // Vai pra view de sucesso
      document.querySelectorAll('#contactModal .auth-view').forEach(v => v.classList.remove('active'));
      const success = document.getElementById('contactView-success');
      if (success) success.classList.add('active');
      // Limpa form
      document.getElementById('contactNome').value = '';
      document.getElementById('contactEmail').value = '';
      document.getElementById('contactGuilda').value = '';
      document.getElementById('contactMensagem').value = '';
    } else {
      contactShowMsg(data.error || 'Erro ao enviar mensagem', 'error');
    }
  } catch(err) {
    contactShowMsg('Erro de conexão. Tente novamente.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

// Validação simples de email (fallback se já não existir)
if (typeof validateEmail !== 'function') {
  window.validateEmail = function(email) {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(String(email));
  };
}

// ─── Inicialização ───
authLoadFromStorage();
// Valida token de forma assíncrona (não bloqueia carregamento)
if (_authState.token) {
  authValidateStoredToken();
} else {
  _authState.validated = true;
  setTimeout(updateAuthUI, 100);
}
