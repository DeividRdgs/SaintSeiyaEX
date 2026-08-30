# 🔍 Guia de SEO — Por que o Google mostra "Netlify" e como corrigir

## O problema

Ao buscar o site no Google, pode aparecer **"Netlify"** como nome do site em vez de
**"TRIADE"**.

**Por quê?** O Google mostra um "nome do site" acima do link nos resultados. Esse nome
vem de sinais que a própria página fornece:

1. Dados estruturados `WebSite` (JSON-LD) com o campo `name`
2. Meta tag `og:site_name`
3. A tag `<title>`

Quando a página não fornece esses sinais, o Google recorre ao domínio — e como o
site está em `saintseiyaex.netlify.app` (subdomínio do netlify.app), ele mostra o nome
do domínio principal: **Netlify**.

## O que já está feito neste projeto ✅

Tudo abaixo já existe no `index.html` publicado:

| Item | O que faz |
|---|---|
| `<title>TRIADE — Saint Seiya EX / Rebirth 2 \| Codex, Team Builder, Tier List</title>` | Título azul do resultado no Google |
| `<meta name="description">` | Texto cinza abaixo do título |
| JSON-LD `WebSite` com `name: "TRIADE — Saint Seiya EX (Rebirth 2)"` | **Nome do site** (o que substitui "Netlify") |
| JSON-LD com `publisher` `Organization` ("TRIADE Guild") | Identidade da guilda p/ o Google |
| `og:site_name`, `og:title`, `og:image` (calendario-banners.png) | Prévia no WhatsApp/Discord/Facebook |
| `<link rel="canonical">` | Evita conteúdo duplicado |
| `robots.txt` + `sitemap.xml` | Rastreio das rotas públicas (`/herois`, `/tier-list` etc.); `/guilda` bloqueada |
| `lang="pt-BR"` + `og:locale:alternate` (en/es) | Idiomas do site |
| **Meta tag de verificação do Search Console** (`google-site-verification: TAwujKAvR27oM-55KZveTUmHZg7uT9GL_EHGa5b_RXo`) | Propriedade já verificável no GSC |

## Passo a passo

### 1. Publicar no Netlify

**Opção recomendada — repositório GitHub conectado:** todo push publica sozinho
(painel do Netlify → *Site configuration* → *Build & deploy* → *Link repository*).

**Opção manual:** arraste a pasta do projeto no Netlify Drop.

### 2. Google Search Console (grátis, essencial)

1. Acesse <https://search.google.com/search-console>
2. *Adicionar propriedade* → tipo **Prefixo do URL** → `https://saintseiyaex.netlify.app/`
3. Verificação: escolha **Tag HTML** — a meta tag `google-site-verification` **já está
   no `index.html`** com o código correto; basta clicar em *Verificar*
4. Menu **Sitemaps** → envie `sitemap.xml`
5. Barra de cima → **Inspeção de URL** → cole `https://saintseiyaex.netlify.app/` →
   **Solicitar indexação** (repita para as rotas principais: `/herois`, `/tier-list`,
   `/team-builder`, `/artefatos`, `/cartas`, `/banners`, `/roleta`)

> ⚠️ O site é uma SPA: o conteúdo é renderizado por JavaScript. O Googlebot executa
> JS, mas a indexação pode demorar mais que num site estático comum. O `<title>`,
> a `description` e o JSON-LD já estão no HTML inicial, o que ajuda bastante.

### 3. Esperar o Google atualizar

- A **indexação** de conteúdo novo costuma levar de horas a poucos dias.
- A troca do **nome do site** ("Netlify" → "TRIADE") pode levar **dias a algumas
  semanas** — o Google reprocessa isso no ritmo dele. Solicitar indexação no
  Search Console acelera.

### 4. (Recomendado) Domínio próprio — solução definitiva

Enquanto o site estiver num subdomínio `.netlify.app`, o nome exibido depende do
Google aceitar os sinais acima. Com um **domínio próprio**, o problema desaparece
por completo:

- `triadessex.com.br` ou similar no [Registro.br](https://registro.br) (~R$ 40/ano)
- No Netlify: *Domain management* → *Add custom domain* (HTTPS automático e grátis)
- Depois, atualize `canonical`, `og:url`, JSON-LD, `sitemap.xml` e `robots.txt`
  com o novo domínio, e adicione a nova propriedade no Search Console

> 💡 Para mudar o nome exibido no Google, altere o campo `name` do JSON-LD
> `WebSite` e o `og:site_name` no `index.html`.
