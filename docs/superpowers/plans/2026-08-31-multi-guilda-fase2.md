# Multi-guilda Fase 2 — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Líder edita eventos, GVG e webhook do Discord pelo site; avisos automáticos (lembretes de eventos, resumo semanal) passam a valer para todas as guildas ativas.

**Architecture:** 5 ações novas no Apps Script (`manageList`, `eventsReplace`, `gvgReplace`, `configSetWebhook`, `configTestWebhook`), todas validando líder com o `rosterAssertLeader` existente e operando em `ctx.ss`. Gatilhos de horário refatorados para iterar guildas ativas via `forEachGuildaAtiva`. Frontend: edição no lugar nas abas Eventos/GVG (painéis visíveis só ao líder) e seção Configurações na aba Membros. Spec: `docs/superpowers/specs/2026-08-31-multi-guilda-fase2-design.md`.

**Tech Stack:** Google Apps Script ES5 (`backend/apps-script.gs`), JS vanilla (`js/app.js`), HTML (`index.html`), CSS (`css/redesign-guild.css`), i18n (`js/data/i18n.js`).

## Global Constraints

- Backend valida líder em TODA ação de gestão (`rosterAssertLeader(params, ctx)` já existente, retorna `{ok, email, sheets}` ou `{ok:false, resp}`); nunca confiar na UI.
- Webhook completo NUNCA sai em resposta de API — só `webhookSet` (bool) e `webhookMask` (`'…' + últimos 6 chars`).
- Limites: eventos máx. 30 (dia ≤40 obrigatório, nome ≤60 obrigatório, horario ≤20, descricao ≤200, recompensa ≤100, status ∈ {Ativo, Inativo}); GVG máx. 60 (papel ≤40 obrigatório, nick ≤30 obrigatório, observacao ≤120); webhook ≤300 chars e deve conter `discord.com/api/webhooks/` (ou vazio para limpar).
- Item inválido rejeita a lista INTEIRA com a posição (`'Evento 3: nome obrigatório'`); nada é gravado.
- Regravação de aba: `LockService` (waitLock 5000, release no finally) + limpar dados (linha 2+) + `setValues` de uma vez.
- Chamadas do frontend levam `guild: guildSlug()` e `authToken: _authState.token`; após salvar com sucesso → `loadData(true)`.
- Assinaturas atuais que vinculam: `logEvent(tipo, dados, ssArg)`, `enviarDiscord(payload, ssArg)`, `getDiscordWebhook(ssArg)`, `ensureMasterSheets() -> {master, guildas, index}` (Guildas: slug col1, nome col2, spreadsheet_id col3, status col4).
- Colunas: Eventos `Dia|Nome|Horario|Descricao|Status|Recompensa`; GVG `Papel|Nick|Observacao`; Config `chave|valor` (chave `webhook_discord`).
- Backend valida com `node -e "new Function(require('fs').readFileSync('backend/apps-script.gs','utf8')); console.log('PARSE OK')"`; frontend com `node --check` por arquivo.
- i18n: string nova de UI ganha chave pt/en/es (dicionários `pt: {`, `en: {`, `es: {` em `js/data/i18n.js`).
- Commits em português, um por task, terminando com:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` e
  `Claude-Session: https://claude.ai/code/session_012ZZWMdt91zuFhZwCW3A1dc`

---

### Task 1: Backend — `forEachGuildaAtiva` + gatilhos por guilda

**Files:**
- Modify: `backend/apps-script.gs` — funções `avisarEventosProximos` (linha ~1167), `limparAvisadosAntigos` (~1238), `resumoSemanalDiscord` (~1257), `atualizarStatusEventos` (~1403); helper novo antes de `avisarEventosProximos`.

**Interfaces:**
- Consumes: `ensureMasterSheets`, `logEvent(tipo, dados, ssArg)`, `getDiscordWebhook(ssArg)`, `enviarDiscord(payload, ssArg)`.
- Produces: `forEachGuildaAtiva(fn)` onde `fn({slug, nome, ss})`; funções `avisarEventosProximosGuilda(g)`, `resumoSemanalDiscordGuilda(g)`, `atualizarStatusEventosGuilda(g)`. Os nomes públicos (`avisarEventosProximos` etc., usados pelos gatilhos instalados) viram wrappers — NÃO renomear os wrappers.

- [ ] **Step 1: Helper `forEachGuildaAtiva`** (inserir imediatamente antes de `function avisarEventosProximos`):

```javascript
// Itera as guildas ativas da master; erro em uma não derruba as demais
function forEachGuildaAtiva(fn) {
  var m = ensureMasterSheets();
  var data = m.guildas.getDataRange().getValues();
  var master = SpreadsheetApp.getActiveSpreadsheet();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][3] || '').trim().toLowerCase() !== 'ativa') continue;
    var id = String(data[i][2] || '').trim();
    if (!id) continue;
    var slug = String(data[i][0] || '').trim().toLowerCase();
    var nome = String(data[i][1] || '');
    try {
      var ss = (id === master.getId()) ? master : SpreadsheetApp.openById(id);
      fn({slug: slug, nome: nome, ss: ss});
    } catch (e) {
      try { logEvent('trigger_guild_fail', {detalhes: slug + ': ' + e.toString()}); } catch (e2) {}
    }
  }
}
```

- [ ] **Step 2: `avisarEventosProximos` vira wrapper + versão por guilda**

Renomear a função atual para `avisarEventosProximosGuilda(g)` e dentro dela: trocar `var ss = SpreadsheetApp.getActiveSpreadsheet();` por `var ss = g.ss;`; trocar `var avisadosKey = 'avisados_' + dataHoje;` por `var avisadosKey = 'avisados_' + g.slug + '_' + dataHoje;`; na chamada `enviarDiscord({...})` acrescentar `, g.ss` como segundo argumento e trocar `username: 'TRIADE Bot'` por `username: g.nome + ' Bot'` e `footer: {text: 'Preparem-se, cavaleiros! • Legião TRIADE'}` por `footer: {text: 'Preparem-se, cavaleiros! • ' + g.nome}`. Antes do wrapper, criar:

