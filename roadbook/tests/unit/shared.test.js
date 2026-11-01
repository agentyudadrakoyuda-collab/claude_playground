/* Testes de unidade da biblioteca partilhada (M3): AC1, AC2, AC5, AC8 e parsers. Correr: node --test tests/unit/ */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), F = p => path.join(ROOT, 'tests', 'fixtures', p);
const G = require('../../src/shared/geo.js'), T = require('../../src/shared/tracks.js'), X = require('../../src/shared/exif.js');
const D = require('../../src/shared/draft.js'), B = require('../../src/shared/brand.js'), PR = require('../../src/shared/project.js');
const M = require('../fixtures/meraki-v3.js');
const GPX = fs.readFileSync(path.join(ROOT, 'sources', 'meraki-20261101-105849.gpx'), 'utf8');

test('GPX Meraki: um trajecto, 7,58 km, 18 min; os waypoints não entram na geometria (R-S2)', () => {
  const g = T.parseGPX(GPX);
  assert.equal(g.tracks.length, 1); assert.equal(g.wpts.length, 8);
  const tr = G.prepare(g.tracks[0].pts);
  assert.ok(Math.abs(tr.total - 7580) < 30, 'total ' + tr.total);
  assert.equal(Math.round(tr.duration / 60000), 18);
});

