/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
export const boardAppearances=Object.freeze(['realistic','layers','translucent']);
export function appearanceName(value){if(!boardAppearances.includes(value))throw new TypeError('Choose realistic, layers or translucent appearance.');return value;}
/** Reversible display materials; source geometry, identities and visibility are untouched. */
export function createTranslucentAppearance(){
 const records=new Map(),clones=new Map();let enabled=false,disposed=false;
 const opacity={substrate:.12,component:.22,zone:.08,silkscreen:.45};
 function materials(value){return Array.isArray(value)?value:[value];}
 function displayMaterial(source,role){
  if(!source||!source.clone)return source;
  let roles=clones.get(source);if(!roles){roles=new Map();clones.set(source,roles);}if(roles.has(role))return roles.get(role);
  const material=source.clone();material.transparent=true;material.opacity=(Number.isFinite(source.opacity)?source.opacity:1)*opacity[role];material.depthWrite=false;material.forceSinglePass=true;material.needsUpdate=true;roles.set(role,material);return material;
 }
 function apply(object,record){const values=materials(record.material).map(source=>displayMaterial(source,record.role));object.material=Array.isArray(record.material)?values:values[0];}
 function restore(){for(const [object,record]of records)object.material=record.material;for(const roles of clones.values())for(const material of roles.values())material.dispose();clones.clear();}
 return {
  add(object,role){if(disposed||!object?.material||!Object.hasOwn(opacity,role)||records.has(object))return;const record={material:object.material,role};records.set(object,record);if(enabled)apply(object,record);},
  setEnabled(value){if(disposed)return false;const next=Boolean(value);if(next===enabled)return enabled;if(!next)restore();enabled=next;if(enabled)for(const [object,record]of records)apply(object,record);return enabled;},
  stats(){return{enabled,objects:records.size,materials:[...clones.values()].reduce((sum,roles)=>sum+roles.size,0)};},
  dispose(){if(disposed)return;restore();records.clear();enabled=false;disposed=true;}
 };
}

/** Translucent inspection reaches visible geometry behind the substrate. */
export function inspectionTarget(object,substrate,appearance){if(appearance==='translucent'&&object===substrate)return false;for(let node=object;node;node=node.parent)if(!node.visible)return false;return true;}
