/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Optional presentation dressing. Never enters board fit, identity or picking. */
export function createPresentationStudio(THREE,{scene,renderer,extent,bottom,constrained=false}){
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(extent*6,extent*6),new THREE.MeshStandardMaterial({color:0x222832,roughness:.88,metalness:0}));
 floor.name='Presentation stage';floor.position.z=bottom-Math.max(3,extent*.035);floor.receiveShadow=true;floor.visible=false;scene.add(floor);
 const casters=new Map();
 const lights=[];scene.traverse(object=>{if(object.isDirectionalLight&&object.castShadow)lights.push(object);});
 function apply(enabled){
  for(const [mesh,original]of casters)mesh.castShadow=enabled||original;
  floor.visible=enabled;scene.environmentIntensity=enabled?1:.65;renderer.toneMappingExposure=enabled?1.05:1;
  const size=enabled&&!constrained?2048:1024;
  for(const light of lights)if(light.shadow.mapSize.x!==size){light.shadow.map?.dispose();light.shadow.map=null;light.shadow.mapSize.set(size,size);light.shadow.needsUpdate=true;}
  renderer.shadowMap.needsUpdate=true;
 }
 return{apply,addCaster(mesh){casters.set(mesh,mesh.castShadow);mesh.castShadow=floor.visible||mesh.castShadow;},get enabled(){return floor.visible;},dispose(){for(const [mesh,original]of casters)mesh.castShadow=original;casters.clear();scene.remove(floor);floor.geometry.dispose();floor.material.dispose();}};
}
