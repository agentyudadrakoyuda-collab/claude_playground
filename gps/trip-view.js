'use strict';
/* Trip viewer: the interactive page embedded in every exported trip HTML.
   TripView.run is serialised into the file and runs there with TRIP (data), TRIP_IMG (imagery) and THREE. */
const TripView = {};

TripView.css = `
[hidden]{display:none!important}
:root{--bg:#11171a;--card:rgba(17,23,26,.78);--line:rgba(255,255,255,.14);--ink:#f2f5f6;--muted:#a9b4b9;--acc:#ff7a2f;--good:#47c97f;--warn:#ffb020}
*{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
button,select{font:inherit;color:inherit}button{cursor:pointer;border:0;background:none}
#stage{position:fixed;inset:0}#stage canvas{display:block;touch-action:none}
.glass{background:var(--card);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid var(--line);border-radius:14px}
.top{position:fixed;z-index:3;top:calc(10px + env(safe-area-inset-top));left:max(10px,env(safe-area-inset-left));right:max(10px,env(safe-area-inset-right));display:flex;gap:8px;align-items:flex-start;pointer-events:none}
.top>*{pointer-events:auto}
.title{padding:9px 13px;min-width:0;flex:0 1 auto}.title b{display:block;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.title span{font-size:12px;color:var(--muted)}
.gauges{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;justify-content:flex-end}
.g{padding:6px 10px;min-width:68px;text-align:center}.g .k{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.g .v{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15}.g .v small{font-size:11px;font-weight:600;color:var(--muted);margin-left:2px}
.g.big .v{font-size:26px}
.next{position:fixed;z-index:3;left:50%;transform:translateX(-50%);top:calc(74px + env(safe-area-inset-top));padding:7px 13px;display:flex;gap:9px;align-items:center;font-weight:700;font-size:14px;white-space:nowrap}
.next svg{width:24px;height:24px}
.bottom{position:fixed;z-index:3;left:max(10px,env(safe-area-inset-left));right:max(10px,env(safe-area-inset-right));bottom:calc(10px + env(safe-area-inset-bottom));padding:8px 10px;display:grid;gap:8px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.btn{border-radius:20px;padding:8px 13px;font-weight:700;font-size:14px;background:rgba(255,255,255,.12)}
.btn.main{background:var(--acc);color:#fff;min-width:46px}
.btn.on{background:var(--ink);color:#11171a}
select.btn{appearance:none;-webkit-appearance:none;padding-right:13px}
select option{color:#000}
.seg{display:flex;background:rgba(255,255,255,.08);border-radius:20px;padding:2px}.seg button{padding:6px 11px;border-radius:18px;font-size:13px;font-weight:700;color:var(--muted)}.seg button[aria-pressed="true"]{background:rgba(255,255,255,.9);color:#11171a}
.time{font-variant-numeric:tabular-nums;font-size:13px;color:var(--muted);white-space:nowrap}
input[type=range]{flex:1;min-width:120px;accent-color:var(--acc)}
.sp{flex:1}
.panel{position:fixed;z-index:4;display:flex;flex-direction:column;overflow:hidden}
.tabs{display:flex;gap:4px;padding:8px 8px 0}.tabs button{flex:1;padding:8px;border-radius:10px;font-weight:700;font-size:13px;color:var(--muted)}.tabs button[aria-selected="true"]{background:rgba(255,255,255,.12);color:var(--ink)}
.pbody{overflow:auto;padding:10px 12px 14px;flex:1;min-height:0}
.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
.stat{background:rgba(255,255,255,.06);border-radius:10px;padding:8px 10px}.stat .k{font-size:11px;color:var(--muted)}.stat .v{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums}
.chart{position:relative;height:170px;background:rgba(255,255,255,.05);border-radius:10px}.chart canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}
.legend{display:flex;gap:12px;font-size:11px;color:var(--muted);margin:8px 2px 0;flex-wrap:wrap;align-items:center}.legend i{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:5px;vertical-align:middle}
.ramp{width:90px;height:6px;border-radius:3px;background:linear-gradient(90deg,#3b6fb6,#2aa39a,#e3b234,#e0702a,#c9302c)}
.list{display:grid;gap:4px}
.item{display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:center;padding:8px;border-radius:10px;text-align:left;width:100%}
.item:hover,.item.cur{background:rgba(255,255,255,.1)}.item svg{width:26px;height:26px}.item b{font-size:14px}.item span{display:block;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}.item em{font-style:normal;font-size:12px;color:var(--muted)}
.note{font-size:12px;color:var(--muted);margin-top:10px;line-height:1.45}
.attr{position:fixed;z-index:2;right:6px;font-size:9px;opacity:.6;pointer-events:none}
.rec{position:fixed;z-index:6;top:calc(10px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);background:#d93025;border-radius:16px;padding:5px 12px;font-weight:700;font-size:13px}
@media (min-width:900px){.panel{right:max(10px,env(safe-area-inset-right));top:calc(70px + env(safe-area-inset-top));bottom:calc(100px + env(safe-area-inset-bottom));width:360px}.bottom{right:380px}.next{left:calc(50% - 185px)}#detailsBtn{display:none}}
@media (max-width:899px){.panel{left:max(10px,env(safe-area-inset-left));right:max(10px,env(safe-area-inset-right));bottom:var(--bottom-h,110px);max-height:52%}.panel.closed{display:none}.gauges .g:not(.big):nth-child(n+4){display:none}.g{min-width:60px;padding:5px 8px}}
`;

