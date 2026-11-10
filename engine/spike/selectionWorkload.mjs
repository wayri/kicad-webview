/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
export function selectionNetNames(selection,board={}){
  const names=new Set((Array.isArray(selection.netNames)?selection.netNames:[]).filter(name=>typeof name==='string'&&name));
  for(const code of Array.isArray(selection.netCodes)?selection.netCodes:[]){
    if(code===0||code==='0'||code==null||code==='')continue;
    const name=board.nets?.[String(code)];if(name)names.add(name);else if(typeof code==='string'&&!/^\d+$/.test(code))names.add(code);
  }
  return names;
}
export function pureNetSelection(selection,names){
  return names.size>0&&!['references','uuids'].some(key=>Array.isArray(selection[key])&&selection[key].some(value=>typeof value==='string'&&value));
}
function liveInstance(object,index){
  const a=object.instanceMatrix?.array,o=index*16;if(!a||o+15>=a.length)return false;
  const determinant=a[o]*(a[o+5]*a[o+10]-a[o+9]*a[o+6])-a[o+4]*(a[o+1]*a[o+10]-a[o+9]*a[o+2])+a[o+8]*(a[o+1]*a[o+6]-a[o+5]*a[o+2]);
  return Number.isFinite(determinant)&&determinant!==0;
}
export function countNetSelection(objects,matches){
  const identities=new Set();let visitedRecords=0,matchedRecords=0,visibleObjects=0;
  for(const object of objects){
    let visible=true;for(let node=object;node;node=node.parent)if(!node.visible){visible=false;break;}
    if(!visible||!object.geometry?.attributes?.position?.count)continue;visibleObjects++;
    const append=(record,index)=>{
      visitedRecords++;if(!matches(record)||object.isInstancedMesh&&Number.isInteger(index)&&!liveInstance(object,index))return;matchedRecords++;
      identities.add(record?.ref?'part:'+record.ref:record?.uuid||record?.id||object.uuid+':'+index);
    };
    if(Array.isArray(object.userData.records))object.userData.records.forEach(append);else append(object.userData.record);
  }
  return {matched:identities.size,matchedRecords,visitedRecords,visibleObjects};
}
