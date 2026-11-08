/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Project only saved source identities or bounded file-space PCB positions. */
export function createAnchorProjector(THREE,{objects,camera,rect,positionToWorld}){
  const body=record=>record?.type==='Component'||typeof record?.library==='string';
  return function projectAnchor(anchor){
    if(!anchor||typeof anchor!=='object')return null;
    const box=rect();if(!(box.width>0&&box.height>0))return null;
    const project=point=>{point.project(camera);if(![point.x,point.y,point.z].every(Number.isFinite)||Math.abs(point.x)>1||Math.abs(point.y)>1||point.z< -1||point.z>1)return null;return {x:box.left+(point.x+1)*box.width/2,y:box.top+(1-point.y)*box.height/2,visible:true};};
    if(anchor.position){const {x,y}=anchor.position;if(![x,y].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e6)||!['front','back',undefined].includes(anchor.side))return null;return project(positionToWorld({x,y},anchor.side));}
    const text=value=>typeof value==='string'&&value.length>0&&value.length<=500&&!/[\x00-\x1f\x7f]/.test(value);
    if(!['uuid','reference','pinNumber','net'].some(key=>text(anchor[key])))return null;
    if(['uuid','reference','pinNumber','net'].some(key=>anchor[key]!==undefined&&!text(anchor[key])))return null;
    if(anchor.pinNumber&&!anchor.uuid&&!anchor.reference)return null;
    const groups=new Map(),matrix=new THREE.Matrix4(),local=new THREE.Matrix4();
    for(const object of objects()){
      let visible=true;for(let parent=object;parent;parent=parent.parent)if(!parent.visible)visible=false;if(!visible)continue;
      const records=object.userData.records||[object.userData.record];
      for(let index=0;index<records.length;index++){
        const record=records[index];if(!record)continue;
        const id=record.uuid||record.id;
        if(anchor.uuid&&anchor.uuid!==id&&!(anchor.pinNumber&&anchor.uuid===record.ownerUuid)&&!(typeof id==='string'&&id.replace(/:\d+$/,'')===anchor.uuid))continue;
        if(anchor.reference&&record.ref!==anchor.reference)continue;
        if(anchor.pinNumber&&String(record.pinNumber??record.name??'')!==anchor.pinNumber)continue;
        if(anchor.net&&record.net!==anchor.net)continue;
        if(anchor.reference&&!anchor.uuid&&!anchor.pinNumber&&!anchor.net&&!body(record))continue;
        object.updateWorldMatrix(true,false);if(!object.geometry?.boundingBox)object.geometry?.computeBoundingBox();if(!object.geometry?.boundingBox)continue;
        const bounds=object.geometry.boundingBox.clone();
        if(object.isInstancedMesh){object.getMatrixAt(index,local);if(local.determinant()===0)continue;matrix.multiplyMatrices(object.matrixWorld,local);bounds.applyMatrix4(matrix);}else bounds.applyMatrix4(object.matrixWorld);
        if(bounds.isEmpty())continue;
        const key=id||record.ref;if(!key)continue;
        if(groups.has(key))groups.get(key).union(bounds);else groups.set(key,bounds);
      }
    }
    if(!anchor.net&&groups.size!==1)return null;
    const points=[...groups.values()].map(bounds=>project(bounds.getCenter(new THREE.Vector3()))).filter(Boolean);
    points.sort((a,b)=>Math.hypot(a.x-box.left-box.width/2,a.y-box.top-box.height/2)-Math.hypot(b.x-box.left-box.width/2,b.y-box.top-box.height/2));
    return points[0]||null;
  };
}
