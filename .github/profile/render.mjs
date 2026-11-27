#!/usr/bin/env node
// Gera as imagens do README de perfil. Só usa Node 18+, sem dependências.
//
//   node .github/profile/render.mjs estatico            cabeçalho, mapa da stack e botões em assets/
//   node .github/profile/render.mjs atividade [pasta]   gráfico de atividade em pasta/ (padrão: dist/)
//
// "atividade" lê o calendário de contribuições pela API GraphQL do GitHub e precisa
// de GITHUB_TOKEN no ambiente; o login vem de PROFILE_LOGIN (padrão: GuilhermeLouback).
// A Action .github/workflows/perfil.yml roda isso duas vezes por dia e publica o
// resultado no branch "output".
//
// Cada imagem sai em dois temas (escuro, claro) e duas larguras. A larga é desenhada
// com 1200 de largura e aparece com no máximo 846 px, a largura do README em telas
// de 1280 px ou mais; os textos dela têm pelo menos 17 para ficar com 12 px na tela.
// A "celular" é desenhada com 600 e serve a qualquer coluna estreita (celular,
// tablet, janela pequena); no celular ela aparece com uns 300 px, daí textos de 21+.
// No README, o tema é escolhido pelo sufixo #gh-dark-mode-only / #gh-light-mode-only
// no link em volta da imagem (o CSS do GitHub esconde o outro, inclusive com tema
// fixo nas configurações) e a largura por <source media="(max-width: ...)">.
// O media olha a tela, não o README, e o GitHub estreita o README quando põe a
// barra lateral ao lado. Largura do README medida em github.com: tela − 82 px até
// 767 px de tela, tela − 370 de 768 a 1011, tela − 434 de 1012 a 1279, 846 daí em
// diante. Por isso o mapa e o gráfico trocam de versão em 1193 px de tela (README
// abaixo de 760) e aparecem sem width, no tamanho natural limitado ao README; o
// cabeçalho e os botões, que não têm texto miúdo, trocam em 600 px.
// Não use (prefers-color-scheme) no <source>: com tema fixo, o componente
// themed-picture do GitHub troca o media inteiro e a condição de largura se perde.
// Os textos viram contornos a partir de
// glyphs.json (gerado por glyphs.py), porque SVG aberto por <img> não carrega fontes.
// Para mudar o mapa, edite LINES e ZONES e rode "estatico" de novo.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const { fonts: FONTS } = JSON.parse(readFileSync(join(HERE, 'glyphs.json'), 'utf8'));

// ------------------------------------------------------------------ conteúdo

// Linhas do mapa, de cima para baixo. Nessa ordem, ficam vizinhas as linhas
// que mais dividem tecnologia.
const LINES = [
  { id: 'W', name: 'Wolfpack' },
  { id: 'H', name: 'HiveZapp' },
  { id: 'S', name: 'Sob medida' },
];

// Paradas por camada: [rótulo, linhas que param ali].
const ZONES = [
  ['Interface', [['React', 'WHS'], ['Electron + C++', 'W'], ['PWA', 'HS']]],
  ['Tempo real', [['Socket.IO', 'H'], ['Laravel Reverb', 'W'], ['LiveKit (WebRTC)', 'W']]],
  ['Back-end', [['Node.js + Express', 'H'], ['Laravel', 'WS'], ['Stripe', 'WH']]],
  ['IA e integrações', [
    ['WhatsApp (Evolution API)', 'H'], ['OpenAI, Gemini, Claude', 'HS'], ['RAG local', 'H'],
    ['n8n', 'S'], ['Power BI Embedded', 'S'],
  ]],
  ['Dados', [['MySQL', 'WHS'], ['Redis', 'WH']]],
  ['Entrega', [['GitHub Actions', 'WHS'], ['Cloudflare Tunnel', 'H'], ['PM2', 'H'], ['Nginx', 'WHS']]],
];

