/* Gera ficheiros de teste: fotos Meraki com EXIF de hora (AC2), uma foto com GPS, logótipos fictícios (AC5), KML e KMZ. */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const X = require('../../src/shared/exif.js'), M = require('./meraki-v3.js');
const D = __dirname, SRC = path.join(D, '..', '..', 'sources');
for (const p of M.photos) fs.writeFileSync(path.join(D, `meraki-${p.key}-hora.jpg`), X.injectExif(fs.readFileSync(path.join(SRC, `foto-${p.key}.jpg`)), p.time));
/* foto com GPS (ruínas) e foto sem hora nem GPS (vai para a bandeja) */
fs.writeFileSync(path.join(D, 'meraki-ruinas-gps.jpg'), X.injectExif(fs.readFileSync(path.join(SRC, 'foto-ruinas.jpg')), '2026:11:01 11:11:20', M.photos[2].real));
fs.copyFileSync(path.join(SRC, 'foto-planalto.jpg'), path.join(D, 'sem-metadados.jpg'));
/* "HEIC" mínimo: só a assinatura ftyp, para testar a mensagem */
fs.writeFileSync(path.join(D, 'foto.heic'), Buffer.from('000000186674797068656963000000006d696631686569630000', 'hex'));
/* logótipos */
fs.writeFileSync(path.join(D, 'meraki-logo.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80"><rect width="240" height="80" rx="14" fill="#b0531f"/><circle cx="40" cy="40" r="22" fill="#c8652c" stroke="#fff3e6" stroke-width="4"/><text x="74" y="52" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#fff3e6">Meraki</text></svg>`);
/* AC5: marca fictícia clara (amarelo-limão, difícil) e escura (azul-noite) */
fs.writeFileSync(path.join(D, 'marca-clara.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ffffff"/><circle cx="100" cy="100" r="80" fill="#f2d649"/><circle cx="100" cy="100" r="34" fill="#7fd1c2"/></svg>`);
fs.writeFileSync(path.join(D, 'marca-escura.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#0e1a3a"/><rect x="30" y="30" width="140" height="140" rx="20" fill="#14254f"/><circle cx="100" cy="100" r="40" fill="#5b2a86"/></svg>`);
/* KML e KMZ do mesmo trajecto (R-S1) */
const T = require('../../src/shared/tracks.js');
const g = T.parseGPX(fs.readFileSync(path.join(SRC, 'meraki-20261101-105849.gpx'), 'utf8'));
const pts = g.tracks[0].pts;
const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>Meraki</name>
<Placemark><name>Meraki gx</name><gx:Track>${pts.map(p => `<when>${new Date(p.t).toISOString()}</when>`).join('')}${pts.map(p => `<gx:coord>${p.lon} ${p.lat} ${p.ele}</gx:coord>`).join('')}</gx:Track></Placemark>
<Placemark><name>Outro trajecto</name><LineString><coordinates>13.5,-8.6,0 13.51,-8.61,0 13.52,-8.62,0</coordinates></LineString></Placemark></Document></kml>`;
fs.writeFileSync(path.join(D, 'meraki.kml'), kml);
function zip(name, data) {
  const raw = Buffer.from(data), comp = zlib.deflateRawSync(raw), crc = zlib.crc32 ? zlib.crc32(raw) : 0, nb = Buffer.from(name);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc >>> 0, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(crc >>> 0, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(raw.length, 24); cd.writeUInt16LE(nb.length, 28); cd.writeUInt32LE(0, 42);
  const cdOff = 30 + nb.length + comp.length, cdLen = 46 + nb.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cdLen, 12); end.writeUInt32LE(cdOff, 16);
  return Buffer.concat([lh, nb, comp, cd, nb, end]);
}
fs.writeFileSync(path.join(D, 'meraki.kmz'), zip('doc.kml', kml));
/* GPX sem tempos (R-A5/R-A6 não se aplicam) e sem fotos (AC2b) */
fs.writeFileSync(path.join(D, 'sem-tempos.gpx'), `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Sem tempos</name><trkseg>${pts.filter((_, i) => i % 3 === 0).map(p => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele></trkpt>`).join('')}</trkseg></trk></gpx>`);
console.log('fixtures ok');
