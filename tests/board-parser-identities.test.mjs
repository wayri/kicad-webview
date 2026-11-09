
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
