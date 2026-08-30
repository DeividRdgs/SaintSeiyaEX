
// ╔══════════════════════════════════════════════╗
// ║  CONFIGURAÇÃO — COLE A URL DO APPS SCRIPT    ║
// ╚══════════════════════════════════════════════╝
const API_URL = "https://script.google.com/macros/s/AKfycbyHeTjW4NvbUBYWITS0YIyiL-k5kfxkTYiVSDfdEx0pij7W8FXd-LS_fKQk9qMkKEyZ/exec";
// ════════════════════════════════════════════════

// VERSÃO DO APP — atualize quando fizer mudanças relevantes
const APP_VERSION = 'v3.0.0';
const APP_VERSION_DATE = '10/05/2026';

// ════════════════════════════════════════════════════════════════
// 🌐 SISTEMA DE INTERNACIONALIZAÇÃO (i18n)
// Idiomas suportados: 'pt' (português, default), 'en' (inglês)
// ════════════════════════════════════════════════════════════════

const SUPPORTED_LANGS = ['pt', 'en', 'es'];
const DEFAULT_LANG = 'pt';

// Lê preferência salva (ou usa default)
let _lang = (function() {
  try {
    var saved = localStorage.getItem('triade-lang');
    if (saved && SUPPORTED_LANGS.indexOf(saved) >= 0) return saved;
  } catch (e) {}
  return DEFAULT_LANG;
})();

/**
 * Devolve o valor de um campo no idioma atual com fallback automático.
 *
 * Exemplos:
 *   t(hero, 'name')   // se _lang='en' e hero.name_en existe → name_en, senão name
 *   t(skill, 'desc')  // idem com desc_en
 *   t(bond, 'nome')   // idem com nome_en (campos PT em pt-BR)
 *
 * Regras:
 *  • Se _lang === 'pt' → retorna o campo original
 *  • Se _lang === 'en' → tenta o campo com _en; se vazio/ausente, cai pro PT
 *  • Pra strings comuns hardcoded em PT (ex: 'Cavaleiro Sagrado'),
 *    aplica um dicionário rápido COMMON_PT_TO_EN
 */
const COMMON_PT_TO_EN = {
  'Cavaleiro Sagrado': 'Sacred Knight',
  'Cavaleiro lendário cujos feitos ecoam pelas estrelas. Ajuste esta descrição depois.': 'Legendary knight whose deeds echo through the stars. Edit this description later.',
  'Cavaleiro lendário cujos feitos ecoam pelas estrelas.': 'Legendary knight whose deeds echo through the stars.'
};

function t(obj, campo) {
  if (!obj || !campo) return '';
  if (_lang === 'pt') {
    return obj[campo] != null ? obj[campo] : '';
  }
  // Inglês ou Espanhol: tenta sufixo do idioma atual
  var sufixo = '_' + _lang;
  var val = obj[campo + sufixo];
  if (val != null && val !== '') return val;
  // Fallback chain: ES → EN → PT
  if (_lang === 'es') {
    var valEn = obj[campo + '_en'];
    if (valEn != null && valEn !== '') return valEn;
  }
  // Fallback final: traduzir string comum ou retornar PT
  var ptVal = obj[campo] != null ? obj[campo] : '';
  if (_lang === 'en' && COMMON_PT_TO_EN[ptVal]) return COMMON_PT_TO_EN[ptVal];
  return ptVal;
}

/**
 * Devolve o locale apropriado para Intl/toLocaleString/localeCompare.
 *  pt → 'pt-BR', en → 'en-US', es → 'es-ES'
 */
function getLocale() {
  if (_lang === 'en') return 'en-US';
  if (_lang === 'es') return 'es-ES';
  return 'pt-BR';
}

/**
 * Devolve um texto da interface (~330 strings) traduzido.
 * Uso: ui('hero.power') → 'Poder' (pt), 'Power' (en), 'Poder' (es)
 * Se a chave não existe no idioma atual, faz fallback ES→EN→PT.
 */
function ui(chave) {
  var dict = UI_TEXTS[_lang] || UI_TEXTS.pt;
  if (dict[chave] != null) return dict[chave];
  // Fallback chain: ES → EN → PT
  if (_lang === 'es' && UI_TEXTS.en && UI_TEXTS.en[chave] != null) {
    return UI_TEXTS.en[chave];
  }
  if (UI_TEXTS.pt[chave] != null) return UI_TEXTS.pt[chave];
  // Sem tradução: retorna a própria chave (ajuda a debugar)
  return chave;
}

/**
 * Troca o idioma e dispara re-render das views ativas.
 */
function setLang(novoLang) {
  if (SUPPORTED_LANGS.indexOf(novoLang) < 0) return;
  if (novoLang === _lang) return;
  _lang = novoLang;
  try { localStorage.setItem('triade-lang', novoLang); } catch (e) {}
  // Atualiza atributo lang do HTML
  var langAttr = 'pt-BR';
  if (novoLang === 'en') langAttr = 'en';
  else if (novoLang === 'es') langAttr = 'es';
  document.documentElement.lang = langAttr;
  // Dispara re-renderização
  applyLangToUI();
}

/**
 * Aplica idioma atual em:
 *  • Atributo lang do HTML
 *  • Botão do seletor (mostra qual bandeira está ativa)
 *  • Textos da interface marcados com data-i18n
 *  • Re-render de views que dependem do codex
 */
