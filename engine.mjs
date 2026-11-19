/* The Sieve + Gabor engine. All CPU, deterministic. No learned weights or backprop.
   Sihti's exact telescoping identity + lightweight SplatWorld-style oriented packets.
   This is a new demonstration implementation, not a port of either original model. */
export const N = 96;
export const clamp = (x, a=0, b=1) => Math.max(a, Math.min(b, x));

function blur(src, n, sigma) {
  const radius = Math.max(1, Math.ceil(sigma*2.4));
  const w = new Float32Array(radius*2+1);
  let den=0;
  for(let k=-radius;k<=radius;k++){let v=Math.exp(-k*k/(2*sigma*sigma)); w[k+radius]=v; den+=v;}
  for(let k=0;k<w.length;k++)w[k]/=den;
  const temp=new Float32Array(src.length),out=new Float32Array(src.length);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(let c=0;c<3;c++){
    let v=0;for(let k=-radius;k<=radius;k++)v+=src[(y*n+clamp(x+k,0,n-1))*3+c]*w[k+radius];
    temp[(y*n+x)*3+c]=v;
  }
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(let c=0;c<3;c++){
    let v=0;for(let k=-radius;k<=radius;k++)v+=temp[(clamp(y+k,0,n-1)*n+x)*3+c]*w[k+radius];
    out[(y*n+x)*3+c]=v;
  }
  return out;
}
export function sieve(rgb, n=N) {
  const a=blur(rgb,n,8.5),b=blur(rgb,n,4.3),c=blur(rgb,n,1.5);
  const sub=(x,y)=>{const out=new Float32Array(x.length);for(let i=0;i<out.length;i++)out[i]=x[i]-y[i];return out;};
  return [a,sub(b,a),sub(c,b),sub(rgb,c)];
}
export function compose(bands, maxBand=3){
  const out=new Float32Array(bands[0].length);
  for(let j=0;j<=maxBand;j++)for(let i=0;i<out.length;i++)out[i]+=bands[j][i];
  return out;
}
export function bandEnergy(bands){return bands.map(b=>{let s=0;for(const x of b)s+=Math.abs(x);return s/b.length;});}
export function toFloat(img){const dst=new Float32Array(img.length/4*3);for(let i=0,j=0;i<img.length;i+=4){dst[j++]=img[i]/255;dst[j++]=img[i+1]/255;dst[j++]=img[i+2]/255;}return dst;}
export function toPixels(arr,n=N,abs=false,scale=1){const out=new Uint8Array(n*n*4);for(let i=0;i<n*n;i++)for(let c=0;c<3;c++){let x=arr[i*3+c]*scale;out[4*i+c]=Math.round(255*clamp(abs?Math.abs(x):x));}for(let i=0;i<n*n;i++)out[4*i+3]=255;return out;}
export function error(target,pred){let s=0;for(let i=0;i<target.length;i++)s+=Math.abs(target[i]-pred[i]);return s/target.length;}

function kernel(dx,dy,sigma,theta,freq){
  const u=dx*Math.cos(theta)+dy*Math.sin(theta);
  const v=-dx*Math.sin(theta)+dy*Math.cos(theta);
  const env=Math.exp(-(u*u+v*v)/(2*sigma*sigma));
  return env*(.76+.24*Math.cos(u*freq));
}
export class GreedySplats {
  constructor(n=N,max=190){this.n=n;this.max=max;this.clear();}
  clear(){this.atoms=[];this.pred=new Float32Array(this.n*this.n*3);this.target=new Float32Array(this.pred.length);this.bands=sieve(this.target,this.n);this.tick=0;this.noiseIndex=0;}
  setTarget(rgb){
    if(rgb.length!==this.target.length)throw new Error('RGB target length mismatch');
    // Keeping current atoms across frames makes the target a living attractor.
    this.target.set(rgb);
    this.bands=sieve(this.target,this.n);
  }
  subtractAtom(atom,mult=1){
    const {x,y,sigma,theta,freq,amp}=atom,r=Math.ceil(2.5*sigma),n=this.n;
    for(let py=Math.max(0,Math.floor(y-r));py<=Math.min(n-1,Math.ceil(y+r));py++)for(let px=Math.max(0,Math.floor(x-r));px<=Math.min(n-1,Math.ceil(x+r));px++){
      const k=kernel(px-x,py-y,sigma,theta,freq)*mult;const j=(py*n+px)*3;
      for(let c=0;c<3;c++)this.pred[j+c]+=k*amp[c];
    }
  }
  rebuild(){this.pred.fill(0);for(const a of this.atoms)this.subtractAtom(a);}
  fitOne(){
    const n=this.n,stage=Math.min(3,Math.floor(this.atoms.length/39));
    const goal=compose(this.bands,stage);
    const sigma=[12,7,3.6,1.9][stage];
    // Search candidates by local residual energy. Several points give a robust
    // pursuit without building huge dictionaries or differentiating a renderer.
    const candidates=[];
    for(let y=3;y<n-3;y+=5)for(let x=3;x<n-3;x+=5){
      const i=(y*n+x)*3;let q=0;
      for(let c=0;c<3;c++)q+=(goal[i+c]-this.pred[i+c])**2;
      candidates.push({x,y,q});
    }
    candidates.sort((a,b)=>b.q-a.q);
    if(candidates.length===0)return;
    // Randomized jumps stop the sieve from allocating every packet to one feature.
    const rseed=(this.tick*73+this.noiseIndex*137)%candidates.length;
    let best=null,bestScore=-Infinity;
    for(const p of [...candidates.slice(0,Math.min(9,candidates.length)),candidates[rseed]]){
      for(let oi=0;oi<4;oi++){
        const theta=oi*Math.PI/4, freq=.85/Math.max(2,sigma),radius=Math.ceil(2.4*sigma);
        let sums=[0,0,0],den=0;
        for(let yy=Math.max(0,p.y-radius);yy<Math.min(n,p.y+radius+1);yy+=2)for(let xx=Math.max(0,p.x-radius);xx<Math.min(n,p.x+radius+1);xx+=2){
          const k=kernel(xx-p.x,yy-p.y,sigma,theta,freq),j=(yy*n+xx)*3;
          den+=k*k;for(let c=0;c<3;c++)sums[c]+=(goal[j+c]-this.pred[j+c])*k;
        }
        const sc=(sums[0]**2+sums[1]**2+sums[2]**2)/Math.max(den,.001);
        if(sc>bestScore){bestScore=sc;best={x:p.x,y:p.y,sigma,theta,freq,amp:sums.map(x=>clamp(x/Math.max(den,.001),-1,1)),phase:0};}
      }
    }
    if(!best)return;
    // A few packets per frame; their error reduction is genuinely measured.
    this.atoms.push(best);this.subtractAtom(best);this.tick++;
    if(this.atoms.length>this.max){this.atoms.splice(0,Math.max(1,Math.floor(this.max*.09)));this.rebuild();}
  }
  fit(count=3){for(let i=0;i<count;i++)this.fitOne();}
  get mae(){return error(this.target,this.pred);}
}

