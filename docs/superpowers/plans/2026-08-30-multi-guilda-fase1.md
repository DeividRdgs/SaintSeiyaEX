# Multi-guilda Fase 1 — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Várias guildas no mesmo site: cada guilda com planilha própria criada automaticamente, cadastro/aprovação de guildas e gestão de elenco pelo site, sem tocar nos dados atuais da TRIADE.

**Architecture:** A planilha da TRIADE vira a master (abas novas `Guildas` e `Usuarios_Index`). O Apps Script resolve a planilha da guilda pelo slug enviado em cada requisição (`resolveGuild`, com cache). O frontend guarda `guild`/`guildName` na sessão e envia o slug em toda chamada da área da guilda. Spec: `docs/superpowers/specs/2026-08-30-multi-guilda-design.md`.

**Tech Stack:** Google Apps Script (V8) + Google Sheets (backend, arquivo `backend/apps-script.gs` — colado manualmente no editor do Apps Script ao final), JavaScript vanilla (frontend, `js/*.js`), HTML em `index.html`, i18n em `js/data/i18n.js`.

## Global Constraints

- Zero migração dos dados atuais da TRIADE; único acréscimo na planilha dela: abas `Guildas`, `Usuarios_Index` e coluna `site_admin` na aba `Usuarios`.
- Requisição sem `guild` → fallback `triade` (compatibilidade com JS antigo em cache).
- Senha de líder pendente: só hash+salt na master (nunca texto puro), com `hashSenha` existente.
- Papéis (líder, site admin) sempre revalidados no backend, nunca só na UI.
- Backend em sintaxe ES5-com-V8 no estilo do arquivo (funções `function`, `var`); frontend segue o estilo do arquivo tocado.
- Não há test runner para Apps Script: cada task de backend valida com parse Node (`node -e "new Function(require('fs').readFileSync('backend/apps-script.gs','utf8'))"`) e o ciclo completo roda em `testeMultiGuilda()` no editor do Apps Script (Task 12, manual).
- Frontend: validar cada arquivo tocado com `node --check js/<arquivo>.js`.
- Commits em português, um por task, estilo do repo (imperativo curto).
- i18n: toda string nova de UI ganha chave `pt` + `en` + `es` em `js/data/i18n.js` (dicionários começam em ~linha 60 `pt:`, ~910 `en:`, ~1390 `es:` — adicionar junto das chaves `auth.*`/`guild.*` existentes de cada dicionário).

### Colunas (referência para todas as tasks)

- Master, aba `Guildas` (10 colunas): `slug | nome | spreadsheet_id | status | email_lider | nick_lider | senha_hash | salt | criada_em | aprovada_em`. Status: `pendente`/`ativa`/`recusada`.
- Master, aba `Usuarios_Index` (4 colunas): `email | guild | status | atualizado_em`.
- Guilda, aba `Usuarios` (12 colunas): as 11 atuais + `site_admin` (col 12).
- Guilda, aba `Jogadores`: `Nick | Poder | Atualizado | Email`.
- Guilda, aba `Historico`: `Data | Nick | PoderAntigo | PoderNovo | Origem | Email`.
- Guilda, aba `Eventos`: `Dia | Nome | Horario | Descricao | Status | Recompensa`.
- Guilda, aba `GVG`: `Papel | Nick | Observacao`.
- Guilda, aba `Config`: `chave | valor` (chaves usadas pelo código: `senha_admin`, `webhook_discord`, `contato_email`, `youtube_url`).

---

### Task 1: Backend — master (`ensureMasterSheets`, `resolveGuild`, índice de usuários)

**Files:**
- Modify: `backend/apps-script.gs` (adicionar bloco novo logo após a linha 18, `var TRIADE_BOT_AVATAR = ...`)

**Interfaces:**
- Produces: `ensureMasterSheets() -> {master, guildas, index}`; `slugifyGuildName(nome) -> string`; `findGuildRow(slug) -> {row, slug, nome, spreadsheetId, status, emailLider, nickLider, senhaHash, salt} | null`; `resolveGuild(slugRaw) -> {slug, nome, ss} | null`; `indexFindGuildByEmail(email) -> slug | null`; `indexSetUser(email, guildSlug, status)`; `indexRemoveUser(email)`. Todas usadas pelas Tasks 2–6.

- [ ] **Step 1: Adicionar o bloco de código da master**

Inserir após a linha `var TRIADE_BOT_AVATAR = ...`:

```javascript
// ════════════════════════════════════════════════════════════
//  MULTI-GUILDA — planilha master (registro de guildas + índice)
//  A planilha ativa (TRIADE) é a master; cada guilda tem a sua,
//  aberta por ID via resolveGuild(slug).
// ════════════════════════════════════════════════════════════

function ensureMasterSheets() {
  var master = SpreadsheetApp.getActiveSpreadsheet();
  var g = master.getSheetByName('Guildas');
  if (!g) {
    g = master.insertSheet('Guildas');
    g.appendRow(['slug', 'nome', 'spreadsheet_id', 'status', 'email_lider', 'nick_lider', 'senha_hash', 'salt', 'criada_em', 'aprovada_em']);
    g.setFrozenRows(1);
    g.appendRow(['triade', 'TRIADE', master.getId(), 'ativa', '', '', '', '', '', '']);
  }
  var idx = master.getSheetByName('Usuarios_Index');
  if (!idx) {
    idx = master.insertSheet('Usuarios_Index');
    idx.appendRow(['email', 'guild', 'status', 'atualizado_em']);
    idx.setFrozenRows(1);
  }
  return { master: master, guildas: g, index: idx };
}

function slugifyGuildName(nome) {
  return String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function findGuildRow(slug) {
  var m = ensureMasterSheets();
  var data = m.guildas.getDataRange().getValues();
  var alvo = String(slug || '').trim().toLowerCase();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === alvo) {
      return {
        row: i + 1,
        slug: alvo,
        nome: String(data[i][1] || ''),
        spreadsheetId: String(data[i][2] || '').trim(),
        status: String(data[i][3] || '').trim().toLowerCase(),
        emailLider: String(data[i][4] || '').trim().toLowerCase(),
        nickLider: String(data[i][5] || '').trim(),
        senhaHash: String(data[i][6] || ''),
        salt: String(data[i][7] || '')
      };
    }
  }
  return null;
}

// Resolve o slug para {slug, nome, ss}. Cache de 5 min no CacheService
// (invalidado no guildApprove). Slug vazio → 'triade' (fallback p/ JS antigo).
function resolveGuild(slugRaw) {
  var slug = String(slugRaw || 'triade').trim().toLowerCase() || 'triade';
  var info = null;
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
    var cached = cache.get('guild_' + slug);
    if (cached) info = JSON.parse(cached);
  } catch (e) { info = null; }
  if (!info) {
    var row = findGuildRow(slug);
    if (!row || row.status !== 'ativa' || !row.spreadsheetId) return null;
    info = { slug: slug, nome: row.nome, spreadsheetId: row.spreadsheetId };
    try { if (cache) cache.put('guild_' + slug, JSON.stringify(info), 300); } catch (e2) {}
  }
  var master = SpreadsheetApp.getActiveSpreadsheet();
  var ss = (info.spreadsheetId === master.getId()) ? master : SpreadsheetApp.openById(info.spreadsheetId);
  return { slug: info.slug, nome: info.nome, ss: ss };
}

// ─── Índice email → guilda (um email pertence a UMA guilda) ───
function indexFindGuildByEmail(email) {
  var m = ensureMasterSheets();
  var data = m.index.getDataRange().getValues();
  var alvo = String(email || '').trim().toLowerCase();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === alvo) return String(data[i][1] || '').trim().toLowerCase() || null;
  }
  return null;
}

function indexSetUser(email, guildSlug, status) {
  var m = ensureMasterSheets();
  var data = m.index.getDataRange().getValues();
  var alvo = String(email || '').trim().toLowerCase();
  var now = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === alvo) {
      m.index.getRange(i + 1, 2, 1, 3).setValues([[guildSlug, status, now]]);
      return;
    }
  }
  m.index.appendRow([alvo, guildSlug, status, now]);
}

function indexRemoveUser(email) {
  var m = ensureMasterSheets();
  var data = m.index.getDataRange().getValues();
  var alvo = String(email || '').trim().toLowerCase();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim().toLowerCase() === alvo) { m.index.deleteRow(i + 1); return; }
  }
}
```

- [ ] **Step 2: Validar sintaxe**

Run: `node -e "new Function(require('fs').readFileSync('backend/apps-script.gs','utf8')); console.log('PARSE OK')"`
Expected: `PARSE OK`

- [ ] **Step 3: Commit**

```bash
git add backend/apps-script.gs
git commit -m "Backend multi-guilda: master com registro de guildas e índice de usuários"
```

---

### Task 2: Backend — rotear toda requisição pela guilda (`ctx`)

**Files:**
- Modify: `backend/apps-script.gs` — `doGet` (linhas 21–98), `doPost` (101–128) e os handlers listados abaixo

**Interfaces:**
- Consumes: `resolveGuild`, `indexFindGuildByEmail` (Task 1)
- Produces: todos os handlers de guilda com assinatura `(params, ctx)` onde `ctx = {slug, nome, ss}`. `doGet` devolve também `guildName`. `authLogin`/`authValidateToken` devolvem `guild` e `guildName`.

- [ ] **Step 1: `doGet` resolve a guilda**

Substituir as duas primeiras linhas do `try` do `doGet`:

```javascript
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) || '';
```

por:

```javascript
    var ctx = resolveGuild(e && e.parameter && e.parameter.guild);
    if (!ctx) return jsonResponse({ok: false, error: 'Guilda não encontrada'});
    var ss = ctx.ss;
    var action = (e && e.parameter && e.parameter.action) || '';
```

E no `return jsonResponse({ ok: true, players: ... })` final do `doGet`, acrescentar `guildName: ctx.nome,` logo após `ok: true,`.

- [ ] **Step 2: `doPost` despacha com `ctx`**

Substituir o corpo do despacho (linhas 104–124) por:

