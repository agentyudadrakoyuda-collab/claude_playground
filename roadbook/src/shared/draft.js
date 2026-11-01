/* Roadbook · rascunho automático (R-A1 a R-A13). Corre no Studio e em Node (testes). */
(function (root) {
  'use strict';
  const G = (typeof module !== 'undefined' && module.exports) ? require('./geo.js') : root.RBGeo;

  const CFG = {
    win: 60, turnDeg: 35, pairM: 150,          /* R-A1 */
    straightM: 1000,                            /* R-A3 */
    eleDelta: 20, eleWin: 2000,                 /* R-A4 */
    slowKmh: 15, slowS: 5, edgeM: 150,          /* R-A5 */
    stopS: 15,                                  /* R-A6 */
    osmM: 150, maxPoints: 12,                   /* R-A9, R-A10 */
    trigBefore: 100                             /* R-A13 */
  };
  const km = m => G.fmtKm(m);

  /* R-A1 · manobras: mudança de rumo entre os 60 m antes e os 60 m depois de cada ponto (passo 10 m). */
  function detectTurns(P, total) {
    const step = 10, cand = [];
    for (let m = CFG.win; m <= total - CFG.win; m += step) {
      const a = G.pointAtDist(P, m - CFG.win), b = G.pointAtDist(P, m), c = G.pointAtDist(P, m + CFG.win);
      cand.push({ m, t: G.turn(G.bearing(a, b), G.bearing(b, c)) });
    }
    /* picos acima do limiar, um por grupo contíguo do mesmo sentido */
    const turns = []; let grp = null;
    for (const c of cand) {
      const on = Math.abs(c.t) > CFG.turnDeg, dir = Math.sign(c.t);
      if (on && grp && grp.dir === dir && c.m - grp.last <= 30) { grp.last = c.m; if (Math.abs(c.t) > Math.abs(grp.peak.t)) grp.peak = c; }
      else if (on) { if (grp) turns.push(grp); grp = { dir, last: c.m, peak: c }; }
      else if (grp && c.m - grp.last > 30) { turns.push(grp); grp = null; }
    }
    if (grp) turns.push(grp);
    return turns.map(g => ({ m: g.peak.m, deg: Math.round(g.peak.t), side: g.dir > 0 ? 'direita' : 'esquerda' }));
  }

  /* R-A2 · descida de velocidade: mínimo nos ±50 m abaixo de 70 % da média dos 200 m anteriores. */
  function speedDrop(P, m, hasTime) {
    if (!hasTime) return false;
    const i0 = G.idxAtDist(P, Math.max(0, m - 250)), i1 = G.idxAtDist(P, Math.max(0, m - 50)), j0 = G.idxAtDist(P, Math.max(0, m - 50)), j1 = G.idxAtDist(P, m + 50);
    let s = 0, n = 0; for (let i = i0; i <= i1; i++) { s += P[i].v; n++; }
    let mn = Infinity; for (let j = j0; j <= j1; j++) mn = Math.min(mn, P[j].v);
    const avg = n ? s / n : 0; return avg > 2 && mn < 0.7 * avg;
  }

  /* R-A4 · subidas e descidas: altitude suavizada, reamostrada a 50 m; segmentos monótonos com variação > 20 m em < 2 km. */
  function detectElevation(P, total) {
    if (!P.some(p => p.ele != null)) return [];
    const step = 50, S = []; for (let m = 0; m < total; m += step) S.push({ m, e: G.pointAtDist(P, m).ele }); S.push({ m: total, e: G.pointAtDist(P, total).ele });
    const e = G.smooth(S.map(s => s.e), 2), out = [];
    /* extremos locais com histerese de 4 m */
    const ext = [0]; let dir = 0, ref = 0;
    for (let i = 1; i < e.length; i++) {
      if (e[i] == null) continue;
      if (dir >= 0 && e[i] > e[ref]) { ref = i; if (!dir) dir = 1; }
      if (dir <= 0 && e[i] < e[ref]) { ref = i; if (!dir) dir = -1; }
      if (dir > 0 && e[ref] - e[i] > 4) { ext.push(ref); dir = -1; ref = i; }
      else if (dir < 0 && e[i] - e[ref] > 4) { ext.push(ref); dir = 1; ref = i; }
    }
    ext.push(ref); if (ref !== e.length - 1) ext.push(e.length - 1);
    for (let k = 1; k < ext.length; k++) {
      const a = ext[k - 1], b = ext[k], dv = e[b] - e[a];
      if (Math.abs(dv) <= CFG.eleDelta) continue;
      /* aparar as pontas planas: início e fim onde a variação passa 10 % e 90 % */
      let ia = a, ib = b; while (ia < b && Math.abs(e[ia] - e[a]) < 0.1 * Math.abs(dv)) ia++; while (ib > a && Math.abs(e[b] - e[ib]) < 0.1 * Math.abs(dv)) ib--;
      const A = S[Math.max(a, ia - 1)].m, B = S[Math.min(b, ib + 1)].m;
      if (B - A < CFG.eleWin && B > A) out.push({ a: A, b: B, dv: Math.round(dv) });
    }
    return out;
  }

  /* R-A5 · zonas lentas: < 15 km/h durante > 5 s, fora dos primeiros e últimos 150 m. Paragens não contam. */
  function detectSlow(P, total, hasTime) {
    if (!hasTime) return [];
    const lim = CFG.slowKmh / 3.6, out = []; let s = null;
    for (const p of P) {
      const inside = p.d > CFG.edgeM && p.d < total - CFG.edgeM, slow = inside && p.v < lim && p.v > 0.6;
      if (slow) { if (!s) s = { a: p.d, t0: p.t }; s.b = p.d; s.t1 = p.t; }
      else if (s && !(inside && p.v <= 0.6)) { if ((s.t1 - s.t0) / 1000 > CFG.slowS) out.push(s); s = null; }
    }
    if (s && (s.t1 - s.t0) / 1000 > CFG.slowS) out.push(s);
    /* juntar zonas a menos de 100 m e descartar as muito curtas (< 30 m) */
    const merged = [];
    for (const z of out) { const l = merged[merged.length - 1]; if (l && z.a - l.b < 100) { l.b = z.b; l.t1 = z.t1; } else merged.push({ ...z }); }
    return merged.filter(z => z.b - z.a >= 30).map(z => ({ a: z.a, b: z.b, secs: Math.round((z.t1 - z.t0) / 1000) }));
  }

  /* R-A6 · paragens de 15 s ou mais, fora do início e do fim. */
  function detectStops(P, total, hasTime) {
    if (!hasTime) return [];
    const out = []; let s = null;
    for (const p of P) {
      const still = p.v < 0.6;
      if (still) { if (!s) s = { d: p.d, t0: p.t }; s.t1 = p.t; }
      else if (s) { if ((s.t1 - s.t0) / 1000 >= CFG.stopS && s.d > CFG.edgeM && s.d < total - CFG.edgeM) out.push({ m: s.d, secs: Math.round((s.t1 - s.t0) / 1000), t: s.t0 }); s = null; }
    }
    return out;
  }

  /* R-A3 · troços longos: intervalos > 1 km sem manobras. */
  function detectStraights(turns, total, startM) {
    const marks = [startM].concat(turns.map(t => t.m)).concat([total]), out = [];
    for (let k = 1; k < marks.length; k++) {
      const a = marks[k - 1] + (k === 1 ? CFG.edgeM : CFG.win), b = marks[k] - CFG.trigBefore - CFG.win;
      if (b - a > CFG.straightM) out.push({ a, b });
    }
    return out;
  }

  const MAN_TXT = { esquerda: 'vire à esquerda', direita: 'vire à direita' };
  function title40(s) { return s.length <= 40 ? s : s.slice(0, 39).trim() + '…'; }

  /* Gera o rascunho completo. opts: {placeName, osm:{junctions:[{lat,lon}], refs:[{lat,lon,name,kind}]}} */
  function generate(trackPts, opts = {}) {
    const tr = G.prepare(trackPts), P = tr.pts, total = tr.total, place = (opts.placeName || 'o destino').trim();
    const junctions = (opts.osm && opts.osm.junctions) || null, refs = (opts.osm && opts.osm.refs) || [];
    const at = m => G.pointAtDist(P, m);
    const nearJunction = m => { if (!junctions) return false; const q = at(m); return junctions.some(j => G.hav(q, j) < 40); };

    /* manobras + confiança */
    let turns = detectTurns(P, total).filter(t => t.m > CFG.edgeM * 0.5 && t.m < total - 60);
    turns.forEach(t => {
      const sd = speedDrop(P, t.m, tr.hasTime), jn = nearJunction(t.m);
      t.conf = sd && jn ? 'alta' : (sd || jn) ? 'media' : 'baixa';
      t.why = [sd ? 'descida de velocidade' : 'sem descida de velocidade', junctions ? (jn ? 'junção no OpenStreetMap' : 'sem junção no OpenStreetMap') : 'OpenStreetMap indisponível'];
    });
    /* duas manobras a menos de 150 m formam um só ponto */
    const items = [];
    for (let k = 0; k < turns.length; k++) {
      const t = turns[k], n = turns[k + 1];
      if (n && n.m - t.m < CFG.pairM) {
        const rank = { alta: 2, media: 1, baixa: 0 }, conf = rank[t.conf] <= rank[n.conf] ? t.conf : n.conf;
        items.push({ kind: 'manobra', a: t.m, b: n.m, sides: [t.side, n.side], conf, why: t.why, deg: [t.deg, n.deg] }); k++;
      } else items.push({ kind: 'manobra', a: t.m, b: t.m, sides: [t.side], conf: t.conf, why: t.why, deg: [t.deg] });
    }
    detectStraights(turns, total, 0).forEach(s => items.push({ kind: 'troco', a: s.a, b: s.b, conf: 'alta' }));
    detectElevation(P, total).forEach(s => items.push({ kind: s.dv > 0 ? 'subida' : 'descida', a: s.a, b: s.b, dv: s.dv, conf: 'alta' }));
    detectSlow(P, total, tr.hasTime).forEach(s => items.push({ kind: 'lento', a: s.a, b: s.b, conf: 'alta' }));
    detectStops(P, total, tr.hasTime).forEach(s => items.push({ kind: 'paragem', a: s.m, b: s.m, secs: s.secs, conf: 'baixa', why: ['paragem de ' + s.secs + ' s: candidato a ponto de referência'] }));

    /* R-A10 · limitar a 12 pontos (o início e a chegada contam). Fundir os pares mais próximos; manobra > troço. */
    const PRI = { manobra: 4, lento: 3, paragem: 1, subida: 2.5, descida: 2.5, troco: 2 };
    items.sort((x, y) => x.a - y.a);
    /* sobreposições evidentes: um troço lento dentro de uma manobra fica como nota da manobra */
    let mid = items.map(i => ({ ...i, parts: [i] }));
    const merge = (x, y) => {
      const [hi, lo] = PRI[x.kind] >= PRI[y.kind] ? [x, y] : [y, x];
      const conf = ['baixa', 'media', 'alta'][Math.min(...[x, y].filter(i => i.kind === 'manobra' || i.kind === 'paragem').map(i => ({ baixa: 0, media: 1, alta: 2 })[i.conf]).concat([2]))];
      return { ...hi, a: Math.min(x.a, y.a), b: Math.max(x.b, y.b), conf, parts: hi.parts.concat(lo.parts) };
    };
    const gap = (x, y) => Math.max(0, y.a - x.b);
    /* fundir o que se sobrepõe (gap 0) entre manobra/lento/paragem */
    for (let k = 0; k < mid.length - 1; k++) {
      const x = mid[k], y = mid[k + 1];
      const pointy = i => i.kind === 'manobra' || i.kind === 'lento' || i.kind === 'paragem';
      if (pointy(x) && pointy(y) && gap(x, y) < 60) { mid.splice(k, 2, merge(x, y)); k--; }
    }
    /* um troço e uma subida/descida que se sobrepõem em mais de metade formam um só ponto (fica a subida/descida) */
    const longy = i => i.kind === 'troco' || i.kind === 'subida' || i.kind === 'descida';
    for (let changed = true; changed;) {
      changed = false; mid.sort((x, y) => x.a - y.a);
      outer: for (let k = 0; k < mid.length; k++) for (let j = k + 1; j < mid.length; j++) {
        const x = mid[k], y = mid[j]; if (!longy(x) || !longy(y) || x.kind === y.kind) continue;
        const ov = Math.min(x.b, y.b) - Math.max(x.a, y.a), sh = Math.min(x.b - x.a, y.b - y.a);
        if (ov > 0.5 * sh) { mid.splice(j, 1); mid.splice(k, 1, merge(x, y)); changed = true; break outer; }
      }
    }
    const budget = CFG.maxPoints - 2;
    while (mid.length > budget) {
      let bk = -1, bg = Infinity;
      for (let k = 0; k < mid.length - 1; k++) { const g = gap(mid[k], mid[k + 1]) + (PRI[mid[k].kind] + PRI[mid[k + 1].kind]) * 5; if (g < bg) { bg = g; bk = k; } }
      /* paragens sozinhas saem primeiro */
      const lone = mid.findIndex(i => i.kind === 'paragem' && i.parts.length === 1);
      if (lone >= 0) { mid.splice(lone, 1); continue; }
      mid.splice(bk, 2, merge(mid[bk], mid[bk + 1]));
    }

    /* R-A7 · início e chegada */
    const pts = [];
    pts.push({ kind: 'inicio', a: 0, b: 0, conf: 'media', why: ['o sentido da viragem a partir do asfalto não vem no GPX: confirme esquerda ou direita'], parts: [] });
    mid.forEach(i => pts.push(i));
    pts.push({ kind: 'chegada', a: total, b: total, conf: 'alta', parts: [] });
    /* uma manobra colada à chegada (últimos 150 m) passa a nota da chegada */
    while (pts.length > 2 && pts[pts.length - 2].a > total - CFG.edgeM && pts[pts.length - 2].kind === 'manobra') {
      const m = pts.splice(pts.length - 2, 1)[0]; pts[pts.length - 1].parts.push(m); }

    /* R-A9 · referências OSM a menos de 150 m */
    pts.forEach(p => {
      const q = at(p.a); let best = null;
      refs.forEach(r => { const d = G.hav(q, r); if (d < CFG.osmM && r.name && (!best || d < best.d)) best = { d, name: r.name, kind: r.kind || '' }; });
      p.ref = best ? best.name : '';
    });

    /* R-A8 · textos + R-A13 · gatilhos */
    const out = pts.map((p, k) => {
      const next = pts[k + 1];
      const geo = at(p.kind === 'chegada' ? total : p.kind === 'manobra' ? p.a : (p.a + p.b) / 2);
      const pt = {
        id: 'p' + (k + 1), km_a: +(p.a / 1000).toFixed(2), km_b: +(p.b / 1000).toFixed(2),
        kind: p.kind, maneuver: maneuverOf(p), confirm: p.conf !== 'alta', conf: p.conf, why: p.why || [],
        lat: +geo.lat.toFixed(6), lon: +geo.lon.toFixed(6), photo: null, caption: '', notes: noteKinds(p)
      };
      const tx = texts(p, next, place, total, tr, opts.placePhrase || ('a ' + place));
      pt.title = title40(tx.title); pt.text = tx.text.slice(0, 220);
      pt.trigger_km = +(k === 0 ? -1 : (p.kind === 'manobra' || p.kind === 'chegada' ? Math.max(0, p.a - CFG.trigBefore) : p.a) / 1000).toFixed(2);
      return pt;
    });
    return { points: out, stats: stats(tr), cfg: CFG };
  }

  function noteKinds(p) { return [...new Set(p.parts.map(x => x.kind).filter(k => k !== p.kind))]; }
  function maneuverOf(p) {
    if (p.kind === 'chegada') return 'chegada';
    if (p.kind === 'inicio') return 'esquerda';
    if (p.kind === 'manobra') return p.sides[p.sides.length > 1 ? 0 : 0];
    if (p.kind === 'lento' || p.kind === 'paragem') return 'atencao';
    return 'em frente';
  }
  function sidesTxt(s) {
    if (s.length === 1) return s[0] === 'esquerda' ? 'Vire à esquerda' : 'Vire à direita';
    return (s[0] === 'esquerda' ? 'Vire à esquerda' : 'Vire à direita') + (s[1] === s[0] ? ' e logo de novo à ' + s[1] : ' e logo à ' + s[1]);
  }
  function texts(p, next, place, total, tr, phrase) {
    const dNext = next ? Math.max(0, next.a - p.b) : 0;
    const tail = next ? (dNext < 50 && next.kind !== 'chegada' ? ' O próximo ponto vem logo a seguir.' : next.kind === 'chegada' ? ` Daqui à chegada são ${km(dNext)} km.` : ` Próximo ponto daqui a ${km(dNext)} km.`) : '';
    const ref = p.ref ? ` Junto a ${p.ref}.` : '';
    const extra = [];
    p.parts.forEach(x => {
      if (x === p) return;
      if (x.kind === 'lento' && p.kind !== 'lento') extra.push('Troço lento a seguir: ponte, buraco ou areia.');
      if (x.kind === 'manobra' && p.kind !== 'manobra') extra.push(sidesTxt(x.sides) + ' ao km ' + km(x.a) + '.');
      if (x.kind === 'manobra' && p.kind === 'manobra' && x !== p.parts[0]) extra.push('Depois, ao km ' + km(x.a) + ', ' + sidesTxt(x.sides).toLowerCase() + '.');
      if ((x.kind === 'subida' || x.kind === 'descida') && x.kind !== p.kind) extra.push(`A picada ${x.kind === 'subida' ? 'sobe' : 'desce'} cerca de ${Math.abs(x.dv)} m.`);
    });
    const ex = extra.length ? ' ' + extra.join(' ') : '';
    switch (p.kind) {
      case 'inicio': return { title: 'Saída do asfalto', text: `Km 0,0. Saia do asfalto e entre na picada: vire à esquerda.${ref}${tail}` };
      case 'chegada': {
        const before = p.parts.filter(x => x.kind === 'manobra').map(x => sidesTxt(x.sides).toLowerCase()).join(', depois ');
        return { title: `Chegada: ${place}`, text: `Km ${km(total)}.${before ? ' Antes de chegar, ' + before + '.' : ''} Chegou ${phrase}. Bem-vindos!` };
      }
      case 'manobra': return { title: sidesTxt(p.sides), text: `Km ${km(p.a)}. ${sidesTxt(p.sides)}.${ref}${ex}${tail}` };
      case 'troco': {
        const mins = tr.hasTime ? G.fmtMin(G.pointAtDist(tr.pts, p.b).t - G.pointAtDist(tr.pts, p.a).t) : Math.max(1, Math.round((p.b - p.a) / 1000 / 25 * 60));
        return { title: 'Siga em frente', text: `Km ${km(p.a)}. Siga em frente ${km(p.b - p.a)} km, cerca de ${mins} min.${ref}${ex}${tail}` };
      }
      case 'subida': case 'descida': {
        const own = p.parts.find(x => x.kind === p.kind) || p, verb = p.kind === 'subida' ? 'sobe' : 'desce';
        const lead = own.a - p.a > 300 ? `Siga em frente. A partir do km ${km(own.a)}, a picada ${verb}` : `A picada ${verb}`;
        return { title: p.kind === 'subida' ? 'Subida' : 'Descida', text: `Km ${km(p.a)}. ${lead} cerca de ${Math.abs(p.dv)} m até ao km ${km(own.b)}. ${p.kind === 'subida' ? 'Siga o caminho principal.' : 'Com cuidado.'}${ref}${ex}${tail}` };
      }
      case 'lento': return { title: 'Atenção: troço lento', text: `Km ${km(p.a)}. Atenção: troço lento (ponte, buraco ou areia). Devagar até ao km ${km(p.b)}.${ref}${ex}${tail}` };
      case 'paragem': return { title: 'Ponto de referência', text: `Km ${km(p.a)}. Aqui o percurso parou ${p.secs} s. Confirme se há uma referência útil.${ref}${ex}${tail}` };
    }
    return { title: 'Ponto', text: '' };
  }
  function stats(tr) { const c = G.climb(tr.pts); return { total: tr.total, duration: tr.duration, up: Math.round(c.up), down: Math.round(c.down), n: tr.pts.length, hasTime: tr.hasTime }; }

  /* R-A12 · boas-vindas e nota "antes de sair" */
  function welcome(place, st, nPoints) {
    const d = km(st.total), t = st.duration ? G.fmtMin(st.duration) : Math.max(1, Math.round(st.total / 1000 / 25 * 60));
    return {
      welcome: `Bem-vindos! Este guia leva-o da estrada até ${place}: ${d} km, cerca de ${t} min, em ${nPoints} pontos.`,
      before: `Lá pode não haver rede. Abra este guia em casa e deixe-o aberto, ou guarde-o no telemóvel. Quem vai ao lado do condutor lê o guia e toca em Seguinte a cada ponto.`
    };
  }

  /* recalcula textos de distância ("Próximo ponto daqui a X km") depois de edições do André, sem tocar no resto */
  function refreshTails(points) {
    points.forEach((p, k) => {
      const n = points[k + 1]; if (!p.text) return;
      const TAIL = / (Próximo ponto daqui a|Daqui à chegada são) [\d,]+ km\.| O próximo ponto vem logo a seguir\./;
      if (!TAIL.test(p.text)) return; /* texto reescrito pelo André sem distância: não mexer */
      const base = p.text.replace(TAIL, '');
      if (!n) { p.text = base; return; }
      const d = Math.max(0, n.km_a - p.km_b) * 1000;
      p.text = (base + (d < 50 && n.kind !== 'chegada' ? ' O próximo ponto vem logo a seguir.' : n.kind === 'chegada' ? ` Daqui à chegada são ${km(d)} km.` : ` Próximo ponto daqui a ${km(d)} km.`)).slice(0, 220);
    });
    return points;
  }

  const api = { CFG, generate, welcome, refreshTails, detectTurns, detectElevation, detectSlow, detectStops };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RBDraft = api;
})(typeof window !== 'undefined' ? window : globalThis);
