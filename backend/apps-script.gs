/**
 * ========================================================
 *  TRIADE - API com sistema de verificação por código
 * ========================================================
 *  Líderes (com senha) → atualizam direto, sem email
 *  Membros (sem senha) → recebem código por email
 *
 *  CONFIGURAÇÃO INICIAL:
 *  1. Cole este código no Apps Script
 *  2. Salve (Ctrl+S)
 *  3. Execute "teste" → autorize permissões básicas
 *  4. Execute "testeEmail" → autorize envio de email
 *  5. Implantar como aplicativo da Web (Quem tem acesso: Qualquer pessoa)
 * ========================================================
 */

// ═══════════ AVATAR DO BOT NO DISCORD ═══════════
var TRIADE_BOT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/2317/2317988.png';

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

// =========== LEITURA (GET) ===========
function doGet(e) {
  try {
    var ctx = resolveGuild(e && e.parameter && e.parameter.guild);
    if (!ctx) return jsonResponse({ok: false, error: 'Guilda não encontrada'});
    var ss = ctx.ss;
    var action = (e && e.parameter && e.parameter.action) || '';
    if (action === 'historico') return getHistoricoPoder(ss);
    if (action === 'votacao') return getVotacaoAtiva(ss);

    var sheet = ss.getSheetByName('Jogadores');
    var data = sheet.getDataRange().getValues();
    var players = [];
    for (var i = 1; i < data.length; i++) {
      var nick = data[i][0];
      var power = data[i][1];
      if (nick && power) {
        var emailLink = data[i][3] ? String(data[i][3]).trim() : '';
        players.push({
          nick: String(nick),
          power: Number(power),
          updated: data[i][2] ? String(data[i][2]) : '',
          locked: emailLink !== '',
          emailMask: emailLink ? maskEmail(emailLink) : ''
        });
      }
    }

    var events = [];
    var eventSheet = ss.getSheetByName('Eventos');
    if (eventSheet) {
      var evData = eventSheet.getDataRange().getValues();
      for (var k = 1; k < evData.length; k++) {
        var dia = evData[k][0];
        var nome = evData[k][1];
        if (dia && nome) {
          events.push({
            dia: String(dia), nome: String(nome),
            horario: evData[k][2] ? String(evData[k][2]) : '',
            descricao: evData[k][3] ? String(evData[k][3]) : '',
            status: evData[k][4] ? String(evData[k][4]) : 'Ativo',
            recompensa: evData[k][5] ? String(evData[k][5]) : ''
          });
        }
      }
    }

    var gvg = [];
    var gvgSheet = ss.getSheetByName('GVG');
    if (gvgSheet) {
      var gvgData = gvgSheet.getDataRange().getValues();
      for (var g = 1; g < gvgData.length; g++) {
        var papel = gvgData[g][0];
        var gnick = gvgData[g][1];
        if (papel && gnick) {
          gvg.push({
            papel: String(papel), nick: String(gnick),
            observacao: gvgData[g][2] ? String(gvgData[g][2]) : ''
          });
        }
      }
    }

    var configSheet = ss.getSheetByName('Config');
    var configData = configSheet.getDataRange().getValues();
    var config = {};
    for (var j = 1; j < configData.length; j++) {
      var key = configData[j][0];
      if (key && key !== 'senha_admin' && key !== 'senha_master') {
        config[key] = configData[j][1];
      }
    }

    return jsonResponse({
      ok: true, guildName: ctx.nome, players: players, events: events, gvg: gvg, config: config,
      timestamp: new Date().toISOString()
    });
  } catch(err) {
    return jsonResponse({ok: false, error: err.toString()});
  }
}

// =========== POST ===========
function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
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
  } catch(err) {
    return jsonResponse({ok: false, error: err.toString()});
  }
}

// =========== ENVIAR CÓDIGO POR EMAIL ===========
function enviarCodigo(params, ctx) {
  var nick = params.nick;
  var email = params.email ? String(params.email).trim().toLowerCase() : '';

  if (!nick || !email) return jsonResponse({ok: false, error: 'Nick e email obrigatórios'});
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ok: false, error: 'Email inválido'});

  var ss = ctx.ss;
  var sheet = ss.getSheetByName('Jogadores');
  var data = sheet.getDataRange().getValues();
  var encontrou = false;
  var emailVinculado = '';

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === nick.toLowerCase()) {
      encontrou = true;
      emailVinculado = data[i][3] ? String(data[i][3]).trim().toLowerCase() : '';
      break;
    }
  }

  if (!encontrou) return jsonResponse({ok: false, error: 'Nick não encontrado'});

  if (emailVinculado && email !== emailVinculado) {
    return jsonResponse({ok: false, error: 'Este nick está vinculado a outro email.', locked: true});
  }

  var codigo = String(Math.floor(100000 + Math.random() * 900000));
  var agora = new Date();
  var expira = new Date(agora.getTime() + 15 * 60 * 1000);

  var codSheet = ss.getSheetByName('Codigos');
  if (!codSheet) {
    codSheet = ss.insertSheet('Codigos');
    codSheet.appendRow(['Email', 'Nick', 'Codigo', 'Expira', 'Usado', 'Tentativas']);
  }
  codSheet.appendRow([email, nick, codigo, expira.toISOString(), 'NAO', 0]);
  limparCodigosAntigos(codSheet);

  try {
    var assunto = '⚔ TRIADE — Código de verificação: ' + codigo;
    var corpoHtml =
      '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0612;font-family:Georgia,serif;">' +
      '<div style="max-width:560px;margin:0 auto;padding:30px 20px;background:linear-gradient(180deg,#1a0b30 0%,#0a0612 100%);">' +
      '<div style="text-align:center;padding:24px 0;border-bottom:1px solid #d4af37;">' +
      '<div style="font-size:11px;letter-spacing:.4em;color:#d4af37;text-transform:uppercase;margin-bottom:12px;">⚔ Legião · Cavaleiros do Zodíaco ⚔</div>' +
      '<div style="font-family:Georgia,serif;font-size:42px;font-weight:900;letter-spacing:.1em;color:#f5d76e;text-shadow:0 0 20px rgba(245,215,110,.4);">TRIADE</div>' +
      '</div>' +
      '<div style="padding:30px 20px;color:#f3e9d2;line-height:1.6;">' +
      '<p style="font-size:17px;margin:0 0 8px;">Olá, cavaleiro!</p>' +
      '<p style="font-size:15px;color:#b8a988;margin:0 0 24px;">Você está atualizando o poder do nick <b style="color:#f5d76e;">' + nick + '</b></p>' +
      '<div style="background:linear-gradient(135deg,rgba(212,175,55,.15) 0%,rgba(139,10,26,.15) 100%);border:2px solid #d4af37;padding:30px 20px;text-align:center;margin:20px 0;">' +
      '<div style="font-size:11px;letter-spacing:.4em;color:#d4af37;text-transform:uppercase;margin-bottom:14px;">🔑 Seu Código de Verificação</div>' +
      '<div style="font-family:\'Courier New\',monospace;font-size:48px;font-weight:900;letter-spacing:.4em;color:#f5d76e;text-shadow:0 0 16px rgba(245,215,110,.6);padding:8px 0;">' + codigo + '</div>' +
      '</div>' +
      '<p style="font-size:14px;color:#b8a988;margin:20px 0 8px;">📋 Digite este código na página da legião para confirmar a atualização.</p>' +
      '<p style="font-size:13px;color:#d4af37;margin:0 0 4px;">⏰ Validade: <b>15 minutos</b></p>' +
      '<p style="font-size:13px;color:#d4af37;margin:0 0 4px;">🔒 Tentativas: <b>até 5</b></p>' +
      '<div style="margin-top:30px;padding-top:20px;border-top:1px solid rgba(212,175,55,.3);font-size:12px;color:#888;font-style:italic;">' +
      '⚠️ Se você não solicitou este código, pode ignorar este email. Sua conta permanece segura.' +
      '</div></div>' +
      '<div style="text-align:center;padding:20px;border-top:1px solid rgba(212,175,55,.2);font-size:11px;color:#666;letter-spacing:.1em;">' +
      '✦ Que a luz do Cosmo guie a Legião à vitória ✦' +
      '</div></div></body></html>';

    var corpoTexto =
      'Olá, cavaleiro!\n\n' +
      'Você está atualizando o poder do nick: ' + nick + '\n\n' +
      '🔑 SEU CÓDIGO DE VERIFICAÇÃO: ' + codigo + '\n\n' +
      '⏰ Validade: 15 minutos\n' +
      '🔒 Tentativas: até 5\n\n' +
      'Se você não solicitou este código, pode ignorar este email.\n\n' +
      '— Legião TRIADE';

    MailApp.sendEmail({
      to: email, subject: assunto, body: corpoTexto, htmlBody: corpoHtml,
      name: 'Legião TRIADE'
    });

    logEvent('code_sent', {nick: params.nick, email: email, detalhes: 'Código de verificação enviado'}, ss);
    return jsonResponse({ok: true, message: 'Código enviado para ' + maskEmail(email), expiraEm: 15});
  } catch(emailErr) {
    logEvent('code_send_fail', {nick: params.nick, email: email, detalhes: emailErr.toString().substring(0, 200)}, ss);
    return jsonResponse({ok: false, error: 'Erro ao enviar email. Limite diário pode ter sido atingido (100/dia).'});
  }
}

