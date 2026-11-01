/* Roadbook · build. Gera ficheiros HTML únicos (todo o CSS, JS, fontes e imagens dentro).
   Saídas: build/out/navigator-template.html (modelo com marcadores) e dist/roadbook-studio.html.
   Uso: node build/build.js            (M1: node build/build.js --empty gera também build/out/empty.html) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out'), DIST = path.join(ROOT, 'dist');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(DIST, { recursive: true });

function fontFace(family, pkg, file, weight) {
  const b = fs.readFileSync(path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file)).toString('base64');
  return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b}) format("woff2")}`;
}
const NAV_FONTS = [
  fontFace('Overpass', 'overpass', 'overpass-latin-600-normal.woff2', 600),
  fontFace('Overpass', 'overpass', 'overpass-latin-800-normal.woff2', 800),
  fontFace('Atkinson Hyperlegible', 'atkinson-hyperlegible', 'atkinson-hyperlegible-latin-400-normal.woff2', 400),
  fontFace('Atkinson Hyperlegible', 'atkinson-hyperlegible', 'atkinson-hyperlegible-latin-700-normal.woff2', 700),
  fontFace('Overpass Mono', 'overpass-mono', 'overpass-mono-latin-500-normal.woff2', 500),
  fontFace('Overpass Mono', 'overpass-mono', 'overpass-mono-latin-600-normal.woff2', 600),
  fontFace('Tomorrow', 'tomorrow', 'tomorrow-latin-600-normal.woff2', 600)
].join('\n');
const STUDIO_FONTS = [
  fontFace('Tomorrow', 'tomorrow', 'tomorrow-latin-500-normal.woff2', 500),
  fontFace('Tomorrow', 'tomorrow', 'tomorrow-latin-600-normal.woff2', 600),
  fontFace('Atkinson Hyperlegible', 'atkinson-hyperlegible', 'atkinson-hyperlegible-latin-400-normal.woff2', 400),
  fontFace('Atkinson Hyperlegible', 'atkinson-hyperlegible', 'atkinson-hyperlegible-latin-700-normal.woff2', 700),
  fontFace('Overpass Mono', 'overpass-mono', 'overpass-mono-latin-500-normal.woff2', 500)
].join('\n');

/* insere texto sem interpretar padrões de substituição */
const put = (s, mark, val) => { if (s.indexOf(mark) < 0) throw new Error('marcador em falta: ' + mark); return s.split(mark).join(val); };
const noScriptEnd = (js, where) => { if (/<\/script/i.test(js)) throw new Error('"</script" dentro de ' + where); return js; };

function navigatorTemplate() {
  let t = rd('src/navigator/navigator.html');
  t = put(t, '/*@@FONTS@@*/', NAV_FONTS);
  t = put(t, '/*@@GUIDE_CSS@@*/', rd('src/navigator/v3-guide.css'));
  t = put(t, '/*@@V3D_CSS@@*/', rd('src/navigator/v3-3d.css'));
  t = put(t, '<!--@@V3D_HTML@@-->', rd('src/navigator/v3-3d.html'));
  t = put(t, '<!--@@VENDOR@@-->', rd('src/navigator/vendor/three-r128-bundle.html'));
  t = put(t, '/*@@ENGINE@@*/', noScriptEnd(rd('src/navigator/engine3d.js'), 'engine3d.js'));
  t = put(t, '/*@@GUIDE_JS@@*/', noScriptEnd(rd('src/navigator/guide.js'), 'guide.js'));
  return t;
}

const SHARED = ['geo.js', 'tracks.js', 'exif.js', 'brand.js', 'draft.js', 'project.js', 'navbuild.js'];
function studio(navTpl) {
  let s = rd('src/studio/studio.html');
  s = put(s, '/*@@FONTS@@*/', STUDIO_FONTS);
  s = put(s, '/*@@STUDIO_CSS@@*/', rd('src/studio/studio.css'));
  const shared = SHARED.map(f => `/* ---- src/shared/${f} ---- */\n` + noScriptEnd(rd('src/shared/' + f), f)).join('\n');
  s = put(s, '/*@@SHARED_JS@@*/', shared);
  /* o modelo do Navigator vai como string JSON; "</" fica escapado para não fechar o <script> do Studio */
  s = put(s, '/*@@NAV_TEMPLATE@@*/', 'window.RB_NAV_TEMPLATE=' + JSON.stringify(navTpl).replace(/<\//g, '<\\/').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';');
  s = put(s, '/*@@STUDIO_JS@@*/', noScriptEnd(rd('src/studio/studio.js'), 'studio.js'));
  return s;
}

if (process.argv.includes('--empty')) {
  fs.writeFileSync(path.join(OUT, 'empty.html'), '<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>Roadbook</title></head><body></body></html>\n');
}
const nav = navigatorTemplate();
fs.writeFileSync(path.join(OUT, 'navigator-template.html'), nav);
if (fs.existsSync(path.join(ROOT, 'src/studio/studio.html'))) {
  const st = studio(nav);
  fs.writeFileSync(path.join(DIST, 'roadbook-studio.html'), st);
  console.log('dist/roadbook-studio.html', (st.length / 1048576).toFixed(2), 'MB');
}
console.log('build/out/navigator-template.html', (nav.length / 1048576).toFixed(2), 'MB');
module.exports = { navigatorTemplate };
