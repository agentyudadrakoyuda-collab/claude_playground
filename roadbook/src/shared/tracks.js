/* Roadbook · leitura de GPX, KML e KMZ, sem rede e sem DOMParser (funciona também em Node). */
(function (root) {
  'use strict';
  const ent = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
  const strip = s => s.replace(/<(\/?)[\w.-]+:/g, '<$1'); /* remove prefixos de namespace */
  const tag = (xml, t) => { const m = new RegExp('<' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + t + '>', 'i').exec(xml); return m ? ent(m[1]).trim() : ''; };
  const all = (xml, t) => { const re = new RegExp('<' + t + '(\\s[^>]*)?(?:/>|>([\\s\\S]*?)</' + t + '>)', 'gi'); const out = []; let m; while ((m = re.exec(xml))) out.push({ attrs: m[1] || '', body: m[2] || '' }); return out; };
  const attr = (a, n) => { const m = new RegExp('\\b' + n + '\\s*=\\s*"([^"]*)"|\\b' + n + "\\s*=\\s*'([^']*)'", 'i').exec(a); return m ? (m[1] ?? m[2]) : null; };

  function parseGPX(text) {
    const xml = strip(text), tracks = [];
    all(xml, 'trk').forEach((t, k) => {
      const pts = [];
      all(t.body, 'trkpt').forEach(p => {
        const lat = parseFloat(attr(p.attrs, 'lat')), lon = parseFloat(attr(p.attrs, 'lon'));
        if (!isFinite(lat) || !isFinite(lon)) return;
        const e = tag(p.body, 'ele'), tm = tag(p.body, 'time');
        pts.push({ lat, lon, ele: e === '' ? null : parseFloat(e), t: tm ? Date.parse(tm) : null });
      });
      if (pts.length > 1) tracks.push({ name: tag(t.body.replace(/<trkseg[\s\S]*$/i, ''), 'name') || 'Trajecto ' + (k + 1), pts });
    });
    if (!tracks.length) { /* rotas (rte) como alternativa */
      all(xml, 'rte').forEach((r, k) => { const pts = all(r.body, 'rtept').map(p => ({ lat: parseFloat(attr(p.attrs, 'lat')), lon: parseFloat(attr(p.attrs, 'lon')), ele: null, t: null })); if (pts.length > 1) tracks.push({ name: tag(r.body, 'name') || 'Rota ' + (k + 1), pts }); });
    }
    const wpts = all(xml, 'wpt').map(w => ({ lat: parseFloat(attr(w.attrs, 'lat')), lon: parseFloat(attr(w.attrs, 'lon')), name: tag(w.body, 'name'), desc: tag(w.body, 'desc') }));
    return { tracks, wpts };
  }

  function parseKML(text) {
    const xml = strip(text), tracks = [];
    all(xml, 'Placemark').forEach((pm, k) => {
      const name = tag(pm.body.replace(/<(LineString|Track|MultiGeometry)[\s\S]*$/i, ''), 'name') || 'Trajecto ' + (k + 1);
      const trk = all(pm.body, 'Track'); /* gx:Track com tempos */
      if (trk.length) {
        trk.forEach(tr => {
          const when = all(tr.body, 'when').map(w => Date.parse(ent(w.body).trim()));
          const coords = all(tr.body, 'coord').map(c => ent(c.body).trim().split(/\s+/).map(Number));
          const pts = coords.map((c, i) => ({ lon: c[0], lat: c[1], ele: c.length > 2 ? c[2] : null, t: isFinite(when[i]) ? when[i] : null }));
          if (pts.length > 1) tracks.push({ name, pts });
        });
        return;
      }
      all(pm.body, 'LineString').forEach(ls => {
        const pts = tag(ls.body, 'coordinates').split(/\s+/).filter(Boolean).map(s => s.split(',').map(Number)).filter(c => isFinite(c[0]) && isFinite(c[1]))
          .map(c => ({ lon: c[0], lat: c[1], ele: c.length > 2 && isFinite(c[2]) ? c[2] : null, t: null }));
        if (pts.length > 1) tracks.push({ name, pts });
      });
    });
    return { tracks, wpts: [] };
  }

  /* KMZ = ZIP. Lê o directório central e descomprime o primeiro .kml com DecompressionStream (sem rede). */
  async function unzipFirstKML(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('KMZ inválido: não é um ficheiro ZIP.');
    const n = dv.getUint16(eocd + 10, true); let off = dv.getUint32(eocd + 16, true);
    const entries = [];
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), nl = dv.getUint16(off + 28, true), xl = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
      const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nl));
      entries.push({ name, method, csize, lho }); off += 46 + nl + xl + cl;
    }
    const e = entries.find(x => /\.kml$/i.test(x.name)); if (!e) throw new Error('KMZ sem ficheiro KML.');
    const lnl = dv.getUint16(e.lho + 26, true), lxl = dv.getUint16(e.lho + 28, true), start = e.lho + 30 + lnl + lxl;
    const data = u8.subarray(start, start + e.csize);
    if (e.method === 0) return new TextDecoder().decode(data);
    if (e.method !== 8) throw new Error('KMZ com compressão não suportada.');
    const ds = new DecompressionStream('deflate-raw');
    const out = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
    return new TextDecoder().decode(out);
  }

  /* Ponto de entrada: name + ArrayBuffer|string. Devolve {tracks:[{name,pts}], wpts}. */
  async function parseAny(name, data) {
    const isBuf = typeof data !== 'string';
    if (/\.kmz$/i.test(name) || (isBuf && new Uint8Array(data)[0] === 0x50 && new Uint8Array(data)[1] === 0x4b)) return parseKML(await unzipFirstKML(data));
    const text = isBuf ? new TextDecoder().decode(data) : data;
    if (/<kml[\s>]/i.test(text) || /\.kml$/i.test(name)) return parseKML(text);
    if (/<gpx[\s>]/i.test(text) || /\.gpx$/i.test(name)) return parseGPX(text);
    throw new Error('Formato desconhecido. Use GPX, KML ou KMZ.');
  }

  const api = { parseGPX, parseKML, unzipFirstKML, parseAny };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RBTracks = api;
})(typeof window !== 'undefined' ? window : globalThis);