```javascript
function avisarEventosProximos() {
  forEachGuildaAtiva(avisarEventosProximosGuilda);
}
```

- [ ] **Step 3: `limparAvisadosAntigos` tolera o slug na chave**

Trocar a condição `if (key.indexOf('avisados_') === 0 && key !== 'avisados_' + dataHoje)` por `if (key.indexOf('avisados_') === 0 && key.indexOf(dataHoje) === -1)` (apaga qualquer chave de avisados que não seja de hoje, com ou sem slug). Fazer a MESMA troca na ocorrência análoga dentro de `atualizarStatusEventos` (linha ~1499), se existir.

- [ ] **Step 4: `resumoSemanalDiscord` e `atualizarStatusEventos` no mesmo padrão**

Para cada uma: renomear a atual para `<nome>Guilda(g)`; trocar `var ss = SpreadsheetApp.getActiveSpreadsheet();` por `var ss = g.ss;`; em `resumoSemanalDiscordGuilda`, logo após obter `ss`, acrescentar `if (!getDiscordWebhook(g.ss)) return;` e nas chamadas `enviarDiscord({...})` internas acrescentar `, g.ss`, trocando strings literais `'TRIADE'`/`'Legião TRIADE'` de username/footer/títulos por `g.nome`; `atualizarStatusEventosGuilda` não envia Discord — só troca o `ss` (e o ajuste do Step 3 se houver limpeza de avisados nela). Criar os wrappers:

```javascript
function resumoSemanalDiscord() {
  forEachGuildaAtiva(resumoSemanalDiscordGuilda);
}
function atualizarStatusEventos() {
  forEachGuildaAtiva(atualizarStatusEventosGuilda);
}
```

Atenção: se dentro dessas funções houver `logEvent(...)`, acrescentar `, g.ss` (log na planilha da guilda). `testeEventosProximos`/`testeResumoSemanal` chamam os wrappers e continuam funcionando sem mudança.

- [ ] **Step 5: Validar** — comando Node do Global Constraints → `PARSE OK`. Conferir com `grep -n "function avisarEventosProximos\|function resumoSemanalDiscord\|function atualizarStatusEventos" backend/apps-script.gs` que existem wrapper + versão `Guilda` de cada.

- [ ] **Step 6: Commit** — `git add backend/apps-script.gs` + mensagem `Avisos automáticos do Discord passam a rodar para todas as guildas ativas`.

---

### Task 2: Backend — `manageList` + helper de regravação + despacho no doPost

**Files:**
- Modify: `backend/apps-script.gs` — novo bloco após `rosterRemove`; despacho no `doPost` (grupo com `ctx`, junto de `rosterList` etc.)

**Interfaces:**
- Consumes: `rosterAssertLeader(params, ctx)`, `getDiscordWebhook(ssArg)`, `jsonResponse`
- Produces: `manageList(params, ctx)` → `{ok, events:[{dia,nome,horario,descricao,status,recompensa}], gvg:[{papel,nick,observacao}], webhookSet, webhookMask}`; `replaceSheetRows(ss, sheetName, header, rows)` (usada na Task 3).

- [ ] **Step 1: Despacho no `doPost`** — no bloco das ações com `ctx`, após a linha do `rosterRemove`, acrescentar:

```javascript
    if (action === 'manageList') return manageList(params, ctx);
    if (action === 'eventsReplace') return eventsReplace(params, ctx);
    if (action === 'gvgReplace') return gvgReplace(params, ctx);
    if (action === 'configSetWebhook') return configSetWebhook(params, ctx);
    if (action === 'configTestWebhook') return configTestWebhook(params, ctx);
```

- [ ] **Step 2: Bloco novo (após `rosterRemove`, antes de `// =========== LEITURA (GET) ===========`):**

```javascript
// ═══════════ FASE 2 — GESTÃO PELO LÍDER (eventos, GVG, webhook) ═══════════

// Dados de gestão para o líder. O webhook NUNCA sai completo — só máscara.
function manageList(params, ctx) {
  var lid = rosterAssertLeader(params, ctx);
  if (!lid.ok) return lid.resp;
  var events = [];
  var evSheet = ctx.ss.getSheetByName('Eventos');
  if (evSheet) {
    var evd = evSheet.getDataRange().getValues();
    for (var i = 1; i < evd.length; i++) {
      if (!evd[i][0] && !evd[i][1]) continue;
      events.push({
        dia: String(evd[i][0] || ''), nome: String(evd[i][1] || ''),
        horario: String(evd[i][2] || ''), descricao: String(evd[i][3] || ''),
        status: String(evd[i][4] || 'Ativo'), recompensa: String(evd[i][5] || '')
      });
    }
  }
  var gvg = [];
  var gvgSheet = ctx.ss.getSheetByName('GVG');
  if (gvgSheet) {
    var gd = gvgSheet.getDataRange().getValues();
    for (var j = 1; j < gd.length; j++) {
      if (!gd[j][0] && !gd[j][1]) continue;
      gvg.push({papel: String(gd[j][0] || ''), nick: String(gd[j][1] || ''), observacao: String(gd[j][2] || '')});
    }
  }
  var webhook = getDiscordWebhook(ctx.ss);
  return jsonResponse({
    ok: true, events: events, gvg: gvg,
    webhookSet: webhook !== '',
    webhookMask: webhook ? '…' + webhook.slice(-6) : ''
  });
}

// Limpa os dados (linha 2+) e regrava de uma vez
function replaceSheetRows(ss, sheetName, header, rows) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
  }
  var last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, Math.max(sheet.getLastColumn(), header.length)).clearContents();
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
}
```

- [ ] **Step 3: Validar** — Node parse → `PARSE OK` (eventsReplace/gvgReplace/configSetWebhook/configTestWebhook ainda não existem — só são referenciadas dentro do doPost, parse passa).

