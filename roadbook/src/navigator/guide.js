/* Roadbook Navigator · guia passo a passo. Comportamento do "Chegar à Meraki" v3, com os dados em window.RB. */
(()=>{
"use strict";
const SRC='<!doctype html>\n'+document.documentElement.outerHTML;
const RB=window.RB;
const $=s=>document.querySelector(s);
const km=v=>v.toLocaleString('pt-PT',{minimumFractionDigits:1,maximumFractionDigits:1});
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const phrase=(/^chegar\s+(.+)$/i.exec(RB.title)||[])[1]||('a '+RB.place);

const STEPS=RB.steps, N=STEPS.length-1, IMG=RB.img, TRIG=RB.trig;
document.title=RB.title;
$('#title').textContent=RB.title;
if(RB.logo){const lg=$('#logo');lg.src=RB.logo;lg.alt=RB.place;lg.hidden=false;}
$('#endKm').textContent=km(RB.totalKm)+' km';
$('#map').setAttribute('aria-label','Mapa do percurso desde a estrada até '+RB.place);
document.querySelectorAll('[data-rb="title3d"]').forEach(e=>e.textContent=RB.title+' · 3D');
document.querySelectorAll('[data-rb="place"]').forEach(e=>e.textContent=RB.place);

/* geometry */
const TRK=RB.trk, ROAD=RB.road||[];
const lat0=TRK.reduce((s,p)=>s+p[0],0)/TRK.length, kx=111320*Math.cos(lat0*Math.PI/180), kz=110540;
const P=([la,lo])=>[lo*kx,-la*kz];
const T=TRK.map(P), D=[0];
for(let i=1;i<T.length;i++) D.push(D[i-1]+Math.hypot(T[i][0]-T[i-1][0],T[i][1]-T[i-1][1]));
const TOT=D[D.length-1], KM=RB.totalKm*1000, sc=TOT/KM; /* km do guia → distância no mapa */
const idxAt=m=>{m*=sc;let i=0;while(i<D.length-1&&D[i+1]<m)i++;return i;};
const R=ROAD.map(P);
const all=T.concat(R);
let x0=Math.min(...all.map(p=>p[0])),x1=Math.max(...all.map(p=>p[0])),y0=Math.min(...all.map(p=>p[1])),y1=Math.max(...all.map(p=>p[1]));
const padM=260; x0-=padM;x1+=padM;y0-=padM;y1+=padM*1.6;
const svg=$('#map'); const NS='http://www.w3.org/2000/svg';
const el=(t,a,p=svg)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);p.appendChild(e);return e;};
const pts=a=>a.map(p=>p[0].toFixed(0)+','+p[1].toFixed(0)).join(' ');
function fit(){
  const w=svg.clientWidth||400,h=svg.clientHeight||200, bw=x1-x0, bh=y1-y0, s=Math.max(bw/w,bh/h);
  const vw=w*s, vh=h*s, cx=(x0+x1)/2, cy=(y0+y1)/2;
  svg.setAttribute('viewBox',`${cx-vw/2} ${cy-vh/2} ${vw} ${vh}`);
  svg.querySelectorAll('[data-sz]').forEach(e=>{const k=+e.dataset.sz;
    if(e.tagName==='circle') e.setAttribute('r',k*s);
    else if(e.tagName==='text') e.setAttribute('font-size',k*s);});
  svg.querySelectorAll('[data-dy]').forEach(e=>e.setAttribute('y',+e.dataset.y0+(+e.dataset.dy)*s));
}
if(R.length>1){
  el('polyline',{class:'roadl',points:pts(R)});
  const rl=R[0], rr=R[R.length-1], lb=RB.roadLabels||[];
  if(lb[0]) el('text',{class:'lbl',x:rl[0],'data-y0':rl[1],'data-dy':-10,'data-sz':13}).textContent='← '+lb[0];
  if(lb[1]) el('text',{class:'lbl',x:rr[0],'data-y0':rr[1],'data-dy':-10,'text-anchor':'end','data-sz':13}).textContent=lb[1]+' →';
}
el('polyline',{class:'trk',points:pts(T)});
const seg=el('polyline',{class:'seg'});
const H=T[T.length-1];
el('circle',{class:'home',cx:H[0],cy:H[1],'data-sz':10});
el('text',{class:'lbl',x:H[0],'data-y0':H[1],'data-dy':26,'text-anchor':'middle','data-sz':14}).textContent=RB.place;
const cps=[];
STEPS.forEach((s,n)=>{ if(!n||s.home) return;
  const m=(s.a+s.b)/2*1000, i=idxAt(m), p=T[i];
  const g=el('g',{class:'cp'}); g.dataset.n=n;
  el('circle',{cx:p[0],cy:p[1],'data-sz':10},g);
  el('text',{x:p[0],y:p[1]+1,'data-sz':11},g).textContent=n;
  g.addEventListener('click',()=>go(n)); cps.push(g);
});
const me=el('circle',{class:'me','data-sz':8,cx:0,cy:0,visibility:'hidden'});
new ResizeObserver(fit).observe(svg); fit();

