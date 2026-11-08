/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/* Scripted demo overlays on actual planar component mesh faces. Native geometry is never edited. */
const MAX_TRIANGLES=50000,MAX_SURFACES=64,MAX_PIXELS=4*1024*1024,MAX_PATCH_TRIANGLES=100000;
const body=record=>record&&(record.type==='Component'||typeof record.library==='string');
const visible=object=>{for(let node=object;node;node=node.parent)if(!node.visible)return false;return true;};
const text=(value,label)=>{if(typeof value!=='string'||!value||value.length>128||/[\x00-\x1f\x7f]/.test(value))throw new TypeError('Choose a bounded '+label+'.');return value;};
const direction={top:[0,0,1],bottom:[0,0,-1],front:[0,-1,0],back:[0,1,0],left:[-1,0,0],right:[1,0,0]};

/** Connected coplanar mesh triangles, retaining concave boundaries and holes through UV projection. */
export function planarFacePatch(THREE,geometry,faceIndex){
 const position=geometry?.getAttribute?.('position'),index=geometry?.index;
 if(!position||position.itemSize<3||geometry.morphAttributes?.position?.length)throw new Error('Demo faces require a static triangle mesh.');
 const count=Math.floor((index?index.count:position.count)/3);
 if(!count||count>MAX_TRIANGLES)throw new Error('Selected mesh exceeds the 50,000-triangle face-selection budget.');
 const begin=Math.ceil((geometry.drawRange?.start||0)/3),end=Math.min(count,Math.floor(((geometry.drawRange?.start||0)+(Number.isFinite(geometry.drawRange?.count)?geometry.drawRange.count:count*3))/3));
 if(!Number.isInteger(faceIndex)||faceIndex<begin||faceIndex>=end)throw new Error('Choose a visible triangle face.');
 const at=i=>new THREE.Vector3().fromBufferAttribute(position,index?index.getX(i):i);
 const first=[at(faceIndex*3),at(faceIndex*3+1),at(faceIndex*3+2)];
 const normal=new THREE.Vector3().subVectors(first[1],first[0]).cross(new THREE.Vector3().subVectors(first[2],first[0]));
 if(normal.lengthSq()<1e-20)throw new Error('The selected triangle has no usable planar area.');normal.normalize();
 geometry.computeBoundingBox();const diagonal=geometry.boundingBox.getSize(new THREE.Vector3()).length(),epsilon=Math.max(1e-7,diagonal*1e-7),plane=normal.dot(first[0]);
 const groups=geometry.groups||[];if(groups.length>256)throw new Error('Selected mesh exceeds the 256 material-group face budget.');
 const materials=new Int32Array(count);materials.fill(-1);for(const group of groups){if(!Number.isInteger(group.start)||!Number.isInteger(group.count)||group.start<0||group.count<0||group.start%3||group.count%3||!Number.isInteger(group.materialIndex)||group.materialIndex<0||group.materialIndex>1000000)throw new Error('Unsupported triangle material groups.');for(let face=group.start/3;face<Math.min(count,(group.start+group.count)/3);face++){if(materials[face]!==-1)throw new Error('Overlapping material groups make the selected face ambiguous.');materials[face]=group.materialIndex;}}
 const materialIndex=face=>materials[face],selectedMaterial=materialIndex(faceIndex);if(groups.length&&selectedMaterial===-1)throw new Error('The selected face has no supported material group.');
 const pointKey=p=>[p.x,p.y,p.z].map(n=>Math.round(n/epsilon)).join(',');
 const edgeKey=(a,b)=>a<b?a+'|'+b:b+'|'+a;
 const faces=new Map(),edges=new Map(),a=new THREE.Vector3(),b=new THREE.Vector3();
 for(let face=begin;face<end;face++){
  if(materialIndex(face)!==selectedMaterial)continue;const points=[at(face*3),at(face*3+1),at(face*3+2)];
  if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.z)||Math.abs(normal.dot(p)-plane)>epsilon))continue;
  const n=a.subVectors(points[1],points[0]).cross(b.subVectors(points[2],points[0]));if(n.lengthSq()<1e-20||n.normalize().dot(normal)<.99999)continue;
  const keys=points.map(pointKey),own=[edgeKey(keys[0],keys[1]),edgeKey(keys[1],keys[2]),edgeKey(keys[2],keys[0])];faces.set(face,{points,edges:own});
  for(const key of own){const list=edges.get(key)||[];list.push(face);edges.set(key,list);}
 }
 const queue=[faceIndex],queued=new Set(queue),selected=new Set(),visitedEdges=new Set();
 for(let i=0;i<queue.length;i++){const face=queue[i];const entry=faces.get(face);if(!entry)continue;selected.add(face);for(const key of entry.edges){if(visitedEdges.has(key))continue;visitedEdges.add(key);for(const neighbor of edges.get(key)||[])if(!queued.has(neighbor)){queued.add(neighbor);queue.push(neighbor);}}}
 if(!selected.size)throw new Error('No connected planar face was found.');
 const u=new THREE.Vector3(Math.abs(normal.x)<.9?1:0,Math.abs(normal.x)<.9?0:1,0);u.addScaledVector(normal,-u.dot(normal)).normalize();const v=new THREE.Vector3().crossVectors(normal,u).normalize();
 let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity,area=0;const points=[];
 for(const face of selected){const triangle=faces.get(face).points;area+=new THREE.Vector3().subVectors(triangle[1],triangle[0]).cross(new THREE.Vector3().subVectors(triangle[2],triangle[0])).length()/2;for(const p of triangle){const x=p.dot(u),y=p.dot(v);minU=Math.min(minU,x);maxU=Math.max(maxU,x);minV=Math.min(minV,y);maxV=Math.max(maxV,y);points.push(p);}}
 const width=maxU-minU,height=maxV-minV;if(!(width>epsilon&&height>epsilon&&area>epsilon*epsilon))throw new Error('The selected face is too small for a display.');
 const positions=new Float32Array(points.length*3),uvs=new Float32Array(points.length*2);
 points.forEach((p,i)=>{positions.set([p.x,p.y,p.z],i*3);uvs.set([(p.dot(u)-minU)/width,(p.dot(v)-minV)/height],i*2);});
 const center=normal.clone().multiplyScalar(plane).addScaledVector(u,(minU+maxU)/2).addScaledVector(v,(minV+maxV)/2);
 return {positions,uvs,normal,u,v,center,width,height,area,triangles:selected.size,faceIndex:Math.min(...selected),faceIndices:[...selected]};
}

