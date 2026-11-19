/* A stylized *screen-space* translucent optical shader. The three bands are
   mathematical scale-space channels, NOT measured physical depth. */
const VS=`#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
const FS=`#version 300 es
precision highp float;
in vec2 vUv;out vec4 frag;
uniform vec2 uResolution,uLight,uTilt;
uniform float uTime,uScatter,uPeel,uDepth,uExplosion,uDetail;
uniform int uMode;
uniform vec3 uTint,uAbsorb;
uniform sampler2D uSource,uRecon,uLow,uMiddle;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
vec3 backdrop(vec2 p){
 float r=length(p);
 vec3 col=mix(vec3(.012,.029,.056),vec3(.035,.075,.093),smoothstep(.1,1.35,r));
 float grid=(1.-smoothstep(.003,.012,abs(fract(p.x*7.)-.5)))*.028;
 grid+=(1.-smoothstep(.003,.012,abs(fract(p.y*7.)-.5)))*.028;
 col+=vec3(.03,.11,.13)*grid;
 float stars=step(.997,hash(floor(p*vec2(80.,60.))))*(.28+.72*hash(floor(p*66.)));
 col+=vec3(.22,.39,.51)*stars;
 float halo=exp(-r*r*2.3)*(.035+.012*sin(uTime*.5));
 col+=vec3(.04,.13,.19)*halo;
 return col;
}
void main(){
 vec2 uv=vUv;
 vec2 p=(uv-.5)*2.;p.x*=uResolution.x/max(1.,uResolution.y);
 vec2 q=p/vec2(.91,.91);q+=uTilt*.055;
 float rad=length(q),t=uTime;
 vec3 col=backdrop(p);
 float glow=exp(-pow(abs(rad-.94)*8.,2.))*.10;
 col+=uTint*glow*.22;
 if(rad<1.03){
  float inside=1.-smoothstep(.984,1.015,rad);
  float z=sqrt(max(0.,1.-min(.999,rad*rad)));
  vec3 N=normalize(vec3(q*.88,z));
  vec3 L=normalize(vec3(uLight.x*1.8-q.x*.45,uLight.y*1.8-q.y*.45,.88-uDepth*.45));
  float facet=noise(q*vec2(19.,21.)+sin(t*.11)*.05);
  vec2 refractUV=q*.47+.5 + (N.xy*.015+(vec2(facet)-.5)*.01)*uScatter;
  refractUV=clamp(refractUV,.004,.996);
  vec2 offset=(uLight-q*.3)*(.028+.06*uDepth)*uScatter;
  vec3 raw=texture(uSource,refractUV).rgb;
  vec3 fitted=texture(uRecon,refractUV).rgb;
  vec3 low=texture(uLow,refractUV-offset*(1.0+uDepth)).rgb;
  vec3 med=texture(uMiddle,refractUV-offset*.46).rgb;
  vec3 image=uMode==2 ? raw : mix(low,fitted,clamp(uDetail,.0,1.));
  // The 'depth' slider routes Sihti spatial-frequency residues to visual layers.
  // This is an artistic hypothesis, not true recovered optical depth.
  if(uMode==2){
    vec3 high=raw-med;
    vec3 between=med-low;
    image=low+between*(1.1-uPeel*.45)+high*(1.6*uPeel);
  }
  float lum=dot(image,vec3(.2126,.7152,.0722));
  float shad=dot(N,L)*.5+.5;
  vec3 lightThrough=mix(low,image,.58)+uTint*.09;
  float thickness=1.9*z+.12;
  vec3 transmit=exp(-uAbsorb*thickness*(.65+uScatter*1.1));
  vec3 cloudy=mix(image*uTint*1.42,lightThrough*uTint*1.45,.28+uScatter*.36);
  cloudy*=transmit+.15;
  float backlit=pow(max(0.,1.-dot(N,L)),2.)*(.16+.32*uScatter);
  vec3 outc=cloudy*(.52+.52*shad)+uTint*backlit*(.4+lum);
  float crystal=pow(max(0.,sin(q.x*28.+facet*9.)*sin(q.y*28.-facet*7.)),6.);
  outc+=uTint*crystal*.035*(.4+.6*lum);
  vec3 H=normalize(L+vec3(0,0,1));
  float spec=pow(max(0.,dot(N,H)),mix(17.,115.,1.-uScatter))*.62;
  float edge=pow(1.-z,3.5);
  outc+=vec3(.75,.94,1.)*spec + mix(uTint,vec3(.55,.89,1.),.54)*edge*.28;
  float silhouette=smoothstep(.025,.38,lum);
  outc+=uTint*silhouette*(.04+.07*(1.-z));
  // Fragments replace much of the solid orb in shatter mode.
  if(uMode==3)outc*=1.-uExplosion*.93;
  outc+=vec3(.14,.22,.25)*pow(max(.0,noise(q*90.+t*.015)-.58),4.)*.3;
  col=mix(col,outc,inside);
 }
 // Fine circular optical-guide lines stay outside the sculpture.
 float ring=(1.-smoothstep(.002,.009,abs(rad-1.09)))*.06;
 col+=uTint*ring;
 col=pow(max(col,0.),vec3(.87));
 frag=vec4(clamp(col,0.,1.),1.);
}`;
const palette={ice:{tint:[.63,.91,1],absorb:[.10,.05,.035]},amber:{tint:[1,.70,.34],absorb:[.055,.19,.48]},jade:{tint:[.43,.96,.72],absorb:[.22,.035,.27]},opal:{tint:[.91,.61,1],absorb:[.12,.15,.045]},skin:{tint:[1,.75,.65],absorb:[.095,.32,.45]}};
function compile(gl,type,src){let s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
export class OpticalView {
 constructor(canvas,n=96){
  this.canvas=canvas;this.n=n;
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  if(!gl)throw new Error('WebGL2 unavailable');this.gl=gl;
  const pr=gl.createProgram();gl.attachShader(pr,compile(gl,gl.VERTEX_SHADER,VS));gl.attachShader(pr,compile(gl,gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);
  if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(pr));this.program=pr;gl.useProgram(pr);
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(gl.getAttribLocation(pr,'aPosition'));gl.vertexAttribPointer(gl.getAttribLocation(pr,'aPosition'),2,gl.FLOAT,false,0,0);
  this.uniforms={};for(const k of ['uResolution','uLight','uTilt','uTime','uScatter','uPeel','uDepth','uExplosion','uDetail','uMode','uTint','uAbsorb'])this.uniforms[k]=gl.getUniformLocation(pr,k);
  this.textures=[];
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  for(const [i,k] of ['uSource','uRecon','uLow','uMiddle'].entries()){
   const tex=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,tex);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,n,n,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(n*n*4));
   gl.uniform1i(gl.getUniformLocation(pr,k),i);this.textures.push(tex);
  }
  this.setPalette('ice');
 }
 setPalette(key){this.colors=palette[key]||palette.ice;}
 update(index,pixels){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,this.textures[index]);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,this.n,this.n,gl.RGBA,gl.UNSIGNED_BYTE,pixels);}
 draw(s){
  const gl=this.gl,c=this.canvas,dpr=Math.min(2,window.devicePixelRatio||1),r=c.getBoundingClientRect();
  const w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;gl.viewport(0,0,w,h);}
  const u=this.uniforms;
  gl.useProgram(this.program);
  gl.uniform2f(u.uResolution,w,h);gl.uniform2f(u.uLight,s.light[0],s.light[1]);gl.uniform2f(u.uTilt,s.tilt[0],s.tilt[1]);
  gl.uniform1f(u.uTime,s.time);gl.uniform1f(u.uScatter,s.scatter);gl.uniform1f(u.uPeel,s.peel);gl.uniform1f(u.uDepth,s.depth);
  gl.uniform1f(u.uExplosion,s.explosion);gl.uniform1f(u.uDetail,s.detail);gl.uniform1i(u.uMode,s.mode);
  gl.uniform3fv(u.uTint,this.colors.tint);gl.uniform3fv(u.uAbsorb,this.colors.absorb);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
 }
}

