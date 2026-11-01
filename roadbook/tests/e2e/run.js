/* Testes extremo a extremo (Playwright): fluxo do Studio, exportação, Navigator offline, GPS, marca, consola, 360 px.
   Gera os entregáveis E1–E3 em dist/. Uso: node tests/e2e/run.js [filtro] */
'use strict';
const fs = require('fs'), path = require('path');
const { test, run, openPage, assert } = require('./harness.js');
const ROOT = path.join(__dirname, '..', '..'), DIST = path.join(ROOT, 'dist'), OUT = path.join(ROOT, 'build', 'out');
const F = p => path.join(ROOT, 'tests', 'fixtures', p), SRC = p => path.join(ROOT, 'sources', p);
const STUDIO = 'file://' + path.join(DIST, 'roadbook-studio.html');
const X = require('../../src/shared/exif.js'), G = require('../../src/shared/geo.js'), B = require('../../src/shared/brand.js'), T = require('../../src/shared/tracks.js');
const M = require('../fixtures/meraki-v3.js');
const V4 = path.join(DIST, 'chegar-a-meraki-v4.html'), RBK = path.join(DIST, 'chegar-a-meraki.roadbook');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evidence = {};

async function studio(browser, opts = {}) {
  const o = await openPage(browser, STUDIO, { viewport: opts.viewport || { width: 1440, height: 900 }, colorScheme: opts.colorScheme, ctx: { offline: opts.offline !== false } });
  if (await o.page.isVisible('#tour')) await o.page.click('#tourSkip');
  return o;
}
const project = page => page.evaluate(() => JSON.parse(JSON.stringify(RBStudio.project)));
async function waitDraft(page) { await page.waitForFunction(() => RBStudio.project.points.length > 0, null, { timeout: 15000 }); await sleep(300); }
async function waitPreview(page) { await page.waitForFunction(() => { const f = document.querySelector('#pv'); return f && f.srcdoc && f.srcdoc.length > 1000; }, null, { timeout: 15000 }); await sleep(800); }
async function save(page, buttonSel, dest) { const [dl] = await Promise.all([page.waitForEvent('download'), page.click(buttonSel)]); await dl.saveAs(dest); return dest; }
/* procura o índice de um ponto no projecto por critério */
const idxOf = (P, fn) => P.points.findIndex(fn);
async function pointAction(page, i, action) { await page.locator('#pointList > li').nth(i).locator(`[data-a="${action}"]`).click(); await sleep(150); }
async function setPointField(page, i, field, value) { const el = page.locator('#pointList > li').nth(i).locator(`[data-f="${field}"]`); await el.fill(String(value)); await el.dispatchEvent('change'); await sleep(60); }
function noHScroll(page) { return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 0.5); }
function jpegsIn(html) { return [...html.matchAll(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/g)].map(m => Buffer.from(m[1], 'base64')); }

/* ---------------------------------------------------------------- M1 */
test('M1 · o build gera HTML válido (vazio e Studio) e o Studio abre sem erros', async browser => {
  const e = await openPage(browser, 'file://' + path.join(OUT, 'empty.html')); assert(!e.errors.length, e.errors.join('\n')); await e.ctx.close();
  const s = await studio(browser); await sleep(500);
  assert(await s.page.isVisible('#drop'), 'zona de largar'); assert((await s.page.textContent('#privacy')).includes('Partilhe só com os convidados'), 'aviso R-S17');
  assert(!s.errors.length, s.errors.join('\n')); await s.ctx.close();
});

