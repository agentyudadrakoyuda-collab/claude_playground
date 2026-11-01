/* Roadbook · geometria partilhada (Studio, Navigator e testes Node). */
(function (root) {
  'use strict';
  const RAD = Math.PI / 180, R_EARTH = 6371008.8;

  function hav(a, b) {
    const dl = (b.lat - a.lat) * RAD, dn = (b.lon - a.lon) * RAD;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dn / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD);
    const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }
  /* diferença de rumo com sinal, em graus, no intervalo ]-180, 180]. Positivo = direita. */
  function turn(b1, b2) { let d = (b2 - b1) % 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d; }

  /* Prepara um trajecto: distância acumulada (m), tempo (ms), velocidade (m/s). */
  function prepare(pts) {
    const P = pts.map(p => ({ lat: +p.lat, lon: +p.lon, ele: p.ele == null || isNaN(p.ele) ? null : +p.ele, t: p.t == null || isNaN(p.t) ? null : +p.t }));
    let d = 0;
    for (let i = 0; i < P.length; i++) { if (i) d += hav(P[i - 1], P[i]); P[i].d = d; }
    const hasTime = P.length > 1 && P.every(p => p.t != null) && P[P.length - 1].t > P[0].t;
    if (hasTime) {
      /* velocidade numa janela de ±3 s, robusta ao ruído do GPS */
      let j0 = 0, j1 = 0;
      for (let i = 0; i < P.length; i++) {
        while (P[i].t - P[j0].t > 3000) j0++;
        if (j1 < i) j1 = i;
        while (j1 < P.length - 1 && P[j1 + 1].t - P[i].t <= 3000) j1++;
        const dt = (P[j1].t - P[j0].t) / 1000;
        P[i].v = dt > 0 ? (P[j1].d - P[j0].d) / dt : 0;
      }
    }
    return { pts: P, total: d, hasTime, duration: hasTime ? P[P.length - 1].t - P[0].t : null };
  }

  function idxAtDist(P, m) { let lo = 0, hi = P.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (P[mid].d < m) lo = mid + 1; else hi = mid; } return lo; }
  function pointAtDist(P, m) {
    if (m <= 0) return { lat: P[0].lat, lon: P[0].lon, ele: P[0].ele, t: P[0].t };
    const i = idxAtDist(P, m); if (i === 0) return { ...P[0] };
    const a = P[i - 1], b = P[i], f = b.d > a.d ? (m - a.d) / (b.d - a.d) : 0;
    const L = (x, y) => (x == null || y == null) ? (x ?? y) : x + (y - x) * f;
    return { lat: L(a.lat, b.lat), lon: L(a.lon, b.lon), ele: L(a.ele, b.ele), t: L(a.t, b.t), d: m };
  }
  /* posição no trajecto para um instante (ms). Devolve null fora do intervalo gravado (com 60 s de folga). */
  function pointAtTime(P, t) {
    if (!P.length || P[0].t == null) return null;
    if (t < P[0].t - 60000 || t > P[P.length - 1].t + 60000) return null;
    if (t <= P[0].t) return { ...P[0] }; if (t >= P[P.length - 1].t) return { ...P[P.length - 1] };
    let lo = 0, hi = P.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (P[mid].t < t) lo = mid + 1; else hi = mid; }
    const a = P[lo - 1], b = P[lo], f = (t - a.t) / (b.t - a.t || 1);
    return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, d: a.d + (b.d - a.d) * f, t };
  }
  /* ponto do trajecto mais próximo de uma posição: distância perpendicular aos segmentos. */
  function nearest(P, q) {
    const kx = 111320 * Math.cos(q.lat * RAD), kz = 110540;
    let best = { dist: Infinity, d: 0, i: 0 };
    for (let i = 1; i < P.length; i++) {
      const ax = (P[i - 1].lon - q.lon) * kx, az = (P[i - 1].lat - q.lat) * kz, bx = (P[i].lon - q.lon) * kx, bz = (P[i].lat - q.lat) * kz;
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
      let f = L2 ? -(ax * vx + az * vz) / L2 : 0; f = Math.max(0, Math.min(1, f));
      const x = ax + vx * f, z = az + vz * f, dist = Math.hypot(x, z);
      if (dist < best.dist) best = { dist, d: P[i - 1].d + (P[i].d - P[i - 1].d) * f, i };
    }
    return best;
  }
  function smooth(arr, half) {
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) { let s = 0, n = 0; for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) if (arr[j] != null) { s += arr[j]; n++; } out[i] = n ? s / n : null; }
    return out;
  }
  /* reamostra o trajecto a passo fixo (m). Mantém tempo e altitude interpolados. */
  function resample(P, step) { const out = []; for (let m = 0; m <= P[P.length - 1].d; m += step) out.push(pointAtDist(P, m)); return out; }

  function climb(P) {
    const e = smooth(P.map(p => p.ele), 5); let up = 0, down = 0, last = null;
    for (const v of e) { if (v == null) continue; if (last != null) { const dv = v - last; if (Math.abs(dv) >= 1) { if (dv > 0) up += dv; else down -= dv; last = v; } } else last = v; }
    return { up, down };
  }

  const fmtKm = (m, dec = 1) => (m / 1000).toLocaleString('pt-PT', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const fmtMin = ms => Math.max(1, Math.round(ms / 60000));

  const api = { RAD, hav, bearing, turn, prepare, idxAtDist, pointAtDist, pointAtTime, nearest, smooth, resample, climb, fmtKm, fmtMin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RBGeo = api;
})(typeof window !== 'undefined' ? window : globalThis);
