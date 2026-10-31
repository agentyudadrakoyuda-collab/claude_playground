'use strict';
/* Track Replay: "offline map for guests" export.
   Builds one self-contained HTML file with the map library, the street-map tiles along
   the route, the route itself and a small GPS navigator, so it works without internet. */

const OFFLINE = {
  ml: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  mlcss: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  // OpenFreeMap: free vector map tiles, no key, open to offline use.
  style: 'https://tiles.openfreemap.org/styles/liberty',
  zmin: 10, zmax: 14, maxTiles: 1500,
  glyphRanges: ['0-255', '256-511', '8192-8447']
};

function lon2tx(lon, z) { return Math.floor((lon + 180) / 360 * 2 ** z); }
function lat2ty(lat, z) { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); }

/** Tiles covering a corridor around the route at each zoom level. */
function corridorTiles(coords, zmin, zmax) {
  const set = new Set();
  for (let z = zmin; z <= zmax; z++) {
    const buf = 1, tileM = 40075016 * Math.cos(coords[0][1] * Math.PI / 180) / 2 ** z;
    let lastKey = null;
    for (let i = 0; i < coords.length; i++) {
      const p = coords[i], q = coords[i + 1], samples = [p];
      if (q) { const n = Math.ceil(hav(p[0], p[1], q[0], q[1]) / (tileM / 3)); for (let k = 1; k < n; k++) samples.push([p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n]); }
      for (const s of samples) {
        const x = lon2tx(s[0], z), y = lat2ty(s[1], z), key = z + '/' + x + '/' + y;
        if (key === lastKey) continue; lastKey = key;
        for (let dx = -buf; dx <= buf; dx++) for (let dy = -buf; dy <= buf; dy++) set.add(z + '/' + (x + dx) + '/' + (y + dy));
      }
    }
  }
  return [...set];
}

function bytesToB64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
async function getJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error('http ' + r.status); return r.json(); }
async function getB64(u) { const r = await fetch(u); if (!r.ok) throw new Error('http ' + r.status); return bytesToB64(await r.arrayBuffer()); }
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } })); }

/** Font stacks used by a style's text layers. */
function fontStacks(style) {
  const out = new Set(), ops = new Set(['literal', 'step', 'match', 'case', 'coalesce', 'zoom', 'get', 'interpolate', 'linear']);
  const walk = v => { if (!Array.isArray(v)) return; if (v.length && v.every(x => typeof x === 'string') && !ops.has(v[0])) out.add(v.join(',')); else v.forEach(walk); };
  style.layers.forEach(l => walk(l.layout && l.layout['text-font']));
  if (!out.size) out.add('Noto Sans Regular');
  return [...out];
}