/* ---------------------------------------------------------------- M4 + E3 */
test('M4 · fluxo completo com o GPX Meraki no Studio, AC2 nas fotos, exportação E3 (v4, .roadbook, GPX)', async browser => {
  const { ctx, page, errors } = await studio(browser);
  const t0 = Date.now(); let actions = 0; const act = async f => { actions++; await f(); };
  /* 1. o André larga os ficheiros: GPX, logótipo e as 3 fotos originais (com hora) */
  await act(() => page.setInputFiles('#fFiles', [SRC('meraki-20261101-105849.gpx'), F('meraki-logo.svg'), F('meraki-cirilu-hora.jpg'), F('meraki-planalto-hora.jpg'), F('meraki-ruinas-hora.jpg')]));
  await waitDraft(page); await page.waitForFunction(() => RBStudio.project.photos.length === 3 && RBStudio.project.brand.logo, null, { timeout: 15000 });
  let P = await project(page);
  const draftPts = P.points.map(p => ({ km: p.km_a, kind: p.kind, confirm: p.confirm, title: p.title }));
  /* AC2: posições das fotos colocadas pela hora */
  const ac2 = M.photos.map(ph => { const f = P.photos.find(x => x.name.includes(ph.key)); return { key: ph.key, source: f.source, dist: Math.round(G.hav(f, ph.real)) }; });
  ac2.forEach(r => assert(r.source === 'hora' && r.dist <= 150, 'AC2 ' + r.key + ': ' + r.dist + ' m'));
  evidence.ac2 = ac2; evidence.draft = draftPts;
  /* 2. marca: nome, título, contacto, estrada, contraste */
  await act(() => page.fill('#iPlace', 'Meraki'));
  await act(() => page.fill('#iTitle', 'Chegar à Meraki'));
  await act(() => page.fill('#iPhone', '+244 900 000 000'));
  await act(() => page.fill('#iRoadL', 'Luanda')); await act(() => page.fill('#iRoadR', 'Caxito'));
  await sleep(300);
  if (await page.isVisible('#bSuggest')) await act(() => page.click('#bSuggest'));
  /* 3. pontos: apagar a curva extra do km 4,1, juntar as duas esquerdas das ruínas e juntar a descida à chegada */
  P = await project(page);
  let i = idxOf(P, p => p.kind === 'manobra' && Math.abs(p.km_a - 4.1) < 0.15); assert(i > 0, 'curva extra do km 4,1');
  await act(() => pointAction(page, i, 'del'));
  /* anular e voltar a apagar (R-S9: anular uma eliminação) */
  await act(() => page.click('#bUndo')); P = await project(page); assert(P.points.length === draftPts.length, 'anular repõe o ponto');
  i = idxOf(P, p => p.kind === 'manobra' && Math.abs(p.km_a - 4.1) < 0.15); await act(() => pointAction(page, i, 'del'));
  P = await project(page); i = idxOf(P, p => p.kind === 'manobra' && Math.abs(p.km_a - 5.67) < 0.15); await act(() => pointAction(page, i, 'join'));
  P = await project(page); i = idxOf(P, p => p.kind === 'descida'); await act(() => pointAction(page, i, 'join'));
  P = await project(page);
  assert(P.points.length === 8, 'esperados 8 pontos, há ' + P.points.length + ': ' + P.points.map(p => p.kind + p.km_a).join(' '));
  /* 4. textos aprovados do v3 (conteúdo de controlo) e confirmação dos pontos */
  for (let k = 0; k < 8; k++) {
    const s = M.steps[k];
    await setPointField(page, k, 'title', s.title); await setPointField(page, k, 'text', s.text);
    if (s.cap) await setPointField(page, k, 'caption', s.cap);
    await setPointField(page, k, 'km_a', s.a); await setPointField(page, k, 'km_b', s.b);
    await setPointField(page, k, 'trigger_km', M.trig[k]);
    actions += 3;
  }
  await page.click('summary'); await page.fill('#tWelcome', M.welcome); await page.fill('#tBefore', M.before); await page.fill('#tNotes', M.notes.join('\n')); actions += 3;
  P = await project(page);
  for (let k = 0; k < P.points.length; k++) if (P.points[k].confirm) { const li = page.locator('#pointList > li').filter({ has: page.locator('[data-a="ok"]') }).first(); await act(() => li.locator('[data-a="ok"]').click()); await sleep(80); }
  await waitPreview(page); await sleep(800);
  const checks = await page.$$eval('#checklist li', l => l.map(x => [x.className, x.textContent]));
  assert(checks.every(c => c[0] === 'ok'), 'lista de verificação: ' + JSON.stringify(checks));
  assert(await page.isEnabled('#bExport'), 'exportação desbloqueada');
  /* 5. exportar */
  await act(() => save(page, '#bExport', V4));
  await act(() => save(page, '#bSave2', RBK));
  await save(page, '#bGpx', path.join(DIST, 'chegar-a-meraki-pontos.gpx'));
  evidence.flow = { actions, seconds: Math.round((Date.now() - t0) / 1000) };
  P = await project(page);
  assert(P.photos.every(f => f.pointId), 'todas as fotos associadas');
  assert(!errors.length, errors.join('\n'));
  await ctx.close();
  return `${actions} acções, ${evidence.flow.seconds} s automatizado`;
});