- [ ] **Step 4: Commit** — `Backend Fase 2: manageList e helper de regravação de abas`.

---

### Task 3: Backend — `eventsReplace` + `gvgReplace`

**Files:**
- Modify: `backend/apps-script.gs` (após `replaceSheetRows`)

**Interfaces:**
- Consumes: `rosterAssertLeader`, `replaceSheetRows`, `logEvent(tipo, dados, ssArg)`, `maskEmail`
- Produces: `eventsReplace(params{events[]}, ctx)`, `gvgReplace(params{gvg[]}, ctx)` — já despachadas na Task 2.

- [ ] **Step 1: Implementar (código completo):**

```javascript
function eventsReplace(params, ctx) {
  var lid = rosterAssertLeader(params, ctx);
  if (!lid.ok) return lid.resp;
  var lista = params.events;
  if (!Array.isArray(lista)) return jsonResponse({ok: false, error: 'Lista de eventos inválida'});
  if (lista.length > 30) return jsonResponse({ok: false, error: 'Máximo de 30 eventos'});
  var rows = [];
  for (var i = 0; i < lista.length; i++) {
    var ev = lista[i] || {};
    var dia = String(ev.dia || '').trim();
    var nome = String(ev.nome || '').trim();
    var horario = String(ev.horario || '').trim();
    var descricao = String(ev.descricao || '').trim();
    var status = String(ev.status || 'Ativo').trim();
    var recompensa = String(ev.recompensa || '').trim();
    var n = 'Evento ' + (i + 1) + ': ';
    if (!dia) return jsonResponse({ok: false, error: n + 'dia obrigatório'});
    if (dia.length > 40) return jsonResponse({ok: false, error: n + 'dia muito longo (máx 40)'});
    if (!nome) return jsonResponse({ok: false, error: n + 'nome obrigatório'});
    if (nome.length > 60) return jsonResponse({ok: false, error: n + 'nome muito longo (máx 60)'});
    if (horario.length > 20) return jsonResponse({ok: false, error: n + 'horário muito longo (máx 20)'});
    if (descricao.length > 200) return jsonResponse({ok: false, error: n + 'descrição muito longa (máx 200)'});
    if (recompensa.length > 100) return jsonResponse({ok: false, error: n + 'recompensa muito longa (máx 100)'});
    if (status !== 'Ativo' && status !== 'Inativo') return jsonResponse({ok: false, error: n + 'status inválido'});
    rows.push([dia, nome, horario, descricao, status, recompensa]);
  }
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); }
  catch (eLock) { return jsonResponse({ok: false, error: 'Planilha ocupada. Tente novamente.'}); }
  try {
    replaceSheetRows(ctx.ss, 'Eventos', ['Dia', 'Nome', 'Horario', 'Descricao', 'Status', 'Recompensa'], rows);
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
  logEvent('events_replace', {email: maskEmail(lid.email), detalhes: rows.length + ' eventos'}, ctx.ss);
  return jsonResponse({ok: true, message: 'Eventos salvos (' + rows.length + ')'});
}

function gvgReplace(params, ctx) {
  var lid = rosterAssertLeader(params, ctx);
  if (!lid.ok) return lid.resp;
  var lista = params.gvg;
  if (!Array.isArray(lista)) return jsonResponse({ok: false, error: 'Lista de GVG inválida'});
  if (lista.length > 60) return jsonResponse({ok: false, error: 'Máximo de 60 linhas de GVG'});
  var rows = [];
  for (var i = 0; i < lista.length; i++) {
    var item = lista[i] || {};
    var papel = String(item.papel || '').trim();
    var nick = String(item.nick || '').trim();
    var observacao = String(item.observacao || '').trim();
    var n = 'Linha ' + (i + 1) + ': ';
    if (!papel) return jsonResponse({ok: false, error: n + 'papel obrigatório'});
    if (papel.length > 40) return jsonResponse({ok: false, error: n + 'papel muito longo (máx 40)'});
    if (!nick) return jsonResponse({ok: false, error: n + 'nick obrigatório'});
    if (nick.length > 30) return jsonResponse({ok: false, error: n + 'nick muito longo (máx 30)'});
    if (observacao.length > 120) return jsonResponse({ok: false, error: n + 'observação muito longa (máx 120)'});
    rows.push([papel, nick, observacao]);
  }
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); }
  catch (eLock2) { return jsonResponse({ok: false, error: 'Planilha ocupada. Tente novamente.'}); }
  try {
    replaceSheetRows(ctx.ss, 'GVG', ['Papel', 'Nick', 'Observacao'], rows);
  } finally {
    try { lock.releaseLock(); } catch (eRel2) {}
  }
  logEvent('gvg_replace', {email: maskEmail(lid.email), detalhes: rows.length + ' linhas'}, ctx.ss);
  return jsonResponse({ok: true, message: 'GVG salva (' + rows.length + ' linhas)'});
}
```

- [ ] **Step 2: Validar** — Node parse → `PARSE OK`.
- [ ] **Step 3: Commit** — `Backend Fase 2: eventsReplace e gvgReplace (regravação validada com lock)`.

---

### Task 4: Backend — `configSetWebhook` + `configTestWebhook`

**Files:**
- Modify: `backend/apps-script.gs` (após `gvgReplace`)

**Interfaces:**
- Consumes: `rosterAssertLeader`, `getDiscordWebhook(ssArg)`, `enviarDiscord(payload, ssArg)`, `logEvent(tipo, dados, ssArg)`, `TRIADE_BOT_AVATAR`
- Produces: `configSetWebhook(params{webhook}, ctx)`, `configTestWebhook(params, ctx)` — já despachadas na Task 2.

- [ ] **Step 1: Implementar:**