let offlineBusy = false;
async function exportOffline(tr) {
  if (offlineBusy) { toast('An offline map is already being saved.'); return; }
  const coords = tr.pts.filter((p, i) => i === 0 || hav(p.lon, p.lat, tr.pts[i - 1].lon, tr.pts[i - 1].lat) >= 8 || i === tr.pts.length - 1).map(p => [+p.lon.toFixed(6), +p.lat.toFixed(6)]);
  offlineBusy = true;
  try {
    toast('Saving offline map: downloading the map style…', 60000);
    const [mljs, mlcss, style] = await Promise.all([
      fetch(OFFLINE.ml).then(r => { if (!r.ok) throw 0; return r.text(); }),
      fetch(OFFLINE.mlcss).then(r => { if (!r.ok) throw 0; return r.text(); }),
      getJSON(OFFLINE.style)]);
    // Keep the vector street layers; drop extra raster sources (relief shading) that would need more downloads.
    const vec = Object.entries(style.sources).find(([, s]) => s.type === 'vector');
    if (!vec) throw new Error('style');
    const [srcName, src] = vec, tj = src.url ? await getJSON(src.url) : src;
    const tmpl = tj.tiles[0], vmax = Math.min(tj.maxzoom ?? 14, OFFLINE.zmax);
    for (const k of Object.keys(style.sources)) if (k !== srcName) delete style.sources[k];
    style.layers = style.layers.filter(l => !l.source || l.source === srcName);
    style.sources[srcName] = { type: 'vector', tiles: ['off://v/{z}/{x}/{y}'], minzoom: 0, maxzoom: vmax, attribution: tj.attribution || src.attribution || '© OpenMapTiles © OpenStreetMap contributors' };
    const assets = { v: {}, g: {}, s: {} };
    // street tiles along the route
    const tiles = corridorTiles(coords, OFFLINE.zmin, vmax);
    if (tiles.length > OFFLINE.maxTiles) { toast(`This route needs ${tiles.length} map tiles, more than one file can hold. Split it into shorter routes.`, 6000); return; }
    let done = 0, failed = 0;
    await pool(tiles, 8, async key => {
      const [z, x, y] = key.split('/');
      try { assets.v[key] = await getB64(tmpl.replace('{z}', z).replace('{x}', x).replace('{y}', y)); } catch (e) { failed++; }
      done++; if (done % 5 === 0 || done === tiles.length) toast(`Saving offline map: ${done} of ${tiles.length} map tiles…`, 60000);
    });
    if (failed > tiles.length * 0.3) throw new Error('tiles');
    // label fonts
    if (style.glyphs) {
      const jobs = []; fontStacks(style).forEach(fs => OFFLINE.glyphRanges.forEach(r => jobs.push([fs, r])));
      await pool(jobs, 6, async ([fs, r]) => { try { assets.g[fs + '/' + r] = await getB64(style.glyphs.replace('{fontstack}', encodeURIComponent(fs)).replace('{range}', r)); } catch (e) {} });
      style.glyphs = 'off://g/{fontstack}/{range}';
    }
    // map icons
    const spriteUrl = Array.isArray(style.sprite) ? (style.sprite[0] && style.sprite[0].url) : style.sprite;
    if (spriteUrl) {
      try {
        const [j1, p1, j2, p2] = await Promise.all([getJSON(spriteUrl + '.json'), getB64(spriteUrl + '.png'), getJSON(spriteUrl + '@2x.json'), getB64(spriteUrl + '@2x.png')]);
        assets.s = { 'sprite.json': j1, 'sprite.png': p1, 'sprite@2x.json': j2, 'sprite@2x.png': p2 }; style.sprite = 'off://s/sprite';
      } catch (e) { delete style.sprite; style.layers = style.layers.filter(l => !(l.layout && l.layout['icon-image'])); }
    }
    const steps = (tr.navSteps || []).map(s => ({ lon: s.lon, lat: s.lat, type: s.type, mod: s.mod, exit: s.exit, name: s.name }));
    const data = { name: tr.name, coords, steps, avg: tr.stats.avgMoving || 11, zmin: OFFLINE.zmin, style, made: new Date().toISOString().slice(0, 10) };
    const html = guestHTML(data, assets, mljs, mlcss);
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = (tr.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'route') + '-offline-map.html';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast(`Saved “${a.download}” (${(blob.size / 1048576).toFixed(1)} MB${failed ? `, ${failed} tiles missing` : ''}). Send it to your guests.`, 7000);
  } catch (e) {
    toast('Couldn’t save the offline map. Check your internet connection and try again.', 6000);
  } finally { offlineBusy = false; }
}

const safeJSON = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(new RegExp('[\u2028\u2029]', 'g'), '');

function guestHTML(data, tiles, mljs, mlcss) {
  const title = esc(data.name);
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">' +
    '<meta name="theme-color" content="#ffffff"><title>' + title + ' · offline map</title>' +
    '<style>' + mlcss + '</style><style>' + GUEST_CSS + '</style></head><body>' +
    GUEST_BODY.replace('{{TITLE}}', title) +
    '<script>' + mljs.replace(/<\/script/gi, '<\\/script') + '<\/script>' +
    '<script>const DATA=' + safeJSON(data) + ';const ASSETS=' + safeJSON(tiles) + ';(' + guestRuntime.toString() + ')();<\/script>' +
    '</body></html>';
}