/** Owns only demo meshes, canvases and handlers; callers retain all native source resources. */
export function createDemoSurfaces(THREE,{scene,objects,document:doc=globalThis.document,invalidate=()=>{},onError=()=>{}}){
 if(!scene?.add||typeof objects!=='function'||!doc?.createElement)throw new TypeError('Choose a 3D scene, saved component meshes and document.');
 const group=new THREE.Group();group.name='Scripted demo surfaces';scene.add(group);
 const scope='demo-face-'+Math.random().toString(36).slice(2)+'-',faces=new Map(),surfaces=new Map();let sequence=0,closed=false,inputHandler=null,gesture=null,totalPixels=0,totalTriangles=0;
 const assertActive=()=>{if(closed)throw new Error('Demo surfaces have been disposed.');};
 function sourceMatrix(object,instanceId){
  object.updateWorldMatrix(true,false);const matrix=object.matrixWorld.clone();
  if(object.isInstancedMesh){if(!Number.isInteger(instanceId)||instanceId<0||instanceId>=object.count)return null;const local=new THREE.Matrix4();object.getMatrixAt(instanceId,local);if(Math.abs(local.determinant())<1e-15)return null;matrix.multiply(local);}
  return Math.abs(matrix.determinant())<1e-15?null:matrix;
 }
 function sourceRecord(object,instanceId){return object?.isInstancedMesh?object.userData.records?.[instanceId]:object?.userData.record;}
 function candidate(object,instanceId,faceIndex){
  if(!objects().includes(object)||!visible(object)||object.isSkinnedMesh)throw new Error('Choose a visible static component face.');
  const record=sourceRecord(object,instanceId),matrix=sourceMatrix(object,instanceId);if(!body(record)||!matrix)throw new Error('Choose a visible component body, not a pad or board surface.');
  const patch=planarFacePatch(THREE,object.geometry,faceIndex),normal=patch.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize();
  // Actual edge lengths include nonuniform instance scale; directions alone do not.
  const origin=new THREE.Vector3().applyMatrix4(matrix),worldU=patch.u.clone().multiplyScalar(patch.width).applyMatrix4(matrix).sub(origin),worldV=patch.v.clone().multiplyScalar(patch.height).applyMatrix4(matrix).sub(origin);
  return {object,instanceId,record,geometry:object.geometry,patch,normal,width:worldU.length(),height:worldV.length(),key:object.uuid+':'+instanceId+':'+patch.faceIndex};
 }
 function retainFace(value){
  let prepared=[...faces.values()].reduce((sum,entry)=>sum+entry.patch.triangles,0);
  while(faces.size>=128||prepared+value.patch.triangles>MAX_PATCH_TRIANGLES){const removable=[...faces].find(([,entry])=>![...surfaces.values()].some(surface=>surface.face===entry));if(!removable)throw new Error('Selected demo faces exceed the geometry budget.');prepared-=removable[1].patch.triangles;faces.delete(removable[0]);}
  const token=scope+(++sequence);value.token=token;faces.set(token,value);return describeFace(value);
 }
 function describeFace(face){const matrix=sourceMatrix(face.object,face.instanceId);if(!matrix)return null;return Object.freeze({token:face.token,shape:'face',uuid:String(face.record.uuid||face.record.id||''),reference:String(face.record.ref||''),center:face.patch.center.clone().applyMatrix4(matrix).toArray(),normal:face.patch.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize().toArray(),up:face.patch.v.clone().transformDirection(matrix).toArray(),right:face.patch.u.clone().transformDirection(matrix).toArray(),width:face.width,height:face.height,triangles:face.patch.triangles});}
 function selectFace(hit){assertActive();if(!hit||!Number.isInteger(hit.faceIndex))throw new Error('Select a component triangle face.');return retainFace(candidate(hit.object,hit.instanceId,hit.faceIndex));}
 function componentCandidates(anchor){
  if(!anchor||typeof anchor!=='object'||!direction[anchor.face||'top'])throw new TypeError('Choose a saved component and top/bottom/front/back/left/right face.');
  const uuid=anchor.uuid===undefined?null:text(anchor.uuid,'component UUID'),reference=anchor.reference===undefined?null:text(anchor.reference,'component reference');if(!uuid&&!reference)throw new TypeError('A demo face needs a component UUID or unique reference.');
  const candidates=[],identities=new Set();let inspected=0;
  for(const object of objects()){
   const records=object.userData.records||[object.userData.record];
   for(let index=0;index<records.length;index++){
    if(++inspected>200000)throw new Error('Component face lookup exceeds its record budget.');const record=records[index];if(!body(record)||uuid&&uuid!==(record.uuid||record.id)||reference&&reference!==record.ref)continue;
    const instanceId=object.isInstancedMesh?index:undefined;if(!visible(object)||!sourceMatrix(object,instanceId))continue;
    const identity=String(record.uuid||record.id||'')+'|'+String(record.ref||'')+'|'+JSON.stringify(record.at||[]);identities.add(identity);candidates.push({object,instanceId});
   }
  }
  if(identities.size!==1)throw new Error('The component anchor is absent or ambiguous.');
  return candidates;
 }
 function namedFace(anchor){
  const candidates=componentCandidates(anchor),wanted=new THREE.Vector3(...direction[anchor.face||'top']);let best=null,remainingWork=250000;
  for(const item of candidates){const geometry=item.object.geometry,position=geometry?.getAttribute?.('position'),index=geometry?.index;if(!position||item.object.isSkinnedMesh||geometry.morphAttributes?.position?.length)continue;
   const count=Math.floor((index?index.count:position.count)/3);if(count>MAX_TRIANGLES)throw new Error('Selected mesh exceeds the 50,000-triangle face-selection budget.');
   const matrix=sourceMatrix(item.object,item.instanceId),normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix),seen=new Set();
   const begin=Math.ceil((geometry.drawRange?.start||0)/3),end=Math.min(count,Math.floor(((geometry.drawRange?.start||0)+(Number.isFinite(geometry.drawRange?.count)?geometry.drawRange.count:count*3))/3));
   for(let face=begin;face<end;face++){
    if(seen.has(face))continue;const a=new THREE.Vector3().fromBufferAttribute(position,index?index.getX(face*3):face*3),b=new THREE.Vector3().fromBufferAttribute(position,index?index.getX(face*3+1):face*3+1),c=new THREE.Vector3().fromBufferAttribute(position,index?index.getX(face*3+2):face*3+2);
    const normal=b.sub(a).cross(c.sub(a)).normalize().applyMatrix3(normalMatrix).normalize();if(normal.dot(wanted)<.9999)continue;
    if((remainingWork-=count)<0)throw new Error('Automatic face selection exceeds its triangle-work budget. Select an actual face manually.');const value=candidate(item.object,item.instanceId,face);for(const selected of value.patch.faceIndices)seen.add(selected);const world=sourceMatrix(value.object,value.instanceId),origin=new THREE.Vector3().applyMatrix4(world),u=value.patch.u.clone().multiplyScalar(value.patch.width).applyMatrix4(world).sub(origin),v=value.patch.v.clone().multiplyScalar(value.patch.height).applyMatrix4(world).sub(origin);value.worldArea=value.patch.area*u.cross(v).length()/(value.patch.width*value.patch.height);value.depth=value.patch.center.clone().applyMatrix4(world).dot(wanted);if(!best||value.depth>best.depth+1e-5||Math.abs(value.depth-best.depth)<=1e-5&&value.worldArea>best.worldArea)best=value;
   }
  }
  if(!best)throw new Error('This component has no supported planar face in that direction. Select an actual face instead.');return retainFace(best);
 }
 function getFace(options){const descriptor=options.face||options.anchor&&namedFace(options.anchor);const token=typeof descriptor==='string'?descriptor:descriptor?.token;const face=faces.get(token);if(!face)throw new Error('The selected face belongs to another or closed 3D view. Select it again.');if(!objects().includes(face.object)||!visible(face.object)||face.object.geometry!==face.geometry||!sourceMatrix(face.object,face.instanceId))throw new Error('The selected source geometry is no longer available. Select it again.');return face;}
 function emit(entry,type,event,uv,extra={}){if(typeof inputHandler!=='function')return;try{inputHandler({id:entry.id,type,...(type==='change'?{value:entry.value}:{}),...(uv?{uv:{x:uv.x,y:uv.y}}:{}),source:'pointer',originalEvent:event,...extra});}catch(error){inputHandler=null;try{onError(error);}catch{}}}
 function dimensions(options){const width=options.width??(options.kind==='led'?32:128),height=options.height??(options.kind==='led'?32:options.kind==='button'?64:128);if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1024||height>1024)throw new TypeError('Demo canvases need integer dimensions from 1 to 1024.');return {width,height};}
 function paint(entry){
  if(entry.kind==='led'&&!entry.canvas){entry.material.color.set(entry.color).multiplyScalar(entry.on?entry.brightness:.025);return;}
  const context=entry.canvas.getContext('2d');if(!context)throw new Error('Canvas drawing is unavailable.');
  if(entry.kind==='display')return;
  context.clearRect(0,0,entry.canvas.width,entry.canvas.height);
  if(entry.kind==='led'){context.fillStyle=entry.color;context.fillRect(0,0,entry.canvas.width,entry.canvas.height);entry.material.color.setScalar(entry.on?entry.brightness:.025);}
  else{context.fillStyle=entry.pressed?'#77d4df':'#182f3e';context.fillRect(0,0,entry.canvas.width,entry.canvas.height);context.fillStyle=entry.pressed?'#10202c':'#e1eaf3';context.textAlign='center';context.textBaseline='middle';context.font='600 '+Math.max(9,Math.round(entry.canvas.height*.22))+'px system-ui';context.fillText(entry.kind==='knob'?String(entry.value):entry.label,entry.canvas.width/2,entry.canvas.height/2,entry.canvas.width-8);}
  entry.texture.needsUpdate=true;
 }
 function syncEntry(entry){
  if(entry.bindings){let available=false;for(const binding of entry.bindings){const matrix=sourceMatrix(binding.object,binding.instanceId);binding.mesh.visible=objects().includes(binding.object)&&binding.object.geometry===binding.geometry&&visible(binding.object)&&Boolean(matrix);if(binding.mesh.visible){binding.mesh.matrix.copy(matrix);binding.mesh.matrixWorldNeedsUpdate=true;available=true;}}return available;}
  const face=entry.face,matrix=sourceMatrix(face.object,face.instanceId);entry.mesh.visible=objects().includes(face.object)&&face.object.geometry===face.geometry&&visible(face.object)&&Boolean(matrix);
  if(entry.mesh.visible){const normal=face.patch.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize(),offset=Math.max(.00001,Math.min(.006,Math.min(face.width,face.height)*.002));entry.mesh.matrix.copy(matrix);entry.mesh.matrix.elements[12]+=normal.x*offset;entry.mesh.matrix.elements[13]+=normal.y*offset;entry.mesh.matrix.elements[14]+=normal.z*offset;entry.mesh.matrixWorldNeedsUpdate=true;}
  if(!entry.mesh.visible&&gesture?.entry===entry)endGesture('cancel',null);return entry.mesh.visible;
 }
 function remove(entry){if(!surfaces.has(entry.id)||surfaces.get(entry.id)!==entry)return;if(gesture?.entry===entry)endGesture('cancel',null);if(surfaces.get(entry.id)!==entry)return;surfaces.delete(entry.id);totalPixels-=entry.pixels;totalTriangles-=entry.triangles;for(const mesh of entry.meshes||[entry.mesh])mesh.removeFromParent();entry.texture?.dispose();entry.material.dispose();if(!entry.bindings)entry.mesh.geometry.dispose();invalidate();}
 function color(value){if(typeof value!=='string'||value.length>64||!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)&&!Object.hasOwn(THREE.Color.NAMES,value.toLowerCase()))throw new TypeError('Choose a hex or named LED color.');return '#'+new THREE.Color(value).getHexString();}
 function ledState(entry,state={}){const next={on:state.on===undefined?entry.on:Boolean(state.on),color:state.color===undefined?entry.color:color(state.color),brightness:state.brightness===undefined?entry.brightness:state.brightness};if(!Number.isFinite(next.brightness)||next.brightness<0||next.brightness>1)throw new TypeError('Choose LED brightness from 0 to 1.');Object.assign(entry,next);paint(entry);invalidate();}
 function componentDescriptor(entry){const bounds=new THREE.Box3();for(const binding of entry.bindings){const matrix=sourceMatrix(binding.object,binding.instanceId);if(!matrix)continue;if(!binding.geometry.boundingBox)binding.geometry.computeBoundingBox();bounds.union(binding.geometry.boundingBox.clone().applyMatrix4(matrix));}if(bounds.isEmpty())return null;const size=bounds.getSize(new THREE.Vector3()),record=entry.bindings[0].record;return {shape:'component',uuid:String(record.uuid||record.id||''),reference:String(record.ref||''),center:bounds.getCenter(new THREE.Vector3()).toArray(),normal:null,width:size.x,height:size.y,triangles:entry.triangles};}
 function componentLED(id,options){
  const bindings=componentCandidates(options.anchor),old=surfaces.get(id),triangles=bindings.reduce((sum,binding)=>{const geometry=binding.object.geometry;if(binding.object.isSkinnedMesh||geometry.morphAttributes?.position?.length)throw new Error('LED body binding requires static geometry.');return sum+Math.floor((geometry.index?.count||geometry.getAttribute('position')?.count||0)/3);},0);
  if(!triangles||triangles>MAX_TRIANGLES||surfaces.size-(old?1:0)>=MAX_SURFACES||totalTriangles-(old?.triangles||0)+triangles>MAX_PATCH_TRIANGLES)throw new Error('LED component geometry exceeds the demo surface budget.');
  const chosenColor=color(options.color||'#59f3a5');if(options.brightness!==undefined&&(!Number.isFinite(options.brightness)||options.brightness<0||options.brightness>1))throw new TypeError('Choose LED brightness from 0 to 1.');
  const material=new THREE.MeshBasicMaterial({color:0xffffff,depthTest:true,depthWrite:true,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2}),entry={id,kind:'led',bindings,material,pixels:0,triangles,on:false,brightness:1,color:chosenColor};
  for(const binding of bindings){binding.geometry=binding.object.geometry;binding.record=sourceRecord(binding.object,binding.instanceId);binding.mesh=new THREE.Mesh(binding.geometry,material);binding.mesh.matrixAutoUpdate=false;binding.mesh.userData.demoSurface=id;binding.mesh.renderOrder=10;}
  entry.meshes=bindings.map(binding=>binding.mesh);ledState(entry,options);if(old)remove(old);surfaces.set(id,entry);totalTriangles+=triangles;for(const mesh of entry.meshes)group.add(mesh);syncEntry(entry);invalidate();
  return {get face(){return componentDescriptor(entry);},getFace(){return componentDescriptor(entry);},setLED(state){assertActive();if(surfaces.get(id)!==entry)throw new Error('LED surface is closed.');ledState(entry,state);},update(){assertActive();return syncEntry(entry);},setValue(){throw new Error('An LED uses setLED().');},isAvailable(){return !closed&&surfaces.get(id)===entry&&syncEntry(entry);},dispose(){remove(entry);}};
 }
 function createSurface(id,options={}){
  assertActive();text(id,'demo surface ID');if(!['led','display','button','knob'].includes(options.kind))throw new TypeError('Choose an LED, display, button or knob.');
  if(options.kind==='led'&&!options.face&&options.anchor&&!options.anchor.face)return componentLED(id,options);
  const face=getFace(options),old=surfaces.get(id),size=dimensions(options),pixels=size.width*size.height;
  if(surfaces.size-(old?1:0)>=MAX_SURFACES||totalPixels-(old?.pixels||0)+pixels>MAX_PIXELS||totalTriangles-(old?.triangles||0)+face.patch.triangles>MAX_PATCH_TRIANGLES)throw new Error('Demo surfaces exceed their canvas or geometry budget.');
  if([...surfaces.values()].some(entry=>entry!==old&&entry.face?.key===face.key))throw new Error('This geometry face already has a demo surface.');
  const chosenColor=options.kind==='led'?color(options.color||'#59f3a5'):'#59f3a5';if(options.brightness!==undefined&&(!Number.isFinite(options.brightness)||options.brightness<0||options.brightness>1))throw new TypeError('Choose LED brightness from 0 to 1.');
  const canvas=doc.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
  const uploadCanvas=options.kind==='display'?doc.createElement('canvas'):canvas;uploadCanvas.width=size.width;uploadCanvas.height=size.height;
  const texture=new THREE.CanvasTexture(uploadCanvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=options.mode==='matrix'?THREE.NearestFilter:THREE.LinearFilter;texture.generateMipmaps=false;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(face.patch.positions.slice(),3));geometry.setAttribute('uv',new THREE.BufferAttribute(face.patch.uvs.slice(),2));geometry.computeVertexNormals();
  const material=new THREE.MeshBasicMaterial({map:texture,color:0xffffff,side:THREE.FrontSide,depthTest:true,depthWrite:true,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
  const mesh=new THREE.Mesh(geometry,material);mesh.matrixAutoUpdate=false;mesh.userData.demoSurface=id;mesh.renderOrder=10;
  const min=options.min??0,max=options.max??100,step=options.step??1;
  if(![min,max,step].every(Number.isFinite)||max<=min||step<=0){texture.dispose();material.dispose();geometry.dispose();throw new TypeError('Choose a finite increasing knob range and positive step.');}
  const clamp=value=>Math.max(min,Math.min(max,min+Math.round((value-min)/step)*step));
  const entry={id,kind:options.kind,face,canvas,uploadCanvas,texture,material,mesh,pixels,triangles:face.patch.triangles,min,max,step,clamp,value:clamp(Number.isFinite(options.value)?options.value:min),pressed:false,color:chosenColor,on:Boolean(options.on),brightness:Number.isFinite(options.brightness)?Math.max(0,Math.min(1,options.brightness)):1,label:typeof options.label==='string'?options.label.slice(0,64):id};
  try{paint(entry);}catch(error){texture.dispose();material.dispose();geometry.dispose();throw error;}
  if(old)remove(old);surfaces.set(id,entry);totalPixels+=pixels;totalTriangles+=face.patch.triangles;group.add(mesh);syncEntry(entry);invalidate();
  return {canvas,get face(){return describeFace(face);},getFace(){return describeFace(face);},update(){assertActive();if(surfaces.get(id)!==entry)throw new Error('Demo surface is closed.');const size=dimensions({width:canvas.width,height:canvas.height}),next=size.width*size.height;if(totalPixels-entry.pixels+next>MAX_PIXELS)throw new Error('Demo surfaces exceed their canvas budget.');if(entry.kind==='display'){const context=canvas.getContext('2d');if(!context)throw new Error('Canvas drawing is unavailable.');try{context.getImageData(0,0,1,1);}catch(error){const failure=new Error('Display graphics must be CORS-enabled and origin-clean before upload.');failure.cause=error;throw failure;}const upload=uploadCanvas.getContext('2d');if(!upload)throw new Error('Canvas upload is unavailable.');if(uploadCanvas.width!==canvas.width)uploadCanvas.width=canvas.width;if(uploadCanvas.height!==canvas.height)uploadCanvas.height=canvas.height;upload.clearRect(0,0,uploadCanvas.width,uploadCanvas.height);upload.drawImage(canvas,0,0);}
   totalPixels+=next-entry.pixels;entry.pixels=next;texture.needsUpdate=true;invalidate();return syncEntry(entry);},setLED(state={}){assertActive();if(entry.kind!=='led'||surfaces.get(id)!==entry)throw new Error('Choose an active LED surface.');ledState(entry,state);},setValue(value){assertActive();if(!Number.isFinite(value)||surfaces.get(id)!==entry)throw new TypeError('Choose a finite active control value.');entry.value=entry.clamp(value);if(entry.kind==='button')entry.pressed=Boolean(entry.value);paint(entry);invalidate();return entry.value;},isAvailable(){return !closed&&surfaces.get(id)===entry&&syncEntry(entry);},dispose(){remove(entry);}};
 }
 function entryFor(hit){const entry=hit?.object?.userData?.demoSurface&&surfaces.get(hit.object.userData.demoSurface);return entry&&visible(hit.object)&&(entry.mesh===hit.object||entry.meshes?.includes(hit.object))&&syncEntry(entry)?entry:null;}
 function endGesture(phase,event){const current=gesture;if(!current)return false;gesture=null;current.entry.pressed=false;paint(current.entry);invalidate();emit(current.entry,'release',event,current.uv,{cancelled:phase==='cancel'});return true;}
 function pointer(hit,phase,event={}){
  if(closed)return false;
  if(phase==='release'||phase==='cancel'){if(!gesture||event.pointerId!==undefined&&event.pointerId!==gesture.pointerId)return false;return endGesture(phase,event);}
  if(phase==='move'){
   if(!gesture||event.pointerId!==undefined&&event.pointerId!==gesture.pointerId)return false;const entry=gesture.entry;
   if(entry.kind==='knob'&&Number.isFinite(event.clientY)){const value=entry.clamp(gesture.startValue+(gesture.startY-event.clientY)*entry.step);if(value!==entry.value){entry.value=value;paint(entry);invalidate();emit(entry,'change',event,hit?.uv||gesture.uv);}}
   return true;
  }
  if(phase!=='press'||gesture)return false;const entry=entryFor(hit);if(!entry||entry.kind==='led')return false;
  gesture={entry,pointerId:event.pointerId,startY:Number.isFinite(event.clientY)?event.clientY:0,startValue:entry.value,uv:hit.uv?{x:hit.uv.x,y:hit.uv.y}:undefined};entry.pressed=true;paint(entry);invalidate();emit(entry,'press',event,gesture.uv);return true;
 }
 function sync(){if(closed)return;for(const entry of surfaces.values())syncEntry(entry);}
 function dispose(){if(closed)return;endGesture('cancel',null);for(const entry of [...surfaces.values()])remove(entry);closed=true;faces.clear();inputHandler=null;group.removeFromParent();}
 return {selectFace,createSurface,setInputHandler(handler){if(closed&&handler===null){inputHandler=null;return;}assertActive();if(handler!==null&&typeof handler!=='function')throw new TypeError('Choose an input callback or null.');if(handler===null)endGesture('cancel',null);inputHandler=handler;},getPickables(){sync();return [...surfaces.values()].flatMap(entry=>entry.meshes||[entry.mesh]).filter(mesh=>mesh.visible);},getFace(id){const entry=surfaces.get(id);return entry?(entry.bindings?componentDescriptor(entry):describeFace(entry.face)):null;},objects(){return this.getPickables();},isHit(hit){return Boolean(entryFor(hit));},pointer,sync,get hasActivePointer(){return Boolean(gesture);},dispose};
}
