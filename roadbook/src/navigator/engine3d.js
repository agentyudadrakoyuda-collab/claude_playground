/* Motor "Rota em Relevo" v6, tal como integrado no "Chegar à Meraki" v3. Só os textos Meraki passaram a window.RB. */
/* Rota em Relevo v6 engine, adapted as the guide's 3D preview. Starts on first open. */
window.start3D=function(){
"use strict";
const $ = s => document.querySelector(s);
const nf1 = new Intl.NumberFormat('pt-PT',{minimumFractionDigits:1,maximumFractionDigits:1});
const nf0 = new Intl.NumberFormat('pt-PT',{maximumFractionDigits:0});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const V3D=$('#v3d');

/* ---------- GPX ---------- */
function parseGPX(text){
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length) throw new Error('O ficheiro não é um GPX válido: o XML tem erros.');
  const by=(el,t)=>el.getElementsByTagNameNS('*',t);
  let nodes=[...by(doc,'trkpt')];
  if(nodes.length<2) nodes=[...by(doc,'rtept')];
  if(nodes.length<2) throw new Error('Não encontrei pontos de percurso.');
  const txt=(n,t)=>{const e=by(n,t)[0];return e?e.textContent.trim():'';};
  const wpts=[...by(doc,'wpt')].map(n=>({lat:parseFloat(n.getAttribute('lat')),lon:parseFloat(n.getAttribute('lon')),
    name:txt(n,'name'),desc:txt(n,'desc')||txt(n,'cmt')})).filter(w=>isFinite(w.lat)&&isFinite(w.lon));
  const trk=by(doc,'trk')[0]||by(doc,'rte')[0];
  const nm=trk?by(trk,'name')[0]:null;
  const pts=nodes.map(n=>{
    const e=by(n,'ele')[0], t=by(n,'time')[0];
    return {lat:parseFloat(n.getAttribute('lat')),lon:parseFloat(n.getAttribute('lon')),
      ele:e?parseFloat(e.textContent):NaN,time:t?Date.parse(t.textContent):NaN};
  }).filter(p=>isFinite(p.lat)&&isFinite(p.lon));
  return {name:nm?nm.textContent.trim():'',pts,wpts};
}

function buildRoute(pts){
  const lat0=pts.reduce((a,p)=>a+p.lat,0)/pts.length, lon0=pts.reduce((a,p)=>a+p.lon,0)/pts.length;
  const kx=111320*Math.cos(lat0*Math.PI/180), kz=110540;
  const hasEle=pts.some(p=>isFinite(p.ele));
  let lastE=hasEle?pts.find(p=>isFinite(p.ele)).ele:0;
  const raw=[];
  for(const p of pts){
    const e=isFinite(p.ele)?p.ele:lastE; lastE=e;
    const q={x:(p.lon-lon0)*kx,z:-(p.lat-lat0)*kz,e,t:p.time};
    const prev=raw[raw.length-1];
    if(prev){const d=Math.hypot(q.x-prev.x,q.z-prev.z); if(d<0.5) continue; q.d=prev.d+d;
      const dt=(isFinite(q.t)&&isFinite(prev.t))?(q.t-prev.t)/1000:NaN;
      q.gap=isFinite(dt)?((dt>30&&d>150)||(dt>0&&d/dt>70)):d>400;} else q.d=0;
    raw.push(q);
  }
  const total=raw[raw.length-1].d;
  let up=0,down=0,ref=raw[0].e;
  for(const p of raw){const df=p.e-ref; if(df>4){up+=df;ref=p.e;} else if(df<-4){down-=df;ref=p.e;}}
  let gaps=0,gapDist=0; for(let i=1;i<raw.length;i++) if(raw[i].gap){gaps++;gapDist+=raw[i].d-raw[i-1].d;}
  const hasTime=isFinite(raw[0].t)&&isFinite(raw[raw.length-1].t)&&raw[raw.length-1].t>raw[0].t;
  const N=clamp(Math.round(total/8),240,1400);
  const G=new Uint8Array(N),X=new Float32Array(N),Z=new Float32Array(N),E=new Float32Array(N),D=new Float32Array(N),T=new Float64Array(N);
  let j=0;
  for(let i=0;i<N;i++){
    const d=total*i/(N-1);
    while(j<raw.length-2&&raw[j+1].d<d) j++;
    const a=raw[j],b=raw[j+1],f=clamp((d-a.d)/(b.d-a.d||1),0,1);
    G[i]=(b.gap||(f===0&&a.gap&&i>0))?1:0; X[i]=a.x+(b.x-a.x)*f; Z[i]=a.z+(b.z-a.z)*f; E[i]=a.e+(b.e-a.e)*f; D[i]=d;
    T[i]=hasTime?(isFinite(a.t)&&isFinite(b.t)?a.t+(b.t-a.t)*f:NaN):NaN;
  }
  const Es=new Float32Array(N), w=4;
  for(let i=0;i<N;i++){let s=0,c=0;for(let k=-w;k<=w;k++){const q=i+k;if(q>=0&&q<N){s+=E[q];c++;}}Es[i]=s/c;}
  let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9,emin=1e9,emax=-1e9;
  for(let i=0;i<N;i++){minX=Math.min(minX,X[i]);maxX=Math.max(maxX,X[i]);minZ=Math.min(minZ,Z[i]);maxZ=Math.max(maxZ,Z[i]);emin=Math.min(emin,Es[i]);emax=Math.max(emax,Es[i]);}
  const extent=Math.max(maxX-minX,maxZ-minZ,300);
  const relief=emax-emin;
  const vex=hasEle?clamp((extent*0.05)/Math.max(relief,20),1,3):1;
  return {lat0,lon0,kx,kz,N,X,Z,E:Es,D,T,G,gaps,gapDist,total,up,down,hasEle,hasTime,emin,emax,extent,relief,vex,
    cx:(minX+maxX)/2,cz:(minZ+maxZ)/2,duration:hasTime?raw[raw.length-1].t-raw[0].t:0,t0:hasTime?raw[0].t:0};
}

function at(R,s){
  const u=clamp(s/R.total,0,1)*(R.N-1), i=Math.min(Math.floor(u),R.N-2), f=u-i;
  return {x:R.X[i]+(R.X[i+1]-R.X[i])*f,z:R.Z[i]+(R.Z[i+1]-R.Z[i])*f,e:R.E[i]+(R.E[i+1]-R.E[i])*f,
    t:R.T[i]+(R.T[i+1]-R.T[i])*f,i};
}
const sy=(R,e)=>(e-R.emin)*R.vex;

/* ---------- Guide checkpoints as pins ---------- */
const PIN={osm:{g:'★',c:'#5fc4b8',p:0.5},wpt:{g:'◆',c:'#e9efe9',p:0}};
function nearestS(R,x,z){let b=0,bd=1e18;for(let i=0;i<R.N;i++){const dx=R.X[i]-x,dz=R.Z[i]-z,d=dx*dx+dz*dz;if(d<bd){bd=d;b=i;}}return {s:R.D[b],d:Math.sqrt(bd)};}
function derivePins(R,g){
  const pins=[], proj=p=>({x:(p.lon-R.lon0)*R.kx,z:-(p.lat-R.lat0)*R.kz});
  for(const w of g.wpts){const q=proj(w),n=nearestS(R,q.x,q.z);
    const num=(w.name.match(/^(\d+)/)||[])[1];
    pins.push({k:'wpt',s:n.s,x:q.x,z:q.z,off:n.d>Math.max(60,R.extent*0.02),label:w.name,sub:w.desc||'',g:num||'⌂'});}
  return pins.sort((a,b)=>a.s-b.s);
}