/* km strip */
const strip=$('#strip');
STEPS.forEach((s,n)=>{ if(!n) return;
  const b=document.createElement('button'); b.type='button'; b.dataset.n=n;
  b.style.left=((s.a+(s.home?RB.totalKm:s.b))/2/RB.totalKm*100)+'%';
  b.setAttribute('aria-label',`Ponto ${n}: ${s.title}`); b.onclick=()=>go(n); strip.appendChild(b);
});

/* render */
let cur=0, offRoute=false;
try{const v=+sessionStorage.getItem(RB.key+'-step');if(v>=0&&v<=N)cur=v;}catch(e){}
function go(n){cur=Math.max(0,Math.min(N,n));try{sessionStorage.setItem(RB.key+'-step',cur);}catch(e){}render();}
function contactHtml(){ return RB.phone?`<div class="contact"><small>Contacto do anfitrião</small><b id="phone">${esc(RB.phone)}</b><button type="button" class="copy">Copiar</button></div>`:''; }
function wireCopy(c){ c.querySelectorAll('.copy').forEach(b=>b.onclick=async()=>{
  try{ await navigator.clipboard.writeText(RB.phone); toast('Número copiado.'); }
  catch(e){ const r=document.createRange(); r.selectNodeContents(c.querySelector('#phone')); const s=getSelection(); s.removeAllRanges(); s.addRange(r); toast('Seleccionado. Copie o número.'); } }); }
