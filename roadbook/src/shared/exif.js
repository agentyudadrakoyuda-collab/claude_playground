/* Roadbook · EXIF de JPEG (hora e GPS) e verificação de ausência de EXIF. Sem dependências. */
(function (root) {
  'use strict';
  function readExif(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const out = { isJpeg: false, isHeic: false, date: null, offset: null, gps: null, orientation: 1 };
    if (u8.length > 12 && String.fromCharCode(...u8.subarray(4, 12)).match(/ftyp(heic|heix|mif1|msf1|hevc)/)) { out.isHeic = true; return out; }
    if (u8[0] !== 0xFF || u8[1] !== 0xD8) return out;
    out.isJpeg = true;
    let p = 2;
    while (p + 4 < u8.length) {
      if (u8[p] !== 0xFF) break;
      const mk = u8[p + 1], len = dv.getUint16(p + 2);
      if (mk === 0xDA || mk === 0xD9) break;
      if (mk === 0xE1 && String.fromCharCode(...u8.subarray(p + 4, p + 10)) === 'Exif\0\0') { parseTiff(dv, p + 10, out); break; }
      p += 2 + len;
    }
    return out;
  }
  function parseTiff(dv, t, out) {
    const le = dv.getUint16(t) === 0x4949;
    const u16 = o => dv.getUint16(t + o, le), u32 = o => dv.getUint32(t + o, le);
    const str = (o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = dv.getUint8(t + o + i); if (!c) break; s += String.fromCharCode(c); } return s; };
    const rat = o => { const a = u32(o), b = u32(o + 4); return b ? a / b : 0; };
    function ifd(off) {
      const tags = {}; if (off + 2 > dv.byteLength - t) return tags;
      const n = u16(off);
      for (let i = 0; i < n; i++) {
        const e = off + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
        const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 })[type] || 1, vo = size * cnt > 4 ? u32(e + 8) : e + 8;
        try {
          if (type === 2) tags[tag] = str(vo, cnt);
          else if (type === 3) tags[tag] = u16(vo);
          else if (type === 4) tags[tag] = u32(vo);
          else if (type === 5) { const a = []; for (let k = 0; k < cnt; k++) a.push(rat(vo + k * 8)); tags[tag] = cnt === 1 ? a[0] : a; }
          else if (type === 1 || type === 7) tags[tag] = dv.getUint8(t + vo);
        } catch (err) { /* etiqueta truncada: ignorar */ }
      }
      return tags;
    }
    const i0 = ifd(u32(4));
    if (i0[0x0112]) out.orientation = i0[0x0112];
    const ex = i0[0x8769] ? ifd(i0[0x8769]) : {};
    const d = ex[0x9003] || ex[0x9004] || i0[0x0132];
    if (d && /^\d{4}:\d\d:\d\d \d\d:\d\d:\d\d/.test(d)) out.date = d.slice(0, 19);
    if (ex[0x9011]) out.offset = ex[0x9011];
    if (i0[0x8825]) {
      const g = ifd(i0[0x8825]);
      const dms = a => Array.isArray(a) ? a[0] + (a[1] || 0) / 60 + (a[2] || 0) / 3600 : a;
      if (g[2] != null && g[4] != null) {
        let lat = dms(g[2]), lon = dms(g[4]);
        if (/S/i.test(g[1] || '')) lat = -lat; if (/W/i.test(g[3] || '')) lon = -lon;
        if (isFinite(lat) && isFinite(lon) && !(lat === 0 && lon === 0)) out.gps = { lat, lon };
      }
    }
  }
  /* "AAAA:MM:DD hh:mm:ss" na hora local da câmara + fuso (horas, ex. 1 para UTC+1) → ms UTC */
  function exifToUtc(date, tzHours, offsetStr) {
    const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(date || ''); if (!m) return null;
    let tz = tzHours;
    if (offsetStr && /^[+-]\d\d:\d\d$/.test(offsetStr)) tz = (offsetStr[0] === '-' ? -1 : 1) * (+offsetStr.slice(1, 3) + +offsetStr.slice(4, 6) / 60);
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - tz * 3600000;
  }
  /* true se o JPEG contém um segmento APP1 Exif ou XMP (usado nos testes de exportação) */
  function hasMetadata(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8[0] !== 0xFF || u8[1] !== 0xD8) return false;
    let p = 2;
    while (p + 4 < u8.length && u8[p] === 0xFF) {
      const mk = u8[p + 1]; if (mk === 0xDA || mk === 0xD9) break;
      if (mk === 0xE1) return true;
      p += 2 + dv.getUint16(p + 2);
    }
    return false;
  }
  /* escreve um APP1 Exif mínimo com DateTimeOriginal (e GPS opcional) num JPEG — só para testes */
  function injectExif(buf, date, gps) {
    const enc = s => Array.from(s).map(c => c.charCodeAt(0));
    const dt = enc(date).concat([0]);
    const entries = [], data = [];
    /* TIFF big-endian: IFD0 com ExifIFD (+GPS) */
    const hdr = [0x4D, 0x4D, 0, 42, 0, 0, 0, 8];
    const n0 = gps ? 2 : 1, ifd0Size = 2 + n0 * 12 + 4;
    const exifOff = 8 + ifd0Size, exifSize = 2 + 12 + 4, dtOff = exifOff + exifSize;
    const gpsOff = dtOff + dt.length, gpsSize = 2 + 4 * 12 + 4, ratOff = gpsOff + gpsSize;
    const be16 = v => [(v >> 8) & 255, v & 255], be32 = v => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
    const ent = (tag, type, cnt, val) => be16(tag).concat(be16(type), be32(cnt), val);
    let b = hdr.concat(be16(n0), ent(0x8769, 4, 1, be32(exifOff)));
    if (gps) b = b.concat(ent(0x8825, 4, 1, be32(gpsOff)));
    b = b.concat(be32(0), be16(1), ent(0x9003, 2, dt.length, be32(dtOff)), be32(0), dt);
    if (gps) {
      const dms = v => { v = Math.abs(v); const d = Math.floor(v), m = Math.floor((v - d) * 60), s = Math.round(((v - d) * 60 - m) * 60 * 1000); return [d, 1, m, 1, s, 1000]; };
      const la = dms(gps.lat), lo = dms(gps.lon);
      b = b.concat(be16(4), ent(1, 2, 2, [gps.lat < 0 ? 83 : 78, 0, 0, 0]), ent(2, 5, 3, be32(ratOff)), ent(3, 2, 2, [gps.lon < 0 ? 87 : 69, 0, 0, 0]), ent(4, 5, 3, be32(ratOff + 24)), be32(0));
      la.concat(lo).forEach(v => { b = b.concat(be32(v)); });
    }
    const app = [0xFF, 0xE1].concat(be16(b.length + 8), enc('Exif'), [0, 0], b);
    const u8 = new Uint8Array(buf), out = new Uint8Array(u8.length + app.length);
    out.set(u8.subarray(0, 2), 0); out.set(app, 2); out.set(u8.subarray(2), 2 + app.length);
    return out;
  }
  const api = { readExif, exifToUtc, hasMetadata, injectExif };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RBExif = api;
})(typeof window !== 'undefined' ? window : globalThis);