/* ---------- Noise ---------- */
function hash(x,y){let h=Math.imul(x,374761393)^Math.imul(y,668265263);h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967295;}
function vnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash(xi,yi),b=hash(xi+1,yi),c=hash(xi,yi+1),d=hash(xi+1,yi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
function terrainNoise(x,y){let f=0,amp=0.5,fr=1,r=0;
  for(let o=0;o<5;o++){const n=vnoise(x*fr+o*17.3,y*fr-o*9.1);f+=n*amp;if(o<3)r+=(1-Math.abs(2*n-1))*amp;amp*=0.5;fr*=2.03;}
  return 0.55*f+0.45*r*r;}

/* ---------- Three.js ---------- */
const stage=V3D, canvas=$('#gl');
let renderer;
try{ renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'}); }
catch(e){ showToast('Este telemóvel não consegue mostrar 3D (WebGL indisponível). Use o guia passo a passo.'); return; }
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const SKY=new THREE.Color('#0d1714');
const scene=new THREE.Scene(); scene.background=SKY;
const camera=new THREE.PerspectiveCamera(50,1,1,1e6);
const controls=new THREE.OrbitControls(camera,canvas);
controls.enableDamping=true; controls.dampingFactor=0.08; controls.screenSpacePanning=false; controls.maxPolarAngle=Math.PI*0.48;
const hemi=new THREE.HemisphereLight(0xdfe8ff,0x1d2a1f,0.75); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff0d6,1.15); scene.add(sun);
const world=new THREE.Group(); scene.add(world);

let R=null, terrain=null;
const st={s:0,dir:1,playing:false,speed:1,mode:'geral',chase:1,fly:null,lastMarker:new THREE.Vector3(),
  heading:new THREE.Vector3(1,0,0),look:new THREE.Vector3(),intro:null,v:NaN,vT:NaN};
let marker, trailMesh, trailSegs=0, trailIdxPerSeg=0;

function labelSprite(txt,color){
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  g.fillStyle=color;g.beginPath();g.arc(64,64,52,0,Math.PI*2);g.fill();
  g.lineWidth=6;g.strokeStyle='#0d1714';g.stroke();
  g.fillStyle='#0d1714';g.font='600 64px Tomorrow, Arial Narrow, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(txt,64,68);
  const tex=new THREE.CanvasTexture(c);
  return new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true}));
}
function pinSprite(p){
  const K=PIN[p.k], col=p.k==='wpt'?'#D4AF37':K.c, F='600 26px Archivo, Arial, sans-serif', c=document.createElement('canvas'), g=c.getContext('2d');
  g.font=F; const w=Math.ceil(g.measureText(p.label).width)+62, h=44; c.width=w; c.height=h+14;
  g.font=F; const rr=10;
  g.beginPath();g.moveTo(rr,1);g.arcTo(w-1,1,w-1,h,rr);g.arcTo(w-1,h,0,h,rr);g.lineTo(w/2+8,h);g.lineTo(w/2,h+12);g.lineTo(w/2-8,h);
  g.arcTo(1,h,1,1,rr);g.arcTo(1,1,w-1,1,rr);g.closePath();
  g.fillStyle='rgba(13,23,20,.92)';g.fill();g.lineWidth=2;g.strokeStyle=col;g.stroke();
  g.fillStyle=col;g.beginPath();g.arc(23,22,14,0,Math.PI*2);g.fill();
  g.fillStyle='#0d1714';g.textAlign='center';g.textBaseline='middle';g.font='700 17px Archivo, Arial, sans-serif';g.fillText(p.g||K.g,23,23);
  g.fillStyle='#e9efe9';g.textAlign='left';g.font=F;g.fillText(p.label.replace(/^\d+\s·\s/,''),44,24);
  const tex=new THREE.CanvasTexture(c); tex.minFilter=THREE.LinearFilter;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true,sizeAttenuation:false}));
  const H=innerWidth<700?0.07:0.05; sp.scale.set(H*c.width/c.height,H,1); sp.center.set(0.5,0); sp.renderOrder=6; return sp;
}
function haloTexture(){
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  const gr=g.createRadialGradient(64,64,0,64,64,64);
  gr.addColorStop(0,'rgba(255,240,190,1)');gr.addColorStop(.25,'rgba(212,175,55,.55)');gr.addColorStop(1,'rgba(212,175,55,0)');
  g.fillStyle=gr;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
}
const HALO=haloTexture();

/* ---------- Sun & sky (real position from time + place) ---------- */
function sunPos(ms,lat,lon){
  const rad=Math.PI/180,d=(ms-946728000000)/86400000,g=(357.529+0.98560028*d)*rad,q=280.459+0.98564736*d;
  const L=(q+1.915*Math.sin(g)+0.020*Math.sin(2*g))*rad,e=(23.439-0.00000036*d)*rad;
  const ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L)),dec=Math.asin(Math.sin(e)*Math.sin(L));
  const gmst=((280.46061837+360.98564736629*d)%360+360)%360,H=(gmst+lon)*rad-ra,phi=lat*rad;
  const alt=Math.asin(Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(H));
  const az=Math.atan2(-Math.sin(H),Math.tan(dec)*Math.cos(phi)-Math.sin(phi)*Math.cos(H));
  return {alt,az,deg:alt/rad};
}
const SKYK=[[-18,'#05080d','#0b141c'],[-6,'#0c1530','#33405f'],[0,'#22355a','#ee9548'],[8,'#3f6c9f','#e9bd85'],[25,'#5a8ec4','#cddfe8'],[90,'#4f86c2','#d6e6ee']]
  .map(([h,t,z])=>[h,new THREE.Color(t),new THREE.Color(z)]);
