/* Converte docs/guia-de-captacao.md em docs/guia-de-captacao.pdf (A4) e verifica que tem uma só página (AC10). */
'use strict';
const fs = require('fs'), path = require('path'), { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..'), MD = path.join(ROOT, 'docs', 'guia-de-captacao.md'), PDF = path.join(ROOT, 'docs', 'guia-de-captacao.pdf');
const font = (pkg, file) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file)).toString('base64');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
function md2html(md) {
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of md.split('\n')) {
    let m;
    if ((m = /^# (.+)/.exec(line))) { close(); out.push(`<h1>${inline(m[1])}</h1>`); }
    else if ((m = /^## (.+)/.exec(line))) { close(); out.push(`<h2>${inline(m[1])}</h2>`); }
    else if ((m = /^- (.+)/.exec(line))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = /^\d+\. (.+)/.exec(line))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (line.trim()) { close(); out.push(`<p>${inline(line)}</p>`); }
    else close();
  }
  close(); return out.join('\n');
}
(async () => {
  const html = `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><style>
@font-face{font-family:Tomorrow;font-weight:600;src:url(${font('tomorrow', 'tomorrow-latin-600-normal.woff2')})}
@font-face{font-family:Atkinson;font-weight:400;src:url(${font('atkinson-hyperlegible', 'atkinson-hyperlegible-latin-400-normal.woff2')})}
@font-face{font-family:Atkinson;font-weight:700;src:url(${font('atkinson-hyperlegible', 'atkinson-hyperlegible-latin-700-normal.woff2')})}
@page{size:A4;margin:13mm 15mm}
body{font-family:Atkinson,Arial,sans-serif;font-size:10.4pt;line-height:1.36;color:#1b1f1c;margin:0}
h1{font-family:Tomorrow,Arial,sans-serif;font-weight:600;font-size:17pt;margin:0 0 6px;color:#2D5F3F;border-bottom:3px solid #D4AF37;padding-bottom:5px}
h2{font-family:Tomorrow,Arial,sans-serif;font-weight:600;font-size:12pt;margin:10px 0 3px;color:#2D5F3F}
p{margin:3px 0} ul,ol{margin:3px 0;padding-left:18px} li{margin:1.5px 0} strong{color:#111}
p:last-child{margin-top:10px;font-size:9.5pt;color:#5a635d}
</style></head><body>${md2html(fs.readFileSync(MD, 'utf8'))}</body></html>`;
  const b = await chromium.launch(), p = await b.newPage();
  await p.setContent(html, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: PDF, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await b.close();
  const pages = (fs.readFileSync(PDF, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log('docs/guia-de-captacao.pdf', pages, 'página(s)');
  if (pages !== 1) { console.error('AC10 falhou: o guia não cabe numa página A4'); process.exit(1); }
})();