test('AC6 · Navigator Meraki com 3 MB ou menos e sem EXIF nas fotos', async () => {
  const html = fs.readFileSync(V4, 'utf8'), size = fs.statSync(V4).size, imgs = jpegsIn(html);
  assert(size <= 3 * 1048576, 'tamanho ' + size);
  assert(imgs.length === 3, 'fotos no ficheiro: ' + imgs.length);
  imgs.forEach((b, k) => { assert(!X.hasMetadata(b), 'foto ' + k + ' com EXIF'); const ex = X.readExif(b); assert(!ex.date && !ex.gps, 'foto ' + k + ' com data/GPS'); });
  evidence.ac6 = { bytes: size, mb: +(size / 1048576).toFixed(2), photos: imgs.map(b => b.length) };
  return (size / 1048576).toFixed(2) + ' MB, 3 fotos sem EXIF';
});

test('AC8 · o .roadbook guardado e reaberto no Studio fica idêntico', async browser => {
  const { ctx, page, errors } = await studio(browser);
  const saved = fs.readFileSync(RBK, 'utf8');
  await page.setInputFiles('#fOpen', RBK); await page.waitForFunction(() => RBStudio.project.points.length === 8);
  await sleep(500);
  const again = path.join(OUT, 'reaberto.roadbook'); await save(page, '#bSave', again);
  const a = JSON.parse(saved), b = JSON.parse(fs.readFileSync(again, 'utf8'));
  assert(JSON.stringify(a) === JSON.stringify(b), 'o projecto mudou ao reabrir');
  assert(fs.readFileSync(again, 'utf8') === saved, 'ficheiro byte a byte diferente');
  assert(a.photos.length === 3 && a.photos.every(f => /^data:image\/jpeg/.test(f.data)), 'fotos dentro do .roadbook');
  assert(!errors.length, errors.join('\n')); await ctx.close();
  return 'idêntico byte a byte';
});

/* ---------------------------------------------------------------- Navigator */
const NAV = 'file://' + V4;
async function walk(page) {
  const seen = [];
  for (let k = 0; k < 9; k++) { seen.push(await page.textContent('#card h2')); if (k < 8) await page.click('#next'); }
  return seen;
}
test('M2 · o Navigator gerado no Studio é igual ao v3 em conteúdo (títulos, textos, fotos, legendas, km)', async browser => {
  const a = await openPage(browser, 'file://' + SRC('chegar-a-meraki-v3.html')), b = await openPage(browser, NAV);
  const grab = page => page.evaluate(() => ({ h2: document.querySelector('#card h2').textContent, txt: (document.querySelector('#card .txt') || {}).innerHTML, cap: (document.querySelector('figcaption') || {}).textContent, img: !!document.querySelector('#card figure img'), km: [...document.querySelectorAll('#card .km b,#card .km > span:not(.left)')].map(e => e.textContent).join(' '), btn: document.querySelector('#next').textContent }));
  const diffs = [];
  for (let k = 0; k < 9; k++) {
    const x = await grab(a.page), y = await grab(b.page);
    for (const f of Object.keys(x)) if (x[f] !== y[f] && !(f === 'km' && k === 8)) diffs.push(`${k}.${f}: v3=${x[f]} | v4=${y[f]}`);
    if (k < 8) { await a.page.click('#next'); await b.page.click('#next'); }
  }
  assert(!diffs.length, diffs.join('\n'));
  assert(!b.errors.length, b.errors.join('\n'));
  await a.ctx.close(); await b.ctx.close();
  return '9 ecrãs iguais (o km da chegada difere: v3 mostrava 7,5 por arredondar o trajecto simplificado)';
});

