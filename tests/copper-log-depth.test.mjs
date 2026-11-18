/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import path from 'node:path';
import {configureCopperDepth,copperCapMaterials} from '../engine/spike/copperDepth.mjs';
import {createSelectionAppearance} from '../engine/spike/selectionAppearance.mjs';
import {createTranslucentAppearance} from '../engine/spike/translucentAppearance.mjs';
const require=createRequire(import.meta.url),THREE=process.env.KICAD_WEB_BUILD_DEPS?require(path.join(process.env.KICAD_WEB_BUILD_DEPS,'three')):require('three');
function bias(material){const shader={vertexShader:'#include <common>\n#include <color_vertex>\n#include <begin_vertex>',fragmentShader:'#include <logdepthbuf_fragment>\n#include <opaque_fragment>'};material.onBeforeCompile(shader,{});const match=shader.fragmentShader.match(/\+ ([\deE+.\-]+), 0.0/);return match?Number(match[1]):0;}
test('coplanar copper precedence survives fragment-written depth at grazing angles',()=>{
 const materials=['zone','track','pad','via'].map(role=>configureCopperDepth(new THREE.MeshStandardMaterial(),role,'cap'));
 try{const offsets=materials.map(bias);for(let i=1;i<offsets.length;i++)assert.ok(offsets[i]<offsets[i-1]-1/16777215);for(const slope of [0,.001,.5,100]){const coplanar=.5+slope*.001;assert.ok(coplanar+offsets[3]<coplanar+offsets[2]);}assert.equal(THREE.ShaderChunk.logdepthbuf_fragment.includes('gl_FragDepth ='),true);}
 finally{materials.forEach(m=>m.dispose());}
});
test('pad walls keep physical depth and selection/translucency preserve cap shader ordering',()=>{
 const materials=copperCapMaterials(THREE,'pad',{color:0xffffff}),mesh=new THREE.Mesh(new THREE.BoxGeometry(),materials),expected=bias(materials[0]);assert.ok(expected<0);assert.equal(bias(materials[1]),0);
 const selection=createSelectionAppearance(THREE,()=>[mesh]);mesh.userData.record={net:'A'};selection.update(()=>true,true,()=>true,{mode:'bright',color:'accent'});assert.equal(bias(mesh.material[0]),expected);selection.restore();
 const translucent=createTranslucentAppearance();translucent.add(mesh,'component');translucent.setEnabled(true);assert.equal(bias(mesh.material[0]),expected);assert.equal(bias(mesh.material[1]),0);translucent.setEnabled(false);assert.equal(mesh.material,materials);translucent.dispose();selection.dispose();mesh.geometry.dispose();materials.forEach(m=>m.dispose());
});

test('logarithmic and perspective depth each apply only their matching offset policy',()=>{
 const material=configureCopperDepth(new THREE.MeshStandardMaterial(),'pad','cap');const shader=()=>({fragmentShader:'#include <logdepthbuf_fragment>'});material.onBeforeCompile(shader(),{capabilities:{logarithmicDepthBuffer:true}});assert.equal(material.polygonOffset,false);material.onBeforeCompile(shader(),{capabilities:{logarithmicDepthBuffer:false}});assert.equal(material.polygonOffset,true);material.dispose();
});

