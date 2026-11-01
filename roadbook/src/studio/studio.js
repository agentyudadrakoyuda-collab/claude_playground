/* Roadbook Studio · interface. Usa RBGeo, RBTracks, RBExif, RBBrand, RBDraft, RBProject, RBNav e RB_NAV_TEMPLATE. */
(() => {
'use strict';
const G = window.RBGeo, TR = window.RBTracks, X = window.RBExif, B = window.RBBrand, D = window.RBDraft, PR = window.RBProject, NB = window.RBNav;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = PR.esc, fkm = m => G.fmtKm(m), uid = () => Math.random().toString(36).slice(2, 9);

let P = PR.emptyProject();          /* projecto actual */
let parsed = null;                  /* ficheiro de trajectos lido (para escolher entre vários) */
let TRK = null;                     /* trajecto activo preparado */
let sel = null;                     /* id do ponto seleccionado */
let undoStack = [];
let lastSize = null, lastHtml = null, buildTimer = null, saveTimer = null;

/* ---------- utilidades ---------- */
function toast(m, ms = 3500) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
const slug = s => (s || 'guia').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'guia';
const readBuf = f => f.arrayBuffer();
const readURL = blob => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(blob); });
function loadImage(src) { return new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ko(new Error('imagem inválida')); im.src = src; }); }
/* redimensiona e reencoda em JPEG: o canvas não copia EXIF nem XMP */
async function reencode(src, maxW, q) {
  const im = await loadImage(src), s = Math.min(1, maxW / im.naturalWidth), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(im.naturalWidth * s)); c.height = Math.max(1, Math.round(im.naturalHeight * s));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
  return { data: c.toDataURL('image/jpeg', q), w: c.width, h: c.height };
}
function placePhrase() { const t = (P.brand.title || '').trim(), m = /^chegar\s+(.+)$/i.exec(t); return m ? m[1] : ('a ' + (P.brand.place || 'destino')); }

/* ---------- IndexedDB (R-S16): cada leitura e escrita em try/catch ---------- */
const IDB = {
  db: null,
  async open() { try { if (this.db) return this.db; this.db = await new Promise((ok, ko) => { const r = indexedDB.open('drakoyuda-roadbook', 1); r.onupgradeneeded = () => r.result.createObjectStore('auto'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }); return this.db; } catch (e) { return null; } },
  async get(k) { try { const db = await this.open(); if (!db) return null; return await new Promise((ok, ko) => { const r = db.transaction('auto').objectStore('auto').get(k); r.onsuccess = () => ok(r.result || null); r.onerror = () => ko(r.error); }); } catch (e) { return null; } },
  async set(k, v) { try { const db = await this.open(); if (!db) return false; await new Promise((ok, ko) => { const tx = db.transaction('auto', 'readwrite'); tx.objectStore('auto').put(v, k); tx.oncomplete = ok; tx.onerror = () => ko(tx.error); }); return true; } catch (e) { return false; } },
  async del(k) { try { const db = await this.open(); if (!db) return; await new Promise(ok => { const tx = db.transaction('auto', 'readwrite'); tx.objectStore('auto').delete(k); tx.oncomplete = ok; tx.onerror = ok; }); } catch (e) { /* sem armazenamento */ } }
};
function changed(opts = {}) {
  if (!opts.open) { P.updated = new Date().toISOString(); clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (P.track) IDB.set('current', PR.serialize(P)); }, 600); }
  if (!opts.noList) renderPoints();
  renderMap(); renderChecklist(); schedulePreview();
}

/* ---------- importação ---------- */
async function handleFiles(files) {
  const list = [...files]; if (!list.length) return;
  const tracks = list.filter(f => /\.(gpx|kml|kmz)$/i.test(f.name)), logos = list.filter(f => /\.(png|svg)$/i.test(f.name) || /image\/(png|svg)/.test(f.type));
  const heic = list.filter(f => /\.(heic|heif)$/i.test(f.name) || /heic|heif/.test(f.type)), jpgs = list.filter(f => /\.jpe?g$/i.test(f.name) || f.type === 'image/jpeg');
  const other = list.filter(f => !tracks.includes(f) && !logos.includes(f) && !heic.includes(f) && !jpgs.includes(f));
  if (other.length) toast('Ficheiro não suportado: ' + other.map(f => f.name).join(', ') + '. Use GPX, KML, KMZ, JPEG, PNG ou SVG.', 6000);
  if (heic.length) toast('Foto HEIC: converta para JPEG (' + heic.map(f => f.name).join(', ') + ').', 7000);
  for (const f of tracks) await importTrack(f);
  for (const f of logos) await importLogo(f);
  if (jpgs.length) await importPhotos(jpgs);
}
async function importTrack(f) {
  try {
    const buf = await readBuf(f);
    parsed = await TR.parseAny(f.name, buf); parsed.file = f.name;
    if (!parsed.tracks.length) throw new Error('O ficheiro não tem trajectos.');
    const sp = $('#selTrack'); sp.innerHTML = parsed.tracks.map((t, i) => `<option value="${i}">${esc(t.name)} · ${fkm(G.prepare(t.pts).total)} km · ${t.pts.length} pontos</option>`).join('');
    $('#trackPick').hidden = parsed.tracks.length < 2;
    if (parsed.tracks.length > 1) toast('O ficheiro tem ' + parsed.tracks.length + ' trajectos. Escolha um.', 5000);
    useTrack(0);
  } catch (e) { toast('Não foi possível ler ' + f.name + ': ' + e.message, 7000); }
}
function useTrack(i) {
  const t = parsed.tracks[i];
  P.track = { name: t.name, file: parsed.file, pts: t.pts.map(q => [q.lat, q.lon, q.ele == null ? null : q.ele, q.t == null ? null : q.t]), trimA: 0, trimB: null };
  P.created = P.created || new Date().toISOString();
  const full = G.prepare(t.pts); P.recorded = full.pts[0].t ? new Date(full.pts[0].t).toISOString().slice(0, 10) : '';
  $('#rTrimA').max = $('#rTrimB').max = Math.max(100, Math.round(Math.min(2000, full.total / 3) / 10) * 10);
  $('#rTrimA').value = 0; $('#rTrimB').value = 0;
  redraft();
}
async function redraft() {
  TRK = PR.activeTrack(P);
  if (!TRK || TRK.pts.length < 2) return;
  P.road = []; P.roadLabels = ['', ''];
  const osm = await fetchOSM(TRK);
  if (osm && osm.road && osm.road.length > 1) { P.road = osm.road; P.roadLabels = osm.roadLabels || ['', '']; }
  if (P.road.length < 2) P.road = syntheticRoad(TRK);
  /* a estrada fica de oeste para leste: a ponta da esquerda no mapa é a primeira */
  if (P.road[0][1] > P.road[P.road.length - 1][1]) P.road.reverse();
  P.osm = osm ? { junctions: osm.junctions.length, refs: osm.refs.length } : null;
  const r = D.generate(TRK.pts, { placeName: P.brand.place || 'o destino', placePhrase: placePhrase(), osm: osm ? { junctions: osm.junctions, refs: osm.refs } : null });
  P.points = r.points; undoStack = []; $('#undoBar').hidden = true;
  regenTexts(true);
  P.photos.forEach(ph => { if (ph.source !== 'manual') placeOne(ph); });
  P.photos.forEach(ph => associate(ph, false));
  renderTrackInfo(); changed();
  toast(`Rascunho pronto: ${P.points.length} pontos, ${P.points.filter(p => p.confirm).length} a confirmar.`);
}
/* estrada de acesso sem rede: um segmento de 1,6 km perpendicular ao início do trajecto */
function syntheticRoad(tr) {
  const a = tr.pts[0], b = G.pointAtDist(tr.pts, Math.min(150, tr.total)), br = G.bearing(a, b) * Math.PI / 180;
  const kx = 111320 * Math.cos(a.lat * Math.PI / 180), kz = 110540, L = 800;
  const dx = Math.cos(br) * L, dz = -Math.sin(br) * L; /* perpendicular: (cos, -sin) do rumo */
  return [[+(a.lat + dz / kz).toFixed(6), +(a.lon + dx / kx).toFixed(6)], [+(a.lat - dz / kz).toFixed(6), +(a.lon - dx / kx).toFixed(6)]];
}

