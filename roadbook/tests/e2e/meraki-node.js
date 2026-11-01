/* Constrói o projecto Meraki em Node, com os textos do v3 (regressão M2). As fotos vão como estão em sources/ (sem EXIF). */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const T = require('../../src/shared/tracks.js'), D = require('../../src/shared/draft.js'), G = require('../../src/shared/geo.js');
const PR = require('../../src/shared/project.js'), NB = require('../../src/shared/navbuild.js'), M = require('../fixtures/meraki-v3.js');
function merakiProject() {
  const g = T.parseGPX(fs.readFileSync(path.join(ROOT, 'sources', 'meraki-20261101-105849.gpx'), 'utf8'));
  const p = PR.emptyProject();
  p.track = { name: g.tracks[0].name, file: 'meraki-20261101-105849.gpx', pts: g.tracks[0].pts.map(q => [q.lat, q.lon, q.ele, q.t]), trimA: 0, trimB: null };
  const tr = PR.activeTrack(p);
  p.brand = { place: M.place, title: M.title, logo: 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(ROOT, 'tests/fixtures/meraki-logo.svg')).toString('base64'), phone: '+244 900 000 000', primary: '#b0531f', accent: '#c8652c', fromLogo: true, credit: false };
  p.road = M.road; p.roadLabels = M.roadLabels; p.recorded = M.recorded;
  p.texts = { welcome: M.welcome, before: M.before, notes: M.notes };
  const photos = {};
  p.points = M.steps.map((s, k) => {
    const q = G.pointAtDist(tr.pts, (s.home ? tr.total : (s.a + s.b) / 2 * 1000));
    const pt = { id: 'p' + (k + 1), km_a: s.a, km_b: s.b, kind: k === 0 ? 'inicio' : s.home ? 'chegada' : 'manobra', maneuver: s.m, confirm: false, conf: 'alta', why: [], lat: +q.lat.toFixed(6), lon: +q.lon.toFixed(6), photo: null, caption: s.cap || '', notes: [], title: s.title, text: s.text, trigger_km: M.trig[k] };
    if (s.img) { const id = 'f-' + s.img; photos[id] = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(ROOT, 'sources', 'foto-' + s.img + '.jpg')).toString('base64'); p.photos.push({ id, name: s.img + '.jpg', data: photos[id], lat: pt.lat, lon: pt.lon, source: 'manual', t: null, pointId: pt.id, caption: s.cap }); }
    return pt;
  });
  return { p, photos };
}
function buildMerakiNavigator() {
  const { p, photos } = merakiProject();
  const tpl = fs.readFileSync(path.join(ROOT, 'build', 'out', 'navigator-template.html'), 'utf8');
  return NB.build(tpl, PR.navigatorConfig(p, photos));
}
module.exports = { merakiProject, buildMerakiNavigator };
if (require.main === module) { const out = path.join(ROOT, 'build', 'out', 'meraki-node.html'); fs.writeFileSync(out, buildMerakiNavigator()); console.log(out); }
