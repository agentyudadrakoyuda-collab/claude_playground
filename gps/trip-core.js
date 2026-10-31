'use strict';
/* Trip core: reads GPX, works out the trip's metadata (speed, elevation, heading, turns, stops,
   GPS gaps) and builds one self-contained interactive HTML viewer for it. Used by the recorder
   and by the viewer page. */
const TripCore = (() => {
  const R = 6378137, D2R = Math.PI / 180;
  const hav = (lon1, lat1, lon2, lat2) => { const a = lat1 * D2R, b = lat2 * D2R, h = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin((lon2 - lon1) * D2R / 2) ** 2; return 2 * 6371008.8 * Math.asin(Math.sqrt(h)); };
  const bearing = (lon1, lat1, lon2, lat2) => { const y = Math.sin((lon2 - lon1) * D2R) * Math.cos(lat2 * D2R), x = Math.cos(lat1 * D2R) * Math.sin(lat2 * D2R) - Math.sin(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.cos((lon2 - lon1) * D2R); return (Math.atan2(y, x) / D2R + 360) % 360; };
  const angDiff = (a, b) => { let d = b - a; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
  const mercX = lon => R * lon * D2R, mercY = lat => R * Math.log(Math.tan(Math.PI / 4 + lat * D2R / 2));
  const tileSpan = z => 2 * Math.PI * R / 2 ** z;
  const tileOf = (mx, my, z) => [Math.floor((mx + Math.PI * R) / tileSpan(z)), Math.floor((Math.PI * R - my) / tileSpan(z))];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- GPX in and out ---------- */
  function parseGPX(text, fallbackName) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('This file isn’t valid GPX.');
    const nm = doc.querySelector('trk > name, metadata > name, rte > name');
    const num = (e, tag) => { const x = e.getElementsByTagNameNS('*', tag)[0]; return x ? parseFloat(x.textContent) : NaN; };
    const pt = e => {
      const tm = e.getElementsByTagNameNS('*', 'time')[0];
      return { t: tm ? Date.parse(tm.textContent.trim()) : NaN, lat: +e.getAttribute('lat'), lon: +e.getAttribute('lon'), ele: num(e, 'ele'), spd: num(e, 'speed'), crs: num(e, 'course') };
    };
    const segs = [];
    for (const s of doc.getElementsByTagNameNS('*', 'trkseg')) segs.push([...s.getElementsByTagNameNS('*', 'trkpt')].map(pt));
    if (!segs.some(s => s.length > 1)) for (const r of doc.getElementsByTagNameNS('*', 'rte')) segs.push([...r.getElementsByTagNameNS('*', 'rtept')].map(pt));
    const clean = segs.map(s => s.filter(p => isFinite(p.lat) && isFinite(p.lon))).filter(s => s.length > 1);
    if (!clean.length) throw new Error('This file has no track points.');
    let timed = clean.every(s => s.every(p => isFinite(p.t)));
    if (!timed) { let t = Date.UTC(2000, 0, 1); clean.forEach(s => s.forEach((p, i) => { if (i) t += hav(s[i - 1].lon, s[i - 1].lat, p.lon, p.lat) / 11.1 * 1000; p.t = t; })); }
    return { name: (nm && nm.textContent.trim()) || fallbackName || 'Trip', segs: clean, timed };
  }
  function toGPX(name, segs) {
    const f = (v, d) => isFinite(v) ? (+v).toFixed(d) : null;
    const body = segs.map(s => '  <trkseg>\n' + s.map(p => {
      const ext = [f(p.spd, 2) != null ? `<speed>${f(p.spd, 2)}</speed>` : '', f(p.crs, 1) != null ? `<course>${f(p.crs, 1)}</course>` : '', f(p.acc, 1) != null ? `<accuracy>${f(p.acc, 1)}</accuracy>` : ''].join('');
      return `   <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${f(p.ele, 1) != null ? `<ele>${f(p.ele, 1)}</ele>` : ''}<time>${new Date(p.t).toISOString()}</time>${ext ? `<extensions>${ext}</extensions>` : ''}</trkpt>`;
    }).join('\n') + '\n  </trkseg>').join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="GPS Recorder" xmlns="http://www.topografix.com/GPX/1/1">\n <metadata><name>${esc(name)}</name></metadata>\n <trk><name>${esc(name)}</name>\n${body}\n </trk>\n</gpx>\n`;
  }

  /* ---------- metadata ---------- */
  function analyze(trip) {
    // 1. clean points: drop duplicates and GPS spikes, hold position while standing still, split at long pauses
    const P = []; let seg = -1, d = 0, prevEnd = null;
    for (const s of trip.segs) {
      seg++; let last = null;
      for (const q of s) {
        let gap = false;
        if (!last && prevEnd) { gap = true; d += hav(prevEnd.lon, prevEnd.lat, q.lon, q.lat); } // a new GPX segment: recording was paused
        else if (last) {
          const dt = (q.t - last.t) / 1000; if (dt < 0.5) continue;
          const dd = hav(last.lon, last.lat, q.lon, q.lat);
          if (dt > 30 && dd > 150) { seg++; gap = true; d += dd; }
          else {
            if (dd / dt > 70) continue;
            if (dd < 2) { P.push(last = { ...last, t: q.t, ele: isFinite(q.ele) ? q.ele : last.ele, spd: q.spd, gap: false }); continue; }
            d += dd;
          }
        }
        P.push(last = { t: q.t, lat: q.lat, lon: q.lon, ele: isFinite(q.ele) ? q.ele : null, spd: q.spd, d, seg, gap });
      }
      if (last) prevEnd = last;
    }
    if (P.length < 2) throw new Error('Not enough usable points in this trip.');
    const t0 = P[0].t, n = P.length;
    // 2. speed: GPS speed when the phone reports it, otherwise from distance over ±4 s; then a median filter
    for (let i = 0, j = 0, k = 0; i < n; i++) {
      const p = P[i]; while (P[j].seg !== p.seg) j++; while (j < i && P[j + 1].t <= p.t - 4000) j++;
      if (k < i) k = i; while (k + 1 < n && P[k].t < p.t + 4000 && P[k + 1].seg === p.seg) k++;
      const dt = (P[k].t - P[j].t) / 1000, derived = dt >= 3 ? (P[k].d - P[j].d) / dt : (i ? P[i - 1].v : 0);
      p.v = isFinite(p.spd) && p.spd >= 0 && p.spd < 90 ? p.spd : derived;
    }
    const raw = P.map(p => p.v);
    for (let i = 0; i < n; i++) { const w = []; for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) if (P[j].seg === P[i].seg) w.push(raw[j]); w.sort((a, b) => a - b); P[i].v = w[w.length >> 1]; }
    // 3. elevation: smoothed GPS altitude (replaced by terrain heights later when they are available)
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - 6); j <= Math.min(n - 1, i + 6); j++) if (P[j].ele != null) { s += P[j].ele; c++; } P[i].eleS = c ? s / c : null; }
    // 4. heading: direction over the 15 m before and after each point
    const at = dd => { let lo = 0, hi = n - 1; if (dd <= 0) return P[0]; if (dd >= P[n - 1].d) return P[n - 1]; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].d <= dd) lo = m; else hi = m; } return P[hi]; };
    for (const p of P) { const a = at(p.d - 15), b = at(p.d + 15); p.hdg = hav(a.lon, a.lat, b.lon, b.lat) > 5 ? bearing(a.lon, a.lat, b.lon, b.lat) : null; }
    for (let i = 1; i < n; i++) if (P[i].hdg == null) P[i].hdg = P[i - 1].hdg; for (let i = n - 2; i >= 0; i--) if (P[i].hdg == null) P[i].hdg = P[i + 1].hdg;
    // 5. turns: resample every 10 m, compare the heading 30 m before with 30 m after
    const turns = [], step = 10, total = P[n - 1].d, samples = [];
    for (let dd = 0; dd <= total; dd += step) samples.push(at(dd));
    const hd = []; for (let i = 0; i < samples.length - 1; i++) { const a = samples[i], b = samples[i + 1]; hd.push(a.seg === b.seg && hav(a.lon, a.lat, b.lon, b.lat) > 3 ? bearing(a.lon, a.lat, b.lon, b.lat) : null); }
    const W = 3, change = hd.map((_, i) => { if (i < W || i + W >= hd.length) return 0; const a = hd[i - W], b = hd[i + W - 1]; if (a == null || b == null) return 0; const sa = samples[i - W], sb = samples[i + W]; return sa.seg === sb.seg ? angDiff(a, b) : 0; });
    for (let i = 1; i < change.length - 1; i++) {
      const c = change[i]; if (Math.abs(c) < 30 || Math.abs(c) < Math.abs(change[i - 1]) || Math.abs(c) < Math.abs(change[i + 1])) continue;
      const dd = i * step, last = turns[turns.length - 1]; if (dd < 80 || dd > total - 80) continue; // GPS wobbles while setting off and parking
      if (last && dd - last.d < 60) { if (Math.abs(c) > Math.abs(last.angle)) turns.pop(); else continue; }
      const p = at(dd), a = Math.abs(c);
      turns.push({ d: dd, t: (p.t - t0) / 1000, lat: p.lat, lon: p.lon, angle: Math.round(c), dir: c > 0 ? 'right' : 'left', kind: a >= 155 ? 'U-turn' : a >= 115 ? 'sharp' : a >= 55 ? 'turn' : 'slight', v: p.v });
    }
    // 6. stops of 20 s or more, and GPS gaps
    const stops = []; let s0 = null;
    for (let i = 1; i < n; i++) {
      const slow = P[i].v < 0.8 && P[i].seg === P[i - 1].seg;
      if (slow && s0 == null) s0 = i - 1;
      if ((!slow || i === n - 1) && s0 != null) { const dur = (P[i - 1].t - P[s0].t) / 1000; if (dur >= 20) stops.push({ t: (P[s0].t - t0) / 1000, dur, d: P[s0].d, lat: P[s0].lat, lon: P[s0].lon }); s0 = null; }
    }
    const gaps = []; for (let i = 1; i < n; i++) if (P[i].gap) gaps.push({ t: (P[i - 1].t - t0) / 1000, dur: (P[i].t - P[i - 1].t) / 1000, d: P[i].d - P[i - 1].d });
    // 7. totals
    let moving = 0, climb = 0, descent = 0, maxV = 0, eMin = Infinity, eMax = -Infinity;
    for (let i = 1; i < n; i++) { const a = P[i - 1], b = P[i]; if (b.gap) continue; const dt = (b.t - a.t) / 1000; if ((b.d - a.d) / dt > 0.6) moving += dt; }
    P.forEach(p => { maxV = Math.max(maxV, p.v); if (p.eleS != null) { eMin = Math.min(eMin, p.eleS); eMax = Math.max(eMax, p.eleS); } });
    for (let i = 1; i < n; i++) if (P[i].eleS != null && P[i - 1].eleS != null && !P[i].gap) { const de = P[i].eleS - P[i - 1].eleS; if (de > 0) climb += de; else descent -= de; }
    const gapDist = gaps.reduce((a, g) => a + g.d, 0), elapsed = (P[n - 1].t - t0) / 1000;
    return {
      name: trip.name, start: t0, timed: trip.timed, points: P, turns, stops, gaps,
      stats: { dist: total, recordedDist: total - gapDist, elapsed, moving, avgMoving: moving ? (total - gapDist) / moving : 0, maxV, eMin: isFinite(eMin) ? eMin : null, eMax: isFinite(eMax) ? eMax : null, climb, descent,
        turnsL: turns.filter(t => t.dir === 'left').length, turnsR: turns.filter(t => t.dir === 'right').length, stops: stops.length, gapTime: gaps.reduce((a, g) => a + g.dur, 0) }
    };
  }

  /* ---------- self-contained viewer ---------- */
  const SRC = {
    three: 'https://unpkg.com/three@0.159.0/build/three.min.js',
    imagery: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    terrain: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
  };
  async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } })); }
  async function loadBitmap(url) { const r = await fetch(url); if (!r.ok) throw new Error('http ' + r.status); return createImageBitmap(await r.blob()); }
  async function mosaic(urlFn, z, mx0, my0, mx1, my1, onTile) {
    const [tx0, ty0] = tileOf(mx0, my1, z), [tx1, ty1] = tileOf(mx1, my0, z), nx = tx1 - tx0 + 1, ny = ty1 - ty0 + 1, cv = document.createElement('canvas');
    cv.width = nx * 256; cv.height = ny * 256; const ctx = cv.getContext('2d'), jobs = [];
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) jobs.push([x, y]);
    let failed = 0; await pool(jobs, 8, async ([x, y]) => { try { ctx.drawImage(await loadBitmap(urlFn(z, x, y)), (x - tx0) * 256, (y - ty0) * 256); } catch (e) { failed++; } onTile && onTile(); });
    const s = tileSpan(z), h = Math.PI * R;
    return { cv, ctx, failed, total: jobs.length, mx0: tx0 * s - h, my1: h - ty0 * s, mx1: (tx1 + 1) * s - h, my0: h - (ty1 + 1) * s };
  }

  /** Build the viewer HTML. Downloads the 3D engine, imagery and terrain now, so the file works offline later. */
  async function buildHTML(A, onProgress = () => {}) {
    const P = A.points;
    let w = 180, e = -180, s = 90, n = -90; P.forEach(p => { w = Math.min(w, p.lon); e = Math.max(e, p.lon); s = Math.min(s, p.lat); n = Math.max(n, p.lat); });
    const k = Math.cos((s + n) / 2 * D2R); let mx0 = mercX(w), mx1 = mercX(e), my0 = mercY(s), my1 = mercY(n);
    const pad = Math.max((mx1 - mx0) * 0.2, (my1 - my0) * 0.2, 1200 / k); mx0 -= pad; mx1 += pad; my0 -= pad; my1 += pad;
    let z = 17; while (z > 8) { const [a, b] = tileOf(mx0, my1, z), [c, d] = tileOf(mx1, my0, z); if (c - a + 1 <= 16 && d - b + 1 <= 16) break; z--; }
    onProgress('Downloading the 3D engine…');
    const three = await fetch(SRC.three).then(r => { if (!r.ok) throw new Error('Couldn’t download the 3D engine. Check your internet connection.'); return r.text(); });
    let img = null, got = 0;
    try { img = await mosaic(SRC.imagery, z, mx0, my0, mx1, my1, () => onProgress(`Satellite imagery ${++got}…`)); } catch (err) { img = null; }
    const imgOK = !!img && img.failed < img.total * 0.4;
    if (!img) img = { mx0, mx1, my0, my1 };
    const G = 160, heights = new Array(G * G).fill(0); let hasTerrain = false;
    try {
      onProgress('Terrain…');
      const zt = Math.min(Math.max(z - 2, 8), 14), ter = await mosaic(SRC.terrain, zt, img.mx0, img.my0, img.mx1, img.my1);
      if (ter.failed < ter.total * 0.3) {
        const px = ter.ctx.getImageData(0, 0, ter.cv.width, ter.cv.height).data, tw = ter.cv.width, th = ter.cv.height;
        const hAt = (x, y) => { x = Math.max(0, Math.min(tw - 1, x)); y = Math.max(0, Math.min(th - 1, y)); const o = (y * tw + x) * 4; return px[o] * 256 + px[o + 1] + px[o + 2] / 256 - 32768; };
        const sample = (mx, my) => { const fx = (mx - ter.mx0) / (ter.mx1 - ter.mx0) * tw - 0.5, fy = (ter.my1 - my) / (ter.my1 - ter.my0) * th - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0; return hAt(x0, y0) * (1 - ax) * (1 - ay) + hAt(x0 + 1, y0) * ax * (1 - ay) + hAt(x0, y0 + 1) * (1 - ax) * ay + hAt(x0 + 1, y0 + 1) * ax * ay; };
        for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) heights[r * G + c] = Math.round(Math.max(-50, sample(img.mx0 + (img.mx1 - img.mx0) * c / (G - 1), img.my1 - (img.my1 - img.my0) * r / (G - 1))) * 10) / 10;
        P.forEach(p => { p.terr = sample(mercX(p.lon), mercY(p.lat)); });
        hasTerrain = true;
      }
    } catch (err) { /* flat ground */ }
    const cx = (img.mx0 + img.mx1) / 2, cy = (img.my0 + img.my1) / 2, X = lon => (mercX(lon) - cx) * k, Z = lat => -(mercY(lat) - cy) * k, t0 = A.start;
    // elevation shown in the viewer: GPS altitude when recorded, terrain height otherwise
    const eleOf = p => p.eleS != null ? p.eleS : (p.terr != null ? p.terr : null);
    const thin = P.filter((p, i) => i === 0 || i === P.length - 1 || p.gap || hav(p.lon, p.lat, P[i - 1].lon, P[i - 1].lat) >= 4 || Math.abs(p.t - P[i - 1].t) > 5000);
    const r1 = v => Math.round(v * 10) / 10;
    const data = {
      name: A.name, start: t0, tz: -new Date(t0).getTimezoneOffset(), timed: A.timed,
      pts: thin.map(p => [r1(X(p.lon)), r1(Z(p.lat)), r1((p.t - t0) / 1000), Math.round(p.d), Math.round(p.v * 100) / 100, eleOf(p) == null ? null : r1(eleOf(p)), Math.round(p.hdg ?? 0), p.gap ? 1 : 0, +p.lat.toFixed(6), +p.lon.toFixed(6)]),
      turns: A.turns.map(t => ({ ...t, x: r1(X(t.lon)), z: r1(Z(t.lat)) })),
      stops: A.stops.map(s => ({ ...s, x: r1(X(s.lon)), z: r1(Z(s.lat)) })),
      gaps: A.gaps, stats: A.stats, eleSource: P.some(p => p.eleS != null) ? 'GPS' : hasTerrain ? 'terrain' : null,
      G, heights, hasTerrain, imgOK,
      bounds: [(img.mx0 - cx) * k, -(img.my1 - cy) * k, (img.mx1 - cx) * k, -(img.my0 - cy) * k],
      attribution: (imgOK ? 'Imagery © Esri, Maxar, Earthstar Geographics' : 'No imagery') + (hasTerrain ? ' · Terrain: AWS Terrain Tiles' : '')
    };
    const imgData = imgOK ? img.cv.toDataURL('image/jpeg', 0.85) : null;
    onProgress('Building the page…');
    return viewerHTML(data, imgData, three);
  }

  function viewerHTML(data, imgData, three) {
    const j = v => JSON.stringify(v).replace(/</g, '\\u003c');
    if (typeof TripView === 'undefined') throw new Error('trip-view.js is not loaded.');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">' +
      '<meta name="theme-color" content="#11171a"><title>' + esc(data.name) + '</title><style>' + TripView.css + '</style></head><body>' + TripView.body +
      '<script>' + three.replace(/<\/script/gi, '<\\/script') + '<\/script><script>const TRIP=' + j(data) + ';const TRIP_IMG=' + j(imgData) + ';(' + TripView.run.toString() + ')();<\/script></body></html>';
  }

  return { hav, bearing, parseGPX, toGPX, analyze, buildHTML, esc };
})();
