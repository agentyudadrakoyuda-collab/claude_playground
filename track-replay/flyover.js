'use strict';
/* Track Replay: "3D flyover" export.
   Builds one self-contained HTML file with Three.js, satellite imagery and terrain height around
   the route, and an animated camera that flies along the drive. Works without internet and can
   save the flight as a video. */

const FLY = {
  three: 'https://unpkg.com/three@0.159.0/build/three.min.js',
  imagery: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  terrain: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
  maxSide: 16,      // imagery tiles per side (16 × 256 px = 4096 px, the safe texture size on phones)
  grid: 160         // terrain samples per side
};

const MERC_R = 6378137;
const mercX = lon => MERC_R * lon * Math.PI / 180;
const mercY = lat => MERC_R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const tileSpan = z => 2 * Math.PI * MERC_R / 2 ** z;
const tileOf = (mx, my, z) => [Math.floor((mx + Math.PI * MERC_R) / tileSpan(z)), Math.floor((Math.PI * MERC_R - my) / tileSpan(z))];

async function loadBitmap(url) { const r = await fetch(url); if (!r.ok) throw new Error('http ' + r.status); return createImageBitmap(await r.blob()); }

/** Mosaic of tiles covering [mx0,my0]-[mx1,my1] at zoom z, drawn into one canvas. */
async function mosaic(urlFn, z, mx0, my0, mx1, my1, onTile) {
  const [tx0, ty0] = tileOf(mx0, my1, z), [tx1, ty1] = tileOf(mx1, my0, z);
  const nx = tx1 - tx0 + 1, ny = ty1 - ty0 + 1, cv = document.createElement('canvas');
  cv.width = nx * 256; cv.height = ny * 256; const ctx = cv.getContext('2d');
  const jobs = []; for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) jobs.push([x, y]);
  let failed = 0;
  await pool(jobs, 8, async ([x, y]) => { try { ctx.drawImage(await loadBitmap(urlFn(z, x, y)), (x - tx0) * 256, (y - ty0) * 256); } catch (e) { failed++; } onTile && onTile(); });
  const s = tileSpan(z), half = Math.PI * MERC_R;
  return { cv, ctx, failed, total: jobs.length, mx0: tx0 * s - half, my1: half - ty0 * s, mx1: (tx1 + 1) * s - half, my0: half - (ty1 + 1) * s };
}

