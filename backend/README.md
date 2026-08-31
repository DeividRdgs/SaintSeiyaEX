# Backend (Google Apps Script)

`apps-script.gs` é a fonte da verdade do backend. Ele NÃO sobe sozinho: é colado
no editor do Apps Script da planilha da TRIADE (Extensões → Apps Script).

## Implantar uma nova versão

1. Copie todo o conteúdo de `apps-script.gs` por cima do código no editor. Salve.
2. Rode a função `ensureMasterSheets` uma vez (cria as abas `Guildas` e
   `Usuarios_Index`; a primeira execução pede autorização — inclui o escopo do
   Drive usado para criar planilhas de guildas novas). Essa mesma execução já
   popula o `Usuarios_Index` com as contas existentes da TRIADE (backfill
   automático, só roda na criação da aba).
3. Rode `testeMultiGuilda` e confira no log `✅ TESTE COMPLETO PASSOU` (cobre criação de guilda, elenco, cadastro, eventos/GVG/webhook da Fase 2); depois rode `testeMultiGuildaLimpar`.
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
- Os avisos automáticos (lembretes de eventos e resumo semanal) rodam para todas as guildas ativas que tiverem `webhook_discord` no Config.
