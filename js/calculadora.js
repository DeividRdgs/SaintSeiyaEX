/* ═══════════════════════════════════════════════════════════
   CALCULADORA DE BANNER — portada da calculadora ssx.py
   Mesmas regras do jogo: tickets/fragmentos por cópia, recursos
   gratuitos por dia, pacotes na ordem R$12 → R$30 → R$60 →
   R$130 → R$180 → R$300 → R$600 especial → R$600 → R$1000,
   estatueta, retorno de tickets e complemento por diamantes.
   ═══════════════════════════════════════════════════════════ */

const CALC_COPIAS_POR_ESTRELA = {
  '0★': 0, '2★': 1, '3★': 2, '4★': 4, '5★': 7, '6★': 11, '7★': 16
};

const CALC_REGRAS = {
  TICKETS_POR_COPIA: 40,
  FRAGMENTOS_POR_COPIA: 60,
  TICKETS_GRATUITOS_DIA: 2,
  FRAGMENTOS_GRATUITOS_DIA: 3,
  TICKETS_AZUIS: 30,
  // limite: null = limitado pelos dias de banner (1 por dia)
  PACOTES: {
    p12:   { tickets: 2,   fragmentos: 2,  preco: 12,   limite: null },
    p30:   { tickets: 4,   fragmentos: 4,  preco: 30,   limite: null },
    p60:   { tickets: 6,   fragmentos: 6,  preco: 60,   limite: null },
    p130:  { tickets: 15,  fragmentos: 0,  preco: 130,  limite: 3 },
    p180:  { tickets: 18,  fragmentos: 0,  preco: 180,  limite: 3 },
    p300:  { tickets: 25,  fragmentos: 0,  preco: 300,  limite: 6 },
    p600s: { tickets: 50,  fragmentos: 20, preco: 600,  limite: 2 },
    p600:  { tickets: 40,  fragmentos: 0,  preco: 600,  limite: 3 },
    p1000: { tickets: 100, fragmentos: 30, preco: 1000, limite: 2 }
  },
  ESTATUETA: { tickets: 10, fragmentos: 5, preco: 60 },
  RETORNO_40: 5,
  RETORNO_80: 5,
  RETORNO_130: 10,
  DIAMANTES_POR_FRAGMENTO: 100
};

// Ordem obrigatória de compra: o próximo pacote só entra depois
// que o anterior atingir seu limite.
const CALC_ORDEM_PACOTES = ['p12', 'p30', 'p60', 'p130', 'p180', 'p300', 'p600s', 'p600', 'p1000'];

function calcTestarCombinacao(qts, ticketsBase, fragmentosBase, copiasNecessarias, permitirDiamantes) {
  const R = CALC_REGRAS;

  let ticketsPacotes = 0, fragmentosPacotes = 0, custoPacotes = 0;
  for (const k of CALC_ORDEM_PACOTES) {
    const q = qts[k] || 0;
    ticketsPacotes += q * R.PACOTES[k].tickets;
    fragmentosPacotes += q * R.PACOTES[k].fragmentos;
    custoPacotes += q * R.PACOTES[k].preco;
  }

  const ticketsAntesRetorno = ticketsBase + ticketsPacotes;
  const fragmentosFinais = fragmentosBase + fragmentosPacotes;

  const copiasPorFragmentos = Math.min(copiasNecessarias, Math.floor(fragmentosFinais / R.FRAGMENTOS_POR_COPIA));
  const copiasQuePrecisamDeTickets = Math.max(0, copiasNecessarias - copiasPorFragmentos);
  const ticketsNecessarios = copiasQuePrecisamDeTickets * R.TICKETS_POR_COPIA;

  let retorno = 0;
  if (ticketsNecessarios >= 40) retorno += R.RETORNO_40;
  if (ticketsNecessarios >= 80) retorno += R.RETORNO_80;
  if (ticketsNecessarios >= 130) retorno += R.RETORNO_130;

  const ticketsFinais = ticketsAntesRetorno + retorno;

  const copiasPorTickets = Math.min(copiasQuePrecisamDeTickets, Math.floor(ticketsFinais / R.TICKETS_POR_COPIA));

  const fragmentosUsados = copiasPorFragmentos * R.FRAGMENTOS_POR_COPIA;
  const fragmentosSobrando = Math.max(0, fragmentosFinais - fragmentosUsados);

  const copiasRestantes = Math.max(0, copiasNecessarias - copiasPorTickets - copiasPorFragmentos);

  // SOMENTE UMA cópia pode ser completada por diamantes
  let copiasPorDiamantes = 0;
  let diamantes = 0;
  if (permitirDiamantes && copiasRestantes > 0) {
    let faltaFragmentos = R.FRAGMENTOS_POR_COPIA - fragmentosSobrando;
    if (faltaFragmentos <= 0) faltaFragmentos = R.FRAGMENTOS_POR_COPIA;
    copiasPorDiamantes = 1;
    diamantes = faltaFragmentos * R.DIAMANTES_POR_FRAGMENTO;
  }

  const copiasTotais = copiasPorTickets + copiasPorFragmentos + copiasPorDiamantes;

  return {
    qts: Object.assign({}, qts),
    ticketsPacotes, fragmentosPacotes,
    ticketsFinais, ticketsNecessarios, retorno,
    fragmentosFinais, fragmentosUsados, fragmentosSobrando,
    copiasPorTickets, copiasPorFragmentos, copiasPorDiamantes,
    copiasTotais, copiasRestantes, diamantes, custoPacotes
  };
}

