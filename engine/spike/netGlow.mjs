/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Source-bound x-ray copper overlay. Own buffers/materials; never owns source geometry. */
export function createNetGlow(THREE,{scene,objects,visible=()=>true,colorForLayer=()=>0x72f5ff,maxInstances=50000,maxMeshes=2048}){
 const group=new THREE.Group();group.name='Selected net shine-through';scene.add(group);
 const entries=new Map(),materials=new Map(),matrix=new THREE.Matrix4();let key='',instances=0,edgeVertices=0,limited=false;
 function material(layer,zone=false,edge=false,color='accent',via=false){
  const id=[layer,zone,edge,color,via].join('|');if(materials.has(id))return materials.get(id);
  const common={color:via||layer==='through'?0xc5aa6c:color==='source'?colorForLayer(layer):0x72f5ff,transparent:true,opacity:zone ? .14 : .95,depthTest:false,depthWrite:false,toneMapped:false};
  const value=edge?new THREE.LineBasicMaterial(common):new THREE.MeshBasicMaterial({...common,side:THREE.DoubleSide});materials.set(id,value);return value;
 }
 function clear(){for(const entry of entries.values()){group.remove(entry.mesh);entry.mesh.dispose?.();if(entry.edge){group.remove(entry.edge);entry.edge.geometry.dispose();}}entries.clear();for(const m of materials.values())m.dispose();materials.clear();instances=0;edgeVertices=0;limited=false;key='';}
 function update(names,{color='accent'}={}){
  const next=JSON.stringify([[...names].sort(),color]);if(!names.size){if(entries.size)clear();return;}
  if(next!==key){clear();key=next;}
  for(const entry of entries.values()){entry.mesh.visible=false;if(entry.edge)entry.edge.visible=false;}
  for(const source of objects()){
   if(source.userData?.record?.type==='Component')continue;
   const identity=source.userData?.identity||'',zone=source.userData?.record?.type==='Zone',via=identity.startsWith('spike:via-barrel:');
   if(!source.geometry?.attributes?.position||!zone&&!/^spike:(copper-track|copper-pad|via-barrel):/.test(identity))continue;
   const layer=zone?source.userData.record.layer:decodeURIComponent(identity.split(':')[2]||'');
   if(!visible(source,layer))continue;
   let entry=entries.get(source);
   if(!entry){
    if(entries.size>=maxMeshes){limited=true;continue;}
    const records=source.userData.records;
    const indices=[];const remaining=Math.max(0,maxInstances-instances);
    if(source.isInstancedMesh&&records){for(let i=0;i<Math.min(records.length,source.count);i++)if(names.has(records[i].net)){if(indices.length>=remaining){limited=true;break;}indices.push(i);}}
    else if(names.has(source.userData.record?.net))indices.push(null);
    if(!indices.length)continue;const available=Math.max(0,maxInstances-instances);if(indices.length>available){indices.length=available;limited=true;}if(!indices.length)continue;
    const mesh=source.isInstancedMesh?new THREE.InstancedMesh(source.geometry,material(layer,false,false,color,via),indices.length):new THREE.Mesh(source.geometry,material(layer,zone,false,color,via));
    mesh.matrixAutoUpdate=false;mesh.renderOrder=201;mesh.frustumCulled=false;group.add(mesh);entry={mesh,indices,edge:null};
    if(zone){if(source.geometry.attributes.position.count*6+edgeVertices<=200000){const edge=new THREE.LineSegments(new THREE.EdgesGeometry(source.geometry,1),material(layer,false,true,color));edgeVertices+=edge.geometry.attributes.position.count;edge.matrixAutoUpdate=false;edge.renderOrder=202;edge.frustumCulled=false;group.add(edge);entry.edge=edge;}else limited=true;}
    entries.set(source,entry);instances+=indices.length;
   }
   source.updateWorldMatrix(true,false);entry.mesh.matrix.copy(source.matrixWorld);entry.mesh.matrixWorldNeedsUpdate=true;entry.mesh.visible=true;
   if(source.isInstancedMesh){entry.indices.forEach((index,n)=>{source.getMatrixAt(index,matrix);entry.mesh.setMatrixAt(n,matrix);});entry.mesh.instanceMatrix.needsUpdate=true;}
   if(entry.edge){entry.edge.matrix.copy(source.matrixWorld);entry.edge.matrixWorldNeedsUpdate=true;entry.edge.visible=true;}
  }
 }
 return{update,clear,stats:()=>{let visibleMeshes=0,visibleInstances=0;for(const entry of entries.values())if(entry.mesh.visible){visibleMeshes++;visibleInstances+=entry.indices.length;}return{meshes:visibleMeshes,instances:visibleInstances,retainedMeshes:entries.size,limited,throughBoard:true};},dispose(){clear();scene.remove(group);}};
}