test('AC3 · o Navigator funciona do início ao fim sem rede (incluindo abrir e fechar o 3D)', async browser => {
  const { ctx, page, errors } = await openPage(browser, NAV, { offline: true });
  const seen = await walk(page);
  assert(seen.length === 9 && seen[8] === M.steps[7].title, 'percurso completo: ' + seen.join(' | '));
  await page.click('#next'); assert((await page.textContent('#gtoast')).includes('Bem-vindos à Meraki'), 'mensagem final');
  await page.click('#prev'); await page.click('#card figure button').catch(() => {}); await sleep(100);
  if (await page.isVisible('#box')) await page.click('#box');
  /* fotos e mapa sem rede */
  const imgs = await page.$$eval('img', l => l.filter(i => i.complete && i.naturalWidth > 0).length); assert(imgs >= 1, 'imagens carregadas offline');
  const fonts = await page.evaluate(() => document.fonts.check('800 20px Overpass')); assert(fonts, 'fontes embebidas offline');
  /* 3D a pedido, sem rede: abre ou volta ao guia, sem excepções */
  await page.click('#open3d'); await sleep(2500);
  const v3dOpen = await page.isVisible('#v3d');
  if (v3dOpen) { await page.click('#close3d'); await sleep(200); }
  assert(await page.isVisible('#card'), 'de volta ao guia');
  const exc = errors.filter(e => e.startsWith('pageerror')); assert(!exc.length, exc.join('\n'));
  await ctx.close();
  return `9 ecrãs offline; 3D ${v3dOpen ? 'abriu e fechou' : 'voltou ao guia'}`;
});

/* geolocalização falsa controlada pelo teste (o Playwright não simula perdas de sinal) */
const FAKE_GEO = `(() => { const subs = new Map(); let id = 0;
  const geo = { watchPosition(ok, ko) { id++; subs.set(id, { ok, ko }); return id; }, clearWatch(i) { subs.delete(i); }, getCurrentPosition(ok) {} };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  window.__geo = { pos(lat, lon) { subs.forEach(s => s.ok({ coords: { latitude: lat, longitude: lon, accuracy: 8 }, timestamp: Date.now() })); },
                   err(code) { subs.forEach(s => s.ko && s.ko({ code, message: 'sim' })); }, n: () => subs.size }; })();`;