const C1=new THREE.Color(),C2=new THREE.Color(),SUNWARM=new THREE.Color('#ff8a4a'),SUNDAY=new THREE.Color('#fff3e0'),MOON=new THREE.Color('#8fa6d6'),DAYSKY=new THREE.Color('#dfe8ff');
let sky=null, stars=null; const sunDir=new THREE.Vector3(), sunInfo={deg:8};
function makeSky(extent){
  const geo=new THREE.SphereGeometry(extent*6,32,16);
  const mat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{top:{value:new THREE.Color()},hor:{value:new THREE.Color()},bot:{value:new THREE.Color()},sunC:{value:new THREE.Color()},sunD:{value:new THREE.Vector3(0,1,0)},glow:{value:1}},
    vertexShader:'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader:`uniform vec3 top,hor,bot,sunC,sunD; uniform float glow; varying vec3 vW;
      void main(){ vec3 d=normalize(vW-cameraPosition); float h=d.y;
        vec3 c = h>0.0 ? mix(hor,top,pow(h,0.55)) : mix(hor,bot,pow(-h,0.35));
        float s=max(dot(d,sunD),0.0); c += sunC*(pow(s,900.0)*2.0 + pow(s,10.0)*0.28)*glow;
        gl_FragColor=vec4(c,1.0); }`});
  sky=new THREE.Mesh(geo,mat); sky.frustumCulled=false; sky.renderOrder=-1;
  const n=1400,pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){const u=Math.random(),v=Math.random()*0.95+0.05,th=u*Math.PI*2,y=v,rr=Math.sqrt(1-y*y);
    pos[i*3]=Math.cos(th)*rr*extent*5.5;pos[i*3+1]=y*extent*5.5;pos[i*3+2]=Math.sin(th)*rr*extent*5.5;}
  const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.BufferAttribute(pos,3));
  stars=new THREE.Points(sg,new THREE.PointsMaterial({color:0xdfe6ff,size:1.6,sizeAttenuation:false,transparent:true,opacity:0,fog:false,depthWrite:false}));
  stars.frustumCulled=false;
  world.add(sky); world.add(stars);
}
function applySun(ms){
  let alt,az;
  if(R.hasTime&&isFinite(ms)){const sp=sunPos(ms,R.lat0,R.lon0);alt=sp.alt;az=sp.az;}
  else {alt=8*Math.PI/180;az=250*Math.PI/180;}
  const h=alt*180/Math.PI; sunInfo.deg=h;
  sunDir.set(Math.sin(az)*Math.cos(alt),Math.sin(alt),-Math.cos(az)*Math.cos(alt)).normalize();
  let k=0; while(k<SKYK.length-2&&h>SKYK[k+1][0])k++;
  const [ha,ta,za]=SKYK[k],[hb,tb,zb]=SKYK[k+1], f=clamp((h-ha)/(hb-ha),0,1);
  C1.copy(ta).lerp(tb,f); C2.copy(za).lerp(zb,f);
  const u=sky.material.uniforms; u.top.value.copy(C1); u.hor.value.copy(C2); u.bot.value.copy(C2).multiplyScalar(0.3);
  const warm=smooth(-3,22,h); u.sunC.value.copy(SUNWARM).lerp(SUNDAY,warm); u.sunD.value.copy(sunDir); u.glow.value=smooth(-6,1,h);
  scene.fog.color.copy(C2); scene.background.copy(C2);
  sun.color.copy(SUNWARM).lerp(SUNDAY,warm); sun.intensity=1.25*smooth(-2,8,h);
  sun.position.set(R.cx,0,R.cz).addScaledVector(sunDir,R.extent*2); sun.target.position.set(R.cx,0,R.cz); sun.target.updateMatrixWorld();
  hemi.intensity=0.16+0.62*smooth(-12,15,h); hemi.color.copy(MOON).lerp(DAYSKY,smooth(-8,6,h));
  stars.material.opacity=1-smooth(-14,-3,h);
  if(st.theme==='holo'){
    u.top.value.set('#01060a'); u.hor.value.set('#06302c'); u.bot.value.set('#010404'); u.glow.value*=0.25;
    scene.fog.color.set('#042420'); scene.background.copy(scene.fog.color); stars.material.opacity=Math.max(stars.material.opacity,0.75);
    hemi.intensity=Math.max(hemi.intensity,0.35);
  }
}

function niceStep(v){const p=Math.pow(10,Math.floor(Math.log10(v)));const n=v/p;return (n<1.5?1:n<3.5?2:n<7.5?5:10)*p;}

function buildWorld(){
  world.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(o.material.map&&o.material.map!==HALO)o.material.map.dispose();o.material.dispose();}});
  world.clear(); streetObj=null; buildObj=null;
  const {extent,vex,cx,cz}=R;
  const size=extent*1.8+600, seg=innerWidth<700?150:200;
  const geo=new THREE.PlaneGeometry(size,size,seg,seg); geo.rotateX(-Math.PI/2); geo.translate(cx,0,cz);
  const step=Math.max(1,Math.floor(R.N/170)), CX=[],CZ=[],CE=[];
  for(let i=0;i<R.N;i+=step){CX.push(R.X[i]);CZ.push(R.Z[i]);CE.push(sy(R,R.E[i]));}
  const M=CX.length, pos=geo.attributes.position, n=pos.count, H=new Float32Array(n);
  const corridor=Math.max(extent*0.025,50), reach=extent*0.16, c2=(extent*0.012)**2;
  const amp=Math.max(R.relief*vex*0.9,extent*0.006), fq=3.2/extent;
  let hmin=1e9,hmax=-1e9;
  for(let v=0;v<n;v++){
    const x=pos.getX(v), z=pos.getZ(v);
    let sw=0,se=0,dmin=1e18,en=0;
    for(let k=0;k<M;k++){const dx=x-CX[k],dz=z-CZ[k],d2=dx*dx+dz*dz;
      const wgt=1/Math.pow(d2+c2,1.25); sw+=wgt; se+=wgt*CE[k]; if(d2<dmin){dmin=d2;en=CE[k];}}
    const d=Math.sqrt(dmin), base=se/sw;
    const m=smooth(corridor,corridor+reach,d);
    let h=base+amp*(terrainNoise(x*fq,z*fq)-0.38)*m*1.6;
    const near=1-smooth(0,corridor*1.6,d); h=h+(Math.min(h,en-1)-h)*near;
    H[v]=h; pos.setY(v,h); if(h<hmin)hmin=h; if(h>hmax)hmax=h;
  }
  geo.computeVertexNormals();
  const nor=geo.attributes.normal, col=new Float32Array(n*3);
  const ramp=[[0,'#20402f'],[.3,'#3d5b36'],[.55,'#7d7a4c'],[.8,'#a28d6a'],[1,'#d9d3c2']].map(([t,c])=>[t,new THREE.Color(c)]);
  const rock=new THREE.Color('#6f6a63'), tmp=new THREE.Color();
  for(let v=0;v<n;v++){
    const t=(H[v]-hmin)/(hmax-hmin||1);
    let k=0; while(k<ramp.length-2&&t>ramp[k+1][0])k++;
    const [ta,ca]=ramp[k],[tb,cb]=ramp[k+1]; tmp.copy(ca).lerp(cb,clamp((t-ta)/(tb-ta),0,1));
    const slope=1-nor.getY(v); tmp.lerp(rock,smooth(0.22,0.55,slope)*0.7);
    col[v*3]=tmp.r;col[v*3+1]=tmp.g;col[v*3+2]=tmp.b;
  }
  geo.setAttribute('color',new THREE.BufferAttribute(col,3));
  const realRange=(hmax-hmin)/vex, interval=niceStep(Math.max(realRange,40)/14);
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.95,metalness:0});
  mat.userData.uCa={value:1}; mat.userData.uCol={value:new THREE.Color('#0b1510')}; mat.userData.uHolo={value:0}; mat.userData.uTime={value:0};
  mat.userData.uGridS={value:niceStep(extent/14)}; mat.userData.uCenter={value:new THREE.Vector2(cx,cz)}; mat.userData.uScanR={value:extent};
  mat.extensions={derivatives:true};
  mat.onBeforeCompile=sh=>{
    sh.uniforms.uInt={value:interval*vex}; Object.assign(sh.uniforms,{uCol:mat.userData.uCol,uCa:mat.userData.uCa,uHolo:mat.userData.uHolo,uTime:mat.userData.uTime,uGridS:mat.userData.uGridS,uCenter:mat.userData.uCenter,uScanR:mat.userData.uScanR});
    sh.vertexShader='varying float vH;\nvarying vec2 vXZ;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vH = position.y; vXZ = position.xz;');
    sh.fragmentShader='varying float vH;\nvarying vec2 vXZ;\nuniform float uInt;\nuniform float uCa;\nuniform vec3 uCol;\nuniform float uHolo;\nuniform float uTime;\nuniform float uGridS;\nuniform vec2 uCenter;\nuniform float uScanR;\n'+sh.fragmentShader.replace('#include <fog_fragment>',
      `float cc = vH / uInt; float fw = max(fwidth(cc),1e-4);
       float dl = abs(fract(cc - 0.5) - 0.5) / fw; float ln = 1.0 - min(dl, 1.0);
       float major = 1.0 - step(0.5, mod(floor(cc + 0.5), 5.0));
       gl_FragColor.rgb = mix(gl_FragColor.rgb, uCol, min(ln * mix(0.28, 0.6, major) * uCa, 1.0));
       if(uHolo > 0.5){
         vec2 gg = vXZ / uGridS; vec2 fg = max(fwidth(gg), vec2(1e-4)); vec2 dg = abs(fract(gg - 0.5) - 0.5) / fg;
         float gline = 1.0 - min(min(dg.x, dg.y), 1.0);
         gl_FragColor.rgb += uCol * gline * 0.16;
         float rr = length(vXZ - uCenter); float band = mod(uTime * uScanR * 0.14, uScanR * 1.5);
         float sw = exp(-pow((rr - band) / (uScanR * 0.025), 2.0));
         gl_FragColor.rgb += uCol * sw * 0.32;
       }
       #include <fog_fragment>`);
  };
  terrain={mesh:new THREE.Mesh(geo,mat),geo,mat,H,size,seg,ox:cx-size/2,oz:cz-size/2,tex:{},uvRelevo:geo.attributes.uv};
  world.add(terrain.mesh);
  scene.fog=new THREE.Fog(SKY,extent*1.1,extent*3.2);
  makeSky(extent);

  const r=Math.max(extent/850,3.5), lift=r*1.4, cstep=Math.max(1,Math.floor(R.N/500)), cp=[];
  for(let i=0;i<R.N;i+=cstep) cp.push(new THREE.Vector3(R.X[i],sy(R,R.E[i])+lift,R.Z[i]));
  if((R.N-1)%cstep) cp.push(new THREE.Vector3(R.X[R.N-1],sy(R,R.E[R.N-1])+lift,R.Z[R.N-1]));
  const curve=new THREE.CatmullRomCurve3(cp,false,'centripetal');
  trailSegs=Math.min(2400,cp.length*4); const radial=6; trailIdxPerSeg=radial*6;
  const tube=(rad,cOk,cGap)=>{
    const g=new THREE.TubeGeometry(curve,trailSegs,rad,radial,false), n=g.attributes.position.count, col=new Float32Array(n*3);
    const a=new THREE.Color(cOk), b=new THREE.Color(cGap);
    for(let v=0;v<n;v++){const u=Math.floor(v/(radial+1))/trailSegs, c=R.G[Math.round(u*(R.N-1))]?b:a; col[v*3]=c.r;col[v*3+1]=c.g;col[v*3+2]=c.b;}
    g.setAttribute('color',new THREE.BufferAttribute(col,3)); return g;
  };
  world.add(new THREE.Mesh(tube(r*0.9,'#8c7428','#46534d'),new THREE.MeshBasicMaterial({vertexColors:true})));
  trailMesh=new THREE.Mesh(tube(r*1.25,'#D4AF37','#a7b3ad'),new THREE.MeshBasicMaterial({vertexColors:true}));
  world.add(trailMesh);

  const sc=extent/26;
  [[0,'A','#7fc79a'],[R.N-1,'B','#D4AF37']].forEach(([i,t,c])=>{
    const y=sy(R,R.E[i]);
    const sp=labelSprite(t,c); sp.scale.set(sc*0.55,sc*0.55,1); sp.position.set(R.X[i],y+sc*1.05,R.Z[i]); sp.renderOrder=5; world.add(sp);
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(r*0.5,r*0.5,sc*0.8,6),new THREE.MeshBasicMaterial({color:c}));
    stem.position.set(R.X[i],y+sc*0.4,R.Z[i]); world.add(stem);
  });

  marker=new THREE.Group();
  marker.add(new THREE.Mesh(new THREE.SphereGeometry(r*2.6,20,14),new THREE.MeshBasicMaterial({color:0xffffff})));
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:HALO,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  halo.scale.setScalar(r*22); marker.add(halo);
  world.add(marker);
  pulse=new THREE.Mesh(new THREE.RingGeometry(r*2.4,r*3.1,48),new THREE.MeshBasicMaterial({color:0x5fe3d0,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
  pulse.rotation.x=-Math.PI/2; pulse.visible=false; world.add(pulse);

  R.sc=sc; R.rad=r; pinGroup=new THREE.Group(); world.add(pinGroup); drawPins();

  camera.near=Math.max(1,extent/4000); camera.far=extent*12; camera.updateProjectionMatrix();
  controls.minDistance=r*12; controls.maxDistance=extent*4;
  st.chase=1;
  updateStats(interval);
  drawProfileBase();
}

let pinGroup=null;
function drawPins(){
  pinGroup.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(o.material.map)o.material.map.dispose();o.material.dispose();}});
  pinGroup.clear();
  R.pins.forEach((p,idx)=>{
    const q=p.off?{x:p.x,z:p.z,e:null}:at(R,p.s);
    const y=q.e===null?terrainHeight(q.x,q.z):sy(R,q.e);
    const stemH=R.sc*(p.k==='osm'?0.7:(0.45+(idx%2)*0.35)); // alternate heights so close labels don't overlap
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(R.rad*0.35,R.rad*0.35,stemH,5),new THREE.MeshBasicMaterial({color:p.k==='wpt'?'#D4AF37':PIN[p.k].c}));
    stem.position.set(q.x,y+stemH/2,q.z); pinGroup.add(stem);
    const sp=pinSprite(p); sp.position.set(q.x,y+stemH,q.z); pinGroup.add(sp);
  });
  renderPinChips(); drawProfileBase();
}

