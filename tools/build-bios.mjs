// Gera bios factuais (pt/en/es) a partir das skills de cada herói e grava
// em js/data/heroes.js (campos bio, bio_en, bio_es). Determinístico: descreve
// apenas o que está nas skills — nada de análise de meta inventada.
// Uso: node tools/build-bios.mjs  (depois rode build-hero-pages.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILE = path.join(ROOT, 'js/data/heroes.js');
const src = fs.readFileSync(FILE, 'utf8');
const HEROES = new Function(`${src}; return CODEX_HEROES;`)();

const L = {
  pt: {
    rarity: { ur: 'lendário UR', ssr: 'SSR', sr: 'SR', r: 'R' },
    faction: { santuario: 'do Santuário', submundo: 'do Submundo', asgard: 'de Asgard', atlantida: 'de Atlântida' },
    cls: { lutador: 'lutador', mago: 'mago', arqueiro: 'arqueiro', tanque: 'tanque', suporte: 'suporte' },
    pos: { frente: 'linha de frente', meio: 'linha do meio', tras: 'linha de trás' },
    dmg: { fisico: 'dano físico', mental: 'dano psíquico' },
    caps: {
      sustain: 'sustentar a equipe com cura', shield: 'proteger aliados com escudos',
      control: 'controlar inimigos', buff: 'fortalecer aliados', debuff: 'enfraquecer os adversários',
      dot: 'aplicar dano contínuo', summon: 'invocar criaturas', immune: 'conceder imunidades'
    },
    tpl: (h, f) => `${h.name} é um ${f.cls} ${f.rarity} ${f.faction}, atuando na ${f.pos} com foco em ${f.dmg}.` +
      (f.skillNames.length ? ` Seu arsenal inclui ${f.skillNames.join(', ')}.` : '') +
      (f.capList.length ? ` Em combate, destaca-se por ${joinNat(f.capList, ' e ')}.` : '')
  },
  en: {
    rarity: { ur: 'legendary UR', ssr: 'SSR', sr: 'SR', r: 'R' },
    faction: { santuario: 'of the Sanctuary', submundo: 'of the Underworld', asgard: 'of Asgard', atlantida: 'of Atlantis' },
    cls: { lutador: 'fighter', mago: 'mage', arqueiro: 'archer', tanque: 'tank', suporte: 'support' },
    pos: { frente: 'front line', meio: 'middle line', tras: 'back line' },
    dmg: { fisico: 'physical damage', mental: 'psychic damage' },
    caps: {
      sustain: 'sustaining the team with healing', shield: 'protecting allies with shields',
      control: 'controlling enemies', buff: 'empowering allies', debuff: 'weakening opponents',
      dot: 'applying damage over time', summon: 'summoning creatures', immune: 'granting immunities'
    },
    tpl: (h, f) => `${h.name_en || h.name} is a ${f.rarity} ${f.cls} ${f.faction}, fighting on the ${f.pos} with a focus on ${f.dmg}.` +
      (f.skillNames.length ? ` Their arsenal includes ${f.skillNames.join(', ')}.` : '') +
      (f.capList.length ? ` In battle, they stand out for ${joinNat(f.capList, ' and ')}.` : '')
  },
  es: {
    rarity: { ur: 'legendario UR', ssr: 'SSR', sr: 'SR', r: 'R' },
    faction: { santuario: 'del Santuario', submundo: 'del Inframundo', asgard: 'de Asgard', atlantida: 'de la Atlántida' },
    cls: { lutador: 'luchador', mago: 'mago', arqueiro: 'arquero', tanque: 'tanque', suporte: 'soporte' },
    pos: { frente: 'línea frontal', meio: 'línea media', tras: 'línea trasera' },
    dmg: { fisico: 'daño físico', mental: 'daño psíquico' },
    caps: {
      sustain: 'sostener al equipo con curación', shield: 'proteger a los aliados con escudos',
      control: 'controlar a los enemigos', buff: 'fortalecer a los aliados', debuff: 'debilitar a los rivales',
      dot: 'aplicar daño continuo', summon: 'invocar criaturas', immune: 'conceder inmunidades'
    },
    tpl: (h, f) => `${h.name_es || h.name} es un ${f.cls} ${f.rarity} ${f.faction}, actuando en la ${f.pos} con foco en ${f.dmg}.` +
      (f.skillNames.length ? ` Su arsenal incluye ${f.skillNames.join(', ')}.` : '') +
      (f.capList.length ? ` En combate destaca por ${joinNat(f.capList, ' y ')}.` : '')
  }
};

// capacidades detectadas nas descrições em pt (fonte da verdade)
const CAPS = [
  ['sustain', /cura|restaura pv|roubo de vida|recupera .*vida|regenera/i],
  ['shield', /escudo|barreira/i],
  ['control', /atordoa|atordoamento|congela|congelamento|petrifica|imobiliza|silencia|provoca|empurra|puxa|reduz a velocidade|lentid/i],
  ['buff', /aumenta (o |a )?(atq|def|dano|velocidade|cr[ií]t|resist|ataque|defesa)|fortalece/i],
  ['debuff', /reduz (o |a )?(atq|def|dano|velocidade|cr[ií]t|resist|ataque|defesa|taxa|cura)/i],
  ['dot', /veneno|queimadura|sangramento|dano cont[ií]nuo|por segundo/i],
  ['summon', /invoca/i],
  ['immune', /imunidade|imune/i],
];

function factsFor(h, lang) {
  const d = L[lang];
  const skills = (h.skills || []);
  const nameKey = lang === 'pt' ? 'name' : `name_${lang}`;
  const skillNames = skills.slice(0, 3).map(s => s[nameKey] || s.name).filter(Boolean);
  const allDesc = skills.map(s => s.desc || '').join(' ');
  const caps = [];
  for (const [k, re] of CAPS) if (re.test(allDesc)) caps.push(k);
  const capList = caps.slice(0, 3).map(k => d.caps[k]);
  return {
    rarity: d.rarity[h.rarity] || h.rarity, faction: d.faction[h.faction] || '',
    cls: d.cls[h.class] || h.class, pos: d.pos[h.position] || h.position,
    dmg: d.dmg[h.damage] || h.damage, skillNames, capList
  };
}

const joinNat = (arr, conn) => arr.length <= 1 ? arr.join('') :
  arr.slice(0, -1).join(', ') + conn + arr[arr.length - 1];

const jsStr = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

let out = src;
let replaced = 0;
for (const h of HEROES) {
  const bios = {};
  for (const lang of ['pt', 'en', 'es']) bios[lang] = L[lang].tpl(h, factsFor(h, lang));
  // localiza o bloco do herói pelo id e troca o campo bio (e injeta bio_en/bio_es)
  const blockRe = new RegExp(
    `(\\{\\s*id:\\s*${h.id},[\\s\\S]{0,900}?)bio:\\s*'(?:[^'\\\\]|\\\\.)*'` +
    `(?:,\\s*bio_en:\\s*'(?:[^'\\\\]|\\\\.)*')?(?:,\\s*bio_es:\\s*'(?:[^'\\\\]|\\\\.)*')?`);
  const m = out.match(blockRe);
  if (!m) { console.error(`AVISO: bio não encontrada para id ${h.id} (${h.name})`); continue; }
  out = out.replace(blockRe,
    `$1bio: ${jsStr(bios.pt)}, bio_en: ${jsStr(bios.en)}, bio_es: ${jsStr(bios.es)}`);
  replaced++;
}
fs.writeFileSync(FILE, out);
console.log(`bios geradas para ${replaced}/${HEROES.length} heróis (pt/en/es)`);