test('AC4 · simulação GPS: 8 posições, o ponto 1 não é saltado, desvio só a 300 m e com duas leituras, perda de sinal não desliga', async browser => {
  const { ctx, page, errors } = await openPage(browser, NAV, { init: FAKE_GEO });
  const g = T.parseGPX(fs.readFileSync(SRC('meraki-20261101-105849.gpx'), 'utf8')), tr = G.prepare(g.tracks[0].pts);
  await page.click('#gps'); await sleep(100); assert(await page.evaluate(() => window.__geo.n()) === 1, 'seguimento activo');
  const kms = [0.02, 1.0, 2.7, 3.6, 4.75, 5.35, 5.7, 7.5], log = [];
  for (const k of kms) {
    const q = G.pointAtDist(tr.pts, k * 1000); await page.evaluate(([a, b]) => window.__geo.pos(a, b), [q.lat, q.lon]); await sleep(120);
    const st = await page.evaluate(() => ({ step: document.querySelector('#stepLbl').textContent, off: !!document.querySelector('#offroute'), lbl: document.querySelector('#gpsLbl').textContent }));
    log.push(`km ${k}: ${st.step} · ${st.lbl}${st.off ? ' · DESVIO' : ''}`);
    assert(!st.off, 'aviso de desvio no trajecto ao km ' + k);
    if (k === kms[0]) assert(st.step === 'Ponto 1 de 8', 'o ponto 1 não pode ser saltado: ' + st.step);
  }
  assert((await page.textContent('#stepLbl')) === 'Ponto 8 de 8', 'chega ao último ponto');
  /* perda breve de sinal (códigos 2 e 3): continua a seguir */
  await page.evaluate(() => { window.__geo.err(2); window.__geo.err(3); }); await sleep(80);
  assert(await page.evaluate(() => window.__geo.n()) === 1, 'perda de sinal desligou o seguimento');
  assert((await page.textContent('#gpsLbl')).includes('sinal'), 'mostra "À procura de sinal GPS…"');
  /* 300 m fora do trajecto (a leste do km 1,0, na recta longa): a primeira leitura não dispara; a segunda dispara */
  const q = G.pointAtDist(tr.pts, 1000), off = { lat: q.lat, lon: q.lon + 300 / (111320 * Math.cos(q.lat * Math.PI / 180)) };
  const nr = G.nearest(tr.pts, off); assert(nr.dist > 250, 'ponto de teste a ' + nr.dist.toFixed(0) + ' m');
  await page.evaluate(([a, b]) => window.__geo.pos(a, b), [off.lat, off.lon]); await sleep(80);
  assert(!(await page.$('#offroute')), 'uma só leitura fora não deve avisar');
  await page.evaluate(([a, b]) => window.__geo.pos(a, b), [off.lat, off.lon]); await sleep(80);
  assert(await page.$('#offroute'), 'duas leituras a 300 m devem avisar');
  const anim = await page.$eval('#offroute', e => getComputedStyle(e).animationName); assert(anim === 'none', 'o aviso não pisca');
  /* de volta ao trajecto: o aviso desaparece */
  const back = G.pointAtDist(tr.pts, 7550); await page.evaluate(([a, b]) => window.__geo.pos(a, b), [back.lat, back.lon]); await sleep(80);
  assert(!(await page.$('#offroute')), 'o aviso sai quando volta ao trajecto');
  /* navegação manual continua a funcionar com GPS ligado */
  await page.click('#prev'); assert((await page.textContent('#stepLbl')) === 'Ponto 7 de 8', 'Anterior com GPS ligado');
  evidence.ac4 = log; evidence.ac4off = Math.round(nr.dist);
  assert(!errors.length, errors.join('\n')); await ctx.close();
  return log.join(' | ');
});

test('AC7 · o Navigator não tem controlos de edição nem marca DrakoYuda por omissão', async browser => {
  const { ctx, page } = await openPage(browser, NAV);
  const r = await page.evaluate(() => ({ inputs: document.querySelectorAll('input,textarea,select,[contenteditable]').length, text: document.body.innerText, html: document.documentElement.outerHTML }));
  assert(r.inputs === 0, 'controlos de edição: ' + r.inputs);
  assert(!/DrakoYuda/i.test(r.text), 'texto DrakoYuda visível');
  assert(!/Feito com DrakoYuda/.test(r.html.replace(/RB\.credit\?'<p class="credit">Feito com DrakoYuda<\/p>'/, '')), 'crédito presente no HTML');
  await ctx.close();
});

test('AC9 · Navigator a 360 px sem scroll horizontal, temas claro e escuro, zero erros na consola', async browser => {
  const out = [];
  for (const cs of ['light', 'dark']) {
    const { ctx, page, errors } = await openPage(browser, NAV, { viewport: { width: 360, height: 740 }, colorScheme: cs });
    for (let k = 0; k < 9; k++) { assert(await noHScroll(page), `scroll horizontal (${cs}, ecrã ${k})`); if (k < 8) await page.click('#next'); }
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    out.push(cs + ':' + bg);
    assert(cs === 'light' ? bg === 'rgb(243, 238, 230)' : bg === 'rgb(18, 22, 20)', 'tema ' + cs + ' com fundo ' + bg);
    assert(!errors.length, errors.join('\n')); await ctx.close();
  }
  return out.join(' · ');
});

test('AC9 · Studio a 360 px sem scroll horizontal, temas claro e escuro, zero erros na consola', async browser => {
  for (const cs of ['light', 'dark']) {
    const { ctx, page, errors } = await studio(browser, { viewport: { width: 360, height: 740 }, colorScheme: cs });
    await page.setInputFiles('#fFiles', [SRC('meraki-20261101-105849.gpx'), F('meraki-logo.svg'), F('meraki-cirilu-hora.jpg')]);
    await waitDraft(page); await waitPreview(page);
    assert(await noHScroll(page), 'scroll horizontal no Studio (' + cs + ')');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert(cs === 'light' ? bg === 'rgb(244, 243, 238)' : bg === 'rgb(15, 21, 18)', 'tema ' + cs + ': ' + bg);
    assert(!errors.length, errors.join('\n')); await ctx.close();
  }
});

