# 🔍 Guia de SEO — Por que o Google mostra "Netlify" e como corrigir

## O problema

Ao buscar seu site no Google, aparece **"Netlify"** como nome do site em vez de **"Tríade"**.

**Por quê?** O Google mostra um "nome do site" acima do link nos resultados. Esse nome
vem de sinais que a própria página fornece:

1. Dados estruturados `WebSite` (JSON-LD) com o campo `name`
2. Meta tag `og:site_name`
3. A tag `<title>`

Quando a página **não fornece** esses sinais, o Google recorre ao domínio — e como seu
site está em `triade-ssex.netlify.app` (subdomínio do netlify.app), ele mostra o nome
do domínio principal: **Netlify**.

## O que já foi corrigido neste projeto ✅

Tudo abaixo já está no `index.html` — basta publicar:

| Item | O que faz |
|---|---|
| `<title>Tríade — Legião de Saint Seiya EX</title>` | Título azul do resultado no Google |
| `<meta name="description">` | Texto cinza abaixo do título |
| JSON-LD `WebSite` com `name: "Tríade SSEX"` | **Nome do site** (o que substituirá "Netlify") |
| JSON-LD `Organization` | Identidade da legião p/ o Google |
| `og:site_name`, `og:title`, `og:image` | Prévia bonita no WhatsApp/Discord/Facebook |
| `<link rel="canonical">` | Evita conteúdo duplicado |
| `robots.txt` + `sitemap.xml` | Ajudam o Google a rastrear o site |
| `lang="pt-BR"` | Diz ao Google que o site é em português do Brasil |

## Passo a passo depois de publicar

### 1. Publicar no Netlify

**Opção recomendada — conectar este repositório GitHub:**
No painel do Netlify → *Site configuration* → *Build & deploy* → *Link repository* →
escolha `DeividRdgs/SaintSeiyaEX`. A partir daí, todo push no GitHub publica sozinho.

**Opção manual:** arraste a pasta do projeto no Netlify Drop, como você já faz.

### 2. Cadastrar no Google Search Console (grátis, essencial)

1. Acesse <https://search.google.com/search-console>
2. *Adicionar propriedade* → tipo **Prefixo do URL** → `https://triade-ssex.netlify.app/`
3. Verificação: escolha **Tag HTML** — copie a meta tag e cole no `index.html`
   (já deixei o lugar marcado com `google-site-verification`, é só descomentar e colar o código)
4. Publique de novo e clique em *Verificar*
5. Menu **Sitemaps** → envie `sitemap.xml`
6. Barra de cima → **Inspeção de URL** → cole a URL do site → **Solicitar indexação**

### 3. Esperar o Google atualizar

- A **indexação** do conteúdo novo costuma levar de horas a poucos dias.
- A troca do **nome do site** ("Netlify" → "Tríade") pode levar **dias a algumas
  semanas** — o Google reprocessa isso no ritmo dele. Solicitar indexação no
  Search Console acelera.

### 4. (Recomendado) Domínio próprio — solução definitiva

Enquanto o site estiver num subdomínio `.netlify.app`, o nome exibido depende do
Google aceitar os sinais acima. Com um **domínio próprio**, o problema desaparece
por completo e o site ganha aparência profissional:

- `triadessex.com.br` ou similar no [Registro.br](https://registro.br) (~R$ 40/ano)
- No Netlify: *Domain management* → *Add custom domain* (HTTPS automático e grátis)
- Depois, atualize `canonical`, `og:url`, `sitemap.xml` e `robots.txt` com o novo domínio

## Onde editar os textos do site

Os textos provisórios estão marcados com comentários `<!-- EDITE -->` no `index.html`.
Principais pontos:

- **Hero**: frase de apresentação
- **Sobre**: descrição e os 3 cards
- **Eventos**: dias, nomes e horários reais
- **Recrutamento**: requisitos reais
- **Contato**: link do Discord (troque o `href="#"`) e nicks dos líderes

> 💡 Se quiser mudar o nome exibido no Google (ex.: "Tríade" em vez de "Tríade SSEX"),
> altere o campo `name` do JSON-LD `WebSite` e o `og:site_name` no `index.html`.