const THEMES = {
  escuro: {
    bg: '#0d1117', ink: '#eef1f4', dim: '#9aa4b1', faint: '#6b7480', rule: '#2b323c',
    W: '#ff7a59', H: '#c2f23c', S: '#35d0bf', bar: '#c2f23c',
  },
  claro: {
    bg: '#ffffff', ink: '#0a0b0e', dim: '#4c5563', faint: '#8b939e', rule: '#d6dbe1',
    W: '#e2532c', H: '#86ad16', S: '#0f9484', bar: '#7a9a0e',
  },
};
const LIME = '#c2f23c'; // o verde-limão do gloubapp.com
const NIGHT = '#0a0b0e'; // texto sobre as cores das linhas

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ---------------------------------------------------------------- tipografia

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v, digits = 2) => {
  const s = Number(v).toFixed(digits);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};

class Svg {
  constructor(width, height, title) {
    Object.assign(this, { width, height, title, css: '' });
    this.glyphs = new Map();
    this.parts = [];
  }

  add(...parts) {
    this.parts.push(...parts);
  }

  glyph(font, char) {
    const id = `${font[0]}${char.codePointAt(0).toString(36)}`;
    if (!this.glyphs.has(id)) this.glyphs.set(id, FONTS[font].glyphs[char][1]);
    return id;
  }

  toString() {
    const defs = [...this.glyphs].map(([id, d]) => `<path id="${id}" d="${d}"/>`).join('');
    const style = this.css ? `<style>${this.css}</style>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" `
      + `viewBox="0 0 ${this.width} ${this.height}" role="img" aria-label="${esc(this.title)}">`
      + `<title>${esc(this.title)}</title>${style}<defs>${defs}</defs>${this.parts.join('')}</svg>\n`;
  }
}

const known = (font, char) => (FONTS[font].glyphs[char] ? char : '?');

function measure(font, str, size, tracking = 0) {
  const f = FONTS[font];
  const chars = [...str].map((c) => known(font, c));
  let units = 0;
  chars.forEach((char, i) => {
    units += (i ? f.kern[chars[i - 1] + char] ?? 0 : 0) + f.glyphs[char][0];
    if (i < chars.length - 1) units += tracking * f.upm;
  });
  return (units * size) / f.upm;
}

// Altura para somar à linha de base e centralizar as maiúsculas num ponto.
const capCenter = (font, size) => (FONTS[font].cap * size) / FONTS[font].upm / 2;

function text(svg, font, str, size, x, y, { fill, anchor = 'start', tracking = 0, rotate = 0 } = {}) {
  const f = FONTS[font];
  const scale = size / f.upm;
  const width = measure(font, str, size, tracking);
  let cursor = (anchor === 'middle' ? -width / 2 : anchor === 'end' ? -width : 0) / scale;
  let prev = '';
  const uses = [];
  for (const raw of str) {
    const char = known(font, raw);
    cursor += f.kern[prev + char] ?? 0;
    const [advance, d] = f.glyphs[char];
    if (d) uses.push(`<use href="#${svg.glyph(font, char)}" x="${Math.round(cursor)}"/>`);
    cursor += advance + tracking * f.upm;
    prev = char;
  }
  const turn = rotate ? ` rotate(${rotate})` : '';
  svg.add(`<g fill="${fill}" transform="translate(${num(x)} ${num(y)})${turn} scale(${num(scale, 5)} ${num(-scale, 5)})">${uses.join('')}</g>`);
  return width;
}

// ----------------------------------------------------------------- cabeçalho

