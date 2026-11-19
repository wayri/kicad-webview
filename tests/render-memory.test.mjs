import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import fs from 'node:fs';
const require=createRequire(import.meta.url),diff=require('../engine/design-diff.js'),nets=require('../engine/net-model.js');
test('source byte counting agrees with UTF-8 replacement semantics without input-sized byte storage',()=>{
 for(const text of ['', 'ASCII', 'Ω水😀', '\ud800', '\udc00', '\ud800x\udfff', 'a'.repeat(1048576)+'😀'])assert.equal(diff.sourceByteLength(text),new TextEncoder().encode(text).length);
 assert.throws(()=>diff.sourceByteLength({}),/string/);
});
test('compact renderer snapshots preserve full comparison records on demand and exact fallback identities',()=>{
 const files=[{path:'board.kicad_pcb',content:'(kicad_pcb (footprint "Lib:X" (uuid "p") (at 10 10 90) (property "Reference" "U1") (pad "1" smd rect (at 2 3) (size 1 1))) (segment (start 1 1) (end 2 2) (width 1) (layer "F.Cu")) (via (at 3 4) (size 1) (drill .4) (uuid "v")))'}];
 const full=diff.projectObjects(files),snapshot=diff.prepareProject(files,{forConnectivity:true}),compact=diff.projectObjects(files,null,snapshot,{forConnectivity:true});
 assert.deepEqual(compact.map(r=>r.key),full.map(r=>r.key));assert.ok(compact.every(r=>r.signature===null&&!('Source fingerprint'in r.metadata.properties)));assert.deepEqual(diff.projectObjects(files,null,snapshot),full);
 let ast;diff.projectObjects(files,(_,value)=>ast=value,snapshot);assert.equal(ast,diff.preparedFile(snapshot,files[0].path,files[0].content));
 compact[0].id='consumer-only';assert.equal(diff.projectObjects(files,null,snapshot,{forConnectivity:true})[0].id,undefined);
 assert.throws(()=>diff.projectObjects([{...files[0],content:files[0].content+' '}],null,snapshot),/differs/);
});
test('schematic library-dependent fallback identities remain unchanged by compact snapshots',()=>{
 const files=[{path:'sheet.kicad_sch',content:'(kicad_sch (lib_symbols (symbol "Lib:X" (property "Value" "X"))) (symbol (lib_id "Lib:X") (at 1 1)) (wire (pts (xy 1 1) (xy 2 2))))'}];
 const a=diff.projectObjects(files),b=diff.projectObjects(files,null,null,{forConnectivity:true});assert.deepEqual(b.map(r=>r.key),a.map(r=>r.key));
});
test('compact connectivity returns identical saved net identities/members to full comparison preparation',()=>{
 const files=[{path:'Encoder.kicad_pcb',content:fs.readFileSync(new URL('../fixtures/kero-encoder/Encoder.kicad_pcb',import.meta.url),'utf8')}],original=diff.projectObjects;
 let baseline;try{diff.projectObjects=(files,parsed,snapshot)=>original(files,parsed,snapshot);baseline=nets.build(files);}finally{diff.projectObjects=original;}
 assert.deepEqual(nets.build(files),baseline);
});


test('span-based quoted parsing preserves escape values, empty strings and large embedded payloads',()=>{
 const values=['', 'plain', '水😀', 'line\nreturn\rtab\tquote"slash\\', '\\unknown'];
 for(const value of values){const quoted=JSON.stringify(value);assert.equal(diff.parse('(kicad_pcb (property '+quoted+'))')[1][1].quoted,value);}
 const payload='A'.repeat(4*1024*1024);assert.equal(diff.parse('(kicad_pcb (embedded_files (file (data "'+payload+'"))))')[1][1][1][1].quoted,payload);
 assert.throws(()=>diff.parse('(kicad_pcb "unterminated)'),/Unterminated quoted/);
 assert.throws(()=>diff.parse('(kicad_pcb "escape'+String.fromCharCode(92)),/Unterminated KiCad escape/);
 assert.equal(diff.parseMetadata('(kicad_pcb (ignored "'+payload+'") (uuid "saved"))')[1][1].quoted,'saved');
});


test('small-form compaction preserves nested public AST values and metadata parse behavior',()=>{
 const source='(kicad_pcb (uuid "root") (zone (layer "F.Cu") (polygon (pts (xy 1 2) (xy -3.5 4e-2) (xy 5 6)))) (property "K" "V" (at 1 2 90)))';
 const ast=diff.parse(source);assert.deepEqual(ast[2][2][1][1],['xy',1,2]);assert.deepEqual(ast[2][2][1][2],['xy',-3.5,.04]);assert.equal(ast[1][1].quoted,'root');
 assert.deepEqual(diff.parseMetadata(source),['kicad_pcb',['uuid',{quoted:'root'}],['property',{quoted:'K'},{quoted:'V'}]]);
 const nested=diff.parse('(kicad_pcb (a (b (c x))) (d q))');assert.deepEqual(nested,['kicad_pcb',['a',['b',['c','x']]],['d','q']]);
});
