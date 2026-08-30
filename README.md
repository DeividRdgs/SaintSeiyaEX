# Tríade — Saint Seiya EX

Site da legião **Tríade** (Saint Seiya EX), publicado em
[triade-ssex.netlify.app](https://triade-ssex.netlify.app/).

Página única, HTML/CSS/JS puro — sem build, sem dependências.

## Estrutura

```
index.html      → página (todo o conteúdo + SEO no <head>)
css/style.css   → estilos (tema cosmos escuro + dourado)
js/main.js      → menu mobile, animações e céu estrelado
assets/         → favicon, ícone e imagem de compartilhamento (og-image)
robots.txt      → permissão de rastreamento p/ buscadores
sitemap.xml     → mapa do site p/ o Google
netlify.toml    → cabeçalhos de segurança e cache no Netlify
GUIA-SEO.md     → 📖 guia: como tirar o "Netlify" do resultado do Google
```

## Rodar localmente

Abra o `index.html` no navegador, ou no PhpStorm clique com o botão direito no
arquivo → *Open in Browser* (o servidor embutido do PhpStorm funciona normal).

## Publicar

Arraste a pasta no Netlify Drop **ou** conecte este repositório no painel do
Netlify para publicar automaticamente a cada push. Detalhes no [GUIA-SEO.md](GUIA-SEO.md).
