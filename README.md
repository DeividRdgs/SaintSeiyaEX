# Saint Seiya EX / Rebirth 2 — Guia

Guia completo de **Saint Seiya EX** (Rebirth 2 / Awakening EX): codex de 103 cavaleiros,
34 artefatos e 165 cartas com skills traduzidas (pt/en/es), team builder, tier list,
roleta e área de gestão da guilda TRIADE.

**Site:** https://triade-ssex.netlify.app · **Discord:** https://discord.gg/JdjaESRjxF

## Rodar localmente

```
python tools/serve.py
```

Abre em http://localhost:8123/ com fallback de SPA (rotas internas funcionam) e sem
cache (F5 sempre atualiza).

## Estrutura

| Caminho | O que é |
|---|---|
| `index.html` | Shell da SPA (roteamento por History API) |
| `css/` | `style.css` (base) + camadas: `polish`, `redesign*`, `icons`, `refine*`, `skeleton` |
| `js/app-part1/2.js`, `js/app.js` | Lógica do app (i18n, rotas, abas, codex, ferramentas) |
| `js/redesign.js` | Home hub, busca global (Ctrl+K), URLs por herói, aba Pendentes |
| `js/data/` | Dados do codex: `heroes`, `artifacts`, `cards`, `i18n` |
| `img/{heroes,artifacts,cards,bosses}/` | Imagens em WebP nomeadas pelo id interno (ex.: `heroes/1027.webp`) |
| `herois/<slug>/` | Páginas pré-renderizadas por herói (SEO) — **geradas, não editar à mão** |
| `circlehead/`, `skillicons/` | Retratos circulares e ícones de skill |
| `tools/` | `serve.py` (dev), `build-hero-pages.mjs` (gerador SEO), `og-card.html` (card social) |

## Fluxos comuns

- **Editar um herói/carta/artefato:** edite `js/data/*.js` e rode
  `node tools/build-hero-pages.mjs` para regenerar as páginas de SEO e o sitemap.
- **Trocar a arte de um herói:** substitua `img/heroes/<id>.webp` (mesmo nome).
- **Trocar os banners em destaque da home:** edite `HOME_FEATURED` no topo de
  `js/redesign.js` (ids + data de término opcional para countdown).
- **Calendário de banners:** substitua `calendario-banners.png`.

## Deploy

Push neste repositório (se conectado ao Netlify) ou arraste a pasta em
https://app.netlify.com/drop. O `netlify.toml` cuida de segurança e cache;
o `_redirects` faz o fallback da SPA.
