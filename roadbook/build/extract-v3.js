/* Extracção única do "Chegar à Meraki" v3 (sources/, só leitura) para src/navigator/.
   Guarda: three.js r128 + extras (sem alterações), o motor 3D "Rota em Relevo v6" integrado (com os textos Meraki
   parametrizados por window.RB), o CSS e a marcação do guia e do 3D. Corre-se com: node build/extract-v3.js */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'sources', 'chegar-a-meraki-v3.html'), OUT = path.join(ROOT, 'src', 'navigator');
const L = fs.readFileSync(SRC, 'utf8').split('\n');
const lines = (a, b) => L.slice(a - 1, b).join('\n');           /* 1-based, inclusivo */
const find = (re, from = 1) => { for (let i = from - 1; i < L.length; i++) if (re.test(L[i])) return i + 1; throw new Error('não encontrado: ' + re); };

/* 1. bibliotecas: do primeiro <script> até ao </script> antes do motor (linha "window.start3D") */
const libA = find(/^<script>$/), engStart = find(/^window\.start3D=function\(\)\{/);
const libB = engStart - 2; /* "</script>" antes do "<script>" do motor */
const libs = lines(libA, libB);
if (!/const e="128"/.test(libs)) throw new Error('three r128 não encontrado');
fs.writeFileSync(path.join(OUT, 'vendor', 'three-r128-bundle.html'), '<!-- three.js r128 (MIT) e extras, copiados sem alterações de sources/chegar-a-meraki-v3.html -->\n' + libs + '\n');

/* 2. motor 3D: corpo do <script> do motor */
const engEnd = find(/^<\/script>$/, engStart);
let eng = lines(engStart - 1, engEnd - 1).replace(/^<script>\n?/, '');
const subs = [
  [`'meraki-osm-v1:'`, `(window.RB.key+'-osm-v1:')`],
  [`localStorage.getItem('meraki-3d-help')`, `localStorage.getItem(window.RB.key+'-3d-help')`],
  [`localStorage.setItem('meraki-3d-help','1')`, `localStorage.setItem(window.RB.key+'-3d-help','1')`],
  [`showToast('Chegou à Meraki. ▶ recomeça.',true)`, `showToast('Chegou: '+window.RB.place+'. ▶ recomeça.',true)`],
  [`load(window.GUIDE_GPX,'Da estrada (Cirilu) à Meraki')`, `load(window.RB.gpx,'Da estrada até '+window.RB.place)`]
];
for (const [a, b] of subs) { if (!eng.includes(a)) throw new Error('motor: texto não encontrado: ' + a); eng = eng.split(a).join(b); }
if (/Meraki|Cirilu|meraki/.test(eng)) throw new Error('motor ainda tem texto Meraki');
fs.writeFileSync(path.join(OUT, 'engine3d.js'), '/* Motor "Rota em Relevo" v6, tal como integrado no "Chegar à Meraki" v3. Só os textos Meraki passaram a window.RB. */\n' + eng + '\n');

/* 3. CSS do guia e do 3D */
const s1 = find(/^<style>$/), s1e = find(/^<\/style>$/, s1), s2 = find(/^<style>$/, s1e), s2e = find(/^<\/style>$/, s2);
fs.writeFileSync(path.join(OUT, 'v3-guide.css'), lines(s1 + 1, s1e - 1) + '\n');
fs.writeFileSync(path.join(OUT, 'v3-3d.css'), lines(s2 + 1, s2e - 1) + '\n');
/* 4. marcação do 3D (entre o 2.º </style> e o primeiro <script>) */
let m3d = lines(s2e + 1, libA - 1);
m3d = m3d.replace('<b>Chegar à Meraki · 3D</b>', '<b data-rb="title3d">3D</b>')
         .replace('percorre a rota, da estrada no Cirilu até à Meraki.', 'percorre a rota, da estrada até <span data-rb="place"></span>.');
if (/Meraki|Cirilu/.test(m3d)) throw new Error('marcação 3D ainda tem texto Meraki');
fs.writeFileSync(path.join(OUT, 'v3-3d.html'), m3d + '\n');
console.log('ok: libs', libs.length, 'motor', eng.length, 'linhas', libA, libB, engStart, engEnd);