function cabecalho(t, celular) {
  const W = celular ? 600 : 1200;
  const words = celular ? ['Guilherme', 'Louback'] : ['Guilherme Louback'];
  const tracking = -0.03;
  const widest = Math.max(...words.map((w) => measure('display', w, 1, tracking)));
  const size = Math.floor(Math.min(celular ? 124 : 132, (celular ? 566 : 1090) / widest));
  const lead = Math.round(size * 0.9);
  const first = Math.round(size * 0.94);

  // Três linhas, uma por projeto, correm sob o nome e descem pela direita,
  // como se continuassem pela página. Um trem percorre a do HiveZapp.
  const gap = 24;
  const stroke = 12;
  const inner = 20;
  const y0 = first + (words.length - 1) * lead + (celular ? 70 : 84);
  const ys = LINES.map((_, i) => y0 + i * gap);
  const cy = ys.at(-1) + inner;
  const H = cy + 58;
  const cx = W - stroke / 2 - 4 - (cy - ys[0]);
  const route = (y, startX, endY) => {
    const r = cy - y;
    return `M${startX} ${y} H${cx} A${r} ${r} 0 0 1 ${cx + r} ${cy} V${endY}`;
  };

  const svg = new Svg(W, H, 'Guilherme Louback');
  svg.css = '@media (prefers-reduced-motion: reduce){.trem{display:none}}';
  words.forEach((w, i) => text(svg, 'display', w, size, 0, first + i * lead, { fill: t.ink, tracking }));
  LINES.forEach((line, i) => {
    svg.add(`<path d="${route(ys[i], stroke / 2, H + stroke)}" fill="none" stroke="${t[line.id]}" stroke-width="${stroke}" stroke-linecap="round"/>`);
  });
  const hive = LINES.findIndex((l) => l.id === 'H');
  svg.add(
    `<g class="trem"><rect x="-22" y="-3" width="44" height="6" rx="3" fill="${NIGHT}"/>`
    + `<animateMotion dur="11s" repeatCount="indefinite" rotate="auto" calcMode="linear" keyPoints="0;1;1" keyTimes="0;0.7;1" `
    + `path="${route(ys[hive], -60, H + 60)}"/></g>`,
  );
  return svg;
}

// ----------------------------------------------------------- mapa da stack

function layout(start, step, zoneGap) {
  const stations = [];
  const zones = [];
  let pos = start;
  ZONES.forEach(([name, list], zi) => {
    if (zi) pos += zoneGap;
    const from = pos;
    list.forEach(([label, lines], si) => {
      if (si) pos += step;
      stations.push({ label, lines: [...lines], pos });
    });
    zones.push({ name, from, to: pos });
    pos += step;
  });
  return { stations, zones };
}

const MAP_TITLE = 'Mapa da stack: cada linha é um projeto (Wolfpack, HiveZapp e sistemas sob medida) e cada parada é uma tecnologia usada nele';

function mapaDesktop(t) {
  const W = 1200;
  const stroke = 14;
  const labelSize = 21;
  const nameSize = 18;
  const { stations, zones } = layout(200, 40, 26);
  // Os rótulos sobem a 45° a partir de 22 px acima da primeira linha: o mais longo
  // decide se ela precisa descer.
  const rise = Math.max(...stations.map((s) => measure('text', s.label, labelSize))) * Math.SQRT1_2;
  const top = Math.max(222, Math.ceil(rise + 22 + 18));
  const track = { W: top, H: top + 40, S: top + 80 };
  const by = track.S + stroke / 2 + 24;
  const H = by + 27 + 24;
  const end = stations.at(-1).pos + 64;
  const badge = Math.ceil(Math.max(...LINES.map((l) => measure('bold', l.name, nameSize))) + 32);
  const svg = new Svg(W, H, MAP_TITLE);

  // Ligações finas atrás das linhas: a linha que não para ali passa por cima.
  for (const s of stations) {
    if (s.lines.length < 2) continue;
    const ys = s.lines.map((id) => track[id]);
    svg.add(`<path d="M${s.pos} ${Math.min(...ys)} V${Math.max(...ys)}" stroke="${t.ink}" stroke-width="4"/>`);
  }
  for (const line of LINES) {
    svg.add(`<path d="M${badge / 2} ${track[line.id]} H${end}" stroke="${t[line.id]}" stroke-width="${stroke}" stroke-linecap="round"/>`);
  }
  // Parada de um projeto só: traço. Compartilhada: círculo em cada linha.
  for (const s of stations) {
    if (s.lines.length === 1) {
      const id = s.lines[0];
      svg.add(`<rect x="${s.pos - 3}" y="${track[id] - stroke / 2 - 8}" width="6" height="${8 + stroke / 2}" fill="${t[id]}"/>`);
    } else {
      for (const id of s.lines) {
        svg.add(`<circle cx="${s.pos}" cy="${track[id]}" r="9" fill="${t.bg}" stroke="${t.ink}" stroke-width="3.5"/>`);
      }
    }
  }
  for (const s of stations) {
    text(svg, 'text', s.label, labelSize, s.pos - 3, track.W - stroke / 2 - 15, { fill: t.ink, rotate: -45 });
  }
  for (const line of LINES) {
    const y = track[line.id];
    svg.add(`<rect x="0" y="${y - 17}" width="${badge}" height="34" rx="17" fill="${t[line.id]}"/>`);
    text(svg, 'bold', line.name, nameSize, badge / 2, y + capCenter('bold', nameSize), { fill: NIGHT, anchor: 'middle' });
  }
  for (const z of zones) {
    svg.add(`<path d="M${z.from - 12} ${by - 7} V${by} H${z.to + 12} V${by - 7}" fill="none" stroke="${t.faint}" stroke-width="1.5"/>`);
    text(svg, 'bold', z.name, nameSize, (z.from + z.to) / 2, by + 27, { fill: t.dim, anchor: 'middle' });
  }
  return svg;
}