```javascript
    var action = params.action || 'update';

    // Ações que resolvem a guilda sozinhas (por email/índice) ou são da master
    if (action === 'authLogin') return authLogin(params);
    if (action === 'authForgotPassword') return authForgotPassword(params);
    if (action === 'authResetPassword') return authResetPassword(params);
    if (action === 'guildRegister') return guildRegister(params);
    if (action === 'guildList') return guildList(params);
    if (action === 'guildListPending') return guildListPending(params);
    if (action === 'guildApprove') return guildApprove(params);
    if (action === 'guildDeny') return guildDeny(params);
    if (action === 'contactSend') return contactSend(params);

    // Demais ações operam na planilha da guilda do params.guild
    var ctx = resolveGuild(params.guild);
    if (!ctx) return jsonResponse({ok: false, error: 'Guilda não encontrada'});

    if (action === 'sendCode') return enviarCodigo(params, ctx);
    if (action === 'abrirVotacao') return abrirVotacao(params, ctx);
    if (action === 'fecharVotacao') return fecharVotacao(params, ctx);
    if (action === 'cancelarVotacao') return cancelarVotacao(params, ctx);
    if (action === 'votar') return registrarVoto(params, ctx);
    if (action === 'configCanal') return configurarCanalYoutube(params, ctx);
    if (action === 'authRegister') return authRegister(params, ctx);
    if (action === 'authGetNicks') return authGetNicksDisponiveis(params, ctx);
    if (action === 'authValidateToken') return authValidateToken(params, ctx);
    if (action === 'authLogout') return authLogout(params, ctx);
    if (action === 'authListPending') return authListPending(params, ctx);
    if (action === 'authApprove') return authApproveUser(params, ctx);
    if (action === 'authDeny') return authDenyUser(params, ctx);
    if (action === 'rosterList') return rosterList(params, ctx);
    if (action === 'rosterAdd') return rosterAdd(params, ctx);
    if (action === 'rosterRemove') return rosterRemove(params, ctx);
    if (action === 'relatorioDisparar') return relatorioDispararAgora(params, ctx);
    return atualizarPoder(params, ctx);
```

(`rosterList/Add/Remove`, `guildRegister` etc. são criados nas Tasks 3–5; o parse Node continua passando porque só são referenciados dentro de funções.)

- [ ] **Step 3: Handlers de guilda usam `ctx.ss`**

Para CADA função abaixo: acrescentar `, ctx` à assinatura e trocar a linha `var ss = SpreadsheetApp.getActiveSpreadsheet();` por `var ss = ctx.ss;`.

| Função | Linha aprox. da assinatura | Linha aprox. do `getActiveSpreadsheet` |
|---|---|---|
| `enviarCodigo` | 131 | 138 |
| `atualizarPoder` | ~220 (assinatura `function atualizarPoder(params)`) | ~230 |
| `abrirVotacao` / `fecharVotacao` / `cancelarVotacao` / `registrarVoto` / `configurarCanalYoutube` | ~1300–1640 | cada uma tem a sua |
| `relatorioDispararAgora` | procurar `function relatorioDispararAgora` | idem |
| `authRegister` | 1792 | 1820 |
| `authGetNicksDisponiveis` | 1867 | 1873 |
| `authValidateToken` | 1972 | 1975 |
| `authLogout` | 2012 | 2015 |
| `authListPending` | 2106 | 2109 |
| `authApproveUser` | 2146 | 2151 |
| `authDenyUser` | 2197 | 2201 |

Comando para conferir que nenhuma sobrou nos handlers (as ocorrências restantes devem estar só em: `doGet` não — já trocado —, `authLogin`, `authForgotPassword`, `authResetPassword`, `contactSend`, funções de trigger/teste — `resumoSemanalDiscord`, `avisarEventosProximos`, `atualizarStatusEventos`, `teste*`, `getDiscordWebhook`, `ensureMasterSheets`, `resolveGuild`, `requireSiteAdmin`):

Run: `grep -n "getActiveSpreadsheet" backend/apps-script.gs`

- [ ] **Step 4: `authLogin` resolve a guilda pelo índice e devolve `guild`/`guildName`**

Em `authLogin`, trocar:

```javascript
  var ss = SpreadsheetApp.getActiveSpreadsheet();
```

por:

```javascript
  var slugIdx = indexFindGuildByEmail(email) || 'triade';
  var ctx = resolveGuild(slugIdx) || resolveGuild('triade');
  if (!ctx) return jsonResponse({ok: false, error: 'Guilda não encontrada'});
  var ss = ctx.ss;
```

E no `return jsonResponse({...})` final, trocar:

```javascript
  return jsonResponse({
    ok: true, token: token,
    user: {email: email, nick: user.data[3], guilda: user.data[4], isLeader: isLeader},
    expiraEm: expiraStr
  });
```

por:

```javascript
  return jsonResponse({
    ok: true, token: token,
    user: {email: email, nick: user.data[3], guilda: user.data[4], isLeader: isLeader, siteAdmin: isSiteAdmin(SpreadsheetApp.getActiveSpreadsheet(), email)},
    guild: ctx.slug, guildName: ctx.nome,
    expiraEm: expiraStr
  });
```

(`isSiteAdmin` vem na Task 4; o parse Node segue passando.)

- [ ] **Step 5: `authValidateToken` devolve `guild`/`guildName`/`siteAdmin`**

No `return jsonResponse({ok: true, user: ...})` da função (linha ~2007), trocar por:

```javascript
    return jsonResponse({ok: true, user: {email: email, nick: user.data[3], guilda: user.data[4], isLeader: isLeader, siteAdmin: isSiteAdmin(SpreadsheetApp.getActiveSpreadsheet(), email)}, guild: ctx.slug, guildName: ctx.nome});
```

- [ ] **Step 6: `authForgotPassword` e `authResetPassword` resolvem pelo índice**

Em cada uma, trocar `var ss = SpreadsheetApp.getActiveSpreadsheet();` por:

```javascript
  var ctxFp = resolveGuild(indexFindGuildByEmail(email) || 'triade');
  if (!ctxFp) return jsonResponse({ok: true, message: 'Se este email existe, um código foi enviado.'});
  var ss = ctxFp.ss;
```

(no `authResetPassword` usar `return jsonResponse({ok: false, error: 'Código não encontrado ou expirado'});` como retorno do guard, em vez da mensagem neutra).

- [ ] **Step 7: Discord por guilda**

Trocar as assinaturas: `function getDiscordWebhook()` → `function getDiscordWebhook(ssArg)` e sua primeira linha `var ss = SpreadsheetApp.getActiveSpreadsheet();` → `var ss = ssArg || SpreadsheetApp.getActiveSpreadsheet();`. Idem `function enviarDiscord(payload)` → `function enviarDiscord(payload, ssArg)` com `var url = getDiscordWebhook(ssArg);`.

Nos handlers que chamam `enviarDiscord`/`avisarDiscordAtualizacao` dentro de contexto de guilda: `avisarDiscordAtualizacao` ganha parâmetro final `ss` repassado como `enviarDiscord({...}, ss)`; em `atualizarPoder`, a chamada `avisarDiscordAtualizacao(nick, oldPower, newPower, origemFinal, posicao, total)` ganha `, ss` no final. `notificarDiscordNovoCadastro(email, nick, now)` ganha `, ss` e repassa. Guilda sem `webhook_discord` no Config → `getDiscordWebhook` devolve `''` e o aviso é pulado (comportamento já existente). Funções de trigger (`resumoSemanalDiscord`, `avisarEventosProximos`) ficam como estão (rodam na master/TRIADE — Fase 2 poderá iterar as guildas).

- [ ] **Step 8: Validar sintaxe**

Run: `node -e "new Function(require('fs').readFileSync('backend/apps-script.gs','utf8')); console.log('PARSE OK')"`
Expected: `PARSE OK`

- [ ] **Step 9: Commit**

```bash
git add backend/apps-script.gs
git commit -m "Backend multi-guilda: toda requisição roteada pela planilha da guilda"
```

---

### Task 3: Backend — `guildRegister` + `guildList`

**Files:**
- Modify: `backend/apps-script.gs` (adicionar após o bloco da Task 1)

**Interfaces:**
- Consumes: `ensureMasterSheets`, `slugifyGuildName`, `findGuildRow`, `indexFindGuildByEmail`, `hashSenha`, `gerarSalt`, `checkActionRateLimit`, `markActionRateLimit`, `checkGlobalRateLimit`, `logEvent`, `maskEmail`, `enviarDiscord`, `jsonResponse`, `AUTH_PWD_MIN_LEN`, `AUTH_NAME_MAX`, `AUTH_RATE_REGISTER_MIN`
- Produces: `guildRegister(params)` e `guildList(params)` (despachadas na Task 2). Resposta de `guildList`: `{ok:true, guilds:[{slug, nome}]}`.

- [ ] **Step 1: Implementar**

```javascript
// ─── Pedido de criação de guilda (fica pendente até o admin do site aprovar) ───
function guildRegister(params) {
  var nome = String(params.nome || '').trim();
  var nick = String(params.nick || '').trim();
  var email = String(params.email || '').trim().toLowerCase();
  var senha = String(params.senha || '');
  if (!nome || !nick || !email || !senha) return jsonResponse({ok: false, error: 'Preencha todos os campos'});
  if (nome.length > 40) return jsonResponse({ok: false, error: 'Nome da guilda muito longo (máx 40)'});
  if (nick.length > AUTH_NAME_MAX) return jsonResponse({ok: false, error: 'Nick muito longo (máx ' + AUTH_NAME_MAX + ' caracteres)'});
  var emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email) || email.length > 100) return jsonResponse({ok: false, error: 'Email inválido'});
  if (senha.length < AUTH_PWD_MIN_LEN) return jsonResponse({ok: false, error: 'A senha precisa ter pelo menos ' + AUTH_PWD_MIN_LEN + ' caracteres'});

  var slug = slugifyGuildName(nome);
  if (!slug || slug.length < 2) return jsonResponse({ok: false, error: 'Nome de guilda inválido'});

  var blockEmail = checkActionRateLimit('guildreg_email:' + email, AUTH_RATE_REGISTER_MIN * 60 * 1000);
  if (blockEmail) return jsonResponse(blockEmail);
  var blockGlobal = checkGlobalRateLimit('guildreg_global', 5, 60 * 60 * 1000);
  if (blockGlobal) return jsonResponse(blockGlobal);

  var m = ensureMasterSheets();
  var existente = findGuildRow(slug);
  if (existente && existente.status !== 'recusada') {
    return jsonResponse({ok: false, error: 'Já existe uma guilda com este nome'});
  }
  if (indexFindGuildByEmail(email)) {
    return jsonResponse({ok: false, error: 'Este email já está cadastrado em uma guilda'});
  }
  var gd = m.guildas.getDataRange().getValues();
  for (var i = 1; i < gd.length; i++) {
    if (String(gd[i][4] || '').trim().toLowerCase() === email &&
        String(gd[i][3] || '').trim().toLowerCase() === 'pendente') {
      return jsonResponse({ok: false, error: 'Este email já tem um pedido de guilda pendente'});
    }
  }

  var salt = gerarSalt();
  var hash = hashSenha(senha, salt);
  var now = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
  if (existente) {
    m.guildas.getRange(existente.row, 1, 1, 10).setValues([[slug, nome, '', 'pendente', email, nick, hash, salt, now, '']]);
  } else {
    m.guildas.appendRow([slug, nome, '', 'pendente', email, nick, hash, salt, now, '']);
  }
  markActionRateLimit('guildreg_email:' + email);
  logEvent('guild_register', {email: maskEmail(email), detalhes: 'Guilda: ' + nome});
  try {
    enviarDiscord({
      username: 'SSEX — Guildas', avatar_url: TRIADE_BOT_AVATAR,
      embeds: [{
        title: '🏰 Novo pedido de guilda', color: 0xd4af37,
        fields: [
          {name: 'Guilda', value: nome, inline: true},
          {name: 'Líder', value: nick, inline: true},
          {name: 'Email', value: maskEmail(email), inline: false}
        ],
        footer: {text: 'Aprove na sub-aba Guildas do site'}
      }]
    });
  } catch (e) { Logger.log('Falha Discord pedido guilda: ' + e.toString()); }
  return jsonResponse({ok: true, message: 'Pedido enviado! Você receberá um email quando a guilda for aprovada.'});
}

// ─── Guildas ativas (para os selects de cadastro) ───
function guildList(params) {
  var block = checkGlobalRateLimit('guildlist_global', 30, 60 * 1000);
  if (block) return jsonResponse(block);
  var m = ensureMasterSheets();
  var data = m.guildas.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][3] || '').trim().toLowerCase() === 'ativa') {
      out.push({slug: String(data[i][0]), nome: String(data[i][1])});
    }
  }
  out.sort(function (a, b) { return a.nome.toLowerCase().localeCompare(b.nome.toLowerCase()); });
  return jsonResponse({ok: true, guilds: out});
}
```