// =========== ATUALIZAR PODER ===========
function atualizarPoder(params, ctx) {
  var nick = params.nick;
  var newPower = Number(params.power);
  var senha = params.senha || '';
  var email = params.email ? String(params.email).trim().toLowerCase() : '';
  var codigo = params.codigo ? String(params.codigo).trim() : '';
  var token = params.token || '';

  var ss = ctx.ss;

  var configSheet = ss.getSheetByName('Config');
  var configData = configSheet.getDataRange().getValues();
  var senhaCorreta = '';
  var senhaMaster = '';
  for (var j = 1; j < configData.length; j++) {
    if (configData[j][0] === 'senha_admin') senhaCorreta = String(configData[j][1]);
    if (configData[j][0] === 'senha_master') senhaMaster = String(configData[j][1]);
  }

  if (!nick || isNaN(newPower) || newPower < 0) {
    return jsonResponse({ok: false, error: 'Dados inválidos'});
  }

  var sheet = ss.getSheetByName('Jogadores');
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  var oldPower = 0;
  var emailVinculado = '';

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(nick).toLowerCase()) {
      rowIndex = i + 1;
      oldPower = Number(data[i][1]);
      emailVinculado = data[i][3] ? String(data[i][3]).trim().toLowerCase() : '';
      break;
    }
  }

  if (rowIndex === -1) return jsonResponse({ok: false, error: 'Jogador não encontrado'});

  var origem = '';
  var emailVinculadoAgora = false;
  var novoToken = '';

  var authToken = params.authToken || '';
  if (authToken) {
    var authSheets = ensureAuthSheets(ss);
    var sessions = authSheets.sessions.getDataRange().getValues();
    var emailLogado = '';

    for (var s = 1; s < sessions.length; s++) {
      if (String(sessions[s][0]) !== authToken) continue;

      var expiraRaw = sessions[s][3];
      var expira;
      if (expiraRaw instanceof Date) {
        expira = expiraRaw;
      } else {
        var expiraStr = String(expiraRaw);
        var match = expiraStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (match) {
          expira = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]),
                            parseInt(match[4]), parseInt(match[5]), parseInt(match[6]));
        } else {
          expira = new Date(expiraStr);
        }
      }

      if (new Date() > expira) {
        return jsonResponse({ok: false, error: 'Sessão expirada. Faça login novamente.', sessionExpired: true});
      }

      emailLogado = String(sessions[s][1]).toLowerCase();
      break;
    }

    if (!emailLogado) {
      return jsonResponse({ok: false, error: 'Token de login inválido', sessionExpired: true});
    }

    var user = authFindUser(authSheets.users, emailLogado);
    if (!user || String(user.data[5] || '').trim().toLowerCase() !== 'aprovado') {
      return jsonResponse({ok: false, error: 'Acesso revogado. Fale com o líder.'});
    }

    // NOTA: se o usuário logado também enviou senha pra ser tratado como líder, ainda processa abaixo.
    // Aqui só ignora senha/codigo se o authToken sozinho já basta (quando ele atualiza o próprio nick OU é líder).

    // Se o jogador tem email vinculado E não bate com o logado, NÃO autoriza por authToken
    // (cai pro fluxo de senha de líder)
    if (emailVinculado && emailVinculado !== emailLogado) {
      // Pode ser que o usuário logado seja líder e esteja tentando atualizar o nick de outro.
      // Aí precisa de senha. Se a senha foi enviada, deixa o fluxo continuar com a senha.
      // Se NÃO foi enviada, retorna erro.
      if (!senha) {
        return jsonResponse({ok: false, error: 'Esse nick está vinculado a outro email. Use a senha de líder pra atualizar outros jogadores.'});
      }
      // Continua pro fluxo de senha — mas guarda info do usuário logado pra log
      // (a variável `usuarioLogadoCtx` é usada nas chamadas de registrarTentativaFalha abaixo)
    } else {
      // Caminho normal: authToken autoriza diretamente (usuário tá editando o próprio nick)
      if (!emailVinculado) {
        sheet.getRange(rowIndex, 4).setValue(emailLogado);
        emailVinculadoAgora = true;
      }

      origem = 'auth-token (' + maskEmail(emailLogado) + ')';

      senha = '';
      codigo = '';
      email = '';
      token = '';
    }
  }

  // Calcula contexto do usuário logado pra usar em logs de brute-force
  var usuarioLogadoCtx = resolverContextoUsuarioLogado(ss, authToken);

  if (senha) {
    var rateLimitErr = checkSenhaRateLimit();
    if (rateLimitErr) {
      logEvent('rate_limit', {nick: nick, detalhes: 'Bloqueio ativo durante tentativa de atualização' + (usuarioLogadoCtx ? ' | usuário logado: ' + usuarioLogadoCtx : '')}, ss);
      return jsonResponse(rateLimitErr);
    }
  }

  var isMaster = (senha === senhaMaster && senhaMaster !== '');
  var isAdmin = (senha === senhaCorreta && senhaCorreta !== '');

  if (senha && !isMaster && !isAdmin) {
    registrarTentativaFalha(senha, usuarioLogadoCtx);
    logEvent('login_fail', {nick: nick, detalhes: 'Senha incorreta' + (usuarioLogadoCtx ? ' | usuário logado: ' + usuarioLogadoCtx : '')}, ss);
  }

  // ═══ Senha admin agora exige usuário logado E que ele seja líder ═══
  // (master continua passando sempre)
  var liderValidado = false;
  if (isAdmin && !isMaster) {
    if (!authToken) {
      registrarTentativaFalha(senha, '(sem login) senha-admin tentada para nick ' + nick);
      logEvent('security', {nick: nick, detalhes: 'Senha admin usada sem login'}, ss);
      return jsonResponse({ok: false, error: 'Faça login como líder para usar a senha de líder.'});
    }
    var authCheck = getEmailFromAuthToken(ss, authToken);
    if (!authCheck.ok) {
      return jsonResponse({ok: false, error: authCheck.error, sessionExpired: authCheck.sessionExpired});
    }
    var authSheets2 = ensureAuthSheets(ss);
    if (!isUserLeader(authSheets2.users, authCheck.email)) {
      registrarTentativaFalha(senha, usuarioLogadoCtx + ' [não-líder usou senha admin]');
      logEvent('security', {
        nick: nick, email: maskEmail(authCheck.email),
        detalhes: 'Usuário não-líder tentou usar senha de líder: ' + (usuarioLogadoCtx || '(sem ctx)')
      }, ss);
      return jsonResponse({ok: false, error: 'Apenas líderes podem usar a senha de líder.'});
    }
    liderValidado = true;
  }

  if (origem) {
    // Já autenticado via authToken
  } else if (isMaster) {
    origem = 'Site (MASTER)' + (usuarioLogadoCtx ? ' [logado: ' + usuarioLogadoCtx + ']' : '');
    limparTentativasFalha();
  } else if (isAdmin && liderValidado) {
    origem = 'Site (líder)' + (usuarioLogadoCtx ? ' [logado: ' + usuarioLogadoCtx + ']' : '');
    limparTentativasFalha();
  } else if (token && email) {
    var tokenValido = validarToken(ss, email, nick, token);
    if (!tokenValido) {
      logEvent('session_expired', {nick: nick, email: email, detalhes: 'Token inválido/expirado'}, ss);
      return jsonResponse({ok: false, error: 'Sessão expirou. Solicite um novo código.', sessionExpired: true});
    }

    if (emailVinculado && email !== emailVinculado) {
      logEvent('update_fail', {nick: nick, email: email, detalhes: 'Tentou usar email diferente do vinculado'}, ss);
      return jsonResponse({ok: false, error: 'Email não corresponde.', locked: true});
    }

    origem = 'Site (sessão)';
  } else if (codigo && email) {
    var validacao = validarCodigo(ss, email, nick, codigo);
    if (!validacao.ok) {
      logEvent('code_invalid', {nick: nick, email: email, detalhes: validacao.error}, ss);
      return jsonResponse({ok: false, error: validacao.error});
    }

    if (emailVinculado && email !== emailVinculado) {
      logEvent('update_fail', {nick: nick, email: email, detalhes: 'Email diferente do vinculado (via código)'}, ss);
      return jsonResponse({ok: false, error: 'Email não corresponde.', locked: true});
    }

    if (!emailVinculado) {
      sheet.getRange(rowIndex, 4).setValue(email);
      emailVinculadoAgora = true;
    }

    novoToken = criarToken(ss, email, nick);
    origem = 'Site (código)';
  } else {
    return jsonResponse({ok: false, error: 'Informe a senha OU solicite um código de verificação', precisaCodigo: true});
  }

  var now = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
  sheet.getRange(rowIndex, 2).setValue(newPower);
  sheet.getRange(rowIndex, 3).setValue(now);

  var histSheet = ss.getSheetByName('Historico');
  var origemFinal = origem + (emailVinculadoAgora ? ' [VINCULOU EMAIL]' : '');
  histSheet.appendRow([now, nick, oldPower, newPower, origemFinal, email || '']);

  logEvent('update_ok', {nick: nick, email: email, detalhes: oldPower + ' → ' + newPower + ' (' + origemFinal + ')'}, ss);

  var posicao = 1;
  var totalPlayers = 0;
  try {
    var allData = sheet.getDataRange().getValues();
    var allPowers = [];
    for (var p = 1; p < allData.length; p++) {
      if (allData[p][0] && allData[p][1]) {
        allPowers.push({nick: String(allData[p][0]), power: Number(allData[p][1])});
      }
    }
    allPowers.sort(function(a,b){return b.power - a.power;});
    totalPlayers = allPowers.length;
    for (var pp = 0; pp < allPowers.length; pp++) {
      if (allPowers[pp].nick.toLowerCase() === nick.toLowerCase()) {
        posicao = pp + 1; break;
      }
    }
  } catch(e) {}

  try {
    avisarDiscordAtualizacao(nick, oldPower, newPower, origem, posicao, totalPlayers, ss);
  } catch(e) {
    Logger.log('Erro ao avisar Discord: ' + e.toString());
  }

  return jsonResponse({
    ok: true, nick: nick, oldPower: oldPower, newPower: newPower, updated: now,
    emailVinculadoAgora: emailVinculadoAgora, master: isMaster, admin: isAdmin, token: novoToken
  });
}

// ═══ HELPER NOVO: resolve "nick (email-mascarado)" do usuário logado ═══
// Retorna string tipo "Saga (s***a@g***.com)" ou '' se não há sessão válida
function resolverContextoUsuarioLogado(ss, authToken) {
  if (!authToken) return '';
  try {
    var sheets = ensureAuthSheets(ss);
    var sessions = sheets.sessions.getDataRange().getValues();
    var emailLogado = '';
    for (var s = 1; s < sessions.length; s++) {
      if (String(sessions[s][0]) !== authToken) continue;
      var expiraRaw = sessions[s][3];
      var expira;
      if (expiraRaw instanceof Date) {
        expira = expiraRaw;
      } else {
        var expiraStr = String(expiraRaw);
        var m = expiraStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (m) {
          expira = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]),
                            parseInt(m[4]), parseInt(m[5]), parseInt(m[6]));
        } else {
          expira = new Date(expiraStr);
        }
      }
      if (new Date() > expira) return '';
      emailLogado = String(sessions[s][1]).toLowerCase();
      break;
    }
    if (!emailLogado) return '';
    var user = authFindUser(sheets.users, emailLogado);
    var nick = user && user.data[3] ? String(user.data[3]) : '(sem nick)';
    return nick + ' (' + maskEmail(emailLogado) + ')';
  } catch(e) {
    return '';
  }
}

// =========== TOKEN DE SESSÃO (6h) ===========
function criarToken(ss, email, nick) {
  var sessSheet = ss.getSheetByName('Sessoes');
  if (!sessSheet) {
    sessSheet = ss.insertSheet('Sessoes');
    sessSheet.appendRow(['Email', 'Nick', 'Token', 'Expira']);
  }
  var token = Utilities.getUuid();
  var agora = new Date();
  var expira = new Date(agora.getTime() + 6 * 60 * 60 * 1000);
  sessSheet.appendRow([email, nick, token, expira.toISOString()]);
  limparSessoesAntigas(sessSheet);
  return token;
}

function validarToken(ss, email, nick, token) {
  var sessSheet = ss.getSheetByName('Sessoes');
  if (!sessSheet) return false;
  var data = sessSheet.getDataRange().getValues();
  var agora = new Date();
  for (var i = data.length - 1; i >= 1; i--) {
    var rowEmail = String(data[i][0]).toLowerCase().trim();
    var rowNick = String(data[i][1]);
    var rowToken = String(data[i][2]);
    var rowExpira = new Date(data[i][3]);
    if (rowEmail === email && rowNick.toLowerCase() === nick.toLowerCase() && rowToken === token) {
      if (agora > rowExpira) return false;
      return true;
    }
  }
  return false;
}

function limparSessoesAntigas(sessSheet) {
  try {
    var data = sessSheet.getDataRange().getValues();
    var agora = new Date();
    var linhasParaRemover = [];
    for (var i = 1; i < data.length; i++) {
      var expira = new Date(data[i][3]);
      if (expira < agora) linhasParaRemover.push(i + 1);
    }
    linhasParaRemover.reverse().forEach(function(rowNum) { sessSheet.deleteRow(rowNum); });
  } catch(e) {}
}

function validarCodigo(ss, email, nick, codigo) {
  var codSheet = ss.getSheetByName('Codigos');
  if (!codSheet) return {ok: false, error: 'Sistema de códigos indisponível'};
  var codData = codSheet.getDataRange().getValues();
  var agora = new Date();
  var MAX_T = 5;
  for (var i = codData.length - 1; i >= 1; i--) {
    var rowEmail = String(codData[i][0]).toLowerCase().trim();
    var rowNick = String(codData[i][1]);
    var rowCodigo = String(codData[i][2]);
    var rowExpira = new Date(codData[i][3]);
    var rowUsado = String(codData[i][4]);
    var rowTentativas = Number(codData[i][5]) || 0;
    if (rowEmail === email && rowNick.toLowerCase() === nick.toLowerCase()) {
      if (rowUsado === 'SIM') continue;
      if (agora > rowExpira) return {ok: false, error: 'Código expirado. Solicite um novo.'};
      if (rowTentativas >= MAX_T) {
        codSheet.getRange(i + 1, 5).setValue('BLOQUEADO');
        return {ok: false, error: 'Muitas tentativas erradas. Solicite um novo código.'};
      }
      codSheet.getRange(i + 1, 6).setValue(rowTentativas + 1);
      if (rowCodigo !== codigo) {
        var restantes = MAX_T - (rowTentativas + 1);
        if (restantes <= 0) {
          codSheet.getRange(i + 1, 5).setValue('BLOQUEADO');
          return {ok: false, error: 'Código incorreto. Limite atingido — solicite um novo código.'};
        }
        return {ok: false, error: 'Código incorreto. Tentativas restantes: ' + restantes};
      }
      codSheet.getRange(i + 1, 5).setValue('SIM');
      return {ok: true};
    }
  }
  return {ok: false, error: 'Código não encontrado. Solicite um novo.'};
}

function limparCodigosAntigos(codSheet) {
  try {
    var data = codSheet.getDataRange().getValues();
    var agora = new Date();
    var umDiaAtras = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    var linhasParaRemover = [];
    for (var i = 1; i < data.length; i++) {
      var expira = new Date(data[i][3]);
      if (expira < umDiaAtras) linhasParaRemover.push(i + 1);
    }
    linhasParaRemover.reverse().forEach(function(rowNum) { codSheet.deleteRow(rowNum); });
  } catch(e) {}
}

// =========== HELPERS ===========
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function maskEmail(email) {
  if (!email) return '';
  var parts = String(email).split('@');
  if (parts.length !== 2) return '***';
  var user = parts[0], domain = parts[1];
  function mask(s) {
    if (s.length <= 2) return s.charAt(0) + '***';
    return s.charAt(0) + '***' + s.charAt(s.length - 1);
  }
  var domainParts = domain.split('.');
  var maskedDomain = mask(domainParts[0]) + '.' + domainParts.slice(1).join('.');
  return mask(user) + '@' + maskedDomain;
}

function teste() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('Abas: ' + ss.getSheets().map(function(s){return s.getName();}).join(', '));
  Logger.log('Funcionou! Pode implantar.');
}

function testeEmail() {
  var meuEmail = Session.getActiveUser().getEmail();
  MailApp.sendEmail(meuEmail, 'Teste TRIADE — Funcionando', 'Se você recebeu este email, o sistema de códigos está pronto!');
  Logger.log('Email de teste enviado para: ' + meuEmail);
}
// ========================================================
//  DISCORD INTEGRATION
// ========================================================

function getDiscordWebhook(ssArg) {
  var ss = ssArg || SpreadsheetApp.getActiveSpreadsheet();
  var cfg = ss.getSheetByName('Config').getDataRange().getValues();
  for (var i = 1; i < cfg.length; i++) {
    if (cfg[i][0] === 'webhook_discord') {
      var url = String(cfg[i][1] || '').trim();
      if (url && url.indexOf('discord.com/api/webhooks/') !== -1) return url;
    }
  }
  return '';
}

function enviarDiscord(payload, ssArg) {
  var url = getDiscordWebhook(ssArg);
  if (!url) return;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch(e) { Logger.log('⚠ Não consegui o lock pra Discord em 10s: ' + e.toString()); return; }
  try {
    var props = PropertiesService.getScriptProperties();
    var lastSend = Number(props.getProperty('lastDiscordSend') || 0);
    var now = Date.now();
    var diff = now - lastSend;
    if (diff < 2000) Utilities.sleep(2000 - diff);

    var response = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code === 429) {
      Logger.log('⚠ Rate limit do Discord, aguardando 5s...');
      Utilities.sleep(5000);
      response = UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify(payload), muteHttpExceptions: true
      });
      code = response.getResponseCode();
    }
    if (code >= 400) Logger.log('Discord HTTP ' + code + ': ' + response.getContentText().substring(0, 200));
    props.setProperty('lastDiscordSend', String(Date.now()));
  } catch(e) {
    Logger.log('Erro Discord: ' + e.toString());
  } finally {
    try { lock.releaseLock(); } catch(_) {}
  }
}