/* ---------- busca da melhor combinação (mesmo fluxo do Python) ----------
   Ordem obrigatória: R$12 → R$30 → R$60 → R$130 → R$180 → R$300 →
   R$600 especial → R$600 antigo → R$1000. Cada pacote só entra depois que
   o anterior atingir o limite (R$12/30/60 = máx. 1 por dia de banner).
   Regra de custo do R$300: só 1 avulso; cada 2 R$300 viram 1 R$600 especial
   (mesmo preço, +20 fragmentos), podendo sobrar no máximo 1 R$300 solto. */
function calcBuscarMelhor(dias, ticketsBase, fragmentosBase, copiasNecessarias, permitirDiamantes) {
  const R = CALC_REGRAS;
  let melhor = null;
  const maxados = {};
  const testar = qts => {
    const t = calcTestarCombinacao(qts, ticketsBase, fragmentosBase, copiasNecessarias, permitirDiamantes);
    return t.copiasTotais >= copiasNecessarias ? t : null;
  };
  for (const key of ['p12', 'p30', 'p60', 'p130', 'p180']) {
    if (melhor) break;
    const limite = R.PACOTES[key].limite === null ? dias : R.PACOTES[key].limite;
    for (let q = 0; q <= limite && !melhor; q++) {
      melhor = testar(Object.assign({}, maxados, { [key]: q }));
    }
    maxados[key] = limite;
  }

  if (!melhor && R.PACOTES.p300.limite >= 1) {
    melhor = testar(Object.assign({}, maxados, { p300: 1 }));
  }
  if (!melhor) {
    for (let q600s = 1; q600s <= R.PACOTES.p600s.limite && !melhor; q600s++) {
      for (let q300 = 0; q300 <= 1 && !melhor; q300++) {
        melhor = testar(Object.assign({}, maxados, { p600s: q600s, p300: q300 }));
      }
    }
  }
  // daqui em diante o R$300 zera e o R$600 especial fica no limite
  maxados.p600s = R.PACOTES.p600s.limite;

  for (const key of ['p600', 'p1000']) {
    if (melhor) break;
    const limite = R.PACOTES[key].limite;
    for (let q = 0; q <= limite && !melhor; q++) {
      melhor = testar(Object.assign({}, maxados, { [key]: q }));
    }
    maxados[key] = limite;
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
function _calcRow(labelKey, value, strong) {
  return '<div class="calc-row"><span>' + ui(labelKey) + '</span><b class="' + (strong ? 'calc-strong' : '') + '">' + value + '</b></div>';
}
function _calcSec(labelKey, icon) {
  return '<h4 class="calc-sec">' + icon + ' ' + ui(labelKey) + '</h4>';
}

/* ---------- cálculo principal (mesmo fluxo do Python) ---------- */
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

  const estrelaAtual = document.getElementById('calcEstrela').value;
  const objetivo = document.getElementById('calcObjetivo').value;
  const comprarEstatueta = document.getElementById('calcEstatueta').value === 'nao';
  const permitirDiamantes = document.getElementById('calcDiamantes').value === 'sim';

  const R = CALC_REGRAS;
  const copiasNecessarias = Math.max(0,
    CALC_COPIAS_POR_ESTRELA[objetivo] - CALC_COPIAS_POR_ESTRELA[estrelaAtual] - copiasSobrando);

  const ticketsGratuitos = dias * R.TICKETS_GRATUITOS_DIA;
  const fragmentosGratuitos = dias * R.FRAGMENTOS_GRATUITOS_DIA;

  const ticketsEstatueta = comprarEstatueta ? R.ESTATUETA.tickets : 0;
  const fragmentosEstatueta = comprarEstatueta ? R.ESTATUETA.fragmentos : 0;
  const custoEstatueta = comprarEstatueta ? R.ESTATUETA.preco : 0;

  const ticketsBase = ticketsAtuais + R.TICKETS_AZUIS + ticketsGratuitos + ticketsEstatueta;
  const fragmentosBase = fragmentosAtuais + fragmentosGratuitos + fragmentosEstatueta;

  // objetivo já atingido: mostra o resumo com tudo zerado
  if (copiasNecessarias === 0) {
    const vazio = calcTestarCombinacao({}, ticketsBase, fragmentosBase, 0, false);
    calcRender({
      estrelaAtual, objetivo, copiasSobrando, copiasNecessarias,
      comprarEstatueta, permitirDiamantes,
      ticketsAtuais, ticketsGratuitos, ticketsEstatueta,
      fragmentosAtuais, fragmentosGratuitos, fragmentosEstatueta,
      custoEstatueta, melhor: vazio,
      status: 'already'
    });
    return;
  }

  const melhor = calcBuscarMelhor(dias, ticketsBase, fragmentosBase, copiasNecessarias, permitirDiamantes);

  if (!melhor) {
    out.innerHTML = '<div class="calc-status fail">✗ ' + ui('calc.stImpossible') + '</div>';
    return;
  }

  calcRender({
    estrelaAtual, objetivo, copiasSobrando, copiasNecessarias,
    comprarEstatueta, permitirDiamantes,
    ticketsAtuais, ticketsGratuitos, ticketsEstatueta,
    fragmentosAtuais, fragmentosGratuitos, fragmentosEstatueta,
    custoEstatueta, melhor,
    status: melhor.copiasTotais >= copiasNecessarias ? 'ok' : 'fail'
  });
}

function calcRender(d) {
  const out = document.getElementById('calcResultado');
  const m = d.melhor;
  const R = CALC_REGRAS;

  const ticketsUsados = m.copiasPorTickets * R.TICKETS_POR_COPIA;
  const ticketsSobrando = Math.max(0, m.ticketsFinais - ticketsUsados);
  const custoTotal = m.custoPacotes + d.custoEstatueta;

  let html = '';

  // resumo
  html += '<div class="calc-summary">' +
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
  const packLabels = {
    p12: 'calc.pack12', p30: 'calc.pack30', p60: 'calc.pack60',
    p130: 'calc.pack130', p180: 'calc.pack180', p300: 'calc.pack300',
    p600s: 'calc.pack600s', p600: 'calc.pack600', p1000: 'calc.pack1000'
  };
  for (const k of CALC_ORDEM_PACOTES) {
    const q = m.qts[k] || 0;
    html += _calcRow(packLabels[k], q + '×', q > 0);
  }
  html += '<div class="calc-row"><span>' + ui('calc.statueRow') + '</span><b class="' + (d.comprarEstatueta ? 'calc-strong' : '') + '">' +
    (d.comprarEstatueta ? ui('calc.statueBuy') : ui('calc.statueOwned')) + '</b></div>';
  html += '<div class="calc-row"><span>' + ui('calc.diamondsRow') + '</span><b>' +
    (d.permitirDiamantes ? ui('calc.yes') : ui('calc.no')) + '</b></div>';

  // tickets
  html += _calcSec('calc.secTickets', '🎟️');
  html += _calcRow('calc.tCurrent', _calcNum(d.ticketsAtuais));
  html += _calcRow('calc.tBlue', _calcNum(R.TICKETS_AZUIS));
  html += _calcRow('calc.tFree', _calcNum(d.ticketsGratuitos));
  html += _calcRow('calc.tStatue', _calcNum(d.ticketsEstatueta));
  html += _calcRow('calc.tPacks', _calcNum(m.ticketsPacotes));
  html += _calcRow('calc.tNeeded', _calcNum(m.ticketsNecessarios));
  html += _calcRow('calc.tReturn', '+' + _calcNum(m.retorno));
  html += _calcRow('calc.tFinal', _calcNum(m.ticketsFinais), true);
  html += _calcRow('calc.tUsed', _calcNum(ticketsUsados));
  html += _calcRow('calc.tLeft', _calcNum(ticketsSobrando));

  // fragmentos
  html += _calcSec('calc.secFragments', '🧩');
  html += _calcRow('calc.fCurrent', _calcNum(d.fragmentosAtuais));
  html += _calcRow('calc.fFree', _calcNum(d.fragmentosGratuitos));
  html += _calcRow('calc.fStatue', _calcNum(d.fragmentosEstatueta));
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
  html += _calcRow('calc.dOneCopy', _calcNum(m.diamantes) + ' 💜');

  // custo
  html += _calcSec('calc.secCost', '💰');
  html += _calcRow('calc.costPacks', _calcMoney(m.custoPacotes));
  html += _calcRow('calc.costStatue', _calcMoney(d.custoEstatueta));
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