```javascript
function configSetWebhook(params, ctx) {
  var lid = rosterAssertLeader(params, ctx);
  if (!lid.ok) return lid.resp;
  var url = String(params.webhook || '').trim();
  if (url && url.indexOf('discord.com/api/webhooks/') === -1) {
    return jsonResponse({ok: false, error: 'URL inválida — cole a URL do webhook do Discord'});
  }
  if (url.length > 300) return jsonResponse({ok: false, error: 'URL muito longa'});
  var cfg = ctx.ss.getSheetByName('Config');
  if (!cfg) {
    cfg = ctx.ss.insertSheet('Config');
    cfg.appendRow(['chave', 'valor']);
    cfg.setFrozenRows(1);
  }
  var data = cfg.getDataRange().getValues();
  var achou = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toLowerCase() === 'webhook_discord') {
      cfg.getRange(i + 1, 2).setValue(url);
      achou = true;
      break;
    }
  }
  if (!achou) cfg.appendRow(['webhook_discord', url]);
  logEvent('webhook_set', {email: maskEmail(lid.email), detalhes: url ? 'configurado' : 'removido'}, ctx.ss);
  return jsonResponse({ok: true, message: url ? 'Webhook salvo!' : 'Webhook removido'});
}

function configTestWebhook(params, ctx) {
  var lid = rosterAssertLeader(params, ctx);
  if (!lid.ok) return lid.resp;
  if (!getDiscordWebhook(ctx.ss)) return jsonResponse({ok: false, error: 'Configure o webhook primeiro'});
  enviarDiscord({
    username: ctx.nome + ' — Site', avatar_url: TRIADE_BOT_AVATAR,
    embeds: [{
      title: '✅ Webhook configurado!',
      description: 'Os avisos da guilda **' + ctx.nome + '** chegarão neste canal.',
      color: 0x2ecc71, timestamp: new Date().toISOString()
    }]
  }, ctx.ss);
  return jsonResponse({ok: true, message: 'Mensagem de teste enviada — confira o canal'});
}
```

- [ ] **Step 2: Validar** — Node parse → `PARSE OK`.
- [ ] **Step 3: Commit** — `Backend Fase 2: líder configura e testa o webhook do Discord da guilda`.

---

### Task 5: Backend — estender `testeMultiGuilda` + runbook

**Files:**
- Modify: `backend/apps-script.gs` — dentro de `testeMultiGuilda`, antes da verificação final da TRIADE; `backend/README.md`

**Interfaces:**
- Consumes: `eventsReplace`, `gvgReplace`, `configSetWebhook`, `resolveGuild`, `rosterList` (tudo já existente/desta fase)

- [ ] **Step 1: Inserir no `testeMultiGuilda`, logo após o bloco "5. elenco + cadastro de membro ok" e ANTES do bloco "TRIADE intacta":**

```javascript
  // Fase 2: eventos, GVG e webhook na guilda de teste
  var evResp = JSON.parse(eventsReplace({authToken: loginResp.token, events: [
    {dia: 'Segunda', nome: 'Boss Teste', horario: '20:30', descricao: 'desc', status: 'Ativo', recompensa: 'ouro'},
    {dia: 'Sexta', nome: 'GVG Teste', horario: '21:00', descricao: '', status: 'Inativo', recompensa: ''}
  ]}, ctx).getContent());
  if (!evResp.ok) throw new Error('FALHA eventsReplace: ' + evResp.error);
  var evCheck = ctx.ss.getSheetByName('Eventos').getDataRange().getValues();
  if (evCheck.length !== 3) throw new Error('FALHA: Eventos deveria ter 2 linhas, tem ' + (evCheck.length - 1));
  var gvgResp = JSON.parse(gvgReplace({authToken: loginResp.token, gvg: [
    {papel: 'Ataque', nick: 'LiderTeste', observacao: 'obs'}
  ]}, ctx).getContent());
  if (!gvgResp.ok) throw new Error('FALHA gvgReplace: ' + gvgResp.error);
  var whBad = JSON.parse(configSetWebhook({authToken: loginResp.token, webhook: 'https://exemplo.com/x'}, ctx).getContent());
  if (whBad.ok) throw new Error('FALHA: webhook inválido foi aceito');
  var whOk = JSON.parse(configSetWebhook({authToken: loginResp.token, webhook: 'https://discord.com/api/webhooks/123/abc'}, ctx).getContent());
  if (!whOk.ok) throw new Error('FALHA configSetWebhook: ' + whOk.error);
  var mng = JSON.parse(manageList({authToken: loginResp.token}, ctx).getContent());
  if (!mng.ok || mng.events.length !== 2 || mng.gvg.length !== 1) throw new Error('FALHA manageList');
  if (!mng.webhookSet || mng.webhookMask.indexOf('…') !== 0) throw new Error('FALHA: máscara do webhook');
  Logger.log('5b. gestão Fase 2 ok');
```

E no bloco "TRIADE intacta", acrescentar após o loop de nicks:

```javascript
  var evTriade = ctxTriade.ss.getSheetByName('Eventos');
  if (evTriade) {
    var evtData = evTriade.getDataRange().getValues();
    for (var t = 1; t < evtData.length; t++) {
      if (String(evtData[t][1]).toLowerCase() === 'boss teste') throw new Error('FALHA: evento de teste vazou pra TRIADE');
    }
  }
```

- [ ] **Step 2: `backend/README.md`** — na seção "Implantar uma nova versão", passo 3, trocar a frase do teste por: "Rode `testeMultiGuilda` e confira no log `✅ TESTE COMPLETO PASSOU` (cobre criação de guilda, elenco, cadastro, eventos/GVG/webhook da Fase 2); depois rode `testeMultiGuildaLimpar`." E acrescentar ao final da seção "Estrutura": "Os avisos automáticos (lembretes de eventos e resumo semanal) rodam para todas as guildas ativas que tiverem `webhook_discord` no Config."

- [ ] **Step 3: Validar** — Node parse → `PARSE OK`.
- [ ] **Step 4: Commit** — `Backend Fase 2: teste ponta a ponta cobre eventos, GVG e webhook`.

---

### Task 6: Frontend — painel "Gerenciar eventos"

**Files:**
- Modify: `index.html` (aba `tab-eventos`, linha ~499), `js/app.js` (funções novas no fim), `js/data/i18n.js`, `css/redesign-guild.css`