- [ ] **Step 2: Validar sintaxe** — mesmo comando Node da Task 1, esperado `PARSE OK`.

- [ ] **Step 3: Commit**

```bash
git add backend/apps-script.gs
git commit -m "Backend multi-guilda: pedido de criação de guilda e lista de guildas ativas"
```

---

### Task 4: Backend — site admin + aprovação de guildas + criação da planilha

**Files:**
- Modify: `backend/apps-script.gs` — `ensureAuthSheets` (linha 1665) e novo bloco de funções

**Interfaces:**
- Consumes: Task 1 (master/índice), `ensureAuthSheets`, `authFindUser`, `getEmailFromAuthToken`, `formatarData`
- Produces: `isSiteAdmin(ss, email) -> bool` (usada nas respostas de login/validate da Task 2); `requireSiteAdmin(params) -> {ok, email} | {ok:false, resp}`; `guildListPending(params)` (resposta `{ok, pendentes:[{slug,nome,nickLider,email,criadaEm}], ativas:[{slug,nome}]}`); `guildApprove(params{slug})`; `guildDeny(params{slug})`; `criarPlanilhaGuilda(nome) -> spreadsheetId`.

- [ ] **Step 1: Coluna `site_admin` na aba Usuarios**

Em `ensureAuthSheets`: no `appendRow` de criação, trocar o array por
`['email', 'senha_hash', 'salt', 'nick', 'guilda', 'status', 'criado_em', 'aprovado_em', 'aprovado_por', 'ultimo_login', 'lider', 'site_admin']`
e no ramo `else`, trocar `Math.max(users.getLastColumn(), 11)` por `Math.max(users.getLastColumn(), 12)` e acrescentar após o bloco do `hasLider`:

```javascript
    var hasSiteAdmin = false;
    for (var h2 = 0; h2 < headers.length; h2++) {
      if (String(headers[h2]).toLowerCase().trim() === 'site_admin') { hasSiteAdmin = true; break; }
    }
    if (!hasSiteAdmin) {
      users.getRange(1, 12).setValue('site_admin');
      Logger.log('Coluna site_admin adicionada');
    }
```

- [ ] **Step 2: Novo bloco de funções (após `guildList`)**

```javascript
// ─── Admin do site (marcado na coluna site_admin da aba Usuarios da MASTER) ───
function isSiteAdmin(ss, email) {
  var sheets = ensureAuthSheets(ss);
  var user = authFindUser(sheets.users, email);
  if (!user) return false;
  var v = user.data[11];
  if (v === true) return true;
  var s = String(v || '').trim().toLowerCase();
  return (s === 'true' || s === 'sim' || s === 'yes' || s === '1' || s === 'x');
}

function requireSiteAdmin(params) {
  var master = SpreadsheetApp.getActiveSpreadsheet();
  var auth = getEmailFromAuthToken(master, String(params.authToken || ''));
  if (!auth.ok) return {ok: false, resp: jsonResponse({ok: false, error: auth.error, sessionExpired: auth.sessionExpired})};
  if (!isSiteAdmin(master, auth.email)) {
    return {ok: false, resp: jsonResponse({ok: false, error: 'Apenas o administrador do site pode fazer isso.'})};
  }
  return {ok: true, email: auth.email};
}

function guildListPending(params) {
  var adm = requireSiteAdmin(params);
  if (!adm.ok) return adm.resp;
  var m = ensureMasterSheets();
  var data = m.guildas.getDataRange().getValues();
  var pendentes = [];
  var ativas = [];
  for (var i = 1; i < data.length; i++) {
    var st = String(data[i][3] || '').trim().toLowerCase();
    if (st === 'pendente') {
      pendentes.push({
        slug: String(data[i][0]), nome: String(data[i][1]),
        nickLider: String(data[i][5]), email: String(data[i][4]),
        criadaEm: formatarData(data[i][8])
      });
    } else if (st === 'ativa') {
      ativas.push({slug: String(data[i][0]), nome: String(data[i][1])});
    }
  }
  return jsonResponse({ok: true, pendentes: pendentes, ativas: ativas});
}

// Cria a planilha de uma guilda nova com as abas base.
// (Logs, Codigos, Sessoes, Usuarios, Sessoes_Auth e Votacao_* já são criadas
// sob demanda pelo código existente.)
function criarPlanilhaGuilda(nome) {
  var novo = SpreadsheetApp.create('SSEX Guilda — ' + nome);
  var jog = novo.getSheets()[0];
  jog.setName('Jogadores');
  jog.appendRow(['Nick', 'Poder', 'Atualizado', 'Email']);
  jog.setFrozenRows(1);
  var cfg = novo.insertSheet('Config');
  cfg.appendRow(['chave', 'valor']);
  cfg.appendRow(['senha_admin', '']);
  cfg.appendRow(['webhook_discord', '']);
  cfg.setFrozenRows(1);
  var hist = novo.insertSheet('Historico');
  hist.appendRow(['Data', 'Nick', 'PoderAntigo', 'PoderNovo', 'Origem', 'Email']);
  hist.setFrozenRows(1);
  var ev = novo.insertSheet('Eventos');
  ev.appendRow(['Dia', 'Nome', 'Horario', 'Descricao', 'Status', 'Recompensa']);
  ev.setFrozenRows(1);
  var gvg = novo.insertSheet('GVG');
  gvg.appendRow(['Papel', 'Nick', 'Observacao']);
  gvg.setFrozenRows(1);
  ensureAuthSheets(novo);
  return novo.getId();
}

function guildApprove(params) {
  var adm = requireSiteAdmin(params);
  if (!adm.ok) return adm.resp;
  var slug = String(params.slug || '').trim().toLowerCase();
  var g = findGuildRow(slug);
  if (!g) return jsonResponse({ok: false, error: 'Pedido não encontrado'});
  if (g.status === 'ativa') return jsonResponse({ok: false, error: 'Guilda já está ativa'});
  if (!g.emailLider || !g.senhaHash || !g.salt) return jsonResponse({ok: false, error: 'Pedido incompleto — peça um novo cadastro'});
  var m = ensureMasterSheets();
  var now = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');

  // Idempotente: se falhou no meio antes, reusa a planilha já criada
  var novoId = g.spreadsheetId;
  if (!novoId) {
    novoId = criarPlanilhaGuilda(g.nome);
    m.guildas.getRange(g.row, 3).setValue(novoId);
  }
  var novoSs = SpreadsheetApp.openById(novoId);

  var jog = novoSs.getSheetByName('Jogadores');
  var jd = jog.getDataRange().getValues();
  var temNick = false;
  for (var i = 1; i < jd.length; i++) {
    if (String(jd[i][0] || '').trim().toLowerCase() === g.nickLider.toLowerCase()) { temNick = true; break; }
  }
  if (!temNick) jog.appendRow([g.nickLider, '', '', '']);

  var sheets = ensureAuthSheets(novoSs);
  if (!authFindUser(sheets.users, g.emailLider)) {
    sheets.users.appendRow([g.emailLider, g.senhaHash, g.salt, g.nickLider, g.nome, 'aprovado', now, now, adm.email, '', 'sim', '']);
  }

  m.guildas.getRange(g.row, 4).setValue('ativa');
  m.guildas.getRange(g.row, 7, 1, 2).setValues([['', '']]); // higiene: hash/salt saem da master
  m.guildas.getRange(g.row, 10).setValue(now);
  indexSetUser(g.emailLider, slug, 'aprovado');
  try { CacheService.getScriptCache().remove('guild_' + slug); } catch (e) {}
  logEvent('guild_approved', {email: maskEmail(g.emailLider), detalhes: 'Guilda: ' + g.nome + ' | por: ' + adm.email});
  try {
    MailApp.sendEmail({
      to: g.emailLider, subject: '✅ Sua guilda foi aprovada!',
      htmlBody: '<div style="font-family:Georgia,serif;color:#333;max-width:500px;margin:0 auto;padding:20px;">' +
        '<h2 style="color:#d4af37;">⚔ ' + g.nome + ' está no ar!</h2>' +
        '<p>Sua guilda foi aprovada. Faça login com seu email e senha — você já entra como líder.</p>' +
        '<p>No site, use a sub-aba <strong>Elenco</strong> para cadastrar os nicks dos seus jogadores; depois cada um cria a própria conta escolhendo o nick.</p>' +
        '</div>'
    });
  } catch (e2) { Logger.log('Falha email aprovação de guilda: ' + e2.toString()); }
  return jsonResponse({ok: true, message: 'Guilda ' + g.nome + ' aprovada e criada!'});
}

function guildDeny(params) {
  var adm = requireSiteAdmin(params);
  if (!adm.ok) return adm.resp;
  var slug = String(params.slug || '').trim().toLowerCase();
  var g = findGuildRow(slug);
  if (!g) return jsonResponse({ok: false, error: 'Pedido não encontrado'});
  if (g.status === 'ativa') return jsonResponse({ok: false, error: 'Guilda já está ativa — não dá pra recusar'});
  var m = ensureMasterSheets();
  m.guildas.getRange(g.row, 4).setValue('recusada');
  m.guildas.getRange(g.row, 7, 1, 2).setValues([['', '']]);
  logEvent('guild_denied', {email: maskEmail(g.emailLider), detalhes: 'Guilda: ' + g.nome + ' | por: ' + adm.email});
  return jsonResponse({ok: true, message: 'Pedido recusado'});
}
```