let flyBusy = false;
async function exportFlyover(tr) {
  if (flyBusy) { toast('A 3D flyover is already being made.'); return; }
  flyBusy = true;
  try {
    // route points, thinned to one every 5 m
    const P = tr.pts.filter((p, i) => i === 0 || i === tr.pts.length - 1 || hav(p.lon, p.lat, tr.pts[i - 1].lon, tr.pts[i - 1].lat) >= 5);
    let w = 180, e = -180, s = 90, n = -90; P.forEach(p => { w = Math.min(w, p.lon); e = Math.max(e, p.lon); s = Math.min(s, p.lat); n = Math.max(n, p.lat); });
    const lat0 = (s + n) / 2, k = Math.cos(lat0 * Math.PI / 180);
    let mx0 = mercX(w), mx1 = mercX(e), my0 = mercY(s), my1 = mercY(n);
    const pad = Math.max((mx1 - mx0) * 0.25, (my1 - my0) * 0.25, 1500 / k);
    mx0 -= pad; mx1 += pad; my0 -= pad; my1 += pad;
    // sharpest zoom that fits the texture limit
    let z = 17; while (z > 9) { const [a, b] = tileOf(mx0, my1, z), [c, d] = tileOf(mx1, my0, z); if (c - a + 1 <= FLY.maxSide && d - b + 1 <= FLY.maxSide) break; z--; }
    toast('Making 3D flyover: downloading Three.js…', 60000);
    const three = await fetch(FLY.three).then(r => { if (!r.ok) throw new Error('three'); return r.text(); });
    let got = 0; const img = await mosaic(FLY.imagery, z, mx0, my0, mx1, my1, () => { got++; if (got % 8 === 0) toast(`Making 3D flyover: satellite imagery ${got}…`, 60000); });
    if (img.failed > img.total * 0.3) throw new Error('imagery');
    const imgB64 = img.cv.toDataURL('image/jpeg', 0.84);
    // terrain heights (Terrarium encoding), sampled on a grid over the imagery area
    const G = FLY.grid, heights = new Array(G * G).fill(0); let hasTerrain = false;
    try {
      toast('Making 3D flyover: terrain…', 60000);
      const zt = Math.min(Math.max(z - 2, 9), 14), ter = await mosaic(FLY.terrain, zt, img.mx0, img.my0, img.mx1, img.my1);
      if (ter.failed < ter.total * 0.3) {
        const px = ter.ctx.getImageData(0, 0, ter.cv.width, ter.cv.height).data, tw = ter.cv.width, th = ter.cv.height;
        const hAt = (x, y) => { x = Math.max(0, Math.min(tw - 1, x)); y = Math.max(0, Math.min(th - 1, y)); const o = (y * tw + x) * 4; return px[o] * 256 + px[o + 1] + px[o + 2] / 256 - 32768; };
        for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
          const mx = img.mx0 + (img.mx1 - img.mx0) * c / (G - 1), my = img.my1 - (img.my1 - img.my0) * r / (G - 1);
          const fx = (mx - ter.mx0) / (ter.mx1 - ter.mx0) * tw - 0.5, fy = (ter.my1 - my) / (ter.my1 - ter.my0) * th - 0.5;
          const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
          const v = hAt(x0, y0) * (1 - ax) * (1 - ay) + hAt(x0 + 1, y0) * ax * (1 - ay) + hAt(x0, y0 + 1) * (1 - ax) * ay + hAt(x0 + 1, y0 + 1) * ax * ay;
          heights[r * G + c] = Math.round(Math.max(v, -50) * 10) / 10;
        }
        hasTerrain = true;
      }
    } catch (e) { /* flat ground if terrain is unavailable */ }
    // local metres: x east, z south (Three.js convention), origin at the imagery centre
    const cx = (img.mx0 + img.mx1) / 2, cy = (img.my0 + img.my1) / 2;
    const toX = lon => (mercX(lon) - cx) * k, toZ = lat => -(mercY(lat) - cy) * k;
    const t0 = P[0].t;
    const route = P.map(p => [Math.round(toX(p.lon) * 10) / 10, Math.round(toZ(p.lat) * 10) / 10, Math.round((p.t - t0) * 10) / 10, Math.round(p.d - P[0].d), Math.round(p.v * 100) / 100, p.altS == null ? null : Math.round(p.altS), p.gap ? 1 : 0]);
    const st = tr.stats;
    const data = {
      name: tr.name, date: tr.start ? new Date(Date.parse(tr.start) + (tr.tz ?? -new Date().getTimezoneOffset()) * 60000).toISOString().slice(0, 16).replace('T', ' ') : null,
      stats: { dist: st.dist, elapsed: st.elapsed, moving: st.moving, avgMoving: st.avgMoving, maxV: st.maxV, gain: st.gain },
      route, hasTerrain, G, heights,
      bounds: [(img.mx0 - cx) * k, -(img.my1 - cy) * k, (img.mx1 - cx) * k, -(img.my0 - cy) * k],
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics · Terrain: Mapzen/AWS Terrain Tiles'
    };
    const html = flyHTML(data, imgB64, three);
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = (tr.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'route') + '-3d-flyover.html';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast(`Saved “${a.download}” (${(blob.size / 1048576).toFixed(1)} MB${hasTerrain ? '' : ', flat ground: terrain didn’t load'}). Open it to watch, or share it.`, 8000);
  } catch (e) {
    toast('Couldn’t make the 3D flyover. Check your internet connection and try again.', 6000);
  } finally { flyBusy = false; }
}

function flyHTML(data, imgB64, three) {
  const j = v => JSON.stringify(v).replace(/</g, '\\u003c');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">' +
    '<meta name="theme-color" content="#0e1416"><title>' + esc(data.name) + ' · 3D flyover</title>' +
    '<style>' + FLY_CSS + '</style></head><body>' + FLY_BODY.split('{{TITLE}}').join(esc(data.name)) +
    '<script>' + three.replace(/<\/script/gi, '<\\/script') + '<\/script>' +
    '<script>const FLY=' + j(data) + ';const FLY_IMG=' + j(imgB64) + ';(' + flyRuntime.toString() + ')();<\/script></body></html>';
}

