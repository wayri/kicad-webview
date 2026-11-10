/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseWayriCADResults,classifyWayriCADSource,wayriCADFrame,probeWayriCADPlot,wayriCADPointHistory,wayriCADSurface} from '../src/wayricad-results.mjs';
const dir=new URL('./fixtures/wayricad/',import.meta.url);
const fixture=name=>readFileSync(new URL(name+'.pocket-kivi.json',dir),'utf8');
const hash=name=>createHash('sha256').update(readFileSync(new URL(name,dir))).digest('hex');

test('pinned PI, SI and thermal examples preserve source and complete arrays',()=>{
 for(const name of ['quick-pi','quick-si','quick-therm','quick-therm-transient']){
  const text=fixture(name), original=JSON.parse(text), model=parseWayriCADResults(text,{path:name+'.json'});
  assert.deepEqual(model.raw,original);assert.ok(Object.isFrozen(model.raw));assert.ok(Object.isFrozen(model.report));
  assert.equal(model.metadata.portable.tool,original.pocket_kivi_export.tool);
  const board=name==='quick-si'?'si-channel.kicad_pcb':'example.kicad_pcb';assert.equal(classifyWayriCADSource(model,hash(board)),'matching');
  assert.equal(classifyWayriCADSource(model,'0'.repeat(64)),'stale');assert.equal(classifyWayriCADSource(model,null),'unverified');
  assert.throws(()=>{model.raw.source_path='changed';},TypeError);assert.ok(model.report.plots.length);
 }
});
test('saved fields preserve null gaps, frames and probe values',()=>{
 const pi=parseWayriCADResults(fixture('quick-pi'));assert.ok(pi.raw.result.potential_V.includes(null));
 const mesh=pi.report.plots.find(p=>p.type==='mesh-field'&&p.title.includes('potential'));assert.ok(mesh);assert.ok(wayriCADSurface(mesh));assert.ok(Number.isFinite(probeWayriCADPlot(mesh,15,5).value));
 const thermal=parseWayriCADResults(fixture('quick-therm-transient'));const plot=thermal.report.plots.find(p=>p.type==='heatmap'&&p.frames);assert.ok(plot);assert.equal(plot.frames.length,3);
 assert.ok(wayriCADFrame(plot,2).flat().includes(null));const history=wayriCADPointHistory(plot,25,5);assert.equal(history.series[0].points.length,3);
});
test('copies input without collapsing repeated event times or gaps',()=>{
 const original=JSON.parse(fixture('quick-si'));original.eye.time_ui=[0,0,1];original.eye.traces_v=[[1,null,3]];
 const model=parseWayriCADResults(original);original.eye.time_ui[0]=99;assert.deepEqual(model.raw.eye.time_ui,[0,0,1]);assert.deepEqual(model.raw.eye.traces_v,[[1,null,3]]);
});
test('rejects setup, duplicate keys, nonfinite and malformed or unsafe data',()=>{
 for(const value of ['{"schema":"wayricad.quick-pi.setup/v1"}','{"mesh":{},"result":{},"x":1,"x":2}','{"mesh":{},"result":{},"x":1e999}','{"mesh":{},"result":{},}', '<html></html>'])assert.throws(()=>parseWayriCADResults(value));
 const cycle={mesh:{},result:{}};cycle.loop=cycle;assert.throws(()=>parseWayriCADResults(cycle));assert.throws(()=>parseWayriCADResults({mesh:{},result:{x:NaN}}));
 assert.throws(()=>parseWayriCADResults('{"mesh":{},"result":{},"x":'+ '['.repeat(66)+'0'+']'.repeat(66)+'}'));
 assert.throws(()=>parseWayriCADResults(fixture('quick-pi'),{path:'unsafe.html'}));
 assert.throws(()=>parseWayriCADResults(' '.repeat(64*1024*1024+1)),RangeError);
});
test('project-library integrity and incidental source hashes do not establish match',()=>{
 const result=JSON.parse(fixture('quick-pi'));result.wayricad_saved_result={schema:'wayricad.project-result/v1',plugin:'quick-pi',source_binding:'unverified'};
 const model=parseWayriCADResults(result);assert.equal(model.metadata.libraryIntegrity,'unverified');assert.equal(classifyWayriCADSource(model,hash('example.kicad_pcb')),'unverified');
 delete result.wayricad_saved_result;result.pocket_kivi_export.source_state='live';assert.equal(classifyWayriCADSource(parseWayriCADResults(result),hash('example.kicad_pcb')),'unverified');
});

test('invalid current vector dimensions remain missing and multi-layer plots share normalized geometry',()=>{
 const bad={mesh:{points_mm:[[0,0,0],[1,0,0],[0,1,0]],triangles:[[0,1,2]]},result:{cell_J_A_mm2:[[]]}};
 const report=parseWayriCADResults(bad).report;assert.equal(report.plots.find(p=>p.unit==='A/mm²').values[0],null);
 const layered={mesh:{points_mm:[[0,0,0],[1,0,0],[0,1,0],[1,1,0]],triangles:[[0,1,2],[1,3,2]],triangle_layer:[0,31]},result:{potential_V:[1,2,3,4],cell_power_W:[1,2]}};
 const model=parseWayriCADResults(layered);assert.equal(model.report.plots.length,4);assert.equal(model.report.savedSource,model.raw,'the normalizer must share the validated frozen source, not duplicate it');assert.equal(model.report.plots[0].points,model.report.plots[1].points);assert.equal(model.report.plots[0].points,model.report.plots[3].points);
});
test('a single grid coordinate does not invent a cell footprint or source elevation',()=>{
 const plot={type:'heatmap',title:'single saved point',x:[100],y:[50],values:[[25]],unit:'°C'};
 assert.equal(wayriCADSurface(plot),null);
});