function offHtml(){ return offRoute?`<p class="offroute" id="offroute" role="status"><b>Parece que saiu do percurso.</b> Volte ao último ponto que reconhece. Se precisar, ligue ao anfitrião.</p>`:''; }
function render(){
  const s=STEPS[cur], c=$('#card');
  $('#stepLbl').textContent=cur?`Ponto ${cur} de ${N}`:`${km(RB.totalKm)} km · ${RB.mins} min`;
  strip.querySelectorAll('button').forEach(b=>b.classList.toggle('on',+b.dataset.n===cur));
  cps.forEach(g=>g.classList.toggle('on',+g.dataset.n===cur));
  const endKm=s.intro?0:(s.home?RB.totalKm:s.b);
  $('#done').style.width=(endKm/RB.totalKm*100)+'%';
  if(s.intro){ seg.setAttribute('points',''); }
  else { const i0=idxAt(s.a*1000), i1=Math.max(i0+2,idxAt((s.home?RB.totalKm:s.b)*1000)+1); seg.setAttribute('points',pts(T.slice(i0,i1+1))); }
  $('#prev').disabled=cur===0;
  $('#next').textContent=cur===0?'Começar':cur===N?'Chegámos':'Seguinte';
  $('#next').disabled=false;
  if(s.intro){
    c.innerHTML=`<h2>Antes de sair</h2>
      <ul class="facts"><li><small>Percurso</small><b>${km(RB.totalKm)} km</b></li><li><small>Tempo</small><b>~${RB.mins} min</b></li><li><small>Pontos</small><b>${N}</b></li></ul>
      ${RB.welcome?`<p class="welcome">${RB.welcome}</p>`:''}
      ${RB.before?`<p class="note">${RB.before}</p>`:''}
      <button class="save" id="save" type="button" hidden>Guardar no telemóvel</button>
      <div class="d3card"><button type="button" id="intro3d">Ver o percurso em 3D</button><p>Para conhecer o caminho em casa: relevo, sobrevoo e as fotos de cada ponto.</p><small>Melhor em casa, com rede.</small></div>
      ${(RB.notes||[]).map(n=>`<p class="note">${n}</p>`).join('')}
      ${contactHtml()}
      <p class="hint">Quem vai ao lado do condutor lê o guia. Toque em <b>Seguinte</b> a cada ponto, ou num número do mapa para saltar. Toque nas fotos para as ampliar.</p>
      ${RB.credit?'<p class="credit">Feito com DrakoYuda</p>':''}`;
    setupSave(); $('#intro3d').onclick=open3d;
  } else {
    const kmTxt=s.home?(s.a<RB.totalKm-0.05?`<b>km ${km(s.a)}</b><span>→ ${km(RB.totalKm)} · chegada</span>`:`<b>km ${km(RB.totalKm)}</b><span>chegada</span>`):(s.a===s.b?`<b>km ${km(s.a)}</b>`:`<b>km ${km(s.a)}</b><span>→ ${km(s.b)}</span>`);
    const left=Math.max(0,RB.totalKm-s.a);
    const leftTxt=s.home&&left<0.05?'':`<span class="left">Faltam ${km(left)} km</span>`;
    const nx=STEPS[cur+1];
    c.innerHTML=`${offHtml()}<div class="km">${kmTxt}${leftTxt}</div><h2>${esc(s.title)}</h2><p class="txt">${s.text}</p>
      ${s.img?`<figure><button type="button" data-img="${s.img}" aria-label="Ampliar foto"><img src="${IMG[s.img]}" alt="${esc(s.cap)}"></button><figcaption>${esc(s.cap)}</figcaption></figure>`:''}
      ${nx?`<p class="next">A seguir, ${nx.home?'perto do':'ao'} km ${km(nx.a)}: <b>${esc(nx.title)}</b></p>`:`${contactHtml()}<p class="next">Percurso gravado a ${dateTxt()}, da estrada até ${esc(RB.place)}.</p>`}`;
    const fb=c.querySelector('[data-img]'); if(fb) fb.onclick=()=>{$('#boxImg').src=IMG[fb.dataset.img];$('#box').hidden=false;};
  }
  wireCopy(c);
  c.scrollTop=0;
}
function dateTxt(){ const m=/^(\d{4})-(\d\d)-(\d\d)/.exec(RB.recorded||''); if(!m) return 'antes da sua visita';
  const M=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']; return `${+m[3]} de ${M[+m[2]-1]} de ${m[1]}`; }
$('#box').onclick=()=>$('#box').hidden=true;
$('#prev').onclick=()=>go(cur-1);
$('#next').onclick=()=>{ if(cur===0) wake(); if(cur===N){toast('Bem-vindos '+phrase+'!');return;} go(cur+1); };
addEventListener('keydown',e=>{ if(!$('#v3d').hidden){ if(e.key==='Escape'&&$('#box').hidden) $('#v3d').hidden=true; else if(e.key==='Escape') $('#box').hidden=true; return; } if(e.key==='ArrowRight')$('#next').click(); if(e.key==='ArrowLeft'&&cur)go(cur-1); if(e.key==='Escape')$('#box').hidden=true;});

function toast(m){const t=$('#gtoast');t.textContent=m;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,4000);}
let lock=null; async function wake(){try{lock=await navigator.wakeLock.request('screen');}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(lock&&document.visibilityState==='visible')wake();});

/* save a copy for offline use (only inside the Claude viewer) */
let dl=null;
(async()=>{try{dl=window.claude&&window.claude.use?await window.claude.use('downloads'):null;}catch(e){dl=null;} if(cur===0)setupSave();})();
const fileName=(RB.title||'guia').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.html';
function setupSave(){const b=$('#save'); if(!b) return; b.hidden=!dl;
  b.onclick=async()=>{try{await dl.save({filename:fileName,data:new Blob([SRC],{type:'text/html'})});toast('Guardado. Abra o ficheiro no telemóvel antes de sair.');}
    catch(e){ if(e&&e.code==='declined') return; toast('Não foi possível guardar aqui. Deixe esta página aberta.'); }};}