/* ---------------------------------------------------------------- AC2b, AC5, E2 */
test('AC2b · um GPX sem fotos (e sem tempos) exporta um Navigator completo e utilizável', async browser => {
  const { ctx, page, errors } = await studio(browser);
  await page.setInputFiles('#fFiles', [F('sem-tempos.gpx'), F('meraki-logo.svg')]); await waitDraft(page);
  await page.fill('#iPlace', 'Casa do Teste'); await page.fill('#iPhone', '+244 911 111 111');
  if (await page.isVisible('#bSuggest')) await page.click('#bSuggest');
  for (;;) { const b = page.locator('#pointList [data-a="ok"]').first(); if (!(await b.count())) break; await b.click(); await sleep(60); }
  await waitPreview(page); await sleep(600);
  assert(await page.isEnabled('#bExport'), 'exportação bloqueada: ' + JSON.stringify(await page.$$eval('#checklist li:not(.ok)', l => l.map(x => x.textContent))));
  const dest = path.join(OUT, 'sem-fotos.html'); await save(page, '#bExport', dest); await ctx.close();
  const n = await openPage(browser, 'file://' + dest, { offline: true });
  const N = await n.page.evaluate(() => window.RB.steps.length - 1);
  for (let k = 0; k < N; k++) await n.page.click('#next');
  assert((await n.page.textContent('#stepLbl')) === `Ponto ${N} de ${N}`, 'percorre todos os pontos');
  assert((await n.page.textContent('#card h2')).includes('Casa do Teste'), 'chegada com o nome do local');
  assert(!n.errors.length && !errors.length, n.errors.concat(errors).join('\n')); await n.ctx.close();
  return N + ' pontos, sem fotos e sem tempos';
});

async function brandNavigator(browser, logo, place, dest, credit) {
  const { ctx, page, errors } = await studio(browser);
  await page.setInputFiles('#fFiles', [SRC('meraki-20261101-105849.gpx'), F(logo)]); await waitDraft(page);
  await page.waitForFunction(() => RBStudio.project.brand.logo); await page.fill('#iPlace', place); await page.fill('#iPhone', '+244 922 222 222');
  const before = await project(page);
  if (await page.isVisible('#bSuggest')) await page.click('#bSuggest');
  if (credit) await page.check('#tCredit', { force: true });
  for (;;) { const b = page.locator('#pointList [data-a="ok"]').first(); if (!(await b.count())) break; await b.click(); await sleep(60); }
  await waitPreview(page); await sleep(600);
  await save(page, '#bExport', dest); const after = await project(page);
  assert(!errors.length, errors.join('\n')); await ctx.close();
  return { from: before.brand.primary, to: after.brand.primary, accent: after.brand.accent };
}
/* contraste medido no Navigator: texto da instrução, negrito, km e botão Seguinte, nos dois temas */
async function measure(browser, file) {
  const res = {};
  for (const cs of ['light', 'dark']) {
    const { ctx, page } = await openPage(browser, 'file://' + file, { colorScheme: cs });
    await page.click('#next');
    const c = await page.evaluate(() => {
      const css = e => getComputedStyle(e), rgb = s => '#' + s.match(/\d+/g).slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('');
      const bg = rgb(css(document.body).backgroundColor), km = document.querySelector('#card .km b'), nx = document.querySelector('#next'), st = document.querySelector('#card .txt strong');
      return { bg, txt: rgb(css(document.querySelector('#card .txt')).color), kmFg: rgb(css(km).color), kmBg: rgb(css(km).backgroundColor), nxFg: rgb(css(nx).color), nxBg: rgb(css(nx).backgroundColor), strong: st ? rgb(css(st).color) : null };
    });
    const r = { texto: B.contrast(c.txt, c.bg), principal: B.contrast(c.kmBg, c.bg), km: B.contrast(c.kmFg, c.kmBg), seguinte: B.contrast(c.nxFg, c.nxBg), destaque: c.strong ? B.contrast(c.strong, c.bg) : null, cores: c };
    res[cs] = r; await ctx.close();
  }
  return res;
}
test('AC5 · duas marcas fictícias (clara e escura) passam 4,5:1 nos textos do Navigator; E2 exemplo', async browser => {
  const out = {};
  for (const [logo, place, file, credit] of [['marca-clara.svg', 'Quinta Limão', path.join(DIST, 'exemplo-navigator-marca-ficticia.html'), false], ['marca-escura.svg', 'Casa Noite', path.join(OUT, 'exemplo-marca-escura.html'), true]]) {
    const b = await brandNavigator(browser, logo, place, file, credit), m = await measure(browser, file);
    for (const cs of ['light', 'dark']) for (const k of ['texto', 'principal', 'km', 'seguinte', 'destaque']) if (m[cs][k] != null) assert(m[cs][k] >= 4.5, `${place} ${cs} ${k}: ${m[cs][k].toFixed(2)}`);
    out[place] = { logo: b.from, ajustada: b.to, ...Object.fromEntries(['light', 'dark'].map(cs => [cs, Object.fromEntries(['texto', 'principal', 'km', 'seguinte', 'destaque'].map(k => [k, m[cs][k] && +m[cs][k].toFixed(2)]))])) };
  }
  /* o crédito aparece só quando o interruptor está ligado */
  const dark = fs.readFileSync(path.join(OUT, 'exemplo-marca-escura.html'), 'utf8'), light = fs.readFileSync(path.join(DIST, 'exemplo-navigator-marca-ficticia.html'), 'utf8');
  assert(/"credit":true/.test(dark) && /"credit":false/.test(light), 'interruptor do crédito');
  evidence.ac5 = out;
  return JSON.stringify(out);
});