TripView.body = `
<div id="stage"></div>
<div class="top"><div class="glass title"><b id="ttl"></b><span id="sub"></span></div><div class="gauges" id="gauges"></div></div>
<div class="glass next" id="next" hidden></div>
<div class="glass panel closed" id="panel">
  <div class="tabs" role="tablist"><button data-tab="profile" aria-selected="true">Profile</button><button data-tab="turns" aria-selected="false">Turns</button><button data-tab="stats" aria-selected="false">Stats</button></div>
  <div class="pbody" id="pbody"></div>
</div>
<div class="glass bottom" id="bottom">
  <div class="row"><button class="btn main" id="play" aria-label="Play">▶</button><input type="range" id="scrub" min="0" max="1" step="any" value="0" aria-label="Position in trip"><span class="time" id="time">0:00</span></div>
  <div class="row"><select class="btn" id="rate" aria-label="Playback speed"></select>
    <div class="seg" role="group" aria-label="Camera"><button data-cam="follow" aria-pressed="true">Follow</button><button data-cam="orbit" aria-pressed="false">Orbit</button><button data-cam="top" aria-pressed="false">Map</button></div>
    <span class="sp"></span><button class="btn" id="detailsBtn">Details</button><button class="btn" id="video">⬇ Video</button></div>
</div>
<div class="rec" id="recTag" hidden>● Recording video</div>
<div class="attr" id="attr"></div>`;