function avisarDiscordAtualizacao(nick, oldPower, newPower, origem, posicao, total, ss) {
  var diff = newPower - oldPower;
  var pct = oldPower > 0 ? ((diff / oldPower) * 100).toFixed(1) : '∞';
  var subiu = diff > 0;
  var color = subiu ? 0xd4af37 : (diff < 0 ? 0x8b0a1a : 0x808080);
  var emoji = subiu ? '⚡' : (diff < 0 ? '📉' : '🔄');
  var sinal = subiu ? '+' : '';

  var origemLabel = '';
  if (origem.indexOf('MASTER') !== -1) origemLabel = '👑 Capitão';
  else if (origem.indexOf('líder') !== -1) origemLabel = '⚔️ Líder';
  else origemLabel = '🛡️ Membro';

  var fields = [
    {name: '📊 Antes', value: '`' + oldPower.toLocaleString('pt-BR') + '`', inline: true},
    {name: '📈 Agora', value: '**`' + newPower.toLocaleString('pt-BR') + '`**', inline: true},
    {name: '🔢 Variação', value: '`' + sinal + diff.toLocaleString('pt-BR') + '` (' + sinal + pct + '%)', inline: true}
  ];
  if (posicao && total) {
    fields.push({name: '🏆 Ranking', value: '**' + posicao + 'º** de ' + total + ' cavaleiros', inline: false});
  }

  enviarDiscord({
    username: 'TRIADE Bot', avatar_url: TRIADE_BOT_AVATAR,
    embeds: [{
      title: emoji + ' ' + nick + ' atualizou seu poder',
      color: color, fields: fields,
      footer: {text: 'Atualização registrada por ' + origemLabel + ' • Legião TRIADE'},
      timestamp: new Date().toISOString()
    }]
  }, ss);
}

function avisarEventosProximos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eventSheet = ss.getSheetByName('Eventos');
  if (!eventSheet) return;
  var data = eventSheet.getDataRange().getValues();
  var TZ = 'America/Sao_Paulo';
  var horaStr = Utilities.formatDate(new Date(), TZ, 'HH:mm');
  var dataHoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var partesHora = horaStr.split(':');
  var horaAtual = parseInt(partesHora[0]) * 60 + parseInt(partesHora[1]);

  var diaSemanaU = parseInt(Utilities.formatDate(new Date(), TZ, 'u'));
  var diaSemanaIdx = diaSemanaU % 7;
  var diaHoje = DIAS_ORDEM[diaSemanaIdx];

  var props = PropertiesService.getScriptProperties();
  var avisadosKey = 'avisados_' + dataHoje;
  var avisadosStr = props.getProperty(avisadosKey) || '';
  var avisados = avisadosStr ? avisadosStr.split('|') : [];

  Logger.log('🔍 Hoje: ' + diaHoje + ' | Hora: ' + horaStr + ' | Já avisados: ' + avisados.length);

  for (var i = 1; i < data.length; i++) {
    var diaEvRaw = String(data[i][0] || '').trim();
    var nome = data[i][1];
    var horario = String(data[i][2] || '').trim();
    if (!nome || !horario || !diaEvRaw) continue;

    var diasEvento = parseDiasEvento(diaEvRaw);
    if (diasEvento.indexOf(diaHoje) === -1) continue;

    var match = horario.match(/(\d{1,2}):?(\d{2})/);
    if (!match) continue;
    var horaEv = parseInt(match[1]) * 60 + parseInt(match[2] || 0);
    var diff = horaEv - horaAtual;
    if (diff < 1 || diff > 30) continue;

    var idEvento = nome + '@' + horario;
    if (avisados.indexOf(idEvento) !== -1) { Logger.log('⏭️ Já avisei: ' + idEvento); continue; }

    var descricao = data[i][3] || '';
    var recompensa = data[i][5] || '';
    var faltamMinTexto = (diff <= 5) ? '**~' + diff + ' minutos**' :
                         (diff <= 15) ? '**~' + diff + ' minutos**' : '**~30 minutos**';

    var fields = [
      {name: '⏰ Horário', value: '`' + horario + '`', inline: true},
      {name: '⏳ Faltam', value: faltamMinTexto, inline: true}
    ];
    if (descricao) fields.push({name: '📜 Descrição', value: descricao, inline: false});
    if (recompensa) fields.push({name: '🎁 Recompensa', value: recompensa, inline: false});

    enviarDiscord({
      username: 'TRIADE Bot', avatar_url: TRIADE_BOT_AVATAR,
      content: '@everyone', allowed_mentions: {parse: ['everyone']},
      embeds: [{
        title: '🔔 EVENTO COMEÇANDO EM ' + diff + ' MINUTOS',
        description: '**' + nome + '**', color: 0xff8a00, fields: fields,
        footer: {text: 'Preparem-se, cavaleiros! • Legião TRIADE'},
        timestamp: new Date().toISOString()
      }]
    });

    avisados.push(idEvento);
    Logger.log('✅ Disparou: ' + idEvento);
  }

  if (avisados.length > 0) props.setProperty(avisadosKey, avisados.join('|'));
  limparAvisadosAntigos(dataHoje);
}

function limparAvisadosAntigos(dataHoje) {
  try {
    var props = PropertiesService.getScriptProperties();
    var todas = props.getProperties();
    for (var key in todas) {
      if (key.indexOf('avisados_') === 0 && key !== 'avisados_' + dataHoje) {
        props.deleteProperty(key);
      }
    }
  } catch(e) {}
}

function resetarAvisadosHoje() {
  var TZ = 'America/Sao_Paulo';
  var dataHoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  PropertiesService.getScriptProperties().deleteProperty('avisados_' + dataHoje);
  Logger.log('✅ Lista de avisados de hoje foi resetada');
}

function resumoSemanalDiscord() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Jogadores');
  var data = sheet.getDataRange().getValues();
  var players = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][1]) players.push({nick: String(data[i][0]), power: Number(data[i][1])});
  }
  players.sort(function(a,b){return b.power - a.power;});

  var totalPower = 0;
  players.forEach(function(p){totalPower += p.power;});
  var media = Math.round(totalPower / players.length);

  var top10 = players.slice(0, 10);
  var medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  var top10Str = top10.map(function(p, idx){
    return medals[idx] + ' **' + p.nick + '** — `' + p.power.toLocaleString('pt-BR') + '`';
  }).join('\n');

  var histSheet = ss.getSheetByName('Historico');
  var histData = histSheet.getDataRange().getValues();
  var seteDiasAtras = new Date();
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

  var atualizacoes = 0;
  for (var h = 1; h < histData.length; h++) {
    var dataStr = String(histData[h][0] || '');
    var match = dataStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      var dataHist = new Date(match[3], parseInt(match[2])-1, parseInt(match[1]));
      if (dataHist >= seteDiasAtras) atualizacoes++;
    }
  }

  enviarDiscord({
    username: 'TRIADE Bot', avatar_url: TRIADE_BOT_AVATAR,
    embeds: [{
      title: '📊 RESUMO SEMANAL — TRIADE',
      description: '⚔️ *Que a luz do Cosmo continue guiando a Legião!* ⚔️',
      color: 0xd4af37,
      fields: [
        {name: '👥 Cavaleiros', value: '**' + players.length + '**', inline: true},
        {name: '⚡ Poder Total', value: '**' + totalPower.toLocaleString('pt-BR') + '**', inline: true},
        {name: '📈 Média', value: '**' + media.toLocaleString('pt-BR') + '**', inline: true},
        {name: '🔄 Atualizações na semana', value: '**' + atualizacoes + '** registros', inline: false},
        {name: '🏆 TOP 10 — Cavaleiros mais poderosos', value: top10Str, inline: false}
      ],
      footer: {text: 'Resumo automático • Legião TRIADE'},
      timestamp: new Date().toISOString()
    }]
  });
}

function testeDiscord() {
  var url = getDiscordWebhook();
  if (!url) { Logger.log('❌ Webhook não configurado!'); return; }
  Logger.log('🔗 URL: ' + url.substring(0, 60) + '...');
  var payload = {
    username: 'TRIADE Bot', avatar_url: TRIADE_BOT_AVATAR,
    embeds: [{
      title: '✅ Bot conectado com sucesso!',
      description: 'Se você está vendo esta mensagem, o webhook está funcionando.',
      color: 0xd4af37,
      footer: {text: 'Sistema operacional • Legião TRIADE'},
      timestamp: new Date().toISOString()
    }]
  };
  try {
    var response = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    Logger.log('📡 HTTP ' + code + ' | resposta: ' + (response.getContentText() || '(vazio)'));
    if (code >= 200 && code < 300) Logger.log('✅ SUCESSO!');
    else if (code === 404) Logger.log('❌ 404: webhook deletado');
    else Logger.log('❌ Erro ' + code);
  } catch(e) { Logger.log('❌ ' + e.toString()); }
}

function testeResumoSemanal() { resumoSemanalDiscord(); Logger.log('✅ Resumo enviado!'); }
function testeEventosProximos() { avisarEventosProximos(); Logger.log('✅ Verificação executada'); }

// ========================================================
//  TRIGGERS
// ========================================================

function instalarAcionadores() {
  Logger.log('🔧 Instalando acionadores...');
  var triggers = ScriptApp.getProjectTriggers();
  var removidos = 0;
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'avisarEventosProximos' || fn === 'resumoSemanalDiscord' || fn === 'atualizarStatusEventos') {
      ScriptApp.deleteTrigger(triggers[i]);
      removidos++;
    }
  }
  if (removidos > 0) Logger.log('🗑️ Removidos: ' + removidos);

  ScriptApp.newTrigger('avisarEventosProximos').timeBased().everyMinutes(5).create();
  Logger.log('✅ avisarEventosProximos (a cada 5 min)');

  ScriptApp.newTrigger('resumoSemanalDiscord').timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY).atHour(9).create();
  Logger.log('✅ resumoSemanalDiscord (sábados às 9h)');

  ScriptApp.newTrigger('atualizarStatusEventos').timeBased().everyDays(1).atHour(0).create();
  Logger.log('✅ atualizarStatusEventos (todo dia à meia-noite)');

  Logger.log('🎉 Tudo pronto!');
}

function removerTodosAcionadores() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) ScriptApp.deleteTrigger(triggers[i]);
  Logger.log('🗑️ Removidos: ' + triggers.length);
}

function debugDiscord() {
  Logger.log('═══ DIAGNÓSTICO DISCORD ═══');
  var url = getDiscordWebhook();
  if (!url) { Logger.log('❌ Webhook NÃO configurado!'); return; }
  Logger.log('✅ ' + url.substring(0, 70) + '...');
  var payload = {
    username: 'TRIADE Bot',
    content: '🧪 TESTE - ' + new Date().toLocaleString('pt-BR'),
    embeds: [{title: '✅ Diagnóstico funcionou!', color: 0x00ff00}]
  };
  try {
    var response = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    Logger.log('📡 ' + code + ' | ' + (response.getContentText() || '(vazia)'));
  } catch(e) { Logger.log('❌ ' + e.toString()); }
}

// ========================================================
//  STATUS EVENTOS
// ========================================================

var DIAS_ORDEM = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];

function atualizarStatusEventos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eventSheet = ss.getSheetByName('Eventos');
  if (!eventSheet) { Logger.log('❌ Aba Eventos não encontrada'); return; }
  var data = eventSheet.getDataRange().getValues();
  if (data.length < 2) { Logger.log('⚠ Sem eventos'); return; }

  var TZ = 'America/Sao_Paulo';
  var diaSemanaU = parseInt(Utilities.formatDate(new Date(), TZ, 'u'));
  var diaSemanaIdx = diaSemanaU % 7;
  var diaHoje = DIAS_ORDEM[diaSemanaIdx];
  Logger.log('📅 Hoje: ' + diaHoje);

  var atualizados = 0, ativos = 0, encerrados = 0;
  for (var i = 1; i < data.length; i++) {
    var diaEvRaw = String(data[i][0] || '').trim();
    var nome = String(data[i][1] || '').trim();
    var statusAtual = String(data[i][4] || '').trim();
    if (!diaEvRaw || !nome) continue;
    var diasEvento = parseDiasEvento(diaEvRaw);
    var ehHoje = diasEvento.indexOf(diaHoje) !== -1;
    var novoStatus = ehHoje ? 'Ativo' : 'Encerrado';
    if (statusAtual.toLowerCase() !== novoStatus.toLowerCase()) {
      eventSheet.getRange(i + 1, 5).setValue(novoStatus);
      atualizados++;
      Logger.log('  ✏ "' + nome + '": ' + (statusAtual || '(vazio)') + ' → ' + novoStatus);
    }
    if (ehHoje) ativos++; else encerrados++;
  }
  Logger.log('✅ Atualizados: ' + atualizados + ' | Ativos: ' + ativos + ' | Encerrados: ' + encerrados);
  try { limparAvisosAntigosEventos(); } catch(e) {}
}

function normalizarDia(dia) {
  return String(dia).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace('-feira', '').replace(/\s+/g, '').trim();
}

function mapearDia(s) {
  var n = normalizarDia(s);
  var mapa = {
    'dom':'domingo','domingo':'domingo','seg':'segunda','segunda':'segunda',
    'ter':'terca','terca':'terca','qua':'quarta','quarta':'quarta',
    'qui':'quinta','quinta':'quinta','sex':'sexta','sexta':'sexta',
    'sab':'sabado','sabado':'sabado'
  };
  return mapa[n] || null;
}

function parseDiasEvento(raw) {
  raw = String(raw).toLowerCase().trim();
  if (!raw) return [];
  var resultado = [];
  var partes = raw.split(',');
  for (var p = 0; p < partes.length; p++) {
    var parte = partes[p].trim();
    if (!parte) continue;
    var partNorm = normalizarDia(parte);
    if (partNorm.indexOf('-') !== -1) {
      var lados = partNorm.split('-');
      if (lados.length === 2) {
        var diasRange = expandirRange(lados[0], lados[1]);
        for (var d = 0; d < diasRange.length; d++) {
          if (resultado.indexOf(diasRange[d]) === -1) resultado.push(diasRange[d]);
        }
        continue;
      }
    }
    var dia = mapearDia(partNorm);
    if (dia && resultado.indexOf(dia) === -1) resultado.push(dia);
  }
  return resultado;
}