function mapaCelular(t) {
  const W = 600;
  const stroke = 12;
  const track = { W: 40, H: 76, S: 112 };
  const labelX = 156;
  const { stations, zones } = layout(232, 50, 80);
  const H = stations.at(-1).pos + 56;
  const svg = new Svg(W, H, MAP_TITLE);

  LINES.forEach((line, i) => {
    const y = 40 + i * 42;
    svg.add(`<rect x="${labelX}" y="${y - 7}" width="34" height="14" rx="7" fill="${t[line.id]}"/>`);
    text(svg, 'bold', line.name, 23, labelX + 48, y + capCenter('bold', 23), { fill: t.ink });
  });
  for (const s of stations) {
    if (s.lines.length < 2) continue;
    const xs = s.lines.map((id) => track[id]);
    svg.add(`<path d="M${Math.min(...xs)} ${s.pos} H${Math.max(...xs)}" stroke="${t.ink}" stroke-width="4"/>`);
  }
  for (const line of LINES) {
    svg.add(`<path d="M${track[line.id]} 26 V${H - 20}" stroke="${t[line.id]}" stroke-width="${stroke}" stroke-linecap="round"/>`);
  }
  for (const s of stations) {
    if (s.lines.length === 1) {
      const id = s.lines[0];
      svg.add(`<rect x="${track[id]}" y="${s.pos - 3}" width="${stroke / 2 + 9}" height="6" fill="${t[id]}"/>`);
    } else {
      for (const id of s.lines) {
        svg.add(`<circle cx="${track[id]}" cy="${s.pos}" r="10" fill="${t.bg}" stroke="${t.ink}" stroke-width="3.5"/>`);
      }
    }
    text(svg, 'text', s.label, 23, labelX, s.pos + capCenter('text', 23), { fill: t.ink });
  }
  for (const z of zones) {
    text(svg, 'bold', z.name, 22, labelX, z.from - 36, { fill: t.dim });
  }
  return svg;
}

// ------------------------------------------------------------------- botões

// Os botões têm um tema só, legível nos dois: o link de e-mail não pode levar o
// sufixo #gh-*-mode-only que o README usa para trocar de tema. A versão celular,
// menor, deixa os três numa linha a partir de 360 px de tela (README de 278).
function botao(label, primario, celular) {
  const size = celular ? 14 : 16;
  const h = celular ? 36 : 40;
  const w = Math.ceil(measure('bold', label, size) + (celular ? 24 : 36));
  const svg = new Svg(w, h, label);
  const baseline = h / 2 + capCenter('bold', size);
  if (primario) {
    svg.add(`<rect width="${w}" height="${h}" rx="${h / 2}" fill="${LIME}"/>`);
    text(svg, 'bold', label, size, w / 2, baseline, { fill: NIGHT, anchor: 'middle' });
  } else {
    svg.add(`<rect x="0.75" y="0.75" width="${w - 1.5}" height="${h - 1.5}" rx="${(h - 1.5) / 2}" fill="${NIGHT}" stroke="#3d444d" stroke-width="1.5"/>`);
    text(svg, 'bold', label, size, w / 2, baseline, { fill: THEMES.escuro.ink, anchor: 'middle' });
  }
  return svg;
}

