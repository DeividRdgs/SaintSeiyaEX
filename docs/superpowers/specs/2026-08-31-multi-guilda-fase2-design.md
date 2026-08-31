# Multi-guilda Fase 2 — gestão pelo líder (eventos, GVG, webhook, avisos por guilda)

Data: 2026-08-31 · Status: design aprovado em conversa, aguardando revisão da spec
Base: Fase 1 em produção (spec `2026-08-30-multi-guilda-design.md`); backend em
`backend/apps-script.gs`, uma planilha por guilda, ações roteadas por `ctx = resolveGuild(slug)`.

## Objetivo

O líder de qualquer guilda administra pelo site o que hoje só a TRIADE tem via
planilha: eventos, escalação de GVG e o webhook do Discord. Os avisos
automáticos de horário (lembretes de eventos, resumo semanal) passam a valer
para todas as guildas ativas.

## Decisões tomadas (com o usuário)

1. **Escopo inclui os avisos automáticos por guilda** (resumo semanal e
   lembretes de eventos), não só a edição pelo site.
2. **Edição no lugar**: botões de gestão nas próprias abas Eventos e GVG
   (visíveis só para o líder); webhook numa seção "Configurações" na aba
   Membros. Sem sub-aba nova.
3. **Modelo de escrita: substituição da lista inteira** (`eventsReplace`/
   `gvgReplace`) — o site envia a lista completa e o backend regrava a aba.
   Sem CRUD por linha (cada guilda tem um líder; conflito simultâneo é irreal).

## Backend — 5 ações novas

Todas com `(params, ctx)`, despachadas no `doPost` dentro do grupo que resolve
`ctx`, e validando o papel de líder com o helper existente
`rosterAssertLeader(params, ctx)` (token nas sessões da guilda + `isUserLeader`).

| Ação | Entrada | Comportamento |
|---|---|---|
| `manageList` | `authToken` | Devolve `{ok, events:[{dia,nome,horario,descricao,status,recompensa}], gvg:[{papel,nick,observacao}], webhookMask, webhookSet}`. `webhookMask` = `"…" + últimos 6 chars` quando configurado, `''` quando não; a URL completa NUNCA sai na resposta. |
| `eventsReplace` | `authToken`, `events[]` | Valida (máx. 30 itens; `dia` obrigatório; `nome` obrigatório ≤60; `horario` ≤20; `descricao` ≤200; `recompensa` ≤100; `status` em {Ativo, Inativo}, default Ativo). Limpa as linhas de dados da aba `Eventos` e regrava. Lista vazia é válida (aba fica só com o cabeçalho). |
| `gvgReplace` | `authToken`, `gvg[]` | Valida (máx. 60 itens; `papel` obrigatório ≤40; `nick` obrigatório ≤30; `observacao` ≤120). Limpa e regrava a aba `GVG`. Lista vazia válida. |
| `configSetWebhook` | `authToken`, `webhook` | `webhook` vazio → limpa a chave `webhook_discord` do Config da guilda. Não-vazio → exige conter `discord.com/api/webhooks/`; grava. Se a linha `webhook_discord` não existe no Config, cria. |
| `configTestWebhook` | `authToken` | Envia via `enviarDiscord(payload, ctx.ss)` uma mensagem de teste ("✅ Webhook configurado! Avisos de <nome da guilda> chegarão neste canal."). Sem webhook configurado → `{ok:false, error:'Configure o webhook primeiro'}`. |

Escritas de lista usam `LockService` (mesmo padrão do `guildRegister`) em volta
de limpar+regravar, para uma falha no meio não deixar a aba pela metade sem
retry. Regravação: `clearContents` do intervalo de dados (linha 2 em diante) +
`setValues` de uma vez (não appendRow em loop).

## Avisos automáticos por guilda

Os três fluxos de gatilho passam a iterar as guildas ativas:

- Novo helper `forEachGuildaAtiva(fn)`: lê a aba `Guildas` da master, e para
  cada linha `status === 'ativa'` com `spreadsheet_id`, chama
  `fn({slug, nome, ss})` dentro de try/catch individual (erro numa guilda não
  derruba as demais; loga com `logEvent`).