/* ---------- OpenStreetMap (Overpass), só com rede (R-A9, R-S20) ---------- */
async function fetchOSM(tr) {
  const st = $('#osmStatus');
  if (!navigator.onLine) { st.textContent = 'Sem rede: rascunho sem referências do OpenStreetMap.'; return null; }
  let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180; tr.pts.forEach(p => { la0 = Math.min(la0, p.lat); la1 = Math.max(la1, p.lat); lo0 = Math.min(lo0, p.lon); lo1 = Math.max(lo1, p.lon); });
  const pad = 0.004, bb = [la0 - pad, lo0 - pad, la1 + pad, lo1 + pad].map(v => v.toFixed(5)).join(',');
  const q = `[out:json][timeout:20];(way["highway"](${bb});node["name"](${bb});way["name"]["building"](${bb}););out body;>;out skel qt;`;
  st.textContent = 'A consultar o OpenStreetMap…';
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 12000);
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: q }), signal: ctl.signal }); clearTimeout(tm);
      if (!res.ok) continue;
      const j = await res.json(), nodes = new Map(), use = new Map(), refs = [];
      j.elements.forEach(e => { if (e.type === 'node') nodes.set(e.id, e); });
      const ways = j.elements.filter(e => e.type === 'way' && e.tags && e.tags.highway);
      ways.forEach(w => w.nodes.forEach(n => use.set(n, (use.get(n) || 0) + 1)));
      const junctions = [...use.entries()].filter(([, c]) => c >= 2).map(([id]) => nodes.get(id)).filter(Boolean).map(n => ({ lat: n.lat, lon: n.lon }));
      j.elements.forEach(e => { if (e.type === 'node' && e.tags && e.tags.name && !e.tags.highway) refs.push({ lat: e.lat, lon: e.lon, name: e.tags.name, kind: e.tags.amenity || e.tags.shop || e.tags.place || '' }); });
      /* estrada de acesso: a via principal mais próxima do início */
      let road = null, best = 1e9; const s0 = tr.pts[0];
      ways.filter(w => /^(motorway|trunk|primary|secondary|tertiary)/.test(w.tags.highway)).forEach(w => {
        const pts = w.nodes.map(n => nodes.get(n)).filter(Boolean); pts.forEach(n => { const d = G.hav(s0, n); if (d < best) { best = d; road = pts; } });
      });
      const out = { junctions, refs, road: road && best < 250 ? road.map(n => [n.lat, n.lon]) : null, roadLabels: ['', ''] };
      st.textContent = `OpenStreetMap: ${junctions.length} junções, ${refs.length} referências.`;
      return out;
    } catch (e) { /* tentar o servidor seguinte */ }
  }
  st.textContent = 'OpenStreetMap indisponível: rascunho sem referências.';
  return null;
}

