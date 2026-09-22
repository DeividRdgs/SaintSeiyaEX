/* ═══════════════════════════════════════════════════════════
   CALCULADORA DE BANNER — portada de "CalculadoraSSX - SSR-UR.py"
   Dois modos com regras próprias:
   • SSR: 30 tickets azuis do banner, tickets/frags diários (azuis,
     roxos e gratuitos), pacotes R$12 → R$30 → R$60 → R$130 → R$180 →
     R$300 → R$600 especial → R$600 → R$1000; a cada 19 R$12 testados,
     5 viram 1 estatueta (14 R$12 + estatueta).
   • UR: 1 ticket + 2 frags por dia, estatueta de 8 tickets, pacotes
     R$12 → R$30 → R$60 → R$130 → R$180 → R$300 → R$300 especial →
     R$600 especial → R$600 → R$1000 especial → R$1000.
   Comum: 40 tickets ou 60 fragmentos por cópia, retorno de tickets
   (+5 a partir de 40, +5 a partir de 80, +10 a partir de 130) e
   complemento de 1 cópia com diamantes roxos (100 por fragmento).
   ═══════════════════════════════════════════════════════════ */

const CALC_COPIAS_POR_ESTRELA = {
  '0★': 0, '2★': 1, '3★': 2, '4★': 4, '5★': 7, '6★': 11, '7★': 16
};

const CALC_COMUM = {
  TICKETS_POR_COPIA: 40,
  FRAGMENTOS_POR_COPIA: 60,
  RETORNO_40: 5,
  RETORNO_80: 5,
  RETORNO_130: 10,
  DIAMANTES_POR_FRAGMENTO: 100
};

const CALC_MODOS = {
  SSR: {
    TICKETS_AZUIS_FIXOS: 30,
    CUSTO_TICKETS_AZUIS_FIXOS: 9600,
    TICKETS_AZUIS_DIA: 1,
    TICKETS_ROXOS_DIA: 1,
    FRAGMENTOS_GRATUITOS_DIA: 1,
    FRAGMENTOS_AZUIS_DIA: 1,
    FRAGMENTOS_ROXOS_DIA: 1,
    DIAMANTES_AZUIS_DIA: 500,
    DIAMANTES_ROXOS_DIA: 80,
    ESTATUETA: { tickets: 10, fragmentos: 5, preco: 60 },
    // R$12: 14 é o limite normal; ao chegar em 19 testados, 5 viram 1 estatueta
    LIMITE_R12_NORMAL: 14,
    LIMITE_R12_TESTE: 19,
    ORDEM: ['p12', 'p30', 'p60', 'p130', 'p180', 'p300', 'p600s', 'p600', 'p1000'],
    PACOTES: {
      p12:   { tickets: 2,   fragmentos: 2,  preco: 12 },
      p30:   { tickets: 4,   fragmentos: 4,  preco: 30 },
      p60:   { tickets: 6,   fragmentos: 6,  preco: 60 },
      p130:  { tickets: 15,  fragmentos: 0,  preco: 130 },
      p180:  { tickets: 18,  fragmentos: 0,  preco: 180 },
      p300:  { tickets: 25,  fragmentos: 0,  preco: 300 },
      p600s: { tickets: 50,  fragmentos: 20, preco: 600 },
      p600:  { tickets: 40,  fragmentos: 0,  preco: 600 },
      p1000: { tickets: 100, fragmentos: 30, preco: 1000 }
    },
    LIMITES: { p130: 3, p180: 3, p300: 6, p600s: 2, p600: 3, p1000: 2 }
  },
  UR: {
    TICKETS_DIA: 1,
    FRAGMENTOS_DIA: 1,
    FRAGMENTOS_FREE_DIA: 1,
    DIAMANTES_AZUIS_DIA: 500,
    DIAMANTES_ROXOS_DIA: 120,
    ESTATUETA: { tickets: 8, fragmentos: 5, preco: 60 },
    ORDEM: ['p12', 'p30', 'p60', 'p130', 'p180', 'p300', 'p300s', 'p600s', 'p600', 'p1000s', 'p1000'],
    PACOTES: {
      p12:    { tickets: 2,  fragmentos: 2,  preco: 12 },
      p30:    { tickets: 3,  fragmentos: 3,  preco: 30 },
      p60:    { tickets: 5,  fragmentos: 6,  preco: 60 },
      p130:   { tickets: 12, fragmentos: 0,  preco: 130 },
      p180:   { tickets: 15, fragmentos: 0,  preco: 180 },
      p300:   { tickets: 20, fragmentos: 0,  preco: 300 },
      p300s:  { tickets: 22, fragmentos: 0,  preco: 300 },
      p600s:  { tickets: 33, fragmentos: 20, preco: 600 },
      p600:   { tickets: 30, fragmentos: 20, preco: 600 },
      p1000s: { tickets: 70, fragmentos: 30, preco: 1000 },
      p1000:  { tickets: 60, fragmentos: 0,  preco: 1000 }
    },
    LIMITES: { p130: 3, p180: 3, p300: 3, p300s: 3, p600s: 2, p600: 3, p1000s: 2, p1000: 2 }
  }
};

