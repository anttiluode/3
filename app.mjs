import {N,GreedySplats,compose,bandEnergy,toFloat,toPixels,clamp} from './engine.mjs';
import {OpticalView} from './render.mjs';
const $=id=>document.getElementById(id);
const world=$('world'),shards=$('shards'),stage=$('stage');
const inputCanvas=$('inputCanvas'),ic=inputCanvas.getContext('2d',{willReadFrequently:true});
const srcPreview=$('sourcePreview').getContext('2d'),errPreview=$('residuePreview').getContext('2d');
const video=$('webcam');
const fit=new GreedySplats(N,190);
const state={mode:1,source:'demo',light:[.26,.45],tilt:[0,0],scatter:.54,depth:.52,peel:.35,detail:1,time:0,explosion:0,material:'ice',frames:0,lastSample:0,lastStats:0,sourceStamp:0,webcamStream:null,sourceImage:null,slow:false};
let optical=null,flat=null;
try{optical=new OpticalView(world,N);}catch(e){
  flat=world.getContext('2d');$('shaderTag').textContent='CANVAS FALLBACK';console.warn('WebGL2 unavailable',e);
}
const overlay=shards.getContext('2d');
const particleMap=new Map();
let toastUntil=0;
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('visible');toastUntil=performance.now()+2400;}
function putPreview(context,arr,abs=false,scale=1){
 const raw=toPixels(arr,N,abs,scale);let tmp=document.createElement('canvas');tmp.width=N;tmp.height=N;tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(raw),N,N),0,0);
 context.clearRect(0,0,144,144);context.drawImage(tmp,0,0,144,144);
}
function textureArray(data){return toPixels(data,N);}
function setMode(mode){
 state.mode=mode;
 for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-selected',String(+b.dataset.mode===mode));
 const titles={1:'A crystal that learns your shape.',2:'Turn frequency into substance.',3:'Shatter the image. Watch it return.'};
 const descriptions={1:'The blank luminous sphere gains oriented Gabor packets, chosen greedily to reduce the residue. Broad structure comes first.',2:'Sihti splits the image into coarse and fine channels. We assign those channels to illustrative optical depths and relight the material.',3:'Every visible shard corresponds to one fitted Gabor packet. Throw them outward, then watch spring forces return them to the remembered arrangement.'};
 const hints={1:'The packets are fitted against your current image. Move the pointer to relight the emerging crystal.',2:'Sweep the “Peel toward surface” slider, then move the light behind the translucent volume.',3:'Press SHATTER or click the crystal. The Gabor packets leave and reform the image.'};
 $('modeTitle').textContent=titles[mode];$('modeDesc').textContent=descriptions[mode];$('stageHint').textContent=hints[mode];
 $('viewLabel').textContent=['','01 — Self-carving matter','02 — Frequency as optical depth','03 — Shatter & reform'][mode];
 $('shatterBtn').classList.toggle('hidden',mode!==3);
 $('peelSection').classList.toggle('hidden',mode!==2);$('detailSection').classList.toggle('hidden',mode!==1);
 if(mode===3&&fit.atoms.length<16){fit.fit(50);refreshTextures();}
}
function reset(){fit.clear();particleMap.clear();state.explosion=0;sampleInput(true);toast('Crystal reset — rebuilding from coarse structure');}
function drawFallback(){
 const w=world.width=world.clientWidth||800,h=world.height=world.clientHeight||600;
 const ctx=flat;const bg=ctx.createRadialGradient(w*.5,h*.5,10,w*.5,h*.5,h*.65);
 bg.addColorStop(0,'#204c59');bg.addColorStop(.7,'#092635');bg.addColorStop(1,'#06131d');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 let pixels=fit.pred;
 if(state.mode===2){
  const b=fit.bands;pixels=new Float32Array(fit.target.length);
  for(let i=0;i<pixels.length;i++)pixels[i]=clamp(b[0][i]+(1.1-state.peel*.45)*(b[1][i]+b[2][i])+1.6*state.peel*b[3][i]);
 }
 const a=document.createElement('canvas');a.width=N;a.height=N;let c=a.getContext('2d');
 c.putImageData(new ImageData(new Uint8ClampedArray(toPixels(pixels,N)),N,N),0,0);
 const radius=Math.min(w,h)*.39,cx=w/2,cy=h/2;
 const halo=ctx.createRadialGradient(cx,cy,radius*.4,cx,cy,radius*1.13);
 halo.addColorStop(0,'#8de9e700');halo.addColorStop(.74,'#6bdac311');halo.addColorStop(1,'#0c2c3300');ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.clip();
 ctx.globalAlpha=state.mode===3?1-state.explosion*.8:.94;
 ctx.filter=`blur(${(state.scatter*2.2).toFixed(1)}px)`;
 ctx.drawImage(a,cx-radius,cy-radius,radius*2,radius*2);
 ctx.filter='none';ctx.globalAlpha=1;
 const haze=ctx.createRadialGradient(cx-radius*.5,cy-radius*.6,3,cx,cy,radius*1.3);
 const pal={ice:'#b3f6ff',amber:'#efb56f',jade:'#71e5bd',opal:'#ddb4f7',skin:'#ffc2a6'};
 const color=pal[state.material]||pal.ice;
 haze.addColorStop(0,color+'55');haze.addColorStop(.45,color+'0a');haze.addColorStop(1,'#081621bb');
 ctx.fillStyle=haze;ctx.globalCompositeOperation='screen';ctx.fillRect(cx-radius,cy-radius,radius*2,radius*2);ctx.globalCompositeOperation='source-over';ctx.restore();
 ctx.strokeStyle=color+'bf';ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();
 const lx=cx+state.light[0]*radius*.8,ly=cy-state.light[1]*radius*.8;
 const light=ctx.createRadialGradient(lx,ly,1,lx,ly,radius*.9);light.addColorStop(0,color+'55');light.addColorStop(1,color+'00');
 ctx.fillStyle=light;ctx.beginPath();ctx.arc(cx,cy,radius,0,6.29);ctx.fill();
}
function proceduralPortrait(t){
 const W=N,h=N;ic.clearRect(0,0,W,h);
 let bg=ic.createRadialGradient(48,44,1,47,44,68);bg.addColorStop(0,'#174c5c');bg.addColorStop(.5,'#0c2935');bg.addColorStop(1,'#030d16');ic.fillStyle=bg;ic.fillRect(0,0,W,h);
 const sway=Math.sin(t*.7)*1.7,shift=Math.cos(t*.5)*1.3;
 // Ambient orbit is still physically represented in the target pixels.
 ic.strokeStyle='#6fadb34f';ic.lineWidth=.65;ic.beginPath();ic.ellipse(48,48,36,40,.32,0,Math.PI*2);ic.stroke();
 ic.save();ic.translate(sway,shift);
 let halo=ic.createRadialGradient(48,52,3,48,52,39);halo.addColorStop(0,'#e8d19a55');halo.addColorStop(1,'#124c6a00');ic.fillStyle=halo;ic.fillRect(5,7,86,88);
 // Shoulder and jacket volume.
 ic.fillStyle='#265d64';ic.beginPath();ic.moveTo(7,96);ic.bezierCurveTo(15,71,31,75,36,69);ic.lineTo(59,69);ic.bezierCurveTo(71,76,85,73,93,96);ic.fill();
 let coat=ic.createLinearGradient(13,78,82,96);coat.addColorStop(0,'#2b7b7f');coat.addColorStop(.55,'#123f54');coat.addColorStop(1,'#193947');ic.fillStyle=coat;ic.beginPath();ic.moveTo(12,96);ic.quadraticCurveTo(20,75,38,76);ic.lineTo(57,76);ic.quadraticCurveTo(77,73,86,96);ic.fill();
 ic.fillStyle='#ac836e';ic.fillRect(40,62,16,18);
 // Dark back hair and luminous curls.
 ic.fillStyle='#16394b';ic.beginPath();ic.moveTo(30,28);ic.quadraticCurveTo(28,2,50,9);ic.quadraticCurveTo(75,7,72,30);ic.lineTo(74,73);ic.quadraticCurveTo(58,84,30,73);ic.closePath();ic.fill();
 let skin=ic.createLinearGradient(27,22,70,76);skin.addColorStop(0,'#f8dfae');skin.addColorStop(.45,'#d5a879');skin.addColorStop(1,'#855c59');ic.fillStyle=skin;
 ic.beginPath();ic.moveTo(32,26);ic.bezierCurveTo(28,39,31,58,42,67);ic.quadraticCurveTo(49,75,56,65);ic.bezierCurveTo(68,57,70,34,65,24);ic.quadraticCurveTo(47,14,32,26);ic.fill();
 ic.fillStyle='#6b5e5b33';ic.beginPath();ic.ellipse(61,50,7,12,.26,0,6.29);ic.fill();
 // Hair fringe.
 ic.fillStyle='#183b4a';ic.beginPath();ic.moveTo(30,35);ic.quadraticCurveTo(24,4,50,12);ic.quadraticCurveTo(71,7,69,35);ic.quadraticCurveTo(61,26,59,19);ic.quadraticCurveTo(45,31,30,35);ic.fill();
 ic.strokeStyle='#bba084aa';ic.lineWidth=1;ic.beginPath();ic.moveTo(36,41);ic.quadraticCurveTo(41,38,45,42);ic.moveTo(53,42);ic.quadraticCurveTo(58,39,63,42);ic.stroke();
 ic.fillStyle='#233a46';ic.beginPath();ic.ellipse(42,43,1.5,1.15,0,0,6.29);ic.ellipse(59,43,1.5,1.15,0,0,6.29);ic.fill();
 ic.strokeStyle='#84584d';ic.beginPath();ic.moveTo(49,43);ic.quadraticCurveTo(45,53,51,54);ic.moveTo(43,60);ic.quadraticCurveTo(51,63,58,59);ic.stroke();
 ic.strokeStyle='#e5c79277';ic.lineWidth=1.4;ic.beginPath();ic.moveTo(28,24);ic.bezierCurveTo(25,43,32,59,33,69);ic.moveTo(69,29);ic.bezierCurveTo(72,48,68,61,66,70);ic.stroke();
 ic.restore();
 // Golden botanical shards, to make reflections more legible.
 ic.strokeStyle='#e3b16f';ic.lineWidth=.8;ic.beginPath();ic.moveTo(8,81);ic.quadraticCurveTo(11,63,18,54);ic.moveTo(84,83);ic.quadraticCurveTo(82,66,77,56);ic.stroke();
 for(let j=0;j<9;j++){const a=j*2.4+t*.13,r=31+(j%3)*6,x=48+Math.cos(a)*r,y=45+Math.sin(a)*r;ic.fillStyle=j%2?'#81ddd8':'#f5d89c';ic.globalAlpha=.33+.27*Math.sin(t*.8+j)**2;ic.beginPath();ic.arc(x,y,j%3===0?1.25:.65,0,6.29);ic.fill();}
 ic.globalAlpha=1;
}
function sampleInput(force=false){
 const t=performance.now()/1000;
 if(state.source==='camera'&&video.readyState>=2){
  const w=video.videoWidth,h=video.videoHeight,s=Math.min(w,h),x=(w-s)/2,y=(h-s)/2;
  ic.save();ic.translate(N,0);ic.scale(-1,1);ic.drawImage(video,x,y,s,s,0,0,N,N);ic.restore();
 }else if(state.source==='image'&&state.sourceImage){
  const im=state.sourceImage,w=im.naturalWidth||im.width,h=im.naturalHeight||im.height,s=Math.min(w,h);
  ic.drawImage(im,(w-s)/2,(h-s)/2,s,s,0,0,N,N);
 }else if(state.source==='demo'){proceduralPortrait(t);}
 else return;
 const rgb=toFloat(ic.getImageData(0,0,N,N).data);
 fit.setTarget(rgb);
 if(force)fit.fit(2);
 if(optical){optical.update(0,textureArray(fit.target));optical.update(2,textureArray(fit.bands[0]));optical.update(3,textureArray(compose(fit.bands,2)));}
}
function refreshTextures(){if(optical)optical.update(1,textureArray(fit.pred));}
function renderStats(){
 const n=fit.atoms.length,stage=Math.min(3,Math.floor(n/39));
 $('packetCount').textContent=`${n} / ${fit.max}`;
 $('errorVal').textContent=fit.mae.toFixed(3);
 $('fitStage').textContent=['COARSE BODY','MID STRUCTURE','SHARP EDGES','FINE DETAILS'][stage];
 $('frameCount').textContent=String(state.frames);
 putPreview(srcPreview,fit.target);
 const diff=new Float32Array(fit.target.length);for(let i=0;i<diff.length;i++)diff[i]=Math.abs(fit.target[i]-fit.pred[i]);
 putPreview(errPreview,diff,false,3);
 const energies=bandEnergy(fit.bands),max=Math.max(...energies,.001);const labels=['Core / volume','Mid / haze','Edge / crust','Fine / surface'];
 $('bands').innerHTML=labels.map((label,j)=>`<div class="bandRow"><span>${label}</span><div class="energyBar"><b style="width:${Math.max(1,energies[j]/max*100).toFixed(1)}%"></b></div><em>${energies[j].toFixed(2)}</em></div>`).join('');
}
function syncParticles(){
 for(const a of fit.atoms)if(!particleMap.has(a)){const x=a.x/N*2-1,y=1-a.y/N*2;particleMap.set(a,{x,y,z:(Math.random()-.5)*.15,vx:0,vy:0,vz:0,r:Math.random()*6.28,vr:0,color:clamp((a.amp[0]+a.amp[1]+a.amp[2])/3,.1,1)});}
 for(const [key] of particleMap)if(!fit.atoms.includes(key))particleMap.delete(key);
}
function shatter(){
 state.mode!==3&&setMode(3);
 if(fit.atoms.length<20){fit.fit(65);refreshTextures();}
 syncParticles();state.explosion=1;
 for(const p of particleMap.values()){
  const d=Math.hypot(p.x,p.y)+.1,a=Math.atan2(p.y,p.x)+(Math.random()-.5)*1.5;
  const speed=(.8+Math.random()*2.6)*(1.2-.35*d);
  p.vx+=Math.cos(a)*speed;p.vy+=Math.sin(a)*speed;p.vz+=(Math.random()-.5)*3;
  p.vr+=(Math.random()-.5)*8;
 }
 toast('The image has shattered — the remembered positions remain');
}
function drawParticles(dt){
 const w=stage.clientWidth,h=stage.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);
 if(shards.width!==Math.round(w*dpr)||shards.height!==Math.round(h*dpr)){shards.width=Math.round(w*dpr);shards.height=Math.round(h*dpr);}
 overlay.setTransform(dpr,0,0,dpr,0,0);overlay.clearRect(0,0,w,h);
 if(state.mode!==3)return;
 syncParticles();
 const pull=.9; // seconds^-2, a genuine damped spring with inertia.
 const F=Math.min(dt,.05),size=Math.min(w,h);
 const arr=[...particleMap.entries()];
 arr.sort((a,b)=>a[1].z-b[1].z);
 for(const [a,p] of arr){
  const tx=a.x/N*2-1,ty=1-a.y/N*2;
  p.vx+=((tx-p.x)*pull-p.vx*1.65)*F;
  p.vy+=((ty-p.y)*pull-p.vy*1.65)*F;
  p.vz+=(-p.z*pull-p.vz*1.7)*F;
  p.x+=p.vx*F;p.y+=p.vy*F;p.z+=p.vz*F;
  p.r+=p.vr*F;p.vr*=Math.exp(-2*F);
  const dist=Math.hypot(p.x-tx,p.y-ty,p.z);
  const visible=clamp(.25+dist*2+state.explosion*.4,0,1);
  const zoom=clamp(2.5/(2.7-p.z*.42),.5,2.5);
  const sx=w/2+p.x*size*.43*zoom+p.z*state.tilt[0]*20;
  const sy=h/2-p.y*size*.43*zoom-p.z*state.tilt[1]*20;
  const radius=clamp(a.sigma*size/N*.25*zoom,2,18);
  const rgb=[clamp(fit.target[(a.y*N+a.x)*3]||.3),clamp(fit.target[(a.y*N+a.x)*3+1]||.7),clamp(fit.target[(a.y*N+a.x)*3+2]||.7)];
  const c=`rgba(${Math.round((rgb[0]*.7+.3)*255)},${Math.round((rgb[1]*.72+.2)*255)},${Math.round((rgb[2]*.77+.17)*255)},${visible*.76})`;
  overlay.save();overlay.translate(sx,sy);overlay.rotate(p.r);
  overlay.fillStyle=c;overlay.beginPath();overlay.moveTo(-radius,0);overlay.lineTo(radius*.7,-radius*.45);overlay.lineTo(radius*.42,radius*.88);overlay.closePath();overlay.fill();
  overlay.strokeStyle=`rgba(217,249,233,${visible*.45})`;overlay.lineWidth=.7;overlay.stroke();
  overlay.fillStyle=`rgba(249,245,219,${visible*.48})`;overlay.beginPath();overlay.arc(0,0,Math.max(.7,radius*.19),0,Math.PI*2);overlay.fill();
  overlay.restore();
 }
}
function setMaterial(key){state.material=key;optical?.setPalette(key);for(const b of document.querySelectorAll('[data-mat]'))b.setAttribute('aria-pressed',String(b.dataset.mat===key));}
function takeShot(){
 const c=document.createElement('canvas');c.width=world.width;c.height=world.height;const ctx=c.getContext('2d');
 ctx.drawImage(world,0,0);ctx.drawImage(shards,0,0,c.width,c.height);
 const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download=`matter-from-residue-${state.mode}.png`;a.click();toast('Saved the current view');
}
async function toggleCamera(){
 if(state.webcamStream){for(const tr of state.webcamStream.getTracks())tr.stop();state.webcamStream=null;video.srcObject=null;state.source='demo';state.sourceImage=null;reset();$('sourceStatus').textContent='Procedural source';$('cameraBtn').textContent='◉ Use live camera';return;}
 if(!navigator.mediaDevices?.getUserMedia){toast('Camera needs HTTPS or localhost — choose a photo instead');return;}
 try{
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
  state.webcamStream=stream;video.srcObject=stream;await video.play();state.source='camera';$('sourceStatus').textContent='LIVE camera · local';$('cameraBtn').textContent='■ Stop camera';reset();
 }catch(e){toast(`Camera unavailable (${e.name||'permission'}); photo and demo still work`);}
}
function wire(){
 for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>setMode(+b.dataset.mode));
 for(const b of document.querySelectorAll('[data-mat]'))b.addEventListener('click',()=>setMaterial(b.dataset.mat));
 for(const id of ['scatter','depth','peel','detail']){
  const input=$(id);input.addEventListener('input',()=>{state[id]=+input.value/100;$(id+'Val').textContent=input.value+'%';});
 }
 $('cameraBtn').addEventListener('click',toggleCamera);
 $('demoBtn').addEventListener('click',()=>{if(state.webcamStream)toggleCamera();else{state.source='demo';state.sourceImage=null;reset();}$('sourceStatus').textContent='Procedural source';});
 $('fileInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
   const url=URL.createObjectURL(file),img=new Image();
   img.onload=()=>{URL.revokeObjectURL(url);if(state.webcamStream){for(const tr of state.webcamStream.getTracks())tr.stop();state.webcamStream=null;video.srcObject=null;$('cameraBtn').textContent='◉ Use live camera';}
    state.sourceImage=img;state.source='image';$('sourceStatus').textContent='Photo · local';reset();toast('Photo loaded: use the three experiments');};
   img.onerror=()=>{URL.revokeObjectURL(url);toast('Could not load that image');};img.src=url;
  }catch(err){toast('Image could not be decoded');}
 });
 $('resetBtn').addEventListener('click',reset);$('shatterBtn').addEventListener('click',shatter);$('saveBtn').addEventListener('click',takeShot);
 stage.addEventListener('pointermove',e=>{
  const r=stage.getBoundingClientRect();const x=clamp((e.clientX-r.left)/r.width*2-1,-1,1),y=clamp(1-(e.clientY-r.top)/r.height*2,-1,1);
  state.light=[x,y];state.tilt=[x*.8,y*.8];
 });
 stage.addEventListener('click',e=>{if(state.mode===3&&!e.target.closest('button'))shatter();});
 document.addEventListener('keydown',e=>{
  if(e.target.matches('input')&&e.target.type==='range')return;
  if(['1','2','3'].includes(e.key))setMode(+e.key);
  if(e.key.toLowerCase()==='v')toggleCamera();
  if(e.key.toLowerCase()==='r')reset();
  if(e.key.toLowerCase()==='s')takeShot();
  if(e.code==='Space'){e.preventDefault();shatter();}
 });
}
let prev=0;
function animate(ts){
 const dt=prev?Math.min(.05,(ts-prev)/1000):1/60;prev=ts;
 state.time=ts/1000;state.frames++;
 if(ts-state.lastSample>210){
  state.lastSample=ts;
  sampleInput();
  fit.fit(state.source==='camera'?5:6);refreshTextures();
 }
 if(optical)optical.draw(state);else drawFallback();
 state.explosion*=Math.exp(-dt*.58);
 drawParticles(dt);
 if(ts-state.lastStats>550){state.lastStats=ts;renderStats();}
 if(toastUntil&&ts>toastUntil){$('toast').classList.remove('visible');toastUntil=0;}
 requestAnimationFrame(animate);
}
wire();sampleInput(true);refreshTextures();setMode(1);renderStats();requestAnimationFrame(animate);

