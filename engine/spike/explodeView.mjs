/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Reversible display offsets. Source geometry and saved selection identities stay intact. */
import {expansionPhases} from './expansionMotion.mjs';
export function createExplodeView(THREE,plan,{maxGap=4,componentLift=8}={}){
 const layers=[...(plan.layers||[])].filter(l=>typeof l.name==='string'&&Number.isFinite(l.z)).sort((a,b)=>b.z-a.z).slice(0,64),ranks=new Map(layers.map((l,i)=>[l.name,(layers.length-1)/2-i]));
 const positions=new WeakMap(),matrices=new WeakMap();let amount=0;
 const offset=layer=>{const fraction=expansionPhases(amount).layers;return fraction===0?0:(ranks.get(layer)||0)*maxGap*fraction;};
 const componentOffset=layer=>offset(layer)+(layer==='B.Cu'?-1:1)*componentLift*expansionPhases(amount).components;
 const nearest=z=>layers.reduce((best,l)=>!best||Math.abs(l.z-z)<Math.abs(best.z-z)?l:best,null)?.name;
 function layer(object,name){if(!positions.has(object))positions.set(object,object.position.z);object.position.z=positions.get(object)+offset(name);object.updateMatrix?.();}
 function component(object,name){if(!positions.has(object))positions.set(object,object.position.z);object.position.z=positions.get(object)+componentOffset(name);object.updateMatrix?.();}
 function barrels(mesh,span){
  if(!mesh?.isInstancedMesh||!span||!(span.zMax>span.zMin))return;
  if(!matrices.has(mesh))matrices.set(mesh,mesh.instanceMatrix.array.slice());const original=matrices.get(mesh),low=offset(nearest(span.zMin)),high=offset(nearest(span.zMax)),scale=(span.zMax-span.zMin+high-low)/(span.zMax-span.zMin),matrix=new THREE.Matrix4(),stretch=new THREE.Vector3(1,1,scale);
  for(let i=0;i<mesh.count;i++){matrix.fromArray(original,i*16);matrix.elements[14]+=low;matrix.scale(stretch);mesh.setMatrixAt(i,matrix);}
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere?.();mesh.computeBoundingBox?.();
 }
 function overlay(group){group.traverse(object=>{if(!object.geometry)return;if(object.userData.explodeSpan)barrels(object,object.userData.explodeSpan);else layer(object,object.userData.layer||object.userData.record?.layer);});}
 return{offset,componentOffset,component,layer,barrels,overlay,set(value){amount=expansionPhases(value).amount;return amount;},get:()=>amount,phases:()=>expansionPhases(amount),span:()=>maxGap*expansionPhases(amount).layers*Math.max(0,layers.length-1),layers:layers.map(l=>l.name)};
}

/** Hide the entire registered result, including probes, without changing ownership or data. */
export function createExplodeOverlayGuard(){
 const visibility=new WeakMap();
 return {sync(overlay,amount){const group=overlay?.group;if(!group)return false;
  if(amount>0){if(!visibility.has(group))visibility.set(group,group.visible);group.visible=false;return true;}
  if(visibility.has(group)){group.visible=visibility.get(group);visibility.delete(group);}return false;
 }};
}
