# Profissionalização do site TRIADE (Saint Seiya EX) — Design aprovado

Data: 2026-08-30 · Aprovado pelo usuário nesta sessão.

## Contexto

- O site real em produção (https://triade-ssex.netlify.app/) é um único `index.html` de 3,6 MB
  (fonte: `D:\Triade Site\index.html` + assets do zip `deploy-6a41d19cbcfb3f71274b642c.zip`, 828 arquivos).
- Composição: ~1,5 MB `CODEX_HEROES`, ~1,4 MB `CODEX_CARDS`, ~151 KB `ARTIFACT_DETAILS`,
  ~66 KB `UI_TEXTS`, ~300 KB de lógica JS, ~198 KB de CSS inline.
- O conteúdo commitado anteriormente no repositório (landing page de 226 linhas) foi uma
  alucinação de outra sessão e será substituído por completo. A base é o arquivo real do site.
- Métricas do piloto (30 dias): 870 visitas, 1,89k pageviews, LCP Good 92% (P75 1.444 ms).

## Escopo aprovado

1. **Arquitetura sem build**: dividir o monolito em `index.html` (leve) + `css/style.css` +
   `js/data/*.js` (heroes, cards, artifacts, i18n) + `js/app.js`, com scripts `defer` em ordem
   original. Extração determinística nos limites exatos das declarações top-level — a
   concatenação dos pedaços deve ser idêntica byte a byte ao script original (garantia de
   zero mudança de comportamento). Deploy continua simples (arrastar pasta no Netlify ou git).
2. **Polimento visual premium**: manter identidade cosmos escuro + dourado + Cinzel; elevar
   acabamento via camada `css/polish.css` carregada após `style.css` (tokens, profundidade,
   micro-animações com `prefers-reduced-motion`, foco/hover, mobile). Sem reescrever o CSS base.
3. **Entrega**: tudo commitado no repositório + zip pronto para arrastar no Netlify.
   Verificação: `node --check` em cada JS, igualdade byte a byte da concatenação,
   smoke-test em servidor local das rotas /, /team-builder, /herois, /tier-list, /banners.

## Fora do escopo (próximas etapas possíveis)

- Migrar imagens do Imgur para hospedagem própria; domínio próprio; redesign radical.
