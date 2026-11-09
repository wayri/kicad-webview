/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Saved XY/layer identities remain exact; missing stackup elevations are labelled illustrative. */
export function copperLayerPlan(board,thickness){
 if(!(thickness>0)||!Number.isFinite(thickness))throw new TypeError('A positive board thickness is required.');
 const inner=[...new Set(board.layers||[])].filter(name=>typeof name==='string'&&/^In(?:[1-9]|[1-5][0-9]|6[0-2])\.Cu$/.test(name)).slice(0,62);
 const names=['F.Cu',...inner,'B.Cu'],stack=Array.isArray(board.stackup)?board.stackup:[],positions=new Map();let depth=0;
 const first=stack.findIndex(item=>item.name==='F.Cu'),last=stack.findIndex(item=>item.name==='B.Cu');
 const valid=first>=0&&last>first&&stack.slice(first,last+1).every(item=>Number.isFinite(item.thickness)&&item.thickness>=0);
 if(valid)for(const item of stack){const h=Number.isFinite(item.thickness)&&item.thickness>=0?item.thickness:0;if(names.includes(item.name)){if(positions.has(item.name)){positions.clear();break;}positions.set(item.name,thickness/2-depth-h/2);}depth+=h;}
 const saved=valid&&names.every(name=>positions.has(name))&&Math.abs(depth-thickness)<1e-6&&names.every((name,index)=>!index||positions.get(names[index-1])>positions.get(name));
 return names.map((name,index)=>({name,internal:index>0&&index<names.length-1,z:index===0?thickness/2+.025:index===names.length-1?-thickness/2-.025:saved?positions.get(name):thickness/2-index*thickness/(names.length-1),basis:index===0||index===names.length-1?'outer-surface':saved?'saved-stackup':'illustrative'}));
}
