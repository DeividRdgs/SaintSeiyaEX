# TRIADE — Saint Seiya EX / Rebirth 2

Guia interativo de **Saint Seiya EX** (Awakening EX / Rebirth 2) mantido pela
Legião TRIADE, publicado em [triade-ssex.netlify.app](https://triade-ssex.netlify.app/).

Site estático (HTML/CSS/JS puro, sem build) em formato SPA com History API —
as rotas são URLs reais servidas via fallback do Netlify. Interface em
português, inglês e espanhol.

## O que o site oferece

| Rota | Conteúdo |
|---|---|
| `/` | Início — distribuição tática da legião |
| `/herois` | Codex dos 103 cavaleiros |
| `/artefatos` | Codex dos 34 artefatos |
| `/cartas` | Codex de Ultimate Power Cards |
| `/tier-list` | Tier list interativa |
| `/team-builder` | Montador de equipes (9 cavaleiros + 2 suportes + equipamentos) |
| `/roleta` | Roleta de cavaleiros para vídeos/lives |
| `/banners` | Calendário/previsão de banners do servidor global |
| `/guilda` | Área privada dos membros (bosses, ranking, GVG, eventos, estatísticas, votação) |

## Estrutura de arquivos

```
index.html              → SPA inteira (markup + SEO no <head>)
css/style.css           → estilos
js/app.js               → lógica principal
js/app-part1.js         → lógica (parte 1)
js/app-part2.js         → roteamento (TAB_ROUTES) e abas
js/data/                → dados do jogo (~3 MB): heroes, artifacts, cards, i18n
circlehead/             → retratos dos cavaleiros (PNG)
skillicons/             → ícones de habilidades (PNG)
calendario-banners.png  → imagem do calendário (também usada como og:image)
_redirects              → fallback SPA do Netlify (toda rota → index.html)
netlify.toml            → headers de segurança e cache
robots.txt, sitemap.xml → SEO
GUIA-SEO.md             → guia do Google Search Console
tools/extract.py        → script auxiliar de extração de dados
```

## Rodar localmente

Como é SPA com rotas reais, sirva por HTTP (abrir o arquivo direto quebra as rotas):

```
python -m http.server 8000
```

Depois acesse <http://localhost:8000/>. Rotas internas (ex. `/herois`) só
funcionam com fallback de servidor — localmente, navegue a partir da home.

## Deploy no Netlify

- **Por git (recomendado):** conecte este repositório no painel do Netlify;
  cada push publica automaticamente. `publish = "."` já está no `netlify.toml`.
- **Manual:** arraste a pasta do projeto em <https://app.netlify.com/drop>.

O arquivo `_redirects` garante que qualquer rota sirva o `index.html` (status 200).