test('KML (gx:Track com tempos, dois trajectos) e KMZ sem rede (R-S1, R-S2)', async () => {
  const k = await T.parseAny('meraki.kml', fs.readFileSync(F('meraki.kml'), 'utf8'));
  assert.equal(k.tracks.length, 2); assert.equal(k.tracks[0].pts.length, 1081); assert.ok(k.tracks[0].pts[10].t > 0);
  const buf = fs.readFileSync(F('meraki.kmz'));
  const z = await T.parseAny('meraki.kmz', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.equal(z.tracks.length, 2); assert.equal(z.tracks[0].pts.length, 1081);
});

function draftMeraki() { return D.generate(T.parseGPX(GPX).tracks[0].pts, { placeName: 'Meraki' }); }

test('AC1 · o rascunho encontra as 8 entradas de controlo (km ±0,2) e a zona lenta das pontes', () => {
  const r = draftMeraki(), pts = r.points;
  assert.ok(pts.length <= 12, 'R-A10: no máximo 12 pontos');
  const report = [];
  for (const c of M.control) {
    const hit = pts.find(p => {
      const kinds = [p.kind].concat(p.notes || []);
      if (!c.kinds.some(k => kinds.includes(k))) return false;
      if (c.sides && p.kind === 'manobra' && p.maneuver !== c.sides[0]) return false;
      /* troço ou ponto: o início (ou o fim, para a chegada) a ±0,2 km da lista de controlo */
      return Math.abs(p.km_a - c.a) <= 0.2 || (p.kind === 'chegada' && Math.abs(p.km_a - c.b) <= 0.2);
    });
    report.push(`${c.n}. ${c.label}: ${hit ? `${hit.kind} km ${hit.km_a}` : 'NÃO ENCONTRADO'}`);
    assert.ok(hit, 'entrada ' + c.n + ' (' + c.label + ') não encontrada');
  }
  /* entrada 3: as duas manobras ficam num só ponto */
  const lr = pts.find(p => p.kind === 'manobra' && Math.abs(p.km_a - 2.7) <= 0.2);
  assert.match(lr.title, /esquerda e logo à direita/);
  /* entrada 8: a chegada e a descida existem */
  assert.ok(pts.some(p => p.kind === 'descida' && p.km_a >= 5.8 && p.km_a <= 6.2));
  assert.equal(pts[pts.length - 1].kind, 'chegada');
  const slow = pts.find(p => (p.kind === 'lento' || (p.notes || []).includes('lento')) && p.km_a <= M.slow.b + 0.2 && p.km_b >= M.slow.a - 0.2);
  assert.ok(slow, 'zona lenta das pontes (km 2,7–2,9) não encontrada');
  report.push(`zona lenta: km ${slow.km_a}–${slow.km_b}`);
  fs.mkdirSync(path.join(ROOT, 'build', 'out'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'build', 'out', 'ac1-relatorio.txt'), report.join('\n') + '\n\n' + pts.map(p => `${p.km_a}–${p.km_b} ${p.kind} [${p.conf}${p.confirm ? ', a confirmar' : ''}] ${p.title} :: ${p.text}`).join('\n') + '\n');
});

test('Rascunho: primeiro ponto é a saída do asfalto, último é a chegada com o nome do local; textos ≤ 220, títulos ≤ 40; gatilhos (R-A7, R-A8, R-A13)', () => {
  const pts = draftMeraki().points;
  assert.equal(pts[0].kind, 'inicio'); assert.equal(pts[0].trigger_km, -1);
  assert.match(pts[pts.length - 1].text, /Meraki/);
  for (const p of pts) {
    assert.ok(p.title.length <= 40 && p.text.length <= 220, p.title);
    assert.match(p.text, /Km \d+,\d/);
    if (p.kind === 'manobra') assert.ok(Math.abs(p.trigger_km - Math.max(0, p.km_a - 0.1)) < 0.011, 'gatilho 100 m antes');
    if (p.kind === 'troco') assert.equal(p.trigger_km, p.km_a);
  }
  /* sem OpenStreetMap, nenhuma manobra é "alta": todas ficam a confirmar (R-A2) */
  assert.ok(pts.filter(p => p.kind === 'manobra').every(p => p.confirm));
});

test('R-A2 · com junções OSM e descida de velocidade, a confiança sobe para alta', () => {
  const pts0 = T.parseGPX(GPX).tracks[0].pts, base = draftMeraki().points.filter(p => p.kind === 'manobra');
  const junctions = base.map(p => ({ lat: p.lat, lon: p.lon }));
  const r = D.generate(pts0, { placeName: 'Meraki', osm: { junctions, refs: [{ lat: base[0].lat, lon: base[0].lon, name: 'escola primária', kind: 'school' }] } });
  const man = r.points.filter(p => p.kind === 'manobra');
  assert.ok(man.some(p => p.conf === 'alta' && !p.confirm), 'pelo menos uma manobra com confiança alta');
  assert.ok(r.points.some(p => /Junto a escola primária/.test(p.text)), 'R-A9: referência OSM no texto');
});

test('GPX sem tempos: sem zonas lentas nem paragens; o rascunho completa-se (R-A5, AC2b)', () => {
  const g = T.parseGPX(fs.readFileSync(F('sem-tempos.gpx'), 'utf8'));
  const r = D.generate(g.tracks[0].pts, { placeName: 'Meraki' });
  assert.ok(r.points.length >= 4 && !r.points.some(p => p.kind === 'lento' || p.kind === 'paragem'));
  assert.equal(r.points[r.points.length - 1].kind, 'chegada');
});

test('AC2 · fotos com hora (UTC+1) ficam a 150 m ou menos da posição real', () => {
  const p = PR.emptyProject(); const g = T.parseGPX(GPX);
  p.track = { name: 'm', pts: g.tracks[0].pts.map(q => [q.lat, q.lon, q.ele, q.t]), trimA: 0, trimB: null };
  const tr = PR.activeTrack(p);
  for (const ph of M.photos) {
    const ex = X.readExif(fs.readFileSync(F(`meraki-${ph.key}-hora.jpg`)));
    assert.equal(ex.date, ph.time);
    const pl = PR.placePhoto(tr, ex, 1);
    assert.equal(pl.source, 'hora');
    const d = G.hav(pl, ph.real);
    assert.ok(d <= 150, `${ph.key}: ${d.toFixed(0)} m`);
  }
  /* foto com GPS usa o GPS; foto sem nada vai para a bandeja */
  const gps = PR.placePhoto(tr, X.readExif(fs.readFileSync(F('meraki-ruinas-gps.jpg'))), 1);
  assert.equal(gps.source, 'gps'); assert.ok(G.hav(gps, M.photos[2].real) < 5);
  assert.equal(PR.placePhoto(tr, X.readExif(fs.readFileSync(F('sem-metadados.jpg'))), 1).source, null);
  /* fuso errado (UTC+0) desloca a foto uma hora: fora do trajecto */
  assert.equal(PR.placePhoto(tr, X.readExif(fs.readFileSync(F('meraki-planalto-hora.jpg'))), 0).source, null);
  assert.ok(X.readExif(fs.readFileSync(F('foto.heic'))).isHeic);
});

test('AC5 · marcas fictícias clara e escura passam 4,5:1 nos textos; a cor exacta que falha recebe sugestão (R-S10)', () => {
  for (const [p, a] of [['#f2d649', '#7fd1c2'], ['#14254f', '#5b2a86']]) {
    const r = B.passes(p, a);
    for (const th of ['light', 'dark']) {
      const t = r.palette[th], bg = B.BG[th];
      assert.ok(B.contrast(t.primary, bg.bg) >= 4.5 && B.contrast(t.primary, bg.surface) >= 4.5, th + ' primária');
      assert.ok(B.contrast(t.onPrimary, t.primary) >= 4.5, th + ' texto sobre primária');
    }
  }
  assert.equal(B.passes('#f2d649', '#7fd1c2').exact, false); /* amarelo não passa: há sugestão */
  assert.equal(B.nearestPassing('#1d2420', ['#f3eee6']), '#1d2420');
});

test('AC8 · .roadbook guardado e reaberto fica idêntico', () => {
  const p = PR.emptyProject(); const g = T.parseGPX(GPX);
  p.track = { name: 'm', file: 'meraki.gpx', pts: g.tracks[0].pts.map(q => [q.lat, q.lon, q.ele, q.t]), trimA: 12.5, trimB: 7500 };
  p.points = draftMeraki().points; p.brand.place = 'Meraki'; p.brand.phone = '+244 900 000 000';
  p.photos = [{ id: 'f1', name: 'a.jpg', data: 'data:image/jpeg;base64,AAAA', lat: 1, lon: 2, source: 'hora', t: 1, pointId: 'p1' }];
  const s1 = PR.serialize(p), back = PR.deserialize(s1), s2 = PR.serialize(back);
  assert.equal(s2, s1); assert.deepEqual(back, p);
  assert.throws(() => PR.deserialize('{"format":"outro"}'));
});

test('GPX exportado (R-S15) tem os pontos como waypoints e volta a ler-se', () => {
  const p = PR.emptyProject(); const g = T.parseGPX(GPX);
  p.track = { name: 'm', pts: g.tracks[0].pts.map(q => [q.lat, q.lon, q.ele, q.t]) };
  p.points = draftMeraki().points; p.brand.place = 'Meraki';
  const back = T.parseGPX(PR.toGPX(p));
  assert.equal(back.wpts.length, p.points.length); assert.equal(back.tracks[0].pts.length, 1081);
  assert.equal(back.wpts[back.wpts.length - 1].name, 'Meraki');
});

test('EXIF: hasMetadata detecta APP1; JPEG sem APP1 dá falso', () => {
  assert.equal(X.hasMetadata(fs.readFileSync(F('meraki-cirilu-hora.jpg'))), true);
  assert.equal(X.hasMetadata(fs.readFileSync(F('sem-metadados.jpg'))), false);
});