function applyLangToUI() {
  var langAttrUI = 'pt-BR';
  if (_lang === 'en') langAttrUI = 'en';
  else if (_lang === 'es') langAttrUI = 'es';
  document.documentElement.lang = langAttrUI;

  // Setar variável CSS pra strings que vivem em pseudo-elementos (::before, ::after)
  document.documentElement.style.setProperty('--tier-empty-text', `"${ui('tier.dropHere')}"`);

  // 1. Marca botão ativo no seletor
  document.querySelectorAll('.lang-btn').forEach(function(btn) {
    if (btn.dataset.lang === _lang) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  // 2. Traduz elementos com data-i18n
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var traducao = ui(el.dataset.i18n);
    // Chave sem tradução (ex.: i18n.js antigo em cache): mantém o texto do HTML
    if (traducao === el.dataset.i18n) return;
    // Se a tradução contém tags HTML (ex: <strong>), usa innerHTML; senão textContent
    if (/<[a-z][\s\S]*>/i.test(traducao)) {
      el.innerHTML = traducao;
    } else {
      el.textContent = traducao;
    }
  });

  // 3. Traduz placeholders com data-i18n-placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    var ph = ui(el.dataset.i18nPlaceholder);
    if (ph !== el.dataset.i18nPlaceholder) el.placeholder = ph;
  });

  // 4. Traduz títulos (tooltip) com data-i18n-title
  document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
    var tt = ui(el.dataset.i18nTitle);
    if (tt !== el.dataset.i18nTitle) el.title = tt;
  });

  // 5. Re-renderiza vistas que dependem do codex
  // (cada uma checa se existe antes de chamar — algumas só rodam quando a aba está ativa)
  // Reset do flag init dos selects pra que sejam repopulados no novo idioma
  var todosFilters = [
    'codexFilterRarity','codexFilterFaction','codexFilterClass','codexFilterPosition','codexFilterDamage',
    'tierFilterRarity','tierFilterFaction','tierFilterClass','tierFilterPosition','tierFilterDamage',
    'teamFilterRarity','teamFilterFaction','teamFilterClass','teamFilterPosition','teamFilterDamage'
  ];
  todosFilters.forEach(function(id){
    var el = document.getElementById(id);
    if (el && el.options && el.options.length > 0) {
      // Guardar valor atual pra preservar a seleção do usuário
      var valorAtual = el.value;
      // Limpar listeners antigos (clonando o elemento)
      var clone = el.cloneNode(false);
      el.parentNode.replaceChild(clone, el);
      clone.dataset.savedValue = valorAtual;
    }
  });
  // Re-popular cada conjunto: heroes, tier, team
  try { if (typeof initHeroesTab === 'function') { var heroSel = document.getElementById('codexFilterRarity'); if (heroSel) delete heroSel.dataset.init; initHeroesTab(); } } catch (e) {}
  try { if (typeof _tierInit !== 'undefined' && _tierInit) { _tierInit = false; if (typeof initTierTab === 'function') initTierTab(); } } catch (e) {}
  try { if (typeof initTeamPoolFilters === 'function') {
    var teamPool = document.getElementById('teamPoolGrid');
    var teamFilterRarity = document.getElementById('teamFilterRarity');
    if (teamFilterRarity && teamFilterRarity.options.length === 0) initTeamPoolFilters();
  }} catch (e) {}
  // Restaurar seleções
  todosFilters.forEach(function(id){
    var el = document.getElementById(id);
    if (el && el.dataset.savedValue) {
      el.value = el.dataset.savedValue;
      delete el.dataset.savedValue;
    }
  });

  try { if (typeof renderHeroes === 'function') renderHeroes(); } catch (e) { console.warn('renderHeroes falhou:', e); }
  try { if (typeof renderArtifacts === 'function') renderArtifacts(); } catch (e) {}
  try { if (typeof populateCardRarityFilter === 'function') populateCardRarityFilter(); } catch (e) {}
  try { if (typeof renderCodexCards === 'function') renderCodexCards(); } catch (e) {}
  try { if (typeof renderTier === 'function') renderTier(); } catch (e) {}
  try { if (typeof renderTierPool === 'function') renderTierPool(); } catch (e) {}
  try { if (typeof renderTeamPool === 'function') renderTeamPool(); } catch (e) {}
  try { if (typeof renderTeamSlotsUI === 'function') renderTeamSlotsUI(); } catch (e) {}
  try { if (typeof renderTeamTabs === 'function') renderTeamTabs(); } catch (e) {}
  try { if (typeof renderTeamCombos === 'function') renderTeamCombos(); } catch (e) {}
  try { if (typeof updateTeamCounter === 'function') updateTeamCounter(); } catch (e) {}
  // Atualiza o title da página de acordo com a aba ativa no novo idioma
  try {
    if (typeof updatePageMeta === 'function') {
      var activeTab = document.querySelector('.tab-content.active');
      if (activeTab) {
        var tid = activeTab.id.replace('tab-', '');
        updatePageMeta(tid);
      }
    }
  } catch (e) {}
  // Re-renderiza dados dinâmicos das abas da Guilda usando o cache atual
  try {
    if (typeof readCache === 'function') {
      var cached = readCache();
      if (cached && cached.data && typeof renderEverything === 'function') {
        renderEverything(cached.data);
      }
    }
  } catch (e) {}
  // Re-renderiza stats também
  try { if (typeof renderStats === 'function') renderStats(); } catch (e) {}
  // Re-popula nick do usuário no hint (caso esteja na aba Update)
  try { if (typeof initUpdatePoderTab === 'function') initUpdatePoderTab(); } catch (e) {}

  // 6. Atualiza meta tags da aba ativa
  try { if (typeof updateTabSEO === 'function' && _currentTab) updateTabSEO(_currentTab); } catch (e) {}
}

// Dicionário de textos da interface — preenchido na Fase 4
// Cada chave é um id curto; valor é uma string em cada idioma
