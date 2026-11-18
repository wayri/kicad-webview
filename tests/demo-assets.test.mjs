/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildProjectHierarchy} from '../src/project-hierarchy.mjs';
import {buildInspectionModel} from '../src/inspector.mjs';
import '../src/kicad-viewer.mjs';

const dist=new URL('../dist/',import.meta.url);
const data=path=>readFile(new URL(path,dist));
const json=async path=>JSON.parse(await data(path));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('published demonstration folders contain exactly the pinned KERO drawings and their manufacturing exports',async()=>{
 for(const [dir,extras] of [['demo',['README.md']],['manufacturing',['kero-encoder-fabrication.zip']]]){
  const manifest=await json(dir+'/project.json'),provenance=await json(dir+'/PROVENANCE.json');
  assert.equal(provenance.revision,'7be8fef589bc28eee149323e3790ef95b0873032');
  const paths=manifest.files.map(file=>file.path);
  assert.deepEqual((await readdir(new URL(dir+'/',dist))).sort(),[...paths,'project.json','PROVENANCE.json',...extras].sort());
  assert.deepEqual(provenance.files.map(file=>file.path).sort(),[...paths].sort());
  for(const record of provenance.files)assert.equal(sha(await data(dir+'/'+record.path)),record.sha256);
 }
 const boardHash=sha(await data('demo/Encoder.kicad_pcb'));
 assert.equal((await json('manufacturing/PROVENANCE.json')).boardSHA256,boardHash);
 assert.deepEqual(await readdir(new URL('analysis/',dist)),['kero-encoder-illustrative.json']);
 const analysis=await json('analysis/kero-encoder-illustrative.json');
 assert.equal(analysis.provenance.kind,'illustrative');
 assert.deepEqual(analysis.board,{sha256:boardHash,path:'Encoder.kicad_pcb'});
});

test('KERO tours and virtual controls resolve real sheet, net and component identities',async()=>{
 const manifest=await json('demo/project.json');
 const files=await Promise.all(manifest.files.map(async({path})=>({path,source:(await data('demo/'+path)).toString()})));
 const hierarchy=buildProjectHierarchy(files.filter(file=>file.path.endsWith('.kicad_sch')));
 assert.equal(hierarchy.rootPath,'Encoder.kicad_sch');
 assert.deepEqual(hierarchy.roots[0].children.map(node=>node.path).sort(),['bank1.kicad_sch','bank2.kicad_sch','bank3.kicad_sch','decoder.kicad_sch','power.kicad_sch']);
 function inspect(path,kind,renderer){
  const {source}=files.find(file=>file.path===path),ast=globalThis.KiCadDesignDiff.parse(source),design=renderer.build(ast,path);
  const connectivity=globalThis.KiCadNetModel.build([{path,content:source}],new Map([[path,design]]));
  return buildInspectionModel(ast,{kind,path,design,connectivity});
 }
 const pcb=inspect(manifest.entry,'pcb',globalThis.KiCadPCBRenderer);
 for(const ref of ['U1','D1','R1','R2'])assert.equal(pcb.parts.filter(part=>part.reference===ref&&part.uuid).length,1);
 assert.ok(pcb.nets.find(net=>net.name==='/VBAT')?.primitives.length>0);
 const sheet=inspect('decoder.kicad_sch','schematic',globalThis.KiCadSchematicRenderer);
 assert.equal(sheet.parts.find(part=>part.reference==='D1').uuid,pcb.parts.find(part=>part.reference==='D1').schematicUuid);
});