function terrainHeight(x,z){
  const t=terrain; if(!t) return 0;
  const gx=clamp((x-t.ox)/t.size*t.seg,0,t.seg-1e-3), gz=clamp((z-t.oz)/t.size*t.seg,0,t.seg-1e-3);
  const i=Math.floor(gx),j=Math.floor(gz),fx=gx-i,fz=gz-j,w=t.seg+1;
  const a=t.H[j*w+i],b=t.H[j*w+i+1],c=t.H[(j+1)*w+i],d=t.H[(j+1)*w+i+1];
  return a+(b-a)*fx+(c-a)*fz+(a-b-c+d)*fx*fz;
}
function markerPos(s,out){const p=at(R,s);return out.set(p.x,sy(R,p.e)+Math.max(R.extent/850,3.5)*1.4,p.z);}
function overviewPose(){
  const c=new THREE.Vector3(R.cx,sy(R,(R.emin+R.emax)/2),R.cz);
  const d=R.extent*1.15; return {pos:c.clone().add(new THREE.Vector3(0.45,0.78,0.95).normalize().multiplyScalar(d)),target:c};
}
function flyTo(pos,target,dur=1.1){
  if(reduceMotion){camera.position.copy(pos);controls.target.copy(target);st.fly=null;return;}
  st.fly={p0:camera.position.clone(),t0:controls.target.clone(),p1:pos,t1:target,k:0,dur};
}

/* ---------- Load ---------- */
function load(text,fallbackName){
  const g=parseGPX(text); const route=buildRoute(g.pts);
  route.src=g; route.basePins=derivePins(route,g); route.pins=route.basePins.slice(); route.street=null; route.zone=null; R=route; st.s=0; st.dir=1; st.playing=false; st.fly=null;
  $('#routeName').textContent=fallbackName||g.name||'Percurso';
  buildWorld(); setDir(1); setPlaying(false);
  markerPos(0,marker.position); st.lastMarker.copy(marker.position);
  const o=overviewPose(); camera.position.copy(o.pos); controls.target.copy(o.target); camera.lookAt(o.target);
  setMode('geral',true);
  startIntro();
  fetchOSM();
  applyTheme();
}
function startIntro(){
  if(reduceMotion||!R) return;
  st.fly=null; st.intro={k:0,dur:7}; controls.enabled=false;
  $('#hint').innerHTML='<b>Abertura</b> · toque no mapa para saltar';
}
function endIntro(skip){
  if(!st.intro) return; st.intro=null; controls.enabled=st.mode!=='sobrevoo';
  $('#hint').innerHTML=HINTS[st.mode];
  if(st.mode==='geral'){const o=overviewPose(); flyTo(o.pos,o.target,skip?0.6:1.2);} else setMode(st.mode);
}
canvas.addEventListener('pointerdown',()=>endIntro(true));

/* ---------- UI ---------- */
const fmtKm=m=>nf1.format(m/1000)+' km';
function fmtDur(ms){if(!isFinite(ms))return '—';const m=Math.round(ms/60000),h=Math.floor(m/60);return h+':'+String(m%60).padStart(2,'0');}
function updateStats(interval){
  $('#sDist').textContent=fmtKm(R.total);
  $('#sUp').textContent=R.hasEle?nf0.format(R.up)+' m':'—';
  $('#sMax').textContent=R.hasEle?nf0.format(R.emax)+' m':'—';
  $('#sTime').textContent=R.hasTime?fmtDur(R.duration)+' h':'sem tempos';
  $('#legend').innerHTML=`Relevo das altitudes gravadas · altitude <b>×${nf1.format(R.vex)}</b> · curvas de <b>${nf0.format(interval)} m</b>`
    +'<br><b>Luz real</b>: sol de 1 de Novembro, à hora da gravação'
    +`<br><b>${R.basePins.length}</b> pontos do guia, com fotos`;
}
function showToast(msg,ok){const t=$('#vtoast');t.textContent=msg;t.className='vtoast'+(ok?' ok':'');t.hidden=false;clearTimeout(showToast._t);showToast._t=setTimeout(()=>t.hidden=true,ok?2600:6000);}

