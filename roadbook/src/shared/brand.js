/* Roadbook · cores da marca a partir do logótipo (R-A11) e regra de contraste 4,5:1 (R-S10). */
(function (root) {
  'use strict';
  const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const rgb2hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = h => { const [r, g, b] = hex2rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function rgb2hsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return [h, s, l];
  }
  function hsl2rgb([h, s, l]) {
    if (!s) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  /* a cor mais próxima (mesmo tom e saturação, só a luminosidade muda) que cumpre o mínimo contra todas as cores dadas */
  function nearestPassing(color, against, min = 4.5) {
    const ok = c => against.every(a => contrast(c, a) >= min);
    if (ok(color)) return color;
    const [h, s, l] = rgb2hsl(hex2rgb(color));
    for (let d = 0.01; d <= 1; d += 0.01) {
      for (const L of [l - d, l + d]) { if (L < 0 || L > 1) continue; const c = rgb2hex(hsl2rgb([h, s, L])); if (ok(c)) return c; }
    }
    return lum(against[0]) > 0.5 ? '#000000' : '#ffffff';
  }
  /* pixels RGBA → [primária, destaque]. Ignora transparente, quase branco e quase preto. */
  function extractColors(rgba) {
    const bins = new Map();
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] < 128) continue;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], [, s, l] = rgb2hsl([r, g, b]);
      if (l > 0.93 || l < 0.07) continue;
      const k = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4), e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0, s };
      e.n += 1 + s * 2; e.r += r; e.g += g; e.b += b; bins.set(k, e);
    }
    const list = [...bins.values()].map(e => ({ n: e.n, c: [e.r, e.g, e.b].map(v => v / (e.n ? (e.n / (1 + e.s * 2)) : 1)), s: e.s })).sort((a, b) => b.n - a.n);
    if (!list.length) return { primary: '#2f6b4a', accent: '#b0531f', fromLogo: false };
    const chroma = c => (Math.max(...c) - Math.min(...c)) / 255;
    const vivid = list.filter(e => chroma(e.c) > 0.25), base = vivid.length ? vivid : list;
    const prim = base[0].c, [ph, , pl] = rgb2hsl(prim);
    const acc = base.find(e => { const [h] = rgb2hsl(e.c); const dh = Math.min(Math.abs(h - ph), 1 - Math.abs(h - ph)); return dh > 0.08; })
      || base.find(e => Math.abs(rgb2hsl(e.c)[2] - pl) > 0.04) || base[0];
    return { primary: rgb2hex(prim), accent: rgb2hex(acc.c), fromLogo: true };
  }
  /* Paleta final do Navigator nos dois temas. Os textos sobre fundos cumprem 4,5:1. */
  const BG = { light: { bg: '#f3eee6', surface: '#fffdf9', ink: '#1d2420' }, dark: { bg: '#121614', surface: '#1b211e', ink: '#eef0ea' } };
  function palette(primary, accent) {
    const out = {};
    for (const th of ['light', 'dark']) {
      const B = BG[th];
      /* cor primária: texto forte e fundo dos botões/km. Tem de passar contra o fundo e a superfície. */
      const p = nearestPassing(primary, [B.bg, B.surface], 4.5);
      /* texto sobre a primária: branco ou quase preto, o que tiver mais contraste */
      const ink = contrast(p, '#ffffff') >= contrast(p, '#14100c') ? '#ffffff' : '#14100c';
      const route = nearestPassing(accent, [B.map || (th === 'light' ? '#ebe4d7' : '#171c1a')], 3);
      out[th] = { primary: p, onPrimary: ink, route, ratios: { primaryOnBg: +contrast(p, B.bg).toFixed(2), primaryOnSurface: +contrast(p, B.surface).toFixed(2), inkOnPrimary: +contrast(ink, p).toFixed(2) } };
      if (out[th].ratios.inkOnPrimary < 4.5) { /* raro: escurecer/clarear até o texto passar */
        const p2 = nearestPassing(p, [ink, B.bg, B.surface], 4.5); out[th].primary = p2; out[th].ratios = { primaryOnBg: +contrast(p2, B.bg).toFixed(2), primaryOnSurface: +contrast(p2, B.surface).toFixed(2), inkOnPrimary: +contrast(ink, p2).toFixed(2) };
      }
    }
    return out;
  }
  function passes(primary, accent) {
    const p = palette(primary, accent);
    /* a cor escolhida tem de passar tal como está no tema claro (o principal); o tema escuro usa sempre a variante calculada */
    const exact = contrast(primary, BG.light.bg) >= 4.5 && contrast(primary, BG.light.surface) >= 4.5;
    return { palette: p, exact, ok: ['light', 'dark'].every(th => Object.values(p[th].ratios).every(r => r >= 4.5)) };
  }
  const api = { hex2rgb, rgb2hex, contrast, nearestPassing, extractColors, palette, passes, BG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RBBrand = api;
})(typeof window !== 'undefined' ? window : globalThis);