const FLY_CSS = `
*{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden;background:#0e1416;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
#stage{position:fixed;inset:0}#stage canvas{display:block;touch-action:none}
.hud{position:fixed;left:max(14px,env(safe-area-inset-left));right:max(14px,env(safe-area-inset-right));pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,.6)}
.top{top:calc(14px + env(safe-area-inset-top));display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.title b{display:block;font-size:20px;font-weight:800;letter-spacing:.01em}.title span{font-size:13px;opacity:.85}
.mini{width:112px;height:112px;border-radius:14px;background:rgba(14,20,22,.55);backdrop-filter:blur(6px);flex:none}
.stats{top:calc(84px + env(safe-area-inset-top));display:flex;gap:8px;flex-wrap:wrap;max-width:calc(100% - 140px)}
.stat{background:rgba(14,20,22,.55);backdrop-filter:blur(6px);border-radius:12px;padding:7px 11px;min-width:76px}
.stat .k{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;opacity:.75}.stat .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}.stat .v small{font-size:11px;font-weight:600;opacity:.75;margin-left:2px}
.bottom{bottom:calc(14px + env(safe-area-inset-bottom));display:grid;gap:10px;pointer-events:auto}
.bar{height:5px;border-radius:3px;background:rgba(255,255,255,.25);overflow:hidden;cursor:pointer}.bar i{display:block;height:100%;width:0;background:#ff8a3d}
.ctl{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ctl button,.ctl select{border:0;border-radius:22px;padding:10px 15px;font:inherit;font-weight:700;background:rgba(255,255,255,.16);color:#fff;backdrop-filter:blur(6px)}
.ctl button.main{background:#ff8a3d}.ctl .sp{flex:1}
.ctl select option{color:#000}
.card{position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;transition:opacity .8s}
.card .in{text-align:center;padding:24px;max-width:520px;text-shadow:0 2px 10px rgba(0,0,0,.6)}
.card h1{font-size:34px;line-height:1.05;margin:0 0 8px;font-weight:900;letter-spacing:.01em}.card p{margin:0;font-size:15px;opacity:.9}
.sum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:18px}
.sum div{background:rgba(14,20,22,.6);border-radius:14px;padding:10px}.sum b{display:block;font-size:22px}.sum span{font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.75}
.hide{opacity:0}
.attr{position:fixed;right:8px;bottom:2px;font-size:9px;opacity:.55;pointer-events:none}
.rec{position:fixed;top:calc(14px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);background:#d93025;border-radius:16px;padding:5px 12px;font-weight:700;font-size:13px}
@media (prefers-reduced-motion: reduce){.card{transition:none}}
`;

const FLY_BODY = `
<div id="stage"></div>
<div class="hud top"><div class="title"><b>{{TITLE}}</b><span id="sub"></span></div><canvas class="mini" id="mini" width="224" height="224"></canvas></div>
<div class="hud stats" id="stats"></div>
<div class="card" id="intro"><div class="in"><h1>{{TITLE}}</h1><p id="introSub"></p></div></div>
<div class="card hide" id="outro"><div class="in"><h1>{{TITLE}}</h1><p id="outroSub"></p><div class="sum" id="sum"></div></div></div>
<div class="rec" id="recTag" hidden>● Recording video</div>
<div class="hud bottom">
  <div class="bar" id="bar"><i id="barFill"></i></div>
  <div class="ctl"><button class="main" id="play">❚❚ Pause</button><button id="restart">⟲ Restart</button>
    <select id="dur" aria-label="Flight length"><option value="30">30 s flight</option><option value="45" selected>45 s flight</option><option value="60">60 s flight</option><option value="90">90 s flight</option></select>
    <span class="sp"></span><button id="video">⬇ Save video</button></div>
</div>
<div class="attr" id="attr"></div>`;