const HINTS={
  geral:'<b>Visão geral</b> · arraste para rodar · dois dedos para deslocar · pinça para zoom',
  seguir:'<b>Seguir</b> · a câmara acompanha o marcador',
  sobrevoo:'<b>Sobrevoo</b> · câmara atrás do carro. Use + e − para a distância'
};
function setMode(m,instant){
  if(st.intro&&!instant){st.intro=null;}
  st.mode=m;
  document.querySelectorAll('#modes button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===m));
  $('#hint').innerHTML=HINTS[m];
  controls.enabled=m!=='sobrevoo';
  const mp=markerPos(st.s,new THREE.Vector3());
  if(m==='geral'&&!instant){const o=overviewPose();flyTo(o.pos,o.target,1.3);}
  if(m==='seguir'){
    const off=camera.position.clone().sub(controls.target); off.y=Math.abs(off.y)+1;
    off.setLength(R.extent*0.16); off.y=Math.max(off.y,R.extent*0.07);
    flyTo(mp.clone().add(off),mp.clone(),1.1);
  }
  if(m==='sobrevoo'){st.heading.copy(headingAt(st.s));st.look.copy(mp);st.fly=null;}
  st.lastMarker.copy(mp);
}
function setPlaying(p){
  st.playing=p;
  $('#play').setAttribute('aria-label',p?'Pausar':'Reproduzir');
  $('#playIcon').innerHTML=p?'<path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/>':'<path d="M7 4.5v15l13-7.5z"/>';
}
function setDir(d){st.dir=d;$('#dirLbl').textContent=d>0?'A → B':'B → A';}

$('#play').onclick=()=>{
  if(!R)return; endIntro(true);
  if(!st.playing){const end=st.dir>0?R.total:0; if(Math.abs(st.s-end)<1) st.s=st.dir>0?0:R.total;}
  setPlaying(!st.playing); dismissHelpSoft();
};
$('#rev').onclick=()=>{setDir(-st.dir);showToast(st.dir>0?'Sentido A → B':'Sentido B → A',true);};
document.querySelectorAll('#v3d .speed button').forEach(b=>b.onclick=()=>{
  st.speed=+b.dataset.speed; document.querySelectorAll('#v3d .speed button').forEach(x=>x.setAttribute('aria-pressed',x===b));});
document.querySelectorAll('#modes button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
function zoom(f){
  if(st.mode==='sobrevoo'){st.chase=clamp(st.chase*f,0.25,4);return;}
  const off=camera.position.clone().sub(controls.target).multiplyScalar(f);
  const L=clamp(off.length(),controls.minDistance,controls.maxDistance); off.setLength(L);
  flyTo(controls.target.clone().add(off),controls.target.clone(),0.35);
}
$('#introBtn').onclick=()=>{setPlaying(false);if(st.mode!=='geral')setMode('geral',true);startIntro();if(reduceMotion)showToast('A abertura está desligada porque o sistema pede menos movimento.');};
$('#zIn').onclick=()=>zoom(0.7); $('#zOut').onclick=()=>zoom(1.4);

function renderPinChips(){
  $('#stPins').textContent=R.basePins.length+(R.osm?' · '+R.osm.length+' OSM':'');
  if(pinGroup) pinGroup.visible=layers.pins;
  const box=$('#pins'); box.innerHTML='';
  R.pins.forEach((p,i)=>{
    const b=document.createElement('button'); b.className='pin'; b.setAttribute('role','listitem'); b.dataset.i=i;
    b.innerHTML=`<i style="background:${p.k==='wpt'?'#D4AF37':PIN[p.k].c}">${p.g||PIN[p.k].g}</i>${p.label.replace(/^\d+\s·\s/,'')} <small>km ${nf1.format(p.s/1000)}</small>`;
    b.onclick=()=>jumpToPin(i); box.appendChild(b);
  });
}
function markPin(i){
  const box=$('#pins'); box.querySelectorAll('.pin').forEach(b=>b.classList.toggle('on',+b.dataset.i===i));
  const b=box.querySelector(`.pin[data-i="${i}"]`); if(b) box.scrollTo({left:b.offsetLeft-box.clientWidth/2+b.offsetWidth/2,behavior:reduceMotion?'auto':'smooth'});
}
function announcePin(p){ if(p.k==='wpt'&&window.guidePin) window.guidePin(p.label); else showToast(PIN[p.k].g+'  '+p.label+' · '+p.sub,true); }
function jumpToPin(i){
  const p=R.pins[i]; st.s=p.s; setPlaying(false); markPin(i); dismissHelpSoft();
  announcePin(p);
  if(st.mode==='sobrevoo'){st.lastMarker.copy(markerPos(st.s,new THREE.Vector3()));st.heading.copy(headingAt(st.s));}
  else setMode('seguir');
}

/* ---------- OpenStreetMap: landmarks, streets, zones (needs signal) ---------- */
const OVERPASS=['https://overpass-api.de/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const toLL=(x,z)=>({lat:R.lat0-z/R.kz,lon:R.lon0+x/R.kx});
const fromLL=(lat,lon)=>({x:(lon-R.lon0)*R.kx,z:-(lat-R.lat0)*R.kz});
function routeLines(stepM){
  const out=[]; let cur=[]; const step=Math.max(1,Math.round(stepM/R.total*(R.N-1)));
  for(let i=0;i<R.N;i++){
    if(R.G[i]){if(cur.length)out.push(cur);cur=[];continue;}
    if(i%step===0||i===R.N-1||(i+1<R.N&&R.G[i+1])){const ll=toLL(R.X[i],R.Z[i]);cur.push(ll.lat.toFixed(5)+','+ll.lon.toFixed(5));}
  }
  if(cur.length)out.push(cur); return out.map(c=>c.join(','));
}
async function overpass(q){
  let last=new Error('sem resposta');
  for(const url of OVERPASS){
    try{
      const ctl=new AbortController(), tm=setTimeout(()=>ctl.abort(),45000);
      const res=await fetch(url,{method:'POST',body:new URLSearchParams({data:q}),signal:ctl.signal}); clearTimeout(tm);
      if(!res.ok) throw new Error('HTTP '+res.status);
      return await res.json();
    }catch(e){last=e;}
  }
  throw last;
}
const KINDS=[['tourism','viewpoint','Miradouro',5],['tourism','museum','Museu',6],['tourism','monument','Monumento',6],['tourism','attraction','Atracção',5],
  ['historic','*','Património',6],['amenity','marketplace','Mercado',5],['leisure','stadium','Estádio',5],
  ['natural','peak','Pico',5],['amenity','hospital','Hospital',4],['amenity','school','Escola',3],
  ['amenity','place_of_worship','Templo',4],['amenity','college','Ensino superior',3],['amenity','townhall','Administração',3],
  ['leisure','park','Parque',3],['man_made','tower','Torre',2],['amenity','fuel','Bomba de combustível',3]];
function classify(t){
  for(const [k,v,l,w] of KINDS) if(t[k]&&(v==='*'||t[k]===v)){
    let label=l; if(k==='amenity'&&v==='place_of_worship'&&t.religion==='christian') label='Igreja';
    return {label,w:w+(t.wikidata||t.wikipedia?3:0)};
  }
  return null;
}
const osmName=t=>(t['name:pt']||t.name||'').trim();
function osmKey(){return (window.RB.key+'-osm-v1:')+[R.lat0.toFixed(4),R.lon0.toFixed(4),Math.round(R.total),R.N].join(':');}
function setOsmBtn(txt,busy){const b=$('#osmBtn');b.textContent='Locais: '+txt;b.setAttribute('aria-busy',busy?'true':'false');}
let osmRun=0;
async function fetchOSM(force){
  const my=++osmRun, Rr=R;
  let cached=null; if(!force){try{cached=JSON.parse(localStorage.getItem(osmKey())||'null');}catch(e){}}
  if(cached){applyOSM(cached);return;}
  setOsmBtn('a procurar…',true);
  try{
    const lines=routeLines(Math.max(80,R.total/160));
    const rad=260;
    const f=sel=>lines.map(l=>`nwr(around:${rad},${l})${sel};`).join('');
    const qL=`[out:json][timeout:50];(${f('["name"]["tourism"]')}${f('["name"]["historic"]')}${f('["name"]["amenity"~"^(place_of_worship|hospital|school|college|marketplace|townhall|fuel)$"]')}${f('["name"]["leisure"~"^(stadium|park)$"]')}${f('["name"]["natural"="peak"]')}${f('["name"]["man_made"="tower"]')}${lines.map(l=>`node(around:2500,${l})["place"~"^(city|town|village|suburb|neighbourhood|quarter|hamlet)$"]["name"];`).join('')});out tags center 500;`;
    const qS=`[out:json][timeout:50];(${lines.map(l=>`way(around:30,${l})["highway"]["name"];`).join('')});out tags geom;`;
    const [jL,jS]=await Promise.all([overpass(qL),overpass(qS).catch(()=>null)]);
    if(my!==osmRun||Rr!==R) return;
    const data=processOSM(jL,jS,rad);
    try{localStorage.setItem(osmKey(),JSON.stringify(data));}catch(e){}
    applyOSM(data);
  }catch(e){
    if(my!==osmRun||Rr!==R) return;
    setOsmBtn('sem rede · tentar',false);
  }
}
function processOSM(jL,jS,rad){
  const cands=[], places=[];
  for(const el of (jL&&jL.elements)||[]){
    const t=el.tags||{}, nm=osmName(t); if(!nm) continue;
    const lat=el.lat!=null?el.lat:el.center&&el.center.lat, lon=el.lon!=null?el.lon:el.center&&el.center.lon; if(lat==null) continue;
    const q=fromLL(lat,lon);
    if(t.place){places.push({n:nm,x:q.x,z:q.z,w:/^(suburb|neighbourhood|quarter|hamlet)$/.test(t.place)?2:1});continue;}
    const c=classify(t); if(!c) continue;
    const n=nearestS(R,q.x,q.z); if(n.d>rad*1.3) continue;
    cands.push({k:'osm',s:n.s,x:q.x,z:q.z,off:true,label:nm.length>34?nm.slice(0,33)+'…':nm,sub:c.label,w:c.w,lat,lon});
  }
  cands.sort((a,b)=>b.w-a.w);
  const seen=new Set(), lm=[], sep=Math.max(R.total*0.02,150);
  for(const c of cands){const key=c.label+'|'+c.sub; if(seen.has(key)) continue;
    if(lm.some(o=>Math.abs(o.s-c.s)<sep)) continue; seen.add(key); lm.push(c); if(lm.length>=6) break;}
  const zone=new Array(R.N).fill('');
  if(places.length) for(let i=0;i<R.N;i++){ if(R.G[i]) continue; let best='',bd=1e18;
    for(const p of places){const d=Math.hypot(p.x-R.X[i],p.z-R.Z[i])*(p.w===2?1:2.2); if(d<bd&&d<4000){bd=d;best=p.n;}} zone[i]=best; }
  const street=new Array(R.N).fill('');
  if(jS&&jS.elements){
    const C=100, grid=new Map(), add=(k,v)=>{(grid.get(k)||grid.set(k,[]).get(k)).push(v);};
    for(const w of jS.elements){ const nm=osmName(w.tags||{}); if(!nm||!w.geometry) continue;
      for(let i=1;i<w.geometry.length;i++){const a=fromLL(w.geometry[i-1].lat,w.geometry[i-1].lon),b=fromLL(w.geometry[i].lat,w.geometry[i].lon),sg={a,b,nm};
        for(let gx=Math.floor(Math.min(a.x,b.x)/C);gx<=Math.floor(Math.max(a.x,b.x)/C);gx++)
          for(let gz=Math.floor(Math.min(a.z,b.z)/C);gz<=Math.floor(Math.max(a.z,b.z)/C);gz++) add(gx+','+gz,sg);}}
    for(let i=0;i<R.N;i++){ if(R.G[i]) continue; const x=R.X[i],z=R.Z[i],cx=Math.floor(x/C),cz=Math.floor(z/C); let best='',bd=30;
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const sg of grid.get((cx+dx)+','+(cz+dz))||[]){
        const ux=sg.b.x-sg.a.x,uz=sg.b.z-sg.a.z,L=ux*ux+uz*uz||1,tt=clamp(((x-sg.a.x)*ux+(z-sg.a.z)*uz)/L,0,1);
        const d=Math.hypot(sg.a.x+ux*tt-x,sg.a.z+uz*tt-z); if(d<bd){bd=d;best=sg.nm;}}
      street[i]=best; }
  }
  return {lm,zone,street,nStreets:new Set(street.filter(Boolean)).size};
}
function applyOSM(d){
  R.osm=d.lm; R.zone=d.zone; R.street=d.street;
  R.pins=R.basePins.concat(d.lm).sort((a,b)=>a.s-b.s);
  drawPins();
  setOsmBtn(d.lm.length+' locais · '+d.nStreets+' ruas',false);
  updateAttr();
}
$('#osmBtn').onclick=()=>{if(R&&$('#osmBtn').getAttribute('aria-busy')!=='true'){try{localStorage.removeItem(osmKey());}catch(e){} fetchOSM(true);}};

/* ---------- Satellite draped over the relief (needs signal) ---------- */
const SURF={satelite:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',max:17,attr:'Imagens © Esri, Maxar, Earthstar Geographics'}};
st.surface='relevo';
function loadImg(src){return new Promise(ok=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>ok(im);im.onerror=()=>ok(null);im.src=src;});}
async function buildSurface(kind){
  const t=terrain, S=SURF[kind], cos=Math.cos(R.lat0*Math.PI/180);
  const nw=toLL(t.ox,t.oz), se=toLL(t.ox+t.size,t.oz+t.size);
  let z=clamp(Math.floor(Math.log2(156543.03*cos*2048/t.size)),3,S.max), W,H,tx0,ty0,tx1,ty1,px,py;
  for(;;){
    const n=256*2**z; px=lon=>(lon+180)/360*n; py=lat=>{const s=Math.sin(lat*Math.PI/180);return (0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n;};
    tx0=Math.floor(px(nw.lon)/256);tx1=Math.floor(px(se.lon)/256);ty0=Math.floor(py(nw.lat)/256);ty1=Math.floor(py(se.lat)/256);
    W=(tx1-tx0+1)*256;H=(ty1-ty0+1)*256; if((W<=4096&&H<=4096)||z<=3)break; z--;
  }
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;const g=cv.getContext('2d');
  g.fillStyle='#1b2a24';g.fillRect(0,0,W,H);
  const jobs=[];for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++)jobs.push([tx,ty]);
  let ok=0,done=0; const tot=jobs.length;
  const worker=async()=>{while(jobs.length){const [tx,ty]=jobs.shift();
    const im=await loadImg(S.url.replace('{z}',z).replace('{x}',tx).replace('{y}',ty));
    if(im){g.drawImage(im,(tx-tx0)*256,(ty-ty0)*256);ok++;} done++;
    if(done%8===0) setSurfBusy(kind,Math.round(done/tot*100));}};
  await Promise.all(Array.from({length:6},worker));
  if(!ok) throw new Error('as imagens de satélite não carregaram (é preciso rede, e o ficheiro guardado no telemóvel)');
  const tex=new THREE.CanvasTexture(cv); tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy()); tex.minFilter=THREE.LinearMipmapLinearFilter;
  try{g.getImageData(0,0,1,1);}catch(e){throw new Error('o servidor do mapa não autorizou a utilização das imagens');}
  const pos=t.geo.attributes.position, uv=new Float32Array(pos.count*2);
  for(let v=0;v<pos.count;v++){const ll=toLL(pos.getX(v),pos.getZ(v)); uv[v*2]=(px(ll.lon)-tx0*256)/W; uv[v*2+1]=1-(py(ll.lat)-ty0*256)/H;}
  return {tex,uv:new THREE.BufferAttribute(uv,2),partial:ok<done};
}
function setSurfBusy(kind,pct){const b=document.querySelector(`#surfaces [data-surf="${kind}"]`); if(b) b.textContent='Satélite'+(pct==null?'':' '+pct+'%');}
async function setSurface(kind){
  const t=terrain, Rr=R; st.surface=kind;
  document.querySelectorAll('#surfaces button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.surf===kind));
  if(st.theme==='holo'){applyTheme();return;}
  if(kind==='relevo'){t.geo.setAttribute('uv',t.uvRelevo);t.mat.map=null;t.mat.vertexColors=true;t.mat.userData.uCa.value=1;t.mat.needsUpdate=true;updateAttr();return;}
  try{
    if(!t.tex[kind]){setSurfBusy(kind,0); t.tex[kind]=await buildSurface(kind); setSurfBusy(kind,null);}
    if(Rr!==R||st.surface!==kind||st.theme==='holo') return;
    const L=t.tex[kind]; t.geo.setAttribute('uv',L.uv); t.mat.map=L.tex; t.mat.vertexColors=false; t.mat.userData.uCa.value=0.35; t.mat.needsUpdate=true;
    if(L.partial) showToast('Algumas imagens de satélite não carregaram. As zonas em falta ficam escuras.');
    updateAttr();
  }catch(e){
    setSurfBusy(kind,null);
    if(Rr!==R) return;
    showToast('Satélite indisponível: '+e.message+'. Fica o relevo.'); setSurface('relevo');
  }
}
document.querySelectorAll('#surfaces button').forEach(b=>b.onclick=()=>{if(R)setSurface(b.dataset.surf);});
function updateAttr(){
  const parts=[]; if(st.surface!=='relevo'&&st.theme!=='holo') parts.push(SURF[st.surface].attr);
  if(R&&(R.osm||layers.streets||layers.build)) parts.push('Locais, ruas e edifícios © contribuidores do OpenStreetMap');
  $('#attr').textContent=parts.join(' · ');
}

/* ---------- Panels, full screen ---------- */
let pulse=null, streetObj=null, buildObj=null;
const layers={streets:false,build:false,pins:true};
new ResizeObserver(()=>V3D.style.setProperty('--dock-h',$('#dock').offsetHeight+'px')).observe($('#dock'));
function fold(btn,body,open){open=open!=null?open:btn.getAttribute('aria-expanded')!=='true';btn.setAttribute('aria-expanded',open);body.hidden=!open;}
$('#infoToggle').onclick=()=>fold($('#infoToggle'),$('#infoBody'));
$('#drawerBtn').onclick=()=>fold($('#drawerBtn'),$('#drawer'));
$('#layersBtn').onclick=()=>{fold($('#layersBtn'),$('#sheet'));dismissHelpSoft();};
if(innerWidth<620) fold($('#infoToggle'),$('#infoBody'),false);
const FS_IN='<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', FS_OUT='<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>';
const docEl=document.documentElement;
if(!(docEl.requestFullscreen||docEl.webkitRequestFullscreen)) $('#fsBtn').hidden=true;
$('#fsBtn').onclick=()=>{
  const d=document;
  if(d.fullscreenElement||d.webkitFullscreenElement){(d.exitFullscreen||d.webkitExitFullscreen).call(d);return;}
  const pr=(docEl.requestFullscreen||docEl.webkitRequestFullscreen).call(docEl);
  if(pr&&pr.catch) pr.catch(()=>showToast('O navegador não permitiu o ecrã inteiro.'));
};
['fullscreenchange','webkitfullscreenchange'].forEach(ev=>document.addEventListener(ev,()=>{
  const on=!!(document.fullscreenElement||document.webkitFullscreenElement);
  $('#fsBtn').setAttribute('aria-pressed',on); $('#fsIcon').innerHTML=on?FS_OUT:FS_IN;
}));

/* ---------- Bloom ---------- */
let composer=null, bloom=null;
function ensureComposer(){
  if(composer) return composer;
  if(!THREE.EffectComposer||!THREE.UnrealBloomPass) return null;
  try{
    composer=new THREE.EffectComposer(renderer); composer.addPass(new THREE.RenderPass(scene,camera));
    bloom=new THREE.UnrealBloomPass(new THREE.Vector2(256,256),1.0,0.55,0.42); composer.addPass(bloom); sizeComposer();
  }catch(e){composer=null;}
  return composer;
}
function sizeComposer(){
  if(!composer) return; const w=stage.clientWidth,h=stage.clientHeight; if(!w||!h) return;
  if(composer.setPixelRatio) composer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1:1.5)); composer.setSize(w,h);
}