- [ ] **Step 3: Validar sintaxe** — comando Node, esperado `PARSE OK`.

- [ ] **Step 4: Commit**

```bash
git add backend/apps-script.gs
git commit -m "Backend multi-guilda: aprovação de guildas com criação automática da planilha"
```

---

### Task 5: Backend — gestão de elenco (`rosterList`/`rosterAdd`/`rosterRemove`) + índice no fluxo de membros

**Files:**
- Modify: `backend/apps-script.gs` — novo bloco + ajustes em `authRegister`, `authApproveUser`, `authDenyUser`

**Interfaces:**
- Consumes: `ctx` (Task 2), `getEmailFromAuthToken`, `ensureAuthSheets`, `isUserLeader`, `indexSetUser`, `indexRemoveUser`, `indexFindGuildByEmail`
- Produces: `rosterList(params, ctx)` → `{ok, nicks:[{nick, power, vinculado}]}`; `rosterAdd(params{nick}, ctx)`; `rosterRemove(params{nick, confirm}, ctx)` → em conflito devolve `{ok:false, needsConfirm:true, error}`.

- [ ] **Step 1: Bloco do elenco (após `guildDeny`)**

```javascript
// ─── Gestão de elenco pelo líder (aba Jogadores) ───
function rosterAssertLeader(params, ctx) {
  var auth = getEmailFromAuthToken(ctx.ss, String(params.authToken || ''));
  if (!auth.ok) return {ok: false, resp: jsonResponse({ok: false, error: auth.error, sessionExpired: auth.sessionExpired})};
  var sheets = ensureAuthSheets(ctx.ss);
  if (!isUserLeader(sheets.users, auth.email)) {
    return {ok: false, resp: jsonResponse({ok: false, error: 'Apenas o líder pode gerenciar o elenco.'})};
  }
  return {ok: true, email: auth.email, sheets: sheets};
}

function rosterFindUserByNick(usersData, nick) {
  var alvo = String(nick || '').trim().toLowerCase();
  for (var i = 1; i < usersData.length; i++) {
    var st = String(usersData[i][5] || '').trim().toLowerCase();
    if (String(usersData[i][3] || '').trim().toLowerCase() === alvo && (st === 'pendente' || st === 'aprovado')) {
      return {row: i + 1, email: String(usersData[i][0] || '').toLowerCase()};
    }
  }
  return null;
}

function rosterList(params, ctx) {
  var lid = rosterAssertLeader(params, ctx);
  if (!lid.ok) return lid.resp;
  var jog = ctx.ss.getSheetByName('Jogadores');
  if (!jog) return jsonResponse({ok: true, nicks: []});
  var jd = jog.getDataRange().getValues();
  var usersData = lid.sheets.users.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < jd.length; i++) {
    var nick = String(jd[i][0] || '').trim();
    if (!nick) continue;
    out.push({
      nick: nick,
      power: Number(jd[i][1] || 0),
      vinculado: !!rosterFindUserByNick(usersData, nick)
    });
  }
  out.sort(function (a, b) { return a.nick.toLowerCase().localeCompare(b.nick.toLowerCase()); });
  return jsonResponse({ok: true, nicks: out});
}

function rosterAdd(params, ctx) {
  var lid = rosterAssertLeader(params, ctx);
  if (!lid.ok) return lid.resp;
  var nick = String(params.nick || '').trim();
  if (!nick) return jsonResponse({ok: false, error: 'Informe o nick'});
  if (nick.length > AUTH_NAME_MAX) return jsonResponse({ok: false, error: 'Nick muito longo (máx ' + AUTH_NAME_MAX + ' caracteres)'});
  var jog = ctx.ss.getSheetByName('Jogadores');
  if (!jog) return jsonResponse({ok: false, error: 'Aba de jogadores não encontrada'});
  var jd = jog.getDataRange().getValues();
  for (var i = 1; i < jd.length; i++) {
    if (String(jd[i][0] || '').trim().toLowerCase() === nick.toLowerCase()) {
      return jsonResponse({ok: false, error: 'Este nick já está no elenco'});
    }
  }
  jog.appendRow([nick, '', '', '']);
  logEvent('roster_add', {email: maskEmail(lid.email), detalhes: 'Nick: ' + nick});
  return jsonResponse({ok: true, message: 'Nick adicionado ao elenco'});
}

function rosterRemove(params, ctx) {
  var lid = rosterAssertLeader(params, ctx);
  if (!lid.ok) return lid.resp;
  var nick = String(params.nick || '').trim();
  if (!nick) return jsonResponse({ok: false, error: 'Informe o nick'});
  var jog = ctx.ss.getSheetByName('Jogadores');
  if (!jog) return jsonResponse({ok: false, error: 'Aba de jogadores não encontrada'});
  var jd = jog.getDataRange().getValues();
  var alvoRow = 0;
  for (var i = 1; i < jd.length; i++) {
    if (String(jd[i][0] || '').trim().toLowerCase() === nick.toLowerCase()) { alvoRow = i + 1; break; }
  }
  if (!alvoRow) return jsonResponse({ok: false, error: 'Nick não encontrado no elenco'});

  var usersData = lid.sheets.users.getDataRange().getValues();
  var conta = rosterFindUserByNick(usersData, nick);
  if (conta && conta.email === lid.email) {
    return jsonResponse({ok: false, error: 'Você não pode remover o próprio nick de líder'});
  }
  if (conta && params.confirm !== true) {
    return jsonResponse({ok: false, needsConfirm: true, error: 'Este nick tem uma conta vinculada. Confirmar remove o nick E desativa a conta.'});
  }
  jog.deleteRow(alvoRow);
  if (conta) {
    lid.sheets.users.getRange(conta.row, 6).setValue('removido');
    indexRemoveUser(conta.email);
  }
  logEvent('roster_remove', {email: maskEmail(lid.email), detalhes: 'Nick: ' + nick + (conta ? ' (conta desativada)' : '')});
  return jsonResponse({ok: true, message: 'Nick removido do elenco'});
}
```

- [ ] **Step 2: Índice global no fluxo de membros**

Em `authRegister` (já com `ctx` da Task 2): após o bloco `var existing = authFindUser(...)` e seus `if`s, acrescentar:

```javascript
  var guildaDoEmail = indexFindGuildByEmail(email);
  if (guildaDoEmail && guildaDoEmail !== ctx.slug) {
    return jsonResponse({ok: false, error: 'Este email já está cadastrado em outra guilda.'});
  }
```

E logo após a linha `sheets.users.appendRow([...])`, acrescentar:

```javascript
  indexSetUser(email, ctx.slug, 'pendente');
```

Em `authApproveUser`: trocar `var guilda = String(params.guilda || 'Triade');` por `var guilda = String(params.guilda || ctx.nome);` e, após `sheets.users.getRange(user.row, 9).setValue(aprovadoPor);`, acrescentar `indexSetUser(email, ctx.slug, 'aprovado');`.

Em `authDenyUser`: após `sheets.users.getRange(user.row, 9).setValue(negadoPor);`, acrescentar `indexRemoveUser(email);`.

- [ ] **Step 3: Validar sintaxe** — comando Node, esperado `PARSE OK`.

- [ ] **Step 4: Commit**

```bash
git add backend/apps-script.gs
git commit -m "Backend multi-guilda: gestão de elenco pelo líder e índice global de emails"
```

---

### Task 6: Backend — `testeMultiGuilda()` + runbook de implantação

**Files:**
- Modify: `backend/apps-script.gs` (função de teste no final do arquivo)
- Create: `backend/README.md`

**Interfaces:**
- Consumes: tudo das Tasks 1–5
- Produces: `testeMultiGuilda()` executável no editor do Apps Script; runbook para o deploy manual.

- [ ] **Step 1: Função de teste ponta a ponta (final do arquivo)**

```javascript
// ═══ TESTE: ciclo multi-guilda completo (rodar no editor; usa guilda-teste-ex) ═══
function testeMultiGuilda() {
  var slug = 'guilda-teste-ex';
  var emailLider = 'lider.teste@example.com';
  var m = ensureMasterSheets();
  Logger.log('1. master ok: ' + m.guildas.getName() + ' / ' + m.index.getName());

  // limpa execução anterior
  var g0 = findGuildRow(slug);
  if (g0) {
    if (g0.spreadsheetId) { try { DriveApp.getFileById(g0.spreadsheetId).setTrashed(true); } catch (e) {} }
    m.guildas.deleteRow(g0.row);
  }
  indexRemoveUser(emailLider);
  indexRemoveUser('membro.teste@example.com');
  try { CacheService.getScriptCache().remove('guild_' + slug); } catch (e) {}

  // pedido → aprovação (bypass do requireSiteAdmin: testa as partes internas)
  var salt = gerarSalt();
  m.guildas.appendRow([slug, 'Guilda Teste EX', '', 'pendente', emailLider, 'LiderTeste', hashSenha('senha123', salt), salt, '01/01/2026 00:00:00', '']);
  var g = findGuildRow(slug);
  var novoId = criarPlanilhaGuilda(g.nome);
  m.guildas.getRange(g.row, 3).setValue(novoId);
  m.guildas.getRange(g.row, 4).setValue('ativa');
  var novoSs = SpreadsheetApp.openById(novoId);
  var sheets = ensureAuthSheets(novoSs);
  sheets.users.appendRow([emailLider, g.senhaHash, g.salt, 'LiderTeste', g.nome, 'aprovado', '01/01/2026 00:00:00', '01/01/2026 00:00:00', 'teste', '', 'sim', '']);
  novoSs.getSheetByName('Jogadores').appendRow(['LiderTeste', '', '', '']);
  indexSetUser(emailLider, slug, 'aprovado');
  Logger.log('2. guilda criada: ' + novoId);

  // resolveGuild isola as planilhas
  var ctxT = resolveGuild(slug);
  var ctxTriade = resolveGuild('triade');
  if (ctxT.ss.getId() === ctxTriade.ss.getId()) throw new Error('FALHA: guilda de teste caiu na planilha da TRIADE');
  Logger.log('3. isolamento ok');

  // login do líder resolve a guilda pelo índice
  var loginResp = JSON.parse(authLogin({email: emailLider, senha: 'senha123'}).getContent());
  if (!loginResp.ok) throw new Error('FALHA login: ' + loginResp.error);
  if (loginResp.guild !== slug) throw new Error('FALHA: login caiu na guilda ' + loginResp.guild);
  if (!loginResp.user.isLeader) throw new Error('FALHA: líder sem flag isLeader');
  Logger.log('4. login ok, guild=' + loginResp.guild);

  // elenco: add + list + register de membro
  var ctx = resolveGuild(slug);
  var addResp = JSON.parse(rosterAdd({authToken: loginResp.token, nick: 'MembroTeste'}, ctx).getContent());
  if (!addResp.ok) throw new Error('FALHA rosterAdd: ' + addResp.error);
  var regResp = JSON.parse(authRegister({email: 'membro.teste@example.com', senha: 'senha123', nick: 'MembroTeste'}, ctx).getContent());
  if (!regResp.ok) throw new Error('FALHA authRegister: ' + regResp.error);
  if (indexFindGuildByEmail('membro.teste@example.com') !== slug) throw new Error('FALHA: índice não registrou o membro');
  var listResp = JSON.parse(rosterList({authToken: loginResp.token}, ctx).getContent());
  if (listResp.nicks.length !== 2) throw new Error('FALHA rosterList: esperava 2 nicks, veio ' + listResp.nicks.length);
  Logger.log('5. elenco + cadastro de membro ok');

  // TRIADE intacta: membro de teste não aparece lá
  var jogTriade = ctxTriade.ss.getSheetByName('Jogadores').getDataRange().getValues();
  for (var i = 1; i < jogTriade.length; i++) {
    if (String(jogTriade[i][0]).toLowerCase() === 'membroteste') throw new Error('FALHA: vazou nick pra TRIADE');
  }
  Logger.log('6. TRIADE intacta — ✅ TESTE COMPLETO PASSOU');
  Logger.log('Limpeza: rode testeMultiGuildaLimpar() para remover a guilda de teste.');
}

function testeMultiGuildaLimpar() {
  var slug = 'guilda-teste-ex';
  var m = ensureMasterSheets();
  var g = findGuildRow(slug);
  if (g) {
    if (g.spreadsheetId) { try { DriveApp.getFileById(g.spreadsheetId).setTrashed(true); } catch (e) {} }
    m.guildas.deleteRow(g.row);
  }
  indexRemoveUser('lider.teste@example.com');
  indexRemoveUser('membro.teste@example.com');
  try { CacheService.getScriptCache().remove('guild_' + slug); } catch (e2) {}
  Logger.log('✅ Guilda de teste removida');
}
```

