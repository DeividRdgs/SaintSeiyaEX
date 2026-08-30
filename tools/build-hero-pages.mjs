// Gera páginas estáticas por herói (/herois/<slug>/index.html) para SEO,
// mantendo o formato SPA: cada página é o shell completo do app com head
// específico + conteúdo pré-renderizado que o app remove ao assumir.
// Uso: node tools/build-hero-pages.mjs   (rodar de novo a cada mudança nos dados)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = 'https://triade-ssex.netlify.app';

function loadConst(file, name) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return new Function(`${src}; return ${name};`)();
}
const HEROES = loadConst('js/data/heroes.js', 'CODEX_HEROES');

const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FACTIONS = { santuario: 'Santuário', submundo: 'Submundo', asgard: 'Asgard', atlantida: 'Atlântida' };
const CLASSES = { lutador: 'Lutador', mago: 'Mago', arqueiro: 'Arqueiro', tanque: 'Tanque', suporte: 'Suporte' };

// slugs únicos
const seen = new Map();
for (const h of HEROES) {
  const s = slugify(h.name);
  if (seen.has(s)) throw new Error(`slug duplicado: ${s} (${seen.get(s)} e ${h.id})`);
  seen.set(s, h.id);
}

const template = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let count = 0;

for (const h of HEROES) {
  const slug = slugify(h.name);
  const url = `${SITE}/herois/${slug}`;
  const fac = FACTIONS[h.faction] || h.faction || '';
  const cls = CLASSES[h.class] || h.class || '';
  const rar = (h.rarity || '').toUpperCase();
  const skillNames = (h.skills || []).map(s => s.name).filter(Boolean);
  const desc = `${h.name} em Saint Seiya EX (Rebirth 2): cavaleiro ${rar} do ${fac}, classe ${cls}. ` +
    `Skills traduzidas${skillNames.length ? ` (${skillNames.slice(0, 3).join(', ')})` : ''}, team builder e tier list.`;
  const title = `${h.name} — Skills e Guia | Saint Seiya EX`;
  const img = `${SITE}/img/heroes/${h.id}.webp`;

  let page = template;
  // base para resolver caminhos relativos a partir de /herois/<slug>/
  page = page.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n<base href="/">');
  // head específico
  page = page.replace(/<title id="pageTitle">[^<]*<\/title>/, `<title id="pageTitle">${esc(title)}</title>`);
  page = page.replace(/(<meta name="description" id="pageDescription" content=")[^"]*(")/, `$1${esc(desc)}$2`);
  page = page.replace(/(<link rel="canonical" href=")[^"]*(" id="canonicalLink">)/, `$1${url}$2`);
  page = page.replace(/(<meta property="og:title" id="ogTitle" content=")[^"]*(")/, `$1${esc(h.name)} — Saint Seiya EX$2`);
  page = page.replace(/(<meta property="og:description" id="ogDescription" content=")[^"]*(")/, `$1${esc(desc)}$2`);
  page = page.replace(/(<meta property="og:url" id="ogUrl" content=")[^"]*(")/, `$1${url}$2`);
  page = page.replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${img}$2`);
  page = page.replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${img}$2`);

  // conteúdo pré-renderizado (o app remove via js/redesign.js ao assumir)
  const skillsHtml = (h.skills || []).map(s =>
    `<article><h3>${esc(s.name)}${s.type ? ` <small>(${esc(s.type)})</small>` : ''}</h3><p>${esc(s.desc || '')}</p></article>`
  ).join('\n');
  const pre = `
  <section id="prerender-hero" class="prerender-hero">
    <nav><a href="/">Início</a> › <a href="/herois">Codex de Heróis</a> › <span>${esc(h.name)}</span></nav>
    <h1>${esc(h.name)}</h1>
    <p class="prerender-meta">${rar} · ${esc(fac)} · ${esc(cls)}${h.name_en ? ` · ${esc(h.name_en)}` : ''}</p>
    <img src="/img/heroes/${h.id}.webp" alt="${esc(h.name)}" width="220" loading="eager">
    <h2>Skills</h2>
    ${skillsHtml}
  </section>`;
  page = page.replace('<div class="tab-content active" id="tab-inicio">', pre + '\n  <div class="tab-content active" id="tab-inicio">');

  const dir = path.join(ROOT, 'herois', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page);
  count++;
}

// sitemap: bloco de heróis regenerado entre marcadores
const smPath = path.join(ROOT, 'sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8');
const today = new Date().toISOString().slice(0, 10);
const heroEntries = HEROES.map(h =>
  `  <url>\n    <loc>${SITE}/herois/${slugify(h.name)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`
).join('\n');
const block = `<!-- HEROIS:INICIO (gerado por tools/build-hero-pages.mjs) -->\n${heroEntries}\n<!-- HEROIS:FIM -->`;
if (sm.includes('HEROIS:INICIO')) {
  sm = sm.replace(/<!-- HEROIS:INICIO[\s\S]*?HEROIS:FIM -->/, block);
} else {
  sm = sm.replace('</urlset>', block + '\n</urlset>');
}
fs.writeFileSync(smPath, sm);

console.log(`geradas ${count} páginas em /herois/<slug>/ + sitemap com ${HEROES.length} URLs de herói`);