**Interfaces:**
- Consumes: ações `manageList`/`eventsReplace` (Tasks 2–3), `guildSlug()`, `_authState`, `ui()`, `toast()`, `setButtonLoading()`, `loadData()`
- Produces: `manageEventsOpen()`, `manageEventsAddRow()`, `manageEventsSave()`, `manageEventsClose()`, `manageShowMsg(id, msg)`, `manageEventRowHtml(ev)`; botão `#btnManageEvents`; painel `#manageEventsPanel`. Task 8 usa `manageShowMsg`.

- [ ] **Step 1: HTML** — dentro de `#tab-eventos`, logo após o `</div>` do `.section-title`, inserir:

```html
      <div style="text-align:center;">
        <button class="auth-admin-btn approve" id="btnManageEvents" style="display:none;margin:0 0 14px;" onclick="manageEventsOpen()" data-i18n="manage.eventsBtn">✎ Gerenciar eventos</button>
      </div>
      <div class="pending-panel manage-panel" id="manageEventsPanel" style="display:none;">
        <div class="auth-msg" id="manageEventsMsg"></div>
        <div id="manageEventsRows"></div>
        <div class="manage-actions">
          <button class="auth-admin-btn" onclick="manageEventsAddRow()" data-i18n="manage.addEvent">+ Adicionar evento</button>
          <button class="auth-admin-btn approve" id="manageEventsSaveBtn" onclick="manageEventsSave()" data-i18n="manage.save">💾 Salvar</button>
          <button class="auth-admin-btn deny" onclick="manageEventsClose()" data-i18n="manage.cancel">Cancelar</button>
        </div>
      </div>
```

- [ ] **Step 2: JS (fim de `js/app.js`):**

```javascript
// ════════════ GESTÃO DE EVENTOS PELO LÍDER (Fase 2) ════════════
function manageShowMsg(id, msg, type) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg || ''; el.className = 'auth-msg ' + (type || 'error'); }
}

function manageEventRowHtml(ev) {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const dias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  let diaOpts = dias.map(d => `<option value="${d}"${ev.dia === d ? ' selected' : ''}>${d}</option>`).join('');
  if (ev.dia && dias.indexOf(ev.dia) === -1) {
    diaOpts = `<option value="${esc(ev.dia)}" selected>${esc(ev.dia)}</option>` + diaOpts;
  }
  const stAtivo = (ev.status || 'Ativo') !== 'Inativo';
  return `<div class="manage-row manage-row-ev">` +
    `<select class="mr-dia">${diaOpts}</select>` +
    `<input class="mr-nome" maxlength="60" placeholder="${ui('manage.evNome')}" value="${esc(ev.nome)}">` +
    `<input class="mr-horario" maxlength="20" placeholder="20:30" value="${esc(ev.horario)}">` +
    `<input class="mr-desc" maxlength="200" placeholder="${ui('manage.evDesc')}" value="${esc(ev.descricao)}">` +
    `<input class="mr-rec" maxlength="100" placeholder="${ui('manage.evRec')}" value="${esc(ev.recompensa)}">` +
    `<select class="mr-status">` +
      `<option value="Ativo"${stAtivo ? ' selected' : ''}>${ui('manage.ativo')}</option>` +
      `<option value="Inativo"${!stAtivo ? ' selected' : ''}>${ui('manage.inativo')}</option>` +
    `</select>` +
    `<button class="auth-admin-btn deny mr-del" onclick="this.closest('.manage-row').remove()">✕</button>` +
    `</div>`;
}

async function manageEventsOpen() {
  const panel = document.getElementById('manageEventsPanel');
  const rows = document.getElementById('manageEventsRows');
  if (!panel || !rows) return;
  panel.style.display = '';
  manageShowMsg('manageEventsMsg', '');
  rows.innerHTML = `<div class="pending-hint">${ui('generic.loading')}</div>`;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'manageList', guild: guildSlug(), authToken: _authState.token })
    });
    const data = await res.json();
    if (!data.ok) { rows.innerHTML = `<div class="pending-hint">${data.error || 'Erro'}</div>`; return; }
    rows.innerHTML = (data.events || []).map(manageEventRowHtml).join('') ||
      `<div class="pending-hint">${ui('manage.noEvents')}</div>`;
  } catch (err) {
    rows.innerHTML = `<div class="pending-hint">${ui('auth.connectionError')}</div>`;
  }
}

function manageEventsAddRow() {
  const rows = document.getElementById('manageEventsRows');
  if (!rows) return;
  const hint = rows.querySelector('.pending-hint');
  if (hint) hint.remove();
  rows.insertAdjacentHTML('beforeend', manageEventRowHtml({dia: '', nome: '', horario: '', descricao: '', status: 'Ativo', recompensa: ''}));
}

async function manageEventsSave() {
  const linhas = Array.from(document.querySelectorAll('#manageEventsRows .manage-row-ev')).map(r => ({
    dia: r.querySelector('.mr-dia').value,
    nome: r.querySelector('.mr-nome').value.trim(),
    horario: r.querySelector('.mr-horario').value.trim(),
    descricao: r.querySelector('.mr-desc').value.trim(),
    recompensa: r.querySelector('.mr-rec').value.trim(),
    status: r.querySelector('.mr-status').value
  }));
  const btn = document.getElementById('manageEventsSaveBtn');
  setButtonLoading(btn, true, '...');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'eventsReplace', guild: guildSlug(), authToken: _authState.token, events: linhas })
    });
    const data = await res.json();
    if (data.ok) {
      manageEventsClose();
      toast({ msg: data.message, type: 'success' });
      if (typeof loadData === 'function') loadData(true);
    } else {
      manageShowMsg('manageEventsMsg', data.error || 'Erro');
    }
  } catch (err) {
    manageShowMsg('manageEventsMsg', ui('auth.connectionError'));
  } finally {
    setButtonLoading(btn, false);
  }
}

function manageEventsClose() {
  const panel = document.getElementById('manageEventsPanel');
  if (panel) panel.style.display = 'none';
}
```