function expandirRange(diaInicio, diaFim) {
  var ini = mapearDia(diaInicio); var fim = mapearDia(diaFim);
  if (!ini || !fim) return [];
  var idxIni = DIAS_ORDEM.indexOf(ini), idxFim = DIAS_ORDEM.indexOf(fim);
  if (idxIni < 0 || idxFim < 0) return [];
  var resultado = []; var i = idxIni;
  while (true) {
    resultado.push(DIAS_ORDEM[i]);
    if (i === idxFim) break;
    i = (i + 1) % 7;
    if (resultado.length > 7) break;
  }
  return resultado;
}

function limparAvisosAntigosEventos() {
  var props = PropertiesService.getScriptProperties();
  var todas = props.getProperties();
  var TZ = 'America/Sao_Paulo';
  var dataHoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var removidas = 0;
  for (var key in todas) {
    if (key.indexOf('avisados_') === 0 && key !== 'avisados_' + dataHoje) {
      props.deleteProperty(key); removidas++;
    }
  }
  if (removidas > 0) Logger.log('🧹 Limpas ' + removidas + ' chaves antigas');
}

function testeAtualizarEventos() { atualizarStatusEventos(); }

function testeParserDias() {
  var casos = ['domingo','segunda-feira','quinta-domingo','sexta-segunda',
               'segunda,quarta,sexta','sex-dom','Sábado','qui, sab-seg','TERÇA-FEIRA','dom-sab'];
  for (var i = 0; i < casos.length; i++) {
    Logger.log('"' + casos[i] + '" → [' + parseDiasEvento(casos[i]).join(', ') + ']');
  }
}

// ╔═══════════════════════════════════════════════════════════════╗
// ║  RATE LIMITING (anti brute-force na senha de líder)           ║
// ║  AGORA SALVA TAMBÉM O CONTEXTO DO USUÁRIO LOGADO              ║
// ╚═══════════════════════════════════════════════════════════════╝

var MAX_TENTATIVAS = 5;
var JANELA_TENTATIVAS_MS = 15 * 60 * 1000;
var BLOQUEIO_MS = 15 * 60 * 1000;

function checkSenhaRateLimit() {
  var props = PropertiesService.getScriptProperties();
  var bloqueadoAte = Number(props.getProperty('senha_bloqueada_ate') || 0);
  var agora = Date.now();
  if (bloqueadoAte > agora) {
    var faltaMin = Math.ceil((bloqueadoAte - agora) / 60000);
    return {ok: false, error: 'Muitas tentativas. Tente novamente em ' + faltaMin + ' minuto(s).', rateLimited: true};
  }
  return null;
}

// Registra tentativa falhada. Salva o `contexto` (string "nick (email-mascarado)") junto.
// Quando dispara o bloqueio, mostra a lista de TODOS os contextos que tentaram nessa janela.
function registrarTentativaFalha(senhaTentada, contexto) {
  var props = PropertiesService.getScriptProperties();
  var agora = Date.now();
  contexto = contexto || '(sem auth)';

  // Lista de tentativas: cada item é "timestamp::contexto" (separados por |)
  var tentStr = props.getProperty('senha_tentativas') || '';
  var tentativas = tentStr ? tentStr.split('|') : [];

  // Remove antigas (fora da janela)
  tentativas = tentativas.filter(function(t) {
    var ts = Number((t.split('::')[0]) || 0);
    return (agora - ts) < JANELA_TENTATIVAS_MS;
  });

  // Adiciona nova (escapa | e :: no contexto pra não bagunçar o parser)
  var ctxSafe = String(contexto).replace(/[|]/g, '/').replace(/::/g, ':_:');
  tentativas.push(agora + '::' + ctxSafe);

  Logger.log('🚫 Senha incorreta. Tentativas recentes: ' + tentativas.length + '/' + MAX_TENTATIVAS + ' | usuário: ' + contexto);

  if (tentativas.length >= MAX_TENTATIVAS) {
    var bloquearAte = agora + BLOQUEIO_MS;
    props.setProperty('senha_bloqueada_ate', String(bloquearAte));

    // Extrai contextos únicos pra mostrar
    var contextosUnicos = {};
    tentativas.forEach(function(t) {
      var parts = t.split('::');
      var ctx = parts.slice(1).join('::') || '(sem auth)';
      contextosUnicos[ctx] = (contextosUnicos[ctx] || 0) + 1;
    });
    var resumoCtx = Object.keys(contextosUnicos).map(function(c) {
      return c + ' (' + contextosUnicos[c] + 'x)';
    }).join(' | ');

    props.deleteProperty('senha_tentativas');
    Logger.log('🔒 BLOQUEADO por brute-force até ' + new Date(bloquearAte).toISOString() + ' | tentativas: ' + resumoCtx);

    try {
      logEvent('security', {
        detalhes: 'Bloqueio por brute-force após ' + MAX_TENTATIVAS + ' tentativas. ' +
                  'Senha tentada: ' + (senhaTentada || '').substring(0, 4) + '*** | ' +
                  'Tentativas por usuário: ' + resumoCtx
      });
    } catch(_) {}

    try {
      enviarDiscord({
        username: 'TRIADE Security',
        embeds: [{
          title: '🚨 Tentativa de brute-force detectada',
          description: 'Senha de líder foi bloqueada por 15 minutos após ' + MAX_TENTATIVAS + ' tentativas falhadas.',
          color: 0xc8102e,
          fields: [
            {name: '👤 Tentativas por usuário', value: '```' + resumoCtx + '```', inline: false}
          ],
          footer: {text: 'Sistema TRIADE • Segurança'},
          timestamp: new Date().toISOString()
        }]
      });
    } catch(_) {}
  } else {
    props.setProperty('senha_tentativas', tentativas.join('|'));
  }
}

function limparTentativasFalha() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('senha_tentativas');
  props.deleteProperty('senha_bloqueada_ate');
}

function desbloquearSenha() {
  limparTentativasFalha();
  Logger.log('🔓 Senha desbloqueada manualmente');
}

function statusRateLimit() {
  var props = PropertiesService.getScriptProperties();
  var bloqueadoAte = Number(props.getProperty('senha_bloqueada_ate') || 0);
  var tentStr = props.getProperty('senha_tentativas') || '';
  var agora = Date.now();
  if (bloqueadoAte > agora) {
    var faltaMin = Math.ceil((bloqueadoAte - agora) / 60000);
    Logger.log('🔒 BLOQUEADO. Desbloqueio em ' + faltaMin + ' minutos.');
  } else {
    var tentativas = tentStr ? tentStr.split('|') : [];
    Logger.log('🔓 Desbloqueado. Tentativas registradas: ' + tentativas.length + '/' + MAX_TENTATIVAS);
    tentativas.forEach(function(t) {
      var parts = t.split('::');
      var ctx = parts.slice(1).join('::') || '(sem auth)';
      Logger.log('  • ' + ctx);
    });
  }
}

// ========================================================
//  LOGS
// ========================================================

function logEvent(tipo, dados, ssArg) {
  try {
    var ss = ssArg || SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Logs');
    if (!sheet) {
      sheet = ss.insertSheet('Logs');
      sheet.appendRow(['Timestamp', 'Tipo', 'Nick', 'Email', 'Detalhes', 'IP/UA']);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#1d0f33').setFontColor('#d4af37');
    }
    var TZ = 'America/Sao_Paulo';
    var ts = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
    sheet.appendRow([ts, tipo || '', dados.nick || '', dados.email || '', dados.detalhes || '', dados.ua || '']);
    var totalRows = sheet.getLastRow();
    if (totalRows > 5001) sheet.deleteRows(2, totalRows - 5001);
  } catch(e) {
    Logger.log('Erro log: ' + e.toString());
  }
}

function limparLogs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Logs');
  if (!sheet) { Logger.log('Aba Logs não existe'); return; }
  var totalRows = sheet.getLastRow();
  if (totalRows > 1) {
    sheet.deleteRows(2, totalRows - 1);
    Logger.log('✓ Logs limpos (' + (totalRows - 1) + ' removidas)');
  }
}

function estatisticasLogs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Logs');
  if (!sheet) { Logger.log('Aba Logs não existe'); return; }
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) { Logger.log('Sem logs'); return; }
  var counts = {};
  for (var i = 1; i < data.length; i++) {
    var tipo = data[i][1];
    counts[tipo] = (counts[tipo] || 0) + 1;
  }
  Logger.log('═════════ ESTATÍSTICAS ═════════');
  Logger.log('Total: ' + (data.length - 1));
  for (var t in counts) Logger.log('  • ' + t + ': ' + counts[t]);
}

// ========================================================
//  HISTÓRICO
// ========================================================

function getHistoricoPoder(ss) {
  try {
    var histSheet = ss.getSheetByName('Historico');
    if (!histSheet) return jsonResponse({ok: true, players: {}, range: 30, msg: 'Aba Historico não existe'});
    var data = histSheet.getDataRange().getValues();
    var diasRange = 30;
    var limite = new Date();
    limite.setDate(limite.getDate() - diasRange);
    limite.setHours(0, 0, 0, 0);
    var byPlayer = {};
    var stats = { lidos: 0, semData: 0, semNick: 0, semPower: 0, foraDoRange: 0, parseFalhou: 0, aceitos: 0 };
    for (var i = 1; i < data.length; i++) {
      stats.lidos++;
      var dataRaw = data[i][0];
      var nick = String(data[i][1] || '').trim();
      var newPower = Number(data[i][3] || 0);
      if (!dataRaw) { stats.semData++; continue; }
      if (!nick) { stats.semNick++; continue; }
      if (!newPower || newPower <= 0) { stats.semPower++; continue; }
      var d = parseHistoricoData(dataRaw);
      if (!d) { stats.parseFalhou++; continue; }
      if (d < limite) { stats.foraDoRange++; continue; }
      stats.aceitos++;
      var dd = String(d.getDate()).padStart(2, '0');
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dateLabel = dd + '/' + mm;
      if (!byPlayer[nick]) byPlayer[nick] = [];
      byPlayer[nick].push({date: dateLabel, dateFull: String(dataRaw), power: newPower, ts: d.getTime()});
    }
    var result = {};
    for (var p in byPlayer) {
      var arr = byPlayer[p].sort(function(a, b) { return a.ts - b.ts; });
      var byDay = {};
      for (var k = 0; k < arr.length; k++) byDay[arr[k].date] = arr[k];
      var clean = [];
      for (var day in byDay) clean.push(byDay[day]);
      clean.sort(function(a, b) { return a.ts - b.ts; });
      result[p] = clean;
    }
    return jsonResponse({ok: true, players: result, range: diasRange, stats: stats, generatedAt: new Date().toISOString()});
  } catch(err) {
    return jsonResponse({ok: false, error: err.toString(), stack: err.stack});
  }
}

function diagnosticarHistorico() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var histSheet = ss.getSheetByName('Historico');
  if (!histSheet) { Logger.log('❌ Aba "Historico" não encontrada'); return; }
  var data = histSheet.getDataRange().getValues();
  Logger.log('📊 Total: ' + data.length);
  if (data.length < 2) { Logger.log('⚠ Sem dados'); return; }
  Logger.log('📋 Cabeçalho: ' + JSON.stringify(data[0]));
  for (var i = 1; i < Math.min(4, data.length); i++) {
    Logger.log('━━━ Linha ' + (i + 1) + ' ━━━');
    for (var j = 0; j < data[i].length; j++) {
      var val = data[i][j]; var tipo = typeof val;
      if (val instanceof Date) tipo = 'Date';
      Logger.log('  Col ' + String.fromCharCode(65 + j) + ': [' + tipo + '] ' + JSON.stringify(val));
    }
  }
}

function parseHistoricoData(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  var str = String(raw).trim();
  if (!str) return null;
  var match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\s,]+(\d{1,2}):(\d{1,2}))?/);
  if (match) {
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]),
                    parseInt(match[4] || 0), parseInt(match[5] || 0));
  }
  var iso = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) { var d = new Date(str); return isNaN(d.getTime()) ? null : d; }
  var d2 = new Date(str);
  return isNaN(d2.getTime()) ? null : d2;
}
// ========================================================
//  SISTEMA DE VOTAÇÃO
// ========================================================

function ensureVotacaoSheets(ss) {
  var ativaSheet = ss.getSheetByName('Votacao_Ativa');
  if (!ativaSheet) {
    ativaSheet = ss.insertSheet('Votacao_Ativa');
    ativaSheet.appendRow(['heroId', 'heroName', 'aberta_em', 'admin', 'status', 'fecha_em_ts']);
    ativaSheet.setFrozenRows(1);
  }
  var votosSheet = ss.getSheetByName('Votos');
  if (!votosSheet) {
    votosSheet = ss.insertSheet('Votos');
    votosSheet.appendRow(['timestamp', 'heroId', 'tier', 'voterId', 'sessionId']);
    votosSheet.setFrozenRows(1);
  }
  var historySheet = ss.getSheetByName('Votacao_Historico');
  if (!historySheet) {
    historySheet = ss.insertSheet('Votacao_Historico');
    historySheet.appendRow(['fechada_em', 'heroId', 'heroName', 'total_votos', 'tier_vencedor', 'S', 'A', 'B', 'C', 'D']);
    historySheet.setFrozenRows(1);
  }
  return { ativa: ativaSheet, votos: votosSheet, historico: historySheet, config: ss.getSheetByName('Config') };
}

function verificarSenhaAdmin(ss, senha) {
  if (!senha) return false;
  var configSheet = ss.getSheetByName('Config');
  var data = configSheet.getDataRange().getValues();
  var senhaAdmin = '', senhaMaster = '';
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === 'senha_admin') senhaAdmin = String(data[i][1]);
    if (data[i][0] === 'senha_master') senhaMaster = String(data[i][1]);
  }
  return (senha === senhaAdmin && senhaAdmin) || (senha === senhaMaster && senhaMaster);
}