/* ---------- testa uma combinação de pacotes (mesma conta do Python) ---------- */
function calcTestarCombinacao(modo, qts, estatuetasTotal, ticketsBase, fragmentosBase, copiasNecessarias, permitirDiamantes) {
  const M = CALC_MODOS[modo];
  const C = CALC_COMUM;

  const ticketsEstatueta = estatuetasTotal * M.ESTATUETA.tickets;
  const fragmentosEstatueta = estatuetasTotal * M.ESTATUETA.fragmentos;

  let ticketsPacotes = 0, fragmentosPacotes = 0, custoPacotes = 0;
  for (const k of M.ORDEM) {
    const q = qts[k] || 0;
    ticketsPacotes += q * M.PACOTES[k].tickets;
    fragmentosPacotes += q * M.PACOTES[k].fragmentos;
    custoPacotes += q * M.PACOTES[k].preco;
  }

  const ticketsAntesRetorno = ticketsBase + ticketsEstatueta + ticketsPacotes;
  const fragmentosFinais = fragmentosBase + fragmentosEstatueta + fragmentosPacotes;

  const copiasPorFragmentos = Math.min(copiasNecessarias, Math.floor(fragmentosFinais / C.FRAGMENTOS_POR_COPIA));
  const copiasQuePrecisamDeTickets = Math.max(0, copiasNecessarias - copiasPorFragmentos);
  const ticketsNecessarios = copiasQuePrecisamDeTickets * C.TICKETS_POR_COPIA;

  let retorno = 0;
  if (ticketsNecessarios >= 40) retorno += C.RETORNO_40;
  if (ticketsNecessarios >= 80) retorno += C.RETORNO_80;
  if (ticketsNecessarios >= 130) retorno += C.RETORNO_130;

  const ticketsFinais = ticketsAntesRetorno + retorno;
  const copiasPorTickets = Math.min(copiasQuePrecisamDeTickets, Math.floor(ticketsFinais / C.TICKETS_POR_COPIA));

  const fragmentosUsados = copiasPorFragmentos * C.FRAGMENTOS_POR_COPIA;
  const fragmentosSobrando = Math.max(0, fragmentosFinais - fragmentosUsados);

  const copiasRestantes = Math.max(0, copiasNecessarias - copiasPorTickets - copiasPorFragmentos);

  // SOMENTE UMA cópia pode ser completada por diamantes roxos (aba missão)
  let copiasPorDiamantes = 0;
  let diamantes = 0;
  if (permitirDiamantes && copiasRestantes > 0) {
    let faltaFragmentos = C.FRAGMENTOS_POR_COPIA - fragmentosSobrando;
    if (faltaFragmentos <= 0) faltaFragmentos = C.FRAGMENTOS_POR_COPIA;
    copiasPorDiamantes = 1;
    diamantes = faltaFragmentos * C.DIAMANTES_POR_FRAGMENTO;
  }

  const copiasTotais = copiasPorTickets + copiasPorFragmentos + copiasPorDiamantes;

  return {
    qts: Object.assign({}, qts),
    estatuetasTotal, ticketsEstatueta, fragmentosEstatueta,
    ticketsPacotes, fragmentosPacotes,
    ticketsFinais, ticketsNecessarios, retorno,
    fragmentosFinais, fragmentosUsados, fragmentosSobrando,
    copiasPorTickets, copiasPorFragmentos, copiasPorDiamantes,
    copiasTotais, copiasRestantes, diamantes, custoPacotes
  };
}

