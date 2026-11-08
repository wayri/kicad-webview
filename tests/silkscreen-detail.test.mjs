import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import path from 'node:path';
import {silkscreenViewBounds,silkscreenDetailPlan,createSilkscreenDetail} from '../engine/spike/silkscreenDetail.mjs';
const require=createRequire(import.meta.url),THREE=process.env.KICAD_WEB_BUILD_DEPS?require(path.join(process.env.KICAD_WEB_BUILD_DEPS,'three')):require('three');
const bounds={minX:0,minY:0,maxX:250,maxY:240};
function camera(position=[0,0,20],target=[0,0,0],up=[0,1,0]){const c=new THREE.PerspectiveCamera(45,1.5,.01,2000);c.position.fromArray(position);c.up.fromArray(up);c.lookAt(new THREE.Vector3(...target));c.updateMatrixWorld();return c;}
test('visible silk crop resolves a close view on either face in saved board coordinates',()=>{
 for(const z of [20,-20]){const c=camera([10,-15,z],[10,-15,0]);const crop=silkscreenViewBounds(THREE,c,0,bounds,125,120);assert.ok(crop.maxX-crop.minX<40);assert.ok(crop.maxY-crop.minY<30);assert.ok(Math.abs((crop.minX+crop.maxX)/2-135)<1e-6);assert.ok(Math.abs((crop.minY+crop.maxY)/2-135)<1e-6);}
 assert.equal(silkscreenViewBounds(THREE,camera([1000,0,20],[1000,0,0]),0,bounds,125,120),null);
 assert.equal(silkscreenViewBounds(THREE,camera([0,0,20],[0,0,40]),0,bounds,125,120),null);
});
test('oblique and horizon crops stay bounded and include visible board landmarks',()=>{
 for(const pose of [[0,-100,3],[30,-20,15],[0,0,-500]]){const c=camera(pose,[0,0,0],[0,0,1]);const crop=silkscreenViewBounds(THREE,c,0,bounds,125,120);assert.ok(crop);assert.ok(crop.minX>=0&&crop.maxX<=250&&crop.minY>=0&&crop.maxY<=240);assert.ok(crop.minX<=125&&crop.maxX>=125&&crop.minY<=120&&crop.maxY>=120);}
});
test('close-up text gains resolution while phone and large-board allocations remain bounded',()=>{
 const wide=silkscreenDetailPlan(255,236),close=silkscreenDetailPlan(20,10);assert.ok(close.scale>=90);assert.ok(close.scale>wide.scale*8);
 for(const constrained of [true,false])for(const [w,h] of [[255,236],[20,10],[.1,.1],[1,10000],[10000,1]])for(const dimension of [512,4096,16384]){const p=silkscreenDetailPlan(w,h,dimension,constrained);assert.ok(p.pixels<=p.maxPixels&&p.width<=Math.min(constrained?2048:4096,dimension)&&p.height<=Math.min(constrained?2048:4096,dimension));}
 assert.equal(silkscreenDetailPlan(0,1),null);
});
test('detail refresh replaces the coarse map after settling, reuses textures and cancels on disposal',()=>{
 let pending=null,invalidations=0,clears=0,paints=0;const ctx=new Proxy({},{get:(o,key)=>o[key]||(()=>{if(key==='clearRect')paints++;}),set:(o,key,v)=>(o[key]=v,true)}),canvases=[],doc={hidden:false,createElement(){const canvas={width:0,height:0,getContext:()=>ctx};canvases.push(canvas);return canvas;}},tracked=[];
 const c=camera(),group=new THREE.Group(),base=new THREE.Texture(),mesh=new THREE.Mesh(new THREE.PlaneGeometry(250,240),new THREE.MeshBasicMaterial({map:base}));group.add(mesh);mesh.position.z=.055;
 const detail=createSilkscreenDetail(THREE,{camera:c,document:doc,bounds,centerX:125,centerY:120,graphics:{maxDimension:4096,constrained:false},resources:{track(t){tracked.push(t);return t;}},invalidate(){invalidations++;},setTimer(fn){pending=fn;return 1;},clearTimer(){pending=null;clears++;}});
 detail.add(mesh,[{type:'text',text:'R42',x:125,y:120,size:1}],[],true);detail.sync();for(let i=0;i<10;i++){c.position.x+=.001;c.updateMatrixWorld();detail.sync();}assert.equal(clears,0,'continuous movement must not postpone the pending detail refresh');assert.equal(paints,0);const originalMaterial=mesh.material;mesh.material=originalMaterial.clone();pending();const texture=mesh.material.map;assert.notEqual(texture,base);mesh.material=originalMaterial;detail.sync();assert.equal(mesh.material.map,texture,'clearing selection repairs a restored coarse material on the cropped plane');assert.ok(mesh.scale.x<.2);assert.equal(tracked.length,1);assert.equal(invalidations,1);c.position.x+=1e-7;c.updateMatrixWorld();pending=null;detail.sync();assert.equal(pending,null,'subpixel damping residue must not restart the coarse/detail loop');assert.equal(mesh.material.map,texture);
 c.position.x=3;c.updateMatrixWorld();detail.sync();assert.equal(mesh.material.map,texture,'guarded detail remains sharp during small camera motion');assert.equal(pending,null);const staleDetailMaterial=mesh.material.clone();c.position.x=50;c.updateMatrixWorld();detail.sync();assert.equal(mesh.material.map,base);assert.equal(mesh.scale.x,1);mesh.material=staleDetailMaterial;detail.sync();assert.equal(mesh.material.map,base,'restored stale detail must not paint a whole-board plane');pending();assert.equal(mesh.material.map,texture);assert.equal(tracked.length,1);pending=null;const dimensions=[canvases[0].width,canvases[0].height];c.aspect=.6;c.updateProjectionMatrix();detail.sync();pending();assert.deepEqual([canvases[0].width,canvases[0].height],dimensions,'GPU upload dimensions stay fixed when crop aspect changes');assert.ok(texture.repeat.x<=1&&texture.repeat.y<=1&&texture.offset.y>=0);
 c.position.x=80;c.updateMatrixWorld();detail.sync();doc.hidden=true;pending();doc.hidden=false;pending=null;detail.sync();assert.equal(typeof pending,'function','visible scene retries a refresh skipped while hidden');detail.dispose();assert.equal(pending,null);assert.equal(mesh.material.map,base);assert.equal(canvases[0].width,1);assert.ok(clears>0);detail.sync();detail.dispose();
});

test('extreme close-up text uses the available texture resolution instead of a fixed pixels-per-mm ceiling',()=>{
 const close=silkscreenDetailPlan(1,.5,4096,false);assert.equal(close.width,2048);assert.equal(close.height,1024);assert.ok(close.scale>=2048);assert.ok(close.pixels<=close.maxPixels);
});