- [ ] **Step 2: Runbook `backend/README.md`**

```markdown
# Backend (Google Apps Script)

`apps-script.gs` é a fonte da verdade do backend. Ele NÃO sobe sozinho: é colado
no editor do Apps Script da planilha da TRIADE (Extensões → Apps Script).

## Implantar uma nova versão

1. Copie todo o conteúdo de `apps-script.gs` por cima do código no editor. Salve.
2. Rode a função `ensureMasterSheets` uma vez (cria as abas `Guildas` e
   `Usuarios_Index`; a primeira execução pede autorização — inclui o escopo do
   Drive usado para criar planilhas de guildas novas).
3. Rode `testeMultiGuilda` e confira no log `✅ TESTE COMPLETO PASSOU`; depois
   rode `testeMultiGuildaLimpar`.
4. Na aba `Usuarios` da planilha da TRIADE, escreva `sim` na coluna
   `site_admin` da SUA linha (quem aprova guildas).
5. Implantar → Gerenciar implantações → editar a implantação ativa → Nova
   versão → Implantar. A URL não muda (o site continua funcionando).

## Estrutura

- Planilha da TRIADE = master (abas `Guildas` e `Usuarios_Index`) e também a
  planilha da guilda TRIADE.
- Cada guilda aprovada ganha uma planilha própria "SSEX Guilda — <nome>" no
  Drive, criada por `criarPlanilhaGuilda`.
- Toda requisição do site envia `guild=<slug>`; sem o parâmetro, cai na TRIADE.
```

- [ ] **Step 3: Validar sintaxe** — comando Node, esperado `PARSE OK`.

- [ ] **Step 4: Commit**

```bash
git add backend/apps-script.gs backend/README.md
git commit -m "Backend multi-guilda: teste ponta a ponta e runbook de implantação"
```

---

### Task 7: Frontend — sessão com guilda + slug em toda chamada

**Files:**
- Modify: `js/app-part1.js` (após a linha 5, `const API_URL = ...`), `js/app.js` (auth: linhas ~5296–5360, ~5531–5560, logout), `js/app-part2.js` (cache + fetch de dados: linhas 62–82, 141; e fetch linha 1322/1403)

**Interfaces:**
- Consumes: respostas de `authLogin`/`authValidateToken` com `guild`/`guildName` (Task 2)
- Produces: `guildSlug() -> string` e `guildDisplayName() -> string` (globais, usadas nas Tasks 8–11); `_authState.guild`/`_authState.guildName` persistidos.

- [ ] **Step 1: Helpers em `js/app-part1.js`**

Logo após `const API_URL = ...`:

```javascript
// ─── Multi-guilda: slug da guilda da sessão (fallback: triade) ───
function guildSlug() {
  try {
    if (typeof _authState !== 'undefined' && _authState && _authState.guild) return _authState.guild;
  } catch (e) {}
  return 'triade';
}
function guildDisplayName() {
  try {
    if (typeof _authState !== 'undefined' && _authState && _authState.guildName) return _authState.guildName;
  } catch (e) {}
  return 'TRIADE';
}
```

- [ ] **Step 2: Persistir a guilda na sessão (`js/app.js`)**

Em `authLoadFromStorage`, dentro do `if (parsed && parsed.token)`, acrescentar:

```javascript
        _authState.guild = parsed.guild || null;
        _authState.guildName = parsed.guildName || null;
```

Em `authSaveToStorage`, trocar o `setItem` por:

```javascript
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({token: _authState.token, user: _authState.user, guild: _authState.guild || null, guildName: _authState.guildName || null}));
```

Em `authSubmitLogin`, no `if (data.ok) {` antes de `authSaveToStorage();`, acrescentar:

```javascript
      _authState.guild = data.guild || 'triade';
      _authState.guildName = data.guildName || 'TRIADE';
```

e após `closeAuthModal();` acrescentar `if (typeof loadData === 'function') loadData(true);` (recarrega os dados na guilda certa).

Em `authValidateStoredToken`, o corpo da requisição vira
`JSON.stringify({ action: 'authValidateToken', token: _authState.token, guild: guildSlug() })`
e no ramo `if (data.ok)` acrescentar antes de `authSaveToStorage()`:

```javascript
      _authState.guild = data.guild || _authState.guild || 'triade';
      _authState.guildName = data.guildName || _authState.guildName || 'TRIADE';
```

No logout (procurar `action: 'authLogout'`, linha ~5668): acrescentar `guild: guildSlug(),` no corpo, e onde o estado é limpo (`_authState.token = null; _authState.user = null;` — no fluxo de logout e no ramo de token inválido de `authValidateStoredToken`) acrescentar `_authState.guild = null; _authState.guildName = null;`.

- [ ] **Step 3: Slug em todas as chamadas da área da guilda**

Regra mecânica: em `js/app.js` e `js/app-part2.js`, todo corpo `JSON.stringify({ action: '<X>', ...})` com `<X>` em
{`sendCode`, `update` (o POST default de `atualizarPoder`), `abrirVotacao`, `fecharVotacao`, `cancelarVotacao`, `votar`, `configCanal`, `authRegister`, `authGetNicks`, `authListPending`, `authApprove`, `authDeny`, `relatorioDisparar`}
ganha `guild: guildSlug(),` logo após o `action`. Para listar os pontos:

Run: `grep -n "JSON.stringify({\s*action" js/app.js js/app-part2.js`

Exemplo do formato (todos iguais):

```javascript
      body: JSON.stringify({ action: 'authGetNicks', guild: guildSlug() })
```

GETs ganham o parâmetro na URL:
- `js/app-part2.js:141`: `fetch(API_URL + "?t=" + Date.now() + "&guild=" + encodeURIComponent(guildSlug()))`
- `js/app.js:967`: `fetch(API_URL + '?action=historico&guild=' + encodeURIComponent(guildSlug()) + '&t=' + Date.now())`
- `js/app.js:2989`: `fetch(API_URL + '?action=votacao&guild=' + encodeURIComponent(guildSlug()) + '&t=' + Date.now())`

- [ ] **Step 4: Cache local por guilda (`js/app-part2.js` linhas 62–82)**

Trocar `const CACHE_KEY = 'triade_cache_v1';` por:

```javascript
function cacheKey() { return 'triade_cache_v1_' + guildSlug(); }
```

e nos `readCache`/`writeCache` trocar `CACHE_KEY` por `cacheKey()`.

- [ ] **Step 5: Validar sintaxe**

Run: `node --check js/app.js && node --check js/app-part1.js && node --check js/app-part2.js && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add js/app-part1.js js/app.js js/app-part2.js
git commit -m "Frontend multi-guilda: guilda na sessão e slug em toda chamada da área da guilda"
```

---

### Task 8: Frontend — cadastro de membro escolhe a guilda

**Files:**
- Modify: `index.html` (modal, linhas ~1268–1294), `js/app.js` (`switchAuthView` ~5488, `authLoadNicksDisponiveis` ~5494, `authSubmitRegister` ~5563), `js/data/i18n.js`

**Interfaces:**
- Consumes: `guildList` (Task 3), `authGetNicks` com `guild` (Task 7)
- Produces: `authLoadGuildsSelect()`; select `#authRegGuild` cujo `value` é o slug.

- [ ] **Step 1: Campo de guilda no modal (`index.html`)**

Antes do `auth-field` do nick (linha ~1272), inserir:

```html
        <div class="auth-field">
          <label data-i18n="auth.regGuildLabel">Sua guilda</label>
          <select id="authRegGuild" onchange="authLoadNicksDisponiveis()">
            <option value="" data-i18n="auth.regGuildLoading">— Carregando guildas... —</option>
          </select>
        </div>
```

- [ ] **Step 2: Carregar guildas e nicks por guilda (`js/app.js`)**

Em `switchAuthView`, trocar `if (view === 'register') { authLoadNicksDisponiveis(); }` por `if (view === 'register') { authLoadGuildsSelect(); }`.

Nova função antes de `authLoadNicksDisponiveis`:

```javascript
// Carrega guildas ativas no select do cadastro; depois carrega os nicks da escolhida
async function authLoadGuildsSelect() {
  const sel = document.getElementById('authRegGuild');
  if (!sel) { authLoadNicksDisponiveis(); return; }
  sel.innerHTML = `<option value="">${ui('auth.regGuildLoading')}</option>`;
  sel.disabled = true;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'guildList' })
    });
    const data = await res.json();
    if (data.ok && Array.isArray(data.guilds) && data.guilds.length > 0) {
      sel.innerHTML = data.guilds.map(g =>
        `<option value="${g.slug.replace(/"/g, '&quot;')}">${g.nome.replace(/</g, '&lt;')}</option>`).join('');
    } else {
      sel.innerHTML = `<option value="triade">TRIADE</option>`;
    }
  } catch (err) {
    sel.innerHTML = `<option value="triade">TRIADE</option>`;
  } finally {
    sel.disabled = false;
    authLoadNicksDisponiveis();
  }
}
```

Em `authLoadNicksDisponiveis`, trocar o corpo da requisição por:

```javascript
      body: JSON.stringify({ action: 'authGetNicks', guild: (document.getElementById('authRegGuild') || {}).value || 'triade' })
```

(este ponto substitui a regra mecânica da Task 7 para `authGetNicks`.)

Em `authSubmitRegister`, o corpo vira:

```javascript
      body: JSON.stringify({ action: 'authRegister', guild: (document.getElementById('authRegGuild') || {}).value || 'triade', email, senha, nick })
```

e acrescentar validação após pegar os campos: `const regGuild = (document.getElementById('authRegGuild') || {}).value; if (!regGuild) { authShowMsg('register', ui('auth.regGuildRequired'), 'error'); return; }`.

- [ ] **Step 3: Chaves i18n (`js/data/i18n.js`)**

No dicionário `pt` (junto das chaves `auth.*`):

```javascript
    'auth.regGuildLabel': 'Sua guilda',
    'auth.regGuildLoading': '— Carregando guildas... —',
    'auth.regGuildRequired': 'Escolha a sua guilda',
```

No `en`: `'auth.regGuildLabel': 'Your guild', 'auth.regGuildLoading': '— Loading guilds... —', 'auth.regGuildRequired': 'Choose your guild',`
No `es`: `'auth.regGuildLabel': 'Tu gremio', 'auth.regGuildLoading': '— Cargando gremios... —', 'auth.regGuildRequired': 'Elige tu gremio',`

- [ ] **Step 4: Validar** — `node --check js/app.js && node --check js/data/i18n.js && echo OK` → `OK`

- [ ] **Step 5: Commit**

```bash
git add index.html js/app.js js/data/i18n.js
git commit -m "Cadastro de membro escolhe a guilda antes do nick"
```

---

### Task 9: Frontend — cadastro de guilda (nova view no modal)

**Files:**
- Modify: `index.html` (após a view `authView-pending`, ~linha 1305), `js/app.js` (nova função de submit, junto das outras `authSubmit*`), `js/data/i18n.js`

**Interfaces:**
- Consumes: `guildRegister` (Task 3), `switchAuthView` (existente — aceita qualquer sufixo de `authView-*`)
- Produces: views `authView-guild` e `authView-guildPending`; `authSubmitGuildRegister()`.

- [ ] **Step 1: Views no modal (`index.html`)**

Após o fechamento da view `authView-pending` (linha ~1305), inserir:

```html
      <!-- CADASTRO DE GUILDA -->
      <div class="auth-view" id="authView-guild">
        <h2 class="auth-title" data-i18n="auth.titleGuild">Cadastrar Guilda</h2>
        <div class="auth-subtitle" data-i18n="auth.guildSubtitle">Peça a criação da sua guilda. Você será o líder quando for aprovada.</div>
        <div class="auth-msg"></div>
        <div class="auth-field">
          <label data-i18n="auth.guildNameLabel">Nome da guilda</label>
          <input type="text" id="authGuildName" maxlength="40" placeholder="Minha Legião" data-i18n-placeholder="auth.guildNamePh">
        </div>
        <div class="auth-field">
          <label data-i18n="auth.guildNickLabel">Seu nick no jogo</label>
          <input type="text" id="authGuildNick" maxlength="30" placeholder="Nick" data-i18n-placeholder="auth.guildNickPh">
        </div>
        <div class="auth-field">
          <label data-i18n="auth.email">Email</label>
          <input type="email" id="authGuildEmail" placeholder="seu@email.com" autocomplete="email" data-i18n-placeholder="auth.emailPh">
        </div>
        <div class="auth-field">
          <label data-i18n="auth.regPassword">Senha (mín 6 caracteres)</label>
          <input type="password" id="authGuildPassword" placeholder="••••••••" autocomplete="new-password">
        </div>
        <div class="auth-field">
          <label data-i18n="auth.regPassword2">Confirme a senha</label>
          <input type="password" id="authGuildPassword2" placeholder="••••••••" autocomplete="new-password" onkeydown="if(event.key==='Enter') authSubmitGuildRegister(event)">
        </div>
        <button class="auth-btn primary" id="authGuildSubmitBtn" onclick="authSubmitGuildRegister(event)" data-i18n="auth.guildBtn">🏰 Pedir Criação</button>
        <div class="auth-links">
          <a href="javascript:void(0)" onclick="switchAuthView('register')" data-i18n="auth.backToRegister">← Voltar</a>
        </div>
      </div>

      <!-- GUILDA AGUARDANDO APROVAÇÃO -->
      <div class="auth-view" id="authView-guildPending">
        <div class="auth-pending-icon">🏰</div>
        <h2 class="auth-title" data-i18n="auth.guildDoneTitle">Pedido Enviado!</h2>
        <p class="auth-pending-text" data-i18n="auth.guildDoneText">
          Seu pedido de guilda foi enviado ao administrador do site.<br>
          Você vai receber um <strong>email</strong> quando for aprovada — aí é só fazer login como líder.
        </p>
        <button class="auth-btn primary" onclick="closeAuthModal()" data-i18n="auth.gotIt">Entendi</button>
      </div>
```

E na view `authView-register`, dentro do `auth-links` (linha ~1291), acrescentar antes do link existente:

```html
          <a href="javascript:void(0)" onclick="switchAuthView('guild')" data-i18n="auth.createGuildLink">Cadastrar minha guilda</a>
          <span class="auth-sep">·</span>