/* ---------------------------------------------------------------- R-S1, R-S5, R-S7, R-S9, R-A9 */
test('Studio · KMZ com dois trajectos (escolha), HEIC recusado, bandeja com arrastar para o mapa, ponto à mão', async browser => {
  const { ctx, page, errors } = await studio(browser);
  await page.setInputFiles('#fFiles', [F('meraki.kmz')]); await waitDraft(page);
  assert(await page.isVisible('#selTrack'), 'escolha do trajecto'); assert(await page.$$eval('#selTrack option', o => o.length) === 2, 'dois trajectos');
  await page.setInputFiles('#fFiles', [F('foto.heic')]); await sleep(200);
  assert((await page.textContent('#toast')).includes('converta para JPEG'), 'mensagem HEIC');
  await page.setInputFiles('#fFiles', [F('sem-metadados.jpg')]); await page.waitForSelector('#tray img');
  /* arrastar da bandeja para o mapa (DataTransfer sintético) */
  const box = await page.locator('#smap .trk').boundingBox();
  await page.evaluate(({ x, y }) => {
    const dt = new DataTransfer(), img = document.querySelector('#tray img'); dt.setData('text/x-photo', img.dataset.id);
    img.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const mw = document.querySelector('#mapwrap'); mw.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
    mw.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await sleep(200);
  let P = await project(page); const ph = P.photos[0];
  assert(ph.source === 'manual' && ph.lat != null && ph.pointId, 'foto colocada à mão e associada: ' + JSON.stringify({ s: ph.source, p: ph.pointId }));
  assert(await page.$('#tray img') === null, 'bandeja vazia');
  assert((await page.textContent('#photoList')).includes('manual'), 'origem "manual" visível (R-S8)');
  /* ponto criado com um clique no trajecto */
  const n0 = P.points.length; const pts = await page.$$eval('#smap .pp', g => g.length);
  const hit = page.locator('#smap .hit'); const hb = await hit.boundingBox();
  const target = await page.evaluate(() => { const svg = document.querySelector('#smap'), pl = svg.querySelector('.hit'), p = pl.points.getItem(Math.floor(pl.points.numberOfItems * 0.33)), m = svg.getScreenCTM(); const q = svg.createSVGPoint(); q.x = p.x; q.y = p.y; const r = q.matrixTransform(m); return { x: r.x, y: r.y }; });
  await page.mouse.click(target.x, target.y); await sleep(200);
  P = await project(page); assert(P.points.length === n0 + 1 && P.points.some(p => p.kind === 'manual'), 'ponto manual criado');
  assert(!errors.length, errors.join('\n')); await ctx.close();
});

test('R-A9/R-A2 · com rede (OpenStreetMap simulado), o rascunho junta referências e sobe a confiança', async browser => {
  const g = T.parseGPX(fs.readFileSync(SRC('meraki-20261101-105849.gpx'), 'utf8')), tr = G.prepare(g.tracks[0].pts);
  const at = k => G.pointAtDist(tr.pts, k * 1000);
  /* junções nas duas manobras do km 2,7 (onde o carro abranda) e uma escola junto ao km 5,38 */
  const j = at(2.66), j2 = at(2.74), s = at(5.38);
  const mock = { elements: [
    { type: 'node', id: 1, lat: j.lat, lon: j.lon }, { type: 'node', id: 2, lat: j.lat + 0.001, lon: j.lon }, { type: 'node', id: 3, lat: j.lat, lon: j.lon + 0.001 },
    { type: 'way', id: 10, nodes: [2, 1], tags: { highway: 'track' } }, { type: 'way', id: 11, nodes: [1, 3, 5], tags: { highway: 'track' } },
    { type: 'node', id: 5, lat: j2.lat, lon: j2.lon }, { type: 'node', id: 6, lat: j2.lat - 0.001, lon: j2.lon }, { type: 'way', id: 12, nodes: [5, 6], tags: { highway: 'track' } },
    { type: 'node', id: 4, lat: s.lat + 0.0003, lon: s.lon, tags: { name: 'escola do Bengo', amenity: 'school' } }] };
  const { ctx, page, errors } = await openPage(browser, STUDIO, { viewport: { width: 1440, height: 900 } });
  await page.route(/overpass/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock) }));
  if (await page.isVisible('#tour')) await page.click('#tourSkip');
  await page.setInputFiles('#fFiles', [SRC('meraki-20261101-105849.gpx')]); await waitDraft(page);
  const P = await project(page);
  const t = P.points.find(p => p.kind === 'manobra' && Math.abs(p.km_a - 2.66) < 0.15), r = P.points.find(p => /escola do Bengo/.test(p.text));
  assert(t && t.conf === 'alta' && !t.confirm, 'manobra do km 2,7 com confiança alta: ' + JSON.stringify(t && { c: t.conf, w: t.why }));
  assert(r, 'referência "junto à escola" no texto');
  assert((await page.textContent('#osmStatus')).includes('OpenStreetMap: '), 'estado OSM');
  assert(!errors.length, errors.join('\n')); await ctx.close();
});