- [ ] **Step 3: Visibilidade em `updateAuthUI`** — no ramo logado, junto do bloco do `elencoBtn`:

```javascript
    var manageEvBtn = document.getElementById('btnManageEvents');
    if (manageEvBtn) manageEvBtn.style.display = (_authState.user && _authState.user.isLeader) ? '' : 'none';
```

No ramo deslogado:

```javascript
    var manageEvBtn2 = document.getElementById('btnManageEvents');
    if (manageEvBtn2) manageEvBtn2.style.display = 'none';
    var manageEvPanel2 = document.getElementById('manageEventsPanel');
    if (manageEvPanel2) manageEvPanel2.style.display = 'none';
```

- [ ] **Step 4: CSS (`css/redesign-guild.css`, após o bloco `.guildas-ativa-row`):**

```css
/* Painéis de gestão do líder (Fase 2) */
.manage-panel { max-width: 980px; margin: 0 auto 22px; }
.manage-row {
  display: grid;
  gap: 6px;
  margin-bottom: 6px;
  align-items: center;
}
.manage-row-ev { grid-template-columns: 110px 1.2fr 76px 1.5fr 1fr 96px 40px; }
.manage-row input, .manage-row select {
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 8px;
  min-height: 38px;
  padding: 0 10px;
  font-family: 'Sora', sans-serif;
  font-size: .8rem;
  min-width: 0;
}
.manage-row .mr-del { min-height: 38px; padding: 0 10px; }
.manage-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 14px;
}
@media (max-width: 900px) {
  .manage-row-ev { grid-template-columns: 1fr 1fr; }
}
```

- [ ] **Step 5: i18n** — `pt`:

```javascript
    'manage.eventsBtn': '✎ Gerenciar eventos',
    'manage.addEvent': '+ Adicionar evento',
    'manage.save': '💾 Salvar',
    'manage.cancel': 'Cancelar',
    'manage.evNome': 'Nome do evento',
    'manage.evDesc': 'Descrição',
    'manage.evRec': 'Recompensa',
    'manage.ativo': 'Ativo',
    'manage.inativo': 'Inativo',
    'manage.noEvents': 'Nenhum evento ainda — adicione o primeiro.',
```

`en`: `'manage.eventsBtn': '✎ Manage events', 'manage.addEvent': '+ Add event', 'manage.save': '💾 Save', 'manage.cancel': 'Cancel', 'manage.evNome': 'Event name', 'manage.evDesc': 'Description', 'manage.evRec': 'Reward', 'manage.ativo': 'Active', 'manage.inativo': 'Inactive', 'manage.noEvents': 'No events yet — add the first one.',`
`es`: `'manage.eventsBtn': '✎ Gestionar eventos', 'manage.addEvent': '+ Agregar evento', 'manage.save': '💾 Guardar', 'manage.cancel': 'Cancelar', 'manage.evNome': 'Nombre del evento', 'manage.evDesc': 'Descripción', 'manage.evRec': 'Recompensa', 'manage.ativo': 'Activo', 'manage.inativo': 'Inactivo', 'manage.noEvents': 'Aún no hay eventos — agrega el primero.',`

- [ ] **Step 6: Validar** — `node --check js/app.js && node --check js/data/i18n.js && echo OK` → `OK`.
- [ ] **Step 7: Commit** — `Líder gerencia os eventos da guilda pelo site`.

---

### Task 7: Frontend — painel "Gerenciar GVG"

**Files:**
- Modify: `index.html` (aba `tab-gvg`, linha ~485), `js/app.js`, `js/data/i18n.js`, `css/redesign-guild.css`

**Interfaces:**
- Consumes: `manageList`/`gvgReplace`, `manageShowMsg` (Task 6)
- Produces: `manageGvgOpen()`, `manageGvgAddRow()`, `manageGvgSave()`, `manageGvgClose()`, `manageGvgRowHtml(item)`; botão `#btnManageGvg`; painel `#manageGvgPanel`.

- [ ] **Step 1: HTML** — dentro de `#tab-gvg`, logo após o `</div>` do `.section-title`:

```html
      <div style="text-align:center;">
        <button class="auth-admin-btn approve" id="btnManageGvg" style="display:none;margin:0 0 14px;" onclick="manageGvgOpen()" data-i18n="manage.gvgBtn">✎ Gerenciar GVG</button>
      </div>
      <div class="pending-panel manage-panel" id="manageGvgPanel" style="display:none;">
        <div class="auth-msg" id="manageGvgMsg"></div>
        <div id="manageGvgRows"></div>
        <div class="manage-actions">
          <button class="auth-admin-btn" onclick="manageGvgAddRow()" data-i18n="manage.addGvg">+ Adicionar linha</button>
          <button class="auth-admin-btn approve" id="manageGvgSaveBtn" onclick="manageGvgSave()" data-i18n="manage.save">💾 Salvar</button>
          <button class="auth-admin-btn deny" onclick="manageGvgClose()" data-i18n="manage.cancel">Cancelar</button>
        </div>
      </div>
```

- [ ] **Step 2: JS (após o bloco de eventos da Task 6):**

