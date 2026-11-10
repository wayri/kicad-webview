/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {selectionNetNames,pureNetSelection,countNetSelection} from '../engine/spike/selectionWorkload.mjs';
import {selectionMatcher} from '../engine/spike/selectionState.mjs';
function mesh(records){
  const array=new Float32Array(records.length*16);records.forEach((_,i)=>{for(const offset of [0,5,10,15])array[i*16+offset]=1;});
  return {visible:true,uuid:'batch',isInstancedMesh:true,instanceMatrix:{array},geometry:{attributes:{position:{count:3}}},userData:{records},getMatrixAt(){throw Error('Full matrix extraction must not run.');},updateWorldMatrix(){throw Error('World bounds must not run.');}};
}
test('pure net detection resolves saved net codes and excludes explicit component/object selection',()=>{
  const board={nets:{1:'GND',2:'VCC'}},names=selectionNetNames({netCodes:[0,'0',1,'2','SIGNAL',null]},board);
  assert.deepEqual([...names],['GND','VCC','SIGNAL']);assert.equal(pureNetSelection({netCodes:[1]},names),true);assert.equal(pureNetSelection({references:['U1']},names),false);assert.equal(pureNetSelection({uuids:['pad']},names),false);assert.equal(pureNetSelection({references:[''],uuids:[]},names),true);assert.equal(pureNetSelection({},new Set()),false);
});
test('net count excludes hidden and degenerate instances, deduplicates source identities, and performs no bounds work',()=>{
  const records=[{id:'trace',net:'GND'},{id:'trace',net:'GND'},{id:'hidden',net:'GND'},{id:'other',net:'VCC'},{ref:'U1',net:'GND'},{ref:'U1',net:'GND'}],batch=mesh(records);batch.instanceMatrix.array.fill(0,32,48);
  const source=Array.from(batch.instanceMatrix.array),hidden=mesh([{id:'invisible',net:'GND'}]);hidden.parent={visible:false};
  const model={visible:true,uuid:'model',geometry:{attributes:{position:{count:3}}},userData:{record:{ref:'U1',type:'Component'}},updateWorldMatrix(){throw Error('No model bounds work.');}};
  const board={pads:[{ref:'U1',net:'GND'}]},matches=selectionMatcher({netNames:['GND']},board),result=countNetSelection([batch,hidden,model],matches);
  assert.deepEqual(result,{matched:2,matchedRecords:5,visitedRecords:7,visibleObjects:2});assert.deepEqual(Array.from(batch.instanceMatrix.array),source);
});
test('dense round-capped net batches count each saved track once without matrix objects or outline vertices',()=>{
  const records=Array.from({length:3000},(_,i)=>({id:'track-'+Math.floor(i/3),net:'GND'})),batch=mesh(records),result=countNetSelection([batch],record=>record.net==='GND');
  assert.equal(result.matched,1000);assert.equal(result.matchedRecords,3000);assert.equal(result.visitedRecords,3000);
  batch.geometry.attributes.position.count=0;assert.equal(countNetSelection([batch],()=>true).matched,0);
});