/* ---------- busca SSR (mesma sequência do Python) ----------
   R$12 vai de 0 a 19: até 18 conta como R$12 mesmo; em 19, 5 deles viram
   1 estatueta (exibe 14 R$12 + estatueta, R$60). Depois R$30 e R$60 até
   1 por dia, R$130 e R$180 até 3, um R$300 avulso, R$600 especial (1–2)
   com no máximo 1 R$300 solto, R$600 até 3 e R$1000 até 2. */
function calcBuscarSSR(dias, ticketsBase, fragmentosBase, copiasNecessarias, permitirDiamantes, estatuetaInformada) {
  const M = CALC_MODOS.SSR;
  const L = M.LIMITES;
  let melhor = null;

  const testar = qts => {
    const q12 = qts.p12 || 0;
    const troca = q12 >= M.LIMITE_R12_TESTE ? 1 : 0;
    const q = Object.assign({}, qts, { p12: troca ? M.LIMITE_R12_NORMAL : q12 });
    const r = calcTestarCombinacao('SSR', q, estatuetaInformada + troca, ticketsBase, fragmentosBase, copiasNecessarias, permitirDiamantes);
    if (r.copiasTotais < copiasNecessarias) return null;
    r.estatuetasTroca = troca;
    r.custoEstatueta = troca * M.ESTATUETA.preco;
    return r;
  };

  for (let q = 0; q <= M.LIMITE_R12_TESTE && !melhor; q++) melhor = testar({ p12: q });

  const base = { p12: M.LIMITE_R12_TESTE };
  for (let q = 0; q <= dias && !melhor; q++) melhor = testar(Object.assign({}, base, { p30: q }));
  base.p30 = dias;
  for (let q = 0; q <= dias && !melhor; q++) melhor = testar(Object.assign({}, base, { p60: q }));
  base.p60 = dias;
  for (let q = 0; q <= L.p130 && !melhor; q++) melhor = testar(Object.assign({}, base, { p130: q }));
  base.p130 = L.p130;
  for (let q = 0; q <= L.p180 && !melhor; q++) melhor = testar(Object.assign({}, base, { p180: q }));
  base.p180 = L.p180;

  if (!melhor) melhor = testar(Object.assign({}, base, { p300: 1 }));

  // cada 2 R$300 viram 1 R$600 especial (mesmo preço, +20 frags); sobra no máx. 1 R$300
  for (let q600s = 1; q600s <= L.p600s && !melhor; q600s++) {
    for (let q300 = 0; q300 <= 1 && !melhor; q300++) {
      melhor = testar(Object.assign({}, base, { p600s: q600s, p300: q300 }));
    }
  }
  base.p300 = 0;
  base.p600s = L.p600s;
  for (let q = 0; q <= L.p600 && !melhor; q++) melhor = testar(Object.assign({}, base, { p600: q }));
  base.p600 = L.p600;
  for (let q = 0; q <= L.p1000 && !melhor; q++) melhor = testar(Object.assign({}, base, { p1000: q }));

  return melhor;
}

/* ---------- busca UR (mesma sequência do Python) ----------
   R$12, R$30 e R$60 até 1 por dia; R$130 até 3; a partir do R$180 o
   script original fixa 1× R$130 e segue R$180 → R$300 → R$300 especial →
   R$600 especial → R$600 → R$1000 especial → R$1000, cada um até o limite. */
function calcBuscarUR(dias, ticketsBase, fragmentosBase, copiasNecessarias, permitirDiamantes, estatuetaInformada) {
  const M = CALC_MODOS.UR;
  const L = M.LIMITES;
  let melhor = null;

  const testar = qts => {
    const r = calcTestarCombinacao('UR', qts, estatuetaInformada, ticketsBase, fragmentosBase, copiasNecessarias, permitirDiamantes);
    if (r.copiasTotais < copiasNecessarias) return null;
    r.estatuetasTroca = 0;
    r.custoEstatueta = estatuetaInformada * M.ESTATUETA.preco;
    return r;
  };

  const base = {};
  for (let q = 0; q <= dias && !melhor; q++) melhor = testar({ p12: q });
  base.p12 = dias;
  for (let q = 0; q <= dias && !melhor; q++) melhor = testar(Object.assign({}, base, { p30: q }));
  base.p30 = dias;
  for (let q = 0; q <= dias && !melhor; q++) melhor = testar(Object.assign({}, base, { p60: q }));
  base.p60 = dias;
  for (let q = 0; q <= L.p130 && !melhor; q++) melhor = testar(Object.assign({}, base, { p130: q }));
  base.p130 = 1; // segue o script original: daqui em diante 1× R$130

  for (const key of ['p180', 'p300', 'p300s', 'p600s', 'p600', 'p1000s', 'p1000']) {
    for (let q = 0; q <= L[key] && !melhor; q++) melhor = testar(Object.assign({}, base, { [key]: q }));
    base[key] = L[key];
  }
  return melhor;
}