```javascript
// ════════════ GESTÃO DE GVG PELO LÍDER (Fase 2) ════════════
function manageGvgRowHtml(item) {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return `<div class="manage-row manage-row-gvg">` +
    `<input class="mr-papel" maxlength="40" placeholder="${ui('manage.gvgPapel')}" value="${esc(item.papel)}">` +
    `<input class="mr-nick" maxlength="30" placeholder="${ui('manage.gvgNick')}" value="${esc(item.nick)}">` +
    `<input class="mr-obs" maxlength="120" placeholder="${ui('manage.gvgObs')}" value="${esc(item.observacao)}">` +
    `<button class="auth-admin-btn deny mr-del" onclick="this.closest('.manage-row').remove()">✕</button>` +
    `</div>`;
}

async function manageGvgOpen() {
  const panel = document.getElementById('manageGvgPanel');
  const rows = document.getElementById('manageGvgRows');
  if (!panel || !rows) return;
  panel.style.display = '';
  manageShowMsg('manageGvgMsg', '');
  rows.innerHTML = `<div class="pending-hint">${ui('generic.loading')}</div>`;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'manageList', guild: guildSlug(), authToken: _authState.token })
    });
    const data = await res.json();
    if (!data.ok) { rows.innerHTML = `<div class="pending-hint">${data.error || 'Erro'}</div>`; return; }
    rows.innerHTML = (data.gvg || []).map(manageGvgRowHtml).join('') ||
      `<div class="pending-hint">${ui('manage.noGvg')}</div>`;
  } catch (err) {
    rows.innerHTML = `<div class="pending-hint">${ui('auth.connectionError')}</div>`;
  }
}

function manageGvgAddRow() {
  const rows = document.getElementById('manageGvgRows');
  if (!rows) return;
  const hint = rows.querySelector('.pending-hint');
  if (hint) hint.remove();
  rows.insertAdjacentHTML('beforeend', manageGvgRowHtml({papel: '', nick: '', observacao: ''}));
}

async function manageGvgSave() {
  const linhas = Array.from(document.querySelectorAll('#manageGvgRows .manage-row-gvg')).map(r => ({
    papel: r.querySelector('.mr-papel').value.trim(),
    nick: r.querySelector('.mr-nick').value.trim(),
    observacao: r.querySelector('.mr-obs').value.trim()
  }));
  const btn = document.getElementById('manageGvgSaveBtn');
  setButtonLoading(btn, true, '...');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'gvgReplace', guild: guildSlug(), authToken: _authState.token, gvg: linhas })
    });
    const data = await res.json();
    if (data.ok) {
      manageGvgClose();
      toast({ msg: data.message, type: 'success' });
      if (typeof loadData === 'function') loadData(true);
    } else {
      manageShowMsg('manageGvgMsg', data.error || 'Erro');
    }
  } catch (err) {
    manageShowMsg('manageGvgMsg', ui('auth.connectionError'));
  } finally {
    setButtonLoading(btn, false);
  }
}

function manageGvgClose() {
  const panel = document.getElementById('manageGvgPanel');
  if (panel) panel.style.display = 'none';
}
```

- [ ] **Step 3: Visibilidade em `updateAuthUI`** — junto do bloco do `btnManageEvents` (logado):

```javascript
    var manageGvgBtn = document.getElementById('btnManageGvg');
    if (manageGvgBtn) manageGvgBtn.style.display = (_authState.user && _authState.user.isLeader) ? '' : 'none';
```

Deslogado:

```javascript
    var manageGvgBtn2 = document.getElementById('btnManageGvg');
    if (manageGvgBtn2) manageGvgBtn2.style.display = 'none';
    var manageGvgPanel2 = document.getElementById('manageGvgPanel');
    if (manageGvgPanel2) manageGvgPanel2.style.display = 'none';
```

- [ ] **Step 4: CSS** — junto das regras da Task 6:

```css
.manage-row-gvg { grid-template-columns: 1fr 1fr 1.5fr 40px; }
@media (max-width: 900px) {
  .manage-row-gvg { grid-template-columns: 1fr 1fr; }
}
```

- [ ] **Step 5: i18n** — `pt`:

```javascript
    'manage.gvgBtn': '✎ Gerenciar GVG',
    'manage.addGvg': '+ Adicionar linha',
    'manage.gvgPapel': 'Papel (ex: Ataque)',
    'manage.gvgNick': 'Nick',
    'manage.gvgObs': 'Observação',
    'manage.noGvg': 'Nenhuma linha ainda — adicione a primeira.',
```

`en`: `'manage.gvgBtn': '✎ Manage GVG', 'manage.addGvg': '+ Add row', 'manage.gvgPapel': 'Role (e.g. Attack)', 'manage.gvgNick': 'Nick', 'manage.gvgObs': 'Note', 'manage.noGvg': 'No rows yet — add the first one.',`
`es`: `'manage.gvgBtn': '✎ Gestionar GVG', 'manage.addGvg': '+ Agregar línea', 'manage.gvgPapel': 'Rol (ej: Ataque)', 'manage.gvgNick': 'Nick', 'manage.gvgObs': 'Nota', 'manage.noGvg': 'Aún no hay líneas — agrega la primera.',`

- [ ] **Step 6: Validar** — `node --check js/app.js && node --check js/data/i18n.js && echo OK` → `OK`.
- [ ] **Step 7: Commit** — `Líder gerencia a escalação de GVG pelo site`.

---

### Task 8: Frontend — seção Configurações (webhook) na aba Membros

**Files:**
- Modify: `index.html` (dentro do `pending-panel` de `#tab-elenco`, após `#elencoLista`), `js/app.js` (`initElencoTab` + funções novas), `js/data/i18n.js`

**Interfaces:**
- Consumes: `manageList`/`configSetWebhook`/`configTestWebhook`, `manageShowMsg` (Task 6), `initElencoTab` (existente)
- Produces: `initGuildConfig()`, `webhookSave()`, `webhookTest()`, `webhookRemove()`.

- [ ] **Step 1: HTML** — dentro do `.pending-panel` de `#tab-elenco`, logo após `<div id="elencoLista">...</div>`:

```html
        <div id="guildConfigSection">
          <h3 class="guildas-h3" data-i18n="config.title">⚙ Configurações</h3>
          <div class="sub" style="font-size:.8rem;margin-bottom:8px;" data-i18n="config.webhookLabel">Webhook do Discord — os avisos da guilda (poder, eventos, resumo) chegam neste canal</div>
          <div class="config-hint pending-hint" id="webhookStatus" style="padding:8px;"></div>
          <div class="elenco-add-row">
            <input type="url" id="webhookInput" maxlength="300" placeholder="https://discord.com/api/webhooks/...">
            <button class="auth-admin-btn approve" id="webhookSaveBtn" onclick="webhookSave()" data-i18n="config.save">Salvar</button>
          </div>
          <div class="manage-actions">
            <button class="auth-admin-btn" id="webhookTestBtn" onclick="webhookTest()" data-i18n="config.test">Enviar teste</button>
            <button class="auth-admin-btn deny" id="webhookRemoveBtn" onclick="webhookRemove()" data-i18n="config.remove">Remover</button>
          </div>
          <div class="auth-msg" id="webhookMsg"></div>
        </div>
```

