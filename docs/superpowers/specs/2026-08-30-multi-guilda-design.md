# Multi-guilda no mesmo site — design (Fase 1)

Data: 2026-08-30 · Status: aprovado em conversa, aguardando revisão da spec

## Contexto

O site TRIADE (https://saintseiyaex.netlify.app) é hoje de guilda única: a área
`/guilda` (ranking, bosses, GVG, eventos, votação, aprovação de membros) fala com
um único backend Google Apps Script (`API_URL` fixa em `js/app-part1.js:5`) preso
à planilha da TRIADE via `getActiveSpreadsheet()`. O código do backend está salvo
em `backend/apps-script.gs` (fonte da verdade para a adaptação; ~85 funções,
13 abas: Jogadores, Config, Historico, Logs, Eventos, Votos, Votacao_Ativa,
Votacao_Historico, Sessoes, Codigos, Usuarios, Sessoes_Auth, GVG).

Objetivo: **várias guildas usando o mesmo site**, cada uma com seus dados
isolados, sem tocar nos dados atuais da TRIADE.

## Decisões tomadas (com o usuário)

1. **Criação de guilda**: o líder pede pelo site; a guilda só ativa depois que o
   admin do site (Deivid) aprovar.
2. **Backend**: adaptar o Apps Script existente (código fornecido), não reescrever.
3. **Aprovação de guilda**: por uma tela no site (não pela planilha).
4. **Gestão de elenco**: o líder gerencia os nicks pelo site (não recebe acesso à
   planilha). A planilha é só armazenamento; o Drive continua todo do Deivid.
5. **Arquitetura**: opção A — uma planilha por guilda (ver abaixo).
6. **Escopo**: duas fases; esta spec cobre a Fase 1.

## Arquitetura — uma planilha por guilda

- A planilha atual da TRIADE vira a **master**. Ganha duas abas novas:
  - `Guildas`: slug, nome, spreadsheet_id, status (`pendente`/`ativa`/`recusada`),
    email_lider, nick_lider, criada_em, aprovada_em.
    A TRIADE entra como primeira linha (ativa, apontando para a própria planilha).
  - `Usuarios_Index`: email → guilda (slug), status. Mantida em cada
    cadastro/aprovação/negação de usuário. Regra v1: **um email pertence a uma
    única guilda**.
- Toda requisição do site passa a incluir `guild` (slug). No `doGet`/`doPost`,
  `resolveGuild(slug)` lê a aba `Guildas` (com cache em `CacheService`, TTL
  ~5 min) e abre a planilha da guilda via `SpreadsheetApp.openById`. As funções
  internas já recebem `ss` e seguem quase intocadas.
- **Login sem escolher guilda**: `authLogin` recebe só email+senha; o backend
  resolve a guilda pelo `Usuarios_Index` e devolve `guild` + `guildName` na
  resposta. O frontend guarda ambos na sessão (localStorage) e envia `guild` nas
  chamadas seguintes. `authValidateToken` também resolve pelo índice.
- Ao **aprovar uma guilda**, o script:
  1. cria uma planilha nova no Drive do Deivid (`SpreadsheetApp.create`) com
     todas as abas e cabeçalhos da estrutura atual (função `criarPlanilhaGuilda`);
  2. grava o `spreadsheet_id` e status `ativa` na aba `Guildas`;
  3. cadastra o líder na planilha da guilda como usuário aprovado com
     `lider = sim` (usando o hash+salt de senha guardados no pedido) e no
     `Usuarios_Index`;
  4. adiciona o nick do líder na aba `Jogadores` da guilda.
- **Admin do site**: coluna `site_admin` na aba `Usuarios` da planilha da TRIADE
  (marcada para a conta do Deivid). As ações de admin exigem token de sessão
  válido de um usuário com essa marcação. Sem senha extra.
- **Config por guilda**: cada planilha de guilda tem sua aba `Config`
  (senha_admin própria, webhook do Discord próprio — vazio por padrão; sem
  webhook, os avisos de Discord são silenciosamente pulados, comportamento que o
  código já tem). O webhook de *pedidos de guilda* usa o Config da master
  (avisa o Deivid).

## Mudanças na API (backend)

Ações novas:

| Ação | Quem chama | Descrição |
|---|---|---|
| `guildRegister` | público | Pedido de criação: nome da guilda, nick do líder, email, senha. O slug é gerado do nome (mesma regra do `rdSlugify` do frontend). Valida unicidade de slug/nome e email livre no índice. Cria linha `pendente` em `Guildas`, guardando **hash+salt** da senha do líder (nunca texto puro; hash com o `hashSenha` existente). Rate-limit igual ao de cadastro. |
| `guildList` | público | Lista guildas ativas (slug + nome) para os selects de cadastro. |
| `guildListPending` | site admin | Pedidos pendentes. |
| `guildApprove` / `guildDeny` | site admin | Aprova (cria planilha etc.) ou recusa o pedido. |
| `rosterList` | líder da guilda | Nicks da aba `Jogadores` + se já têm conta vinculada. |
| `rosterAdd` | líder da guilda | Adiciona nick à aba `Jogadores` (sem poder inicial). |
| `rosterRemove` | líder da guilda | Remove nick; se o nick tem conta vinculada, exige `confirm: true` e também remove/inativa o usuário. |

Ações existentes: todas passam a operar na planilha resolvida por `guild`.
`authGetNicks` recebe `guild`. `authLogin`/`authValidateToken`/`authForgotPassword`
resolvem a guilda pelo `Usuarios_Index` (não recebem `guild`). Requisição sem
`guild` nas ações que o exigem → fallback para `triade` (compatibilidade com
clientes com cache velho do JS).

## Mudanças no frontend

1. **Cadastro de membro** (`authSubmitRegister` + modal em `index.html`): select
   de guilda (via `guildList`) antes do select de nick; a lista de nicks carrega
   ao escolher a guilda (`authGetNicks` com `guild`).
2. **Cadastro de guilda**: link "Cadastrar minha guilda" no modal de auth abre um
   formulário (nome da guilda, nick do líder, email, senha). Envia
   `guildRegister`; tela de "pedido enviado, aguarde aprovação".
3. **Sessão**: `_authState` ganha `guild` e `guildName` (persistidos). Helper
   central adiciona `guild` no corpo/query de toda chamada da área da guilda.
4. **Textos dinâmicos**: "TRIADE"/"Legião TRIADE" nas abas da guilda (títulos,
   descrições em `TAB_ROUTES`/`GUILD_SUBTAB_ROUTES`, cabeçalhos) trocados pelo
   `guildName` da sessão. Área pública (codex, tier list, banners, home) fica
   como está.
5. **Sub-aba "Elenco"** (nova, só líder): listar/adicionar/remover nicks, com
   confirmação para nick com conta vinculada.
6. **Sub-aba "Guildas"** (nova, só site admin): pendentes com aprovar/recusar +
   lista de ativas.

## Tratamento de erros

- Slug de guilda inexistente/inativa → `{ok:false, error:'Guilda não encontrada'}`;
  o frontend desloga e volta ao início.
- Pedido de guilda com nome/slug já usado ou email já cadastrado em outra guilda
  → erro claro no formulário.
- Falha ao criar a planilha na aprovação → status permanece `pendente`, erro
  reportado na tela do admin (operação re-executável; criação é idempotente:
  se já existe `spreadsheet_id` gravado, reusa).
- Ações de líder/admin sempre revalidam o papel no backend (nunca só na UI).

## Testes / verificação

- Backend: função `testeMultiGuilda()` no Apps Script que roda o ciclo com uma
  guilda de teste (registrar → aprovar → nicks → cadastro membro → login →
  atualizar poder → verificar isolamento lendo a planilha da TRIADE).
- Frontend: smoke manual num deploy de teste do Netlify (site secundário) com um
  Apps Script de teste, antes de trocar em produção: cadastro de guilda,
  aprovação, cadastro/login de membro nas duas guildas, ranking isolado,
  textos com o nome da guilda certa.
- Regressão TRIADE: login de conta existente continua funcionando sem `guild`
  salvo (fallback `triade`), ranking/eventos/votação intactos.

## Riscos e limites

- Reimplantação do Apps Script pedirá autorização do escopo de Drive (um clique).
- Quota do Apps Script comporta dezenas de guildas ativas; não centenas.
- `openById` adiciona latência pequena por requisição (mitigada pelo cache do
  registro de guildas).
- A planilha da TRIADE não é migrada; único acréscimo são as abas `Guildas`,
  `Usuarios_Index` e a coluna `site_admin`.

## Fora de escopo (Fase 2)

- Líder editar eventos, GVG e webhook do Discord pelo site.
- Trocar de guilda / múltiplas guildas por email.
- Transferência de liderança pelo site.
