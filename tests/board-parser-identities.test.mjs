
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),require=createRequire(import.meta.url),deps=process.env.KICAD_WEB_BUILD_DEPS,esbuild=deps?require(path.join(deps,'esbuild')):require('esbuild');
const build=await esbuild.build({entryPoints:[path.join(root,'engine/spike-source/boardParser.ts')],bundle:true,format:'esm',platform:'node',write:false});const {parseKicadBoard}=await import('data:text/javascript;base64,'+Buffer.from(build.outputFiles[0].text).toString('base64'));
test('3D parser preserves saved legacy tstamp identities for components, pads and copper',()=>{
 const b=parseKicadBoard('(kicad_pcb (version 20211014) (footprint "Test:P" (tstamp "part") (layer "F.Cu") (at 10 20) (fp_text reference "U1" (at 0 0) (layer "F.SilkS")) (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (tstamp "pad"))) (segment (start 10 20) (end 20 20) (width .2) (layer "F.Cu") (tstamp "track")))');
 assert.equal(b.components[0].id,'part');assert.equal(b.pads[0].id,'pad');assert.equal(b.tracks[0].id,'track');
 const modern=parseKicadBoard('(kicad_pcb (footprint "Test:P" (uuid "new") (tstamp "old") (layer "F.Cu") (at 0 0)))');assert.equal(modern.components[0].id,'new');
});
test('inverter demo parts retain their exact saved IDs rather than generated reference fallbacks',()=>{
 const source=fs.readFileSync(path.join(root,'fixtures/inverter/3PD+IB.kicad_pcb'),'utf8'),b=parseKicadBoard(source);
 for(const ref of ['Q3','D13','D14','RV1']){const parts=b.components.filter(p=>p.ref===ref);assert.equal(parts.length,1);assert.ok(source.includes(parts[0].id));assert.ok(!parts[0].id.startsWith('component-'));}
});

import vm from 'node:vm';
test('linked models use the same UUID, legacy tstamp or reference fallback as parsed components', () => {
 const context={TextEncoder};
 vm.createContext(context);
 for(const file of ['design-diff.js','repo-models.js'])
  vm.runInContext(fs.readFileSync(path.join(root,'engine',file),'utf8'),context,{filename:file});
 for(const {identity,expected} of [
  {identity:'(tstamp "legacy-part")',expected:'legacy-part'},
  {identity:'(uuid "modern-part")',expected:'modern-part'},
  {identity:'(uuid "modern-part") (tstamp "legacy-part")',expected:'modern-part'},
  {identity:'',expected:'component-U1'},
 ]) {
  const source=`(kicad_pcb (version 20211014) (footprint "Test:P" ${identity} (layer "F.Cu") (at 10 20)
   (fp_text reference "U1" (at 0 0) (layer "F.SilkS")) (model "models/U1.glb")))`;
  const component=parseKicadBoard(source).components[0];
  const {models}=context.KiCadRepoModels.collect(source,'test.kicad_pcb');
  assert.equal(component.id,expected);
  assert.equal(models.length,1);
  assert.equal(models[0].footprintId,component.id);
 }
});


test('3D parser reuses a validated mixed-atom tree without retokenizing or copying it',()=>{
 const diff=require('../engine/design-diff.js'),source=fs.readFileSync(path.join(root,'fixtures/kero-encoder/Encoder.kicad_pcb'),'utf8'),ast=diff.parse(source),before=JSON.stringify(ast);
 assert.deepEqual(parseKicadBoard(source,ast),parseKicadBoard(source));assert.equal(JSON.stringify(ast),before);
 assert.deepEqual(parseKicadBoard('not a drawing; supplied validated AST owns parsing',ast),parseKicadBoard(source,ast));
});
test('prepared trees preserve empty quoted pad fields and numeric saved net codes',()=>{
 const diff=require('../engine/design-diff.js'),source='(kicad_pcb (net 1 "GND") (footprint "Lib:P" (uuid "p") (at 0 0) (pad "" thru_hole circle (uuid "x") (at 1 2) (size 2 2) (drill 1) (layers "F.Cu" "B.Cu") (net 1 "GND"))))';
 const board=parseKicadBoard(source,diff.parse(source));assert.equal(board.pads[0].name,'');assert.equal(board.pads[0].net,'GND');assert.deepEqual(board.pads[0].layers,['F.Cu','B.Cu']);assert.equal(board.pads[0].width,2);
});


test('3D source projection omits unused zone point copies while preserving layers, bounds and saved copper metadata',()=>{
 const source='(kicad_pcb (layers (0 "F.Cu" signal) (2 "In1.Cu" signal) (31 "B.Cu" signal)) (zone (uuid "z") (layer "In1.Cu") (filled_polygon (layer "In1.Cu") (pts (xy 0 0) (xy 10 0) (xy 0 10)))))',diff=require('../engine/design-diff.js'),ast=diff.parse(source),full=parseKicadBoard(source,ast),compact=parseKicadBoard(source,ast,{zonePoints:false});
 assert.equal(full.zones.length,1);assert.equal(compact.zones.length,0);for(const key of Object.keys(full).filter(k=>k!=='zones'))assert.deepEqual(compact[key],full[key],key);
});
test('missing pad IDs remain distinct across repeated pad numbers and match source metadata joins',async()=>{
 const {padSourceDetails}=await import('../engine/spike/padGeometry.mjs'),diff=require('../engine/design-diff.js'),source='(kicad_pcb (module "J" (at 0 0) (fp_text reference "J1") (pad "6" thru_hole oval (at 0 0) (size 2 1.5) (drill oval 1 .5)) (pad "6" smd rect (at 2 0) (size 1 1))))',ast=diff.parse(source),board=parseKicadBoard(source,ast),details=padSourceDetails(ast);
 assert.notEqual(board.pads[0].id,board.pads[1].id);assert.equal(details.get(board.pads[0].id).drillShape,'oval');assert.equal(details.get(board.pads[1].id).drillShape,undefined);
});


test('zone-free 3D projection retains synthetic layer definitions and explicit saved net names',()=>{
 const source='(kicad_pcb (zone (layer "In1.Cu") (net 2) (net_name "POWER") (polygon (pts (xy 0 0) (xy 1 0) (xy 0 1)))))',diff=require('../engine/design-diff.js'),ast=diff.parse(source),full=parseKicadBoard(source,ast),compact=parseKicadBoard(source,ast,{zonePoints:false});
 for(const key of Object.keys(full).filter(k=>k!=='zones'))assert.deepEqual(compact[key],full[key],key);
});