/* ---------- fotos (R-S5 a R-S8) ---------- */
async function importPhotos(files) {
  let n = 0, trayN = 0;
  for (const f of files) {
    try {
      const buf = await readBuf(f), ex = X.readExif(buf);
      if (ex.isHeic) { toast('Foto HEIC: converta para JPEG (' + f.name + ').'); continue; }
      if (!ex.isJpeg) { toast(f.name + ' não é um JPEG.'); continue; }
      const url = await readURL(new Blob([buf], { type: 'image/jpeg' }));
      const r = await reencode(url, 1600, 0.85);
      const ph = { id: 'f' + uid(), name: f.name, data: r.data, w: r.w, h: r.h, lat: null, lon: null, source: null, t: null, pointId: null, caption: '', exif: { date: ex.date, offset: ex.offset, gps: ex.gps } };
      P.photos.push(ph); placeOne(ph); associate(ph, true); if (!ph.source) trayN++; n++;
    } catch (e) { toast('Não foi possível ler ' + f.name + '.'); }
  }
  renderPhotos(); changed();
  toast(`${n} foto(s) importada(s)${trayN ? `, ${trayN} na bandeja` : ''}.`);
}
function placeOne(ph) {
  if (!TRK || ph.source === 'manual') return;
  const r = PR.placePhoto(TRK, { gps: ph.exif && ph.exif.gps, date: ph.exif && ph.exif.date, offset: ph.exif && ph.exif.offset }, P.tz);
  ph.lat = r.lat; ph.lon = r.lon; ph.source = r.source; ph.t = r.t;
  if (!r.source) ph.pointId = null;
}
/* associa ao ponto mais próximo (≤ 150 m); se não houver, propõe um ponto novo */
function associate(ph, propose) {
  if (ph.lat == null || !P.points.length) return;
  const n = PR.nearestPoint(P.points, ph.lat, ph.lon, 150);
  if (n) { ph.pointId = n.id; return; }
  if (!propose) { ph.pointId = null; return; }
  const near = G.nearest(TRK.pts, { lat: ph.lat, lon: ph.lon }), k = near.d / 1000;
  const pt = newPoint(k, 'foto'); pt.title = 'Ponto com foto'; pt.text = `Km ${fkm(near.d)}. Confirme a indicação junto a esta foto.`;
  ph.pointId = pt.id; toast('Foto sem ponto perto: foi proposto um ponto novo ao km ' + fkm(near.d) + '.');
}
function newPoint(k, kind) {
  const q = G.pointAtDist(TRK.pts, k * 1000);
  const pt = { id: 'p' + uid(), km_a: +k.toFixed(2), km_b: +k.toFixed(2), kind, maneuver: 'em frente', confirm: true, conf: 'baixa', why: [kind === 'foto' ? 'ponto proposto por uma foto' : 'ponto criado à mão'], lat: +q.lat.toFixed(6), lon: +q.lon.toFixed(6), photo: null, caption: '', notes: [], title: 'Ponto', text: `Km ${fkm(k * 1000)}. `, trigger_km: +Math.max(0, k - 0.1).toFixed(2) };
  P.points.push(pt); PR.sortPoints(P); D.refreshTails(P.points); return pt;
}
function photoAt(ph, lat, lon) {
  const near = G.nearest(TRK.pts, { lat, lon }), q = G.pointAtDist(TRK.pts, near.d);
  ph.lat = +q.lat.toFixed(6); ph.lon = +q.lon.toFixed(6); ph.source = 'manual'; associate(ph, true); renderPhotos(); changed();
}

/* ---------- logótipo e cores (R-A11, R-S10) ---------- */
async function importLogo(f) {
  try {
    if (!/\.(png|svg)$/i.test(f.name) && !/png|svg/.test(f.type)) { toast('O logótipo tem de ser PNG ou SVG.'); return; }
    const url = await readURL(f.type ? f : new Blob([await f.arrayBuffer()], { type: /\.svg$/i.test(f.name) ? 'image/svg+xml' : 'image/png' }));
    const im = await loadImage(url), c = document.createElement('canvas'), s = Math.min(1, 160 / Math.max(im.naturalWidth || 160, im.naturalHeight || 160));
    c.width = Math.max(1, Math.round((im.naturalWidth || 160) * s)); c.height = Math.max(1, Math.round((im.naturalHeight || 160) * s));
    const g = c.getContext('2d'); g.drawImage(im, 0, 0, c.width, c.height);
    const col = B.extractColors(g.getImageData(0, 0, c.width, c.height).data);
    /* logótipo reduzido para o guia (PNG até 320 px de largura; SVG fica como está) */
    let logo = url;
    if (!/svg/.test(url.slice(0, 30))) { const c2 = document.createElement('canvas'), s2 = Math.min(1, 320 / im.naturalWidth); c2.width = Math.round(im.naturalWidth * s2); c2.height = Math.round(im.naturalHeight * s2); c2.getContext('2d').drawImage(im, 0, 0, c2.width, c2.height); logo = c2.toDataURL('image/png'); }
    P.brand.logo = logo; P.brand.primary = col.primary; P.brand.accent = col.accent; P.brand.fromLogo = col.fromLogo;
    renderBrand(); changed({ noList: true });
    toast('Logótipo carregado. Cores tiradas do logótipo.');
  } catch (e) { toast('Não foi possível ler o logótipo.'); }
}
function regenTexts(force) {
  const st = TRK ? { total: TRK.total, duration: TRK.duration } : null; if (!st) return;
  const w = D.welcome(P.brand.place || 'o destino', st, P.points.length);
  if (force || !P.texts.welcome) P.texts.welcome = w.welcome.replace('até ' + (P.brand.place || 'o destino'), untilPhrase());
  if (force || !P.texts.before) P.texts.before = w.before;
  renderBrand();
}
function untilPhrase() { const p = placePhrase(); return /^a\s/.test(p) ? 'até ' + p.slice(2) : 'até ' + p; }

/* ---------- desenho: trajecto e estatísticas ---------- */
function renderTrackInfo() {
  if (!P.track) { $('#stats').hidden = $('#trim').hidden = true; return; }
  const full = G.prepare(P.track.pts.map(a => ({ lat: a[0], lon: a[1], ele: a[2], t: a[3] }))), tr = TRK, c = G.climb(tr.pts);
  $('#stats').hidden = $('#trim').hidden = false;
  $('#stDist').textContent = fkm(tr.total, 2) + ' km';
  $('#stTime').textContent = tr.duration ? G.fmtMin(tr.duration) + ' min' : 'sem tempos';
  $('#stUp').textContent = Math.round(c.up) + ' m';
  $('#stN').textContent = tr.pts.length;
  $('#oTrimA').textContent = Math.round(P.track.trimA || 0) + ' m';
  $('#oTrimB').textContent = Math.round(P.track.trimB == null ? 0 : full.total - P.track.trimB) + ' m';
  $('#mapHint').textContent = 'Clique no trajecto para criar um ponto à mão. Arraste os pontos ao longo do trajecto.';
}

