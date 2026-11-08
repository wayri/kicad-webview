
import test from 'node:test';import assert from 'node:assert/strict';
import {boardClipRange,boxNearDepth} from '../engine/spike/renderQuality.mjs';
// Standard perspective projection to a 24-bit fixed depth buffer. Test actual
// separation in quantized depth, rather than locking the implementation formula.
const depth=(z,n,f)=>Math.round((f/(f-n)-f*n/((f-n)*z))*(2**24-1));
test('thin copper layers remain distinct across normal board-fit and inspection distances',()=>{
 for(const [d,r]of [[100,180],[500,180],[1000,180],[2500,400],[40,180],[10,180]]){
  const closest=boxNearDepth([0,0,d],[0,0,-1],[-r,-r,-1],[r,r,1]);
  const {near,far}=boardClipRange(d,r,closest);
  for(const z of [d,d+r*.5])assert.ok(Math.abs(depth(z,near,far)-depth(z+.005,near,far))>=2,'5 µm surface separation survives 24-bit projection at '+z+' mm');
  assert.ok(near>0&&near<d&&far>d+r);assert.ok(near<closest);
 }
 const old={near:.1,far:1720};assert.equal(depth(1000,old.near,old.far),depth(1000.005,old.near,old.far),'reference reproduces the old depth collision');
});
test('enclosing radius tolerates target displacement without clipping board geometry',()=>{
 // A focused/panned target is 250 mm from the fitted board center. Triangle
 // inequality expands the enclosing radius, preserving the nearest geometry.
 const distance=800,radius=180+250,{near,far}=boardClipRange(distance,radius);
 assert.ok(near<distance-radius);assert.ok(far>distance+radius);
 for(const [d,r]of [[.01,180],[1,1],[0,0],[NaN,Infinity]]){const range=boardClipRange(d,r);assert.ok(Number.isFinite(range.near)&&range.near>0&&range.far>range.near);}
});

test('near-corner bounds and sphere fallback never use an unsafe percentage floor',()=>{
 const corner=boardClipRange(181,180);assert.ok(corner.near<1);
 const closest=boxNearDepth([101,0,0],[-1,0,0],[-100,-100,-1],[100,100,1]);assert.equal(closest,1);assert.ok(boardClipRange(181,180,closest).near<closest);
 const top=boxNearDepth([0,0,200],[0,0,-1],[-180,-180,-1],[180,180,1]);assert.equal(top,199);assert.ok(boardClipRange(200,255,top).near>90);
});

test('logarithmic depth preserves 5 micrometre copper at oblique close-up fallback clipping',()=>{
 const {near,far}=boardClipRange(100,180,-20);assert.equal(near,.005);
 const log=z=>Math.round(Math.log2(1+z)/Math.log2(1+far)*(2**24-1));
 assert.ok(Math.abs(depth(100,near,far)-depth(100.005,near,far))<2,'ordinary depth reproduces oblique precision collapse');
 for(const z of [.01,.1,1,10,100,250,500])assert.ok(Math.abs(log(z)-log(z+.005))>=10,'log depth preserves copper spacing at '+z+' mm');
});
test('occlusion keeps its independent normal prepass in perspective depth under logarithmic scene rendering',async()=>{
 const {createRequire}=await import('node:module'),path=await import('node:path'),require=createRequire(import.meta.url);
 const THREE=process.env.KICAD_WEB_BUILD_DEPS?require(path.join(process.env.KICAD_WEB_BUILD_DEPS,'three')):require('three');
 const {configureOcclusionDepth}=await import('../engine/spike/renderQuality.mjs');
 const material=new THREE.MeshNormalMaterial(),shader={vertexShader:THREE.ShaderLib.normal.vertexShader,fragmentShader:THREE.ShaderLib.normal.fragmentShader};configureOcclusionDepth(material);material.onBeforeCompile(shader,{});
 assert.ok(!shader.fragmentShader.includes('#include <logdepthbuf_fragment>'));assert.equal(shader.vertexShader,THREE.ShaderLib.normal.vertexShader);assert.ok(THREE.ShaderLib.normal.fragmentShader.includes('#include <logdepthbuf_fragment>'),'global Three shader stays untouched');assert.match(material.customProgramCacheKey(),/perspective-occlusion-depth-v1/);assert.throws(()=>material.onBeforeCompile({fragmentShader:'unsupported'},{}),/Unsupported/);material.dispose();
});