// ═══════════════════════════════════════════════════════════════
// HELPER: validar senha de admin/master + exigir que o usuário
// logado seja líder (exceto se for o master, que sempre passa).
//
// Retorna { ok, error, isMaster, isAdmin, ctxUsuario }
//   ok=false → use o `error` como resposta
//   ok=true  → libera a ação
//
// Regras:
//  • Sem senha → erro "Senha inválida"
//  • Senha master → libera SEMPRE (mesmo sem authToken)
//  • Senha admin → exige authToken válido E que o usuário seja líder
//  • Tentativas falhadas viram brute-force (registra no contador)
// ═══════════════════════════════════════════════════════════════
function validarSenhaComLider(ss, senha, authToken) {
  var ctxUsuario = resolverContextoUsuarioLogado(ss, authToken);

  // Rate limit em senha
  if (senha) {
    var rateErr = checkSenhaRateLimit();
    if (rateErr) return {ok: false, error: rateErr.error, rateLimited: true, ctxUsuario: ctxUsuario};
  }

  if (!senha) {
    return {ok: false, error: 'Senha inválida', ctxUsuario: ctxUsuario};
  }

  // Lê as senhas da aba Config
  var configSheet = ss.getSheetByName('Config');
  var configData = configSheet.getDataRange().getValues();
  var senhaAdmin = '', senhaMaster = '';
  for (var i = 1; i < configData.length; i++) {
    if (configData[i][0] === 'senha_admin') senhaAdmin = String(configData[i][1]);
    if (configData[i][0] === 'senha_master') senhaMaster = String(configData[i][1]);
  }

  var isMaster = (senha === senhaMaster && senhaMaster !== '');
  var isAdmin = (senha === senhaAdmin && senhaAdmin !== '');

  // Master sempre passa
  if (isMaster) {
    limparTentativasFalha();
    return {ok: true, isMaster: true, isAdmin: false, ctxUsuario: ctxUsuario};
  }

  // Senha errada
  if (!isAdmin) {
    registrarTentativaFalha(senha, ctxUsuario || '(sem auth)');
    return {ok: false, error: 'Senha inválida', ctxUsuario: ctxUsuario};
  }

  // Senha admin correta — exige líder logado
  if (!authToken) {
    registrarTentativaFalha(senha, '(sem login) senha-admin tentada');
    return {ok: false, error: 'Faça login como líder para usar a senha de líder.', ctxUsuario: ctxUsuario};
  }

  var auth = getEmailFromAuthToken(ss, authToken);
  if (!auth.ok) {
    return {ok: false, error: auth.error, sessionExpired: auth.sessionExpired, ctxUsuario: ctxUsuario};
  }

  var sheets = ensureAuthSheets(ss);
  if (!isUserLeader(sheets.users, auth.email)) {
    // Usuário logado mas não é líder — registra como tentativa suspeita
    registrarTentativaFalha(senha, ctxUsuario + ' [não-líder usou senha admin]');
    logEvent('security', {
      email: maskEmail(auth.email),
      detalhes: 'Usuário não-líder tentou usar senha de líder: ' + (ctxUsuario || '(sem ctx)')
    }, ss);
    return {ok: false, error: 'Apenas líderes podem usar a senha de líder.', ctxUsuario: ctxUsuario};
  }

  // Tudo OK — usuário logado é líder e senha bate
  limparTentativasFalha();
  return {ok: true, isMaster: false, isAdmin: true, ctxUsuario: ctxUsuario};
}

function abrirVotacao(params, ctx) {
  var senha = params.senha || '';
  var authToken = params.authToken || '';
  var heroId = Number(params.heroId);
  var heroName = String(params.heroName || '');
  var duracaoMin = Number(params.duracao || 0);

  var ss = ctx.ss;
  var validacao = validarSenhaComLider(ss, senha, authToken);
  if (!validacao.ok) return jsonResponse({ok: false, error: validacao.error, sessionExpired: validacao.sessionExpired, rateLimited: validacao.rateLimited});
  var ctxUsuario = validacao.ctxUsuario;

  if (!heroId || !heroName) return jsonResponse({ok: false, error: 'Cavaleiro inválido'});
  if (isNaN(duracaoMin) || duracaoMin < 0) duracaoMin = 0;
  if (duracaoMin > 120) duracaoMin = 120;

  var sheets = ensureVotacaoSheets(ss);
  if (sheets.ativa.getLastRow() > 1) sheets.ativa.deleteRows(2, sheets.ativa.getLastRow() - 1);
  if (sheets.votos.getLastRow() > 1) sheets.votos.deleteRows(2, sheets.votos.getLastRow() - 1);

  var TZ = 'America/Sao_Paulo';
  var now = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
  var fechaEmTs = duracaoMin > 0 ? (Date.now() + duracaoMin * 60 * 1000) : 0;
  sheets.ativa.appendRow([heroId, heroName, now, 'admin', 'aberta', fechaEmTs]);

  var msg = 'Cavaleiro: ' + heroName + ' (id ' + heroId + ')';
  if (duracaoMin > 0) msg += ' · auto-fecha em ' + duracaoMin + 'min';
  if (ctxUsuario) msg += ' | por: ' + ctxUsuario;
  logEvent('votacao_aberta', {detalhes: msg}, ss);

  return jsonResponse({ok: true, heroId: heroId, heroName: heroName, abertaEm: now, duracao: duracaoMin, fechaEmTs: fechaEmTs});
}

function fecharVotacao(params, ctx) {
  var senha = params.senha || '';
  var authToken = params.authToken || '';
  var ss = ctx.ss;
  var validacao = validarSenhaComLider(ss, senha, authToken);
  if (!validacao.ok) return jsonResponse({ok: false, error: validacao.error, sessionExpired: validacao.sessionExpired, rateLimited: validacao.rateLimited});
  var ctxUsuario = validacao.ctxUsuario;

  var sheets = ensureVotacaoSheets(ss);
  if (sheets.ativa.getLastRow() < 2) return jsonResponse({ok: false, error: 'Nenhuma votação ativa'});

  var ativa = sheets.ativa.getDataRange().getValues();
  var heroId = ativa[1][0];
  var heroName = ativa[1][1];

  var contagem = {S: 0, A: 0, B: 0, C: 0, D: 0};
  var votos = sheets.votos.getDataRange().getValues();
  for (var i = 1; i < votos.length; i++) {
    var t = String(votos[i][2] || '').toUpperCase();
    if (contagem.hasOwnProperty(t)) contagem[t]++;
  }
  var total = contagem.S + contagem.A + contagem.B + contagem.C + contagem.D;
  var vencedora = '—'; var maxV = 0;
  for (var tier in contagem) {
    if (contagem[tier] > maxV) { maxV = contagem[tier]; vencedora = tier; }
  }

  var TZ = 'America/Sao_Paulo';
  var now = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
  sheets.historico.appendRow([now, heroId, heroName, total, vencedora,
    contagem.S, contagem.A, contagem.B, contagem.C, contagem.D]);

  sheets.ativa.deleteRows(2, sheets.ativa.getLastRow() - 1);
  if (sheets.votos.getLastRow() > 1) sheets.votos.deleteRows(2, sheets.votos.getLastRow() - 1);

  var detalhes = heroName + ' → ' + vencedora + ' (' + total + ' votos)';
  if (ctxUsuario) detalhes += ' | por: ' + ctxUsuario;
  logEvent('votacao_fechada', {detalhes: detalhes}, ss);

  return jsonResponse({ok: true, heroId: heroId, heroName: heroName, total: total, vencedora: vencedora, resultados: contagem});
}

function registrarVoto(params, ctx) {
  var heroId = Number(params.heroId);
  var tier = String(params.tier || '').toUpperCase();
  var voterId = String(params.voterId || '').substring(0, 40);
  if (!heroId || !tier || !voterId) return jsonResponse({ok: false, error: 'Dados incompletos'});
  if (['S','A','B','C','D'].indexOf(tier) === -1) return jsonResponse({ok: false, error: 'Tier inválida'});

  var ss = ctx.ss;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); }
  catch(e) { return jsonResponse({ok: false, error: 'Sistema sobrecarregado. Tente novamente.'}); }

  try {
    var sheets = ensureVotacaoSheets(ss);
    if (sheets.ativa.getLastRow() < 2) return jsonResponse({ok: false, error: 'Nenhuma votação ativa'});
    var ativa = sheets.ativa.getDataRange().getValues();
    var activeHeroId = Number(ativa[1][0]);
    if (activeHeroId !== heroId) return jsonResponse({ok: false, error: 'Esta votação não está mais ativa'});

    var TZ = 'America/Sao_Paulo';
    var now = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');

    var votos = sheets.votos.getDataRange().getValues();
    var rowExistente = -1;
    for (var i = 1; i < votos.length; i++) {
      if (Number(votos[i][1]) === heroId && String(votos[i][3]) === voterId) {
        rowExistente = i + 1; break;
      }
    }
    if (rowExistente > 0) {
      sheets.votos.getRange(rowExistente, 1).setValue(now);
      sheets.votos.getRange(rowExistente, 3).setValue(tier);
      return jsonResponse({ok: true, action: 'updated', tier: tier});
    } else {
      sheets.votos.appendRow([now, heroId, tier, voterId, '']);
      return jsonResponse({ok: true, action: 'created', tier: tier});
    }
  } finally {
    try { lock.releaseLock(); } catch(_) {}
  }
}

function getVotacaoAtiva(ss) {
  try {
    var ativaSheet = ss.getSheetByName('Votacao_Ativa');
    var votosSheet = ss.getSheetByName('Votos');
    var configSheet = ss.getSheetByName('Config');
    var youtubeUrl = '';
    if (configSheet) {
      var cfg = configSheet.getDataRange().getValues();
      for (var i = 1; i < cfg.length; i++) {
        if (cfg[i][0] === 'youtube_url') youtubeUrl = String(cfg[i][1] || '');
      }
    }
    if (!ativaSheet || ativaSheet.getLastRow() < 2) return jsonResponse({ok: true, ativa: false, youtubeUrl: youtubeUrl});

    var ativa = ativaSheet.getDataRange().getValues();
    var heroId = Number(ativa[1][0]);
    var heroName = String(ativa[1][1]);
    var abertaEm = String(ativa[1][2]);
    var fechaEmTs = Number(ativa[1][5] || 0);

    if (fechaEmTs > 0 && Date.now() >= fechaEmTs) {
      try {
        var resultado = fecharVotacaoAuto(ss);
        return jsonResponse({ok: true, ativa: false, autoFechado: true, ultimaVotacao: resultado, youtubeUrl: youtubeUrl});
      } catch(e) { Logger.log('Erro auto-fechar: ' + e.toString()); }
    }

    var contagem = {S: 0, A: 0, B: 0, C: 0, D: 0};
    var total = 0;
    if (votosSheet) {
      var votos = votosSheet.getDataRange().getValues();
      for (var j = 1; j < votos.length; j++) {
        if (Number(votos[j][1]) !== heroId) continue;
        var t = String(votos[j][2] || '').toUpperCase();
        if (contagem.hasOwnProperty(t)) { contagem[t]++; total++; }
      }
    }
    return jsonResponse({ok: true, ativa: true, heroId: heroId, heroName: heroName, abertaEm: abertaEm, fechaEmTs: fechaEmTs, total: total, resultados: contagem, youtubeUrl: youtubeUrl});
  } catch(err) {
    return jsonResponse({ok: false, error: err.toString()});
  }
}

function fecharVotacaoAuto(ss) {
  var sheets = ensureVotacaoSheets(ss);
  if (sheets.ativa.getLastRow() < 2) return null;
  var ativa = sheets.ativa.getDataRange().getValues();
  var heroId = ativa[1][0]; var heroName = ativa[1][1];
  var contagem = {S: 0, A: 0, B: 0, C: 0, D: 0};
  var votos = sheets.votos.getDataRange().getValues();
  for (var i = 1; i < votos.length; i++) {
    var t = String(votos[i][2] || '').toUpperCase();
    if (contagem.hasOwnProperty(t)) contagem[t]++;
  }
  var total = contagem.S + contagem.A + contagem.B + contagem.C + contagem.D;
  var vencedora = '—'; var maxV = 0;
  for (var tier in contagem) {
    if (contagem[tier] > maxV) { maxV = contagem[tier]; vencedora = tier; }
  }
  var TZ = 'America/Sao_Paulo';
  var now = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
  sheets.historico.appendRow([now, heroId, heroName, total, vencedora,
    contagem.S, contagem.A, contagem.B, contagem.C, contagem.D]);
  sheets.ativa.deleteRows(2, sheets.ativa.getLastRow() - 1);
  if (sheets.votos.getLastRow() > 1) sheets.votos.deleteRows(2, sheets.votos.getLastRow() - 1);
  logEvent('votacao_auto_fechada', {detalhes: heroName + ' → ' + vencedora + ' (' + total + ' votos, timer expirou)'}, ss);
  return {heroId: heroId, heroName: heroName, total: total, vencedora: vencedora, resultados: contagem};
}

function configurarCanalYoutube(params, ctx) {
  var senha = params.senha || '';
  var authToken = params.authToken || '';
  var youtubeUrl = String(params.youtubeUrl || '').trim();
  var ss = ctx.ss;
  var validacao = validarSenhaComLider(ss, senha, authToken);
  if (!validacao.ok) return jsonResponse({ok: false, error: validacao.error, sessionExpired: validacao.sessionExpired, rateLimited: validacao.rateLimited});

  var configSheet = ss.getSheetByName('Config');
  var data = configSheet.getDataRange().getValues();
  var rowExistente = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === 'youtube_url') { rowExistente = i + 1; break; }
  }
  if (rowExistente > 0) configSheet.getRange(rowExistente, 2).setValue(youtubeUrl);
  else configSheet.appendRow(['youtube_url', youtubeUrl]);

  return jsonResponse({ok: true, youtubeUrl: youtubeUrl});
}

