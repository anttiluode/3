import {test} from 'node:test';
import assert from 'node:assert/strict';
import {N,sieve,compose,GreedySplats,error} from '../engine.mjs';
function pattern(){const a=new Float32Array(N*N*3);for(let y=0;y<N;y++)for(let x=0;x<N;x++)for(let c=0;c<3;c++)a[(y*N+x)*3+c]=(Math.sin(x*.13)+Math.cos(y*.17)+2)/4;return a;}
test('Sihti bands telescope exactly',()=>{const v=pattern(),b=sieve(v),r=compose(b);let m=0;for(let i=0;i<v.length;i++)m=Math.max(m,Math.abs(v[i]-r[i]));assert.ok(m<1e-6);});
test('Gabor pursuit reduces error without gradients',()=>{const v=pattern(),s=new GreedySplats();s.setTarget(v);const before=error(v,s.pred);s.fit(45);assert.ok(s.mae<before*.87,`${before} vs ${s.mae}`);});
test('atom cap and repeated update do not produce NaNs',()=>{const s=new GreedySplats(N,24),v=pattern();s.setTarget(v);s.fit(60);assert.ok(s.atoms.length<=24);assert.ok(s.pred.every(Number.isFinite));});

