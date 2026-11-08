import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseManufacturing} from '../src/manufacturing/index.mjs';
import '../engine/design-diff.js';
import '../engine/worksheet.js';
import '../engine/pcb-renderer.js';
const fixture=path=>readFile(new URL('../fixtures/inverter-cam/'+path,import.meta.url),'utf8');
test('native KiCad Gerber outline coordinates match source PCB landmarks with CAM y-up conversion',async()=>{
  const source=await readFile(new URL('../fixtures/inverter/3PD+IB.kicad_pcb',import.meta.url),'utf8');
  const board=globalThis.KiCadPCBRenderer.build(globalThis.KiCadDesignDiff.parse(source),'inverter.kicad_pcb');
  const gerber=parseManufacturing(await fixture('3PD+IB-Edge_Cuts.gm1'),{path:'outline.gm1'});
  const sourcePoints=board.primitives.filter(p=>p.layer==='Edge.Cuts').flatMap(p=>p.points||[]);
  const paths=gerber.layers[0].operations.map(op=>op.path).join('');
  const points=[...paths.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(m=>({x:Number(m[1]),y:-Number(m[2])}));
  assert.ok(points.length>=24);let matched=0;
  for(const p of points.slice(0,24)){assert.ok(sourcePoints.some(q=>Math.abs(q.x-p.x)<1e-6&&Math.abs(q.y-p.y)<1e-6),'Missing source outline point '+JSON.stringify(p));matched++;}
  assert.equal(matched,24);assert.deepEqual(gerber.warnings,[]);
});
test('native Excellon retains nonplated hole centers, diameter, tool count and supplied plating metadata',async()=>{
  const parsed=parseManufacturing(await fixture('3PD+IB-NPTH.drl'),{path:'NPTH.drl'}),ops=parsed.layers[0].operations;
  assert.equal(ops.length,17);assert.equal(parsed.metadata.tools.length,1);assert.equal(parsed.metadata.tools[0].diameter,2.2);
  assert.match(parsed.metadata.fileFunction,/NonPlated/);const first=ops[0].bounds;
  assert.ok(Math.abs(first.x+first.w/2-31.41)<1e-9);assert.ok(Math.abs(first.y+first.h/2+215.99)<1e-9);assert.ok(Math.abs(first.w-2.2)<1e-9);assert.deepEqual(parsed.warnings,[]);
});
test('all six unchanged native fabrication exports have complete nonempty beta geometry without omissions',async()=>{
  const manifest=JSON.parse(await fixture('project.json'));assert.equal(manifest.files.length,6);
  for(const file of manifest.files){const parsed=parseManufacturing(await fixture(file.path),{path:file.path});assert.deepEqual(parsed.warnings,[],file.path);assert.ok(parsed.layers[0].operations.length>0,file.path);assert.ok(parsed.bounds.w>100&&parsed.bounds.h>100,file.path);}
});