/* ---------- mapa SVG ---------- */
const NS = 'http://www.w3.org/2000/svg';
let proj = null;
function mk(t, a, p) { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
function renderMap() {
  const svg = $('#smap'); svg.innerHTML = '';
  if (!P.track) { proj = null; return; }
  const full = P.track.pts, lat0 = full[0][0], kx = 111320 * Math.cos(lat0 * Math.PI / 180), kz = 110540;
  const Pj = (la, lo) => [lo * kx, -la * kz];
  const all = full.map(a => Pj(a[0], a[1])).concat((P.road || []).map(a => Pj(a[0], a[1])));
  let x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(...all.map(p => p[0])), y0 = Math.min(...all.map(p => p[1])), y1 = Math.max(...all.map(p => p[1]));
  const pad = Math.max(120, (x1 - x0 + y1 - y0) * 0.06); x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  const w = svg.clientWidth || 600, h = svg.clientHeight || 500, s = Math.max((x1 - x0) / w, (y1 - y0) / h), vw = w * s, vh = h * s, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  svg.setAttribute('viewBox', `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`);
  proj = { Pj, s, kx, kz, inv: (x, y) => ({ lat: -y / kz, lon: x / kx }) };
  const pl = a => a.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  if (P.road && P.road.length > 1) mk('polyline', { class: 'road', points: pl(P.road.map(a => Pj(a[0], a[1]))) }, svg);
  mk('polyline', { class: 'trk-off', points: pl(full.map(a => Pj(a[0], a[1]))) }, svg);
  const act = TRK.pts.map(p => Pj(p.lat, p.lon));
  mk('polyline', { class: 'trk', points: pl(act) }, svg);
  const hit = mk('polyline', { class: 'hit', points: pl(act) }, svg);
  hit.addEventListener('click', e => { const ll = svgLL(e); if (!ll) return; const n = G.nearest(TRK.pts, ll); const pt = newPoint(n.d / 1000, 'manual'); sel = pt.id; changed(); focusPoint(pt.id); toast('Ponto criado à mão ao km ' + fkm(n.d) + '. Escreva a instrução.'); });
  const H = act[act.length - 1]; mk('circle', { class: 'home', cx: H[0], cy: H[1], r: 9 * s }, svg);
  P.photos.filter(ph => ph.lat != null).forEach(ph => { const p = Pj(ph.lat, ph.lon), g = mk('g', { class: 'ph' }, svg); mk('rect', { x: p[0] - 5 * s, y: p[1] - 5 * s, width: 10 * s, height: 10 * s, rx: 2 * s }, g); mk('title', {}, g).textContent = ph.name + ' · ' + srcLabel(ph.source); });
  P.points.forEach((pt, k) => {
    const p = Pj(pt.lat, pt.lon), g = mk('g', { class: 'pp' + (pt.confirm ? ' todo' : '') + (sel === pt.id ? ' sel' : ''), 'data-id': pt.id, tabindex: 0 }, svg);
    mk('circle', { cx: p[0], cy: p[1], r: 11 * s }, g); const t = mk('text', { x: p[0], y: p[1] + s, 'font-size': 11 * s }, g); t.textContent = k + 1;
    mk('title', {}, g).textContent = `${k + 1} · km ${fkm(pt.km_a * 1000)} · ${pt.title}${pt.confirm ? ' (a confirmar)' : ''}`;
    g.addEventListener('pointerdown', e => startDrag(e, pt, g));
    g.addEventListener('keydown', e => { if (e.key === 'Enter') { sel = pt.id; renderMap(); focusPoint(pt.id); } });
  });
}
function svgLL(e) {
  const svg = $('#smap'), m = svg.getScreenCTM(); if (!m || !proj) return null;
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(m.inverse()); return proj.inv(q.x, q.y);
}
function startDrag(e, pt, g) {
  e.preventDefault(); e.stopPropagation(); sel = pt.id; let moved = false; const len = pt.km_b - pt.km_a;
  const move = ev => {
    const ll = svgLL(ev); if (!ll) return; moved = true;
    const n = G.nearest(TRK.pts, ll), q = G.pointAtDist(TRK.pts, n.d), k = n.d / 1000;
    pt.km_a = +k.toFixed(2); pt.km_b = +Math.min(TRK.total / 1000, k + len).toFixed(2); pt.lat = +q.lat.toFixed(6); pt.lon = +q.lon.toFixed(6);
    pt.trigger_km = +(pt.kind === 'inicio' ? -1 : (pt.kind === 'troco' || pt.kind === 'subida' || pt.kind === 'descida') ? pt.km_a : Math.max(0, pt.km_a - 0.1)).toFixed(2);
    const p = proj.Pj(pt.lat, pt.lon); g.querySelector('circle').setAttribute('cx', p[0]); g.querySelector('circle').setAttribute('cy', p[1]); const t = g.querySelector('text'); t.setAttribute('x', p[0]); t.setAttribute('y', p[1] + proj.s);
  };
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    if (moved) { PR.sortPoints(P); D.refreshTails(P.points); P.photos.forEach(ph => { if (ph.pointId === pt.id || !ph.pointId) associate(ph, false); }); }
    changed(); focusPoint(pt.id); };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
}
function focusPoint(id) { const li = document.querySelector(`.pt[data-id="${id}"]`); if (li) { li.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } }

/* fotos arrastadas da bandeja para o mapa (R-S7) */
const mw = $('#mapwrap');
mw.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/x-photo')) e.preventDefault(); });
mw.addEventListener('drop', e => { const id = e.dataTransfer.getData('text/x-photo'); if (!id) return; e.preventDefault(); const ph = P.photos.find(p => p.id === id); const ll = svgLL(e); if (ph && ll && TRK) photoAt(ph, ll.lat, ll.lon); });

/* ---------- lista de fotos e bandeja ---------- */
const srcLabel = s => s === 'gps' ? 'GPS' : s === 'hora' ? 'hora' : s === 'manual' ? 'manual' : 'sem posição';
function renderPhotos() {
  const tray = $('#tray'), list = $('#photoList');
  tray.innerHTML = ''; list.innerHTML = '';
  P.photos.filter(ph => ph.lat == null).forEach(ph => {
    const im = document.createElement('img'); im.src = ph.data; im.alt = ph.name; im.title = ph.name + ': arraste para o mapa'; im.draggable = true; im.dataset.id = ph.id;
    im.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-photo', ph.id); e.dataTransfer.effectAllowed = 'move'; });
    tray.appendChild(im);
  });
  P.photos.filter(ph => ph.lat != null).forEach(ph => {
    const pt = P.points.find(p => p.id === ph.pointId), k = pt ? P.points.indexOf(pt) + 1 : null;
    const li = document.createElement('li'); li.dataset.id = ph.id;
    li.innerHTML = `<img src="${ph.data}" alt=""><div class="meta"><b>${esc(ph.name)}</b><span><span class="src ${ph.source}">${srcLabel(ph.source)}</span> ${pt ? `· ponto ${k} (km ${fkm(pt.km_a * 1000)})` : '· sem ponto a 150 m'}</span>
      <input class="cap" placeholder="Legenda" maxlength="80" value="${esc(ph.caption || '')}" aria-label="Legenda da foto"></div><button type="button" class="icon-x" aria-label="Retirar a foto" title="Retirar">✕</button>`;
    li.querySelector('.cap').addEventListener('input', e => { ph.caption = e.target.value; changed({ noList: true }); });
    li.querySelector('.icon-x').onclick = () => { P.photos = P.photos.filter(p => p !== ph); renderPhotos(); changed(); };
    list.appendChild(li);
  });
}

