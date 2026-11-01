/* Roadbook · projecto (.roadbook), colocação de fotos, lista de verificação, configuração do Navigator e GPX. */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const G = node ? require('./geo.js') : root.RBGeo, B = node ? require('./brand.js') : root.RBBrand, X = node ? require('./exif.js') : root.RBExif;

  const FORMAT = 'drakoyuda-roadbook', VERSION = 1;
  const WARNING = 'Este ficheiro contém a localização do anfitrião. Partilhe só com os convidados.';

  function emptyProject() {
    return {
      format: FORMAT, version: VERSION, created: null, updated: null,
      track: null,           /* {name, file, pts:[[lat,lon,ele|null,t|null]], trimA, trimB} (m) */
      road: [],              /* [[lat,lon]] estrada de acesso (OSM ou manual) */
      roadLabels: ['', ''],
      brand: { place: '', title: '', logo: '', phone: '', primary: '', accent: '', fromLogo: false, credit: false },
      texts: { welcome: '', before: '', notes: [] },
      points: [],            /* ver draft.js */
      photos: [],            /* {id,name,data(dataURL sem EXIF),w,h,lat,lon,source:'gps'|'hora'|'manual'|null,t,pointId} */
      tz: 1, osm: null, recorded: ''
    };
  }

  /* trajecto activo (com corte do início e do fim), já preparado */
  function activeTrack(p) {
    if (!p.track) return null;
    const all = G.prepare(p.track.pts.map(a => ({ lat: a[0], lon: a[1], ele: a[2], t: a[3] })));
    const a = p.track.trimA || 0, b = p.track.trimB == null ? all.total : p.track.trimB;
    const pts = all.pts.filter(q => q.d >= a - 1e-6 && q.d <= b + 1e-6).map(q => ({ lat: q.lat, lon: q.lon, ele: q.ele, t: q.t }));
    return G.prepare(pts);
  }

  /* R-S6 · colocação de uma foto a partir do EXIF */
  function placePhoto(tr, exif, tzHours) {
    if (exif.gps) { const n = G.nearest(tr.pts, exif.gps); return { lat: exif.gps.lat, lon: exif.gps.lon, source: 'gps', t: null, along: n.d, off: n.dist }; }
    if (exif.date) {
      const t = X.exifToUtc(exif.date, tzHours, exif.offset), q = t == null ? null : G.pointAtTime(tr.pts, t);
      if (q) return { lat: q.lat, lon: q.lon, source: 'hora', t, along: q.d, off: 0 };
    }
    return { lat: null, lon: null, source: null, t: null };
  }
  /* R-S8 · ponto mais próximo a 150 m ou menos (distância no terreno) */
  function nearestPoint(points, lat, lon, max = 150) {
    let best = null;
    points.forEach(pt => { const d = G.hav({ lat, lon }, pt); if (d <= max && (!best || d < best.d)) best = { id: pt.id, d }; });
    return best;
  }

  function sortPoints(p) { p.points.sort((a, b) => a.km_a - b.km_a || (a.kind === 'chegada') - (b.kind === 'chegada')); return p.points; }

  /* R-S13 · lista de verificação */
  function checklist(p, sizeBytes) {
    const pts = p.points, out = [];
    const add = (id, ok, label, detail) => out.push({ id, ok: !!ok, label, detail: detail || '' });
    const pend = pts.filter(x => x.confirm);
    add('confirmados', pts.length && !pend.length, 'Não há pontos "a confirmar"', pend.length ? pend.length + ' por confirmar: ' + pend.map(x => 'km ' + G.fmtKm(x.km_a * 1000)).join(', ') : '');
    const noTxt = pts.filter(x => !(x.text || '').trim() || !(x.title || '').trim());
    add('instrucoes', pts.length && !noTxt.length, 'Todos os pontos têm título e instrução', noTxt.length ? noTxt.length + ' sem texto' : '');
    add('extremos', pts.length >= 2 && pts[0].kind === 'inicio' && pts[pts.length - 1].kind === 'chegada', 'O primeiro ponto é a saída do asfalto e o último é a chegada');
    const br = p.brand, miss = [!br.place && 'nome do local', !br.logo && 'logótipo', !br.phone && 'contacto'].filter(Boolean);
    add('marca', !miss.length, 'Marca completa: nome, logótipo e contacto', miss.length ? 'Falta: ' + miss.join(', ') : '');
    const pa = B.passes(br.primary || '#b0531f', br.accent || br.primary || '#c8652c');
    add('contraste', pa.ok && pa.exact, 'A marca passa o contraste de 4,5:1', pa.exact ? '' : 'A cor escolhida não passa. Use a sugestão.');
    add('tamanho', sizeBytes != null && sizeBytes <= 5 * 1024 * 1024, 'O ficheiro tem 5 MB ou menos', sizeBytes == null ? 'por calcular' : (sizeBytes / 1048576).toFixed(2).replace('.', ',') + ' MB');
    return { items: out, ok: out.every(i => i.ok) };
  }

  /* Douglas-Peucker em metros, para o mapa SVG do Navigator */
  function simplify(pts, tol) {
    if (pts.length < 3) return pts.slice();
    const lat0 = pts[0][0], kx = 111320 * Math.cos(lat0 * Math.PI / 180), kz = 110540, P = pts.map(p => [p[1] * kx, p[0] * kz]);
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); let md = 0, mi = -1;
      const [ax, ay] = P[a], [bx, by] = P[b], L = Math.hypot(bx - ax, by - ay) || 1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((by - ay) * P[i][0] - (bx - ax) * P[i][1] + bx * ay - by * ax) / L; if (d > md) { md = d; mi = i; } }
      if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  /* **negrito** → <strong>; o resto é escapado */
  const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  /* GPX do percurso com os pontos como waypoints (R-S15 e motor 3D) */
  function toGPX(p, tr) {
    tr = tr || activeTrack(p);
    const x = s => esc(s);
    const w = p.points.map((pt, k) => `<wpt lat="${pt.lat.toFixed(6)}" lon="${pt.lon.toFixed(6)}"><name>${x(pt.kind === 'chegada' ? (p.brand.place || 'Chegada') : (k + 1) + ' · ' + pt.title)}</name><desc>${x((pt.text || '').replace(/\*\*/g, '').slice(0, 120))}</desc><sym>${pt.kind === 'chegada' ? 'Residence' : 'Waypoint'}</sym></wpt>`).join('\n');
    const t = tr.pts.map(q => `<trkpt lat="${q.lat.toFixed(7)}" lon="${q.lon.toFixed(7)}">${q.ele != null ? `<ele>${q.ele.toFixed(1)}</ele>` : ''}${q.t != null ? `<time>${new Date(q.t).toISOString().replace('.000Z', 'Z')}</time>` : ''}</trkpt>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="DrakoYuda Roadbook" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${x(p.brand.title || p.brand.place)}</name></metadata>\n${w}\n<trk><name>${x(p.brand.place || 'Percurso')}</name><trkseg>\n${t}\n</trkseg></trk>\n</gpx>\n`;
  }

  /* Configuração do Navigator (window.RB). photos: {id: dataURL reduzido a 900 px, sem EXIF} */
  function navigatorConfig(p, photoData) {
    const tr = activeTrack(p), total = tr.total, pal = B.palette(p.brand.primary || '#b0531f', p.brand.accent || p.brand.primary || '#c8652c');
    const pts = sortPoints(p), place = p.brand.place || 'destino';
    const img = {}, steps = [{ intro: true, title: 'Antes de sair' }];
    pts.forEach((pt, k) => {
      const s = { a: +(Math.max(0, pt.km_a)).toFixed(2), b: +(Math.max(pt.km_a, pt.km_b)).toFixed(2), title: pt.title, text: rich(pt.text), m: pt.maneuver };
      if (pt.kind === 'chegada') { s.home = true; s.a = +(Math.min(pt.km_a, pt.km_b)).toFixed(2); }
      const ph = p.photos.find(f => f.pointId === pt.id && photoData[f.id]);
      if (ph) { img[ph.id] = photoData[ph.id]; s.img = ph.id; s.cap = ph.caption || pt.caption || pt.title; }
      steps.push(s);
    });
    /* a chegada fica no fim do trajecto; se o ponto foi fundido com uma descida, "a" é o início */
    const trig = [null].concat(pts.map((pt, k) => k === 0 ? -1 : +pt.trigger_km));
    const trk = simplify(tr.pts.map(q => [+q.lat.toFixed(5), +q.lon.toFixed(5)]), 2.5);
    const mins = tr.duration ? G.fmtMin(tr.duration) : Math.max(1, Math.round(total / 1000 / 25 * 60));
    const slow = pts.filter(pt => pt.kind === 'lento' || (pt.notes || []).includes('lento'));
    return {
      v: 1, title: p.brand.title || ('Chegar a ' + place), place, logo: p.brand.logo || '', phone: p.brand.phone || '',
      pal, credit: !!p.brand.credit, welcome: p.texts.welcome, before: p.texts.before,
      notes: (p.texts.notes && p.texts.notes.length ? p.texts.notes : slow.map(pt => `Ao km ${G.fmtKm(pt.km_a * 1000)} há um troço lento (ponte, buraco ou areia). É normal, siga devagar.`)),
      totalKm: +(total / 1000).toFixed(2), mins, steps, trig, trk, road: p.road || [], roadLabels: p.roadLabels || ['', ''],
      img, gpx: toGPX(p, tr), recorded: p.recorded || (tr.pts[0].t ? new Date(tr.pts[0].t).toISOString().slice(0, 10) : ''),
      key: 'rb-' + hashStr(place + total.toFixed(0))
    };
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  /* serialização estável do .roadbook (AC8: guardar e reabrir dá o mesmo) */
  function serialize(p) { return JSON.stringify(p, null, 1); }
  function deserialize(text) {
    const o = JSON.parse(text);
    if (!o || o.format !== FORMAT) throw new Error('Este ficheiro não é um projecto .roadbook.');
    if (o.version > VERSION) throw new Error('Projecto de uma versão mais recente do Studio.');
    return Object.assign(emptyProject(), o);
  }

  const api = { FORMAT, VERSION, WARNING, emptyProject, activeTrack, placePhoto, nearestPoint, sortPoints, checklist, simplify, rich, esc, toGPX, navigatorConfig, serialize, deserialize };
  if (node) module.exports = api; else root.RBProject = api;
})(typeof window !== 'undefined' ? window : globalThis);
