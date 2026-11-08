/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// Cross-selection follows saved identities; 3D peers frame parts independently.
const active=viewer=>!viewer.disposed&&typeof viewer.source==='string'&&viewer.source.length>0;
const sameDrawing=(a,b)=>active(a)&&active(b)&&a.kind===b.kind&&a.path===b.path&&a.source===b.source;

/** An exact saved symbol UUID relationship, never a reference-only match. */
export function linkedPart(source,target,selected){
 if(!selected)return null;
 const sourceParts=source.getParts(),targetParts=target.getParts();
 const ids=[selected.ownerUuid,selected.parent?.uuid,selected.uuid,selected.id].filter(value=>typeof value==='string'&&value);
 const matches=sourceParts.filter(part=>ids.includes(part.uuid));
 if(matches.length!==1)return null;
 const part=matches[0];let related;
 if(source.kind==='pcb'&&target.kind==='schematic'&&part.schematicUuid)related=targetParts.filter(candidate=>candidate.uuid===part.schematicUuid);
 else if(source.kind==='schematic'&&target.kind==='pcb'&&part.uuid)related=targetParts.filter(candidate=>candidate.schematicUuid===part.uuid);
 else if(sameDrawing(source,target)&&part.uuid)related=targetParts.filter(candidate=>candidate.uuid===part.uuid);
 else return null;
 return related.length===1?related[0]:null;
}

function linkedNet(source,target,selected){
 if(!sameDrawing(source,target))return null;
 const name=selected.netName||selected.net;
 const sourceNets=source.getNets(),targetNets=target.getNets();
 const byId=(selected.kind==='net'||selected.type==='net')&&typeof selected.id==='string'&&selected.id?sourceNets.filter(net=>net.id===selected.id):[];
 const byName=typeof name==='string'?sourceNets.filter(net=>net.name===name):[];
 const sourceNet=byId.length===1?byId[0]:byName.length===1?byName[0]:null;
 if(!sourceNet)return null;
 const matches=typeof sourceNet.id==='string'&&sourceNet.id?targetNets.filter(net=>net.id===sourceNet.id):[];
 if(matches.length===1)return matches[0];
 const names=targetNets.filter(net=>net.name===sourceNet.name);
 return names.length===1?names[0]:null;
}

/** Apply one saved selection to a loaded peer; returns object/part/net/clear or null. */
export function linkSelection(source,target,item){
 if(source===target||!active(source)||!active(target))return null;
 if(item===null){target.clearSelection();return 'clear';}
 if(!item||typeof item!=='object')return null;
 const objectKind=String(item.kind||item.type||'').toLowerCase();
 if(sameDrawing(source,target)&&typeof target.selectObject==='function'&&['pad','pin','segment','track','arc','via','zone'].includes(objectKind)){
  const id=objectKind==='pin'?(item.pinNumber!==undefined?item.ownerUuid:undefined):item.uuid;
  if(typeof id==='string'&&id&&target.selectObject(id,{locate:target.view==='3d'&&['pad','pin'].includes(objectKind),...(item.pinNumber!==undefined?{pinNumber:item.pinNumber}:{})}))return 'object';
 }
 const netSelection=item.kind==='net'||item.type==='net';
 const part=netSelection?null:linkedPart(source,target,item);
 if(part)return target.selectPart(part.id,{locate:target.view==='3d'})?'part':null;
 const net=linkedNet(source,target,item);
 return net&&target.selectNet(net.id||net.name,{locate:false})?'net':null;
}

/** Link 2–8 explicitly supplied KiCadViewer instances. Owns only listeners. */
export function linkViewers(viewers,{enabled=true}={}){
 if(!Array.isArray(viewers)||viewers.length<2||viewers.length>8||new Set(viewers).size!==viewers.length)throw new TypeError('Link 2 to 8 distinct viewer instances.');
 const methods=['addEventListener','removeEventListener','getParts','getNets','selectPart','selectNet','clearSelection'];
 if(viewers.some(viewer=>!viewer||viewer.disposed||methods.some(name=>typeof viewer[name]!=='function')))throw new TypeError('Choose active KiCadViewer instances.');
 const members=[...viewers],group=new EventTarget();let disposed=false,guard=false,linked=Boolean(enabled);
 const stops=[];
 const emit=(type,detail)=>group.dispatchEvent(new CustomEvent(type,{detail}));
 const select=(source,event)=>{
  if(disposed||guard||!linked||!active(source))return;
  const detail=event.detail;
  if(!detail||!Object.hasOwn(detail,'item')||detail.path!==undefined&&detail.path!==source.path||detail.view!==undefined&&detail.view!==source.view)return;
  const item=detail.item===null?null:source.getSelection?.()||detail.item;
  guard=true;
  try{
   for(const target of members){
    if(disposed||!linked)break;
    if(target===source||!active(target))continue;
    try{
     const kind=linkSelection(source,target,item);
     if(kind&&!disposed&&linked)emit('link',{source,target,kind});
    }catch(error){if(!target.disposed)emit('linkerror',{source,target,error});}
   }
  }finally{guard=false;}
 };
 for(const viewer of members){const listener=event=>select(viewer,event);viewer.addEventListener('select',listener);stops.push(()=>viewer.removeEventListener('select',listener));}
 Object.defineProperty(group,'enabled',{get:()=>linked&&!disposed});
 group.setEnabled=value=>{if(disposed)throw new Error('Linked viewers have been disposed.');linked=Boolean(value);};
 group.dispose=()=>{if(disposed)return;disposed=true;linked=false;for(const stop of stops)stop();stops.length=0;members.length=0;};
 return group;
}