function cancelarVotacao(params, ctx) {
  var senha = params.senha || '';
  var authToken = params.authToken || '';
  var ss = ctx.ss;
  var validacao = validarSenhaComLider(ss, senha, authToken);
  if (!validacao.ok) return jsonResponse({ok: false, error: validacao.error, sessionExpired: validacao.sessionExpired, rateLimited: validacao.rateLimited});
  var ctxUsuario = validacao.ctxUsuario;

  var sheets = ensureVotacaoSheets(ss);
  if (sheets.ativa.getLastRow() < 2) return jsonResponse({ok: false, error: 'Nenhuma votação ativa'});
  var ativa = sheets.ativa.getDataRange().getValues();
  var heroName = ativa[1][1];
  sheets.ativa.deleteRows(2, sheets.ativa.getLastRow() - 1);
  if (sheets.votos.getLastRow() > 1) sheets.votos.deleteRows(2, sheets.votos.getLastRow() - 1);

  var detalhes = heroName + ' (sem salvar no histórico)';
  if (ctxUsuario) detalhes += ' | por: ' + ctxUsuario;
  logEvent('votacao_cancelada', {detalhes: detalhes}, ss);

  return jsonResponse({ok: true, heroName: heroName, canceled: true});
}

// ========================================================
//  AUTENTICAÇÃO POR EMAIL + SENHA
// ========================================================

var AUTH_SESSION_DAYS = 30;
var AUTH_PWD_MIN_LEN = 6;
var AUTH_NAME_MAX = 30;
var AUTH_RATE_REGISTER_MIN = 15;

function ensureAuthSheets(ss) {
  var users = ss.getSheetByName('Usuarios');
  if (!users) {
    users = ss.insertSheet('Usuarios');
    users.appendRow(['email', 'senha_hash', 'salt', 'nick', 'guilda', 'status', 'criado_em', 'aprovado_em', 'aprovado_por', 'ultimo_login', 'lider']);
    users.setFrozenRows(1);
  } else {
    var headerRange = users.getRange(1, 1, 1, Math.max(users.getLastColumn(), 11));
    var headers = headerRange.getValues()[0];
    var hasLider = false;
    for (var h = 0; h < headers.length; h++) {
      if (String(headers[h]).toLowerCase().trim() === 'lider') { hasLider = true; break; }
    }
    if (!hasLider) {
      users.getRange(1, 11).setValue('lider');
      Logger.log('Coluna lider adicionada');
    }
  }
  var sessions = ss.getSheetByName('Sessoes_Auth');
  if (!sessions) {
    sessions = ss.insertSheet('Sessoes_Auth');
    sessions.appendRow(['token', 'email', 'criado_em', 'expira_em', 'ip_ua_hash']);
    sessions.setFrozenRows(1);
  }
  return { users: users, sessions: sessions };
}

function hashSenha(senha, salt) {
  var raw = String(senha) + '::' + String(salt);
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function gerarSalt() {
  var bytes = [];
  for (var i = 0; i < 16; i++) bytes.push(Math.floor(Math.random() * 256));
  return bytes.map(function(b) {
    var v = b.toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function gerarToken() {
  var s = '';
  var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (var i = 0; i < 40; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function authFindUser(usersSheet, email) {
  var data = usersSheet.getDataRange().getValues();
  var emailLower = String(email).trim().toLowerCase();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === emailLower) {
      return { row: i + 1, data: data[i] };
    }
  }
  return null;
}

function getEmailFromAuthToken(ss, authToken) {
  if (!authToken) return {ok: false, error: 'Token ausente'};
  var sheets = ensureAuthSheets(ss);
  var sessions = sheets.sessions.getDataRange().getValues();
  for (var s = 1; s < sessions.length; s++) {
    if (String(sessions[s][0]) !== authToken) continue;
    var expiraRaw = sessions[s][3];
    var expira;
    if (expiraRaw instanceof Date) expira = expiraRaw;
    else {
      var expiraStr = String(expiraRaw);
      var m = expiraStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (m) {
        expira = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]),
                          parseInt(m[4]), parseInt(m[5]), parseInt(m[6]));
      } else expira = new Date(expiraStr);
    }
    if (new Date() > expira) return {ok: false, error: 'Sessão expirada', sessionExpired: true};
    return {ok: true, email: String(sessions[s][1]).toLowerCase()};
  }
  return {ok: false, error: 'Token inválido', sessionExpired: true};
}

function isUserLeader(usersSheet, email) {
  var user = authFindUser(usersSheet, email);
  if (!user) return false;
  var liderVal = user.data[10];
  if (liderVal === true) return true;
  var s = String(liderVal || '').trim().toLowerCase();
  return (s === 'true' || s === 'sim' || s === 'yes' || s === '1' || s === 'x' || s === 'lider' || s === 'líder');
}

function checkActionRateLimit(chave, janelaMs) {
  var props = PropertiesService.getScriptProperties();
  var fullKey = 'rl_' + chave;
  var last = Number(props.getProperty(fullKey) || 0);
  var agora = Date.now();
  if (last && (agora - last) < janelaMs) {
    var restantes = Math.ceil((janelaMs - (agora - last)) / 60000);
    return {ok: false, error: 'Muitas tentativas. Aguarde ' + restantes + ' minuto(s).', retryAfterMin: restantes};
  }
  return null;
}

function markActionRateLimit(chave) {
  PropertiesService.getScriptProperties().setProperty('rl_' + chave, String(Date.now()));
}

function checkGlobalRateLimit(chave, maxChamadas, janelaMs) {
  var props = PropertiesService.getScriptProperties();
  var fullKey = 'rlg_' + chave;
  var raw = props.getProperty(fullKey) || '[]';
  var arr;
  try { arr = JSON.parse(raw); } catch(e) { arr = []; }
  var agora = Date.now();
  arr = arr.filter(function(t) { return (agora - t) < janelaMs; });
  if (arr.length >= maxChamadas) {
    return { ok: false, error: 'Muitas requisições. Tente novamente em alguns segundos.' };
  }
  arr.push(agora);
  props.setProperty(fullKey, JSON.stringify(arr));
  return null;
}

function authRegister(params, ctx) {
  var email = String(params.email || '').trim().toLowerCase();
  var senha = String(params.senha || '');
  var nick = String(params.nick || '').trim();
  if (!email || !senha || !nick) return jsonResponse({ok: false, error: 'Preencha todos os campos'});

  var blockEmail = checkActionRateLimit('register_email:' + email, AUTH_RATE_REGISTER_MIN * 60 * 1000);
  if (blockEmail) {
    logEvent('rate_limit', {email: maskEmail(email), detalhes: 'Cadastro: muitas tentativas'}, ctx.ss);
    return jsonResponse(blockEmail);
  }
  var blockGlobal = checkGlobalRateLimit('register_global', 10, 5 * 60 * 1000);
  if (blockGlobal) {
    logEvent('rate_limit', {detalhes: 'Cadastro: limite global atingido'}, ctx.ss);
    return jsonResponse(blockGlobal);
  }

  var emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) return jsonResponse({ok: false, error: 'Email inválido'});
  if (email.length > 100) return jsonResponse({ok: false, error: 'Email muito longo'});
  var dominiosBloqueados = ['tempmail.com','10minutemail.com','mailinator.com','guerrillamail.com','throwaway.email','yopmail.com'];
  var dominio = email.split('@')[1] || '';
  if (dominiosBloqueados.indexOf(dominio.toLowerCase()) !== -1) {
    return jsonResponse({ok: false, error: 'Use um email permanente'});
  }
  if (senha.length < AUTH_PWD_MIN_LEN) return jsonResponse({ok: false, error: 'A senha precisa ter pelo menos ' + AUTH_PWD_MIN_LEN + ' caracteres'});
  if (nick.length > AUTH_NAME_MAX) return jsonResponse({ok: false, error: 'Nick muito longo (máx ' + AUTH_NAME_MAX + ' caracteres)'});

  var ss = ctx.ss;
  var sheets = ensureAuthSheets(ss);

  var jogadoresSheet = ss.getSheetByName('Jogadores');
  if (!jogadoresSheet) return jsonResponse({ok: false, error: 'Aba de jogadores não encontrada'});
  var jogadoresData = jogadoresSheet.getDataRange().getValues();
  var nickValido = false; var nickCanonico = nick;
  for (var j = 1; j < jogadoresData.length; j++) {
    var nickPlanilha = String(jogadoresData[j][0] || '').trim();
    if (nickPlanilha.toLowerCase() === nick.toLowerCase()) {
      nickValido = true; nickCanonico = nickPlanilha; break;
    }
  }
  if (!nickValido) return jsonResponse({ok: false, error: 'Nick não encontrado na guilda. Confirme o nick correto.'});
  nick = nickCanonico;

  var usersData = sheets.users.getDataRange().getValues();
  for (var u = 1; u < usersData.length; u++) {
    var nickExistente = String(usersData[u][3] || '').trim().toLowerCase();
    var statusExistente = String(usersData[u][5] || '').trim().toLowerCase();
    if (nickExistente === nick.toLowerCase() && (statusExistente === 'pendente' || statusExistente === 'aprovado')) {
      return jsonResponse({ok: false, error: 'Este nick já tem uma conta cadastrada. Use "Esqueci minha senha" se for sua.'});
    }
  }

  var existing = authFindUser(sheets.users, email);
  if (existing) {
    var status = String(existing.data[5] || '');
    if (status === 'pendente') return jsonResponse({ok: false, error: 'Este email já tem um cadastro pendente.'});
    if (status === 'aprovado') return jsonResponse({ok: false, error: 'Este email já está cadastrado. Use "Esqueci minha senha".'});
    if (status === 'negado') return jsonResponse({ok: false, error: 'Este email teve o cadastro negado. Fale com o líder.'});
  }

  var salt = gerarSalt();
  var senhaHash = hashSenha(senha, salt);
  var TZ = 'America/Sao_Paulo';
  var now = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
  sheets.users.appendRow([email, senhaHash, salt, nick, '', 'pendente', now, '', '', '']);
  markActionRateLimit('register_email:' + email);
  logEvent('auth_register', {email: maskEmail(email), detalhes: 'Nick: ' + nick}, ss);

  try { notificarDiscordNovoCadastro(email, nick, now, ss); }
  catch(e) { Logger.log('Falha Discord: ' + e.toString()); }

  return jsonResponse({ok: true, message: 'Cadastro feito! Aguarde aprovação do líder. Você receberá acesso assim que for liberado.'});
}