const GUEST_CSS = `
*{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2328;background:#eef0f2;-webkit-tap-highlight-color:transparent}
button{font:inherit;border:0;cursor:pointer}
#map{position:fixed;inset:0}
.banner{position:fixed;z-index:3;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));top:calc(10px + env(safe-area-inset-top));background:#0b8043;color:#fff;border-radius:14px;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;gap:14px;align-items:center;padding:12px 16px;min-height:72px}
.banner.off{background:#e37400}.banner.idle{background:#fff;color:#1f2328}
.banner svg{width:42px;height:42px;flex:none}
.banner .d{font-weight:800;font-size:24px;line-height:1}.banner .t{font-size:16px;font-weight:600;margin-top:3px;line-height:1.2}
.card{position:fixed;z-index:3;left:0;right:0;bottom:0;background:#fff;border-radius:18px 18px 0 0;box-shadow:0 -2px 16px rgba(0,0,0,.18);padding:14px max(16px,env(safe-area-inset-right)) calc(14px + env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));display:grid;gap:10px}
.card .name{font-weight:700;font-size:17px}
.eta{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.eta b{font-size:24px;color:#188038}.eta span{color:#5f6670}
.row{display:flex;gap:8px;flex-wrap:wrap}
.row button{border-radius:22px;padding:11px 16px;font-weight:700;background:#eef1f4;color:#1a73e8}
.row button.primary{background:#1a73e8;color:#fff;flex:1}
.note{font-size:12.5px;color:#5f6670}
.fab{position:fixed;z-index:3;right:max(12px,env(safe-area-inset-right));width:46px;height:46px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);font-weight:800;color:#1f2328}
.me{width:34px;height:34px}
.maplibregl-ctrl-bottom-right{bottom:var(--card-h,150px)}
`;

const GUEST_BODY = `
<div id="map"></div>
<div class="banner idle" id="banner"><svg id="ico" viewBox="0 0 48 48"></svg><div><div class="d" id="bd"></div><div class="t" id="bt"></div></div></div>
<button class="fab" id="north" aria-label="North up" style="top:calc(96px + env(safe-area-inset-top))">N</button>
<div class="card" id="card">
  <div class="name">{{TITLE}}</div>
  <div class="eta" id="eta"></div>
  <div class="row"><button class="primary" id="go">Start navigation</button><button id="ov">Overview</button><button id="rev">⇄ Reverse</button></div>
  <div class="note" id="note">This map works without internet. Allow location when asked to see where you are.</div>
</div>`;