```

- [ ] **Step 2: Submit (`js/app.js`, após `authSubmitRegister`)**

```javascript
async function authSubmitGuildRegister(e) {
  if (e) e.preventDefault();
  const nome = document.getElementById('authGuildName').value.trim();
  const nick = document.getElementById('authGuildNick').value.trim();
  const email = document.getElementById('authGuildEmail').value.trim().toLowerCase();
  const senha = document.getElementById('authGuildPassword').value;
  const senha2 = document.getElementById('authGuildPassword2').value;

  if (!nome || !nick || !email || !senha) { authShowMsg('guild', ui('auth.fillAll'), 'error'); return; }
  if (senha !== senha2) { authShowMsg('guild', 'As senhas não coincidem', 'error'); return; }
  if (senha.length < 6) { authShowMsg('guild', 'A senha precisa ter pelo menos 6 caracteres', 'error'); return; }

  const btn = document.getElementById('authGuildSubmitBtn');
  setButtonLoading(btn, true, 'Enviando...');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'guildRegister', nome, nick, email, senha })
    });
    const data = await res.json();
    if (data.ok) {
      switchAuthView('guildPending');
    } else {
      authShowMsg('guild', data.error || 'Erro', 'error');
    }
  } catch (err) {
    authShowMsg('guild', 'Erro de conexão', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}
```

- [ ] **Step 3: Chaves i18n**

`pt`:

```javascript
    'auth.titleGuild': 'Cadastrar Guilda',
    'auth.guildSubtitle': 'Peça a criação da sua guilda. Você será o líder quando for aprovada.',
    'auth.guildNameLabel': 'Nome da guilda',
    'auth.guildNamePh': 'Minha Legião',
    'auth.guildNickLabel': 'Seu nick no jogo',
    'auth.guildNickPh': 'Nick',
    'auth.guildBtn': '🏰 Pedir Criação',
    'auth.backToRegister': '← Voltar',
    'auth.createGuildLink': 'Cadastrar minha guilda',
    'auth.guildDoneTitle': 'Pedido Enviado!',
    'auth.guildDoneText': 'Seu pedido de guilda foi enviado ao administrador do site.<br>Você vai receber um <strong>email</strong> quando for aprovada — aí é só fazer login como líder.',
    'auth.fillAll': 'Preencha todos os campos',
```

`en`: `'auth.titleGuild': 'Register Guild', 'auth.guildSubtitle': 'Request your guild. You become its leader once approved.', 'auth.guildNameLabel': 'Guild name', 'auth.guildNamePh': 'My Legion', 'auth.guildNickLabel': 'Your in-game nick', 'auth.guildNickPh': 'Nick', 'auth.guildBtn': '🏰 Request Creation', 'auth.backToRegister': '← Back', 'auth.createGuildLink': 'Register my guild', 'auth.guildDoneTitle': 'Request Sent!', 'auth.guildDoneText': 'Your guild request was sent to the site admin.<br>You will get an <strong>email</strong> once approved — then just log in as leader.', 'auth.fillAll': 'Fill in all fields',`

`es`: `'auth.titleGuild': 'Registrar Gremio', 'auth.guildSubtitle': 'Pide la creación de tu gremio. Serás el líder cuando sea aprobado.', 'auth.guildNameLabel': 'Nombre del gremio', 'auth.guildNamePh': 'Mi Legión', 'auth.guildNickLabel': 'Tu nick en el juego', 'auth.guildNickPh': 'Nick', 'auth.guildBtn': '🏰 Pedir Creación', 'auth.backToRegister': '← Volver', 'auth.createGuildLink': 'Registrar mi gremio', 'auth.guildDoneTitle': '¡Pedido Enviado!', 'auth.guildDoneText': 'Tu pedido fue enviado al administrador del sitio.<br>Recibirás un <strong>email</strong> cuando sea aprobado — luego inicia sesión como líder.', 'auth.fillAll': 'Completa todos los campos',`

- [ ] **Step 4: Validar** — `node --check js/app.js && node --check js/data/i18n.js && echo OK` → `OK`

- [ ] **Step 5: Commit**

```bash
git add index.html js/app.js js/data/i18n.js
git commit -m "Cadastro de guilda pelo site (pedido pendente de aprovação)"
```

---

### Task 10: Frontend — nome da guilda dinâmico na área da guilda

**Files:**
- Modify: `js/app.js` (`updateAuthUI`, linha ~5405), `index.html` (linha 195)

**Interfaces:**
- Consumes: `guildDisplayName()` (Task 7)
- Produces: `applyGuildBranding()` chamada em `updateAuthUI`.

- [ ] **Step 1: Marcar o h1 do header da guilda (`index.html` linha 195)**

Trocar `<h1>TRIADE</h1>` por `<h1 id="guildHeroName">TRIADE</h1>`.

- [ ] **Step 2: Aplicar branding (`js/app.js`)**

Antes de `updateAuthUI`:

```javascript
// Nome da guilda logada nos pontos da área da guilda
function applyGuildBranding() {
  var h = document.getElementById('guildHeroName');
  if (h) h.textContent = guildDisplayName();
  // Descrições de rota (usadas no meta description da área da guilda)
  try {
    var nome = guildDisplayName();
    TAB_ROUTES.guilda.desc = 'Área restrita aos membros da guilda ' + nome + '.';
    TAB_ROUTES.guilda.desc_en = 'Restricted area for members of the ' + nome + ' guild.';
  } catch (e) {}
}
```

Dentro de `updateAuthUI`, como primeira linha do corpo: `applyGuildBranding();`.

- [ ] **Step 3: Validar** — `node --check js/app.js && echo OK` → `OK`

- [ ] **Step 4: Commit**

```bash
git add index.html js/app.js
git commit -m "Header da área da guilda mostra o nome da guilda logada"
```

---

### Task 11: Frontend — sub-aba Elenco (líder)

**Files:**
- Modify: `index.html` (subnav linha ~211 e novo `tab-content`), `js/app-part2.js` (`GUILD_SUBTAB_ROUTES` linha ~280, `runTabInitHook` linha ~387), `js/app.js` (`updateAuthUI` + funções novas no fim do arquivo), `js/data/i18n.js`

**Interfaces:**
- Consumes: `rosterList`/`rosterAdd`/`rosterRemove` (Task 5), `guildSlug()` (Task 7)
- Produces: sub-aba `elenco` com `initElencoTab()` (hook), `elencoAdd()`, `elencoRemove(nick, vinculado)`.

- [ ] **Step 1: Botão e conteúdo (`index.html`)**

No subnav, após o botão `pendentes` (linha 211):

```html
    <button class="guild-subtab" data-subtab="elenco" data-i18n="guild.subElenco" id="subtabElencoBtn" style="display:none;">Elenco</button>
    <button class="guild-subtab" data-subtab="guildas" data-i18n="guild.subGuildas" id="subtabGuildasBtn" style="display:none;">Guildas</button>
```

(o botão `guildas` já entra aqui; a Task 12 usa.)

Logo antes do fechamento do último `tab-content` da área da guilda (procurar `id="tab-pendentes"` e inserir DEPOIS do fechamento daquele div):

```html
  <!-- ============ SUB-ABA: ELENCO (só líder) ============ -->
  <div class="tab-content" id="tab-elenco">
    <div class="panel">
      <h2 data-i18n="elenco.title">⚔ Elenco da Guilda</h2>
      <p class="pending-hint" data-i18n="elenco.hint">Adicione os nicks dos jogadores; cada um cria a própria conta escolhendo o nick no cadastro.</p>
      <div style="display:flex;gap:8px;margin:12px 0;">
        <input type="text" id="elencoNovoNick" maxlength="30" placeholder="Nick do jogador" data-i18n-placeholder="elenco.nickPh" style="flex:1;" onkeydown="if(event.key==='Enter') elencoAdd()">
        <button class="auth-btn primary" id="elencoAddBtn" onclick="elencoAdd()" data-i18n="elenco.addBtn">+ Adicionar</button>
      </div>
      <div class="auth-msg" id="elencoMsg"></div>
      <div id="elencoLista"><div class="pending-hint" data-i18n="generic.loading">Carregando...</div></div>
    </div>
  </div>

  <!-- ============ SUB-ABA: GUILDAS (só admin do site) ============ -->
  <div class="tab-content" id="tab-guildas">
    <div class="panel">
      <h2 data-i18n="guildas.title">🏰 Guildas</h2>
      <div class="auth-msg" id="guildasMsg"></div>
      <div id="guildasLista"><div class="pending-hint" data-i18n="generic.loading">Carregando...</div></div>
    </div>
  </div>
```

- [ ] **Step 2: Rotas e hook (`js/app-part2.js`)**

Em `GUILD_SUBTAB_ROUTES`, após a entrada `pendentes`:

```javascript
  'elenco':    { slug: 'elenco',        title: 'Elenco',     title_en: 'Roster',    desc: 'Gestão do elenco da guilda.', desc_en: 'Guild roster management.' },
  'guildas':   { slug: 'guildas',       title: 'Guildas',    title_en: 'Guilds',    desc: 'Aprovação de novas guildas.', desc_en: 'New guild approval.' }
```

Em `runTabInitHook` (linha ~387), acrescentar junto dos outros hooks:

```javascript
  if (tabId === 'elenco' && typeof initElencoTab === 'function') initElencoTab();
  if (tabId === 'guildas' && typeof initGuildasTab === 'function') initGuildasTab();
```

- [ ] **Step 3: Visibilidade por papel (`js/app.js`, dentro de `updateAuthUI`)**

No ramo `if (isLoggedIn())`, junto do bloco do `adminBtn`:

```javascript
    var elencoBtn = document.getElementById('subtabElencoBtn');
    if (elencoBtn) elencoBtn.style.display = (_authState.user && _authState.user.isLeader) ? '' : 'none';
    var guildasBtn = document.getElementById('subtabGuildasBtn');
    if (guildasBtn) guildasBtn.style.display = (_authState.user && _authState.user.siteAdmin) ? '' : 'none';
```

No ramo `else`:

```javascript
    var elencoBtn2 = document.getElementById('subtabElencoBtn');
    if (elencoBtn2) elencoBtn2.style.display = 'none';
    var guildasBtn2 = document.getElementById('subtabGuildasBtn');
    if (guildasBtn2) guildasBtn2.style.display = 'none';
```

- [ ] **Step 4: Lógica do elenco (`js/app.js`, no fim do arquivo)**

```javascript
// ════════════ SUB-ABA ELENCO (gestão de nicks pelo líder) ════════════
function elencoShowMsg(msg, type) {
  const el = document.getElementById('elencoMsg');
  if (el) { el.textContent = msg || ''; el.className = 'auth-msg ' + (type || ''); }
}

async function initElencoTab() {
  const lista = document.getElementById('elencoLista');
  if (!lista) return;
  if (!isLoggedIn() || !_authState.user.isLeader) {
    lista.innerHTML = `<div class="pending-hint">${ui('elenco.leaderOnly')}</div>`;
    return;
  }
  lista.innerHTML = `<div class="pending-hint">${ui('generic.loading')}</div>`;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'rosterList', guild: guildSlug(), authToken: _authState.token })
    });
    const data = await res.json();
    if (!data.ok) { lista.innerHTML = `<div class="pending-hint">${data.error || 'Erro'}</div>`; return; }
    if (!data.nicks.length) { lista.innerHTML = `<div class="pending-hint">${ui('elenco.empty')}</div>`; return; }
    lista.innerHTML = data.nicks.map(n => {
      const safe = String(n.nick).replace(/</g, '&lt;').replace(/"/g, '&quot;');
      const badge = n.vinculado ? ` <span style="opacity:.7;font-size:.85em;">✓ ${ui('elenco.linked')}</span>` : '';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px;border-bottom:1px solid rgba(255,255,255,.08);">` +
        `<span><strong>${safe}</strong>${badge}</span>` +
        `<button class="auth-btn" onclick="elencoRemove('${safe}', ${n.vinculado})">✕ ${ui('elenco.removeBtn')}</button>` +
        `</div>`;
    }).join('');
  } catch (err) {
    lista.innerHTML = `<div class="pending-hint">${ui('auth.connectionError')}</div>`;
  }
}

async function elencoAdd() {
  const inp = document.getElementById('elencoNovoNick');
  const nick = inp ? inp.value.trim() : '';
  if (!nick) { elencoShowMsg(ui('elenco.nickRequired'), 'error'); return; }
  const btn = document.getElementById('elencoAddBtn');
  setButtonLoading(btn, true, '...');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'rosterAdd', guild: guildSlug(), authToken: _authState.token, nick })
    });
    const data = await res.json();
    if (data.ok) { if (inp) inp.value = ''; elencoShowMsg(data.message, 'success'); initElencoTab(); }
    else elencoShowMsg(data.error || 'Erro', 'error');
  } catch (err) { elencoShowMsg(ui('auth.connectionError'), 'error'); }
  finally { setButtonLoading(btn, false); }
}

async function elencoRemove(nick, vinculado) {
  let confirmFlag = false;
  if (vinculado) {
    if (!confirm(ui('elenco.confirmLinked'))) return;
    confirmFlag = true;
  } else if (!confirm(ui('elenco.confirmRemove') + ' ' + nick + '?')) {
    return;
  }
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'rosterRemove', guild: guildSlug(), authToken: _authState.token, nick, confirm: confirmFlag })
    });
    const data = await res.json();
    if (data.ok) { elencoShowMsg(data.message, 'success'); initElencoTab(); }
    else elencoShowMsg(data.error || 'Erro', 'error');
  } catch (err) { elencoShowMsg(ui('auth.connectionError'), 'error'); }
}
```

- [ ] **Step 5: Chaves i18n**

`pt`:

```javascript
    'guild.subElenco': 'Elenco',
    'guild.subGuildas': 'Guildas',
    'elenco.title': '⚔ Elenco da Guilda',
    'elenco.hint': 'Adicione os nicks dos jogadores; cada um cria a própria conta escolhendo o nick no cadastro.',
    'elenco.nickPh': 'Nick do jogador',
    'elenco.addBtn': '+ Adicionar',
    'elenco.removeBtn': 'Remover',
    'elenco.linked': 'com conta',
    'elenco.empty': 'Nenhum nick no elenco ainda.',
    'elenco.leaderOnly': 'Apenas o líder da guilda pode gerenciar o elenco.',
    'elenco.nickRequired': 'Informe o nick',
    'elenco.confirmRemove': 'Remover o nick',
    'elenco.confirmLinked': 'Este nick tem uma conta vinculada. Remover o nick E desativar a conta?',