function authGetNicksDisponiveis(params, ctx) {
  var block = checkGlobalRateLimit('getnicks_global', 30, 60 * 1000);
  if (block) {
    logEvent('rate_limit', {detalhes: 'getNicks: scraping detectado'}, ctx.ss);
    return jsonResponse({ok: false, error: 'Muitas requisições. Tente novamente em instantes.'});
  }
  var ss = ctx.ss;
  var jogadoresSheet = ss.getSheetByName('Jogadores');
  if (!jogadoresSheet) return jsonResponse({ok: true, nicks: []});
  var sheets = ensureAuthSheets(ss);
  var jogadoresData = jogadoresSheet.getDataRange().getValues();
  var usersData = sheets.users.getDataRange().getValues();

  var nicksOcupados = {};
  for (var u = 1; u < usersData.length; u++) {
    var status = String(usersData[u][5] || '').trim().toLowerCase();
    if (status === 'pendente' || status === 'aprovado') {
      var nick = String(usersData[u][3] || '').trim().toLowerCase();
      if (nick) nicksOcupados[nick] = true;
    }
  }
  var disponiveis = [];
  for (var j = 1; j < jogadoresData.length; j++) {
    var nickPlanilha = String(jogadoresData[j][0] || '').trim();
    if (!nickPlanilha) continue;
    if (!nicksOcupados[nickPlanilha.toLowerCase()]) disponiveis.push(nickPlanilha);
  }
  disponiveis.sort(function(a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
  return jsonResponse({ok: true, nicks: disponiveis});
}

function notificarDiscordNovoCadastro(email, nick, criadoEm, ss) {
  enviarDiscord({
    username: 'TRIADE — Auth', avatar_url: TRIADE_BOT_AVATAR,
    embeds: [{
      title: '🆕 Nova solicitação de acesso', color: 0xd4af37,
      fields: [
        { name: '👤 Nick', value: nick, inline: true },
        { name: '📧 Email', value: maskEmail(email), inline: true },
        { name: '🕐 Criado em', value: criadoEm, inline: false }
      ],
      footer: { text: 'Aprove pela planilha ou painel admin' }
    }]
  }, ss);
}

function authLogin(params) {
  var email = String(params.email || '').trim().toLowerCase();
  var senha = String(params.senha || '');
  if (!email || !senha) return jsonResponse({ok: false, error: 'Informe email e senha'});

  var rateErr = checkSenhaRateLimit();
  if (rateErr) return jsonResponse(rateErr);

  var slugIdx = indexFindGuildByEmail(email) || 'triade';
  var ctx = resolveGuild(slugIdx) || resolveGuild('triade');
  if (!ctx) return jsonResponse({ok: false, error: 'Guilda não encontrada'});
  var ss = ctx.ss;
  var sheets = ensureAuthSheets(ss);
  var user = authFindUser(sheets.users, email);

  if (!user) {
    // No login normal NÃO há usuário logado, o contexto é o próprio email tentado
    registrarTentativaFalha(senha, 'login: ' + maskEmail(email));
    return jsonResponse({ok: false, error: 'Email ou senha inválidos'});
  }
  var status = String(user.data[5] || '').trim().toLowerCase();
  if (status === 'pendente') return jsonResponse({ok: false, error: 'Seu cadastro ainda está aguardando aprovação do líder.'});
  if (status === 'negado') return jsonResponse({ok: false, error: 'Seu cadastro foi negado. Fale com o líder.'});
  if (status !== 'aprovado') return jsonResponse({ok: false, error: 'Cadastro inválido. Fale com o líder.'});

  var salt = String(user.data[2]);
  var hashCorreto = String(user.data[1]);
  var hashTentativa = hashSenha(senha, salt);
  if (hashTentativa !== hashCorreto) {
    // Já sei o nick do dono do email (apesar de não ser "logado", é alguém tentando logar como ele)
    var nickAlvo = user.data[3] ? String(user.data[3]) : '(sem nick)';
    registrarTentativaFalha(senha, 'login: ' + nickAlvo + ' (' + maskEmail(email) + ')');
    logEvent('auth_login_fail', {email: maskEmail(email)}, ss);
    return jsonResponse({ok: false, error: 'Email ou senha inválidos'});
  }
  limparTentativasFalha();

  var token = gerarToken();
  var TZ = 'America/Sao_Paulo';
  var now = new Date();
  var nowStr = Utilities.formatDate(now, TZ, 'dd/MM/yyyy HH:mm:ss');
  var expira = new Date(now.getTime() + AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000);
  var expiraStr = Utilities.formatDate(expira, TZ, 'dd/MM/yyyy HH:mm:ss');
  sheets.sessions.appendRow([token, email, nowStr, expiraStr, '']);
  sheets.users.getRange(user.row, 10).setValue(nowStr);
  logEvent('auth_login_ok', {email: maskEmail(email)}, ss);

  var isLeader = false;
  var liderVal = user.data[10];
  if (liderVal === true) isLeader = true;
  else {
    var s = String(liderVal || '').trim().toLowerCase();
    isLeader = (s === 'true' || s === 'sim' || s === 'yes' || s === '1' || s === 'x' || s === 'lider' || s === 'líder');
  }

  return jsonResponse({
    ok: true, token: token,
    user: {email: email, nick: user.data[3], guilda: user.data[4], isLeader: isLeader, siteAdmin: isSiteAdmin(SpreadsheetApp.getActiveSpreadsheet(), email)},
    guild: ctx.slug, guildName: ctx.nome,
    expiraEm: expiraStr
  });
}

function authValidateToken(params, ctx) {
  var token = String(params.token || '').trim();
  if (!token) return jsonResponse({ok: false, error: 'Token vazio'});
  var ss = ctx.ss;
  var sheets = ensureAuthSheets(ss);
  var sessions = sheets.sessions.getDataRange().getValues();

  for (var i = 1; i < sessions.length; i++) {
    if (String(sessions[i][0]) !== token) continue;
    var email = String(sessions[i][1]);
    var expiraRaw = sessions[i][3];
    var expira;
    if (expiraRaw instanceof Date) expira = expiraRaw;
    else {
      var expiraStr = String(expiraRaw);
      var m = expiraStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (m) {
        expira = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]),
                          parseInt(m[4]), parseInt(m[5]), parseInt(m[6]));
      } else { expira = new Date(expiraStr); if (isNaN(expira.getTime())) continue; }
    }
    if (new Date() > expira) return jsonResponse({ok: false, error: 'Sessão expirada. Faça login novamente.'});

    var user = authFindUser(sheets.users, email);
    if (!user) return jsonResponse({ok: false, error: 'Usuário não encontrado.'});
    var status = String(user.data[5] || '').trim().toLowerCase();
    if (status !== 'aprovado') return jsonResponse({ok: false, error: 'Acesso revogado. Fale com o líder.'});

    var isLeader = false;
    var liderVal = user.data[10];
    if (liderVal === true) isLeader = true;
    else {
      var sLider = String(liderVal || '').trim().toLowerCase();
      isLeader = (sLider === 'true' || sLider === 'sim' || sLider === 'yes' || sLider === '1' || sLider === 'x' || sLider === 'lider' || sLider === 'líder');
    }
    return jsonResponse({ok: true, user: {email: email, nick: user.data[3], guilda: user.data[4], isLeader: isLeader, siteAdmin: isSiteAdmin(SpreadsheetApp.getActiveSpreadsheet(), email)}, guild: ctx.slug, guildName: ctx.nome});
  }
  return jsonResponse({ok: false, error: 'Token inválido'});
}

function authLogout(params, ctx) {
  var token = String(params.token || '').trim();
  if (!token) return jsonResponse({ok: true});
  var ss = ctx.ss;
  var sheets = ensureAuthSheets(ss);
  var data = sheets.sessions.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === token) { sheets.sessions.deleteRow(i + 1); break; }
  }
  return jsonResponse({ok: true});
}

function authForgotPassword(params) {
  var email = String(params.email || '').trim().toLowerCase();
  if (!email) return jsonResponse({ok: false, error: 'Informe o email'});

  var blockEmail = checkActionRateLimit('forgot_email:' + email, 15 * 60 * 1000);
  if (blockEmail) {
    logEvent('rate_limit', {email: maskEmail(email), detalhes: 'Forgot password: spam'});
    return jsonResponse({ok: true, message: 'Se este email existe, um código foi enviado.'});
  }
  var blockGlobal = checkGlobalRateLimit('forgot_global', 20, 10 * 60 * 1000);
  if (blockGlobal) {
    logEvent('rate_limit', {detalhes: 'Forgot password: limite global atingido'});
    return jsonResponse({ok: true, message: 'Se este email existe, um código foi enviado.'});
  }

  var ctxFp = resolveGuild(indexFindGuildByEmail(email) || 'triade');
  if (!ctxFp) return jsonResponse({ok: true, message: 'Se este email existe, um código foi enviado.'});
  var ss = ctxFp.ss;
  var sheets = ensureAuthSheets(ss);
  var user = authFindUser(sheets.users, email);
  if (!user || String(user.data[5]) !== 'aprovado') {
    return jsonResponse({ok: true, message: 'Se este email existe, um código foi enviado.'});
  }

  var codigo = String(Math.floor(100000 + Math.random() * 900000));
  var props = PropertiesService.getScriptProperties();
  props.setProperty('reset_' + email, codigo + '::' + Date.now());

  try {
    MailApp.sendEmail({
      to: email, subject: '🔐 TRIADE — Código de recuperação de senha',
      htmlBody: '<div style="font-family:Georgia,serif;color:#333;max-width:500px;margin:0 auto;padding:20px;">' +
        '<h2 style="color:#d4af37;">⚔ Recuperação de Senha — TRIADE</h2>' +
        '<p>Você (ou alguém) pediu recuperação de senha.</p>' +
        '<p>Seu código:</p>' +
        '<div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#f5f5f5;padding:20px;color:#d4af37;">' + codigo + '</div>' +
        '<p style="font-size:12px;color:#999;margin-top:20px;">Código válido por 5 minutos.</p>' +
        '</div>'
    });
  } catch(e) {
    return jsonResponse({ok: false, error: 'Falha ao enviar email: ' + e.toString()});
  }
  logEvent('auth_forgot_sent', {email: maskEmail(email)}, ss);
  markActionRateLimit('forgot_email:' + email);
  return jsonResponse({ok: true, message: 'Código enviado por email. Verifique sua caixa de entrada.'});
}

function authResetPassword(params) {
  var email = String(params.email || '').trim().toLowerCase();
  var codigo = String(params.codigo || '').trim();
  var novaSenha = String(params.novaSenha || '');
  if (!email || !codigo || !novaSenha) return jsonResponse({ok: false, error: 'Preencha todos os campos'});
  if (novaSenha.length < AUTH_PWD_MIN_LEN) return jsonResponse({ok: false, error: 'Senha precisa ter pelo menos ' + AUTH_PWD_MIN_LEN + ' caracteres'});

  var props = PropertiesService.getScriptProperties();
  var stored = props.getProperty('reset_' + email);
  if (!stored) return jsonResponse({ok: false, error: 'Código não encontrado ou expirado'});
  var parts = stored.split('::');
  var codigoCorreto = parts[0]; var ts = Number(parts[1]);
  if (Date.now() - ts > 5 * 60 * 1000) {
    props.deleteProperty('reset_' + email);
    return jsonResponse({ok: false, error: 'Código expirado. Solicite um novo.'});
  }
  if (codigo !== codigoCorreto) return jsonResponse({ok: false, error: 'Código incorreto'});

  var ctxRp = resolveGuild(indexFindGuildByEmail(email) || 'triade');
  if (!ctxRp) return jsonResponse({ok: false, error: 'Código não encontrado ou expirado'});
  var ss = ctxRp.ss;
  var sheets = ensureAuthSheets(ss);
  var user = authFindUser(sheets.users, email);
  if (!user) return jsonResponse({ok: false, error: 'Usuário não encontrado'});

  var salt = gerarSalt();
  var hash = hashSenha(novaSenha, salt);
  sheets.users.getRange(user.row, 2).setValue(hash);
  sheets.users.getRange(user.row, 3).setValue(salt);
  props.deleteProperty('reset_' + email);

  var sessionsData = sheets.sessions.getDataRange().getValues();
  for (var i = sessionsData.length - 1; i >= 1; i--) {
    if (String(sessionsData[i][1]).toLowerCase() === email) sheets.sessions.deleteRow(i + 1);
  }
  logEvent('auth_password_reset', {email: maskEmail(email)}, ss);
  return jsonResponse({ok: true, message: 'Senha redefinida! Faça login com a nova senha.'});
}

function authListPending(params, ctx) {
  var senha = String(params.senha || '');
  var authToken = String(params.authToken || '');
  var ss = ctx.ss;
  var sheets = ensureAuthSheets(ss);
  var ctxUsuario = resolverContextoUsuarioLogado(ss, authToken);

  if (authToken) {
    var auth = getEmailFromAuthToken(ss, authToken);
    if (!auth.ok) return jsonResponse({ok: false, error: auth.error, sessionExpired: auth.sessionExpired});
    if (!isUserLeader(sheets.users, auth.email)) return jsonResponse({ok: false, error: 'Apenas líderes podem ver pendentes.'});
  } else {
    if (senha) {
      var rateErr = checkSenhaRateLimit();
      if (rateErr) return jsonResponse(rateErr);
    }
    if (!verificarSenhaAdmin(ss, senha)) {
      if (senha) registrarTentativaFalha(senha, ctxUsuario);
      return jsonResponse({ok: false, error: 'Senha inválida ou usuário não é líder'});
    }
    limparTentativasFalha();
  }

  var data = sheets.users.getDataRange().getValues();
  var pendentes = [];
  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][5] || '').trim().toLowerCase();
    if (status === 'pendente') {
      pendentes.push({email: String(data[i][0] || ''), nick: String(data[i][3] || ''), criadoEm: formatarData(data[i][6])});
    }
  }
  return jsonResponse({ok: true, pendentes: pendentes});
}

function formatarData(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
  return String(val);
}

function authApproveUser(params, ctx) {
  var senha = String(params.senha || '');
  var authToken = String(params.authToken || '');
  var email = String(params.email || '').trim().toLowerCase();
  var guilda = String(params.guilda || 'Triade');
  var ss = ctx.ss;
  var sheets = ensureAuthSheets(ss);
  var aprovadoPor = 'admin';
  var ctxUsuario = resolverContextoUsuarioLogado(ss, authToken);

  if (authToken) {
    var auth = getEmailFromAuthToken(ss, authToken);
    if (!auth.ok) return jsonResponse({ok: false, error: auth.error, sessionExpired: auth.sessionExpired});
    if (!isUserLeader(sheets.users, auth.email)) return jsonResponse({ok: false, error: 'Apenas líderes podem aprovar.'});
    aprovadoPor = auth.email;
  } else {
    if (senha) {
      var rateErr = checkSenhaRateLimit();
      if (rateErr) return jsonResponse(rateErr);
    }
    if (!verificarSenhaAdmin(ss, senha)) {
      if (senha) registrarTentativaFalha(senha, ctxUsuario);
      return jsonResponse({ok: false, error: 'Senha inválida'});
    }
    limparTentativasFalha();
  }

  var user = authFindUser(sheets.users, email);
  if (!user) return jsonResponse({ok: false, error: 'Usuário não encontrado'});
  var TZ = 'America/Sao_Paulo';
  var now = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
  sheets.users.getRange(user.row, 5).setValue(guilda);
  sheets.users.getRange(user.row, 6).setValue('aprovado');
  sheets.users.getRange(user.row, 8).setValue(now);
  sheets.users.getRange(user.row, 9).setValue(aprovadoPor);
  logEvent('auth_approved', {email: maskEmail(email), detalhes: 'Guilda: ' + guilda + ' | por: ' + aprovadoPor}, ss);

  try {
    MailApp.sendEmail({
      to: email, subject: '✅ TRIADE — Seu acesso foi aprovado!',
      htmlBody: '<div style="font-family:Georgia,serif;color:#333;max-width:500px;margin:0 auto;padding:20px;">' +
        '<h2 style="color:#d4af37;">⚔ Bem-vindo à Tríade!</h2>' +
        '<p>Seu cadastro foi aprovado pelo líder da guilda.</p>' +
        '<p>Faça login com seu email e senha no site da Legião.</p>' +
        '<p style="margin-top:20px;font-style:italic;color:#666;">Que o Cosmo te guie, cavaleiro!</p>' +
        '</div>'
    });
  } catch(e) { Logger.log('Falha email aprovação: ' + e.toString()); }
  return jsonResponse({ok: true, message: 'Usuário aprovado com sucesso'});
}

function authDenyUser(params, ctx) {
  var senha = String(params.senha || '');
  var authToken = String(params.authToken || '');
  var email = String(params.email || '').trim().toLowerCase();
  var ss = ctx.ss;
  var sheets = ensureAuthSheets(ss);
  var negadoPor = 'admin';
  var ctxUsuario = resolverContextoUsuarioLogado(ss, authToken);

  if (authToken) {
    var auth = getEmailFromAuthToken(ss, authToken);
    if (!auth.ok) return jsonResponse({ok: false, error: auth.error, sessionExpired: auth.sessionExpired});
    if (!isUserLeader(sheets.users, auth.email)) return jsonResponse({ok: false, error: 'Apenas líderes podem negar.'});
    negadoPor = auth.email;
  } else {
    if (senha) {
      var rateErr = checkSenhaRateLimit();
      if (rateErr) return jsonResponse(rateErr);
    }
    if (!verificarSenhaAdmin(ss, senha)) {
      if (senha) registrarTentativaFalha(senha, ctxUsuario);
      return jsonResponse({ok: false, error: 'Senha inválida'});
    }
    limparTentativasFalha();
  }

  var user = authFindUser(sheets.users, email);
  if (!user) return jsonResponse({ok: false, error: 'Usuário não encontrado'});
  var TZ = 'America/Sao_Paulo';
  var now = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
  sheets.users.getRange(user.row, 6).setValue('negado');
  sheets.users.getRange(user.row, 8).setValue(now);
  sheets.users.getRange(user.row, 9).setValue(negadoPor);
  logEvent('auth_denied', {email: maskEmail(email), detalhes: 'por: ' + negadoPor}, ss);
  return jsonResponse({ok: true, message: 'Cadastro negado'});
}

