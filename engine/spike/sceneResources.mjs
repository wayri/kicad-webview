/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/* One owner for shared model buffers, materials and texture lifetime. */
export function createSceneResources() {
  let closed=false;
  const retained=new Set(),disposed=new WeakSet();
  function track(resource){
    if(!resource||typeof resource!=='object'||typeof resource.dispose!=='function')return resource;
    if(closed)release(resource);else retained.add(resource);
    return resource;
  }
  function release(resource){
    if(disposed.has(resource))return;
    disposed.add(resource);resource.dispose();
    if(resource.isTexture)resource.source?.data?.close?.();
  }
  function retain(root,maxGeometryBytes=Infinity,maxTextureBytes=Infinity){
    const pending=new Set(),add=resource=>{if(resource&&typeof resource.dispose==='function')pending.add(resource);};
    root?.traverse?.(object=>{
      if(object.isInstancedMesh)add(object);
      add(object.geometry);
      for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){
        for(const value of Object.values(material))if(value?.isTexture)add(value);
        add(material);
      }
      if(object.skeleton)add(object.skeleton);
    });
    const allocation=snapshot(new Set([...retained,...pending]));
    if(!closed&&(allocation.retainedGeometryBytes>maxGeometryBytes||allocation.retainedTextureBytes>maxTextureBytes)){
      for(const resource of pending)if(!retained.has(resource))release(resource);
      throw Error('Decoded model geometry or textures exceed this device’s memory budget.');
    }
    for(const resource of pending)track(resource);
    return root;
  }
  function dispose(){if(closed)return;closed=true;for(const resource of retained)release(resource);retained.clear();}
  function snapshot(list){
    const buffers=new Set();let geometryBytes=0,textures=0,textureBytes=0;
    const addArray=array=>{const buffer=array?.buffer;if(buffer&&!buffers.has(buffer)){buffers.add(buffer);geometryBytes+=buffer.byteLength;}};
    for(const resource of list){
      if(resource.isTexture){textures++;const source=resource.source?.data;for(const image of Array.isArray(source)?source:[source])if(Number.isFinite(image?.width)&&Number.isFinite(image?.height))textureBytes+=Math.ceil(image.width*image.height*4*(image.data?.BYTES_PER_ELEMENT||1)*(resource.generateMipmaps?4/3:1));}
      if(resource.isInstancedMesh){addArray(resource.instanceMatrix?.array);addArray(resource.instanceColor?.array);}
      if(resource.boneMatrices)addArray(resource.boneMatrices);
      if(resource.isBufferGeometry)for(const attribute of [...Object.values(resource.attributes),...Object.values(resource.morphAttributes||{}).flat(),resource.index]){
        addArray(attribute?.array||attribute?.data?.array);
      }
    }
    return{retainedResources:list.size,retainedGeometryBytes:geometryBytes,retainedTextures:textures,retainedTextureBytes:textureBytes};
  }
  return{track,retain,dispose,stats:()=>snapshot(retained)};
}