test('R-S12 · pré-visualização em moldura 390×844, claro e escuro, com simulação GPS', async browser => {
  const { ctx, page, errors } = await studio(browser);
  await page.setInputFiles('#fFiles', [SRC('meraki-20261101-105849.gpx')]); await waitDraft(page); await waitPreview(page);
  const sz = await page.$eval('#pv', f => [f.offsetWidth, f.offsetHeight]); assert(sz[0] === 390 && sz[1] === 844, 'moldura ' + sz);
  await page.click('[data-pv="dark"]'); await sleep(200);
  const bg = await page.frameLocator('#pv').locator('body').evaluate(b => getComputedStyle(b).backgroundColor); assert(bg === 'rgb(18, 22, 20)', 'escuro: ' + bg);
  await page.click('#bSim'); await sleep(3500);
  const st = await page.frameLocator('#pv').locator('#stepLbl').textContent(); assert(/Ponto [2-9]/.test(st), 'a simulação avança: ' + st);
  await page.click('#bSim');
  await page.screenshot({ path: path.join(OUT, 'studio-preview.png') });
  assert(!errors.length, errors.join('\n')); await ctx.close();
  return st;
});

(async () => {
  const res = await run(process.argv[2]);
  fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify({ when: new Date().toISOString(), res, evidence }, null, 1));
  const bad = res.filter(r => !r.ok);
  console.log(`\n${res.length - bad.length}/${res.length} passaram`);
  process.exit(bad.length ? 1 : 0);
})();