/* ---------- helpers de exibição ---------- */
function _calcLocale() {
  const l = (typeof _lang !== 'undefined' && _lang) ? _lang : 'pt';
  return l === 'en' ? 'en-US' : (l === 'es' ? 'es-ES' : 'pt-BR');
}
function _calcNum(v) { return Number(v).toLocaleString(_calcLocale()); }
function _calcMoney(v) {
  return 'R$ ' + Number(v).toLocaleString(_calcLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _calcRow(labelKey, value, strong, hint) {
  return '<div class="calc-row"><span>' + ui(labelKey) +
    (hint ? ' <small class="calc-hint">' + hint + '</small>' : '') +
    '</span><b class="' + (strong ? 'calc-strong' : '') + '">' + value + '</b></div>';
}
function _calcSec(labelKey, icon) {
  return '<h4 class="calc-sec">' + icon + ' ' + ui(labelKey) + '</h4>';
}
function _calcModo() {
  const el = document.getElementById('calcTipo');
  return el && el.value === 'UR' ? 'UR' : 'SSR';
}

/* ---------- cálculo principal ---------- */
function calcRun() {
  const msg = document.getElementById('calcMsg');
  const out = document.getElementById('calcResultado');
  if (!out) return;
  if (msg) { msg.textContent = ''; msg.className = 'calc-msg'; }

  const ticketsAtuais = parseInt(document.getElementById('calcTickets').value, 10);
  const fragmentosAtuais = parseInt(document.getElementById('calcFragmentos').value, 10);
  const dias = parseInt(document.getElementById('calcDias').value, 10);
  const copiasSobrando = parseInt(document.getElementById('calcCopias').value, 10);

  if ([ticketsAtuais, fragmentosAtuais, dias, copiasSobrando].some(v => isNaN(v))) {
    if (msg) { msg.textContent = ui('calc.errNumbers'); msg.className = 'calc-msg error'; }
    return;
  }
  if (ticketsAtuais < 0 || fragmentosAtuais < 0 || dias < 0 || copiasSobrando < 0) {
    if (msg) { msg.textContent = ui('calc.errNegative'); msg.className = 'calc-msg error'; }
    return;
  }

  const modo = _calcModo();
  const estrelaAtual = document.getElementById('calcEstrela').value;
  const objetivo = document.getElementById('calcObjetivo').value;
  const estatuetaInformada = document.getElementById('calcEstatueta').value === 'sim' ? 1 : 0;
  const permitirDiamantes = document.getElementById('calcDiamantes').value === 'sim';

  const copiasNecessarias = Math.max(0,
    CALC_COPIAS_POR_ESTRELA[objetivo] - CALC_COPIAS_POR_ESTRELA[estrelaAtual] - copiasSobrando);

  const d = calcMontarBase(modo, dias, ticketsAtuais, fragmentosAtuais);
  Object.assign(d, { modo, dias, estrelaAtual, objetivo, copiasSobrando, copiasNecessarias, estatuetaInformada, permitirDiamantes });

  // objetivo já atingido: resumo com tudo zerado (como no Python, sem estatueta)
  if (copiasNecessarias === 0) {
    d.melhor = calcTestarCombinacao(modo, {}, 0, d.ticketsBase, d.fragmentosBase, 0, false);
    d.melhor.estatuetasTroca = 0;
    d.melhor.custoEstatueta = 0;
    d.status = 'already';
    calcRender(d);
    return;
  }

  const buscar = modo === 'UR' ? calcBuscarUR : calcBuscarSSR;
  const melhor = buscar(dias, d.ticketsBase, d.fragmentosBase, copiasNecessarias, permitirDiamantes, estatuetaInformada);

  if (!melhor) {
    out.innerHTML = '<div class="calc-status fail">✗ ' + ui('calc.stImpossible') + '</div>';
    return;
  }

  d.melhor = melhor;
  d.status = 'ok';
  calcRender(d);
}

/* recursos base (antes de pacotes/estatueta) e linhas de exibição por modo */
function calcMontarBase(modo, dias, ticketsAtuais, fragmentosAtuais) {
  const M = CALC_MODOS[modo];
  if (modo === 'UR') {
    const ticketsDiarios = dias * M.TICKETS_DIA;
    const fragmentosDiarios = dias * M.FRAGMENTOS_DIA;
    const fragmentosFree = dias * M.FRAGMENTOS_FREE_DIA;
    return {
      ticketsAtuais, fragmentosAtuais,
      ticketsBase: ticketsAtuais + ticketsDiarios,
      fragmentosBase: fragmentosAtuais + fragmentosDiarios + fragmentosFree,
      ticketsRows: [['calc.tCurrent', ticketsAtuais], ['calc.tDaily', ticketsDiarios]],
      fragRows: [['calc.fCurrent', fragmentosAtuais], ['calc.fDaily', fragmentosDiarios], ['calc.fFree', fragmentosFree]],
      diamondRows: [
        ['calc.dBlueDaily', dias * M.DIAMANTES_AZUIS_DIA, '💙'],
        ['calc.dPurpleDaily', dias * M.DIAMANTES_ROXOS_DIA, '💜']
      ]
    };
  }
  const ticketsAzuis = dias * M.TICKETS_AZUIS_DIA;
  const ticketsRoxos = dias * M.TICKETS_ROXOS_DIA;
  const fragmentosGratuitos = dias * M.FRAGMENTOS_GRATUITOS_DIA;
  const fragmentosAzuis = dias * M.FRAGMENTOS_AZUIS_DIA;
  const fragmentosRoxos = dias * M.FRAGMENTOS_ROXOS_DIA;
  return {
    ticketsAtuais, fragmentosAtuais,
    ticketsBase: ticketsAtuais + M.TICKETS_AZUIS_FIXOS + ticketsAzuis + ticketsRoxos,
    fragmentosBase: fragmentosAtuais + fragmentosGratuitos + fragmentosAzuis + fragmentosRoxos,
    ticketsRows: [
      ['calc.tCurrent', ticketsAtuais],
      ['calc.tBlueBanner', M.TICKETS_AZUIS_FIXOS],
      ['calc.tBlueDaily', ticketsAzuis],
      ['calc.tPurpleDaily', ticketsRoxos]
    ],
    fragRows: [
      ['calc.fCurrent', fragmentosAtuais],
      ['calc.fFree', fragmentosGratuitos],
      ['calc.fBlueDaily', fragmentosAzuis],
      ['calc.fPurpleDaily', fragmentosRoxos]
    ],
    diamondRows: [
      ['calc.dBlueBanner', M.CUSTO_TICKETS_AZUIS_FIXOS, '💙'],
      ['calc.dBlueDaily', dias * M.DIAMANTES_AZUIS_DIA, '💙'],
      ['calc.dPurpleDaily', dias * M.DIAMANTES_ROXOS_DIA, '💜']
    ]
  };
}

const CALC_PACK_LABELS = {
  p12: 'calc.pack12', p30: 'calc.pack30', p60: 'calc.pack60',
  p130: 'calc.pack130', p180: 'calc.pack180', p300: 'calc.pack300', p300s: 'calc.pack300s',
  p600s: 'calc.pack600s', p600: 'calc.pack600', p1000s: 'calc.pack1000s', p1000: 'calc.pack1000'
};

function calcRender(d) {
  const out = document.getElementById('calcResultado');
  const m = d.melhor;
  const M = CALC_MODOS[d.modo];

  const ticketsUsados = m.copiasPorTickets * CALC_COMUM.TICKETS_POR_COPIA;
  const ticketsSobrando = Math.max(0, m.ticketsFinais - ticketsUsados);
  const custoTotal = m.custoPacotes + m.custoEstatueta;

  let html = '';

  // resumo
  html += '<div class="calc-summary">' +
    '<span class="calc-mode">' + d.modo + '</span>' +
    '<span class="calc-star">' + d.estrelaAtual + '</span><span class="calc-arrow">➜</span>' +
    '<span class="calc-star">' + d.objetivo + '</span>' +
    '<span class="calc-needed">' + ui('calc.needed') + ': <b>' + _calcNum(d.copiasNecessarias) + '</b></span>' +
    '</div>';

  // status
  if (d.status === 'already') html += '<div class="calc-status ok">✓ ' + ui('calc.stAlready') + '</div>';
  else if (d.status === 'ok') html += '<div class="calc-status ok">✓ ' + ui('calc.stOk') + '</div>';
  else html += '<div class="calc-status fail">✗ ' + ui('calc.stFail') + '</div>';

  // pacotes
  html += _calcSec('calc.secPacks', '🛒');
  for (const k of M.ORDEM) {
    const q = m.qts[k] || 0;
    const p = M.PACOTES[k];
    const hint = p.tickets + '🎟️' + (p.fragmentos ? ' ' + p.fragmentos + '🧩' : '');
    html += _calcRow(CALC_PACK_LABELS[k], q + '×', q > 0, hint);
  }
  let estatuetaTxt, estatuetaStrong = false;
  if (m.estatuetasTroca > 0) { estatuetaTxt = ui('calc.statueSwap'); estatuetaStrong = true; }
  else if (d.estatuetaInformada) estatuetaTxt = ui('calc.statueOwned');
  else estatuetaTxt = ui('calc.statueNone');
  html += '<div class="calc-row"><span>' + ui('calc.statueRow') +
    ' <small class="calc-hint">' + M.ESTATUETA.tickets + '🎟️ ' + M.ESTATUETA.fragmentos + '🧩</small></span>' +
    '<b class="' + (estatuetaStrong ? 'calc-strong' : '') + '">' + estatuetaTxt + '</b></div>';
  html += '<div class="calc-row"><span>' + ui('calc.diamondsRow') + '</span><b>' +
    (d.permitirDiamantes ? ui('calc.yes') : ui('calc.no')) + '</b></div>';

  // tickets
  html += _calcSec('calc.secTickets', '🎟️');
  for (const [k, v] of d.ticketsRows) html += _calcRow(k, _calcNum(v));
  html += _calcRow('calc.tStatue', _calcNum(m.ticketsEstatueta));
  html += _calcRow('calc.tPacks', _calcNum(m.ticketsPacotes));
  html += _calcRow('calc.tNeeded', _calcNum(m.ticketsNecessarios));
  html += _calcRow('calc.tReturn', '+' + _calcNum(m.retorno));
  html += _calcRow('calc.tFinal', _calcNum(m.ticketsFinais), true);
  html += _calcRow('calc.tUsed', _calcNum(ticketsUsados));
  html += _calcRow('calc.tLeft', _calcNum(ticketsSobrando));

  // fragmentos
  html += _calcSec('calc.secFragments', '🧩');
  for (const [k, v] of d.fragRows) html += _calcRow(k, _calcNum(v));
  html += _calcRow('calc.fStatue', _calcNum(m.fragmentosEstatueta));
  html += _calcRow('calc.fPacks', _calcNum(m.fragmentosPacotes));
  html += _calcRow('calc.fFinal', _calcNum(m.fragmentosFinais), true);
  html += _calcRow('calc.fUsed', _calcNum(m.fragmentosUsados));
  html += _calcRow('calc.fLeft', _calcNum(m.fragmentosSobrando));

  // cópias
  html += _calcSec('calc.secCopies', '👥');
  html += _calcRow('calc.cByTickets', _calcNum(m.copiasPorTickets));
  html += _calcRow('calc.cByFragments', _calcNum(m.copiasPorFragmentos));
  html += _calcRow('calc.cByDiamonds', _calcNum(m.copiasPorDiamantes));
  html += _calcRow('calc.cTotal', _calcNum(m.copiasTotais), true);

  // diamantes
  html += _calcSec('calc.secDiamonds', '💎');
  for (const [k, v, icon] of d.diamondRows) html += _calcRow(k, _calcNum(v) + ' ' + icon);
  html += _calcRow('calc.dOneCopy', _calcNum(m.diamantes) + ' 💜', m.diamantes > 0);

  // custo
  html += _calcSec('calc.secCost', '💰');
  html += _calcRow('calc.costPacks', _calcMoney(m.custoPacotes));
  html += _calcRow('calc.costStatue', _calcMoney(m.custoEstatueta));
  html += _calcRow('calc.costTotal', _calcMoney(custoTotal), true);

  out.innerHTML = html;
}

// re-renderiza o resultado quando o idioma muda (labels do form já trocam via data-i18n)
document.addEventListener('DOMContentLoaded', function () {
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.lang-btn')) {
      const out = document.getElementById('calcResultado');
      if (out && !out.querySelector('.calc-empty')) setTimeout(calcRun, 0);
    }
  });
});