/* ---------- Theme: Natural / Holograma ---------- */
st.theme='natural';
function setTheme(t){st.theme=t;document.querySelectorAll('#themes button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.theme===t));applyTheme();}
function applyTheme(){
  if(!terrain) return;
  const holo=st.theme==='holo', M=terrain.mat, U=M.userData;
  document.querySelectorAll('#surfaces button').forEach(b=>b.disabled=holo);
  if(holo){
    terrain.geo.setAttribute('uv',terrain.uvRelevo); M.map=null; M.vertexColors=false; M.color.set('#07211d');
    U.uCa.value=1.8; U.uHolo.value=1; U.uCol.value.set('#3fe0cc'); M.needsUpdate=true;
  } else {
    M.color.set('#ffffff'); U.uHolo.value=0; U.uCol.value.set('#0b1510'); M.needsUpdate=true;
    const want=st.surface; st.theme='natural'; setSurface(want);
  }
  if(pulse) pulse.visible=holo;
  paintStreets(); paintBuildings(); updateAttr();
}
document.querySelectorAll('#themes button').forEach(b=>b.onclick=()=>{if(R)setTheme(b.dataset.theme);});

/* ---------- Layers: 3D streets and buildings from OpenStreetMap ---------- */
const ROADS={motorway:1,trunk:1,primary:.95,secondary:.8,tertiary:.65,unclassified:.42,residential:.38,track:.3,living_street:.32};
function inTerrain(x,z){const t=terrain;return x>t.ox&&x<t.ox+t.size&&z>t.oz&&z<t.oz+t.size;}
async function loadStreets(){
  const lines=routeLines(Math.max(120,R.total/120));
  const q=`[out:json][timeout:80];(${lines.map(l=>`way(around:550,${l})["highway"~"^(${Object.keys(ROADS).join('|')})$"];`).join('')});out tags geom;`;
  const j=await overpass(q), pos=[], k=[]; let n=0;
  const lift=R.rad*0.7;
  for(const w of j.elements||[]){ if(!w.geometry) continue; const kk=ROADS[w.tags&&w.tags.highway]||.35; n++;
    for(let i=1;i<w.geometry.length;i++){
      const a=fromLL(w.geometry[i-1].lat,w.geometry[i-1].lon), b=fromLL(w.geometry[i].lat,w.geometry[i].lon);
      if(!inTerrain(a.x,a.z)||!inTerrain(b.x,b.z)) continue;
      const L=Math.hypot(b.x-a.x,b.z-a.z), m=Math.max(1,Math.ceil(L/35));
      for(let q2=0;q2<m;q2++){const f0=q2/m,f1=(q2+1)/m;
        const x0=a.x+(b.x-a.x)*f0,z0=a.z+(b.z-a.z)*f0,x1=a.x+(b.x-a.x)*f1,z1=a.z+(b.z-a.z)*f1;
        pos.push(x0,terrainHeight(x0,z0)+lift,z0,x1,terrainHeight(x1,z1)+lift,z1); k.push(kk,kk);}
    }}
  if(!n) throw new Error('o OpenStreetMap não tem ruas nesta zona');
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(k.length*3),3)); g.userData.k=k;
  const o=new THREE.LineSegments(g,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.9,depthWrite:false}));
  o.renderOrder=2; o.userData.count=n; return o;
}
function paintStreets(){
  if(!streetObj) return; const holo=st.theme==='holo', c=streetObj.geometry.attributes.color, k=streetObj.geometry.userData.k;
  const base=new THREE.Color(holo?'#46f0dc':'#f3ead6'), dim=new THREE.Color(holo?'#0f4f49':'#7c7566'), tmp=new THREE.Color();
  for(let i=0;i<k.length;i++){tmp.copy(dim).lerp(base,k[i]);c.setXYZ(i,tmp.r,tmp.g,tmp.b);} c.needsUpdate=true;
  streetObj.material.opacity=holo?.95:.8;
}
async function loadBuildings(){
  const lines=routeLines(Math.max(120,R.total/120));
  const q=`[out:json][timeout:120];(${lines.map(l=>`way(around:260,${l})["building"];`).join('')});out tags geom 3000;`;
  const j=await overpass(q), P=[], E=[]; let n=0, est=0;
  for(const w of j.elements||[]){
    const gm=w.geometry; if(!gm||gm.length<4) continue;
    let pts=gm.map(p=>fromLL(p.lat,p.lon)); if(pts[0].x===pts[pts.length-1].x&&pts[0].z===pts[pts.length-1].z) pts.pop();
    if(pts.length<3||!pts.every(p=>inTerrain(p.x,p.z))) continue;
    const t=w.tags||{}; let hm=parseFloat(t.height); if(!isFinite(hm)){const lv=parseFloat(t['building:levels']); hm=isFinite(lv)?lv*3.2+1:NaN;}
    if(!isFinite(hm)){hm=7;est++;} hm=clamp(hm,3,300);
    let cx2=0,cz2=0; pts.forEach(p=>{cx2+=p.x;cz2+=p.z;}); cx2/=pts.length; cz2/=pts.length;
    const y0=Math.min(...pts.map(p=>terrainHeight(p.x,p.z)))-0.5, y1=terrainHeight(cx2,cz2)+hm;
    const v2=pts.map(p=>new THREE.Vector2(p.x,p.z)); if(THREE.ShapeUtils.isClockWise(v2)){v2.reverse();pts.reverse();}
    for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];
      P.push(a.x,y0,a.z, b.x,y0,b.z, b.x,y1,b.z,  a.x,y0,a.z, b.x,y1,b.z, a.x,y1,a.z);
      E.push(a.x,y1,a.z,b.x,y1,b.z, a.x,y0,a.z,a.x,y1,a.z);}
    for(const tr of THREE.ShapeUtils.triangulateShape(v2,[])) for(const id of [tr[0],tr[2],tr[1]]) P.push(pts[id].x,y1,pts[id].z);
    n++;
  }
  if(!n) throw new Error('o OpenStreetMap não tem edifícios desenhados nesta zona');
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.computeVertexNormals();
  const grp=new THREE.Group();
  const solid=new THREE.Mesh(g,BUILD_NAT);
  const eg=new THREE.BufferGeometry(); eg.setAttribute('position',new THREE.Float32BufferAttribute(E,3));
  const edges=new THREE.LineSegments(eg,new THREE.LineBasicMaterial({color:0x5fe3d0,transparent:true,opacity:.5,depthWrite:false}));
  grp.add(solid); grp.add(edges); grp.userData={solid,edges,count:n,est}; return grp;
}
const BUILD_NAT=new THREE.MeshStandardMaterial({color:0xd9d2c3,roughness:.88,metalness:0,side:THREE.DoubleSide});
const BUILD_HOLO=new THREE.MeshBasicMaterial({color:0x2fd6c2,transparent:true,opacity:.13,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
function paintBuildings(){
  if(!buildObj) return; const holo=st.theme==='holo', d=buildObj.userData;
  d.solid.material=holo?BUILD_HOLO:BUILD_NAT; d.edges.visible=holo;
}
const LAYER_UI={streets:['#layStreets','#stStreets','ruas',loadStreets,paintStreets],build:['#layBuild','#stBuild','edifícios',loadBuildings,paintBuildings]};
async function setLayer(name,on,reload){
  if(name==='pins'){layers.pins=on;$('#layPins').setAttribute('aria-pressed',on);if(pinGroup)pinGroup.visible=on;return;}
  const [btnSel,stSel,word,loader,paint]=LAYER_UI[name], btn=$(btnSel), Rr=R;
  layers[name]=on; btn.setAttribute('aria-pressed',on);
  let obj=name==='streets'?streetObj:buildObj;
  if(!on){ if(obj) obj.visible=false; updateAttr(); return; }
  if(obj&&!reload){ obj.visible=true; updateAttr(); return; }
  if(btn.getAttribute('aria-busy')==='true') return;
  btn.setAttribute('aria-busy','true'); $(stSel).textContent='a carregar…';
  try{
    obj=await loader(); if(Rr!==R) return;
    world.add(obj); if(name==='streets') streetObj=obj; else buildObj=obj;
    obj.visible=layers[name]; paint();
    $(stSel).textContent=nf0.format(obj.userData.count)+' '+word;
  }catch(e){
    if(Rr!==R) return;
    layers[name]=false; btn.setAttribute('aria-pressed','false'); $(stSel).textContent='sem rede · tocar';
    showToast('Não consegui carregar '+word+': '+(e.name==='AbortError'?'o OpenStreetMap demorou demasiado':e.message)+'. É preciso rede.');
  }finally{ btn.setAttribute('aria-busy','false'); updateAttr(); }
}
$('#layStreets').onclick=()=>{if(R)setLayer('streets',!layers.streets);};
$('#layBuild').onclick=()=>{if(R)setLayer('build',!layers.build);};
$('#layPins').onclick=()=>{if(R)setLayer('pins',!layers.pins);};

/* help / onboarding */
const help=$('#help'); let seen=false;
try{seen=localStorage.getItem(window.RB.key+'-3d-help')==='1';}catch(e){}
help.hidden=seen;
function closeHelp(){help.hidden=true;try{localStorage.setItem(window.RB.key+'-3d-help','1');}catch(e){}}
function dismissHelpSoft(){if(!help.hidden)closeHelp();}
$('#helpOk').onclick=closeHelp; $('#helpBtn').onclick=()=>{help.hidden=!help.hidden;};

addEventListener('keydown',e=>{
  if(V3D.hidden||e.target.closest('input'))return;
  endIntro(true);
  if(e.code==='Space'){e.preventDefault();$('#play').click();}
  else if(e.key==='r'||e.key==='R')$('#rev').click();
  else if(e.key==='1')setMode('geral'); else if(e.key==='2')setMode('seguir'); else if(e.key==='3')setMode('sobrevoo');
});

/* ---------- Elevation profile ---------- */
const pc=$('#profile'), pg=pc.getContext('2d'); let pBase=null, pPad={l:44,r:10,t:10,b:18};
function drawProfileBase(){
  const dpr=Math.min(devicePixelRatio,2), W=pc.clientWidth, Hh=pc.clientHeight;
  if(!W||!R)return;
  pc.width=W*dpr; pc.height=Hh*dpr;
  const off=document.createElement('canvas'); off.width=pc.width; off.height=pc.height; const g=off.getContext('2d'); g.scale(dpr,dpr);
  const {l,r,t,b}=pPad, iw=W-l-r, ih=Hh-t-b;
  const lo=R.emin-Math.max(5,R.relief*0.08), hi=R.emax+Math.max(5,R.relief*0.08);
  const X=d=>l+d/R.total*iw, Y=e=>t+(1-(e-lo)/(hi-lo))*ih;
  g.font='10px "JetBrains Mono", ui-monospace, monospace'; g.fillStyle='#93a59c'; g.strokeStyle='#24352f'; g.lineWidth=1;
  const es=niceStep((hi-lo)/3);
  for(let e=Math.ceil(lo/es)*es;e<=hi;e+=es){const y=Math.round(Y(e))+.5;g.beginPath();g.moveTo(l,y);g.lineTo(W-r,y);g.stroke();g.textAlign='right';g.fillText(nf0.format(e),l-6,y+3);}
  const ks=niceStep(R.total/1000/5)*1000;
  g.textAlign='center';
  for(let d=0;d<=R.total+1;d+=ks){const x=X(d);g.fillText(nf1.format(d/1000).replace(',0',''),x,Hh-4);}
  g.textAlign='left'; g.fillText('km',W-r-14,Hh-4);
  const grad=g.createLinearGradient(0,t,0,t+ih); grad.addColorStop(0,'rgba(212,175,55,.38)'); grad.addColorStop(1,'rgba(45,95,63,.12)');
  g.beginPath(); g.moveTo(X(0),Y(lo));
  for(let i=0;i<R.N;i+=2) g.lineTo(X(R.D[i]),Y(R.E[i]));
  g.lineTo(X(R.total),Y(R.E[R.N-1])); g.lineTo(X(R.total),Y(lo)); g.closePath(); g.fillStyle=grad; g.fill();
  g.beginPath(); for(let i=0;i<R.N;i+=2){const x=X(R.D[i]),y=Y(R.E[i]); i?g.lineTo(x,y):g.moveTo(x,y);} g.strokeStyle='#D4AF37'; g.lineWidth=1.5; g.stroke();
  for(const p of R.pins){const x=X(p.s);g.fillStyle=p.k==='wpt'?'#D4AF37':PIN[p.k].c;g.beginPath();g.moveTo(x-4,t);g.lineTo(x+4,t);g.lineTo(x,t+6);g.closePath();g.fill();}
  pBase={img:off,X,Y,dpr,W,Hh};
}
function drawProfile(){
  if(!pBase)return; const {img,X,Y,dpr,Hh}=pBase;
  pg.setTransform(1,0,0,1,0,0); pg.clearRect(0,0,pc.width,pc.height); pg.drawImage(img,0,0); pg.scale(dpr,dpr);
  const p=at(R,st.s), x=X(st.s), y=Y(p.e);
  pg.strokeStyle='rgba(233,239,233,.55)'; pg.lineWidth=1; pg.beginPath(); pg.moveTo(x,pPad.t); pg.lineTo(x,Hh-pPad.b); pg.stroke();
  pg.fillStyle='#fff'; pg.beginPath(); pg.arc(x,y,4,0,Math.PI*2); pg.fill();
  pg.strokeStyle='#D4AF37'; pg.lineWidth=2; pg.stroke();
}
let scrubbing=false;
function scrub(e){const rc=pc.getBoundingClientRect(); const f=clamp((e.clientX-rc.left-pPad.l)/(rc.width-pPad.l-pPad.r),0,1); st.s=f*R.total;}
pc.addEventListener('pointerdown',e=>{if(!R)return;scrubbing=true;pc.setPointerCapture(e.pointerId);scrub(e);dismissHelpSoft();});
pc.addEventListener('pointermove',e=>{if(scrubbing)scrub(e);});
pc.addEventListener('pointerup',()=>scrubbing=false); pc.addEventListener('pointercancel',()=>scrubbing=false);

/* ---------- Readouts ---------- */
function headingAt(s){
  const h=Math.max(R.total*0.012,25);
  const a=at(R,clamp(s-h*st.dir,0,R.total)), b=at(R,clamp(s+h*st.dir,0,R.total));
  const v=new THREE.Vector3(b.x-a.x,0,b.z-a.z); if(v.lengthSq()<1e-6) v.set(st.dir,0,0); return v.normalize();
}
let lastRead=0;
const CLOCK=new Intl.DateTimeFormat('pt-PT',{hour:'2-digit',minute:'2-digit',timeZone:'Africa/Luanda'});
function speedAt(i){
  if(!R.hasTime||R.G[i])return NaN;
  const k=Math.max(2,Math.round(R.N/R.total*40)),a=clamp(i-k,0,R.N-1),b=clamp(i+k,0,R.N-1);
  const dt=(R.T[b]-R.T[a])/1000; return dt>0&&isFinite(dt)?(R.D[b]-R.D[a])/dt:NaN;
}
function updateReadouts(){
  const p=at(R,st.s), done=st.dir>0?st.s:R.total-st.s;
  $('#rDone').textContent=fmtKm(done);
  $('#rAlt').textContent=R.hasEle?nf0.format(p.e)+' m':'—';
  const k=Math.max(2,Math.round(R.N/R.total*30)), i0=clamp(p.i-k,0,R.N-1), i1=clamp(p.i+k,0,R.N-1);
  const gr=R.hasEle&&R.D[i1]>R.D[i0]?(R.E[i1]-R.E[i0])/(R.D[i1]-R.D[i0])*100*st.dir:NaN;
  $('#rGrade').textContent=isFinite(gr)?(gr>0?'+':'')+nf1.format(gr)+' %':'—';
  if(R.hasTime&&isFinite(p.t)){const el=st.dir>0?p.t-R.t0:(R.t0+R.duration)-p.t;
    $('#rTime').textContent=CLOCK.format(p.t)+' · +'+fmtDur(el);}
  else $('#rTime').textContent='—';
  st.vT=speedAt(p.i);
  const stn=R.street?R.street[p.i]:'', zn=R.zone?R.zone[p.i]:'', wh=$('#where');
  if(stn||zn){wh.hidden=false; wh.innerHTML=''; wh.textContent=stn||zn; if(stn&&zn){const sp=document.createElement('span');sp.textContent=' · '+zn;wh.appendChild(sp);}}
  else wh.hidden=true;
  $('#rSpeed').textContent=isFinite(st.vT)?nf0.format(st.vT*3.6)+' km/h':'—';
}

/* ---------- Loop ---------- */
function resize(){
  sizeComposer();
  const w=stage.clientWidth,h=stage.clientHeight; if(!w||!h)return;
  renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); drawProfileBase();
}
new ResizeObserver(resize).observe(stage); new ResizeObserver(drawProfileBase).observe(pc);

const tmpV=new THREE.Vector3(), clock=new THREE.Clock();
function frame(){
  requestAnimationFrame(frame);
  const dt=Math.min(clock.getDelta(),0.1);
  if(V3D.hidden||!R) return;
  terrain.mat.userData.uTime.value+=dt;
  if(pulse.visible){const ph=(performance.now()/1000*0.7)%1; pulse.position.copy(marker.position); pulse.scale.setScalar(1+ph*6); pulse.material.opacity=(1-ph)*0.8;}
  if(st.playing&&!scrubbing){
    const base=R.total/60, prev=st.s;
    st.s+=st.dir*base*st.speed*dt;
    const lo=Math.min(prev,st.s),hi=Math.max(prev,st.s);
    R.pins.forEach((p,i)=>{if(p.s>lo&&p.s<=hi){announcePin(p);markPin(i);}});
    if(st.s>=R.total||st.s<=0){st.s=clamp(st.s,0,R.total);setPlaying(false);showToast('Chegou: '+window.RB.place+'. ▶ recomeça.',true);}
  }
  markerPos(st.s,marker.position);
  applySun(at(R,st.s).t); sky.position.copy(camera.position); stars.position.copy(camera.position);
  if(isFinite(st.vT)) st.v=isFinite(st.v)?st.v+(st.vT-st.v)*(1-Math.exp(-dt*1.5)):st.vT;
  const delta=tmpV.copy(marker.position).sub(st.lastMarker); st.lastMarker.copy(marker.position);
  const g=trailMesh.geometry, f=st.s/R.total, segs=Math.round(f*trailSegs);
  if(st.dir>0) g.setDrawRange(0,segs*trailIdxPerSeg); else g.setDrawRange(segs*trailIdxPerSeg,(trailSegs-segs)*trailIdxPerSeg);
  if(st.intro){
    const I=st.intro; I.k=Math.min(1,I.k+dt/I.dur); const e=I.k*I.k*(3-2*I.k);
    const c=new THREE.Vector3(R.cx,sy(R,(R.emin+R.emax)/2),R.cz), a=0.44-1.7+1.7*e;
    const rad=R.extent*(1.9-0.75*e), hgt=R.extent*(1.25-0.55*e);
    camera.position.set(c.x+Math.sin(a)*rad,c.y+hgt,c.z+Math.cos(a)*rad); controls.target.copy(c); camera.lookAt(c);
    if(I.k>=1) endIntro(false);
  } else if(st.fly){
    const F=st.fly; F.k=Math.min(1,F.k+dt/F.dur); const e=F.k<.5?4*F.k**3:1-Math.pow(-2*F.k+2,3)/2;
    if(st.mode==='seguir'){F.p1.add(delta);F.t1.add(delta);}
    camera.position.lerpVectors(F.p0,F.p1,e); controls.target.lerpVectors(F.t0,F.t1,e);
    if(F.k>=1) st.fly=null;
    camera.lookAt(controls.target);
  } else if(st.mode==='seguir'){
    camera.position.add(delta); controls.target.add(delta); controls.update();
  } else if(st.mode==='sobrevoo'){
    const k=1-Math.exp(-dt*2.2);
    st.heading.lerp(headingAt(st.s),k).normalize();
    const base=isFinite(st.v)?clamp(70+st.v*22,70,Math.max(R.extent*0.12,90)):Math.max(R.extent*0.075,60);
    const dist=base*st.chase;
    const want=marker.position.clone().addScaledVector(st.heading,-dist); want.y+=dist*0.5;
    want.y=Math.max(want.y,terrainHeight(want.x,want.z)+dist*0.18);
    camera.position.lerp(want,k);
    st.look.lerp(marker.position.clone().addScaledVector(st.heading,dist*0.45),k);
    camera.lookAt(st.look); controls.target.copy(st.look);
  } else controls.update();
  const t=performance.now();
  if(t-lastRead>90){updateReadouts();lastRead=t;}
  drawProfile();
  if(st.theme==='holo'&&ensureComposer()) composer.render(dt); else renderer.render(scene,camera);
}

try{ load(window.RB.gpx,'Da estrada '+(window.RB.until||('até '+window.RB.place))); }catch(e){ showToast(e.message); }
resize(); frame();
};