/* live position: turns show ~100 m before, stretches once you are on them (RB.trig, km) */
let watch=null, watching=false, lastAuto=0, farCount=0;
function setOff(v){ if(v===offRoute) return; offRoute=v; if(cur) render(); }
function stopGps(){ if(watch!==null) navigator.geolocation.clearWatch(watch); watch=null; watching=false; lastAuto=0; farCount=0; setOff(false); me.setAttribute('visibility','hidden'); $('#gpsLbl').textContent='A minha posição'; }
$('#gps').onclick=()=>{
  if(watching){stopGps();return;}
  if(!navigator.geolocation){toast('Este telemóvel não dá a localização aqui.');return;}
  $('#gpsLbl').textContent='A localizar…'; watching=true;
  watch=navigator.geolocation.watchPosition(pos=>{
    const p=P([pos.coords.latitude,pos.coords.longitude]); me.setAttribute('cx',p[0]); me.setAttribute('cy',p[1]); me.setAttribute('visibility','visible');
    /* distância ao trajecto: perpendicular a cada segmento */
    let bd=1e18, along=0;
    for(let i=1;i<T.length;i++){const a=T[i-1],b=T[i],vx=b[0]-a[0],vy=b[1]-a[1],L2=vx*vx+vy*vy;let f=L2?((p[0]-a[0])*vx+(p[1]-a[1])*vy)/L2:0;f=Math.max(0,Math.min(1,f));
      const x=a[0]+vx*f-p[0],y=a[1]+vy*f-p[1],d=x*x+y*y; if(d<bd){bd=d;along=D[i-1]+(D[i]-D[i-1])*f;}}
    bd=Math.sqrt(bd);
    if(bd>250){ farCount++; if(farCount>=2) setOff(true); /* aviso só com duas leituras seguidas fora */
      $('#gpsLbl').textContent=bd>5000?'Ainda longe do percurso':`A ${Math.round(bd/10)*10} m do percurso`;return;}
    farCount=0; setOff(false);
    along=along/sc/1000; $('#gpsLbl').textContent=`km ${km(along)}`;
    let n=1; for(let k=1;k<=N;k++) if(TRIG[k]<=along) n=k;
    if(n!==lastAuto){lastAuto=n; if(n>cur) go(n);}
  },err=>{ if(err.code!==1){ $('#gpsLbl').textContent='À procura de sinal GPS…'; return; } /* brief loss of fix: keep watching */
    stopGps(); toast('A localização não está disponível aqui. Funciona no ficheiro guardado no telemóvel; também pode tocar em Seguinte.');},
  {enableHighAccuracy:true,maximumAge:5000,timeout:20000});
};

render();

/* 3D preview (v6 engine), only on request */
let started3d=false;
function webgl(){try{const c=document.createElement('canvas');return !!(window.WebGLRenderingContext&&(c.getContext('webgl')||c.getContext('experimental-webgl')));}catch(e){return false;}}
function open3d(){
  if(!webgl()){toast('O 3D não abriu neste telemóvel. Use o guia passo a passo.');return;}
  $('#v3d').hidden=false; if(!started3d){started3d=true; try{window.start3D();}catch(e){toast('O 3D não abriu neste telemóvel. Use o guia passo a passo.');$('#v3d').hidden=true;started3d=false;}} }
$('#open3d').onclick=open3d;
document.addEventListener('click',e=>{ if(e.target.closest('#close3d')){ $('#v3d').hidden=true; } if(e.target.closest('#stopX')){ $('#stop').hidden=true; } });
window.guidePin=label=>{
  const m=label.match(/^(\d+)/), n=m?+m[1]:N, s=STEPS[n]; if(!s) return;
  const im=$('#stopImg'); if(s.img){im.src=IMG[s.img];im.alt=s.cap;im.hidden=false;im.onclick=()=>{$('#boxImg').src=IMG[s.img];$('#box').hidden=false;};} else im.hidden=true;
  $('#stopT').textContent=n+' · '+s.title; $('#stopP').innerHTML=s.text; $('#stop').hidden=false;
};
})();