/* ---------- lista de pontos (R-S9) ---------- */
const KIND = { inicio: 'saída do asfalto', chegada: 'chegada', manobra: 'manobra', troco: 'troço', subida: 'subida', descida: 'descida', lento: 'troço lento', paragem: 'paragem', manual: 'manual', foto: 'foto' };
const MAN = [['esquerda', 'Esquerda'], ['direita', 'Direita'], ['em frente', 'Em frente'], ['atencao', 'Atenção'], ['chegada', 'Chegada']];
function renderPoints() {
  const ol = $('#pointList'); ol.innerHTML = '';
  const todo = P.points.filter(p => p.confirm).length;
  $('#pCount').textContent = P.points.length ? `${P.points.length} · ${todo} a confirmar` : '';
  P.points.forEach((pt, k) => {
    const li = document.createElement('li'); li.className = 'pt' + (pt.confirm ? ' todo' : '') + (sel === pt.id ? ' sel' : ''); li.dataset.id = pt.id;
    const phs = P.photos.filter(ph => ph.lat != null);
    const cur = P.photos.find(ph => ph.pointId === pt.id);
    li.innerHTML = `<div class="pt-head"><span class="num">${k + 1}</span><span class="km">km ${fkm(pt.km_a * 1000)}${pt.km_b > pt.km_a ? ' → ' + fkm(pt.km_b * 1000) : ''}</span><span class="badge">${KIND[pt.kind] || pt.kind}</span>${pt.confirm ? '<span class="badge todo">a confirmar</span>' : ''}</div>
      ${pt.confirm && pt.why && pt.why.length ? `<p class="why">Confiança ${pt.conf === 'media' ? 'média' : pt.conf}: ${esc(pt.why.join('; '))}.</p>` : ''}
      <div class="pt-grid">
        <label class="fld full">Título <input data-f="title" maxlength="40" value="${esc(pt.title)}"></label>
        <label class="fld full">Instrução <textarea data-f="text" rows="3" maxlength="220">${esc(pt.text)}</textarea><span class="cnt">${(pt.text || '').length}/220</span></label>
        <label class="fld">Manobra <select data-f="maneuver">${MAN.map(([v, l]) => `<option value="${v}"${pt.maneuver === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="fld">Gatilho GPS (km) <input data-f="trigger_km" type="number" step="0.01" min="-1" value="${pt.trigger_km}"></label>
        <label class="fld">Km início <input data-f="km_a" type="number" step="0.01" min="0" value="${pt.km_a}"></label>
        <label class="fld">Km fim <input data-f="km_b" type="number" step="0.01" min="0" value="${pt.km_b}"></label>
        <label class="fld">Foto <select data-f="photo"><option value="">Sem foto</option>${phs.map(ph => `<option value="${ph.id}"${cur === ph ? ' selected' : ''}>${esc(ph.name)}</option>`).join('')}</select></label>
        <label class="fld">Legenda <input data-f="caption" maxlength="80" value="${esc(cur ? (cur.caption || '') : pt.caption || '')}"></label>
      </div>
      <div class="pt-actions">${pt.confirm ? '<button type="button" class="btn" data-a="ok">Confirmar</button>' : ''}<button type="button" class="btn ghost" data-a="del">Apagar</button>${k < P.points.length - 1 ? '<button type="button" class="btn ghost" data-a="join">Juntar com o seguinte</button>' : ''}<button type="button" class="btn ghost" data-a="map">Ver no mapa</button></div>`;
    li.addEventListener('focusin', () => { if (sel !== pt.id) { sel = pt.id; li.classList.add('sel'); renderMap(); } });
    li.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => editField(pt, inp, li)));
    li.querySelectorAll('[data-f=km_a],[data-f=km_b]').forEach(inp => inp.addEventListener('change', () => { PR.sortPoints(P); D.refreshTails(P.points); changed(); }));
    li.querySelector('[data-a=del]').onclick = () => delPoint(pt);
    const ok = li.querySelector('[data-a=ok]'); if (ok) ok.onclick = () => { pt.confirm = false; changed(); toast(`Ponto ${k + 1} confirmado.`, 1800); };
    const j = li.querySelector('[data-a=join]'); if (j) j.onclick = () => joinPoints(k);
    li.querySelector('[data-a=map]').onclick = () => { sel = pt.id; renderMap(); renderPoints(); };
    ol.appendChild(li);
  });
}
function editField(pt, inp, li) {
  const f = inp.dataset.f, v = inp.value;
  if (f === 'photo') { P.photos.forEach(ph => { if (ph.pointId === pt.id) ph.pointId = null; }); const ph = P.photos.find(p => p.id === v); if (ph) ph.pointId = pt.id; renderPhotos(); changed(); return; }
  if (f === 'caption') { const ph = P.photos.find(p => p.pointId === pt.id); if (ph) ph.caption = v; pt.caption = v; changed({ noList: true }); return; }
  if (f === 'km_a' || f === 'km_b' || f === 'trigger_km') { const n = parseFloat(v); if (!isFinite(n)) return; pt[f] = Math.round(n * 100) / 100;
    if (f !== 'trigger_km') { const tot = TRK.total / 1000; pt.km_a = Math.max(0, Math.min(tot, pt.km_a)); pt.km_b = Math.max(pt.km_a, Math.min(tot, pt.km_b)); const q = G.pointAtDist(TRK.pts, (pt.kind === 'chegada' ? pt.km_b : pt.km_a) * 1000); pt.lat = +q.lat.toFixed(6); pt.lon = +q.lon.toFixed(6); }
    changed({ noList: true }); return; }
  pt[f] = v;
  if (f === 'text') { const c = li.querySelector('.cnt'); if (c) c.textContent = v.length + '/220'; }
  changed({ noList: true });
}
function delPoint(pt) {
  const i = P.points.indexOf(pt); if (i < 0) return;
  const photos = P.photos.filter(ph => ph.pointId === pt.id).map(ph => ph.id);
  undoStack.push({ pt, i, photos }); P.points.splice(i, 1); P.photos.forEach(ph => { if (ph.pointId === pt.id) ph.pointId = null; });
  D.refreshTails(P.points);
  $('#undoTxt').textContent = `Ponto "${pt.title}" apagado.`; $('#undoBar').hidden = false; renderPhotos(); changed();
}
$('#bUndo').onclick = () => {
  const u = undoStack.pop(); if (!u) return;
  P.points.splice(Math.min(u.i, P.points.length), 0, u.pt); P.photos.forEach(ph => { if (u.photos.includes(ph.id)) ph.pointId = u.pt.id; });
  PR.sortPoints(P); D.refreshTails(P.points); $('#undoBar').hidden = !undoStack.length;
  if (undoStack.length) $('#undoTxt').textContent = `Ponto "${undoStack[undoStack.length - 1].pt.title}" apagado.`;
  renderPhotos(); changed(); toast('Eliminação anulada.');
};
function joinPoints(k) {
  const a = P.points[k], b = P.points[k + 1]; if (!a || !b) return;
  const strip = t => (t || '').replace(/ (Próximo ponto daqui a|Daqui à chegada são) [\d,]+ km\.| O próximo ponto vem logo a seguir\./, '').trim();
  const home = a.kind === 'chegada' || b.kind === 'chegada';
  const m = { ...(home ? b : a), id: a.id, km_a: Math.min(a.km_a, b.km_a), km_b: Math.max(a.km_b, b.km_b), confirm: a.confirm || b.confirm, notes: [...new Set([...(a.notes || []), ...(b.notes || []), a.kind, b.kind])] };
  m.kind = home ? 'chegada' : a.kind; m.maneuver = home ? 'chegada' : a.maneuver; m.title = home ? b.title : a.title;
  m.text = (strip(a.text) + ' ' + strip(b.text).replace(/^Km [\d,]+\.\s*/, '')).slice(0, 220);
  m.trigger_km = home ? b.trigger_km : a.trigger_km; m.lat = home ? b.lat : a.lat; m.lon = home ? b.lon : a.lon;
  P.points.splice(k, 2, m); P.photos.forEach(ph => { if (ph.pointId === b.id) ph.pointId = m.id; });
  D.refreshTails(P.points); renderPhotos(); changed(); toast('Pontos juntos. Reveja o texto.');
}

/* ---------- marca ---------- */
function renderBrand() {
  $('#iPlace').value = P.brand.place || ''; $('#iTitle').value = P.brand.title || ''; $('#iPhone').value = P.brand.phone || '';
  $('#iRoadL').value = (P.roadLabels || [])[0] || ''; $('#iRoadR').value = (P.roadLabels || [])[1] || '';
  $('#cPrim').value = P.brand.primary || '#b0531f'; $('#cAcc').value = P.brand.accent || '#c8652c'; $('#tCredit').checked = !!P.brand.credit;
  $('#logoBox').innerHTML = P.brand.logo ? `<img src="${P.brand.logo}" alt="Logótipo">` : '<span>Sem logótipo</span>';
  $('#tWelcome').value = P.texts.welcome || ''; $('#tBefore').value = P.texts.before || ''; $('#tNotes').value = (P.texts.notes || []).join('\n');
  renderContrast();
}
function renderContrast() {
  const prim = P.brand.primary || '#b0531f', acc = P.brand.accent || prim, r = B.passes(prim, acc), el = $('#contrast');
  const L = r.palette.light, Dk = r.palette.dark;
  const fmt = v => v.toFixed(1).replace('.', ',');
  if (r.exact) { el.className = 'contrast'; el.innerHTML = `Contraste no tema claro: ${fmt(L.ratios.primaryOnBg)}:1. Passa. No tema escuro o guia usa <b>${Dk.primary}</b> (${fmt(Dk.ratios.primaryOnBg)}:1).`; return; }
  el.className = 'contrast bad';
  el.innerHTML = `A cor principal não passa 4,5:1 (${fmt(B.contrast(prim, B.BG.light.bg))}:1). Cor mais próxima que passa: <b>${L.primary}</b>. <button type="button" class="btn small" id="bSuggest">Usar a sugestão</button>`;
  $('#bSuggest').onclick = () => { P.brand.primary = L.primary; renderBrand(); changed({ noList: true }); toast('Cor ajustada para passar o contraste.'); };
}
$('#iPlace').addEventListener('input', e => { const old = P.brand.place; P.brand.place = e.target.value.trim();
  if (!P.brand.title || P.brand.title === 'Chegar a ' + old) { P.brand.title = P.brand.place ? 'Chegar a ' + P.brand.place : ''; $('#iTitle').value = P.brand.title; }
  syncArrival(); changed({ noList: true }); });
$('#iPlace').addEventListener('change', () => renderPoints());
$('#iTitle').addEventListener('input', e => { P.brand.title = e.target.value; syncArrival(); changed({ noList: true }); });
$('#iTitle').addEventListener('change', () => renderPoints());
$('#iRoadL').addEventListener('input', e => { P.roadLabels = [e.target.value.trim(), (P.roadLabels || [])[1] || '']; changed({ noList: true }); });
$('#iRoadR').addEventListener('input', e => { P.roadLabels = [(P.roadLabels || [])[0] || '', e.target.value.trim()]; changed({ noList: true }); });
$('#iPhone').addEventListener('input', e => { P.brand.phone = e.target.value.trim(); changed({ noList: true }); });
$('#cPrim').addEventListener('input', e => { P.brand.primary = e.target.value; renderContrast(); changed({ noList: true }); });
$('#cAcc').addEventListener('input', e => { P.brand.accent = e.target.value; changed({ noList: true }); });
$('#tCredit').addEventListener('change', e => { P.brand.credit = e.target.checked; changed({ noList: true }); });
$('#tWelcome').addEventListener('input', e => { P.texts.welcome = e.target.value; changed({ noList: true }); });
$('#tBefore').addEventListener('input', e => { P.texts.before = e.target.value; changed({ noList: true }); });
$('#tNotes').addEventListener('input', e => { P.texts.notes = e.target.value.split('\n').map(s => s.trim()).filter(Boolean); changed({ noList: true }); });
$('#bRegenTexts').onclick = () => { regenTexts(true); changed({ noList: true }); };
$('#fLogo').addEventListener('change', e => { if (e.target.files[0]) importLogo(e.target.files[0]); e.target.value = ''; });
/* o texto da chegada acompanha o nome do local enquanto o André não o reescreve */
function syncArrival() {
  const pt = P.points.find(p => p.kind === 'chegada'); if (!pt || !P.brand.place) return;
  if (/^Chegada: /.test(pt.title)) pt.title = ('Chegada: ' + P.brand.place).slice(0, 40);
  pt.text = pt.text.replace(/Chegou [^.]*\. Bem-vindos!/, `Chegou ${placePhrase()}. Bem-vindos!`);
  if (P.texts.welcome) { P.texts.welcome = P.texts.welcome.replace(/até [^:]+:/, untilPhrase() + ':'); $('#tWelcome').value = P.texts.welcome; }
}

/* ---------- lista de verificação e exportação (R-S13 a R-S16) ---------- */
function photoExportData() {
  /* fotos reduzidas a 900 px, JPEG 0,72, sem EXIF; cache por id */
  const out = {}; P.photos.forEach(ph => { if (ph.pointId && ph.exp) out[ph.id] = ph.exp; }); return out;
}
async function prepareExportPhotos() {
  for (const ph of P.photos) if (ph.pointId && (!ph.exp || ph.expSrc !== ph.data.length)) {
    const r = await reencode(ph.data, 900, 0.72); Object.defineProperty(ph, 'exp', { value: r.data, writable: true, enumerable: false, configurable: true });
    Object.defineProperty(ph, 'expSrc', { value: ph.data.length, writable: true, enumerable: false, configurable: true });
  }
}
async function buildNavigator() {
  if (!P.track || !P.points.length) return null;
  await prepareExportPhotos();
  const cfg = PR.navigatorConfig(P, photoExportData());
  return NB.build(window.RB_NAV_TEMPLATE, cfg);
}
function renderChecklist() {
  const c = PR.checklist(P, lastSize), ul = $('#checklist');
  ul.innerHTML = c.items.map(i => `<li class="${i.ok ? 'ok' : ''}" data-id="${i.id}">${esc(i.label)}${i.detail ? `<small>${esc(i.detail)}</small>` : ''}</li>`).join('');
  $('#bExport').disabled = !c.ok; $('#bGpx').disabled = !P.track;
  return c;
}
function schedulePreview() { clearTimeout(buildTimer); buildTimer = setTimeout(updatePreview, 350); }
let pvTheme = 'light';
async function updatePreview() {
  try {
    const html = await buildNavigator();
    if (!html) { $('#pvEmpty').hidden = false; return; }
    lastHtml = html; lastSize = new Blob([html]).size; renderChecklist();
    const fr = $('#pv'); $('#pvEmpty').hidden = true;
    fr.onload = () => { applyPvTheme(); };
    fr.srcdoc = html;
  } catch (e) { $('#exportStatus').textContent = 'Pré-visualização indisponível: ' + e.message; }
}
function applyPvTheme() { try { const d = $('#pv').contentDocument; if (d) d.documentElement.setAttribute('data-theme', pvTheme); } catch (e) { /* pré-visualização noutro contexto */ } }
$$('[data-pv]').forEach(b => b.onclick = () => { pvTheme = b.dataset.pv; $$('[data-pv]').forEach(x => x.setAttribute('aria-pressed', x === b)); applyPvTheme(); });

/* simulação GPS na pré-visualização (R-S12): posições ao longo do trajecto */
let simTimer = null;
$('#bSim').onclick = () => {
  const fr = $('#pv'), w = fr.contentWindow; if (!w || !TRK) { toast('Largue um GPX primeiro.'); return; }
  if (simTimer) { clearInterval(simTimer); simTimer = null; $('#bSim').textContent = 'Simular GPS'; return; }
  let cb = null; const fake = { watchPosition(ok) { cb = ok; return 1; }, clearWatch() { cb = null; }, getCurrentPosition() {} };
  try { Object.defineProperty(w.navigator, 'geolocation', { value: fake, configurable: true }); } catch (e) { toast('Simulação indisponível.'); return; }
  const btn = w.document.getElementById('gps'); if (btn) btn.click();
  const steps = 60; let i = 0; $('#bSim').textContent = 'Parar simulação';
  simTimer = setInterval(() => {
    if (!cb || i > steps) { clearInterval(simTimer); simTimer = null; $('#bSim').textContent = 'Simular GPS'; return; }
    const q = G.pointAtDist(TRK.pts, TRK.total * i / steps); cb({ coords: { latitude: q.lat, longitude: q.lon, accuracy: 8 } }); i++;
  }, 450);
};

$('#bExport').onclick = async () => {
  const c = renderChecklist(); if (!c.ok) { toast('A lista de verificação ainda não passa.'); return; }
  const html = await buildNavigator(); const size = new Blob([html]).size; lastSize = size;
  if (!PR.checklist(P, size).ok) { renderChecklist(); toast('O ficheiro tem mais de 5 MB.'); return; }
  download(slug(P.brand.title || P.brand.place) + '.html', html, 'text/html');
  $('#exportStatus').textContent = `Navigator exportado: ${(size / 1048576).toFixed(2).replace('.', ',')} MB. ${PR.WARNING}`;
};
$('#bGpx').onclick = () => { if (!P.track) return; download(slug(P.brand.place || 'percurso') + '-pontos.gpx', PR.toGPX(P, TRK), 'application/gpx+xml'); };
function saveProject() { if (!P.track) { toast('Nada para guardar: largue um GPX primeiro.'); return; } download(slug(P.brand.place || 'percurso') + '.roadbook', PR.serialize(P), 'application/json'); toast('Projecto guardado.'); }
$('#bSave').onclick = saveProject; $('#bSave2').onclick = saveProject;
$('#fOpen').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { openProject(PR.deserialize(await f.text())); toast('Projecto aberto.'); } catch (err) { toast(err.message); } });
function openProject(p) {
  P = p; parsed = null; TRK = PR.activeTrack(P); sel = null; undoStack = []; $('#undoBar').hidden = true; $('#trackPick').hidden = true;
  if (P.track) { const full = G.prepare(P.track.pts.map(a => ({ lat: a[0], lon: a[1] }))); $('#rTrimA').max = $('#rTrimB').max = Math.max(100, Math.round(Math.min(2000, full.total / 3) / 10) * 10); $('#rTrimA').value = P.track.trimA || 0; $('#rTrimB').value = P.track.trimB == null ? 0 : Math.round(full.total - P.track.trimB); }
  $('#selTz').value = String(P.tz);
  renderBrand(); renderTrackInfo(); renderPhotos(); changed({ open: true });
}
$('#bNew').onclick = () => { if (P.track && !confirm('Começar um projecto novo? O trabalho actual fica só no ficheiro .roadbook, se o guardou.')) return; P = PR.emptyProject(); TRK = null; parsed = null; IDB.del('current'); $('#pv').srcdoc = ''; $('#pvEmpty').hidden = false; lastSize = null; renderBrand(); renderTrackInfo(); renderPhotos(); changed(); };

/* ---------- controlos do percurso ---------- */
$('#selTrack').addEventListener('change', e => useTrack(+e.target.value));
function trimFromSliders() {
  const full = G.prepare(P.track.pts.map(a => ({ lat: a[0], lon: a[1] }))), a = +$('#rTrimA').value, b = +$('#rTrimB').value;
  P.track.trimA = a; P.track.trimB = b ? full.total - b : null; $('#oTrimA').textContent = a + ' m'; $('#oTrimB').textContent = b + ' m';
}
['#rTrimA', '#rTrimB'].forEach(s => $(s).addEventListener('input', () => { if (!P.track) return; trimFromSliders(); TRK = PR.activeTrack(P); renderMap(); }));
$('#bRedraft').onclick = () => { if (!P.track) return; if (P.points.some(p => !p.confirm) && !confirm('Refazer o rascunho apaga as confirmações e correcções dos pontos. Continuar?')) return; trimFromSliders(); redraft(); };
const tzSel = $('#selTz'); for (let h = -12; h <= 14; h++) { const o = document.createElement('option'); o.value = h; o.textContent = 'UTC' + (h >= 0 ? '+' : '−') + Math.abs(h) + (h === 1 ? ' (Luanda, por omissão)' : ''); tzSel.appendChild(o); }
tzSel.value = '1';
tzSel.addEventListener('change', e => { P.tz = +e.target.value; P.photos.forEach(ph => { if (ph.source !== 'manual') { placeOne(ph); associate(ph, false); } }); renderPhotos(); changed(); });

/* ---------- largar ficheiros ---------- */
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('over'); } }));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { if (ev === 'dragleave' && e.relatedTarget) return; drop.classList.remove('over'); }));
document.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); handleFiles(e.dataTransfer.files); } });
$('#fFiles').addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; });
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fFiles').click(); } });

/* ---------- tema do Studio ---------- */
$('#bTheme').onclick = () => { const r = document.documentElement, dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; r.dataset.theme = dark ? 'light' : 'dark'; store('rb-studio-theme', r.dataset.theme); };
{ const t = store('rb-studio-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; }

/* ---------- onboarding (R-S18): visita guiada no primeiro uso e dicas por secção ---------- */
const TOUR = [
  ['#sTrack', 'Largue o GPX', 'Comece aqui: largue o GPX ou KML do anfitrião, o logótipo e as fotos. O Studio faz o rascunho completo sozinho.'],
  ['#sBrand', 'Marca do anfitrião', 'Confirme o nome do local, o logótipo e o contacto. As cores saem do logótipo e passam o contraste.'],
  ['#sPhotos', 'Fotos', 'As fotos com GPS ou hora ficam no sítio certo. As outras vão para a bandeja: arraste-as para o mapa.'],
  ['#sPoints', 'Confirmar os pontos', 'O seu trabalho é este: confirmar os pontos "a confirmar". Corrija só o que estiver errado.'],
  ['#sExport', 'Exportar', 'Quando a lista passar, exporte o Navigator. Sai um só ficheiro HTML para enviar aos convidados.']
];
let tourI = 0;
function showTour(i) {
  $$('.spot').forEach(e => e.classList.remove('spot'));
  if (i >= TOUR.length) { $('#tour').hidden = true; store('rb-studio-tour', '1'); return; }
  const [s, t, p] = TOUR[i]; tourI = i; $('#tour').hidden = false;
  $('#tourStep').textContent = `Visita guiada · ${i + 1} de ${TOUR.length}`; $('#tourT').textContent = t; $('#tourP').textContent = p;
  $('#tourNext').textContent = i === TOUR.length - 1 ? 'Começar' : 'Seguinte';
  const el = $(s); el.classList.add('spot'); el.scrollIntoView({ block: 'nearest' });
  $('#tourNext').focus();
}
$('#tourNext').onclick = () => showTour(tourI + 1);
$('#tourSkip').onclick = () => showTour(TOUR.length);
$('#bTour').onclick = () => showTour(0);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#tour').hidden) showTour(TOUR.length); });
function tips() {
  $$('[data-tip-id]').forEach(t => { if (store('rb-tip-' + t.dataset.tipId) !== '1') t.hidden = false; });
  $$('.tipok').forEach(b => b.onclick = () => { const t = b.closest('[data-tip-id]'); t.hidden = true; store('rb-tip-' + t.dataset.tipId, '1'); });
  $$('.tipbtn').forEach(b => b.onclick = () => { const t = document.querySelector(`[data-tip-id="${b.dataset.tipfor}"]`); t.hidden = !t.hidden; });
}

/* ---------- arranque ---------- */
$('#privacy').textContent = PR.WARNING;
new ResizeObserver(() => renderMap()).observe($('#mapwrap'));
renderBrand(); renderChecklist(); tips();
if (store('rb-studio-tour') !== '1') showTour(0);
IDB.get('current').then(saved => {
  if (!saved) return; let p; try { p = PR.deserialize(saved); } catch (e) { return; }
  if (!p.track) return; $('#restore').hidden = false;
  $('#bRestore').onclick = () => { $('#restore').hidden = true; openProject(p); toast('Trabalho recuperado.'); };
  $('#bDiscard').onclick = () => { $('#restore').hidden = true; IDB.del('current'); };
});
window.RBStudio = { get project() { return P; }, openProject, handleFiles, buildNavigator };
})();