/* Runs inside the exported file. Self-contained: uses only DATA, ASSETS and maplibregl. */
function guestRuntime() {
  const D2R = Math.PI / 180, $ = s => document.querySelector(s);
  const hav = (a, b, c, d) => { const p = b * D2R, q = d * D2R, h = Math.sin((q - p) / 2) ** 2 + Math.cos(p) * Math.cos(q) * Math.sin((c - a) * D2R / 2) ** 2; return 2 * 6371008.8 * Math.asin(Math.sqrt(h)); };
  const brg = (a, b, c, d) => { const y = Math.sin((c - a) * D2R) * Math.cos(d * D2R), x = Math.cos(b * D2R) * Math.sin(d * D2R) - Math.sin(b * D2R) * Math.cos(d * D2R) * Math.cos((c - a) * D2R); return (Math.atan2(y, x) / D2R + 360) % 360; };
  const fmtDist = m => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
  const fmtMin = s => { const m = Math.max(1, Math.round(s / 60)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
  let route = DATA.coords.slice(), steps = [], reversed = false, cum = [], total = 0;
  function prep() {
    cum = [0]; for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + hav(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1]));
    total = cum[cum.length - 1];
    steps = reversed ? [] : DATA.steps.map(s => ({ ...s, d: project(s.lon, s.lat).s })).sort((a, b) => a.d - b.d);
  }
  function project(lon, lat) { // nearest point on the route: distance along it (s) and away from it (off)
    const k = Math.cos(lat * D2R) * 111320, K = 110540; let best = { off: Infinity, s: 0, i: 0 };
    for (let i = 0; i < route.length - 1; i++) {
      const ax = (route[i][0] - lon) * k, ay = (route[i][1] - lat) * K, bx = (route[i + 1][0] - lon) * k, by = (route[i + 1][1] - lat) * K;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t, py = ay + dy * t, off = Math.hypot(px, py);
      if (off < best.off) best = { off, s: cum[i] + (cum[i + 1] - cum[i]) * t, i };
    }
    return best;
  }
  const MOD = { uturn: 180, 'sharp right': 135, right: 90, 'slight right': 45, straight: 0, 'slight left': -45, left: -90, 'sharp left': -135 };
  function stepText(s) {
    const on = s.name ? ' onto ' + s.name : '', m = s.mod || '';
    switch (s.type) {
      case 'depart': return 'Head out' + (s.name ? ' on ' + s.name : '');
      case 'arrive': return 'Arrive at your destination';
      case 'roundabout': case 'rotary': return 'At the roundabout, take exit ' + (s.exit || '') + on;
      case 'fork': case 'merge': case 'on ramp': case 'off ramp': return 'Keep ' + (m.includes('left') ? 'left' : m.includes('right') ? 'right' : 'straight') + on;
      case 'end of road': return 'At the end of the road, turn ' + (m.includes('left') ? 'left' : 'right') + on;
      case 'continue': case 'new name': return 'Continue' + (on || ' straight');
      default: return m === 'straight' ? 'Continue straight' + on : m === 'uturn' ? 'Make a U-turn' + on : 'Turn ' + m + on;
    }
  }
  const ICON = {
    arrow: a => `<g transform="rotate(${a} 24 24)"><path d="M24 6 L36 20 H28 V42 H20 V20 H12 Z" fill="currentColor"/></g>`,
    pin: '<circle cx="24" cy="18" r="9" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 27v15" stroke="currentColor" stroke-width="4"/>',
    round: '<circle cx="24" cy="26" r="9" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 4l7 9h-5v8h-4v-8h-5z" fill="currentColor"/>',
    warn: '<path d="M24 5 L45 42 H3 Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 18v12M24 34v4" stroke="currentColor" stroke-width="4"/>'
  };
  function banner(cls, ico, d, t) { const b = $('#banner'); b.className = 'banner ' + cls; $('#ico').innerHTML = ico; $('#bd').textContent = d; $('#bt').textContent = t; }

  // offline map data through a custom protocol: v = street tiles, g = label fonts, s = icons
  const b64buf = b => { const bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  maplibregl.addProtocol('off', async p => {
    const path = decodeURIComponent(p.url.slice(6)), kind = path[0], key = path.slice(2);
    if (kind === 's') { const v = ASSETS.s[key]; if (v == null) throw new Error('missing'); return { data: key.endsWith('.json') ? v : b64buf(v) }; }
    const b = kind === 'v' ? ASSETS.v[key] : ASSETS.g[key.replace(/\.pbf$/, '')];
    return { data: b ? b64buf(b) : new ArrayBuffer(0) };
  });
  prep();
  let w = 180, e = -180, s = 90, n = -90; route.forEach(c => { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); });
  const bounds = [[w, s], [e, n]];
  const map = new maplibregl.Map({
    container: 'map', bounds, fitBoundsOptions: { padding: { top: 110, bottom: 190, left: 40, right: 40 } }, maxZoom: 19, minZoom: DATA.zmin - 1, attributionControl: { compact: true }, maxPitch: 65,
    style: DATA.style
  });
  const meEl = document.createElement('div'); meEl.className = 'me';
  meEl.innerHTML = '<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="#fff"/><path d="M17 5 L26 27 L17 22 L8 27 Z" fill="#1a73e8"/></svg>';
  const me = new maplibregl.Marker({ element: meEl, rotationAlignment: 'map', pitchAlignment: 'map' });
  function routeData() { return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route } }; }
  function endsData() { return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { c: '#188038' }, geometry: { type: 'Point', coordinates: route[0] } }, { type: 'Feature', properties: { c: '#d93025' }, geometry: { type: 'Point', coordinates: route[route.length - 1] } }] }; }
  map.on('load', () => {
    map.addSource('r', { type: 'geojson', data: routeData() }); map.addSource('e', { type: 'geojson', data: endsData() });
    map.addLayer({ id: 'rc', type: 'line', source: 'r', paint: { 'line-color': '#fff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 13] }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
    map.addLayer({ id: 'rl', type: 'line', source: 'r', paint: { 'line-color': '#1a73e8', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 8] }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
    map.addLayer({ id: 'ee', type: 'circle', source: 'e', paint: { 'circle-radius': 7, 'circle-color': ['get', 'c'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
  });
  const setCardH = () => document.documentElement.style.setProperty('--card-h', $('#card').offsetHeight + 'px'); setCardH(); addEventListener('resize', setCardH);

  let watch = null, follow = false, pos = null, heading = null, smooth = null, wl = null;
  function idle() { banner('idle', ICON.arrow(0), fmtDist(total), (reversed ? 'Reversed · ' : '') + 'Press Start navigation when you set off'); $('#eta').innerHTML = `<b>${fmtMin(total / DATA.avg)}</b><span>· ${fmtDist(total)} · offline map saved ${DATA.made}</span>`; }
  idle();
  function update() {
    if (!pos) return;
    if ($('#note').textContent.startsWith('Finding') || $('#note').textContent.startsWith('Waiting')) $('#note').textContent = 'Navigating with GPS. No internet needed.';
    const p = project(pos[0], pos[1]), remain = Math.max(0, total - p.s);
    $('#eta').innerHTML = `<b>${fmtMin(remain / DATA.avg)}</b><span>· ${fmtDist(remain)} left</span>`;
    if (p.off > 60) banner('off', ICON.warn, fmtDist(p.off), 'Off route. Head back to the blue line');
    else if (remain < 30) banner('', ICON.pin, 'Arrived', 'You have reached the destination');
    else if (steps.length) { const nx = steps.find(x => x.d > p.s + 5) || steps[steps.length - 1];
      const ico = nx.type === 'arrive' ? ICON.pin : (nx.type === 'roundabout' || nx.type === 'rotary') ? ICON.round : ICON.arrow(MOD[nx.mod] ?? 0);
      banner('', ico, fmtDist(Math.max(0, nx.d - p.s)), stepText(nx)); }
    else banner('', ICON.arrow(0), fmtDist(remain), 'Follow the blue line to the finish');
    let h = heading; if (h == null) { const i = p.i; h = brg(route[i][0], route[i][1], route[i + 1][0], route[i + 1][1]); }
    me.setLngLat(pos).setRotation(h).addTo(map);
    if (follow) { smooth = smooth == null ? h : (smooth + (((h - smooth + 540) % 360) - 180) * 0.35 + 360) % 360;
      map.easeTo({ center: pos, bearing: smooth, pitch: 50, zoom: Math.max(map.getZoom(), 16), padding: { top: innerHeight * 0.35, bottom: $('#card').offsetHeight, left: 0, right: 0 }, duration: 600 }); }
  }
  function start() {
    if (!navigator.geolocation) { $('#note').textContent = 'This browser can’t share your location, so only the map is available.'; return; }
    follow = true; $('#go').textContent = 'Re-center';
    if (watch == null) watch = navigator.geolocation.watchPosition(g => {
      const c = g.coords; pos = [c.longitude, c.latitude];
      heading = c.heading != null && !isNaN(c.heading) && (c.speed || 0) > 1 ? c.heading : null; update();
    }, err => { $('#note').textContent = err.code === 1 ? 'Location is blocked. Allow location for this file in your browser settings to see where you are.' : 'Waiting for a GPS signal…'; }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
    if (navigator.wakeLock && !wl) navigator.wakeLock.request('screen').then(l => wl = l).catch(() => {});
    if (pos) update(); else $('#note').textContent = 'Finding your location…';
  }
  $('#go').onclick = start;
  map.on('dragstart', ev => { if (ev.originalEvent && follow) { follow = false; } });
  $('#ov').onclick = () => { follow = false; map.fitBounds(bounds, { padding: { top: 110, bottom: $('#card').offsetHeight + 20, left: 40, right: 40 }, bearing: 0, pitch: 0, duration: 700 }); };
  $('#north').onclick = () => map.easeTo({ bearing: 0, pitch: 0, duration: 400 });
  $('#rev').onclick = () => {
    reversed = !reversed; route.reverse(); prep();
    if (map.getSource('r')) { map.getSource('r').setData(routeData()); map.getSource('e').setData(endsData()); }
    $('#rev').textContent = reversed ? '⇄ Original direction' : '⇄ Reverse';
    $('#note').textContent = reversed ? 'Reversed: drive from the red finish back to the green start. Turn-by-turn directions are off in this direction.' : 'This map works without internet.';
    pos ? update() : idle();
  };
}