- `atualizarStatusEventos()` → roda a lógica atual para cada guilda (independe
  de webhook).
- `avisarEventosProximos()` → idem, mas o envio Discord usa
  `enviarDiscord(payload, ss)` da guilda; sem webhook, `getDiscordWebhook(ss)`
  devolve `''` e o envio é pulado (comportamento já existente).
- `resumoSemanalDiscord()` → idem.
- Chaves de deduplicação no `PropertiesService` (ex.: "avisados hoje")
  ganham o prefixo do slug (`slug + '_' + chaveAtual`) para não misturar
  guildas. As chaves antigas da TRIADE são simplesmente abandonadas (efeito
  colateral máximo: um lembrete repetido no dia da virada — aceitável).
- Os gatilhos instalados (instalarAcionadores etc.) não mudam: continuam
  disparando as mesmas funções, que agora abrangem todas as guildas.

## Frontend

1. **Aba Eventos** — para o líder (`_authState.user.isLeader`), aparece o botão
   "✎ Gerenciar eventos" no topo da aba. Ele abre um painel de edição
   (`pending-panel`) com uma linha por evento: select de dia (Segunda…Domingo),
   nome, horário, descrição, recompensa, select de status (Ativo/Inativo) e
   botão ✕ remover; botão "+ Adicionar evento" acrescenta linha em branco;
   "💾 Salvar" envia `eventsReplace` e, no sucesso, fecha o painel e chama
   `loadData(true)`. "Cancelar" fecha sem salvar. O painel carrega os dados
   via `manageList` (não do cache público) ao abrir.
2. **Aba GVG** — mesmo padrão com os campos papel, nick, observação.
3. **Aba Membros** — seção "⚙ Configurações" ao final do painel (visível junto
   com o resto da aba, que já é só do líder): campo do webhook com placeholder
   e o valor atual mascarado como texto informativo ("Configurado: …abc123"),
   botões "Salvar", "Enviar teste" e "Remover" (remover pede confirm()).
   Carrega o estado via `manageList` no `initElencoTab`.
4. Visibilidade: os botões de gestão seguem o mesmo mecanismo dos existentes
   (`updateAuthUI` mostra/esconde por `isLeader`); o backend revalida sempre.
5. i18n: todas as strings novas em pt/en/es.
6. Estilos: reusar `pending-panel`, `auth-admin-btn`, `elenco-add-row`; linhas
   de edição em grid responsivo (cai para empilhado no mobile). CSS novo em
   `css/redesign-guild.css`.

## Erros e segurança

- Toda ação de gestão revalida líder no backend; nunca só na UI.
- Limites de quantidade/tamanho conforme a tabela (erros com mensagem clara).
- Webhook completo nunca aparece em resposta de API (somente máscara).
- `eventsReplace`/`gvgReplace` com item inválido → rejeita a lista inteira com
  a posição do item no erro (ex.: "Evento 3: nome obrigatório"); não grava nada.
- Falha de rede no salvar → painel continua aberto com os dados digitados.

## Testes / verificação

- Backend: estender `testeMultiGuilda()` — na guilda de teste: `eventsReplace`
  com 2 eventos → reler a aba e conferir; `gvgReplace` com 1 linha; 
  `configSetWebhook` com URL válida e inválida; conferir que as abas Eventos/
  GVG da TRIADE não mudaram. Validação de sintaxe Node como na Fase 1.
- Frontend: `node --check` nos arquivos tocados + smoke manual: logar como
  líder da ARAYASHIKI, criar 2 eventos e a escalação GVG pelo site, configurar
  o webhook e receber a mensagem de teste no canal deles.
- Regressão TRIADE: abas Eventos/GVG continuam idênticas para membro comum;
  lembretes/resumo da TRIADE continuam chegando no canal atual.

## Fora de escopo

- Transferência de liderança; múltiplos líderes/oficiais.
- Editar `senha_admin`/`youtube_url` pelo site.
- Excluir/arquivar guilda pelo site.
- Página pública "Cadastre sua guilda" na home (melhoria de descoberta — pode
  ser um item avulso depois).