TripView.run = function () {
  const $ = s => document.querySelector(s), D = TRIP, P = D.pts, N = P.length, S = D.stats;
  const X = 0, Zc = 1, T = 2, Dd = 3, V = 4, E = 5, H = 6, GAP = 7;
  const fmtDur = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const fmtDist = m => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 2 : 1) + ' km';
  const kmh = v => Math.round(v * 3.6);
  const compass = h => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((h % 360) + 360) % 360 / 45) % 8];
  const clock = t => { const d = new Date(D.start + t * 1000 + D.tz * 60000); return d.toISOString().slice(11, 16); };
  const total = P[N - 1][Dd] || 1, TT = P[N - 1][T] || 1;
  const [bx0, bz0, bx1, bz1] = D.bounds, ext = Math.max(bx1 - bx0, bz1 - bz0);
  let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity; P.forEach(p => { mnX = Math.min(mnX, p[X]); mxX = Math.max(mxX, p[X]); mnZ = Math.min(mnZ, p[Zc]); mxZ = Math.max(mxZ, p[Zc]); });
  const rExt = Math.max(mxX - mnX, mxZ - mnZ, 600), rcx = (mnX + mxX) / 2, rcz = (mnZ + mxZ) / 2;
  $('#ttl').textContent = D.name;
  $('#sub').textContent = [D.timed ? new Date(D.start + D.tz * 60000).toISOString().slice(0, 16).replace('T', ' ') : null, fmtDist(S.dist), fmtDur(S.elapsed)].filter(Boolean).join(' · ');
  $('#attr').textContent = D.attribution; document.title = D.name;

  /* ---------- ground ---------- */
  const G = D.G, HS = D.heights; let hMin = Infinity, hMax = -Infinity; HS.forEach(h => { hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); });
  const EX = D.hasTerrain ? Math.min(2.5, Math.max(1.2, ext / 70 / Math.max(hMax - hMin, 1))) : 1;
  function ground(x, z) {
    if (!D.hasTerrain) return 0;
    const fx = (x - bx0) / (bx1 - bx0) * (G - 1), fz = (z - bz0) / (bz1 - bz0) * (G - 1);
    const c = Math.max(0, Math.min(G - 2, Math.floor(fx))), r = Math.max(0, Math.min(G - 2, Math.floor(fz))), ax = Math.min(1, Math.max(0, fx - c)), az = Math.min(1, Math.max(0, fz - r));
    return ((HS[r * G + c] * (1 - ax) + HS[r * G + c + 1] * ax) * (1 - az) + (HS[(r + 1) * G + c] * (1 - ax) + HS[(r + 1) * G + c + 1] * ax) * az - hMin) * EX;
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight); renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('#stage').appendChild(renderer.domElement);
  const scene = new THREE.Scene(), haze = new THREE.Color(D.imgOK ? '#b8c7d1' : '#cfd6c8');
  scene.background = haze; scene.fog = new THREE.Fog(haze, ext * 0.9, ext * 2.6);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 2, ext * 8);
  let tex;
  if (TRIP_IMG) { tex = new THREE.TextureLoader().load(TRIP_IMG); }
  else { // no imagery: a plain map-like ground with a 1 km grid
    const cv = document.createElement('canvas'); cv.width = cv.height = 1024; const c = cv.getContext('2d');
    c.fillStyle = '#e6e2d6'; c.fillRect(0, 0, 1024, 1024); c.strokeStyle = 'rgba(80,90,80,.18)'; c.lineWidth = 2;
    const step = 1024 / ((bx1 - bx0) / 1000); for (let i = 0; i < 1024; i += step) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 1024); c.moveTo(0, i); c.lineTo(1024, i); c.stroke(); }
    tex = new THREE.CanvasTexture(cv);
  }
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const geo = new THREE.PlaneGeometry(bx1 - bx0, bz1 - bz0, G - 1, G - 1); geo.rotateX(-Math.PI / 2); geo.translate((bx0 + bx1) / 2, 0, (bz0 + bz1) / 2);
  const gp = geo.attributes.position; for (let i = 0; i < gp.count; i++) gp.setY(i, ground(gp.getX(i), gp.getZ(i)));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex })));
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(ext * 14, ext * 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: D.imgOK ? 0x6f7764 : 0xe6e2d6 }));
  skirt.position.set((bx0 + bx1) / 2, -3, (bz0 + bz1) / 2); scene.add(skirt);

  /* ---------- route coloured by speed ---------- */
  const RAMP = [[0, [59, 111, 182]], [0.3, [42, 163, 154]], [0.55, [227, 178, 52]], [0.78, [224, 112, 42]], [1, [201, 48, 44]]], VMAX = Math.max(S.maxV, 15);
  const rampRGB = v => { const x = Math.max(0, Math.min(1, v / VMAX)); for (let i = 1; i < RAMP.length; i++) if (x <= RAMP[i][0]) { const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], f = (x - a) / (b - a); return ca.map((c, j) => (c + (cb[j] - c) * f) / 255); } return [0.79, 0.19, 0.17]; };
  const lift = Math.max(2.5, rExt / 3000), radius = Math.max(3, rExt / 1100);
  const P3 = P.map(p => new THREE.Vector3(p[X], ground(p[X], p[Zc]) + lift, p[Zc]));
  const iAtD = d => { let lo = 0, hi = N - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m][Dd] <= d) lo = m; else hi = m; } return lo; };
  const pieces = []; let cur = [0]; for (let i = 1; i < N; i++) { if (P[i][GAP]) { pieces.push(cur); cur = [i]; } else cur.push(i); } pieces.push(cur);
  const routeMat = new THREE.MeshBasicMaterial({ vertexColors: true }), doneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 });
  pieces.forEach(idx => {
    if (idx.length < 2) return;
    const stepN = Math.max(1, Math.floor(idx.length / 1500)), sel = idx.filter((_, j) => j % stepN === 0 || j === idx.length - 1);
    const pts = sel.map(i => P3[i]).filter((p, j, a) => j === 0 || p.distanceTo(a[j - 1]) > 0.5); if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), segs = Math.min(4000, pts.length * 2), rad = 6;
    const tg = new THREE.TubeGeometry(curve, segs, radius, rad, false), cols = new Float32Array(tg.attributes.position.count * 3);
    const d0 = P[idx[0]][Dd], d1 = P[idx[idx.length - 1]][Dd];
    for (let ring = 0; ring <= segs; ring++) { const c = rampRGB(P[iAtD(d0 + (d1 - d0) * ring / segs)][V]); for (let r = 0; r <= rad; r++) cols.set(c, (ring * (rad + 1) + r) * 3); }
    tg.setAttribute('color', new THREE.BufferAttribute(cols, 3)); scene.add(new THREE.Mesh(tg, routeMat));
  });
  for (let i = 1; i < N; i++) if (P[i][GAP]) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([P3[i - 1], P3[i]]), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: radius * 6, gapSize: radius * 5 })); l.computeLineDistances(); scene.add(l); }

  /* ---------- markers: start, finish, turns, stops, car ---------- */
  const arrowPath = (ctx, ang, color) => { ctx.save(); ctx.translate(64, 64); ctx.rotate(ang * Math.PI / 180); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(22, -6); ctx.lineTo(8, -6); ctx.lineTo(8, 30); ctx.lineTo(-8, 30); ctx.lineTo(-8, -6); ctx.lineTo(-22, -6); ctx.closePath(); ctx.fill(); ctx.restore(); };
  const sprite = (draw, size) => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'); draw(c); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false })); s.scale.setScalar(size); s.renderOrder = 5; return s; };
  const disc = (c, fill) => { c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.arc(64, 66, 54, 0, 7); c.fill(); c.fillStyle = fill; c.beginPath(); c.arc(64, 64, 52, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 7; c.stroke(); };
  const mSize = 0.075, up0 = Math.max(4, rExt / 400); // markers keep the same size on screen
  const addAt = (s, x, z, up) => { s.position.set(x, ground(x, z) + lift + up, z); scene.add(s); return s; };
  addAt(sprite(c => { disc(c, '#1f9d55'); c.fillStyle = '#fff'; c.font = 'bold 54px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('S', 64, 67); }, mSize), P[0][X], P[0][Zc], up0);
  addAt(sprite(c => { disc(c, '#d93025'); c.fillStyle = '#fff'; c.font = 'bold 54px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('F', 64, 67); }, mSize), P[N - 1][X], P[N - 1][Zc], up0);
  const turnSprites = D.turns.map(t => addAt(sprite(c => { disc(c, t.kind === 'U-turn' ? '#9b4fc4' : t.kind === 'sharp' ? '#e0702a' : '#2563eb'); arrowPath(c, t.dir === 'right' ? Math.min(180, Math.abs(t.angle)) : -Math.min(180, Math.abs(t.angle)), '#fff'); }, mSize * 0.75), t.x, t.z, up0));
  D.stops.forEach(s => addAt(sprite(c => { disc(c, '#5b6770'); c.fillStyle = '#fff'; c.fillRect(44, 40, 14, 48); c.fillRect(70, 40, 14, 48); }, mSize * 0.6), s.x, s.z, up0));
  const car = new THREE.Group();
  car.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 2.6, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff })));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.2, radius * 6, 18), new THREE.MeshBasicMaterial({ color: 0xff7a2f })); cone.rotation.x = -Math.PI / 2; cone.position.z = -radius * 4; car.add(cone);
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 3.5, radius * 4.4, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; car.add(ring);
  scene.add(car);

  /* ---------- sampling by time ---------- */
  const iAtT = t => { let lo = 0, hi = N - 1; if (t <= P[0][T]) return 0; if (t >= P[hi][T]) return hi - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m][T] <= t) lo = m; else hi = m; } return lo; };
  function at(t) {
    const i = iAtT(t), a = P[i], b = P[Math.min(N - 1, i + 1)], f = b[GAP] ? 0 : Math.max(0, Math.min(1, (t - a[T]) / Math.max(0.001, b[T] - a[T])));
    const x = a[X] + (b[X] - a[X]) * f, z = a[Zc] + (b[Zc] - a[Zc]) * f, dh = ((b[H] - a[H] + 540) % 360) - 180;
    return { i, x, z, y: ground(x, z) + lift, d: a[Dd] + (b[Dd] - a[Dd]) * f, v: a[V] + (b[V] - a[V]) * f, ele: a[E] == null ? null : a[E] + ((b[E] ?? a[E]) - a[E]) * f, hdg: (a[H] + dh * f + 360) % 360, lat: a[8], lon: a[9], inGap: !!b[GAP] && t > a[T] && t < b[T], gapEnd: b[T] };
  }
  const tAtD = d => { const i = iAtD(d), a = P[i], b = P[Math.min(N - 1, i + 1)]; return b[Dd] > a[Dd] ? a[T] + (b[T] - a[T]) * (d - a[Dd]) / (b[Dd] - a[Dd]) : a[T]; };
  const grade = s => { const a = at(Math.max(0, tAtD(s.d - 40))), b = at(tAtD(Math.min(total, s.d + 40))); return a.ele == null || b.ele == null || b.d - a.d < 20 ? null : (b.ele - a.ele) / (b.d - a.d) * 100; };

  /* ---------- playback state ---------- */
  let tt = 0, playing = false, camMode = 'follow', yaw = 0, pitchAdj = 0, zoom = 1, need = true;
  const fit = Math.max(1, Math.round(TT / 60));
  const rates = [[fit, `Fit (${fit}×)`], [1, '1×'], [5, '5×'], [10, '10×'], [30, '30×'], [60, '60×'], [120, '120×']];
  $('#rate').innerHTML = rates.map(([v, l], i) => `<option value="${v}" ${i ? '' : 'selected'}>${l}</option>`).join('');
  let rate = fit; $('#rate').onchange = e => { rate = +e.target.value; };
  const setPlay = p => { playing = p; $('#play').textContent = p ? '❚❚' : '▶'; $('#play').setAttribute('aria-label', p ? 'Pause' : 'Play'); };
  $('#play').onclick = () => { if (!playing && tt >= TT) tt = 0; setPlay(!playing); };
  $('#scrub').max = TT; $('#scrub').oninput = e => { tt = +e.target.value; need = true; };
  document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { camMode = b.dataset.cam; yaw = 0; pitchAdj = 0; zoom = 1; document.querySelectorAll('[data-cam]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  const jump = t => { tt = Math.max(0, Math.min(TT, t)); setPlay(false); need = true; };

  /* ---------- side panel ---------- */
  let tab = 'profile';
  const turnName = t => t.kind === 'U-turn' ? 'U-turn' : (t.kind === 'slight' ? 'Slight ' + t.dir : t.kind === 'sharp' ? 'Sharp ' + t.dir : 'Turn ' + t.dir);
  const turnIcon = t => `<svg viewBox="0 0 128 128"><g transform="rotate(${t.dir === 'right' ? Math.min(180, Math.abs(t.angle)) : -Math.min(180, Math.abs(t.angle))} 64 64)"><path d="M64 30 L86 58 L72 58 L72 94 L56 94 L56 58 L42 58 Z" fill="currentColor"/></g></svg>`;
  function renderPanel() {
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
    const pb = $('#pbody');
    if (tab === 'profile') {
      pb.innerHTML = `<div class="chart"><canvas id="prof" aria-label="Elevation and speed along the trip; drag to move"></canvas></div>
        <div class="legend">${P.some(p => p[E] != null) ? '<span><i style="background:#9fb3a6"></i>Elevation</span>' : ''}<span><i style="background:#ffffff"></i>Speed</span><span><i style="background:#2563eb;height:8px;width:8px;border-radius:50%"></i>Turn</span><span><i style="background:#5b6770;height:8px;width:8px"></i>Stop</span><span>Route colour: slow <span class="ramp" style="display:inline-block;vertical-align:middle;margin:0 4px"></span> fast</span></div>
        <p class="note">${D.eleSource === 'terrain' ? 'Elevation comes from terrain data (the recording had no altitude).' : D.eleSource === 'GPS' ? 'Elevation is the phone’s GPS altitude, smoothed.' : 'No elevation data.'} Speed ${D.timed ? 'is from the GPS recording' : 'is estimated: the file has no timestamps'}.</p>`;
      const cv = $('#prof'); const seek = e => { const r = cv.getBoundingClientRect(), L = 36, Rr = 36; jump(tAtD(Math.max(0, Math.min(1, (e.clientX - r.left - L) / (r.width - L - Rr))) * total)); };
      cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); seek(e); }; cv.onpointermove = e => { if (e.buttons) seek(e); };
    } else if (tab === 'turns') {
      pb.innerHTML = D.turns.length ? `<div class="list">${D.turns.map((t, i) => `<button class="item" data-turn="${i}"><span style="color:${t.kind === 'U-turn' ? '#c084fc' : t.kind === 'sharp' ? '#fb923c' : '#60a5fa'}">${turnIcon(t)}</span><div><b>${turnName(t)}</b><span>${fmtDist(t.d)} · ${fmtDur(t.t)}${D.timed ? ' · ' + clock(t.t) : ''}</span></div><em>${Math.abs(t.angle)}° · ${kmh(t.v)} km/h</em></button>`).join('')}</div>
        <p class="note">Turns are found from changes in direction of 30° or more, measured 30 m before and after each point. ${S.turnsL} left, ${S.turnsR} right. Tap one to jump there.</p>` : '<p class="note">No turns of 30° or more on this trip.</p>';
      pb.querySelectorAll('[data-turn]').forEach(b => b.onclick = () => { const t = D.turns[+b.dataset.turn]; jump(t.t - 4); setTimeout(() => setPlay(true), 50); });
    } else {
      const st = (k, v) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
      pb.innerHTML = `<div class="stats">${st('Distance', fmtDist(S.dist))}${st('Total time', fmtDur(S.elapsed))}${st('Moving time', fmtDur(S.moving))}${st('Avg moving speed', kmh(S.avgMoving) + ' km/h')}
        ${st('Top speed', kmh(S.maxV) + ' km/h')}${st('Stops (20 s+)', S.stops)}${st('Turns', `${S.turnsL + S.turnsR} <small style="font-size:12px;color:var(--muted)">${S.turnsL} L · ${S.turnsR} R</small>`)}
        ${S.eMin != null ? st('Elevation', `${Math.round(S.eMin)}–${Math.round(S.eMax)} m`) + st('Climb / descent', `${Math.round(S.climb)} / ${Math.round(S.descent)} m`) : ''}
        ${S.gapTime ? st('GPS gaps', fmtDur(S.gapTime)) : ''}</div>
        ${D.stops.length ? `<h4 style="margin:14px 2px 6px;font-size:13px;color:var(--muted)">Stops</h4><div class="list">${D.stops.map((s, i) => `<button class="item" data-stop="${i}"><span style="color:#cbd5e1;font-weight:900;text-align:center">❚❚</span><div><b>${fmtDur(s.dur)} stop</b><span>${fmtDist(s.d)} · ${fmtDur(s.t)}${D.timed ? ' · ' + clock(s.t) : ''}</span></div><em></em></button>`).join('')}</div>` : ''}
        ${S.gapTime ? '<p class="note">Dashed lines are stretches where the GPS stopped recording.</p>' : ''}`;
      pb.querySelectorAll('[data-stop]').forEach(b => b.onclick = () => jump(D.stops[+b.dataset.stop].t));
    }
  }
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderPanel(); });
  $('#detailsBtn').onclick = () => { $('#panel').classList.toggle('closed'); $('#detailsBtn').classList.toggle('on', !$('#panel').classList.contains('closed')); need = true; };
  const syncBottom = () => document.documentElement.style.setProperty('--bottom-h', ($('#bottom').offsetHeight + 20) + 'px');
  new ResizeObserver(syncBottom).observe($('#bottom')); renderPanel();
  if (innerWidth >= 900) $('#panel').classList.remove('closed');

  function drawProfile(s) {
    const cv = $('#prof'); if (!cv || $('#panel').classList.contains('closed')) return;
    const r = cv.getBoundingClientRect(); if (!r.width) return; const dpr = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = r.width * dpr; cv.height = r.height * dpr; }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, r.width, r.height);
    const L = 36, Rr = 36, Tp = 12, B = 20, w = r.width - L - Rr, h = r.height - Tp - B, Xd = d => L + d / total * w;
    c.font = '10px system-ui'; c.fillStyle = '#a9b4b9'; c.strokeStyle = 'rgba(255,255,255,.1)';
    const kmStep = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].find(k => total / 1000 / k <= 6) || 100;
    c.textAlign = 'center'; for (let k = 0; k <= total / 1000 + 1e-9; k += kmStep) { const x = Xd(k * 1000); c.beginPath(); c.moveTo(x, Tp); c.lineTo(x, Tp + h); c.stroke(); c.fillText(+k.toFixed(1) + ' km', x, r.height - 6); }
    const eles = P.filter(p => p[E] != null);
    if (eles.length) {
      let lo = Infinity, hi = -Infinity; eles.forEach(p => { lo = Math.min(lo, p[E]); hi = Math.max(hi, p[E]); }); lo = Math.floor(lo / 10) * 10; hi = Math.max(lo + 20, Math.ceil(hi / 10) * 10);
      const Ye = e => Tp + h - (e - lo) / (hi - lo) * h;
      c.beginPath(); c.moveTo(Xd(eles[0][Dd]), Tp + h); eles.forEach(p => c.lineTo(Xd(p[Dd]), Ye(p[E]))); c.lineTo(Xd(eles[eles.length - 1][Dd]), Tp + h); c.closePath();
      c.fillStyle = 'rgba(159,179,166,.35)'; c.fill(); c.strokeStyle = '#9fb3a6'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = '#a9b4b9'; c.textAlign = 'left'; c.fillText(hi + ' m', L + w + 4, Tp + 8); c.fillText(lo + ' m', L + w + 4, Tp + h);
    }
    const vTop = Math.max(20, Math.ceil(S.maxV * 3.6 / 20) * 20), Yv = v => Tp + h - v * 3.6 / vTop * h;
    c.textAlign = 'right'; c.fillStyle = '#a9b4b9'; for (let v = 0; v <= vTop; v += vTop / 4) c.fillText(Math.round(v), L - 4, Yv(v / 3.6) + 3);
    c.strokeStyle = '#fff'; c.lineWidth = 1.4; c.beginPath(); let open = false;
    P.forEach(p => { const x = Xd(p[Dd]), y = Yv(p[V]); if (!open || p[GAP]) { c.moveTo(x, y); open = true; } else c.lineTo(x, y); }); c.stroke();
    D.turns.forEach(t => { c.fillStyle = t.kind === 'U-turn' ? '#c084fc' : t.kind === 'sharp' ? '#fb923c' : '#60a5fa'; c.beginPath(); c.arc(Xd(t.d), Tp + h - 4, 3.5, 0, 7); c.fill(); });
    D.stops.forEach(st => { c.fillStyle = '#94a3b8'; c.fillRect(Xd(st.d) - 3, Tp + 1, 6, 6); });
    const x = Xd(s.d); c.strokeStyle = '#ff7a2f'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, Tp); c.lineTo(x, Tp + h); c.stroke();
    c.fillStyle = '#ff7a2f'; c.textAlign = x > r.width - 80 ? 'right' : 'left'; c.fillText(`${kmh(s.v)} km/h${s.ele != null ? ' · ' + Math.round(s.ele) + ' m' : ''}`, x + (c.textAlign === 'left' ? 5 : -5), Tp + 10);
  }

  /* ---------- HUD ---------- */
  function hud(s) {
    const g = grade(s), gauge = (k, v, u, big) => `<div class="glass g${big ? ' big' : ''}"><div class="k">${k}</div><div class="v">${v}<small>${u}</small></div></div>`;
    $('#gauges').innerHTML = gauge('Speed', kmh(s.v), 'km/h', true) + (s.ele != null ? gauge('Elevation', Math.round(s.ele), 'm') : '') + gauge('Distance', (s.d / 1000).toFixed(2), 'km')
      + (g != null ? gauge('Grade', (g > 0 ? '+' : '') + g.toFixed(1), '%') : '') + gauge('Heading', compass(s.hdg), Math.round(s.hdg) + '°') + gauge(D.timed ? 'Clock' : 'Time', D.timed ? clock(tt) : fmtDur(tt), '');
    const nx = D.turns.find(t => t.d > s.d + 3), nEl = $('#next');
    if (s.inGap) { nEl.hidden = false; nEl.innerHTML = '<span style="color:#ffb020">GPS gap</span> — not recorded for ' + fmtDur(s.gapEnd - P[s.i][T]); }
    else if (nx && nx.d - s.d < 1500) { nEl.hidden = false; nEl.innerHTML = `${turnIcon(nx)}<span>${turnName(nx)} in ${fmtDist(Math.round((nx.d - s.d) / 10) * 10)}</span>`; }
    else nEl.hidden = true;
    $('#time').textContent = `${fmtDur(tt)} / ${fmtDur(TT)}`; if (document.activeElement !== $('#scrub')) $('#scrub').value = tt;
    document.querySelectorAll('[data-turn]').forEach(b => b.classList.toggle('cur', D.turns[+b.dataset.turn] === nx));
  }

  /* ---------- camera ---------- */
  const look = new THREE.Vector3(rcx, 0, rcz); camera.position.set(rcx, rExt * 0.9, rcz + rExt * 0.9); camera.lookAt(look);
  const followDist = Math.min(1400, Math.max(220, rExt * 0.09));
  function updateCamera(s, dt, now) {
    let tPos, tLook;
    if (camMode === 'follow') {
      const a = at(Math.max(0, tAtD(s.d - 60))), b = at(tAtD(Math.min(total, s.d + 160)));
      let hx = b.x - a.x, hz = b.z - a.z; const Lh = Math.hypot(hx, hz); if (Lh < 1) { hx = Math.sin(s.hdg * Math.PI / 180); hz = -Math.cos(s.hdg * Math.PI / 180); } else { hx /= Lh; hz /= Lh; }
      const cs = Math.cos(yaw), sn = Math.sin(yaw), bx = hx * cs - hz * sn, bz = hx * sn + hz * cs, pitch = Math.max(0.15, Math.min(1.45, 0.6 + pitchAdj)), dist = followDist * zoom;
      tPos = new THREE.Vector3(s.x - bx * dist * Math.cos(pitch), s.y + dist * Math.sin(pitch), s.z - bz * dist * Math.cos(pitch));
      tLook = new THREE.Vector3(s.x + hx * followDist * 0.2, s.y, s.z + hz * followDist * 0.2);
    } else if (camMode === 'orbit') {
      const ang = now * 0.00006 + yaw, pitch = Math.max(0.2, Math.min(1.45, 0.75 + pitchAdj)), dist = rExt * 0.95 * zoom;
      tPos = new THREE.Vector3(rcx + Math.sin(ang) * dist * Math.cos(pitch), dist * Math.sin(pitch), rcz + Math.cos(ang) * dist * Math.cos(pitch)); tLook = new THREE.Vector3(rcx, 0, rcz);
    } else { // map view: straight down, north up, following the car
      const hgt = rExt * 1.05 * zoom; tPos = new THREE.Vector3(s.x * 0.5 + rcx * 0.5, hgt, s.z * 0.5 + rcz * 0.5 + 0.01); tLook = new THREE.Vector3(s.x * 0.5 + rcx * 0.5, 0, s.z * 0.5 + rcz * 0.5);
    }
    const k1 = 1 - Math.exp(-dt * (camMode === 'top' ? 4 : 2.2)), k2 = 1 - Math.exp(-dt * 4);
    camera.position.lerp(tPos, k1); look.lerp(tLook, k2); camera.up.set(0, 1, 0); if (camMode === 'top') camera.up.set(0, 0, -1); camera.lookAt(look);
  }

  /* ---------- loop ---------- */
  let last = performance.now(), lastPanel = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing) {
      let s0 = at(tt), r = rate; if (s0.v < 0.8 && rate < 30) r = Math.max(rate, 30); // skim through stops
      tt += dt * r; const s1 = at(tt); if (s1.inGap) tt = s1.gapEnd; // jump over GPS gaps
      if (tt >= TT) { tt = TT; setPlay(false); if (recorder) stopVideo(); }
    }
    const s = at(tt);
    car.position.set(s.x, s.y, s.z); car.rotation.y = -s.hdg * Math.PI / 180;
    const pulse = (now / 900) % 1; ring.scale.setScalar(1 + pulse * 1.6); ring.material.opacity = 1 - pulse;
    updateCamera(s, dt, now);
    const sc = camera.position.distanceTo(car.position) / followDist; car.scale.setScalar(Math.max(0.6, Math.min(6, sc)));
    renderer.render(scene, camera);
    hud(s); if (now - lastPanel > 90) { lastPanel = now; drawProfile(s); }
    if (recCtx) composite(s);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  // look around: drag to turn, pinch or wheel to zoom
  const ptrs = new Map(); let pinch0 = null; const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); });
  el.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return; const [px, py] = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) { yaw += (e.clientX - px) * 0.006; pitchAdj = Math.max(-0.5, Math.min(0.9, pitchAdj - (e.clientY - py) * 0.004)); }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) zoom = Math.max(0.25, Math.min(4, zoom * pinch0 / dd)); pinch0 = dd; }
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(0.25, Math.min(4, zoom * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  addEventListener('keydown', e => { if (e.target.closest('select,input')) return; if (e.key === ' ') { e.preventDefault(); $('#play').click(); } if (e.key === 'ArrowRight') jump(tt + 10); if (e.key === 'ArrowLeft') jump(tt - 10); });

  /* ---------- video: 3D view plus overlay drawn into one canvas ---------- */
  let recorder = null, recCtx = null, recCv = null, chunks = [];
  function composite(s) {
    const W = recCv.width, Hh = recCv.height, sc = W / innerWidth; recCtx.drawImage(renderer.domElement, 0, 0, W, Hh);
    recCtx.save(); recCtx.scale(sc, sc); recCtx.fillStyle = 'rgba(17,23,26,.7)'; recCtx.fillRect(0, 0, innerWidth, 92);
    recCtx.fillStyle = '#fff'; recCtx.font = '800 17px system-ui,sans-serif'; recCtx.fillText(D.name, 14, 26, innerWidth - 28);
    const items = [['SPEED', kmh(s.v) + ' km/h'], ['DISTANCE', (s.d / 1000).toFixed(2) + ' km']].concat(s.ele != null ? [['ELEVATION', Math.round(s.ele) + ' m']] : []).concat([['HEADING', compass(s.hdg)]]);
    items.forEach(([k, v], i) => { const x = 14 + i * Math.min(110, (innerWidth - 28) / items.length); recCtx.globalAlpha = 0.7; recCtx.font = '600 10px system-ui,sans-serif'; recCtx.fillText(k, x, 52); recCtx.globalAlpha = 1; recCtx.font = '800 18px system-ui,sans-serif'; recCtx.fillText(v, x, 74); });
    const nx = D.turns.find(t => t.d > s.d + 3); if (nx && nx.d - s.d < 1500) { recCtx.font = '700 15px system-ui,sans-serif'; recCtx.fillText(`${turnName(nx)} in ${fmtDist(Math.round((nx.d - s.d) / 10) * 10)}`, 14, Hh / sc - 20); }
    recCtx.fillStyle = 'rgba(255,255,255,.3)'; recCtx.fillRect(0, Hh / sc - 4, innerWidth, 4); recCtx.fillStyle = '#ff7a2f'; recCtx.fillRect(0, Hh / sc - 4, innerWidth * tt / TT, 4);
    recCtx.restore();
  }
  function stopVideo() { if (recorder && recorder.state !== 'inactive') recorder.stop(); }
  $('#video').onclick = () => {
    if (recorder) { stopVideo(); return; }
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'], type = window.MediaRecorder && types.find(t => MediaRecorder.isTypeSupported(t));
    if (!type) { alert('This browser can’t record video. Try Chrome.'); return; }
    recCv = document.createElement('canvas'); const k = Math.min(1, 1280 / Math.max(innerWidth, innerHeight)) * Math.min(devicePixelRatio || 1, 2);
    recCv.width = Math.round(innerWidth * k / 2) * 2; recCv.height = Math.round(innerHeight * k / 2) * 2; recCtx = recCv.getContext('2d');
    chunks = []; recorder = new MediaRecorder(recCv.captureStream(30), { mimeType: type, videoBitsPerSecond: 6e6 });
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    recorder.onstop = () => { const blob = new Blob(chunks, { type: type.split(';')[0] }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = D.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.' + (type.includes('mp4') ? 'mp4' : 'webm'); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); recorder = null; recCtx = null; $('#recTag').hidden = true; $('#video').textContent = '⬇ Video'; };
    tt = 0; setPlay(true); recorder.start(500); $('#recTag').hidden = false; $('#video').textContent = '■ Stop';
  };
};