// ---------------------------------------------------------------- atividade

async function graphql(token, query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-readme-render' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL respondeu HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors) throw new Error(`GraphQL: ${body.errors.map((e) => e.message).join('; ')}`);
  return body.data;
}

const DAYS = 'weeks{contributionDays{date contributionCount}}';

async function lerAtividade(login, token) {
  const base = await graphql(token, `query($login:String!){user(login:$login){createdAt contributionsCollection{contributionCalendar{totalContributions ${DAYS}}}}}`, { login });
  if (!base.user) throw new Error(`usuário ${login} não encontrado`);
  const created = new Date(base.user.createdAt);
  const now = new Date();

  // A API devolve no máximo um ano por consulta: um apelido por ano desde a criação da conta.
  const years = [];
  for (let y = created.getUTCFullYear(); y <= now.getUTCFullYear(); y += 1) years.push(y);
  const fields = years.map((y) => {
    const from = y === created.getUTCFullYear() ? created.toISOString() : `${y}-01-01T00:00:00Z`;
    const to = y === now.getUTCFullYear() ? now.toISOString() : `${y}-12-31T23:59:59Z`;
    return `y${y}:contributionsCollection(from:"${from}",to:"${to}"){contributionCalendar{${DAYS}}}`;
  });
  const history = await graphql(token, `query($login:String!){user(login:$login){${fields.join(' ')}}}`, { login });
  const daily = new Map();
  for (const y of years) {
    for (const week of history.user[`y${y}`].contributionCalendar.weeks) {
      for (const d of week.contributionDays) daily.set(d.date, d.contributionCount);
    }
  }
  const dates = [...daily.keys()].sort();
  let longest = 0;
  let run = 0;
  for (const date of dates) {
    run = daily.get(date) > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  const calendar = base.user.contributionsCollection.contributionCalendar;
  const weeks = calendar.weeks.map((w) => ({
    days: w.contributionDays,
    total: w.contributionDays.reduce((sum, d) => sum + d.contributionCount, 0),
  }));
  const activeDays = weeks.flatMap((w) => w.days).filter((d) => d.contributionCount > 0).length;
  return { total: calendar.totalContributions, weeks, activeDays, longest, updated: now };
}

const fmt = (v) => new Intl.NumberFormat('pt-BR').format(v);
const dateBR = (d) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(d);

function barPath(x, y, w, h, r) {
  const k = Math.min(r, w / 2, h);
  return `M${num(x)} ${num(y + h)}V${num(y + k)}Q${num(x)} ${num(y)} ${num(x + k)} ${num(y)}H${num(x + w - k)}Q${num(x + w)} ${num(y)} ${num(x + w)} ${num(y + k)}V${num(y + h)}Z`;
}

function atividade(t, celular, a) {
  const W = celular ? 600 : 1200;
  const H = celular ? 500 : 300;
  const svg = new Svg(W, H, `Atividade no GitHub: ${fmt(a.total)} contribuições nos últimos 12 meses`);
  const s = celular
    ? { big: 104, bigY: 104, sub: 24, subY: 146, stat: 34, statY: 220, statSub: 22, statGap: 270, date: 21, area: { x: 0, w: 600, base: 446, h: 150 }, month: 21, maxLabel: 22 }
    : { big: 104, bigY: 108, sub: 21, subY: 148, stat: 30, statY: 212, statSub: 18, statGap: 210, date: 17, area: { x: 420, w: 780, base: 250, h: 190 }, month: 17, maxLabel: 18 };

  text(svg, 'display', fmt(a.total), s.big, 0, s.bigY, { fill: t.ink });
  text(svg, 'text', 'contribuições nos últimos 12 meses', s.sub, 0, s.subY, { fill: t.dim });
  const stats = [
    [fmt(a.activeDays), 'dias com atividade'],
    [`${fmt(a.longest)} ${a.longest === 1 ? 'dia' : 'dias'}`, 'maior sequência'],
  ];
  stats.forEach(([value, label], i) => {
    text(svg, 'bold', value, s.stat, i * s.statGap, s.statY, { fill: t.ink });
    text(svg, 'text', label, s.statSub, i * s.statGap, s.statY + s.statSub + 9, { fill: t.dim });
  });
  text(svg, 'text', `atualizado em ${dateBR(a.updated)}`, s.date, W, s.date + 4, { fill: t.faint, anchor: 'end' });

  const { area } = s;
  const col = area.w / a.weeks.length;
  const barW = Math.max(4, Math.round(col * 0.64));
  const max = Math.max(1, ...a.weeks.map((w) => w.total));
  const peak = a.weeks.findIndex((w) => w.total === max);
  svg.add(`<path d="M${area.x} ${area.base + 0.5}H${area.x + area.w}" stroke="${t.rule}"/>`);
  a.weeks.forEach((w, i) => {
    if (!w.total) return;
    const h = Math.max(3, Math.round((area.h * w.total) / max));
    const x = area.x + i * col + (col - barW) / 2;
    svg.add(`<path d="${barPath(x, area.base - h, barW, h, 3)}" fill="${t.bar}"/>`);
    if (i === peak) {
      const cx = Math.min(area.x + area.w - 20, Math.max(area.x + 20, x + barW / 2));
      text(svg, 'bold', fmt(w.total), s.maxLabel, cx, area.base - h - 10, { fill: t.ink, anchor: 'middle' });
    }
  });
  let lastX = -Infinity;
  a.weeks.forEach((w, i) => {
    const first = w.days.find((d) => d.date.endsWith('-01'));
    const x = area.x + i * col + (col - barW) / 2;
    if (!first || x - lastX < (celular ? 46 : 50) || x > area.x + area.w - 30) return;
    text(svg, 'text', MONTHS[Number(first.date.slice(5, 7)) - 1], s.month, x, area.base + s.month + 10, { fill: t.faint });
    lastX = x;
  });
  return svg;
}

// --------------------------------------------------------------------- saída

function save(dir, file, svg) {
  mkdirSync(dir, { recursive: true });
  const body = String(svg);
  writeFileSync(join(dir, file), body);
  console.log(`${join(dir, file)}  ${(body.length / 1024).toFixed(1)} KB`);
}

const [mode = 'estatico', outArg] = process.argv.slice(2);

if (mode === 'estatico') {
  const dir = join(ROOT, 'assets');
  for (const [name, t] of Object.entries(THEMES)) {
    save(dir, `cabecalho-${name}.svg`, cabecalho(t, false));
    save(dir, `cabecalho-${name}-celular.svg`, cabecalho(t, true));
    save(dir, `mapa-${name}.svg`, mapaDesktop(t));
    save(dir, `mapa-${name}-celular.svg`, mapaCelular(t));
  }
  for (const [file, label, primario] of [['site', 'gloubapp.com', true], ['linkedin', 'LinkedIn', false], ['email', 'E-mail', false]]) {
    save(dir, `botao-${file}.svg`, botao(label, primario, false));
    save(dir, `botao-${file}-celular.svg`, botao(label, primario, true));
  }
} else if (mode === 'atividade') {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('Defina GITHUB_TOKEN para ler o calendário de contribuições.');
    process.exit(1);
  }
  const login = process.env.PROFILE_LOGIN || 'GuilhermeLouback';
  const dir = outArg ? resolve(outArg) : join(ROOT, 'dist');
  const data = await lerAtividade(login, token);
  for (const [name, t] of Object.entries(THEMES)) {
    save(dir, `atividade-${name}.svg`, atividade(t, false, data));
    save(dir, `atividade-${name}-celular.svg`, atividade(t, true, data));
  }
  console.log(`${login}: ${data.total} contribuições em 12 meses, ${data.activeDays} dias ativos, maior sequência ${data.longest}`);
} else {
  console.error('Uso: node .github/profile/render.mjs estatico | atividade [pasta]');
  process.exit(1);
}