/* Runs inside the exported file. Uses only FLY, FLY_IMG and THREE. */
function flyRuntime() {
  const $ = s => document.querySelector(s), D = FLY, R = D.route, N = R.length;
  const fmtDur = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const total = R[N - 1][3] || 1, [bx0, bz0, bx1, bz1] = D.bounds, ext = Math.max(bx1 - bx0, bz1 - bz0);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity; R.forEach(p => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); });
  const rExt = Math.max(maxX - minX, maxZ - minZ, 800), rcx = (minX + maxX) / 2, rcz = (minZ + maxZ) / 2;
  $('#attr').textContent = D.attribution;
  const sub = [D.date, (D.stats.dist / 1000).toFixed(1) + ' km', fmtDur(D.stats.elapsed)].filter(Boolean).join(' · ');
  $('#sub').textContent = sub; $('#introSub').textContent = sub; $('#outroSub').textContent = D.date || '';

  // ---- terrain height (with exaggeration so a flat city still has some relief) ----
  const G = D.G, Hs = D.heights; let hMin = Infinity, hMax = -Infinity; Hs.forEach(h => { hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); });
  const EX = D.hasTerrain ? Math.min(3, Math.max(1.4, ext / 60 / Math.max(hMax - hMin, 1))) : 1;
  function ground(x, z) {
    const fx = (x - bx0) / (bx1 - bx0) * (G - 1), fz = (z - bz0) / (bz1 - bz0) * (G - 1);
    const c = Math.max(0, Math.min(G - 2, Math.floor(fx))), r = Math.max(0, Math.min(G - 2, Math.floor(fz))), ax = Math.min(1, Math.max(0, fx - c)), az = Math.min(1, Math.max(0, fz - r));
    const h = Hs[r * G + c] * (1 - ax) * (1 - az) + Hs[r * G + c + 1] * ax * (1 - az) + Hs[(r + 1) * G + c] * (1 - ax) * az + Hs[(r + 1) * G + c + 1] * ax * az;
    return (h - hMin) * EX;
  }

  // ---- renderer, scene ----
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight); renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('#stage').appendChild(renderer.domElement);
  const scene = new THREE.Scene(), haze = new THREE.Color('#c9d8e2');
  scene.background = haze; scene.fog = new THREE.Fog(haze, ext * 0.55, ext * 1.6);
  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 3, ext * 6);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5040, 1.15));
  const sun = new THREE.DirectionalLight(0xfff2e0, 0.9); sun.position.set(-ext, ext, ext * 0.6); scene.add(sun);

  const tex = new THREE.TextureLoader().load(FLY_IMG, () => { need = true; });
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const geo = new THREE.PlaneGeometry(bx1 - bx0, bz1 - bz0, G - 1, G - 1); geo.rotateX(-Math.PI / 2); geo.translate((bx0 + bx1) / 2, 0, (bz0 + bz1) / 2);
  const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, ground(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex })));
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(ext * 12, ext * 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a8f7a }));
  skirt.position.set((bx0 + bx1) / 2, -2, (bz0 + bz1) / 2); scene.add(skirt);

  // ---- route: one tube per continuous piece, revealed as we fly; jumps where GPS stopped are dashed ----
  const lift = Math.max(3, rExt / 2500), radius = Math.max(3, rExt / 1500);
  const P3 = R.map(p => new THREE.Vector3(p[0], ground(p[0], p[1]) + lift, p[1]));
  const pieces = []; let cur = [0];
  for (let i = 1; i < N; i++) { if (R[i][6]) { pieces.push(cur); cur = [i]; } else cur.push(i); }
  pieces.push(cur);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff8a3d }), ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  const tubes = [];
  pieces.forEach(idx => {
    if (idx.length < 2) return;
    const step = Math.max(1, Math.floor(idx.length / 1200)), sel = idx.filter((_, j) => j % step === 0 || j === idx.length - 1);
    const curve = new THREE.CatmullRomCurve3(sel.map(i => P3[i]), false, 'centripetal');
    const segs = Math.min(3000, sel.length * 2), tg = new THREE.TubeGeometry(curve, segs, radius, 6, false);
    scene.add(new THREE.Mesh(tg, ghostMat));
    const lit = new THREE.Mesh(tg, glowMat); lit.geometry = tg.clone(); scene.add(lit);
    tubes.push({ mesh: lit, d0: R[idx[0]][3], d1: R[idx[idx.length - 1]][3], count: lit.geometry.index.count, per: 6 * 6 });
  });
  for (let i = 1; i < N; i++) if (R[i][6]) {
    const g = new THREE.BufferGeometry().setFromPoints([P3[i - 1], P3[i]]);
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: radius * 6, gapSize: radius * 5, transparent: true, opacity: 0.8 })); l.computeLineDistances(); scene.add(l);
  }
  function reveal(d) {
    tubes.forEach(t => { const f = Math.max(0, Math.min(1, (d - t.d0) / Math.max(1, t.d1 - t.d0))); t.mesh.geometry.setDrawRange(0, Math.floor(f * t.count / t.per) * t.per); });
  }
  // markers: start, finish and the moving car
  const pin = (color, at) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.6, radius * 1.6, rExt / 18, 12), new THREE.MeshBasicMaterial({ color })); m.position.copy(at).add(new THREE.Vector3(0, rExt / 36, 0)); scene.add(m); };
  pin(0x2fbf71, P3[0]); pin(0xe8453c, P3[N - 1]);
  const car = new THREE.Group();
  car.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 3, 20, 16), new THREE.MeshBasicMaterial({ color: 0xffffff })));
  car.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 2.2, 20, 16), new THREE.MeshBasicMaterial({ color: 0xff8a3d })));
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 4, radius * 5, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; car.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, rExt / 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
  beam.position.y = rExt / 20; car.add(beam); scene.add(car);

  // ---- sampling the drive by distance ----
  function at(d) {
    d = Math.max(0, Math.min(total, d)); let lo = 0, hi = N - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R[m][3] <= d) lo = m; else hi = m; }
    const a = R[lo], b = R[hi], f = b[3] > a[3] ? (d - a[3]) / (b[3] - a[3]) : 0, x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
    return { x, z, y: ground(x, z) + lift, t: a[2] + (b[2] - a[2]) * f, v: a[4] + (b[4] - a[4]) * f, ele: a[5] == null ? null : a[5] + ((b[5] ?? a[5]) - a[5]) * f };
  }

  // ---- HUD ----
  const tile = (k, v, u) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}<small>${u}</small></div></div>`;
  function hud(s, d) {
    $('#stats').innerHTML = tile('Distance', (d / 1000).toFixed(1), 'km') + tile('Time', fmtDur(s.t), '') + tile('Speed', Math.round(s.v * 3.6), 'km/h') + (s.ele != null ? tile('Elevation', Math.round(s.ele), 'm') : '');
    $('#barFill').style.width = (d / total * 100).toFixed(2) + '%';
  }
  const S = D.stats;
  $('#sum').innerHTML = [[(S.dist / 1000).toFixed(1) + ' km', 'Distance'], [fmtDur(S.elapsed), 'Time'], [(S.avgMoving * 3.6).toFixed(0) + ' km/h', 'Avg moving'], [(S.maxV * 3.6).toFixed(0) + ' km/h', 'Top speed'], [fmtDur(S.moving), 'Moving'], [S.gain == null ? '—' : Math.round(S.gain) + ' m', 'Climb']].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
  const mini = $('#mini'), mctx = mini.getContext('2d'), mm = 224, mpad = 22, msc = (mm - mpad * 2) / rExt;
  const mxy = (x, z) => [mm / 2 + (x - rcx) * msc, mm / 2 + (z - rcz) * msc];
  function drawMini(d) {
    mctx.clearRect(0, 0, mm, mm); mctx.lineJoin = mctx.lineCap = 'round';
    const path = (to, color, w) => { mctx.strokeStyle = color; mctx.lineWidth = w; mctx.beginPath(); for (let i = 0; i < N && R[i][3] <= to; i++) { const [x, y] = mxy(R[i][0], R[i][1]); i && !R[i][6] ? mctx.lineTo(x, y) : mctx.moveTo(x, y); } mctx.stroke(); };
    path(total, 'rgba(255,255,255,.45)', 5); path(d, '#ff8a3d', 6);
    const s = at(d), [x, y] = mxy(s.x, s.z); mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(x, y, 8, 0, 7); mctx.fill();
  }

  // ---- camera ----
  const INTRO = 3, OUTRO = 5; let dur = 45, clock = 0, playing = true, need = true, yaw = 0, pitchAdj = 0, userZoom = 1;
  const camDist = Math.min(1600, Math.max(260, rExt * 0.11));
  const overview = () => { const h = rExt * 0.95; return { pos: new THREE.Vector3(rcx + Math.sin(clock * 0.15) * rExt * 0.35, h, rcz + rExt * 0.75), look: new THREE.Vector3(rcx, 0, rcz) }; };
  const look = new THREE.Vector3(rcx, 0, rcz), ease = x => x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
  camera.position.copy(overview().pos); camera.lookAt(look);
  function progress() { return clock <= INTRO ? 0 : clock >= INTRO + dur ? 1 : ease((clock - INTRO) / dur); }
  function frame(dt) {
    const p = progress(), d = p * total, s = at(d);
    reveal(d); car.position.set(s.x, s.y, s.z);
    const pulse = (clock * 1.3) % 1; ring.scale.setScalar(1 + pulse * 1.8); ring.material.opacity = 1 - pulse;
    let tPos, tLook;
    if (clock < INTRO || clock > INTRO + dur) { const o = overview(); tPos = o.pos; tLook = o.look; }
    else {
      const hw = Math.max(120, total * 0.012), a = at(d - hw), b = at(d + hw * 2.5);
      let hx = b.x - a.x, hz = b.z - a.z; const L = Math.hypot(hx, hz) || 1; hx /= L; hz /= L;
      const swing = Math.sin(clock * 0.22) * 0.55 + yaw, cs = Math.cos(swing), sn = Math.sin(swing);
      const bx = hx * cs - hz * sn, bz = hx * sn + hz * cs, pitch = 0.62 + pitchAdj, dist = camDist * userZoom;
      tPos = new THREE.Vector3(s.x - bx * dist * Math.cos(pitch), s.y + dist * Math.sin(pitch), s.z - bz * dist * Math.cos(pitch));
      tLook = new THREE.Vector3(s.x + hx * camDist * 0.25, s.y, s.z + hz * camDist * 0.25);
    }
    const kPos = 1 - Math.exp(-dt * 1.8), kLook = 1 - Math.exp(-dt * 3.5);
    camera.position.lerp(tPos, kPos); look.lerp(tLook, kLook); camera.lookAt(look);
    $('#intro').classList.toggle('hide', clock > INTRO - 0.6);
    $('#outro').classList.toggle('hide', clock < INTRO + dur + 0.8);
    hud(s, d); drawMini(d);
    renderer.render(scene, camera);
    if (recCtx) composite();
  }
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing) { clock += dt; if (clock > INTRO + dur + OUTRO) { clock = INTRO + dur + OUTRO; if (recorder) stopVideo(); playing = false; setPlayLabel(); } }
    frame(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
  const setPlayLabel = () => { $('#play').textContent = playing ? '❚❚ Pause' : '▶ Play'; };
  $('#play').onclick = () => { if (!playing && clock >= INTRO + dur + OUTRO) clock = 0; playing = !playing; setPlayLabel(); };
  $('#restart').onclick = () => { clock = 0; playing = true; setPlayLabel(); };
  $('#dur').onchange = e => { const p = progress(); dur = +e.target.value; if (clock > INTRO && clock < INTRO + dur) clock = INTRO + p * dur; };
  $('#bar').onclick = e => { const r = $('#bar').getBoundingClientRect(); clock = INTRO + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur; };
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  // drag to look around, pinch or wheel to zoom
  const ptrs = new Map(); let pinch0 = null;
  renderer.domElement.addEventListener('pointerdown', e => { renderer.domElement.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); });
  renderer.domElement.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return; const [px, py] = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) { yaw += (e.clientX - px) * 0.006; pitchAdj = Math.max(-0.45, Math.min(0.7, pitchAdj - (e.clientY - py) * 0.004)); }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) userZoom = Math.max(0.35, Math.min(3, userZoom * pinch0 / dd)); pinch0 = dd; }
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null; };
  renderer.domElement.addEventListener('pointerup', up); renderer.domElement.addEventListener('pointercancel', up);
  renderer.domElement.addEventListener('wheel', e => { e.preventDefault(); userZoom = Math.max(0.35, Math.min(3, userZoom * Math.exp(e.deltaY * 0.001))); }, { passive: false });

  // ---- save as video: the 3D view plus the overlay, drawn into one canvas and recorded ----
  let recorder = null, recCtx = null, recCv = null, chunks = [];
  function composite() {
    const W = recCv.width, H = recCv.height, sc = W / innerWidth; recCtx.drawImage(renderer.domElement, 0, 0, W, H);
    recCtx.save(); recCtx.scale(sc, sc); recCtx.shadowColor = 'rgba(0,0,0,.6)'; recCtx.shadowBlur = 6; recCtx.fillStyle = '#fff';
    const p = progress(), d = p * total, s = at(d);
    if (clock > INTRO - 0.6 && clock < INTRO + dur + 0.8) {
      recCtx.font = '800 20px system-ui,sans-serif'; recCtx.fillText(D.name, 16, 36, innerWidth - 160); recCtx.font = '13px system-ui,sans-serif'; recCtx.fillText(sub, 16, 56, innerWidth - 160);
      const items = [['DISTANCE', (d / 1000).toFixed(1) + ' km'], ['TIME', fmtDur(s.t)], ['SPEED', Math.round(s.v * 3.6) + ' km/h']].concat(s.ele != null ? [['ELEVATION', Math.round(s.ele) + ' m']] : []);
      items.forEach(([k, v], i) => { const x = 16 + i * 92; recCtx.globalAlpha = .75; recCtx.font = '600 10px system-ui,sans-serif'; recCtx.fillText(k, x, 148); recCtx.globalAlpha = 1; recCtx.font = '800 19px system-ui,sans-serif'; recCtx.fillText(v, x, 170); });
      recCtx.drawImage(mini, innerWidth - 128, 14, 112, 112);
      recCtx.fillStyle = 'rgba(255,255,255,.3)'; recCtx.fillRect(16, innerHeight - 24, innerWidth - 32, 5); recCtx.fillStyle = '#ff8a3d'; recCtx.fillRect(16, innerHeight - 24, (innerWidth - 32) * p, 5);
    } else {
      recCtx.textAlign = 'center'; recCtx.font = '900 30px system-ui,sans-serif'; recCtx.fillText(D.name, innerWidth / 2, innerHeight / 2 - 10, innerWidth - 32);
      recCtx.font = '15px system-ui,sans-serif'; recCtx.fillText(clock < INTRO ? sub : `${(S.dist / 1000).toFixed(1)} km · ${fmtDur(S.elapsed)} · top ${(S.maxV * 3.6).toFixed(0)} km/h`, innerWidth / 2, innerHeight / 2 + 20);
    }
    recCtx.restore();
  }
  function stopVideo() { if (recorder && recorder.state !== 'inactive') recorder.stop(); }
  $('#video').onclick = () => {
    if (recorder) { stopVideo(); return; }
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'], type = window.MediaRecorder && types.find(t => MediaRecorder.isTypeSupported(t));
    if (!type) { alert('This browser can’t record video. Try Chrome on Android or a computer.'); return; }
    recCv = document.createElement('canvas'); const sc = Math.min(1, 1280 / Math.max(innerWidth, innerHeight)) * Math.min(devicePixelRatio || 1, 2);
    recCv.width = Math.round(innerWidth * sc / 2) * 2; recCv.height = Math.round(innerHeight * sc / 2) * 2; recCtx = recCv.getContext('2d');
    chunks = []; recorder = new MediaRecorder(recCv.captureStream(30), { mimeType: type, videoBitsPerSecond: 6e6 });
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: type.split(';')[0] }), a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = D.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '-flyover.' + (type.includes('mp4') ? 'mp4' : 'webm'); document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); recorder = null; recCtx = null; $('#recTag').hidden = true; $('#video').textContent = '⬇ Save video';
    };
    clock = 0; playing = true; setPlayLabel(); recorder.start(500); $('#recTag').hidden = false; $('#video').textContent = '■ Stop video';
  };
}