```

`en`: `'guild.subElenco': 'Roster', 'guild.subGuildas': 'Guilds', 'elenco.title': '⚔ Guild Roster', 'elenco.hint': 'Add your players\' nicks; each one creates their own account picking the nick at sign-up.', 'elenco.nickPh': 'Player nick', 'elenco.addBtn': '+ Add', 'elenco.removeBtn': 'Remove', 'elenco.linked': 'has account', 'elenco.empty': 'No nicks in the roster yet.', 'elenco.leaderOnly': 'Only the guild leader can manage the roster.', 'elenco.nickRequired': 'Enter the nick', 'elenco.confirmRemove': 'Remove nick', 'elenco.confirmLinked': 'This nick has a linked account. Remove the nick AND deactivate the account?',`

`es`: `'guild.subElenco': 'Plantilla', 'guild.subGuildas': 'Gremios', 'elenco.title': '⚔ Plantilla del Gremio', 'elenco.hint': 'Agrega los nicks de tus jugadores; cada uno crea su cuenta eligiendo el nick al registrarse.', 'elenco.nickPh': 'Nick del jugador', 'elenco.addBtn': '+ Agregar', 'elenco.removeBtn': 'Quitar', 'elenco.linked': 'con cuenta', 'elenco.empty': 'Aún no hay nicks en la plantilla.', 'elenco.leaderOnly': 'Solo el líder del gremio puede gestionar la plantilla.', 'elenco.nickRequired': 'Ingresa el nick', 'elenco.confirmRemove': 'Quitar el nick', 'elenco.confirmLinked': 'Este nick tiene una cuenta vinculada. ¿Quitar el nick Y desactivar la cuenta?',`

- [ ] **Step 6: Validar** — `node --check js/app.js && node --check js/app-part2.js && node --check js/data/i18n.js && echo OK` → `OK`

- [ ] **Step 7: Commit**

```bash
git add index.html js/app.js js/app-part2.js js/data/i18n.js
git commit -m "Sub-aba Elenco: líder gerencia os nicks da guilda pelo site"
```

---

### Task 12: Frontend — sub-aba Guildas (admin do site)

**Files:**
- Modify: `js/app.js` (funções novas no fim do arquivo), `js/data/i18n.js`
  (o HTML `#tab-guildas`, o botão e o hook `initGuildasTab` já entraram na Task 11)

**Interfaces:**
- Consumes: `guildListPending`/`guildApprove`/`guildDeny` (Task 4)
- Produces: `initGuildasTab()`, `guildasApprove(slug)`, `guildasDeny(slug)`.

- [ ] **Step 1: Lógica (`js/app.js`, após o bloco do elenco)**

```javascript
// ════════════ SUB-ABA GUILDAS (aprovação pelo admin do site) ════════════
function guildasShowMsg(msg, type) {
  const el = document.getElementById('guildasMsg');
  if (el) { el.textContent = msg || ''; el.className = 'auth-msg ' + (type || ''); }
}

async function initGuildasTab() {
  const lista = document.getElementById('guildasLista');
  if (!lista) return;
  if (!isLoggedIn() || !_authState.user.siteAdmin) {
    lista.innerHTML = `<div class="pending-hint">${ui('guildas.adminOnly')}</div>`;
    return;
  }
  lista.innerHTML = `<div class="pending-hint">${ui('generic.loading')}</div>`;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'guildListPending', authToken: _authState.token })
    });
    const data = await res.json();
    if (!data.ok) { lista.innerHTML = `<div class="pending-hint">${data.error || 'Erro'}</div>`; return; }
    let html = `<h3 style="margin-top:8px;">${ui('guildas.pendingTitle')}</h3>`;
    if (!data.pendentes.length) {
      html += `<div class="pending-hint">${ui('guildas.noPending')}</div>`;
    } else {
      html += data.pendentes.map(p => {
        const slug = String(p.slug).replace(/"/g, '&quot;');
        const nome = String(p.nome).replace(/</g, '&lt;');
        const nick = String(p.nickLider).replace(/</g, '&lt;');
        const email = String(p.email).replace(/</g, '&lt;');
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:10px 4px;border-bottom:1px solid rgba(255,255,255,.08);">` +
          `<span><strong>${nome}</strong><br><small>${ui('guildas.leader')}: ${nick} · ${email} · ${p.criadaEm}</small></span>` +
          `<span style="display:flex;gap:6px;">` +
            `<button class="auth-btn primary" onclick="guildasApprove('${slug}')">✓ ${ui('guildas.approveBtn')}</button>` +
            `<button class="auth-btn" onclick="guildasDeny('${slug}')">✕ ${ui('guildas.denyBtn')}</button>` +
          `</span></div>`;
      }).join('');
    }
    html += `<h3 style="margin-top:20px;">${ui('guildas.activeTitle')} (${data.ativas.length})</h3>` +
      data.ativas.map(a => `<div style="padding:6px 4px;">🏰 ${String(a.nome).replace(/</g, '&lt;')} <small style="opacity:.6">/${String(a.slug).replace(/</g, '&lt;')}</small></div>`).join('');
    lista.innerHTML = html;
  } catch (err) {
    lista.innerHTML = `<div class="pending-hint">${ui('auth.connectionError')}</div>`;
  }
}

async function guildasApprove(slug) {
  if (!confirm(ui('guildas.confirmApprove'))) return;
  guildasShowMsg(ui('guildas.working'), '');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'guildApprove', authToken: _authState.token, slug })
    });
    const data = await res.json();
    guildasShowMsg(data.ok ? data.message : (data.error || 'Erro'), data.ok ? 'success' : 'error');
    if (data.ok) initGuildasTab();
  } catch (err) { guildasShowMsg(ui('auth.connectionError'), 'error'); }
}

async function guildasDeny(slug) {
  if (!confirm(ui('guildas.confirmDeny'))) return;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'guildDeny', authToken: _authState.token, slug })
    });
    const data = await res.json();
    guildasShowMsg(data.ok ? data.message : (data.error || 'Erro'), data.ok ? 'success' : 'error');
    if (data.ok) initGuildasTab();
  } catch (err) { guildasShowMsg(ui('auth.connectionError'), 'error'); }
}
```

- [ ] **Step 2: Chaves i18n**

`pt`:

```javascript
    'guildas.title': '🏰 Guildas',
    'guildas.adminOnly': 'Apenas o administrador do site pode ver esta área.',
    'guildas.pendingTitle': 'Pedidos pendentes',
    'guildas.noPending': 'Nenhum pedido pendente.',
    'guildas.activeTitle': 'Guildas ativas',
    'guildas.leader': 'Líder',
    'guildas.approveBtn': 'Aprovar',
    'guildas.denyBtn': 'Recusar',
    'guildas.confirmApprove': 'Aprovar esta guilda? A planilha dela será criada no seu Drive.',
    'guildas.confirmDeny': 'Recusar este pedido de guilda?',
    'guildas.working': 'Processando... (criar a planilha leva alguns segundos)',
```

`en`: `'guildas.title': '🏰 Guilds', 'guildas.adminOnly': 'Only the site admin can see this area.', 'guildas.pendingTitle': 'Pending requests', 'guildas.noPending': 'No pending requests.', 'guildas.activeTitle': 'Active guilds', 'guildas.leader': 'Leader', 'guildas.approveBtn': 'Approve', 'guildas.denyBtn': 'Deny', 'guildas.confirmApprove': 'Approve this guild? Its spreadsheet will be created in your Drive.', 'guildas.confirmDeny': 'Deny this guild request?', 'guildas.working': 'Working... (creating the spreadsheet takes a few seconds)',`

`es`: `'guildas.title': '🏰 Gremios', 'guildas.adminOnly': 'Solo el administrador del sitio puede ver esta área.', 'guildas.pendingTitle': 'Pedidos pendientes', 'guildas.noPending': 'Sin pedidos pendientes.', 'guildas.activeTitle': 'Gremios activos', 'guildas.leader': 'Líder', 'guildas.approveBtn': 'Aprobar', 'guildas.denyBtn': 'Rechazar', 'guildas.confirmApprove': '¿Aprobar este gremio? Su hoja de cálculo se creará en tu Drive.', 'guildas.confirmDeny': '¿Rechazar este pedido de gremio?', 'guildas.working': 'Procesando... (crear la hoja tarda unos segundos)',`

- [ ] **Step 3: Validar** — `node --check js/app.js && node --check js/data/i18n.js && echo OK` → `OK`

- [ ] **Step 4: Commit**

```bash
git add js/app.js js/data/i18n.js
git commit -m "Sub-aba Guildas: admin do site aprova/recusa pedidos de guilda"
```

---

### Task 13: Verificação final — smoke local, backend real e zip

**Files:**
- Nenhum arquivo novo (verificação + zip)

- [ ] **Step 1: Sintaxe de tudo**

Run: `node --check js/app.js && node --check js/app-part1.js && node --check js/app-part2.js && node --check js/redesign.js && node --check js/data/i18n.js && node -e "new Function(require('fs').readFileSync('backend/apps-script.gs','utf8')); console.log('OK')"`
Expected: `OK` sem erros.

- [ ] **Step 2: Smoke local do frontend**

Run: `python tools/serve.py` e abrir `http://localhost:8000` (ou a porta que o script imprimir). Conferir no navegador:
1. Modal Entrar → Criar conta: select "Sua guilda" aparece com TRIADE e a lista de nicks carrega ao escolher.
2. Link "Cadastrar minha guilda" abre o formulário novo; submit sem preencher mostra erro.
3. Console do navegador sem erros de referência (`guildSlug is not defined` etc.) ao navegar por todas as abas.

(Login/aprovação de verdade só funcionam depois do deploy do backend — passo 3.)

- [ ] **Step 3: Deploy do backend de teste e ciclo real (MANUAL — usuário)**

Seguir `backend/README.md`: colar o código no Apps Script, rodar `ensureMasterSheets` (autorizar), rodar `testeMultiGuilda` (esperado no log: `✅ TESTE COMPLETO PASSOU`), rodar `testeMultiGuildaLimpar`, marcar `site_admin`, publicar nova versão. Depois, no site local: cadastrar uma guilda de teste, aprovar pela sub-aba Guildas, logar como líder, adicionar nick no Elenco, cadastrar um membro nessa guilda, aprovar no Pendentes, logar com o membro e conferir que ranking/eventos são os da guilda nova (vazios) e que a TRIADE continua intacta.

- [ ] **Step 4: Gerar o zip de deploy**

Run (PowerShell): `Set-Location C:\Users\Deivid\PhpstormProjects\SaintSeiyaEX; Remove-Item "$env:USERPROFILE\Desktop\triade-site.zip" -Force -ErrorAction SilentlyContinue; & "$env:SystemRoot\System32\tar.exe" -a -c -f "$env:USERPROFILE\Desktop\triade-site.zip" index.html css js img herois assets circlehead skillicons _redirects netlify.toml robots.txt site.webmanifest sitemap.xml calendario-banners.png`
Expected: `triade-site.zip` na Área de Trabalho (~51 MB).

- [ ] **Step 5: Commit final (se algo mudou nos passos anteriores)**

```bash
git status --short
git add -A
git commit -m "Ajustes finais do multi-guilda Fase 1"
```