- [ ] **Step 2: JS** — em `initElencoTab`, acrescentar como última linha (depois do try/catch existente): `initGuildConfig();`. Funções novas (após o bloco da Task 7):

```javascript
// ════════════ CONFIGURAÇÕES DA GUILDA (webhook do Discord) ════════════
async function initGuildConfig() {
  const status = document.getElementById('webhookStatus');
  if (!status) return;
  if (!isLoggedIn() || !_authState.user.isLeader) { status.textContent = ''; return; }
  status.textContent = ui('generic.loading');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'manageList', guild: guildSlug(), authToken: _authState.token })
    });
    const data = await res.json();
    if (!data.ok) { status.textContent = data.error || 'Erro'; return; }
    status.textContent = data.webhookSet
      ? ui('config.statusSet') + ' ' + data.webhookMask
      : ui('config.statusUnset');
  } catch (err) {
    status.textContent = ui('auth.connectionError');
  }
}

async function webhookPost(body, okThen) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify(Object.assign({ guild: guildSlug(), authToken: _authState.token }, body))
    });
    const data = await res.json();
    manageShowMsg('webhookMsg', data.ok ? data.message : (data.error || 'Erro'), data.ok ? 'success' : 'error');
    if (data.ok && okThen) okThen();
  } catch (err) {
    manageShowMsg('webhookMsg', ui('auth.connectionError'));
  }
}

function webhookSave() {
  const inp = document.getElementById('webhookInput');
  const url = inp ? inp.value.trim() : '';
  if (!url) { manageShowMsg('webhookMsg', ui('config.urlRequired')); return; }
  webhookPost({ action: 'configSetWebhook', webhook: url }, () => { if (inp) inp.value = ''; initGuildConfig(); });
}

function webhookTest() {
  webhookPost({ action: 'configTestWebhook' });
}

function webhookRemove() {
  if (!confirm(ui('config.confirmRemove'))) return;
  webhookPost({ action: 'configSetWebhook', webhook: '' }, () => initGuildConfig());
}
```

- [ ] **Step 3: i18n** — `pt`:

```javascript
    'config.title': '⚙ Configurações',
    'config.webhookLabel': 'Webhook do Discord — os avisos da guilda (poder, eventos, resumo) chegam neste canal',
    'config.save': 'Salvar',
    'config.test': 'Enviar teste',
    'config.remove': 'Remover',
    'config.statusSet': 'Webhook configurado:',
    'config.statusUnset': 'Nenhum webhook configurado — os avisos do Discord estão desligados.',
    'config.urlRequired': 'Cole a URL do webhook',
    'config.confirmRemove': 'Remover o webhook? Os avisos do Discord da guilda param de chegar.',
```

`en`: `'config.title': '⚙ Settings', 'config.webhookLabel': 'Discord webhook — guild notices (power, events, summary) arrive in this channel', 'config.save': 'Save', 'config.test': 'Send test', 'config.remove': 'Remove', 'config.statusSet': 'Webhook configured:', 'config.statusUnset': 'No webhook configured — Discord notices are off.', 'config.urlRequired': 'Paste the webhook URL', 'config.confirmRemove': 'Remove the webhook? Guild Discord notices will stop.',`
`es`: `'config.title': '⚙ Configuración', 'config.webhookLabel': 'Webhook de Discord — los avisos del gremio (poder, eventos, resumen) llegan a este canal', 'config.save': 'Guardar', 'config.test': 'Enviar prueba', 'config.remove': 'Quitar', 'config.statusSet': 'Webhook configurado:', 'config.statusUnset': 'Sin webhook configurado — los avisos de Discord están apagados.', 'config.urlRequired': 'Pega la URL del webhook', 'config.confirmRemove': '¿Quitar el webhook? Los avisos de Discord del gremio dejarán de llegar.',`

- [ ] **Step 4: Validar** — `node --check js/app.js && node --check js/data/i18n.js && echo OK` → `OK`.
- [ ] **Step 5: Commit** — `Líder configura o webhook do Discord da guilda pela aba Membros`.

---

### Task 9: Verificação final + zip

- [ ] **Step 1:** `node --check js/app.js && node --check js/app-part1.js && node --check js/app-part2.js && node --check js/data/i18n.js && node -e "new Function(require('fs').readFileSync('backend/apps-script.gs','utf8')); console.log('OK')"` → `OK`.
- [ ] **Step 2 (MANUAL — usuário):** colar backend no Apps Script, rodar `testeMultiGuilda` (→ `✅ TESTE COMPLETO PASSOU`), `testeMultiGuildaLimpar`, publicar Nova versão. Depois subir o zip e, como líder da ARAYASHIKI: criar 2 eventos e a escalação GVG pelo site, configurar o webhook e receber o teste no canal deles; conferir que a TRIADE segue idêntica.
- [ ] **Step 3:** Gerar o zip (PowerShell): `Set-Location C:\Users\Deivid\PhpstormProjects\SaintSeiyaEX; Remove-Item "$env:USERPROFILE\Desktop\triade-site.zip" -Force -ErrorAction SilentlyContinue; & "$env:SystemRoot\System32\tar.exe" -a -c -f "$env:USERPROFILE\Desktop\triade-site.zip" index.html css js img herois assets circlehead skillicons _redirects netlify.toml robots.txt site.webmanifest sitemap.xml calendario-banners.png`.
- [ ] **Step 4:** `git status --short` limpo; commit final se sobrou algo.
