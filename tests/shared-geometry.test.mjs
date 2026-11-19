import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import path from 'node:path';
import {createSharedGeometryCache} from '../engine/spike/sharedGeometry.mjs';import {createSceneResources} from '../engine/spike/sceneResources.mjs';
const require=createRequire(import.meta.url),THREE=process.env.KICAD_WEB_BUILD_DEPS?require(path.join(process.env.KICAD_WEB_BUILD_DEPS,'three')):require('three');
test('32 layers share identical annulus buffers while transforms and resource disposal remain independent',()=>{
 const cache=createSharedGeometryCache(),resources=createSceneResources(),scene=new THREE.Group();let allocations=0,disposed=0;
 for(let layer=0;layer<32;layer++)for(let shape=0;shape<8;shape++){
  const geometry=cache.get(JSON.stringify([shape,.035]),()=>{allocations++;const contour=new THREE.Shape();contour.absarc(0,0,1+shape/10,0,Math.PI*2,false);const hole=new THREE.Path();hole.absarc(0,0,.4+shape/100,0,Math.PI*2,true);contour.holes.push(hole);const g=new THREE.ExtrudeGeometry(contour,{depth:.035,bevelEnabled:false,curveSegments:16});g.addEventListener('dispose',()=>disposed++);return g;});
  const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial(),2);mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(2,3,layer*.2));mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(5,6,layer*.2));scene.add(mesh);
 }
 assert.equal(allocations,8);assert.equal(new Set(scene.children.map(m=>m.geometry)).size,8);assert.deepEqual(cache.stats(),{entries:8,hits:248,uncached:0});
 const first=new THREE.Matrix4(),last=new THREE.Matrix4();scene.children[0].getMatrixAt(0,first);scene.children.at(-1).getMatrixAt(0,last);assert.notEqual(first.elements[14],last.elements[14]);
 resources.retain(scene);const bytes=resources.stats().retainedGeometryBytes;assert.ok(bytes>0);resources.dispose();assert.equal(disposed,8);cache.clear();assert.equal(cache.stats().entries,0);
});
test('different saved drill contours and copper thickness never share; cache ceiling changes reuse only',()=>{
 const cache=createSharedGeometryCache(2),a=cache.get('[1,0.4,0.035]',()=>({id:1})),b=cache.get('[1,0.6,0.035]',()=>({id:2})),c=cache.get('[1,0.4,0.07]',()=>({id:3}));assert.notEqual(a,b);assert.notEqual(a,c);assert.equal(cache.get('[1,0.4,0.035]',()=>assert.fail()),a);assert.notEqual(cache.get('[1,0.4,0.07]',()=>({id:4})),c);assert.equal(cache.stats().entries,2);assert.equal(cache.stats().uncached,2);
});