// ========================================================
//  CONTATO
// ========================================================

var CONTATO_EMAIL_DEFAULT = 'deividrdgs@gmail.com';

function contactSend(params) {
  var nome = String(params.nome || '').trim();
  var email = String(params.email || '').trim().toLowerCase();
  var guilda = String(params.guilda || '').trim();
  var mensagem = String(params.mensagem || '').trim();

  if (!nome || !email || !mensagem) return jsonResponse({ok: false, error: 'Preencha nome, email e mensagem'});
  if (nome.length > 80) return jsonResponse({ok: false, error: 'Nome muito longo (máx 80)'});
  if (guilda.length > 80) return jsonResponse({ok: false, error: 'Nome da guilda muito longo (máx 80)'});
  if (mensagem.length > 2000) return jsonResponse({ok: false, error: 'Mensagem muito longa (máx 2000)'});
  if (mensagem.length < 10) return jsonResponse({ok: false, error: 'Mensagem muito curta'});

  var emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) return jsonResponse({ok: false, error: 'Email inválido'});
  if (email.length > 100) return jsonResponse({ok: false, error: 'Email muito longo'});
  var dominiosBloqueados = ['tempmail.com','10minutemail.com','mailinator.com','guerrillamail.com','throwaway.email','yopmail.com'];
  var dominio = email.split('@')[1] || '';
  if (dominiosBloqueados.indexOf(dominio.toLowerCase()) !== -1) return jsonResponse({ok: false, error: 'Use um email permanente, por favor'});

  var props = PropertiesService.getScriptProperties();
  var lastKey = 'contato_last_' + email;
  var lastSent = Number(props.getProperty(lastKey) || 0);
  var agora = Date.now();
  var dezQuinzeMin = 15 * 60 * 1000;
  if (lastSent && (agora - lastSent) < dezQuinzeMin) {
    var minutosRestantes = Math.ceil((dezQuinzeMin - (agora - lastSent)) / 60000);
    return jsonResponse({ok: false, error: 'Aguarde ' + minutosRestantes + ' minutos antes de enviar outra mensagem.'});
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var destino = CONTATO_EMAIL_DEFAULT;
  try {
    var configSheet = ss.getSheetByName('Config');
    if (configSheet) {
      var configData = configSheet.getDataRange().getValues();
      for (var i = 1; i < configData.length; i++) {
        if (String(configData[i][0]).trim().toLowerCase() === 'contato_email') {
          var val = String(configData[i][1] || '').trim();
          if (val) destino = val;
          break;
        }
      }
    }
  } catch(e) {}

  var TZ = 'America/Sao_Paulo';
  var dataEnvio = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
  var subjectLine = '📬 [TRIADE] Contato de ' + nome + (guilda ? ' (' + guilda + ')' : '');
  var htmlBody =
    '<div style="font-family:Georgia,serif;color:#333;max-width:600px;margin:0 auto;padding:24px;background:#f8f8f8;">' +
      '<h2 style="color:#d4af37;border-bottom:2px solid #d4af37;padding-bottom:10px;margin-top:0;">⚔ Nova mensagem pelo site da Tríade</h2>' +
      '<table style="width:100%;border-collapse:collapse;margin:20px 0;">' +
        '<tr><td style="padding:8px;border-bottom:1px solid #ddd;width:140px;"><b>👤 Nome:</b></td><td style="padding:8px;border-bottom:1px solid #ddd;">' + escapeHtml(nome) + '</td></tr>' +
        '<tr><td style="padding:8px;border-bottom:1px solid #ddd;"><b>📧 Email:</b></td><td style="padding:8px;border-bottom:1px solid #ddd;"><a href="mailto:' + email + '">' + escapeHtml(email) + '</a></td></tr>' +
        (guilda ? '<tr><td style="padding:8px;border-bottom:1px solid #ddd;"><b>🏛 Guilda:</b></td><td style="padding:8px;border-bottom:1px solid #ddd;">' + escapeHtml(guilda) + '</td></tr>' : '') +
        '<tr><td style="padding:8px;"><b>🕐 Enviado em:</b></td><td style="padding:8px;">' + dataEnvio + '</td></tr>' +
      '</table>' +
      '<div style="background:#fff;border-left:4px solid #d4af37;padding:16px;margin:20px 0;">' +
        '<b style="color:#d4af37;">💬 Mensagem:</b><br><br>' +
        '<div style="white-space:pre-wrap;color:#444;">' + escapeHtml(mensagem) + '</div>' +
      '</div>' +
      '<div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #ddd;color:#999;font-size:12px;">' +
        'Para responder, basta clicar em "Responder" — seu email irá direto para ' + escapeHtml(email) +
      '</div>' +
    '</div>';

  try {
    MailApp.sendEmail({to: destino, replyTo: email, subject: subjectLine, htmlBody: htmlBody});
  } catch(e) {
    Logger.log('Falha contato: ' + e.toString());
    return jsonResponse({ok: false, error: 'Não foi possível enviar a mensagem agora. Tente novamente em alguns minutos.'});
  }

  props.setProperty(lastKey, String(agora));
  try {
    logEvent('contato_recebido', {email: maskEmail(email), detalhes: 'Nome: ' + nome + (guilda ? ' | Guilda: ' + guilda : '')});
  } catch(e) {}

  return jsonResponse({ok: true, message: 'Mensagem enviada com sucesso! Vou responder no email ' + email + ' em breve. ⚔'});
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ========================================================
//  RELATÓRIO
// ========================================================

var RELATORIO_JANELA_DIAS = 14;

function montarRelatorioAtualizacoes(ssArg) {
  var ss = ssArg || SpreadsheetApp.getActiveSpreadsheet();
  var TZ = 'America/Sao_Paulo';
  var agora = new Date();
  var limiteMs = agora.getTime() - (RELATORIO_JANELA_DIAS * 24 * 60 * 60 * 1000);

  var jogadoresSheet = ss.getSheetByName('Jogadores');
  if (!jogadoresSheet) throw new Error('Aba "Jogadores" não encontrada');
  var jogadoresData = jogadoresSheet.getDataRange().getValues();
  var jogadores = [];
  for (var i = 1; i < jogadoresData.length; i++) {
    var nick = String(jogadoresData[i][0] || '').trim();
    if (nick) jogadores.push(nick);
  }

  var histSheet = ss.getSheetByName('Historico');
  var ultimaAtualizacao = {};
  if (histSheet) {
    var histData = histSheet.getDataRange().getValues();
    var headers = histData[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var colData = headers.indexOf('data'); var colNick = headers.indexOf('nick');
    if (colData === -1) colData = 0;
    if (colNick === -1) colNick = 1;
    for (var j = 1; j < histData.length; j++) {
      var nickHist = String(histData[j][colNick] || '').trim();
      if (!nickHist) continue;
      var nickKey = nickHist.toLowerCase();
      var dataRaw = histData[j][colData];
      var dataObj;
      if (dataRaw instanceof Date) dataObj = dataRaw;
      else {
        var dataStr = String(dataRaw);
        var m = dataStr.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
        if (m) dataObj = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]), parseInt(m[4] || 0), parseInt(m[5] || 0), parseInt(m[6] || 0));
        else dataObj = new Date(dataStr);
      }
      if (isNaN(dataObj.getTime())) continue;
      if (!ultimaAtualizacao[nickKey] || dataObj > ultimaAtualizacao[nickKey].data) {
        ultimaAtualizacao[nickKey] = {data: dataObj, dataStr: Utilities.formatDate(dataObj, TZ, 'dd/MM/yyyy')};
      }
    }
  }

  var atualizados = [], pendentes = [], nuncaAtualizaram = [];
  for (var k = 0; k < jogadores.length; k++) {
    var nick2 = jogadores[k];
    var nickKey2 = nick2.toLowerCase();
    var info = ultimaAtualizacao[nickKey2];
    if (!info) nuncaAtualizaram.push(nick2);
    else if (info.data.getTime() >= limiteMs) {
      var diasRecent = Math.floor((agora.getTime() - info.data.getTime()) / (24*60*60*1000));
      atualizados.push({nick: nick2, dataStr: info.dataStr, dias: diasRecent});
    } else {
      var diasAtraso = Math.floor((agora.getTime() - info.data.getTime()) / (24*60*60*1000));
      pendentes.push({nick: nick2, dataStr: info.dataStr, dias: diasAtraso});
    }
  }

  atualizados.sort(function(a, b) { return a.dias - b.dias; });
  pendentes.sort(function(a, b) { return b.dias - a.dias; });
  nuncaAtualizaram.sort();

  return {
    total: jogadores.length, atualizados: atualizados, pendentes: pendentes,
    nuncaAtualizaram: nuncaAtualizaram,
    dataGeracao: Utilities.formatDate(agora, TZ, 'dd/MM/yyyy HH:mm')
  };
}

function enviarRelatorioAtualizacoesDiscord(ssArg) {
  var rel = montarRelatorioAtualizacoes(ssArg);
  var totalAtualizados = rel.atualizados.length;
  var totalPendentes = rel.pendentes.length;
  var totalNunca = rel.nuncaAtualizaram.length;

  function listaAtualizados() {
    if (totalAtualizados === 0) return '_Ninguém atualizou nos últimos ' + RELATORIO_JANELA_DIAS + ' dias._';
    return truncarLista(rel.atualizados.map(function(p) { return '`' + p.nick + '`  — ' + p.dataStr; }), 1000);
  }
  function listaPendentes() {
    if (totalPendentes === 0) return '_Ninguém atrasado. 🎉_';
    return truncarLista(rel.pendentes.map(function(p) { return '`' + p.nick + '`  — ' + p.dataStr + '  _(há ' + p.dias + 'd)_'; }), 1000);
  }
  function listaNunca() {
    if (totalNunca === 0) return '_Todos já atualizaram pelo menos uma vez. ⚔_';
    return truncarLista(rel.nuncaAtualizaram.map(function(n) { return '`' + n + '`'; }), 1000);
  }

  enviarDiscord({
    username: 'TRIADE — Relatório', avatar_url: TRIADE_BOT_AVATAR,
    embeds: [{
      title: '📊 Relatório de Atualizações de Poder',
      description: 'Status dos ' + rel.total + ' cavaleiros — janela de ' + RELATORIO_JANELA_DIAS + ' dias',
      color: 0xd4af37,
      fields: [
        {name: '📈 Resumo', value: '✅ Atualizados: **' + totalAtualizados + '**\n⚠️ Pendentes (>' + RELATORIO_JANELA_DIAS + 'd): **' + totalPendentes + '**\n❌ Nunca atualizaram: **' + totalNunca + '**', inline: false},
        {name: '✅ Atualizaram (' + totalAtualizados + ')', value: listaAtualizados(), inline: false},
        {name: '⚠️ Pendentes — mais de ' + RELATORIO_JANELA_DIAS + ' dias (' + totalPendentes + ')', value: listaPendentes(), inline: false},
        {name: '❌ Nunca atualizaram pelo site (' + totalNunca + ')', value: listaNunca(), inline: false}
      ],
      footer: { text: 'TRIADE · 🛡 Cavaleiros, mantenham o poder em dia!' },
      timestamp: new Date().toISOString()
    }]
  }, ssArg);
  logEvent('relatorio_disparado', {detalhes: 'Total: ' + rel.total + ' | Atualizados: ' + totalAtualizados + ' | Pendentes: ' + totalPendentes + ' | Nunca: ' + totalNunca}, ssArg);
  return rel;
}

function truncarLista(linhas, maxChars) {
  var resultado = '';
  for (var i = 0; i < linhas.length; i++) {
    var proximo = (resultado ? resultado + '\n' : '') + linhas[i];
    if (proximo.length > maxChars) {
      var faltam = linhas.length - i;
      resultado += '\n_... e mais ' + faltam + '_';
      break;
    }
    resultado = proximo;
  }
  return resultado || '_(vazio)_';
}

function relatorioDispararAgora(params, ctx) {
  var authToken = String(params.authToken || '');
  if (!authToken) return jsonResponse({ok: false, error: 'Você precisa estar logado como líder.'});
  var ss = ctx.ss;
  var auth = getEmailFromAuthToken(ss, authToken);
  if (!auth.ok) return jsonResponse({ok: false, error: auth.error, sessionExpired: auth.sessionExpired});
  var sheets = ensureAuthSheets(ss);
  if (!isUserLeader(sheets.users, auth.email)) return jsonResponse({ok: false, error: 'Apenas líderes podem disparar relatório.'});
  try {
    var rel = enviarRelatorioAtualizacoesDiscord(ss);
    return jsonResponse({
      ok: true, message: 'Relatório enviado pro Discord!',
      stats: {total: rel.total, atualizados: rel.atualizados.length, pendentes: rel.pendentes.length, nuncaAtualizaram: rel.nuncaAtualizaram.length}
    });
  } catch(e) {
    Logger.log('Erro relatório: ' + e.toString());
    return jsonResponse({ok: false, error: 'Erro: ' + e.toString()});
  }
}

function instalarTriggerRelatorioSemanal() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'enviarRelatorioAtualizacoesDiscord') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('enviarRelatorioAtualizacoesDiscord').timeBased().everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(12).inTimezone('America/Sao_Paulo').create();
  Logger.log('✓ Trigger instalado: domingo às 12h (Brasília)');
}
